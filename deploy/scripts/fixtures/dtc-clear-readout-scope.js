// Test-only model. Caller-supplied scope is never evidence about a real vehicle.
const profile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
const intents = ["read_stored_dtc", "read_pending_dtc", "read_permanent_dtc", "read_readiness"];
const scopeHandles = new WeakSet();

export function inspectDtcClearReadoutFixtureScope(handle, context) {
  if (!scopeHandles.has(handle)) throw new TypeError("unrecognized_fixture_scope_handle");
  return handle.inspect(context);
}

function record(value, keys) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError("invalid_fixture_scope_record");
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) throw new TypeError("invalid_fixture_scope_keys");
  return Object.fromEntries(keys.map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) throw new TypeError("invalid_fixture_scope_accessor");
    return [key, descriptor.value];
  }));
}

function dense(value, maximum) {
  if (!Array.isArray(value)) throw new TypeError("invalid_fixture_scope_array");
  const length = Object.getOwnPropertyDescriptor(value, "length").value;
  if (length > maximum) throw new RangeError("fixture_scope_array_limit");
  const keys = Reflect.ownKeys(value);
  if (keys.length !== length + 1 || keys[length] !== "length") throw new TypeError("invalid_fixture_scope_array");
  const result = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (keys[index] !== String(index) || !descriptor || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError("invalid_fixture_scope_array");
    }
    result.push(descriptor.value);
  }
  return result;
}

export function createDtcClearReadoutFixtureScope(input) {
  const scope = record(input, ["provenance", "profile", "connectionToken", "targetToken", "byIntent"]);
  if (scope.provenance !== "simulated" || scope.profile !== profile) throw new TypeError("invalid_fixture_scope_profile");
  for (const token of [scope.connectionToken, scope.targetToken]) {
    if (token === null || typeof token !== "object") throw new TypeError("invalid_fixture_scope_token");
  }
  const rows = dense(scope.byIntent, 4);
  if (rows.length !== 4) throw new TypeError("invalid_fixture_scope_intents");
  const byIntent = Object.freeze(rows.map((value, index) => {
    const row = record(value, ["intent", "sourceIds"]);
    if (row.intent !== intents[index]) throw new TypeError("invalid_fixture_scope_intent_order");
    const sourceIds = dense(row.sourceIds, 32);
    if (sourceIds.length === 0 || sourceIds.some((id) => typeof id !== "string" || !/^[0-7][0-9A-F]{2}$/.test(id))
      || new Set(sourceIds).size !== sourceIds.length) throw new TypeError("invalid_fixture_scope_sources");
    return Object.freeze({ intent: row.intent, sourceIds: Object.freeze([...sourceIds].sort()) });
  }));
  const scopeToken = Object.freeze({});
  let active = true;
  const snapshot = () => Object.freeze({
    provenance: "simulated_only", state: active ? "active" : "invalidated", profile,
    byIntent: active ? byIntent : Object.freeze([]),
    realTransportProofAvailable: false, sameVehicleVerified: false,
    readoutCoverageComplete: false, comparisonAvailable: false, clearSucceededInferred: false,
    executionEnabled: false, vehicleCommandEnabled: false, wouldTransmit: false, canExecute: false
  });
  const rejection = (context) => {
    const supplied = record(context, ["scopeToken", "connectionToken", "targetToken"]);
    if (supplied.scopeToken !== scopeToken) return "scope_reference_mismatch";
    if (supplied.connectionToken !== scope.connectionToken) return "connection_reference_mismatch";
    if (supplied.targetToken !== scope.targetToken) return "target_reference_mismatch";
    if (!active) return "scope_invalidated";
    return null;
  };
  const result = (reason) => Object.freeze({ ok: reason === null, reason, snapshot: reason === null ? snapshot() : null });
  const handle = Object.freeze({
    scopeToken,
    inspect(context) { return result(rejection(context)); },
    invalidate(context) {
      const reason = rejection(context);
      if (reason !== null) return result(reason);
      active = false;
      return result(null);
    }
  });
  scopeHandles.add(handle);
  return handle;
}
