const CACHE_PREFIX = "vehicle-diagnosis-tool";
const CACHE_VERSION = "3.3.69";
const CACHE_NAME = `${CACHE_PREFIX}-${CACHE_VERSION}`;
const OFFLINE_MANIFEST_URL = "offline-assets.json";
const CORE_ASSETS = [
  "./",
  "index.html",
  "style.css",
  "script.js",
  "obd-readonly.js",
  "manifest.webmanifest",
  OFFLINE_MANIFEST_URL
];

async function cacheUrls(urls) {
  const cache = await caches.open(CACHE_NAME);
  const uniqueUrls = [...new Set(urls.filter(Boolean))];
  await Promise.allSettled(
    uniqueUrls.map(async (url) => {
      try {
        const request = new Request(url, { cache: "reload" });
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response);
        }
      } catch (_) {
        // Network may be unavailable during install; keep the app usable with what is already cached.
      }
    })
  );
}

async function loadOfflineAssetUrls() {
  try {
    const response = await fetch(OFFLINE_MANIFEST_URL, { cache: "reload" });
    if (!response.ok) return [];
    const payload = await response.json();
    return Array.isArray(payload.assets) ? payload.assets : [];
  } catch (_) {
    return [];
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const manifestAssets = await loadOfflineAssetUrls();
      await cacheUrls([...CORE_ASSETS, ...manifestAssets]);
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

self.addEventListener("message", (event) => {
  if (event.data?.type === "PRECACHE_URLS" && Array.isArray(event.data.urls)) {
    event.waitUntil(cacheUrls(event.data.urls));
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        if (request.mode === "navigate") {
          const fallback = await caches.match("index.html");
          if (fallback) return fallback;
        }
        throw error;
      }
    })()
  );
});
