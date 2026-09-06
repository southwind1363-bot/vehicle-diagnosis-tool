import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../obd-operation-journal.js", import.meta.url), "utf8");
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };
const later = (fn) => queueMicrotask(fn);
const copy = (value) => value instanceof ArrayBuffer ? value.slice(0) : value;

function createFakeIdb(options = {}) {
  const records = options.records || new Map();
  const calls = { opens: 0, writes: 0, deletes: 0, reads: 0, keyCursors: 0, ranges: [], closes: 0, aborts: 0, strict: 0, modes: [] };
  let initialized = options.initialized === true;
  let hasStore = initialized && !options.wrongStore;
  function request() { return { result: undefined, error: null, onsuccess: null, onerror: null }; }
  function database() {
    const names = { contains: (name) => name === "preOperationRecords" };
    return {
      objectStoreNames: { contains: (name) => hasStore && names.contains(name) },
      createObjectStore: () => { hasStore = true; },
      close: () => { calls.closes += 1; },
      transaction(name, mode, settings) {
        if (options.transactionThrows) throw new Error("transaction");
        if (mode === "readwrite" && settings?.durability !== "strict") throw new Error("not strict");
        if (mode === "readwrite") calls.strict += 1;
        calls.modes.push(mode);
        let finished = false;
        let pendingDeletes = 0;
        const completeIfIdle = () => {
          if (!finished && pendingDeletes === 0) {
            finished = true;
            tx.oncomplete?.();
          }
        };
        const tx = {
          oncomplete: null, onabort: null, onerror: null,
          abort() { if (!finished) { finished = true; calls.aborts += 1; later(() => this.onabort?.()); } },
          objectStore() {
            const store = {
              keyPath: options.storeKeyPath || "recordId", autoIncrement: options.autoIncrement === true,
              get(recordId) {
                calls.reads += 1;
                const get = request();
                later(() => {
                  if (finished) return;
                  if (options.readError || (options.readErrorOnRead && calls.reads === options.readErrorOnRead)) { get.error = { name: "ReadError" }; get.onerror?.(); finished = true; tx.onabort?.(); return; }
                  const value = records.get(recordId);
                  const returned = value && { ...value, sourceBytes: copy(value.sourceBytes), sha256: copy(value.sha256) };
                  if (returned && options.readbackMismatch) returned.byteLength += 1;
                  if (returned && options.tamperCreatedAt) returned.createdAt = "1970-01-01T00:00:00.000Z";
                  if (returned && options.storedExtra) returned.injected = true;
                  if (returned && typeof options.transformReadRecord === "function") options.transformReadRecord(returned);
                  get.result = returned;
                  get.onsuccess?.();
                  if (options.readAbortAfterRequestSuccess) { finished = true; tx.onabort?.(); return; }
                  later(completeIfIdle);
                });
                return get;
              },
              add(record) {
                if (mode !== "readwrite") throw new Error("readonly");
                calls.writes += 1;
                const add = request();
                const complete = () => {
                  if (finished) return;
                  if (options.quota) { add.error = { name: "QuotaExceededError" }; add.onerror?.(); finished = true; tx.onabort?.(); return; }
                  if (records.has(record.recordId)) { add.error = { name: "ConstraintError" }; add.onerror?.(); finished = true; tx.onabort?.(); return; }
                  add.result = record.recordId; add.onsuccess?.();
                  if (options.abortAfterRequestSuccess) { finished = true; tx.onabort?.(); return; }
                  records.set(record.recordId, { ...record, sourceBytes: copy(record.sourceBytes), sha256: copy(record.sha256) });
                  finished = true; tx.oncomplete?.();
                };
                if (options.delayedWrite) setTimeout(complete, options.delayedWrite);
                else later(complete);
                return add;
              },
              delete(recordId) {
                if (mode !== "readwrite") throw new Error("readonly");
                calls.deletes += 1;
                const remove = request();
                pendingDeletes += 1;
                const complete = () => {
                  if (finished) return;
                  if (options.deleteError) { remove.error = { name: "DeleteError" }; remove.onerror?.(); finished = true; tx.onabort?.(); return; }
                  remove.result = undefined;
                  remove.onsuccess?.();
                  if (options.deleteAbortAfterRequestSuccess) { finished = true; tx.onabort?.(); return; }
                  if (!options.deleteNoEffect) records.delete(recordId);
                  pendingDeletes -= 1;
                  completeIfIdle();
                };
                if (options.delayedDelete) setTimeout(complete, options.delayedDelete);
                else later(complete);
                return remove;
              },
              openKeyCursor(range, direction) {
                if (mode !== "readonly") throw new Error("readwrite cursor");
                calls.keyCursors += 1;
                calls.ranges.push(range || null);
                if (direction !== "next") throw new Error("wrong cursor direction");
                const cursorRequest = request();
                const keys = (options.cursorKeys || Array.from(records.keys()).sort()).filter((key) => !range || key > range.lower);
                let index = -1;
                let generation = 0;
                const advance = () => {
                  const thisGeneration = ++generation;
                  const emit = () => {
                    if (finished) return;
                    if (options.cursorErrorAt === index + 1) {
                      cursorRequest.error = { name: "ReadError" };
                      cursorRequest.onerror?.();
                      finished = true;
                      tx.onabort?.();
                      return;
                    }
                    index += 1;
                    cursorRequest.result = index < keys.length ? { key: keys[index], continue: advance } : null;
                    cursorRequest.onsuccess?.();
                    if (options.abortAfterCursorSuccess) {
                      finished = true;
                      tx.onabort?.();
                      return;
                    }
                    later(() => {
                      if (!finished && generation === thisGeneration) {
                        finished = true;
                        tx.oncomplete?.();
                      }
                    });
                  };
                  if (options.lateKeyCursor) setTimeout(emit, options.lateKeyCursor);
                  else later(emit);
                };
                advance();
                return cursorRequest;
              }
            };
            return store;
          }
        };
        return tx;
      }
    };
  }
  return {
    records, calls,
    setStoreSchema({ keyPath = "recordId", autoIncrement = false }) {
      options.storeKeyPath = keyPath;
      options.autoIncrement = autoIncrement;
    },
    open() {
      calls.opens += 1;
      let upgradeAborted = false;
      const open = { result: database(), transaction: { abort() { upgradeAborted = true; calls.aborts += 1; } }, onsuccess: null, onerror: null, onblocked: null, onupgradeneeded: null };
      const completeOpen = () => {
        if (!initialized) {
          open.onupgradeneeded?.({ oldVersion: 0 });
          if (upgradeAborted) return;
          initialized = true;
        }
        open.onsuccess?.();
      };
      if (options.blocked) later(() => open.onblocked?.());
      else if (options.openError) later(() => open.onerror?.());
      else if (!options.lateOpen) later(completeOpen);
      if (options.lateOpen) setTimeout(completeOpen, options.lateOpen);
      return open;
    }
  };
}

function payload(extra = {}) {
  return JSON.stringify({ schema_version: "bridge_session_export_v1", session: { readout: "complete", wouldTransmit: false, canExecute: false, retryAllowed: false, vehicleCommandEnabled: false }, connection_enabled: false, vehicle_command_enabled: false, retained_raw_frames: false, retained_raw_text: false, wouldTransmit: false, canExecute: false, retryAllowed: false, vehicleCommandEnabled: false, ...extra });
}

function payloadWithExactUtf8Bytes(byteLength, character = "x") {
  const empty = payload({ session: { padding: "" } });
  const paddingBytes = Buffer.byteLength(character, "utf8");
  const required = byteLength - Buffer.byteLength(empty, "utf8");
  assert.ok(required >= 0 && required % paddingBytes === 0, "Invalid exact-byte fixture request");
  const value = payload({ session: { padding: character.repeat(required / paddingBytes) } });
  assert.equal(Buffer.byteLength(value, "utf8"), byteLength, "Exact-byte fixture construction failed");
  return value;
}

function client(options = {}) {
  const fake = createFakeIdb(options);
  const crypto = options.digestFailure ? { subtle: { digest: async () => { throw new Error("digest"); } } }
    : options.digestPending ? { subtle: { digest: async () => new Promise(() => {}) } }
    : options.delayedDigest ? { subtle: { digest: (...args) => new Promise((resolve, reject) => setTimeout(() => webcrypto.subtle.digest(...args).then(resolve, reject), options.delayedDigest)) } }
    : options.shortDigest ? { subtle: { digest: async () => new ArrayBuffer(31) } } : webcrypto;
  const operationTimer = options.timeoutDelay === undefined ? setTimeout : (callback) => setTimeout(callback, options.timeoutDelay);
  const context = vm.createContext({ window: {}, indexedDB: fake, IDBKeyRange: { lowerBound: (lower, open) => ({ lower, open }) }, crypto, TextEncoder, TextDecoder, setTimeout: operationTimer, clearTimeout, queueMicrotask, Date });
  context.window = context;
  context.ObdReadOnly = { getDiagnosticSessionJsonPolicy: options.policy || (() => ({ accepted: true, kind: "session" })) };
  vm.runInContext(source, context, { filename: "obd-operation-journal.js" });
  return { api: context.ObdOperationJournal, fake, context };
}

const good = { recordId: "preop_01", sessionJson: payload() };
function load(api, input) { return api.loadPreOperation(input); }
function list(api, input) { return api.listPreOperationIds(input); }
function isArrayBufferLike(value) { return Object.prototype.toString.call(value) === "[object ArrayBuffer]"; }
function isSafeLoad(result, status) {
  return Object.isFrozen(result) && Object.isFrozen(result.execution) && result.status === status
    && result.execution.wouldTransmit === false && result.execution.canExecute === false && result.execution.retryAllowed === false;
}
function isSafeList(result, status) {
  return Object.isFrozen(result) && Object.isFrozen(result.recordIds) && Object.isFrozen(result.execution) && result.status === status
    && result.execution.wouldTransmit === false && result.execution.canExecute === false && result.execution.retryAllowed === false;
}
{
  const exactJson = payloadWithExactUtf8Bytes(4000000);
  const { api, fake } = client();
  const exact = await api.savePreOperation({ recordId: "max_bytes", sessionJson: exactJson });
  check(exact.status === "confirmed" && fake.calls.opens === 1 && fake.records.get("max_bytes").byteLength === 4000000, "Exact 4,000,000 UTF-8 bytes was not accepted");
}
{
  const tooLarge = payloadWithExactUtf8Bytes(4000001);
  const { api, fake } = client();
  const rejected = await api.savePreOperation({ recordId: "over_bytes", sessionJson: tooLarge });
  check(rejected.status === "rejected" && fake.calls.opens === 0, "4,000,001 UTF-8 bytes reached IndexedDB");
}
{
  const multibyteBase = Buffer.byteLength(payload({ session: { padding: "" } }), "utf8");
  const multibyteTarget = 4000001 + ((3 - ((4000001 - multibyteBase) % 3)) % 3);
  const multibyte = payloadWithExactUtf8Bytes(multibyteTarget, "あ");
  const { api, fake } = client();
  const rejected = await api.savePreOperation({ recordId: "multibyte_bytes", sessionJson: multibyte });
  check(multibyte.length < 4000000 && rejected.status === "rejected" && fake.calls.opens === 0, "Multibyte UTF-8 overflow was not rejected before IndexedDB");
}
for (const sessionJson of [payload() + "\0", payload() + "\uD800"]) {
  const { api, fake } = client();
  const rejected = await api.savePreOperation({ recordId: "invalid_unicode", sessionJson });
  check(rejected.status === "rejected" && fake.calls.opens === 0, "NUL or unpaired surrogate reached IndexedDB");
}
{
  const { api, fake } = client();
  const saved = await api.savePreOperation(good);
  check(Object.isFrozen(api) && Object.isFrozen(saved) && saved.status === "confirmed", "Save did not return a frozen confirmed result");
  check(saved.execution.wouldTransmit === false && saved.execution.canExecute === false && saved.execution.retryAllowed === false, "Save result exposed execution capability");
  check(fake.calls.writes === 1 && fake.calls.reads === 1 && fake.calls.strict === 1, "Save did not use one strict add and separate readback");
  const verified = await api.verifyPreOperation(good);
  check(verified.status === "confirmed" && fake.calls.writes === 1 && fake.calls.reads === 2, "Verify wrote data or did not compare the stored snapshot");
  check([...fake.records.values()][0].sourceBytes instanceof ArrayBuffer, "Stored source bytes were not an ArrayBuffer");
}
{
  const { api, fake } = client({ delayedDigest: 15 });
  const input = { ...good };
  const saving = api.savePreOperation(input);
  input.recordId = "mutated_record";
  input.sessionJson = payload({ canExecute: true });
  const saved = await saving;
  const stored = fake.records.get(good.recordId);
  check(saved.status === "confirmed" && !fake.records.has("mutated_record") && new TextDecoder().decode(stored.sourceBytes) === good.sessionJson, "Caller mutation during digest changed the saved snapshot");
}
{
  const { api, fake } = client();
  const unsafeAlias = await api.savePreOperation({ recordId: "unsafe_alias", sessionJson: payload({ canExecute: true }) });
  check(unsafeAlias.status === "rejected" && unsafeAlias.reason === "invalid_session_schema" && fake.calls.opens === 0, "Enabled camel safety alias reached IndexedDB");
}
for (const options of [{ abortAfterRequestSuccess: true }, { quota: true }, { blocked: true }, { readbackMismatch: true }, { readError: true }, { readAbortAfterRequestSuccess: true }, { tamperCreatedAt: true }, { storedExtra: true }]) {
  const { api, fake } = client(options);
  const outcome = await api.savePreOperation(good);
  check(outcome.status === "indeterminate", "Storage fault reported as confirmed");
  if (options.abortAfterRequestSuccess) check(!fake.records.has(good.recordId), "Abort-after-request fake retained an uncommitted record");
}
{
  const { api, fake } = client();
  await api.savePreOperation(good);
  const conflict = await api.savePreOperation(good);
  check(conflict.status === "conflict" && conflict.reason === "record_conflict" && fake.calls.writes === 2, "Duplicate add was not a conflict");
}
{
  const { api, fake } = client({ initialized: true });
  const absent = await api.verifyPreOperation(good);
  check(absent.status === "indeterminate" && fake.calls.writes === 0, "Absent verification wrote or claimed confirmation");
}
{
  const { api, fake } = client();
  const absentDatabase = await api.verifyPreOperation(good);
  check(absentDatabase.status === "indeterminate" && absentDatabase.reason === "storage_not_initialized" && fake.calls.writes === 0 && fake.calls.reads === 0, "Verify initialized an absent database");
}
{
  const { api, fake } = client({ initialized: true, wrongStore: true });
  const wrongSchema = await api.savePreOperation(good);
  check(wrongSchema.status === "indeterminate" && fake.calls.writes === 0, "Existing wrong schema was repaired or written");
}
for (const options of [{ initialized: true, storeKeyPath: "otherId" }, { initialized: true, autoIncrement: true }]) {
  const { api, fake } = client(options);
  const wrongMetadata = await api.savePreOperation(good);
  check(wrongMetadata.status === "indeterminate" && fake.calls.writes === 0, "Invalid existing store metadata permitted a write");
}
{
  const { api, fake } = client({ digestFailure: true });
  const outcome = await api.savePreOperation(good);
  check(outcome.status === "rejected" && outcome.reason === "digest_failed" && fake.calls.opens === 0, "Digest failure reached IndexedDB");
}
{
  const { api, fake } = client({ shortDigest: true });
  const outcome = await api.savePreOperation(good);
  check(outcome.status === "rejected" && outcome.reason === "digest_failed" && fake.calls.opens === 0, "Non-SHA-256 digest length reached IndexedDB");
}
{
  const { api, fake } = client({ lateOpen: 15, timeoutDelay: 5 });
  const timedOut = await api.savePreOperation(good);
  await new Promise((resolve) => setTimeout(resolve, 25));
  check(timedOut.status === "indeterminate" && timedOut.reason === "operation_timeout" && fake.calls.writes === 0 && fake.calls.closes >= 1, "Late open started a write after the operation deadline");
}
{
  const { api, fake } = client({ delayedWrite: 15, timeoutDelay: 5 });
  const timedOut = await api.savePreOperation(good);
  check(timedOut.status === "indeterminate" && timedOut.reason === "operation_timeout" && fake.calls.writes === 1 && fake.calls.reads === 0, "Pending write timeout did not settle indeterminate after add started");
  await new Promise((resolve) => setTimeout(resolve, 25));
  check(timedOut.status === "indeterminate" && fake.calls.reads === 0 && fake.calls.aborts >= 1 && fake.calls.closes >= 1, "Late write callback changed a timed-out result or started readback");
}
{
  const { api, fake } = client({ digestPending: true, timeoutDelay: 5 });
  const timedOut = await api.savePreOperation(good);
  check(timedOut.status === "indeterminate" && timedOut.reason === "operation_timeout" && fake.calls.opens === 0, "Pending digest deadline reached IndexedDB");
}
{
  const { api, fake } = client();
  await api.savePreOperation(good);
  fake.records.get(good.recordId).createdAt = new Date(Date.now() + 61000).toISOString();
  const future = await api.verifyPreOperation(good);
  check(future.status === "indeterminate" && future.reason === "record_mismatch" && fake.calls.writes === 1, "Future stored timestamp was accepted by verify");
}
{
  const { api, fake } = client();
  await api.savePreOperation(good);
  fake.setStoreSchema({ keyPath: "otherId" });
  const wrongStore = await api.verifyPreOperation(good);
  check(wrongStore.status === "indeterminate" && wrongStore.reason === "storage_schema_invalid" && fake.calls.writes === 1 && fake.calls.reads === 1, "Verify read through mismatched store metadata");
}
{
  const { api, fake } = client();
  await api.savePreOperation(good);
  fake.records.get(good.recordId).createdAt = new Date().toUTCString();
  const noncanonical = await api.verifyPreOperation(good);
  check(noncanonical.status === "indeterminate" && noncanonical.reason === "record_mismatch", "Verify accepted a noncanonical stored timestamp");
}
{
  const { api, fake } = client();
  const accessor = {};
  Object.defineProperty(accessor, "recordId", { enumerable: true, get: () => "preop_01" });
  Object.defineProperty(accessor, "sessionJson", { enumerable: true, value: payload() });
  const outcome = await api.savePreOperation(accessor);
  check(outcome.status === "rejected" && fake.calls.opens === 0, "Accessor input reached IndexedDB");
}
for (const input of [
  Object.defineProperty({ ...good }, "hidden", { value: true }),
  Object.assign({ ...good }, { [Symbol("extra")]: true })
]) {
  const { api, fake } = client();
  const outcome = await api.savePreOperation(input);
  check(outcome.status === "rejected" && fake.calls.opens === 0, "Hidden or symbol input key reached IndexedDB");
}
{
  const first = client();
  await first.api.savePreOperation(good);
  const reopened = client({ initialized: true, records: first.fake.records });
  const loaded = await load(reopened.api, { recordId: good.recordId });
  check(isSafeLoad(loaded, "loaded") && loaded.reason === "valid_record_recovered" && Object.isFrozen(loaded.record)
    && loaded.record.sessionJson === good.sessionJson && loaded.record.byteLength === Buffer.byteLength(good.sessionJson)
    && Reflect.ownKeys(loaded.record).join(",") === "recordId,createdAt,exportType,sessionJson,byteLength"
    && !Object.values(loaded.record).some((value) => isArrayBufferLike(value)), "Load did not recover a frozen public snapshot without buffers");
}
{
  const unicode = payload({ diagnosticNote: "日本語診断記録 / Ω" });
  const first = client();
  await first.api.savePreOperation({ recordId: "load_unicode", sessionJson: unicode });
  const reopened = client({ initialized: true, records: first.fake.records });
  const loaded = await load(reopened.api, { recordId: "load_unicode" });
  check(isSafeLoad(loaded, "loaded") && loaded.record.sessionJson === unicode, "Load did not preserve unicode JSON after reopen");
}
{
  const { api, fake } = client();
  const absent = await load(api, { recordId: good.recordId });
  const saved = await api.savePreOperation(good);
  check(isSafeLoad(absent, "indeterminate") && absent.reason === "storage_not_initialized" && absent.record === null
    && fake.calls.writes === 1 && saved.status === "confirmed", "Load initialized an absent database or wrote during read");
}
{
  const first = client();
  await first.api.savePreOperation(good);
  const { api, fake } = client({ initialized: true, records: first.fake.records, readAbortAfterRequestSuccess: true });
  const aborted = await load(api, { recordId: good.recordId });
  check(isSafeLoad(aborted, "indeterminate") && aborted.record === null && fake.calls.reads === 1 && fake.calls.writes === 0, "Aborted read success exposed a record");
}
for (const [transformIndex, transformReadRecord] of [
  (record) => { record.createdAt = "not-a-timestamp"; },
  (record) => { new Uint8Array(record.sha256)[0] ^= 1; },
  (record) => { new Uint8Array(record.sourceBytes)[0] ^= 1; },
  (record) => { record.injected = true; }
].entries()) {
  const first = client();
  await first.api.savePreOperation(good);
  const { api } = client({ initialized: true, records: first.fake.records, transformReadRecord });
  const tampered = await load(api, { recordId: good.recordId });
  check(isSafeLoad(tampered, "indeterminate") && tampered.record === null, `Tampered stored record ${transformIndex} leaked through load: ${tampered.status}/${tampered.reason}`);
}
for (const input of [
  {}, { recordId: "" }, { recordId: good.recordId, extra: true },
  Object.defineProperty({}, "recordId", { enumerable: true, get: () => good.recordId }),
  Object.defineProperty({ recordId: good.recordId }, "hidden", { value: true }),
  Object.assign({ recordId: good.recordId }, { [Symbol("extra")]: true })
]) {
  const { api, fake } = client({ initialized: true });
  const rejected = await load(api, input);
  check(isSafeLoad(rejected, "rejected") && rejected.record === null && fake.calls.opens === 0, "Load accepted non-exact input");
}
{
  const exactJson = payloadWithExactUtf8Bytes(4000000);
  const first = client();
  await first.api.savePreOperation({ recordId: "load_cap", sessionJson: exactJson });
  const reopened = client({ initialized: true, records: first.fake.records });
  const exact = await load(reopened.api, { recordId: "load_cap" });
  first.fake.records.get("load_cap").byteLength = 4000001;
  const over = await load(reopened.api, { recordId: "load_cap" });
  check(isSafeLoad(exact, "loaded") && isSafeLoad(over, "indeterminate") && over.record === null, "Load did not enforce stored byte caps");
}
for (const sourceBytes of [new Uint8Array([0xc3, 0x28]).buffer, new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]).buffer]) {
  const first = client();
  await first.api.savePreOperation(good);
  const record = first.fake.records.get(good.recordId);
  record.sourceBytes = sourceBytes;
  record.byteLength = sourceBytes.byteLength;
  const reopened = client({ initialized: true, records: first.fake.records });
  const invalid = await load(reopened.api, { recordId: good.recordId });
  check(isSafeLoad(invalid, "indeterminate") && invalid.record === null, "Malformed UTF-8 or BOM stored bytes loaded");
}
for (const length of [31, 33]) {
  const first = client();
  await first.api.savePreOperation(good);
  first.fake.records.get(good.recordId).sha256 = new ArrayBuffer(length);
  const reopened = client({ initialized: true, records: first.fake.records });
  const invalid = await load(reopened.api, { recordId: good.recordId });
  check(isSafeLoad(invalid, "indeterminate") && invalid.record === null, "Non-32-byte stored digest loaded");
}
for (const options of [{ digestFailure: true }, { digestPending: true, timeoutDelay: 5 }, { delayedDigest: 15, timeoutDelay: 5 }]) {
  const first = client();
  await first.api.savePreOperation(good);
  const { api, fake } = client({ initialized: true, records: first.fake.records, ...options });
  const invalid = await load(api, { recordId: good.recordId });
  check(isSafeLoad(invalid, "indeterminate") && invalid.record === null && fake.calls.writes === 0, "Load digest failure or timeout leaked a record");
}
{
  const records = new Map(Array.from({ length: 51 }, (_, index) => [`id_${String(index + 1).padStart(2, "0")}`, { payload: "must_not_be_read" }]));
  const { api, fake } = client({ initialized: true, records, digestFailure: true });
  const first = await list(api, { limit: 1, afterRecordId: null });
  const fifty = await list(api, { limit: 50, afterRecordId: null });
  const next = await list(api, { limit: 50, afterRecordId: "id_50" });
  check(isSafeList(first, "listed") && first.reason === "record_ids_listed" && first.recordIds.join(",") === "id_01" && first.nextAfterRecordId === "id_01" && first.hasMore === true
    && isSafeList(fifty, "listed") && fifty.recordIds.length === 50 && fifty.recordIds[49] === "id_50" && fifty.nextAfterRecordId === "id_50" && fifty.hasMore === true
    && isSafeList(next, "listed") && next.recordIds.join(",") === "id_51" && next.nextAfterRecordId === null && next.hasMore === false
    && fake.calls.keyCursors === 3 && fake.calls.reads === 0 && fake.calls.writes === 0 && fake.calls.ranges[2]?.lower === "id_50" && fake.calls.ranges[2]?.open === true, "Key-only pagination did not enforce 1/50/51 bounds and exclusive continuation");
}
for (const input of [
  null, {}, { limit: 1 }, { afterRecordId: null }, { limit: 1, afterRecordId: null, extra: true },
  Object.defineProperty({ limit: 1, afterRecordId: null }, "hidden", { value: true }),
  Object.assign({ limit: 1, afterRecordId: null }, { [Symbol("extra")]: true }),
  Object.defineProperty({ limit: 1, afterRecordId: null }, "limit", { enumerable: true, get: () => 1 })
]) {
  const { api, fake } = client({ initialized: true });
  const rejected = await list(api, input);
  check(isSafeList(rejected, "rejected") && rejected.reason === "invalid_input" && rejected.recordIds.length === 0 && rejected.nextAfterRecordId === null && rejected.hasMore === false && fake.calls.opens === 0, "List accepted an invalid input shape or descriptor");
}
for (const [input, reason] of [
  [{ limit: 0, afterRecordId: null }, "invalid_limit"], [{ limit: 51, afterRecordId: null }, "invalid_limit"], [{ limit: 1.5, afterRecordId: null }, "invalid_limit"],
  [{ limit: 1, afterRecordId: "" }, "invalid_record_id"], [{ limit: 1, afterRecordId: 1 }, "invalid_record_id"]
]) {
  const { api, fake } = client({ initialized: true });
  const rejected = await list(api, input);
  check(isSafeList(rejected, "rejected") && rejected.reason === reason && rejected.recordIds.length === 0 && rejected.nextAfterRecordId === null && rejected.hasMore === false && fake.calls.opens === 0, "List did not reject invalid limit or record id");
}
for (const options of [
  {}, { wrongStore: true }, { storeKeyPath: "wrong" }, { autoIncrement: true }, { cursorErrorAt: 0 }, { abortAfterCursorSuccess: true }, { lateKeyCursor: 15, timeoutDelay: 5 }
]) {
  const { api, fake } = client({ initialized: Object.keys(options).length !== 0, records: new Map([["id_01", { payload: "must_not_be_read" }]]), ...options });
  const outcome = await list(api, { limit: 1, afterRecordId: null });
  const expected = Object.keys(options).length === 0 ? "storage_not_initialized" : options.wrongStore || options.storeKeyPath || options.autoIncrement ? "storage_schema_invalid" : options.lateKeyCursor ? "operation_timeout" : "storage_read_failed";
  check(isSafeList(outcome, "indeterminate") && outcome.reason === expected && outcome.recordIds.length === 0 && outcome.nextAfterRecordId === null && outcome.hasMore === false && fake.calls.writes === 0, "List failure leaked partial data or changed storage");
}
for (const cursorKeys of [["id_01", "bad key"], ["id_01", "bad key", "id_03"]]) {
  const { api, fake } = client({ initialized: true, cursorKeys });
  const outcome = await list(api, { limit: 1, afterRecordId: null });
  check(isSafeList(outcome, "indeterminate") && outcome.reason === "storage_key_invalid" && outcome.recordIds.length === 0 && outcome.nextAfterRecordId === null && outcome.hasMore === false && fake.calls.reads === 0 && fake.calls.writes === 0, "Invalid cursor key, including lookahead, leaked a page");
}
{
  const { api } = client({ initialized: true, cursorKeys: ["id_01"] });
  const listed = await list(api, { limit: 1, afterRecordId: null });
  check(isSafeList(listed, "listed") && Reflect.ownKeys(listed).join(",") === "status,reason,recordIds,nextAfterRecordId,hasMore,execution" && Object.isFrozen(listed.recordIds) && listed.recordIds.join(",") === "id_01", "List result was not a complete frozen snapshot");
}
function isSafeRemove(outcome, status, reason) {
  return Object.isFrozen(outcome) && Object.isFrozen(outcome.execution) && outcome.status === status && outcome.reason === reason
    && outcome.execution.wouldTransmit === false && outcome.execution.canExecute === false && outcome.execution.retryAllowed === false;
}
async function seededRemoveClient(options = {}) {
  const first = client();
  const saved = await first.api.savePreOperation(good);
  assert.equal(saved.status, "confirmed", "Removal fixture failed to save");
  const expected = { recordId: good.recordId, sessionJson: good.sessionJson, createdAt: first.fake.records.get(good.recordId).createdAt };
  return { ...client({ initialized: true, records: first.fake.records, ...options }), expected };
}
{
  const { api, fake, expected } = await seededRemoveClient();
  const removed = await api.removePreOperation(expected);
  check(isSafeRemove(removed, "confirmed", "record_removed") && fake.calls.deletes === 1 && !fake.records.has(expected.recordId)
    && fake.calls.strict === 1 && fake.calls.modes.join(",") === "readwrite,readonly", "Remove did not use strict CAS deletion followed by readonly absence confirmation");
}
{
  const { api, fake } = client({ initialized: true });
  const absent = await api.removePreOperation({ recordId: good.recordId, sessionJson: good.sessionJson, createdAt: new Date().toISOString() });
  check(isSafeRemove(absent, "conflict", "record_not_found") && fake.calls.deletes === 0, "Absent record issued a delete or did not report conflict");
}
for (const mutate of [
  (record) => { record.recordId = "other_record"; },
  (record) => { record.createdAt = "2026-01-01T00:00:00.000Z"; },
  (record) => { record.exportType = "unknown_schema"; },
  (record) => { new Uint8Array(record.sourceBytes)[0] ^= 1; },
  (record) => { record.byteLength += 1; },
  (record) => { new Uint8Array(record.sha256)[0] ^= 1; }
]) {
  const { api, fake, expected } = await seededRemoveClient();
  mutate(fake.records.get(expected.recordId));
  const mismatch = await api.removePreOperation(expected);
  check(isSafeRemove(mismatch, "conflict", "record_mismatch") && fake.calls.deletes === 0 && fake.records.has(expected.recordId), "CAS mismatch deleted or did not report conflict");
}
for (const [input, reason] of [
  [{ recordId: "", sessionJson: good.sessionJson, createdAt: new Date().toISOString() }, "invalid_record_id"],
  [{ recordId: good.recordId, sessionJson: "{}", createdAt: new Date().toISOString() }, "invalid_session_schema"],
  [{ recordId: good.recordId, sessionJson: good.sessionJson, createdAt: new Date().toUTCString() }, "invalid_created_at"],
  [{ recordId: good.recordId, sessionJson: payload({ schema_version: "unknown_schema" }), createdAt: new Date().toISOString() }, "invalid_session_schema"],
  [{ recordId: good.recordId, sessionJson: payload(), createdAt: "not-a-date" }, "invalid_created_at"]
]) {
  const { api, fake } = client({ initialized: true });
  const rejected = await api.removePreOperation(input);
  check(isSafeRemove(rejected, "rejected", reason) && fake.calls.opens === 0, "Remove invalid input reached IndexedDB");
}
{
  const { api, fake } = client({ initialized: true, policy: () => ({ accepted: false, kind: "session" }) });
  const rejected = await api.removePreOperation({ recordId: good.recordId, sessionJson: good.sessionJson, createdAt: new Date().toISOString() });
  check(isSafeRemove(rejected, "rejected", "session_policy_rejected") && fake.calls.opens === 0, "Remove bypassed the read-only session policy");
}
{
  const { api, fake } = client({ initialized: true, digestFailure: true });
  const rejected = await api.removePreOperation({ recordId: good.recordId, sessionJson: good.sessionJson, createdAt: new Date().toISOString() });
  check(isSafeRemove(rejected, "rejected", "digest_failed") && fake.calls.opens === 0, "Remove digest failure reached IndexedDB");
}
{
  const { api, fake } = client({ initialized: true });
  const accessor = { sessionJson: good.sessionJson, createdAt: new Date().toISOString() };
  Object.defineProperty(accessor, "recordId", { enumerable: true, get: () => good.recordId });
  const rejected = await api.removePreOperation(accessor);
  check(isSafeRemove(rejected, "rejected", "invalid_input") && fake.calls.opens === 0, "Remove accepted a getter input");
}
{
  const { api, fake, expected } = await seededRemoveClient({ delayedDigest: 15 });
  const removing = api.removePreOperation(expected);
  expected.recordId = "mutated_record";
  expected.sessionJson = payload({ canExecute: true });
  expected.createdAt = "2026-01-01T00:00:00.000Z";
  const removed = await removing;
  check(isSafeRemove(removed, "confirmed", "record_removed") && !fake.records.has(good.recordId), "Caller mutation changed the removal snapshot");
}
for (const [options, reason, remains] of [
  [{ deleteError: true }, "storage_delete_failed", true],
  [{ deleteAbortAfterRequestSuccess: true }, "storage_delete_failed", true],
  [{ deleteNoEffect: true }, "record_still_present", true],
  [{ readErrorOnRead: 2 }, "storage_read_failed", false]
]) {
  const { api, fake, expected } = await seededRemoveClient(options);
  const outcome = await api.removePreOperation(expected);
  check(isSafeRemove(outcome, "indeterminate", reason) && fake.records.has(expected.recordId) === remains, "Remove error or readback fault had an unsafe result");
}
{
  const { api, fake, expected } = await seededRemoveClient({ delayedDelete: 15, timeoutDelay: 5 });
  const timedOut = await api.removePreOperation(expected);
  await new Promise((resolve) => setTimeout(resolve, 25));
  check(isSafeRemove(timedOut, "indeterminate", "operation_timeout") && fake.records.has(expected.recordId) && fake.calls.deletes === 1 && fake.calls.aborts >= 1, "Late delete callback ran after timeout");
}
{
  const { api, fake, expected } = await seededRemoveClient({ lateOpen: 15, timeoutDelay: 5 });
  const timedOut = await api.removePreOperation(expected);
  await new Promise((resolve) => setTimeout(resolve, 25));
  check(isSafeRemove(timedOut, "indeterminate", "operation_timeout") && fake.calls.deletes === 0 && fake.records.has(expected.recordId), "Late open started deletion after timeout");
}
console.log(`Operation journal validation passed: ${checks} checks`);
