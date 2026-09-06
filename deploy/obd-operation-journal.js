(function () {
  "use strict";

  const DATABASE_NAME = "vehicle-diagnosis-operation-journal-v1";
  const DATABASE_VERSION = 1;
  const STORE_NAME = "preOperationRecords";
  const EXPORT_TYPE = "bridge_session_export_v1";
  const MAX_BYTES = 4000000;
  const TIMEOUT_MS = 5000;
  const JOURNAL_RECORD_LOCK_PREFIX = "vehicle-diagnosis-operation-journal-v1/preOperationRecords/";
  const LOCK_ACQUIRE_TIMEOUT_MS = 5000;
  const RECORD_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
  const SAFETY_FLAG_KEYS = [
    "connection_enabled", "vehicle_command_enabled", "retained_raw_frames", "retained_raw_text",
    "connectionEnabled", "vehicleCommandEnabled", "retainedRawFrames", "retainedRawText",
    "wouldTransmit", "would_transmit", "canExecute", "can_execute", "retryAllowed", "retry_allowed",
    "executionEnabled", "execution_enabled"
  ];

  function execution() {
    return Object.freeze({ wouldTransmit: false, canExecute: false, retryAllowed: false });
  }

  function result(status, reason, recordId) {
    return Object.freeze({ status, reason, recordId: recordId || null, execution: execution() });
  }

  function reservationResult(status, reason, recordId, lease) {
    return Object.freeze({ status, reason, recordId: recordId || null, lease: lease || null, execution: execution() });
  }

  function recordLockName(recordId) {
    return `${JOURNAL_RECORD_LOCK_PREFIX}${recordId}`;
  }

  function webLocksRequest() {
    const request = globalThis.navigator?.locks?.request;
    return typeof request === "function" ? request.bind(globalThis.navigator.locks) : null;
  }

  function validRecordId(value) {
    return typeof value === "string" && RECORD_ID_PATTERN.test(value) ? value : null;
  }

  function snapshotInput(input) {
    try {
      if (input === null || typeof input !== "object") return { error: "invalid_input", recordId: null };
      const prototype = Object.getPrototypeOf(input);
      if (prototype !== null && Object.getPrototypeOf(prototype) !== null) return { error: "invalid_input", recordId: null };
      const keys = Reflect.ownKeys(input);
      if (keys.length !== 2 || !keys.every((key) => typeof key === "string") || !keys.includes("recordId") || !keys.includes("sessionJson")) return { error: "invalid_input", recordId: null };
      const recordDescriptor = Object.getOwnPropertyDescriptor(input, "recordId");
      const sessionDescriptor = Object.getOwnPropertyDescriptor(input, "sessionJson");
      if (!recordDescriptor || !sessionDescriptor || !("value" in recordDescriptor) || !("value" in sessionDescriptor)) return { error: "invalid_input", recordId: null };
      const recordId = validRecordId(recordDescriptor.value);
      if (!recordId) return { error: "invalid_record_id", recordId: null };
      if (typeof sessionDescriptor.value !== "string") return { error: "invalid_session_json", recordId };
      return { recordId, sessionJson: sessionDescriptor.value };
    } catch {
      return { error: "invalid_input", recordId: null };
    }
  }

  function snapshotRemoveInput(input) {
    try {
      if (input === null || typeof input !== "object") return { error: "invalid_input", recordId: null };
      const prototype = Object.getPrototypeOf(input);
      if (prototype !== null && Object.getPrototypeOf(prototype) !== null) return { error: "invalid_input", recordId: null };
      const keys = Reflect.ownKeys(input);
      const requiredKeys = ["recordId", "sessionJson", "createdAt"];
      if (keys.length !== requiredKeys.length || !keys.every((key) => typeof key === "string" && requiredKeys.includes(key))) return { error: "invalid_input", recordId: null };
      const fields = Object.fromEntries(requiredKeys.map((key) => [key, Object.getOwnPropertyDescriptor(input, key)]));
      if (requiredKeys.some((key) => !fields[key] || !("value" in fields[key]))) return { error: "invalid_input", recordId: null };
      const recordId = validRecordId(fields.recordId.value);
      if (!recordId) return { error: "invalid_record_id", recordId: null };
      if (typeof fields.sessionJson.value !== "string") return { error: "invalid_session_json", recordId };
      if (!isValidCreatedAt(fields.createdAt.value, null)) return { error: "invalid_created_at", recordId };
      return { recordId, sessionJson: fields.sessionJson.value, createdAt: fields.createdAt.value };
    } catch {
      return { error: "invalid_input", recordId: null };
    }
  }

  function validateSession(recordId, sessionJson) {
    if (sessionJson.length > MAX_BYTES || sessionJson.includes("\0")) return { error: "invalid_session_json", recordId };
    let bytes;
    try {
      bytes = new TextEncoder().encode(sessionJson);
      if (bytes.byteLength > MAX_BYTES || new TextDecoder("utf-8", { fatal: true }).decode(bytes) !== sessionJson) return { error: "invalid_session_json", recordId };
    } catch {
      return { error: "invalid_session_json", recordId };
    }
    let parsed;
    try {
      parsed = JSON.parse(sessionJson);
    } catch {
      return { error: "invalid_session_json", recordId };
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object" || parsed.schema_version !== EXPORT_TYPE
      || !parsed.session || Array.isArray(parsed.session) || typeof parsed.session !== "object" || Object.keys(parsed.session).length === 0
      || parsed.connection_enabled !== false || parsed.vehicle_command_enabled !== false
      || parsed.retained_raw_frames !== false || parsed.retained_raw_text !== false
      || !hasOnlyDisabledSafetyFlags(parsed) || !hasOnlyDisabledSafetyFlags(parsed.session)) return { error: "invalid_session_schema", recordId };
    try {
      const policy = window.ObdReadOnly?.getDiagnosticSessionJsonPolicy;
      if (typeof policy !== "function") return { error: "session_policy_unavailable", recordId };
      const policyResult = policy(sessionJson);
      if (!policyResult || policyResult.accepted !== true || policyResult.kind !== "session") return { error: "session_policy_rejected", recordId };
    } catch {
      return { error: "session_policy_rejected", recordId };
    }
    return { recordId, bytes };
  }

  function hasOnlyDisabledSafetyFlags(value) {
    return SAFETY_FLAG_KEYS.every((key) => !Object.prototype.hasOwnProperty.call(value, key) || value[key] === false);
  }

  function bytesEqual(left, right) {
    if (!isArrayBuffer(left) || !isArrayBuffer(right) || left.byteLength !== right.byteLength) return false;
    const a = new Uint8Array(left);
    const b = new Uint8Array(right);
    for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
    return true;
  }

  function isArrayBuffer(value) {
    return Object.prototype.toString.call(value) === "[object ArrayBuffer]";
  }

  function isValidCreatedAt(value, expectedValue) {
    if (typeof value !== "string") return false;
    const milliseconds = Date.parse(value);
    if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > Date.now() + 60000) return false;
    if (new Date(milliseconds).toISOString() !== value) return false;
    return expectedValue === null || value === expectedValue;
  }

  function storedRecordMatches(stored, recordId, sourceBytes, byteLength, expectedDigest, expectedCreatedAt) {
    try {
      if (stored === null || typeof stored !== "object") return false;
      const prototype = Object.getPrototypeOf(stored);
      if (prototype !== null && Object.getPrototypeOf(prototype) !== null) return false;
      const keys = Reflect.ownKeys(stored);
      const requiredKeys = ["recordId", "createdAt", "exportType", "sourceBytes", "byteLength", "sha256"];
      if (keys.length !== requiredKeys.length || !keys.every((key) => typeof key === "string" && requiredKeys.includes(key))) return false;
      const fields = Object.fromEntries(requiredKeys.map((key) => [key, Object.getOwnPropertyDescriptor(stored, key)]));
      if (requiredKeys.some((key) => !fields[key] || !("value" in fields[key]))) return false;
      return fields.recordId.value === recordId && fields.exportType.value === EXPORT_TYPE
        && fields.byteLength.value === byteLength && isValidCreatedAt(fields.createdAt.value, expectedCreatedAt)
        && bytesEqual(fields.sourceBytes.value, sourceBytes) && bytesEqual(fields.sha256.value, expectedDigest);
    } catch {
      return false;
    }
  }

  function loadResult(status, reason, recordId, record) {
    const snapshot = record === null ? null : Object.freeze({
      recordId: record.recordId,
      createdAt: record.createdAt,
      exportType: record.exportType,
      sessionJson: record.sessionJson,
      byteLength: record.byteLength
    });
    return Object.freeze({ status, reason, recordId: recordId || null, record: snapshot, execution: execution() });
  }

  function snapshotLoadInput(input) {
    try {
      if (input === null || typeof input !== "object") return { error: "invalid_input", recordId: null };
      const prototype = Object.getPrototypeOf(input);
      if (prototype !== null && Object.getPrototypeOf(prototype) !== null) return { error: "invalid_input", recordId: null };
      const keys = Reflect.ownKeys(input);
      if (keys.length !== 1 || keys[0] !== "recordId") return { error: "invalid_input", recordId: null };
      const descriptor = Object.getOwnPropertyDescriptor(input, "recordId");
      if (!descriptor || !("value" in descriptor)) return { error: "invalid_input", recordId: null };
      const recordId = validRecordId(descriptor.value);
      return recordId ? { recordId } : { error: "invalid_record_id", recordId: null };
    } catch {
      return { error: "invalid_input", recordId: null };
    }
  }

  function listResult(status, reason, recordIds, nextAfterRecordId, hasMore) {
    return Object.freeze({
      status,
      reason,
      recordIds: Object.freeze(recordIds.slice()),
      nextAfterRecordId: nextAfterRecordId || null,
      hasMore: hasMore === true,
      execution: execution()
    });
  }

  function snapshotListInput(input) {
    try {
      if (input === null || typeof input !== "object") return { error: "invalid_input" };
      const prototype = Object.getPrototypeOf(input);
      if (prototype !== null && Object.getPrototypeOf(prototype) !== null) return { error: "invalid_input" };
      const keys = Reflect.ownKeys(input);
      if (keys.length !== 2 || !keys.every((key) => typeof key === "string") || !keys.includes("limit") || !keys.includes("afterRecordId")) return { error: "invalid_input" };
      const limitDescriptor = Object.getOwnPropertyDescriptor(input, "limit");
      const afterDescriptor = Object.getOwnPropertyDescriptor(input, "afterRecordId");
      if (!limitDescriptor || !afterDescriptor || !("value" in limitDescriptor) || !("value" in afterDescriptor)) return { error: "invalid_input" };
      if (!Number.isInteger(limitDescriptor.value) || limitDescriptor.value < 1 || limitDescriptor.value > 50) return { error: "invalid_limit" };
      if (afterDescriptor.value !== null && !validRecordId(afterDescriptor.value)) return { error: "invalid_record_id" };
      return { limit: limitDescriptor.value, afterRecordId: afterDescriptor.value };
    } catch {
      return { error: "invalid_input" };
    }
  }

  function listPreOperationIds(input) {
    const snapshot = snapshotListInput(input);
    if (snapshot.error) return Promise.resolve(listResult("rejected", snapshot.error, [], null, false));

    return new Promise((resolve) => {
      let settled = false;
      let db = null;
      let activeTransaction = null;
      let timer = null;
      let recordIds = [];
      let hasMore = false;
      let scanComplete = false;
      const finish = (status, reason) => {
        if (settled) return;
        settled = true;
        if (timer !== null) clearTimeout(timer);
        if (activeTransaction) {
          try { activeTransaction.abort(); } catch {}
        }
        if (db) {
          try { db.close(); } catch {}
        }
        const listed = status === "listed";
        resolve(listResult(listed ? "listed" : status, reason, listed ? recordIds : [], listed && hasMore ? recordIds[recordIds.length - 1] : null, listed && hasMore));
      };
      timer = setTimeout(() => finish("indeterminate", "operation_timeout"), TIMEOUT_MS);

      let openRequest;
      try {
        if (!globalThis.indexedDB?.open) return finish("indeterminate", "storage_unavailable");
        openRequest = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      } catch {
        return finish("indeterminate", "storage_open_failed");
      }
      openRequest.onblocked = () => finish("indeterminate", "storage_blocked");
      openRequest.onerror = () => finish("indeterminate", "storage_open_failed");
      openRequest.onupgradeneeded = () => {
        try { openRequest.transaction?.abort(); } catch {}
        try { openRequest.result?.close(); } catch {}
        finish("indeterminate", "storage_not_initialized");
      };
      openRequest.onsuccess = () => {
        const opened = openRequest.result;
        if (settled) {
          try { opened.close(); } catch {}
          return;
        }
        db = opened;
        db.onversionchange = () => finish("indeterminate", "storage_version_changed");
        if (!db.objectStoreNames.contains(STORE_NAME)) return finish("indeterminate", "storage_schema_invalid");
        let tx;
        try {
          tx = db.transaction(STORE_NAME, "readonly");
          activeTransaction = tx;
        } catch {
          return finish("indeterminate", "storage_transaction_failed");
        }
        tx.onerror = () => {};
        tx.onabort = () => finish("indeterminate", "storage_read_failed");
        tx.oncomplete = () => {
          if (settled) return;
          activeTransaction = null;
          if (!scanComplete) return finish("indeterminate", "storage_read_failed");
          finish("listed", "record_ids_listed");
        };
        let cursorRequest;
        try {
          const store = tx.objectStore(STORE_NAME);
          if (store.keyPath !== "recordId" || store.autoIncrement !== false) return finish("indeterminate", "storage_schema_invalid");
          const range = snapshot.afterRecordId === null ? undefined : globalThis.IDBKeyRange?.lowerBound(snapshot.afterRecordId, true);
          if (snapshot.afterRecordId !== null && !range) return finish("indeterminate", "storage_read_failed");
          cursorRequest = store.openKeyCursor(range, "next");
        } catch {
          return finish("indeterminate", "storage_read_failed");
        }
        cursorRequest.onerror = () => finish("indeterminate", "storage_read_failed");
        cursorRequest.onsuccess = () => {
          if (settled) return;
          const cursor = cursorRequest.result;
          if (!cursor) {
            scanComplete = true;
            return;
          }
          const recordId = validRecordId(cursor.key);
          if (!recordId) return finish("indeterminate", "storage_key_invalid");
          if (recordIds.length === snapshot.limit) {
            hasMore = true;
            scanComplete = true;
            return;
          }
          recordIds.push(recordId);
          try { cursor.continue(); } catch { finish("indeterminate", "storage_read_failed"); }
        };
      };
    });
  }

  function snapshotStoredLoadRecord(stored, recordId) {
    try {
      if (stored === null || typeof stored !== "object") return null;
      const prototype = Object.getPrototypeOf(stored);
      if (prototype !== null && Object.getPrototypeOf(prototype) !== null) return null;
      const requiredKeys = ["recordId", "createdAt", "exportType", "sourceBytes", "byteLength", "sha256"];
      const keys = Reflect.ownKeys(stored);
      if (keys.length !== requiredKeys.length || !keys.every((key) => typeof key === "string" && requiredKeys.includes(key))) return null;
      const fields = Object.fromEntries(requiredKeys.map((key) => [key, Object.getOwnPropertyDescriptor(stored, key)]));
      if (requiredKeys.some((key) => !fields[key] || !("value" in fields[key]))) return null;
      const sourceBytes = fields.sourceBytes.value;
      const digest = fields.sha256.value;
      if (fields.recordId.value !== recordId || !isValidCreatedAt(fields.createdAt.value, null) || fields.exportType.value !== EXPORT_TYPE
        || !Number.isInteger(fields.byteLength.value) || fields.byteLength.value < 0 || fields.byteLength.value > MAX_BYTES
        || !isArrayBuffer(sourceBytes) || sourceBytes.byteLength !== fields.byteLength.value || !isArrayBuffer(digest) || digest.byteLength !== 32) return null;
      return {
        recordId: fields.recordId.value,
        createdAt: fields.createdAt.value,
        exportType: fields.exportType.value,
        byteLength: fields.byteLength.value,
        sourceBytes: sourceBytes.slice(0),
        sha256: digest.slice(0)
      };
    } catch {
      return null;
    }
  }

  function loadPreOperationRecord(input) {
    const snapshot = snapshotLoadInput(input);
    if (snapshot.error) return Promise.resolve(loadResult("rejected", snapshot.error, snapshot.recordId, null));

    return new Promise((resolve) => {
      let settled = false;
      let db = null;
      let activeTransaction = null;
      let timer = null;
      const finish = (status, reason, record) => {
        if (settled) return;
        settled = true;
        if (timer !== null) clearTimeout(timer);
        if (activeTransaction) {
          try { activeTransaction.abort(); } catch {}
        }
        if (db) {
          try { db.close(); } catch {}
        }
        resolve(loadResult(status, reason, snapshot.recordId, record || null));
      };
      timer = setTimeout(() => finish("indeterminate", "operation_timeout", null), TIMEOUT_MS);

      let openRequest;
      try {
        if (!globalThis.indexedDB?.open) return finish("indeterminate", "storage_unavailable", null);
        openRequest = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      } catch {
        return finish("indeterminate", "storage_open_failed", null);
      }
      openRequest.onblocked = () => finish("indeterminate", "storage_blocked", null);
      openRequest.onerror = () => finish("indeterminate", "storage_open_failed", null);
      openRequest.onupgradeneeded = () => {
        try { openRequest.transaction?.abort(); } catch {}
        try { openRequest.result?.close(); } catch {}
        finish("indeterminate", "storage_not_initialized", null);
      };
      openRequest.onsuccess = () => {
        const opened = openRequest.result;
        if (settled) {
          try { opened.close(); } catch {}
          return;
        }
        db = opened;
        db.onversionchange = () => finish("indeterminate", "storage_version_changed", null);
        if (!db.objectStoreNames.contains(STORE_NAME)) return finish("indeterminate", "storage_schema_invalid", null);
        let stored = null;
        let tx;
        try {
          tx = db.transaction(STORE_NAME, "readonly");
          activeTransaction = tx;
        } catch {
          return finish("indeterminate", "storage_transaction_failed", null);
        }
        tx.onerror = () => {};
        tx.onabort = () => finish("indeterminate", "storage_read_failed", null);
        tx.oncomplete = () => {
          if (settled) return;
          activeTransaction = null;
          if (!stored) return finish("indeterminate", "record_not_recovered", null);
          recoverStoredRecord(stored);
        };
        let getRequest;
        try {
          const store = tx.objectStore(STORE_NAME);
          if (store.keyPath !== "recordId" || store.autoIncrement !== false) return finish("indeterminate", "storage_schema_invalid", null);
          getRequest = store.get(snapshot.recordId);
        } catch {
          return finish("indeterminate", "storage_read_failed", null);
        }
        getRequest.onerror = () => finish("indeterminate", "storage_read_failed", null);
        getRequest.onsuccess = () => { stored = snapshotStoredLoadRecord(getRequest.result, snapshot.recordId); };
      };

      async function recoverStoredRecord(stored) {
        let sessionJson;
        try {
          sessionJson = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(stored.sourceBytes);
          const reencoded = new TextEncoder().encode(sessionJson);
          if (settled || !bytesEqual(reencoded.buffer, stored.sourceBytes)) return finish("indeterminate", "record_invalid", null);
        } catch {
          return finish("indeterminate", "record_invalid", null);
        }
        const validated = validateSession(snapshot.recordId, sessionJson);
        if (settled || validated.error || !bytesEqual(validated.bytes.buffer, stored.sourceBytes)) return finish("indeterminate", "record_invalid", null);
        let digest;
        try {
          if (!globalThis.crypto?.subtle?.digest) return finish("indeterminate", "digest_failed", null);
          digest = await globalThis.crypto.subtle.digest("SHA-256", stored.sourceBytes);
        } catch {
          return finish("indeterminate", "digest_failed", null);
        }
        if (settled) return;
        if (!isArrayBuffer(digest) || digest.byteLength !== 32 || !bytesEqual(digest, stored.sha256)) return finish("indeterminate", "record_invalid", null);
        finish("loaded", "valid_record_recovered", { ...stored, sessionJson });
      }
    });
  }

  function journalOperation(mode, input) {
    const snapshot = snapshotInput(input);
    if (snapshot.error) return Promise.resolve(result("rejected", snapshot.error, snapshot.recordId));
    const validated = validateSession(snapshot.recordId, snapshot.sessionJson);
    if (validated.error) return Promise.resolve(result("rejected", validated.error, validated.recordId));

    return new Promise((resolve) => {
      let settled = false;
      let db = null;
      let activeTransaction = null;
      let timer = null;
      const finish = (status, reason) => {
        if (settled) return;
        settled = true;
        if (timer !== null) clearTimeout(timer);
        if (activeTransaction) {
          try { activeTransaction.abort(); } catch {}
        }
        if (db) {
          try { db.close(); } catch {}
        }
        resolve(result(status, reason, snapshot.recordId));
      };
      timer = setTimeout(() => finish("indeterminate", "operation_timeout"), TIMEOUT_MS);

      (async () => {
        let digest;
        try {
          if (!globalThis.crypto?.subtle?.digest) return finish("rejected", "digest_unavailable");
          digest = await globalThis.crypto.subtle.digest("SHA-256", validated.bytes);
        } catch {
          return finish("rejected", "digest_failed");
        }
        if (settled) return;
        if (!isArrayBuffer(digest) || digest.byteLength !== 32) return finish("rejected", "digest_failed");

        let openRequest;
        try {
          if (!globalThis.indexedDB?.open) return finish("indeterminate", "storage_unavailable");
          openRequest = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
        } catch {
          return finish("indeterminate", "storage_open_failed");
        }
        openRequest.onblocked = () => finish("indeterminate", "storage_blocked");
        openRequest.onerror = () => finish("indeterminate", "storage_open_failed");
        openRequest.onupgradeneeded = (event) => {
          if (settled) {
            try { openRequest.transaction?.abort(); } catch {}
            try { openRequest.result?.close(); } catch {}
            return;
          }
          if (mode !== "save" || event.oldVersion !== 0) {
            try { openRequest.transaction?.abort(); } catch {}
            try { openRequest.result?.close(); } catch {}
            return finish("indeterminate", mode === "verify" ? "storage_not_initialized" : "storage_schema_invalid");
          }
          try {
            if (openRequest.result.objectStoreNames.contains(STORE_NAME)) throw new Error("unexpected_store");
            openRequest.result.createObjectStore(STORE_NAME, { keyPath: "recordId" });
          } catch {
            try { openRequest.transaction?.abort(); } catch {}
            try { openRequest.result?.close(); } catch {}
            finish("indeterminate", "storage_open_failed");
          }
        };
        openRequest.onsuccess = () => {
          const opened = openRequest.result;
          if (settled) {
            try { opened.close(); } catch {}
            return;
          }
          db = opened;
          db.onversionchange = () => finish("indeterminate", "storage_version_changed");
          if (!db.objectStoreNames.contains(STORE_NAME)) return finish("indeterminate", "storage_schema_invalid");
          if (mode === "save") writeRecord(digest);
          else readRecord(digest, null);
        };

        function transaction(modeName, options) {
          try {
            activeTransaction = options === undefined ? db.transaction(STORE_NAME, modeName) : db.transaction(STORE_NAME, modeName, options);
            return activeTransaction;
          } catch {
            finish("indeterminate", "storage_transaction_failed");
            return null;
          }
        }

        function writeRecord(expectedDigest) {
          if (settled) return;
          const createdAt = new Date().toISOString();
          const tx = transaction("readwrite", { durability: "strict" });
          if (!tx) return;
          let addError = null;
          tx.onerror = () => {};
          tx.onabort = () => finish(addError?.name === "ConstraintError" ? "conflict" : "indeterminate", addError?.name === "ConstraintError" ? "record_conflict" : "storage_write_failed");
          tx.oncomplete = () => {
            if (settled) return;
            activeTransaction = null;
            readRecord(expectedDigest, createdAt);
          };
          let addRequest;
          try {
            const store = tx.objectStore(STORE_NAME);
            if (store.keyPath !== "recordId" || store.autoIncrement !== false) return finish("indeterminate", "storage_schema_invalid");
            addRequest = store.add({ recordId: snapshot.recordId, createdAt, exportType: EXPORT_TYPE, sourceBytes: validated.bytes.buffer.slice(0), byteLength: validated.bytes.byteLength, sha256: expectedDigest.slice(0) });
          } catch {
            return finish("indeterminate", "storage_write_failed");
          }
          addRequest.onerror = () => { addError = addRequest.error || null; };
        }

        function readRecord(expectedDigest, expectedCreatedAt) {
          if (settled) return;
          const tx = transaction("readonly");
          if (!tx) return;
          let stored = undefined;
          tx.onerror = () => {};
          tx.onabort = () => finish("indeterminate", "storage_read_failed");
          tx.oncomplete = () => {
            if (settled) return;
            activeTransaction = null;
            if (!stored) return finish("indeterminate", "record_not_confirmed");
            const matches = storedRecordMatches(stored, snapshot.recordId, validated.bytes.buffer, validated.bytes.byteLength, expectedDigest, expectedCreatedAt);
            finish(matches ? "confirmed" : "indeterminate", matches ? "record_confirmed" : "record_mismatch");
          };
          let getRequest;
          try {
            const store = tx.objectStore(STORE_NAME);
            if (store.keyPath !== "recordId" || store.autoIncrement !== false) return finish("indeterminate", "storage_schema_invalid");
            getRequest = store.get(snapshot.recordId);
          } catch {
            return finish("indeterminate", "storage_read_failed");
          }
          getRequest.onerror = () => finish("indeterminate", "storage_read_failed");
          getRequest.onsuccess = () => { stored = getRequest.result; };
        }
      })();
    });
  }

  function reservePreOperationRecord(input) {
    const snapshot = snapshotRemoveInput(input);
    if (snapshot.error) return Promise.resolve(reservationResult("rejected", snapshot.error, snapshot.recordId, null));
    const validated = validateSession(snapshot.recordId, snapshot.sessionJson);
    if (validated.error) return Promise.resolve(reservationResult("rejected", validated.error, validated.recordId, null));

    return new Promise((resolve) => {
      let settled = false;
      let db = null;
      let activeTransaction = null;
      let timer = null;
      let finishVerification = null;
      let lockRequestPromise = null;
      let leaseState = null;
      const cleanup = () => {
        if (activeTransaction) {
          try { activeTransaction.abort(); } catch {}
          activeTransaction = null;
        }
        if (db) {
          try { db.close(); } catch {}
          db = null;
        }
      };
      const finish = (status, reason) => {
        if (settled) return;
        settled = true;
        if (timer !== null) clearTimeout(timer);
        cleanup();
        finishVerification?.();
        resolve(reservationResult(status, reason, snapshot.recordId, null));
      };
      timer = setTimeout(() => finish("indeterminate", "operation_timeout"), TIMEOUT_MS);
      const publishLease = (releaseGateResolve) => {
        let held = true;
        let releasePromise = null;
        const deactivate = () => {
          held = false;
          if (!releasePromise) {
            releaseGateResolve();
            releasePromise = Promise.resolve().then(() => lockRequestPromise).then(() => undefined, () => undefined);
          }
          return releasePromise;
        };
        const lease = Object.freeze({
          recordId: snapshot.recordId,
          isHeld: () => held,
          release: deactivate
        });
        leaseState = { deactivate };
        settled = true;
        if (timer !== null) clearTimeout(timer);
        resolve(reservationResult("reserved", "record_reserved", snapshot.recordId, lease));
      };
      const readMatchingRecord = () => new Promise((complete) => {
        let completed = false;
        const finishRead = (outcome) => {
          if (completed) return;
          completed = true;
          finishVerification = null;
          if (db) {
            try { db.close(); } catch {}
            db = null;
          }
          complete(outcome);
        };
        finishVerification = () => finishRead({ cancelled: true });
        let openRequest;
        try {
          if (!globalThis.indexedDB?.open) return finishRead({ error: "storage_unavailable" });
          openRequest = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
        } catch {
          return finishRead({ error: "storage_open_failed" });
        }
        openRequest.onblocked = () => finishRead({ error: "storage_blocked" });
        openRequest.onerror = () => finishRead({ error: "storage_open_failed" });
        openRequest.onupgradeneeded = () => {
          try { openRequest.transaction?.abort(); } catch {}
          try { openRequest.result?.close(); } catch {}
          finishRead({ error: "storage_not_initialized" });
        };
        openRequest.onsuccess = () => {
          const opened = openRequest.result;
          if (settled || completed) {
            try { opened.close(); } catch {}
            return;
          }
          db = opened;
          db.onversionchange = () => finishRead({ error: "storage_version_changed" });
          if (!db.objectStoreNames.contains(STORE_NAME)) return finishRead({ error: "storage_schema_invalid" });
          let stored;
          let tx;
          try {
            tx = db.transaction(STORE_NAME, "readonly");
            activeTransaction = tx;
          } catch {
            return finishRead({ error: "storage_transaction_failed" });
          }
          tx.onerror = () => {};
          tx.onabort = () => finishRead({ error: "storage_read_failed" });
          tx.oncomplete = () => {
            activeTransaction = null;
            finishRead({ stored });
          };
          let getRequest;
          try {
            const store = tx.objectStore(STORE_NAME);
            if (store.keyPath !== "recordId" || store.autoIncrement !== false) return finishRead({ error: "storage_schema_invalid" });
            getRequest = store.get(snapshot.recordId);
          } catch {
            return finishRead({ error: "storage_read_failed" });
          }
          getRequest.onerror = () => finishRead({ error: "storage_read_failed" });
          getRequest.onsuccess = () => { stored = getRequest.result; };
        };
      });

      (async () => {
        let digest;
        try {
          if (!globalThis.crypto?.subtle?.digest) return finish("rejected", "digest_unavailable");
          digest = await globalThis.crypto.subtle.digest("SHA-256", validated.bytes);
        } catch {
          return finish("rejected", "digest_failed");
        }
        if (settled) return;
        if (!isArrayBuffer(digest) || digest.byteLength !== 32) return finish("rejected", "digest_failed");
        const request = webLocksRequest();
        if (!request) return finish("unavailable", "web_locks_unavailable");
        clearTimeout(timer);
        timer = setTimeout(() => finish("indeterminate", "lock_acquire_timeout"), LOCK_ACQUIRE_TIMEOUT_MS);
        try {
          lockRequestPromise = request(recordLockName(snapshot.recordId), { mode: "exclusive", ifAvailable: true }, async (lock) => {
            if (settled) return;
            if (!lock) return finish("busy", "record_busy");
            const read = await readMatchingRecord();
            if (settled || read.cancelled) return;
            if (read.error) return finish("indeterminate", read.error);
            if (read.stored === undefined) return finish("conflict", "record_not_found");
            if (!storedRecordMatches(read.stored, snapshot.recordId, validated.bytes.buffer, validated.bytes.byteLength, digest, snapshot.createdAt)) {
              return finish("conflict", "record_mismatch");
            }
            let releaseGateResolve;
            const releaseGate = new Promise((release) => { releaseGateResolve = release; });
            publishLease(releaseGateResolve);
            await releaseGate;
          });
          Promise.resolve(lockRequestPromise).then(
            () => { leaseState?.deactivate(); },
            () => {
              if (leaseState) leaseState.deactivate();
              else if (!settled) finish("indeterminate", "lock_request_failed");
            }
          );
        } catch {
          finish("indeterminate", "lock_request_failed");
        }
      })();
    });
  }

  function removePreOperationRecord(input) {
    const snapshot = snapshotRemoveInput(input);
    if (snapshot.error) return Promise.resolve(result("rejected", snapshot.error, snapshot.recordId));
    const validated = validateSession(snapshot.recordId, snapshot.sessionJson);
    if (validated.error) return Promise.resolve(result("rejected", validated.error, validated.recordId));

    return new Promise((resolve) => {
      let storageSettled = false;
      let publicSettled = false;
      let db = null;
      let activeTransaction = null;
      let timer = null;
      let callbackCompletion = null;
      let lockRequestPromise = null;
      let deadlinePhase = "operation";
      const resolvePublic = (status, reason) => {
        if (publicSettled) return;
        publicSettled = true;
        if (timer !== null) clearTimeout(timer);
        resolve(result(status, reason, snapshot.recordId));
      };
      const finish = (status, reason) => {
        if (storageSettled) return;
        storageSettled = true;
        if (activeTransaction) {
          try { activeTransaction.abort(); } catch {}
        }
        if (db) {
          try { db.close(); } catch {}
        }
        const publicResult = () => resolvePublic(status, reason);
        if (callbackCompletion) {
          const complete = callbackCompletion;
          callbackCompletion = null;
          complete();
          return Promise.resolve().then(() => lockRequestPromise).then(publicResult, publicResult);
        }
        publicResult();
      };
      timer = setTimeout(() => {
        if (publicSettled) return;
        const timeoutReason = deadlinePhase === "lock" ? "lock_acquire_timeout" : "operation_timeout";
        if (!storageSettled) finish("indeterminate", timeoutReason);
        if (!publicSettled) resolvePublic("indeterminate", timeoutReason);
      }, TIMEOUT_MS);

      function startStorage(digest) {
        let openRequest;
        try {
          if (!globalThis.indexedDB?.open) return finish("indeterminate", "storage_unavailable");
          openRequest = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
        } catch {
          return finish("indeterminate", "storage_open_failed");
        }
        openRequest.onblocked = () => finish("indeterminate", "storage_blocked");
        openRequest.onerror = () => finish("indeterminate", "storage_open_failed");
        openRequest.onupgradeneeded = () => {
          try { openRequest.transaction?.abort(); } catch {}
          try { openRequest.result?.close(); } catch {}
          finish("indeterminate", "storage_not_initialized");
        };
        openRequest.onsuccess = () => {
          const opened = openRequest.result;
          if (storageSettled) {
            try { opened.close(); } catch {}
            return;
          }
          db = opened;
          db.onversionchange = () => finish("indeterminate", "storage_version_changed");
          if (!db.objectStoreNames.contains(STORE_NAME)) return finish("indeterminate", "storage_schema_invalid");
          compareAndDelete(digest);
        };

        function startTransaction(mode, options) {
          try {
            activeTransaction = options === undefined ? db.transaction(STORE_NAME, mode) : db.transaction(STORE_NAME, mode, options);
            return activeTransaction;
          } catch {
            finish("indeterminate", "storage_transaction_failed");
            return null;
          }
        }

        function compareAndDelete(expectedDigest) {
          const tx = startTransaction("readwrite", { durability: "strict" });
          if (!tx) return;
          let deleteIssued = false;
          tx.onerror = () => {};
          tx.onabort = () => finish("indeterminate", deleteIssued ? "storage_delete_failed" : "storage_read_failed");
          tx.oncomplete = () => {
            if (storageSettled) return;
            activeTransaction = null;
            if (!deleteIssued) return finish("indeterminate", "storage_delete_failed");
            confirmAbsence();
          };
          let getRequest;
          let store;
          try {
            store = tx.objectStore(STORE_NAME);
            if (store.keyPath !== "recordId" || store.autoIncrement !== false) return finish("indeterminate", "storage_schema_invalid");
            getRequest = store.get(snapshot.recordId);
          } catch {
            return finish("indeterminate", "storage_read_failed");
          }
          getRequest.onerror = () => finish("indeterminate", "storage_read_failed");
          getRequest.onsuccess = () => {
            if (storageSettled) return;
            if (getRequest.result === undefined) return finish("conflict", "record_not_found");
            if (!storedRecordMatches(getRequest.result, snapshot.recordId, validated.bytes.buffer, validated.bytes.byteLength, expectedDigest, snapshot.createdAt)) {
              return finish("conflict", "record_mismatch");
            }
            try {
              deleteIssued = true;
              const deleteRequest = store.delete(snapshot.recordId);
              deleteRequest.onerror = () => finish("indeterminate", "storage_delete_failed");
            } catch {
              finish("indeterminate", "storage_delete_failed");
            }
          };
        }

        function confirmAbsence() {
          const tx = startTransaction("readonly");
          if (!tx) return;
          let checked = false;
          let absent = false;
          tx.onerror = () => {};
          tx.onabort = () => finish("indeterminate", "storage_read_failed");
          tx.oncomplete = () => {
            if (storageSettled) return;
            activeTransaction = null;
            if (!checked) return finish("indeterminate", "storage_read_failed");
            finish(absent ? "confirmed" : "indeterminate", absent ? "record_removed" : "record_still_present");
          };
          let getRequest;
          try {
            const store = tx.objectStore(STORE_NAME);
            if (store.keyPath !== "recordId" || store.autoIncrement !== false) return finish("indeterminate", "storage_schema_invalid");
            getRequest = store.get(snapshot.recordId);
          } catch {
            return finish("indeterminate", "storage_read_failed");
          }
          getRequest.onerror = () => finish("indeterminate", "storage_read_failed");
          getRequest.onsuccess = () => {
            checked = true;
            absent = getRequest.result === undefined;
          };
        }
      }

      (async () => {
        let digest;
        try {
          if (!globalThis.crypto?.subtle?.digest) return finish("rejected", "digest_unavailable");
          digest = await globalThis.crypto.subtle.digest("SHA-256", validated.bytes);
        } catch {
          return finish("rejected", "digest_failed");
        }
        if (storageSettled) return;
        if (!isArrayBuffer(digest) || digest.byteLength !== 32) return finish("rejected", "digest_failed");
        const request = webLocksRequest();
        if (!request) return finish("unavailable", "web_locks_unavailable");
        deadlinePhase = "lock";
        try {
          lockRequestPromise = request(recordLockName(snapshot.recordId), { mode: "exclusive", ifAvailable: true }, (lock) => {
            if (storageSettled) return;
            if (!lock) return finish("busy", "record_busy");
            deadlinePhase = "operation";
            return new Promise((complete) => {
              callbackCompletion = complete;
              startStorage(digest);
            });
          });
          Promise.resolve(lockRequestPromise).catch(() => {
            if (!storageSettled) finish("indeterminate", "lock_request_failed");
          });
        } catch {
          finish("indeterminate", "lock_request_failed");
        }
      })();
    });
  }

  const savePreOperation = Object.freeze(async function savePreOperation(input) { return journalOperation("save", input); });
  const verifyPreOperation = Object.freeze(async function verifyPreOperation(input) { return journalOperation("verify", input); });
  const loadPreOperation = Object.freeze(async function loadPreOperation(input) { return loadPreOperationRecord(input); });
  const listPreOperationIdsApi = Object.freeze(async function listPreOperationIdsApi(input) { return listPreOperationIds(input); });
  const removePreOperation = Object.freeze(async function removePreOperation(input) { return removePreOperationRecord(input); });
  const reservePreOperation = Object.freeze(async function reservePreOperation(input) { return reservePreOperationRecord(input); });
  window.ObdOperationJournal = Object.freeze({ savePreOperation, verifyPreOperation, loadPreOperation, listPreOperationIds: listPreOperationIdsApi, removePreOperation, reservePreOperation });
})();
