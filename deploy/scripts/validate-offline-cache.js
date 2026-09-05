import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { MessageChannel } from "node:worker_threads";

const source = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../offline-assets.json", import.meta.url), "utf8"));
const base = "https://offline.example.test/tool/";
const cacheName = `vehicle-diagnosis-tool-${manifest.version}`;
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };
const indexSource = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
check(indexSource.slice(indexSource.indexOf('<header class="app-header">'), indexSource.indexOf("</header>"))
  .includes('id="offlineUpdateStatus" class="header-note" role="status" hidden'), "Update notice is not hidden initially in the shared header");

function createWorker(options = {}) {
  const stores = new Map();
  const listeners = {};
  const stats = { waiting: 0, claimed: 0, active: 0, peak: 0, fetched: [], aborted: 0, preAbortedFetches: 0, pendingWrites: 0 };
  let monotonicTime = 0;
  const resolve = (input) => new URL(typeof input === "string" ? input : input.url, base).href;
  class BrowserRequest extends Request {
    constructor(input, init) { super(resolve(input), init); }
  }
  const caches = {
    keys: async () => [...stores.keys()],
    has: async (name) => stores.has(name),
    delete: async (name) => stores.delete(name),
    open: async (name) => {
      if (options.failOpen) throw new Error("storage_unavailable");
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        put: async (request, response) => {
          stats.pendingWrites += 1;
          try {
            if (options.delayPut) await new Promise((done) => setTimeout(done, 3));
            if (options.slowManifestPut && resolve(request).endsWith("offline-assets.json")) await new Promise((done) => setTimeout(done, 150));
            if (options.failPut && resolve(request).endsWith(options.failPut)) throw new Error("quota_exceeded");
            const body = await response.arrayBuffer();
            entries.set(resolve(request), new Response(body, { status: response.status, headers: response.headers }));
          } finally { stats.pendingWrites -= 1; }
        },
        match: async (request) => {
          if (options.failMatch) throw new Error("cache_read_failed");
          return entries.get(resolve(request))?.clone();
        },
        keys: async () => [...entries.keys()].map((url) => new BrowserRequest(url))
      };
    },
    match: async (request) => {
      for (const entries of stores.values()) {
        const response = entries.get(resolve(request));
        if (response) return response.clone();
      }
    }
  };
  const context = vm.createContext({
    URL, Request: BrowserRequest, Response, AbortController, caches, console,
    performance: { now: () => options.downloadElapsedMs === undefined ? performance.now() : (monotonicTime += options.downloadElapsedMs) },
    setTimeout: (callback, delay) => setTimeout(callback, delay === 15000 ? options.timeoutMs ?? options.downloadTimeoutMs ?? delay : delay),
    clearTimeout, MessageChannel,
    self: {
      location: { origin: new URL(base).origin, href: `${base}service-worker.js` },
      registration: { scope: base, active: options.activeWorker },
      addEventListener: (type, listener) => { listeners[type] = listener; },
      skipWaiting: async () => { stats.waiting += 1; },
      clients: { claim: async () => { stats.claimed += 1; } }
    },
    fetch: async (request, init = {}) => {
      const url = resolve(request);
      stats.fetched.push(url);
      stats.active += 1;
      stats.peak = Math.max(stats.peak, stats.active);
      try {
        const signal = init.signal || request.signal;
        if (signal?.aborted) stats.preAbortedFetches += 1;
        signal?.addEventListener("abort", () => { stats.aborted += 1; }, { once: true });
        if (options.stallFetch && url.endsWith(options.stallFetch)) {
          return await new Promise((resolve, reject) => {
            const abort = () => reject(new Error("download_aborted"));
            if (signal?.aborted) abort();
            else signal?.addEventListener("abort", abort, { once: true });
          });
        }
        if (options.stallBody && url.endsWith(options.stallBody)) {
          return new Response(new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("partial response"));
              const abort = () => controller.error(new Error("body_aborted"));
              if (signal?.aborted) abort();
              else signal?.addEventListener("abort", abort, { once: true });
            }
          }), { headers: options.noStore ? { "Cache-Control": "no-store" } : {} });
        }
        await new Promise((done) => setTimeout(done, 1));
        if (options.offline || (options.failFetch && url.endsWith(options.failFetch))) throw new Error("network_down");
        if (options.httpFailure && url.endsWith(options.httpFailure)) return new Response("unavailable", { status: 503 });
        if (url.endsWith("offline-assets.json")) return Response.json(options.manifest || manifest);
        if (url.endsWith("script.js")) {
          const response = new Response(options.scriptSource ?? appSource);
          if (options.unreadableScript) response.clone = () => ({ text: async () => { throw new Error("body_read_failed"); } });
          return response;
        }
        return new Response(`current:${new URL(url).pathname}`, { headers: options.noStore ? { "Cache-Control": "no-store" } : {} });
      } finally {
        stats.active -= 1;
      }
    }
  });
  vm.runInContext(source, context);
  return {
    stores, caches, stats, context, options,
    lifecycle: (type) => {
      let completion;
      listeners[type]({ waitUntil: (promise) => { completion = promise; } });
      return completion;
    },
    request: (path, { method = "GET", mode = "same-origin", cache = "default", signal } = {}) => {
      let result;
      listeners.fetch({ request: { url: new URL(path, base).href, method, mode, cache, signal }, respondWith: (promise) => { result = promise; } });
      return result;
    },
    listeners
  };
}

for (const failure of [{ failFetch: "data/dtc-scope-rules.json", delayPut: true }, { httpFailure: "style.css" }, { failPut: "obd-readonly.js" }, { failPut: "offline-assets.json" }]) {
  const worker = createWorker(failure);
  const old = await worker.caches.open("vehicle-diagnosis-tool-previous");
  await old.put("index.html", new Response("previous screen"));
  await assert.rejects(worker.lifecycle("install"));
  check(worker.stats.waiting === 0 && worker.stats.active === 0, "Incomplete install activated or left downloads running");
  check(await (await old.match("index.html")).text() === "previous screen", "Failed update damaged the previous offline screen");
  check(!(await (await worker.caches.open(cacheName)).match("offline-assets.json")), "Failed candidate published its completion manifest");
  if (failure.httpFailure === "style.css") check(worker.stats.fetched.length < manifest.asset_count, "Known failed install continued scheduling the remaining downloads");
  delete failure.failFetch;
  delete failure.httpFailure;
  delete failure.failPut;
  await worker.lifecycle("install");
  check(worker.stats.waiting === 1 && await (await worker.caches.open(cacheName)).match("offline-assets.json"), "Partial candidate could not be retried to completion");
}

for (const failure of [
  { stallFetch: "offline-assets.json" }, { stallFetch: "style.css", delayPut: true },
  { stallBody: "offline-assets.json" }, { stallBody: "script.js" }, { stallBody: "data/dtc-scope-rules.json" }
]) {
  const stalled = createWorker({ ...failure, downloadTimeoutMs: 100 });
  const previous = await stalled.caches.open("vehicle-diagnosis-tool-previous");
  await previous.put("index.html", new Response("previous screen"));
  await assert.rejects(stalled.lifecycle("install"));
  check(stalled.stats.aborted === 1 && stalled.stats.active === 0 && stalled.stats.pendingWrites === 0 && stalled.stats.waiting === 0, "Timed-out download activated or returned before other downloads/writes settled");
  check(!stalled.stores.has(cacheName) && await (await previous.match("index.html")).text() === "previous screen", "Download timeout published a candidate or damaged the previous cache");
  delete stalled.options.stallFetch;
  delete stalled.options.stallBody;
  await stalled.lifecycle("install");
  check(stalled.stats.waiting === 1 && await (await stalled.caches.open(cacheName)).match("offline-assets.json"), "Timed-out candidate could not be retried successfully");
}
for (const elapsed of [14999, 15000]) {
  const timed = createWorker({ downloadElapsedMs: elapsed, downloadTimeoutMs: 100 });
  const download = vm.runInContext('fetchOfflineDownload("data/boundary.json")', timed.context);
  if (elapsed < 15000) {
    const response = await download;
    await new Promise((done) => setTimeout(done, 150));
    check((await response.text()).includes("boundary.json") && timed.stats.aborted === 0, "Successful download lost its body or retained its abort timer");
  } else {
    await assert.rejects(download, /offline_download_timeout/);
    check(timed.stats.aborted === 1, "Expired monotonic deadline was accepted before the timer callback ran");
  }
}
const slowStorage = createWorker({ slowManifestPut: true, downloadTimeoutMs: 100 });
await slowStorage.lifecycle("install");
check(slowStorage.stats.aborted === 0 && slowStorage.stats.pendingWrites === 0 && slowStorage.stats.waiting === 1, "Download deadline aborted a completed response during storage or skipped waiting for publication");
const rejectedBody = createWorker({ stallBody: "style.css", noStore: true, downloadTimeoutMs: 100 });
await assert.rejects(vm.runInContext('fetchOfflineDownload("style.css")', rejectedBody.context), /offline_download_unavailable/);
check(rejectedBody.stats.aborted === 1, "Rejected response left an unread network body running");

for (const invalid of [
  { ...manifest, version: "wrong" }, { ...manifest, asset_count: 0 },
  { ...manifest, assets: ["index.html"] },
  { ...manifest, asset_count: 1, assets: [""] },
  { ...manifest, asset_count: 1, assets: ["https://external.example.test/asset"] },
  { ...manifest, asset_count: 1, assets: ["../private.json"] },
  { ...manifest, asset_count: 1, assets: ["data.json?token=secret"] },
  { ...manifest, asset_count: 2, assets: ["index.html", "./index.html"] }
]) {
  const invalidWorker = createWorker({ manifest: invalid });
  await assert.rejects(invalidWorker.lifecycle("install"));
  check(invalidWorker.stores.size === 0 && invalidWorker.stats.waiting === 0, "Invalid manifest wrote a cache or activated");
}
const sameVersion = createWorker({ activeWorker: { scriptURL: `${base}service-worker.js?version=${manifest.version}` } });
const shared = await sameVersion.caches.open(cacheName);
await shared.put("offline-assets.json", Response.json(manifest));
await shared.put("index.html", new Response("active screen"));
await assert.rejects(sameVersion.lifecycle("install"));
check(sameVersion.stats.fetched.length === 0 && await (await shared.match("index.html")).text() === "active screen", "Same-version replacement mutated the active cache");
sameVersion.context.self.registration.active.scriptURL = `${base}service-worker.js?version=previous`;
await assert.rejects(sameVersion.lifecycle("install"));
check(sameVersion.stats.fetched.length === 0, "Misleading worker URL permitted active-cache replacement");
for (const owner of [manifest.version, "previous", null]) {
  const activeWorker = { postMessage: (message, ports) => ports[0].postMessage(owner ? { version: owner, cacheName: `vehicle-diagnosis-tool-${owner}` } : {}) };
  const partial = createWorker({ activeWorker });
  await (await partial.caches.open(cacheName)).put("index.html", new Response("partial"));
  if (owner === "previous") {
    await partial.lifecycle("install");
    check(partial.stats.waiting === 1, "Confirmed older worker prevented retrying an abandoned partial cache");
  } else {
    await assert.rejects(partial.lifecycle("install"));
    check(partial.stats.fetched.length === 0, "Active or unknown partial cache ownership was overwritten");
  }
}
for (const scriptFailure of [{ scriptSource: 'const APP_VERSION = "previous";' }, { scriptSource: "invalid script" }, { scriptSource: `const APP_VERSION = "${manifest.version}"; const APP_VERSION = "${manifest.version}";` }, { unreadableScript: true }]) {
  const mismatched = createWorker(scriptFailure);
  await assert.rejects(mismatched.lifecycle("install"));
  check(mismatched.stats.waiting === 0 && !(await (await mismatched.caches.open(cacheName)).match("offline-assets.json")), "Invalid app script published an offline release");
  delete scriptFailure.scriptSource;
  delete scriptFailure.unreadableScript;
  await mismatched.lifecycle("install");
  check(mismatched.stats.waiting === 1, "Converged app script could not complete a retry");
}

const worker = createWorker();
await (await worker.caches.open("vehicle-diagnosis-tool-previous")).put("index.html", new Response("previous"));
await worker.caches.open("unrelated-app");
await worker.lifecycle("install");
check(worker.stats.waiting === 1 && worker.stats.peak <= 4, "Complete installation did not activate once or downloaded without a concurrency bound");
const current = await worker.caches.open(cacheName);
for (const asset of manifest.assets) assert.ok(await current.match(asset), `Missing offline asset: ${asset}`);
check(true, "All declared offline assets are cached");
await worker.lifecycle("activate");
check(!worker.stores.has("vehicle-diagnosis-tool-previous") && worker.stores.has("unrelated-app") && worker.stats.claimed === 1, "Activation did not preserve unrelated caches");
worker.options.offline = true;
check((await worker.request("index.html")).ok && (await worker.request("data/dtc-scope-rules.json")).ok, "Completed release cannot serve its screen and diagnostic data offline");
check(worker.request("local-bridge/v1/request", { method: "POST" }) === undefined && worker.request("https://external.example.test/data.json") === undefined, "Worker intercepted a vehicle POST or cross-origin request");
const fetchedBeforeMessage = worker.stats.fetched.length;
worker.listeners.message({ data: { type: "PRECACHE_URLS", urls: ["secret"] } });
check(worker.request("local-status", { cache: "no-store" }) === undefined && worker.stats.fetched.length === fetchedBeforeMessage, "No-store request or legacy client message can mutate the offline cache");
const unrelated = await worker.caches.open("unrelated-app");
await unrelated.put("data/not-in-current.json", new Response("unrelated"));
await assert.rejects(worker.request("data/not-in-current.json"));
check(true, "Offline lookup cannot substitute another cache's diagnostic data");
worker.options.offline = false;
worker.options.failPut = "data/new.json";
check((await worker.request("data/new.json")).ok, "Runtime quota failure hid a successful network response");
delete worker.options.failPut;
worker.options.noStore = true;
check((await worker.request("data/no-store.json")).ok && !(await current.match("data/no-store.json")), "Runtime no-store response was cached");
delete worker.options.noStore;
check(worker.request("style.css", { cache: "no-store" }) === undefined, "No-store static request was unexpectedly intercepted");
check(worker.request("data/request-no-store.json", { cache: "no-store" }) === undefined, "No-store diagnostic request was unexpectedly intercepted");
check((await worker.request("style.css")).ok && worker.stats.fetched.at(-1) !== new URL("style.css", base).href, "Non-diagnostic cache behavior changed");
worker.options.failOpen = true;
check((await worker.request("data/no-storage.json")).ok, "Unavailable CacheStorage blocked a network read");
delete worker.options.failOpen;
worker.options.failMatch = true;
check((await worker.request("style.css")).ok, "Cache lookup failure blocked a successful static network response");

const diagnosticHeaders = createWorker({ timeoutMs: 25, stallFetch: "data/header-cache.json" });
await diagnosticHeaders.lifecycle("install");
const headerCache = await diagnosticHeaders.caches.open(cacheName);
await headerCache.put("data/header-cache.json", new Response("cached headers"));
check(await (await diagnosticHeaders.request("data/header-cache.json")).text() === "cached headers" && diagnosticHeaders.stats.aborted === 1,
  "Stalled diagnostic headers did not abort and fall back to the current cache");
diagnosticHeaders.options.stallFetch = "data/header-empty.json";
await assert.rejects(diagnosticHeaders.request("data/header-empty.json"));
check(diagnosticHeaders.stats.aborted === 2 && !(await headerCache.match("data/header-empty.json")), "Stalled diagnostic headers without cache did not reject cleanly");
const abortedRequest = new AbortController();
abortedRequest.abort();
diagnosticHeaders.options.stallFetch = "data/request-aborted.json";
await assert.rejects(diagnosticHeaders.request("data/request-aborted.json", { signal: abortedRequest.signal }));
check(diagnosticHeaders.stats.preAbortedFetches === 1, "Pre-aborted diagnostic request did not reach the bounded fetch signal");

const diagnosticTimeout = createWorker({ timeoutMs: 25, stallBody: "data/timeout-cache.json" });
await diagnosticTimeout.lifecycle("install");
const diagnosticCache = await diagnosticTimeout.caches.open(cacheName);
await diagnosticCache.put("data/timeout-cache.json", new Response("cached timeout"));
check(await (await diagnosticTimeout.request("data/timeout-cache.json")).text() === "cached timeout"
  && diagnosticTimeout.stats.aborted === 1 && diagnosticTimeout.stats.pendingWrites === 0, "Stalled diagnostic body did not abort and fall back to the current cache");
diagnosticTimeout.options.stallBody = "data/timeout-empty.json";
await assert.rejects(diagnosticTimeout.request("data/timeout-empty.json"));
check(diagnosticTimeout.stats.aborted === 2 && !(await diagnosticCache.match("data/timeout-empty.json")), "Stalled diagnostic body without cache did not reject cleanly");

for (const elapsed of [14999, 15000]) {
  const delayedTimer = createWorker();
  await delayedTimer.lifecycle("install");
  const delayedCache = await delayedTimer.caches.open(cacheName);
  await delayedCache.put("data/late.json", new Response("cached deadline"));
  delayedTimer.options.downloadElapsedMs = elapsed;
  const body = await (await delayedTimer.request("data/late.json")).text();
  check(elapsed < 15000 ? body.includes("data/late.json") : body === "cached deadline",
    `Diagnostic monotonic deadline failed at ${elapsed} ms`);
}

const fastDiagnostic = createWorker({ timeoutMs: 25, delayPut: true });
await fastDiagnostic.lifecycle("install");
const fastRequestController = new AbortController();
const fastResponse = await fastDiagnostic.request("data/fast.json", { signal: fastRequestController.signal });
await new Promise((done) => setTimeout(done, 50));
fastRequestController.abort();
check((await fastResponse.text()).includes("data/fast.json") && fastDiagnostic.stats.aborted === 0
  && (await (await fastDiagnostic.caches.open(cacheName)).match("data/fast.json")), "Fast diagnostic response was not cached or retained a late abort listener");

const noStoreDiagnostic = createWorker({ timeoutMs: 25 });
await noStoreDiagnostic.lifecycle("install");
const noStoreCache = await noStoreDiagnostic.caches.open(cacheName);
noStoreDiagnostic.options.noStore = true;
check((await noStoreDiagnostic.request("data/no-store-fast.json")).ok && !(await noStoreCache.match("data/no-store-fast.json")), "Fast no-store diagnostic response was cached");
noStoreDiagnostic.options.stallBody = "data/no-store-stalled.json";
await assert.rejects(noStoreDiagnostic.request("data/no-store-stalled.json"));
check(noStoreDiagnostic.stats.aborted === 1 && !(await noStoreCache.match("data/no-store-stalled.json")), "Stalled no-store diagnostic response wrote cache data");

const statusDiagnostic = createWorker({ timeoutMs: 25, httpFailure: "data/status-cache.json" });
await statusDiagnostic.lifecycle("install");
const statusCache = await statusDiagnostic.caches.open(cacheName);
await statusCache.put("data/status-cache.json", new Response("cached status"));
check(await (await statusDiagnostic.request("data/status-cache.json")).text() === "cached status", "Diagnostic 503 did not prefer the current cache");
statusDiagnostic.options.httpFailure = "data/status-empty.json";
const statusResponse = await statusDiagnostic.request("data/status-empty.json");
check(statusResponse.status === 503 && (await statusResponse.text()) === "unavailable", "Diagnostic 503 without cache did not preserve the HTTP response");

function createStatusClient(worker, registration) {
  const events = {};
  const status = { textContent: "", isError: false };
  status.classList = { toggle: (name, enabled) => { if (name === "error") status.isError = enabled; } };
  const context = vm.createContext({
    APP_VERSION: manifest.version, OFFLINE_ASSET_MANIFEST: "offline-assets.json", offlineCacheStatusRevision: 0,
    offlineCacheStatus: status,
    offlineUpdateStatus: { hidden: true, textContent: "" },
    serviceWorkerEvents: events,
    window: { caches: worker.caches, isSecureContext: true }, caches: worker.caches,
    URL, Request: worker.context.Request, MessageChannel, setTimeout, clearTimeout,
    navigator: { serviceWorker: {
      register: async () => registration,
      ready: Promise.resolve(registration),
      addEventListener: (name, callback) => { events[name] = callback; }
    } }
  });
  vm.runInContext(appSource.slice(appSource.indexOf("async function registerOfflineCache("), appSource.indexOf("function activateTab(")), context);
  return context;
}

const statusWorker = createWorker();
await statusWorker.lifecycle("install");
const active = { state: "activated", scriptURL: `${base}service-worker.js?version=previous`, postMessage: (data, ports) => statusWorker.listeners.message({ data, ports }) };
const statusClient = createStatusClient(statusWorker, { active, update: async () => {}, addEventListener: () => {} });
await statusClient.refreshOfflineCacheStatus(active);
check(statusClient.offlineCacheStatus.textContent.includes(`${manifest.asset_count}/${manifest.asset_count}`), "Current activated cache did not show complete readiness");
const oldWorker = { ...active, postMessage: (data, ports) => ports[0].postMessage({ version: "previous", cacheName: "vehicle-diagnosis-tool-previous" }) };
statusClient.setOfflineCacheStatus("PENDING");
await statusClient.refreshOfflineCacheStatus(oldWorker);
check(!statusClient.offlineCacheStatus.textContent.includes("準備済み"), "Old worker readiness mislabeled the new version as ready");
check(statusClient.offlineCacheStatus.textContent.includes("版を照合できません") && statusClient.offlineCacheStatus.isError, "Unverified worker identity did not report version verification failure");

const manifestUrl = new URL("offline-assets.json", base).href;
const nextVersion = `${Number(manifest.version.split(".")[0]) + 1}.0.0`;
const newerWorker = { ...active, postMessage: (data, ports) => ports[0].postMessage({ version: nextVersion, cacheName: `vehicle-diagnosis-tool-${nextVersion}` }) };
await statusClient.refreshOfflineCacheStatus(newerWorker);
check(!statusClient.offlineUpdateStatus.hidden && statusClient.offlineUpdateStatus.textContent.includes(nextVersion)
  && statusClient.offlineUpdateStatus.textContent.includes(manifest.version), "New release notice omitted installed/displayed versions");
check(statusClient.offlineUpdateStatus.textContent.includes("保存してから") && statusClient.offlineUpdateStatus.textContent.includes("読取・接続を終了"), "Update notice omitted data/connection precautions");
check(statusClient.offlineCacheStatus.isError && !statusClient.offlineCacheStatus.textContent.includes("準備済み"), "New worker falsely certified the displayed release as offline-ready");
for (const version of [manifest.version, "0.0.1", "previous", "99.0.0<script>", "9999999.0.0", "01.0.0", null, 123]) {
  statusClient.renderOfflineUpdateNotice({ version, cacheName: `vehicle-diagnosis-tool-${version}` });
  check(statusClient.offlineUpdateStatus.hidden && !statusClient.offlineUpdateStatus.textContent, "Invalid, same, or older identity displayed an update notice");
}
statusClient.renderOfflineUpdateNotice({ version: nextVersion, cacheName: "unrelated" });
check(statusClient.offlineUpdateStatus.hidden, "Inconsistent cache identity displayed an update notice");
await statusClient.refreshOfflineCacheStatus(newerWorker);
statusClient.setOfflineCacheStatus("PENDING");
check(statusClient.offlineUpdateStatus.hidden, "New install attempt retained stale update notice");
await statusClient.refreshOfflineCacheStatus(newerWorker);
await statusClient.refreshOfflineCacheStatus(active);
check(statusClient.offlineUpdateStatus.hidden && statusClient.offlineCacheStatus.textContent.includes("準備済み"), "Current release readiness retained a stale update notice");
const versionClient = createStatusClient(statusWorker, {});
versionClient.APP_VERSION = "3.9.99";
for (const [version, visible] of [["3.10.0", true], ["3.9.100", true], ["4.0.0", true], ["3.9.98", false], ["2.99.999", false]]) {
  versionClient.renderOfflineUpdateNotice({ version, cacheName: `vehicle-diagnosis-tool-${version}` });
  check(versionClient.offlineUpdateStatus.hidden === !visible, "Version comparison used text ordering instead of numeric components");
}
for (const reason of ["new-status", "replaced-worker", "redundant-worker"]) {
  const client = createStatusClient(statusWorker, {});
  let currentOwner = true;
  let reply;
  const candidate = { ...active, postMessage: (data, ports) => { reply = ports[0]; } };
  const completion = client.refreshOfflineCacheStatus(candidate, () => currentOwner);
  if (reason === "new-status") client.setOfflineCacheStatus("INSTALL_FAILED", true);
  if (reason === "replaced-worker") currentOwner = false;
  if (reason === "redundant-worker") candidate.state = "redundant";
  reply.postMessage({ version: nextVersion, cacheName: `vehicle-diagnosis-tool-${nextVersion}` });
  await completion;
  check(client.offlineUpdateStatus.hidden, `${reason}: stale identity produced an update notice`);
}
async function waitForStatusProbe(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate() && Date.now() < deadline) await new Promise((done) => setTimeout(done, 1));
  assert.ok(predicate(), "Readiness probe did not reach its expected state");
}
function createStatusProbe() {
  const fixture = createWorker();
  fixture.stores.set(cacheName, new Map(statusWorker.stores.get(cacheName)));
  const open = fixture.caches.open;
  const probe = { active: 0, peak: 0, calls: [], pending: [] };
  fixture.caches.open = async (...args) => {
    const cache = await open(...args);
    return { ...cache, match: (request) => {
      if (new URL(typeof request === "string" ? request : request.url, base).href === manifestUrl) return cache.match(request);
      probe.calls.push(request.url);
      probe.active += 1;
      probe.peak = Math.max(probe.peak, probe.active);
      return new Promise((resolve, reject) => probe.pending.push(async (fail = false) => {
        try {
          if (fail) throw new Error("PRIVATE_STORAGE_DETAIL");
          resolve(await cache.match(request));
        } catch (error) { reject(error); }
        finally { probe.active -= 1; }
      }));
    } };
  };
  return { fixture, probe, client: createStatusClient(fixture, {}) };
}
for (const scenario of ["complete", "new-status", "changed-worker", "changed-owner", "storage-error"]) {
  const { fixture, probe, client } = createStatusProbe();
  const worker = { ...active };
  let currentOwner = true;
  let finished = false;
  client.setOfflineCacheStatus("CHECKING");
  const completion = client.refreshOfflineCacheStatus(worker, () => currentOwner).then(() => { finished = true; });
  await waitForStatusProbe(() => probe.pending.length >= 4 || finished);
  check(probe.active === 4 && probe.peak === 4 && probe.calls.length === 4, "Readiness inspection started more than four simultaneous cache reads");
  if (scenario === "new-status") client.setOfflineCacheStatus("NEWER_STATUS");
  if (scenario === "changed-worker") worker.state = "redundant";
  if (scenario === "changed-owner") currentOwner = false;
  if (scenario === "storage-error") {
    await probe.pending.shift()(true);
    await Promise.resolve();
    check(!finished && probe.active === 3 && client.offlineCacheStatus.textContent === "CHECKING", "Readiness failure returned before in-flight reads settled");
  }
  while (!finished) {
    await Promise.all(probe.pending.splice(0).map((settle) => settle()));
    await waitForStatusProbe(() => finished || probe.pending.length > 0);
  }
  await completion;
  check(probe.active === 0 && probe.peak === 4, "Readiness inspection left reads in flight or exceeded its concurrency bound");
  if (scenario === "complete") {
    check(probe.calls.length === manifest.asset_count && new Set(probe.calls).size === manifest.asset_count
      && client.offlineCacheStatus.textContent.includes(`${manifest.asset_count}/${manifest.asset_count}`), "Batched readiness skipped, repeated, or miscounted assets");
  } else {
    check(probe.calls.length === 4, "Obsolete or failed inspection scheduled more cache reads");
    if (scenario === "storage-error") check(client.offlineCacheStatus.isError && !client.offlineCacheStatus.textContent.includes("PRIVATE_STORAGE_DETAIL"), "Readiness failure was hidden or exposed storage details");
    else check(client.offlineCacheStatus.textContent === (scenario === "new-status" ? "NEWER_STATUS" : "CHECKING"), "Obsolete inspection replaced the newer status");
  }
  check(fixture.stats.fetched.length === 0 && fixture.stats.pendingWrites === 0, "Readiness batching downloaded or modified cache data");
}
for (const [scenario, expected] of [
  ["missing-api", "オフライン保存機能を確認できません"],
  ["missing-cache", "保存されていません"],
  ["missing-manifest", "資材一覧が保存されていません"],
  ["unreadable-manifest", "資材一覧を読み取れません"],
  ["null-manifest", "版または件数が一致しません"],
  ["wrong-version", "版または件数が一致しません"],
  ["wrong-count", "版または件数が一致しません"],
  ["missing-asset", "必要なデータが不足"],
  ["storage-open", "保存データを読み出せません"],
  ["storage-match", "保存データを読み出せません"],
  ["storage-has", "保存データを読み出せません"]
]) {
  const fixture = createWorker();
  const entries = new Map(statusWorker.stores.get(cacheName));
  fixture.stores.set(cacheName, entries);
  const client = createStatusClient(fixture, {});
  const originalHas = fixture.caches.has;
  if (scenario === "missing-api") delete client.window.caches;
  if (scenario === "missing-cache") fixture.stores.delete(cacheName);
  if (scenario === "missing-manifest") entries.delete(manifestUrl);
  if (scenario === "unreadable-manifest") entries.set(manifestUrl, new Response("{"));
  if (scenario === "null-manifest") entries.set(manifestUrl, new Response("null"));
  if (scenario === "wrong-version") entries.set(manifestUrl, new Response(JSON.stringify({ ...manifest, version: "previous" })));
  if (scenario === "wrong-count") entries.set(manifestUrl, new Response(JSON.stringify({ ...manifest, asset_count: manifest.asset_count + 1 })));
  if (scenario === "missing-asset") entries.delete(new URL("style.css", base).href);
  if (scenario === "storage-open") fixture.options.failOpen = true;
  if (scenario === "storage-match") fixture.options.failMatch = true;
  if (scenario === "storage-has") fixture.caches.has = async () => { throw new Error("PRIVATE_DETAIL"); };
  client.setOfflineCacheStatus("準備済み");
  const cacheKeys = [...fixture.stores.keys()];
  await client.refreshOfflineCacheStatus(active);
  check(client.offlineCacheStatus.textContent.includes(expected) && client.offlineCacheStatus.isError
    && !client.offlineCacheStatus.textContent.includes("準備済み") && !client.offlineCacheStatus.textContent.includes("PRIVATE_DETAIL"), `${scenario}: failure status was misleading or leaked exception details`);
  check(JSON.stringify([...fixture.stores.keys()]) === JSON.stringify(cacheKeys) && fixture.stats.fetched.length === 0
    && fixture.stats.pendingWrites === 0 && fixture.stats.waiting === 0, `${scenario}: readiness inspection changed caches or triggered downloads`);
  fixture.stores.set(cacheName, new Map(statusWorker.stores.get(cacheName)));
  fixture.caches.has = originalHas;
  fixture.options.failOpen = false;
  fixture.options.failMatch = false;
  client.window.caches = fixture.caches;
  await client.refreshOfflineCacheStatus(active);
  check(client.offlineCacheStatus.textContent.includes(`${manifest.asset_count}/${manifest.asset_count}`) && !client.offlineCacheStatus.isError, `${scenario}: recovered readiness retained an error`);
}

const obsoleteClient = createStatusClient(statusWorker, {});
delete obsoleteClient.window.caches;
obsoleteClient.setOfflineCacheStatus("NEWER_STATUS");
await obsoleteClient.refreshOfflineCacheStatus(active, () => false);
check(obsoleteClient.offlineCacheStatus.textContent === "NEWER_STATUS", "Obsolete cache inspection overwrote the current status when CacheStorage was unavailable");
const lateRefresh = statusClient.refreshOfflineCacheStatus(active);
statusClient.setOfflineCacheStatus("INSTALL_FAILED", true);
await lateRefresh;
check(statusClient.offlineCacheStatus.textContent === "INSTALL_FAILED", "Late cache count overwrote the install failure");
const identityPorts = [];
const racingWorker = { ...active, postMessage: (data, ports) => identityPorts.push(ports[0]) };
const earlier = statusClient.refreshOfflineCacheStatus(racingWorker);
const newer = statusClient.refreshOfflineCacheStatus(racingWorker);
identityPorts[0].postMessage(null);
await earlier;
identityPorts[1].postMessage({ version: manifest.version, cacheName });
await newer;
check(statusClient.offlineCacheStatus.textContent.includes(`${manifest.asset_count}/${manifest.asset_count}`), "Older identity failure suppressed a newer successful readiness check");
const oldClient = createStatusClient(statusWorker, { active: oldWorker, update: async () => {}, addEventListener: () => {} });
const updateRegistration = { active, update: async () => {}, addEventListener: () => {} };
const updateClient = createStatusClient(statusWorker, updateRegistration);
await updateClient.registerOfflineCache();
await waitForStatusProbe(() => updateClient.offlineCacheStatus.textContent.includes("準備済み"));
updateRegistration.active = newerWorker;
updateClient.serviceWorkerEvents.controllerchange();
await waitForStatusProbe(() => !updateClient.offlineUpdateStatus.hidden);
check(updateClient.offlineUpdateStatus.textContent.includes(nextVersion), "Controller replacement did not publish the new release notice");
await oldClient.registerOfflineCache();
await oldClient.refreshOfflineCacheStatus(oldWorker);
check(!oldClient.offlineCacheStatus.textContent.includes("準備済み"), "An already-resolved ready promise hid the version mismatch");
const redundant = { state: "redundant", addEventListener: () => {} };
const failedClient = createStatusClient(statusWorker, { active: oldWorker, installing: redundant, update: async () => {}, addEventListener: () => {} });
await failedClient.registerOfflineCache();
check(failedClient.offlineCacheStatus.textContent.includes("更新は採用されません"), "Initial redundant worker failure was overwritten by a checking/ready message");
check(failedClient.offlineCacheStatus.textContent.includes("失敗理由は未確認") && failedClient.offlineCacheStatus.isError, "Redundant install claimed a specific failure cause or successful offline availability");
let stateChanged;
const activating = { ...active, state: "activating", addEventListener: (name, callback) => { stateChanged = callback; } };
const activatingClient = createStatusClient(statusWorker, { active: activating, update: async () => {}, addEventListener: () => {} });
await activatingClient.registerOfflineCache();
check(typeof stateChanged === "function" && !activatingClient.offlineCacheStatus.textContent.includes("準備済み"), "An already-activating worker was not observed");
activating.state = "activated";
stateChanged();
const deadline = Date.now() + 2000;
while (!activatingClient.offlineCacheStatus.textContent.includes("準備済み") && Date.now() < deadline) await new Promise((done) => setTimeout(done, 10));
check(activatingClient.offlineCacheStatus.textContent.includes(`${manifest.asset_count}/${manifest.asset_count}`), "Observed activation did not refresh offline readiness");
for (const scenario of ["same-code-old-url", "different-code", "changed-active", "unavailable"]) {
  let registrations = 0;
  let updates = 0;
  const registration = { active: null, update: async () => { updates += 1; }, addEventListener: () => {} };
  const registered = { ...registration, marker: "fallback" };
  const selected = { ...active, postMessage: (data, ports) => {
    if (scenario === "changed-active") registration.active = oldWorker;
    ports[0].postMessage(scenario === "unavailable" ? null : scenario === "different-code" ? { version: "previous", cacheName: "vehicle-diagnosis-tool-previous" } : { version: manifest.version, cacheName });
  } };
  registration.active = selected;
  const client = createStatusClient(statusWorker, registration);
  client.navigator.serviceWorker.getRegistration = async () => registration;
  client.navigator.serviceWorker.register = async () => { registrations += 1; return registered; };
  if (scenario === "same-code-old-url") {
    await client.registerOfflineCache();
    check(registrations === 0 && updates === 1, "Matching actual worker identity did not reuse/update its existing registration");
  } else {
    const result = await client.getOfflineRegistration();
    check(registrations === 1 && result === registered, `${scenario} incorrectly reused the old registration`);
  }
}

console.log(`Offline cache checks: ${checks}\nErrors: 0`);
