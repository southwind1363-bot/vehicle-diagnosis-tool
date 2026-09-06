import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const start = source.indexOf("function createObdDtcClearTargetBindingController() {");
const end = source.indexOf("\n\nconst obdDtcClearTargetBindingController =", start);
if (start < 0 || end < 0) throw new Error("DTC clear target binding controller source was not found");
const controllerSource = source.slice(start, end);
const failures = [];
let checks = 0;
const check = (condition, message) => {
  checks += 1;
  if (!condition) failures.push(message);
};

function makeContext() {
  const context = {
    Number,
    Object,
    Array,
    Set,
    Reflect,
    RegExp,
    String,
    Math,
    obdBridgeOperation: null,
    obdSerialConnectPending: false,
    obdSerialDisconnectOperation: null,
    obdScannerImportOperation: null,
    obdSerialRevision: 7,
    obdSerialResultOwner: null,
    obdDevSession: {
      port: null,
      reader: null,
      writer: null,
      readLoopActive: false,
      readInProgress: false,
      initializing: false,
      coreScanInProgress: false,
      pendingCommandOperation: null,
      pendingWriteOperation: null,
      connectionState: "disconnected",
      bridgeEndpoint: null,
      lastSession: null
    },
    association: null,
    getObdOperationJournalComparisonAssociation() { return context.association; }
  };
  vm.createContext(context);
  vm.runInContext(`${controllerSource}\nthis.createTargetBindingController = createObdDtcClearTargetBindingController;`, context);
  return context;
}

function makeSession(sourceName = "web_serial", dtcSnapshot = { dtcReadoutStatus: "reported", ecuResponses: [] }) {
  return { source: sourceName, dtcSnapshot };
}

function installAssociation(context, session = makeSession()) {
  const record = Object.freeze({ recordId: "record-current" });
  context.association = Object.freeze({ record, sessionRef: session });
  context.obdDevSession.lastSession = session;
  return session;
}

function installLiveSerial(context, session) {
  const port = { fixtureMarker: "synthetic-port" };
  context.obdDevSession.port = port;
  context.obdDevSession.reader = { fixtureMarker: "synthetic-reader" };
  context.obdDevSession.writer = { fixtureMarker: "synthetic-writer" };
  context.obdDevSession.readLoopActive = true;
  context.obdDevSession.connectionState = "ready";
  context.obdSerialResultOwner = { revision: context.obdSerialRevision, expectedLastSession: session };
  return port;
}

function inputFor(context, association = context.association, session = context.obdDevSession.lastSession, port = context.obdDevSession.port, revision = context.obdSerialRevision) {
  return { expectedAssociation: association, expectedSessionRef: session, expectedPortRef: port, expectedSerialRevision: revision };
}

function allFlagsFalse(snapshot) {
  return snapshot.target === null
    && snapshot.workflowTargetApplied === false
    && snapshot.executionEnabled === false
    && snapshot.vehicleCommandEnabled === false
    && snapshot.wouldTransmit === false
    && snapshot.canExecute === false;
}

function recursivelyFrozen(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return true;
  seen.add(value);
  return Object.isFrozen(value) && Object.values(value).every((item) => recursivelyFrozen(item, seen));
}

{
  const context = makeContext();
  const controller = context.createTargetBindingController();
  const initial = controller.getSnapshot();
  check(initial.state === "blocked" && initial.preOperationSessionId === null && allFlagsFalse(initial) && recursivelyFrozen(initial), "Initial target-binding snapshot must be frozen and nontransmitting");
  check(!source.includes("ObdReadOnly.createObdDtcClearTargetBindingController") && !source.includes("createObdDtcClearTargetBindingController,"), "Target-binding controller must remain internal");
}

{
  const context = makeContext();
  const session = installAssociation(context, makeSession("interface_preview"));
  const controller = context.createTargetBindingController();
  const snapshot = controller.capture(inputFor(context));
  check(snapshot.state === "blocked" && snapshot.preOperationSessionId === "record-current" && snapshot.transport.status === "not_bound", "A compare fixture without a live port must retain record coherence but stay blocked");
  check(snapshot.vehicleIdentity.status === "not_observed" && snapshot.ecuScope.status === "not_observed" && snapshot.blockers.includes("sample_replay_or_import_ineligible") && allFlagsFalse(snapshot), "Non-live fixture data must not create vehicle, ECU, or target evidence");
  const retained = controller.getSnapshot();
  check(retained === snapshot && retained.state === "blocked" && retained.preOperationSessionId === "record-current", "An unchanged partial comparison must remain blocked and retain record coherence on getSnapshot");
  context.getObdOperationJournalComparisonAssociation = () => null;
  check(controller.getSnapshot().state === "invalidated", "A partial comparison must invalidate when the association accessor no longer confirms it");
  const beforeRelease = snapshot.revision;
  context.association = null;
  const released = controller.invalidate("journal_association_not_current");
  check(released.state === "invalidated" && released.preOperationSessionId === null && released.revision > beforeRelease && allFlagsFalse(released), "Releasing comparison must invalidate the retained target-binding snapshot");
  void session;
}

for (const sourceName of ["sample", "replay", "import"]) {
  const context = makeContext();
  const session = installAssociation(context, makeSession(sourceName));
  installLiveSerial(context, session);
  const snapshot = context.createTargetBindingController().capture(inputFor(context));
  check(snapshot.state === "blocked" && snapshot.blockers.includes("sample_replay_or_import_ineligible") && allFlagsFalse(snapshot), "Sample, replay, and import sources must have a distinct ineligibility blocker");
}

{
  const context = makeContext();
  const session = installAssociation(context, makeSession("web_serial", {
    dtcReadoutStatus: "reported",
    ecuResponses: [{ ecu: "7E8", status: "reported", responseServices: ["43"], networkScopeEvidenceEligible: true, networkBus: "CAN" }]
  }));
  const port = installLiveSerial(context, session);
  const controller = context.createTargetBindingController();
  const snapshot = controller.capture(inputFor(context));
  check(snapshot.state === "blocked" && snapshot.transport.status === "current_web_serial_connection" && snapshot.transport.persistentHardwareIdentityVerified === false, "Only the exact current synthetic Web Serial connection may be described as current");
  check(snapshot.ecuScope.status === "not_observed" && snapshot.ecuScope.responderKeys.length === 0 && snapshot.blockers.includes("ecu_clear_scope_not_verified"), "Normalized DTC rows and scope aliases must not be promoted to ECU clear scope evidence");
  check(allFlagsFalse(snapshot) && recursivelyFrozen(snapshot), "Live partial coherence must still be frozen and nontransmitting");
  context.obdDevSession.port = { fixtureMarker: "replacement" };
  check(controller.getSnapshot().state === "invalidated", "Port replacement must invalidate a retained live snapshot");
  void port;
}

{
  const context = makeContext();
  const session = installAssociation(context);
  installLiveSerial(context, session);
  const controller = context.createTargetBindingController();
  let associationReads = 0;
  context.getObdOperationJournalComparisonAssociation = () => {
    associationReads += 1;
    if (associationReads === 2) context.obdDevSession.reader = { fixtureMarker: "late-reader" };
    return context.association;
  };
  const snapshot = controller.capture(inputFor(context));
  check(snapshot.state === "invalidated" && allFlagsFalse(snapshot), "A reader replacement during the final association check must invalidate instead of publishing newer references");
}

{
  const context = makeContext();
  const session = installAssociation(context, makeSession("web_serial", {
    dtcReadoutStatus: "reported",
    dtcs: [{ code: "P0300", source_ecu: "7E8", source: "web_serial", protocol: "ELM327" }]
  }));
  installLiveSerial(context, session);
  const snapshot = context.createTargetBindingController().capture(inputFor(context));
  check(snapshot.ecuScope.status === "not_observed" && snapshot.ecuScope.responderKeys.length === 0, "Header-like normalized DTC rows must not be treated as verified responder provenance");
}

for (const makeBadInput of [
  (context) => ({ expectedAssociation: context.association, expectedSessionRef: context.obdDevSession.lastSession, expectedPortRef: context.obdDevSession.port }),
  (context) => ({ ...inputFor(context), extra: true }),
  (context) => Object.create(inputFor(context)),
  (context) => Object.defineProperty({ ...inputFor(context) }, "expectedPortRef", { enumerable: true, get() { return context.obdDevSession.port; } }),
  (context) => JSON.parse(JSON.stringify(inputFor(context)))
]) {
  const context = makeContext();
  const session = installAssociation(context);
  installLiveSerial(context, session);
  const controller = context.createTargetBindingController();
  const snapshot = controller.capture(makeBadInput(context));
  check(snapshot.state !== "bound" && snapshot.state !== "verified" && allFlagsFalse(snapshot), "Malformed, inherited, getter, extra, or copied capture input must fail closed");
}

{
  const context = makeContext();
  const session = installAssociation(context);
  installLiveSerial(context, session);
  const snapshot = context.createTargetBindingController().capture(inputFor(context, context.association, session, context.obdDevSession.port, context.obdSerialRevision - 1));
  check(snapshot.state === "invalidated" && allFlagsFalse(snapshot), "A stale serial revision input must be rejected without producing a target");
}

for (const mutate of [
  (context) => { context.obdSerialResultOwner = { revision: context.obdSerialRevision, expectedLastSession: context.obdDevSession.lastSession }; },
  (context) => { context.obdDevSession.reader = {}; },
  (context) => { context.obdDevSession.writer = {}; },
  (context) => { context.obdDevSession.readLoopActive = false; },
  (context) => { context.obdDevSession.connectionState = "reading"; },
  (context) => { context.obdDevSession.bridgeEndpoint = "fixture-bridge"; },
  (context) => { context.obdSerialRevision += 1; },
  (context) => { context.obdDevSession.lastSession.source_type = "replay"; },
  (context) => { context.obdDevSession.lastSession = makeSession("web_serial"); },
  (context) => { context.association = Object.freeze({ record: Object.freeze({ recordId: "replacement" }), sessionRef: context.obdDevSession.lastSession }); }
]) {
  const context = makeContext();
  const session = installAssociation(context);
  installLiveSerial(context, session);
  const controller = context.createTargetBindingController();
  controller.capture(inputFor(context));
  mutate(context);
  check(controller.getSnapshot().state === "invalidated", "Reader, writer, owner, session, association, connection, bridge, or revision replacement must invalidate");
}

{
  const context = makeContext();
  const session = installAssociation(context);
  installLiveSerial(context, session);
  context.obdScannerImportOperation = { fixtureMarker: "busy" };
  const snapshot = context.createTargetBindingController().capture(inputFor(context));
  check(snapshot.state === "blocked" && snapshot.transport.status === "not_bound" && snapshot.blockers.includes("transport_connection_not_current") && snapshot.blockers.includes("operation_busy"), "Import/busy state must report operation_busy and block transport coherence");
}

{
  const context = makeContext();
  const session = installAssociation(context, makeSession("web_serial", { dtcReadoutStatus: "unparsed" }));
  installLiveSerial(context, session);
  const snapshot = context.createTargetBindingController().capture(inputFor(context));
  check(snapshot.ecuScope.status === "not_observed" && snapshot.ecuScope.evidenceSource === null && snapshot.ecuScope.responderKeys.length === 0 && !snapshot.blockers.some((blocker) => blocker.startsWith("dtc_responder_scope_")) && allFlagsFalse(snapshot), "Unparsed DTC input must not claim ECU scope evidence or scope-specific blockers");
}

{
  const context = makeContext();
  const session = installAssociation(context);
  installLiveSerial(context, session);
  const controller = context.createTargetBindingController();
  context.getObdOperationJournalComparisonAssociation = () => {
    controller.capture(inputFor(context));
    return context.association;
  };
  const snapshot = controller.capture(inputFor(context));
  check(snapshot.state === "invalidated" && allFlagsFalse(snapshot), "Synchronous accessor reentrancy must invalidate rather than recurse or bind");
}

{
  const context = makeContext();
  const session = installAssociation(context);
  installLiveSerial(context, session);
  const controller = context.createTargetBindingController();
  let firstAccess = true;
  context.getObdOperationJournalComparisonAssociation = () => {
    if (firstAccess) {
      firstAccess = false;
      controller.capture(inputFor(context));
    }
    return context.association;
  };
  const snapshot = controller.capture(inputFor(context));
  check(snapshot.state === "invalidated" && allFlagsFalse(snapshot), "One-shot synchronous reentrancy before later capture reads must not be overwritten by a new blocked snapshot");
}

{
  const context = makeContext();
  const session = installAssociation(context);
  const controller = context.createTargetBindingController();
  controller.capture(inputFor(context));
  context.getObdOperationJournalComparisonAssociation = () => { throw new Error("fixture accessor failure"); };
  check(controller.getSnapshot().state === "invalidated", "Association accessor failures during getSnapshot must fail closed");
  context.getObdOperationJournalComparisonAssociation = () => context.association;
  check(controller.getSnapshot().state === "invalidated", "getSnapshot revalidation guard must clear after an accessor failure");
  void session;
}

{
  const context = makeContext();
  const session = installAssociation(context);
  installLiveSerial(context, session);
  const controller = context.createTargetBindingController();
  const beforeLock = controller.capture(inputFor(context));
  const locked = controller.invalidate("access_locked");
  check(locked.state === "invalidated" && locked.revision > beforeLock.revision && allFlagsFalse(locked), "Lock-style invalidation must reject retained partial coherence");
}

if (failures.length) throw new Error(`DTC clear target-binding validation failed (${failures.length}/${checks}):\n${failures.join("\n")}`);
console.log(`DTC clear target-binding validation passed (${checks} checks).`);
