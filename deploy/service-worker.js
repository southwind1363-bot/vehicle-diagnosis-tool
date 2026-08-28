const CACHE_PREFIX = "vehicle-diagnosis-tool";
const CACHE_VERSION = "3.13.281";
const CACHE_NAME = `${CACHE_PREFIX}-${CACHE_VERSION}`;
const OFFLINE_MANIFEST_URL = "offline-assets.json";
const OFFLINE_DOWNLOAD_TIMEOUT_MS = 15000;
const CORE_ASSETS = [
  "./",
  "index.html",
  "style.css",
  "script.js",
  "obd-readonly.js",
  "manifest.webmanifest",
  OFFLINE_MANIFEST_URL
];

async function fetchOfflineDownload(url) {
  const controller = new AbortController();
  const started = performance.now();
  const timer = setTimeout(() => controller.abort(), OFFLINE_DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: "reload", signal: controller.signal });
    if (!response.ok || /\bno-store\b/i.test(response.headers.get("Cache-Control") || "")) throw new Error("offline_download_unavailable");
    // Finish network input before storage; preserve the original response metadata.
    await response.clone().arrayBuffer();
    if (controller.signal.aborted || performance.now() - started >= OFFLINE_DOWNLOAD_TIMEOUT_MS) throw new Error("offline_download_timeout");
    return response;
  } catch (error) {
    controller.abort();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function cacheUrls(urls) {
  const cache = await caches.open(CACHE_NAME);
  const uniqueUrls = [...new Set(urls.map((url) => new URL(url, self.registration.scope).href))];
  const failures = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, uniqueUrls.length) }, async () => {
    while (next < uniqueUrls.length && failures.length === 0) {
      const url = uniqueUrls[next++];
      try {
        const request = new Request(url, { cache: "reload" });
        const response = await fetchOfflineDownload(request);
        if (url === new URL("script.js", self.registration.scope).href) {
          const versions = [...(await response.clone().text()).matchAll(/const APP_VERSION = "([^"]+)";/g)];
          if (versions.length !== 1 || versions[0][1] !== CACHE_VERSION) throw new Error("offline_app_version_mismatch");
        }
        await cache.put(request, response);
      } catch (_) {
        failures.push(url);
      }
    }
  }));
  // Wait for every write before rejecting; a failed install must not activate.
  if (failures.length) throw new Error("offline_assets_incomplete");
}

async function loadOfflineManifest() {
  const response = await fetchOfflineDownload(OFFLINE_MANIFEST_URL);
  const payload = await response.clone().json();
  if (payload.version !== CACHE_VERSION || !Number.isInteger(payload.asset_count) || payload.asset_count < 1
    || !Array.isArray(payload.assets) || payload.assets.length !== payload.asset_count) throw new Error("offline_manifest_invalid");
  const scope = new URL(self.registration.scope);
  const urls = payload.assets.map((value) => {
    if (typeof value !== "string" || !value.trim()) throw new Error("offline_manifest_url_invalid");
    const url = new URL(value, scope);
    if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname) || url.search || url.hash || url.username || url.password) throw new Error("offline_manifest_url_invalid");
    return url.href;
  });
  if (new Set(urls).size !== urls.length) throw new Error("offline_manifest_duplicate_url");
  return { urls, response };
}

function getOfflineWorkerIdentity(worker) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (value) => {
      clearTimeout(timer);
      channel.port1.close();
      channel.port2.close();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 2000);
    channel.port1.onmessage = (event) => finish(event.data);
    try { worker.postMessage({ type: "GET_OFFLINE_IDENTITY" }, [channel.port2]); } catch (_) { finish(null); }
  });
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "GET_OFFLINE_IDENTITY") {
    event.ports?.[0]?.postMessage({ version: CACHE_VERSION, cacheName: CACHE_NAME });
  }
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const active = self.registration.active;
      const existed = await caches.has(CACHE_NAME);
      if (existed) {
        const existing = await caches.open(CACHE_NAME);
        const completed = await existing.match(OFFLINE_MANIFEST_URL);
        if (completed && (await completed.json()).version === CACHE_VERSION) throw new Error("offline_version_reuse");
        if (active) {
          const identity = await getOfflineWorkerIdentity(active);
          if (typeof identity?.version !== "string" || !identity.version || identity.cacheName !== `${CACHE_PREFIX}-${identity.version}`
            || identity.cacheName === CACHE_NAME) throw new Error("offline_cache_ownership_unknown");
        }
      }
      const manifest = await loadOfflineManifest();
      const manifestUrl = new URL(OFFLINE_MANIFEST_URL, self.registration.scope).href;
      const urls = [...CORE_ASSETS, ...manifest.urls].filter((url) => new URL(url, self.registration.scope).href !== manifestUrl);
      try {
        await cacheUrls(urls);
        const cache = await caches.open(CACHE_NAME);
        await cache.put(manifestUrl, manifest.response);
      } catch (error) {
        if (!existed) await caches.delete(CACHE_NAME);
        throw error;
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

async function matchOfflineCache(cache, request) {
  try { return await cache?.match(request); } catch (_) { return undefined; }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.cache === "no-store") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const isDiagnosticDataRequest = url.pathname.includes("/data/") && url.pathname.endsWith(".json");

  event.respondWith(
    (async () => {
      let cache;
      try { cache = await caches.open(CACHE_NAME); } catch (_) { /* Network reads can still work without storage. */ }
      if (isDiagnosticDataRequest) {
        try {
          const response = await fetch(request);
          if (response.ok) {
            if (!/\bno-store\b/i.test(response.headers.get("Cache-Control") || "")) {
              try { await cache?.put(request, response.clone()); } catch (_) { /* Keep the successful network response. */ }
            }
            return response;
          }
          const cached = await matchOfflineCache(cache, request);
          if (cached) return cached;
          return response;
        } catch (error) {
          const cached = await matchOfflineCache(cache, request);
          if (cached) return cached;
          throw error;
        }
      }

      const cached = await matchOfflineCache(cache, request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response.ok && !/\bno-store\b/i.test(response.headers.get("Cache-Control") || "")) {
          try { await cache?.put(request, response.clone()); } catch (_) { /* Keep the successful network response. */ }
        }
        return response;
      } catch (error) {
        if (request.mode === "navigate") {
          const fallback = await matchOfflineCache(cache, "index.html");
          if (fallback) return fallback;
        }
        throw error;
      }
    })()
  );
});
