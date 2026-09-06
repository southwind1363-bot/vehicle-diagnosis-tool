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
  const calls = { opens: 0, writes: 0, reads: 0, closes: 0, aborts: 0, strict: 0 };
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
        let finished = false;
        const tx = {
          oncomplete: null, onabort: null, onerror: null,
          abort() { if (!finished) { finished = true; calls.aborts += 1; later(() => this.onabort?.()); } },
          objectStore() {
            return mode === "readwrite" ? {
              keyPath: options.storeKeyPath || "recordId", autoIncrement: options.autoIncrement === true,
              add(record) {
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
              }
            } : {
              keyPath: options.storeKeyPath || "recordId", autoIncrement: options.autoIncrement === true,
              get(recordId) {
                calls.reads += 1;
                const get = request();
                later(() => {
                  if (finished) return;
                  if (options.readError) { get.error = { name: "ReadError" }; get.onerror?.(); finished = true; tx.onabort?.(); return; }
                  const value = records.get(recordId);
                  const returned = value && { ...value };
                  if (returned && options.readbackMismatch) returned.byteLength += 1;
                  if (returned && options.tamperCreatedAt) returned.createdAt = "1970-01-01T00:00:00.000Z";
                  if (returned && options.storedExtra) returned.injected = true;
                  get.result = returned;
                  get.onsuccess?.();
                  if (options.readAbortAfterRequestSuccess) { finished = true; tx.onabort?.(); return; }
                  finished = true; tx.oncomplete?.();
                });
                return get;
              }
            };
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
      const open = { result: database(), transaction: { abort() { calls.aborts += 1; } }, onsuccess: null, onerror: null, onblocked: null, onupgradeneeded: null };
      if (options.blocked) later(() => open.onblocked?.());
      else if (options.openError) later(() => open.onerror?.());
      else if (!options.lateOpen) later(() => { if (!initialized) { open.onupgradeneeded?.({ oldVersion: 0 }); initialized = true; } open.onsuccess?.(); });
      if (options.lateOpen) setTimeout(() => { if (!initialized) { open.onupgradeneeded?.({ oldVersion: 0 }); initialized = true; } open.onsuccess?.(); }, options.lateOpen);
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
  const context = vm.createContext({ window: {}, indexedDB: fake, crypto, TextEncoder, TextDecoder, setTimeout: operationTimer, clearTimeout, queueMicrotask, Date });
  context.window = context;
  context.ObdReadOnly = { getDiagnosticSessionJsonPolicy: options.policy || (() => ({ accepted: true, kind: "session" })) };
  vm.runInContext(source, context, { filename: "obd-operation-journal.js" });
  return { api: context.ObdOperationJournal, fake, context };
}

const good = { recordId: "preop_01", sessionJson: payload() };
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
console.log(`Operation journal validation passed: ${checks} checks`);
