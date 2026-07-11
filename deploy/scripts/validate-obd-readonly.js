import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const monitorDefinitions = JSON.parse(
  fs.readFileSync(new URL("../data/obd-monitor-definitions.json", import.meta.url), "utf8")
);
const freezeFrameItems = JSON.parse(
  fs.readFileSync(new URL("../data/obd-freeze-frame-items-2026.json", import.meta.url), "utf8")
);
const readinessMonitors = JSON.parse(
  fs.readFileSync(new URL("../data/obd-readiness-monitors-2026.json", import.meta.url), "utf8")
);
const ecuInfoItems = JSON.parse(
  fs.readFileSync(new URL("../data/obd-ecu-info-items-2026.json", import.meta.url), "utf8")
);
const vehicleInterfaceCatalog = JSON.parse(
  fs.readFileSync(new URL("../data/vehicle-interface-catalog-2026.json", import.meta.url), "utf8")
);
const diagnosticCoverageRoadmap = JSON.parse(
  fs.readFileSync(new URL("../data/diagnostic-coverage-roadmap-2026.json", import.meta.url), "utf8")
);
const diagnosticCapabilityStatus = JSON.parse(
  fs.readFileSync(new URL("../data/diagnostic-capability-status-2026.json", import.meta.url), "utf8")
);
const diagnosticWorkflowsPractical = JSON.parse(
  fs.readFileSync(new URL("../data/diagnostic-workflows-practical-2026.json", import.meta.url), "utf8")
);
const context = {
  window: { isSecureContext: true },
  navigator: { serial: {} }
};

vm.createContext(context);
vm.runInContext(source, context);

const obd = context.window.ObdReadOnly;
const failures = [];
const resolveNextReadoutCandidatesFunctionSource = source.match(/function resolveNextReadoutCandidates[\s\S]*?buildNextReadoutCandidates\(readoutCoverage, vehicleApplicability \|\| \{\}, ecuInfoSnapshot, dtcSnapshot, supportedPidMatrix\)\r?\n    \);\r?\n  \}/);
const normalizeNextReadoutCandidatesFunctionSource = source.match(/function normalizeNextReadoutCandidates[\s\S]*?return String\(left\?\.label \|\| left\?\.id \|\| \"\"\)\.localeCompare\(String\(right\?\.label \|\| right\?\.id \|\| \"\"\), \"ja\"\);\r?\n      \}\);\r?\n  \}/);
const nextReadoutCandidatesFunctionSource = source.match(/function buildNextReadoutCandidates[\s\S]*?\.slice\(0, 5\);\r?\n  \}/);
const coreSessionStatusFunctionSource = source.match(/function buildCoreSessionStatus[\s\S]*?readyForAnalysis\r?\n    \};\r?\n  \}/);
const resolvedSessionMetadataFunctionSource = source.match(/function buildResolvedSessionMetadata[\s\S]*?sourceLength: Number\.isFinite\(Number\(metadataOverrides\.sourceLength\)\)\r?\n[\s\S]*?\r?\n  \}/);
const diagnosticSessionInputFunctionSource = source.match(/function getDiagnosticSessionInput[\s\S]*?source: base\.source \|\| nested\.source \|\| \"diagnostic_core\",\r?\n[\s\S]*?\r?\n  \}/);
const nestedSessionMetadataMergeFunctionSource = source.match(/function mergeNestedSessionMetadata[\s\S]*?had_sensitive_identifier:[\s\S]*?\r?\n  \}/);
const sessionMetadataOverridesFunctionSource = source.match(/function getSessionMetadataOverrides[\s\S]*?hadSensitiveIdentifier\r?\n    \};\r?\n  \}/);
const bridgeDiagnosticImportFunctionSource = source.match(/function buildBridgeDiagnosticImport[\s\S]*?const exportPayload = buildBridgeSessionExportPayload\(summary\);\r?\n[\s\S]*?\r?\n  \}/);
const bridgeSessionExportPayloadFunctionSource = source.match(/function buildBridgeSessionExportPayload[\s\S]*?readout_coverage: normalizeReadoutCoverageSnapshot\(summary\.readoutCoverage \|\| buildReadoutCoverageSnapshot\(\)\),\r?\n[\s\S]*?\r?\n  \}/);
const summaryMetadataFieldsFunctionSource = source.match(/function buildSummaryMetadataFields[\s\S]*?const sourceLengthValue = pickDefined\(summary\.sourceLength, summary\.source_length, 0\);\r?\n[\s\S]*?\r?\n  \}/);
const mergedBridgeMetadataFunctionSource = source.match(/function buildMergedBridgeMetadata[\s\S]*?warnings: resolveWarningList\(bridgeImportMetadata\.warnings, bridgeSessionMetadata\.warnings\),\r?\n[\s\S]*?\r?\n  \}/);
const bridgeSummaryInputFunctionSource = source.match(/function getBridgeSummaryInput[\s\S]*?endedAt: parts\.endedAt \|\| parts\.ended_at \|\| nested\.endedAt \|\| nested\.ended_at \|\| null,\r?\n[\s\S]*?\r?\n  \}/);
const bridgeSummaryAliasFunctionSource = source.match(/function normalizeBridgeSummaryAliases[\s\S]*?\r?\n  \}/);
const detectBridgeInfrastructureFunctionSource = source.match(/function detectBridgeInfrastructureContext[\s\S]*?Boolean\(nestedSession\);\r?\n  \}/);
const bridgeBlockedResponseFunctionSource = source.match(/function createLocalBridgeBlockedResponse[\s\S]*?data: schema \? cloneBridgeValue\(schema\.safeDefault\) : null\r?\n    \};\r?\n  \}/);
const bridgeRequestEvaluationFunctionSource = source.match(/function evaluateLocalBridgeRequest[\s\S]*?localBridgeContract\.connectionEnabled[\s\S]*?\r?\n    \};\r?\n  \}/);
const preparedVehicleRequestFunctionSource = source.match(/function requestPreparedVehicleRequest[\s\S]*?blockedByMode\r?\n    \};\r?\n  \}/);
const outboundSafetyFunctionSource = source.match(/function evaluateOutboundSafety[\s\S]*?reason: isStateChanging[\s\S]*?\r?\n    \};\r?\n  \}/);
const vehicleOperationRequestFunctionSource = source.match(/function requestVehicleOperation[\s\S]*?requiredBeforeEnable: operation \? \[\.\.\.operation\.requiredBeforeEnable\] : \[\]\r?\n    \};\r?\n  \}/);
const bridgeResponseSafetyFunctionSource = source.match(/function readBridgeResponseSafety[\s\S]*?wouldTransmit: response\.would_transmit === true \|\| response\.wouldTransmit === true\r?\n    \};\r?\n  \}/);
const bridgeProtocolFunctionSource = source.match(/function readBridgeProtocol[\s\S]*?return data\.protocol \|\| data\.protocol_name \|\| data\.protocolName \|\| data\.bus_protocol \|\| null;\r?\n  \}/);
const bridgeSupportedPidsFunctionSource = source.match(/function collectBridgeSupportedPids[\s\S]*?\r?\n      : \[\];\r?\n  \}/);
const bridgeDtcSnapshotFunctionSource = source.match(/function normalizeBridgeDtcSnapshot[\s\S]*?retainedRawText: false\r?\n    \};\r?\n  \}/);
const bridgeLivePidSnapshotFunctionSource = source.match(/function normalizeBridgeLivePidSnapshot[\s\S]*?retainedRawText: false\r?\n    \};\r?\n  \}/);
const bridgeSupportedPidSnapshotFunctionSource = source.match(/function normalizeBridgeSupportedPidSnapshot[\s\S]*?wouldTransmit: safety\.wouldTransmit\r?\n    \};\r?\n  \}/);
const bridgeFreezeFrameSnapshotFunctionSource = source.match(/function normalizeBridgeFreezeFrameSnapshot[\s\S]*?wouldTransmit: safety\.wouldTransmit\r?\n    \};\r?\n  \}/);
const bridgeReadinessSnapshotFunctionSource = source.match(/function normalizeBridgeReadinessSnapshot[\s\S]*?monitors: monitorBits\.map[\s\S]*?\r?\n    \}\)\);\r?\n  \}/);
const bridgeEcuInfoSnapshotFunctionSource = source.match(/function normalizeBridgeEcuInfoSnapshot[\s\S]*?wouldTransmit: safety\.wouldTransmit\r?\n    \};\r?\n  \}/);
const bridgeOnboardMonitorSnapshotFunctionSource = source.match(/function normalizeBridgeOnboardMonitorSnapshot[\s\S]*?wouldTransmit: safety\.wouldTransmit\r?\n    \};\r?\n  \}/);
const bridgePidValueFunctionSource = source.match(/function normalizeBridgePidValue[\s\S]*?sourceLine: index \+ 1\r?\n    \};\r?\n  \}/);
const readoutCoverageFunctionSource = source.match(/function buildReadoutCoverageSnapshot[\s\S]*?\r?\n  \}/);
const normalizeReadoutCoverageFunctionSource = source.match(/function normalizeReadoutCoverageSnapshot[\s\S]*?missingLabels: Array\.isArray\(pickDefined\(input\.missingLabels, input\.missing_labels\)\) \? \[\.\.\.pickDefined\(input\.missingLabels, input\.missing_labels\)\] : \[\]\r?\n    \};\r?\n  \}/);
const resolveReadoutCoverageFunctionSource = source.match(/function resolveReadoutCoverageSnapshot[\s\S]*?\r?\n  \}/);
const vehicleApplicabilityFunctionSource = source.match(/function normalizeVehicleApplicabilitySnapshot[\s\S]*?summaryLabel\r?\n    \};\r?\n  \}/);
const vehicleApplicabilityWarningsFunctionSource = source.match(/function appendVehicleApplicabilityWarnings[\s\S]*?vehicle_profile_manual"\);\r?\n    \}\r?\n  \}/);
const resolveBridgeSummaryFunctionSource = source.match(/function resolveBridgeSummary[\s\S]*?\r?\n  \}/);
const resolveBridgeInfrastructureFunctionSource = source.match(/function resolveBridgeInfrastructureInputs[\s\S]*?honorCoverageOverride\r?\n      \}\)\r?\n    \};\r?\n  \}/);
const sessionTemporalContextFunctionSource = source.match(/function resolveSessionTemporalContext[\s\S]*?capturedAt:[\s\S]*?\r?\n    \};\r?\n  \}/);
const importClassificationFunctionSource = source.match(/function resolveImportClassification[\s\S]*?return input && typeof input === "object" \? \{ \.\.\.input \} : null;\r?\n  \}/);
const readOnlyFlagsFunctionSource = source.match(/function buildReadOnlyFlags[\s\S]*?return flags;\r?\n  \}/);
const commonCoreWarningsFunctionSource = source.match(/function appendCommonCoreWarnings[\s\S]*?appendVehicleApplicabilityWarnings\(warnings, vehicleApplicability \|\| \{\}\);\r?\n  \}/);
const warningListFunctionSource = source.match(/function resolveWarningList[\s\S]*?return mergeUniqueStrings\(\.\.\.warningSets\);\r?\n  \}/);
const mergeDiagnosticInputsFunctionSource = source.match(/function mergeDiagnosticInputs[\s\S]*?vehicleCommandEnabled: false\r?\n    \};\r?\n  \}/);
const readoutCoverageInputFunctionSource = source.match(/function getReadoutCoverageInput[\s\S]*?return input\.readoutCoverage \|\| input\.readout_coverage \|\| input\.readoutCoverageResponse \|\| input\.readout_coverage_response \|\| null;\r?\n  \}/);
const monitorValueSummaryFunctionSource = source.match(/function resolveMonitorValueSummary[\s\S]*?return explicitSummary \|\| buildMonitorValueSummary\(monitorValues\);\r?\n  \}/);
const buildMonitorValueSummaryFunctionSource = source.match(/function buildMonitorValueSummary[\s\S]*?textCount\r?\n    \};\r?\n  \}/);
const analyzeMonitorValuesFunctionSource = source.match(/function analyzeMonitorValues[\s\S]*?return insights\.slice\(0, 6\);\r?\n  \}/);
const fuelTrimInsightFunctionSource = source.match(/function addFuelTrimInsight[\s\S]*?\r?\n  \}/);
const bridgeReadoutWarningsFunctionSource = source.match(/function appendBridgeReadoutCoverageWarnings[\s\S]*?bridge_readout_empty_sections"\);\r?\n  \}/);
const bridgeSessionSummaryFunctionSource = source.match(/function buildBridgeSessionSummary[\s\S]*?\r?\n  \}/);
const diagnosticScanSessionFunctionSource = source.match(/function buildDiagnosticScanSession[\s\S]*?\r?\n  \}/);
const dtcSnapshotFunctionSource = source.match(/function normalizeDtcSnapshot[\s\S]*?retainedRawText: false\r?\n    \};\r?\n  \}/);
const freezeFrameSnapshotFunctionSource = source.match(/function normalizeFreezeFrameSnapshot[\s\S]*?retainedRawText: false\r?\n    \};\r?\n  \}/);
const readinessSnapshotFunctionSource = source.match(/function normalizeReadinessSnapshot[\s\S]*?retainedRawText: false\r?\n    \};\r?\n  \}/);
const ecuResponseSummaryFunctionSource = source.match(/function normalizeEcuResponseSummary[\s\S]*?retainedRawText: false\r?\n    \};\r?\n  \}/);
const ecuInfoRowsFunctionSource = source.match(/function collectEcuInfoRows[\s\S]*?value: input\[key\]\r?\n      \}\)\);\r?\n  \}/);
const ecuInfoSnapshotFunctionSource = source.match(/function normalizeEcuInfoSnapshot[\s\S]*?retainedRawText: false\r?\n    \};\r?\n  \}/);
const onboardMonitorSnapshotFunctionSource = source.match(/function normalizeOnboardMonitorSnapshot[\s\S]*?retainedRawText: false\r?\n    \};\r?\n  \}/);
const ecuInfoValueFunctionSource = source.match(/function normalizeEcuInfoValue[\s\S]*?storagePolicy: catalogItem\?\.storagePolicy \|\| ""\r?\n    \};\r?\n  \}/);
const sanitizeEcuInfoValueFunctionSource = source.match(/function sanitizeEcuInfoValue[\s\S]*?return text \? text\.slice\(0, 240\) : "";\r?\n  \}/);
const mode09SupportedInfoTypesFunctionSource = source.match(/function decodeMode09SupportedInfoTypes[\s\S]*?labels\r?\n    \};\r?\n  \}/);
const trimEcuInfoPayloadFunctionSource = source.match(/function trimEcuInfoPayload[\s\S]*?return cleaned;\r?\n  \}/);
const ecuInfoPayloadFunctionSource = source.match(/function decodeEcuInfoPayload[\s\S]*?return payload\.map\(\(byte\) => String\.fromCharCode\(byte\)\)\.join\(""\)\.trim\(\);\r?\n  \}/);
const parseObdHexBytesFunctionSource = source.match(/function parseObdHexBytes[\s\S]*?parseInt\(byte, 16\)\);\r?\n  \}/);
const decodeObdDtcResponseFunctionSource = source.match(/function decodeObdDtcResponse[\s\S]*?\.\.\.new Set\(codes\)[\s\S]*?\r?\n    \}\);\r?\n  \}/);
const mergeDtcSnapshotsFunctionSource = source.match(/function mergeDtcSnapshots[\s\S]*?retainedRawText: false\r?\n    \};\r?\n  \}/);
const decodeDtcPairFunctionSource = source.match(/function decodeDtcPair[\s\S]*?return `\$\{system\}\$\{first\}\$\{second\}\$\{third\}\$\{fourth\}`;\r?\n  \}/);
const decodeSupportedPidResponseFunctionSource = source.match(/function decodeSupportedPidResponse[\s\S]*?supported_pids: \[\.\.\.new Set\(supportedPids\)\]\r?\n    \}\);\r?\n  \}/);
const supportedPidBaseFunctionSource = source.match(/function isSupportedPidBase[\s\S]*?includes\(pid\);\r?\n  \}/);
const decodeLivePidResponseFunctionSource = source.match(/function decodeLivePidResponse[\s\S]*?captured_at: input\.captured_at \|\| input\.capturedAt \|\| null\r?\n      \}\r?\n    \}\);\r?\n  \}/);
const decodeFreezeFrameResponseFunctionSource = source.match(/function decodeFreezeFrameResponse[\s\S]*?values\r?\n    \}\);\r?\n  \}/);
const decodeEcuInfoResponseFunctionSource = source.match(/function decodeEcuInfoResponse[\s\S]*?values\r?\n    \}\);\r?\n  \}/);
const decodeReadinessResponseFunctionSource = source.match(/function decodeReadinessResponse[\s\S]*?monitors\r?\n    \}\);\r?\n  \}/);
const decodeOnboardMonitorResponseFunctionSource = source.match(/function decodeOnboardMonitorResponse[\s\S]*?tests\r?\n    \}\);\r?\n  \}/);
const decodedObdScanSessionFunctionSource = source.match(/function buildDecodedObdScanSession[\s\S]*?ecus: sessionInput\.ecus \|\| sessionInput\.ecu_responses \|\| \[\]\r?\n    \}\);\r?\n  \}/);
const scanSessionFromObdTextFunctionSource = source.match(/function buildScanSessionFromObdText[\s\S]*?vehicleCommandEnabled: false\r?\n    \};\r?\n  \}/);
const textDtcSnapshotFunctionSource = source.match(/function extractTextDtcSnapshot[\s\S]*?dtcs: rows\r?\n    \}\);\r?\n  \}/);
const classifyObdResponseLinesFunctionSource = source.match(/function classifyObdResponseLines[\s\S]*?vehicleCommandEnabled: false\r?\n    \};\r?\n  \}/);
const buildObdLogPacketsFunctionSource = source.match(/function buildObdLogPackets[\s\S]*?return packets;\r?\n  \}/);
const normalizeObdLogLineFunctionSource = source.match(/function normalizeObdLogLine[\s\S]*?\.trim\(\);\r?\n  \}/);
const normalizeCanLogLineFormatFunctionSource = source.match(/function normalizeCanLogLineFormat[\s\S]*?return text;\r?\n  \}/);
const normalizeCanCsvLogLineFunctionSource = source.match(/function normalizeCanCsvLogLine[\s\S]*?join\(" "\);\r?\n  \}/);
const extractObdFrameMetadataFunctionSource = source.match(/function extractObdFrameMetadata[\s\S]*?serviceIndex: Number\.isInteger\(serviceIndex\) && serviceIndex >= 0 \? serviceIndex : null\r?\n    \};\r?\n  \}/);
const ecuResponsesFromBucketsFunctionSource = source.match(/function buildEcuResponsesFromResponseBuckets[\s\S]*?negative_response_labels: \[\.\.\.row\.negative_response_labels\]\r?\n    \}\)\);\r?\n  \}/);
const isoTpSummaryFunctionSource = source.match(/function buildIsoTpSummary[\s\S]*?affectedEcus: \[\.\.\.new Set[\s\S]*?\r?\n    \};\r?\n  \}/);
const negativeResponseSummaryFunctionSource = source.match(/function buildNegativeResponseSummary[\s\S]*?responseLabels: \[\.\.\.new Set[\s\S]*?\r?\n    \};\r?\n  \}/);
const negativeObdResponseFunctionSource = source.match(/function decodeNegativeObdResponse[\s\S]*?responseLabel: decodeNegativeResponseCode\(responseCode\)\r?\n    \};\r?\n  \}/);
const negativeResponseCodeFunctionSource = source.match(/function decodeNegativeResponseCode[\s\S]*?return labels\[responseCode\] \|\| "unknown_negative_response";\r?\n  \}/);
const textImportMetadataFunctionSource = source.match(/function buildTextImportMetadata[\s\S]*?sourceLength: Number\.isFinite[\s\S]*?\r?\n    \};\r?\n  \}/);
const scannerToolHintsFunctionSource = source.match(/function detectScannerToolHints[\s\S]*?return hints;\r?\n  \}/);
const extractDtcCodesFunctionSource = source.match(/function extractDtcCodes[\s\S]*?return \[\.\.\.new Set\(matches\)\];\r?\n  \}/);
const redactSensitiveTextFunctionSource = source.match(/function redactSensitiveText[\s\S]*?VIN_PATTERN[\s\S]*?\);\r?\n  \}/);
const monitorLabelFunctionSource = source.match(/function normalizeMonitorLabel[\s\S]*?trim\(\);\r?\n  \}/);
const monitorLabelTokensFunctionSource = source.match(/function normalizeMonitorLabelTokens[\s\S]*?trim\(\);\r?\n  \}/);
const monitorLabelMatchFunctionSource = source.match(/function isMonitorLabelMatch[\s\S]*?return Boolean\(tokenLabel\) && tokenLabel === tokenAlias;\r?\n  \}/);
const extractMonitorValuesFunctionSource = source.match(/function extractMonitorValues[\s\S]*?return \[\.\.\.values\.values\(\)\];\r?\n  \}/);
const supportedPidMatrixFunctionSource = source.match(/function buildSupportedPidMatrix[\s\S]*?retainedRawText: false\r?\n    \};\r?\n  \}/);
const standardPidValueFunctionSource = source.match(/function decodeStandardPidValue[\s\S]*?unit: definition\.unit\r?\n    \};\r?\n  \}/);
const undecodedPidValueFunctionSource = source.match(/function buildUndecodedPidValue[\s\S]*?decoded: false,[\s\S]*?\r?\n    \};\r?\n  \}/);
const rawPidBytesFunctionSource = source.match(/function formatRawPidBytes[\s\S]*?join\(" "\);\r?\n  \}/);
const standardPidPayloadLengthFunctionSource = source.match(/function getStandardPidPayloadLength[\s\S]*?return 0;\r?\n  \}/);
const responsePayloadFunctionSource = source.match(/function getResponsePayload[\s\S]*?return bytes\.slice\(payloadStart, payloadEnd\);\r?\n  \}/);
const monitorStatusPidFunctionSource = source.match(/function decodeMonitorStatusPid[\s\S]*?return values\.length \? values : null;\r?\n  \}/);
const fuelSystemStatusPidFunctionSource = source.match(/function decodeFuelSystemStatusPid[\s\S]*?return values\.length \? values : null;\r?\n  \}/);
const oxygenSensorPidFunctionSource = source.match(/function decodeOxygenSensorPid[\s\S]*?return values\.length \? values : null;\r?\n  \}/);
const wideOxygenVoltagePidFunctionSource = source.match(/function decodeWideOxygenVoltagePid[\s\S]*?return values\.length \? values : null;\r?\n  \}/);
const wideOxygenCurrentPidFunctionSource = source.match(/function decodeWideOxygenCurrentPid[\s\S]*?return values\.length \? values : null;\r?\n  \}/);
const enginePercentTorqueDataFunctionSource = source.match(/function decodeEnginePercentTorqueData[\s\S]*?return values\.length \? values : null;\r?\n  \}/);
const commandedEgrAndErrorFunctionSource = source.match(/function decodeCommandedEgrAndError[\s\S]*?return values\.length \? values : null;\r?\n  \}/);
const secondaryAirStatusFunctionSource = source.match(/function decodeSecondaryAirStatus[\s\S]*?\r?\n  \}/);
const oxygenSensorLocationsFunctionSource = source.match(/function decodeOxygenSensorLocations[\s\S]*?\r?\n  \}/);
const auxiliaryInputStatusFunctionSource = source.match(/function decodeAuxiliaryInputStatus[\s\S]*?\r?\n  \}/);
const obdStandardFunctionSource = source.match(/function decodeObdStandard[\s\S]*?\r?\n  \}/);
const fuelTypeFunctionSource = source.match(/function decodeFuelType[\s\S]*?\r?\n  \}/);
const readinessHeadlineFunctionSource = appSource.match(/function buildCoreReadinessHeadline[\s\S]*?\r?\n\}/);
const coreNextStepFunctionSource = appSource.match(/function formatCoreNextStepSummary[\s\S]*?\r?\n\}/);
const readoutCoverageFunctionChecks = () => {
  check(Boolean(readoutCoverageFunctionSource), "buildReadoutCoverageSnapshot is missing from obd-readonly.js");
  if (readoutCoverageFunctionSource) {
    const functionBody = readoutCoverageFunctionSource[0];
    check(functionBody.includes('const includeInfrastructureInput = pickDefined(input.includeInfrastructure, input.include_infrastructure);'), "buildReadoutCoverageSnapshot should normalize includeInfrastructure aliases");
    check(functionBody.includes('includeInfrastructureInput === false'), "buildReadoutCoverageSnapshot should preserve explicit includeInfrastructure false");
    check(functionBody.indexOf('includeInfrastructureInput === false') < functionBody.indexOf(': hasConnectionStatusInput'), "buildReadoutCoverageSnapshot should evaluate explicit includeInfrastructure false before inferring infrastructure from bridge inputs");
  }
};
const bridgeReadoutWarningsFunctionChecks = () => {
  check(Boolean(bridgeReadoutWarningsFunctionSource), "appendBridgeReadoutCoverageWarnings is missing from obd-readonly.js");
  if (bridgeReadoutWarningsFunctionSource) {
    const functionBody = bridgeReadoutWarningsFunctionSource[0];
    check(functionBody.includes('if (!hasBridgeInfrastructureContext || !readoutCoverage) return;'), "appendBridgeReadoutCoverageWarnings should short-circuit without bridge infrastructure context");
    check(functionBody.includes('if (readoutCoverage.missingCategories > 0) warnings.push(\"bridge_readout_incomplete\");'), "appendBridgeReadoutCoverageWarnings should derive incomplete readout warning from missing categories");
    check(functionBody.includes('if (readoutCoverage.emptyCategories > 0) warnings.push(\"bridge_readout_empty_sections\");'), "appendBridgeReadoutCoverageWarnings should derive empty readout warning from empty categories");
  }
};
const bridgeSummaryAliasFunctionChecks = () => {
  check(Boolean(bridgeSummaryAliasFunctionSource), "normalizeBridgeSummaryAliases is missing from obd-readonly.js");
  if (bridgeSummaryAliasFunctionSource) {
    const functionBody = bridgeSummaryAliasFunctionSource[0];
    check(functionBody.includes('appendBridgeReadoutCoverageWarnings(derivedWarnings, {'), "normalizeBridgeSummaryAliases should append bridge readout warnings through derived warnings");
    check(functionBody.includes('hasBridgeInfrastructureContext,'), "normalizeBridgeSummaryAliases should pass bridge infrastructure context into bridge readout warning mapping");
    check(functionBody.includes('readoutCoverage: derivedReadoutCoverage'), "normalizeBridgeSummaryAliases should map bridge readout warnings from derived readout coverage");
  }
};
const resolveReadoutCoverageFunctionChecks = () => {
  check(Boolean(resolveReadoutCoverageFunctionSource), "resolveReadoutCoverageSnapshot is missing from obd-readonly.js");
  if (resolveReadoutCoverageFunctionSource) {
    const functionBody = resolveReadoutCoverageFunctionSource[0];
    check(functionBody.includes('if (input && typeof input === "object") {'), "resolveReadoutCoverageSnapshot should prefer explicit readout coverage input");
    check(functionBody.includes('return normalizeReadoutCoverageSnapshot(input?.schemaVersion ? input : input);'), "resolveReadoutCoverageSnapshot should normalize explicit readout coverage input");
    check(functionBody.includes('return normalizeReadoutCoverageSnapshot(derived || buildReadoutCoverageSnapshot());'), "resolveReadoutCoverageSnapshot should fall back to derived or empty readout coverage");
  }
};
const normalizeReadoutCoverageFunctionChecks = () => {
  check(Boolean(normalizeReadoutCoverageFunctionSource), "normalizeReadoutCoverageSnapshot is missing from obd-readonly.js");
  if (normalizeReadoutCoverageFunctionSource) {
    const functionBody = normalizeReadoutCoverageFunctionSource[0];
    check(functionBody.includes('if (!input || typeof input !== "object") return buildReadoutCoverageSnapshot();'), "normalizeReadoutCoverageSnapshot should fall back to empty readout coverage for non-object input");
    check(functionBody.includes('schemaVersion: input.schemaVersion || input.schema_version || "readout_coverage_v1",'), "normalizeReadoutCoverageSnapshot should normalize schema version aliases");
    check(functionBody.includes('includeInfrastructure: pickDefined(input.includeInfrastructure, input.include_infrastructure) === true,'), "normalizeReadoutCoverageSnapshot should normalize includeInfrastructure aliases as explicit true");
    check(functionBody.includes('capturedPercent: Number.isFinite(Number(pickDefined(input.capturedPercent, input.captured_percent)))') && functionBody.includes(': computedCapturedPercent,'), "normalizeReadoutCoverageSnapshot should clamp capturedPercent and fall back to computed captured percent");
    check(functionBody.includes('progressPercent: Number.isFinite(Number(pickDefined(input.progressPercent, input.progress_percent)))') && functionBody.includes(': computedProgressPercent,'), "normalizeReadoutCoverageSnapshot should clamp progressPercent and fall back to computed progress percent");
    check(functionBody.includes('emptyIds: Array.isArray(pickDefined(input.emptyIds, input.empty_ids)) ? [...pickDefined(input.emptyIds, input.empty_ids)] : [],') && functionBody.includes('missingLabels: Array.isArray(pickDefined(input.missingLabels, input.missing_labels)) ? [...pickDefined(input.missingLabels, input.missing_labels)] : []'), "normalizeReadoutCoverageSnapshot should normalize snake_case coverage label and id aliases");
  }
};
const vehicleApplicabilityFunctionChecks = () => {
  check(Boolean(vehicleApplicabilityFunctionSource), "normalizeVehicleApplicabilitySnapshot is missing from obd-readonly.js");
  if (vehicleApplicabilityFunctionSource) {
    const functionBody = vehicleApplicabilityFunctionSource[0];
    check(functionBody.includes('const candidateRanges = Array.isArray(source.candidateRanges) ? source.candidateRanges : Array.isArray(source.candidate_ranges) ? source.candidate_ranges : [];'), "normalizeVehicleApplicabilitySnapshot should normalize candidate range aliases");
    check(functionBody.includes('const supportedEngineCodes = Array.isArray(source.supportedEngineCodes) ? source.supportedEngineCodes : Array.isArray(source.supported_engine_codes) ? source.supported_engine_codes : [];'), "normalizeVehicleApplicabilitySnapshot should normalize supported engine code aliases");
    check(functionBody.includes('const candidateRangeCount = toCount(source.candidateRangeCount, source.candidate_range_count, candidateRanges.length);'), "normalizeVehicleApplicabilitySnapshot should derive candidate range counts from explicit values or array length");
    check(functionBody.includes('} else if (!catalogMatched) {') && functionBody.includes('status = "unlisted";') && functionBody.includes('status = "matched";') && functionBody.includes('status = "partial";'), "normalizeVehicleApplicabilitySnapshot should infer unlisted, matched, and partial status when explicit status is absent");
    check(functionBody.includes('const summaryLabel = source.summaryLabel || source.summary_label || source.label || null;'), "normalizeVehicleApplicabilitySnapshot should normalize summary label aliases");
  }
};
const vehicleApplicabilityWarningsFunctionChecks = () => {
  check(Boolean(vehicleApplicabilityWarningsFunctionSource), "appendVehicleApplicabilityWarnings is missing from obd-readonly.js");
  if (vehicleApplicabilityWarningsFunctionSource) {
    const functionBody = vehicleApplicabilityWarningsFunctionSource[0];
    check(functionBody.includes('if (!hasObjectContent(applicability)) return;'), "appendVehicleApplicabilityWarnings should skip empty applicability input");
    check(functionBody.includes('normalizeVehicleApplicabilitySnapshot(applicability || {})'), "appendVehicleApplicabilityWarnings should normalize applicability before warning mapping");
    check(functionBody.includes('if (normalized.status === "partial")') && functionBody.includes('warnings.push("vehicle_applicability_partial");'), "appendVehicleApplicabilityWarnings should map partial applicability to a partial warning");
    check(functionBody.includes('} else if (normalized.status === "unlisted")') && functionBody.includes('warnings.push("vehicle_applicability_unlisted");'), "appendVehicleApplicabilityWarnings should map unlisted applicability to an unlisted warning");
    check(functionBody.includes('} else if (normalized.status === "manual")') && functionBody.includes('warnings.push("vehicle_profile_manual");'), "appendVehicleApplicabilityWarnings should map manual applicability to a manual-profile warning");
  }
};
const resolveBridgeSummaryFunctionChecks = () => {
  check(Boolean(resolveBridgeSummaryFunctionSource), "resolveBridgeSummary is missing from obd-readonly.js");
  if (resolveBridgeSummaryFunctionSource) {
    const functionBody = resolveBridgeSummaryFunctionSource[0];
    check(functionBody.includes('const summaryInput = getBridgeSummaryInput(parts);'), "resolveBridgeSummary should derive bridge summary input before branching");
    check(functionBody.includes('return hasBridgeSummaryContent(summaryInput) ? normalizeBridgeSummaryAliases(summaryInput) : buildBridgeSessionSummary(parts);'), "resolveBridgeSummary should normalize summary aliases before falling back to bridge session summary");
  }
};
const detectBridgeInfrastructureFunctionChecks = () => {
  check(Boolean(detectBridgeInfrastructureFunctionSource), "detectBridgeInfrastructureContext is missing from obd-readonly.js");
  if (detectBridgeInfrastructureFunctionSource) {
    const functionBody = detectBridgeInfrastructureFunctionSource[0];
    check(functionBody.includes('const explicitIncludeInfrastructureValue = pickDefined('), "detectBridgeInfrastructureContext should derive explicit includeInfrastructure overrides");
    check(functionBody.includes('if (honorCoverageOverride && typeof explicitIncludeInfrastructureValue === \"boolean\") {'), "detectBridgeInfrastructureContext should honor explicit readout coverage override before inference");
    check(functionBody.includes('return explicitIncludeInfrastructureValue;'), "detectBridgeInfrastructureContext should return explicit includeInfrastructure override when enabled");
    check(functionBody.includes('|| Boolean(nestedSession);'), "detectBridgeInfrastructureContext should infer bridge infrastructure context from nested session presence");
  }
};
const bridgeReadOnlyGateFunctionChecks = () => {
  check(Boolean(bridgeBlockedResponseFunctionSource), "createLocalBridgeBlockedResponse is missing from obd-readonly.js");
  if (bridgeBlockedResponseFunctionSource) {
    const functionBody = bridgeBlockedResponseFunctionSource[0];
    check(functionBody.includes('const schema = localBridgeResponseSchemas.find((item) => item.intent === intent);'), "createLocalBridgeBlockedResponse should resolve a safe default response schema by intent");
    check(functionBody.includes('ok: false') && functionBody.includes('blocked: true') && functionBody.includes('would_transmit: false'), "createLocalBridgeBlockedResponse should always return a blocked non-transmitting response");
    check(functionBody.includes('errors: errors.length ? [...errors] : ["local_bridge_disabled"]'), "createLocalBridgeBlockedResponse should default to a local_bridge_disabled error");
    check(functionBody.includes('data: schema ? cloneBridgeValue(schema.safeDefault) : null'), "createLocalBridgeBlockedResponse should clone safe defaults and avoid shared mutation");
  }
  check(Boolean(bridgeRequestEvaluationFunctionSource), "evaluateLocalBridgeRequest is missing from obd-readonly.js");
  if (bridgeRequestEvaluationFunctionSource) {
    const functionBody = bridgeRequestEvaluationFunctionSource[0];
    check(functionBody.includes('request.request_id || request.requestId') && functionBody.includes('request.pairing_token || request.pairingToken'), "evaluateLocalBridgeRequest should normalize request id and pairing token aliases");
    check(functionBody.includes('const isAllowedRead = localBridgeContract.allowedReadIntents.includes(intent);'), "evaluateLocalBridgeRequest should recognize allowed read intents");
    check(functionBody.includes('const isBlockedWrite = localBridgeContract.blockedWriteIntents.includes(intent);'), "evaluateLocalBridgeRequest should recognize blocked write intents");
    check(functionBody.includes('const missingFields = localBridgeContract.requiredRequestFields.filter((field) => !normalizedRequest[field]);'), "evaluateLocalBridgeRequest should enforce required bridge request fields");
    check(functionBody.includes('ok: false') && functionBody.includes('blocked: true') && functionBody.includes('wouldTransmit: false'), "evaluateLocalBridgeRequest should remain fail-closed and non-transmitting");
    check(functionBody.includes('vehicleCommandEnabled: false'), "evaluateLocalBridgeRequest should keep vehicle commands disabled");
    check(functionBody.includes('response: createLocalBridgeBlockedResponse(intent, missingFields.length ? ["missing_required_fields"] : [])'), "evaluateLocalBridgeRequest should return a safe blocked bridge response");
  }
};
const vehicleReadOnlyOperationGateFunctionChecks = () => {
  check(Boolean(preparedVehicleRequestFunctionSource), "requestPreparedVehicleRequest is missing from obd-readonly.js");
  if (preparedVehicleRequestFunctionSource) {
    const functionBody = preparedVehicleRequestFunctionSource[0];
    check(functionBody.includes('const request = preparedVehicleRequests.find((item) => item.id === requestId);'), "requestPreparedVehicleRequest should resolve prepared requests by id");
    check(functionBody.includes('vehicleDamagePreventionInterlock.blockedServiceModes.includes(service)'), "requestPreparedVehicleRequest should recognize blocked service modes");
    check(functionBody.includes('ok: false') && functionBody.includes('blocked: true') && functionBody.includes('wouldTransmit: false'), "requestPreparedVehicleRequest should always return a blocked non-transmitting result");
    check(functionBody.includes('failClosed: vehicleDamagePreventionInterlock.failClosed'), "requestPreparedVehicleRequest should expose the fail-closed interlock state");
    check(functionBody.includes('stateChanging: Boolean(request?.stateChanging)'), "requestPreparedVehicleRequest should preserve state-changing metadata");
    check(functionBody.includes('safetyGate: request?.safetyGate ||') && functionBody.includes('blockedByMode'), "requestPreparedVehicleRequest should expose safety gate and blocked mode state");
  }
  check(Boolean(outboundSafetyFunctionSource), "evaluateOutboundSafety is missing from obd-readonly.js");
  if (outboundSafetyFunctionSource) {
    const functionBody = outboundSafetyFunctionSource[0];
    check(functionBody.includes('const service = String(request.service || "").toUpperCase();'), "evaluateOutboundSafety should normalize outbound service ids to uppercase");
    check(functionBody.includes('const isBlockedService = vehicleDamagePreventionInterlock.blockedServiceModes.includes(service);'), "evaluateOutboundSafety should recognize blocked service modes");
    check(functionBody.includes('const isStateChanging = Boolean(request.stateChanging) || isBlockedService;'), "evaluateOutboundSafety should treat blocked services as state-changing");
    check(functionBody.includes('ok: false') && functionBody.includes('blocked: true') && functionBody.includes('wouldTransmit: false'), "evaluateOutboundSafety should always block outbound transmission");
    check(functionBody.includes('failClosed: true') && functionBody.includes('stateChanging: isStateChanging') && functionBody.includes('service,'), "evaluateOutboundSafety should expose fail-closed, state-changing, and normalized service state");
  }
  check(Boolean(vehicleOperationRequestFunctionSource), "requestVehicleOperation is missing from obd-readonly.js");
  if (vehicleOperationRequestFunctionSource) {
    const functionBody = vehicleOperationRequestFunctionSource[0];
    check(functionBody.includes('const operation = vehicleOperationPlan.find((item) => item.id === operationId);'), "requestVehicleOperation should resolve operation plan entries by id");
    check(functionBody.includes('ok: false') && functionBody.includes('blocked: true'), "requestVehicleOperation should always return a blocked result");
    check(functionBody.includes('requiredBeforeEnable: operation ? [...operation.requiredBeforeEnable] : []'), "requestVehicleOperation should clone required-before-enable prerequisites");
  }
};
const bridgeResponseSafetyFunctionChecks = () => {
  check(Boolean(bridgeResponseSafetyFunctionSource), "readBridgeResponseSafety is missing from obd-readonly.js");
  if (bridgeResponseSafetyFunctionSource) {
    const functionBody = bridgeResponseSafetyFunctionSource[0];
    check(functionBody.includes('ok: response.ok === true'), "readBridgeResponseSafety should only mark bridge responses ok on explicit true");
    check(functionBody.includes('blocked: response.blocked !== false && response.isBlocked !== false'), "readBridgeResponseSafety should fail closed unless blocked/isBlocked is explicitly false");
    check(functionBody.includes('wouldTransmit: response.would_transmit === true || response.wouldTransmit === true'), "readBridgeResponseSafety should normalize wouldTransmit aliases only from explicit true");
  }
  check(Boolean(bridgeProtocolFunctionSource), "readBridgeProtocol is missing from obd-readonly.js");
  if (bridgeProtocolFunctionSource) {
    const functionBody = bridgeProtocolFunctionSource[0];
    check(functionBody.includes('data.protocol || data.protocol_name || data.protocolName || data.bus_protocol || null'), "readBridgeProtocol should normalize bridge protocol aliases");
  }
  check(Boolean(bridgeSupportedPidsFunctionSource), "collectBridgeSupportedPids is missing from obd-readonly.js");
  if (bridgeSupportedPidsFunctionSource) {
    const functionBody = bridgeSupportedPidsFunctionSource[0];
    check(functionBody.includes('if (Array.isArray(data.supported_pids)) return data.supported_pids;'), "collectBridgeSupportedPids should prefer snake_case supported PID arrays");
    check(functionBody.includes('if (Array.isArray(data.supportedPids)) return data.supportedPids;'), "collectBridgeSupportedPids should accept camelCase supported PID arrays");
    check(functionBody.includes('data.supported_pid_list || data.supportedPidsText || data.supported_pids_text || ""'), "collectBridgeSupportedPids should accept text supported PID aliases");
    check(functionBody.includes('text.split(/[,\\s]+/).map((item) => item.trim()).filter(Boolean)'), "collectBridgeSupportedPids should split text supported PID lists on commas and whitespace");
  }
};
const bridgeCoreReadoutNormalizerFunctionChecks = () => {
  check(Boolean(bridgeDtcSnapshotFunctionSource), "normalizeBridgeDtcSnapshot is missing from obd-readonly.js");
  if (bridgeDtcSnapshotFunctionSource) {
    const functionBody = bridgeDtcSnapshotFunctionSource[0];
    check(functionBody.includes('const data = response && typeof response === "object" ? response.data || response : {};'), "normalizeBridgeDtcSnapshot should unwrap bridge response data safely");
    check(functionBody.includes('Array.isArray(data.dtcs)') && functionBody.includes('Array.isArray(data.dtc_codes)') && functionBody.includes('Array.isArray(data.dtcCodes)'), "normalizeBridgeDtcSnapshot should accept DTC array aliases");
    check(functionBody.includes('"read_stored_dtc"') && functionBody.includes('"read_pending_dtc"') && functionBody.includes('"read_permanent_dtc"'), "normalizeBridgeDtcSnapshot should preserve stored, pending, and permanent DTC intents");
    check(functionBody.includes('const defaultStatus = intent === "read_pending_dtc" ? "pending" : intent === "read_permanent_dtc" ? "permanent" : "stored";'), "normalizeBridgeDtcSnapshot should derive DTC status from bridge intent");
    check(functionBody.includes('extractDtcCodes(row.code || row.dtc || row.id || "")'), "normalizeBridgeDtcSnapshot should normalize DTC row code aliases");
    check(functionBody.includes('const key = `${entry.code}::${entry.status}`;'), "normalizeBridgeDtcSnapshot should deduplicate by code and status");
    check(functionBody.includes('dtcs: dtcs.map((item) => ({ ...item, source: "local_bridge" }))'), "normalizeBridgeDtcSnapshot should mark normalized DTC rows as local bridge sourced");
    check(functionBody.includes('retainedRawText: false'), "normalizeBridgeDtcSnapshot should not retain raw bridge text");
  }
  check(Boolean(bridgeLivePidSnapshotFunctionSource), "normalizeBridgeLivePidSnapshot is missing from obd-readonly.js");
  if (bridgeLivePidSnapshotFunctionSource) {
    const functionBody = bridgeLivePidSnapshotFunctionSource[0];
    check(functionBody.includes('Array.isArray(data.values)') && functionBody.includes('Array.isArray(data.monitor_values)') && functionBody.includes('Array.isArray(data.pidValues)'), "normalizeBridgeLivePidSnapshot should accept live PID value aliases");
    check(functionBody.includes('.map((row, index) => normalizeBridgePidValue(row, index))') && functionBody.includes('.filter(Boolean)'), "normalizeBridgeLivePidSnapshot should normalize and filter PID value rows");
    check(functionBody.includes('supportedPids: collectBridgeSupportedPids(data)'), "normalizeBridgeLivePidSnapshot should carry supported PID context");
    check(functionBody.includes('monitorValueSummary: buildMonitorValueSummary(monitorValues)') && functionBody.includes('monitorInsights: analyzeMonitorValues(monitorValues)'), "normalizeBridgeLivePidSnapshot should derive summaries and monitor insights");
    check(functionBody.includes('retainedRawText: false'), "normalizeBridgeLivePidSnapshot should not retain raw bridge text");
  }
  check(Boolean(bridgeSupportedPidSnapshotFunctionSource), "normalizeBridgeSupportedPidSnapshot is missing from obd-readonly.js");
  if (bridgeSupportedPidSnapshotFunctionSource) {
    const functionBody = bridgeSupportedPidSnapshotFunctionSource[0];
    check(functionBody.includes('const supportedPids = collectBridgeSupportedPids(data);'), "normalizeBridgeSupportedPidSnapshot should normalize supported PID aliases before matrix building");
    check(functionBody.includes('...buildSupportedPidMatrix({') && functionBody.includes('source: "local_bridge"'), "normalizeBridgeSupportedPidSnapshot should reuse the supported PID matrix builder");
    check(functionBody.includes('protocol: readBridgeProtocol(data)') && functionBody.includes('supported_pids: supportedPids'), "normalizeBridgeSupportedPidSnapshot should pass protocol and supported PID rows into the matrix builder");
    check(functionBody.includes('intent: "read_supported_pids"') && functionBody.includes('wouldTransmit: safety.wouldTransmit'), "normalizeBridgeSupportedPidSnapshot should preserve bridge intent and safety metadata");
  }
  check(Boolean(bridgeFreezeFrameSnapshotFunctionSource), "normalizeBridgeFreezeFrameSnapshot is missing from obd-readonly.js");
  if (bridgeFreezeFrameSnapshotFunctionSource) {
    const functionBody = bridgeFreezeFrameSnapshotFunctionSource[0];
    check(functionBody.includes('...normalizeFreezeFrameSnapshot({') && functionBody.includes('source: "local_bridge"'), "normalizeBridgeFreezeFrameSnapshot should reuse the core freeze-frame normalizer");
    check(functionBody.includes('trigger_dtc: data.trigger_dtc || data.triggerDtc || data.trigger_code || data.triggerCode || data.dtc || null'), "normalizeBridgeFreezeFrameSnapshot should normalize trigger DTC aliases");
    check(functionBody.includes('Array.isArray(data.freeze_frame_values)') && functionBody.includes('Array.isArray(data.freezeFrameRows)') && functionBody.includes('Array.isArray(data.pidValues)'), "normalizeBridgeFreezeFrameSnapshot should accept freeze-frame value aliases");
    check(functionBody.includes('intent: "read_freeze_frame"') && functionBody.includes('wouldTransmit: safety.wouldTransmit'), "normalizeBridgeFreezeFrameSnapshot should preserve bridge intent and safety metadata");
  }
};
const bridgeExtendedCoreReadoutNormalizerFunctionChecks = () => {
  check(Boolean(bridgeReadinessSnapshotFunctionSource), "normalizeBridgeReadinessSnapshot is missing from obd-readonly.js");
  if (bridgeReadinessSnapshotFunctionSource) {
    const functionBody = bridgeReadinessSnapshotFunctionSource[0];
    check(functionBody.includes('readinessRowIdAliases') && functionBody.includes('statusbyteb: "readiness_status_byte_b"'), "normalizeBridgeReadinessSnapshot should normalize readiness row id aliases");
    check(functionBody.includes('Array.isArray(data.readiness_values)') && functionBody.includes('Array.isArray(data.readinessRows)') && functionBody.includes('Array.isArray(response.monitorValues)'), "normalizeBridgeReadinessSnapshot should accept readiness value aliases");
    check(functionBody.includes('data.readinessStatusByteB !== undefined') && functionBody.includes('data.statusByteD !== undefined'), "normalizeBridgeReadinessSnapshot should accept direct readiness status byte aliases");
    check(functionBody.includes('const valueById = new Map(rows.filter((row) => row && typeof row === "object").map((row) => {'), "normalizeBridgeReadinessSnapshot should build readiness values by normalized id");
    check(functionBody.includes('if (![b, c, d].every(Number.isFinite))') && functionBody.includes('monitors: []'), "normalizeBridgeReadinessSnapshot should return an empty normalized snapshot without B/C/D bytes");
    check(functionBody.includes('const compressionIgnition = (b & 0x08) !== 0;'), "normalizeBridgeReadinessSnapshot should derive spark/compression layout from byte B");
    check(functionBody.includes('["nox_scr", c, 0x02, 0x20]') && functionBody.includes('["evaporative_system", c, 0x08, 0x80]'), "normalizeBridgeReadinessSnapshot should preserve compression and spark monitor layouts");
    check(functionBody.includes('status: supported ? (complete ? "complete" : "not_complete") : "not_supported"'), "normalizeBridgeReadinessSnapshot should derive readiness monitor status from supported and incomplete bits");
  }
  check(Boolean(bridgeEcuInfoSnapshotFunctionSource), "normalizeBridgeEcuInfoSnapshot is missing from obd-readonly.js");
  if (bridgeEcuInfoSnapshotFunctionSource) {
    const functionBody = bridgeEcuInfoSnapshotFunctionSource[0];
    check(functionBody.includes('...normalizeEcuInfoSnapshot({') && functionBody.includes('...data,'), "normalizeBridgeEcuInfoSnapshot should delegate bridge ECU info data to the core normalizer");
    check(functionBody.includes('source: "local_bridge"') && functionBody.includes('protocol: readBridgeProtocol(data)'), "normalizeBridgeEcuInfoSnapshot should preserve local bridge source and protocol");
    check(functionBody.includes('intent: "read_ecu_info"') && functionBody.includes('wouldTransmit: safety.wouldTransmit'), "normalizeBridgeEcuInfoSnapshot should preserve bridge intent and safety metadata");
  }
  check(Boolean(bridgeOnboardMonitorSnapshotFunctionSource), "normalizeBridgeOnboardMonitorSnapshot is missing from obd-readonly.js");
  if (bridgeOnboardMonitorSnapshotFunctionSource) {
    const functionBody = bridgeOnboardMonitorSnapshotFunctionSource[0];
    check(functionBody.includes('...normalizeOnboardMonitorSnapshot({') && functionBody.includes('source: "local_bridge"'), "normalizeBridgeOnboardMonitorSnapshot should reuse the core Mode 06 normalizer");
    check(functionBody.includes('Array.isArray(data.mode06_tests)') && functionBody.includes('Array.isArray(data.mode06Rows)') && functionBody.includes('Array.isArray(data.onboardMonitorTests)'), "normalizeBridgeOnboardMonitorSnapshot should accept Mode 06 test aliases");
    check(functionBody.includes('intent: "read_onboard_monitor"') && functionBody.includes('wouldTransmit: safety.wouldTransmit'), "normalizeBridgeOnboardMonitorSnapshot should preserve bridge intent and safety metadata");
  }
};
const bridgePidValueFunctionChecks = () => {
  check(Boolean(bridgePidValueFunctionSource), "normalizeBridgePidValue is missing from obd-readonly.js");
  if (bridgePidValueFunctionSource) {
    const functionBody = bridgePidValueFunctionSource[0];
    check(functionBody.includes('if (!row || typeof row !== "object") return null;'), "normalizeBridgePidValue should reject non-object PID rows");
    check(functionBody.includes('row.label || row.name || row.monitor_label || row.monitorLabel || row.monitor_name || row.monitorName'), "normalizeBridgePidValue should accept monitor label aliases");
    check(functionBody.includes('row.id || row.monitor_id || row.monitorId || row.pid || row.code || row.pid_code || row.pidCode'), "normalizeBridgePidValue should accept PID and monitor id aliases");
    check(functionBody.includes('monitorDefinitions.find((item) => item.id === id)') && functionBody.includes('isMonitorLabelMatch(normalizedLabelAlias, alias)'), "normalizeBridgePidValue should resolve monitor definitions by id, PID, and label aliases");
    check(functionBody.includes('bridgeComputedPidDefinitions[id]'), "normalizeBridgePidValue should preserve computed bridge PID definitions");
    check(functionBody.includes('const isUndecodedRaw = row.decoded === false;'), "normalizeBridgePidValue should preserve explicit undecoded raw rows");
    check(functionBody.includes('row.value ?? row.result ?? row.reading ?? row.raw_value ?? row.rawValue ?? row.value_raw ?? row.valueRaw ?? null'), "normalizeBridgePidValue should accept value aliases");
    check(functionBody.includes('typeof rawValue === "string" && !NUMBER_PATTERN.test(rawValue) ? "text" : "number"'), "normalizeBridgePidValue should infer text versus numeric values from raw value shape");
    check(functionBody.includes('if (valueType === "number" && !isUndecodedRaw && !Number.isFinite(parsedValue)) return null;'), "normalizeBridgePidValue should reject non-finite numeric values unless they are raw undecoded values");
    check(functionBody.includes('valueType: isUndecodedRaw ? "raw_hex" : valueType') && functionBody.includes('decoded: isUndecodedRaw ? false : true'), "normalizeBridgePidValue should mark undecoded values as raw_hex and decoded=false");
    check(functionBody.includes('freezeFrameNumber: Number.isInteger(row.freeze_frame_number) ? row.freeze_frame_number : Number.isInteger(row.freezeFrameNumber) ? row.freezeFrameNumber : null'), "normalizeBridgePidValue should normalize freeze-frame number aliases");
    check(functionBody.includes('sourceLine: index + 1'), "normalizeBridgePidValue should retain source row position");
  }
};
const bridgeSummaryInputFunctionChecks = () => {
  check(Boolean(bridgeSummaryInputFunctionSource), "getBridgeSummaryInput is missing from obd-readonly.js");
  if (bridgeSummaryInputFunctionSource) {
    const functionBody = bridgeSummaryInputFunctionSource[0];
    check(functionBody.includes('const nested = parts.bridgeSession || parts.bridge_session || parts.session || null;'), "getBridgeSummaryInput should prefer bridgeSession aliases before generic session");
    check(functionBody.includes('if (!nested || typeof nested !== \"object\") return parts;'), "getBridgeSummaryInput should return outer parts when nested bridge summary is unavailable");
    check(functionBody.includes('const mergedMetadata = mergeNestedSessionMetadata(parts, nested);'), "getBridgeSummaryInput should merge nested session metadata before rebuilding bridge summary input");
    check(functionBody.includes('...nested,') && functionBody.includes('...parts,'), "getBridgeSummaryInput should layer nested bridge summary fields before outer overrides");
  }
};
const mergedBridgeMetadataFunctionChecks = () => {
  check(Boolean(mergedBridgeMetadataFunctionSource), "buildMergedBridgeMetadata is missing from obd-readonly.js");
  if (mergedBridgeMetadataFunctionSource) {
    const functionBody = mergedBridgeMetadataFunctionSource[0];
    check(functionBody.includes('const bridgeImportMetadata = getSessionMetadataOverrides(bridgeImport || {});'), "buildMergedBridgeMetadata should derive bridge import metadata overrides first");
    check(functionBody.includes('const bridgeSessionMetadata = getSessionMetadataOverrides(bridgeSession || {});'), "buildMergedBridgeMetadata should derive bridge session metadata overrides");
    check(functionBody.includes('const readoutCoverageInput = pickDefined('), "buildMergedBridgeMetadata should prioritize explicit readout coverage inputs from bridge import and bridge session");
    check(functionBody.includes('readoutCoverage: normalizeReadoutCoverageSnapshot(readoutCoverageInput),'), "buildMergedBridgeMetadata should normalize merged readout coverage input");
    check(functionBody.includes('toolHints: mergeUniqueStrings(bridgeImportMetadata.toolHints, bridgeSessionMetadata.toolHints),'), "buildMergedBridgeMetadata should merge tool hints from bridge import and bridge session");
    check(functionBody.includes('warnings: resolveWarningList(bridgeImportMetadata.warnings, bridgeSessionMetadata.warnings),'), "buildMergedBridgeMetadata should merge warnings from bridge import and bridge session");
  }
};
const summaryMetadataFieldsFunctionChecks = () => {
  check(Boolean(summaryMetadataFieldsFunctionSource), "buildSummaryMetadataFields is missing from obd-readonly.js");
  if (summaryMetadataFieldsFunctionSource) {
    const functionBody = summaryMetadataFieldsFunctionSource[0];
    check(functionBody.includes('const toolHints = mergeUniqueStrings(summary.toolHints, summary.tool_hints);'), "buildSummaryMetadataFields should merge camelCase and snake_case tool hints");
    check(functionBody.includes('const warnings = resolveWarningList(summary.warnings, summary.warning_flags, summary.warningFlags);'), "buildSummaryMetadataFields should normalize warning aliases");
    check(functionBody.includes('const nextReadoutCandidates = normalizeNextReadoutCandidates(summary.nextReadoutCandidates || summary.next_readout_candidates);'), "buildSummaryMetadataFields should normalize next-readout candidate aliases");
    check(functionBody.includes('const sourceLengthValue = pickDefined(summary.sourceLength, summary.source_length, 0);'), "buildSummaryMetadataFields should normalize source length aliases");
  }
};
const bridgeSessionExportPayloadFunctionChecks = () => {
  check(Boolean(bridgeSessionExportPayloadFunctionSource), "buildBridgeSessionExportPayload is missing from obd-readonly.js");
  if (bridgeSessionExportPayloadFunctionSource) {
    const functionBody = bridgeSessionExportPayloadFunctionSource[0];
    check(functionBody.includes('const summary = resolveBridgeSummary(parts);'), "buildBridgeSessionExportPayload should resolve bridge summary before export serialization");
    check(functionBody.includes('const metadataFields = buildSummaryMetadataFields(summary, { snakeCase: true });'), "buildBridgeSessionExportPayload should rebuild summary metadata in snake_case for export");
    check(functionBody.includes('const diagnosticFlowSummary = summary.diagnosticFlowSummary || summary.diagnostic_flow_summary || buildDiagnosticFlowSummary(coreSessionStatus);'), "buildBridgeSessionExportPayload should rebuild diagnostic flow summary from core session status");
    check(functionBody.includes('const readoutCompletionSummary = summary.readoutCompletionSummary || summary.readout_completion_summary || coreSessionStatus.readoutCompletionSummary || null;'), "buildBridgeSessionExportPayload should rebuild readout completion summary from core session status");
    check(functionBody.includes('const analysisReadinessSummary = summary.analysisReadinessSummary || summary.analysis_readiness_summary || coreSessionStatus.analysisReadinessSummary || null;'), "buildBridgeSessionExportPayload should rebuild analysis readiness summary from core session status");
    check(functionBody.includes('const readoutRequestPlanGateSummary = summary.readoutRequestPlanGateSummary') && functionBody.includes('coreSessionStatus.readoutRequestPlanGateSummary'), "buildBridgeSessionExportPayload should rebuild readout request plan gate summary from core session status");
    check(functionBody.includes('core_session_status: coreSessionStatus,'), "buildBridgeSessionExportPayload should serialize core session status");
    check(functionBody.includes('schema_version: \"bridge_session_export_v1\"'), "buildBridgeSessionExportPayload should emit bridge session export schema version");
    check(functionBody.includes('readout_coverage: normalizeReadoutCoverageSnapshot(summary.readoutCoverage || buildReadoutCoverageSnapshot()),'), "buildBridgeSessionExportPayload should normalize readout coverage into export payload");
    check(functionBody.includes('diagnostic_flow_summary: diagnosticFlowSummary,'), "buildBridgeSessionExportPayload should serialize diagnostic flow summary");
    check(functionBody.includes('readout_completion_summary: readoutCompletionSummary,'), "buildBridgeSessionExportPayload should serialize readout completion summary");
    check(functionBody.includes('analysis_readiness_summary: analysisReadinessSummary,'), "buildBridgeSessionExportPayload should serialize analysis readiness summary");
    check(functionBody.includes('readout_request_plan_gate_summary: readoutRequestPlanGateSummary,'), "buildBridgeSessionExportPayload should serialize readout request plan gate summary");
  }
};
const bridgeDiagnosticImportFunctionChecks = () => {
  check(Boolean(bridgeDiagnosticImportFunctionSource), "buildBridgeDiagnosticImport is missing from obd-readonly.js");
  if (bridgeDiagnosticImportFunctionSource) {
    const functionBody = bridgeDiagnosticImportFunctionSource[0];
    check(functionBody.includes('const summary = resolveBridgeSummary(parts);'), "buildBridgeDiagnosticImport should resolve bridge summary before rebuilding import payload");
    check(functionBody.includes('const metadataFields = buildSummaryMetadataFields(summary);'), "buildBridgeDiagnosticImport should rebuild normalized summary metadata");
    check(functionBody.includes('const nestedSessionMetadata = getSessionMetadataOverrides(parts.bridgeSession || parts.bridge_session || parts.session || {});'), "buildBridgeDiagnosticImport should derive nested bridge session metadata overrides");
    check(functionBody.includes('const exportPayload = buildBridgeSessionExportPayload(summary);'), "buildBridgeDiagnosticImport should rebuild bridge export payload from resolved summary");
    check(functionBody.includes('const coreSessionStatus = summary.coreSessionStatus') && functionBody.includes('coreSessionStatus,'), "buildBridgeDiagnosticImport should preserve core session status");
    check(functionBody.includes('const diagnosticFlowSummary = summary.diagnosticFlowSummary') && functionBody.includes('diagnosticFlowSummary,'), "buildBridgeDiagnosticImport should preserve diagnostic flow summary");
    check(functionBody.includes('const readoutCompletionSummary = summary.readoutCompletionSummary') && functionBody.includes('readoutCompletionSummary,'), "buildBridgeDiagnosticImport should preserve readout completion summary");
    check(functionBody.includes('const analysisReadinessSummary = summary.analysisReadinessSummary') && functionBody.includes('analysisReadinessSummary,'), "buildBridgeDiagnosticImport should preserve analysis readiness summary");
    check(functionBody.includes('const readoutRequestPlanGateSummary = summary.readoutRequestPlanGateSummary') && functionBody.includes('readoutRequestPlanGateSummary,'), "buildBridgeDiagnosticImport should preserve readout request plan gate summary");
  }
};
const sessionMetadataOverridesFunctionChecks = () => {
  check(Boolean(sessionMetadataOverridesFunctionSource), "getSessionMetadataOverrides is missing from obd-readonly.js");
  if (sessionMetadataOverridesFunctionSource) {
    const functionBody = sessionMetadataOverridesFunctionSource[0];
    check(functionBody.includes('vehicleProfile: sessionInput.vehicle_profile || sessionInput.vehicleProfile || null,'), "getSessionMetadataOverrides should normalize vehicle profile aliases");
    check(functionBody.includes('readoutCoverage: sessionInput.readout_coverage || sessionInput.readoutCoverage || null,'), "getSessionMetadataOverrides should normalize readout coverage aliases");
    check(functionBody.includes('toolHints: mergeUniqueStrings(sessionInput.tool_hints, sessionInput.toolHints),'), "getSessionMetadataOverrides should merge tool hint aliases");
    check(functionBody.includes('warnings: mergeUniqueStrings(sessionInput.warnings, sessionInput.warning_flags, sessionInput.warningFlags),'), "getSessionMetadataOverrides should merge warning aliases");
    check(functionBody.includes('sourceLength: pickDefined(sessionInput.source_length, sessionInput.sourceLength, null),'), "getSessionMetadataOverrides should normalize source length aliases");
  }
};
const nestedSessionMetadataMergeFunctionChecks = () => {
  check(Boolean(nestedSessionMetadataMergeFunctionSource), "mergeNestedSessionMetadata is missing from obd-readonly.js");
  if (nestedSessionMetadataMergeFunctionSource) {
    const functionBody = nestedSessionMetadataMergeFunctionSource[0];
    check(functionBody.includes('readoutCoverage: pickDefined(base.readoutCoverage, base.readout_coverage, nested.readoutCoverage, nested.readout_coverage, null),'), "mergeNestedSessionMetadata should prefer outer readout coverage before nested aliases");
    check(functionBody.includes('toolHints: mergeUniqueStrings(base.toolHints, base.tool_hints, nested.toolHints, nested.tool_hints),'), "mergeNestedSessionMetadata should merge outer and nested tool hints");
    check(functionBody.includes('warnings: mergeUniqueStrings(base.warnings, base.warning_flags, base.warningFlags, nested.warnings, nested.warning_flags, nested.warningFlags),'), "mergeNestedSessionMetadata should merge outer and nested warning aliases");
    check(functionBody.includes('sourceLength: pickDefined(base.sourceLength, base.source_length, nested.sourceLength, nested.source_length, null),'), "mergeNestedSessionMetadata should prefer outer source length before nested aliases");
    check(functionBody.includes('].some((value) => value === true)\r\n        ? true'), "mergeNestedSessionMetadata should preserve true hadSensitiveIdentifier across outer and nested metadata");
  }
};
const diagnosticSessionInputFunctionChecks = () => {
  check(Boolean(diagnosticSessionInputFunctionSource), "getDiagnosticSessionInput is missing from obd-readonly.js");
  if (diagnosticSessionInputFunctionSource) {
    const functionBody = diagnosticSessionInputFunctionSource[0];
    check(functionBody.includes('const payload = input.bridgeDiagnosticImport') && functionBody.includes('|| input.bridge_export_payload'), "getDiagnosticSessionInput should accept bridge diagnostic import and export payload aliases");
    check(functionBody.includes('const base = payload && typeof payload === \"object\"\r\n      ? { ...payload, ...input }'), "getDiagnosticSessionInput should layer outer input over payload fields");
    check(functionBody.includes('const nested = input.session') && functionBody.includes('|| input.scan_session') && functionBody.includes('|| input.bridge_session'), "getDiagnosticSessionInput should accept nested session aliases from outer input");
    check(functionBody.includes('|| payload?.bridgeSession') && functionBody.includes('|| payload?.bridge_session') && functionBody.includes('|| payload?.session'), "getDiagnosticSessionInput should accept nested session aliases from bridge payloads");
    check(functionBody.includes('...nested,') && functionBody.includes('...base,'), "getDiagnosticSessionInput should layer nested session fields before base overrides");
    check(functionBody.includes('coreSessionStatus: pickDefined(input.coreSessionStatus, input.core_session_status') && functionBody.includes('nested.coreSessionStatus, nested.core_session_status'), "getDiagnosticSessionInput should preserve imported core session status aliases");
    check(functionBody.includes('diagnosticFlowSummary: pickDefined(input.diagnosticFlowSummary, input.diagnostic_flow_summary') && functionBody.includes('nested.diagnosticFlowSummary, nested.diagnostic_flow_summary'), "getDiagnosticSessionInput should preserve imported diagnostic flow aliases");
    check(functionBody.includes('readoutCompletionSummary: pickDefined(input.readoutCompletionSummary, input.readout_completion_summary') && functionBody.includes('nested.readoutCompletionSummary, nested.readout_completion_summary'), "getDiagnosticSessionInput should preserve imported readout completion aliases");
    check(functionBody.includes('analysisReadinessSummary: pickDefined(input.analysisReadinessSummary, input.analysis_readiness_summary') && functionBody.includes('nested.analysisReadinessSummary, nested.analysis_readiness_summary'), "getDiagnosticSessionInput should preserve imported analysis readiness aliases");
    check(functionBody.includes('readoutRequestPlanGateSummary: pickDefined(input.readoutRequestPlanGateSummary, input.readout_request_plan_gate_summary') && functionBody.includes('nested.readoutRequestPlanGateSummary, nested.readout_request_plan_gate_summary'), "getDiagnosticSessionInput should preserve imported readout request plan gate aliases");
  }
};
const resolvedSessionMetadataFunctionChecks = () => {
  check(Boolean(resolvedSessionMetadataFunctionSource), "buildResolvedSessionMetadata is missing from obd-readonly.js");
  if (resolvedSessionMetadataFunctionSource) {
    const functionBody = resolvedSessionMetadataFunctionSource[0];
    check(functionBody.includes('vehicleProfile: metadataOverrides.vehicleProfile,'), "buildResolvedSessionMetadata should preserve explicit vehicle profile metadata");
    check(functionBody.includes('vehicleApplicability: normalizeVehicleApplicabilitySnapshot(metadataOverrides.vehicleApplicability || {}),'), "buildResolvedSessionMetadata should normalize vehicle applicability metadata");
    check(functionBody.includes('toolHints: mergeUniqueStrings(metadataOverrides.toolHints),'), "buildResolvedSessionMetadata should merge metadata tool hints");
    check(functionBody.includes('hadSensitiveIdentifier: ecuInfoSnapshot.hadSensitiveIdentifier === true') && functionBody.includes('|| metadataOverrides.hadSensitiveIdentifier === true,'), "buildResolvedSessionMetadata should preserve sensitive-identifier metadata from ECU info or overrides");
    check(functionBody.includes('sourceLength: Number.isFinite(Number(metadataOverrides.sourceLength))'), "buildResolvedSessionMetadata should sanitize metadata source length");
  }
};
const coreSessionStatusFunctionChecks = () => {
  check(Boolean(coreSessionStatusFunctionSource), "buildCoreSessionStatus is missing from obd-readonly.js");
  if (coreSessionStatusFunctionSource) {
    const functionBody = coreSessionStatusFunctionSource[0];
    check(functionBody.includes('...(Array.isArray(normalizedCoverage.emptyIds) ? normalizedCoverage.emptyIds : []),'), "buildCoreSessionStatus should derive empty readout ids from normalized coverage");
    check(functionBody.includes('onboardMonitorSnapshot = null,'), "buildCoreSessionStatus should accept onboard monitor snapshots");
    check(functionBody.includes('const coverageItems = (normalizedCoverage.items || [])'), "buildCoreSessionStatus should normalize explicit readout coverage items once");
    check(functionBody.includes('const coverageStatusById = new Map(coverageItems.map((item) => [item.id, item.status]));'), "buildCoreSessionStatus should index explicit readout coverage item statuses");
    check(functionBody.includes('const coverageLabelById = new Map(coverageItems.map((item) => [item.id, item.label || item.id]));'), "buildCoreSessionStatus should index explicit readout coverage item labels");
    check(functionBody.includes('const isCoverageCapturedReadout = (id) => coverageStatusById.get(id) === "captured";'), "buildCoreSessionStatus should detect captured readouts from coverage item status");
    check(functionBody.includes('{ id: "onboard_monitor_snapshot", captured: isCapturedReadout(onboardMonitorSnapshot, "tests") || isCoverageCapturedReadout("onboard_monitor_snapshot") }'), "buildCoreSessionStatus should count onboard monitor snapshots as core readouts");
    check(functionBody.includes('const requiredReadoutIds = requiredReadouts.map((item) => item.id);'), "buildCoreSessionStatus should expose the required core readout id set");
    check(functionBody.includes('const coverageEmptyReadoutIds = (normalizedCoverage.items || [])'), "buildCoreSessionStatus should derive empty readouts from coverage item status");
    check(functionBody.includes('.filter((item) => !item.captured && !emptyReadoutIds.includes(item.id))'), "buildCoreSessionStatus should not keep empty readouts in remaining readouts");
    check(functionBody.includes('const pendingReadoutIds = [...remainingReadoutIds, ...emptyReadoutIds];'), "buildCoreSessionStatus should combine missing and empty readouts as pending readouts");
    check(functionBody.includes('&& !isCoverageCapturedReadout(item)'), "buildCoreSessionStatus should prefer captured coverage item status over conflicting empty coverage ids");
    check(functionBody.includes('const readoutStates = requiredReadouts.map((item) => ({'), "buildCoreSessionStatus should build per-readout state entries");
    check(functionBody.includes('label: coverageLabelById.get(item.id) || item.id,'), "buildCoreSessionStatus should expose per-readout labels");
    check(functionBody.includes('priority: fallbackPriorityById[item.id] || 0,'), "buildCoreSessionStatus should expose per-readout fallback priority");
    check(functionBody.includes('status: item.captured ? "captured" : emptyReadoutIds.includes(item.id) ? "empty" : "missing"'), "buildCoreSessionStatus should classify per-readout state as captured, empty, or missing");
    check(functionBody.includes('const readoutStateById = Object.fromEntries(readoutStates.map((item) => [item.id, { ...item }]));'), "buildCoreSessionStatus should index per-readout states by id");
    check(functionBody.includes('const pendingReadoutStates = pendingReadoutIds') && functionBody.includes('.map((id) => readoutStateById[id])'), "buildCoreSessionStatus should expose pending readout state entries");
    check(functionBody.includes('const pendingReadoutStateById = Object.fromEntries(pendingReadoutStates.map((item) => [item.id, { ...item }]));'), "buildCoreSessionStatus should index pending readout states by id");
    check(functionBody.includes('const pendingReadoutQueue = pendingReadoutStates.map((item, index) => ({') && functionBody.includes('position: index + 1,') && functionBody.includes('isNext: index === 0'), "buildCoreSessionStatus should expose ordered pending readout queue entries");
    check(functionBody.includes('const pendingReadoutQueueById = Object.fromEntries(pendingReadoutQueue.map((item) => [item.id, { ...item }]));'), "buildCoreSessionStatus should index pending readout queue entries by id");
    check(functionBody.includes('const nextPendingReadoutId = pendingReadoutIds[0] || null;') && functionBody.includes('const nextPendingReadoutState = nextPendingReadoutId ? pendingReadoutStateById[nextPendingReadoutId] || null : null;'), "buildCoreSessionStatus should expose the next pending readout cursor");
    check(functionBody.includes('const pendingReadoutQueueSummary = {') && functionBody.includes('hasPendingReadouts: pendingReadoutQueue.length > 0,') && functionBody.includes('nextReadoutStatus: nextPendingReadoutState?.status || null,') && functionBody.includes('pendingPercent: readoutStates.length') && functionBody.includes('remainingAfterNextCount: Math.max(0, pendingReadoutQueue.length - 1)'), "buildCoreSessionStatus should expose pending readout queue summary");
    check(functionBody.includes('const readoutStatesByStatus = {') && functionBody.includes('captured: readoutStates.filter((item) => item.status === "captured").map((item) => ({ ...item }))') && functionBody.includes('missing: readoutStates.filter((item) => item.status === "missing").map((item) => ({ ...item }))'), "buildCoreSessionStatus should group per-readout states by status");
    check(functionBody.includes('const readoutStateSummary = {'), "buildCoreSessionStatus should summarize per-readout states");
    check(functionBody.includes('capturedCount: capturedReadoutIds.length') && functionBody.includes('emptyCount: emptyReadoutIds.length') && functionBody.includes('missingCount: remainingReadoutIds.length') && functionBody.includes('pendingCount: pendingReadoutIds.length') && functionBody.includes('openCount: pendingReadoutIds.length'), "buildCoreSessionStatus should expose readout state counts");
    check(functionBody.includes('const capturedReadoutPercent = readoutStates.length') && functionBody.includes('capturedPercent: capturedReadoutPercent,') && functionBody.includes('pendingPercent: pendingReadoutQueueSummary.pendingPercent,'), "buildCoreSessionStatus should expose direct readout state percents");
    check(functionBody.includes('attemptedCount: capturedReadoutIds.length + emptyReadoutIds.length') && functionBody.includes('attemptedPercent:'), "buildCoreSessionStatus should expose attempted readout progress");
    check(functionBody.includes('const readoutProgressSummary = {') && functionBody.includes('requiredCount: requiredReadoutIds.length') && functionBody.includes('completionPercent'), "buildCoreSessionStatus should expose one consolidated readout progress summary");
    check(functionBody.includes('const readoutCompletionSummary = {') && functionBody.includes('complete: pendingReadoutIds.length === 0,') && functionBody.includes('pendingIds: [...pendingReadoutIds],'), "buildCoreSessionStatus should expose grouped readout completion details");
    check(functionBody.includes('requiredCount: requiredReadoutIds.length,') && functionBody.includes('capturedCount: capturedReadoutIds.length,') && functionBody.includes('pendingCount: pendingReadoutIds.length,'), "buildCoreSessionStatus should expose readout completion counts beside ids");
    check(functionBody.includes('const blockingWarningIds = resolveWarningList(warnings).filter((warning) => ('), "buildCoreSessionStatus should derive blocking warning ids from normalized warnings");
    check(functionBody.includes('const fallbackNextRecommendedReadoutId = fallbackCandidateIds'), "buildCoreSessionStatus should derive fallback next recommended readout id");
    check(functionBody.includes('const nextReadoutCandidate = nextReadoutCandidates[0] ? { ...nextReadoutCandidates[0] } : null;'), "buildCoreSessionStatus should preserve the resolved next readout candidate details");
    check(functionBody.includes('const nextRecommendedReadoutId = nextReadoutCandidate?.id || fallbackNextRecommendedReadoutId;'), "buildCoreSessionStatus should resolve the next recommended readout id once");
    check(functionBody.includes('const nextReadoutSource = nextReadoutCandidate') && functionBody.includes('? "explicit_candidate"') && functionBody.includes('? "fallback_state"'), "buildCoreSessionStatus should identify next-readout source");
    check(functionBody.includes('const nextReadoutState = readoutStates.find((item) => item.id === nextRecommendedReadoutId) || null;'), "buildCoreSessionStatus should expose the state for the next recommended readout");
    check(functionBody.includes('const nextReadoutSummary = nextRecommendedReadoutId ? {') && functionBody.includes('queuePosition: nextReadoutQueueEntry?.position || null,') && functionBody.includes('isPending: pendingReadoutIds.includes(nextRecommendedReadoutId),'), "buildCoreSessionStatus should summarize the next readout action");
    check(source.includes('function buildReadOnlyNextReadoutRequest(nextReadoutSummary = null)') && source.includes('schemaVersion: "read_only_next_readout_request_v1"'), "obd-readonly should expose read-only next readout request metadata");
    check(source.includes('freeze_frame_snapshot: { bridgeIntent: "read_freeze_frame", serviceMode: "02", pid: null }') && source.includes('vehicleCommandEnabled: false,'), "read-only next readout request metadata should map readout ids to safe bridge intents");
    check(functionBody.includes('const nextReadoutRequest = buildReadOnlyNextReadoutRequest(nextReadoutSummary);') && functionBody.includes('nextReadoutSummary.readoutRequest = nextReadoutRequest;'), "buildCoreSessionStatus should attach read-only request metadata to the next readout summary");
    check(functionBody.includes('const pendingReadoutRequestQueue = pendingReadoutQueue') && functionBody.includes('const pendingReadoutRequestQueueById = Object.fromEntries(pendingReadoutRequestQueue.map((item) => [item.readoutId, { ...item }]));'), "buildCoreSessionStatus should expose read-only request metadata for the pending readout queue");
    check(functionBody.includes('const pendingReadoutRequestPlan = {') && functionBody.includes('schemaVersion: "read_only_readout_request_plan_v1"') && functionBody.includes('vehicleCommandEnabled: false'), "buildCoreSessionStatus should expose a read-only pending readout request plan");
    check(functionBody.includes('mappedCount: mappedPendingReadoutRequests.length,') && functionBody.includes('unmappedRequestIds: [...unmappedPendingReadoutRequestIds],'), "buildCoreSessionStatus should summarize mapped and unmapped readout request plan entries");
    check(source.includes('function buildReadoutRequestPlanSafetySummary(entries = [], unmappedRequestIds = [])') && source.includes('const blockedReasonIds = ['), "obd-readonly should summarize readout request plan safety");
    check(source.includes('unmapped_readout_requests') && source.includes('non_read_only_requests') && source.includes('transmitting_requests'), "readout request plan safety should expose blocked reason ids");
    check(source.includes('blockedReasonById: {') && source.includes('transmitting_requests: { count: transmittingRequestIds.length'), "readout request plan safety should expose blocked reason details");
    check(functionBody.includes('const readoutRequestPlanSafetySummary = buildReadoutRequestPlanSafetySummary(pendingReadoutRequestPlanEntries, unmappedPendingReadoutRequestIds);') && functionBody.includes('...readoutRequestPlanSafetySummary,'), "buildCoreSessionStatus should attach readout request plan safety summary");
    check(functionBody.includes('const readoutRequestPlanGateSummary = {') && functionBody.includes('schemaVersion: "readout_request_plan_gate_v1"'), "buildCoreSessionStatus should expose a readout request plan gate summary");
    check(functionBody.includes('nextBlockedReasonId: requestPlanBlockedReasonIds[0] || null,') && functionBody.includes('vehicleCommandEnabled: false'), "readout request plan gate should expose next blocked reason and stay read-only");
    check(functionBody.includes('Object.assign(pendingReadoutQueueSummary, {') && functionBody.includes('recommendedReadoutId: nextReadoutSummary?.id || null,') && functionBody.includes('recommendedReadoutQueuePosition: nextReadoutSummary?.queuePosition || null,'), "buildCoreSessionStatus should attach the recommended readout cursor to the pending queue summary");
    check(functionBody.includes('const analysisBlockers = [') && functionBody.includes('"missing_readouts"') && functionBody.includes('"empty_readouts"') && functionBody.includes('"blocking_warnings"'), "buildCoreSessionStatus should expose analysis blocker categories");
    check(functionBody.includes('const analysisBlockerById = {') && functionBody.includes('missing_readouts: { count: remainingReadoutIds.length, readoutIds: [...remainingReadoutIds] }') && functionBody.includes('blocking_warnings: { count: blockingWarningIds.length, warningIds: [...blockingWarningIds] }'), "buildCoreSessionStatus should index analysis blocker details by id");
    check(functionBody.includes('const analysisBlockerSummary = {') && functionBody.includes('missingReadoutCount: remainingReadoutIds.length') && functionBody.includes('emptyReadoutCount: emptyReadoutIds.length') && functionBody.includes('blockingWarningCount: blockingWarningIds.length'), "buildCoreSessionStatus should expose analysis blocker counts");
    check(functionBody.includes('const analysisChecklist = [') && functionBody.includes('id: "required_readouts"') && functionBody.includes('id: "vehicle_applicability"'), "buildCoreSessionStatus should expose an analysis readiness checklist");
    check(functionBody.includes('const analysisChecklistById = Object.fromEntries(analysisChecklist.map((item) => [item.id, { ...item }]));'), "buildCoreSessionStatus should index analysis readiness checklist entries by id");
    check(functionBody.includes('const analysisChecklistSummary = {') && functionBody.includes('reviewCount: analysisChecklist.filter((item) => item.state === "review").length,') && functionBody.includes('ready: analysisBlockers.length === 0'), "buildCoreSessionStatus should summarize analysis readiness checklist state");
    check(functionBody.includes('const readyForAnalysis = analysisBlockers.length === 0;'), "buildCoreSessionStatus should require no analysis blockers before analysis-ready");
    check(functionBody.includes('const coreStatus = readyForAnalysis ? "analysis_ready"') && functionBody.includes('const coreWorkflowSummary = {') && functionBody.includes('nextAction: readyForAnalysis ? "start_analysis"'), "buildCoreSessionStatus should expose core workflow status and next action");
    check(functionBody.includes('nextReadoutLabel: nextReadoutSummary?.label || null,') && functionBody.includes('nextReadoutSource: nextReadoutSummary?.source || null,'), "buildCoreSessionStatus should expose actionable next readout workflow details");
    check(functionBody.includes('const analysisReadinessSummary = {') && functionBody.includes('blockerIds: [...analysisBlockers],') && functionBody.includes('nextReadoutId: nextReadoutSummary?.id || null,'), "buildCoreSessionStatus should expose one analysis readiness summary");
    check(functionBody.includes('blockerSummary: analysisBlockerSummary,') && functionBody.includes('blockersById: analysisBlockerById,'), "buildCoreSessionStatus should carry blocker details into analysis readiness summary");
    check(functionBody.includes('checklist: analysisChecklist,') && functionBody.includes('checklistSummary: analysisChecklistSummary,'), "buildCoreSessionStatus should carry checklist details into analysis readiness summary");
    check(functionBody.includes('readoutRequestPlanGateSummary,') && functionBody.includes('pendingReadoutRequestPlan,'), "buildCoreSessionStatus should return readout request plan gate metadata");
    check(source.includes('function buildDiagnosticFlowSummary(coreSessionStatus = {})') && source.includes('schemaVersion: "diagnostic_flow_summary_v1"'), "obd-readonly should expose a stable diagnostic flow summary builder");
    check(source.includes('nextReadoutLabel: workflow.nextReadoutLabel || readiness.nextReadoutLabel') && source.includes('nextReadoutSource: workflow.nextReadoutSource || readiness.nextReadoutSource'), "diagnostic flow summaries should carry actionable next readout details");
    check(source.includes('const queueSummary = coreSessionStatus?.pendingReadoutQueueSummary || {};') && source.includes('pendingQueueNextReadoutId: queueSummary.nextReadoutId || coreSessionStatus?.nextPendingReadoutId || null,') && source.includes('recommendedReadoutId: queueSummary.recommendedReadoutId || coreSessionStatus?.nextRecommendedReadoutId || null,'), "diagnostic flow summaries should carry pending queue and recommended readout cursors");
    check(source.includes('canStartAnalysis: readyForAnalysis,') && source.includes('analysisBlocked: !readyForAnalysis,') && source.includes('readoutCollectionRequired: pendingReadoutCount > 0,'), "diagnostic flow summaries should expose direct safe-to-analyze flags");
    check(source.includes('nextReadoutBridgeIntent: nextReadoutRequest?.bridgeIntent || null,') && source.includes('nextReadoutExecutionEnabled: nextReadoutRequest?.executionEnabled === true,'), "diagnostic flow summaries should expose read-only next readout request fields");
    check(source.includes('pendingReadoutRequestCount: pendingReadoutRequestQueue.length,') && source.includes('pendingReadoutRequestNext: pendingReadoutRequestQueue.find((item) => item.isNext) || pendingReadoutRequestQueue[0] || null,'), "diagnostic flow summaries should expose pending readout request queue metadata");
    check(source.includes('pendingReadoutRequestPlan,') && source.includes('requestIds: pendingReadoutRequestQueue.map((item) => item.readoutId),'), "diagnostic flow summaries should expose read-only readout request plan metadata");
    check(source.includes('allMapped: unmappedPendingReadoutRequestIds.length === 0,') && source.includes('bridgeIntents: [...new Set(mappedPendingReadoutRequests.map((item) => item.bridgeIntent))],'), "diagnostic flow readout request plans should expose mapping completeness");
    check(source.includes('requestPlanMappedCount: Number.isFinite(Number(pendingReadoutRequestPlan?.mappedCount))') && source.includes('requestPlanSafeForBridgePlanning: pendingReadoutRequestPlan?.safeForBridgePlanning === true,'), "diagnostic flow summaries should expose direct request plan safety fields");
    check(source.includes('requestPlanBlockedReasonIds: Array.isArray(pendingReadoutRequestPlan?.blockedReasonIds)') && source.includes('requestPlanBlockedReasonById: pendingReadoutRequestPlan?.blockedReasonById'), "diagnostic flow summaries should expose request plan blocked reasons");
    check(source.includes('readoutRequestPlanGateSummary,') && source.includes('requestPlanGateState: readoutRequestPlanGateSummary.state || "unknown",'), "diagnostic flow summaries should expose request plan gate state");
    check(source.includes('requiredReadoutCount: readCount("requiredCount", coreSessionStatus?.requiredReadoutIds),') && source.includes('missingReadoutCount: readCount("missingCount", coreSessionStatus?.missingReadoutIds || coreSessionStatus?.remainingReadoutIds),'), "diagnostic flow summaries should carry readout completion counts");
    check(source.includes('const checklistSummary = coreSessionStatus?.analysisChecklistSummary || readiness.checklistSummary || {};') && source.includes('checklistCompleteCount: readChecklistCount("completeCount"),') && source.includes('checklistBlockedIds: Array.isArray(checklistSummary?.blockedIds) ? [...checklistSummary.blockedIds] : [],'), "diagnostic flow summaries should carry analysis checklist counts and ids");
    check(source.includes('const checklistById = coreSessionStatus?.analysisChecklistById || readiness.checklistById || {};') && source.includes('const vehicleApplicabilityChecklist = checklistById.vehicle_applicability || null;'), "diagnostic flow summaries should read vehicle applicability checklist state");
    check(source.includes('vehicleApplicabilityReviewRequired,') && source.includes('vehicleApplicabilityBlocking,'), "diagnostic flow summaries should expose vehicle applicability review and blocking flags");
    check(source.includes('function buildImportedCoreComparisonSummary(importedCoreSessionStatus = null, currentCoreSessionStatus = {})') && source.includes('schemaVersion: "imported_core_comparison_v1"'), "obd-readonly should expose imported core comparison summaries");
    check(source.includes('requiredReadoutDelta: currentRequiredCount - importedRequiredCount,') && source.includes('emptyReadoutDelta: currentEmptyCount - importedEmptyCount,'), "imported core comparison should compare readout completion counts");
    check(source.includes('blockerCountDelta: currentBlockerCount - importedBlockerCount,') && source.includes('comparison.emptyReadoutDelta || comparison.blockerCountDelta'), "imported core comparison should compare blocker counts");
    check(source.includes('checklistCompleteDelta: currentChecklistCompleteCount - importedChecklistCompleteCount,') && source.includes('checklistPendingDelta: currentChecklistPendingCount - importedChecklistPendingCount,'), "imported core comparison should compare analysis checklist counts");
    check(source.includes('requestPlanCountDelta: currentRequestPlanCount - importedRequestPlanCount,') && source.includes('requestPlanBridgeIntentsChanged: importedRequestPlanIntents.join("|") !== currentRequestPlanIntents.join("|"),'), "imported core comparison should compare pending readout request plans");
    check(source.includes('requestPlanMappedDelta: currentRequestPlanMappedCount - importedRequestPlanMappedCount,') && source.includes('requestPlanUnmappedDelta: currentRequestPlanUnmappedCount - importedRequestPlanUnmappedCount,'), "imported comparisons should compare request plan mapping counts");
    check(source.includes('importedNextReadoutLabel: importedFlow.nextReadoutLabel || null,') && source.includes('nextReadoutDetailsChanged: (importedFlow.nextReadoutLabel || null) !== (currentFlow.nextReadoutLabel || null)'), "imported core comparison should compare next readout details");
    check(source.includes('function buildImportedDiagnosticFlowComparisonSummary(importedDiagnosticFlowSummary = null, currentDiagnosticFlowSummary = {})') && source.includes('schemaVersion: "imported_diagnostic_flow_comparison_v1"'), "obd-readonly should expose imported diagnostic flow comparison summaries");
    check(source.includes('requiredReadoutDelta: currentRequiredCount - importedRequiredCount,') && source.includes('missingReadoutDelta: currentMissingCount - importedMissingCount,'), "imported diagnostic flow comparison should compare readout completion counts");
    check(source.includes('importedChecklistBlockingCount,') && source.includes('checklistBlockingDelta: currentChecklistBlockingCount - importedChecklistBlockingCount,'), "imported diagnostic flow comparison should compare checklist blocker counts");
    check(source.includes('importedRequestPlanBridgeIntents: [...importedRequestPlanIntents],') && source.includes('currentRequestPlanBridgeIntents: [...currentRequestPlanIntents],'), "imported diagnostic flow comparison should expose request plan bridge intent lists");
    check(source.includes('importedNextReadoutLabel: importedDiagnosticFlowSummary.nextReadoutLabel || null,') && source.includes('nextReadoutDetailsChanged: (importedDiagnosticFlowSummary.nextReadoutLabel || null) !== (currentFlow.nextReadoutLabel || null)'), "imported diagnostic flow comparison should compare next readout details");
    check(source.includes('function buildImportedReadoutCompletionComparisonSummary(importedReadoutCompletionSummary = null, currentReadoutCompletionSummary = {})') && source.includes('schemaVersion: "imported_readout_completion_comparison_v1"'), "obd-readonly should expose imported readout completion comparison summaries");
    check(source.includes('const readCount = (summary, ids, field) => Number.isFinite(Number(summary?.[field])) ? Number(summary[field]) : ids.length;') && source.includes('requiredCountDelta: currentRequiredCount - importedRequiredCount,'), "imported readout completion comparison should support count-only summaries");
    check(source.includes('function buildImportedAnalysisReadinessComparisonSummary(importedAnalysisReadinessSummary = null, currentAnalysisReadinessSummary = {})') && source.includes('schemaVersion: "imported_analysis_readiness_comparison_v1"'), "obd-readonly should expose imported analysis readiness comparison summaries");
    check(source.includes('importedNextReadoutLabel: importedAnalysisReadinessSummary.nextReadoutLabel || null,') && source.includes('nextReadoutDetailsChanged: (importedAnalysisReadinessSummary.nextReadoutLabel || null) !== (currentSummary.nextReadoutLabel || null)'), "imported analysis readiness comparison should compare next readout details");
    check(source.includes('function buildImportedReadoutRequestPlanGateComparisonSummary(importedGateSummary = null, currentGateSummary = {})') && source.includes('schemaVersion: "imported_readout_request_plan_gate_comparison_v1"'), "obd-readonly should expose imported readout request plan gate comparison summaries");
    check(source.includes('safeForBridgePlanningChanged: (importedGateSummary.safeForBridgePlanning === true) !== (currentSummary.safeForBridgePlanning === true)') && source.includes('blockedReasonIdsChanged: importedBlockedReasonIds.join("|") !== currentBlockedReasonIds.join("|")'), "imported readout request plan gate comparison should compare safety and blocked reasons");
    check(source.includes('function buildImportedSessionComparisonSummary({') && source.includes('schemaVersion: "imported_session_comparison_v1"'), "obd-readonly should expose imported session comparison summaries");
    check(source.includes('{ id: "readout_request_plan_gate_summary", comparison: readoutRequestPlanGateComparison }') && source.includes('requestPlanGateChanged: comparisons.some'), "imported session comparison should include readout request plan gate section summaries");
    check(source.includes('const hasComparisonMetricChanges = (comparison = {}) => Number(comparison.completionDelta') && source.includes('comparison.unmappedCountDelta') && source.includes('completionChanged: comparisons.some((item) => hasComparisonMetricChanges(item))'), "imported session comparison summaries should use one metric-change helper for section and top-level completion flags");
    check(source.includes('const sectionSummaries = sectionInputs') && source.includes('const changedSectionSummaries = sectionSummaries.filter((item) => item.changed);'), "imported session comparison summaries should expose section summaries");
    check(source.includes('const unchangedSectionSummaries = sectionSummaries.filter((item) => !item.changed);') && source.includes('unchangedSectionSummaryById,'), "imported session comparison summaries should expose unchanged section maps");
    check(source.includes('const sectionSummaryById = sectionSummaries.reduce((byId, item) => {') && source.includes('changedSectionSummaryById,'), "imported session comparison summaries should expose section summary maps");
    check(source.includes('const getSectionChangeReasonIds = (comparison = {}) => [') && source.includes('changeReasonIds,') && source.includes('changeReasonCount: changeReasonIds.length,'), "imported session comparison section summaries should expose change reasons");
    check(source.includes('const changedReasonIds = [...new Set(changedSectionSummaries.flatMap((item) => item.changeReasonIds || []))];') && source.includes('changedReasonCount: changedReasonIds.length,'), "imported session comparison summaries should expose top-level change reasons");
    check(source.includes('const changedReasonCountsById = changedReasonIds.reduce((counts, reasonId) => {') && source.includes('primaryChangedReasonId,'), "imported session comparison summaries should expose reason counts and primary reason");
    check(source.includes('const changedSectionsByReasonId = changedReasonIds.reduce((sectionsByReason, reasonId) => {') && source.includes('changedSectionsByReasonId,'), "imported session comparison summaries should expose sections by change reason");
    check(source.includes('const changedReasonSummaries = changedReasonIds.map((reasonId) => ({') && source.includes('changedReasonSummaryById,'), "imported session comparison summaries should expose reason summary maps");
    check(source.includes('const primaryChangedReasonSummary = primaryChangedReasonId ? changedReasonSummaryById[primaryChangedReasonId] || null : null;') && source.includes('unchangedSectionCount: unchangedSectionIds.length,'), "imported session comparison summaries should expose primary reason details and unchanged count");
    check(source.includes('hasChanges: changedSectionIds.length > 0') && source.includes('unchanged: changedSectionIds.length === 0'), "imported session comparison summaries should expose a direct change flag");
    check(source.includes('status: changedSectionIds.length > 0 ? "changed" : "unchanged"') && source.includes('changedSectionCount: changedSectionIds.length'), "imported session comparison summaries should expose status and changed section count");
    check(functionBody.includes('const directCompletionPercent = Math.round((capturedReadoutIds.length / requiredReadouts.length) * 100);'), "buildCoreSessionStatus should calculate direct completion from captured core readouts");
    check(functionBody.includes('Math.max(directCompletionPercent, normalizedCoverage.capturedPercent)'), "buildCoreSessionStatus should preserve explicit readout coverage completion progress");
    check(functionBody.includes('const hasReadoutProgress = capturedReadoutIds.length > 0') && functionBody.includes('|| normalizedCoverage.availableCategories > 0;'), "buildCoreSessionStatus should treat explicit readout coverage progress as collecting readouts");
    check(functionBody.includes('schemaVersion: "core_session_status_v1",'), "buildCoreSessionStatus should expose a stable schema version");
    check(functionBody.includes('status: coreStatus,'), "buildCoreSessionStatus should derive status from analysis readiness and readout progress");
    check(functionBody.includes('requiredReadoutIds,'), "buildCoreSessionStatus should return required core readout ids");
    check(functionBody.includes('missingReadoutIds: remainingReadoutIds,'), "buildCoreSessionStatus should expose missingReadoutIds as an explicit scan-session field");
    check(functionBody.includes('pendingReadoutIds,'), "buildCoreSessionStatus should expose pending readout ids");
    check(functionBody.includes('pendingReadoutStates,'), "buildCoreSessionStatus should expose pending readout state entries");
    check(functionBody.includes('pendingReadoutStateById,'), "buildCoreSessionStatus should expose pending readout states by id");
    check(functionBody.includes('pendingReadoutQueue,'), "buildCoreSessionStatus should expose ordered pending readout queue entries");
    check(functionBody.includes('pendingReadoutQueueById,'), "buildCoreSessionStatus should expose pending readout queue entries by id");
    check(functionBody.includes('pendingReadoutQueueSummary,'), "buildCoreSessionStatus should expose pending readout queue summary");
    check(functionBody.includes('nextPendingReadoutId,') && functionBody.includes('nextPendingReadoutState,'), "buildCoreSessionStatus should expose the next pending readout cursor");
    check(functionBody.includes('readoutStates,'), "buildCoreSessionStatus should expose per-readout state entries");
    check(functionBody.includes('readoutStateById,'), "buildCoreSessionStatus should expose per-readout states by id");
    check(functionBody.includes('readoutStatesByStatus,'), "buildCoreSessionStatus should expose per-readout states grouped by status");
    check(functionBody.includes('readoutStateSummary,'), "buildCoreSessionStatus should expose per-readout state summary");
    check(functionBody.includes('readoutProgressSummary,'), "buildCoreSessionStatus should return consolidated readout progress summary");
    check(functionBody.includes('readoutCompletionSummary,'), "buildCoreSessionStatus should return grouped readout completion details");
    check(functionBody.includes('coreWorkflowSummary,'), "buildCoreSessionStatus should return core workflow summary");
    check(functionBody.includes('nextReadoutCandidate,'), "buildCoreSessionStatus should expose the resolved next readout candidate");
    check(functionBody.includes('nextRecommendedReadoutId,'), "buildCoreSessionStatus should expose the resolved next recommended readout id");
    check(functionBody.includes('nextReadoutSource,'), "buildCoreSessionStatus should expose the next readout source");
    check(functionBody.includes('nextReadoutState,'), "buildCoreSessionStatus should expose the next readout state");
    check(functionBody.includes('nextReadoutSummary,'), "buildCoreSessionStatus should return the next readout summary");
    check(functionBody.includes('analysisBlockers,'), "buildCoreSessionStatus should expose analysis blockers");
    check(functionBody.includes('analysisBlockerById,'), "buildCoreSessionStatus should expose analysis blocker details by id");
    check(functionBody.includes('analysisBlockerSummary,'), "buildCoreSessionStatus should expose analysis blocker summary");
    check(functionBody.includes('analysisChecklist,') && functionBody.includes('analysisChecklistById,') && functionBody.includes('analysisChecklistSummary,'), "buildCoreSessionStatus should return analysis checklist details");
    check(functionBody.includes('analysisReadinessSummary,'), "buildCoreSessionStatus should return analysis readiness summary");
    check(functionBody.includes('readoutRequestPlanGateSummary,') && functionBody.includes('analysisReadinessSummary,'), "buildCoreSessionStatus should return readout request plan gate summary");
  }
};
const nextReadoutCandidatesFunctionChecks = () => {
  check(Boolean(nextReadoutCandidatesFunctionSource), "buildNextReadoutCandidates is missing from obd-readonly.js");
  if (nextReadoutCandidatesFunctionSource) {
    const functionBody = nextReadoutCandidatesFunctionSource[0];
    check(functionBody.includes('const applicabilityNeedsVehicleConfirmation = applicability.status === "partial"') && functionBody.includes('|| applicability.status === "unlisted"') && functionBody.includes('|| applicability.status === "manual";'), "buildNextReadoutCandidates should derive applicability confirmation states");
    check(functionBody.includes('priority: item.id === "ecu_info_snapshot" && (applicability.status === "manual" || applicability.status === "unlisted")') && functionBody.includes('? 102') && functionBody.includes('item.id === "ecu_info_snapshot" && applicability.status === "partial"') && functionBody.includes('? 92'), "buildNextReadoutCandidates should prioritize ecu_info_snapshot for manual, unlisted, and partial applicability");
    check(functionBody.includes('.sort((left, right) => {'), "buildNextReadoutCandidates should sort candidate priorities");
    check(functionBody.includes('if ((applicability.status === "manual" || applicability.status === "unlisted") && left.id !== right.id) {'), "buildNextReadoutCandidates should force ecu_info_snapshot to the front for manual and unlisted applicability");
    check(functionBody.includes('.slice(0, 5);'), "buildNextReadoutCandidates should cap fallback candidates to five items");
  }
};
const resolveNextReadoutCandidatesFunctionChecks = () => {
  check(Boolean(resolveNextReadoutCandidatesFunctionSource), "resolveNextReadoutCandidates is missing from obd-readonly.js");
  if (resolveNextReadoutCandidatesFunctionSource) {
    const functionBody = resolveNextReadoutCandidatesFunctionSource[0];
    check(functionBody.includes('return normalizeNextReadoutCandidates('), "resolveNextReadoutCandidates should normalize resolved candidate lists");
    check(functionBody.includes('Array.isArray(explicitCandidates) && explicitCandidates.length'), "resolveNextReadoutCandidates should prefer explicit candidate arrays when provided");
    check(functionBody.includes('? explicitCandidates'), "resolveNextReadoutCandidates should preserve explicit candidates before fallback generation");
    check(functionBody.includes(': buildNextReadoutCandidates(readoutCoverage, vehicleApplicability || {}, ecuInfoSnapshot, dtcSnapshot, supportedPidMatrix)'), "resolveNextReadoutCandidates should fall back to generated candidates when explicit candidates are absent");
  }
};
const normalizeNextReadoutCandidatesFunctionChecks = () => {
  check(Boolean(normalizeNextReadoutCandidatesFunctionSource), "normalizeNextReadoutCandidates is missing from obd-readonly.js");
  if (normalizeNextReadoutCandidatesFunctionSource) {
    const functionBody = normalizeNextReadoutCandidatesFunctionSource[0];
    check(functionBody.includes('id: String(pickDefined(item.id, item.readout_id, item.readoutId, "") || "")'), "normalizeNextReadoutCandidates should normalize readout id aliases");
    check(functionBody.includes('priority: Number.isFinite(Number(pickDefined(item.priority, item.sort_order, item.sortOrder)))'), "normalizeNextReadoutCandidates should normalize priority aliases");
    check(functionBody.includes('applicabilityStatus: pickDefined(item.applicabilityStatus, item.applicability_status, item.vehicleApplicabilityStatus, item.vehicle_applicability_status, null)'), "normalizeNextReadoutCandidates should normalize applicability status aliases");
    check(functionBody.includes('if (rightPriority !== leftPriority) return rightPriority - leftPriority;'), "normalizeNextReadoutCandidates should sort by normalized priority before fallback ordering");
    check(functionBody.includes('return String(left?.label || left?.id || "").localeCompare(String(right?.label || right?.id || ""), "ja");'), "normalizeNextReadoutCandidates should stabilize ties with Japanese label ordering");
  }
};
const resolveBridgeInfrastructureFunctionChecks = () => {
  check(Boolean(resolveBridgeInfrastructureFunctionSource), "resolveBridgeInfrastructureInputs is missing from obd-readonly.js");
  if (resolveBridgeInfrastructureFunctionSource) {
    const functionBody = resolveBridgeInfrastructureFunctionSource[0];
    check(functionBody.includes('const vciList = allowVciArray && Array.isArray(vciDevicesInput)'), "resolveBridgeInfrastructureInputs should preserve array-form VCI inputs when allowVciArray is enabled");
    check(functionBody.includes('hasBridgeInfrastructureContext: detectBridgeInfrastructureContext({'), "resolveBridgeInfrastructureInputs should derive bridge infrastructure context through detectBridgeInfrastructureContext");
    check(functionBody.includes('readoutCoverageInput,'), "resolveBridgeInfrastructureInputs should pass readout coverage override context into bridge infrastructure detection");
    check(functionBody.includes('honorCoverageOverride'), "resolveBridgeInfrastructureInputs should pass honorCoverageOverride into bridge infrastructure detection");
  }
};
const sessionTemporalContextFunctionChecks = () => {
  check(Boolean(sessionTemporalContextFunctionSource), "resolveSessionTemporalContext is missing from obd-readonly.js");
  if (sessionTemporalContextFunctionSource) {
    const functionBody = sessionTemporalContextFunctionSource[0];
    check(functionBody.includes('protocol: input.protocol') && functionBody.includes('|| dtcSnapshot.protocol') && functionBody.includes('|| supportedPidMatrix.protocol'), "resolveSessionTemporalContext should derive protocol from input before readout snapshots");
    check(functionBody.includes('capturedAt: input.capturedAt') && functionBody.includes('|| input.captured_at'), "resolveSessionTemporalContext should normalize capturedAt aliases from direct input");
    check(functionBody.includes('|| dtcSnapshot.capturedAt') && functionBody.includes('|| supportedPidMatrix.capturedAt'), "resolveSessionTemporalContext should derive capturedAt from readout snapshots");
    check(functionBody.indexOf('protocol: input.protocol') < functionBody.indexOf('capturedAt: input.capturedAt'), "resolveSessionTemporalContext should resolve protocol before capturedAt metadata");
  }
};
const importClassificationFunctionChecks = () => {
  check(Boolean(importClassificationFunctionSource), "resolveImportClassification is missing from obd-readonly.js");
  if (importClassificationFunctionSource) {
    const functionBody = importClassificationFunctionSource[0];
    check(functionBody.includes('function resolveImportClassification(input = null)'), "resolveImportClassification should default missing input to null");
    check(functionBody.includes('input && typeof input === "object"'), "resolveImportClassification should only preserve object classification input");
    check(functionBody.includes('? { ...input } : null;'), "resolveImportClassification should clone object input and fall back to null for non-objects");
  }
};
const readOnlyFlagsFunctionChecks = () => {
  check(Boolean(readOnlyFlagsFunctionSource), "buildReadOnlyFlags is missing from obd-readonly.js");
  if (readOnlyFlagsFunctionSource) {
    const functionBody = readOnlyFlagsFunctionSource[0];
    check(functionBody.includes('retainedRawText = false') && functionBody.includes('wouldTransmit = false'), "buildReadOnlyFlags should default raw retention and transmission to false");
    check(functionBody.includes('vehicleCommandEnabled = undefined'), "buildReadOnlyFlags should only include vehicleCommandEnabled when explicitly provided");
    check(functionBody.includes('retainedRawText,') && functionBody.includes('wouldTransmit'), "buildReadOnlyFlags should always expose retainedRawText and wouldTransmit");
    check(functionBody.includes('if (retainedRawFrames !== undefined) flags.retainedRawFrames = retainedRawFrames;'), "buildReadOnlyFlags should preserve explicit retainedRawFrames values");
    check(functionBody.includes('if (vehicleCommandEnabled !== undefined) flags.vehicleCommandEnabled = vehicleCommandEnabled;'), "buildReadOnlyFlags should preserve explicit vehicleCommandEnabled values");
  }
};
const commonCoreWarningsFunctionChecks = () => {
  check(Boolean(commonCoreWarningsFunctionSource), "appendCommonCoreWarnings is missing from obd-readonly.js");
  if (commonCoreWarningsFunctionSource) {
    const functionBody = commonCoreWarningsFunctionSource[0];
    check(functionBody.includes('if (dtcWarning && hasDtcCodes) warnings.push(dtcWarning);'), "appendCommonCoreWarnings should only emit DTC warnings when DTC codes are present");
    check(functionBody.includes('if ((freezeFrameSnapshot.monitorValues || []).length) warnings.push("freeze_frame_available");'), "appendCommonCoreWarnings should emit freeze-frame availability warnings from monitor values");
    check(functionBody.includes('if (hasReadinessSnapshotInput && readinessSnapshot.incompleteCount > 0) warnings.push("readiness_incomplete");'), "appendCommonCoreWarnings should emit readiness incomplete warnings from readiness snapshots");
    check(functionBody.includes('if (hasOnboardMonitorSnapshotInput && onboardMonitorSnapshot.failedCount > 0) warnings.push("onboard_monitor_test_failed");'), "appendCommonCoreWarnings should emit Mode 06 failure warnings from onboard monitor snapshots");
    check(functionBody.includes('if (hasEcuInfoSnapshotInput && ecuInfoSnapshot.keyItemSummary?.missingCount > 0) warnings.push("mode09_key_items_missing");') && functionBody.includes('if (hasEcuInfoSnapshotInput && ecuInfoSnapshot.supportInfoTypesCaptured === false) warnings.push("mode09_supported_types_unknown");'), "appendCommonCoreWarnings should emit Mode 09 key and supported-type warnings from ECU info snapshots");
    check(functionBody.includes('if (rawPidUndecodedCount > 0) warnings.push("raw_pid_values_need_conversion");') && functionBody.includes('appendVehicleApplicabilityWarnings(warnings, vehicleApplicability || {});'), "appendCommonCoreWarnings should emit raw PID conversion and vehicle applicability warnings");
  }
};
const warningListFunctionChecks = () => {
  check(Boolean(warningListFunctionSource), "resolveWarningList is missing from obd-readonly.js");
  if (warningListFunctionSource) {
    const functionBody = warningListFunctionSource[0];
    check(functionBody.includes('function resolveWarningList(...warningSets)'), "resolveWarningList should accept multiple warning sets");
    check(functionBody.includes('return mergeUniqueStrings(...warningSets);'), "resolveWarningList should deduplicate warning sets through mergeUniqueStrings");
  }
};
const mergeDiagnosticInputsFunctionChecks = () => {
  check(Boolean(mergeDiagnosticInputsFunctionSource), "mergeDiagnosticInputs is missing from obd-readonly.js");
  if (mergeDiagnosticInputsFunctionSource) {
    const functionBody = mergeDiagnosticInputsFunctionSource[0];
    check(functionBody.includes('const scannerTextInput = input.scannerText || input.scanner_text || "";'), "mergeDiagnosticInputs should accept scanner text aliases");
    check(functionBody.includes('input.bridgeImport') && functionBody.includes('input.bridge_diagnostic_import') && functionBody.includes('input.bridge_export_payload'), "mergeDiagnosticInputs should accept bridge import/export aliases");
    check(functionBody.includes('const scannerAnalysis = analyzeScannerText(scannerTextInput);'), "mergeDiagnosticInputs should analyze scanner text before merging");
    check(functionBody.includes('buildBridgeDiagnosticImport(bridgeImportInput)') && functionBody.includes('buildBridgeDiagnosticImport(bridgePartsInput)'), "mergeDiagnosticInputs should normalize bridge import and bridge parts through bridge diagnostic import");
    check(functionBody.includes('if (item.source === "local_bridge") value += 40;') && functionBody.includes('if (item.decoded === false || item.valueType === "raw_hex") value -= 25;'), "mergeDiagnosticInputs should prefer decoded bridge values while penalizing undecoded raw values");
    check(functionBody.includes('scannerAnalysis.monitorValues.forEach((item) => {') && functionBody.includes('(bridgeImport?.monitorValues || bridgeSession?.monitorValues || []).forEach((item) => {'), "mergeDiagnosticInputs should merge scanner and bridge monitor values");
    check(functionBody.includes('const codes = [...new Set([') && functionBody.includes('...scannerAnalysis.codes') && functionBody.includes('...(bridgeImport?.codes || bridgeSession?.codes || [])'), "mergeDiagnosticInputs should deduplicate scanner and bridge DTC codes");
    check(functionBody.includes('const recalculatedMonitorValueSummary = buildMonitorValueSummary(monitorValues);') && functionBody.includes('const recalculatedMonitorInsights = analyzeMonitorValues(monitorValues);'), "mergeDiagnosticInputs should recalculate monitor summaries and insights from merged values");
    check(functionBody.includes('const source = bridgeImport') && functionBody.includes('"scanner_text_and_local_bridge"') && functionBody.includes('"local_bridge"') && functionBody.includes('"scanner_text"'), "mergeDiagnosticInputs should classify merged input source");
    check(functionBody.includes('const importedCoreSessionStatus = bridgeImport?.coreSessionStatus || bridgeSession?.coreSessionStatus || null;') && functionBody.includes('importedCoreSessionStatus,'), "mergeDiagnosticInputs should expose imported core session status separately from recalculated status");
    check(functionBody.includes('const importedDiagnosticFlowSummary = bridgeImport?.diagnosticFlowSummary || bridgeSession?.diagnosticFlowSummary || null;') && functionBody.includes('importedDiagnosticFlowSummary,'), "mergeDiagnosticInputs should expose imported diagnostic flow summary separately from recalculated status");
    check(functionBody.includes('const importedReadoutCompletionSummary = bridgeImport?.readoutCompletionSummary || bridgeSession?.readoutCompletionSummary || null;') && functionBody.includes('importedReadoutCompletionSummary,'), "mergeDiagnosticInputs should expose imported readout completion summary separately from recalculated status");
    check(functionBody.includes('const importedAnalysisReadinessSummary = bridgeImport?.analysisReadinessSummary || bridgeSession?.analysisReadinessSummary || null;') && functionBody.includes('importedAnalysisReadinessSummary,'), "mergeDiagnosticInputs should expose imported analysis readiness summary separately from recalculated status");
    check(functionBody.includes('const importedReadoutRequestPlanGateSummary = bridgeImport?.readoutRequestPlanGateSummary || bridgeSession?.readoutRequestPlanGateSummary || null;') && functionBody.includes('importedReadoutRequestPlanGateSummary,'), "mergeDiagnosticInputs should expose imported readout request plan gate summary separately");
    check(functionBody.includes('const importedCoreComparisonSummary = buildImportedCoreComparisonSummary(importedCoreSessionStatus, coreSessionStatus);') && functionBody.includes('importedCoreComparisonSummary,'), "mergeDiagnosticInputs should compare imported and recalculated core session status");
    check(functionBody.includes('const importedDiagnosticFlowComparisonSummary = buildImportedDiagnosticFlowComparisonSummary(importedDiagnosticFlowSummary, diagnosticFlowSummary);') && functionBody.includes('importedDiagnosticFlowComparisonSummary,'), "mergeDiagnosticInputs should compare imported and recalculated diagnostic flow summary");
    check(functionBody.includes('const importedReadoutCompletionComparisonSummary = buildImportedReadoutCompletionComparisonSummary(importedReadoutCompletionSummary, readoutCompletionSummary);') && functionBody.includes('importedReadoutCompletionComparisonSummary,'), "mergeDiagnosticInputs should compare imported and recalculated readout completion summary");
    check(functionBody.includes('const importedAnalysisReadinessComparisonSummary = buildImportedAnalysisReadinessComparisonSummary(importedAnalysisReadinessSummary, analysisReadinessSummary);') && functionBody.includes('importedAnalysisReadinessComparisonSummary,'), "mergeDiagnosticInputs should compare imported and recalculated analysis readiness summary");
    check(functionBody.includes('const importedReadoutRequestPlanGateComparisonSummary = buildImportedReadoutRequestPlanGateComparisonSummary(importedReadoutRequestPlanGateSummary, readoutRequestPlanGateSummary);') && functionBody.includes('importedReadoutRequestPlanGateComparisonSummary,'), "mergeDiagnosticInputs should compare imported and recalculated readout request plan gate summary");
    check(functionBody.includes('const importedSessionComparisonSummary = buildImportedSessionComparisonSummary({') && functionBody.includes('importedSessionComparisonSummary,'), "mergeDiagnosticInputs should summarize imported session comparison results");
    check(functionBody.includes('const coreSessionStatus = buildCoreSessionStatus({') && functionBody.includes('nextReadoutCandidates: resolvedNextReadoutCandidates'), "mergeDiagnosticInputs should build core session status from merged diagnostic inputs");
    check(functionBody.includes('const diagnosticFlowSummary = buildDiagnosticFlowSummary(coreSessionStatus);') && functionBody.includes('diagnosticFlowSummary,'), "mergeDiagnosticInputs should expose a top-level diagnostic flow summary");
    check(functionBody.includes('const readoutCompletionSummary = coreSessionStatus.readoutCompletionSummary || null;') && functionBody.includes('readoutCompletionSummary,'), "mergeDiagnosticInputs should expose a top-level readout completion summary");
    check(functionBody.includes('const analysisReadinessSummary = coreSessionStatus.analysisReadinessSummary || null;') && functionBody.includes('analysisReadinessSummary,'), "mergeDiagnosticInputs should expose a top-level analysis readiness summary");
    check(functionBody.includes('const readoutRequestPlanGateSummary = coreSessionStatus.readoutRequestPlanGateSummary') && functionBody.includes('readoutRequestPlanGateSummary,'), "mergeDiagnosticInputs should expose a top-level readout request plan gate summary");
    check(functionBody.includes('onboardMonitorSnapshot: bridgeImport?.onboardMonitorSnapshot || bridgeSession?.onboardMonitorSnapshot || null,'), "mergeDiagnosticInputs should pass onboard monitor snapshots into core session status");
    check(functionBody.includes('retainedRawText: false') && functionBody.includes('wouldTransmit: false') && functionBody.includes('vehicleCommandEnabled: false'), "mergeDiagnosticInputs should remain read-only and avoid raw text retention");
  }
};
const readoutCoverageInputFunctionChecks = () => {
  check(Boolean(readoutCoverageInputFunctionSource), "getReadoutCoverageInput is missing from obd-readonly.js");
  if (readoutCoverageInputFunctionSource) {
    const functionBody = readoutCoverageInputFunctionSource[0];
    check(functionBody.includes('function getReadoutCoverageInput(input = {})'), "getReadoutCoverageInput should default to an empty input object");
    check(functionBody.includes('input.readoutCoverage || input.readout_coverage'), "getReadoutCoverageInput should accept direct camelCase and snake_case readout coverage aliases");
    check(functionBody.includes('input.readoutCoverageResponse || input.readout_coverage_response'), "getReadoutCoverageInput should accept readout coverage response aliases");
    check(functionBody.includes('|| null;'), "getReadoutCoverageInput should fall back to null when no coverage alias is present");
  }
};
const monitorValueSummaryFunctionChecks = () => {
  check(Boolean(monitorValueSummaryFunctionSource), "resolveMonitorValueSummary is missing from obd-readonly.js");
  if (monitorValueSummaryFunctionSource) {
    const functionBody = monitorValueSummaryFunctionSource[0];
    check(functionBody.includes('function resolveMonitorValueSummary(monitorValues = [], explicitSummary = null)'), "resolveMonitorValueSummary should default monitor values and explicit summary inputs");
    check(functionBody.includes('return explicitSummary || buildMonitorValueSummary(monitorValues);'), "resolveMonitorValueSummary should prefer explicit summaries before rebuilding from monitor values");
  }
};
const buildMonitorValueSummaryFunctionChecks = () => {
  check(Boolean(buildMonitorValueSummaryFunctionSource), "buildMonitorValueSummary is missing from obd-readonly.js");
  if (buildMonitorValueSummaryFunctionSource) {
    const functionBody = buildMonitorValueSummaryFunctionSource[0];
    check(functionBody.includes('const rows = Array.isArray(values) ? values : [];'), "buildMonitorValueSummary should treat non-array input as empty rows");
    check(functionBody.includes('item?.decoded === false || item?.valueType === "raw_hex"'), "buildMonitorValueSummary should count undecoded raw values from decoded=false or raw_hex type");
    check(functionBody.includes('Number.isFinite(item?.value)'), "buildMonitorValueSummary should count numeric values only from finite numeric values");
    check(functionBody.includes('decodedCount: Math.max(0, rows.length - undecodedRawCount),'), "buildMonitorValueSummary should derive decoded count without going below zero");
    check(functionBody.includes('numericCount,') && functionBody.includes('textCount'), "buildMonitorValueSummary should expose numeric and text counts");
  }
};
const analyzeMonitorValuesFunctionChecks = () => {
  check(Boolean(analyzeMonitorValuesFunctionSource), "analyzeMonitorValues is missing from obd-readonly.js");
  if (analyzeMonitorValuesFunctionSource) {
    const functionBody = analyzeMonitorValuesFunctionSource[0];
    check(functionBody.includes('const byId = new Map(values.map((item) => [item.id, item]));'), "analyzeMonitorValues should index monitor values by id");
    check(functionBody.includes('return item && item.valueType !== "text" && Number.isFinite(item.value) ? item.value : null;'), "analyzeMonitorValues should only treat finite non-text values as numeric inputs");
    check(functionBody.includes('const add = (level, title, detail, nextStep) => {') && functionBody.includes('insights.push({ level, title, detail, nextStep });'), "analyzeMonitorValues should normalize insight shape through a single add helper");
    check(functionBody.includes('const rpm = numeric("engine_speed");') && functionBody.includes('const voltage = numeric("control_module_voltage");'), "analyzeMonitorValues should derive core engine speed and voltage inputs");
    check(functionBody.includes('stftB1, ltftB1, add);') && functionBody.includes('stftB2, ltftB2, add);'), "analyzeMonitorValues should evaluate both fuel-trim banks");
    check(functionBody.includes('voltage !== null && voltage < 11.5') && functionBody.includes('voltage !== null && voltage > 15.2'), "analyzeMonitorValues should flag low and high control-module voltage");
    check(functionBody.includes('coolant !== null && intakeTemp !== null && Math.abs(coolant - intakeTemp) >= 35'), "analyzeMonitorValues should compare coolant and intake temperature context");
    check(functionBody.includes('rpm !== null && rpm > 500 && speed !== null && speed === 0 && map !== null && map >= 60'), "analyzeMonitorValues should flag high MAP in likely idle context");
    check(functionBody.includes('if (!insights.length && values.length)') && functionBody.includes('return insights.slice(0, 6);'), "analyzeMonitorValues should provide a fallback insight and cap insight count");
  }
  check(Boolean(fuelTrimInsightFunctionSource), "addFuelTrimInsight is missing from obd-readonly.js");
  if (fuelTrimInsightFunctionSource) {
    const functionBody = fuelTrimInsightFunctionSource[0];
    check(functionBody.includes('if (shortTrim === null || longTrim === null) return;'), "addFuelTrimInsight should require both short and long fuel trim values");
    check(functionBody.includes('const total = shortTrim + longTrim;') && functionBody.includes('const absoluteTotal = Math.abs(total);'), "addFuelTrimInsight should evaluate combined fuel trim magnitude");
    check(functionBody.includes('if (absoluteTotal >= 15)') && functionBody.includes('} else if (absoluteTotal >= 8)'), "addFuelTrimInsight should separate caution and observation fuel-trim thresholds");
    check(functionBody.includes('total > 0'), "addFuelTrimInsight should branch next steps by lean versus rich direction");
  }
};
const bridgeSessionSummaryFunctionChecks = () => {
  check(Boolean(bridgeSessionSummaryFunctionSource), "buildBridgeSessionSummary is missing from obd-readonly.js");
  if (bridgeSessionSummaryFunctionSource) {
    const functionBody = bridgeSessionSummaryFunctionSource[0];
    check(functionBody.includes('includeInfrastructure: hasBridgeInfrastructureContext'), "buildBridgeSessionSummary should derive readout coverage with bridge infrastructure context");
    check(functionBody.includes('appendBridgeReadoutCoverageWarnings(warnings, { hasBridgeInfrastructureContext, readoutCoverage });'), "buildBridgeSessionSummary should append bridge readout warnings through bridge context guard");
    check(functionBody.indexOf('const readoutCoverage = resolveReadoutCoverageSnapshot(readoutCoverageInput, derivedReadoutCoverage);') < functionBody.indexOf('appendBridgeReadoutCoverageWarnings(warnings, { hasBridgeInfrastructureContext, readoutCoverage });'), "buildBridgeSessionSummary should resolve readout coverage before appending bridge readout warnings");
    check(functionBody.includes('onboardMonitorSnapshot,') && functionBody.indexOf('onboardMonitorSnapshot,') < functionBody.indexOf('livePidSnapshot,'), "buildBridgeSessionSummary should pass onboard monitor snapshots into core session status");
  }
};
const dtcSnapshotFunctionChecks = () => {
  check(Boolean(dtcSnapshotFunctionSource), "normalizeDtcSnapshot is missing from obd-readonly.js");
  if (dtcSnapshotFunctionSource) {
    const functionBody = dtcSnapshotFunctionSource[0];
    check(functionBody.includes('const source = input.source || "diagnostic_core";'), "normalizeDtcSnapshot should default source to diagnostic_core");
    check(functionBody.includes('Array.isArray(input.dtcs) ? input.dtcs : Array.isArray(input.codes) ? input.codes : []'), "normalizeDtcSnapshot should accept dtcs and codes array inputs");
    check(functionBody.includes('extractDtcCodes(row.code || row.dtc || row.id || "")'), "normalizeDtcSnapshot should normalize row code aliases");
    check(functionBody.includes('status: row.status || row.kind || input.status || "unknown"'), "normalizeDtcSnapshot should normalize DTC status aliases");
    check(functionBody.includes('ecu: row.ecu || row.ecu_id || row.address || null') && functionBody.includes('freezeFrameAvailable: row.freeze_frame_available === true || row.freezeFrameAvailable === true'), "normalizeDtcSnapshot should preserve ECU and freeze-frame aliases");
    check(functionBody.includes('const key = `${row.code}::${row.status || "unknown"}`;') && functionBody.includes('retainedRawText: false'), "normalizeDtcSnapshot should deduplicate by code/status and never retain raw text");
  }
};
const freezeFrameSnapshotFunctionChecks = () => {
  check(Boolean(freezeFrameSnapshotFunctionSource), "normalizeFreezeFrameSnapshot is missing from obd-readonly.js");
  if (freezeFrameSnapshotFunctionSource) {
    const functionBody = freezeFrameSnapshotFunctionSource[0];
    check(functionBody.includes('const source = input.source || "diagnostic_core";'), "normalizeFreezeFrameSnapshot should default source to diagnostic_core");
    check(functionBody.includes('Array.isArray(input.values) ? input.values : Array.isArray(input.freeze_frame) ? input.freeze_frame : []'), "normalizeFreezeFrameSnapshot should accept values and freeze_frame array inputs");
    check(functionBody.includes('normalizeBridgePidValue(row, index)') && functionBody.includes('source: "freeze_frame"'), "normalizeFreezeFrameSnapshot should normalize rows through PID value normalization and mark freeze-frame source");
    check(functionBody.includes('freezeFramePriority: catalogItem?.priority || null') && functionBody.includes('interpretationNote: catalogItem?.interpretationNote || item.supportNote'), "normalizeFreezeFrameSnapshot should enrich values from freeze-frame item catalog");
    check(functionBody.includes('input.trigger_dtc') && functionBody.includes('input.freezeDtc') && functionBody.includes('triggerDtc: triggerCodes[0] || null'), "normalizeFreezeFrameSnapshot should normalize trigger DTC aliases");
    check(functionBody.includes('monitorValueSummary: buildMonitorValueSummary(monitorValues),') && functionBody.includes('retainedRawText: false'), "normalizeFreezeFrameSnapshot should summarize monitor values and never retain raw text");
  }
};
const readinessSnapshotFunctionChecks = () => {
  check(Boolean(readinessSnapshotFunctionSource), "normalizeReadinessSnapshot is missing from obd-readonly.js");
  if (readinessSnapshotFunctionSource) {
    const functionBody = readinessSnapshotFunctionSource[0];
    check(functionBody.includes('const source = input.source || "diagnostic_core";'), "normalizeReadinessSnapshot should default source to diagnostic_core");
    check(functionBody.includes('const monitors = Array.isArray(input) ? input : Array.isArray(input.monitors) ? input.monitors : [];'), "normalizeReadinessSnapshot should accept direct array or monitors array input");
    check(functionBody.includes('readinessMonitorCatalog.find((entry) => entry.id === id)') && functionBody.includes('diagnosticUse: catalogItem?.diagnosticUse || ""'), "normalizeReadinessSnapshot should enrich monitors from readiness catalog");
    check(functionBody.includes('supported: monitor?.supported !== false') && functionBody.includes('complete: monitor?.complete === true'), "normalizeReadinessSnapshot should normalize supported and complete states");
    check(functionBody.includes('milOn: input.mil_on === true || input.milOn === true') && functionBody.includes('incompleteCount: normalized.filter((item) => item.supported && !item.complete).length'), "normalizeReadinessSnapshot should normalize MIL aliases and supported incomplete count");
    check(functionBody.includes('knownMonitors,') && functionBody.includes('retainedRawText: false'), "normalizeReadinessSnapshot should expose known monitors and never retain raw text");
  }
};
const ecuResponseSummaryFunctionChecks = () => {
  check(Boolean(ecuResponseSummaryFunctionSource), "normalizeEcuResponseSummary is missing from obd-readonly.js");
  if (ecuResponseSummaryFunctionSource) {
    const functionBody = ecuResponseSummaryFunctionSource[0];
    check(functionBody.includes('const source = input.source || "diagnostic_core";'), "normalizeEcuResponseSummary should default source to diagnostic_core");
    check(functionBody.includes('Array.isArray(input.ecu_responses)') && functionBody.includes('Array.isArray(input.ecuResponseRows)'), "normalizeEcuResponseSummary should accept ECU response array aliases");
    check(functionBody.includes('id: String(row?.id || row?.ecu || row?.address || row?.ecu_id || row?.ecuId'), "normalizeEcuResponseSummary should normalize ECU id aliases");
    check(functionBody.includes('dtcCount: Number.isInteger(row?.dtc_count)') && functionBody.includes('Array.isArray(row?.codes) ? row.codes.length : null'), "normalizeEcuResponseSummary should normalize DTC count aliases and arrays");
    check(functionBody.includes('negativeResponseCount: Number.isInteger(row?.negative_response_count)') && functionBody.includes('negativeRequestedServices:'), "normalizeEcuResponseSummary should normalize negative response counts and service aliases");
    check(functionBody.includes('responseTimeMs: Number.isFinite(Number(row?.response_time_ms))') && functionBody.includes('retainedRawText: false'), "normalizeEcuResponseSummary should normalize response timing aliases and never retain raw text");
  }
};
const ecuInfoRowsFunctionChecks = () => {
  check(Boolean(ecuInfoRowsFunctionSource), "collectEcuInfoRows is missing from obd-readonly.js");
  if (ecuInfoRowsFunctionSource) {
    const functionBody = ecuInfoRowsFunctionSource[0];
    check(functionBody.includes('if (Array.isArray(input)) return input;'), "collectEcuInfoRows should accept direct array input");
    check(functionBody.includes('if (Array.isArray(input.ecu_info_items)) return input.ecu_info_items;') && functionBody.includes('if (Array.isArray(input.ecuInfoRows)) return input.ecuInfoRows;'), "collectEcuInfoRows should accept ECU info row aliases");
    check(functionBody.includes('if (Array.isArray(input.mode09_values)) return input.mode09_values;') && functionBody.includes('if (Array.isArray(input.infoValues)) return input.infoValues;'), "collectEcuInfoRows should accept Mode 09 and info value aliases");
    check(functionBody.includes('["supportedInfoTypes", "supported_info_types_00", "00"]') && functionBody.includes('["vinValues", "vin", "02"]'), "collectEcuInfoRows should map supported info type and VIN object aliases");
    check(functionBody.includes('["calibrationId", "calibration_id", "04"]') && functionBody.includes('["cvnValues", "calibration_verification_number", "06"]'), "collectEcuInfoRows should map calibration ID and CVN object aliases");
    check(functionBody.includes('.filter(([key]) => input[key] !== undefined && input[key] !== null && input[key] !== "")'), "collectEcuInfoRows should skip empty object alias values");
  }
};
const ecuInfoSnapshotFunctionChecks = () => {
  check(Boolean(ecuInfoSnapshotFunctionSource), "normalizeEcuInfoSnapshot is missing from obd-readonly.js");
  if (ecuInfoSnapshotFunctionSource) {
    const functionBody = ecuInfoSnapshotFunctionSource[0];
    check(functionBody.includes('const source = input.source || "diagnostic_core";'), "normalizeEcuInfoSnapshot should default source to diagnostic_core");
    check(functionBody.includes('const rows = collectEcuInfoRows(input);') && functionBody.includes('normalizeEcuInfoValue(row, index)'), "normalizeEcuInfoSnapshot should collect ECU info rows and normalize each value");
    check(functionBody.includes('const expectedItems = ecuInfoItemCatalog.map((item) => ({') && functionBody.includes('captured: items.some((value) => value.id === item.id || value.infoType === item.infoType)'), "normalizeEcuInfoSnapshot should build expected ECU info catalog coverage");
    check(functionBody.includes('const keyItemIds = new Set(["vin", "calibration_id", "calibration_verification_number", "ecu_name"]);'), "normalizeEcuInfoSnapshot should define key Mode 09 item ids");
    check(functionBody.includes('hadSensitiveIdentifier: items.some((item) => item.privacyClass === "sensitive_identifier" && item.detected === true),'), "normalizeEcuInfoSnapshot should surface detected sensitive identifiers");
    check(functionBody.includes('supportInfoTypesSummary: supportedInfoTypesSummary,') && functionBody.includes('retainedRawText: false'), "normalizeEcuInfoSnapshot should summarize supported info types and never retain raw text");
  }
};
const onboardMonitorSnapshotFunctionChecks = () => {
  check(Boolean(onboardMonitorSnapshotFunctionSource), "normalizeOnboardMonitorSnapshot is missing from obd-readonly.js");
  if (onboardMonitorSnapshotFunctionSource) {
    const functionBody = onboardMonitorSnapshotFunctionSource[0];
    check(functionBody.includes('const source = input.source || "diagnostic_core";'), "normalizeOnboardMonitorSnapshot should default source to diagnostic_core");
    check(functionBody.includes('Array.isArray(input.mode06_tests)') && functionBody.includes('Array.isArray(input.onboardMonitorTests)') && functionBody.includes('Array.isArray(input.testRows)'), "normalizeOnboardMonitorSnapshot should accept Mode 06 and onboard monitor row aliases");
    check(functionBody.includes('row.test_id || row.testId || row.tid || row.mid || row.monitor_id || row.monitorId'), "normalizeOnboardMonitorSnapshot should normalize test id aliases");
    check(functionBody.includes('row.component_id || row.componentId || row.cid || row.component') && functionBody.includes('row.measured_value ?? row.measuredValue'), "normalizeOnboardMonitorSnapshot should normalize component and measured value aliases");
    check(functionBody.includes('const passed = hasLimits && Number.isFinite(value) ? value >= min && value <= max : row.passed === true;'), "normalizeOnboardMonitorSnapshot should derive pass/fail from limits before explicit passed fallback");
    check(functionBody.includes('failedCount: tests.filter((test) => test.status === "fail").length') && functionBody.includes('retainedRawText: false'), "normalizeOnboardMonitorSnapshot should count failed tests and never retain raw text");
  }
};
const ecuInfoValueFunctionChecks = () => {
  check(Boolean(ecuInfoValueFunctionSource), "normalizeEcuInfoValue is missing from obd-readonly.js");
  if (ecuInfoValueFunctionSource) {
    const functionBody = ecuInfoValueFunctionSource[0];
    check(functionBody.includes('if (!row || typeof row !== "object") return null;'), "normalizeEcuInfoValue should ignore non-object rows");
    check(functionBody.includes('row.info_type || row.infoType || row.mode09_type || row.mode09Type || row.type'), "normalizeEcuInfoValue should normalize Mode 09 info type aliases");
    check(functionBody.includes('row.id || row.item_id || row.itemId || row.mode09_id || row.mode09Id'), "normalizeEcuInfoValue should normalize ECU info row id aliases");
    check(functionBody.includes('ecuInfoItemCatalog.find((item) => item.id === rowId || item.infoType === infoType)'), "normalizeEcuInfoValue should match rows against the ECU info catalog");
    check(functionBody.includes('privacyClass === "sensitive_identifier"') && functionBody.includes('maskSensitiveIdentifier(rawValue)'), "normalizeEcuInfoValue should mask sensitive identifier values");
    check(functionBody.includes('retainedRawValue: false') && functionBody.includes('detected: rawValue !== null && rawValue !== undefined'), "normalizeEcuInfoValue should expose detection state without retaining raw values");
  }
};
const sanitizeEcuInfoValueFunctionChecks = () => {
  check(Boolean(sanitizeEcuInfoValueFunctionSource), "sanitizeEcuInfoValue is missing from obd-readonly.js");
  if (sanitizeEcuInfoValueFunctionSource) {
    const functionBody = sanitizeEcuInfoValueFunctionSource[0];
    check(functionBody.includes('if (Array.isArray(value)) {'), "sanitizeEcuInfoValue should handle array values recursively");
    check(functionBody.includes('value.map((item) => sanitizeEcuInfoValue(item)).filter((item) => item !== null && item !== "")'), "sanitizeEcuInfoValue should drop empty sanitized array values");
    check(functionBody.includes('if (value && typeof value === "object") {'), "sanitizeEcuInfoValue should handle object values recursively");
    check(functionBody.includes('Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeEcuInfoValue(item)]))'), "sanitizeEcuInfoValue should preserve object keys while sanitizing values");
    check(functionBody.includes('const text = String(value ?? "").trim();') && functionBody.includes('return text ? text.slice(0, 240) : "";'), "sanitizeEcuInfoValue should trim scalar values and cap them to 240 characters");
  }
};
const mode09SupportedInfoTypesFunctionChecks = () => {
  check(Boolean(mode09SupportedInfoTypesFunctionSource), "decodeMode09SupportedInfoTypes is missing from obd-readonly.js");
  if (mode09SupportedInfoTypesFunctionSource) {
    const functionBody = mode09SupportedInfoTypesFunctionSource[0];
    check(functionBody.includes('const bytes = parseObdHexBytes(value);'), "decodeMode09SupportedInfoTypes should parse OBD hex bytes");
    check(functionBody.includes('if (!bytes.length)') && functionBody.includes('count: 0') && functionBody.includes('ids: []') && functionBody.includes('labels: []'), "decodeMode09SupportedInfoTypes should return an empty summary without bytes");
    check(functionBody.includes('for (let bit = 0; bit < 8; bit += 1)') && functionBody.includes('0x80 >> bit'), "decodeMode09SupportedInfoTypes should walk supported-info bits from MSB to LSB");
    check(functionBody.includes('id.toString(16).toUpperCase().padStart(2, "0")'), "decodeMode09SupportedInfoTypes should normalize supported info ids as uppercase two-digit hex");
    check(functionBody.includes('ecuInfoItemCatalog.find((row) => row.infoType === infoType)') && functionBody.includes('return item ? item.label'), "decodeMode09SupportedInfoTypes should map supported info ids through catalog labels with fallback text");
  }
};
const ecuInfoPayloadFunctionChecks = () => {
  check(Boolean(ecuInfoPayloadFunctionSource), "decodeEcuInfoPayload is missing from obd-readonly.js");
  if (ecuInfoPayloadFunctionSource) {
    const functionBody = ecuInfoPayloadFunctionSource[0];
    check(functionBody.includes('if (!payload.length) return "";'), "decodeEcuInfoPayload should return an empty string for empty payloads");
    check(functionBody.includes('const printable = payload.every((byte) => byte >= 0x20 && byte <= 0x7E);'), "decodeEcuInfoPayload should detect printable ASCII payloads");
    check(functionBody.includes('if (valueType === "counter_set" || !printable)'), "decodeEcuInfoPayload should retain counter sets and non-printable values as hex");
    check(functionBody.includes('byte.toString(16).toUpperCase().padStart(2, "0")).join(" ")'), "decodeEcuInfoPayload should format hex payload bytes consistently");
    check(functionBody.includes('String.fromCharCode(byte)).join("").trim()'), "decodeEcuInfoPayload should decode printable ASCII payloads and trim padding");
  }
};
const trimEcuInfoPayloadFunctionChecks = () => {
  check(Boolean(trimEcuInfoPayloadFunctionSource), "trimEcuInfoPayload is missing from obd-readonly.js");
  if (trimEcuInfoPayloadFunctionSource) {
    const functionBody = trimEcuInfoPayloadFunctionSource[0];
    check(functionBody.includes('const cleaned = [...payload];'), "trimEcuInfoPayload should clone payload bytes before trimming");
    check(functionBody.includes('while (cleaned.length && (cleaned[0] === 0x00 || cleaned[0] <= 0x20)) cleaned.shift();'), "trimEcuInfoPayload should remove leading zero and control/padding bytes");
    check(functionBody.includes('return cleaned;'), "trimEcuInfoPayload should return the trimmed payload bytes");
  }
};
const parseObdHexBytesFunctionChecks = () => {
  check(Boolean(parseObdHexBytesFunctionSource), "parseObdHexBytes is missing from obd-readonly.js");
  if (parseObdHexBytesFunctionSource) {
    const functionBody = parseObdHexBytesFunctionSource[0];
    check(functionBody.includes('if (Array.isArray(value)) {') && functionBody.includes('.map((item) => Number(item))'), "parseObdHexBytes should accept array byte input");
    check(functionBody.includes('Number.isInteger(item) && item >= 0 && item <= 255'), "parseObdHexBytes should filter array input to valid byte values");
    check(functionBody.includes('normalizeCanLogLineFormat(value)'), "parseObdHexBytes should normalize CAN log line formatting before parsing");
    check(functionBody.includes('SEARCHING|BUS INIT|OK|NO DATA|STOPPED|ERROR|UNABLE TO CONNECT'), "parseObdHexBytes should strip common adapter status tokens");
    check(functionBody.includes('text.match(/\\b[0-9A-F]{2}\\b/gi)') && functionBody.includes('parseInt(byte, 16)'), "parseObdHexBytes should extract two-digit hex bytes case-insensitively");
  }
};
const decodeObdDtcResponseFunctionChecks = () => {
  check(Boolean(decodeObdDtcResponseFunctionSource), "decodeObdDtcResponse is missing from obd-readonly.js");
  if (decodeObdDtcResponseFunctionSource) {
    const functionBody = decodeObdDtcResponseFunctionSource[0];
    check(functionBody.includes('const bytes = parseObdHexBytes(input.bytes || input.raw || input.response || input);'), "decodeObdDtcResponse should normalize raw DTC response bytes");
    check(functionBody.includes('byte === 0x43 || byte === 0x47 || byte === 0x4A'), "decodeObdDtcResponse should accept stored, pending, and permanent DTC service responses");
    check(functionBody.includes('if (serviceByte === undefined)') && functionBody.includes('dtcs: []'), "decodeObdDtcResponse should return an empty normalized DTC snapshot without a service byte");
    check(functionBody.includes('if (high === 0 && low === 0) continue;') && functionBody.includes('decodeDtcPair(high, low)'), "decodeObdDtcResponse should ignore zero padding and decode byte pairs");
    check(functionBody.includes('serviceByte === 0x47 ? "pending" : serviceByte === 0x4A ? "permanent" : "stored"'), "decodeObdDtcResponse should preserve stored, pending, and permanent DTC status");
    check(functionBody.includes('dtcs: [...new Set(codes)].map((code) => ({ code, status }))'), "decodeObdDtcResponse should deduplicate decoded DTC codes");
  }
};
const mergeDtcSnapshotsFunctionChecks = () => {
  check(Boolean(mergeDtcSnapshotsFunctionSource), "mergeDtcSnapshots is missing from obd-readonly.js");
  if (mergeDtcSnapshotsFunctionSource) {
    const functionBody = mergeDtcSnapshotsFunctionSource[0];
    check(functionBody.includes('.filter((snapshot) => snapshot && Array.isArray(snapshot.dtcs))'), "mergeDtcSnapshots should ignore missing snapshots and snapshots without DTC rows");
    check(functionBody.includes('snapshot.dtcs.map((row) => ({ ...row, source: row.source || snapshot.source || "diagnostic_core" }))'), "mergeDtcSnapshots should preserve row source with snapshot/default fallback");
    check(functionBody.includes('const key = `${row.code || ""}::${row.status || "unknown"}`;'), "mergeDtcSnapshots should deduplicate by DTC code and status");
    check(functionBody.includes('if (row.code && !byCodeAndStatus.has(key)) byCodeAndStatus.set(key, row);'), "mergeDtcSnapshots should retain the first valid row for each code/status pair");
    check(functionBody.includes('source: "merged_dtc_snapshots"'), "mergeDtcSnapshots should mark merged DTC source explicitly");
    check(functionBody.includes('capturedAt: snapshots.find((item) => item?.capturedAt)?.capturedAt || null') && functionBody.includes('protocol: snapshots.find((item) => item?.protocol)?.protocol || null'), "mergeDtcSnapshots should carry capturedAt and protocol from the first available snapshot");
    check(functionBody.includes('codes: [...new Set(mergedRows.map((row) => row.code))]'), "mergeDtcSnapshots should expose deduplicated DTC code list");
    check(functionBody.includes('retainedRawText: false'), "mergeDtcSnapshots should never retain raw text");
  }
};
const decodeDtcPairFunctionChecks = () => {
  check(Boolean(decodeDtcPairFunctionSource), "decodeDtcPair is missing from obd-readonly.js");
  if (decodeDtcPairFunctionSource) {
    const functionBody = decodeDtcPairFunctionSource[0];
    check(functionBody.includes('["P", "C", "B", "U"][(high & 0xC0) >> 6]'), "decodeDtcPair should decode system family from the high two bits");
    check(functionBody.includes('((high & 0x30) >> 4).toString(16).toUpperCase()'), "decodeDtcPair should decode the first DTC digit from high-byte bits 5-4");
    check(functionBody.includes('(high & 0x0F).toString(16).toUpperCase()'), "decodeDtcPair should decode the second DTC digit from the high-byte low nibble");
    check(functionBody.includes('((low & 0xF0) >> 4).toString(16).toUpperCase()'), "decodeDtcPair should decode the third DTC digit from the low-byte high nibble");
    check(functionBody.includes('(low & 0x0F).toString(16).toUpperCase()'), "decodeDtcPair should decode the fourth DTC digit from the low-byte low nibble");
    check(functionBody.includes('return `${system}${first}${second}${third}${fourth}`;'), "decodeDtcPair should return a normalized five-character DTC");
  }
};
const decodeSupportedPidResponseFunctionChecks = () => {
  check(Boolean(decodeSupportedPidResponseFunctionSource), "decodeSupportedPidResponse is missing from obd-readonly.js");
  if (decodeSupportedPidResponseFunctionSource) {
    const functionBody = decodeSupportedPidResponseFunctionSource[0];
    check(functionBody.includes('const bytes = parseObdHexBytes(input.bytes || input.raw || input.response || input);'), "decodeSupportedPidResponse should normalize raw supported PID bytes");
    check(functionBody.includes('if (bytes[index] !== 0x41 || !Number.isInteger(bytes[index + 1])) continue;'), "decodeSupportedPidResponse should only parse Mode 01 responses with a PID byte");
    check(functionBody.includes('if (!isSupportedPidBase(bytes[index + 1])) continue;'), "decodeSupportedPidResponse should ignore non-bitmap live PID responses");
    check(functionBody.includes('const bitBytes = bytes.slice(index + 2, index + 6);'), "decodeSupportedPidResponse should use the four bitmap bytes after the base PID");
    check(functionBody.includes('for (let bit = 7; bit >= 0; bit--)') && functionBody.includes('basePid + byteIndex * 8 + (8 - bit)'), "decodeSupportedPidResponse should map supported PID bits in MSB order");
    check(functionBody.includes('supported_pids: [...new Set(supportedPids)]'), "decodeSupportedPidResponse should deduplicate supported PID ids");
  }
};
const supportedPidBaseFunctionChecks = () => {
  check(Boolean(supportedPidBaseFunctionSource), "isSupportedPidBase is missing from obd-readonly.js");
  if (supportedPidBaseFunctionSource) {
    const functionBody = supportedPidBaseFunctionSource[0];
    check(functionBody.includes('[0x00, 0x20, 0x40, 0x60, 0x80, 0xA0, 0xC0, 0xE0].includes(pid)'), "isSupportedPidBase should only accept standard supported-PID bitmap base requests");
  }
};
const decodeLivePidResponseFunctionChecks = () => {
  check(Boolean(decodeLivePidResponseFunctionSource), "decodeLivePidResponse is missing from obd-readonly.js");
  if (decodeLivePidResponseFunctionSource) {
    const functionBody = decodeLivePidResponseFunctionSource[0];
    check(functionBody.includes('const bytes = parseObdHexBytes(input.bytes || input.raw || input.response || input);'), "decodeLivePidResponse should normalize raw live PID bytes");
    check(functionBody.includes('if (bytes[index] !== 0x41) continue;'), "decodeLivePidResponse should only parse Mode 01 live PID responses");
    check(functionBody.includes('getStandardPidPayloadLength(pid)') && functionBody.includes('getResponsePayload(bytes, index + 2, payloadLength, 0x41)'), "decodeLivePidResponse should bound payload extraction by standard PID length");
    check(functionBody.includes('decodeStandardPidValue(pid, payload)'), "decodeLivePidResponse should decode standard PID payloads into monitor values");
    check(functionBody.includes('if (Array.isArray(decoded)) values.push(...decoded);') && functionBody.includes('else if (decoded) values.push(decoded);'), "decodeLivePidResponse should collect scalar and grouped decoded values");
    check(functionBody.includes('would_transmit: false') && functionBody.includes('normalizeBridgeLivePidSnapshot({'), "decodeLivePidResponse should return a read-only normalized live PID snapshot");
  }
};
const decodeFreezeFrameResponseFunctionChecks = () => {
  check(Boolean(decodeFreezeFrameResponseFunctionSource), "decodeFreezeFrameResponse is missing from obd-readonly.js");
  if (decodeFreezeFrameResponseFunctionSource) {
    const functionBody = decodeFreezeFrameResponseFunctionSource[0];
    check(functionBody.includes('const bytes = parseObdHexBytes(input.bytes || input.raw || input.response || input);'), "decodeFreezeFrameResponse should normalize raw freeze-frame bytes");
    check(functionBody.includes('if (bytes[index] !== 0x42) continue;'), "decodeFreezeFrameResponse should only parse Mode 02 freeze-frame responses");
    check(functionBody.includes('const frameNumber = bytes[index + 2];'), "decodeFreezeFrameResponse should preserve the freeze-frame number byte");
    check(functionBody.includes('if (pid === "02"') && functionBody.includes('triggerDtc = decoded'), "decodeFreezeFrameResponse should decode trigger DTC from PID 02");
    check(functionBody.includes('freeze_frame_number: frameNumber'), "decodeFreezeFrameResponse should attach frame numbers to decoded PID values");
    check(functionBody.includes('normalizeFreezeFrameSnapshot({') && functionBody.includes('trigger_dtc: triggerDtc'), "decodeFreezeFrameResponse should return a normalized freeze-frame snapshot with trigger DTC");
  }
};
const decodeEcuInfoResponseFunctionChecks = () => {
  check(Boolean(decodeEcuInfoResponseFunctionSource), "decodeEcuInfoResponse is missing from obd-readonly.js");
  if (decodeEcuInfoResponseFunctionSource) {
    const functionBody = decodeEcuInfoResponseFunctionSource[0];
    check(functionBody.includes('const bytes = parseObdHexBytes(input.bytes || input.raw || input.response || input);'), "decodeEcuInfoResponse should normalize raw ECU info bytes");
    check(functionBody.includes('if (bytes[index] !== 0x49) continue;'), "decodeEcuInfoResponse should only parse Mode 09 ECU info responses");
    check(functionBody.includes('const nextSegment = bytes.findIndex((byte, nextIndex) => nextIndex > index && byte === 0x49);'), "decodeEcuInfoResponse should split repeated Mode 09 response segments");
    check(functionBody.includes('trimEcuInfoPayload(bytes.slice(index + 2, end))'), "decodeEcuInfoResponse should trim Mode 09 payload framing bytes");
    check(functionBody.includes('ecuInfoItemCatalog.find((item) => item.infoType === infoType)') && functionBody.includes('if (!catalogItem) continue;'), "decodeEcuInfoResponse should accept only cataloged Mode 09 info types");
    check(functionBody.includes('decodeEcuInfoPayload(payload, catalogItem.valueType)') && functionBody.includes('normalizeEcuInfoSnapshot({'), "decodeEcuInfoResponse should decode typed values into a normalized ECU info snapshot");
  }
};
const decodeReadinessResponseFunctionChecks = () => {
  check(Boolean(decodeReadinessResponseFunctionSource), "decodeReadinessResponse is missing from obd-readonly.js");
  if (decodeReadinessResponseFunctionSource) {
    const functionBody = decodeReadinessResponseFunctionSource[0];
    check(functionBody.includes('const bytes = parseObdHexBytes(input.bytes || input.raw || input.response || input);'), "decodeReadinessResponse should normalize raw readiness bytes");
    check(functionBody.includes('byte === 0x41 && bytes[index + 1] === 0x01'), "decodeReadinessResponse should locate Mode 01 PID 01 readiness responses");
    check(functionBody.includes('if (serviceIndex < 0 || serviceIndex + 5 >= bytes.length)') && functionBody.includes('monitors: []'), "decodeReadinessResponse should return an empty readiness snapshot without enough bytes");
    check(functionBody.includes('const compressionIgnition = (b & 0x08) !== 0;'), "decodeReadinessResponse should branch monitor definitions by ignition type");
    check(functionBody.includes('nox_scr') && functionBody.includes('catalyst'), "decodeReadinessResponse should support diesel and spark readiness monitor sets");
    check(functionBody.includes('mil_on: (a & 0x80) !== 0') && functionBody.includes('normalizeReadinessSnapshot({'), "decodeReadinessResponse should return a normalized readiness snapshot with MIL state");
  }
};
const decodeOnboardMonitorResponseFunctionChecks = () => {
  check(Boolean(decodeOnboardMonitorResponseFunctionSource), "decodeOnboardMonitorResponse is missing from obd-readonly.js");
  if (decodeOnboardMonitorResponseFunctionSource) {
    const functionBody = decodeOnboardMonitorResponseFunctionSource[0];
    check(functionBody.includes('const bytes = parseObdHexBytes(input.bytes || input.raw || input.response || input);'), "decodeOnboardMonitorResponse should normalize raw Mode 06 bytes");
    check(functionBody.includes('if (bytes[index] !== 0x46) continue;'), "decodeOnboardMonitorResponse should only parse Mode 06 onboard monitor responses");
    check(functionBody.includes('const testId = bytes[index + 1].toString(16).toUpperCase().padStart(2, "0");'), "decodeOnboardMonitorResponse should normalize test ids as uppercase hex");
    check(functionBody.includes('const componentId = bytes[index + 2].toString(16).toUpperCase().padStart(2, "0");'), "decodeOnboardMonitorResponse should normalize component ids as uppercase hex");
    check(functionBody.includes('const value = (bytes[index + 3] * 256) + bytes[index + 4];') && functionBody.includes('const max = (bytes[index + 7] * 256) + bytes[index + 8];'), "decodeOnboardMonitorResponse should decode value, min, and max words");
    check(functionBody.includes('normalizeOnboardMonitorSnapshot({') && functionBody.includes('tests'), "decodeOnboardMonitorResponse should return a normalized onboard monitor snapshot");
  }
};
const decodedObdScanSessionFunctionChecks = () => {
  check(Boolean(decodedObdScanSessionFunctionSource), "buildDecodedObdScanSession is missing from obd-readonly.js");
  if (decodedObdScanSessionFunctionSource) {
    const functionBody = decodedObdScanSessionFunctionSource[0];
    check(functionBody.includes('const sessionInput = getDiagnosticSessionInput(input);'), "buildDecodedObdScanSession should normalize nested diagnostic session input first");
    check(functionBody.includes('const metadataOverrides = getSessionMetadataOverrides(sessionInput);'), "buildDecodedObdScanSession should collect session metadata overrides");
    check(functionBody.includes('const withSessionProtocol = (value) => {') && functionBody.includes('return { ...value, protocol: sessionProtocol };'), "buildDecodedObdScanSession should propagate session protocol to raw response inputs");
    check(functionBody.includes('mergeDtcSnapshots(') && functionBody.includes('storedDtcResponse') && functionBody.includes('pendingDtcResponse') && functionBody.includes('permanentDtcResponse'), "buildDecodedObdScanSession should merge stored, pending, and permanent DTC responses");
    check(functionBody.includes('decodeLivePidResponse(livePidResponseInput)') && functionBody.includes('decodeFreezeFrameResponse(freezeFrameResponseInput)') && functionBody.includes('decodeReadinessResponse(readinessResponseInput)'), "buildDecodedObdScanSession should decode live PID, freeze-frame, and readiness responses");
    check(functionBody.includes('decodeOnboardMonitorResponse(onboardMonitorResponseInput)') && functionBody.includes('decodeEcuInfoResponse(ecuInfoResponseInput)') && functionBody.includes('decodeSupportedPidResponse(supportedPidResponseInput)'), "buildDecodedObdScanSession should decode Mode 06, ECU info, and supported PID responses");
    check(functionBody.includes('return buildDiagnosticScanSession({') && functionBody.includes('...metadataOverrides,'), "buildDecodedObdScanSession should return a diagnostic scan session with metadata overrides");
  }
};
const scanSessionFromObdTextFunctionChecks = () => {
  check(Boolean(scanSessionFromObdTextFunctionSource), "buildScanSessionFromObdText is missing from obd-readonly.js");
  if (scanSessionFromObdTextFunctionSource) {
    const functionBody = scanSessionFromObdTextFunctionSource[0];
    check(functionBody.includes('const classified = classifyObdResponseLines(value);'), "buildScanSessionFromObdText should classify OBD response lines before decoding");
    check(functionBody.includes('const textDtcSnapshot = extractTextDtcSnapshot(value);'), "buildScanSessionFromObdText should preserve text-only DTC extraction");
    check(functionBody.includes('const firstOrEmpty = (bucketName) => classified.responseBuckets[bucketName]?.map((row) => row.response).join(" ") || "";'), "buildScanSessionFromObdText should feed decoded sessions from classified response buckets");
    check(functionBody.includes('storedDtcResponse: { raw: firstOrEmpty("storedDtcResponses")') && functionBody.includes('ecuInfoResponse: { raw: firstOrEmpty("ecuInfoResponses")'), "buildScanSessionFromObdText should map classified core response buckets into decoded session inputs");
    check(functionBody.includes('const mergedDtcSnapshot = mergeDtcSnapshots(session.dtcSnapshot, textDtcSnapshot);'), "buildScanSessionFromObdText should merge decoded and text-extracted DTC snapshots");
    check(functionBody.includes('retainedRawText: false') && functionBody.includes('retainedRawFrames: false') && functionBody.includes('wouldTransmit: false') && functionBody.includes('vehicleCommandEnabled: false'), "buildScanSessionFromObdText should return read-only imports without retaining raw text or frames");
  }
};
const textDtcSnapshotFunctionChecks = () => {
  check(Boolean(textDtcSnapshotFunctionSource), "extractTextDtcSnapshot is missing from obd-readonly.js");
  if (textDtcSnapshotFunctionSource) {
    const functionBody = textDtcSnapshotFunctionSource[0];
    check(functionBody.includes('const lines = String(value || "").split(/\\r?\\n/);'), "extractTextDtcSnapshot should process text line by line");
    check(functionBody.includes('let currentStatus = "stored";'), "extractTextDtcSnapshot should default text-only DTC status to stored");
    check(functionBody.includes('if (/\\bpending\\b/.test(normalized)) currentStatus = "pending";'), "extractTextDtcSnapshot should switch to pending status from headings");
    check(functionBody.includes('else if (/\\bpermanent\\b/.test(normalized)) currentStatus = "permanent";'), "extractTextDtcSnapshot should switch to permanent status from headings");
    check(functionBody.includes('else if (/\\bcurrent\\b|\\bstored\\b|\\bconfirmed\\b|\\bhistory\\b|\\bdtc(?:s)?\\b|\\bcodes?\\b/.test(normalized)) currentStatus = "stored";'), "extractTextDtcSnapshot should map current, stored, confirmed, history, DTC, and code headings to stored");
    check(functionBody.includes('const codes = extractDtcCodes(text);') && functionBody.includes('codes.forEach((code) => rows.push({ code, status: currentStatus }));'), "extractTextDtcSnapshot should attach current heading status to extracted DTC codes");
    check(functionBody.includes('source: "obd_text_status_headings"') && functionBody.includes('dtcs: rows'), "extractTextDtcSnapshot should normalize text-only DTC rows with an explicit source");
  }
};
const classifyObdResponseLinesFunctionChecks = () => {
  check(Boolean(classifyObdResponseLinesFunctionSource), "classifyObdResponseLines is missing from obd-readonly.js");
  if (classifyObdResponseLinesFunctionSource) {
    const functionBody = classifyObdResponseLinesFunctionSource[0];
    check(functionBody.includes('const redacted = redactSensitiveText(raw);') && functionBody.includes('buildObdLogPackets(redacted)'), "classifyObdResponseLines should redact sensitive text before packet parsing");
    check(functionBody.includes('storedDtcResponses: []') && functionBody.includes('negativeResponses: []') && functionBody.includes('unknownResponses: []'), "classifyObdResponseLines should initialize all response buckets");
    check(functionBody.includes('const responseServices = [0x41, 0x42, 0x43, 0x46, 0x47, 0x49, 0x4A, 0x7F];'), "classifyObdResponseLines should detect all supported OBD response services");
    check(functionBody.includes('buckets.storedDtcResponses.push(packet)') && functionBody.includes('buckets.pendingDtcResponses.push(packet)') && functionBody.includes('buckets.permanentDtcResponses.push(packet)'), "classifyObdResponseLines should bucket stored, pending, and permanent DTC responses");
    check(functionBody.includes('buckets.supportedPidResponses.push(packet)') && functionBody.includes('buckets.livePidResponses.push(packet)') && functionBody.includes('buckets.readinessResponses.push(packet)'), "classifyObdResponseLines should distinguish supported PID, live PID, and readiness responses");
    check(functionBody.includes('buckets.freezeFrameResponses.push(packet)') && functionBody.includes('buckets.onboardMonitorResponses.push(packet)') && functionBody.includes('buckets.ecuInfoResponses.push(packet)'), "classifyObdResponseLines should bucket freeze-frame, Mode 06, and ECU info responses");
    check(functionBody.includes('retainedRawText: false') && functionBody.includes('wouldTransmit: false') && functionBody.includes('vehicleCommandEnabled: false'), "classifyObdResponseLines should return read-only classification without raw text retention");
  }
};
const buildObdLogPacketsFunctionChecks = () => {
  check(Boolean(buildObdLogPacketsFunctionSource), "buildObdLogPackets is missing from obd-readonly.js");
  if (buildObdLogPacketsFunctionSource) {
    const functionBody = buildObdLogPacketsFunctionSource[0];
    check(functionBody.includes('String(text || "").split(/\\r?\\n/).forEach((line) => {'), "buildObdLogPackets should process text input line by line");
    check(functionBody.includes('const normalized = normalizeObdLogLine(line);') && functionBody.includes('const bytes = parseObdHexBytes(normalized);'), "buildObdLogPackets should normalize each line before byte parsing");
    check(functionBody.includes('const metadata = extractObdFrameMetadata(normalized, null, null);'), "buildObdLogPackets should extract frame metadata from normalized lines");
    check(functionBody.includes('const isFirstFrame = metadata.ecu && Number.isInteger(pci) && (pci & 0xF0) === 0x10') && functionBody.includes('pendingIsoTp.set(metadata.ecu'), "buildObdLogPackets should track ISO-TP first frames by ECU");
    check(functionBody.includes('const isConsecutiveFrame = metadata.ecu && Number.isInteger(pci) && (pci & 0xF0) === 0x20') && functionBody.includes('sequenceError = true'), "buildObdLogPackets should detect ISO-TP consecutive frame sequence errors");
    check(functionBody.includes('pendingIsoTp.forEach((current) => {') && functionBody.includes('incomplete: true'), "buildObdLogPackets should emit incomplete ISO-TP payloads with metadata");
  }
};
const normalizeObdLogLineFunctionChecks = () => {
  check(Boolean(normalizeObdLogLineFunctionSource), "normalizeObdLogLine is missing from obd-readonly.js");
  if (normalizeObdLogLineFunctionSource) {
    const functionBody = normalizeObdLogLineFunctionSource[0];
    check(functionBody.includes('return normalizeCanLogLineFormat(line)'), "normalizeObdLogLine should normalize CAN log formats before OBD adapter cleanup");
    check(functionBody.includes('SEARCHING|BUS INIT|OK|NO DATA|STOPPED|ERROR|UNABLE TO CONNECT'), "normalizeObdLogLine should remove common adapter status tokens");
    check(functionBody.includes('.replace(/^[>\\s]+/, "")'), "normalizeObdLogLine should strip ELM prompt prefixes");
    check(functionBody.includes('.trim();'), "normalizeObdLogLine should trim the final OBD log line");
  }
};
const normalizeCanLogLineFormatFunctionChecks = () => {
  check(Boolean(normalizeCanLogLineFormatFunctionSource), "normalizeCanLogLineFormat is missing from obd-readonly.js");
  if (normalizeCanLogLineFormatFunctionSource) {
    const functionBody = normalizeCanLogLineFormatFunctionSource[0];
    check(functionBody.includes('let text = String(line || "").trim();') && functionBody.includes('if (!text) return "";'), "normalizeCanLogLineFormat should trim blank log lines");
    check(functionBody.includes('text.replace(/^\\(\\s*[0-9]+(?:\\.[0-9]+)?\\s*\\)\\s+/, "")'), "normalizeCanLogLineFormat should strip SocketCAN timestamp prefixes");
    check(functionBody.includes('([0-9A-F]{3}|[0-9A-F]{8})#([0-9A-F]{2,128})') && functionBody.includes('data.match(/[0-9A-F]{2}/gi)'), "normalizeCanLogLineFormat should expand compact CAN ID#DATA logs");
    check(functionBody.includes('([0-9A-F]{3}|[0-9A-F]{8})\\s+\\[(\\d{1,2})\\]') && functionBody.includes('lengthByte'), "normalizeCanLogLineFormat should expand bracketed CAN length logs");
    check(functionBody.includes('const csvNormalized = normalizeCanCsvLogLine(text);') && functionBody.includes('if (csvNormalized) return csvNormalized;'), "normalizeCanLogLineFormat should accept CSV-like CAN logs before returning raw text");
  }
};
const normalizeCanCsvLogLineFunctionChecks = () => {
  check(Boolean(normalizeCanCsvLogLineFunctionSource), "normalizeCanCsvLogLine is missing from obd-readonly.js");
  if (normalizeCanCsvLogLineFunctionSource) {
    const functionBody = normalizeCanCsvLogLineFunctionSource[0];
    check(functionBody.includes('if (!/[,;\\t]/.test(text)) return "";'), "normalizeCanCsvLogLine should only parse delimited log lines");
    check(functionBody.includes('text.split(/[,;\\t]/).map((part) => part.trim()).filter(Boolean)'), "normalizeCanCsvLogLine should trim and compact delimited fields");
    check(functionBody.includes('const idIndex = parts.findIndex((part) => /^[0-9A-F]{3}$|^[0-9A-F]{8}$/i.test(part));'), "normalizeCanCsvLogLine should find 11-bit and extended CAN IDs");
    check(functionBody.includes('while (byteStart > idIndex + 1 && /^[0-9A-F]{2}$/i.test(parts[byteStart - 1]))'), "normalizeCanCsvLogLine should collect trailing byte fields");
    check(functionBody.includes('const parsedLength = /^\\d{1,3}$/.test(lengthPart) ? parseInt(lengthPart, 10) : bytes.length;'), "normalizeCanCsvLogLine should use explicit frame length or byte count fallback");
    check(functionBody.includes('return [parts[idIndex].toUpperCase(), lengthByte, ...bytes.map((byte) => byte.toUpperCase())].join(" ");'), "normalizeCanCsvLogLine should emit normalized ECU, length, and uppercase byte fields");
  }
};
const extractObdFrameMetadataFunctionChecks = () => {
  check(Boolean(extractObdFrameMetadataFunctionSource), "extractObdFrameMetadata is missing from obd-readonly.js");
  if (extractObdFrameMetadataFunctionSource) {
    const functionBody = extractObdFrameMetadataFunctionSource[0];
    check(functionBody.includes('String(line || "").toUpperCase().match(/\\b[0-9A-F]{2,8}\\b/g) || []'), "extractObdFrameMetadata should tokenize uppercase hex fields from log lines");
    check(functionBody.includes('const hasCanId = /^[0-9A-F]{3}$/.test(first) || /^[0-9A-F]{8}$/.test(first);'), "extractObdFrameMetadata should accept 11-bit and extended CAN IDs");
    check(functionBody.includes('const frameLength = hasCanId && /^[0-9A-F]{2}$/.test(second) ? parseInt(second, 16) : null;'), "extractObdFrameMetadata should parse frame length only after a CAN ID");
    check(functionBody.includes('ecu: hasCanId ? first : null') && functionBody.includes('address: hasCanId ? first : null'), "extractObdFrameMetadata should expose ECU and address from CAN ID");
    check(functionBody.includes('service: Number.isInteger(serviceByte) ? serviceByte.toString(16).toUpperCase().padStart(2, "0") : null'), "extractObdFrameMetadata should normalize service bytes as uppercase hex");
    check(functionBody.includes('serviceIndex: Number.isInteger(serviceIndex) && serviceIndex >= 0 ? serviceIndex : null'), "extractObdFrameMetadata should preserve valid service indexes only");
  }
};
const ecuResponsesFromBucketsFunctionChecks = () => {
  check(Boolean(ecuResponsesFromBucketsFunctionSource), "buildEcuResponsesFromResponseBuckets is missing from obd-readonly.js");
  if (ecuResponsesFromBucketsFunctionSource) {
    const functionBody = ecuResponsesFromBucketsFunctionSource[0];
    check(functionBody.includes('Object.values(responseBuckets || {}).flat().filter((row) => row?.ecu)'), "buildEcuResponsesFromResponseBuckets should aggregate only packets with ECU ids");
    check(functionBody.includes('const byEcu = new Map();') && functionBody.includes('byEcu.get(packet.ecu)'), "buildEcuResponsesFromResponseBuckets should group responses by ECU");
    check(functionBody.includes('services: new Set()') && functionBody.includes('if (packet.service) current.services.add(packet.service);'), "buildEcuResponsesFromResponseBuckets should deduplicate service ids per ECU");
    check(functionBody.includes('negative_response_count: 0') && functionBody.includes('current.negative_response_count += 1;'), "buildEcuResponsesFromResponseBuckets should count negative responses per ECU");
    check(functionBody.includes('negative_requested_services: new Set()') && functionBody.includes('negative_response_labels: new Set()'), "buildEcuResponsesFromResponseBuckets should collect negative requested services and labels");
    check(functionBody.includes('services: [...row.services]') && functionBody.includes('negative_response_labels: [...row.negative_response_labels]'), "buildEcuResponsesFromResponseBuckets should return serializable ECU response arrays");
  }
};
const isoTpSummaryFunctionChecks = () => {
  check(Boolean(isoTpSummaryFunctionSource), "buildIsoTpSummary is missing from obd-readonly.js");
  if (isoTpSummaryFunctionSource) {
    const functionBody = isoTpSummaryFunctionSource[0];
    check(functionBody.includes('const packets = Object.values(responseBuckets || {}).flat();'), "buildIsoTpSummary should aggregate packets from all response buckets");
    check(functionBody.includes('const isoTpPackets = packets.filter((packet) => packet?.isoTp === true);'), "buildIsoTpSummary should filter ISO-TP packets explicitly");
    check(functionBody.includes('totalCount: isoTpPackets.length'), "buildIsoTpSummary should count total ISO-TP packets");
    check(functionBody.includes('incompleteCount: isoTpPackets.filter((packet) => packet.incomplete === true).length'), "buildIsoTpSummary should count incomplete ISO-TP packets");
    check(functionBody.includes('sequenceErrorCount: isoTpPackets.filter((packet) => packet.sequenceError === true).length'), "buildIsoTpSummary should count ISO-TP sequence errors");
    check(functionBody.includes('affectedEcus: [...new Set') && functionBody.includes('packet.incomplete === true || packet.sequenceError === true'), "buildIsoTpSummary should expose affected ECUs for incomplete or sequence-error packets");
  }
};
const negativeResponseSummaryFunctionChecks = () => {
  check(Boolean(negativeResponseSummaryFunctionSource), "buildNegativeResponseSummary is missing from obd-readonly.js");
  if (negativeResponseSummaryFunctionSource) {
    const functionBody = negativeResponseSummaryFunctionSource[0];
    check(functionBody.includes('const rows = Array.isArray(negativeResponses) ? negativeResponses : [];'), "buildNegativeResponseSummary should tolerate non-array input");
    check(functionBody.includes('const responseCodes = [...new Set(rows.map((packet) => packet?.negativeResponse?.responseCode).filter(Boolean))];'), "buildNegativeResponseSummary should deduplicate negative response codes");
    check(functionBody.includes('const requestedServices = [...new Set(rows.map((packet) => packet?.negativeResponse?.requestedService).filter(Boolean))];'), "buildNegativeResponseSummary should deduplicate requested service ids");
    check(functionBody.includes('totalCount: rows.length') && functionBody.includes('requestedServices,'), "buildNegativeResponseSummary should expose total count and requested services");
    check(functionBody.includes('responseLabels: [...new Set(rows.map((packet) => packet?.negativeResponse?.responseLabel).filter(Boolean))]'), "buildNegativeResponseSummary should deduplicate negative response labels");
  }
};
const negativeObdResponseFunctionChecks = () => {
  check(Boolean(negativeObdResponseFunctionSource), "decodeNegativeObdResponse is missing from obd-readonly.js");
  if (negativeObdResponseFunctionSource) {
    const functionBody = negativeObdResponseFunctionSource[0];
    check(functionBody.includes('const requestedService = bytes[serviceIndex + 1];'), "decodeNegativeObdResponse should read the requested service after 0x7F");
    check(functionBody.includes('const responseCode = bytes[serviceIndex + 2];'), "decodeNegativeObdResponse should read the negative response code after requested service");
    check(functionBody.includes('requestedService: Number.isInteger(requestedService) ? requestedService.toString(16).toUpperCase().padStart(2, "0") : null'), "decodeNegativeObdResponse should normalize requested service as uppercase hex");
    check(functionBody.includes('responseCode: Number.isInteger(responseCode) ? responseCode.toString(16).toUpperCase().padStart(2, "0") : null'), "decodeNegativeObdResponse should normalize response code as uppercase hex");
    check(functionBody.includes('responseLabel: decodeNegativeResponseCode(responseCode)'), "decodeNegativeObdResponse should attach a decoded response label");
  }
};
const negativeResponseCodeFunctionChecks = () => {
  check(Boolean(negativeResponseCodeFunctionSource), "decodeNegativeResponseCode is missing from obd-readonly.js");
  if (negativeResponseCodeFunctionSource) {
    const functionBody = negativeResponseCodeFunctionSource[0];
    check(functionBody.includes('0x10: "general_reject"') && functionBody.includes('0x11: "service_not_supported"'), "decodeNegativeResponseCode should include common service rejection labels");
    check(functionBody.includes('0x12: "subfunction_not_supported"') && functionBody.includes('0x13: "incorrect_message_length_or_format"'), "decodeNegativeResponseCode should include subfunction and message-format labels");
    check(functionBody.includes('0x21: "busy_repeat_request"') && functionBody.includes('0x22: "conditions_not_correct"'), "decodeNegativeResponseCode should include busy and conditions-not-correct labels");
    check(functionBody.includes('0x31: "request_out_of_range"') && functionBody.includes('0x78: "response_pending"'), "decodeNegativeResponseCode should include request-range and pending labels");
    check(functionBody.includes('return labels[responseCode] || "unknown_negative_response";'), "decodeNegativeResponseCode should fall back to unknown_negative_response");
  }
};
const textImportMetadataFunctionChecks = () => {
  check(Boolean(textImportMetadataFunctionSource), "buildTextImportMetadata is missing from obd-readonly.js");
  if (textImportMetadataFunctionSource) {
    const functionBody = textImportMetadataFunctionSource[0];
    check(functionBody.includes('const mergedToolHints = mergeUniqueStrings(session.toolHints, detectedToolHints);'), "buildTextImportMetadata should merge session and detected tool hints");
    check(functionBody.includes('bucketCounts: explicitImportClassification?.bucketCounts') && functionBody.includes('{ ...classified.bucketCounts, ...explicitImportClassification.bucketCounts }'), "buildTextImportMetadata should merge explicit and classified bucket counts");
    check(functionBody.includes('isoTpSummary: explicitImportClassification?.isoTpSummary') && functionBody.includes('{ ...classified.isoTpSummary, ...explicitImportClassification.isoTpSummary }'), "buildTextImportMetadata should merge explicit and classified ISO-TP summaries");
    check(functionBody.includes('negativeResponseSummary: explicitImportClassification?.negativeResponseSummary') && functionBody.includes('{ ...classified.negativeResponseSummary, ...explicitImportClassification.negativeResponseSummary }'), "buildTextImportMetadata should merge explicit and classified negative-response summaries");
    check(functionBody.includes('isotp_reassembly_issue') && functionBody.includes('negative_obd_response_present'), "buildTextImportMetadata should map ISO-TP and negative-response issues into warnings");
    check(functionBody.includes('session.ecuInfoSnapshot?.hadSensitiveIdentifier === true') && functionBody.includes('classified.hadSensitiveIdentifier === true'), "buildTextImportMetadata should preserve sensitive identifier detection from session and classification");
    check(functionBody.includes('Math.max(0, Math.round(Number(pickDefined(session.sourceLength, classified.sourceLength))))'), "buildTextImportMetadata should normalize source length without retaining raw input");
  }
};
const scannerTextExtractionFunctionChecks = () => {
  check(Boolean(scannerToolHintsFunctionSource), "detectScannerToolHints is missing from obd-readonly.js");
  if (scannerToolHintsFunctionSource) {
    const functionBody = scannerToolHintsFunctionSource[0];
    check(functionBody.includes('const add = (label, pattern) => {') && functionBody.includes('!hints.includes(label)'), "detectScannerToolHints should deduplicate scanner tool hints");
    check(functionBody.includes('add("Techstream"') && functionBody.includes('add("J2534"') && functionBody.includes('add("CONSULT"'), "detectScannerToolHints should retain major OEM and pass-thru tool hints");
    check(functionBody.includes('add("ELM327"') && functionBody.includes('add("SavvyCAN"') && functionBody.includes('add("CANable"'), "detectScannerToolHints should retain bridge/CAN adapter tool hints");
  }
  check(Boolean(extractDtcCodesFunctionSource), "extractDtcCodes is missing from obd-readonly.js");
  if (extractDtcCodesFunctionSource) {
    const functionBody = extractDtcCodesFunctionSource[0];
    check(functionBody.includes('String(value || "").toUpperCase().match(DTC_PATTERN) || []'), "extractDtcCodes should normalize text to uppercase before DTC matching");
    check(functionBody.includes('return [...new Set(matches)];'), "extractDtcCodes should deduplicate matched DTC codes");
  }
  check(Boolean(redactSensitiveTextFunctionSource), "redactSensitiveText is missing from obd-readonly.js");
  if (redactSensitiveTextFunctionSource) {
    const functionBody = redactSensitiveTextFunctionSource[0];
    check(functionBody.includes('String(value || "").replace(VIN_PATTERN'), "redactSensitiveText should replace VIN-like identifiers before retention");
  }
  check(Boolean(monitorLabelFunctionSource), "normalizeMonitorLabel is missing from obd-readonly.js");
  if (monitorLabelFunctionSource) {
    const functionBody = monitorLabelFunctionSource[0];
    check(functionBody.includes('.toLowerCase()') && functionBody.includes('.replace(/[_\\-]/g, " ")'), "normalizeMonitorLabel should lowercase labels and normalize separators");
    check(functionBody.includes('.replace(/\\s+/g, " ")') && functionBody.includes('.trim();'), "normalizeMonitorLabel should compact whitespace and trim labels");
  }
  check(Boolean(monitorLabelTokensFunctionSource), "normalizeMonitorLabelTokens is missing from obd-readonly.js");
  if (monitorLabelTokensFunctionSource) {
    const functionBody = monitorLabelTokensFunctionSource[0];
    check(functionBody.includes('.replace(/[()[\\]{}]/g, " ")') && functionBody.includes('.replace(/[=,/%]/g, " ")'), "normalizeMonitorLabelTokens should remove punctuation before alias comparison");
    check(functionBody.includes('rpm|kpa|pa|c|f|deg|degree|degrees|percent|pct'), "normalizeMonitorLabelTokens should drop common unit tokens");
  }
  check(Boolean(monitorLabelMatchFunctionSource), "isMonitorLabelMatch is missing from obd-readonly.js");
  if (monitorLabelMatchFunctionSource) {
    const functionBody = monitorLabelMatchFunctionSource[0];
    check(functionBody.includes('if (normalizedLabel === normalizedAlias) return true;'), "isMonitorLabelMatch should first compare normalized labels directly");
    check(functionBody.includes('return Boolean(tokenLabel) && tokenLabel === tokenAlias;'), "isMonitorLabelMatch should fall back to token label matching");
  }
  check(Boolean(extractMonitorValuesFunctionSource), "extractMonitorValues is missing from obd-readonly.js");
  if (extractMonitorValuesFunctionSource) {
    const functionBody = extractMonitorValuesFunctionSource[0];
    check(functionBody.includes('const redacted = redactSensitiveText(value);'), "extractMonitorValues should redact sensitive identifiers before parsing lines");
    check(functionBody.includes('const separator = line.search(/[:') && functionBody.includes('\\t]/);') && functionBody.includes('if (separator < 1) return;'), "extractMonitorValues should split labels and values on known separators");
    check(functionBody.includes('item.aliases.some((alias) => isMonitorLabelMatch(labelPart, alias))'), "extractMonitorValues should resolve monitor definitions through aliases");
    check(functionBody.includes('valuePart.replace(/(\\d),(?=\\d{3}\\b)/g, "$1").match(NUMBER_PATTERN)'), "extractMonitorValues should parse numeric values while tolerating thousands separators");
    check(functionBody.includes('values.set(definition.id, {'), "extractMonitorValues should keep the latest parsed value by monitor id");
    check(functionBody.includes('sourceLine: lineIndex + 1') && functionBody.includes('return [...values.values()];'), "extractMonitorValues should preserve source line and return parsed monitor rows");
  }
};
const supportedPidMatrixFunctionChecks = () => {
  check(Boolean(supportedPidMatrixFunctionSource), "buildSupportedPidMatrix is missing from obd-readonly.js");
  if (supportedPidMatrixFunctionSource) {
    const functionBody = supportedPidMatrixFunctionSource[0];
    check(functionBody.includes('Array.isArray(input.supported_pids)') && functionBody.includes('Array.isArray(input.supportedPidRows)'), "buildSupportedPidMatrix should accept supported PID array aliases");
    check(functionBody.includes('pid.pid || pid.code || pid.id || pid.pid_code || pid.pidCode'), "buildSupportedPidMatrix should normalize object PID aliases");
    check(functionBody.includes('String(pid).toUpperCase().replace(/^0X/, "").padStart(2, "0")'), "buildSupportedPidMatrix should normalize scalar PIDs as uppercase two-digit hex");
    check(functionBody.includes('monitorDefinitions') && functionBody.includes('definition.service === "01" && definition.pid'), "buildSupportedPidMatrix should map support against Mode 01 monitor definitions");
    check(functionBody.includes('supported: supported.has(String(definition.pid).toUpperCase())'), "buildSupportedPidMatrix should mark definitions supported from decoded PID ids");
    check(functionBody.includes('supportedCount: items.filter((item) => item.supported).length') && functionBody.includes('knownPidCount: items.length'), "buildSupportedPidMatrix should expose supported and known PID counts");
    check(functionBody.includes('retainedRawText: false'), "buildSupportedPidMatrix should never retain raw text");
  }
};
const standardPidValueFunctionChecks = () => {
  check(Boolean(standardPidValueFunctionSource), "decodeStandardPidValue is missing from obd-readonly.js");
  if (standardPidValueFunctionSource) {
    const functionBody = standardPidValueFunctionSource[0];
    check(functionBody.includes('monitorDefinitions.find((item) => item.service === "01" && item.pid === pid)'), "decodeStandardPidValue should resolve Mode 01 monitor definitions by PID");
    check(functionBody.includes('if (!Number.isInteger(a)) return null;'), "decodeStandardPidValue should reject payloads without a first byte");
    check(functionBody.includes('decodeOxygenSensorPid(pid, a, b)') && functionBody.includes('decodeWideOxygenVoltagePid(pid, a, b, c, d)'), "decodeStandardPidValue should route oxygen sensor PID families to specialized decoders");
    check(functionBody.includes('if (pid === "01") return decodeMonitorStatusPid(pid, a, b);') && functionBody.includes('else if (pid === "03") return decodeFuelSystemStatusPid(pid, a, b);'), "decodeStandardPidValue should preserve status PID specialized decoders");
    check(functionBody.includes('else if (pid === "0C" && Number.isInteger(b)) value = ((a * 256) + b) / 4;') && functionBody.includes('else if (pid === "42" && Number.isInteger(b)) value = ((a * 256) + b) / 1000;'), "decodeStandardPidValue should preserve RPM and control-module-voltage formulas");
    check(functionBody.includes('else if (definition.valueType === "number") return buildUndecodedPidValue(definition, pid, dataBytes);'), "decodeStandardPidValue should retain undecoded numeric PIDs as explicit raw values");
    check(functionBody.includes('value: typeof value === "number" ? Number(value.toFixed(3)) : value'), "decodeStandardPidValue should round decoded numeric values consistently");
  }
};
const undecodedPidValueFunctionChecks = () => {
  check(Boolean(undecodedPidValueFunctionSource), "buildUndecodedPidValue is missing from obd-readonly.js");
  if (undecodedPidValueFunctionSource) {
    const functionBody = undecodedPidValueFunctionSource[0];
    check(functionBody.includes('const rawHex = formatRawPidBytes(dataBytes);'), "buildUndecodedPidValue should format payload bytes before retaining an undecoded value");
    check(functionBody.includes('if (!rawHex) return null;'), "buildUndecodedPidValue should reject empty undecoded payloads");
    check(functionBody.includes('id: definition.id,') && functionBody.includes('pid,'), "buildUndecodedPidValue should retain definition id and PID");
    check(functionBody.includes('value: rawHex,') && functionBody.includes('unit: definition.unit || "",'), "buildUndecodedPidValue should expose raw hex and a safe unit fallback");
    check(functionBody.includes('decoded: false,') && functionBody.includes('note:'), "buildUndecodedPidValue should mark undecoded raw values explicitly");
  }
  check(Boolean(rawPidBytesFunctionSource), "formatRawPidBytes is missing from obd-readonly.js");
  if (rawPidBytesFunctionSource) {
    const functionBody = rawPidBytesFunctionSource[0];
    check(functionBody.includes('.filter(Number.isInteger)'), "formatRawPidBytes should ignore non-integer byte values");
    check(functionBody.includes('.map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))'), "formatRawPidBytes should format bytes as uppercase two-digit hex");
    check(functionBody.includes('.join(" ");'), "formatRawPidBytes should separate byte values with spaces");
  }
};
const standardPidPayloadLengthFunctionChecks = () => {
  check(Boolean(standardPidPayloadLengthFunctionSource), "getStandardPidPayloadLength is missing from obd-readonly.js");
  if (standardPidPayloadLengthFunctionSource) {
    const functionBody = standardPidPayloadLengthFunctionSource[0];
    check(functionBody.includes('const oneBytePids = [') && functionBody.includes('"04"') && functionBody.includes('"A5"'), "getStandardPidPayloadLength should retain one-byte PID mapping");
    check(functionBody.includes('const twoBytePids = [') && functionBody.includes('"0C"') && functionBody.includes('"69"'), "getStandardPidPayloadLength should retain two-byte PID mapping");
    check(functionBody.includes('const fourBytePids = ["01", "24"') && functionBody.includes('"A6"'), "getStandardPidPayloadLength should retain four-byte PID mapping");
    check(functionBody.includes('if (oneBytePids.includes(pid)) return 1;') && functionBody.includes('if (twoBytePids.includes(pid)) return 2;'), "getStandardPidPayloadLength should return fixed lengths for known one- and two-byte PIDs");
    check(functionBody.includes('if (fourBytePids.includes(pid)) return 4;') && functionBody.includes('if (pid === "64") return 5;'), "getStandardPidPayloadLength should return fixed lengths for four- and five-byte PIDs");
    check(functionBody.includes('return 0;'), "getStandardPidPayloadLength should return zero for unknown-length PIDs");
  }
};
const responsePayloadFunctionChecks = () => {
  check(Boolean(responsePayloadFunctionSource), "getResponsePayload is missing from obd-readonly.js");
  if (responsePayloadFunctionSource) {
    const functionBody = responsePayloadFunctionSource[0];
    check(functionBody.includes('if (payloadLength > 0) return bytes.slice(payloadStart, payloadStart + payloadLength);'), "getResponsePayload should use fixed payload length when known");
    check(functionBody.includes('const nextHeader = bytes.findIndex((byte, nextIndex) => nextIndex > payloadStart && byte === responseHeader);'), "getResponsePayload should find the next response header for unknown-length payloads");
    check(functionBody.includes('const payloadEnd = nextHeader > payloadStart ? nextHeader : bytes.length;'), "getResponsePayload should fall back to end of bytes when no next header exists");
    check(functionBody.includes('return bytes.slice(payloadStart, payloadEnd);'), "getResponsePayload should slice only the current response payload");
  }
};
const monitorStatusPidFunctionChecks = () => {
  check(Boolean(monitorStatusPidFunctionSource), "decodeMonitorStatusPid is missing from obd-readonly.js");
  if (monitorStatusPidFunctionSource) {
    const functionBody = monitorStatusPidFunctionSource[0];
    check(functionBody.includes('item.id === "monitor_status"') && functionBody.includes('item.id === "monitor_status_mil"'), "decodeMonitorStatusPid should resolve summary and MIL definitions");
    check(functionBody.includes('item.id === "monitor_status_dtc_count"') && functionBody.includes('item.id === "monitor_status_ignition_type"'), "decodeMonitorStatusPid should resolve DTC count and ignition type definitions");
    check(functionBody.includes('const dtcCount = a & 0x7F;'), "decodeMonitorStatusPid should decode DTC count from low seven bits");
    check(functionBody.includes('const mil = (a & 0x80) !== 0 ? "mil_on" : "mil_off";'), "decodeMonitorStatusPid should decode MIL state from the high bit");
    check(functionBody.includes('const ignition = Number.isInteger(b) && (b & 0x08) !== 0 ? "compression" : "spark";'), "decodeMonitorStatusPid should decode spark versus compression ignition");
    check(functionBody.includes('value: `${mil};dtc_count=${dtcCount};ignition=${ignition}`'), "decodeMonitorStatusPid should expose a combined monitor status summary");
    check(functionBody.includes('return values.length ? values : null;'), "decodeMonitorStatusPid should return null without matching definitions");
  }
};
const fuelSystemStatusPidFunctionChecks = () => {
  check(Boolean(fuelSystemStatusPidFunctionSource), "decodeFuelSystemStatusPid is missing from obd-readonly.js");
  if (fuelSystemStatusPidFunctionSource) {
    const functionBody = fuelSystemStatusPidFunctionSource[0];
    check(functionBody.includes('item.id === "fuel_system_status"') && functionBody.includes('item.id === "fuel_system_status_bank1"'), "decodeFuelSystemStatusPid should resolve summary and bank 1 definitions");
    check(functionBody.includes('item.id === "fuel_system_status_bank2"'), "decodeFuelSystemStatusPid should resolve bank 2 definitions");
    check(functionBody.includes('0x01: "closed_loop_using_oxygen_sensor"') && functionBody.includes('0x04: "open_loop_due_to_system_failure"'), "decodeFuelSystemStatusPid should retain core fuel-system status labels");
    check(functionBody.includes('const bank1 = labels[a] || `unknown_0x${a.toString(16).toUpperCase().padStart(2, "0")}`;'), "decodeFuelSystemStatusPid should provide an unknown fallback for bank 1");
    check(functionBody.includes('const bank2 = Number.isInteger(b) && b !== 0 ? labels[b] || `unknown_0x${b.toString(16).toUpperCase().padStart(2, "0")}` : null;'), "decodeFuelSystemStatusPid should treat zero or missing bank 2 as absent");
    check(functionBody.includes('value: bank2 ? `${bank1};${bank2}` : bank1'), "decodeFuelSystemStatusPid should expose a combined summary when bank 2 is present");
    check(functionBody.includes('return values.length ? values : null;'), "decodeFuelSystemStatusPid should return null without matching definitions");
  }
};
const oxygenSensorPidFunctionChecks = () => {
  check(Boolean(oxygenSensorPidFunctionSource), "decodeOxygenSensorPid is missing from obd-readonly.js");
  if (oxygenSensorPidFunctionSource) {
    const functionBody = oxygenSensorPidFunctionSource[0];
    check(functionBody.includes('item.id.endsWith("_voltage")'), "decodeOxygenSensorPid should resolve voltage definitions by suffix");
    check(functionBody.includes('item.id.endsWith("_stft")'), "decodeOxygenSensorPid should resolve short fuel trim definitions by suffix");
    check(functionBody.includes('value: Number((a / 200).toFixed(3))'), "decodeOxygenSensorPid should decode narrowband oxygen sensor voltage");
    check(functionBody.includes('if (trimDefinition && Number.isInteger(b))'), "decodeOxygenSensorPid should require a second byte for trim values");
    check(functionBody.includes('value: Number((((b - 128) * 100 / 128)).toFixed(3))'), "decodeOxygenSensorPid should decode short fuel trim percentage");
    check(functionBody.includes('return values.length ? values : null;'), "decodeOxygenSensorPid should return null without matching definitions");
  }
};
const wideOxygenSensorPidFunctionChecks = () => {
  check(Boolean(wideOxygenVoltagePidFunctionSource), "decodeWideOxygenVoltagePid is missing from obd-readonly.js");
  check(Boolean(wideOxygenCurrentPidFunctionSource), "decodeWideOxygenCurrentPid is missing from obd-readonly.js");
  if (wideOxygenVoltagePidFunctionSource) {
    const functionBody = wideOxygenVoltagePidFunctionSource[0];
    check(functionBody.includes('if (!Number.isInteger(b) || !Number.isInteger(c) || !Number.isInteger(d)) return null;'), "decodeWideOxygenVoltagePid should require four payload bytes");
    check(functionBody.includes('item.id.endsWith("_ratio")') && functionBody.includes('item.id.endsWith("_voltage_wide")'), "decodeWideOxygenVoltagePid should resolve ratio and wide-voltage definitions by suffix");
    check(functionBody.includes('value: Number((((a * 256) + b) / 32768).toFixed(3))'), "decodeWideOxygenVoltagePid should decode equivalence ratio");
    check(functionBody.includes('value: Number((((c * 256) + d) / 8192).toFixed(3))'), "decodeWideOxygenVoltagePid should decode wideband voltage");
  }
  if (wideOxygenCurrentPidFunctionSource) {
    const functionBody = wideOxygenCurrentPidFunctionSource[0];
    check(functionBody.includes('if (!Number.isInteger(b) || !Number.isInteger(c) || !Number.isInteger(d)) return null;'), "decodeWideOxygenCurrentPid should require four payload bytes");
    check(functionBody.includes('item.id.endsWith("_current")') && functionBody.includes('item.id.endsWith("_current_ratio")'), "decodeWideOxygenCurrentPid should resolve current and ratio definitions by suffix");
    check(functionBody.includes('value: Number((((a * 256) + b) / 32768).toFixed(3))'), "decodeWideOxygenCurrentPid should decode current ratio");
    check(functionBody.includes('value: Number((((c * 256) + d) / 256 - 128).toFixed(3))'), "decodeWideOxygenCurrentPid should decode sensor current");
  }
};
const enginePercentTorqueDataFunctionChecks = () => {
  check(Boolean(enginePercentTorqueDataFunctionSource), "decodeEnginePercentTorqueData is missing from obd-readonly.js");
  if (enginePercentTorqueDataFunctionSource) {
    const functionBody = enginePercentTorqueDataFunctionSource[0];
    check(functionBody.includes('"engine_percent_torque_idle"') && functionBody.includes('"engine_percent_torque_point4"'), "decodeEnginePercentTorqueData should retain idle through point 4 torque IDs");
    check(functionBody.includes('ids.forEach((id, index) => {') && functionBody.includes('const byte = dataBytes[index];'), "decodeEnginePercentTorqueData should map each torque ID to its payload byte position");
    check(functionBody.includes('monitorDefinitions.find((item) => item.service === "01" && item.pid === pid && item.id === id)'), "decodeEnginePercentTorqueData should resolve Mode 01 torque definitions by PID and ID");
    check(functionBody.includes('if (!definition || !Number.isInteger(byte)) return;'), "decodeEnginePercentTorqueData should skip missing definitions or missing payload bytes");
    check(functionBody.includes('value: byte - 125'), "decodeEnginePercentTorqueData should decode signed percent torque by subtracting 125");
    check(functionBody.includes('return values.length ? values : null;'), "decodeEnginePercentTorqueData should return null without decoded torque values");
  }
};
const commandedEgrAndErrorFunctionChecks = () => {
  check(Boolean(commandedEgrAndErrorFunctionSource), "decodeCommandedEgrAndError is missing from obd-readonly.js");
  if (commandedEgrAndErrorFunctionSource) {
    const functionBody = commandedEgrAndErrorFunctionSource[0];
    check(functionBody.includes('if (!Number.isInteger(b)) return null;'), "decodeCommandedEgrAndError should require the EGR error byte");
    check(functionBody.includes('item.id === "commanded_egr_pid69"') && functionBody.includes('item.id === "egr_error_pid69"'), "decodeCommandedEgrAndError should resolve commanded EGR and EGR error definitions");
    check(functionBody.includes('value: Number((a * 100 / 255).toFixed(3))'), "decodeCommandedEgrAndError should decode commanded EGR percentage");
    check(functionBody.includes('value: Number(((b - 128) * 100 / 128).toFixed(3))'), "decodeCommandedEgrAndError should decode signed EGR error percentage");
    check(functionBody.includes('return values.length ? values : null;'), "decodeCommandedEgrAndError should return null without decoded EGR values");
  }
};
const basicEnumPidFunctionChecks = () => {
  check(Boolean(secondaryAirStatusFunctionSource), "decodeSecondaryAirStatus is missing from obd-readonly.js");
  if (secondaryAirStatusFunctionSource) {
    const functionBody = secondaryAirStatusFunctionSource[0];
    check(functionBody.includes('0x01: "upstream"') && functionBody.includes('0x08: "pump_commanded_on_for_diagnostics"'), "decodeSecondaryAirStatus should retain secondary-air status labels");
    check(functionBody.includes('return labels[a] || `unknown_0x${a.toString(16).toUpperCase().padStart(2, "0")}`;'), "decodeSecondaryAirStatus should provide an unknown hex fallback");
  }
  check(Boolean(oxygenSensorLocationsFunctionSource), "decodeOxygenSensorLocations is missing from obd-readonly.js");
  if (oxygenSensorLocationsFunctionSource) {
    const functionBody = oxygenSensorLocationsFunctionSource[0];
    check(functionBody.includes('["b1s1", "b1s2", "b2s1", "b2s2", "b3s1", "b3s2", "b4s1", "b4s2"]'), "decodeOxygenSensorLocations should retain the four-bank oxygen sensor layout");
    check(functionBody.includes('["b1s1", "b1s2", "b1s3", "b1s4", "b2s1", "b2s2", "b2s3", "b2s4"]'), "decodeOxygenSensorLocations should retain the two-bank oxygen sensor layout");
    check(functionBody.includes('const present = labels.filter((_, index) => Boolean(a & (1 << index)));'), "decodeOxygenSensorLocations should map set bits to sensor locations");
    check(functionBody.includes('return present.length ? present.join(",") : "none_reported";'), "decodeOxygenSensorLocations should report none when no sensor bits are set");
  }
  check(Boolean(auxiliaryInputStatusFunctionSource), "decodeAuxiliaryInputStatus is missing from obd-readonly.js");
  if (auxiliaryInputStatusFunctionSource) {
    const functionBody = auxiliaryInputStatusFunctionSource[0];
    check(functionBody.includes('return (a & 0x01) ? "pto_active" : "pto_inactive";'), "decodeAuxiliaryInputStatus should decode PTO state from bit 0");
  }
  check(Boolean(obdStandardFunctionSource), "decodeObdStandard is missing from obd-readonly.js");
  if (obdStandardFunctionSource) {
    const functionBody = obdStandardFunctionSource[0];
    check(functionBody.includes('0x01: "obd_ii_california_arb"') && functionBody.includes('0x0A: "jobd"'), "decodeObdStandard should retain OBD II and JOBD labels");
    check(functionBody.includes('0x13: "heavy_duty_obd"') && functionBody.includes('0x14: "wwh_obd"'), "decodeObdStandard should retain heavy-duty and WWH-OBD labels");
    check(functionBody.includes('return labels[a] || `unknown_0x${a.toString(16).toUpperCase().padStart(2, "0")}`;'), "decodeObdStandard should provide an unknown hex fallback");
  }
  check(Boolean(fuelTypeFunctionSource), "decodeFuelType is missing from obd-readonly.js");
  if (fuelTypeFunctionSource) {
    const functionBody = fuelTypeFunctionSource[0];
    check(functionBody.includes('0x01: "gasoline"') && functionBody.includes('0x04: "diesel"') && functionBody.includes('0x08: "electric"'), "decodeFuelType should retain core fuel-type labels");
    check(functionBody.includes('0x11: "hybrid_gasoline"') && functionBody.includes('0x17: "bifuel_diesel"'), "decodeFuelType should retain hybrid and bifuel labels");
    check(functionBody.includes('return labels[a] || `unknown_0x${a.toString(16).toUpperCase().padStart(2, "0")}`;'), "decodeFuelType should provide an unknown hex fallback");
  }
};
const diagnosticScanSessionFunctionChecks = () => {
  check(Boolean(diagnosticScanSessionFunctionSource), "buildDiagnosticScanSession is missing from obd-readonly.js");
  if (diagnosticScanSessionFunctionSource) {
    const functionBody = diagnosticScanSessionFunctionSource[0];
    check(functionBody.includes('const sessionInput = getDiagnosticSessionInput(input);') && functionBody.includes('const metadataOverrides = getSessionMetadataOverrides(sessionInput);'), "buildDiagnosticScanSession should normalize session input and metadata overrides first");
    check(functionBody.includes('const importedCoreSessionStatus = sessionInput.coreSessionStatus || sessionInput.core_session_status || null;') && functionBody.includes('importedCoreSessionStatus,'), "buildDiagnosticScanSession should expose imported core session status separately from recalculated status");
    check(functionBody.includes('const importedDiagnosticFlowSummary = sessionInput.diagnosticFlowSummary || sessionInput.diagnostic_flow_summary || null;') && functionBody.includes('importedDiagnosticFlowSummary,'), "buildDiagnosticScanSession should expose imported diagnostic flow summary separately from recalculated status");
    check(functionBody.includes('const importedReadoutCompletionSummary = sessionInput.readoutCompletionSummary || sessionInput.readout_completion_summary || null;') && functionBody.includes('importedReadoutCompletionSummary,'), "buildDiagnosticScanSession should expose imported readout completion summary separately from recalculated status");
    check(functionBody.includes('const importedAnalysisReadinessSummary = sessionInput.analysisReadinessSummary || sessionInput.analysis_readiness_summary || null;') && functionBody.includes('importedAnalysisReadinessSummary,'), "buildDiagnosticScanSession should expose imported analysis readiness summary separately from recalculated status");
    check(functionBody.includes('const importedReadoutRequestPlanGateSummary = sessionInput.readoutRequestPlanGateSummary || sessionInput.readout_request_plan_gate_summary || null;') && functionBody.includes('importedReadoutRequestPlanGateSummary,'), "buildDiagnosticScanSession should expose imported readout request plan gate summary separately");
    check(functionBody.includes('sessionInput.livePidSnapshot') && functionBody.includes('sessionInput.live_pid_response') && functionBody.includes('sessionInput.live_pids'), "buildDiagnosticScanSession should accept live PID snapshot and response aliases");
    check(functionBody.includes('sessionInput.freezeFrameSnapshot') && functionBody.includes('sessionInput.freeze_frame_response') && functionBody.includes('sessionInput.freeze_frame'), "buildDiagnosticScanSession should accept freeze-frame snapshot and response aliases");
    check(functionBody.includes('sessionInput.readinessSnapshot') && functionBody.includes('sessionInput.readiness_response'), "buildDiagnosticScanSession should accept readiness snapshot and response aliases");
    check(functionBody.includes('sessionInput.ecuInfoSnapshot') && functionBody.includes('sessionInput.ecu_info_response') && functionBody.includes('sessionInput.ecu_info_items'), "buildDiagnosticScanSession should accept ECU info snapshot and response aliases");
    check(functionBody.includes('decodeLivePidResponse(livePidResponseInput)') && functionBody.includes('normalizeBridgeLivePidSnapshot(livePidSnapshotInput)'), "buildDiagnosticScanSession should decode raw live PID responses or normalize bridge live PID snapshots");
    check(functionBody.includes('decodeFreezeFrameResponse(freezeFrameResponseInput)') && functionBody.includes('normalizeFreezeFrameSnapshot(freezeFrameSnapshotInput)'), "buildDiagnosticScanSession should decode or normalize freeze-frame input");
    check(functionBody.includes('decodeReadinessResponse(readinessResponseInput)') && functionBody.includes('normalizeReadinessSnapshot(readinessSnapshotInput)'), "buildDiagnosticScanSession should decode or normalize readiness input");
    check(functionBody.includes('decodeEcuInfoResponse(ecuInfoResponseInput)') && functionBody.includes('normalizeEcuInfoSnapshot(ecuInfoSnapshotInput)'), "buildDiagnosticScanSession should decode or normalize ECU info input");
    check(functionBody.includes('decodeSupportedPidResponse(supportedPidResponseInput)') && functionBody.includes('buildSupportedPidMatrix(supportedPidMatrixInput)'), "buildDiagnosticScanSession should decode or build supported PID matrices");
    check(functionBody.includes('resolveBridgeInfrastructureInputs({') && functionBody.includes('honorCoverageOverride: true'), "buildDiagnosticScanSession should resolve bridge infrastructure with coverage override support");
    check(functionBody.includes('appendCommonCoreWarnings(warnings, {') && functionBody.includes('rawPidUndecodedCount:'), "buildDiagnosticScanSession should derive common core warnings including undecoded raw PID values");
    check(functionBody.includes('const resolvedMetadata = buildResolvedSessionMetadata({ metadataOverrides, ecuInfoSnapshot });'), "buildDiagnosticScanSession should resolve metadata after ECU info normalization");
    check(functionBody.includes('resolveSessionTemporalContext({') && functionBody.includes('supportedPidMatrix'), "buildDiagnosticScanSession should derive temporal context from all normalized snapshots");
    check(functionBody.includes('includeInfrastructure: hasBridgeInfrastructureContext'), "buildDiagnosticScanSession should derive readout coverage with bridge infrastructure context");
    check(functionBody.includes('appendBridgeReadoutCoverageWarnings(warnings, { hasBridgeInfrastructureContext, readoutCoverage });'), "buildDiagnosticScanSession should append bridge readout warnings through bridge context guard");
    check(functionBody.indexOf('const readoutCoverage = resolveReadoutCoverageSnapshot(readoutCoverageInput, derivedReadoutCoverage);') < functionBody.indexOf('appendBridgeReadoutCoverageWarnings(warnings, { hasBridgeInfrastructureContext, readoutCoverage });'), "buildDiagnosticScanSession should resolve readout coverage before appending bridge readout warnings");
    check(functionBody.includes('const coreSessionStatus = buildCoreSessionStatus({') && functionBody.includes('nextReadoutCandidates: resolvedNextReadoutCandidates'), "buildDiagnosticScanSession should build core session status from resolved readout candidates");
    check(functionBody.includes('const diagnosticFlowSummary = buildDiagnosticFlowSummary(coreSessionStatus);') && functionBody.includes('diagnosticFlowSummary,'), "buildDiagnosticScanSession should expose a top-level diagnostic flow summary");
    check(functionBody.includes('const readoutCompletionSummary = coreSessionStatus.readoutCompletionSummary || null;') && functionBody.includes('readoutCompletionSummary,'), "buildDiagnosticScanSession should expose a top-level readout completion summary");
    check(functionBody.includes('const analysisReadinessSummary = coreSessionStatus.analysisReadinessSummary || null;') && functionBody.includes('analysisReadinessSummary,'), "buildDiagnosticScanSession should expose a top-level analysis readiness summary");
    check(functionBody.includes('const readoutRequestPlanGateSummary = coreSessionStatus.readoutRequestPlanGateSummary') && functionBody.includes('readoutRequestPlanGateSummary,'), "buildDiagnosticScanSession should expose a top-level readout request plan gate summary");
    check(functionBody.includes('const importedAnalysisReadinessComparisonSummary = buildImportedAnalysisReadinessComparisonSummary(importedAnalysisReadinessSummary, analysisReadinessSummary);') && functionBody.includes('importedAnalysisReadinessComparisonSummary,'), "buildDiagnosticScanSession should compare imported and recalculated analysis readiness summary");
    check(functionBody.includes('const importedReadoutRequestPlanGateComparisonSummary = buildImportedReadoutRequestPlanGateComparisonSummary(importedReadoutRequestPlanGateSummary, readoutRequestPlanGateSummary);') && functionBody.includes('importedReadoutRequestPlanGateComparisonSummary,'), "buildDiagnosticScanSession should compare imported and recalculated readout request plan gate summary");
    check(functionBody.includes('onboardMonitorSnapshot,') && functionBody.indexOf('onboardMonitorSnapshot,') < functionBody.indexOf('livePidSnapshot,'), "buildDiagnosticScanSession should pass onboard monitor snapshots into core session status");
    check(functionBody.includes('schemaVersion: "scan_session_v1"') && functionBody.includes('sessionId: String(sessionInput.session_id || sessionInput.sessionId || "local_scan_session").slice(0, 80)'), "buildDiagnosticScanSession should emit a bounded scan session identity");
    check(functionBody.includes('monitorValueSummary: resolveMonitorValueSummary([') && functionBody.includes('...freezeFrameSnapshot.monitorValues'), "buildDiagnosticScanSession should summarize live PID and freeze-frame monitor values");
    check(functionBody.includes('...buildReadOnlyFlags({') && functionBody.includes('vehicleCommandEnabled: false'), "buildDiagnosticScanSession should return explicit read-only flags");
  }
};
const readinessHeadlineFunctionChecks = () => {
  check(Boolean(readinessHeadlineFunctionSource), "buildCoreReadinessHeadline is missing from script.js");
  if (readinessHeadlineFunctionSource) {
    const functionBody = readinessHeadlineFunctionSource[0];
    check(functionBody.includes('const emptyReadoutSummary = formatCoreEmptyReadoutSummary'), "buildCoreReadinessHeadline should derive empty readout summary");
    check(functionBody.includes('const blockingSummary = formatCoreBlockingWarningSummary'), "buildCoreReadinessHeadline should derive blocking warnings");
    check(functionBody.indexOf('const emptyReadoutSummary = formatCoreEmptyReadoutSummary') < functionBody.indexOf('const blockingSummary = formatCoreBlockingWarningSummary'), "buildCoreReadinessHeadline should evaluate empty readouts before blocking warnings");
    check(functionBody.indexOf('const blockingSummary = formatCoreBlockingWarningSummary') < functionBody.indexOf('if (coreSessionStatus.readyForAnalysis === true)'), "buildCoreReadinessHeadline should evaluate blocking warnings before analysis-ready status");
    check(functionBody.indexOf('if (coreSessionStatus.readyForAnalysis === true)') < functionBody.indexOf('const labels = coreSessionStatus.remainingReadoutIds'), "buildCoreReadinessHeadline should evaluate analysis-ready status before remaining readout labels");
  }
};
const coreSummaryFunctionChecks = () => {
  check(Boolean(coreNextStepFunctionSource), "formatCoreNextStepSummary is missing from script.js");
  if (coreNextStepFunctionSource) {
    const functionBody = coreNextStepFunctionSource[0];
    check(functionBody.includes('const blockingSummary = formatCoreBlockingWarningSummary'), "formatCoreNextStepSummary should derive blocking warnings");
    check(functionBody.includes('const emptyReadoutSummary = formatCoreEmptyReadoutSummary'), "formatCoreNextStepSummary should derive empty readout summary");
    check(functionBody.includes('const nextReadoutSummary = formatNextReadoutSummary'), "formatCoreNextStepSummary should derive next readout summary");
    check(functionBody.indexOf('const blockingSummary = formatCoreBlockingWarningSummary') < functionBody.indexOf('const emptyReadoutSummary = formatCoreEmptyReadoutSummary'), "formatCoreNextStepSummary should evaluate blocking warnings before empty readouts");
    check(functionBody.indexOf('const emptyReadoutSummary = formatCoreEmptyReadoutSummary') < functionBody.indexOf('const nextReadoutSummary = formatNextReadoutSummary'), "formatCoreNextStepSummary should evaluate empty readouts before explicit next-readout summary");
    check(functionBody.indexOf('const nextReadoutSummary = formatNextReadoutSummary') < functionBody.indexOf('if (coreSessionStatus?.readyForAnalysis === true)'), "formatCoreNextStepSummary should evaluate explicit next-readout summary before analysis-ready status");
  }
};

function check(condition, message) {
  if (!condition) failures.push(message);
}
normalizeNextReadoutCandidatesFunctionChecks();
resolveNextReadoutCandidatesFunctionChecks();
nextReadoutCandidatesFunctionChecks();
coreSessionStatusFunctionChecks();
resolvedSessionMetadataFunctionChecks();
diagnosticSessionInputFunctionChecks();
nestedSessionMetadataMergeFunctionChecks();
sessionMetadataOverridesFunctionChecks();
bridgeDiagnosticImportFunctionChecks();
bridgeSessionExportPayloadFunctionChecks();
summaryMetadataFieldsFunctionChecks();
mergedBridgeMetadataFunctionChecks();
bridgeSummaryInputFunctionChecks();
bridgeSummaryAliasFunctionChecks();
detectBridgeInfrastructureFunctionChecks();
bridgeReadOnlyGateFunctionChecks();
vehicleReadOnlyOperationGateFunctionChecks();
bridgeResponseSafetyFunctionChecks();
bridgeCoreReadoutNormalizerFunctionChecks();
bridgeExtendedCoreReadoutNormalizerFunctionChecks();
bridgePidValueFunctionChecks();
readoutCoverageFunctionChecks();
normalizeReadoutCoverageFunctionChecks();
resolveReadoutCoverageFunctionChecks();
vehicleApplicabilityFunctionChecks();
vehicleApplicabilityWarningsFunctionChecks();
resolveBridgeSummaryFunctionChecks();
resolveBridgeInfrastructureFunctionChecks();
sessionTemporalContextFunctionChecks();
importClassificationFunctionChecks();
readOnlyFlagsFunctionChecks();
commonCoreWarningsFunctionChecks();
warningListFunctionChecks();
mergeDiagnosticInputsFunctionChecks();
readoutCoverageInputFunctionChecks();
monitorValueSummaryFunctionChecks();
buildMonitorValueSummaryFunctionChecks();
analyzeMonitorValuesFunctionChecks();
bridgeReadoutWarningsFunctionChecks();
bridgeSessionSummaryFunctionChecks();
dtcSnapshotFunctionChecks();
freezeFrameSnapshotFunctionChecks();
readinessSnapshotFunctionChecks();
ecuResponseSummaryFunctionChecks();
ecuInfoRowsFunctionChecks();
ecuInfoSnapshotFunctionChecks();
onboardMonitorSnapshotFunctionChecks();
ecuInfoValueFunctionChecks();
sanitizeEcuInfoValueFunctionChecks();
mode09SupportedInfoTypesFunctionChecks();
trimEcuInfoPayloadFunctionChecks();
ecuInfoPayloadFunctionChecks();
parseObdHexBytesFunctionChecks();
decodeObdDtcResponseFunctionChecks();
mergeDtcSnapshotsFunctionChecks();
decodeDtcPairFunctionChecks();
decodeSupportedPidResponseFunctionChecks();
supportedPidBaseFunctionChecks();
decodeLivePidResponseFunctionChecks();
decodeFreezeFrameResponseFunctionChecks();
decodeEcuInfoResponseFunctionChecks();
decodeReadinessResponseFunctionChecks();
decodeOnboardMonitorResponseFunctionChecks();
decodedObdScanSessionFunctionChecks();
scanSessionFromObdTextFunctionChecks();
textDtcSnapshotFunctionChecks();
classifyObdResponseLinesFunctionChecks();
buildObdLogPacketsFunctionChecks();
normalizeObdLogLineFunctionChecks();
normalizeCanLogLineFormatFunctionChecks();
normalizeCanCsvLogLineFunctionChecks();
extractObdFrameMetadataFunctionChecks();
ecuResponsesFromBucketsFunctionChecks();
isoTpSummaryFunctionChecks();
negativeResponseSummaryFunctionChecks();
negativeObdResponseFunctionChecks();
negativeResponseCodeFunctionChecks();
textImportMetadataFunctionChecks();
scannerTextExtractionFunctionChecks();
supportedPidMatrixFunctionChecks();
standardPidValueFunctionChecks();
undecodedPidValueFunctionChecks();
standardPidPayloadLengthFunctionChecks();
responsePayloadFunctionChecks();
monitorStatusPidFunctionChecks();
fuelSystemStatusPidFunctionChecks();
oxygenSensorPidFunctionChecks();
wideOxygenSensorPidFunctionChecks();
enginePercentTorqueDataFunctionChecks();
commandedEgrAndErrorFunctionChecks();
basicEnumPidFunctionChecks();
diagnosticScanSessionFunctionChecks();
readinessHeadlineFunctionChecks();
coreSummaryFunctionChecks();

check(obd?.policy?.transmitsVehicleCommands === false, "車両コマンド送信が禁止されていません");
check(obd?.policy?.storesRawInput === false, "入力原文の保存が禁止されていません");
check(obd?.policy?.uploadsRawInput === false, "入力原文の外部送信が禁止されていません");
check(obd?.policy?.blockedOperations?.includes("DTC消去"), "DTC消去が禁止一覧にありません");
check(obd?.policy?.hardwareConnectionEnabled === false, "実機接続が安全ゲート外で有効です");
check(obd?.policy?.connectionPreparationEnabled === true, "接続準備レイヤーが無効です");

const analysis = obd.analyzeScannerText("P0171 p0300 JTDKN3DU0A0123456 P0171");
check(obd.analyzeScannerText("Toyota Techstream J2534 health check").toolHints.join(",") === "Techstream,J2534", "Scanner text tool hints were not detected");
check(obd.analyzeScannerText("GTS CONSULT-III HDS IDS").toolHints.join(",") === "Techstream,CONSULT,HDS,IDS", "Expanded scanner tool hints were not detected");
check(analysis.codes.join(",") === "P0171,P0300", "DTC抽出または重複除外が不正です");
check(analysis.hadSensitiveIdentifier === true, "車台番号候補を検出できません");
check(analysis.retainedRawText === false, "入力原文を保持する設定になっています");
check(obd.getCapability().hardwareConnectionEnabled === false, "実機接続が予期せず有効です");
check(obd.getCapability().connectionPreparationEnabled === true, "接続準備状態を取得できません");
check(obd.configureMonitorDefinitions(monitorDefinitions) === true, "外部モニター辞書を読み込めません");
check(obd.getMonitorDefinitions().length >= 130, "データモニター辞書が130項目未満です");
check(obd.getCapability().monitorDefinitionCount === monitorDefinitions.length, "辞書件数を取得できません");
check(diagnosticCapabilityStatus.some((item) => item.id === "capability-live-data" && item.done.includes("bridge/session alias を吸収してライブデータ要約へ統合")), "ライブデータ alias 統合の進捗根拠が不足しています");
check(obd.configureFreezeFrameItems(freezeFrameItems) === true, "フリーズフレーム項目辞書を読み込めません");
check(obd.getFreezeFrameItems().length >= 12, "フリーズフレーム項目辞書が不足しています");
check(obd.getFreezeFrameItems().some((item) => item.monitorId === "control_module_voltage"), "フリーズフレーム項目に制御モジュール電圧がありません");
check(obd.configureReadinessMonitors(readinessMonitors) === true, "レディネスモニター辞書を読み込めません");
check(obd.getReadinessMonitors().length >= 14, "レディネスモニター辞書が不足しています");
check(obd.getReadinessMonitors().some((item) => item.id === "evaporative_system"), "EVAPレディネスモニターがありません");
check(obd.configureEcuInfoItems(ecuInfoItems) === true, "ECU情報項目辞書を読み込めません");
check(obd.getEcuInfoItems().length >= 7, "ECU情報項目辞書が不足しています");
check(obd.getEcuInfoItems().some((item) => item.id === "calibration_verification_number"), "CVN情報項目がありません");
check(obd.getCapability().freezeFrameItemCount === freezeFrameItems.length, "フリーズフレーム辞書件数を取得できません");
check(obd.getCapability().readinessMonitorCount === readinessMonitors.length, "レディネス辞書件数を取得できません");
check(obd.getCapability().ecuInfoItemCount === ecuInfoItems.length, "ECU情報辞書件数を取得できません");
check(obd.configureVehicleInterfaceCatalog(vehicleInterfaceCatalog) === true, "VCI候補カタログを読み込めません");
const interfaceCatalog = obd.getVehicleInterfaceCatalog();
check(interfaceCatalog.length >= 4, "VCI候補カタログが不足しています");
check(interfaceCatalog.some((item) => item.id === "user-vci-techstream-j2534" && item.interfaceFamily === "j2534-passthru"), "Techstream/J2534候補がありません");
check(interfaceCatalog.some((item) => item.id === "user-vci-elm327" && item.readScopeCandidates.includes("Mode 03 保存DTC")), "ELM327候補の読取範囲が不足しています");
check(interfaceCatalog.some((item) => item.id === "user-vci-rcmall-mks-canable-v2-pro" && item.tooling.includes("SavvyCAN")), "CANable/SavvyCAN候補がありません");
check(interfaceCatalog.every((item) => item.vehicleCommandEnabled === false), "VCI候補で車両コマンドが有効です");
check(interfaceCatalog.every((item) => Number.isInteger(item.progressPercent) && item.progressPercent >= 0 && item.progressPercent <= 100), "VCI候補の進捗率が不正です");
check(interfaceCatalog.every((item) => typeof item.currentBasis === "string" && item.currentBasis.length > 0), "VCI候補の現在地説明が不足しています");
check(interfaceCatalog.every((item) => typeof item.nextBuild === "string" && item.nextBuild.length > 0), "VCI候補の次工程が不足しています");
check(interfaceCatalog.every((item) => typeof item.etaTarget === "string" && item.etaTarget.length > 0), "VCI候補の目標時期が不足しています");
check(interfaceCatalog.every((item) => Array.isArray(item.verificationRequired) && item.verificationRequired.length >= 4), "VCI候補の検証条件が不足しています");
check(diagnosticCoverageRoadmap.length >= 6, "診断データ網羅ロードマップが不足しています");
check(diagnosticCoverageRoadmap.every((item) => Number.isInteger(item.progress_percent) && item.progress_percent >= 0 && item.progress_percent <= 100), "診断データ網羅ロードマップの進捗率が不正です");
check(diagnosticCoverageRoadmap.every((item) => typeof item.eta_target === "string" && item.eta_target.length > 0), "診断データ網羅ロードマップの目標時期が不足しています");
check(diagnosticCoverageRoadmap.some((item) => item.id === "coverage-body-b" && item.current_count_note.includes("0件")), "B系未整備状態がロードマップにありません");
check(diagnosticCoverageRoadmap.some((item) => item.id === "coverage-chassis-c" && item.current_count_note.includes("0件")), "C系未整備状態がロードマップにありません");
check(diagnosticCoverageRoadmap.some((item) => item.id === "coverage-oem-enhanced-dtc" && item.blocked_until.length), "メーカー固有DTCの確認待ち条件が不足しています");
check(diagnosticCapabilityStatus.length >= 6, "診断機能完成度マトリクスが不足しています");
check(diagnosticCapabilityStatus.every((item) => Number.isInteger(item.progress_percent) && item.progress_percent >= 0 && item.progress_percent <= 100), "診断機能完成度マトリクスの進捗率が不正です");
check(diagnosticCapabilityStatus.every((item) => typeof item.eta_target === "string" && item.eta_target.length > 0), "診断機能完成度マトリクスの目標時期が不足しています");
check(diagnosticCapabilityStatus.some((item) => item.id === "capability-bidirectional" && item.progress_percent <= 5), "双方向制御の安全ゲート状態が不足しています");
check(diagnosticCapabilityStatus.some((item) => item.id === "capability-local-bridge" && item.progress_percent >= 58), "ローカルブリッジの読取入口進捗が不足しています");
check(diagnosticCapabilityStatus.some((item) => item.id === "capability-local-bridge" && item.done.includes("PC側ローカルブリッジの読取専用サンプル実装")), "ローカルブリッジ読取サンプル実装状態が不足しています");
check(diagnosticCapabilityStatus.some((item) => item.id === "capability-local-bridge" && item.done.includes("bridge/session/export/import の nested alias 吸収と outer 優先正規化")), "ローカルブリッジ alias 正規化の進捗根拠が不足しています");
check(diagnosticCapabilityStatus.some((item) => item.id === "capability-local-bridge" && item.done.includes("selected vehicle profile carry-through to bridge/session summaries")), "ローカルブリッジの車両プロファイル引継ぎ進捗が不足しています");
check(diagnosticCapabilityStatus.some((item) => item.id === "capability-local-bridge" && item.missing.includes("実VCIドライバ連携")), "ローカルブリッジ実VCI未連携状態が不足しています");
check(diagnosticCapabilityStatus.some((item) => item.id === "capability-guided-diagnostics" && item.done.includes("bridge/session/export/import の alias 吸収後も同じ診断入力モデルへ統合")), "診断支援ワークフロー alias 統合の進捗根拠が不足しています");
check(diagnosticCapabilityStatus.some((item) => item.id === "capability-guided-diagnostics" && item.done.includes("selected vehicle label retained across analysis summaries")), "診断支援ワークフローの車両ラベル保持進捗が不足しています");
check(diagnosticCapabilityStatus.some((item) => item.id === "capability-generic-obd2-dtc" && item.current_basis.includes("ブリッジDTC統合あり")), "汎用OBD2 DTCのブリッジ統合根拠が不足しています");
check(diagnosticCapabilityStatus.some((item) => item.id === "capability-oem-enhanced" && item.current_basis.includes("貼り付け解析入口")), "メーカー固有DTCの貼り付け解析入口が不足しています");
check(diagnosticCapabilityStatus.some((item) => item.id === "capability-oem-enhanced" && item.done.includes("Techstream等の読取結果貼り付けを先行解析する方針")), "メーカー固有DTCの貼り付け解析方針が不足しています");
const indexHtml = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const styleCss = fs.readFileSync(new URL("../style.css", import.meta.url), "utf8");
const nextStepFunctionSource = appSource.match(/function formatCoreNextStepSummary[\s\S]*?\r?\n\}/);
check(Boolean(nextStepFunctionSource), "formatCoreNextStepSummary is missing from script.js");
if (nextStepFunctionSource) {
  const functionBody = nextStepFunctionSource[0];
  check(functionBody.indexOf('const blockingSummary = formatCoreBlockingWarningSummary') < functionBody.indexOf('const nextReadoutSummary = formatNextReadoutSummary'), "formatCoreNextStepSummary should evaluate blocking warnings before next readout candidates");
  check(functionBody.indexOf('const emptyReadoutSummary = formatCoreEmptyReadoutSummary') < functionBody.indexOf('const nextReadoutSummary = formatNextReadoutSummary'), "formatCoreNextStepSummary should evaluate empty readouts before next readout candidates");
}
check(indexHtml.includes("読取状況を計算中です。"), "OBD progress headline placeholder in index.html is out of date");
check(indexHtml.includes("診断機能・データ網羅・読取準備・適合状況を読み込み後に集計します。"), "OBD progress breakdown placeholder in index.html is out of date");
check(indexHtml.includes('id="obdDiagnosticFlowPanel"') && indexHtml.includes('id="obdDiagnosticFlowPanelResults"'), "OBD diagnostic flow panel containers are missing from index.html");
check(appSource.includes('const obdDiagnosticFlowPanels = document.querySelectorAll("[data-obd-diagnostic-flow-panel]");') && appSource.includes('function renderObdDiagnosticFlowPanel(session = null)') && appSource.includes('obdDiagnosticFlowPanels.forEach(renderPanel);'), "OBD diagnostic flow panel renderer should update result and detail panels");
check(appSource.includes('canStartAnalysis') && appSource.includes('read-only維持') && appSource.includes('該当読取ボタンへ移動'), "OBD diagnostic flow panel should show analysis gating, read-only status, and next-readout navigation");
check(appSource.includes('const nextReadoutRequest = flow.nextReadoutRequest || core.nextReadoutRequest || core.nextReadoutSummary?.readoutRequest || null;') && appSource.includes('addObdDiagnosticFlowMetric(grid, "読取要求", nextReadoutRequestLabel'), "OBD diagnostic flow panel should show read-only next readout request metadata");
check(appSource.includes('const pendingReadoutRequestCount = Number.isFinite(Number(flow.pendingReadoutRequestCount))') && appSource.includes('const readoutRequestQueueLabel = pendingReadoutRequestCount'), "OBD diagnostic flow panel should show pending readout request queue count");
check(appSource.includes('const readoutRequestPlan = flow.pendingReadoutRequestPlan || core.pendingReadoutRequestPlan || null;') && appSource.includes('Number(readoutRequestPlan.totalCount)'), "OBD diagnostic flow panel should use readout request plan counts when available");
check(appSource.includes('const mappedReadoutRequestCount = Number.isFinite(Number(readoutRequestPlan?.mappedCount))') && appSource.includes('` / mapped ${mappedReadoutRequestCount}`'), "OBD diagnostic flow panel should show mapped readout request count when available");
check(appSource.includes('const unmappedReadoutRequestCount = Number.isFinite(Number(readoutRequestPlan?.unmappedCount))') && appSource.includes('` / unmapped ${unmappedReadoutRequestCount}`'), "OBD diagnostic flow panel should show unmapped readout request count when available");
check(appSource.includes('const readoutRequestTone = unmappedReadoutRequestCount ? "blocked"') && appSource.includes('addObdDiagnosticFlowMetric(grid, "読取要求", nextReadoutRequestLabel, readoutRequestTone);'), "OBD diagnostic flow panel should block-tone unmapped readout request plans");
check(appSource.includes('const checklistSummary = core.analysisChecklistSummary || core.analysisReadinessSummary?.checklistSummary || null;') && appSource.includes('addObdDiagnosticFlowMetric(grid, "解析前確認", checklistLabel'), "OBD diagnostic flow panel should show analysis readiness checklist progress");
check(appSource.includes('const applicabilityStatus = flow.applicabilityStatus || core.applicabilityStatus || session.vehicleApplicability?.status || null;') && appSource.includes('addObdDiagnosticFlowMetric(grid, "適用確認", applicabilityLabel, applicabilityTone);'), "OBD diagnostic flow panel should show vehicle applicability status");
check(styleCss.includes(".obd-diagnostic-flow-panel") && styleCss.includes(".obd-diagnostic-flow-grid"), "OBD diagnostic flow panel styles are missing from style.css");
check(indexHtml.includes("Techstream/J2534") && indexHtml.includes("Current/Pending/Permanent") && indexHtml.includes("CONSULT") && indexHtml.includes("HDS") && indexHtml.includes("IDS"), "OBD import helper text in index.html is out of date");
check(indexHtml.includes("obdImportToolHints"), "OBD import tool hint container is missing from index.html");
check(diagnosticCapabilityStatus.every((item) => item.safety_gate), "診断機能完成度に安全ゲートがありません");
check(diagnosticWorkflowsPractical.length >= 7, "実用診断フローが不足しています");
check(diagnosticWorkflowsPractical.some((item) => item.id === "workflow-evap-leak-p0440-p0456" && item.monitor_ids.includes("commanded_evap_purge")), "EVAP診断フローにパージ指令PIDがありません");
check(diagnosticWorkflowsPractical.some((item) => item.id === "workflow-egr-flow-p0401-p0402" && item.monitor_ids.includes("commanded_egr")), "EGR診断フローにEGR指令PIDがありません");
check(diagnosticWorkflowsPractical.some((item) => item.id === "workflow-power-supply-p0560-p0563" && item.monitor_ids.includes("control_module_voltage")), "電源診断フローに制御モジュール電圧PIDがありません");
check(diagnosticWorkflowsPractical.every((item) => item.service_manual_required === true), "実用診断フローに整備書確認必須がありません");
const operationPlan = obd.getVehicleOperationPlan();
check(operationPlan.length >= 4, "接続後機能の準備計画が不足しています");
check(operationPlan.some((item) => item.id === "read_dtc"), "DTC読取準備がありません");
check(operationPlan.some((item) => item.id === "clear_dtc" && item.commandClass === "state-changing"), "DTC消去の安全ゲート定義がありません");
const blockedClear = obd.requestVehicleOperation("clear_dtc");
check(blockedClear.ok === false && blockedClear.blocked === true, "DTC消去が安全ゲートで拒否されていません");
const connectionProfile = obd.getVehicleConnectionProfile();
check(connectionProfile.transportEnabled === false, "通信トランスポートが安全ゲート外で有効です");
check(connectionProfile.failClosed === true, "通信トランスポートが失敗時安全停止になっていません");
check(connectionProfile.baudRateCandidates.includes(38400), "通信速度候補が不足しています");
const interlock = obd.getVehicleDamagePreventionInterlock();
check(interlock.failClosed === true, "車両破損防止ゲートが失敗時安全停止になっていません");
check(interlock.outboundTransportEnabled === false, "アウトバウンド送信が安全ゲート外で有効です");
check(interlock.allowsPhysicalVehicleCommands === false, "実車コマンドが許可されています");
check(interlock.defaultDecision === "block", "安全ゲートの既定動作が拒否ではありません");
check(interlock.blockedServiceModes.includes("04"), "DTC消去サービスが遮断対象にありません");
check(interlock.blockedServiceModes.includes("2F"), "入出力制御サービスが遮断対象にありません");
check(interlock.preEnableChecklist.length >= 6, "有効化前チェックリストが不足しています");
const preparedRequests = obd.getPreparedVehicleRequests();
check(preparedRequests.length >= 7, "通信準備リクエストが不足しています");
check(preparedRequests.some((item) => item.id === "read_stored_dtc" && item.service === "03"), "保存DTC読取の準備がありません");
check(preparedRequests.some((item) => item.id === "monitor_supported_pids" && item.service === "01"), "対応PID確認の準備がありません");
check(preparedRequests.some((item) => item.id === "clear_dtc_request" && item.service === "04" && item.stateChanging), "DTC消去要求の安全ゲート準備がありません");
const blockedPreparedClear = obd.requestPreparedVehicleRequest("clear_dtc_request");
check(blockedPreparedClear.ok === false && blockedPreparedClear.blocked === true && blockedPreparedClear.wouldTransmit === false && blockedPreparedClear.failClosed === true, "DTC消去要求が送信不可で拒否されていません");
const blockedPreparedRead = obd.requestPreparedVehicleRequest("read_stored_dtc");
check(blockedPreparedRead.ok === false && blockedPreparedRead.blocked === true && blockedPreparedRead.wouldTransmit === false, "DTC読取要求が安全ゲートで停止していません");
const interfaceRoadmap = obd.getAdvancedInterfaceRoadmap();
check(interfaceRoadmap.length >= 6, "高度インターフェースの準備順が不足しています");
check(interfaceRoadmap[0].id === "web_serial_obd", "最初の段階がWeb Serialではありません");
check(interfaceRoadmap.some((item) => item.id === "local_bridge" && item.requiresLocalBridge === true), "ローカルブリッジ段階がありません");
check(interfaceRoadmap.some((item) => item.id === "j2534_passthru" && item.requiresLocalBridge === true), "J2534段階がありません");
check(interfaceRoadmap.some((item) => item.id === "uds_canfd"), "UDS/CAN FD段階がありません");
check(interfaceRoadmap.some((item) => item.id === "doip"), "DoIP段階がありません");
check(interfaceRoadmap.every((item) => item.vehicleCommandEnabled === false), "高度インターフェースで実車コマンドが有効です");
const blockedJ2534 = obd.requestAdvancedInterface("j2534_passthru");
check(blockedJ2534.ok === false && blockedJ2534.blocked === true && blockedJ2534.wouldTransmit === false, "J2534準備要求が安全に拒否されていません");
const bridgeContract = obd.getLocalBridgeContract();
check(bridgeContract.connectionEnabled === true, "ローカルブリッジ接続準備が有効化されていません");
check(bridgeContract.vehicleCommandEnabled === false, "ローカルブリッジ経由の実車コマンドが有効です");
check(bridgeContract.requiresPairingToken === true, "ローカルブリッジのペアリング条件が不足しています");
check(bridgeContract.allowedReadIntents.includes("read_stored_dtc"), "保存DTC読取Intentがありません");
check(bridgeContract.blockedWriteIntents.includes("clear_dtc"), "DTC消去Intentが遮断対象にありません");
check(bridgeContract.logPolicy.storeRawFrames === false, "ローカルブリッジ契約が生フレーム保存を許可しています");
check(bridgeContract.allowedReadIntents.includes("read_permanent_dtc"), "Permanent DTC read intent is missing");
const blockedBridgeRead = obd.evaluateLocalBridgeRequest({ request_id: "test", api_version: "v1", intent: "read_stored_dtc", timestamp: "2026-06-28T00:00:00Z", pairing_token: "dummy" });
check(blockedBridgeRead.blocked === true && blockedBridgeRead.wouldTransmit === false && blockedBridgeRead.knownReadIntent === true, "ローカルブリッジ読取Intentが安全に停止していません");
const blockedBridgeClear = obd.evaluateLocalBridgeRequest({ request_id: "test", api_version: "v1", intent: "clear_dtc", timestamp: "2026-06-28T00:00:00Z", pairing_token: "dummy" });
check(blockedBridgeClear.blocked === true && blockedBridgeClear.wouldTransmit === false && blockedBridgeClear.blockedWriteIntent === true, "ローカルブリッジ変更系Intentが安全に停止していません");
const blockedBridgeReadAliases = obd.evaluateLocalBridgeRequest({ requestId: "test", apiVersion: "v1", intent: "read_stored_dtc", timestamp: "2026-06-28T00:00:00Z", pairingToken: "dummy" });
check(blockedBridgeReadAliases.missingFields.length === 0 && blockedBridgeReadAliases.knownReadIntent === true, "ローカルブリッジ要求aliasを吸収できません");
const bridgeSchemas = obd.getLocalBridgeResponseSchemas();
check(bridgeSchemas.length >= 5, "ローカルブリッジ応答型が不足しています");
check(bridgeSchemas.some((item) => item.intent === "bridge_status" && item.safeDefault.status === "not_connected"), "ブリッジ状態の安全な既定値がありません");
check(bridgeSchemas.some((item) => item.intent === "adapter_identity" && item.safeDefault.vehicle_command_enabled === false), "アダプター識別応答型の安全な既定値がありません");
check(bridgeSchemas.some((item) => item.intent === "read_pending_dtc" && Array.isArray(item.safeDefault.dtcs)), "Pending DTC bridge response schema is missing");
check(bridgeSchemas.some((item) => item.intent === "read_permanent_dtc" && Array.isArray(item.safeDefault.dtcs)), "Permanent DTC bridge response schema is missing");
check(bridgeSchemas.some((item) => item.intent === "read_freeze_frame" && Array.isArray(item.safeDefault.values)), "フリーズフレーム応答型がありません");
check(bridgeSchemas.some((item) => item.intent === "read_supported_pids" && Array.isArray(item.safeDefault.supported_pids)), "対応PID応答型がありません");
check(bridgeSchemas.some((item) => item.intent === "read_ecu_info" && Array.isArray(item.safeDefault.values)), "ECU info bridge response schema is missing");
check(bridgeSchemas.some((item) => item.intent === "read_onboard_monitor" && Array.isArray(item.safeDefault.tests)), "On-board monitor bridge response schema is missing");
check(bridgeSchemas.some((item) => item.intent === "read_live_pid_snapshot" && Array.isArray(item.safeDefault.values)), "ライブPID応答型がありません");
const bridgeStatus = obd.normalizeBridgeConnectionStatus({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    bridge_version: "0.1.0",
    api_version: "v1",
    status: "ready",
    paired: true,
    vci_connected: true,
    vehicle_connected: true
  }
});
check(bridgeStatus.displayStatus === "読取準備モデル", "ブリッジ接続状態の表示モデルが不正です");
check(bridgeStatus.connectionEnabled === true, "ブリッジ接続状態モデルが接続準備を保持していません");
check(bridgeStatus.vehicleCommandEnabled === false, "ブリッジ接続状態モデルが車両コマンド有効になっています");
check(bridgeStatus.retainedRawText === false, "ブリッジ接続状態モデルが原文保持になっています");
const bridgeStatusAliases = obd.normalizeBridgeConnectionStatus({
  ok: true,
  isBlocked: false,
  wouldTransmit: false,
  data: {
    bridgeVersion: "0.2.0",
    apiVersion: "v1",
    status: "ready",
    paired: true,
    vciConnected: true,
    vehicleConnected: true
  }
});
check(bridgeStatusAliases.bridgeVersion === "0.2.0" && bridgeStatusAliases.vciConnected === true && bridgeStatusAliases.vehicleConnected === true, "Bridge connection status aliases were not normalized");
const bridgeStatusExtendedAliases = obd.normalizeBridgeConnectionStatus({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    bridgeVersion: "0.2.1",
    status: "ready",
    is_paired: true,
    vci_ready: true,
    car_connected: true
  }
});
check(bridgeStatusExtendedAliases.paired === true && bridgeStatusExtendedAliases.vciConnected === true && bridgeStatusExtendedAliases.vehicleConnected === true, "Extended bridge connection status aliases were not normalized");
const bridgeVciList = obd.normalizeBridgeVciList({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    driver_status: "installed",
    selected_device_id: "vci-1",
    devices: [
      { id: "vci-1", label: "Sample VCI", vendor: "Example", serial_number: "SHOULD_NOT_EXPORT", connected: true }
    ]
  }
});
check(bridgeVciList.deviceCount === 1, "VCI一覧の表示モデル件数が不正です");
check(bridgeVciList.devices[0].selected === true, "VCI一覧の選択状態が不正です");
check(!("serial_number" in bridgeVciList.devices[0]), "VCI一覧が生識別子を保持しています");
check(bridgeVciList.connectionEnabled === true && bridgeVciList.vehicleCommandEnabled === false, "VCI一覧モデルの読取接続準備または安全状態が不正です");
const bridgeVciListAliases = obd.normalizeBridgeVciList({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    vci_devices: [
      { deviceId: "alias-vci", name: "Alias VCI", connected: true, driverStatus: "ready" }
    ],
    selectedDeviceId: "alias-vci",
    driverStatus: "ready"
  }
});
check(bridgeVciListAliases.deviceCount === 1 && bridgeVciListAliases.devices[0].selected === true && bridgeVciListAliases.devices[0].driverStatus === "ready", "Bridge VCI list aliases were not normalized");
const bridgeVciListExtendedAliases = obd.normalizeBridgeVciList({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    items: [
      { deviceId: "item-vci", name: "Item VCI", isConnected: true }
    ],
    selectedVciId: "item-vci",
    driver_status: "ready"
  }
});
check(bridgeVciListExtendedAliases.deviceCount === 1 && bridgeVciListExtendedAliases.devices[0].connected === true && bridgeVciListExtendedAliases.devices[0].selected === true, "Extended bridge VCI list aliases were not normalized");
const bridgeAdapterIdentity = obd.normalizeBridgeAdapterIdentity({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    adapter_name: "Sample Adapter",
    adapter_family: "elm327",
    firmware_version: "1.5",
    serial_number: "SHOULD_NOT_EXPORT",
    vehicle_command_enabled: true
  }
});
check(bridgeAdapterIdentity.adapterFamily === "elm327", "アダプター識別情報を整形できません");
check(bridgeAdapterIdentity.vehicleCommandEnabled === false, "アダプター識別モデルが車両コマンド有効になっています");
check(!("serial_number" in bridgeAdapterIdentity), "アダプター識別モデルが生識別子を保持しています");
const bridgeAdapterIdentityAliases = obd.normalizeBridgeAdapterIdentity({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    name: "Alias Adapter",
    family: "j2534",
    firmware: "2.0"
  }
});
check(bridgeAdapterIdentityAliases.adapterFamily === "j2534" && bridgeAdapterIdentityAliases.firmwareVersion === "2.0", "Bridge adapter identity aliases were not normalized");
const bridgeAdapterIdentityExtendedAliases = obd.normalizeBridgeAdapterIdentity({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    adapter: "VCI Adapter",
    family: "canfd",
    version: "3.1"
  }
});
check(bridgeAdapterIdentityExtendedAliases.adapterName === "VCI Adapter" && bridgeAdapterIdentityExtendedAliases.firmwareVersion === "3.1", "Extended bridge adapter identity aliases were not normalized");
const blockedBridgeResponse = obd.createLocalBridgeBlockedResponse("read_stored_dtc");
check(blockedBridgeResponse.ok === false && blockedBridgeResponse.blocked === true && blockedBridgeResponse.would_transmit === false, "ブリッジ遮断レスポンスが安全側ではありません");
check(Array.isArray(blockedBridgeResponse.data.dtcs) && blockedBridgeResponse.data.dtcs.length === 0, "遮断時DTCレスポンスが空データになっていません");
const blockedPendingBridgeResponse = obd.createLocalBridgeBlockedResponse("read_pending_dtc");
check(Array.isArray(blockedPendingBridgeResponse.data.dtcs) && blockedPendingBridgeResponse.data.dtcs.length === 0, "遮断時Pending DTCレスポンスが空データになっていません");
const bridgeDtcSnapshot = obd.normalizeBridgeDtcSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    protocol: "ISO15765-4",
    ecu_responses: [{ ecu: "7E8", status: "ok", dtcs: ["P0171"] }],
    dtcs: [{ code: "P0171" }, { dtc: "P0300" }, "p0171"],
    captured_at: "2026-06-28T00:00:00Z"
  }
});
check(bridgeDtcSnapshot.codes.join(",") === "P0171,P0300", "ブリッジDTC応答を既存DTC配列へ変換できません");
check(bridgeDtcSnapshot.intent === "read_stored_dtc", "保存DTCブリッジ応答のintentが不正です");
check(bridgeDtcSnapshot.dtcs.every((item) => item.status === "stored"), "保存DTCブリッジ応答の種別を保持できません");
check(bridgeDtcSnapshot.retainedRawText === false, "ブリッジDTC変換が原文保持になっています");
check(bridgeDtcSnapshot.wouldTransmit === false, "ブリッジDTC変換が送信済み扱いになっています");
const bridgeDtcAliasSnapshot = obd.normalizeBridgeDtcSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    capturedAt: "2026-06-28T00:00:01Z",
    dtc_codes: ["P0420", "P0420"],
    ecuResponses: [{ address: "7E8", status: "ok", dtc_codes: ["P0420"], dtc_count: 1 }]
  }
});
check(bridgeDtcAliasSnapshot.codes.join(",") === "P0420", "Bridge DTC alias codes were not normalized");
check(bridgeDtcAliasSnapshot.ecuResponses[0]?.codeCount === 1, "Bridge DTC alias ECU response count was not normalized");
const ecuResponseSummaryAliases = obd.normalizeEcuResponseSummary({
  ecus: [
    {
      address: "7E8",
      dtcCount: 2,
      responseCount: 3,
      negativeResponseCount: 1,
      negativeRequestedServices: ["09"],
      negativeResponseLabels: ["sub-function not supported"],
      responseTimeMs: 45
    }
  ]
});
check(ecuResponseSummaryAliases.ecus[0]?.dtcCount === 2 && ecuResponseSummaryAliases.ecus[0]?.negativeRequestedServices[0] === "09" && ecuResponseSummaryAliases.ecus[0]?.responseTimeMs === 45, "ECU response summary camelCase aliases were not normalized");
const ecuResponseSummaryRowAliases = obd.normalizeEcuResponseSummary({
  ecuResponseRows: [
    {
      ecuId: "7E9",
      label: "Hybrid ECU",
      codeCount: 1,
      responses: 4,
      requestedServices: ["01", "09"],
      negativeServices: ["22"],
      negativeLabels: ["conditions not correct"],
      latencyMs: 62
    }
  ]
});
check(ecuResponseSummaryRowAliases.ecus[0]?.address === "7E9", "ECU response summary ecuId alias was not normalized");
check(ecuResponseSummaryRowAliases.ecus[0]?.services.join(",") === "01,09", "ECU response summary requestedServices alias was not normalized");
check(ecuResponseSummaryRowAliases.ecus[0]?.negativeRequestedServices[0] === "22", "ECU response summary negativeServices alias was not normalized");
check(ecuResponseSummaryRowAliases.ecus[0]?.responseTimeMs === 62, "ECU response summary latencyMs alias was not normalized");
const bridgePendingDtcSnapshot = obd.normalizeBridgeDtcSnapshot({
  intent: "read_pending_dtc",
  ok: true,
  blocked: false,
  would_transmit: false,
  data: { dtcs: [{ code: "P0171" }, "P0171"] }
});
check(bridgePendingDtcSnapshot.intent === "read_pending_dtc", "保留DTCブリッジ応答のintentが不正です");
check(bridgePendingDtcSnapshot.dtcs.length === 1 && bridgePendingDtcSnapshot.dtcs[0]?.status === "pending", "保留DTCブリッジ応答の種別または重複除外が不正です");
const bridgeMixedDtcSession = obd.buildDiagnosticScanSession({
  dtcSnapshot: { dtcs: [{ code: "P0171", status: "stored" }, { code: "P0171", status: "pending" }] }
});
check(bridgeMixedDtcSession.dtcSnapshot.dtcs.length === 2, "同一DTCの保存/保留状態をセッション内で保持できません");
const bridgeEmptyDtcSnapshot = obd.normalizeBridgeDtcSnapshot({});
check(bridgeEmptyDtcSnapshot.codes.length === 0 && bridgeEmptyDtcSnapshot.dtcs.length === 0 && bridgeEmptyDtcSnapshot.blocked === true, "空DTCブリッジ応答を安全側へ整形できません");
const outboundRead = obd.evaluateOutboundSafety({ service: "03", stateChanging: false });
check(outboundRead.blocked === true && outboundRead.wouldTransmit === false && outboundRead.failClosed === true, "読取系アウトバウンドが安全ゲートで停止していません");
const outboundClear = obd.evaluateOutboundSafety({ service: "04", stateChanging: true });
check(outboundClear.blocked === true && outboundClear.wouldTransmit === false && outboundClear.stateChanging === true, "状態変更アウトバウンドが安全ゲートで停止していません");

const monitorAnalysis = obd.analyzeScannerText([
  "Engine RPM: 780 rpm",
  "冷却水温：88 C",
  "STFT B1: -3.1 %",
  "Control Module Voltage: 14.2 V",
  "Fuel System Status: Closed loop",
  "DPF Status: Regeneration active",
  "Unknown Value: 99"
].join("\n"));
check(monitorAnalysis.monitorValues.length === 6, "対応モニター値の抽出件数が不正です");
check(monitorAnalysis.monitorValues.find((item) => item.id === "engine_speed")?.value === 780, "エンジン回転数を抽出できません");
check(monitorAnalysis.monitorValues.find((item) => item.id === "coolant_temp")?.unit === "°C", "冷却水温の単位が不正です");
check(monitorAnalysis.monitorValues.find((item) => item.id === "stft_b1")?.value === -3.1, "負の燃料補正値を抽出できません");
check(monitorAnalysis.monitorValues.find((item) => item.id === "fuel_system_status")?.value === "Closed loop", "文字状態値を抽出できません");
check(monitorAnalysis.monitorValues.find((item) => item.id === "dpf_status")?.value === "Regeneration active", "後処理状態を抽出できません");
check(!monitorAnalysis.monitorValues.some((item) => item.id === "unknown"), "未定義値を取り込んでいます");
check(monitorAnalysis.retainedRawText === false, "モニター入力原文を保持する設定になっています");

const monitorAliasAnalysis = obd.analyzeScannerText([
  "Engine RPM = 780 rpm",
  "Control Module Voltage (V): 14.2",
  "Intake Air Temp (C) = 32",
  "Calculated Load (%) : 21.6"
].join("\n"));
check(monitorAliasAnalysis.monitorValues.length === 4, "ASCII monitor label variants were not all parsed");
check(monitorAliasAnalysis.monitorValues.find((item) => item.id === "control_module_voltage")?.value === 14.2, "Control module voltage alias variant was not parsed");
check(monitorAliasAnalysis.monitorValues.find((item) => item.id === "intake_air_temp")?.value === 32, "Intake air temp alias variant was not parsed");
check(monitorAliasAnalysis.monitorValues.find((item) => item.id === "calculated_load")?.value === 21.6, "Calculated load alias variant was not parsed");

const bridgePidSnapshot = obd.normalizeBridgeLivePidSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    protocol: "ISO15765-4",
    supported_pids: ["0C", "05"],
    values: [
      { id: "engine_speed", value: 760, unit: "rpm" },
      { pid: "05", value: 88, unit: "°C" },
      { id: "fuel_system_status", value: "Closed loop" },
      { id: "unknown_pid", value: "not-a-number" }
    ],
    captured_at: "2026-06-28T00:01:00Z"
  }
});
check(bridgePidSnapshot.monitorValues.length === 3, "ブリッジPID応答の整形件数が不正です");
check(bridgePidSnapshot.monitorValues.find((item) => item.id === "engine_speed")?.value === 760, "ブリッジ回転数を整形できません");
check(bridgePidSnapshot.monitorValues.find((item) => item.id === "coolant_temp")?.value === 88, "ブリッジPIDから辞書項目へ紐付けできません");
check(bridgePidSnapshot.monitorValues.find((item) => item.id === "fuel_system_status")?.value === "Closed loop", "ブリッジ文字PIDを整形できません");
check(bridgePidSnapshot.monitorInsights.length > 0, "ブリッジPIDから相関ヒントを生成できません");
check(bridgePidSnapshot.retainedRawText === false, "ブリッジPID変換が原文保持になっています");
const bridgePidAliasSnapshot = obd.normalizeBridgeLivePidSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    protocol_name: "ISO15765-4",
    supported_pid_list: "0C 05",
    monitorValues: [
      { monitorId: "engine_speed", value: 800, unit: "rpm" },
      { pid: "05", value: 82, unit: "°C", valueType: "number" }
    ],
    capturedAt: "2026-06-28T00:01:01Z"
  }
});
check(bridgePidAliasSnapshot.supportedPids.join(",") === "0C,05" && bridgePidAliasSnapshot.protocol === "ISO15765-4" && bridgePidAliasSnapshot.capturedAt === "2026-06-28T00:01:01Z", "Bridge live PID aliases were not normalized");
check(bridgePidAliasSnapshot.monitorValues[0]?.id === "engine_speed" && bridgePidAliasSnapshot.monitorValues[1]?.valueType === "number", "Bridge live PID row aliases were not normalized");
check(bridgePidAliasSnapshot.monitorValues.length === 2, "Bridge live PID monitor_values alias was not normalized");
const bridgePidLabelAliasSnapshot = obd.normalizeBridgeLivePidSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    protocol_name: "ISO15765-4",
    monitor_values: [
      { monitorName: "Engine RPM", result: "805", unit: "rpm" },
      { label: "Control Module Voltage (V)", rawValue: "14.1", valueType: "number" },
      { code: "05", raw_value: "86", unit: "C" }
    ]
  }
});
check(bridgePidLabelAliasSnapshot.monitorValues.length === 3, "Bridge live PID label aliases were not normalized");
check(bridgePidLabelAliasSnapshot.monitorValues.find((item) => item.id === "engine_speed")?.value === 805, "Bridge live PID monitorName alias was not normalized");
check(bridgePidLabelAliasSnapshot.monitorValues.find((item) => item.id === "control_module_voltage")?.value === 14.1, "Bridge live PID rawValue alias was not normalized");
check(bridgePidLabelAliasSnapshot.monitorValues.find((item) => item.id === "coolant_temp")?.value === 86, "Bridge live PID code/raw_value alias was not normalized");
const bridgeSupportedPidSnapshot = obd.normalizeBridgeSupportedPidSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    protocol: "ISO15765-4",
    supported_pids: ["0C", "05", "0C", "40"],
    captured_at: "2026-06-28T00:01:30Z"
  }
});
check(bridgeSupportedPidSnapshot.source === "local_bridge", "ブリッジ対応PID応答のsourceが不正です");
check(bridgeSupportedPidSnapshot.intent === "read_supported_pids" && bridgeSupportedPidSnapshot.blocked === false && bridgeSupportedPidSnapshot.wouldTransmit === false, "ブリッジ対応PID応答の安全メタ情報が不正です");
check(bridgeSupportedPidSnapshot.supportedPids.join(",") === "0C,05,40", "ブリッジ対応PID応答を整形できません");
check(bridgeSupportedPidSnapshot.supportedCount === 2, "ブリッジ対応PID件数を集計できません");
const bridgeEmptySupportedPidSnapshot = obd.normalizeBridgeSupportedPidSnapshot({});
check(bridgeEmptySupportedPidSnapshot.supportedPids.length === 0 && bridgeEmptySupportedPidSnapshot.blocked === true, "空のブリッジ対応PID応答を安全側へ整形できません");
const bridgeTextSupportedPidSnapshot = obd.normalizeBridgeSupportedPidSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    supported_pid_list: "0C 05 40",
    captured_at: "2026-06-28T00:01:31Z"
  }
});
check(bridgeTextSupportedPidSnapshot.supportedPids.join(",") === "0C,05,40", "Text bridge supported PID list was not normalized");
const supportedPidMatrixAliasInputs = obd.buildSupportedPidMatrix({
  supported_pids: ["0c", "05", "40"],
  captured_at: "2026-06-28T00:01:30Z"
});
check(supportedPidMatrixAliasInputs.supportedPids.join(",") === "0C,05,40", "Supported PID matrix did not accept supported_pids alias input");
check(supportedPidMatrixAliasInputs.capturedAt === "2026-06-28T00:01:30Z", "Supported PID matrix did not accept captured_at alias input");
const supportedPidMatrixRowAliases = obd.buildSupportedPidMatrix({
  supportedPidRows: [{ pid: "0c" }, { code: "05" }, { pidCode: "40" }]
});
check(supportedPidMatrixRowAliases.supportedPids.join(",") === "0C,05,40", "Supported PID matrix did not accept object row aliases");
const bridgeFreezeFrameSnapshot = obd.normalizeBridgeFreezeFrameSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    protocol: "ISO15765-4",
    trigger_dtc: "P0171",
    values: [
      { id: "engine_speed", value: 760, unit: "rpm", freeze_frame_number: 0 },
      { pid: "05", value: 88, unit: "°C", freeze_frame_number: 0 }
    ],
    captured_at: "2026-06-28T00:01:45Z"
  }
});
check(bridgeFreezeFrameSnapshot.source === "local_bridge", "ブリッジフリーズフレーム応答のsourceが不正です");
check(bridgeFreezeFrameSnapshot.intent === "read_freeze_frame" && bridgeFreezeFrameSnapshot.blocked === false && bridgeFreezeFrameSnapshot.wouldTransmit === false, "ブリッジフリーズフレーム応答の安全メタ情報が不正です");
check(bridgeFreezeFrameSnapshot.triggerDtc === "P0171", "ブリッジフリーズフレーム起点DTCを整形できません");
check(bridgeFreezeFrameSnapshot.monitorValues.length === 2, "ブリッジフリーズフレーム値を整形できません");
const bridgeEmptyFreezeFrameSnapshot = obd.normalizeBridgeFreezeFrameSnapshot({});
check(bridgeEmptyFreezeFrameSnapshot.monitorValues.length === 0 && bridgeEmptyFreezeFrameSnapshot.blocked === true, "空のブリッジフリーズフレーム応答を安全側へ整形できません");
const bridgeAliasFreezeFrameSnapshot = obd.normalizeBridgeFreezeFrameSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    trigger_code: "P0300",
    freezeFrameValues: [
      { id: "engine_speed", value: 1100, unit: "rpm", freeze_frame_number: 1 }
    ]
  }
});
check(bridgeAliasFreezeFrameSnapshot.triggerDtc === "P0300", "Bridge freeze frame trigger alias was not normalized");
check(bridgeAliasFreezeFrameSnapshot.monitorValues.length === 1, "Bridge freeze frame value alias was not normalized");
const bridgeFreezeFrameRowAliases = obd.normalizeBridgeFreezeFrameSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    triggerCode: "P0128",
    freezeFrameRows: [
      { monitorName: "Engine RPM", result: "980", unit: "rpm", freezeFrameNumber: 2 },
      { code: "05", rawValue: "72", unit: "C", freezeFrameNumber: 2 }
    ]
  }
});
check(bridgeFreezeFrameRowAliases.triggerDtc === "P0128", "Bridge freezeFrameRows trigger alias was not normalized");
check(bridgeFreezeFrameRowAliases.monitorValues.length === 2, "Bridge freezeFrameRows aliases were not normalized");
check(bridgeFreezeFrameRowAliases.monitorValues.find((item) => item.id === "coolant_temp")?.value === 72, "Bridge freezeFrameRows rawValue alias was not normalized");
const bridgeReadinessSnapshot = obd.normalizeBridgeReadinessSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    values: [
      { id: "mil_status", value: true },
      { id: "readiness_status_byte_b", value: 0x07 },
      { id: "readiness_status_byte_c", value: 0x22 },
      { id: "readiness_status_byte_d", value: 0x00 }
    ],
    captured_at: "2026-06-28T00:01:48Z"
  }
});
check(bridgeReadinessSnapshot.source === "local_bridge", "Bridge readiness source was not normalized");
check(bridgeReadinessSnapshot.intent === "readiness_snapshot" && bridgeReadinessSnapshot.blocked === false && bridgeReadinessSnapshot.wouldTransmit === false, "Bridge readiness safety metadata was not normalized");
check(bridgeReadinessSnapshot.milOn === true, "Bridge readiness did not carry MIL status");
check(bridgeReadinessSnapshot.incompleteCount === 1, "Bridge readiness did not count incomplete monitors");
const bridgeEmptyReadinessSnapshot = obd.normalizeBridgeReadinessSnapshot({});
check(bridgeEmptyReadinessSnapshot.monitorCount === 0 && bridgeEmptyReadinessSnapshot.blocked === true, "Empty Bridge readiness response was not fail-closed");
const bridgeObjectReadinessSnapshot = obd.normalizeBridgeReadinessSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    mil_on: true,
    readiness_status_byte_b: 0x07,
    readiness_status_byte_c: 0x22,
    readiness_status_byte_d: 0x00
  }
});
check(bridgeObjectReadinessSnapshot.milOn === true && bridgeObjectReadinessSnapshot.incompleteCount === 1, "Object bridge readiness fields were not normalized");
const bridgeReadinessAliasRows = obd.normalizeBridgeReadinessSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    readinessValues: [
      { id: "mil_status", value: true },
      { id: "readiness_status_byte_b", value: 0x07 },
      { id: "readiness_status_byte_c", value: 0x22 },
      { id: "readiness_status_byte_d", value: 0x00 }
    ]
  }
});
check(bridgeReadinessAliasRows.milOn === true && bridgeReadinessAliasRows.incompleteCount === 1, "Bridge readiness row aliases were not normalized");
const bridgeReadinessStatusByteAliases = obd.normalizeBridgeReadinessSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    mil: true,
    statusByteB: 0x07,
    statusByteC: 0x22,
    statusByteD: 0x00
  }
});
check(bridgeReadinessStatusByteAliases.milOn === true && bridgeReadinessStatusByteAliases.incompleteCount === 1, "Bridge readiness statusByte aliases were not normalized");
const bridgeReadinessRowNameAliases = obd.normalizeBridgeReadinessSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    readinessRows: [
      { name: "MIL Status", result: true },
      { label: "Readiness Status Byte B", rawValue: 0x07 },
      { label: "Readiness Status Byte C", rawValue: 0x22 },
      { label: "Readiness Status Byte D", rawValue: 0x00 }
    ]
  }
});
check(bridgeReadinessRowNameAliases.milOn === true && bridgeReadinessRowNameAliases.incompleteCount === 1, "Bridge readiness row name/label aliases were not normalized");
const bridgeEcuInfoSnapshot = obd.normalizeBridgeEcuInfoSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    protocol: "ISO15765-4",
    values: [
      { id: "supported_info_types_00", info_type: "00", value: "55 60 00 00" },
      { id: "vin", info_type: "02", value: "JTDKN3DU0A0123456" },
      { id: "calibration_id", info_type: "04", value: "CAL-1234" },
      { id: "ecu_name", info_type: "0A", value: "Engine ECU" }
    ],
    captured_at: "2026-06-28T00:01:50Z"
  }
});
check(bridgeEcuInfoSnapshot.source === "local_bridge", "Bridge ECU info source was not normalized");
check(bridgeEcuInfoSnapshot.intent === "read_ecu_info" && bridgeEcuInfoSnapshot.blocked === false && bridgeEcuInfoSnapshot.wouldTransmit === false, "Bridge ECU info safety metadata was not normalized");
check(bridgeEcuInfoSnapshot.hadSensitiveIdentifier === true, "Bridge ECU info did not detect sensitive identifiers");
check(!JSON.stringify(bridgeEcuInfoSnapshot).includes("JTDKN3DU0A0123456"), "Bridge ECU info retained raw VIN");
check(bridgeEcuInfoSnapshot.items.find((item) => item.id === "calibration_id")?.value === "CAL-1234", "Bridge ECU info did not retain CALID");
check(bridgeEcuInfoSnapshot.keyItemSummary.capturedCount === 3 && bridgeEcuInfoSnapshot.keyItemSummary.missingLabels.includes("キャリブレーション確認番号 CVN"), "Bridge ECU info key item summary was not built");
check(bridgeEcuInfoSnapshot.supportInfoTypesCaptured === true, "Bridge ECU info did not mark supported info types as captured");
check(bridgeEcuInfoSnapshot.supportInfoTypesSummary.count >= 6 && bridgeEcuInfoSnapshot.supportInfoTypesSummary.labels.includes("ECU名"), "Bridge ECU info supported info type summary was not built");
const bridgeEmptyEcuInfoSnapshot = obd.normalizeBridgeEcuInfoSnapshot({});
check(bridgeEmptyEcuInfoSnapshot.itemCount === 0 && bridgeEmptyEcuInfoSnapshot.blocked === true, "Empty Bridge ECU info response was not fail-closed");
const bridgeAliasEcuInfoSnapshot = obd.normalizeBridgeEcuInfoSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    protocol: "ISO15765-4",
    items: [
      { id: "calibration_verification_number", info_type: "06", value: "CVN-ABCD" },
      { id: "ecu_name", info_type: "0A", value: "Powertrain ECU" }
    ],
    captured_at: "2026-06-28T00:01:51Z"
  }
});
check(bridgeAliasEcuInfoSnapshot.itemCount === 2, "Bridge ECU info alias items were not normalized");
check(bridgeAliasEcuInfoSnapshot.items.find((item) => item.id === "calibration_verification_number")?.value === "CVN-ABCD", "Bridge ECU info alias CALID/CVN item was not retained");
check(bridgeAliasEcuInfoSnapshot.keyItemSummary.capturedLabels.includes("キャリブレーション確認番号 CVN"), "Bridge ECU info alias key item summary did not include CVN");
check(bridgeAliasEcuInfoSnapshot.supportInfoTypesCaptured === false, "Bridge ECU info alias incorrectly marked supported info types as captured");
const bridgeObjectEcuInfoSnapshot = obd.normalizeBridgeEcuInfoSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    protocol: "ISO15765-4",
    supported_info_types: "55 60 00 00",
    vin: "JTDKN3DU0A0123456",
    calibration_id: "CAL-OBJECT",
    ecu_name: "Gateway ECU"
  }
});
check(bridgeObjectEcuInfoSnapshot.itemCount === 4, "Bridge object ECU info fields were not normalized");
check(bridgeObjectEcuInfoSnapshot.items.find((item) => item.id === "calibration_id")?.value === "CAL-OBJECT", "Bridge object ECU info did not retain CALID");
check(bridgeObjectEcuInfoSnapshot.supportInfoTypesCaptured === true, "Bridge object ECU info did not mark supported info types as captured");
const bridgeMode09AliasItems = obd.normalizeBridgeEcuInfoSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    mode09Items: [
      { item_id: "calibration_id", mode09_type: "04", decodedValue: "CAL-MODE09" },
      { itemId: "ecu_name", mode09Type: "0A", rawValue: "Body ECU" }
    ]
  }
});
check(bridgeMode09AliasItems.itemCount === 2, "Bridge Mode09 item aliases were not normalized");
check(bridgeMode09AliasItems.items.find((item) => item.id === "calibration_id")?.value === "CAL-MODE09", "Bridge Mode09 alias CALID was not retained");
const bridgeMode09SnakeAliasItems = obd.normalizeBridgeEcuInfoSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    mode09_items: [
      { item_id: "calibration_verification_number", mode09_type: "06", decoded_value: "CVN-MODE09" },
      { item_id: "ecu_name", mode09_type: "0A", raw_value: "Brake ECU" }
    ]
  }
});
check(bridgeMode09SnakeAliasItems.itemCount === 2, "Bridge mode09_items snake_case aliases were not normalized");
check(bridgeMode09SnakeAliasItems.items.find((item) => item.id === "calibration_verification_number")?.value === "CVN-MODE09", "Bridge mode09_items snake_case CVN was not retained");
const bridgeExtendedObjectEcuInfoSnapshot = obd.normalizeBridgeEcuInfoSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    protocol: "ISO15765-4",
    supported_mode09_types: "55 60 00 00",
    calid: "CAL-BRIDGE-ALIAS",
    cvn_value: "CVN-BRIDGE-ALIAS",
    module_name: "HV ECU"
  }
});
check(bridgeExtendedObjectEcuInfoSnapshot.itemCount === 4, "Bridge extended ECU info object aliases were not normalized");
check(bridgeExtendedObjectEcuInfoSnapshot.items.find((item) => item.id === "calibration_id")?.value === "CAL-BRIDGE-ALIAS", "Bridge extended ECU info object CALID was not retained");
check(bridgeExtendedObjectEcuInfoSnapshot.items.find((item) => item.id === "ecu_name")?.value === "HV ECU", "Bridge extended ECU info object ECU name was not retained");
const bridgeCamelObjectEcuInfoSnapshot = obd.normalizeBridgeEcuInfoSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    protocol: "ISO15765-4",
    supportedInfoTypes: "55 60 00 00",
    vinValue: "JTDKN3DU0A0123456",
    calibrationId: "CAL-BRIDGE-CAMEL",
    calibrationVerificationNumber: "CVN-BRIDGE-CAMEL",
    moduleName: "Gateway Camel ECU"
  }
});
check(bridgeCamelObjectEcuInfoSnapshot.itemCount === 5, "Bridge camelCase ECU info object aliases were not normalized");
check(bridgeCamelObjectEcuInfoSnapshot.items.find((item) => item.id === "calibration_id")?.value === "CAL-BRIDGE-CAMEL", "Bridge camelCase ECU info object CALID was not retained");
check(bridgeCamelObjectEcuInfoSnapshot.items.find((item) => item.id === "calibration_verification_number")?.value === "CVN-BRIDGE-CAMEL", "Bridge camelCase ECU info object CVN was not retained");
check(bridgeCamelObjectEcuInfoSnapshot.items.find((item) => item.id === "ecu_name")?.value === "Gateway Camel ECU", "Bridge camelCase ECU info object ECU name was not retained");
const bridgeInfoValuesCamelAliasSnapshot = obd.normalizeBridgeEcuInfoSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    protocol: "ISO15765-4",
    capturedAt: "2026-06-28T00:01:52Z",
    infoValues: [
      { infoType: "00", value: "55 60 00 00" },
      { infoType: "04", decodedValue: "CAL-INFOVALUES-BRIDGE" }
    ]
  }
});
check(bridgeInfoValuesCamelAliasSnapshot.capturedAt === "2026-06-28T00:01:52Z", "Bridge ECU info did not accept capturedAt camelCase alias input");
check(bridgeInfoValuesCamelAliasSnapshot.items.find((item) => item.id === "calibration_id")?.value === "CAL-INFOVALUES-BRIDGE", "Bridge ECU info did not retain calibration_id from infoValues camelCase alias input");
check(bridgeInfoValuesCamelAliasSnapshot.supportInfoTypesCaptured === true, "Bridge ECU info did not mark supported info types from infoValues camelCase alias input");
const bridgeMode09ValuesAliasSnapshot = obd.normalizeBridgeEcuInfoSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    mode09Values: [
      { infoType: "04", decodedValue: "CAL-MODE09-VALUES" },
      { infoType: "0A", rawValue: "Skid ECU" }
    ]
  }
});
check(bridgeMode09ValuesAliasSnapshot.itemCount === 2, "Bridge mode09Values alias was not normalized");
check(bridgeMode09ValuesAliasSnapshot.items.find((item) => item.id === "calibration_id")?.value === "CAL-MODE09-VALUES", "Bridge mode09Values alias did not retain CALID");
const bridgeEcuInfoRowsAliasSnapshot = obd.normalizeBridgeEcuInfoSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    ecuInfoRows: [
      { mode09Type: "06", decodedValue: "CVN-ROWS-ALIAS" },
      { mode09Type: "0A", rawValue: "HV Control ECU" }
    ]
  }
});
check(bridgeEcuInfoRowsAliasSnapshot.itemCount === 2, "Bridge ecuInfoRows alias was not normalized");
check(bridgeEcuInfoRowsAliasSnapshot.items.find((item) => item.id === "calibration_verification_number")?.value === "CVN-ROWS-ALIAS", "Bridge ecuInfoRows alias did not retain CVN");
const bridgeEcuInfoItemsCamelAliasSnapshot = obd.normalizeBridgeEcuInfoSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    capturedAt: "2026-06-28T00:01:53Z",
    ecuInfoItems: [
      { itemId: "calibration_id", infoType: "04", decodedValue: "CAL-ECUINFOITEMS-BRIDGE" },
      { itemId: "ecu_name", infoType: "0A", rawValue: "Steering ECU" }
    ]
  }
});
check(bridgeEcuInfoItemsCamelAliasSnapshot.itemCount === 2, "Bridge ECU info did not accept ecuInfoItems camelCase alias input");
check(bridgeEcuInfoItemsCamelAliasSnapshot.items.find((item) => item.id === "calibration_id")?.value === "CAL-ECUINFOITEMS-BRIDGE", "Bridge ECU info did not retain calibration_id from ecuInfoItems camelCase alias input");
check(bridgeEcuInfoItemsCamelAliasSnapshot.items.find((item) => item.id === "ecu_name")?.value === "Steering ECU", "Bridge ECU info did not retain ECU name from ecuInfoItems camelCase alias input");
const ecuInfoSnapshotAlias = obd.normalizeEcuInfoSnapshot({
  source: "diagnostic_core",
  items: [
    { id: "ecu_name", info_type: "0A", value: "Hybrid ECU" }
  ]
});
check(ecuInfoSnapshotAlias.itemCount === 1 && ecuInfoSnapshotAlias.items[0]?.value === "Hybrid ECU", "ECU info snapshot alias items were not normalized");
const ecuInfoSnapshotObject = obd.normalizeEcuInfoSnapshot({
  source: "diagnostic_core",
  supported_info_types: "55 60 00 00",
  calibration_verification_number: "CVN-OBJECT",
  ecu_name: "Battery ECU"
});
check(ecuInfoSnapshotObject.itemCount === 3, "ECU info snapshot object fields were not normalized");
check(ecuInfoSnapshotObject.items.find((item) => item.id === "calibration_verification_number")?.value === "CVN-OBJECT", "ECU info snapshot object CVN was not retained");
const ecuInfoSnapshotExtendedAliases = obd.normalizeEcuInfoSnapshot({
  source: "diagnostic_core",
  supported_mode09_types: "55 60 00 00",
  vin_value: "JTDKN3DU0A0123456",
  calid: "CAL-ALIAS",
  cvn_value: "CVN-ALIAS",
  module_name: "ABS ECU"
});
check(ecuInfoSnapshotExtendedAliases.itemCount === 5, "Extended ECU info alias fields were not normalized");
check(ecuInfoSnapshotExtendedAliases.items.find((item) => item.id === "calibration_id")?.value === "CAL-ALIAS", "Extended ECU info alias CALID was not retained");
check(ecuInfoSnapshotExtendedAliases.items.find((item) => item.id === "ecu_name")?.value === "ABS ECU", "Extended ECU info alias ECU name was not retained");
const ecuInfoSnapshotCamelObjectAliases = obd.normalizeEcuInfoSnapshot({
  source: "diagnostic_core",
  supportedInfoTypes: "55 60 00 00",
  vinValue: "JTDKN3DU0A0123456",
  calibrationId: "CAL-CAMEL",
  calibrationVerificationNumber: "CVN-CAMEL",
  ecuName: "Battery Camel ECU"
});
check(ecuInfoSnapshotCamelObjectAliases.itemCount === 5, "CamelCase ECU info object aliases were not normalized");
check(ecuInfoSnapshotCamelObjectAliases.items.find((item) => item.id === "calibration_id")?.value === "CAL-CAMEL", "CamelCase ECU info object CALID was not retained");
check(ecuInfoSnapshotCamelObjectAliases.items.find((item) => item.id === "calibration_verification_number")?.value === "CVN-CAMEL", "CamelCase ECU info object CVN was not retained");
check(ecuInfoSnapshotCamelObjectAliases.items.find((item) => item.id === "ecu_name")?.value === "Battery Camel ECU", "CamelCase ECU info object ECU name was not retained");
const ecuInfoSnapshotPluralAliases = obd.normalizeEcuInfoSnapshot({
  source: "diagnostic_core",
  vinValues: ["JTDKN3DU0A0123456", "JTDKN3DU0A0654321"],
  calibrationIds: ["CAL-A", "CAL-B"],
  cvns: ["CVN-A", "CVN-B"],
  moduleNames: ["ABS ECU", "HV ECU"]
});
check(ecuInfoSnapshotPluralAliases.itemCount === 4, "Plural ECU info aliases were not normalized into snapshot items");
check(Array.isArray(ecuInfoSnapshotPluralAliases.items.find((item) => item.id === "vin")?.value), "Plural VIN alias did not retain array values");
check(ecuInfoSnapshotPluralAliases.items.find((item) => item.id === "calibration_id")?.value?.[1] === "CAL-B", "Plural CALID alias did not retain all array values");
check(ecuInfoSnapshotPluralAliases.items.find((item) => item.id === "calibration_verification_number")?.value?.[0] === "CVN-A", "Plural CVN alias did not retain array values");
check(ecuInfoSnapshotPluralAliases.items.find((item) => item.id === "ecu_name")?.value?.[1] === "HV ECU", "Plural ECU name alias did not retain array values");
const ecuInfoSnapshotCamelItemsAlias = obd.normalizeEcuInfoSnapshot({
  ecuInfo: [
    { itemId: "calibration_id", infoType: "04", decodedValue: "CAL-ECUINFO-CAMEL" },
    { itemId: "ecu_name", infoType: "0A", rawValue: "Body Camel ECU" }
  ]
});
check(ecuInfoSnapshotCamelItemsAlias.itemCount === 2, "CamelCase ecuInfo row aliases were not normalized");
check(ecuInfoSnapshotCamelItemsAlias.items.find((item) => item.id === "calibration_id")?.value === "CAL-ECUINFO-CAMEL", "CamelCase ecuInfo row CALID was not retained");
check(ecuInfoSnapshotCamelItemsAlias.items.find((item) => item.id === "ecu_name")?.value === "Body Camel ECU", "CamelCase ecuInfo row ECU name was not retained");
const ecuInfoSnapshotInfoValuesAlias = obd.normalizeEcuInfoSnapshot({
  info_values: [
    { info_type: "02", value: "JTDKN3DU0A0123456" },
    { info_type: "04", value: "CAL-INFO-VALUES" }
  ]
});
check(ecuInfoSnapshotInfoValuesAlias.items.find((item) => item.id === "vin")?.privacyClass === "sensitive_identifier", "ECU info snapshot did not accept info_values VIN alias input");
check(ecuInfoSnapshotInfoValuesAlias.items.find((item) => item.id === "calibration_id")?.value === "CAL-INFO-VALUES", "ECU info snapshot did not retain calibration_id from info_values alias input");
const bridgeOnboardMonitorSnapshot = obd.normalizeBridgeOnboardMonitorSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    protocol: "ISO15765-4",
    tests: [
      { test_id: "01", component_id: "01", value: 100, min: 50, max: 200 },
      { test_id: "02", component_id: "01", value: 300, min: 50, max: 200 }
    ],
    captured_at: "2026-06-28T00:01:55Z"
  }
});
check(bridgeOnboardMonitorSnapshot.source === "local_bridge", "Bridge Mode 06 source was not normalized");
check(bridgeOnboardMonitorSnapshot.intent === "read_onboard_monitor" && bridgeOnboardMonitorSnapshot.blocked === false && bridgeOnboardMonitorSnapshot.wouldTransmit === false, "Bridge Mode 06 safety metadata was not normalized");
check(bridgeOnboardMonitorSnapshot.failedCount === 1, "Bridge Mode 06 failed count was not carried");
const bridgeEmptyOnboardMonitorSnapshot = obd.normalizeBridgeOnboardMonitorSnapshot({});
check(bridgeEmptyOnboardMonitorSnapshot.testCount === 0 && bridgeEmptyOnboardMonitorSnapshot.blocked === true, "Empty Bridge Mode 06 response was not fail-closed");
const bridgeAliasOnboardMonitorSnapshot = obd.normalizeBridgeOnboardMonitorSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    mode06Tests: [
      { test_id: "01", component_id: "01", value: 90, min: 50, max: 200 }
    ]
  }
});
check(bridgeAliasOnboardMonitorSnapshot.testCount === 1, "Bridge Mode 06 alias tests were not normalized");
const bridgeOnboardMonitorExtendedAliases = obd.normalizeBridgeOnboardMonitorSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    onboardMonitorTests: [
      { monitorId: "03", component: "02", measuredValue: 75, minimum: 50, maximum: 100 }
    ]
  }
});
check(bridgeOnboardMonitorExtendedAliases.testCount === 1 && bridgeOnboardMonitorExtendedAliases.failedCount === 0, "Bridge Mode 06 extended aliases were not normalized");
const bridgeMode06RowAliases = obd.normalizeBridgeOnboardMonitorSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    mode06Rows: [
      { testCode: "05", componentCode: "03", rawValue: 88, minimum: 50, maximum: 100 }
    ]
  }
});
check(bridgeMode06RowAliases.testCount === 1 && bridgeMode06RowAliases.tests[0]?.testId === "05", "Bridge Mode 06 mode06Rows aliases were not normalized");
const onboardMonitorSnapshotMonitorTestsAlias = obd.normalizeOnboardMonitorSnapshot({
  monitor_tests: [
    { monitorId: "04", component: "01", measuredValue: 80, minimum: 50, maximum: 100 }
  ]
});
check(onboardMonitorSnapshotMonitorTestsAlias.testCount === 1 && onboardMonitorSnapshotMonitorTestsAlias.failedCount === 0, "Mode 06 snapshot did not accept monitor_tests alias input");
const onboardMonitorSnapshotRowAliases = obd.normalizeOnboardMonitorSnapshot({
  testRows: [
    { test: "06", componentCode: "02", rawValue: 120, minValue: 100, maxValue: 140 }
  ]
});
check(onboardMonitorSnapshotRowAliases.testCount === 1 && onboardMonitorSnapshotRowAliases.tests[0]?.componentId === "02", "Mode 06 snapshot testRows aliases were not normalized");
const bridgeSummary = obd.buildBridgeSessionSummary({ dtcSnapshot: bridgeDtcSnapshot, livePidSnapshot: bridgePidSnapshot, freezeFrameSnapshot: bridgeFreezeFrameSnapshot, readinessSnapshot: bridgeReadinessSnapshot, ecuInfoSnapshot: bridgeEcuInfoSnapshot, onboardMonitorSnapshot: bridgeOnboardMonitorSnapshot, adapterIdentity: bridgeAdapterIdentity });
check(bridgeSummary.codes.join(",") === "P0171,P0300", "ブリッジセッション要約へDTCを引き継げません");
check(bridgeSummary.ecuResponseSummary.ecus[0]?.address === "7E8", "Bridge session summary did not carry ECU response address");
check(bridgeSummary.ecuResponseSummary.ecus[0]?.dtcCount === 1, "Bridge session summary did not carry ECU DTC count");
check(bridgeSummary.monitorValues.length === 3, "ブリッジセッション要約へPID値を引き継げません");
check(bridgeSummary.readinessSnapshot.incompleteCount === 1, "Bridge session summary did not carry readiness");
check(bridgeSummary.onboardMonitorSnapshot.failedCount === 1, "Bridge session summary did not carry Mode 06");
check(bridgeSummary.supportedPidMatrix.supportedPids.includes("0C"), "ブリッジセッション要約へ対応PIDを引き継げません");
check(bridgeSummary.freezeFrameSnapshot.triggerDtc === "P0171", "ブリッジセッション要約へフリーズフレームを引き継げません");
check(bridgeSummary.ecuInfoSnapshot.items.find((item) => item.id === "calibration_id")?.value === "CAL-1234", "Bridge session summary did not carry ECU info");
check(bridgeSummary.readoutCoverage.progressPercent >= 80, "Bridge session summary did not build readout coverage");
check(bridgeSummary.readoutCoverage.capturedPercent >= 70, "Bridge session summary did not calculate capturedPercent");
check(bridgeSummary.readoutCoverage.capturedCategories >= 7, "Bridge session summary did not count captured readout sections");
check(bridgeSummary.readoutCoverage.emptyCategories === 0, "Bridge session summary counted missing readout sections as empty");
check(bridgeSummary.readoutCoverage.items.some((item) => item.id === "ecu_info_snapshot" && item.available === true && item.count === 4), "Bridge session summary readout coverage did not count ECU info");
check(bridgeSummary.coreSessionStatus?.stage === "diagnostic_core", "Bridge session summary did not expose coreSessionStatus stage");
check(bridgeSummary.coreSessionStatus?.schemaVersion === "core_session_status_v1", "Bridge session summary did not expose coreSessionStatus schema version");
check(Array.isArray(bridgeSummary.coreSessionStatus?.remainingReadoutIds), "Bridge session summary did not expose coreSessionStatus remainingReadoutIds");
check(bridgeSummary.readoutRequestPlanGateSummary?.state === bridgeSummary.coreSessionStatus?.readoutRequestPlanGateSummary?.state, "Bridge session summary did not expose top-level readout request plan gate summary");
check(Array.isArray(bridgeSummary.coreSessionStatus?.missingReadoutIds), "Bridge session summary did not expose coreSessionStatus missingReadoutIds");
check(Array.isArray(bridgeSummary.coreSessionStatus?.emptyReadoutIds), "Bridge session summary did not expose coreSessionStatus emptyReadoutIds");
check(bridgeSummary.readoutCompletionSummary?.capturedIds?.includes("dtc_snapshot"), "Bridge session summary did not expose top-level readout completion captured ids");
check(Array.isArray(bridgeSummary.readoutCompletionSummary?.pendingIds) && bridgeSummary.readoutCompletionSummary.pendingIds.length === bridgeSummary.coreSessionStatus?.readoutCompletionSummary?.pendingIds?.length, "Bridge session summary did not expose top-level readout completion pending ids");
check(bridgeSummary.readoutCompletionSummary?.pendingCount === bridgeSummary.readoutCompletionSummary?.pendingIds?.length, "Bridge session summary did not expose readout completion pending count");
check(bridgeSummary.analysisReadinessSummary?.ready === bridgeSummary.coreSessionStatus?.analysisReadinessSummary?.ready, "Bridge session summary did not expose top-level analysis readiness summary");
check(bridgeSummary.warnings.includes("bridge_readout_incomplete"), "Bridge session summary did not warn about incomplete readout sections");
check(bridgeSummary.warnings.includes("mode09_key_items_missing"), "Bridge session summary did not warn about missing key Mode 09 items");
check(!bridgeSummary.warnings.includes("mode09_supported_types_unknown"), "Bridge session summary warned about missing supported Mode 09 info types despite captured type 00");
check(bridgeSummary.protocol === "ISO15765-4", "ブリッジセッション要約へprotocolを引き継げません");
check(bridgeSummary.capturedAt === "2026-06-28T00:00:00Z", "ブリッジセッション要約へcapturedAtを引き継げません");
check(bridgeSummary.warnings.includes("freeze_frame_available"), "ブリッジセッション要約へフリーズフレーム警告を反映できません");
check(bridgeSummary.connectionStatus.displayStatus === "未接続", "ブリッジセッション要約の接続状態が不正です");
check(Array.isArray(bridgeSummary.vciDevices) && bridgeSummary.vciDevices.length === 0, "ブリッジセッション要約のVCI初期値が不正です");
check(bridgeSummary.exportRequired === true, "ブリッジセッション要約がエクスポート前提ではありません");
check(bridgeSummary.retainedRawText === false, "ブリッジセッション要約が原文保持になっています");
const bridgeSummaryReadinessOnly = obd.buildBridgeSessionSummary({
  readiness_snapshot: {
    blocked: false,
    protocol: "ISO9141-2",
    capturedAt: "2026-07-07T00:00:30Z",
    monitors: [{ id: "misfire", available: true, complete: false }],
    incompleteCount: 1,
    knownMonitorCount: 1
  }
});
check(bridgeSummaryReadinessOnly.protocol === "ISO9141-2", "Bridge session summary did not recover protocol from readiness_snapshot-only input");
check(bridgeSummaryReadinessOnly.capturedAt === "2026-07-07T00:00:30Z", "Bridge session summary did not recover capturedAt from readiness_snapshot-only input");
check(bridgeSummaryReadinessOnly.readinessSnapshot?.incompleteCount === 1, "Bridge session summary did not preserve readiness_snapshot-only monitor state");
check(!bridgeSummaryReadinessOnly.coreSessionStatus?.remainingReadoutIds?.includes("readiness_snapshot"), "Bridge session summary incorrectly treated readiness_snapshot-only input as unread");
check(!bridgeSummaryReadinessOnly.coreSessionStatus?.emptyReadoutIds?.includes("readiness_snapshot"), "Bridge session summary incorrectly treated readiness_snapshot-only input as empty");
const bridgeSummaryFreezeFrameOnly = obd.buildBridgeSessionSummary({
  freeze_frame_snapshot: {
    blocked: false,
    protocol: "ISO9141-2",
    capturedAt: "2026-07-07T00:00:40Z",
    trigger_dtc: "P0300",
    values: [{ pid: "0C", label: "Engine RPM", value: 900, unit: "rpm" }]
  }
});
check(bridgeSummaryFreezeFrameOnly.protocol === "ISO9141-2", "Bridge session summary did not recover protocol from freeze_frame_snapshot-only input");
check(bridgeSummaryFreezeFrameOnly.capturedAt === "2026-07-07T00:00:40Z", "Bridge session summary did not recover capturedAt from freeze_frame_snapshot-only input");
check(bridgeSummaryFreezeFrameOnly.freezeFrameSnapshot?.triggerDtc === "P0300", "Bridge session summary did not preserve freeze_frame_snapshot-only trigger DTC");
const bridgeSummarySupportedPidOnly = obd.buildBridgeSessionSummary({
  supported_pid_matrix: {
    blocked: false,
    protocol: "ISO9141-2",
    capturedAt: "2026-07-07T00:00:50Z",
    supported_pids: ["0C", "05"]
  }
});
check(bridgeSummarySupportedPidOnly.protocol === "ISO9141-2", "Bridge session summary did not recover protocol from supported_pid_matrix-only input");
check(bridgeSummarySupportedPidOnly.capturedAt === "2026-07-07T00:00:50Z", "Bridge session summary did not recover capturedAt from supported_pid_matrix-only input");
check(bridgeSummarySupportedPidOnly.supportedPidMatrix?.supportedPids.includes("0C"), "Bridge session summary did not preserve supported_pid_matrix-only input");
const bridgeSummaryOnboardMonitorOnly = obd.buildBridgeSessionSummary({
  onboard_monitor_snapshot: {
    blocked: false,
    protocol: "ISO9141-2",
    capturedAt: "2026-07-07T00:00:55Z",
    tests: [{ testId: "01", componentId: "01", value: 120, min: 100, max: 140, status: "pass" }]
  }
});
check(bridgeSummaryOnboardMonitorOnly.protocol === "ISO9141-2", "Bridge session summary did not recover protocol from onboard_monitor_snapshot-only input");
check(bridgeSummaryOnboardMonitorOnly.capturedAt === "2026-07-07T00:00:55Z", "Bridge session summary did not recover capturedAt from onboard_monitor_snapshot-only input");
check(bridgeSummaryOnboardMonitorOnly.onboardMonitorSnapshot?.testCount === 1, "Bridge session summary did not preserve onboard_monitor_snapshot-only input");
const bridgeSummaryEcuResponseOnly = obd.buildBridgeSessionSummary({
  ecu_response_summary: {
    capturedAt: "2026-07-07T00:00:57Z",
    protocol: "ISO9141-2",
    ecus: [{ address: "7E8", status: "ok", dtcCount: 1, services: ["03"] }]
  }
});
check(bridgeSummaryEcuResponseOnly.protocol === "ISO9141-2", "Bridge session summary did not recover protocol from ecu_response_summary-only input");
check(bridgeSummaryEcuResponseOnly.capturedAt === "2026-07-07T00:00:57Z", "Bridge session summary did not recover capturedAt from ecu_response_summary-only input");
check(bridgeSummaryEcuResponseOnly.ecuResponseSummary?.ecus[0]?.address === "7E8", "Bridge session summary did not preserve ecu_response_summary-only input");
const bridgeSummaryEcuInfoOnly = obd.buildBridgeSessionSummary({
  ecu_info_snapshot: {
    blocked: false,
    protocol: "ISO9141-2",
    capturedAt: "2026-07-07T00:00:58Z",
    items: [{ id: "calibration_id", infoType: "04", value: "CAL-ONLY-01" }]
  }
});
check(bridgeSummaryEcuInfoOnly.protocol === "ISO9141-2", "Bridge session summary did not recover protocol from ecu_info_snapshot-only input");
check(bridgeSummaryEcuInfoOnly.capturedAt === "2026-07-07T00:00:58Z", "Bridge session summary did not recover capturedAt from ecu_info_snapshot-only input");
check(bridgeSummaryEcuInfoOnly.ecuInfoSnapshot?.items.find((item) => item.id === "calibration_id")?.value === "CAL-ONLY-01", "Bridge session summary did not preserve ecu_info_snapshot-only input");
check(!bridgeSummaryEcuInfoOnly.coreSessionStatus?.remainingReadoutIds?.includes("ecu_info_snapshot"), "Bridge session summary incorrectly treated ecu_info_snapshot-only input as unread");
check(!bridgeSummaryEcuInfoOnly.coreSessionStatus?.emptyReadoutIds?.includes("ecu_info_snapshot"), "Bridge session summary incorrectly treated ecu_info_snapshot-only input as empty");
const bridgeSummaryAliasInputs = obd.buildBridgeSessionSummary({
  started_at: "2026-06-28T00:03:00Z",
  ended_at: "2026-06-28T00:04:00Z",
  vehicle_profile: { maker: "Toyota", model: "Prius" },
  connection_status: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { status: "ready", is_paired: true, vci_ready: true, car_connected: true }
  },
  vci_list: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { items: [{ deviceId: "summary-vci", name: "Summary VCI", isConnected: true }], selectedVciId: "summary-vci" }
  },
  adapter_identity: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { adapter: "Summary Adapter", family: "elm327", version: "4.0" }
  },
  dtcSnapshot: bridgeDtcSnapshot,
  livePidSnapshot: bridgePidSnapshot
});
check(bridgeSummaryAliasInputs.connectionStatus.displayStatus === "読取準備モデル", "Bridge session summary did not accept connection_status alias input");
check(bridgeSummaryAliasInputs.vciDevices[0]?.id === "summary-vci", "Bridge session summary did not accept vci_list alias input");
check(bridgeSummaryAliasInputs.adapterIdentity.adapterName === "Summary Adapter", "Bridge session summary did not accept adapter_identity alias input");
check(bridgeSummaryAliasInputs.startedAt === "2026-06-28T00:03:00Z" && bridgeSummaryAliasInputs.endedAt === "2026-06-28T00:04:00Z", "Bridge session summary did not accept started_at or ended_at alias input");
check(bridgeSummaryAliasInputs.vehicleProfile?.maker === "Toyota", "Bridge session summary did not accept vehicle_profile alias input");
const vehicleApplicabilitySample = {
  schemaVersion: "vehicle_applicability_v1",
  maker: "Toyota",
  model: "Prius",
  modelCode: "ZVW30",
  year: "2012",
  engineCode: "2ZR-FXE",
  catalogMatched: true,
  yearMatched: true,
  engineMatched: true,
  modelCodeMatched: true,
  candidateRangeCount: 2,
  applicableRangeCount: 1,
  supportedEngineCodeCount: 1,
  status: "matched",
  summaryLabel: "Toyota Prius / Applicable candidate found"
};
const vehicleApplicabilityPartialSample = {
  ...vehicleApplicabilitySample,
  year: "2018",
  yearMatched: false,
  applicableRangeCount: 0,
  status: "partial",
  summaryLabel: "Toyota Prius / Candidate needs review"
};
const normalizedVehicleApplicabilitySnakeArrays = obd.normalizeVehicleApplicabilitySnapshot({
  make: "Toyota",
  model: "Prius",
  model_code: "ZVW30",
  year: "2012",
  engine_code: "2ZR-FXE",
  catalog_matched: true,
  year_matched: true,
  engine_matched: true,
  model_code_matched: true,
  candidate_ranges: [{ start: "2009" }, { start: "2012" }],
  applicable_ranges: [{ start: "2012" }],
  supported_engine_codes: ["2ZR-FXE"],
  summary_label: "Toyota Prius / Applicable candidate found"
});
check(normalizedVehicleApplicabilitySnakeArrays.maker === "Toyota" && normalizedVehicleApplicabilitySnakeArrays.modelCode === "ZVW30", "Vehicle applicability normalization did not accept snake_case base aliases");
check(normalizedVehicleApplicabilitySnakeArrays.candidateRangeCount === 2 && normalizedVehicleApplicabilitySnakeArrays.applicableRangeCount === 1, "Vehicle applicability normalization did not derive counts from snake_case range aliases");
check(normalizedVehicleApplicabilitySnakeArrays.supportedEngineCodeCount === 1, "Vehicle applicability normalization did not derive supported engine count from snake_case aliases");
check(normalizedVehicleApplicabilitySnakeArrays.status === "matched" && normalizedVehicleApplicabilitySnakeArrays.summaryLabel === "Toyota Prius / Applicable candidate found", "Vehicle applicability normalization did not preserve snake_case status inputs");
const normalizedVehicleApplicabilityCamelArrays = obd.normalizeVehicleApplicabilitySnapshot({
  make: "Toyota",
  model: "Corolla",
  modelCode: "ZRE212",
  year: "2021",
  engineCode: "2ZR-FAE",
  catalogMatched: true,
  yearMatched: true,
  engineMatched: true,
  modelCodeMatched: true,
  candidateRanges: [{ start: "2019" }, { start: "2021" }, { start: "2023" }],
  applicableRanges: [{ start: "2021" }, { start: "2022" }],
  supportedEngineCodes: ["2ZR-FAE"],
  candidateRangeCount: 3,
  applicableRangeCount: 2,
  supportedEngineCodeCount: 1,
  summaryLabel: "Toyota Corolla / Applicable candidate found"
});
check(normalizedVehicleApplicabilityCamelArrays.candidateRangeCount === 3 && normalizedVehicleApplicabilityCamelArrays.applicableRangeCount === 2, "Vehicle applicability normalization did not accept camelCase range aliases");
check(normalizedVehicleApplicabilityCamelArrays.supportedEngineCodeCount === 1, "Vehicle applicability normalization did not accept camelCase supported engine code aliases");
check(normalizedVehicleApplicabilityCamelArrays.status === "matched" && normalizedVehicleApplicabilityCamelArrays.modelCodeMatched === true, "Vehicle applicability normalization did not preserve camelCase match flags");
const explicitNextReadoutCandidatesSample = [
  {
    id: "custom_snapshot",
    label: "Custom Snapshot",
    status: "missing",
    priority: 999,
    reason: "Explicit candidate sample"
  }
];
const explicitNextReadoutCandidatesUnsortedSample = [
  { id: "live_pid_snapshot", label: "Live PID", status: "missing", priority: 80, reason: "Live PID candidate" },
  { id: "freeze_frame_snapshot", label: "Freeze Frame", status: "missing", priority: 95, reason: "Freeze frame candidate" },
  { id: "dtc_snapshot", label: "DTC", status: "missing", priority: 100, reason: "DTC candidate" }
];
const bridgeSummaryApplicabilityAliases = obd.buildBridgeSessionSummary({
  vehicle_profile: { maker: "Toyota", model: "Prius" },
  vehicle_applicability: vehicleApplicabilitySample,
  dtcSnapshot: bridgeDtcSnapshot
});
check(bridgeSummaryApplicabilityAliases.vehicleApplicability?.status === "matched", "Bridge session summary did not accept vehicle_applicability alias input");
check(bridgeSummaryApplicabilityAliases.vehicleApplicability?.applicableRangeCount === 1, "Bridge session summary did not retain vehicle_applicability counts");
check(!bridgeSummaryApplicabilityAliases.warnings.includes("vehicle_applicability_partial"), "Bridge session summary emitted partial applicability warning for matched vehicle_applicability");
const bridgeSummaryApplicabilityPartial = obd.buildBridgeSessionSummary({
  vehicle_profile: { maker: "Toyota", model: "Prius" },
  vehicle_applicability: vehicleApplicabilityPartialSample,
  dtcSnapshot: bridgeDtcSnapshot
});
check(bridgeSummaryApplicabilityPartial.warnings.includes("vehicle_applicability_partial"), "Bridge session summary did not emit partial applicability warning");
check(bridgeSummaryApplicabilityPartial.nextReadoutCandidates[0]?.id === "freeze_frame_snapshot", "Bridge session summary did not prioritize freeze_frame_snapshot as the next readout candidate");
check(bridgeSummaryApplicabilityPartial.nextReadoutCandidates[1]?.id === "ecu_info_snapshot", "Bridge session summary did not prioritize ecu_info_snapshot after freeze_frame for partial applicability");
check(bridgeSummaryApplicabilityPartial.nextReadoutCandidates[0]?.reason === "読取応答が空のため再確認候補", "Bridge session summary next readout reason should stay concise for partial applicability");
const bridgeSummaryApplicabilityManual = obd.buildBridgeSessionSummary({
  vehicle_profile: { maker: "Toyota", model: "Prius" },
  vehicle_applicability: { status: "manual" },
  dtcSnapshot: bridgeDtcSnapshot
});
check(bridgeSummaryApplicabilityManual.warnings.includes("vehicle_profile_manual"), "Bridge session summary did not emit manual applicability warning");
check(bridgeSummaryApplicabilityManual.nextReadoutCandidates[0]?.id === "ecu_info_snapshot", "Bridge session summary did not prioritize ecu_info_snapshot for manual applicability");
check(bridgeSummaryApplicabilityManual.nextReadoutCandidates[1]?.id === "freeze_frame_snapshot", "Bridge session summary did not keep freeze_frame_snapshot after ecu_info_snapshot for manual applicability");
const bridgeSummaryApplicabilityUnlisted = obd.buildBridgeSessionSummary({
  vehicle_profile: { maker: "Toyota", model: "Prius" },
  vehicle_applicability: { status: "unlisted" },
  dtcSnapshot: bridgeDtcSnapshot
});
check(bridgeSummaryApplicabilityUnlisted.warnings.includes("vehicle_applicability_unlisted"), "Bridge session summary did not emit unlisted applicability warning");
check(bridgeSummaryApplicabilityUnlisted.nextReadoutCandidates[0]?.id === "ecu_info_snapshot", "Bridge session summary did not prioritize ecu_info_snapshot for unlisted applicability");
check(bridgeSummaryApplicabilityUnlisted.nextReadoutCandidates[1]?.id === "freeze_frame_snapshot", "Bridge session summary did not keep freeze_frame_snapshot after ecu_info_snapshot for unlisted applicability");
const bridgeSummaryCoverageOverride = obd.buildBridgeSessionSummary({
  readout_coverage: {
    includeInfrastructure: false,
    totalCategories: 7,
    availableCategories: 3,
    capturedCategories: 2,
    emptyCategories: 1,
    missingCategories: 4,
    capturedPercent: 29,
    progressPercent: 43,
    items: [
      { id: "dtc_snapshot", label: "DTC", status: "captured", available: true, count: 2 },
      { id: "live_pid_snapshot", status: "captured", available: true, count: 3 },
      { id: "freeze_frame_snapshot", status: "empty", available: true, count: 0 }
    ],
    emptyIds: ["freeze_frame_snapshot"],
    missingIds: ["readiness_snapshot", "ecu_info_snapshot", "onboard_monitor_snapshot", "supported_pid_matrix"]
  },
  next_readout_candidates: [{ id: "custom_summary_snapshot", label: "Summary Snapshot", priority: 1, reason: "summary override" }],
  dtcSnapshot: bridgeDtcSnapshot
});
check(bridgeSummaryCoverageOverride.readoutCoverage.includeInfrastructure === false, "Bridge session summary did not preserve explicit readout_coverage override");
check(bridgeSummaryCoverageOverride.nextReadoutCandidates[0]?.id === "custom_summary_snapshot", "Bridge session summary did not preserve explicit next_readout_candidates override");
check(bridgeSummaryCoverageOverride.coreSessionStatus?.nextRecommendedReadoutId === "custom_summary_snapshot", "Bridge session summary did not preserve explicit next_readout_candidates over coverage override emptyIds");
const manualApplicabilityReadoutCoverage = {
  items: [
    { id: "freeze_frame_snapshot", label: "Freeze Frame", status: "missing", available: false, count: 0 },
    { id: "ecu_info_snapshot", label: "ECU Info", status: "missing", available: false, count: 0 },
    { id: "readiness_snapshot", label: "Readiness", status: "missing", available: false, count: 0 }
  ]
};
const bridgeSummaryApplicabilityManualCandidates = obd.buildNextReadoutCandidates(manualApplicabilityReadoutCoverage, {
  status: "manual",
  summaryLabel: "Manual vehicle confirmation required"
});
check(bridgeSummaryApplicabilityManualCandidates[0]?.id === "ecu_info_snapshot", "Next readout candidates did not prioritize ecu_info_snapshot for manual applicability");
check(bridgeSummaryApplicabilityManualCandidates[0]?.reason === "車両適合確認のため再確認候補", "Next readout candidates did not explain ecu_info_snapshot priority for manual applicability");
const bridgeSummaryApplicabilityUnlistedCandidates = obd.buildNextReadoutCandidates(manualApplicabilityReadoutCoverage, {
  status: "unlisted",
  summaryLabel: "Vehicle not listed"
});
check(bridgeSummaryApplicabilityUnlistedCandidates[0]?.id === "ecu_info_snapshot", "Next readout candidates did not prioritize ecu_info_snapshot for unlisted applicability");
check(bridgeSummaryApplicabilityUnlistedCandidates[0]?.reason === "車種未掲載確認のため再確認候補", "Next readout candidates did not explain ecu_info_snapshot priority for unlisted applicability");
const bridgeSummaryFreezeFrameDtcCandidates = obd.buildNextReadoutCandidates(
  manualApplicabilityReadoutCoverage,
  { status: "matched" },
  null,
  { codes: ["P0171"] }
);
check(bridgeSummaryFreezeFrameDtcCandidates.find((item) => item.id === "freeze_frame_snapshot")?.reason === "DTC確定のため再確認候補", "Next readout candidates did not explain freeze_frame_snapshot priority when DTCs are present");
check(bridgeSummaryFreezeFrameDtcCandidates.find((item) => item.id === "readiness_snapshot")?.reason === "判定状態確認のため再確認候補", "Next readout candidates did not explain readiness_snapshot priority when DTCs are present");
const scanSessionFreezeFrameDtcPriority = obd.buildDiagnosticScanSession({
  session_id: "shop-test-freeze-frame-dtc-priority",
  readout_coverage: {
    includeInfrastructure: false,
    items: [
      { id: "freeze_frame_snapshot", label: "Freeze Frame", status: "missing", available: false, count: 0 },
      { id: "readiness_snapshot", label: "Readiness", status: "missing", available: false, count: 0 }
    ]
  },
  vehicle_applicability: { status: "matched" },
  dtcSnapshot: { blocked: false, capturedAt: "2026-07-07T00:04:00Z", codes: ["P0171"], dtcs: [{ code: "P0171", status: "stored" }] }
});
check(scanSessionFreezeFrameDtcPriority.nextReadoutCandidates[0]?.id === "freeze_frame_snapshot", "Diagnostic scan session did not prioritize freeze_frame_snapshot when DTCs are present");
check(scanSessionFreezeFrameDtcPriority.nextReadoutCandidates[1]?.id === "readiness_snapshot", "Diagnostic scan session did not keep readiness_snapshot after freeze_frame_snapshot when DTCs are present");
const bridgeSummaryMissingKeyItemCandidates = obd.buildNextReadoutCandidates(
  manualApplicabilityReadoutCoverage,
  { status: "matched" },
  {
    keyItemSummary: { missingCount: 2, missingLabels: ["キャリブレーション確認番号 CVN"] },
    supportInfoTypesCaptured: true
  }
);
check(bridgeSummaryMissingKeyItemCandidates.find((item) => item.id === "ecu_info_snapshot")?.reason === "主要ECU情報不足のため再確認候補", "Next readout candidates did not explain missing ECU key items");
const bridgeSummaryMissingSupportedTypeCandidates = obd.buildNextReadoutCandidates(
  manualApplicabilityReadoutCoverage,
  { status: "matched" },
  {
    keyItemSummary: { missingCount: 0, missingLabels: [] },
    supportInfoTypesCaptured: false
  }
);
check(bridgeSummaryMissingSupportedTypeCandidates.find((item) => item.id === "ecu_info_snapshot")?.reason === "対応ECU情報不足のため再確認候補", "Next readout candidates did not explain missing supported ECU info types");
const scanSessionMissingSupportedTypePriority = obd.buildDiagnosticScanSession({
  session_id: "shop-test-missing-supported-type-priority",
  readout_coverage: {
    includeInfrastructure: false,
    items: [
      { id: "ecu_info_snapshot", label: "ECU Info", status: "missing", available: false, count: 0 },
      { id: "supported_pid_matrix", label: "Supported PID", status: "missing", available: false, count: 0 }
    ]
  },
  vehicle_applicability: { status: "matched" },
  ecuInfoSnapshot: {
    blocked: false,
    capturedAt: "2026-07-06T00:03:00Z",
    items: [],
    itemCount: 0,
    keyItemSummary: { missingCount: 0, missingLabels: [] },
    supportInfoTypesCaptured: false
  }
});
check(scanSessionMissingSupportedTypePriority.warnings.includes("mode09_supported_types_unknown"), "Diagnostic scan session did not keep mode09_supported_types_unknown warning for missing supported ECU info types");
check(scanSessionMissingSupportedTypePriority.nextReadoutCandidates[0]?.id === "ecu_info_snapshot", "Diagnostic scan session did not prioritize ecu_info_snapshot when supported ECU info types are missing");
const scanSessionMissingKeyItemPriority = obd.buildDiagnosticScanSession({
  session_id: "shop-test-missing-key-item-priority",
  readout_coverage: {
    includeInfrastructure: false,
    items: [
      { id: "ecu_info_snapshot", label: "ECU Info", status: "missing", available: false, count: 0 },
      { id: "freeze_frame_snapshot", label: "Freeze Frame", status: "missing", available: false, count: 0 }
    ]
  },
  vehicle_applicability: { status: "matched" },
  ecuInfoSnapshot: {
    blocked: false,
    capturedAt: "2026-07-06T00:03:30Z",
    items: [],
    itemCount: 0,
    keyItemSummary: { missingCount: 2, missingLabels: ["キャリブレーション確認番号 CVN"] },
    supportInfoTypesCaptured: true
  }
});
check(scanSessionMissingKeyItemPriority.warnings.includes("mode09_key_items_missing"), "Diagnostic scan session did not keep mode09_key_items_missing warning for missing ECU key items");
check(scanSessionMissingKeyItemPriority.nextReadoutCandidates[0]?.id === "freeze_frame_snapshot", "Diagnostic scan session did not keep freeze_frame_snapshot ahead of ECU info for matched missing-key-item coverage");
check(scanSessionMissingKeyItemPriority.nextReadoutCandidates[1]?.id === "ecu_info_snapshot", "Diagnostic scan session did not keep ecu_info_snapshot as a top follow-up when ECU key items are missing");
const supportedPidReasonReadoutCoverage = {
  items: [
    { id: "supported_pid_matrix", label: "Supported PID", status: "missing", available: false, count: 0 },
    { id: "live_pid_snapshot", label: "Live PID", status: "missing", available: false, count: 0 }
  ]
};
const bridgeSummarySupportedPidCandidates = obd.buildNextReadoutCandidates(
  supportedPidReasonReadoutCoverage,
  { status: "matched" },
  null,
  null,
  { supportedPids: ["0C", "0D"] }
);
check(bridgeSummarySupportedPidCandidates.find((item) => item.id === "supported_pid_matrix")?.reason === "対応PID確認のため再確認候補", "Next readout candidates did not explain supported_pid_matrix priority for matched applicability");
check(bridgeSummarySupportedPidCandidates.find((item) => item.id === "live_pid_snapshot")?.reason === "対応PID実測確認のため再確認候補", "Next readout candidates did not explain live_pid_snapshot priority when supported PID data is present");
const bridgeSummarySnapshotAliases = obd.buildBridgeSessionSummary({
  dtc_snapshot: bridgeDtcSnapshot,
  live_pid_snapshot: bridgePidSnapshot,
  freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
  readiness_snapshot: bridgeReadinessSnapshot,
  ecu_info_snapshot: bridgeEcuInfoSnapshot,
  onboard_monitor_snapshot: bridgeOnboardMonitorSnapshot,
  supported_pid_matrix: bridgeSupportedPidSnapshot,
  ecu_response_summary: bridgeSummary.ecuResponseSummary
});
check(bridgeSummarySnapshotAliases.freezeFrameSnapshot.triggerDtc === "P0171", "Bridge session summary did not accept freeze_frame_snapshot alias input");
check(bridgeSummarySnapshotAliases.readinessSnapshot.incompleteCount === 1, "Bridge session summary did not accept readiness_snapshot alias input");
check(bridgeSummarySnapshotAliases.ecuInfoSnapshot.itemCount === bridgeEcuInfoSnapshot.itemCount, "Bridge session summary did not accept ecu_info_snapshot alias input");
check(bridgeSummarySnapshotAliases.onboardMonitorSnapshot.failedCount === 1, "Bridge session summary did not accept onboard_monitor_snapshot alias input");
const bridgeSummaryResponseAliases = obd.buildBridgeSessionSummary({
  dtc_snapshot: bridgeDtcSnapshot,
  live_pid_snapshot: bridgePidSnapshot,
  freeze_frame_response: bridgeFreezeFrameSnapshot,
  supported_pid_snapshot: bridgeSupportedPidSnapshot
});
check(bridgeSummaryResponseAliases.freezeFrameSnapshot.triggerDtc === "P0171", "Bridge session summary did not accept freeze_frame_response alias input");
check(bridgeSummaryResponseAliases.supportedPidMatrix.supportedPids.includes("40"), "Bridge session summary did not accept supported_pid_snapshot alias input");
const bridgeSummaryLivePidResponseAliases = obd.buildBridgeSessionSummary({
  dtc_snapshot: bridgeDtcSnapshot,
  live_pid_response: { raw: "41 0C 1A F8 41 05 7B" },
  ecu_response_summary_response: bridgeSummary.ecuResponseSummary
});
check(bridgeSummaryLivePidResponseAliases.monitorValues.find((item) => item.id === "engine_speed")?.value === 1726, "Bridge session summary did not decode live_pid_response alias input");
check(bridgeSummaryLivePidResponseAliases.ecuResponseSummary?.schemaVersion === bridgeSummary.ecuResponseSummary.schemaVersion, "Bridge session summary did not accept ecu_response_summary_response alias input");
const bridgeSummaryCamelResponseAliases = obd.buildBridgeSessionSummary({
  dtcSnapshot: bridgeDtcSnapshot,
  livePidResponse: { raw: "41 0C 1A F8 41 05 7B" },
  supportedPidResponse: { raw: "41 00 18 18 00 01 41 20 80 00 00 01" },
  freezeFrameResponse: { raw: "42 02 00 01 71 42 01 00 82 07 22 00 42 03 00 01 00 42 24 00 80 00 20 00 42 0C 00 1A F8 42 05 00 7B" },
  readinessResponse: { raw: "41 01 81 07 22 00" },
  onboardMonitorResponse: { raw: "46 01 01 00 64 00 32 00 C8" },
  ecuInfoResponse: { raw: "49 04 01 43 41 4C 2D 31 32 33 34" },
  ecuResponseSummaryResponse: bridgeSummary.ecuResponseSummary,
  connectionStatusResponse: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { status: "ready", is_paired: true, vci_ready: true, car_connected: true }
  },
  listVciResponse: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { items: [{ deviceId: "summary-camel-vci", name: "Summary Camel VCI", isConnected: true }], selectedVciId: "summary-camel-vci" }
  },
  adapterIdentityResponse: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { adapter: "Summary Camel Adapter", family: "stn", version: "7.6" }
  }
});
check(bridgeSummaryCamelResponseAliases.monitorValues.find((item) => item.id === "engine_speed")?.value === 1726, "Bridge session summary did not decode livePidResponse camelCase alias input");
check(bridgeSummaryCamelResponseAliases.supportedPidMatrix?.supportedPids.includes("40"), "Bridge session summary did not decode supportedPidResponse camelCase alias input");
check(bridgeSummaryCamelResponseAliases.freezeFrameSnapshot?.monitorValues?.find((item) => item.id === "engine_speed")?.value === 1726, "Bridge session summary did not decode freezeFrameResponse camelCase alias input");
check(bridgeSummaryCamelResponseAliases.readinessSnapshot?.incompleteCount === 1, "Bridge session summary did not decode readinessResponse camelCase alias input");
check(bridgeSummaryCamelResponseAliases.onboardMonitorSnapshot?.testCount === 1, "Bridge session summary did not decode onboardMonitorResponse camelCase alias input");
check(bridgeSummaryCamelResponseAliases.ecuInfoSnapshot?.itemCount === 1, "Bridge session summary did not decode ecuInfoResponse camelCase alias input");
check(bridgeSummaryCamelResponseAliases.ecuResponseSummary?.schemaVersion === bridgeSummary.ecuResponseSummary.schemaVersion, "Bridge session summary did not accept ecuResponseSummaryResponse camelCase alias input");
check(bridgeSummaryCamelResponseAliases.connectionStatus?.vehicleConnected === true, "Bridge session summary did not accept connectionStatusResponse camelCase alias input");
check(bridgeSummaryCamelResponseAliases.vciDevices[0]?.id === "summary-camel-vci", "Bridge session summary did not accept listVciResponse camelCase alias input");
check(bridgeSummaryCamelResponseAliases.adapterIdentity?.adapterFamily === "stn", "Bridge session summary did not accept adapterIdentityResponse camelCase alias input");
const bridgeSummaryNonInfrastructureAliases = obd.buildBridgeSessionSummary({
  dtc_codes: ["P0300"],
  supported_pid_snapshot: bridgeSupportedPidSnapshot
});
check(bridgeSummaryNonInfrastructureAliases.readoutCoverage.includeInfrastructure === false, "Bridge session summary incorrectly counted bridge infrastructure for summary-only alias input");
check(!bridgeSummaryNonInfrastructureAliases.warnings.includes("bridge_readout_incomplete") && !bridgeSummaryNonInfrastructureAliases.warnings.includes("bridge_readout_empty_sections"), "Bridge session summary emitted bridge readout warnings without bridge infrastructure context");
check(!bridgeSummaryNonInfrastructureAliases.warnings.includes("local_bridge_disabled"), "Bridge session summary emitted local_bridge_disabled without bridge context");
check(!bridgeSummaryNonInfrastructureAliases.warnings.includes("mode09_supported_types_unknown"), "Bridge session summary emitted mode09_supported_types_unknown without ECU info input");
const bridgeExportPayload = obd.buildBridgeSessionExportPayload({
  tool_hints: ["Techstream", "J2534"],
  source_length: 128,
  connectionStatus: bridgeStatus,
  vciList: bridgeVciList,
  dtcSnapshot: bridgeDtcSnapshot,
  livePidSnapshot: bridgePidSnapshot,
  freezeFrameSnapshot: bridgeFreezeFrameSnapshot,
  readinessSnapshot: bridgeReadinessSnapshot,
  ecuInfoSnapshot: bridgeEcuInfoSnapshot,
  onboardMonitorSnapshot: bridgeOnboardMonitorSnapshot,
  adapterIdentity: bridgeAdapterIdentity,
  supportedPidMatrix: bridgeSupportedPidSnapshot,
  exportedAt: "2026-06-28T00:02:00Z"
});
check(bridgeExportPayload.schema_version === "bridge_session_export_v1", "ブリッジエクスポート形式のバージョンが不正です");
check(bridgeExportPayload.connection_enabled === false, "ブリッジエクスポートが接続有効になっています");
check(bridgeExportPayload.vehicle_command_enabled === false, "ブリッジエクスポートが車両コマンド有効になっています");
check(bridgeExportPayload.retained_raw_frames === false && bridgeExportPayload.retained_raw_text === false, "ブリッジエクスポートが原文保持になっています");
check(bridgeExportPayload.session.adapter_identity.adapterFamily === "elm327", "ブリッジエクスポートへアダプター情報を引き継げません");
check(bridgeExportPayload.session.protocol === "ISO15765-4", "ブリッジエクスポートへprotocolを引き継げません");
check(bridgeExportPayload.session.captured_at === "2026-06-28T00:00:00Z", "ブリッジエクスポートへcapturedAtを引き継げません");
check(bridgeExportPayload.session.dtc_codes.join(",") === "P0171,P0300", "ブリッジエクスポートへDTCを引き継げません");
check(bridgeExportPayload.session.ecu_response_summary.ecus[0]?.address === "7E8", "Bridge export did not carry ECU response summary");
check(bridgeExportPayload.session.supported_pid_matrix.supportedPids.includes("40"), "ブリッジエクスポートへ対応PIDを引き継げません");
check(bridgeExportPayload.session.readiness_snapshot.incompleteCount === 1, "Bridge export did not carry readiness");
check(bridgeExportPayload.session.ecu_info_snapshot.items.find((item) => item.id === "calibration_id")?.value === "CAL-1234", "Bridge export did not carry ECU info");
check(bridgeExportPayload.session.onboard_monitor_snapshot.failedCount === 1, "Bridge export did not carry Mode 06");
check(bridgeExportPayload.session.readout_coverage.progressPercent >= 80, "Bridge export did not carry readout coverage");
check(bridgeExportPayload.session.core_session_status?.schemaVersion === "core_session_status_v1", "Bridge export did not carry core session status");
check(bridgeExportPayload.session.core_session_status?.stage === "diagnostic_core", "Bridge export did not carry core session status stage");
check(bridgeExportPayload.session.diagnostic_flow_summary?.schemaVersion === "diagnostic_flow_summary_v1", "Bridge export did not carry diagnostic flow summary");
check(bridgeExportPayload.session.diagnostic_flow_summary?.stage === "diagnostic_core", "Bridge export did not carry diagnostic flow summary stage");
check(bridgeExportPayload.session.readout_completion_summary?.capturedIds?.includes("dtc_snapshot"), "Bridge export did not carry readout completion summary captured ids");
check(Array.isArray(bridgeExportPayload.session.readout_completion_summary?.pendingIds), "Bridge export did not carry readout completion summary pending ids");
check(bridgeExportPayload.session.readout_completion_summary?.capturedCount === bridgeExportPayload.session.readout_completion_summary?.capturedIds?.length, "Bridge export did not carry readout completion captured count");
check(bridgeExportPayload.session.analysis_readiness_summary?.ready === bridgeExportPayload.session.core_session_status?.analysisReadinessSummary?.ready, "Bridge export did not carry analysis readiness summary");
check(bridgeExportPayload.session.readout_request_plan_gate_summary?.state === bridgeExportPayload.session.core_session_status?.readoutRequestPlanGateSummary?.state, "Bridge export did not carry readout request plan gate summary");
check(bridgeExportPayload.session.freeze_frame_snapshot.triggerDtc === "P0171", "ブリッジエクスポートへフリーズフレームを引き継げません");
check(bridgeExportPayload.session.monitor_values.length === 3, "ブリッジエクスポートへPID値を引き継げません");
check(bridgeExportPayload.session.tool_hints.join(",") === "Techstream,J2534", "Bridge export did not carry tool_hints");
check(bridgeExportPayload.session.source_length === 128, "Bridge export did not carry source_length");
check(bridgeExportPayload.safety.blocked_write_intents.includes("clear_dtc"), "ブリッジエクスポートの安全メタ情報が不足しています");
const bridgeExportAliasInputs = obd.buildBridgeSessionExportPayload({
  started_at: "2026-06-28T00:05:00Z",
  ended_at: "2026-06-28T00:06:00Z",
  exported_at: "2026-06-28T00:07:00Z",
  vehicle_profile: { maker: "Toyota", model: "Aqua" },
  vehicle_applicability: vehicleApplicabilitySample,
  dtcSnapshot: bridgeDtcSnapshot,
  livePidSnapshot: bridgePidSnapshot
});
check(bridgeExportAliasInputs.exported_at === "2026-06-28T00:07:00Z", "Bridge export did not accept exported_at alias input");
check(bridgeExportAliasInputs.session.started_at === "2026-06-28T00:05:00Z" && bridgeExportAliasInputs.session.ended_at === "2026-06-28T00:06:00Z", "Bridge export did not accept started_at or ended_at alias input");
check(bridgeExportAliasInputs.session.vehicle_profile?.model === "Aqua", "Bridge export did not accept vehicle_profile alias input");
check(bridgeExportAliasInputs.session.vehicle_applicability?.status === "matched", "Bridge export did not accept vehicle_applicability alias input");
const bridgeExportUnknownApplicability = obd.buildBridgeSessionExportPayload({
  dtcSnapshot: bridgeDtcSnapshot
});
check(bridgeExportUnknownApplicability.session.vehicle_applicability?.status === "unknown", "Bridge export did not default missing vehicle applicability to unknown");
const bridgeExportSummaryAliases = obd.buildBridgeSessionExportPayload({
  captured_at: "2026-06-28T00:08:00Z",
  dtc_codes: ["P0171"],
  monitor_values: [{ id: "engine_speed", label: "Engine RPM", value: 650, unit: "rpm", valueType: "number", decoded: true }],
  monitor_value_summary: { totalCount: 1, decodedCount: 1, undecodedRawCount: 0, numericCount: 1, textCount: 0 },
  monitor_insights: [{ id: "engine_speed_high", severity: "info" }],
  warnings: ["freeze_frame_available", "freeze_frame_available"],
  connection_status: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { status: "ready", is_paired: true, vci_ready: true, car_connected: true }
  },
  vci_list: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { items: [{ deviceId: "summary-export-vci", name: "Summary Export VCI", isConnected: true }], selectedVciId: "summary-export-vci" }
  },
  adapter_identity: bridgeAdapterIdentity,
  supported_pid_snapshot: bridgeSupportedPidSnapshot,
  readiness_response: bridgeReadinessSnapshot,
  ecu_info_response: bridgeEcuInfoSnapshot,
  onboard_monitor_response: bridgeOnboardMonitorSnapshot,
  readout_coverage: bridgeSummary.readoutCoverage,
  freeze_frame_response: bridgeFreezeFrameSnapshot,
  ecu_response_summary: bridgeSummary.ecuResponseSummary,
  next_readout_candidates: explicitNextReadoutCandidatesSample
});
check(bridgeExportSummaryAliases.session.captured_at === "2026-06-28T00:08:00Z", "Bridge export did not accept captured_at summary alias input");
check(bridgeExportSummaryAliases.session.dtc_codes[0] === "P0171", "Bridge export did not accept dtc_codes summary alias input");
check(bridgeExportSummaryAliases.session.monitor_values[0]?.id === "engine_speed", "Bridge export did not accept monitor_values summary alias input");
check(bridgeExportSummaryAliases.session.monitor_value_summary.totalCount === 1, "Bridge export did not accept monitor_value_summary summary alias input");
check(bridgeExportSummaryAliases.session.monitor_insights[0]?.id === "engine_speed_high", "Bridge export did not accept monitor_insights summary alias input");
check(bridgeExportSummaryAliases.session.warnings.length === 1 && bridgeExportSummaryAliases.session.warnings[0] === "freeze_frame_available", "Bridge export did not deduplicate warnings summary alias input");
check(bridgeExportSummaryAliases.session.connection_status.paired === true && bridgeExportSummaryAliases.session.connection_status.vehicleConnected === true, "Bridge export did not normalize connection_status summary alias input");
check(bridgeExportSummaryAliases.session.vci_devices[0]?.id === "summary-export-vci", "Bridge export did not accept vci_list summary alias input");
check(bridgeExportSummaryAliases.session.adapter_identity.adapterFamily === "elm327", "Bridge export did not accept adapter_identity summary alias input");
check(bridgeExportSummaryAliases.session.supported_pid_matrix.supportedPids.includes("40"), "Bridge export did not accept supported_pid_snapshot summary alias input");
check(bridgeExportSummaryAliases.session.freeze_frame_snapshot.triggerDtc === "P0171", "Bridge export did not accept freeze_frame_response summary alias input");
check(bridgeExportSummaryAliases.session.readiness_snapshot.incompleteCount === 1, "Bridge export did not accept readiness_response summary alias input");
check(bridgeExportSummaryAliases.session.ecu_info_snapshot.itemCount === bridgeEcuInfoSnapshot.itemCount, "Bridge export did not accept ecu_info_response summary alias input");
check(bridgeExportSummaryAliases.session.onboard_monitor_snapshot.failedCount === 1, "Bridge export did not accept onboard_monitor_response summary alias input");
check(bridgeExportSummaryAliases.session.next_readout_candidates[0]?.id === "custom_snapshot", "Bridge export did not preserve explicit next_readout_candidates summary alias input");
const bridgeExportDirectSnakeMetadataSummary = obd.buildBridgeSessionExportPayload({
  vehicle_applicability: {
    make: "Toyota",
    model: "Prius",
    model_code: "ZVW30",
    year: "2012",
    engine_code: "2ZR-FXE",
    catalog_matched: true,
    year_matched: true,
    engine_matched: true,
    model_code_matched: true,
    candidate_ranges: [{ start: "2009" }, { start: "2012" }],
    applicable_ranges: [{ start: "2012" }],
    supported_engine_codes: ["2ZR-FXE"],
    summary_label: "Toyota Prius / Applicable candidate found"
  },
  import_classification: {
    schemaVersion: "obd_response_line_classification_v1",
    bucketCounts: { storedDtcResponses: 2 }
  },
  next_readout_candidates: [{ id: "direct_snake_snapshot", label: "Direct Snake Snapshot", priority: 4, reason: "summary alias" }],
  tool_hints: ["Techstream", "CONSULT"],
  warning_flags: ["negative_obd_response_present", "freeze_frame_available"],
  had_sensitive_identifier: true,
  source_length: 77,
  ecu_info_snapshot: {
    itemCount: 1,
    had_sensitive_identifier: true,
    items: [{ id: "vin", value: "JT123456789012345", privacyClass: "sensitive_identifier" }]
  }
});
check(bridgeExportDirectSnakeMetadataSummary.session.import_classification?.bucketCounts?.storedDtcResponses === 2, "Bridge export did not preserve direct snake_case import_classification summary input");
check(bridgeExportDirectSnakeMetadataSummary.session.next_readout_candidates[0]?.id === "direct_snake_snapshot", "Bridge export did not preserve direct snake_case next_readout_candidates summary input");
check(bridgeExportDirectSnakeMetadataSummary.session.had_sensitive_identifier === true, "Bridge export did not preserve direct snake_case had_sensitive_identifier summary input");
check(bridgeExportDirectSnakeMetadataSummary.session.source_length === 77, "Bridge export did not preserve direct snake_case source_length summary input");
check(bridgeExportDirectSnakeMetadataSummary.session.tool_hints.join(",") === "Techstream,CONSULT", "Bridge export did not preserve direct snake_case tool_hints summary input");
check(bridgeExportDirectSnakeMetadataSummary.session.warnings.includes("negative_obd_response_present") && bridgeExportDirectSnakeMetadataSummary.session.warnings.includes("freeze_frame_available"), "Bridge export did not preserve direct snake_case warning_flags summary input");
check(bridgeExportDirectSnakeMetadataSummary.session.vehicle_applicability?.candidateRangeCount === 2 && bridgeExportDirectSnakeMetadataSummary.session.vehicle_applicability?.supportedEngineCodeCount === 1, "Bridge export did not normalize direct snake_case vehicle_applicability summary input");
const bridgeExportDirectCamelMetadataSummary = obd.buildBridgeSessionExportPayload({
  vehicleApplicability: {
    make: "Toyota",
    model: "Corolla",
    modelCode: "ZRE212",
    year: "2021",
    engineCode: "2ZR-FAE",
    catalogMatched: true,
    yearMatched: true,
    engineMatched: true,
    modelCodeMatched: true,
    candidateRanges: [{ start: "2019" }, { start: "2021" }],
    applicableRanges: [{ start: "2021" }],
    supportedEngineCodes: ["2ZR-FAE"],
    summaryLabel: "Toyota Corolla / Applicable candidate found"
  },
  importClassification: {
    schemaVersion: "obd_response_line_classification_v1",
    bucketCounts: { storedDtcResponses: 4 }
  },
  nextReadoutCandidates: [{
    readoutId: "direct_camel_snapshot",
    displayLabel: "Direct Camel Snapshot",
    sortOrder: 4,
    reasonLabel: "summary camel",
    vehicleApplicabilityStatus: "matched"
  }],
  toolHints: ["Techstream", "CONSULT"],
  warningFlags: ["negative_obd_response_present", "freeze_frame_available"],
  hadSensitiveIdentifier: true,
  sourceLength: 66,
  ecuInfoSnapshot: {
    itemCount: 1,
    hadSensitiveIdentifier: true,
    items: [{ id: "vin", value: "JT123456789012345", privacyClass: "sensitive_identifier" }]
  }
});
check(bridgeExportDirectCamelMetadataSummary.session.import_classification?.bucketCounts?.storedDtcResponses === 4, "Bridge export did not preserve direct camelCase importClassification summary input");
check(bridgeExportDirectCamelMetadataSummary.session.next_readout_candidates[0]?.id === "direct_camel_snapshot", "Bridge export did not preserve direct camelCase nextReadoutCandidates summary input");
check(bridgeExportDirectCamelMetadataSummary.session.next_readout_candidates[0]?.label === "Direct Camel Snapshot" && bridgeExportDirectCamelMetadataSummary.session.next_readout_candidates[0]?.priority === 4, "Bridge export did not normalize camelCase nextReadoutCandidates item aliases");
check(bridgeExportDirectCamelMetadataSummary.session.next_readout_candidates[0]?.applicabilityStatus === "matched", "Bridge export did not preserve camelCase vehicleApplicabilityStatus in nextReadoutCandidates");
check(bridgeExportDirectCamelMetadataSummary.session.had_sensitive_identifier === true, "Bridge export did not preserve direct camelCase hadSensitiveIdentifier summary input");
check(bridgeExportDirectCamelMetadataSummary.session.source_length === 66, "Bridge export did not preserve direct camelCase sourceLength summary input");
check(bridgeExportDirectCamelMetadataSummary.session.tool_hints.join(",") === "Techstream,CONSULT", "Bridge export did not preserve direct camelCase toolHints summary input");
check(bridgeExportDirectCamelMetadataSummary.session.warnings.includes("negative_obd_response_present") && bridgeExportDirectCamelMetadataSummary.session.warnings.includes("freeze_frame_available"), "Bridge export did not preserve direct camelCase warningFlags summary input");
check(bridgeExportDirectCamelMetadataSummary.session.vehicle_applicability?.candidateRangeCount === 2 && bridgeExportDirectCamelMetadataSummary.session.vehicle_applicability?.supportedEngineCodeCount === 1, "Bridge export did not normalize direct camelCase vehicleApplicability summary input");
check(bridgeExportDirectCamelMetadataSummary.session.vehicle_applicability?.summaryLabel === "Toyota Corolla / Applicable candidate found", "Bridge export did not preserve camelCase vehicleApplicability summaryLabel");
const bridgeExportDirectMixedMetadataSummary = obd.buildBridgeSessionExportPayload({
  importClassification: {
    schemaVersion: "obd_response_line_classification_v1",
    bucketCounts: { storedDtcResponses: 6 }
  },
  next_readout_candidates: [{ id: "direct_mixed_snapshot", label: "Direct Mixed Snapshot", priority: 4, reason: "mixed summary" }],
  toolHints: ["Techstream"],
  warning_flags: ["negative_obd_response_present"],
  hadSensitiveIdentifier: true,
  source_length: 68,
  ecu_info_snapshot: {
    itemCount: 1,
    had_sensitive_identifier: true,
    items: [{ id: "vin", value: "JT123456789012345", privacyClass: "sensitive_identifier" }]
  }
});
check(bridgeExportDirectMixedMetadataSummary.session.import_classification?.bucketCounts?.storedDtcResponses === 6, "Bridge export did not preserve mixed-case direct importClassification summary input");
check(bridgeExportDirectMixedMetadataSummary.session.next_readout_candidates[0]?.id === "direct_mixed_snapshot", "Bridge export did not preserve mixed-case direct next_readout_candidates summary input");
check(bridgeExportDirectMixedMetadataSummary.session.had_sensitive_identifier === true, "Bridge export did not preserve mixed-case direct hadSensitiveIdentifier summary input");
check(bridgeExportDirectMixedMetadataSummary.session.source_length === 68, "Bridge export did not preserve mixed-case direct source_length summary input");
check(bridgeExportDirectMixedMetadataSummary.session.tool_hints.join(",") === "Techstream", "Bridge export did not preserve mixed-case direct toolHints summary input");
check(bridgeExportDirectMixedMetadataSummary.session.warnings.includes("negative_obd_response_present"), "Bridge export did not preserve mixed-case direct warning_flags summary input");
const bridgeExportDirectMixedVehicleMetadataSummary = obd.buildBridgeSessionExportPayload({
  vehicleProfile: { maker: "Toyota", model: "Mixed Aqua" },
  vehicle_applicability: vehicleApplicabilitySample,
  dtcSnapshot: bridgeDtcSnapshot
});
check(bridgeExportDirectMixedVehicleMetadataSummary.session.vehicle_profile?.model === "Mixed Aqua", "Bridge export did not preserve mixed-case direct vehicleProfile summary input");
check(bridgeExportDirectMixedVehicleMetadataSummary.session.vehicle_applicability?.status === "matched", "Bridge export did not preserve mixed-case direct vehicle_applicability summary input");
const bridgeDiagnosticImport = obd.buildBridgeDiagnosticImport({
  started_at: "2026-06-28T00:05:00Z",
  ended_at: "2026-06-28T00:06:00Z",
  source_length: 128,
  tool_hints: ["Techstream", "J2534"],
  vehicle_profile: { maker: "Toyota", model: "Prius" },
  vehicle_applicability: vehicleApplicabilitySample,
  connectionStatus: bridgeStatus,
  vciList: bridgeVciList,
  dtcSnapshot: bridgeDtcSnapshot,
  livePidSnapshot: bridgePidSnapshot,
  freezeFrameSnapshot: bridgeFreezeFrameSnapshot,
  readinessSnapshot: bridgeReadinessSnapshot,
  ecuInfoSnapshot: bridgeEcuInfoSnapshot,
  onboardMonitorSnapshot: bridgeOnboardMonitorSnapshot,
  adapterIdentity: bridgeAdapterIdentity,
  supportedPidMatrix: bridgeSupportedPidSnapshot
});
const bridgeDiagnosticImportApplicabilityPartial = obd.buildBridgeDiagnosticImport({
  vehicle_profile: { maker: "Toyota", model: "Prius" },
  vehicle_applicability: vehicleApplicabilityPartialSample,
  dtcSnapshot: bridgeDtcSnapshot
});
const bridgeDiagnosticImportUnknownApplicability = obd.buildBridgeDiagnosticImport({
  bridge_export_payload: bridgeExportUnknownApplicability
});
check(bridgeDiagnosticImportUnknownApplicability.vehicleApplicability?.status === "unknown", "Bridge diagnostic import did not preserve unknown vehicle applicability from bridge export payload");
check(bridgeDiagnosticImport.importType === "bridge_diagnostic_snapshot", "ブリッジ診断取込の種別が不正です");
check(bridgeDiagnosticImport.codes.join(",") === "P0171,P0300", "ブリッジ診断取込へDTCを引き継げません");
check(bridgeDiagnosticImport.ecuResponseSummary.ecus[0]?.dtcCount === 1, "Bridge diagnostic import did not carry ECU response summary");
check(bridgeDiagnosticImport.monitorValues.length === 3, "ブリッジ診断取込へPID値を引き継げません");
check(bridgeDiagnosticImport.readinessSnapshot.incompleteCount === 1, "Bridge diagnostic import did not carry readiness");
check(bridgeDiagnosticImport.supportedPidMatrix.supportedPids.includes("05"), "ブリッジ診断取込へ対応PIDを引き継げません");
check(bridgeDiagnosticImport.ecuInfoSnapshot.items.find((item) => item.id === "calibration_id")?.value === "CAL-1234", "Bridge diagnostic import did not carry ECU info");
check(bridgeDiagnosticImport.onboardMonitorSnapshot.failedCount === 1, "Bridge diagnostic import did not carry Mode 06");
check(bridgeDiagnosticImport.readoutCoverage.progressPercent >= 80, "Bridge diagnostic import did not carry readout coverage");
check(bridgeDiagnosticImport.coreSessionStatus?.schemaVersion === "core_session_status_v1", "Bridge diagnostic import did not carry top-level core session status");
check(bridgeDiagnosticImport.bridgeSession?.coreSessionStatus?.stage === "diagnostic_core", "Bridge diagnostic import did not retain core session status on bridgeSession");
check(bridgeDiagnosticImport.diagnosticFlowSummary?.schemaVersion === "diagnostic_flow_summary_v1", "Bridge diagnostic import did not carry top-level diagnostic flow summary");
check(bridgeDiagnosticImport.bridgeSession?.diagnosticFlowSummary?.stage === "diagnostic_core", "Bridge diagnostic import did not retain diagnostic flow summary on bridgeSession");
check(bridgeDiagnosticImport.readoutCompletionSummary?.capturedIds?.includes("dtc_snapshot"), "Bridge diagnostic import did not carry top-level readout completion summary");
check(bridgeDiagnosticImport.bridgeSession?.readoutCompletionSummary?.capturedIds?.includes("dtc_snapshot"), "Bridge diagnostic import did not retain readout completion summary on bridgeSession");
check(bridgeDiagnosticImport.analysisReadinessSummary?.ready === bridgeDiagnosticImport.coreSessionStatus?.analysisReadinessSummary?.ready, "Bridge diagnostic import did not carry top-level analysis readiness summary");
check(bridgeDiagnosticImport.bridgeSession?.analysisReadinessSummary?.ready === bridgeDiagnosticImport.bridgeSession?.coreSessionStatus?.analysisReadinessSummary?.ready, "Bridge diagnostic import did not retain analysis readiness summary on bridgeSession");
check(bridgeDiagnosticImport.readoutRequestPlanGateSummary?.state === bridgeDiagnosticImport.coreSessionStatus?.readoutRequestPlanGateSummary?.state, "Bridge diagnostic import did not carry top-level readout request plan gate summary");
check(bridgeDiagnosticImport.bridgeSession?.readoutRequestPlanGateSummary?.state === bridgeDiagnosticImport.bridgeSession?.coreSessionStatus?.readoutRequestPlanGateSummary?.state, "Bridge diagnostic import did not retain readout request plan gate summary on bridgeSession");
check(bridgeDiagnosticImport.freezeFrameSnapshot.monitorValues.length === 2, "ブリッジ診断取込へフリーズフレームを引き継げません");
check(bridgeDiagnosticImport.monitorInsights.length > 0, "ブリッジ診断取込へ相関ヒントを引き継げません");
check(bridgeDiagnosticImport.connectionStatus.displayStatus === "読取準備モデル", "Bridge diagnostic import did not expose top-level connection status");
check(bridgeDiagnosticImport.vciDevices.length === 1, "Bridge diagnostic import did not expose top-level vci devices");
check(bridgeDiagnosticImport.adapterIdentity.adapterFamily === "elm327", "Bridge diagnostic import did not expose top-level adapter identity");
check(bridgeDiagnosticImport.vehicleProfile?.model === "Prius", "Bridge diagnostic import did not expose top-level vehicle profile");
check(bridgeDiagnosticImport.vehicleApplicability?.status === "matched", "Bridge diagnostic import did not expose top-level vehicle applicability");
check(bridgeDiagnosticImport.toolHints.join(",") === "Techstream,J2534", "Bridge diagnostic import did not expose top-level toolHints");
check(bridgeDiagnosticImport.sourceLength === 128, "Bridge diagnostic import did not expose top-level sourceLength");
check(Array.isArray(bridgeDiagnosticImportApplicabilityPartial.nextReadoutCandidates) && bridgeDiagnosticImportApplicabilityPartial.nextReadoutCandidates.length > 0, "Bridge diagnostic import did not expose next readout candidates");
check(bridgeDiagnosticImport.warnings.includes("freeze_frame_available"), "Bridge diagnostic import did not expose top-level warnings");
check(bridgeDiagnosticImport.bridgeSession.vciDevices.length === 1, "ブリッジ診断取込へVCI表示モデルを引き継げません");
check(bridgeDiagnosticImport.bridgeSession.adapterIdentity.adapterFamily === "elm327", "ブリッジ診断取込へアダプター情報を引き継げません");
check(bridgeDiagnosticImport.bridgeSession.protocol === "ISO15765-4", "ブリッジ診断取込へprotocolを引き継げません");
check(bridgeDiagnosticImport.bridgeSession.capturedAt === "2026-06-28T00:00:00Z", "ブリッジ診断取込へcapturedAtを引き継げません");
check(bridgeDiagnosticImport.bridgeSession.vehicleApplicability?.status === "matched", "ブリッジ診断取込のbridgeSessionへvehicleApplicabilityを保持できません");
check(bridgeDiagnosticImport.bridgeSession.supportedPidMatrix?.supportedPids.includes("40"), "ブリッジ診断取込のbridgeSessionへ対応PIDを保持できません");
check(bridgeDiagnosticImport.bridgeSession.freezeFrameSnapshot?.triggerDtc === "P0171", "ブリッジ診断取込のbridgeSessionへフリーズフレームを保持できません");
check(bridgeDiagnosticImport.bridgeSession.ecuInfoSnapshot?.itemCount === bridgeEcuInfoSnapshot.itemCount, "ブリッジ診断取込のbridgeSessionへECU情報を保持できません");
check(bridgeDiagnosticImport.bridgeSession.toolHints.join(",") === "Techstream,J2534", "Bridge diagnostic import did not retain toolHints on bridgeSession");
check(bridgeDiagnosticImport.bridgeSession.sourceLength === 128, "Bridge diagnostic import did not retain sourceLength on bridgeSession");
const bridgeDiagnosticImportSessionOnly = obd.buildBridgeDiagnosticImport({
  bridge_session: bridgeDiagnosticImport.bridgeSession
});
check(bridgeDiagnosticImportSessionOnly.supportedPidMatrix?.supportedPids.includes("40"), "Bridge diagnostic import did not rebuild supported_pid_matrix from bridgeSession-only input");
check(bridgeDiagnosticImportSessionOnly.freezeFrameSnapshot?.triggerDtc === "P0171", "Bridge diagnostic import did not rebuild freeze_frame_snapshot from bridgeSession-only input");
check(bridgeDiagnosticImportSessionOnly.ecuInfoSnapshot?.itemCount === bridgeEcuInfoSnapshot.itemCount, "Bridge diagnostic import did not rebuild ecu_info_snapshot from bridgeSession-only input");
check(bridgeDiagnosticImportSessionOnly.monitorValues.length === bridgePidSnapshot.monitorValues.length, "Bridge diagnostic import did not rebuild monitor_values from bridgeSession-only input");
check(bridgeDiagnosticImportSessionOnly.codes.join(",") === "P0171,P0300", "Bridge diagnostic import did not rebuild dtc_codes from bridgeSession-only input");
check(bridgeDiagnosticImportSessionOnly.hadSensitiveIdentifier === true, "Bridge diagnostic import did not rebuild hadSensitiveIdentifier from bridgeSession-only input");
check(bridgeDiagnosticImportSessionOnly.connectionStatus?.vehicleConnected === true, "Bridge diagnostic import did not rebuild connectionStatus from bridgeSession-only input");
check(bridgeDiagnosticImportSessionOnly.adapterIdentity?.adapterFamily === "elm327", "Bridge diagnostic import did not rebuild adapterIdentity from bridgeSession-only input");
check(bridgeDiagnosticImportSessionOnly.warnings.includes("freeze_frame_available"), "Bridge diagnostic import did not rebuild warnings from bridgeSession-only input");
check(bridgeDiagnosticImportSessionOnly.nextReadoutCandidates[0]?.id === bridgeDiagnosticImport.bridgeSession.nextReadoutCandidates[0]?.id, "Bridge diagnostic import did not rebuild nextReadoutCandidates from bridgeSession-only input");
check(bridgeDiagnosticImportSessionOnly.toolHints.join(",") === "Techstream,J2534", "Bridge diagnostic import did not rebuild toolHints from bridgeSession-only input");
check(bridgeDiagnosticImportSessionOnly.sourceLength === 128, "Bridge diagnostic import did not rebuild sourceLength from bridgeSession-only input");
check(bridgeDiagnosticImport.protocol === "ISO15765-4", "ブリッジ診断取込トップレベルへprotocolを引き継げません");
check(bridgeDiagnosticImport.capturedAt === "2026-06-28T00:00:00Z", "ブリッジ診断取込トップレベルへcapturedAtを引き継げません");
check(bridgeDiagnosticImport.exportPayload.schema_version === "bridge_session_export_v1", "ブリッジ診断取込のエクスポート形式が不正です");
check(bridgeDiagnosticImport.hadSensitiveIdentifier === true, "ブリッジ診断取込がECU情報の識別情報検出を保持できません");
check(bridgeDiagnosticImport.bridgeSession.hadSensitiveIdentifier === true, "ブリッジ診断取込のbridgeSessionが識別情報検出を保持できません");
check(bridgeDiagnosticImport.exportPayload.session.tool_hints.join(",") === "Techstream,J2534", "Bridge export payload did not retain tool_hints");
check(bridgeDiagnosticImport.exportPayload.session.source_length === 128, "Bridge export payload did not retain source_length");
check(bridgeDiagnosticImport.exportPayload.session.had_sensitive_identifier === true, "Bridge export payload did not retain had_sensitive_identifier");
const bridgeDiagnosticImportExplicitImportClassification = obd.buildBridgeDiagnosticImport({
  bridge_session: {
    codes: ["P0171"],
    import_classification: {
      schemaVersion: "obd_response_line_classification_v1",
      bucketCounts: { storedDtcResponses: 1 }
    }
  }
});
check(bridgeDiagnosticImportExplicitImportClassification.importClassification?.bucketCounts?.storedDtcResponses === 1, "Bridge diagnostic import did not expose import_classification");
check(bridgeDiagnosticImportExplicitImportClassification.bridgeSession.importClassification?.bucketCounts?.storedDtcResponses === 1, "Bridge diagnostic import did not retain import_classification on bridgeSession");
check(bridgeDiagnosticImportExplicitImportClassification.exportPayload.session.import_classification?.bucketCounts?.storedDtcResponses === 1, "Bridge export payload did not retain import_classification");
const bridgeDiagnosticImportDirectCamelMetadata = obd.buildBridgeDiagnosticImport({
  importClassification: {
    schemaVersion: "obd_response_line_classification_v1",
    bucketCounts: { storedDtcResponses: 5 }
  },
  nextReadoutCandidates: [{ id: "direct_camel_import_snapshot", label: "Direct Camel Import Snapshot", priority: 4, reason: "direct camel import" }],
  toolHints: ["Techstream", "CONSULT"],
  warningFlags: ["negative_obd_response_present", "freeze_frame_available"],
  hadSensitiveIdentifier: true,
  sourceLength: 65,
  dtcSnapshot: bridgeDtcSnapshot
});
check(bridgeDiagnosticImportDirectCamelMetadata.importClassification?.bucketCounts?.storedDtcResponses === 5, "Bridge diagnostic import did not preserve direct camelCase importClassification");
check(bridgeDiagnosticImportDirectCamelMetadata.nextReadoutCandidates[0]?.id === "direct_camel_import_snapshot", "Bridge diagnostic import did not preserve direct camelCase nextReadoutCandidates");
check(bridgeDiagnosticImportDirectCamelMetadata.hadSensitiveIdentifier === true, "Bridge diagnostic import did not preserve direct camelCase hadSensitiveIdentifier");
check(bridgeDiagnosticImportDirectCamelMetadata.sourceLength === 65, "Bridge diagnostic import did not preserve direct camelCase sourceLength");
check(bridgeDiagnosticImportDirectCamelMetadata.toolHints.join(",") === "Techstream,CONSULT", "Bridge diagnostic import did not preserve direct camelCase toolHints");
check(bridgeDiagnosticImportDirectCamelMetadata.warnings.includes("negative_obd_response_present") && bridgeDiagnosticImportDirectCamelMetadata.warnings.includes("freeze_frame_available"), "Bridge diagnostic import did not preserve direct camelCase warningFlags");
const bridgeDiagnosticImportDirectMixedMetadata = obd.buildBridgeDiagnosticImport({
  importClassification: {
    schemaVersion: "obd_response_line_classification_v1",
    bucketCounts: { storedDtcResponses: 7 }
  },
  next_readout_candidates: [{ id: "direct_mixed_import_snapshot", label: "Direct Mixed Import Snapshot", priority: 4, reason: "direct mixed import" }],
  toolHints: ["Techstream"],
  warning_flags: ["negative_obd_response_present"],
  hadSensitiveIdentifier: true,
  source_length: 67,
  dtcSnapshot: bridgeDtcSnapshot
});
check(bridgeDiagnosticImportDirectMixedMetadata.importClassification?.bucketCounts?.storedDtcResponses === 7, "Bridge diagnostic import did not preserve mixed-case direct importClassification");
check(bridgeDiagnosticImportDirectMixedMetadata.nextReadoutCandidates[0]?.id === "direct_mixed_import_snapshot", "Bridge diagnostic import did not preserve mixed-case direct next_readout_candidates");
check(bridgeDiagnosticImportDirectMixedMetadata.hadSensitiveIdentifier === true, "Bridge diagnostic import did not preserve mixed-case direct hadSensitiveIdentifier");
check(bridgeDiagnosticImportDirectMixedMetadata.sourceLength === 67, "Bridge diagnostic import did not preserve mixed-case direct source_length");
check(bridgeDiagnosticImportDirectMixedMetadata.toolHints.join(",") === "Techstream", "Bridge diagnostic import did not preserve mixed-case direct toolHints");
check(bridgeDiagnosticImportDirectMixedMetadata.warnings.includes("negative_obd_response_present"), "Bridge diagnostic import did not preserve mixed-case direct warning_flags");
const bridgeDiagnosticImportDirectMixedVehicleMetadata = obd.buildBridgeDiagnosticImport({
  vehicleProfile: { maker: "Toyota", model: "Mixed Prius" },
  vehicle_applicability: vehicleApplicabilitySample,
  dtcSnapshot: bridgeDtcSnapshot
});
check(bridgeDiagnosticImportDirectMixedVehicleMetadata.vehicleProfile?.model === "Mixed Prius", "Bridge diagnostic import did not preserve mixed-case direct vehicleProfile");
check(bridgeDiagnosticImportDirectMixedVehicleMetadata.vehicleApplicability?.status === "matched", "Bridge diagnostic import did not preserve mixed-case direct vehicle_applicability");
check(bridgeDiagnosticImport.retainedRawText === false, "ブリッジ診断取込が原文保持になっています");
check(bridgeDiagnosticImport.wouldTransmit === false && bridgeDiagnosticImport.vehicleCommandEnabled === false, "ブリッジ診断取込が送信可能扱いになっています");
const bridgeDiagnosticImportAliases = obd.buildBridgeDiagnosticImport({
  captured_at: "2026-06-28T00:09:00Z",
  protocol: "ISO15765-4",
  dtc_codes: ["P0171"],
  monitor_values: [{ id: "engine_speed", label: "Engine RPM", value: 650, unit: "rpm", valueType: "number", decoded: true }],
  monitor_value_summary: { totalCount: 1, decodedCount: 1, undecodedRawCount: 0, numericCount: 1, textCount: 0 },
  monitor_insights: [{ id: "engine_speed_high", severity: "info" }],
  warnings: ["freeze_frame_available", "freeze_frame_available"],
  connection_status: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { status: "ready", is_paired: true, vci_ready: true, car_connected: true }
  },
  vci_list: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { items: [{ deviceId: "summary-import-vci", name: "Summary Import VCI", isConnected: true }], selectedVciId: "summary-import-vci" }
  },
  adapter_identity: bridgeAdapterIdentity,
  supported_pid_snapshot: bridgeSupportedPidSnapshot,
  readiness_response: bridgeReadinessSnapshot,
  ecu_info_response: bridgeEcuInfoSnapshot,
  onboard_monitor_response: bridgeOnboardMonitorSnapshot,
  readout_coverage: bridgeSummary.readoutCoverage,
  freeze_frame_response: bridgeFreezeFrameSnapshot,
  ecu_response_summary: bridgeSummary.ecuResponseSummary,
  next_readout_candidates: explicitNextReadoutCandidatesSample
});
const bridgeDiagnosticImportExplicitUnsortedCandidates = obd.buildBridgeDiagnosticImport({
  dtc_codes: ["P0171"],
  next_readout_candidates: explicitNextReadoutCandidatesUnsortedSample
});
check(bridgeDiagnosticImportAliases.capturedAt === "2026-06-28T00:09:00Z", "Bridge diagnostic import did not accept captured_at summary alias input");
check(bridgeDiagnosticImportAliases.codes[0] === "P0171", "Bridge diagnostic import did not accept dtc_codes summary alias input");
check(bridgeDiagnosticImportAliases.monitorValues[0]?.id === "engine_speed", "Bridge diagnostic import did not accept monitor_values summary alias input");
check(bridgeDiagnosticImportAliases.monitorInsights[0]?.id === "engine_speed_high", "Bridge diagnostic import did not accept monitor_insights summary alias input");
check(bridgeDiagnosticImportAliases.exportPayload.session.monitor_value_summary.totalCount === 1, "Bridge diagnostic import did not accept monitor_value_summary summary alias input");
check(bridgeDiagnosticImportAliases.bridgeSession.warnings.length === 1 && bridgeDiagnosticImportAliases.bridgeSession.warnings[0] === "freeze_frame_available", "Bridge diagnostic import did not deduplicate warnings summary alias input");
check(bridgeDiagnosticImportAliases.bridgeSession.connectionStatus.paired === true && bridgeDiagnosticImportAliases.bridgeSession.connectionStatus.vehicleConnected === true, "Bridge diagnostic import did not normalize connection_status summary alias input");
check(bridgeDiagnosticImportAliases.bridgeSession.adapterIdentity.adapterFamily === "elm327", "Bridge diagnostic import did not accept adapter_identity summary alias input");
check(bridgeDiagnosticImportAliases.supportedPidMatrix.supportedPids.includes("40"), "Bridge diagnostic import did not accept supported_pid_snapshot summary alias input");
check(bridgeDiagnosticImportAliases.freezeFrameSnapshot.triggerDtc === "P0171", "Bridge diagnostic import did not accept freeze_frame_response summary alias input");
check(bridgeDiagnosticImportAliases.connectionStatus.vehicleConnected === true, "Bridge diagnostic import did not expose top-level connection_status summary alias input");
check(bridgeDiagnosticImportAliases.vciDevices[0]?.id === "summary-import-vci", "Bridge diagnostic import did not expose top-level vci_list summary alias input");
check(bridgeDiagnosticImportAliases.adapterIdentity.adapterFamily === "elm327", "Bridge diagnostic import did not expose top-level adapter_identity summary alias input");
check(bridgeDiagnosticImportAliases.warnings.length === 1 && bridgeDiagnosticImportAliases.warnings[0] === "freeze_frame_available", "Bridge diagnostic import did not expose deduplicated top-level warnings");
check(bridgeDiagnosticImportAliases.nextReadoutCandidates[0]?.id === "custom_snapshot", "Bridge diagnostic import did not preserve explicit next_readout_candidates summary alias input");
check(bridgeDiagnosticImportAliases.bridgeSession.vciDevices[0]?.id === "summary-import-vci", "Bridge diagnostic import did not accept vci_list summary alias input");
check(bridgeDiagnosticImportAliases.bridgeSession.nextReadoutCandidates[0]?.id === "custom_snapshot", "Bridge diagnostic import did not preserve explicit next_readout_candidates on bridgeSession");
check(bridgeDiagnosticImportExplicitUnsortedCandidates.nextReadoutCandidates[0]?.id === "dtc_snapshot", "Bridge diagnostic import did not sort explicit next_readout_candidates by priority");
check(bridgeDiagnosticImportAliases.readinessSnapshot.incompleteCount === 1, "Bridge diagnostic import did not accept readiness_response summary alias input");
check(bridgeDiagnosticImportAliases.ecuInfoSnapshot.itemCount === bridgeEcuInfoSnapshot.itemCount, "Bridge diagnostic import did not accept ecu_info_response summary alias input");
check(bridgeDiagnosticImportAliases.onboardMonitorSnapshot.failedCount === 1, "Bridge diagnostic import did not accept onboard_monitor_response summary alias input");
const bridgeDiagnosticImportAliasesDerivedCoverage = obd.buildBridgeDiagnosticImport({
  captured_at: "2026-06-28T00:09:30Z",
  dtc_codes: ["P0171"],
  monitor_values: [{ id: "engine_speed", label: "Engine RPM", value: 650, unit: "rpm", valueType: "number", decoded: true }],
  connection_status: bridgeStatus,
  vci_list: bridgeVciList,
  adapter_identity: bridgeAdapterIdentity,
  supported_pid_snapshot: bridgeSupportedPidSnapshot,
  readiness_response: bridgeReadinessSnapshot,
  ecu_info_response: bridgeEcuInfoSnapshot,
  onboard_monitor_response: bridgeOnboardMonitorSnapshot,
  freeze_frame_response: bridgeFreezeFrameSnapshot
});
check(bridgeDiagnosticImportAliasesDerivedCoverage.readoutCoverage.progressPercent >= 80, "Bridge diagnostic import did not derive readout coverage from summary alias snapshots");
check(bridgeDiagnosticImportAliasesDerivedCoverage.warnings.includes("freeze_frame_available"), "Bridge diagnostic import did not derive warnings from summary alias snapshots");
const bridgeDiagnosticImportSummaryOnlyRawWarning = obd.buildBridgeDiagnosticImport({
  dtc_codes: ["P0171"],
  monitor_value_summary: { totalCount: 2, decodedCount: 0, undecodedRawCount: 2, numericCount: 2, textCount: 0 },
  connection_status: bridgeStatus,
  vci_list: bridgeVciList,
  adapter_identity: bridgeAdapterIdentity
});
check(bridgeDiagnosticImportSummaryOnlyRawWarning.monitorValueSummary.undecodedRawCount === 2, "Bridge diagnostic import did not retain monitor_value_summary without monitor_values");
check(bridgeDiagnosticImportSummaryOnlyRawWarning.warnings.includes("raw_pid_values_need_conversion"), "Bridge diagnostic import did not derive raw PID warning from monitor_value_summary-only input");
const legacyReadoutCoverage = {
  schemaVersion: "readout_coverage_v1",
  includeInfrastructure: false,
  totalCategories: 7,
  availableCategories: 7,
  capturedCategories: 2,
  emptyCategories: 5,
  missingCategories: 0
};
const bridgeDiagnosticImportLegacyCoverage = obd.buildBridgeDiagnosticImport({
  dtc_codes: ["P0300"],
  readout_coverage: legacyReadoutCoverage
});
check(bridgeDiagnosticImportLegacyCoverage.readoutCoverage.capturedPercent === 29, "Bridge diagnostic import did not backfill capturedPercent for legacy readout coverage");
const bridgeDiagnosticImportNonInfrastructureAliases = obd.buildBridgeDiagnosticImport({
  dtc_codes: ["P0300"],
  supported_pid_snapshot: bridgeSupportedPidSnapshot
});
check(bridgeDiagnosticImportNonInfrastructureAliases.readoutCoverage.includeInfrastructure === false, "Bridge diagnostic import incorrectly counted bridge infrastructure for summary-only alias input");
check(bridgeDiagnosticImportNonInfrastructureAliases.readoutCoverage.capturedPercent === 29, "Bridge diagnostic import did not preserve capturedPercent for summary-only alias input");
check(!bridgeDiagnosticImportNonInfrastructureAliases.warnings.includes("bridge_readout_incomplete") && !bridgeDiagnosticImportNonInfrastructureAliases.warnings.includes("bridge_readout_empty_sections"), "Bridge diagnostic import emitted bridge readout warnings without bridge infrastructure context");
check(!bridgeDiagnosticImportNonInfrastructureAliases.warnings.includes("local_bridge_disabled"), "Bridge diagnostic import emitted local_bridge_disabled without bridge context");
check(!bridgeDiagnosticImportNonInfrastructureAliases.warnings.includes("mode09_supported_types_unknown"), "Bridge diagnostic import emitted mode09_supported_types_unknown without ECU info input");
check(bridgeDiagnosticImportNonInfrastructureAliases.exportPayload.session.readout_coverage.includeInfrastructure === false, "Bridge diagnostic export payload did not preserve non-infrastructure readout coverage");
const bridgeExportNestedSessionAliases = obd.buildBridgeSessionExportPayload({
  session: bridgeExportPayload.session,
  exported_at: "2026-06-28T00:10:00Z"
});
check(bridgeExportNestedSessionAliases.exported_at === "2026-06-28T00:10:00Z", "Bridge export did not accept nested session alias input");
check(bridgeExportNestedSessionAliases.session.adapter_identity.adapterFamily === "elm327", "Bridge export did not carry adapter_identity from nested session alias input");
check(bridgeExportNestedSessionAliases.session.vci_devices[0]?.id === bridgeExportPayload.session.vci_devices[0]?.id, "Bridge export did not carry vci_devices from nested session alias input");
check(bridgeExportNestedSessionAliases.session.connection_status?.vehicleConnected === bridgeExportPayload.session.connection_status?.vehicleConnected, "Bridge export did not carry connection_status from nested session alias input");
check(bridgeExportNestedSessionAliases.session.vehicle_applicability?.status === bridgeExportPayload.session.vehicle_applicability?.status, "Bridge export did not carry vehicle_applicability from nested session alias input");
check(bridgeExportNestedSessionAliases.session.readout_coverage?.progressPercent === bridgeExportPayload.session.readout_coverage?.progressPercent, "Bridge export did not carry readout_coverage from nested session alias input");
check(bridgeExportNestedSessionAliases.session.ecu_info_snapshot?.itemCount === bridgeExportPayload.session.ecu_info_snapshot?.itemCount, "Bridge export did not carry ecu_info_snapshot from nested session alias input");
check(bridgeExportNestedSessionAliases.session.warnings.includes("freeze_frame_available"), "Bridge export did not carry warnings from nested session alias input");
check(bridgeExportNestedSessionAliases.session.next_readout_candidates[0]?.id === bridgeExportPayload.session.next_readout_candidates[0]?.id, "Bridge export did not carry next_readout_candidates from nested session alias input");
check(bridgeExportNestedSessionAliases.session.tool_hints.join(",") === "Techstream,J2534", "Bridge export did not carry tool_hints from nested session alias input");
check(bridgeExportNestedSessionAliases.session.source_length === 128, "Bridge export did not carry source_length from nested session alias input");
const bridgeExportNestedCamelSessionAliases = obd.buildBridgeSessionExportPayload({
  session: {
    ...bridgeExportPayload.session,
    sessionId: "bridge-export-camel-nested",
    startedAt: "2026-06-28T00:10:30Z",
    endedAt: "2026-06-28T00:11:30Z",
    capturedAt: "2026-06-28T00:10:45Z"
  },
  exportedAt: "2026-06-28T00:10:59Z"
});
check(bridgeExportNestedCamelSessionAliases.exported_at === "2026-06-28T00:10:59Z", "Bridge export did not accept exportedAt camelCase input for nested session alias");
check(bridgeExportNestedCamelSessionAliases.session.started_at === "2026-06-28T00:10:30Z" && bridgeExportNestedCamelSessionAliases.session.ended_at === "2026-06-28T00:11:30Z", "Bridge export did not accept camelCase nested session timestamps");
check(bridgeExportNestedCamelSessionAliases.session.captured_at === "2026-06-28T00:10:45Z", "Bridge export did not accept camelCase nested session capturedAt");
const bridgeExportNestedSessionResponseAliases = obd.buildBridgeSessionExportPayload({
  session: {
    live_pid_response: { raw: "41 0C 1A F8 41 05 7B" },
    ecu_response_summary_response: bridgeSummary.ecuResponseSummary,
    connection_status_response: {
      ok: true,
      blocked: false,
      would_transmit: false,
      data: { status: "ready", is_paired: true, vci_ready: true, car_connected: true }
    },
    list_vci_response: {
      ok: true,
      blocked: false,
      would_transmit: false,
      data: { items: [{ deviceId: "export-response-vci", name: "Export Response VCI", isConnected: true }], selectedVciId: "export-response-vci" }
    },
    adapter_identity_response: {
      ok: true,
      blocked: false,
      would_transmit: false,
      data: { adapter: "Export Response Adapter", family: "stn", version: "7.1" }
    }
  }
});
check(bridgeExportNestedSessionResponseAliases.session.monitor_values.find((item) => item.id === "engine_speed")?.value === 1726, "Bridge export did not decode live_pid_response from nested session alias input");
check(bridgeExportNestedSessionResponseAliases.session.ecu_response_summary?.schemaVersion === bridgeSummary.ecuResponseSummary.schemaVersion, "Bridge export did not accept ecu_response_summary_response from nested session alias input");
check(bridgeExportNestedSessionResponseAliases.session.connection_status?.vehicleConnected === true, "Bridge export did not accept connection_status_response from nested session alias input");
check(bridgeExportNestedSessionResponseAliases.session.vci_devices[0]?.id === "export-response-vci", "Bridge export did not accept list_vci_response from nested session alias input");
check(bridgeExportNestedSessionResponseAliases.session.adapter_identity?.adapterFamily === "stn", "Bridge export did not accept adapter_identity_response from nested session alias input");
const outerOverrideEcuInfoSnapshot = {
  ...bridgeEcuInfoSnapshot,
  itemCount: 1,
  items: [
    { id: "ecu_name", type: "0A", value: "Outer Override ECU", label: "ECU Name" }
  ]
};
const outerOverrideFreezeFrameSnapshot = {
  ...bridgeFreezeFrameSnapshot,
  triggerDtc: "P0420",
  dtcCode: "P0420"
};
const outerOverrideReadinessSnapshot = {
  ...bridgeReadinessSnapshot,
  incompleteCount: 0,
  completedCount: bridgeReadinessSnapshot.monitorCount || bridgeReadinessSnapshot.completedCount || 0,
  monitors: Array.isArray(bridgeReadinessSnapshot.monitors)
    ? bridgeReadinessSnapshot.monitors.map((item) => ({ ...item, complete: true, status: "complete" }))
    : []
};
const outerOverrideSupportedPidSnapshot = {
  ...bridgeSupportedPidSnapshot,
  supportedPids: ["0C", "0D"],
  supportedCount: 2
};
const bridgeExportNestedOuterOverride = obd.buildBridgeSessionExportPayload({
  captured_at: "2026-06-28T00:10:15Z",
  vehicle_profile: { maker: "Toyota", model: "Outer Roomy" },
  vehicle_applicability: vehicleApplicabilityPartialSample,
  connection_status: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { status: "ready", is_paired: false, vci_ready: true, car_connected: false }
  },
  readout_coverage: legacyReadoutCoverage,
  next_readout_candidates: [{ id: "custom_outer_snapshot", label: "Outer Snapshot", priority: 1, reason: "outer override" }],
  ecu_info_snapshot: outerOverrideEcuInfoSnapshot,
  session: bridgeExportPayload.session
});
check(bridgeExportNestedOuterOverride.session.captured_at === "2026-06-28T00:10:15Z", "Bridge export did not let outer captured_at override nested session alias input");
check(bridgeExportNestedOuterOverride.session.vehicle_profile?.model === "Outer Roomy", "Bridge export did not let outer vehicle_profile override nested session alias input");
check(bridgeExportNestedOuterOverride.session.vehicle_applicability?.status === "partial", "Bridge export did not let outer vehicle_applicability override nested session alias input");
check(bridgeExportNestedOuterOverride.session.connection_status?.vehicleConnected === false, "Bridge export did not let outer connection_status override nested session alias input");
check(bridgeExportNestedOuterOverride.session.readout_coverage?.capturedPercent === 29, "Bridge export did not let outer readout_coverage override nested session alias input");
check(bridgeExportNestedOuterOverride.session.next_readout_candidates[0]?.id === "custom_outer_snapshot", "Bridge export did not let outer next_readout_candidates override nested session alias input");
check(bridgeExportNestedOuterOverride.session.ecu_info_snapshot?.items?.[0]?.value === "Outer Override ECU", "Bridge export did not let outer ecu_info_snapshot override nested session alias input");
const bridgeExportNestedCamelOuterOverride = obd.buildBridgeSessionExportPayload({
  capturedAt: "2026-06-28T00:10:16Z",
  vehicleProfile: { maker: "Toyota", model: "Outer Roomy Camel" },
  vehicleApplicability: vehicleApplicabilityPartialSample,
  connectionStatus: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { status: "ready", is_paired: false, vci_ready: true, car_connected: false }
  },
  readoutCoverage: legacyReadoutCoverage,
  nextReadoutCandidates: [{ id: "custom_camel_outer_snapshot", label: "Camel Outer Snapshot", priority: 1, reason: "camel outer override" }],
  ecuInfoSnapshot: outerOverrideEcuInfoSnapshot,
  session: bridgeExportPayload.session
});
check(bridgeExportNestedCamelOuterOverride.session.captured_at === "2026-06-28T00:10:16Z", "Bridge export did not let outer capturedAt override nested session alias input");
check(bridgeExportNestedCamelOuterOverride.session.vehicle_profile?.model === "Outer Roomy Camel", "Bridge export did not let outer vehicleProfile override nested session alias input");
check(bridgeExportNestedCamelOuterOverride.session.vehicle_applicability?.status === "partial", "Bridge export did not let outer vehicleApplicability override nested session alias input");
check(bridgeExportNestedCamelOuterOverride.session.connection_status?.vehicleConnected === false, "Bridge export did not let outer connectionStatus override nested session alias input");
check(bridgeExportNestedCamelOuterOverride.session.readout_coverage?.capturedPercent === 29, "Bridge export did not let outer readoutCoverage override nested session alias input");
check(bridgeExportNestedCamelOuterOverride.session.next_readout_candidates[0]?.id === "custom_camel_outer_snapshot", "Bridge export did not let outer nextReadoutCandidates override nested session alias input");
check(bridgeExportNestedCamelOuterOverride.session.ecu_info_snapshot?.items?.[0]?.value === "Outer Override ECU", "Bridge export did not let outer ecuInfoSnapshot override nested session alias input");
const bridgeSummaryNestedSessionAliases = obd.buildBridgeSessionSummary({
  session: bridgeExportPayload.session,
  vehicle_profile: { maker: "Toyota", model: "Nested Prius" }
});
check(bridgeSummaryNestedSessionAliases.adapterIdentity.adapterFamily === "elm327", "Bridge session summary did not accept nested session alias input");
check(bridgeSummaryNestedSessionAliases.vciDevices[0]?.id === bridgeExportPayload.session.vci_devices[0]?.id, "Bridge session summary did not carry vci_devices from nested session alias input");
check(bridgeSummaryNestedSessionAliases.connectionStatus?.vehicleConnected === bridgeExportPayload.session.connection_status?.vehicleConnected, "Bridge session summary did not carry connection_status from nested session alias input");
check(bridgeSummaryNestedSessionAliases.supportedPidMatrix.supportedPids.includes("40"), "Bridge session summary did not carry supported_pid_matrix from nested session alias input");
check(bridgeSummaryNestedSessionAliases.readinessSnapshot.incompleteCount === 1, "Bridge session summary did not carry readiness from nested session alias input");
check(bridgeSummaryNestedSessionAliases.vehicleProfile?.model === "Nested Prius", "Bridge session summary did not allow outer vehicle_profile to override nested session alias input");
check(bridgeSummaryNestedSessionAliases.vehicleApplicability?.status === bridgeExportPayload.session.vehicle_applicability?.status, "Bridge session summary did not carry vehicle_applicability from nested session alias input");
check(bridgeSummaryNestedSessionAliases.readoutCoverage?.progressPercent === bridgeExportPayload.session.readout_coverage?.progressPercent, "Bridge session summary did not carry readout_coverage from nested session alias input");
check(bridgeSummaryNestedSessionAliases.ecuInfoSnapshot?.itemCount === bridgeExportPayload.session.ecu_info_snapshot?.itemCount, "Bridge session summary did not carry ecu_info_snapshot from nested session alias input");
check(bridgeSummaryNestedSessionAliases.warnings.includes("freeze_frame_available"), "Bridge session summary did not carry warnings from nested session alias input");
check(bridgeSummaryNestedSessionAliases.nextReadoutCandidates[0]?.id === bridgeExportPayload.session.next_readout_candidates[0]?.id, "Bridge session summary did not carry next_readout_candidates from nested session alias input");
check(bridgeSummaryNestedSessionAliases.toolHints.join(",") === "Techstream,J2534", "Bridge session summary did not carry tool_hints from nested session alias input");
check(bridgeSummaryNestedSessionAliases.sourceLength === 128, "Bridge session summary did not carry source_length from nested session alias input");
const bridgeSummaryNestedOuterOverride = obd.buildBridgeSessionSummary({
  protocol: "ISO9141-2",
  captured_at: "2026-06-28T00:10:30Z",
  vehicle_profile: { maker: "Toyota", model: "Outer Aqua" },
  vehicle_applicability: vehicleApplicabilityPartialSample,
  connection_status: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { status: "ready", is_paired: false, vci_ready: true, car_connected: false }
  },
  readout_coverage: legacyReadoutCoverage,
  next_readout_candidates: [{ id: "custom_outer_snapshot", label: "Outer Snapshot", priority: 1, reason: "outer override" }],
  ecu_info_snapshot: outerOverrideEcuInfoSnapshot,
  session: bridgeExportPayload.session
});
check(bridgeSummaryNestedOuterOverride.protocol === "ISO9141-2", "Bridge session summary did not let outer protocol override nested session alias input");
check(bridgeSummaryNestedOuterOverride.capturedAt === "2026-06-28T00:10:30Z", "Bridge session summary did not let outer captured_at override nested session alias input");
check(bridgeSummaryNestedOuterOverride.vehicleProfile?.model === "Outer Aqua", "Bridge session summary did not let outer vehicle_profile override nested session alias input");
check(bridgeSummaryNestedOuterOverride.vehicleApplicability?.status === "partial", "Bridge session summary did not let outer vehicle_applicability override nested session alias input");
check(bridgeSummaryNestedOuterOverride.connectionStatus?.vehicleConnected === false, "Bridge session summary did not let outer connection_status override nested session alias input");
check(bridgeSummaryNestedOuterOverride.readoutCoverage?.capturedPercent === 29, "Bridge session summary did not let outer readout_coverage override nested session alias input");
check(bridgeSummaryNestedOuterOverride.nextReadoutCandidates[0]?.id === "custom_outer_snapshot", "Bridge session summary did not let outer next_readout_candidates override nested session alias input");
check(bridgeSummaryNestedOuterOverride.ecuInfoSnapshot?.items?.[0]?.value === "Outer Override ECU", "Bridge session summary did not let outer ecu_info_snapshot override nested session alias input");
const bridgeSummaryNestedCamelOuterOverride = obd.buildBridgeSessionSummary({
  protocol: "ISO9141-2",
  capturedAt: "2026-06-28T00:10:31Z",
  vehicleProfile: { maker: "Toyota", model: "Outer Aqua Camel" },
  vehicleApplicability: vehicleApplicabilityPartialSample,
  connectionStatus: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { status: "ready", is_paired: false, vci_ready: true, car_connected: false }
  },
  readoutCoverage: legacyReadoutCoverage,
  nextReadoutCandidates: [{ id: "custom_camel_outer_snapshot", label: "Camel Outer Snapshot", priority: 1, reason: "camel outer override" }],
  ecuInfoSnapshot: outerOverrideEcuInfoSnapshot,
  session: bridgeExportPayload.session
});
check(bridgeSummaryNestedCamelOuterOverride.protocol === "ISO9141-2", "Bridge session summary did not let outer protocol override nested session alias input for camelCase outer values");
check(bridgeSummaryNestedCamelOuterOverride.capturedAt === "2026-06-28T00:10:31Z", "Bridge session summary did not let outer capturedAt override nested session alias input");
check(bridgeSummaryNestedCamelOuterOverride.vehicleProfile?.model === "Outer Aqua Camel", "Bridge session summary did not let outer vehicleProfile override nested session alias input");
check(bridgeSummaryNestedCamelOuterOverride.vehicleApplicability?.status === "partial", "Bridge session summary did not let outer vehicleApplicability override nested session alias input");
check(bridgeSummaryNestedCamelOuterOverride.connectionStatus?.vehicleConnected === false, "Bridge session summary did not let outer connectionStatus override nested session alias input");
check(bridgeSummaryNestedCamelOuterOverride.readoutCoverage?.capturedPercent === 29, "Bridge session summary did not let outer readoutCoverage override nested session alias input");
check(bridgeSummaryNestedCamelOuterOverride.nextReadoutCandidates[0]?.id === "custom_camel_outer_snapshot", "Bridge session summary did not let outer nextReadoutCandidates override nested session alias input");
check(bridgeSummaryNestedCamelOuterOverride.ecuInfoSnapshot?.items?.[0]?.value === "Outer Override ECU", "Bridge session summary did not let outer ecuInfoSnapshot override nested session alias input");
const bridgeSummaryNestedOuterZeroSourceLengthOverride = obd.buildBridgeSessionSummary({
  source_length: 0,
  session: bridgeExportPayload.session
});
check(bridgeSummaryNestedOuterZeroSourceLengthOverride.sourceLength === 0, "Bridge session summary did not let outer source_length=0 override nested session alias input");
const bridgeDiagnosticImportNestedSessionAliases = obd.buildBridgeDiagnosticImport({
  bridge_session: bridgeDiagnosticImport.bridgeSession,
  monitor_values: bridgeDiagnosticImport.monitorValues,
  monitor_insights: bridgeDiagnosticImport.monitorInsights,
  dtc_codes: bridgeDiagnosticImport.codes,
  protocol: bridgeDiagnosticImport.protocol,
  captured_at: bridgeDiagnosticImport.capturedAt
});
check(bridgeDiagnosticImportNestedSessionAliases.bridgeSession.adapterIdentity.adapterFamily === "elm327", "Bridge diagnostic import did not accept bridge_session nested alias input");
check(bridgeDiagnosticImportNestedSessionAliases.bridgeSession.vciDevices.length === 1, "Bridge diagnostic import did not carry vci devices from bridge_session nested alias input");
check(bridgeDiagnosticImportNestedSessionAliases.codes[0] === "P0171", "Bridge diagnostic import did not retain dtc_codes with bridge_session nested alias input");
check(bridgeDiagnosticImportNestedSessionAliases.warnings.includes("freeze_frame_available"), "Bridge diagnostic import did not retain warnings from bridge_session nested alias input");
const bridgeDiagnosticImportNestedSessionResponseAliases = obd.buildBridgeDiagnosticImport({
  bridge_session: {
    live_pid_response: { raw: "41 0C 1A F8 41 05 7B" },
    ecu_response_summary_response: bridgeSummary.ecuResponseSummary,
    connection_status_response: {
      ok: true,
      blocked: false,
      would_transmit: false,
      data: { status: "ready", is_paired: true, vci_ready: true, car_connected: true }
    },
    list_vci_response: {
      ok: true,
      blocked: false,
      would_transmit: false,
      data: { items: [{ deviceId: "import-response-vci", name: "Import Response VCI", isConnected: true }], selectedVciId: "import-response-vci" }
    },
    adapter_identity_response: {
      ok: true,
      blocked: false,
      would_transmit: false,
      data: { adapter: "Import Response Adapter", family: "stn", version: "7.2" }
    }
  }
});
check(bridgeDiagnosticImportNestedSessionResponseAliases.monitorValues.find((item) => item.id === "engine_speed")?.value === 1726, "Bridge diagnostic import did not decode live_pid_response from bridge_session nested alias input");
check(bridgeDiagnosticImportNestedSessionResponseAliases.ecuResponseSummary?.schemaVersion === bridgeSummary.ecuResponseSummary.schemaVersion, "Bridge diagnostic import did not accept ecu_response_summary_response from bridge_session nested alias input");
check(bridgeDiagnosticImportNestedSessionResponseAliases.connectionStatus?.vehicleConnected === true, "Bridge diagnostic import did not accept connection_status_response from bridge_session nested alias input");
check(bridgeDiagnosticImportNestedSessionResponseAliases.vciDevices[0]?.id === "import-response-vci", "Bridge diagnostic import did not accept list_vci_response from bridge_session nested alias input");
check(bridgeDiagnosticImportNestedSessionResponseAliases.adapterIdentity?.adapterFamily === "stn", "Bridge diagnostic import did not accept adapter_identity_response from bridge_session nested alias input");
const bridgeDiagnosticImportNestedOuterOverride = obd.buildBridgeDiagnosticImport({
  protocol: "ISO9141-2",
  captured_at: "2026-06-28T00:10:45Z",
  vehicle_profile: { maker: "Toyota", model: "Outer Prius C" },
  vehicle_applicability: vehicleApplicabilityPartialSample,
  connection_status: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { status: "ready", is_paired: false, vci_ready: true, car_connected: false }
  },
  readout_coverage: legacyReadoutCoverage,
  next_readout_candidates: [{ id: "custom_outer_snapshot", label: "Outer Snapshot", priority: 1, reason: "outer override" }],
  ecu_info_snapshot: outerOverrideEcuInfoSnapshot,
  session: bridgeExportPayload.session
});
check(bridgeDiagnosticImportNestedOuterOverride.protocol === "ISO9141-2", "Bridge diagnostic import did not let outer protocol override nested session alias input");
check(bridgeDiagnosticImportNestedOuterOverride.capturedAt === "2026-06-28T00:10:45Z", "Bridge diagnostic import did not let outer captured_at override nested session alias input");
check(bridgeDiagnosticImportNestedOuterOverride.exportPayload.session.vehicle_profile?.model === "Outer Prius C", "Bridge diagnostic import did not let outer vehicle_profile override nested session alias input");
check(bridgeDiagnosticImportNestedOuterOverride.vehicleApplicability?.status === "partial", "Bridge diagnostic import did not let outer vehicle_applicability override nested session alias input");
check(bridgeDiagnosticImportNestedOuterOverride.connectionStatus?.vehicleConnected === false, "Bridge diagnostic import did not let outer connection_status override nested session alias input");
check(bridgeDiagnosticImportNestedOuterOverride.readoutCoverage?.capturedPercent === 29, "Bridge diagnostic import did not let outer readout_coverage override nested session alias input");
check(bridgeDiagnosticImportNestedOuterOverride.nextReadoutCandidates[0]?.id === "custom_outer_snapshot", "Bridge diagnostic import did not let outer next_readout_candidates override nested session alias input");
check(bridgeDiagnosticImportNestedOuterOverride.ecuInfoSnapshot?.items?.[0]?.value === "Outer Override ECU", "Bridge diagnostic import did not let outer ecu_info_snapshot override nested session alias input");
const bridgeDiagnosticImportNestedCamelOuterOverride = obd.buildBridgeDiagnosticImport({
  protocol: "ISO9141-2",
  capturedAt: "2026-06-28T00:10:46Z",
  vehicleProfile: { maker: "Toyota", model: "Outer Prius C Camel" },
  vehicleApplicability: vehicleApplicabilityPartialSample,
  connectionStatus: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { status: "ready", is_paired: false, vci_ready: true, car_connected: false }
  },
  readoutCoverage: legacyReadoutCoverage,
  nextReadoutCandidates: [{ id: "custom_camel_outer_snapshot", label: "Camel Outer Snapshot", priority: 1, reason: "camel outer override" }],
  ecuInfoSnapshot: outerOverrideEcuInfoSnapshot,
  session: bridgeExportPayload.session
});
check(bridgeDiagnosticImportNestedCamelOuterOverride.protocol === "ISO9141-2", "Bridge diagnostic import did not let outer protocol override nested session alias input for camelCase outer values");
check(bridgeDiagnosticImportNestedCamelOuterOverride.capturedAt === "2026-06-28T00:10:46Z", "Bridge diagnostic import did not let outer capturedAt override nested session alias input");
check(bridgeDiagnosticImportNestedCamelOuterOverride.exportPayload.session.vehicle_profile?.model === "Outer Prius C Camel", "Bridge diagnostic import did not let outer vehicleProfile override nested session alias input");
check(bridgeDiagnosticImportNestedCamelOuterOverride.vehicleApplicability?.status === "partial", "Bridge diagnostic import did not let outer vehicleApplicability override nested session alias input");
check(bridgeDiagnosticImportNestedCamelOuterOverride.connectionStatus?.vehicleConnected === false, "Bridge diagnostic import did not let outer connectionStatus override nested session alias input");
check(bridgeDiagnosticImportNestedCamelOuterOverride.readoutCoverage?.capturedPercent === 29, "Bridge diagnostic import did not let outer readoutCoverage override nested session alias input");
check(bridgeDiagnosticImportNestedCamelOuterOverride.nextReadoutCandidates[0]?.id === "custom_camel_outer_snapshot", "Bridge diagnostic import did not let outer nextReadoutCandidates override nested session alias input");
check(bridgeDiagnosticImportNestedCamelOuterOverride.ecuInfoSnapshot?.items?.[0]?.value === "Outer Override ECU", "Bridge diagnostic import did not let outer ecuInfoSnapshot override nested session alias input");
const mergedDiagnosticInput = obd.mergeDiagnosticInputs({
  scannerText: [
    "P0171 JTDKN3DU0A0123456",
    "Engine RPM: 650 rpm",
    "Control Module Voltage: 12.1 V"
  ].join("\n"),
  bridgeImport: bridgeDiagnosticImport
});
check(mergedDiagnosticInput.importType === "combined_diagnostic_inputs", "統合診断入力の種別が不正です");
check(mergedDiagnosticInput.source === "scanner_text_and_local_bridge", "統合診断入力のsourceが貼り付け+ブリッジになっていません");
check(mergedDiagnosticInput.codes.join(",") === "P0171,P0300", "統合診断入力でDTCを重複除外できません");
check(mergedDiagnosticInput.monitorValues.find((item) => item.id === "engine_speed")?.source === "local_bridge", "統合診断入力でブリッジ値を優先できません");
check(mergedDiagnosticInput.monitorValues.find((item) => item.id === "control_module_voltage")?.source === "scanner_text", "統合診断入力で貼り付け値を保持できません");
check(mergedDiagnosticInput.monitorInsights.length > 0, "統合診断入力の相関ヒントがありません");
check(mergedDiagnosticInput.bridgeSession.vciDevices.length === 1, "統合診断入力にブリッジセッションがありません");
check(mergedDiagnosticInput.bridgeExportPayload.schema_version === "bridge_session_export_v1", "統合診断入力にブリッジエクスポートがありません");
check(mergedDiagnosticInput.startedAt === "2026-06-28T00:05:00Z" && mergedDiagnosticInput.endedAt === "2026-06-28T00:06:00Z", "統合診断入力へ開始時刻と終了時刻を引き継げません");
check(mergedDiagnosticInput.protocol === "ISO15765-4", "統合診断入力へprotocolを引き継げません");
check(mergedDiagnosticInput.capturedAt === "2026-06-28T00:00:00Z", "統合診断入力へcapturedAtを引き継げません");
check(mergedDiagnosticInput.warnings.includes("freeze_frame_available"), "統合診断入力へブリッジ警告を引き継げません");
check(mergedDiagnosticInput.monitorValueSummary.totalCount >= 4, "統合診断入力へ値要約を引き継げません");
check(mergedDiagnosticInput.ecuResponseSummary?.ecus[0]?.dtcCount === 1, "統合診断入力へECU応答サマリーを引き継げません");
check(mergedDiagnosticInput.supportedPidMatrix?.supportedPids.includes("05"), "統合診断入力へ対応PIDを引き継げません");
check(mergedDiagnosticInput.readoutCoverage?.progressPercent >= 80, "統合診断入力へ読取カバレッジを引き継げません");
check(mergedDiagnosticInput.readinessSnapshot?.incompleteCount === 1, "統合診断入力へレディネスを引き継げません");
check(mergedDiagnosticInput.freezeFrameSnapshot?.triggerDtc === "P0171", "統合診断入力へフリーズフレームを引き継げません");
check(mergedDiagnosticInput.vehicleProfile?.model === "Prius", "統合診断入力へ車両プロフィールを引き継げません");
check(mergedDiagnosticInput.vehicleApplicability?.status === "matched", "統合診断入力へvehicleApplicabilityを引き継げません");
check(mergedDiagnosticInput.connectionStatus?.displayStatus === "読取準備モデル", "統合診断入力へ接続状態を引き継げません");
check(mergedDiagnosticInput.vciDevices.length === 1, "統合診断入力へVCI一覧を引き継げません");
check(mergedDiagnosticInput.adapterIdentity?.adapterFamily === "elm327", "統合診断入力へアダプター情報を引き継げません");
check(mergedDiagnosticInput.hadSensitiveIdentifier === true, "統合診断入力が貼り付け側の識別情報候補を引き継げません");
check(mergedDiagnosticInput.retainedRawText === false, "統合診断入力が原文保持になっています");
check(mergedDiagnosticInput.wouldTransmit === false && mergedDiagnosticInput.vehicleCommandEnabled === false, "統合診断入力が送信可能扱いになっています");
check(mergedDiagnosticInput.toolHints.join(",") === "Techstream,J2534", "Combined diagnostic inputs did not retain bridge tool hints");
check(mergedDiagnosticInput.sourceLength === 128, "Combined diagnostic inputs did not retain bridge sourceLength");
const mergedDiagnosticInputAliases = obd.mergeDiagnosticInputs({
  scanner_text: [
    "Toyota Techstream J2534",
    "P0171 JTDKN3DU0A0123456",
    "Engine RPM: 650 rpm"
  ].join("\n"),
  bridge_diagnostic_import: bridgeDiagnosticImport
});
check(mergedDiagnosticInputAliases.codes.includes("P0171"), "Combined diagnostic inputs did not accept scanner_text alias input");
check(mergedDiagnosticInputAliases.toolHints.join(",") === "Techstream,J2534", "Combined diagnostic inputs did not retain scanner tool hints");
check(mergedDiagnosticInputAliases.connectionStatus?.vehicleConnected === true, "Combined diagnostic inputs did not retain top-level connection status from bridge_diagnostic_import alias input");
check(mergedDiagnosticInputAliases.vciDevices[0]?.id === "vci-1", "Combined diagnostic inputs did not retain top-level vci devices from bridge_diagnostic_import alias input");
check(mergedDiagnosticInputAliases.adapterIdentity?.adapterFamily === "elm327", "Combined diagnostic inputs did not retain top-level adapter identity from bridge_diagnostic_import alias input");
check(mergedDiagnosticInputAliases.bridgeSession?.adapterIdentity?.adapterFamily === "elm327", "Combined diagnostic inputs did not accept bridge_diagnostic_import alias input");
check(mergedDiagnosticInputAliases.monitorInsights.length > 0, "Combined diagnostic inputs did not rebuild monitor insights from bridge_import alias input");
check(mergedDiagnosticInputAliases.bridgeExportPayload?.schema_version === "bridge_session_export_v1", "Combined diagnostic inputs did not rebuild export payload from bridge_diagnostic_import alias input");
check(mergedDiagnosticInputAliases.bridgeSession?.supportedPidMatrix?.supportedPids.includes("40"), "Combined diagnostic inputs did not retain bridgeSession snapshots from bridge_diagnostic_import alias input");
const mergedDiagnosticInputCamelMetadataAliases = obd.mergeDiagnosticInputs({
  scanner_text: "P0171",
  bridge_import: {
    toolHints: ["CONSULT"],
    warningFlags: ["negative_obd_response_present"],
    sourceLength: 21,
    hadSensitiveIdentifier: true,
    importClassification: {
      schemaVersion: "obd_response_line_classification_v1",
      bucketCounts: { storedDtcResponses: 6 }
    },
    bridgeSession: {
      toolHints: ["Techstream"],
      warningFlags: ["freeze_frame_available"],
      sourceLength: 12,
      hadSensitiveIdentifier: false
    }
  }
});
check(mergedDiagnosticInputCamelMetadataAliases.toolHints.includes("CONSULT") && mergedDiagnosticInputCamelMetadataAliases.toolHints.includes("Techstream"), "Combined diagnostic inputs did not merge camelCase toolHints metadata");
check(mergedDiagnosticInputCamelMetadataAliases.warnings.includes("negative_obd_response_present") && mergedDiagnosticInputCamelMetadataAliases.warnings.includes("freeze_frame_available"), "Combined diagnostic inputs did not merge camelCase warningFlags metadata");
check(mergedDiagnosticInputCamelMetadataAliases.sourceLength === 21, "Combined diagnostic inputs did not preserve camelCase sourceLength metadata");
check(mergedDiagnosticInputCamelMetadataAliases.hadSensitiveIdentifier === true, "Combined diagnostic inputs did not preserve camelCase hadSensitiveIdentifier metadata");
check(mergedDiagnosticInputCamelMetadataAliases.importClassification?.bucketCounts?.storedDtcResponses === 6, "Combined diagnostic inputs did not preserve camelCase importClassification metadata");
const mergedDiagnosticInputRawBridgePreference = obd.mergeDiagnosticInputs({
  scanner_text: "Engine RPM: 650 rpm",
  bridge_diagnostic_import: {
    importType: "bridge_diagnostic_snapshot",
    monitorValues: [
      { id: "engine_speed", value: "01 90", valueType: "raw_hex", decoded: false, pid: "0C" }
    ]
  }
});
check(mergedDiagnosticInputRawBridgePreference.monitorValues.find((item) => item.id === "engine_speed")?.source === "scanner_text", "Combined diagnostic inputs did not keep scanner value over undecoded bridge raw value");
check(mergedDiagnosticInputRawBridgePreference.monitorValues.find((item) => item.id === "engine_speed")?.value === 650, "Combined diagnostic inputs did not keep parsed scanner value over undecoded bridge raw value");
const mergedDiagnosticInputDecodedBridgePreference = obd.mergeDiagnosticInputs({
  scanner_text: "Engine RPM: 650 rpm",
  bridge_diagnostic_import: {
    importType: "bridge_diagnostic_snapshot",
    monitorValues: [
      { id: "engine_speed", value: 805, valueType: "number", pid: "0C", service: "01", decoded: true }
    ]
  }
});
check(mergedDiagnosticInputDecodedBridgePreference.monitorValues.find((item) => item.id === "engine_speed")?.source === "local_bridge", "Combined diagnostic inputs did not keep decoded bridge value over scanner value");
check(mergedDiagnosticInputDecodedBridgePreference.monitorValues.find((item) => item.id === "engine_speed")?.value === 805, "Combined diagnostic inputs did not keep decoded bridge value over scanner value");
const mergedDiagnosticInputExplicitInsights = obd.mergeDiagnosticInputs({
  scanner_text: "P0171",
  bridge_diagnostic_import: bridgeDiagnosticImportAliases
});
check(mergedDiagnosticInputExplicitInsights.monitorInsights.some((item) => item.id === "engine_speed_high"), "Combined diagnostic inputs did not retain explicit bridge_import monitor insights");
const mergedDiagnosticInputExportPayload = obd.mergeDiagnosticInputs({
  scanner_text: "P0171",
  bridge_import: bridgeExportPayload
});
check(mergedDiagnosticInputExportPayload.source === "scanner_text_and_local_bridge", "Combined diagnostic inputs did not keep mixed source for bridge_session_export_v1 bridge_import input");
check(mergedDiagnosticInputExportPayload.bridgeSession?.adapterIdentity?.adapterFamily === "elm327", "Combined diagnostic inputs did not accept bridge_session_export_v1 bridge_import input");
check(mergedDiagnosticInputExportPayload.vciDevices.length === 1, "Combined diagnostic inputs did not carry vci devices from bridge_session_export_v1 bridge_import input");
check(mergedDiagnosticInputExportPayload.warnings.includes("freeze_frame_available"), "Combined diagnostic inputs did not carry warnings from bridge_session_export_v1 bridge_import input");
check(mergedDiagnosticInputExportPayload.nextReadoutCandidates[0]?.id === bridgeExportPayload.session.next_readout_candidates[0]?.id, "Combined diagnostic inputs did not carry next_readout_candidates from bridge_session_export_v1 bridge_import input");
check(mergedDiagnosticInputExportPayload.coreSessionStatus?.stage === "diagnostic_core" && Number(mergedDiagnosticInputExportPayload.coreSessionStatus?.completionPercent) > 0, "Combined diagnostic inputs did not expose coreSessionStatus for bridge_session_export_v1 bridge_import input");
check(mergedDiagnosticInputExportPayload.diagnosticFlowSummary?.schemaVersion === "diagnostic_flow_summary_v1", "Combined diagnostic inputs did not expose diagnosticFlowSummary for bridge_session_export_v1 bridge_import input");
check(mergedDiagnosticInputExportPayload.diagnosticFlowSummary?.stage === "diagnostic_core", "Combined diagnostic inputs did not expose diagnosticFlowSummary stage for bridge_session_export_v1 bridge_import input");
check(mergedDiagnosticInputExportPayload.readoutCompletionSummary?.capturedIds?.includes("dtc_snapshot"), "Combined diagnostic inputs did not expose top-level readout completion captured ids for bridge_session_export_v1 bridge_import input");
check(Array.isArray(mergedDiagnosticInputExportPayload.readoutCompletionSummary?.pendingIds), "Combined diagnostic inputs did not expose top-level readout completion pending ids for bridge_session_export_v1 bridge_import input");
check(mergedDiagnosticInputExportPayload.analysisReadinessSummary?.ready === mergedDiagnosticInputExportPayload.coreSessionStatus?.analysisReadinessSummary?.ready, "Combined diagnostic inputs did not expose top-level analysis readiness summary");
check(mergedDiagnosticInputExportPayload.readoutRequestPlanGateSummary?.state === mergedDiagnosticInputExportPayload.coreSessionStatus?.readoutRequestPlanGateSummary?.state, "Combined diagnostic inputs did not expose top-level readout request plan gate summary");
check(mergedDiagnosticInputExportPayload.importedCoreSessionStatus?.schemaVersion === "core_session_status_v1", "Combined diagnostic inputs did not preserve imported core session status for bridge_session_export_v1 bridge_import input");
check(mergedDiagnosticInputExportPayload.importedReadoutRequestPlanGateSummary?.state === bridgeExportPayload.session.readout_request_plan_gate_summary?.state, "Combined diagnostic inputs did not preserve imported readout request plan gate summary");
check(mergedDiagnosticInputExportPayload.importedDiagnosticFlowSummary?.schemaVersion === "diagnostic_flow_summary_v1", "Combined diagnostic inputs did not preserve imported diagnostic flow summary for bridge_session_export_v1 bridge_import input");
check(mergedDiagnosticInputExportPayload.importedReadoutCompletionSummary?.capturedIds?.includes("dtc_snapshot"), "Combined diagnostic inputs did not preserve imported readout completion summary for bridge_session_export_v1 bridge_import input");
check(mergedDiagnosticInputExportPayload.importedAnalysisReadinessSummary?.ready === bridgeExportPayload.session.analysis_readiness_summary?.ready, "Combined diagnostic inputs did not preserve imported analysis readiness summary for bridge_session_export_v1 bridge_import input");
check(mergedDiagnosticInputExportPayload.importedCoreComparisonSummary?.schemaVersion === "imported_core_comparison_v1", "Combined diagnostic inputs did not compare imported and recalculated core session status");
check(Number.isFinite(mergedDiagnosticInputExportPayload.importedCoreComparisonSummary?.completionDelta), "Combined diagnostic inputs did not expose imported core completion delta");
check(Number.isFinite(mergedDiagnosticInputExportPayload.importedCoreComparisonSummary?.missingReadoutDelta), "Combined diagnostic inputs did not expose imported core readout count delta");
check(Number.isFinite(mergedDiagnosticInputExportPayload.importedCoreComparisonSummary?.blockerCountDelta), "Combined diagnostic inputs did not expose imported core blocker count delta");
check(Number.isFinite(mergedDiagnosticInputExportPayload.importedCoreComparisonSummary?.checklistPendingDelta), "Combined diagnostic inputs did not expose imported core checklist delta");
check(Number.isFinite(mergedDiagnosticInputExportPayload.importedCoreComparisonSummary?.requestPlanCountDelta), "Combined diagnostic inputs did not expose imported core request plan delta");
check(Number.isFinite(mergedDiagnosticInputExportPayload.importedCoreComparisonSummary?.requestPlanMappedDelta) && Number.isFinite(mergedDiagnosticInputExportPayload.importedCoreComparisonSummary?.requestPlanUnmappedDelta), "Combined diagnostic inputs did not expose imported core request plan mapping deltas");
check("nextReadoutDetailsChanged" in mergedDiagnosticInputExportPayload.importedCoreComparisonSummary, "Combined diagnostic inputs did not expose imported core next readout detail change flag");
check(mergedDiagnosticInputExportPayload.importedDiagnosticFlowComparisonSummary?.schemaVersion === "imported_diagnostic_flow_comparison_v1", "Combined diagnostic inputs did not compare imported and recalculated diagnostic flow summary");
check(Number.isFinite(mergedDiagnosticInputExportPayload.importedDiagnosticFlowComparisonSummary?.completionDelta), "Combined diagnostic inputs did not expose imported diagnostic flow completion delta");
check(Number.isFinite(mergedDiagnosticInputExportPayload.importedDiagnosticFlowComparisonSummary?.missingReadoutDelta), "Combined diagnostic inputs did not expose imported diagnostic flow readout count delta");
check(Number.isFinite(mergedDiagnosticInputExportPayload.importedDiagnosticFlowComparisonSummary?.blockerCountDelta), "Combined diagnostic inputs did not expose imported diagnostic flow blocker count delta");
check(Number.isFinite(mergedDiagnosticInputExportPayload.importedDiagnosticFlowComparisonSummary?.checklistBlockingDelta), "Combined diagnostic inputs did not expose imported diagnostic flow checklist delta");
check(Number.isFinite(mergedDiagnosticInputExportPayload.importedDiagnosticFlowComparisonSummary?.requestPlanMappedDelta) && Number.isFinite(mergedDiagnosticInputExportPayload.importedDiagnosticFlowComparisonSummary?.requestPlanUnmappedDelta), "Combined diagnostic inputs did not expose imported diagnostic flow request plan mapping deltas");
check("nextReadoutDetailsChanged" in mergedDiagnosticInputExportPayload.importedDiagnosticFlowComparisonSummary, "Combined diagnostic inputs did not expose imported diagnostic flow next readout detail change flag");
check(mergedDiagnosticInputExportPayload.importedReadoutCompletionComparisonSummary?.schemaVersion === "imported_readout_completion_comparison_v1", "Combined diagnostic inputs did not compare imported and recalculated readout completion summary");
check(Number.isFinite(mergedDiagnosticInputExportPayload.importedReadoutCompletionComparisonSummary?.pendingCountDelta), "Combined diagnostic inputs did not expose imported readout completion pending delta");
check(mergedDiagnosticInputExportPayload.importedAnalysisReadinessComparisonSummary?.schemaVersion === "imported_analysis_readiness_comparison_v1", "Combined diagnostic inputs did not compare imported and recalculated analysis readiness summary");
check(Number.isFinite(mergedDiagnosticInputExportPayload.importedAnalysisReadinessComparisonSummary?.blockerCountDelta), "Combined diagnostic inputs did not expose imported analysis readiness blocker delta");
check("nextReadoutDetailsChanged" in mergedDiagnosticInputExportPayload.importedAnalysisReadinessComparisonSummary, "Combined diagnostic inputs did not expose imported analysis readiness next readout detail change flag");
check(mergedDiagnosticInputExportPayload.importedReadoutRequestPlanGateComparisonSummary?.schemaVersion === "imported_readout_request_plan_gate_comparison_v1", "Combined diagnostic inputs did not compare imported and recalculated readout request plan gate summary");
check("safeForBridgePlanningChanged" in mergedDiagnosticInputExportPayload.importedReadoutRequestPlanGateComparisonSummary && Number.isFinite(mergedDiagnosticInputExportPayload.importedReadoutRequestPlanGateComparisonSummary?.unmappedCountDelta), "Combined diagnostic inputs did not expose imported readout request plan gate comparison details");
check(mergedDiagnosticInputExportPayload.importedSessionComparisonSummary?.schemaVersion === "imported_session_comparison_v1", "Combined diagnostic inputs did not summarize imported session comparison results");
check(Array.isArray(mergedDiagnosticInputExportPayload.importedSessionComparisonSummary?.changedSectionIds), "Combined diagnostic inputs did not expose imported session changed section ids");
check(Array.isArray(mergedDiagnosticInputExportPayload.importedSessionComparisonSummary?.comparedSectionIds) && Array.isArray(mergedDiagnosticInputExportPayload.importedSessionComparisonSummary?.unchangedSectionIds), "Combined diagnostic inputs did not expose imported session compared and unchanged section ids");
check(Array.isArray(mergedDiagnosticInputExportPayload.importedSessionComparisonSummary?.sectionSummaries) && mergedDiagnosticInputExportPayload.importedSessionComparisonSummary.sectionSummaries.length >= 5, "Combined diagnostic inputs did not expose imported session section summaries");
check(Array.isArray(mergedDiagnosticInputExportPayload.importedSessionComparisonSummary?.changedSectionSummaries), "Combined diagnostic inputs did not expose imported session changed section summaries");
check(Array.isArray(mergedDiagnosticInputExportPayload.importedSessionComparisonSummary?.unchangedSectionSummaries) && mergedDiagnosticInputExportPayload.importedSessionComparisonSummary?.unchangedSectionSummaryById && typeof mergedDiagnosticInputExportPayload.importedSessionComparisonSummary.unchangedSectionSummaryById === "object", "Combined diagnostic inputs did not expose imported session unchanged section summaries");
check(mergedDiagnosticInputExportPayload.importedSessionComparisonSummary?.sectionSummaryById?.core_session_status?.id === "core_session_status", "Combined diagnostic inputs did not expose imported session section summary map");
check(Array.isArray(mergedDiagnosticInputExportPayload.importedSessionComparisonSummary?.sectionSummaries?.[0]?.changeReasonIds), "Combined diagnostic inputs did not expose imported session section change reasons");
check(Array.isArray(mergedDiagnosticInputExportPayload.importedSessionComparisonSummary?.changedReasonIds) && Number.isInteger(mergedDiagnosticInputExportPayload.importedSessionComparisonSummary?.changedReasonCount), "Combined diagnostic inputs did not expose imported session top-level change reasons");
check(mergedDiagnosticInputExportPayload.importedSessionComparisonSummary?.changedReasonCountsById && "primaryChangedReasonId" in mergedDiagnosticInputExportPayload.importedSessionComparisonSummary, "Combined diagnostic inputs did not expose imported session reason counts");
check(mergedDiagnosticInputExportPayload.importedSessionComparisonSummary?.changedSectionsByReasonId && typeof mergedDiagnosticInputExportPayload.importedSessionComparisonSummary.changedSectionsByReasonId === "object", "Combined diagnostic inputs did not expose imported session sections by reason");
check(Array.isArray(mergedDiagnosticInputExportPayload.importedSessionComparisonSummary?.changedReasonSummaries) && mergedDiagnosticInputExportPayload.importedSessionComparisonSummary?.changedReasonSummaryById && typeof mergedDiagnosticInputExportPayload.importedSessionComparisonSummary.changedReasonSummaryById === "object", "Combined diagnostic inputs did not expose imported session reason summary maps");
check("primaryChangedReasonSummary" in mergedDiagnosticInputExportPayload.importedSessionComparisonSummary && Number.isInteger(mergedDiagnosticInputExportPayload.importedSessionComparisonSummary?.unchangedSectionCount), "Combined diagnostic inputs did not expose imported session primary reason details and unchanged count");
check(mergedDiagnosticInputExportPayload.importedSessionComparisonSummary?.comparedSectionCount >= 5, "Combined diagnostic inputs did not include request plan gate in imported session comparison count");
check(typeof mergedDiagnosticInputExportPayload.importedSessionComparisonSummary?.hasChanges === "boolean" && typeof mergedDiagnosticInputExportPayload.importedSessionComparisonSummary?.unchanged === "boolean", "Combined diagnostic inputs did not expose imported session direct change flags");
check(["changed", "unchanged"].includes(mergedDiagnosticInputExportPayload.importedSessionComparisonSummary?.status) && Number.isInteger(mergedDiagnosticInputExportPayload.importedSessionComparisonSummary?.changedSectionCount), "Combined diagnostic inputs did not expose imported session comparison status");
check(Array.isArray(mergedDiagnosticInputExportPayload.coreSessionStatus?.blockingWarningIds), "Combined diagnostic inputs did not expose coreSessionStatus blockingWarningIds");
const mergedDiagnosticInputExportPayloadAlias = obd.mergeDiagnosticInputs({
  scanner_text: "P0171",
  bridge_export_payload: bridgeExportPayload
});
check(mergedDiagnosticInputExportPayloadAlias.bridgeSession?.adapterIdentity?.adapterFamily === "elm327", "Combined diagnostic inputs did not accept bridge_export_payload alias input");
check(mergedDiagnosticInputExportPayloadAlias.vciDevices.length === 1, "Combined diagnostic inputs did not carry vci devices from bridge_export_payload alias input");
check(mergedDiagnosticInputExportPayloadAlias.warnings.includes("freeze_frame_available"), "Combined diagnostic inputs did not carry warnings from bridge_export_payload alias input");
const mergedDiagnosticInputExportPayloadNestedResponseAliases = obd.mergeDiagnosticInputs({
  scanner_text: "P0171",
  bridge_export_payload: {
    schema_version: "bridge_session_export_v1",
    exported_at: "2026-06-28T00:12:00Z",
    session: {
      live_pid_response: { raw: "41 0C 1A F8 41 05 7B" },
      ecu_response_summary_response: bridgeSummary.ecuResponseSummary,
      connection_status_response: {
        ok: true,
        blocked: false,
        would_transmit: false,
        data: { status: "ready", is_paired: true, vci_ready: true, car_connected: true }
      },
      list_vci_response: {
        ok: true,
        blocked: false,
        would_transmit: false,
        data: { items: [{ deviceId: "export-merge-response-vci", name: "Export Merge Response VCI", isConnected: true }], selectedVciId: "export-merge-response-vci" }
      },
      adapter_identity_response: {
        ok: true,
        blocked: false,
        would_transmit: false,
        data: { adapter: "Export Merge Response Adapter", family: "stn", version: "7.4" }
      }
    }
  }
});
check(mergedDiagnosticInputExportPayloadNestedResponseAliases.monitorValues.find((item) => item.id === "engine_speed")?.value === 1726, "Combined diagnostic inputs did not decode live_pid_response from bridge_export_payload nested session input");
check(mergedDiagnosticInputExportPayloadNestedResponseAliases.ecuResponseSummary?.schemaVersion === bridgeSummary.ecuResponseSummary.schemaVersion, "Combined diagnostic inputs did not accept ecu_response_summary_response from bridge_export_payload nested session input");
check(mergedDiagnosticInputExportPayloadNestedResponseAliases.connectionStatus?.vehicleConnected === true, "Combined diagnostic inputs did not accept connection_status_response from bridge_export_payload nested session input");
check(mergedDiagnosticInputExportPayloadNestedResponseAliases.vciDevices[0]?.id === "export-merge-response-vci", "Combined diagnostic inputs did not accept list_vci_response from bridge_export_payload nested session input");
check(mergedDiagnosticInputExportPayloadNestedResponseAliases.adapterIdentity?.adapterFamily === "stn", "Combined diagnostic inputs did not accept adapter_identity_response from bridge_export_payload nested session input");
const mergedDiagnosticInputCamelExportPayloadAlias = obd.mergeDiagnosticInputs({
  scanner_text: "P0171",
  bridgeExportPayload: {
    schema_version: "bridge_session_export_v1",
    exportedAt: "2026-06-28T00:12:30Z",
    session: {
      ...bridgeExportPayload.session,
      capturedAt: "2026-06-28T00:12:15Z",
      startedAt: "2026-06-28T00:05:15Z",
      endedAt: "2026-06-28T00:06:15Z"
    }
  }
});
check(mergedDiagnosticInputCamelExportPayloadAlias.capturedAt === "2026-06-28T00:12:15Z", "Combined diagnostic inputs did not accept camelCase bridgeExportPayload session capturedAt");
check(mergedDiagnosticInputCamelExportPayloadAlias.startedAt === "2026-06-28T00:05:15Z" && mergedDiagnosticInputCamelExportPayloadAlias.endedAt === "2026-06-28T00:06:15Z", "Combined diagnostic inputs did not accept camelCase bridgeExportPayload session timestamps");
const mergedDiagnosticInputExportPayloadVehicleProfile = obd.mergeDiagnosticInputs({
  scanner_text: "P0171",
  bridge_export_payload: bridgeExportAliasInputs
});
check(mergedDiagnosticInputExportPayloadVehicleProfile.startedAt === "2026-06-28T00:05:00Z" && mergedDiagnosticInputExportPayloadVehicleProfile.endedAt === "2026-06-28T00:06:00Z", "Combined diagnostic inputs did not carry started_at or ended_at from bridge_export_payload alias input");
check(mergedDiagnosticInputExportPayloadVehicleProfile.vehicleProfile?.model === "Aqua", "Combined diagnostic inputs did not carry vehicle_profile from bridge_export_payload alias input");
check(mergedDiagnosticInputExportPayloadVehicleProfile.vehicleApplicability?.status === "matched", "Combined diagnostic inputs did not carry vehicle_applicability from bridge_export_payload alias input");
const mergedDiagnosticInputSnakeTopLevelAliases = obd.mergeDiagnosticInputs({
  scanner_text: "P0171",
  bridge_diagnostic_import: {
    importType: "bridge_diagnostic_snapshot",
    readout_coverage: {
      include_infrastructure: false,
      total_categories: 7,
      available_categories: 3,
      captured_categories: 2,
      empty_categories: 1,
      missing_categories: 4
    },
    vehicle_applicability: {
      make: "Toyota",
      model: "Prius",
      model_code: "ZVW30",
      year: "2012",
      engine_code: "2ZR-FXE",
      catalog_matched: true,
      year_matched: true,
      engine_matched: true,
      model_code_matched: true
    },
    next_readout_candidates: [
      { readout_id: "ecu_info_snapshot", display_label: "ECU Info", status: "empty", sort_order: 92, applicability_status: "partial" }
    ],
    bridgeSession: bridgeDiagnosticImport.bridgeSession
  }
});
check(mergedDiagnosticInputSnakeTopLevelAliases.readoutCoverage.includeInfrastructure === false, "Combined diagnostic inputs did not accept top-level readout_coverage alias input");
check(mergedDiagnosticInputSnakeTopLevelAliases.vehicleApplicability?.status === "matched", "Combined diagnostic inputs did not accept top-level vehicle_applicability alias input");
check(mergedDiagnosticInputSnakeTopLevelAliases.nextReadoutCandidates[0]?.id === "ecu_info_snapshot", "Combined diagnostic inputs did not accept top-level next_readout_candidates alias input");
const mergedDiagnosticInputNestedSession = obd.mergeDiagnosticInputs({
  scanner_text: "P0171",
  bridge_import: {
    session: bridgeExportPayload.session
  }
});
check(mergedDiagnosticInputNestedSession.bridgeSession?.adapterIdentity?.adapterFamily === "elm327", "Combined diagnostic inputs did not accept nested session bridge_import input");
check(mergedDiagnosticInputNestedSession.supportedPidMatrix?.supportedPids.includes("40"), "Combined diagnostic inputs did not carry supported_pid_matrix from nested session bridge_import input");
check(mergedDiagnosticInputNestedSession.warnings.includes("freeze_frame_available"), "Combined diagnostic inputs did not retain warnings from nested session bridge_import input");
const mergedDiagnosticInputNestedSessionResponseAliases = obd.mergeDiagnosticInputs({
  scanner_text: "P0171",
  bridge_import: {
    session: {
      live_pid_response: { raw: "41 0C 1A F8 41 05 7B" },
      ecu_response_summary_response: bridgeSummary.ecuResponseSummary,
      connection_status_response: {
        ok: true,
        blocked: false,
        would_transmit: false,
        data: { status: "ready", is_paired: true, vci_ready: true, car_connected: true }
      },
      list_vci_response: {
        ok: true,
        blocked: false,
        would_transmit: false,
        data: { items: [{ deviceId: "merge-response-vci", name: "Merge Response VCI", isConnected: true }], selectedVciId: "merge-response-vci" }
      },
      adapter_identity_response: {
        ok: true,
        blocked: false,
        would_transmit: false,
        data: { adapter: "Merge Response Adapter", family: "stn", version: "7.3" }
      }
    }
  }
});
check(mergedDiagnosticInputNestedSessionResponseAliases.monitorValues.find((item) => item.id === "engine_speed")?.value === 1726, "Combined diagnostic inputs did not decode live_pid_response from nested session bridge_import input");
check(mergedDiagnosticInputNestedSessionResponseAliases.ecuResponseSummary?.schemaVersion === bridgeSummary.ecuResponseSummary.schemaVersion, "Combined diagnostic inputs did not accept ecu_response_summary_response from nested session bridge_import input");
check(mergedDiagnosticInputNestedSessionResponseAliases.connectionStatus?.vehicleConnected === true, "Combined diagnostic inputs did not accept connection_status_response from nested session bridge_import input");
check(mergedDiagnosticInputNestedSessionResponseAliases.vciDevices[0]?.id === "merge-response-vci", "Combined diagnostic inputs did not accept list_vci_response from nested session bridge_import input");
check(mergedDiagnosticInputNestedSessionResponseAliases.adapterIdentity?.adapterFamily === "stn", "Combined diagnostic inputs did not accept adapter_identity_response from nested session bridge_import input");
const mergedDiagnosticInputBridgeSessionOnlyImport = obd.mergeDiagnosticInputs({
  scanner_text: "P0171",
  bridge_diagnostic_import: {
    importType: "bridge_diagnostic_snapshot",
    bridgeSession: bridgeDiagnosticImport.bridgeSession
  }
});
const mergedDiagnosticInputApplicabilityPartial = obd.mergeDiagnosticInputs({
  scanner_text: "P0171",
  bridge_diagnostic_import: bridgeDiagnosticImportApplicabilityPartial
});
check(Array.isArray(mergedDiagnosticInputApplicabilityPartial.nextReadoutCandidates) && mergedDiagnosticInputApplicabilityPartial.nextReadoutCandidates.length > 0, "統合診断入力へ次の読取候補を引き継げません");
check(mergedDiagnosticInputApplicabilityPartial.nextReadoutCandidates[0]?.id === "freeze_frame_snapshot", "Combined diagnostic inputs did not prioritize freeze_frame_snapshot for partial applicability");
check(mergedDiagnosticInputApplicabilityPartial.nextReadoutCandidates[1]?.id === "ecu_info_snapshot", "Combined diagnostic inputs did not keep ecu_info_snapshot after freeze_frame for partial applicability");
check(mergedDiagnosticInputApplicabilityPartial.coreSessionStatus?.nextRecommendedReadoutId === "freeze_frame_snapshot", "Combined diagnostic inputs did not expose freeze_frame_snapshot as the next recommended readout for partial applicability");
const mergedDiagnosticInputApplicabilityManual = obd.mergeDiagnosticInputs({
  bridge_import: {
    vehicle_profile: { maker: "Toyota", model: "Prius" },
    vehicle_applicability: { status: "manual" },
    dtc_snapshot: bridgeDtcSnapshot
  }
});
check(mergedDiagnosticInputApplicabilityManual.nextReadoutCandidates[0]?.id === "ecu_info_snapshot", "Combined diagnostic inputs did not prioritize ecu_info_snapshot for manual applicability");
check(mergedDiagnosticInputApplicabilityManual.nextReadoutCandidates[1]?.id === "freeze_frame_snapshot", "Combined diagnostic inputs did not keep freeze_frame_snapshot after ecu_info_snapshot for manual applicability");
check(mergedDiagnosticInputApplicabilityManual.coreSessionStatus?.nextRecommendedReadoutId === "ecu_info_snapshot", "Combined diagnostic inputs did not expose ecu_info_snapshot as the next recommended readout for manual applicability");
const mergedDiagnosticInputApplicabilityUnlisted = obd.mergeDiagnosticInputs({
  bridge_import: {
    vehicle_profile: { maker: "Toyota", model: "Prius" },
    vehicle_applicability: { status: "unlisted" },
    dtc_snapshot: bridgeDtcSnapshot
  }
});
check(mergedDiagnosticInputApplicabilityUnlisted.nextReadoutCandidates[0]?.id === "ecu_info_snapshot", "Combined diagnostic inputs did not prioritize ecu_info_snapshot for unlisted applicability");
check(mergedDiagnosticInputApplicabilityUnlisted.nextReadoutCandidates[1]?.id === "freeze_frame_snapshot", "Combined diagnostic inputs did not keep freeze_frame_snapshot after ecu_info_snapshot for unlisted applicability");
check(mergedDiagnosticInputApplicabilityUnlisted.coreSessionStatus?.nextRecommendedReadoutId === "ecu_info_snapshot", "Combined diagnostic inputs did not expose ecu_info_snapshot as the next recommended readout for unlisted applicability");
const mergedDiagnosticInputCoverageOverride = obd.mergeDiagnosticInputs({
  bridge_import: {
    readout_coverage: {
      includeInfrastructure: false,
      totalCategories: 7,
      availableCategories: 3,
      capturedCategories: 2,
      emptyCategories: 1,
      missingCategories: 4,
      capturedPercent: 29,
      progressPercent: 43,
      items: [
        { id: "dtc_snapshot", status: "captured", available: true, count: 2 },
        { id: "live_pid_snapshot", status: "captured", available: true, count: 3 },
        { id: "freeze_frame_snapshot", status: "empty", available: true, count: 0 }
      ],
      emptyIds: ["freeze_frame_snapshot"],
      missingIds: ["readiness_snapshot", "ecu_info_snapshot", "onboard_monitor_snapshot", "supported_pid_matrix"]
    },
    next_readout_candidates: [{ id: "custom_merged_snapshot", label: "Merged Snapshot", priority: 1, reason: "merged override" }],
    dtc_snapshot: bridgeDtcSnapshot
  }
});
check(mergedDiagnosticInputCoverageOverride.readoutCoverage?.includeInfrastructure === false, "Combined diagnostic inputs did not preserve explicit readout_coverage override");
check(mergedDiagnosticInputCoverageOverride.nextReadoutCandidates[0]?.id === "custom_merged_snapshot", "Combined diagnostic inputs did not preserve explicit next_readout_candidates override");
check(mergedDiagnosticInputCoverageOverride.coreSessionStatus?.nextRecommendedReadoutId === "custom_merged_snapshot", "Combined diagnostic inputs did not preserve explicit next_readout_candidates over coverage override emptyIds");
const bridgeExportPayloadPopulatedPartialExplicitCandidates = obd.buildBridgeSessionExportPayload({
  vehicle_applicability: { status: "partial" },
  dtcSnapshot: bridgeDtcSnapshot,
  livePidSnapshot: bridgePidSnapshot,
  freezeFrameSnapshot: bridgeFreezeFrameSnapshot,
  readinessSnapshot: bridgeReadinessSnapshot,
  ecuInfoSnapshot: bridgeEcuInfoSnapshot,
  onboardMonitorSnapshot: bridgeOnboardMonitorSnapshot,
  supportedPidMatrix: bridgeSupportedPidSnapshot,
  next_readout_candidates: [{ id: "custom_snapshot", label: "Custom Snapshot", priority: 1, reason: "outer override" }]
});
const mergedDiagnosticInputExportPayloadPopulatedPartialExplicitCandidates = obd.mergeDiagnosticInputs({
  bridge_export_payload: bridgeExportPayloadPopulatedPartialExplicitCandidates
});
check(mergedDiagnosticInputExportPayloadPopulatedPartialExplicitCandidates.vehicleApplicability?.status === "partial", "Combined diagnostic inputs did not preserve partial vehicle applicability from populated bridge_export_payload input");
check(mergedDiagnosticInputExportPayloadPopulatedPartialExplicitCandidates.nextReadoutCandidates[0]?.id === "custom_snapshot", "Combined diagnostic inputs did not preserve explicit next_readout_candidates from populated bridge_export_payload input");
check(mergedDiagnosticInputExportPayloadPopulatedPartialExplicitCandidates.coreSessionStatus?.readyForAnalysis === true, "Combined diagnostic inputs did not keep populated partial bridge_export_payload input analysis-ready");
check(mergedDiagnosticInputExportPayloadPopulatedPartialExplicitCandidates.coreSessionStatus?.completionPercent === 100, "Combined diagnostic inputs did not keep populated partial bridge_export_payload input at 100 percent completion");
check(Array.isArray(mergedDiagnosticInputExportPayloadPopulatedPartialExplicitCandidates.coreSessionStatus?.remainingReadoutIds) && mergedDiagnosticInputExportPayloadPopulatedPartialExplicitCandidates.coreSessionStatus.remainingReadoutIds.length === 0, "Combined diagnostic inputs treated populated partial bridge_export_payload input as having unread core readouts");
check(Array.isArray(mergedDiagnosticInputExportPayloadPopulatedPartialExplicitCandidates.coreSessionStatus?.emptyReadoutIds) && mergedDiagnosticInputExportPayloadPopulatedPartialExplicitCandidates.coreSessionStatus.emptyReadoutIds.length === 0, "Combined diagnostic inputs treated populated partial bridge_export_payload input as having empty core readouts");
const bridgeExportPayloadPopulatedUnlistedExplicitCandidates = obd.buildBridgeSessionExportPayload({
  vehicle_applicability: { status: "unlisted" },
  dtcSnapshot: bridgeDtcSnapshot,
  livePidSnapshot: bridgePidSnapshot,
  freezeFrameSnapshot: bridgeFreezeFrameSnapshot,
  readinessSnapshot: bridgeReadinessSnapshot,
  ecuInfoSnapshot: bridgeEcuInfoSnapshot,
  onboardMonitorSnapshot: bridgeOnboardMonitorSnapshot,
  supportedPidMatrix: bridgeSupportedPidSnapshot,
  next_readout_candidates: [{ id: "custom_snapshot", label: "Custom Snapshot", priority: 1, reason: "outer override" }]
});
const mergedDiagnosticInputExportPayloadPopulatedUnlistedExplicitCandidates = obd.mergeDiagnosticInputs({
  bridge_export_payload: bridgeExportPayloadPopulatedUnlistedExplicitCandidates
});
check(mergedDiagnosticInputExportPayloadPopulatedUnlistedExplicitCandidates.vehicleApplicability?.status === "unlisted", "Combined diagnostic inputs did not preserve unlisted vehicle applicability from populated bridge_export_payload input");
check(mergedDiagnosticInputExportPayloadPopulatedUnlistedExplicitCandidates.nextReadoutCandidates[0]?.id === "custom_snapshot", "Combined diagnostic inputs did not preserve explicit next_readout_candidates for unlisted populated bridge_export_payload input");
check(mergedDiagnosticInputExportPayloadPopulatedUnlistedExplicitCandidates.coreSessionStatus?.blockingWarningIds?.includes("vehicle_applicability_unlisted"), "Combined diagnostic inputs did not keep unlisted applicability blocking for populated bridge_export_payload input");
check(mergedDiagnosticInputExportPayloadPopulatedUnlistedExplicitCandidates.coreSessionStatus?.readyForAnalysis === false, "Combined diagnostic inputs incorrectly marked populated unlisted bridge_export_payload input as analysis-ready");
check(mergedDiagnosticInputExportPayloadPopulatedUnlistedExplicitCandidates.coreSessionStatus?.completionPercent === 100, "Combined diagnostic inputs did not keep populated unlisted bridge_export_payload input at 100 percent completion");
check(Array.isArray(mergedDiagnosticInputExportPayloadPopulatedUnlistedExplicitCandidates.coreSessionStatus?.remainingReadoutIds) && mergedDiagnosticInputExportPayloadPopulatedUnlistedExplicitCandidates.coreSessionStatus.remainingReadoutIds.length === 0, "Combined diagnostic inputs treated populated unlisted bridge_export_payload input as having unread core readouts");
check(Array.isArray(mergedDiagnosticInputExportPayloadPopulatedUnlistedExplicitCandidates.coreSessionStatus?.emptyReadoutIds) && mergedDiagnosticInputExportPayloadPopulatedUnlistedExplicitCandidates.coreSessionStatus.emptyReadoutIds.length === 0, "Combined diagnostic inputs treated populated unlisted bridge_export_payload input as having empty core readouts");
const bridgeDiagnosticImportPopulatedManualExplicitCandidates = obd.buildBridgeDiagnosticImport({
  vehicle_applicability: { status: "manual" },
  dtcSnapshot: bridgeDtcSnapshot,
  livePidSnapshot: bridgePidSnapshot,
  freezeFrameSnapshot: bridgeFreezeFrameSnapshot,
  readinessSnapshot: bridgeReadinessSnapshot,
  ecuInfoSnapshot: bridgeEcuInfoSnapshot,
  onboardMonitorSnapshot: bridgeOnboardMonitorSnapshot,
  supportedPidMatrix: bridgeSupportedPidSnapshot,
  next_readout_candidates: [{ id: "custom_snapshot", label: "Custom Snapshot", priority: 1, reason: "outer override" }]
});
const bridgeDiagnosticImportPopulatedPartialExplicitCandidates = obd.buildBridgeDiagnosticImport({
  vehicle_applicability: { status: "partial" },
  dtcSnapshot: bridgeDtcSnapshot,
  livePidSnapshot: bridgePidSnapshot,
  freezeFrameSnapshot: bridgeFreezeFrameSnapshot,
  readinessSnapshot: bridgeReadinessSnapshot,
  ecuInfoSnapshot: bridgeEcuInfoSnapshot,
  onboardMonitorSnapshot: bridgeOnboardMonitorSnapshot,
  supportedPidMatrix: bridgeSupportedPidSnapshot,
  next_readout_candidates: [{ id: "custom_snapshot", label: "Custom Snapshot", priority: 1, reason: "outer override" }]
});
const bridgeDiagnosticImportPopulatedUnlistedExplicitCandidates = obd.buildBridgeDiagnosticImport({
  vehicle_applicability: { status: "unlisted" },
  dtcSnapshot: bridgeDtcSnapshot,
  livePidSnapshot: bridgePidSnapshot,
  freezeFrameSnapshot: bridgeFreezeFrameSnapshot,
  readinessSnapshot: bridgeReadinessSnapshot,
  ecuInfoSnapshot: bridgeEcuInfoSnapshot,
  onboardMonitorSnapshot: bridgeOnboardMonitorSnapshot,
  supportedPidMatrix: bridgeSupportedPidSnapshot,
  next_readout_candidates: [{ id: "custom_snapshot", label: "Custom Snapshot", priority: 1, reason: "outer override" }]
});
const mergedDiagnosticInputImportPopulatedManualExplicitCandidates = obd.mergeDiagnosticInputs({
  bridge_diagnostic_import: bridgeDiagnosticImportPopulatedManualExplicitCandidates
});
const mergedDiagnosticInputImportPopulatedPartialExplicitCandidates = obd.mergeDiagnosticInputs({
  bridge_diagnostic_import: bridgeDiagnosticImportPopulatedPartialExplicitCandidates
});
const mergedDiagnosticInputImportPopulatedUnlistedExplicitCandidates = obd.mergeDiagnosticInputs({
  bridge_diagnostic_import: bridgeDiagnosticImportPopulatedUnlistedExplicitCandidates
});
check(mergedDiagnosticInputImportPopulatedManualExplicitCandidates.vehicleApplicability?.status === "manual", "Combined diagnostic inputs did not preserve manual vehicle applicability from populated bridge_diagnostic_import input");
check(mergedDiagnosticInputImportPopulatedManualExplicitCandidates.nextReadoutCandidates[0]?.id === "custom_snapshot", "Combined diagnostic inputs did not preserve explicit next_readout_candidates from populated bridge_diagnostic_import input");
check(mergedDiagnosticInputImportPopulatedManualExplicitCandidates.warnings.includes("vehicle_profile_manual"), "Combined diagnostic inputs did not keep manual applicability warning for populated bridge_diagnostic_import input");
check(mergedDiagnosticInputImportPopulatedManualExplicitCandidates.coreSessionStatus?.blockingWarningIds?.includes("vehicle_profile_manual"), "Combined diagnostic inputs did not keep manual applicability blocking for populated bridge_diagnostic_import input");
check(mergedDiagnosticInputImportPopulatedManualExplicitCandidates.coreSessionStatus?.readyForAnalysis === false, "Combined diagnostic inputs incorrectly marked populated manual bridge_diagnostic_import input as analysis-ready");
check(mergedDiagnosticInputImportPopulatedManualExplicitCandidates.coreSessionStatus?.completionPercent === 100, "Combined diagnostic inputs did not keep populated manual bridge_diagnostic_import input at 100 percent completion");
check(Array.isArray(mergedDiagnosticInputImportPopulatedManualExplicitCandidates.coreSessionStatus?.remainingReadoutIds) && mergedDiagnosticInputImportPopulatedManualExplicitCandidates.coreSessionStatus.remainingReadoutIds.length === 0, "Combined diagnostic inputs treated populated manual bridge_diagnostic_import input as having unread core readouts");
check(Array.isArray(mergedDiagnosticInputImportPopulatedManualExplicitCandidates.coreSessionStatus?.emptyReadoutIds) && mergedDiagnosticInputImportPopulatedManualExplicitCandidates.coreSessionStatus.emptyReadoutIds.length === 0, "Combined diagnostic inputs treated populated manual bridge_diagnostic_import input as having empty core readouts");
check(mergedDiagnosticInputImportPopulatedPartialExplicitCandidates.vehicleApplicability?.status === "partial", "Combined diagnostic inputs did not preserve partial vehicle applicability from populated bridge_diagnostic_import input");
check(mergedDiagnosticInputImportPopulatedPartialExplicitCandidates.warnings.includes("vehicle_applicability_partial"), "Combined diagnostic inputs did not keep partial applicability warning for populated bridge_diagnostic_import input");
check(!mergedDiagnosticInputImportPopulatedPartialExplicitCandidates.coreSessionStatus?.blockingWarningIds?.includes("vehicle_applicability_partial"), "Combined diagnostic inputs incorrectly treated partial applicability as blocking for populated bridge_diagnostic_import input");
check(mergedDiagnosticInputImportPopulatedPartialExplicitCandidates.coreSessionStatus?.readyForAnalysis === true, "Combined diagnostic inputs did not keep populated partial bridge_diagnostic_import input analysis-ready");
check(mergedDiagnosticInputImportPopulatedPartialExplicitCandidates.coreSessionStatus?.completionPercent === 100, "Combined diagnostic inputs did not keep populated partial bridge_diagnostic_import input at 100 percent completion");
check(mergedDiagnosticInputImportPopulatedPartialExplicitCandidates.nextReadoutCandidates[0]?.id === "custom_snapshot", "Combined diagnostic inputs did not preserve explicit next_readout_candidates for populated partial bridge_diagnostic_import input");
check(Array.isArray(mergedDiagnosticInputImportPopulatedPartialExplicitCandidates.coreSessionStatus?.remainingReadoutIds) && mergedDiagnosticInputImportPopulatedPartialExplicitCandidates.coreSessionStatus.remainingReadoutIds.length === 0, "Combined diagnostic inputs treated populated partial bridge_diagnostic_import input as having unread core readouts");
check(Array.isArray(mergedDiagnosticInputImportPopulatedPartialExplicitCandidates.coreSessionStatus?.emptyReadoutIds) && mergedDiagnosticInputImportPopulatedPartialExplicitCandidates.coreSessionStatus.emptyReadoutIds.length === 0, "Combined diagnostic inputs treated populated partial bridge_diagnostic_import input as having empty core readouts");
check(mergedDiagnosticInputImportPopulatedUnlistedExplicitCandidates.vehicleApplicability?.status === "unlisted", "Combined diagnostic inputs did not preserve unlisted vehicle applicability from populated bridge_diagnostic_import input");
check(mergedDiagnosticInputImportPopulatedUnlistedExplicitCandidates.warnings.includes("vehicle_applicability_unlisted"), "Combined diagnostic inputs did not keep unlisted applicability warning for populated bridge_diagnostic_import input");
check(mergedDiagnosticInputImportPopulatedUnlistedExplicitCandidates.coreSessionStatus?.blockingWarningIds?.includes("vehicle_applicability_unlisted"), "Combined diagnostic inputs did not keep unlisted applicability blocking for populated bridge_diagnostic_import input");
check(mergedDiagnosticInputImportPopulatedUnlistedExplicitCandidates.coreSessionStatus?.readyForAnalysis === false, "Combined diagnostic inputs incorrectly marked populated unlisted bridge_diagnostic_import input as analysis-ready");
check(mergedDiagnosticInputImportPopulatedUnlistedExplicitCandidates.coreSessionStatus?.completionPercent === 100, "Combined diagnostic inputs did not keep populated unlisted bridge_diagnostic_import input at 100 percent completion");
check(mergedDiagnosticInputImportPopulatedUnlistedExplicitCandidates.nextReadoutCandidates[0]?.id === "custom_snapshot", "Combined diagnostic inputs did not preserve explicit next_readout_candidates for populated unlisted bridge_diagnostic_import input");
check(Array.isArray(mergedDiagnosticInputImportPopulatedUnlistedExplicitCandidates.coreSessionStatus?.remainingReadoutIds) && mergedDiagnosticInputImportPopulatedUnlistedExplicitCandidates.coreSessionStatus.remainingReadoutIds.length === 0, "Combined diagnostic inputs treated populated unlisted bridge_diagnostic_import input as having unread core readouts");
check(Array.isArray(mergedDiagnosticInputImportPopulatedUnlistedExplicitCandidates.coreSessionStatus?.emptyReadoutIds) && mergedDiagnosticInputImportPopulatedUnlistedExplicitCandidates.coreSessionStatus.emptyReadoutIds.length === 0, "Combined diagnostic inputs treated populated unlisted bridge_diagnostic_import input as having empty core readouts");
check(mergedDiagnosticInputBridgeSessionOnlyImport.protocol === "ISO15765-4", "Combined diagnostic inputs did not recover protocol from bridgeSession-only diagnostic import");
check(mergedDiagnosticInputBridgeSessionOnlyImport.capturedAt === "2026-06-28T00:00:00Z", "Combined diagnostic inputs did not recover capturedAt from bridgeSession-only diagnostic import");
check(mergedDiagnosticInputBridgeSessionOnlyImport.supportedPidMatrix?.supportedPids.includes("40"), "Combined diagnostic inputs did not recover supported_pid_matrix from bridgeSession-only diagnostic import");
check(mergedDiagnosticInputBridgeSessionOnlyImport.readoutCoverage?.progressPercent >= 80, "Combined diagnostic inputs did not recover readoutCoverage from bridgeSession-only diagnostic import");
check(mergedDiagnosticInputBridgeSessionOnlyImport.freezeFrameSnapshot?.triggerDtc === "P0171", "Combined diagnostic inputs did not recover freeze_frame_snapshot from bridgeSession-only diagnostic import");
check(mergedDiagnosticInputBridgeSessionOnlyImport.ecuInfoSnapshot?.itemCount === bridgeEcuInfoSnapshot.itemCount, "Combined diagnostic inputs did not recover ecu_info_snapshot from bridgeSession-only diagnostic import");
check(mergedDiagnosticInputBridgeSessionOnlyImport.bridgeExportPayload?.schema_version === "bridge_session_export_v1", "Combined diagnostic inputs did not rebuild export payload from bridgeSession-only diagnostic import");
check(mergedDiagnosticInputBridgeSessionOnlyImport.monitorValues.length >= bridgePidSnapshot.monitorValues.length, "Combined diagnostic inputs did not recover monitor_values from bridgeSession-only diagnostic import");
check(mergedDiagnosticInputBridgeSessionOnlyImport.hadSensitiveIdentifier === true, "Combined diagnostic inputs did not recover hadSensitiveIdentifier from bridgeSession-only diagnostic import");
check(mergedDiagnosticInputBridgeSessionOnlyImport.connectionStatus?.vehicleConnected === true, "Combined diagnostic inputs did not recover connectionStatus from bridgeSession-only diagnostic import");
check(mergedDiagnosticInputBridgeSessionOnlyImport.adapterIdentity?.adapterFamily === "elm327", "Combined diagnostic inputs did not recover adapterIdentity from bridgeSession-only diagnostic import");
check(mergedDiagnosticInputBridgeSessionOnlyImport.warnings.includes("freeze_frame_available"), "Combined diagnostic inputs did not recover warnings from bridgeSession-only diagnostic import");
check(mergedDiagnosticInputBridgeSessionOnlyImport.nextReadoutCandidates[0]?.id === bridgeDiagnosticImport.bridgeSession.nextReadoutCandidates[0]?.id, "Combined diagnostic inputs did not recover nextReadoutCandidates from bridgeSession-only diagnostic import");
check(mergedDiagnosticInputBridgeSessionOnlyImport.toolHints.join(",") === "Techstream,J2534", "Combined diagnostic inputs did not recover toolHints from bridgeSession-only diagnostic import");
check(mergedDiagnosticInputBridgeSessionOnlyImport.sourceLength === 128, "Combined diagnostic inputs did not recover sourceLength from bridgeSession-only diagnostic import");
const mergedDiagnosticInputNonInfrastructureBridgeImport = obd.mergeDiagnosticInputs({
  bridge_diagnostic_import: bridgeDiagnosticImportNonInfrastructureAliases
});
check(mergedDiagnosticInputNonInfrastructureBridgeImport.readoutCoverage?.includeInfrastructure === false, "Combined diagnostic inputs did not preserve non-infrastructure readoutCoverage from bridge diagnostic import");
check(!mergedDiagnosticInputNonInfrastructureBridgeImport.warnings.includes("bridge_readout_incomplete") && !mergedDiagnosticInputNonInfrastructureBridgeImport.warnings.includes("bridge_readout_empty_sections"), "Combined diagnostic inputs emitted bridge readout warnings for non-infrastructure bridge diagnostic import");
const mergedDiagnosticInputNonInfrastructureBridgeExportPayload = obd.mergeDiagnosticInputs({
  bridge_export_payload: bridgeDiagnosticImportNonInfrastructureAliases.exportPayload
});
check(mergedDiagnosticInputNonInfrastructureBridgeExportPayload.readoutCoverage?.includeInfrastructure === false, "Combined diagnostic inputs did not preserve non-infrastructure readoutCoverage from bridge_export_payload input");
check(!mergedDiagnosticInputNonInfrastructureBridgeExportPayload.warnings.includes("bridge_readout_incomplete") && !mergedDiagnosticInputNonInfrastructureBridgeExportPayload.warnings.includes("bridge_readout_empty_sections"), "Combined diagnostic inputs emitted bridge readout warnings for non-infrastructure bridge_export_payload input");
const mergedDiagnosticInputBridgeSessionSnakeSensitiveIdentifier = obd.mergeDiagnosticInputs({
  bridge_diagnostic_import: {
    importType: "bridge_diagnostic_snapshot",
    bridge_session: {
      ecu_info_snapshot: {
        had_sensitive_identifier: true,
        items: [{ id: "vin", value: "JT123456789012345", privacyClass: "sensitive_identifier" }]
      }
    }
  }
});
check(mergedDiagnosticInputBridgeSessionSnakeSensitiveIdentifier.hadSensitiveIdentifier === true, "Combined diagnostic inputs did not recover hadSensitiveIdentifier from snake_case bridge_session ecu_info_snapshot input");
const mergedDiagnosticInputImportClassification = obd.mergeDiagnosticInputs({
  bridge_session: {
    import_classification: {
      schemaVersion: "obd_response_line_classification_v1",
      bucketCounts: { livePidResponses: 4 }
    }
  }
});
check(mergedDiagnosticInputImportClassification.importClassification?.bucketCounts?.livePidResponses === 4, "Combined diagnostic inputs did not recover import_classification from bridge_session input");
const mergedDiagnosticInputNestedOuterOverride = obd.mergeDiagnosticInputs({
  scanner_text: "P0171",
  bridge_diagnostic_import: {
    protocol: "ISO9141-2",
    captured_at: "2026-06-28T00:11:00Z",
    vehicle_profile: { maker: "Toyota", model: "Outer Sienta" },
    vehicle_applicability: vehicleApplicabilityPartialSample,
    connection_status: {
      ok: true,
      blocked: false,
      would_transmit: false,
      data: { status: "ready", is_paired: false, vci_ready: true, car_connected: false }
    },
    readout_coverage: legacyReadoutCoverage,
    next_readout_candidates: [{ id: "custom_outer_snapshot", label: "Outer Snapshot", priority: 1, reason: "outer override" }],
    freeze_frame_snapshot: outerOverrideFreezeFrameSnapshot,
    readiness_snapshot: outerOverrideReadinessSnapshot,
    supported_pid_matrix: outerOverrideSupportedPidSnapshot,
    ecu_info_snapshot: outerOverrideEcuInfoSnapshot,
    session: bridgeExportPayload.session
  }
});
check(mergedDiagnosticInputNestedOuterOverride.protocol === "ISO9141-2", "Combined diagnostic inputs did not let outer protocol override nested session alias input");
check(mergedDiagnosticInputNestedOuterOverride.capturedAt === "2026-06-28T00:11:00Z", "Combined diagnostic inputs did not let outer captured_at override nested session alias input");
check(mergedDiagnosticInputNestedOuterOverride.vehicleProfile?.model === "Outer Sienta", "Combined diagnostic inputs did not let outer vehicle_profile override nested session alias input");
check(mergedDiagnosticInputNestedOuterOverride.vehicleApplicability?.status === "partial", "Combined diagnostic inputs did not let outer vehicle_applicability override nested session alias input");
check(mergedDiagnosticInputNestedOuterOverride.connectionStatus?.vehicleConnected === false, "Combined diagnostic inputs did not let outer connection_status override nested session alias input");
check(mergedDiagnosticInputNestedOuterOverride.readoutCoverage?.capturedPercent === 29, "Combined diagnostic inputs did not let outer readout_coverage override nested session alias input");
check(mergedDiagnosticInputNestedOuterOverride.nextReadoutCandidates[0]?.id === "custom_outer_snapshot", "Combined diagnostic inputs did not let outer next_readout_candidates override nested session alias input");
check(mergedDiagnosticInputNestedOuterOverride.freezeFrameSnapshot?.triggerDtc === "P0420", "Combined diagnostic inputs did not let outer freeze_frame_snapshot override nested session alias input");
check(mergedDiagnosticInputNestedOuterOverride.readinessSnapshot?.incompleteCount === 0, "Combined diagnostic inputs did not let outer readiness_snapshot override nested session alias input");
check(mergedDiagnosticInputNestedOuterOverride.supportedPidMatrix?.supportedPids.join(",") === "0C,0D", "Combined diagnostic inputs did not let outer supported_pid_matrix override nested session alias input");
check(mergedDiagnosticInputNestedOuterOverride.ecuInfoSnapshot?.items?.[0]?.value === "Outer Override ECU", "Combined diagnostic inputs did not let outer ecu_info_snapshot override nested session alias input");
const mergedDiagnosticInputExportNestedOuterOverride = obd.mergeDiagnosticInputs({
  scanner_text: "P0171",
  bridge_export_payload: {
    schema_version: "bridge_session_export_v1",
    exported_at: "2026-06-28T00:11:30Z",
    protocol: "ISO9141-2",
    captured_at: "2026-06-28T00:11:15Z",
    vehicle_profile: { maker: "Toyota", model: "Outer Porte" },
    vehicle_applicability: vehicleApplicabilityPartialSample,
    connection_status: {
      ok: true,
      blocked: false,
      would_transmit: false,
      data: { status: "ready", is_paired: false, vci_ready: true, car_connected: false }
    },
    readout_coverage: legacyReadoutCoverage,
    next_readout_candidates: [{ id: "custom_outer_snapshot", label: "Outer Snapshot", priority: 1, reason: "outer override" }],
    freeze_frame_snapshot: outerOverrideFreezeFrameSnapshot,
    readiness_snapshot: outerOverrideReadinessSnapshot,
    supported_pid_matrix: outerOverrideSupportedPidSnapshot,
    ecu_info_snapshot: outerOverrideEcuInfoSnapshot,
    session: bridgeExportPayload.session
  }
});
check(mergedDiagnosticInputExportNestedOuterOverride.protocol === "ISO9141-2", "Combined diagnostic inputs did not let outer protocol override nested bridge_export_payload session input");
check(mergedDiagnosticInputExportNestedOuterOverride.capturedAt === "2026-06-28T00:11:15Z", "Combined diagnostic inputs did not let outer captured_at override nested bridge_export_payload session input");
check(mergedDiagnosticInputExportNestedOuterOverride.vehicleProfile?.model === "Outer Porte", "Combined diagnostic inputs did not let outer vehicle_profile override nested bridge_export_payload session input");
check(mergedDiagnosticInputExportNestedOuterOverride.vehicleApplicability?.status === "partial", "Combined diagnostic inputs did not let outer vehicle_applicability override nested bridge_export_payload session input");
check(mergedDiagnosticInputExportNestedOuterOverride.connectionStatus?.vehicleConnected === false, "Combined diagnostic inputs did not let outer connection_status override nested bridge_export_payload session input");
check(mergedDiagnosticInputExportNestedOuterOverride.readoutCoverage?.capturedPercent === 29, "Combined diagnostic inputs did not let outer readout_coverage override nested bridge_export_payload session input");
check(mergedDiagnosticInputExportNestedOuterOverride.nextReadoutCandidates[0]?.id === "custom_outer_snapshot", "Combined diagnostic inputs did not let outer next_readout_candidates override nested bridge_export_payload session input");
check(mergedDiagnosticInputExportNestedOuterOverride.freezeFrameSnapshot?.triggerDtc === "P0420", "Combined diagnostic inputs did not let outer freeze_frame_snapshot override nested bridge_export_payload session input");
check(mergedDiagnosticInputExportNestedOuterOverride.readinessSnapshot?.incompleteCount === 0, "Combined diagnostic inputs did not let outer readiness_snapshot override nested bridge_export_payload session input");
check(mergedDiagnosticInputExportNestedOuterOverride.supportedPidMatrix?.supportedPids.join(",") === "0C,0D", "Combined diagnostic inputs did not let outer supported_pid_matrix override nested bridge_export_payload session input");
check(mergedDiagnosticInputExportNestedOuterOverride.ecuInfoSnapshot?.items?.[0]?.value === "Outer Override ECU", "Combined diagnostic inputs did not let outer ecu_info_snapshot override nested bridge_export_payload session input");
const mergedDiagnosticInputMetadataOuterOverride = obd.mergeDiagnosticInputs({
  scanner_text: "P0171",
  bridge_diagnostic_import: {
    tool_hints: ["CONSULT"],
    warning_flags: ["negative_obd_response_present"],
    source_length: 0,
    had_sensitive_identifier: false,
    bridgeSession: bridgeDiagnosticImport.bridgeSession
  }
});
check(mergedDiagnosticInputMetadataOuterOverride.toolHints.join(",") === "CONSULT,Techstream,J2534", "Combined diagnostic inputs did not merge outer tool_hints with nested bridgeSession input");
check(mergedDiagnosticInputMetadataOuterOverride.warnings.includes("negative_obd_response_present") && mergedDiagnosticInputMetadataOuterOverride.warnings.includes("freeze_frame_available"), "Combined diagnostic inputs did not merge outer warning_flags with nested bridgeSession input");
check(mergedDiagnosticInputMetadataOuterOverride.sourceLength === 5, "Combined diagnostic inputs did not preserve merged sourceLength behavior after outer bridge source_length override");
check(mergedDiagnosticInputMetadataOuterOverride.hadSensitiveIdentifier === true, "Combined diagnostic inputs did not preserve hadSensitiveIdentifier when nested bridgeSession remained true");
const mergedDiagnosticInputMixedCamelOuterSnakeNestedMetadata = obd.mergeDiagnosticInputs({
  scanner_text: "P0171",
  bridge_diagnostic_import: {
    toolHints: ["CONSULT"],
    warningFlags: ["negative_obd_response_present"],
    sourceLength: 7,
    hadSensitiveIdentifier: false,
    importClassification: {
      schemaVersion: "obd_response_line_classification_v1",
      bucketCounts: { storedDtcResponses: 16 }
    },
    bridgeSession: {
      tool_hints: ["Techstream", "J2534"],
      warning_flags: ["freeze_frame_available"],
      source_length: 19,
      had_sensitive_identifier: true
    }
  }
});
check(mergedDiagnosticInputMixedCamelOuterSnakeNestedMetadata.toolHints.join(",") === "CONSULT,Techstream,J2534", "Combined diagnostic inputs did not merge camelCase outer toolHints with nested snake_case bridgeSession input");
check(mergedDiagnosticInputMixedCamelOuterSnakeNestedMetadata.warnings.includes("negative_obd_response_present") && mergedDiagnosticInputMixedCamelOuterSnakeNestedMetadata.warnings.includes("freeze_frame_available"), "Combined diagnostic inputs did not merge camelCase outer warningFlags with nested snake_case bridgeSession input");
check(mergedDiagnosticInputMixedCamelOuterSnakeNestedMetadata.sourceLength === 7, "Combined diagnostic inputs did not preserve camelCase outer sourceLength over nested snake_case bridgeSession input");
check(mergedDiagnosticInputMixedCamelOuterSnakeNestedMetadata.hadSensitiveIdentifier === true, "Combined diagnostic inputs did not preserve nested snake_case sensitive identifier when outer camelCase value was false");
check(mergedDiagnosticInputMixedCamelOuterSnakeNestedMetadata.importClassification?.bucketCounts?.storedDtcResponses === 16, "Combined diagnostic inputs did not preserve camelCase outer importClassification over nested snake_case bridgeSession input");
const mergedDiagnosticInputMixedSnakeOuterCamelNestedMetadata = obd.mergeDiagnosticInputs({
  scanner_text: "P0171",
  bridge_diagnostic_import: {
    tool_hints: ["CONSULT"],
    warning_flags: ["negative_obd_response_present"],
    source_length: 8,
    had_sensitive_identifier: false,
    import_classification: {
      schemaVersion: "obd_response_line_classification_v1",
      bucketCounts: { storedDtcResponses: 17 }
    },
    bridgeSession: {
      toolHints: ["Techstream", "J2534"],
      warningFlags: ["freeze_frame_available"],
      sourceLength: 23,
      hadSensitiveIdentifier: true
    }
  }
});
check(mergedDiagnosticInputMixedSnakeOuterCamelNestedMetadata.toolHints.join(",") === "CONSULT,Techstream,J2534", "Combined diagnostic inputs did not merge snake_case outer tool_hints with nested camelCase bridgeSession input");
check(mergedDiagnosticInputMixedSnakeOuterCamelNestedMetadata.warnings.includes("negative_obd_response_present") && mergedDiagnosticInputMixedSnakeOuterCamelNestedMetadata.warnings.includes("freeze_frame_available"), "Combined diagnostic inputs did not merge snake_case outer warning_flags with nested camelCase bridgeSession input");
check(mergedDiagnosticInputMixedSnakeOuterCamelNestedMetadata.sourceLength === 8, "Combined diagnostic inputs did not preserve snake_case outer source_length over nested camelCase bridgeSession input");
check(mergedDiagnosticInputMixedSnakeOuterCamelNestedMetadata.hadSensitiveIdentifier === true, "Combined diagnostic inputs did not preserve nested camelCase sensitive identifier when outer snake_case value was false");
check(mergedDiagnosticInputMixedSnakeOuterCamelNestedMetadata.importClassification?.bucketCounts?.storedDtcResponses === 17, "Combined diagnostic inputs did not preserve snake_case outer import_classification over nested camelCase bridgeSession input");
const mergedDiagnosticInputDirectBridgeImportNestedSourceLength = obd.mergeDiagnosticInputs({
  bridge_diagnostic_import: {
    importType: "bridge_diagnostic_snapshot",
    source: "local_bridge",
    codes: ["P0171"],
    sourceLength: 12,
    bridgeSession: {
      codes: ["P0171"],
      tool_hints: ["NESTED"],
      warning_flags: ["freeze_frame_available"],
      source_length: 48
    }
  }
});
check(mergedDiagnosticInputDirectBridgeImportNestedSourceLength.toolHints.includes("NESTED"), "Combined diagnostic inputs did not preserve nested tool_hints from direct bridge_diagnostic_import input");
check(mergedDiagnosticInputDirectBridgeImportNestedSourceLength.warnings.includes("freeze_frame_available"), "Combined diagnostic inputs did not preserve nested warning_flags from direct bridge_diagnostic_import input");
check(mergedDiagnosticInputDirectBridgeImportNestedSourceLength.sourceLength === 48, "Combined diagnostic inputs did not retain nested bridgeSession source_length from direct bridge_diagnostic_import input");
const bridgeDiagnosticImportDirectNestedMetadataPreservation = obd.buildBridgeDiagnosticImport({
  importType: "bridge_diagnostic_snapshot",
  source: "local_bridge",
  next_readout_candidates: [{ id: "outer_snapshot", label: "Outer Snapshot", priority: 1, reason: "outer override" }],
  import_classification: {
    schemaVersion: "obd_response_line_classification_v1",
    bucketCounts: { storedDtcResponses: 12 }
  },
  bridgeSession: {
    codes: ["P0171"],
    next_readout_candidates: [{ id: "nested_snapshot", label: "Nested Snapshot", priority: 8, reason: "nested retained" }],
    import_classification: {
      schemaVersion: "obd_response_line_classification_v1",
      bucketCounts: { storedDtcResponses: 3 }
    }
  }
});
check(bridgeDiagnosticImportDirectNestedMetadataPreservation.nextReadoutCandidates[0]?.id === "outer_snapshot", "Bridge diagnostic import did not let direct bridge_diagnostic_import outer next_readout_candidates drive top-level metadata");
check(bridgeDiagnosticImportDirectNestedMetadataPreservation.importClassification?.bucketCounts?.storedDtcResponses === 12, "Bridge diagnostic import did not let direct bridge_diagnostic_import outer import_classification drive top-level metadata");
check(bridgeDiagnosticImportDirectNestedMetadataPreservation.bridgeSession.nextReadoutCandidates[0]?.id === "nested_snapshot", "Bridge diagnostic import did not preserve nested bridgeSession next_readout_candidates for direct bridge_diagnostic_import input");
check(bridgeDiagnosticImportDirectNestedMetadataPreservation.bridgeSession.importClassification?.bucketCounts?.storedDtcResponses === 3, "Bridge diagnostic import did not preserve nested bridgeSession import_classification for direct bridge_diagnostic_import input");
const bridgeDiagnosticImportDirectCamelNestedMetadataPreservation = obd.buildBridgeDiagnosticImport({
  importType: "bridge_diagnostic_snapshot",
  source: "local_bridge",
  nextReadoutCandidates: [{ id: "outer_camel_snapshot", label: "Outer Camel Snapshot", priority: 1, reason: "outer camel override" }],
  importClassification: {
    schemaVersion: "obd_response_line_classification_v1",
    bucketCounts: { storedDtcResponses: 14 }
  },
  bridgeSession: {
    codes: ["P0171"],
    next_readout_candidates: [{ id: "nested_snapshot", label: "Nested Snapshot", priority: 8, reason: "nested retained" }],
    import_classification: {
      schemaVersion: "obd_response_line_classification_v1",
      bucketCounts: { storedDtcResponses: 4 }
    }
  }
});
check(bridgeDiagnosticImportDirectCamelNestedMetadataPreservation.nextReadoutCandidates[0]?.id === "outer_camel_snapshot", "Bridge diagnostic import did not let direct bridgeDiagnosticImport outer nextReadoutCandidates drive top-level metadata");
check(bridgeDiagnosticImportDirectCamelNestedMetadataPreservation.importClassification?.bucketCounts?.storedDtcResponses === 14, "Bridge diagnostic import did not let direct bridgeDiagnosticImport outer importClassification drive top-level metadata");
check(bridgeDiagnosticImportDirectCamelNestedMetadataPreservation.bridgeSession.nextReadoutCandidates[0]?.id === "nested_snapshot", "Bridge diagnostic import did not preserve nested bridgeSession next_readout_candidates for direct bridgeDiagnosticImport input");
check(bridgeDiagnosticImportDirectCamelNestedMetadataPreservation.bridgeSession.importClassification?.bucketCounts?.storedDtcResponses === 4, "Bridge diagnostic import did not preserve nested bridgeSession import_classification for direct bridgeDiagnosticImport input");
const mergedDiagnosticInputSummaryOnlyMonitorCounts = obd.mergeDiagnosticInputs({
  bridge_diagnostic_import: bridgeDiagnosticImportSummaryOnlyRawWarning
});
check(mergedDiagnosticInputSummaryOnlyMonitorCounts.monitorValueSummary.totalCount === 2, "Combined diagnostic inputs did not retain monitor_value_summary without monitor_values");
check(mergedDiagnosticInputSummaryOnlyMonitorCounts.monitorValueSummary.undecodedRawCount === 2, "Combined diagnostic inputs did not retain undecoded raw count from monitor_value_summary-only input");
const mergedDiagnosticInputBridgeOnly = obd.mergeDiagnosticInputs({
  bridge_import: bridgeExportPayload
});
check(mergedDiagnosticInputBridgeOnly.source === "local_bridge", "Combined diagnostic inputs did not mark bridge-only source correctly");
const mergedDiagnosticInputBridgeMetadataOnly = obd.mergeDiagnosticInputs({
  bridge_import: {
    next_readout_candidates: [{ id: "metadata_only_snapshot", label: "Metadata Only Snapshot", priority: 3, reason: "metadata-only bridge import" }],
    tool_hints: ["CONSULT"],
    warning_flags: ["negative_obd_response_present"],
    had_sensitive_identifier: true,
    source_length: 12
  }
});
check(mergedDiagnosticInputBridgeMetadataOnly.source === "local_bridge", "Combined diagnostic inputs did not treat metadata-only bridge_import as bridge input");
check(mergedDiagnosticInputBridgeMetadataOnly.nextReadoutCandidates[0]?.id === "metadata_only_snapshot", "Combined diagnostic inputs did not preserve next_readout_candidates from metadata-only bridge_import");
check(mergedDiagnosticInputBridgeMetadataOnly.toolHints.includes("CONSULT"), "Combined diagnostic inputs did not preserve tool_hints from metadata-only bridge_import");
check(mergedDiagnosticInputBridgeMetadataOnly.warnings.includes("negative_obd_response_present"), "Combined diagnostic inputs did not preserve warning_flags from metadata-only bridge_import");
check(mergedDiagnosticInputBridgeMetadataOnly.hadSensitiveIdentifier === true, "Combined diagnostic inputs did not preserve had_sensitive_identifier from metadata-only bridge_import");
check(mergedDiagnosticInputBridgeMetadataOnly.sourceLength === 12, "Combined diagnostic inputs did not preserve source_length from metadata-only bridge_import");
const mergedDiagnosticInputBridgeApplicabilityOnly = obd.mergeDiagnosticInputs({
  bridge_import: {
    vehicle_profile: { maker: "Toyota", model: "Prius" },
    vehicle_applicability: {
      make: "Toyota",
      model: "Prius",
      model_code: "ZVW30",
      year: "2012",
      engine_code: "2ZR-FXE",
      catalog_matched: true,
      year_matched: true,
      engine_matched: true,
      model_code_matched: true
    }
  }
});
check(mergedDiagnosticInputBridgeApplicabilityOnly.source === "local_bridge", "Combined diagnostic inputs did not treat vehicle_applicability-only bridge_import as bridge input");
check(mergedDiagnosticInputBridgeApplicabilityOnly.vehicleProfile?.model === "Prius", "Combined diagnostic inputs did not preserve vehicle_profile from vehicle_applicability-only bridge_import");
check(mergedDiagnosticInputBridgeApplicabilityOnly.vehicleApplicability?.status === "matched", "Combined diagnostic inputs did not normalize vehicle_applicability-only bridge_import metadata");
const mergedDiagnosticInputBridgeInfrastructureOnly = obd.mergeDiagnosticInputs({
  bridge_import: {
    connection_status: {
      ok: true,
      blocked: false,
      would_transmit: false,
      data: { status: "ready", is_paired: false, vci_ready: true, car_connected: false }
    },
    vci_devices: [{ id: "meta-vci", name: "Metadata VCI", connected: true }],
    adapter_identity: {
      ok: true,
      blocked: false,
      would_transmit: false,
      data: { adapter: "Metadata Adapter", family: "elm327", version: "5.0" }
    }
  }
});
check(mergedDiagnosticInputBridgeInfrastructureOnly.source === "local_bridge", "Combined diagnostic inputs did not treat infrastructure-only bridge_import as bridge input");
check(mergedDiagnosticInputBridgeInfrastructureOnly.connectionStatus?.vehicleConnected === false, "Combined diagnostic inputs did not preserve connection_status from infrastructure-only bridge_import");
check(mergedDiagnosticInputBridgeInfrastructureOnly.vciDevices[0]?.id === "meta-vci", "Combined diagnostic inputs did not preserve vci_devices from infrastructure-only bridge_import");
check(mergedDiagnosticInputBridgeInfrastructureOnly.adapterIdentity?.adapterName === "Metadata Adapter", "Combined diagnostic inputs did not preserve adapter_identity from infrastructure-only bridge_import");
const mergedDiagnosticInputBridgeInfrastructureResponseOnly = obd.mergeDiagnosticInputs({
  bridge_import: {
    connection_status_response: {
      ok: true,
      blocked: false,
      would_transmit: false,
      data: { status: "ready", is_paired: true, vci_ready: true, car_connected: true }
    },
    list_vci_response: {
      ok: true,
      blocked: false,
      would_transmit: false,
      data: { items: [{ deviceId: "meta-response-vci", name: "Metadata Response VCI", isConnected: true }], selectedVciId: "meta-response-vci" }
    },
    adapter_identity_response: {
      ok: true,
      blocked: false,
      would_transmit: false,
      data: { adapter: "Metadata Response Adapter", family: "stn", version: "6.0" }
    }
  }
});
check(mergedDiagnosticInputBridgeInfrastructureResponseOnly.source === "local_bridge", "Combined diagnostic inputs did not treat infrastructure-response-only bridge_import as bridge input");
check(mergedDiagnosticInputBridgeInfrastructureResponseOnly.connectionStatus?.vehicleConnected === true, "Combined diagnostic inputs did not preserve connection_status_response from infrastructure-response-only bridge_import");
check(mergedDiagnosticInputBridgeInfrastructureResponseOnly.vciDevices[0]?.id === "meta-response-vci", "Combined diagnostic inputs did not preserve list_vci_response from infrastructure-response-only bridge_import");
check(mergedDiagnosticInputBridgeInfrastructureResponseOnly.adapterIdentity?.adapterFamily === "stn", "Combined diagnostic inputs did not preserve adapter_identity_response from infrastructure-response-only bridge_import");
const mergedDiagnosticInputBridgeTemporalOnly = obd.mergeDiagnosticInputs({
  bridge_import: {
    started_at: "2026-06-28T00:01:00Z",
    ended_at: "2026-06-28T00:02:00Z",
    captured_at: "2026-06-28T00:01:30Z",
    protocol: "ISO15765-4"
  }
});
check(mergedDiagnosticInputBridgeTemporalOnly.source === "local_bridge", "Combined diagnostic inputs did not treat temporal-only bridge_import as bridge input");
check(mergedDiagnosticInputBridgeTemporalOnly.startedAt === "2026-06-28T00:01:00Z" && mergedDiagnosticInputBridgeTemporalOnly.endedAt === "2026-06-28T00:02:00Z", "Combined diagnostic inputs did not preserve started_at or ended_at from temporal-only bridge_import");
check(mergedDiagnosticInputBridgeTemporalOnly.capturedAt === "2026-06-28T00:01:30Z", "Combined diagnostic inputs did not preserve captured_at from temporal-only bridge_import");
check(mergedDiagnosticInputBridgeTemporalOnly.protocol === "ISO15765-4", "Combined diagnostic inputs did not preserve protocol from temporal-only bridge_import");
const mergedDiagnosticInputBridgeSnapshotOnly = obd.mergeDiagnosticInputs({
  bridge_import: {
    ecu_info_snapshot: bridgeEcuInfoSnapshot,
    supported_pid_matrix: bridgeSupportedPidSnapshot
  }
});
check(mergedDiagnosticInputBridgeSnapshotOnly.source === "local_bridge", "Combined diagnostic inputs did not treat snapshot-only bridge_import as bridge input");
check(mergedDiagnosticInputBridgeSnapshotOnly.ecuInfoSnapshot?.itemCount === bridgeEcuInfoSnapshot.itemCount, "Combined diagnostic inputs did not preserve ecu_info_snapshot from snapshot-only bridge_import");
check(mergedDiagnosticInputBridgeSnapshotOnly.supportedPidMatrix?.supportedPids.includes("40"), "Combined diagnostic inputs did not preserve supported_pid_matrix from snapshot-only bridge_import");
const mergedDiagnosticInputBridgeCoreSnapshotOnly = obd.mergeDiagnosticInputs({
  bridge_import: {
    dtc_snapshot: bridgeDtcSnapshot,
    live_pid_snapshot: bridgePidSnapshot
  }
});
check(mergedDiagnosticInputBridgeCoreSnapshotOnly.source === "local_bridge", "Combined diagnostic inputs did not treat core-snapshot-only bridge_import as bridge input");
check(mergedDiagnosticInputBridgeCoreSnapshotOnly.codes.join(",") === bridgeDtcSnapshot.codes.join(","), "Combined diagnostic inputs did not preserve dtc_snapshot from core-snapshot-only bridge_import");
check(mergedDiagnosticInputBridgeCoreSnapshotOnly.monitorValues.length === bridgePidSnapshot.monitorValues.length, "Combined diagnostic inputs did not preserve live_pid_snapshot from core-snapshot-only bridge_import");
const mergedDiagnosticInputBridgeResponseAliasOnly = obd.mergeDiagnosticInputs({
  bridge_import: {
    supported_pid_snapshot: bridgeSupportedPidSnapshot,
    ecu_info_response: bridgeEcuInfoSnapshot
  }
});
check(mergedDiagnosticInputBridgeResponseAliasOnly.source === "local_bridge", "Combined diagnostic inputs did not treat response-alias-only bridge_import as bridge input");
check(mergedDiagnosticInputBridgeResponseAliasOnly.supportedPidMatrix?.supportedPids.includes("40"), "Combined diagnostic inputs did not preserve supported_pid_snapshot from response-alias-only bridge_import");
check(mergedDiagnosticInputBridgeResponseAliasOnly.ecuInfoSnapshot?.itemCount === bridgeEcuInfoSnapshot.itemCount, "Combined diagnostic inputs did not preserve ecu_info_response from response-alias-only bridge_import");
const mergedDiagnosticInputBridgeLivePidResponseOnly = obd.mergeDiagnosticInputs({
  bridge_import: {
    live_pid_response: { raw: "41 0C 1A F8 41 05 7B" },
    ecu_response_summary_response: bridgeSummary.ecuResponseSummary
  }
});
check(mergedDiagnosticInputBridgeLivePidResponseOnly.source === "local_bridge", "Combined diagnostic inputs did not treat live_pid_response-only bridge_import as bridge input");
check(mergedDiagnosticInputBridgeLivePidResponseOnly.monitorValues.find((item) => item.id === "engine_speed")?.value === 1726, "Combined diagnostic inputs did not decode live_pid_response-only bridge_import");
check(mergedDiagnosticInputBridgeLivePidResponseOnly.ecuResponseSummary?.schemaVersion === bridgeSummary.ecuResponseSummary.schemaVersion, "Combined diagnostic inputs did not preserve ecu_response_summary_response from live_pid_response-only bridge_import");
const mergedDiagnosticInputBridgeReadinessOnly = obd.mergeDiagnosticInputs({
  bridge_import: {
    readiness_snapshot: {
      blocked: false,
      protocol: "ISO9141-2",
      capturedAt: "2026-07-07T00:02:00Z",
      monitors: [{ id: "catalyst", available: true, complete: false }],
      incompleteCount: 1,
      knownMonitorCount: 1
    }
  }
});
check(mergedDiagnosticInputBridgeReadinessOnly.source === "local_bridge", "Combined diagnostic inputs did not treat readiness_snapshot-only bridge_import as bridge input");
check(mergedDiagnosticInputBridgeReadinessOnly.protocol === "ISO9141-2", "Combined diagnostic inputs did not preserve protocol from readiness_snapshot-only bridge_import");
check(mergedDiagnosticInputBridgeReadinessOnly.capturedAt === "2026-07-07T00:02:00Z", "Combined diagnostic inputs did not preserve capturedAt from readiness_snapshot-only bridge_import");
check(mergedDiagnosticInputBridgeReadinessOnly.readinessSnapshot?.incompleteCount === 1, "Combined diagnostic inputs did not preserve readiness_snapshot-only bridge_import");
const mergedDiagnosticInputBridgeFreezeFrameOnly = obd.mergeDiagnosticInputs({
  bridge_import: {
    freeze_frame_snapshot: {
      blocked: false,
      protocol: "ISO9141-2",
      capturedAt: "2026-07-07T00:02:30Z",
      trigger_dtc: "P0300",
      values: [{ pid: "0C", label: "Engine RPM", value: 900, unit: "rpm" }]
    }
  }
});
check(mergedDiagnosticInputBridgeFreezeFrameOnly.source === "local_bridge", "Combined diagnostic inputs did not treat freeze_frame_snapshot-only bridge_import as bridge input");
check(mergedDiagnosticInputBridgeFreezeFrameOnly.protocol === "ISO9141-2", "Combined diagnostic inputs did not preserve protocol from freeze_frame_snapshot-only bridge_import");
check(mergedDiagnosticInputBridgeFreezeFrameOnly.capturedAt === "2026-07-07T00:02:30Z", "Combined diagnostic inputs did not preserve capturedAt from freeze_frame_snapshot-only bridge_import");
check(mergedDiagnosticInputBridgeFreezeFrameOnly.freezeFrameSnapshot?.triggerDtc === "P0300", "Combined diagnostic inputs did not preserve freeze_frame_snapshot-only bridge_import");
const mergedDiagnosticInputBridgeSupportedPidOnly = obd.mergeDiagnosticInputs({
  bridge_import: {
    supported_pid_matrix: {
      blocked: false,
      protocol: "ISO9141-2",
      capturedAt: "2026-07-07T00:03:00Z",
      supported_pids: ["0C", "05"]
    }
  }
});
check(mergedDiagnosticInputBridgeSupportedPidOnly.source === "local_bridge", "Combined diagnostic inputs did not treat supported_pid_matrix-only bridge_import as bridge input");
check(mergedDiagnosticInputBridgeSupportedPidOnly.protocol === "ISO9141-2", "Combined diagnostic inputs did not preserve protocol from supported_pid_matrix-only bridge_import");
check(mergedDiagnosticInputBridgeSupportedPidOnly.capturedAt === "2026-07-07T00:03:00Z", "Combined diagnostic inputs did not preserve capturedAt from supported_pid_matrix-only bridge_import");
check(mergedDiagnosticInputBridgeSupportedPidOnly.supportedPidMatrix?.supportedPids.includes("0C"), "Combined diagnostic inputs did not preserve supported_pid_matrix-only bridge_import");
const mergedDiagnosticInputBridgeOnboardMonitorOnly = obd.mergeDiagnosticInputs({
  bridge_import: {
    onboard_monitor_snapshot: {
      blocked: false,
      protocol: "ISO9141-2",
      capturedAt: "2026-07-07T00:03:10Z",
      tests: [{ testId: "01", componentId: "01", value: 120, min: 100, max: 140, status: "pass" }]
    }
  }
});
check(mergedDiagnosticInputBridgeOnboardMonitorOnly.source === "local_bridge", "Combined diagnostic inputs did not treat onboard_monitor_snapshot-only bridge_import as bridge input");
check(mergedDiagnosticInputBridgeOnboardMonitorOnly.protocol === "ISO9141-2", "Combined diagnostic inputs did not preserve protocol from onboard_monitor_snapshot-only bridge_import");
check(mergedDiagnosticInputBridgeOnboardMonitorOnly.capturedAt === "2026-07-07T00:03:10Z", "Combined diagnostic inputs did not preserve capturedAt from onboard_monitor_snapshot-only bridge_import");
check(mergedDiagnosticInputBridgeOnboardMonitorOnly.onboardMonitorSnapshot?.testCount === 1, "Combined diagnostic inputs did not preserve onboard_monitor_snapshot-only bridge_import");
const mergedDiagnosticInputBridgeEcuResponseOnly = obd.mergeDiagnosticInputs({
  bridge_import: {
    ecu_response_summary: {
      capturedAt: "2026-07-07T00:03:20Z",
      protocol: "ISO9141-2",
      ecus: [{ address: "7E8", status: "ok", dtcCount: 1, services: ["03"] }]
    }
  }
});
check(mergedDiagnosticInputBridgeEcuResponseOnly.source === "local_bridge", "Combined diagnostic inputs did not treat ecu_response_summary-only bridge_import as bridge input");
check(mergedDiagnosticInputBridgeEcuResponseOnly.protocol === "ISO9141-2", "Combined diagnostic inputs did not preserve protocol from ecu_response_summary-only bridge_import");
check(mergedDiagnosticInputBridgeEcuResponseOnly.capturedAt === "2026-07-07T00:03:20Z", "Combined diagnostic inputs did not preserve capturedAt from ecu_response_summary-only bridge_import");
check(mergedDiagnosticInputBridgeEcuResponseOnly.ecuResponseSummary?.ecus[0]?.address === "7E8", "Combined diagnostic inputs did not preserve ecu_response_summary-only bridge_import");
const mergedDiagnosticInputBridgeEcuInfoOnly = obd.mergeDiagnosticInputs({
  bridge_import: {
    ecu_info_snapshot: {
      blocked: false,
      protocol: "ISO9141-2",
      capturedAt: "2026-07-07T00:03:30Z",
      items: [{ id: "calibration_id", infoType: "04", value: "CAL-ONLY-01" }]
    }
  }
});
check(mergedDiagnosticInputBridgeEcuInfoOnly.source === "local_bridge", "Combined diagnostic inputs did not treat ecu_info_snapshot-only bridge_import as bridge input");
check(mergedDiagnosticInputBridgeEcuInfoOnly.protocol === "ISO9141-2", "Combined diagnostic inputs did not preserve protocol from ecu_info_snapshot-only bridge_import");
check(mergedDiagnosticInputBridgeEcuInfoOnly.capturedAt === "2026-07-07T00:03:30Z", "Combined diagnostic inputs did not preserve capturedAt from ecu_info_snapshot-only bridge_import");
check(mergedDiagnosticInputBridgeEcuInfoOnly.ecuInfoSnapshot?.items.find((item) => item.id === "calibration_id")?.value === "CAL-ONLY-01", "Combined diagnostic inputs did not preserve ecu_info_snapshot-only bridge_import");
const mergedDiagnosticInputBridgeParts = obd.mergeDiagnosticInputs({
  scanner_text: "P0171",
  bridge_parts: {
    dtc_snapshot: bridgeDtcSnapshot,
    live_pid_snapshot: bridgePidSnapshot,
    freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
    readiness_snapshot: bridgeReadinessSnapshot,
    ecu_info_snapshot: bridgeEcuInfoSnapshot,
    onboard_monitor_snapshot: bridgeOnboardMonitorSnapshot,
    supported_pid_matrix: bridgeSupportedPidSnapshot,
    connection_status: bridgeStatus,
    vci_devices: bridgeVciList.devices,
    adapter_identity: bridgeAdapterIdentity,
    ecu_response_summary: bridgeSummary.ecuResponseSummary
  }
});
check(mergedDiagnosticInputBridgeParts.bridgeSession?.adapterIdentity?.adapterFamily === "elm327", "Combined diagnostic inputs did not accept bridge_parts alias input");
check(mergedDiagnosticInputBridgeParts.supportedPidMatrix?.supportedPids.includes("40"), "Combined diagnostic inputs did not carry supported_pid_matrix from bridge_parts alias input");
const mergedDiagnosticInputSupportedPidReason = obd.mergeDiagnosticInputs({
  bridge_import: {
    vehicle_profile: { maker: "Toyota", model: "Prius" },
    vehicle_applicability: vehicleApplicabilitySample,
    dtc_snapshot: bridgeDtcSnapshot,
    freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
    readiness_snapshot: bridgeReadinessSnapshot,
    ecu_info_snapshot: bridgeEcuInfoSnapshot,
    supported_pid_matrix: bridgeSupportedPidSnapshot
  }
});
const scanSessionFromMergedSupportedPidReason = obd.buildDiagnosticScanSession({
  session_id: "merged-supported-pid-reason",
  scan_session: mergedDiagnosticInputSupportedPidReason
});
check(scanSessionFromMergedSupportedPidReason.nextReadoutCandidates.find((item) => item.id === "live_pid_snapshot")?.reason === "対応PID実測確認のため再確認候補", "Diagnostic scan session did not preserve live_pid_snapshot reason from merged diagnostic input");
const scanSessionFromMergedDiagnosticInput = obd.buildDiagnosticScanSession({
  session_id: "merged-diagnostic-input-scan-session",
  scan_session: mergedDiagnosticInputExportNestedOuterOverride
});
check(scanSessionFromMergedDiagnosticInput.sessionId === "merged-diagnostic-input-scan-session", "Diagnostic scan session did not let outer session_id override merged diagnostic input nested alias");
check(scanSessionFromMergedDiagnosticInput.protocol === "ISO9141-2", "Diagnostic scan session did not preserve protocol from merged diagnostic input");
check(scanSessionFromMergedDiagnosticInput.vehicleProfile?.model === "Outer Porte", "Diagnostic scan session did not preserve vehicle_profile from merged diagnostic input");
check(scanSessionFromMergedDiagnosticInput.vehicleApplicability?.status === "partial", "Diagnostic scan session did not preserve vehicle_applicability from merged diagnostic input");
check(scanSessionFromMergedDiagnosticInput.connectionStatus?.vehicleConnected === false, "Diagnostic scan session did not preserve connection_status override from merged diagnostic input");
check(scanSessionFromMergedDiagnosticInput.readoutCoverage?.capturedPercent === 29, "Diagnostic scan session did not preserve readout_coverage from merged diagnostic input");
check(scanSessionFromMergedDiagnosticInput.freezeFrameSnapshot?.triggerDtc === "P0420", "Diagnostic scan session did not preserve freeze_frame_snapshot override from merged diagnostic input");
check(scanSessionFromMergedDiagnosticInput.readinessSnapshot?.incompleteCount === 0, "Diagnostic scan session did not preserve readiness_snapshot override from merged diagnostic input");
check(scanSessionFromMergedDiagnosticInput.supportedPidMatrix?.supportedPids.join(",") === "0C,0D", "Diagnostic scan session did not preserve supported_pid_matrix override from merged diagnostic input");
check(scanSessionFromMergedDiagnosticInput.ecuInfoSnapshot?.items?.[0]?.value === "Outer Override ECU", "Diagnostic scan session did not preserve ecu_info_snapshot from merged diagnostic input");
check(scanSessionFromMergedDiagnosticInput.nextReadoutCandidates?.[0]?.id === mergedDiagnosticInputExportNestedOuterOverride.nextReadoutCandidates?.[0]?.id, "Diagnostic scan session did not preserve next_readout_candidates from merged diagnostic input");
check(scanSessionFromMergedDiagnosticInput.warnings.includes("freeze_frame_available"), "Diagnostic scan session did not preserve warnings from merged diagnostic input");
check(scanSessionFromMergedDiagnosticInput.source === "scanner_text_and_local_bridge", "Diagnostic scan session did not preserve source from merged diagnostic input");
check(scanSessionFromMergedDiagnosticInput.toolHints.join(",") === mergedDiagnosticInputExportNestedOuterOverride.toolHints.join(","), "Diagnostic scan session did not preserve toolHints from merged diagnostic input");
check(scanSessionFromMergedDiagnosticInput.hadSensitiveIdentifier === true, "Diagnostic scan session did not preserve hadSensitiveIdentifier from merged diagnostic input");
check(scanSessionFromMergedDiagnosticInput.sourceLength === mergedDiagnosticInputExportNestedOuterOverride.sourceLength, "Diagnostic scan session did not preserve sourceLength from merged diagnostic input");
check(scanSessionFromMergedDiagnosticInput.importClassification?.bucketCounts?.storedDtcResponses === mergedDiagnosticInputExportNestedOuterOverride.importClassification?.bucketCounts?.storedDtcResponses, "Diagnostic scan session did not preserve importClassification from merged diagnostic input");
const scanSessionFromMergedDiagnosticInputMetadataOverride = obd.buildDiagnosticScanSession({
  session_id: "merged-diagnostic-input-metadata-override",
  warnings: ["isotp_reassembly_issue"],
  toolHints: ["IDS"],
  sourceLength: 0,
  hadSensitiveIdentifier: false,
  scan_session: mergedDiagnosticInputExportNestedOuterOverride
});
check(scanSessionFromMergedDiagnosticInputMetadataOverride.warnings.includes("isotp_reassembly_issue") && scanSessionFromMergedDiagnosticInputMetadataOverride.warnings.includes("freeze_frame_available"), "Diagnostic scan session did not merge outer warnings with merged diagnostic input metadata");
check(scanSessionFromMergedDiagnosticInputMetadataOverride.toolHints.includes("IDS") && scanSessionFromMergedDiagnosticInputMetadataOverride.toolHints.includes("Techstream"), "Diagnostic scan session did not merge outer toolHints with merged diagnostic input metadata");
check(scanSessionFromMergedDiagnosticInputMetadataOverride.sourceLength === 0, "Diagnostic scan session did not let outer sourceLength=0 override merged diagnostic input metadata");
check(scanSessionFromMergedDiagnosticInputMetadataOverride.hadSensitiveIdentifier === true, "Diagnostic scan session did not preserve nested hadSensitiveIdentifier when outer override was false");
const scanSessionFromMergedDiagnosticInputMixedCamelOuterSnakeNestedMetadata = obd.buildDiagnosticScanSession({
  sessionId: "merged-diagnostic-input-mixed-camel-outer-snake-nested",
  warnings: ["isotp_reassembly_issue"],
  toolHints: ["IDS"],
  sourceLength: 7,
  hadSensitiveIdentifier: false,
  importClassification: {
    schemaVersion: "obd_response_line_classification_v1",
    bucketCounts: { storedDtcResponses: 20 }
  },
  scan_session: {
    ...mergedDiagnosticInputExportNestedOuterOverride,
    started_at: "2026-06-28T00:05:30Z",
    ended_at: "2026-06-28T00:06:30Z",
    captured_at: "2026-06-28T00:11:45Z",
    tool_hints: ["Techstream"],
    warning_flags: ["freeze_frame_available"],
    source_length: 128,
    had_sensitive_identifier: true
  }
});
check(scanSessionFromMergedDiagnosticInputMixedCamelOuterSnakeNestedMetadata.sessionId === "merged-diagnostic-input-mixed-camel-outer-snake-nested", "Diagnostic scan session did not preserve camelCase outer sessionId over nested snake_case merged diagnostic input metadata");
check(scanSessionFromMergedDiagnosticInputMixedCamelOuterSnakeNestedMetadata.startedAt === "2026-06-28T00:05:30Z" && scanSessionFromMergedDiagnosticInputMixedCamelOuterSnakeNestedMetadata.endedAt === "2026-06-28T00:06:30Z", "Diagnostic scan session did not accept nested snake_case merged diagnostic input timestamps with camelCase outer metadata");
check(scanSessionFromMergedDiagnosticInputMixedCamelOuterSnakeNestedMetadata.capturedAt === "2026-06-28T00:11:45Z", "Diagnostic scan session did not accept nested snake_case captured_at with camelCase outer metadata");
check(scanSessionFromMergedDiagnosticInputMixedCamelOuterSnakeNestedMetadata.warnings.includes("isotp_reassembly_issue") && scanSessionFromMergedDiagnosticInputMixedCamelOuterSnakeNestedMetadata.warnings.includes("freeze_frame_available"), "Diagnostic scan session did not merge camelCase outer warnings with nested snake_case merged diagnostic input metadata");
check(scanSessionFromMergedDiagnosticInputMixedCamelOuterSnakeNestedMetadata.toolHints.includes("IDS") && scanSessionFromMergedDiagnosticInputMixedCamelOuterSnakeNestedMetadata.toolHints.includes("Techstream"), "Diagnostic scan session did not merge camelCase outer toolHints with nested snake_case merged diagnostic input metadata");
check(scanSessionFromMergedDiagnosticInputMixedCamelOuterSnakeNestedMetadata.sourceLength === 7, "Diagnostic scan session did not preserve camelCase outer sourceLength over nested snake_case merged diagnostic input metadata");
check(scanSessionFromMergedDiagnosticInputMixedCamelOuterSnakeNestedMetadata.hadSensitiveIdentifier === true, "Diagnostic scan session did not preserve nested snake_case hadSensitiveIdentifier when outer camelCase override was false");
check(scanSessionFromMergedDiagnosticInputMixedCamelOuterSnakeNestedMetadata.importClassification?.bucketCounts?.storedDtcResponses === 20, "Diagnostic scan session did not preserve camelCase outer importClassification over nested snake_case merged diagnostic input metadata");
const scanSessionFromMergedDiagnosticInputMixedSnakeOuterCamelNestedMetadata = obd.buildDiagnosticScanSession({
  session_id: "merged-diagnostic-input-mixed-snake-outer-camel-nested",
  warnings: ["isotp_reassembly_issue"],
  tool_hints: ["IDS"],
  source_length: 8,
  had_sensitive_identifier: false,
  import_classification: {
    schemaVersion: "obd_response_line_classification_v1",
    bucketCounts: { storedDtcResponses: 21 }
  },
  scanSession: {
    ...mergedDiagnosticInputExportNestedOuterOverride,
    startedAt: "2026-06-28T00:05:45Z",
    endedAt: "2026-06-28T00:06:45Z",
    capturedAt: "2026-06-28T00:11:46Z",
    toolHints: ["Techstream"],
    warningFlags: ["freeze_frame_available"],
    sourceLength: 128,
    hadSensitiveIdentifier: true
  }
});
check(scanSessionFromMergedDiagnosticInputMixedSnakeOuterCamelNestedMetadata.sessionId === "merged-diagnostic-input-mixed-snake-outer-camel-nested", "Diagnostic scan session did not preserve snake_case outer session_id over nested camelCase merged diagnostic input metadata");
check(scanSessionFromMergedDiagnosticInputMixedSnakeOuterCamelNestedMetadata.startedAt === "2026-06-28T00:05:45Z" && scanSessionFromMergedDiagnosticInputMixedSnakeOuterCamelNestedMetadata.endedAt === "2026-06-28T00:06:45Z", "Diagnostic scan session did not accept nested camelCase merged diagnostic input timestamps with snake_case outer metadata");
check(scanSessionFromMergedDiagnosticInputMixedSnakeOuterCamelNestedMetadata.capturedAt === "2026-06-28T00:11:46Z", "Diagnostic scan session did not accept nested camelCase capturedAt with snake_case outer metadata");
check(scanSessionFromMergedDiagnosticInputMixedSnakeOuterCamelNestedMetadata.warnings.includes("isotp_reassembly_issue") && scanSessionFromMergedDiagnosticInputMixedSnakeOuterCamelNestedMetadata.warnings.includes("freeze_frame_available"), "Diagnostic scan session did not merge snake_case outer warnings with nested camelCase merged diagnostic input metadata");
check(scanSessionFromMergedDiagnosticInputMixedSnakeOuterCamelNestedMetadata.toolHints.includes("IDS") && scanSessionFromMergedDiagnosticInputMixedSnakeOuterCamelNestedMetadata.toolHints.includes("Techstream"), "Diagnostic scan session did not merge snake_case outer tool_hints with nested camelCase merged diagnostic input metadata");
check(scanSessionFromMergedDiagnosticInputMixedSnakeOuterCamelNestedMetadata.sourceLength === 8, "Diagnostic scan session did not preserve snake_case outer source_length over nested camelCase merged diagnostic input metadata");
check(scanSessionFromMergedDiagnosticInputMixedSnakeOuterCamelNestedMetadata.hadSensitiveIdentifier === true, "Diagnostic scan session did not preserve nested camelCase hadSensitiveIdentifier when outer snake_case override was false");
check(scanSessionFromMergedDiagnosticInputMixedSnakeOuterCamelNestedMetadata.importClassification?.bucketCounts?.storedDtcResponses === 21, "Diagnostic scan session did not preserve snake_case outer import_classification over nested camelCase merged diagnostic input metadata");
const emptyReadoutCoverage = obd.buildReadoutCoverageSnapshot();
check(emptyReadoutCoverage.progressPercent === 0, "Empty readout coverage did not stay at zero without captured data");
check(emptyReadoutCoverage.capturedPercent === 0, "Empty readout coverage did not keep capturedPercent at zero");
const normalizedLegacyReadoutCoverage = obd.normalizeReadoutCoverageSnapshot({
  schemaVersion: "readout_coverage_v1",
  totalCategories: 7,
  availableCategories: 7,
  capturedCategories: 2,
  emptyCategories: 5,
  missingCategories: 0
});
check(normalizedLegacyReadoutCoverage.capturedPercent === 29, "Legacy readout coverage did not backfill capturedPercent");
check(normalizedLegacyReadoutCoverage.progressPercent === 100, "Legacy readout coverage did not preserve progressPercent");
check(emptyReadoutCoverage.capturedCategories === 0 && emptyReadoutCoverage.emptyCategories === 0, "Empty readout coverage counted missing data as captured or empty");
check(emptyReadoutCoverage.missingLabels.includes("ECU情報") && emptyReadoutCoverage.missingLabels.includes("Mode06"), "Empty readout coverage missing labels are incomplete");
const aliasReadoutCoverage = obd.buildReadoutCoverageSnapshot({
  connection_status: bridgeStatus,
  vci_list: bridgeVciList,
  adapter_identity: bridgeAdapterIdentity,
  dtc_snapshot: bridgeDtcSnapshot,
  live_pid_snapshot: bridgePidSnapshot,
  freeze_frame_response: bridgeFreezeFrameSnapshot,
  readiness_response: bridgeReadinessSnapshot,
  ecu_info_response: bridgeEcuInfoSnapshot,
  onboard_monitor_response: bridgeOnboardMonitorSnapshot,
  supported_pid_snapshot: bridgeSupportedPidSnapshot
});
check(aliasReadoutCoverage.progressPercent >= 80, "Readout coverage did not accept snake_case alias inputs");
check(aliasReadoutCoverage.items.some((item) => item.id === "vci_devices" && item.count === 1), "Readout coverage did not count vci_list alias input");
check(aliasReadoutCoverage.items.some((item) => item.id === "freeze_frame_snapshot" && item.count === 2), "Readout coverage did not accept freeze_frame_response alias input");
check(aliasReadoutCoverage.items.some((item) => item.id === "supported_pid_matrix" && item.count >= 2), "Readout coverage did not accept supported_pid_snapshot alias input");
const nonInfrastructureAliasReadoutCoverage = obd.buildReadoutCoverageSnapshot({
  includeInfrastructure: false,
  connection_status: bridgeStatus,
  vci_list: bridgeVciList,
  adapter_identity: bridgeAdapterIdentity,
  dtc_snapshot: bridgeDtcSnapshot,
  readiness_response: bridgeReadinessSnapshot
});
check(nonInfrastructureAliasReadoutCoverage.includeInfrastructure === false, "Readout coverage did not preserve includeInfrastructure false for alias inputs");
check(!nonInfrastructureAliasReadoutCoverage.items.some((item) => item.id === "connection_status" || item.id === "vci_devices" || item.id === "adapter_identity"), "Readout coverage counted bridge infrastructure despite includeInfrastructure false");
check(nonInfrastructureAliasReadoutCoverage.items.some((item) => item.id === "dtc_snapshot" && item.count >= 1), "Readout coverage dropped core alias inputs when infrastructure was disabled");
const camelResponseReadoutCoverage = obd.buildReadoutCoverageSnapshot({
  connectionStatusResponse: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { status: "ready", is_paired: true, vci_ready: true, car_connected: true }
  },
  listVciResponse: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { items: [{ deviceId: "coverage-camel-vci", name: "Coverage Camel VCI", isConnected: true }], selectedVciId: "coverage-camel-vci" }
  },
  adapterIdentityResponse: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { adapter: "Coverage Camel Adapter", family: "stn", version: "7.7" }
  },
  freezeFrameResponse: bridgeFreezeFrameSnapshot,
  readinessResponse: bridgeReadinessSnapshot,
  ecuInfoResponse: bridgeEcuInfoSnapshot,
  onboardMonitorResponse: bridgeOnboardMonitorSnapshot,
  supportedPidSnapshot: bridgeSupportedPidSnapshot
});
check(camelResponseReadoutCoverage.includeInfrastructure === true, "Readout coverage did not infer infrastructure from camelCase response aliases");
check(camelResponseReadoutCoverage.items.some((item) => item.id === "connection_status" && item.count === 1), "Readout coverage did not count connectionStatusResponse camelCase alias input");
check(camelResponseReadoutCoverage.items.some((item) => item.id === "vci_devices" && item.count === 1), "Readout coverage did not count listVciResponse camelCase alias input");
check(camelResponseReadoutCoverage.items.some((item) => item.id === "adapter_identity" && item.count === 1), "Readout coverage did not count adapterIdentityResponse camelCase alias input");
check(camelResponseReadoutCoverage.items.some((item) => item.id === "freeze_frame_snapshot" && item.count === 2), "Readout coverage did not accept freezeFrameResponse camelCase alias input");
const infrastructureHeavyReadoutCoverage = obd.buildReadoutCoverageSnapshot({
  includeInfrastructure: true,
  connectionStatus: { displayStatus: "ready" },
  vciDevices: [{ id: "vci-1" }],
  adapterIdentity: { adapterFamily: "elm327" },
  dtcSnapshot: { blocked: false, codes: [] },
  livePidSnapshot: { blocked: false, monitorValues: [], supportedPids: [], monitorValueSummary: { totalCount: 0, decodedCount: 0, undecodedRawCount: 0, numericCount: 0, textCount: 0 } },
  freezeFrameSnapshot: { monitorValues: [], monitorValueSummary: { totalCount: 0, decodedCount: 0, undecodedRawCount: 0, numericCount: 0, textCount: 0 } },
  readinessSnapshot: { monitors: [], incompleteCount: 0 },
  ecuInfoSnapshot: { itemCount: 0, keyItemSummary: { missingCount: 0 } },
  onboardMonitorSnapshot: { tests: [], failedCount: 0 },
  supportedPidMatrix: { supportedPids: [], supportedCount: 0 }
});
const infrastructureHeavyNextReadoutCandidates = obd.buildNextReadoutCandidates(infrastructureHeavyReadoutCoverage, {});
check(infrastructureHeavyNextReadoutCandidates.length === 5, "Next readout candidates should keep the top five prioritized items");
check(!infrastructureHeavyNextReadoutCandidates.some((item) => item.id === "connection_status" || item.id === "vci_devices" || item.id === "adapter_identity"), "Next readout candidates let bridge infrastructure displace core readouts");
const populatedScanSession = obd.buildDiagnosticScanSession({
  session_id: "coverage-check",
  dtcSnapshot: bridgeDtcSnapshot,
  livePidSnapshot: bridgePidSnapshot,
  freezeFrameSnapshot: bridgeFreezeFrameSnapshot,
  readinessSnapshot: bridgeReadinessSnapshot,
  ecuInfoSnapshot: bridgeEcuInfoSnapshot,
  onboardMonitorSnapshot: bridgeOnboardMonitorSnapshot,
  supportedPidMatrix: bridgeSupportedPidSnapshot,
  connectionStatus: bridgeStatus,
  vciList: bridgeVciList,
  adapterIdentity: bridgeAdapterIdentity
});
check(populatedScanSession.readoutCoverage.progressPercent >= 90, "Diagnostic scan session did not build readout coverage");
check(populatedScanSession.readoutCoverage.missingCategories === 0, "Diagnostic scan session readout coverage marked populated data as missing");
check(populatedScanSession.readoutCoverage.emptyCategories === 0, "Diagnostic scan session counted missing readout sections as empty");
check(!populatedScanSession.warnings.includes("bridge_readout_incomplete"), "Diagnostic scan session warned about incomplete readout sections despite complete inputs");
check(populatedScanSession.coreSessionStatus?.completionPercent === 100, "Diagnostic scan session did not report full coreSessionStatus completion for populated inputs");
check(populatedScanSession.coreSessionStatus?.readyForAnalysis === true, "Diagnostic scan session did not mark populated inputs as ready for analysis");
check(Array.isArray(populatedScanSession.coreSessionStatus?.remainingReadoutIds) && populatedScanSession.coreSessionStatus.remainingReadoutIds.length === 0, "Diagnostic scan session did not clear remaining core readouts for populated inputs");
check(Array.isArray(populatedScanSession.coreSessionStatus?.emptyReadoutIds) && populatedScanSession.coreSessionStatus.emptyReadoutIds.length === 0, "Diagnostic scan session did not clear emptyReadoutIds for populated inputs");
const emptyReadoutScanSession = obd.buildDiagnosticScanSession({
  session_id: "shop-test-empty-readout-scan-session",
  dtcSnapshot: { blocked: false, capturedAt: "2026-07-06T00:00:00Z", codes: [], dtcs: [] },
  freezeFrameSnapshot: { blocked: false, capturedAt: "2026-07-06T00:00:01Z", monitorValues: [] },
  readinessSnapshot: { blocked: false, capturedAt: "2026-07-06T00:00:02Z", monitors: [], monitorCount: 0 },
  ecuInfoSnapshot: { blocked: false, capturedAt: "2026-07-06T00:00:03Z", items: [], itemCount: 0 },
  supportedPidMatrix: { blocked: false, capturedAt: "2026-07-06T00:00:04Z", supportedPids: [], supportedCount: 0 },
  onboardMonitorSnapshot: { blocked: false, capturedAt: "2026-07-06T00:00:05Z", tests: [], testCount: 0 },
  livePidSnapshot: { blocked: false, capturedAt: "2026-07-06T00:00:06Z", monitorValues: [] }
});
check(Array.isArray(emptyReadoutScanSession.coreSessionStatus?.remainingReadoutIds) && emptyReadoutScanSession.coreSessionStatus.remainingReadoutIds.length === 0, "Diagnostic scan session treated empty but completed core readouts as missing");
check(Array.isArray(emptyReadoutScanSession.coreSessionStatus?.emptyReadoutIds) && emptyReadoutScanSession.coreSessionStatus.emptyReadoutIds.length === 7, "Diagnostic scan session did not expose emptyReadoutIds for completed empty core readouts");
check(emptyReadoutScanSession.coreSessionStatus?.readyForAnalysis === false, "Diagnostic scan session treated empty completed core readouts as ready for analysis");
check(emptyReadoutScanSession.coreSessionStatus?.status === "collecting_readouts", "Diagnostic scan session did not keep empty completed core readouts in collecting_readouts status");
check(emptyReadoutScanSession.coreSessionStatus?.applicabilityStatus === "unknown", "Diagnostic scan session did not expose unknown applicability status when vehicle applicability is absent");
check(emptyReadoutScanSession.coreSessionStatus?.nextRecommendedReadoutId === "dtc_snapshot", "Diagnostic scan session did not prioritize dtc_snapshot for completed empty core readouts without vehicle applicability");
const emptyManualApplicabilityScanSession = obd.buildDiagnosticScanSession({
  session_id: "shop-test-empty-manual-applicability-scan-session",
  vehicle_applicability: { status: "manual" },
  dtcSnapshot: { blocked: false, capturedAt: "2026-07-06T00:01:00Z", codes: [], dtcs: [] },
  freezeFrameSnapshot: { blocked: false, capturedAt: "2026-07-06T00:01:01Z", monitorValues: [] },
  readinessSnapshot: { blocked: false, capturedAt: "2026-07-06T00:01:02Z", monitors: [], monitorCount: 0 },
  ecuInfoSnapshot: { blocked: false, capturedAt: "2026-07-06T00:01:03Z", items: [], itemCount: 0 },
  supportedPidMatrix: { blocked: false, capturedAt: "2026-07-06T00:01:04Z", supportedPids: [], supportedCount: 0 },
  livePidSnapshot: { blocked: false, capturedAt: "2026-07-06T00:01:05Z", monitorValues: [] }
});
check(emptyManualApplicabilityScanSession.coreSessionStatus?.nextRecommendedReadoutId === "ecu_info_snapshot", "Diagnostic scan session did not prioritize ecu_info_snapshot for completed empty manual-applicability core readouts");
check(emptyManualApplicabilityScanSession.coreSessionStatus?.blockingWarningIds?.includes("vehicle_profile_manual"), "Diagnostic scan session did not surface vehicle_profile_manual as a blocking warning for manual applicability");
check(emptyManualApplicabilityScanSession.nextReadoutCandidates[0]?.id === "ecu_info_snapshot" && emptyManualApplicabilityScanSession.nextReadoutCandidates[1]?.id === "dtc_snapshot", "Diagnostic scan session did not keep manual applicability next readout candidate fallback order");
const emptyUnlistedApplicabilityScanSession = obd.buildDiagnosticScanSession({
  session_id: "shop-test-empty-unlisted-applicability-scan-session",
  vehicle_applicability: { status: "unlisted" },
  dtcSnapshot: { blocked: false, capturedAt: "2026-07-06T00:02:00Z", codes: [], dtcs: [] },
  freezeFrameSnapshot: { blocked: false, capturedAt: "2026-07-06T00:02:01Z", monitorValues: [] },
  readinessSnapshot: { blocked: false, capturedAt: "2026-07-06T00:02:02Z", monitors: [], monitorCount: 0 },
  ecuInfoSnapshot: { blocked: false, capturedAt: "2026-07-06T00:02:03Z", items: [], itemCount: 0 },
  supportedPidMatrix: { blocked: false, capturedAt: "2026-07-06T00:02:04Z", supportedPids: [], supportedCount: 0 },
  livePidSnapshot: { blocked: false, capturedAt: "2026-07-06T00:02:05Z", monitorValues: [] }
});
check(emptyUnlistedApplicabilityScanSession.coreSessionStatus?.blockingWarningIds?.includes("vehicle_applicability_unlisted"), "Diagnostic scan session did not surface vehicle_applicability_unlisted as a blocking warning for unlisted applicability");
check(emptyUnlistedApplicabilityScanSession.nextReadoutCandidates[0]?.id === "ecu_info_snapshot" && emptyUnlistedApplicabilityScanSession.nextReadoutCandidates[1]?.id === "dtc_snapshot", "Diagnostic scan session did not keep unlisted applicability next readout candidate fallback order");
const decodedStoredDtc = obd.decodeObdDtcResponse({ raw: "43 01 71 03 00 00 00", protocol: "ISO15765-4" });
check(decodedStoredDtc.codes.join(",") === "P0171,P0300", "OBD保存DTC応答をDTCコードへデコードできません");
check(decodedStoredDtc.retainedRawText === false, "OBD DTCデコードが原文保持になっています");
const decodedPendingDtc = obd.decodeObdDtcResponse({ raw: "47 01 71 00 00" });
const decodedPermanentDtc = obd.decodeObdDtcResponse({ raw: "4A 03 00 00 00" });
check(decodedPendingDtc.dtcs.find((item) => item.code === "P0171")?.status === "pending", "保留DTC種別を保持できません");
check(decodedPermanentDtc.dtcs.find((item) => item.code === "P0300")?.status === "permanent", "永久DTC種別を保持できません");
const mergedDtcSnapshot = obd.mergeDtcSnapshots(decodedStoredDtc, decodedPendingDtc, decodedPermanentDtc);
check(mergedDtcSnapshot.dtcs.some((item) => item.code === "P0171" && item.status === "stored"), "保存DTCを統合できません");
check(mergedDtcSnapshot.dtcs.some((item) => item.code === "P0171" && item.status === "pending"), "保留DTCを統合できません");
check(mergedDtcSnapshot.dtcs.some((item) => item.code === "P0300" && item.status === "permanent"), "永久DTCを統合できません");
const decodedSupportedPids = obd.decodeSupportedPidResponse({ raw: "41 00 18 18 00 01 41 20 80 00 00 01" });
check(decodedSupportedPids.supportedPids.includes("04") && decodedSupportedPids.supportedPids.includes("0C"), "対応PIDビットマップをデコードできません");
check(decodedSupportedPids.supportedPids.includes("20") && decodedSupportedPids.supportedPids.includes("21") && decodedSupportedPids.supportedPids.includes("40"), "複数レンジの対応PIDビットマップをデコードできません");
check(decodedSupportedPids.supportedCount >= 4, "対応PIDマトリクスへ対応状態を反映できません");
const ignoredNonBitmapPid = obd.decodeSupportedPidResponse({ raw: "41 0C 1A F8 41 05 7B" });
check(ignoredNonBitmapPid.supportedPids.length === 0, "ライブPID応答を対応PIDビットマップとして誤読しています");
const decodedLivePids = obd.decodeLivePidResponse({ raw: "41 01 82 07 22 00 41 03 01 00 41 12 02 41 13 31 41 1D 55 41 1E 01 41 1C 06 41 51 04 41 14 80 90 41 24 80 00 20 00 41 34 80 00 7F 00 41 0C 1A F8 41 05 7B 41 0D 28 41 42 34 98 41 11 80 41 21 01 F4 41 22 03 E8 41 23 00 C8 41 2F 99 41 30 05 41 31 00 64 41 32 FF 38 41 33 64 41 3C 13 88 41 43 01 FE 41 44 80 00 41 45 40 41 46 5A 41 47 99 41 48 66 41 49 80 41 4A 40 41 4B C0 41 4C 20 41 4D 00 3C 41 4E 00 78 41 52 80 41 5C 64 41 5D 69 80 41 5E 00 C8 41 61 87 41 62 82 41 63 01 F4 41 64 7D 82 87 8C 91 41 69 80 90 41 6A 66 41 6C 99 41 84 5A 41 8C 80 41 8E 7B 41 A6 00 01 E2 40" });
check(decodedLivePids.monitorValues.find((item) => item.id === "engine_speed")?.value === 1726, "回転数PIDをデコードできません");
check(decodedLivePids.monitorValues.find((item) => item.id === "coolant_temp")?.value === 83, "冷却水温PIDをデコードできません");
check(decodedLivePids.monitorValues.find((item) => item.id === "vehicle_speed")?.value === 40, "車速PIDをデコードできません");
check(decodedLivePids.monitorValues.find((item) => item.id === "control_module_voltage")?.value === 13.464, "制御モジュール電圧PIDをデコードできません");
const livePayloadWithHeaderByte = obd.decodeLivePidResponse({ raw: "41 42 41 00 41 0D 28" });
check(livePayloadWithHeaderByte.monitorValues.find((item) => item.id === "control_module_voltage")?.value === 16.64, "ライブPIDペイロード内の41を応答ヘッダとして誤読しています");
check(livePayloadWithHeaderByte.monitorValues.find((item) => item.id === "vehicle_speed")?.value === 40, "ライブPIDペイロード後の次PIDを読み進められません");
const liveUnknownLengthTextPid = obd.decodeLivePidResponse({ raw: "41 65 01 02 41 0D 28" });
check(liveUnknownLengthTextPid.monitorValues.find((item) => item.id === "auxiliary_io_supported")?.value === "01 02", "長さ未定義の状態系PIDを値として保持できません");
check(liveUnknownLengthTextPid.monitorValues.find((item) => item.id === "vehicle_speed")?.value === 40, "長さ未定義PIDの後続PIDを読み進められません");
const liveUndecodedNumberPid = obd.decodeLivePidResponse({ raw: "41 75 01 90 41 7A 00 64 41 0D 28" });
check(liveUndecodedNumberPid.monitorValues.find((item) => item.id === "turbo_temp")?.value === "01 90", "式未実装の数値PIDをRAW値として保持できません");
check(liveUndecodedNumberPid.monitorValues.find((item) => item.id === "turbo_temp")?.decoded === false, "式未実装の数値PIDに未換算フラグがありません");
check(liveUndecodedNumberPid.monitorValues.find((item) => item.id === "dpf_differential_pressure")?.value === "00 64", "DPF系の式未実装PIDをRAW値として保持できません");
check(liveUndecodedNumberPid.monitorValues.find((item) => item.id === "vehicle_speed")?.value === 40, "式未実装PIDの後続PIDを読み進められません");
check(liveUndecodedNumberPid.monitorValueSummary.undecodedRawCount === 2, "ライブPIDの未換算RAW件数を集計できません");
check(decodedLivePids.monitorValues.find((item) => item.id === "monitor_status")?.value === "mil_on;dtc_count=2;ignition=spark", "Monitor status PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "monitor_status_mil")?.value === "mil_on", "Monitor status MIL value was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "monitor_status_dtc_count")?.value === 2, "Monitor status DTC count was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "monitor_status_ignition_type")?.value === "spark", "Monitor status ignition type was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "fuel_system_status")?.value === "closed_loop_using_oxygen_sensor", "Fuel system status PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "fuel_system_status_bank1")?.value === "closed_loop_using_oxygen_sensor", "Fuel system bank 1 status PID was not decoded");
check(!decodedLivePids.monitorValues.some((item) => item.id === "fuel_system_status_bank2"), "Fuel system bank 2 status should not be decoded when byte B is unused");
check(decodedLivePids.monitorValues.find((item) => item.id === "secondary_air_status")?.value === "downstream_of_catalytic_converter", "Secondary air status PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "oxygen_sensors_present")?.value === "b1s1,b2s1,b2s2", "O2 sensor location PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "oxygen_sensors_present_4banks")?.value === "b1s1,b2s1,b3s1,b4s1", "Four-bank O2 sensor location PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "auxiliary_input_status")?.value === "pto_active", "Auxiliary input status PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "obd_standard")?.value === "eobd", "OBD standard PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "fuel_type")?.value === "diesel", "Fuel type PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "o2_b1s1_voltage")?.value === 0.64, "O2 sensor voltage PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "o2_b1s1_stft")?.value === 12.5, "O2 sensor short trim PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "wide_o2_b1s1_ratio")?.value === 1, "Wide O2 voltage-style equivalence ratio PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "wide_o2_b1s1_voltage_wide")?.value === 1, "Wide O2 voltage-style voltage PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "wide_o2_b1s1_current_ratio")?.value === 1, "Wide O2 current-style equivalence ratio PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "wide_o2_b1s1_current")?.value === -1, "Wide O2 current PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "throttle_position")?.value === 50.196, "Throttle PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "distance_with_mil")?.value === 500, "Distance-with-MIL PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "fuel_rail_pressure_vacuum")?.value === 79, "Fuel rail pressure vacuum PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "fuel_rail_pressure")?.value === 2000, "Fuel rail pressure PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "fuel_level")?.value === 60, "Fuel level PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "warmups_since_clear")?.value === 5, "Warmups since clear PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "distance_since_clear")?.value === 100, "Distance since clear PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "evap_vapor_pressure")?.value === -50, "EVAP vapor pressure PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "barometric_pressure")?.value === 100, "Barometric pressure PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "catalyst_temp_b1s1")?.value === 460, "Catalyst temperature PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "absolute_load")?.value === 200, "Absolute load PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "commanded_equivalence_ratio")?.value === 1, "Commanded equivalence ratio PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "relative_throttle_position")?.value === 25.098, "Relative throttle PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "ambient_air_temp")?.value === 50, "Ambient air temperature PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "absolute_throttle_b")?.value === 60, "Absolute throttle B PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "absolute_throttle_c")?.value === 40, "Absolute throttle C PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "accelerator_position_d")?.value === 50.196, "Accelerator position D PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "accelerator_position_e")?.value === 25.098, "Accelerator position E PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "accelerator_position_f")?.value === 75.294, "Accelerator position F PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "commanded_throttle_actuator")?.value === 12.549, "Commanded throttle actuator PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "time_with_mil")?.value === 60, "Time with MIL PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "time_since_clear")?.value === 120, "Time since clear PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "ethanol_percentage")?.value === 50.196, "Ethanol percentage PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "engine_oil_temp")?.value === 60, "Engine oil temperature PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "fuel_injection_timing")?.value === 1, "Fuel injection timing PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "engine_fuel_rate")?.value === 10, "Engine fuel rate PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "driver_demand_torque")?.value === 10, "Driver demand torque PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "actual_engine_torque")?.value === 5, "Actual engine torque PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "engine_reference_torque")?.value === 500, "Engine reference torque PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "engine_percent_torque_idle")?.value === 0, "Engine percent torque idle point was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "engine_percent_torque_point1")?.value === 5, "Engine percent torque point 1 was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "engine_percent_torque_point2")?.value === 10, "Engine percent torque point 2 was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "engine_percent_torque_point3")?.value === 15, "Engine percent torque point 3 was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "engine_percent_torque_point4")?.value === 20, "Engine percent torque point 4 was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "commanded_egr_pid69")?.value === 50.196, "PID 69 commanded EGR was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "egr_error_pid69")?.value === 12.5, "PID 69 EGR error was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "commanded_diesel_intake_air_flow")?.value === 40, "Commanded diesel intake air flow PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "commanded_throttle_control")?.value === 60, "Commanded throttle control PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "manifold_surface_temp")?.value === 50, "Manifold surface temperature PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "commanded_throttle_actuator_control")?.value === 50.196, "Commanded throttle actuator control PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "engine_friction_torque")?.value === -2, "Engine friction torque PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "odometer")?.value === 12345.6, "ECU odometer PID was not decoded");
check(decodedLivePids.wouldTransmit === false && decodedLivePids.retainedRawText === false, "ライブPIDデコードが送信または原文保持扱いです");
const decodedFreezeFrame = obd.decodeFreezeFrameResponse({ raw: "42 02 00 01 71 42 01 00 82 07 22 00 42 03 00 01 00 42 24 00 80 00 20 00 42 0C 00 1A F8 42 05 00 7B" });
check(decodedFreezeFrame.triggerDtc === "P0171", "フリーズフレーム応答から起点DTCをデコードできません");
check(decodedFreezeFrame.monitorValues.find((item) => item.id === "monitor_status_dtc_count")?.value === 2, "フリーズフレームのモニター状態DTC件数をデコードできません");
check(decodedFreezeFrame.monitorValues.find((item) => item.id === "fuel_system_status_bank1")?.value === "closed_loop_using_oxygen_sensor", "フリーズフレームの燃料制御状態をバンク別にデコードできません");
check(decodedFreezeFrame.monitorValues.find((item) => item.id === "wide_o2_b1s1_voltage_wide")?.value === 1, "フリーズフレームのワイドO2電圧をデコードできません");
check(decodedFreezeFrame.monitorValues.find((item) => item.id === "wide_o2_b1s1_voltage_wide")?.freezeFrameNumber === 0, "フリーズフレーム番号を保持できません");
check(decodedFreezeFrame.monitorValues.find((item) => item.id === "engine_speed")?.value === 1726, "フリーズフレーム回転数をデコードできません");
check(decodedFreezeFrame.monitorValues.find((item) => item.id === "coolant_temp")?.value === 83, "フリーズフレーム水温をデコードできません");
const freezePayloadWithHeaderByte = obd.decodeFreezeFrameResponse({ raw: "42 42 00 42 00 42 0D 00 28" });
check(freezePayloadWithHeaderByte.monitorValues.find((item) => item.id === "control_module_voltage")?.value === 16.896, "フリーズフレームペイロード内の42を応答ヘッダとして誤読しています");
check(freezePayloadWithHeaderByte.monitorValues.find((item) => item.id === "vehicle_speed")?.value === 40, "フリーズフレームペイロード後の次PIDを読み進められません");
const freezeUnknownLengthTextPid = obd.decodeFreezeFrameResponse({ raw: "42 65 00 01 02 42 0D 00 28" });
check(freezeUnknownLengthTextPid.monitorValues.find((item) => item.id === "auxiliary_io_supported")?.value === "01 02", "フリーズフレームで長さ未定義の状態系PIDを値として保持できません");
check(freezeUnknownLengthTextPid.monitorValues.find((item) => item.id === "vehicle_speed")?.value === 40, "フリーズフレームで長さ未定義PIDの後続PIDを読み進められません");
const freezeUndecodedNumberPid = obd.decodeFreezeFrameResponse({ raw: "42 75 00 01 90 42 0D 00 28" });
check(freezeUndecodedNumberPid.monitorValues.find((item) => item.id === "turbo_temp")?.value === "01 90", "フリーズフレームで式未実装の数値PIDをRAW値として保持できません");
check(freezeUndecodedNumberPid.monitorValues.find((item) => item.id === "vehicle_speed")?.value === 40, "フリーズフレームで式未実装PIDの後続PIDを読み進められません");
check(freezeUndecodedNumberPid.monitorValueSummary.undecodedRawCount === 1, "フリーズフレームの未換算RAW件数を集計できません");
check(decodedFreezeFrame.retainedRawText === false, "フリーズフレームデコードが原文保持になっています");
const decodedEcuInfo = obd.decodeEcuInfoResponse({ raw: "49 02 01 4A 54 44 4B 4E 33 44 55 30 41 30 31 32 33 34 35 36 49 04 01 43 41 4C 2D 31 32 33 34 49 0A 01 45 6E 67 69 6E 65 20 45 43 55" });
check(decodedEcuInfo.hadSensitiveIdentifier === true, "Mode 09 VINを識別情報として検出できません");
check(!JSON.stringify(decodedEcuInfo).includes("JTDKN3DU0A0123456"), "Mode 09デコードにVIN生値が残っています");
check(decodedEcuInfo.items.find((item) => item.id === "calibration_id")?.value === "CAL-1234", "Mode 09 CALIDをデコードできません");
check(decodedEcuInfo.items.find((item) => item.id === "ecu_name")?.value === "Engine ECU", "Mode 09 ECU名をデコードできません");
const decodedSupportedTypes = obd.decodeEcuInfoResponse({ raw: "49 00 01 55 60 00 00 49 04 01 43 41 4C 2D 31 32 33 34" });
check(decodedSupportedTypes.supportInfoTypesCaptured === true, "Mode 09 type 00 was not marked as captured");
check(decodedSupportedTypes.supportInfoTypesSummary.labels.includes("キャリブレーションID") && decodedSupportedTypes.supportInfoTypesSummary.labels.includes("ECU名"), "Mode 09 type 00 support summary was not decoded");
const decodedReadiness = obd.decodeReadinessResponse({ raw: "41 01 81 07 22 00" });
check(decodedReadiness.milOn === true, "レディネス応答からMIL状態を読めません");
check(decodedReadiness.monitors.find((item) => item.id === "catalyst")?.complete === false, "触媒レディネス未完了をデコードできません");
check(decodedReadiness.monitors.find((item) => item.id === "evaporative_system")?.supported === false, "EVAPレディネス対応ビットをデコードできません");
check(decodedReadiness.retainedRawText === false, "レディネスデコードが原文保持になっています");
const decodedOnboardMonitor = obd.decodeOnboardMonitorResponse({ raw: "46 01 01 00 64 00 32 00 C8 46 02 01 01 2C 00 32 00 C8" });
check(decodedOnboardMonitor.schemaVersion === "onboard_monitor_snapshot_v1", "Mode 06 snapshot schema is invalid");
check(decodedOnboardMonitor.testCount === 2, "Mode 06 test count is invalid");
check(decodedOnboardMonitor.tests.find((item) => item.testId === "01" && item.componentId === "01")?.status === "pass", "Mode 06 pass status was not decoded");
check(decodedOnboardMonitor.tests.find((item) => item.testId === "02" && item.componentId === "01")?.status === "fail", "Mode 06 fail status was not decoded");
check(decodedOnboardMonitor.failedCount === 1, "Mode 06 failed count is invalid");
check(decodedOnboardMonitor.retainedRawText === false, "Mode 06 decoder retained raw text");
const decodedScanSession = obd.buildDecodedObdScanSession({
  session_id: "decoded-test",
  storedDtcResponse: { raw: "43 01 71 03 00 00 00" },
  pendingDtcResponse: { raw: "47 01 71 00 00" },
  permanentDtcResponse: { raw: "4A 03 00 00 00" },
  supportedPidResponse: { raw: "41 00 18 18 00 01 41 20 80 00 00 01" },
  livePidResponse: { raw: "41 0C 1A F8 41 05 7B" },
  freezeFrameResponse: { raw: "42 02 00 01 71 42 24 00 80 00 20 00 42 0C 00 1A F8" },
  readinessResponse: { raw: "41 01 81 07 22 00" },
  onboardMonitorResponse: { raw: "46 01 01 00 64 00 32 00 C8" },
  ecuInfoResponse: { raw: "49 04 01 43 41 4C 2D 31 32 33 34" }
});
check(decodedScanSession.schemaVersion === "scan_session_v1", "デコード済みOBDセッション形式が不正です");
check(decodedScanSession.dtcSnapshot.codes.includes("P0171"), "デコード済みOBDセッションへDTCを統合できません");
check(decodedScanSession.dtcSnapshot.dtcs.some((item) => item.status === "pending"), "デコード済みOBDセッションへ保留DTCを統合できません");
check(decodedScanSession.dtcSnapshot.dtcs.some((item) => item.status === "permanent"), "デコード済みOBDセッションへ永久DTCを統合できません");
check(decodedScanSession.supportedPidMatrix.supportedPids.includes("40"), "デコード済みOBDセッションへ複数レンジ対応PIDを統合できません");
check(decodedScanSession.livePidSnapshot.monitorValues.find((item) => item.id === "engine_speed")?.value === 1726, "デコード済みOBDセッションへライブPIDを統合できません");
check(decodedScanSession.freezeFrameSnapshot.triggerDtc === "P0171", "デコード済みOBDセッションへフリーズフレームを統合できません");
check(decodedScanSession.freezeFrameSnapshot.monitorValues.find((item) => item.id === "wide_o2_b1s1_voltage_wide")?.freezeFrameNumber === 0, "デコード済みOBDセッションでフリーズフレーム番号を保持できません");
check(decodedScanSession.readinessSnapshot.milOn === true, "デコード済みOBDセッションへレディネスを統合できません");
check(decodedScanSession.onboardMonitorSnapshot.testCount === 1, "デコード済みOBDセッションへMode 06を統合できません");
check(decodedScanSession.ecuInfoSnapshot.items.find((item) => item.id === "calibration_id")?.value === "CAL-1234", "デコード済みOBDセッションへECU情報を統合できません");
check(decodedScanSession.diagnosticFlowSummary?.schemaVersion === "diagnostic_flow_summary_v1", "Decoded OBD session did not expose diagnosticFlowSummary");
check(decodedScanSession.diagnosticFlowSummary?.stage === "diagnostic_core", "Decoded OBD session did not expose diagnosticFlowSummary stage");
const decodedScanSessionAliasInputs = obd.buildDecodedObdScanSession({
  session_id: "decoded-alias-test",
  started_at: "2026-06-28T00:12:00Z",
  ended_at: "2026-06-28T00:13:00Z",
  vehicle_profile: { maker: "Toyota", model: "Prius" },
  stored_dtc_response: { raw: "43 01 71 03 00 00 00" },
  pending_dtc_response: { raw: "47 01 71 00 00" },
  permanent_dtc_response: { raw: "4A 03 00 00 00" },
  supported_pid_response: { raw: "41 00 18 18 00 01 41 20 80 00 00 01" },
  live_pid_response: { raw: "41 0C 1A F8 41 05 7B" },
  freeze_frame_response: { raw: "42 02 00 01 71 42 24 00 80 00 20 00 42 0C 00 1A F8" },
  readiness_response: { raw: "41 01 81 07 22 00" },
  onboard_monitor_response: { raw: "46 01 01 00 64 00 32 00 C8" },
  ecu_info_response: { raw: "49 04 01 43 41 4C 2D 31 32 33 34" }
});
check(decodedScanSessionAliasInputs.dtcSnapshot.codes.includes("P0171"), "Decoded OBD session did not accept stored_dtc_response alias input");
check(decodedScanSessionAliasInputs.supportedPidMatrix.supportedPids.includes("40"), "Decoded OBD session did not accept supported_pid_response alias input");
check(decodedScanSessionAliasInputs.onboardMonitorSnapshot.testCount === 1, "Decoded OBD session did not accept onboard_monitor_response alias input");
check(decodedScanSessionAliasInputs.startedAt === "2026-06-28T00:12:00Z" && decodedScanSessionAliasInputs.endedAt === "2026-06-28T00:13:00Z", "Decoded OBD session did not accept started_at or ended_at alias input");
check(decodedScanSessionAliasInputs.vehicleProfile?.model === "Prius", "Decoded OBD session did not accept vehicle_profile alias input");
const decodedScanSessionDirectMixedVehicleMetadata = obd.buildDecodedObdScanSession({
  sessionId: "decoded-mixed-vehicle-meta",
  vehicleProfile: { maker: "Toyota", model: "Mixed Axio" },
  vehicle_applicability: vehicleApplicabilitySample,
  stored_dtc_response: { raw: "43 01 71 03 00 00 00" }
});
check(decodedScanSessionDirectMixedVehicleMetadata.sessionId === "decoded-mixed-vehicle-meta", "Decoded OBD session did not preserve mixed-case direct sessionId input");
check(decodedScanSessionDirectMixedVehicleMetadata.vehicleProfile?.model === "Mixed Axio", "Decoded OBD session did not preserve mixed-case direct vehicleProfile input");
check(decodedScanSessionDirectMixedVehicleMetadata.vehicleApplicability?.status === "matched", "Decoded OBD session did not preserve mixed-case direct vehicle_applicability input");
const decodedScanSessionEcuResponsesAlias = obd.buildDecodedObdScanSession({
  session_id: "decoded-ecu-responses-alias-test",
  stored_dtc_response: { raw: "43 01 71 03 00 00 00" },
  ecu_responses: [{ ecu: "7E8", status: "ok", dtcs: ["P0171"] }]
});
check(decodedScanSessionEcuResponsesAlias.ecuResponseSummary.ecus[0]?.dtcCount === 1, "Decoded OBD session did not accept ecu_responses alias input");
const decodedScanSessionSnapshotAlias = obd.buildDecodedObdScanSession({
  session_id: "decoded-snapshot-alias-test",
  dtc_snapshot: bridgeDtcSnapshot,
  live_pid_response: { raw: "41 0C 1A F8" }
});
check(decodedScanSessionSnapshotAlias.dtcSnapshot.codes.join(",") === "P0171,P0300", "Decoded OBD session did not accept dtc_snapshot alias input");
const decodedScanSessionSnapshotSet = obd.buildDecodedObdScanSession({
  session_id: "decoded-snapshot-set-test",
  dtc_snapshot: bridgeDtcSnapshot,
  live_pid_snapshot: bridgePidSnapshot,
  freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
  readiness_snapshot: bridgeReadinessSnapshot,
  onboard_monitor_snapshot: bridgeOnboardMonitorSnapshot,
  ecu_info_snapshot: bridgeEcuInfoSnapshot,
  supported_pid_matrix: bridgeSupportedPidSnapshot
});
check(decodedScanSessionSnapshotSet.livePidSnapshot.monitorValues.length === bridgePidSnapshot.monitorValues.length, "Decoded OBD session did not accept live_pid_snapshot alias input");
check(decodedScanSessionSnapshotSet.freezeFrameSnapshot.triggerDtc === "P0171", "Decoded OBD session did not accept freeze_frame_snapshot alias input");
check(decodedScanSessionSnapshotSet.readinessSnapshot.incompleteCount === 1, "Decoded OBD session did not accept readiness_snapshot alias input");
check(decodedScanSessionSnapshotSet.onboardMonitorSnapshot.failedCount === 1, "Decoded OBD session did not accept onboard_monitor_snapshot alias input");
check(decodedScanSessionSnapshotSet.ecuInfoSnapshot.itemCount === bridgeEcuInfoSnapshot.itemCount, "Decoded OBD session did not accept ecu_info_snapshot alias input");
check(decodedScanSessionSnapshotSet.supportedPidMatrix.supportedPids.includes("40"), "Decoded OBD session did not accept supported_pid_matrix alias input");
const decodedScanSessionSupportedPidReason = obd.buildDecodedObdScanSession({
  session_id: "decoded-supported-pid-reason",
  vehicle_applicability: vehicleApplicabilitySample,
  dtc_snapshot: bridgeDtcSnapshot,
  freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
  readiness_snapshot: bridgeReadinessSnapshot,
  ecu_info_snapshot: bridgeEcuInfoSnapshot,
  supported_pid_matrix: bridgeSupportedPidSnapshot
});
check(decodedScanSessionSupportedPidReason.nextReadoutCandidates.find((item) => item.id === "live_pid_snapshot")?.reason === "対応PID実測確認のため再確認候補", "Decoded OBD session did not derive live_pid_snapshot reason from supported_pid_matrix");
const decodedScanSessionUnknownApplicability = obd.buildDecodedObdScanSession({
  session_id: "decoded-unknown-applicability",
  dtc_snapshot: { blocked: false, capturedAt: "2026-07-06T00:10:00Z", codes: [], dtcs: [] },
  freeze_frame_snapshot: { blocked: false, capturedAt: "2026-07-06T00:10:01Z", monitorValues: [] },
  readiness_snapshot: { blocked: false, capturedAt: "2026-07-06T00:10:02Z", monitors: [], monitorCount: 0 },
  ecu_info_snapshot: { blocked: false, capturedAt: "2026-07-06T00:10:03Z", items: [], itemCount: 0 },
  supported_pid_matrix: { blocked: false, capturedAt: "2026-07-06T00:10:04Z", supportedPids: [], supportedCount: 0 },
  live_pid_snapshot: { blocked: false, capturedAt: "2026-07-06T00:10:05Z", monitorValues: [] }
});
check(decodedScanSessionUnknownApplicability.coreSessionStatus?.applicabilityStatus === "unknown", "Decoded OBD session did not default missing vehicle applicability to unknown");
check(decodedScanSessionUnknownApplicability.coreSessionStatus?.nextRecommendedReadoutId === "dtc_snapshot", "Decoded OBD session did not prioritize dtc_snapshot when vehicle applicability is absent");
const decodedScanSessionNestedAlias = obd.buildDecodedObdScanSession({
  scan_session: {
    session_id: "decoded-nested-session-test",
    vehicle_profile: { maker: "Toyota", model: "Yaris" },
    stored_dtc_response: { raw: "43 01 71 03 00 00 00" },
    supported_pid_response: { raw: "41 00 18 18 00 01 41 20 80 00 00 01" },
    readiness_response: { raw: "41 01 81 07 22 00" },
    ecu_info_response: { raw: "49 04 01 43 41 4C 2D 31 32 33 34" }
  }
});
check(decodedScanSessionNestedAlias.dtcSnapshot.codes.includes("P0171"), "Decoded OBD session did not accept scan_session nested DTC alias input");
check(decodedScanSessionNestedAlias.supportedPidMatrix.supportedPids.includes("40"), "Decoded OBD session did not accept scan_session nested supported_pid alias input");
check(decodedScanSessionNestedAlias.readinessSnapshot.incompleteCount === 1, "Decoded OBD session did not accept scan_session nested readiness alias input");
check(decodedScanSessionNestedAlias.vehicleProfile?.model === "Yaris", "Decoded OBD session did not carry vehicle_profile from scan_session nested alias input");
const decodedScanSessionNestedCamelResponseAliases = obd.buildDecodedObdScanSession({
  scanSession: {
    sessionId: "decoded-camel-nested",
    vehicleProfile: { maker: "Toyota", model: "Axio" },
    livePidResponse: { raw: "41 0C 1A F8 41 05 7B" },
    supportedPidResponse: { raw: "41 00 18 18 00 01 41 20 80 00 00 01" },
    readinessResponse: { raw: "41 01 81 07 22 00" },
    onboardMonitorResponse: { raw: "46 01 01 00 64 00 32 00 C8" }
  }
});
check(decodedScanSessionNestedCamelResponseAliases.livePidSnapshot.monitorValues.find((item) => item.id === "engine_speed")?.value === 1726, "Decoded OBD session did not decode livePidResponse from scanSession camelCase alias input");
check(decodedScanSessionNestedCamelResponseAliases.supportedPidMatrix.supportedPids.includes("40"), "Decoded OBD session did not accept supportedPidResponse from scanSession camelCase alias input");
check(decodedScanSessionNestedCamelResponseAliases.readinessSnapshot.incompleteCount === 1, "Decoded OBD session did not accept readinessResponse from scanSession camelCase alias input");
check(decodedScanSessionNestedCamelResponseAliases.onboardMonitorSnapshot.testCount === 1, "Decoded OBD session did not accept onboardMonitorResponse from scanSession camelCase alias input");
check(decodedScanSessionNestedCamelResponseAliases.vehicleProfile?.model === "Axio", "Decoded OBD session did not carry vehicleProfile from scanSession camelCase alias input");
check(decodedScanSessionNestedCamelResponseAliases.sessionId === "decoded-camel-nested", "Decoded OBD session did not carry sessionId from scanSession camelCase alias input");
const decodedScanSessionNestedCoreOverrides = obd.buildDecodedObdScanSession({
  scan_session: {
    session_id: "decoded-nested-core-overrides",
    stored_dtc_response: { raw: "43 01 71 03 00 00 00" },
    vehicle_applicability: vehicleApplicabilitySample,
    readout_coverage: legacyReadoutCoverage,
    freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
    readiness_snapshot: bridgeReadinessSnapshot,
    ecu_info_snapshot: bridgeEcuInfoSnapshot
  }
});
check(decodedScanSessionNestedCoreOverrides.vehicleApplicability?.status === "matched", "Decoded OBD session did not carry vehicle_applicability from scan_session nested alias input");
check(decodedScanSessionNestedCoreOverrides.readoutCoverage?.capturedPercent === 29, "Decoded OBD session did not carry readout_coverage from scan_session nested alias input");
check(decodedScanSessionNestedCoreOverrides.freezeFrameSnapshot?.triggerDtc === "P0171", "Decoded OBD session did not carry freeze_frame_snapshot from scan_session nested alias input");
check(decodedScanSessionNestedCoreOverrides.readinessSnapshot?.incompleteCount === 1, "Decoded OBD session did not carry readiness_snapshot from scan_session nested alias input");
check(decodedScanSessionNestedCoreOverrides.ecuInfoSnapshot?.itemCount === bridgeEcuInfoSnapshot.itemCount, "Decoded OBD session did not carry ecu_info_snapshot from scan_session nested alias input");
const decodedScanSessionNestedImportClassification = obd.buildDecodedObdScanSession({
  scan_session: {
    session_id: "decoded-nested-import-classification",
    stored_dtc_response: { raw: "43 01 71 03 00 00 00" },
    import_classification: {
      schemaVersion: "obd_response_line_classification_v1",
      bucketCounts: { storedDtcResponses: 5 }
    }
  }
});
check(decodedScanSessionNestedImportClassification.importClassification?.bucketCounts?.storedDtcResponses === 5, "Decoded OBD session did not carry import_classification from scan_session nested alias input");
const decodedScanSessionNestedOuterOverride = obd.buildDecodedObdScanSession({
  session_id: "decoded-outer-override",
  protocol: "ISO9141-2",
  vehicle_profile: { maker: "Toyota", model: "Auris" },
  scan_session: {
    session_id: "decoded-nested-session-test",
    protocol: "ISO15765-4",
    vehicle_profile: { maker: "Toyota", model: "Yaris" },
    stored_dtc_response: { raw: "43 01 71 03 00 00 00" }
  }
});
check(decodedScanSessionNestedOuterOverride.sessionId === "decoded-outer-override", "Decoded OBD session did not let outer session_id override scan_session nested alias input");
check(decodedScanSessionNestedOuterOverride.protocol === "ISO9141-2", "Decoded OBD session did not let outer protocol override scan_session nested alias input");
check(decodedScanSessionNestedOuterOverride.vehicleProfile?.model === "Auris", "Decoded OBD session did not let outer vehicle_profile override scan_session nested alias input");
const decodedScanSessionNestedOuterCoreOverride = obd.buildDecodedObdScanSession({
  session_id: "decoded-outer-core-override",
  stored_dtc_response: { raw: "43 01 71 03 00 00 00" },
  vehicle_applicability: vehicleApplicabilityPartialSample,
  readout_coverage: legacyReadoutCoverage,
  freeze_frame_snapshot: outerOverrideFreezeFrameSnapshot,
  readiness_snapshot: outerOverrideReadinessSnapshot,
  ecu_info_snapshot: outerOverrideEcuInfoSnapshot,
  scan_session: {
    vehicle_applicability: vehicleApplicabilitySample,
    readout_coverage: bridgeSummary.readoutCoverage,
    freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
    readiness_snapshot: bridgeReadinessSnapshot,
    ecu_info_snapshot: bridgeEcuInfoSnapshot
  }
});
check(decodedScanSessionNestedOuterCoreOverride.vehicleApplicability?.status === "partial", "Decoded OBD session did not let outer vehicle_applicability override scan_session nested alias input");
check(decodedScanSessionNestedOuterCoreOverride.readoutCoverage?.capturedPercent === 29, "Decoded OBD session did not let outer readout_coverage override scan_session nested alias input");
check(decodedScanSessionNestedOuterCoreOverride.freezeFrameSnapshot?.triggerDtc === "P0420", "Decoded OBD session did not let outer freeze_frame_snapshot override scan_session nested alias input");
check(decodedScanSessionNestedOuterCoreOverride.readinessSnapshot?.incompleteCount === 0, "Decoded OBD session did not let outer readiness_snapshot override scan_session nested alias input");
check(decodedScanSessionNestedOuterCoreOverride.ecuInfoSnapshot?.items?.[0]?.value === "Outer Override ECU", "Decoded OBD session did not let outer ecu_info_snapshot override scan_session nested alias input");
const decodedScanSessionNestedOuterImportClassificationOverride = obd.buildDecodedObdScanSession({
  session_id: "decoded-outer-import-classification-override",
  stored_dtc_response: { raw: "43 01 71 03 00 00 00" },
  import_classification: {
    schemaVersion: "obd_response_line_classification_v1",
    bucketCounts: { storedDtcResponses: 9 }
  },
  scan_session: {
    import_classification: {
      schemaVersion: "obd_response_line_classification_v1",
      bucketCounts: { storedDtcResponses: 2 }
    }
  }
});
check(decodedScanSessionNestedOuterImportClassificationOverride.importClassification?.bucketCounts?.storedDtcResponses === 9, "Decoded OBD session did not let outer import_classification override scan_session nested alias input");
const decodedScanSessionNestedOuterMetadataOverride = obd.buildDecodedObdScanSession({
  session_id: "decoded-outer-metadata-override",
  stored_dtc_response: { raw: "43 01 71 03 00 00 00" },
  tool_hints: ["CONSULT"],
  warning_flags: ["negative_obd_response_present"],
  source_length: 0,
  had_sensitive_identifier: false,
  scan_session: {
    tool_hints: ["Techstream"],
    warning_flags: ["freeze_frame_available"],
    source_length: 128,
    had_sensitive_identifier: true
  }
});
check(decodedScanSessionNestedOuterMetadataOverride.toolHints.includes("CONSULT") && decodedScanSessionNestedOuterMetadataOverride.toolHints.includes("Techstream"), "Decoded OBD session did not merge outer tool_hints with scan_session nested alias input");
check(decodedScanSessionNestedOuterMetadataOverride.warnings.includes("negative_obd_response_present") && decodedScanSessionNestedOuterMetadataOverride.warnings.includes("freeze_frame_available"), "Decoded OBD session did not merge outer warning_flags with scan_session nested alias input");
check(decodedScanSessionNestedOuterMetadataOverride.sourceLength === 0, "Decoded OBD session did not let outer source_length override scan_session nested alias input");
check(decodedScanSessionNestedOuterMetadataOverride.hadSensitiveIdentifier === true, "Decoded OBD session did not preserve nested sensitive identifier when outer scan_session nested alias input set false");
check(decodedScanSession.wouldTransmit === false && decodedScanSession.retainedRawFrames === false, "デコード済みOBDセッションが送信または生フレーム保持扱いです");
const decodedScanSessionMixedCamelOuterSnakeNestedMetadata = obd.buildDecodedObdScanSession({
  sessionId: "decoded-mixed-camel-outer-snake-nested",
  stored_dtc_response: { raw: "43 01 71 03 00 00 00" },
  toolHints: ["CONSULT"],
  warningFlags: ["negative_obd_response_present"],
  sourceLength: 7,
  hadSensitiveIdentifier: false,
  importClassification: {
    schemaVersion: "obd_response_line_classification_v1",
    bucketCounts: { storedDtcResponses: 18 }
  },
  scan_session: {
    started_at: "2026-06-28T00:12:30Z",
    ended_at: "2026-06-28T00:13:30Z",
    captured_at: "2026-06-28T00:13:00Z",
    tool_hints: ["Techstream"],
    warning_flags: ["freeze_frame_available"],
    source_length: 128,
    had_sensitive_identifier: true
  }
});
check(decodedScanSessionMixedCamelOuterSnakeNestedMetadata.sessionId === "decoded-mixed-camel-outer-snake-nested", "Decoded OBD session did not preserve camelCase outer sessionId over nested snake_case scan_session input");
check(decodedScanSessionMixedCamelOuterSnakeNestedMetadata.startedAt === "2026-06-28T00:12:30Z" && decodedScanSessionMixedCamelOuterSnakeNestedMetadata.endedAt === "2026-06-28T00:13:30Z", "Decoded OBD session did not accept nested snake_case scan_session timestamps with camelCase outer metadata");
check(decodedScanSessionMixedCamelOuterSnakeNestedMetadata.capturedAt === "2026-06-28T00:13:00Z", "Decoded OBD session did not accept nested snake_case captured_at with camelCase outer metadata");
check(decodedScanSessionMixedCamelOuterSnakeNestedMetadata.toolHints.includes("CONSULT") && decodedScanSessionMixedCamelOuterSnakeNestedMetadata.toolHints.includes("Techstream"), "Decoded OBD session did not merge camelCase outer toolHints with nested snake_case scan_session input");
check(decodedScanSessionMixedCamelOuterSnakeNestedMetadata.warnings.includes("negative_obd_response_present") && decodedScanSessionMixedCamelOuterSnakeNestedMetadata.warnings.includes("freeze_frame_available"), "Decoded OBD session did not merge camelCase outer warningFlags with nested snake_case scan_session input");
check(decodedScanSessionMixedCamelOuterSnakeNestedMetadata.sourceLength === 7, "Decoded OBD session did not preserve camelCase outer sourceLength over nested snake_case scan_session input");
check(decodedScanSessionMixedCamelOuterSnakeNestedMetadata.hadSensitiveIdentifier === true, "Decoded OBD session did not preserve nested snake_case sensitive identifier when outer camelCase value was false");
check(decodedScanSessionMixedCamelOuterSnakeNestedMetadata.importClassification?.bucketCounts?.storedDtcResponses === 18, "Decoded OBD session did not preserve camelCase outer importClassification over nested snake_case scan_session input");
const decodedScanSessionMixedSnakeOuterCamelNestedMetadata = obd.buildDecodedObdScanSession({
  session_id: "decoded-mixed-snake-outer-camel-nested",
  stored_dtc_response: { raw: "43 01 71 03 00 00 00" },
  tool_hints: ["CONSULT"],
  warning_flags: ["negative_obd_response_present"],
  source_length: 8,
  had_sensitive_identifier: false,
  import_classification: {
    schemaVersion: "obd_response_line_classification_v1",
    bucketCounts: { storedDtcResponses: 19 }
  },
  scanSession: {
    startedAt: "2026-06-28T00:12:45Z",
    endedAt: "2026-06-28T00:13:45Z",
    capturedAt: "2026-06-28T00:13:15Z",
    toolHints: ["Techstream"],
    warningFlags: ["freeze_frame_available"],
    sourceLength: 128,
    hadSensitiveIdentifier: true
  }
});
check(decodedScanSessionMixedSnakeOuterCamelNestedMetadata.sessionId === "decoded-mixed-snake-outer-camel-nested", "Decoded OBD session did not preserve snake_case outer session_id over nested camelCase scanSession input");
check(decodedScanSessionMixedSnakeOuterCamelNestedMetadata.startedAt === "2026-06-28T00:12:45Z" && decodedScanSessionMixedSnakeOuterCamelNestedMetadata.endedAt === "2026-06-28T00:13:45Z", "Decoded OBD session did not accept nested camelCase scanSession timestamps with snake_case outer metadata");
check(decodedScanSessionMixedSnakeOuterCamelNestedMetadata.capturedAt === "2026-06-28T00:13:15Z", "Decoded OBD session did not accept nested camelCase capturedAt with snake_case outer metadata");
check(decodedScanSessionMixedSnakeOuterCamelNestedMetadata.toolHints.includes("CONSULT") && decodedScanSessionMixedSnakeOuterCamelNestedMetadata.toolHints.includes("Techstream"), "Decoded OBD session did not merge snake_case outer tool_hints with nested camelCase scanSession input");
check(decodedScanSessionMixedSnakeOuterCamelNestedMetadata.warnings.includes("negative_obd_response_present") && decodedScanSessionMixedSnakeOuterCamelNestedMetadata.warnings.includes("freeze_frame_available"), "Decoded OBD session did not merge snake_case outer warning_flags with nested camelCase scanSession input");
check(decodedScanSessionMixedSnakeOuterCamelNestedMetadata.sourceLength === 8, "Decoded OBD session did not preserve snake_case outer source_length over nested camelCase scanSession input");
check(decodedScanSessionMixedSnakeOuterCamelNestedMetadata.hadSensitiveIdentifier === true, "Decoded OBD session did not preserve nested camelCase sensitive identifier when outer snake_case value was false");
check(decodedScanSessionMixedSnakeOuterCamelNestedMetadata.importClassification?.bucketCounts?.storedDtcResponses === 19, "Decoded OBD session did not preserve snake_case outer import_classification over nested camelCase scanSession input");
const decodedScanSessionPlainCoverageOverride = obd.buildDecodedObdScanSession({
  session_id: "decoded-plain-coverage-override",
  stored_dtc_response: { raw: "43 01 71 03 00 00 00" },
  readout_coverage: {
    includeInfrastructure: false,
    items: [
      { id: "live_pid_snapshot", status: "captured", available: true, count: 3 },
      { id: "freeze_frame_snapshot", status: "captured", available: true, count: 1 },
      { id: "readiness_snapshot", status: "captured", available: true, count: 1 }
    ],
    missingIds: ["ecu_info_snapshot", "onboard_monitor_snapshot", "supported_pid_matrix"]
  }
});
check(decodedScanSessionPlainCoverageOverride.readoutCoverage.includeInfrastructure === false, "Decoded OBD session did not preserve plain-object includeInfrastructure override");
check(!decodedScanSessionPlainCoverageOverride.warnings.includes("bridge_readout_incomplete") && !decodedScanSessionPlainCoverageOverride.warnings.includes("bridge_readout_empty_sections"), "Decoded OBD session emitted bridge readout warnings when plain-object coverage disabled infrastructure");
const decodedScanSessionExplicitCoverageAndCandidates = obd.buildDecodedObdScanSession({
  session_id: "decoded-explicit-coverage-candidates",
  stored_dtc_response: { raw: "43 01 71 03 00 00 00" },
  readout_coverage: legacyReadoutCoverage,
  next_readout_candidates: [{ id: "custom_decoded_snapshot", label: "Decoded Snapshot", priority: 1, reason: "outer override" }]
});
check(decodedScanSessionExplicitCoverageAndCandidates.readoutCoverage?.capturedPercent === 29, "Decoded OBD session did not preserve explicit readout_coverage input");
check(decodedScanSessionExplicitCoverageAndCandidates.nextReadoutCandidates[0]?.id === "custom_decoded_snapshot", "Decoded OBD session did not preserve explicit next_readout_candidates input");
check(decodedScanSessionExplicitCoverageAndCandidates.coreSessionStatus?.nextRecommendedReadoutId === "custom_decoded_snapshot", "Decoded OBD session did not let explicit next_readout_candidates drive coreSessionStatus nextRecommendedReadoutId");
const decodedScanSessionExplicitCandidatesEmptyReadouts = obd.buildDecodedObdScanSession({
  session_id: "decoded-explicit-empty-readouts",
  dtc_snapshot: { blocked: false, capturedAt: "2026-07-06T00:20:00Z", codes: [], dtcs: [] },
  freeze_frame_snapshot: { blocked: false, capturedAt: "2026-07-06T00:20:01Z", monitorValues: [] },
  readiness_snapshot: { blocked: false, capturedAt: "2026-07-06T00:20:02Z", monitors: [], monitorCount: 0 },
  ecu_info_snapshot: { blocked: false, capturedAt: "2026-07-06T00:20:03Z", items: [], itemCount: 0 },
  supported_pid_matrix: { blocked: false, capturedAt: "2026-07-06T00:20:04Z", supportedPids: [], supportedCount: 0 },
  live_pid_snapshot: { blocked: false, capturedAt: "2026-07-06T00:20:05Z", monitorValues: [] },
  next_readout_candidates: [{ id: "custom_decoded_snapshot", label: "Decoded Snapshot", priority: 1, reason: "outer override" }]
});
check(decodedScanSessionExplicitCandidatesEmptyReadouts.coreSessionStatus?.readyForAnalysis === false, "Decoded OBD session treated explicit-candidate empty readouts as analysis-ready");
check(decodedScanSessionExplicitCandidatesEmptyReadouts.coreSessionStatus?.nextRecommendedReadoutId === "custom_decoded_snapshot", "Decoded OBD session did not preserve explicit next_readout_candidates over empty readout fallback");
const decodedScanSessionExplicitCandidatesManualBlocking = obd.buildDecodedObdScanSession({
  session_id: "decoded-explicit-manual-blocking",
  vehicle_applicability: { status: "manual" },
  dtc_snapshot: { blocked: false, capturedAt: "2026-07-06T00:20:10Z", codes: [], dtcs: [] },
  next_readout_candidates: [{ id: "custom_decoded_snapshot", label: "Decoded Snapshot", priority: 1, reason: "outer override" }]
});
check(decodedScanSessionExplicitCandidatesManualBlocking.coreSessionStatus?.blockingWarningIds?.includes("vehicle_profile_manual"), "Decoded OBD session did not surface manual applicability as a blocking warning with explicit next_readout_candidates");
check(decodedScanSessionExplicitCandidatesManualBlocking.coreSessionStatus?.readyForAnalysis === false, "Decoded OBD session treated manual applicability with explicit next_readout_candidates as analysis-ready");
check(decodedScanSessionExplicitCandidatesManualBlocking.coreSessionStatus?.nextRecommendedReadoutId === "custom_decoded_snapshot", "Decoded OBD session did not preserve explicit next_readout_candidates over manual applicability blocking");
const decodedScanSessionExplicitCandidatesUnlistedBlocking = obd.buildDecodedObdScanSession({
  session_id: "decoded-explicit-unlisted-blocking",
  vehicle_applicability: { status: "unlisted" },
  dtc_snapshot: { blocked: false, capturedAt: "2026-07-06T00:20:20Z", codes: [], dtcs: [] },
  next_readout_candidates: [{ id: "custom_decoded_snapshot", label: "Decoded Snapshot", priority: 1, reason: "outer override" }]
});
check(decodedScanSessionExplicitCandidatesUnlistedBlocking.coreSessionStatus?.blockingWarningIds?.includes("vehicle_applicability_unlisted"), "Decoded OBD session did not surface unlisted applicability as a blocking warning with explicit next_readout_candidates");
check(decodedScanSessionExplicitCandidatesUnlistedBlocking.coreSessionStatus?.readyForAnalysis === false, "Decoded OBD session treated unlisted applicability with explicit next_readout_candidates as analysis-ready");
check(decodedScanSessionExplicitCandidatesUnlistedBlocking.coreSessionStatus?.nextRecommendedReadoutId === "custom_decoded_snapshot", "Decoded OBD session did not preserve explicit next_readout_candidates over unlisted applicability blocking");
const decodedScanSessionExplicitCandidatesPartialWarning = obd.buildDecodedObdScanSession({
  session_id: "decoded-explicit-partial-warning",
  vehicle_applicability: { status: "partial" },
  dtc_snapshot: { blocked: false, capturedAt: "2026-07-06T00:20:30Z", codes: [], dtcs: [] },
  next_readout_candidates: [{ id: "custom_decoded_snapshot", label: "Decoded Snapshot", priority: 1, reason: "outer override" }]
});
check(decodedScanSessionExplicitCandidatesPartialWarning.warnings.includes("vehicle_applicability_partial"), "Decoded OBD session did not surface partial applicability warning with explicit next_readout_candidates");
check(!decodedScanSessionExplicitCandidatesPartialWarning.coreSessionStatus?.blockingWarningIds?.includes("vehicle_applicability_partial"), "Decoded OBD session incorrectly treated partial applicability as a blocking warning with explicit next_readout_candidates");
check(decodedScanSessionExplicitCandidatesPartialWarning.coreSessionStatus?.readyForAnalysis === false, "Decoded OBD session treated partial applicability with explicit next_readout_candidates as analysis-ready");
check(decodedScanSessionExplicitCandidatesPartialWarning.coreSessionStatus?.nextRecommendedReadoutId === "custom_decoded_snapshot", "Decoded OBD session did not preserve explicit next_readout_candidates over partial applicability warning");
const decodedScanSessionPopulatedPartialApplicability = obd.buildDecodedObdScanSession({
  session_id: "decoded-populated-partial-applicability",
  vehicle_applicability: { status: "partial" },
  dtc_snapshot: bridgeDtcSnapshot,
  live_pid_snapshot: bridgePidSnapshot,
  freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
  readiness_snapshot: bridgeReadinessSnapshot,
  ecu_info_snapshot: bridgeEcuInfoSnapshot,
  onboard_monitor_snapshot: bridgeOnboardMonitorSnapshot,
  supported_pid_matrix: bridgeSupportedPidSnapshot
});
check(decodedScanSessionPopulatedPartialApplicability.warnings.includes("vehicle_applicability_partial"), "Decoded OBD session did not keep partial applicability warning for populated readouts");
check(!decodedScanSessionPopulatedPartialApplicability.coreSessionStatus?.blockingWarningIds?.includes("vehicle_applicability_partial"), "Decoded OBD session incorrectly blocked populated partial applicability");
check(decodedScanSessionPopulatedPartialApplicability.coreSessionStatus?.readyForAnalysis === true, "Decoded OBD session did not allow populated partial applicability inputs to become analysis-ready");
check(decodedScanSessionPopulatedPartialApplicability.coreSessionStatus?.status === "analysis_ready", "Decoded OBD session did not expose analysis_ready status for populated partial applicability");
const decodedScanSessionPopulatedPartialExplicitCandidates = obd.buildDecodedObdScanSession({
  session_id: "decoded-populated-partial-explicit-candidates",
  vehicle_applicability: { status: "partial" },
  dtc_snapshot: bridgeDtcSnapshot,
  live_pid_snapshot: bridgePidSnapshot,
  freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
  readiness_snapshot: bridgeReadinessSnapshot,
  ecu_info_snapshot: bridgeEcuInfoSnapshot,
  onboard_monitor_snapshot: bridgeOnboardMonitorSnapshot,
  supported_pid_matrix: bridgeSupportedPidSnapshot,
  next_readout_candidates: [{ id: "custom_decoded_snapshot", label: "Decoded Snapshot", priority: 1, reason: "outer override" }]
});
check(decodedScanSessionPopulatedPartialExplicitCandidates.coreSessionStatus?.readyForAnalysis === true, "Decoded OBD session did not keep populated partial applicability with explicit next_readout_candidates as analysis-ready");
check(decodedScanSessionPopulatedPartialExplicitCandidates.coreSessionStatus?.status === "analysis_ready", "Decoded OBD session did not expose analysis_ready status for populated partial applicability with explicit next_readout_candidates");
check(decodedScanSessionPopulatedPartialExplicitCandidates.coreSessionStatus?.nextRecommendedReadoutId === "custom_decoded_snapshot", "Decoded OBD session did not preserve explicit next_readout_candidates for populated partial applicability");
check(decodedScanSessionPopulatedPartialExplicitCandidates.coreSessionStatus?.completionPercent === 100, "Decoded OBD session did not keep populated partial applicability with explicit next_readout_candidates at 100 percent completion");
check(Array.isArray(decodedScanSessionPopulatedPartialExplicitCandidates.coreSessionStatus?.remainingReadoutIds) && decodedScanSessionPopulatedPartialExplicitCandidates.coreSessionStatus.remainingReadoutIds.length === 0, "Decoded OBD session treated populated partial applicability with explicit next_readout_candidates as having unread core readouts");
check(Array.isArray(decodedScanSessionPopulatedPartialExplicitCandidates.coreSessionStatus?.emptyReadoutIds) && decodedScanSessionPopulatedPartialExplicitCandidates.coreSessionStatus.emptyReadoutIds.length === 0, "Decoded OBD session treated populated partial applicability with explicit next_readout_candidates as having empty core readouts");
const decodedScanSessionPopulatedManualApplicability = obd.buildDecodedObdScanSession({
  session_id: "decoded-populated-manual-applicability",
  vehicle_applicability: { status: "manual" },
  dtc_snapshot: bridgeDtcSnapshot,
  live_pid_snapshot: bridgePidSnapshot,
  freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
  readiness_snapshot: bridgeReadinessSnapshot,
  ecu_info_snapshot: bridgeEcuInfoSnapshot,
  onboard_monitor_snapshot: bridgeOnboardMonitorSnapshot,
  supported_pid_matrix: bridgeSupportedPidSnapshot
});
check(decodedScanSessionPopulatedManualApplicability.coreSessionStatus?.blockingWarningIds?.includes("vehicle_profile_manual"), "Decoded OBD session did not keep manual applicability as a blocking warning for populated readouts");
check(decodedScanSessionPopulatedManualApplicability.coreSessionStatus?.readyForAnalysis === false, "Decoded OBD session incorrectly allowed populated manual applicability inputs to become analysis-ready");
check(decodedScanSessionPopulatedManualApplicability.coreSessionStatus?.status === "collecting_readouts", "Decoded OBD session did not keep populated manual applicability in collecting_readouts");
check(decodedScanSessionPopulatedManualApplicability.coreSessionStatus?.completionPercent === 100, "Decoded OBD session did not keep populated manual applicability at 100 percent completion");
check(Array.isArray(decodedScanSessionPopulatedManualApplicability.coreSessionStatus?.remainingReadoutIds) && decodedScanSessionPopulatedManualApplicability.coreSessionStatus.remainingReadoutIds.length === 0, "Decoded OBD session treated populated manual applicability as having unread core readouts");
check(Array.isArray(decodedScanSessionPopulatedManualApplicability.coreSessionStatus?.emptyReadoutIds) && decodedScanSessionPopulatedManualApplicability.coreSessionStatus.emptyReadoutIds.length === 0, "Decoded OBD session treated populated manual applicability as having empty core readouts");
const decodedScanSessionPopulatedManualExplicitCandidates = obd.buildDecodedObdScanSession({
  session_id: "decoded-populated-manual-explicit-candidates",
  vehicle_applicability: { status: "manual" },
  dtc_snapshot: bridgeDtcSnapshot,
  live_pid_snapshot: bridgePidSnapshot,
  freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
  readiness_snapshot: bridgeReadinessSnapshot,
  ecu_info_snapshot: bridgeEcuInfoSnapshot,
  onboard_monitor_snapshot: bridgeOnboardMonitorSnapshot,
  supported_pid_matrix: bridgeSupportedPidSnapshot,
  next_readout_candidates: [{ id: "custom_decoded_snapshot", label: "Decoded Snapshot", priority: 1, reason: "outer override" }]
});
check(decodedScanSessionPopulatedManualExplicitCandidates.coreSessionStatus?.blockingWarningIds?.includes("vehicle_profile_manual"), "Decoded OBD session did not keep manual applicability blocking with explicit next_readout_candidates on populated readouts");
check(decodedScanSessionPopulatedManualExplicitCandidates.coreSessionStatus?.completionPercent === 100, "Decoded OBD session did not keep populated manual applicability with explicit next_readout_candidates at 100 percent completion");
check(decodedScanSessionPopulatedManualExplicitCandidates.coreSessionStatus?.nextRecommendedReadoutId === "custom_decoded_snapshot", "Decoded OBD session did not preserve explicit next_readout_candidates for populated manual applicability");
const decodedScanSessionPopulatedUnlistedApplicability = obd.buildDecodedObdScanSession({
  session_id: "decoded-populated-unlisted-applicability",
  vehicle_applicability: { status: "unlisted" },
  dtc_snapshot: bridgeDtcSnapshot,
  live_pid_snapshot: bridgePidSnapshot,
  freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
  readiness_snapshot: bridgeReadinessSnapshot,
  ecu_info_snapshot: bridgeEcuInfoSnapshot,
  onboard_monitor_snapshot: bridgeOnboardMonitorSnapshot,
  supported_pid_matrix: bridgeSupportedPidSnapshot
});
check(decodedScanSessionPopulatedUnlistedApplicability.coreSessionStatus?.blockingWarningIds?.includes("vehicle_applicability_unlisted"), "Decoded OBD session did not keep unlisted applicability as a blocking warning for populated readouts");
check(decodedScanSessionPopulatedUnlistedApplicability.coreSessionStatus?.readyForAnalysis === false, "Decoded OBD session incorrectly allowed populated unlisted applicability inputs to become analysis-ready");
check(decodedScanSessionPopulatedUnlistedApplicability.coreSessionStatus?.status === "collecting_readouts", "Decoded OBD session did not keep populated unlisted applicability in collecting_readouts");
check(decodedScanSessionPopulatedUnlistedApplicability.coreSessionStatus?.completionPercent === 100, "Decoded OBD session did not keep populated unlisted applicability at 100 percent completion");
check(Array.isArray(decodedScanSessionPopulatedUnlistedApplicability.coreSessionStatus?.remainingReadoutIds) && decodedScanSessionPopulatedUnlistedApplicability.coreSessionStatus.remainingReadoutIds.length === 0, "Decoded OBD session treated populated unlisted applicability as having unread core readouts");
check(Array.isArray(decodedScanSessionPopulatedUnlistedApplicability.coreSessionStatus?.emptyReadoutIds) && decodedScanSessionPopulatedUnlistedApplicability.coreSessionStatus.emptyReadoutIds.length === 0, "Decoded OBD session treated populated unlisted applicability as having empty core readouts");
const decodedScanSessionPopulatedUnlistedExplicitCandidates = obd.buildDecodedObdScanSession({
  session_id: "decoded-populated-unlisted-explicit-candidates",
  vehicle_applicability: { status: "unlisted" },
  dtc_snapshot: bridgeDtcSnapshot,
  live_pid_snapshot: bridgePidSnapshot,
  freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
  readiness_snapshot: bridgeReadinessSnapshot,
  ecu_info_snapshot: bridgeEcuInfoSnapshot,
  onboard_monitor_snapshot: bridgeOnboardMonitorSnapshot,
  supported_pid_matrix: bridgeSupportedPidSnapshot,
  next_readout_candidates: [{ id: "custom_decoded_snapshot", label: "Decoded Snapshot", priority: 1, reason: "outer override" }]
});
check(decodedScanSessionPopulatedUnlistedExplicitCandidates.coreSessionStatus?.blockingWarningIds?.includes("vehicle_applicability_unlisted"), "Decoded OBD session did not keep unlisted applicability blocking with explicit next_readout_candidates on populated readouts");
check(decodedScanSessionPopulatedUnlistedExplicitCandidates.coreSessionStatus?.completionPercent === 100, "Decoded OBD session did not keep populated unlisted applicability with explicit next_readout_candidates at 100 percent completion");
check(decodedScanSessionPopulatedUnlistedExplicitCandidates.coreSessionStatus?.nextRecommendedReadoutId === "custom_decoded_snapshot", "Decoded OBD session did not preserve explicit next_readout_candidates for populated unlisted applicability");
const decodedScanSessionExplicitMetaOverrides = obd.buildDecodedObdScanSession({
  session_id: "decoded-explicit-meta-overrides",
  stored_dtc_response: { raw: "43 01 71 03 00 00 00" },
  tool_hints: ["Techstream", "J2534"],
  warning_flags: ["negative_obd_response_present"],
  source_length: 128,
  had_sensitive_identifier: true
});
check(decodedScanSessionExplicitMetaOverrides.toolHints.join(",") === "Techstream,J2534", "Decoded OBD session did not preserve explicit tool_hints input");
check(decodedScanSessionExplicitMetaOverrides.warnings.includes("negative_obd_response_present"), "Decoded OBD session did not preserve explicit warning_flags input");
check(decodedScanSessionExplicitMetaOverrides.sourceLength === 128, "Decoded OBD session did not preserve explicit source_length input");
check(decodedScanSessionExplicitMetaOverrides.hadSensitiveIdentifier === true, "Decoded OBD session did not preserve explicit had_sensitive_identifier input");
const decodedScanSessionExplicitMixedMetaOverrides = obd.buildDecodedObdScanSession({
  sessionId: "decoded-explicit-mixed-meta-overrides",
  stored_dtc_response: { raw: "43 01 71 03 00 00 00" },
  toolHints: ["Techstream"],
  warning_flags: ["negative_obd_response_present"],
  sourceLength: 129,
  had_sensitive_identifier: true,
  importClassification: {
    schemaVersion: "obd_response_line_classification_v1",
    bucketCounts: { storedDtcResponses: 22 }
  }
});
check(decodedScanSessionExplicitMixedMetaOverrides.sessionId === "decoded-explicit-mixed-meta-overrides", "Decoded OBD session did not preserve mixed-case sessionId input");
check(decodedScanSessionExplicitMixedMetaOverrides.toolHints.join(",") === "Techstream", "Decoded OBD session did not preserve mixed-case toolHints input");
check(decodedScanSessionExplicitMixedMetaOverrides.warnings.includes("negative_obd_response_present"), "Decoded OBD session did not preserve mixed-case warning_flags input");
check(decodedScanSessionExplicitMixedMetaOverrides.sourceLength === 129, "Decoded OBD session did not preserve mixed-case sourceLength input");
check(decodedScanSessionExplicitMixedMetaOverrides.hadSensitiveIdentifier === true, "Decoded OBD session did not preserve mixed-case had_sensitive_identifier input");
check(decodedScanSessionExplicitMixedMetaOverrides.importClassification?.bucketCounts?.storedDtcResponses === 22, "Decoded OBD session did not preserve mixed-case importClassification input");
const decodedScanSessionExplicitImportClassification = obd.buildDecodedObdScanSession({
  session_id: "decoded-explicit-import-classification",
  stored_dtc_response: { raw: "43 01 71 03 00 00 00" },
  import_classification: {
    schemaVersion: "obd_response_line_classification_v1",
    bucketCounts: { storedDtcResponses: 1 }
  }
});
check(decodedScanSessionExplicitImportClassification.importClassification?.bucketCounts?.storedDtcResponses === 1, "Decoded OBD session did not preserve explicit import_classification input");
const decodedScanSessionEcuInfoCamelAlias = obd.buildDecodedObdScanSession({
  session_id: "decoded-ecuinfo-camel-alias-test",
  ecuInfo: [
    { itemId: "calibration_id", infoType: "04", decodedValue: "CAL-DECODED-CAMEL" },
    { itemId: "ecu_name", infoType: "0A", rawValue: "Decoded Camel ECU" }
  ]
});
check(decodedScanSessionEcuInfoCamelAlias.ecuInfoSnapshot.itemCount === 2, "Decoded OBD session did not accept ecuInfo camelCase alias input");
check(decodedScanSessionEcuInfoCamelAlias.ecuInfoSnapshot.items.find((item) => item.id === "calibration_id")?.value === "CAL-DECODED-CAMEL", "Decoded OBD session did not retain calibration_id from ecuInfo camelCase alias input");
const decodedScanSessionEcuInfoItemsCamelAlias = obd.buildDecodedObdScanSession({
  session_id: "decoded-ecuinfoitems-camel-alias-test",
  ecuInfoItems: [
    { itemId: "calibration_verification_number", infoType: "06", decodedValue: "CVN-DECODED-CAMEL" },
    { itemId: "ecu_name", infoType: "0A", rawValue: "Decoded Items Camel ECU" }
  ]
});
check(decodedScanSessionEcuInfoItemsCamelAlias.ecuInfoSnapshot.itemCount === 2, "Decoded OBD session did not accept ecuInfoItems camelCase alias input");
check(decodedScanSessionEcuInfoItemsCamelAlias.ecuInfoSnapshot.items.find((item) => item.id === "calibration_verification_number")?.value === "CVN-DECODED-CAMEL", "Decoded OBD session did not retain CVN from ecuInfoItems camelCase alias input");
const rawPidScanSession = obd.buildDecodedObdScanSession({
  session_id: "raw-pid-session",
  livePidResponse: { raw: "41 75 01 90 41 0D 28" },
  freezeFrameResponse: { raw: "42 75 00 01 90" }
});
check(rawPidScanSession.monitorValueSummary.undecodedRawCount === 2, "診断セッションへ未換算RAW件数を統合できません");
check(rawPidScanSession.warnings.includes("raw_pid_values_need_conversion"), "診断セッションへ未換算RAW警告を反映できません");
const obdTextLog = [
  ">03",
  "7E8 06 43 01 71 03 00 00 00",
  ">07",
  "7E8 04 47 01 71 00 00",
  ">0A",
  "7E8 04 4A 03 00 00 00",
  ">0100",
  "7E8 06 41 00 18 18 00 00",
  ">0101",
  "7E8 06 41 01 81 07 22 00",
  ">010C",
  "7E8 04 41 0C 1A F8",
  ">0105",
  "7E8 03 41 05 7B",
  ">0202",
  "7E8 05 42 02 00 01 71",
  ">020C",
  "7E8 04 42 0C 00 1A F8",
  ">0601",
  "7E8 09 46 01 01 00 64 00 32 00 C8",
  ">0904",
  "7E8 10 0B 49 04 01 43 41 4C",
  "7E8 21 2D 31 32 33 34",
  ">0102",
  "7E8 03 7F 01 12"
].join("\n");
const classifiedObdText = obd.classifyObdResponseLines(obdTextLog);
check(classifiedObdText.schemaVersion === "obd_response_line_classification_v1", "OBD log classification schema is invalid");
check(classifiedObdText.bucketCounts.storedDtcResponses === 1, "OBD log stored DTC response was not classified");
check(classifiedObdText.bucketCounts.pendingDtcResponses === 1, "OBD log pending DTC response was not classified");
check(classifiedObdText.bucketCounts.permanentDtcResponses === 1, "OBD log permanent DTC response was not classified");
check(classifiedObdText.bucketCounts.livePidResponses === 2, "OBD log live PID responses were not classified");
check(classifiedObdText.bucketCounts.onboardMonitorResponses === 1, "OBD log Mode 06 response was not classified");
check(classifiedObdText.bucketCounts.negativeResponses === 1, "OBD log negative response was not classified");
check(classifiedObdText.responseBuckets.negativeResponses[0]?.negativeResponse?.requestedService === "01", "否定応答の要求サービスを保持できません");
check(classifiedObdText.responseBuckets.negativeResponses[0]?.negativeResponse?.responseLabel === "subfunction_not_supported", "否定応答コードを分類できません");
check(classifiedObdText.negativeResponseSummary.totalCount === 1, "否定応答件数を集計できません");
check(classifiedObdText.negativeResponseSummary.responseCodes.includes("12"), "否定応答コード一覧を集計できません");
check(classifiedObdText.responseBuckets.livePidResponses[0]?.ecu === "7E8", "OBDログ分類でECUアドレスを保持できません");
check(classifiedObdText.responseBuckets.livePidResponses[0]?.frameLength === 4, "OBDログ分類でCANフレーム長を保持できません");
check(classifiedObdText.ecuResponseCount === 1, "OBDログ分類でECU応答数を集計できません");
check(classifiedObdText.ecuResponses[0]?.services.includes("43") && classifiedObdText.ecuResponses[0]?.services.includes("49"), "OBDログ分類でECU別サービス一覧を保持できません");
check(classifiedObdText.responseBuckets.ecuInfoResponses[0]?.isoTp === true, "ISO-TP分割応答を再構成済みとして保持できません");
check(classifiedObdText.responseBuckets.ecuInfoResponses[0]?.frameCount === 2, "ISO-TP分割応答のフレーム数を保持できません");
check(classifiedObdText.responseBuckets.ecuInfoResponses[0]?.sequenceError === false, "正常なISO-TP分割応答を順序異常として扱っています");
check(classifiedObdText.responseBuckets.ecuInfoResponses[0]?.response === "49 04 01 43 41 4C 2D 31 32 33 34", "ISO-TP分割応答をMode09ペイロードへ再構成できません");
check(classifiedObdText.isoTpSummary.totalCount === 1 && classifiedObdText.isoTpSummary.sequenceErrorCount === 0, "ISO-TP正常応答の集計が不正です");
const classifiedSequenceError = obd.classifyObdResponseLines([
  "7E8 10 0B 49 04 01 43 41 4C",
  "7E8 22 2D 31 32 33 34"
].join("\n"));
check(classifiedSequenceError.responseBuckets.ecuInfoResponses[0]?.sequenceError === true, "ISO-TP連続フレーム欠番を検出できません");
check(classifiedSequenceError.isoTpSummary.sequenceErrorCount === 1, "ISO-TP順序異常件数を集計できません");
const incompleteIsoTpSession = obd.buildScanSessionFromObdText("7E8 10 0B 49 04 01 43 41 4C", { session_id: "isotp-incomplete" });
check(incompleteIsoTpSession.importClassification.isoTpSummary.incompleteCount === 1, "ISO-TP未完了件数をセッションへ保持できません");
check(incompleteIsoTpSession.warnings.includes("isotp_reassembly_issue"), "ISO-TP未完了をセッション警告へ反映できません");
check(classifiedObdText.retainedRawText === false && classifiedObdText.wouldTransmit === false, "OBD log classification retained raw text or allowed transmit");
const textScanSession = obd.buildScanSessionFromObdText(obdTextLog, { session_id: "obd-text-test", protocol: "ISO15765-4" });
check(textScanSession.schemaVersion === "scan_session_v1", "OBD text log was not converted to scan session");
check(textScanSession.importClassification.bucketCounts.freezeFrameResponses === 2, "OBD text scan session did not keep freeze-frame bucket count");
check(textScanSession.importClassification.negativeResponseSummary.totalCount === 1, "OBD text scan session did not keep negative response summary");
check(textScanSession.warnings.includes("negative_obd_response_present"), "OBD text scan session did not reflect negative response warning");
check(textScanSession.ecuResponseSummary.ecus.find((item) => item.address === "7E8")?.responseCount >= 8, "OBD text scan session did not keep ECU response count");
check(textScanSession.ecuResponseSummary.ecus.find((item) => item.address === "7E8")?.services.includes("46"), "OBD text scan session did not keep ECU service list");
check(textScanSession.ecuResponseSummary.ecus.find((item) => item.address === "7E8")?.negativeResponseCount === 1, "OBD text scan session did not keep ECU negative response count");
check(textScanSession.ecuResponseSummary.ecus.find((item) => item.address === "7E8")?.negativeRequestedServices.includes("01"), "OBD text scan session did not keep ECU negative requested service");
check(textScanSession.dtcSnapshot.dtcs.some((item) => item.code === "P0171" && item.status === "stored"), "OBD text scan session did not include stored DTC");
check(textScanSession.dtcSnapshot.dtcs.some((item) => item.code === "P0171" && item.status === "pending"), "OBD text scan session did not include pending DTC");
check(textScanSession.dtcSnapshot.dtcs.some((item) => item.code === "P0300" && item.status === "permanent"), "OBD text scan session did not include permanent DTC");
check(textScanSession.livePidSnapshot.monitorValues.find((item) => item.id === "engine_speed")?.value === 1726, "OBD text scan session did not decode engine RPM");
check(textScanSession.livePidSnapshot.monitorValues.find((item) => item.id === "coolant_temp")?.value === 83, "OBD text scan session did not decode coolant temperature");
check(textScanSession.freezeFrameSnapshot.triggerDtc === "P0171", "OBD text scan session did not decode freeze-frame trigger DTC");
check(textScanSession.readinessSnapshot.milOn === true, "OBD text scan session did not decode readiness");
check(textScanSession.onboardMonitorSnapshot.tests[0]?.status === "pass", "OBD text scan session did not decode Mode 06");
check(textScanSession.ecuInfoSnapshot.items.find((item) => item.id === "calibration_id")?.value === "CAL-1234", "OBD text scan session did not decode CALID");
check(textScanSession.retainedRawText === false && textScanSession.retainedRawFrames === false && textScanSession.wouldTransmit === false, "OBD text scan session retained raw text/frames or allowed transmit");
check(textScanSession.diagnosticFlowSummary?.schemaVersion === "diagnostic_flow_summary_v1", "OBD text scan session did not expose diagnosticFlowSummary");
check(textScanSession.diagnosticFlowSummary?.stage === "diagnostic_core", "OBD text scan session did not expose diagnosticFlowSummary stage");
const techstreamTextScanSession = obd.buildScanSessionFromObdText(["Toyota Techstream", "J2534", "7E8 04 43 01 71"].join("\n"), { session_id: "techstream-log" });
check(techstreamTextScanSession.toolHints.join(",") === "Techstream,J2534", "OBD text scan session did not retain Techstream/J2534 tool hints");
check(techstreamTextScanSession.importClassification.toolHints.join(",") === "Techstream,J2534", "OBD text scan session import classification did not retain tool hints");
const oemScannerTextScanSession = obd.buildScanSessionFromObdText(["GTS", "CONSULT-III", "Honda Diagnostic System", "Integrated Diagnostic System", "7E8 04 43 01 71"].join("\n"), { session_id: "oem-tool-log" });
check(oemScannerTextScanSession.toolHints.join(",") === "Techstream,CONSULT,HDS,IDS", "OBD text scan session did not retain expanded OEM scanner tool hints");
const headingOnlyDtcSession = obd.buildScanSessionFromObdText([
  "Current DTCs",
  "P0171 P0300",
  "Pending Codes",
  "P0420",
  "Permanent DTC",
  "P0440"
].join("\n"), { session_id: "heading-only-dtcs" });
check(headingOnlyDtcSession.dtcSnapshot.dtcs.some((item) => item.code === "P0171" && item.status === "stored"), "OBD text scan session did not infer stored DTC status from headings");
check(headingOnlyDtcSession.dtcSnapshot.dtcs.some((item) => item.code === "P0420" && item.status === "pending"), "OBD text scan session did not infer pending DTC status from headings");
check(headingOnlyDtcSession.dtcSnapshot.dtcs.some((item) => item.code === "P0440" && item.status === "permanent"), "OBD text scan session did not infer permanent DTC status from headings");
const textScanSessionAliasOptions = obd.buildScanSessionFromObdText(obdTextLog, {
  session_id: "obd-text-alias-options",
  started_at: "2026-06-28T00:14:00Z",
  ended_at: "2026-06-28T00:15:00Z",
  vehicle_profile: { maker: "Toyota", model: "Corolla" },
  protocol: "ISO15765-4"
});
check(textScanSessionAliasOptions.startedAt === "2026-06-28T00:14:00Z" && textScanSessionAliasOptions.endedAt === "2026-06-28T00:15:00Z", "OBD text scan session did not accept started_at or ended_at option alias input");
check(textScanSessionAliasOptions.vehicleProfile?.model === "Corolla", "OBD text scan session did not accept vehicle_profile option alias input");
const textScanSessionDirectMixedVehicleMetadata = obd.buildScanSessionFromObdText(obdTextLog, {
  sessionId: "obd-text-mixed-vehicle-meta",
  vehicleProfile: { maker: "Toyota", model: "Mixed Rize" },
  vehicle_applicability: vehicleApplicabilitySample
});
check(textScanSessionDirectMixedVehicleMetadata.sessionId === "obd-text-mixed-vehicle-meta", "OBD text scan session did not preserve mixed-case direct sessionId option input");
check(textScanSessionDirectMixedVehicleMetadata.vehicleProfile?.model === "Mixed Rize", "OBD text scan session did not preserve mixed-case direct vehicleProfile option input");
check(textScanSessionDirectMixedVehicleMetadata.vehicleApplicability?.status === "matched", "OBD text scan session did not preserve mixed-case direct vehicle_applicability option input");
const textScanSessionNestedOptions = obd.buildScanSessionFromObdText(obdTextLog, {
  scan_session: {
    session_id: "obd-text-nested-options",
    started_at: "2026-06-28T00:16:00Z",
    ended_at: "2026-06-28T00:17:00Z",
    vehicle_profile: { maker: "Toyota", model: "Vitz" },
    protocol: "ISO15765-4"
  }
});
check(textScanSessionNestedOptions.startedAt === "2026-06-28T00:16:00Z" && textScanSessionNestedOptions.endedAt === "2026-06-28T00:17:00Z", "OBD text scan session did not accept scan_session nested option timestamps");
check(textScanSessionNestedOptions.vehicleProfile?.model === "Vitz", "OBD text scan session did not carry vehicle_profile from scan_session nested options");
check(textScanSessionNestedOptions.sessionId === "obd-text-nested-options", "OBD text scan session did not carry session_id from scan_session nested options");
check(textScanSessionNestedOptions.protocol === "ISO15765-4", "OBD text scan session did not carry protocol from scan_session nested options");
const textScanSessionNestedCamelOptions = obd.buildScanSessionFromObdText(obdTextLog, {
  scanSession: {
    sessionId: "obd-text-camel-nested",
    startedAt: "2026-06-28T00:16:30Z",
    endedAt: "2026-06-28T00:17:30Z",
    vehicleProfile: { maker: "Toyota", model: "Rize" },
    protocol: "ISO15765-4"
  }
});
check(textScanSessionNestedCamelOptions.startedAt === "2026-06-28T00:16:30Z" && textScanSessionNestedCamelOptions.endedAt === "2026-06-28T00:17:30Z", "OBD text scan session did not accept scanSession camelCase option timestamps");
check(textScanSessionNestedCamelOptions.vehicleProfile?.model === "Rize", "OBD text scan session did not carry vehicleProfile from scanSession camelCase options");
check(textScanSessionNestedCamelOptions.sessionId === "obd-text-camel-nested", "OBD text scan session did not carry sessionId from scanSession camelCase options");
check(textScanSessionNestedCamelOptions.protocol === "ISO15765-4", "OBD text scan session did not carry protocol from scanSession camelCase options");
const textScanSessionNestedCoreOverrides = obd.buildScanSessionFromObdText(obdTextLog, {
  scan_session: {
    session_id: "obd-text-nested-core-overrides",
    vehicle_applicability: vehicleApplicabilitySample,
    readout_coverage: legacyReadoutCoverage,
    freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
    readiness_snapshot: bridgeReadinessSnapshot,
    ecu_info_snapshot: bridgeEcuInfoSnapshot
  }
});
check(textScanSessionNestedCoreOverrides.vehicleApplicability?.status === "matched", "OBD text scan session did not carry vehicle_applicability from scan_session nested options");
check(textScanSessionNestedCoreOverrides.readoutCoverage?.capturedPercent === 29, "OBD text scan session did not carry readout_coverage from scan_session nested options");
check(textScanSessionNestedCoreOverrides.freezeFrameSnapshot?.triggerDtc === "P0171", "OBD text scan session did not carry freeze_frame_snapshot from scan_session nested options");
check(textScanSessionNestedCoreOverrides.readinessSnapshot?.incompleteCount === 1, "OBD text scan session did not carry readiness_snapshot from scan_session nested options");
check(textScanSessionNestedCoreOverrides.ecuInfoSnapshot?.itemCount === bridgeEcuInfoSnapshot.itemCount, "OBD text scan session did not carry ecu_info_snapshot from scan_session nested options");
const textScanSessionNestedImportClassification = obd.buildScanSessionFromObdText(obdTextLog, {
  scan_session: {
    session_id: "obd-text-nested-import-classification",
    import_classification: {
      schemaVersion: "obd_response_line_classification_v1",
      bucketCounts: { freezeFrameResponses: 8 }
    }
  }
});
check(textScanSessionNestedImportClassification.importClassification?.bucketCounts?.freezeFrameResponses === 8, "OBD text scan session did not carry import_classification from scan_session nested options");
const textScanSessionNestedOuterOverride = obd.buildScanSessionFromObdText(obdTextLog, {
  session_id: "obd-text-outer-override",
  protocol: "ISO9141-2",
  vehicle_profile: { maker: "Toyota", model: "Ractis" },
  scan_session: {
    session_id: "obd-text-nested-options-outer-override",
    protocol: "ISO15765-4",
    vehicle_profile: { maker: "Toyota", model: "Vitz" }
  }
});
check(textScanSessionNestedOuterOverride.sessionId === "obd-text-outer-override", "OBD text scan session did not let outer session_id override scan_session nested options");
check(textScanSessionNestedOuterOverride.protocol === "ISO9141-2", "OBD text scan session did not let outer protocol override scan_session nested options");
check(textScanSessionNestedOuterOverride.vehicleProfile?.model === "Ractis", "OBD text scan session did not let outer vehicle_profile override scan_session nested options");
const textScanSessionNestedOuterCoreOverride = obd.buildScanSessionFromObdText(obdTextLog, {
  session_id: "obd-text-outer-core-override",
  vehicle_applicability: vehicleApplicabilityPartialSample,
  readout_coverage: legacyReadoutCoverage,
  freeze_frame_snapshot: outerOverrideFreezeFrameSnapshot,
  readiness_snapshot: outerOverrideReadinessSnapshot,
  ecu_info_snapshot: outerOverrideEcuInfoSnapshot,
  scan_session: {
    vehicle_applicability: vehicleApplicabilitySample,
    readout_coverage: bridgeSummary.readoutCoverage,
    freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
    readiness_snapshot: bridgeReadinessSnapshot,
    ecu_info_snapshot: bridgeEcuInfoSnapshot
  }
});
check(textScanSessionNestedOuterCoreOverride.vehicleApplicability?.status === "partial", "OBD text scan session did not let outer vehicle_applicability override scan_session nested options");
check(textScanSessionNestedOuterCoreOverride.readoutCoverage?.capturedPercent === 29, "OBD text scan session did not let outer readout_coverage override scan_session nested options");
check(textScanSessionNestedOuterCoreOverride.freezeFrameSnapshot?.triggerDtc === "P0420", "OBD text scan session did not let outer freeze_frame_snapshot override scan_session nested options");
check(textScanSessionNestedOuterCoreOverride.readinessSnapshot?.incompleteCount === 0, "OBD text scan session did not let outer readiness_snapshot override scan_session nested options");
check(textScanSessionNestedOuterCoreOverride.ecuInfoSnapshot?.items?.[0]?.value === "Outer Override ECU", "OBD text scan session did not let outer ecu_info_snapshot override scan_session nested options");
const textScanSessionNestedOuterImportClassificationOverride = obd.buildScanSessionFromObdText(obdTextLog, {
  session_id: "obd-text-outer-import-classification-override",
  import_classification: {
    schemaVersion: "obd_response_line_classification_v1",
    bucketCounts: { livePidResponses: 11 }
  },
  scan_session: {
    import_classification: {
      schemaVersion: "obd_response_line_classification_v1",
      bucketCounts: { livePidResponses: 3 }
    }
  }
});
check(textScanSessionNestedOuterImportClassificationOverride.importClassification?.bucketCounts?.livePidResponses === 11, "OBD text scan session did not let outer import_classification override scan_session nested options");
const textScanSessionNestedOuterMetadataOverride = obd.buildScanSessionFromObdText(obdTextLog, {
  session_id: "obd-text-outer-metadata-override",
  tool_hints: ["CONSULT"],
  warning_flags: ["negative_obd_response_present"],
  source_length: 0,
  had_sensitive_identifier: false,
  scan_session: {
    tool_hints: ["Techstream"],
    warning_flags: ["freeze_frame_available"],
    source_length: 128,
    had_sensitive_identifier: true
  }
});
check(textScanSessionNestedOuterMetadataOverride.toolHints.includes("CONSULT") && textScanSessionNestedOuterMetadataOverride.toolHints.includes("Techstream"), "OBD text scan session did not merge outer tool_hints with scan_session nested options");
check(textScanSessionNestedOuterMetadataOverride.warnings.includes("negative_obd_response_present") && textScanSessionNestedOuterMetadataOverride.warnings.includes("freeze_frame_available"), "OBD text scan session did not merge outer warning_flags with scan_session nested options");
check(textScanSessionNestedOuterMetadataOverride.sourceLength === 0, "OBD text scan session did not let outer source_length override scan_session nested options");
check(textScanSessionNestedOuterMetadataOverride.hadSensitiveIdentifier === true, "OBD text scan session did not preserve nested sensitive identifier when outer scan_session nested options set false");
const textScanSessionMixedCamelOuterSnakeNestedMetadata = obd.buildScanSessionFromObdText(obdTextLog, {
  sessionId: "obd-text-mixed-camel-outer-snake-nested",
  toolHints: ["CONSULT"],
  warningFlags: ["negative_obd_response_present"],
  sourceLength: 7,
  hadSensitiveIdentifier: false,
  importClassification: {
    schemaVersion: "obd_response_line_classification_v1",
    bucketCounts: { livePidResponses: 18 }
  },
  scan_session: {
    started_at: "2026-06-28T00:18:30Z",
    ended_at: "2026-06-28T00:19:30Z",
    captured_at: "2026-06-28T00:19:00Z",
    tool_hints: ["Techstream"],
    warning_flags: ["freeze_frame_available"],
    source_length: 128,
    had_sensitive_identifier: true
  }
});
check(textScanSessionMixedCamelOuterSnakeNestedMetadata.sessionId === "obd-text-mixed-camel-outer-snake-nested", "OBD text scan session did not preserve camelCase outer sessionId over nested snake_case scan_session options");
check(textScanSessionMixedCamelOuterSnakeNestedMetadata.startedAt === "2026-06-28T00:18:30Z" && textScanSessionMixedCamelOuterSnakeNestedMetadata.endedAt === "2026-06-28T00:19:30Z", "OBD text scan session did not accept nested snake_case scan_session timestamps with camelCase outer metadata");
check(textScanSessionMixedCamelOuterSnakeNestedMetadata.capturedAt === "2026-06-28T00:19:00Z", "OBD text scan session did not accept nested snake_case captured_at with camelCase outer metadata");
check(textScanSessionMixedCamelOuterSnakeNestedMetadata.toolHints.includes("CONSULT") && textScanSessionMixedCamelOuterSnakeNestedMetadata.toolHints.includes("Techstream"), "OBD text scan session did not merge camelCase outer toolHints with nested snake_case scan_session options");
check(textScanSessionMixedCamelOuterSnakeNestedMetadata.warnings.includes("negative_obd_response_present") && textScanSessionMixedCamelOuterSnakeNestedMetadata.warnings.includes("freeze_frame_available"), "OBD text scan session did not merge camelCase outer warningFlags with nested snake_case scan_session options");
check(textScanSessionMixedCamelOuterSnakeNestedMetadata.sourceLength === 7, "OBD text scan session did not preserve camelCase outer sourceLength over nested snake_case scan_session options");
check(textScanSessionMixedCamelOuterSnakeNestedMetadata.hadSensitiveIdentifier === true, "OBD text scan session did not preserve nested snake_case sensitive identifier when outer camelCase value was false");
check(textScanSessionMixedCamelOuterSnakeNestedMetadata.importClassification?.bucketCounts?.livePidResponses === 18, "OBD text scan session did not preserve camelCase outer importClassification over nested snake_case scan_session options");
const textScanSessionMixedSnakeOuterCamelNestedMetadata = obd.buildScanSessionFromObdText(obdTextLog, {
  session_id: "obd-text-mixed-snake-outer-camel-nested",
  tool_hints: ["CONSULT"],
  warning_flags: ["negative_obd_response_present"],
  source_length: 8,
  had_sensitive_identifier: false,
  import_classification: {
    schemaVersion: "obd_response_line_classification_v1",
    bucketCounts: { livePidResponses: 19 }
  },
  scanSession: {
    startedAt: "2026-06-28T00:18:45Z",
    endedAt: "2026-06-28T00:19:45Z",
    capturedAt: "2026-06-28T00:19:15Z",
    toolHints: ["Techstream"],
    warningFlags: ["freeze_frame_available"],
    sourceLength: 128,
    hadSensitiveIdentifier: true
  }
});
check(textScanSessionMixedSnakeOuterCamelNestedMetadata.sessionId === "obd-text-mixed-snake-outer-camel-nested", "OBD text scan session did not preserve snake_case outer session_id over nested camelCase scanSession options");
check(textScanSessionMixedSnakeOuterCamelNestedMetadata.startedAt === "2026-06-28T00:18:45Z" && textScanSessionMixedSnakeOuterCamelNestedMetadata.endedAt === "2026-06-28T00:19:45Z", "OBD text scan session did not accept nested camelCase scanSession timestamps with snake_case outer metadata");
check(textScanSessionMixedSnakeOuterCamelNestedMetadata.capturedAt === "2026-06-28T00:19:15Z", "OBD text scan session did not accept nested camelCase capturedAt with snake_case outer metadata");
check(textScanSessionMixedSnakeOuterCamelNestedMetadata.toolHints.includes("CONSULT") && textScanSessionMixedSnakeOuterCamelNestedMetadata.toolHints.includes("Techstream"), "OBD text scan session did not merge snake_case outer tool_hints with nested camelCase scanSession options");
check(textScanSessionMixedSnakeOuterCamelNestedMetadata.warnings.includes("negative_obd_response_present") && textScanSessionMixedSnakeOuterCamelNestedMetadata.warnings.includes("freeze_frame_available"), "OBD text scan session did not merge snake_case outer warning_flags with nested camelCase scanSession options");
check(textScanSessionMixedSnakeOuterCamelNestedMetadata.sourceLength === 8, "OBD text scan session did not preserve snake_case outer source_length over nested camelCase scanSession options");
check(textScanSessionMixedSnakeOuterCamelNestedMetadata.hadSensitiveIdentifier === true, "OBD text scan session did not preserve nested camelCase sensitive identifier when outer snake_case value was false");
check(textScanSessionMixedSnakeOuterCamelNestedMetadata.importClassification?.bucketCounts?.livePidResponses === 19, "OBD text scan session did not preserve snake_case outer import_classification over nested camelCase scanSession options");
const textScanSessionExplicitCoverageAndCandidates = obd.buildScanSessionFromObdText(obdTextLog, {
  session_id: "obd-text-explicit-coverage-candidates",
  readout_coverage: legacyReadoutCoverage,
  next_readout_candidates: [{ id: "custom_text_snapshot", label: "Text Snapshot", priority: 1, reason: "outer override" }]
});
check(textScanSessionExplicitCoverageAndCandidates.readoutCoverage?.capturedPercent === 29, "OBD text scan session did not preserve explicit readout_coverage option input");
check(textScanSessionExplicitCoverageAndCandidates.nextReadoutCandidates[0]?.id === "custom_text_snapshot", "OBD text scan session did not preserve explicit next_readout_candidates option input");
check(textScanSessionExplicitCoverageAndCandidates.coreSessionStatus?.nextRecommendedReadoutId === "custom_text_snapshot", "OBD text scan session did not let explicit next_readout_candidates drive coreSessionStatus nextRecommendedReadoutId");
const textScanSessionExplicitCandidatesEmptyReadouts = obd.buildScanSessionFromObdText("NO DTC", {
  session_id: "obd-text-explicit-empty-readouts",
  dtc_snapshot: { blocked: false, capturedAt: "2026-07-06T00:21:00Z", codes: [], dtcs: [] },
  freeze_frame_snapshot: { blocked: false, capturedAt: "2026-07-06T00:21:01Z", monitorValues: [] },
  readiness_snapshot: { blocked: false, capturedAt: "2026-07-06T00:21:02Z", monitors: [], monitorCount: 0 },
  ecu_info_snapshot: { blocked: false, capturedAt: "2026-07-06T00:21:03Z", items: [], itemCount: 0 },
  supported_pid_matrix: { blocked: false, capturedAt: "2026-07-06T00:21:04Z", supportedPids: [], supportedCount: 0 },
  live_pid_snapshot: { blocked: false, capturedAt: "2026-07-06T00:21:05Z", monitorValues: [] },
  next_readout_candidates: [{ id: "custom_text_snapshot", label: "Text Snapshot", priority: 1, reason: "outer override" }]
});
check(textScanSessionExplicitCandidatesEmptyReadouts.coreSessionStatus?.readyForAnalysis === false, "OBD text scan session treated explicit-candidate empty readouts as analysis-ready");
check(textScanSessionExplicitCandidatesEmptyReadouts.coreSessionStatus?.nextRecommendedReadoutId === "custom_text_snapshot", "OBD text scan session did not preserve explicit next_readout_candidates over empty readout fallback");
const textScanSessionExplicitCandidatesManualBlocking = obd.buildScanSessionFromObdText("NO DTC", {
  session_id: "obd-text-explicit-manual-blocking",
  vehicle_applicability: { status: "manual" },
  dtc_snapshot: { blocked: false, capturedAt: "2026-07-06T00:21:10Z", codes: [], dtcs: [] },
  next_readout_candidates: [{ id: "custom_text_snapshot", label: "Text Snapshot", priority: 1, reason: "outer override" }]
});
check(textScanSessionExplicitCandidatesManualBlocking.coreSessionStatus?.blockingWarningIds?.includes("vehicle_profile_manual"), "OBD text scan session did not surface manual applicability as a blocking warning with explicit next_readout_candidates");
check(textScanSessionExplicitCandidatesManualBlocking.coreSessionStatus?.readyForAnalysis === false, "OBD text scan session treated manual applicability with explicit next_readout_candidates as analysis-ready");
check(textScanSessionExplicitCandidatesManualBlocking.coreSessionStatus?.nextRecommendedReadoutId === "custom_text_snapshot", "OBD text scan session did not preserve explicit next_readout_candidates over manual applicability blocking");
const textScanSessionExplicitCandidatesUnlistedBlocking = obd.buildScanSessionFromObdText("NO DTC", {
  session_id: "obd-text-explicit-unlisted-blocking",
  vehicle_applicability: { status: "unlisted" },
  dtc_snapshot: { blocked: false, capturedAt: "2026-07-06T00:21:20Z", codes: [], dtcs: [] },
  next_readout_candidates: [{ id: "custom_text_snapshot", label: "Text Snapshot", priority: 1, reason: "outer override" }]
});
check(textScanSessionExplicitCandidatesUnlistedBlocking.coreSessionStatus?.blockingWarningIds?.includes("vehicle_applicability_unlisted"), "OBD text scan session did not surface unlisted applicability as a blocking warning with explicit next_readout_candidates");
check(textScanSessionExplicitCandidatesUnlistedBlocking.coreSessionStatus?.readyForAnalysis === false, "OBD text scan session treated unlisted applicability with explicit next_readout_candidates as analysis-ready");
check(textScanSessionExplicitCandidatesUnlistedBlocking.coreSessionStatus?.nextRecommendedReadoutId === "custom_text_snapshot", "OBD text scan session did not preserve explicit next_readout_candidates over unlisted applicability blocking");
const textScanSessionExplicitCandidatesPartialWarning = obd.buildScanSessionFromObdText("NO DTC", {
  session_id: "obd-text-explicit-partial-warning",
  vehicle_applicability: { status: "partial" },
  dtc_snapshot: { blocked: false, capturedAt: "2026-07-06T00:21:30Z", codes: [], dtcs: [] },
  next_readout_candidates: [{ id: "custom_text_snapshot", label: "Text Snapshot", priority: 1, reason: "outer override" }]
});
check(textScanSessionExplicitCandidatesPartialWarning.warnings.includes("vehicle_applicability_partial"), "OBD text scan session did not surface partial applicability warning with explicit next_readout_candidates");
check(!textScanSessionExplicitCandidatesPartialWarning.coreSessionStatus?.blockingWarningIds?.includes("vehicle_applicability_partial"), "OBD text scan session incorrectly treated partial applicability as a blocking warning with explicit next_readout_candidates");
check(textScanSessionExplicitCandidatesPartialWarning.coreSessionStatus?.readyForAnalysis === false, "OBD text scan session treated partial applicability with explicit next_readout_candidates as analysis-ready");
check(textScanSessionExplicitCandidatesPartialWarning.coreSessionStatus?.nextRecommendedReadoutId === "custom_text_snapshot", "OBD text scan session did not preserve explicit next_readout_candidates over partial applicability warning");
const textScanSessionPopulatedPartialApplicability = obd.buildScanSessionFromObdText("NO DTC", {
  session_id: "obd-text-populated-partial-applicability",
  vehicle_applicability: { status: "partial" },
  dtc_snapshot: bridgeDtcSnapshot,
  live_pid_snapshot: bridgePidSnapshot,
  freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
  readiness_snapshot: bridgeReadinessSnapshot,
  ecu_info_snapshot: bridgeEcuInfoSnapshot,
  onboard_monitor_snapshot: bridgeOnboardMonitorSnapshot,
  supported_pid_matrix: bridgeSupportedPidSnapshot
});
check(textScanSessionPopulatedPartialApplicability.warnings.includes("vehicle_applicability_partial"), "OBD text scan session did not keep partial applicability warning for populated readouts");
check(!textScanSessionPopulatedPartialApplicability.coreSessionStatus?.blockingWarningIds?.includes("vehicle_applicability_partial"), "OBD text scan session incorrectly blocked populated partial applicability");
check(textScanSessionPopulatedPartialApplicability.coreSessionStatus?.readyForAnalysis === true, "OBD text scan session did not allow populated partial applicability inputs to become analysis-ready");
check(textScanSessionPopulatedPartialApplicability.coreSessionStatus?.status === "analysis_ready", "OBD text scan session did not expose analysis_ready status for populated partial applicability");
const textScanSessionPopulatedPartialExplicitCandidates = obd.buildScanSessionFromObdText("NO DTC", {
  session_id: "obd-text-populated-partial-explicit-candidates",
  vehicle_applicability: { status: "partial" },
  dtc_snapshot: bridgeDtcSnapshot,
  live_pid_snapshot: bridgePidSnapshot,
  freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
  readiness_snapshot: bridgeReadinessSnapshot,
  ecu_info_snapshot: bridgeEcuInfoSnapshot,
  onboard_monitor_snapshot: bridgeOnboardMonitorSnapshot,
  supported_pid_matrix: bridgeSupportedPidSnapshot,
  next_readout_candidates: [{ id: "custom_text_snapshot", label: "Text Snapshot", priority: 1, reason: "outer override" }]
});
check(textScanSessionPopulatedPartialExplicitCandidates.coreSessionStatus?.readyForAnalysis === true, "OBD text scan session did not keep populated partial applicability with explicit next_readout_candidates as analysis-ready");
check(textScanSessionPopulatedPartialExplicitCandidates.coreSessionStatus?.status === "analysis_ready", "OBD text scan session did not expose analysis_ready status for populated partial applicability with explicit next_readout_candidates");
check(textScanSessionPopulatedPartialExplicitCandidates.coreSessionStatus?.nextRecommendedReadoutId === "custom_text_snapshot", "OBD text scan session did not preserve explicit next_readout_candidates for populated partial applicability");
check(textScanSessionPopulatedPartialExplicitCandidates.coreSessionStatus?.completionPercent === 100, "OBD text scan session did not keep populated partial applicability with explicit next_readout_candidates at 100 percent completion");
check(Array.isArray(textScanSessionPopulatedPartialExplicitCandidates.coreSessionStatus?.remainingReadoutIds) && textScanSessionPopulatedPartialExplicitCandidates.coreSessionStatus.remainingReadoutIds.length === 0, "OBD text scan session treated populated partial applicability with explicit next_readout_candidates as having unread core readouts");
check(Array.isArray(textScanSessionPopulatedPartialExplicitCandidates.coreSessionStatus?.emptyReadoutIds) && textScanSessionPopulatedPartialExplicitCandidates.coreSessionStatus.emptyReadoutIds.length === 0, "OBD text scan session treated populated partial applicability with explicit next_readout_candidates as having empty core readouts");
const textScanSessionPopulatedManualApplicability = obd.buildScanSessionFromObdText("NO DTC", {
  session_id: "obd-text-populated-manual-applicability",
  vehicle_applicability: { status: "manual" },
  dtc_snapshot: bridgeDtcSnapshot,
  live_pid_snapshot: bridgePidSnapshot,
  freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
  readiness_snapshot: bridgeReadinessSnapshot,
  ecu_info_snapshot: bridgeEcuInfoSnapshot,
  onboard_monitor_snapshot: bridgeOnboardMonitorSnapshot,
  supported_pid_matrix: bridgeSupportedPidSnapshot
});
check(textScanSessionPopulatedManualApplicability.coreSessionStatus?.blockingWarningIds?.includes("vehicle_profile_manual"), "OBD text scan session did not keep manual applicability as a blocking warning for populated readouts");
check(textScanSessionPopulatedManualApplicability.coreSessionStatus?.readyForAnalysis === false, "OBD text scan session incorrectly allowed populated manual applicability inputs to become analysis-ready");
check(textScanSessionPopulatedManualApplicability.coreSessionStatus?.status === "collecting_readouts", "OBD text scan session did not keep populated manual applicability in collecting_readouts");
check(textScanSessionPopulatedManualApplicability.coreSessionStatus?.completionPercent === 100, "OBD text scan session did not keep populated manual applicability at 100 percent completion");
check(Array.isArray(textScanSessionPopulatedManualApplicability.coreSessionStatus?.remainingReadoutIds) && textScanSessionPopulatedManualApplicability.coreSessionStatus.remainingReadoutIds.length === 0, "OBD text scan session treated populated manual applicability as having unread core readouts");
check(Array.isArray(textScanSessionPopulatedManualApplicability.coreSessionStatus?.emptyReadoutIds) && textScanSessionPopulatedManualApplicability.coreSessionStatus.emptyReadoutIds.length === 0, "OBD text scan session treated populated manual applicability as having empty core readouts");
const textScanSessionPopulatedManualExplicitCandidates = obd.buildScanSessionFromObdText("NO DTC", {
  session_id: "obd-text-populated-manual-explicit-candidates",
  vehicle_applicability: { status: "manual" },
  dtc_snapshot: bridgeDtcSnapshot,
  live_pid_snapshot: bridgePidSnapshot,
  freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
  readiness_snapshot: bridgeReadinessSnapshot,
  ecu_info_snapshot: bridgeEcuInfoSnapshot,
  onboard_monitor_snapshot: bridgeOnboardMonitorSnapshot,
  supported_pid_matrix: bridgeSupportedPidSnapshot,
  next_readout_candidates: [{ id: "custom_text_snapshot", label: "Text Snapshot", priority: 1, reason: "outer override" }]
});
check(textScanSessionPopulatedManualExplicitCandidates.coreSessionStatus?.blockingWarningIds?.includes("vehicle_profile_manual"), "OBD text scan session did not keep manual applicability blocking with explicit next_readout_candidates on populated readouts");
check(textScanSessionPopulatedManualExplicitCandidates.coreSessionStatus?.completionPercent === 100, "OBD text scan session did not keep populated manual applicability with explicit next_readout_candidates at 100 percent completion");
check(textScanSessionPopulatedManualExplicitCandidates.coreSessionStatus?.nextRecommendedReadoutId === "custom_text_snapshot", "OBD text scan session did not preserve explicit next_readout_candidates for populated manual applicability");
const textScanSessionPopulatedUnlistedApplicability = obd.buildScanSessionFromObdText("NO DTC", {
  session_id: "obd-text-populated-unlisted-applicability",
  vehicle_applicability: { status: "unlisted" },
  dtc_snapshot: bridgeDtcSnapshot,
  live_pid_snapshot: bridgePidSnapshot,
  freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
  readiness_snapshot: bridgeReadinessSnapshot,
  ecu_info_snapshot: bridgeEcuInfoSnapshot,
  onboard_monitor_snapshot: bridgeOnboardMonitorSnapshot,
  supported_pid_matrix: bridgeSupportedPidSnapshot
});
check(textScanSessionPopulatedUnlistedApplicability.coreSessionStatus?.blockingWarningIds?.includes("vehicle_applicability_unlisted"), "OBD text scan session did not keep unlisted applicability as a blocking warning for populated readouts");
check(textScanSessionPopulatedUnlistedApplicability.coreSessionStatus?.readyForAnalysis === false, "OBD text scan session incorrectly allowed populated unlisted applicability inputs to become analysis-ready");
check(textScanSessionPopulatedUnlistedApplicability.coreSessionStatus?.status === "collecting_readouts", "OBD text scan session did not keep populated unlisted applicability in collecting_readouts");
check(textScanSessionPopulatedUnlistedApplicability.coreSessionStatus?.completionPercent === 100, "OBD text scan session did not keep populated unlisted applicability at 100 percent completion");
check(Array.isArray(textScanSessionPopulatedUnlistedApplicability.coreSessionStatus?.remainingReadoutIds) && textScanSessionPopulatedUnlistedApplicability.coreSessionStatus.remainingReadoutIds.length === 0, "OBD text scan session treated populated unlisted applicability as having unread core readouts");
check(Array.isArray(textScanSessionPopulatedUnlistedApplicability.coreSessionStatus?.emptyReadoutIds) && textScanSessionPopulatedUnlistedApplicability.coreSessionStatus.emptyReadoutIds.length === 0, "OBD text scan session treated populated unlisted applicability as having empty core readouts");
const textScanSessionPopulatedUnlistedExplicitCandidates = obd.buildScanSessionFromObdText("NO DTC", {
  session_id: "obd-text-populated-unlisted-explicit-candidates",
  vehicle_applicability: { status: "unlisted" },
  dtc_snapshot: bridgeDtcSnapshot,
  live_pid_snapshot: bridgePidSnapshot,
  freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
  readiness_snapshot: bridgeReadinessSnapshot,
  ecu_info_snapshot: bridgeEcuInfoSnapshot,
  onboard_monitor_snapshot: bridgeOnboardMonitorSnapshot,
  supported_pid_matrix: bridgeSupportedPidSnapshot,
  next_readout_candidates: [{ id: "custom_text_snapshot", label: "Text Snapshot", priority: 1, reason: "outer override" }]
});
check(textScanSessionPopulatedUnlistedExplicitCandidates.coreSessionStatus?.blockingWarningIds?.includes("vehicle_applicability_unlisted"), "OBD text scan session did not keep unlisted applicability blocking with explicit next_readout_candidates on populated readouts");
check(textScanSessionPopulatedUnlistedExplicitCandidates.coreSessionStatus?.completionPercent === 100, "OBD text scan session did not keep populated unlisted applicability with explicit next_readout_candidates at 100 percent completion");
check(textScanSessionPopulatedUnlistedExplicitCandidates.coreSessionStatus?.nextRecommendedReadoutId === "custom_text_snapshot", "OBD text scan session did not preserve explicit next_readout_candidates for populated unlisted applicability");
const textScanSessionExplicitCamelCoverageAndCandidates = obd.buildScanSessionFromObdText(obdTextLog, {
  sessionId: "obd-text-explicit-camel-coverage-candidates",
  readoutCoverage: legacyReadoutCoverage,
  nextReadoutCandidates: [{ id: "custom_text_camel_snapshot", label: "Text Camel Snapshot", priority: 1, reason: "camel override" }]
});
check(textScanSessionExplicitCamelCoverageAndCandidates.sessionId === "obd-text-explicit-camel-coverage-candidates", "OBD text scan session did not preserve camelCase sessionId option input");
check(textScanSessionExplicitCamelCoverageAndCandidates.readoutCoverage?.capturedPercent === 29, "OBD text scan session did not preserve camelCase readoutCoverage option input");
check(textScanSessionExplicitCamelCoverageAndCandidates.nextReadoutCandidates[0]?.id === "custom_text_camel_snapshot", "OBD text scan session did not preserve camelCase nextReadoutCandidates option input");
check(textScanSessionExplicitCamelCoverageAndCandidates.coreSessionStatus?.nextRecommendedReadoutId === "custom_text_camel_snapshot", "OBD text scan session did not let camelCase explicit nextReadoutCandidates drive coreSessionStatus nextRecommendedReadoutId");
const textScanSessionSupportedPidReason = obd.buildScanSessionFromObdText("P0171", {
  session_id: "obd-text-supported-pid-reason",
  vehicle_applicability: vehicleApplicabilitySample,
  dtc_snapshot: bridgeDtcSnapshot,
  freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
  readiness_snapshot: bridgeReadinessSnapshot,
  ecu_info_snapshot: bridgeEcuInfoSnapshot,
  supported_pid_matrix: bridgeSupportedPidSnapshot
});
check(textScanSessionSupportedPidReason.nextReadoutCandidates.find((item) => item.id === "live_pid_snapshot")?.reason === "対応PID実測確認のため再確認候補", "OBD text scan session did not derive live_pid_snapshot reason from supported_pid_matrix");
const textScanSessionUnknownApplicability = obd.buildScanSessionFromObdText("NO DTC", {
  session_id: "obd-text-unknown-applicability",
  dtc_snapshot: { blocked: false, capturedAt: "2026-07-06T00:11:00Z", codes: [], dtcs: [] },
  freeze_frame_snapshot: { blocked: false, capturedAt: "2026-07-06T00:11:01Z", monitorValues: [] },
  readiness_snapshot: { blocked: false, capturedAt: "2026-07-06T00:11:02Z", monitors: [], monitorCount: 0 },
  ecu_info_snapshot: { blocked: false, capturedAt: "2026-07-06T00:11:03Z", items: [], itemCount: 0 },
  supported_pid_matrix: { blocked: false, capturedAt: "2026-07-06T00:11:04Z", supportedPids: [], supportedCount: 0 },
  live_pid_snapshot: { blocked: false, capturedAt: "2026-07-06T00:11:05Z", monitorValues: [] }
});
check(textScanSessionUnknownApplicability.coreSessionStatus?.applicabilityStatus === "unknown", "OBD text scan session did not default missing vehicle applicability to unknown");
check(textScanSessionUnknownApplicability.coreSessionStatus?.nextRecommendedReadoutId === "dtc_snapshot", "OBD text scan session did not prioritize dtc_snapshot when vehicle applicability is absent");
const textScanSessionExplicitMetaOverrides = obd.buildScanSessionFromObdText(obdTextLog, {
  session_id: "obd-text-explicit-meta-overrides",
  tool_hints: ["Techstream", "J2534"],
  warning_flags: ["isotp_reassembly_issue"],
  source_length: 128,
  had_sensitive_identifier: true
});
check(textScanSessionExplicitMetaOverrides.toolHints.join(",") === "Techstream,J2534", "OBD text scan session did not preserve explicit tool_hints option input");
check(textScanSessionExplicitMetaOverrides.warnings.includes("isotp_reassembly_issue"), "OBD text scan session did not preserve explicit warning_flags option input");
check(textScanSessionExplicitMetaOverrides.sourceLength === 128, "OBD text scan session did not preserve explicit source_length option input");
check(textScanSessionExplicitMetaOverrides.hadSensitiveIdentifier === true, "OBD text scan session did not preserve explicit had_sensitive_identifier option input");
const textScanSessionExplicitMixedMetaOverrides = obd.buildScanSessionFromObdText(obdTextLog, {
  sessionId: "obd-text-explicit-mixed-meta-overrides",
  toolHints: ["Techstream"],
  warning_flags: ["isotp_reassembly_issue"],
  sourceLength: 129,
  had_sensitive_identifier: true,
  importClassification: {
    schemaVersion: "obd_response_line_classification_v1",
    bucketCounts: { livePidResponses: 22 }
  }
});
check(textScanSessionExplicitMixedMetaOverrides.sessionId === "obd-text-explicit-mixed-meta-overrides", "OBD text scan session did not preserve mixed-case sessionId option input");
check(textScanSessionExplicitMixedMetaOverrides.toolHints.join(",") === "Techstream", "OBD text scan session did not preserve mixed-case toolHints option input");
check(textScanSessionExplicitMixedMetaOverrides.warnings.includes("isotp_reassembly_issue"), "OBD text scan session did not preserve mixed-case warning_flags option input");
check(textScanSessionExplicitMixedMetaOverrides.sourceLength === 129, "OBD text scan session did not preserve mixed-case sourceLength option input");
check(textScanSessionExplicitMixedMetaOverrides.hadSensitiveIdentifier === true, "OBD text scan session did not preserve mixed-case had_sensitive_identifier option input");
check(textScanSessionExplicitMixedMetaOverrides.importClassification?.bucketCounts?.livePidResponses === 22, "OBD text scan session did not preserve mixed-case importClassification option input");
const textScanSessionExplicitCamelMetaOverrides = obd.buildScanSessionFromObdText(obdTextLog, {
  sessionId: "obd-text-explicit-camel-meta-overrides",
  toolHints: ["Techstream", "J2534"],
  warningFlags: ["isotp_reassembly_issue"],
  sourceLength: 128,
  hadSensitiveIdentifier: true,
  importClassification: {
    schemaVersion: "obd_response_line_classification_v1",
    bucketCounts: { livePidResponses: 77 }
  }
});
check(textScanSessionExplicitCamelMetaOverrides.toolHints.join(",") === "Techstream,J2534", "OBD text scan session did not preserve explicit camelCase toolHints option input");
check(textScanSessionExplicitCamelMetaOverrides.warnings.includes("isotp_reassembly_issue"), "OBD text scan session did not preserve explicit camelCase warningFlags option input");
check(textScanSessionExplicitCamelMetaOverrides.sourceLength === 128, "OBD text scan session did not preserve explicit camelCase sourceLength option input");
check(textScanSessionExplicitCamelMetaOverrides.hadSensitiveIdentifier === true, "OBD text scan session did not preserve explicit camelCase hadSensitiveIdentifier option input");
check(textScanSessionExplicitCamelMetaOverrides.importClassification?.bucketCounts?.livePidResponses === 77, "OBD text scan session did not preserve explicit camelCase importClassification option input");
const textScanSessionExplicitImportClassification = obd.buildScanSessionFromObdText(obdTextLog, {
  session_id: "obd-text-explicit-import-classification",
  import_classification: {
    schemaVersion: "obd_response_line_classification_v1",
    bucketCounts: { livePidResponses: 99 },
    negativeResponseSummary: { totalCount: 7 }
  }
});
check(textScanSessionExplicitImportClassification.importClassification?.bucketCounts?.livePidResponses === 99, "OBD text scan session did not preserve explicit import_classification bucket count override");
check(textScanSessionExplicitImportClassification.importClassification?.negativeResponseSummary?.totalCount === 7, "OBD text scan session did not preserve explicit import_classification negative response override");
check(textScanSessionExplicitImportClassification.importClassification?.bucketCounts?.freezeFrameResponses === 2, "OBD text scan session did not retain derived import_classification bucket counts when applying explicit override");
const textScanSessionRebuilt = obd.buildDiagnosticScanSession({
  session_id: "obd-text-rebuilt",
  scan_session: textScanSession
});
check(textScanSessionRebuilt.importClassification?.negativeResponseSummary?.totalCount === 1, "Diagnostic scan session did not preserve importClassification from obd_text scan session");
check(textScanSessionRebuilt.warnings.includes("negative_obd_response_present"), "Diagnostic scan session did not preserve text-derived warnings from obd_text scan session");
const textScanSessionOuterImportClassificationOverride = obd.buildDiagnosticScanSession({
  session_id: "obd-text-import-classification-outer-override",
  import_classification: {
    schemaVersion: "obd_response_line_classification_v1",
    bucketCounts: { livePidResponses: 99 }
  },
  scan_session: textScanSession
});
check(textScanSessionOuterImportClassificationOverride.importClassification?.bucketCounts?.livePidResponses === 99, "Diagnostic scan session did not let outer import_classification override nested scan_session input");
const compactCanLog = [
  "can0 7E8#04410C1AF8",
  "(171234.123456) can0 7E8#0341057B"
].join("\n");
const compactCanSession = obd.buildScanSessionFromObdText(compactCanLog, { session_id: "compact-can-log", protocol: "ISO15765-4" });
check(compactCanSession.importClassification.bucketCounts.livePidResponses === 2, "Compact CAN log live PID responses were not classified");
check(compactCanSession.livePidSnapshot.monitorValues.find((item) => item.id === "engine_speed")?.value === 1726, "Compact CAN log did not decode engine RPM");
check(compactCanSession.livePidSnapshot.monitorValues.find((item) => item.id === "coolant_temp")?.value === 83, "Compact CAN log did not decode coolant temperature");
check(compactCanSession.ecuResponseSummary.ecus.find((item) => item.address === "7E8")?.responseCount === 2, "Compact CAN log did not keep ECU response count");
check(compactCanSession.ecuResponseSummary.ecus.find((item) => item.address === "7E8")?.services.includes("41"), "Compact CAN log did not keep ECU service list");
check(compactCanSession.wouldTransmit === false && compactCanSession.retainedRawFrames === false, "Compact CAN log import retained raw frames or allowed transmit");
const bracketCanClassification = obd.classifyObdResponseLines("can0  7E8   [4]  41 0C 1A F8");
check(bracketCanClassification.responseBuckets.livePidResponses[0]?.ecu === "7E8", "Bracket CAN log did not keep ECU address");
check(bracketCanClassification.responseBuckets.livePidResponses[0]?.frameLength === 4, "Bracket CAN log did not keep frame length");
const extendedCanClassification = obd.classifyObdResponseLines("(0.000000) can0 18DAF110#06410018180000");
check(extendedCanClassification.responseBuckets.supportedPidResponses[0]?.ecu === "18DAF110", "Extended CAN ID log did not keep ECU address");
check(obd.buildScanSessionFromObdText("(0.000000) can0 18DAF110#06410018180000").supportedPidMatrix.supportedPids.includes("04"), "Extended CAN ID log did not decode supported PIDs");
const savvyCanCsvSession = obd.buildScanSessionFromObdText("0.001,7E8,false,Rx,0,4,41,0C,1A,F8", { session_id: "savvycan-csv-log" });
check(savvyCanCsvSession.livePidSnapshot.monitorValues.find((item) => item.id === "engine_speed")?.value === 1726, "SavvyCAN CSV log did not decode engine RPM");
check(savvyCanCsvSession.ecuResponseSummary.ecus.find((item) => item.address === "7E8")?.responseCount === 1, "SavvyCAN CSV log did not keep ECU response count");
check(savvyCanCsvSession.wouldTransmit === false && savvyCanCsvSession.retainedRawFrames === false, "SavvyCAN CSV log import retained raw frames or allowed transmit");
const scanSession = obd.buildDiagnosticScanSession({
  session_id: "shop-test-1",
  dtcSnapshot: { dtcs: [{ code: "P0171", status: "stored", ecu: "7E8" }, "P0300"] },
  livePidSnapshot: bridgePidSnapshot,
  freezeFrame: {
    trigger_dtc: "P0171",
    values: [
      { id: "engine_speed", value: 2200, unit: "rpm" },
      { id: "coolant_temp", value: 84, unit: "°C" }
    ]
  },
  readiness: {
    mil_on: true,
    monitors: [
      { id: "catalyst", label: "触媒", supported: true, complete: false },
      { id: "misfire", label: "失火", supported: true, complete: true }
    ]
  },
  onboardMonitor: {
    tests: [
      { test_id: "01", component_id: "01", value: 100, min: 50, max: 200 },
      { test_id: "02", component_id: "01", value: 300, min: 50, max: 200 }
    ]
  },
  ecuInfo: {
    values: [
      { id: "vin", info_type: "02", value: "JTDKN3DU0A0123456" },
      { id: "calibration_id", info_type: "04", value: "CAL-1234" },
      { id: "calibration_verification_number", info_type: "06", value: "CVN-ABCD" },
      { id: "ecu_name", info_type: "0A", value: "Engine ECU" }
    ]
  },
  ecus: [{ ecu: "7E8", status: "ok", dtcs: ["P0171"] }],
  adapterIdentity: bridgeAdapterIdentity,
  supportedPids: ["0C", "05", "03"]
});
check(scanSession.schemaVersion === "scan_session_v1", "診断機セッション形式が不正です");
check(scanSession.dtcSnapshot.codes.join(",") === "P0171,P0300", "診断機セッションへDTCを統合できません");
check(scanSession.freezeFrameSnapshot.triggerDtc === "P0171", "フリーズフレームの起点DTCを保持できません");
check(scanSession.freezeFrameSnapshot.monitorValues.length === 2, "フリーズフレーム値をPID辞書へ整形できません");
check(scanSession.freezeFrameSnapshot.expectedItemCount === freezeFrameItems.length, "フリーズフレーム期待項目辞書をセッションへ反映できません");
check(scanSession.readinessSnapshot.incompleteCount === 1, "レディネス未完了数を集計できません");
check(scanSession.readinessSnapshot.knownMonitorCount === readinessMonitors.length, "レディネス辞書をセッションへ反映できません");
check(scanSession.readinessSnapshot.monitors.find((item) => item.id === "catalyst")?.diagnosticUse.includes("P0420"), "レディネス診断用途を参照できません");
check(scanSession.onboardMonitorSnapshot.failedCount === 1, "Mode 06 failed count was not reflected into scan session");
check(scanSession.warnings.includes("onboard_monitor_test_failed"), "Mode 06 failed warning was not reflected into scan session");
check(scanSession.ecuInfoSnapshot.expectedItemCount === ecuInfoItems.length, "ECU情報辞書をセッションへ反映できません");
check(scanSession.ecuInfoSnapshot.hadSensitiveIdentifier === true, "VIN候補を識別情報として検出できません");
check(scanSession.ecuInfoSnapshot.items.find((item) => item.id === "vin")?.retainedRawValue === false, "VIN生値を保持しています");
check(!JSON.stringify(scanSession.ecuInfoSnapshot).includes("JTDKN3DU0A0123456"), "ECU情報スナップショットにVIN生値が残っています");
check(scanSession.ecuInfoSnapshot.items.find((item) => item.id === "calibration_id")?.value === "CAL-1234", "CALIDを保持できません");
check(scanSession.ecuInfoSnapshot.keyItemSummary.capturedCount === 4 && scanSession.ecuInfoSnapshot.keyItemSummary.missingCount === 0, "ECU情報主要項目要約をセッションへ反映できません");
check(scanSession.ecuInfoSnapshot.supportInfoTypesCaptured === false, "Scan session incorrectly marked supported info types as captured");
check(!scanSession.warnings.includes("mode09_key_items_missing"), "Scan session warned about missing key Mode 09 items despite complete key set");
check(scanSession.warnings.includes("mode09_supported_types_unknown"), "Scan session did not warn about missing supported Mode 09 info types");
check(scanSession.ecuResponseSummary.ecus[0].dtcCount === 1, "ECU応答サマリーへDTC件数を反映できません");
check(scanSession.adapterIdentity.adapterFamily === "elm327", "診断機セッションへアダプター識別情報を反映できません");
check(scanSession.protocol === "ISO15765-4", "診断機セッションへprotocolを反映できません");
check(scanSession.capturedAt === "2026-06-28T00:01:00Z", "診断機セッションへcapturedAtを反映できません");
check(scanSession.supportedPidMatrix.supportedCount >= 3, "対応PIDマトリクスを作成できません");
check(scanSession.readoutCoverage.includeInfrastructure === true, "Diagnostic scan session did not count adapter identity as bridge infrastructure context");
check(scanSession.retainedRawFrames === false && scanSession.vehicleCommandEnabled === false && scanSession.wouldTransmit === false, "診断機セッションが送信または生フレーム保持扱いです");
const nonBridgeScanSession = obd.buildDiagnosticScanSession({
  session_id: "shop-test-non-bridge",
  dtcSnapshot: { dtcs: ["P0300"] },
  supportedPids: ["0C", "05"]
});
check(nonBridgeScanSession.readoutCoverage.includeInfrastructure === false, "Diagnostic scan session incorrectly counted bridge infrastructure without infrastructure inputs");
check(!nonBridgeScanSession.warnings.includes("bridge_readout_incomplete") && !nonBridgeScanSession.warnings.includes("bridge_readout_empty_sections"), "Diagnostic scan session emitted bridge readout warnings without bridge infrastructure context");
check(!nonBridgeScanSession.warnings.includes("mode09_supported_types_unknown"), "Diagnostic scan session emitted mode09_supported_types_unknown without ECU info input");
const readinessOnlyScanSession = obd.buildDiagnosticScanSession({
  session_id: "shop-test-readiness-only",
  readiness_snapshot: {
    blocked: false,
    protocol: "ISO9141-2",
    capturedAt: "2026-07-07T00:01:00Z",
    monitors: [{ id: "catalyst", available: true, complete: false }],
    incompleteCount: 1,
    knownMonitorCount: 1
  }
});
check(readinessOnlyScanSession.protocol === "ISO9141-2", "Diagnostic scan session did not recover protocol from readiness_snapshot-only input");
check(readinessOnlyScanSession.capturedAt === "2026-07-07T00:01:00Z", "Diagnostic scan session did not recover capturedAt from readiness_snapshot-only input");
check(!readinessOnlyScanSession.coreSessionStatus?.remainingReadoutIds?.includes("readiness_snapshot"), "Diagnostic scan session incorrectly treated readiness_snapshot-only input as unread");
check(!readinessOnlyScanSession.coreSessionStatus?.emptyReadoutIds?.includes("readiness_snapshot"), "Diagnostic scan session incorrectly treated readiness_snapshot-only input as empty");
check(readinessOnlyScanSession.coreSessionStatus?.nextRecommendedReadoutId === "dtc_snapshot", "Diagnostic scan session did not fall back to dtc_snapshot after capturing readiness_snapshot-only input");
const freezeFrameOnlyScanSession = obd.buildDiagnosticScanSession({
  session_id: "shop-test-freeze-frame-only",
  freeze_frame_snapshot: {
    blocked: false,
    protocol: "ISO9141-2",
    capturedAt: "2026-07-07T00:01:30Z",
    trigger_dtc: "P0300",
    values: [{ pid: "0C", label: "Engine RPM", value: 900, unit: "rpm" }]
  }
});
check(freezeFrameOnlyScanSession.protocol === "ISO9141-2", "Diagnostic scan session did not recover protocol from freeze_frame_snapshot-only input");
check(freezeFrameOnlyScanSession.capturedAt === "2026-07-07T00:01:30Z", "Diagnostic scan session did not recover capturedAt from freeze_frame_snapshot-only input");
check(freezeFrameOnlyScanSession.freezeFrameSnapshot?.triggerDtc === "P0300", "Diagnostic scan session did not preserve freeze_frame_snapshot-only input");
check(!freezeFrameOnlyScanSession.coreSessionStatus?.remainingReadoutIds?.includes("freeze_frame_snapshot"), "Diagnostic scan session incorrectly treated freeze_frame_snapshot-only input as unread");
check(!freezeFrameOnlyScanSession.coreSessionStatus?.emptyReadoutIds?.includes("freeze_frame_snapshot"), "Diagnostic scan session incorrectly treated freeze_frame_snapshot-only input as empty");
check(freezeFrameOnlyScanSession.coreSessionStatus?.nextRecommendedReadoutId === "dtc_snapshot", "Diagnostic scan session did not fall back to dtc_snapshot after capturing freeze_frame_snapshot-only input");
const supportedPidOnlyScanSession = obd.buildDiagnosticScanSession({
  session_id: "shop-test-supported-pid-only",
  supported_pid_matrix: {
    blocked: false,
    protocol: "ISO9141-2",
    capturedAt: "2026-07-07T00:01:45Z",
    supported_pids: ["0C", "05"]
  }
});
check(supportedPidOnlyScanSession.protocol === "ISO9141-2", "Diagnostic scan session did not recover protocol from supported_pid_matrix-only input");
check(supportedPidOnlyScanSession.capturedAt === "2026-07-07T00:01:45Z", "Diagnostic scan session did not recover capturedAt from supported_pid_matrix-only input");
check(supportedPidOnlyScanSession.supportedPidMatrix?.supportedPids.includes("0C"), "Diagnostic scan session did not preserve supported_pid_matrix-only input");
check(!supportedPidOnlyScanSession.coreSessionStatus?.remainingReadoutIds?.includes("supported_pid_matrix"), "Diagnostic scan session incorrectly treated supported_pid_matrix-only input as unread");
check(!supportedPidOnlyScanSession.coreSessionStatus?.emptyReadoutIds?.includes("supported_pid_matrix"), "Diagnostic scan session incorrectly treated supported_pid_matrix-only input as empty");
check(supportedPidOnlyScanSession.coreSessionStatus?.nextRecommendedReadoutId === "dtc_snapshot", "Diagnostic scan session did not fall back to dtc_snapshot after capturing supported_pid_matrix-only input");
const onboardMonitorOnlyScanSession = obd.buildDiagnosticScanSession({
  session_id: "shop-test-onboard-monitor-only",
  onboard_monitor_snapshot: {
    blocked: false,
    protocol: "ISO9141-2",
    capturedAt: "2026-07-07T00:01:50Z",
    tests: [{ testId: "01", componentId: "01", value: 120, min: 100, max: 140, status: "pass" }]
  }
});
check(onboardMonitorOnlyScanSession.protocol === "ISO9141-2", "Diagnostic scan session did not recover protocol from onboard_monitor_snapshot-only input");
check(onboardMonitorOnlyScanSession.capturedAt === "2026-07-07T00:01:50Z", "Diagnostic scan session did not recover capturedAt from onboard_monitor_snapshot-only input");
check(onboardMonitorOnlyScanSession.onboardMonitorSnapshot?.testCount === 1, "Diagnostic scan session did not preserve onboard_monitor_snapshot-only input");
const ecuResponseOnlyScanSession = obd.buildDiagnosticScanSession({
  session_id: "shop-test-ecu-response-only",
  ecu_response_summary: {
    capturedAt: "2026-07-07T00:01:55Z",
    protocol: "ISO9141-2",
    ecus: [{ address: "7E8", status: "ok", dtcCount: 1, services: ["03"] }]
  }
});
check(ecuResponseOnlyScanSession.protocol === "ISO9141-2", "Diagnostic scan session did not recover protocol from ecu_response_summary-only input");
check(ecuResponseOnlyScanSession.capturedAt === "2026-07-07T00:01:55Z", "Diagnostic scan session did not recover capturedAt from ecu_response_summary-only input");
check(ecuResponseOnlyScanSession.ecuResponseSummary?.ecus[0]?.address === "7E8", "Diagnostic scan session did not preserve ecu_response_summary-only input");
const ecuInfoOnlyScanSession = obd.buildDiagnosticScanSession({
  session_id: "shop-test-ecu-info-only",
  ecu_info_snapshot: {
    blocked: false,
    protocol: "ISO9141-2",
    capturedAt: "2026-07-07T00:01:58Z",
    items: [{ id: "calibration_id", infoType: "04", value: "CAL-ONLY-01" }]
  }
});
check(ecuInfoOnlyScanSession.protocol === "ISO9141-2", "Diagnostic scan session did not recover protocol from ecu_info_snapshot-only input");
check(ecuInfoOnlyScanSession.capturedAt === "2026-07-07T00:01:58Z", "Diagnostic scan session did not recover capturedAt from ecu_info_snapshot-only input");
check(ecuInfoOnlyScanSession.ecuInfoSnapshot?.items.find((item) => item.id === "calibration_id")?.value === "CAL-ONLY-01", "Diagnostic scan session did not preserve ecu_info_snapshot-only input");
check(!ecuInfoOnlyScanSession.coreSessionStatus?.remainingReadoutIds?.includes("ecu_info_snapshot"), "Diagnostic scan session incorrectly treated ecu_info_snapshot-only input as unread");
check(!ecuInfoOnlyScanSession.coreSessionStatus?.emptyReadoutIds?.includes("ecu_info_snapshot"), "Diagnostic scan session incorrectly treated ecu_info_snapshot-only input as empty");
check(ecuInfoOnlyScanSession.coreSessionStatus?.nextRecommendedReadoutId === "dtc_snapshot", "Diagnostic scan session did not fall back to dtc_snapshot after capturing ecu_info_snapshot-only input");
const scanSessionAliasInputs = obd.buildDiagnosticScanSession({
  session_id: "shop-test-alias",
  started_at: "2026-06-28T00:10:00Z",
  ended_at: "2026-06-28T00:11:00Z",
  vehicle_profile: { maker: "Toyota", model: "Aqua" },
  vehicle_applicability: vehicleApplicabilitySample,
  connection_status: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { status: "ready", is_paired: true, vci_ready: true, car_connected: true }
  },
  vci_list: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { items: [{ deviceId: "scan-vci", name: "Scan VCI", isConnected: true }], selectedVciId: "scan-vci" }
  },
  adapter_identity: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { adapter: "Scan Adapter", family: "j2534", version: "5.0" }
  },
  dtcSnapshot: bridgeDtcSnapshot,
  livePidSnapshot: bridgePidSnapshot
});
check(scanSessionAliasInputs.connectionStatus.displayStatus === "読取準備モデル", "Diagnostic scan session did not accept connection_status alias input");
check(scanSessionAliasInputs.vciDevices[0]?.id === "scan-vci", "Diagnostic scan session did not accept vci_list alias input");
check(scanSessionAliasInputs.adapterIdentity.firmwareVersion === "5.0", "Diagnostic scan session did not accept adapter_identity alias input");
check(scanSessionAliasInputs.readoutCoverage.includeInfrastructure === true, "Diagnostic scan session did not include bridge infrastructure when infrastructure inputs were provided");
check(scanSessionAliasInputs.startedAt === "2026-06-28T00:10:00Z" && scanSessionAliasInputs.endedAt === "2026-06-28T00:11:00Z", "Diagnostic scan session did not accept started_at or ended_at alias input");
check(scanSessionAliasInputs.vehicleProfile?.model === "Aqua", "Diagnostic scan session did not accept vehicle_profile alias input");
check(scanSessionAliasInputs.vehicleApplicability?.status === "matched", "Diagnostic scan session did not accept vehicle_applicability alias input");
check(!scanSessionAliasInputs.warnings.includes("vehicle_applicability_partial"), "Diagnostic scan session emitted partial applicability warning for matched vehicle_applicability");
const scanSessionDirectMixedVehicleMetadata = obd.buildDiagnosticScanSession({
  sessionId: "shop-test-mixed-vehicle-meta",
  vehicleProfile: { maker: "Toyota", model: "Mixed Roomy" },
  vehicle_applicability: vehicleApplicabilitySample,
  dtcSnapshot: bridgeDtcSnapshot
});
check(scanSessionDirectMixedVehicleMetadata.sessionId === "shop-test-mixed-vehicle-meta", "Diagnostic scan session did not preserve mixed-case direct sessionId input");
check(scanSessionDirectMixedVehicleMetadata.vehicleProfile?.model === "Mixed Roomy", "Diagnostic scan session did not preserve mixed-case direct vehicleProfile input");
check(scanSessionDirectMixedVehicleMetadata.vehicleApplicability?.status === "matched", "Diagnostic scan session did not preserve mixed-case direct vehicle_applicability input");
const scanSessionApplicabilityPartial = obd.buildDiagnosticScanSession({
  session_id: "shop-test-applicability-partial",
  vehicle_profile: { maker: "Toyota", model: "Prius" },
  vehicle_applicability: vehicleApplicabilityPartialSample,
  dtcSnapshot: bridgeDtcSnapshot
});
check(scanSessionApplicabilityPartial.warnings.includes("vehicle_applicability_partial"), "Diagnostic scan session did not emit partial applicability warning");
check(Array.isArray(scanSessionApplicabilityPartial.nextReadoutCandidates) && scanSessionApplicabilityPartial.nextReadoutCandidates.length > 0, "Diagnostic scan session did not derive next readout candidates");
check(scanSessionApplicabilityPartial.nextReadoutCandidates[0]?.id === "freeze_frame_snapshot", "Diagnostic scan session did not prioritize freeze_frame_snapshot as the next readout candidate");
check(scanSessionApplicabilityPartial.nextReadoutCandidates[1]?.id === "ecu_info_snapshot", "Diagnostic scan session did not prioritize ecu_info_snapshot after freeze_frame for partial applicability");
check(scanSessionApplicabilityPartial.nextReadoutCandidates[0]?.reason === "読取応答が空のため再確認候補", "Diagnostic scan session next readout reason should stay concise for partial applicability");
check(scanSessionApplicabilityPartial.coreSessionStatus?.nextRecommendedReadoutId === "freeze_frame_snapshot", "Diagnostic scan session did not expose nextRecommendedReadoutId in coreSessionStatus");
check(!scanSessionApplicabilityPartial.coreSessionStatus?.blockingWarningIds?.includes("vehicle_applicability_partial"), "Diagnostic scan session incorrectly treated partial applicability warning as a blocking warning");
check(scanSessionApplicabilityPartial.coreSessionStatus?.readyForAnalysis === false, "Diagnostic scan session incorrectly marked partial readout inputs as analysis-ready");
const scanSessionAdapterOnly = obd.buildDiagnosticScanSession({
  session_id: "shop-test-adapter-only",
  adapter_identity: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { adapter: "Adapter Only", family: "elm327", version: "2.3" }
  },
  dtcSnapshot: bridgeDtcSnapshot
});
check(scanSessionAdapterOnly.readoutCoverage.includeInfrastructure === true, "Diagnostic scan session did not include bridge infrastructure for adapter_identity-only input");
const scanSessionSnapshotAliases = obd.buildDiagnosticScanSession({
  session_id: "shop-test-snapshots",
  dtc_snapshot: bridgeDtcSnapshot,
  live_pid_snapshot: bridgePidSnapshot,
  freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
  readiness_snapshot: bridgeReadinessSnapshot,
  onboard_monitor_snapshot: bridgeOnboardMonitorSnapshot,
  ecu_info_snapshot: bridgeEcuInfoSnapshot,
  ecu_response_summary: bridgeSummary.ecuResponseSummary,
  supported_pid_matrix: bridgeSupportedPidSnapshot
});
check(scanSessionSnapshotAliases.dtcSnapshot.codes.join(",") === "P0171,P0300", "Diagnostic scan session did not accept dtc_snapshot alias input");
check(scanSessionSnapshotAliases.freezeFrameSnapshot.triggerDtc === "P0171", "Diagnostic scan session did not accept freeze_frame_snapshot alias input");
check(scanSessionSnapshotAliases.readinessSnapshot.incompleteCount === 1, "Diagnostic scan session did not accept readiness_snapshot alias input");
check(scanSessionSnapshotAliases.onboardMonitorSnapshot.failedCount === 1, "Diagnostic scan session did not accept onboard_monitor_snapshot alias input");
check(scanSessionSnapshotAliases.ecuInfoSnapshot.itemCount === bridgeEcuInfoSnapshot.itemCount, "Diagnostic scan session did not accept ecu_info_snapshot alias input");
check(scanSessionSnapshotAliases.supportedPidMatrix.supportedPids.includes("05"), "Diagnostic scan session did not accept supported_pid_matrix alias input");
const scanSessionSupportedPidReason = obd.buildDiagnosticScanSession({
  session_id: "shop-test-supported-pid-reason",
  vehicle_applicability: vehicleApplicabilitySample,
  dtc_snapshot: bridgeDtcSnapshot,
  freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
  readiness_snapshot: bridgeReadinessSnapshot,
  ecu_info_snapshot: bridgeEcuInfoSnapshot,
  supported_pid_matrix: bridgeSupportedPidSnapshot
});
check(scanSessionSupportedPidReason.nextReadoutCandidates.find((item) => item.id === "live_pid_snapshot")?.reason === "対応PID実測確認のため再確認候補", "Diagnostic scan session did not derive live_pid_snapshot reason from supported_pid_matrix");
const scanSessionSupportedPidPriority = obd.buildDiagnosticScanSession({
  session_id: "shop-test-supported-pid-priority",
  vehicle_applicability: vehicleApplicabilitySample,
  readout_coverage: {
    includeInfrastructure: false,
    items: [
      { id: "supported_pid_matrix", label: "Supported PID", status: "missing", available: false, count: 0 },
      { id: "live_pid_snapshot", label: "Live PID", status: "missing", available: false, count: 0 }
    ]
  },
  supported_pid_matrix: { blocked: false, capturedAt: "2026-07-07T00:05:00Z", supportedPids: ["0C", "0D"], supportedCount: 2 }
});
check(scanSessionSupportedPidPriority.nextReadoutCandidates[0]?.id === "live_pid_snapshot", "Diagnostic scan session did not prioritize live_pid_snapshot when supported PID data is available");
check(scanSessionSupportedPidPriority.nextReadoutCandidates[1]?.id === "supported_pid_matrix", "Diagnostic scan session did not keep supported_pid_matrix after live_pid_snapshot when supported PID data is available");
const scanSessionEcuInfoCamelAliases = obd.buildDiagnosticScanSession({
  session_id: "shop-test-ecuinfo-camel",
  ecuInfo: [
    { itemId: "calibration_id", infoType: "04", decodedValue: "CAL-SCAN-CAMEL" },
    { itemId: "ecu_name", infoType: "0A", rawValue: "Scan Camel ECU" }
  ]
});
check(scanSessionEcuInfoCamelAliases.ecuInfoSnapshot.itemCount === 2, "Diagnostic scan session did not accept ecuInfo camelCase alias input");
check(scanSessionEcuInfoCamelAliases.ecuInfoSnapshot.items.find((item) => item.id === "calibration_id")?.value === "CAL-SCAN-CAMEL", "Diagnostic scan session did not retain calibration_id from ecuInfo camelCase alias input");
const scanSessionEcuInfoItemsCamelAliases = obd.buildDiagnosticScanSession({
  session_id: "shop-test-ecuinfoitems-camel",
  ecuInfoItems: [
    { itemId: "calibration_verification_number", infoType: "06", decodedValue: "CVN-SCAN-CAMEL" },
    { itemId: "ecu_name", infoType: "0A", rawValue: "Scan Items Camel ECU" }
  ]
});
check(scanSessionEcuInfoItemsCamelAliases.ecuInfoSnapshot.itemCount === 2, "Diagnostic scan session did not accept ecuInfoItems camelCase alias input");
check(scanSessionEcuInfoItemsCamelAliases.ecuInfoSnapshot.items.find((item) => item.id === "calibration_verification_number")?.value === "CVN-SCAN-CAMEL", "Diagnostic scan session did not retain CVN from ecuInfoItems camelCase alias input");
const scanSessionEcuResponseAlias = obd.buildDiagnosticScanSession({
  session_id: "shop-test-ecu-response-alias",
  dtc_snapshot: bridgeDtcSnapshot,
  live_pid_snapshot: bridgePidSnapshot,
  ecu_responses: [{ ecu: "7E8", status: "ok", dtcs: ["P0171"] }]
});
check(scanSessionEcuResponseAlias.ecuResponseSummary.ecus[0]?.dtcCount === 1, "Diagnostic scan session did not accept ecu_responses alias input");
const scanSessionNestedSessionAlias = obd.buildDiagnosticScanSession({
  session: bridgeDiagnosticImport.exportPayload.session,
  session_id: "shop-test-nested-session"
});
check(scanSessionNestedSessionAlias.adapterIdentity.adapterFamily === "elm327", "Diagnostic scan session did not accept nested session alias input");
check(scanSessionNestedSessionAlias.vciDevices[0]?.id === bridgeDiagnosticImport.exportPayload.session.vci_devices[0]?.id, "Diagnostic scan session did not carry vci_devices from nested session alias input");
check(scanSessionNestedSessionAlias.supportedPidMatrix.supportedPids.includes("40"), "Diagnostic scan session did not carry supported_pid_matrix from nested session alias input");
check(scanSessionNestedSessionAlias.vehicleProfile?.maker === bridgeDiagnosticImport.exportPayload.session.vehicle_profile?.maker, "Diagnostic scan session did not carry vehicle_profile maker from nested session alias input");
check(scanSessionNestedSessionAlias.vehicleProfile?.model === bridgeDiagnosticImport.exportPayload.session.vehicle_profile?.model, "Diagnostic scan session did not carry vehicle_profile model from nested session alias input");
check(scanSessionNestedSessionAlias.vehicleApplicability?.status === "matched", "Diagnostic scan session did not carry vehicle_applicability from nested session alias input");
check(scanSessionNestedSessionAlias.nextReadoutCandidates[0]?.id === bridgeDiagnosticImport.exportPayload.session.next_readout_candidates[0]?.id, "Diagnostic scan session did not carry next_readout_candidates from nested session alias input");
const scanSessionNestedToolHintsAlias = obd.buildDiagnosticScanSession({
  session_id: "shop-test-nested-tool-hints",
  session: {
    tool_hints: ["Techstream", "J2534"]
  }
});
check(scanSessionNestedToolHintsAlias.toolHints.join(",") === "Techstream,J2534", "Diagnostic scan session did not carry tool_hints from nested session alias input");
const scanSessionScanSessionAlias = obd.buildDiagnosticScanSession({
  scan_session: bridgeExportPayload.session,
  session_id: "shop-test-scan-session-alias"
});
const scanSessionExplicitUnsortedCandidates = obd.buildDiagnosticScanSession({
  session_id: "shop-test-explicit-candidates",
  next_readout_candidates: explicitNextReadoutCandidatesUnsortedSample
});
check(scanSessionScanSessionAlias.ecuInfoSnapshot.itemCount === bridgeEcuInfoSnapshot.itemCount, "Diagnostic scan session did not accept scan_session alias input");
check(scanSessionScanSessionAlias.readinessSnapshot.incompleteCount === 1, "Diagnostic scan session did not carry readiness from scan_session alias input");
check(scanSessionScanSessionAlias.nextReadoutCandidates[0]?.id === bridgeExportPayload.session.next_readout_candidates[0]?.id, "Diagnostic scan session did not carry next_readout_candidates from scan_session alias input");
check(scanSessionScanSessionAlias.vehicleApplicability?.status === bridgeExportPayload.session.vehicle_applicability?.status, "Diagnostic scan session did not carry vehicle_applicability from scan_session alias input");
check(scanSessionScanSessionAlias.readoutCoverage?.progressPercent === bridgeExportPayload.session.readout_coverage?.progressPercent, "Diagnostic scan session did not carry readout_coverage from scan_session alias input");
const scanSessionScanSessionToolHintsAlias = obd.buildDiagnosticScanSession({
  session_id: "shop-test-scan-session-tool-hints",
  scan_session: {
    toolHints: ["CONSULT", "IDS"]
  }
});
check(scanSessionScanSessionToolHintsAlias.toolHints.join(",") === "CONSULT,IDS", "Diagnostic scan session did not carry toolHints from scan_session alias input");
check(scanSessionExplicitUnsortedCandidates.nextReadoutCandidates[0]?.id === "dtc_snapshot", "Diagnostic scan session did not sort explicit next_readout_candidates by priority");
check(scanSessionExplicitUnsortedCandidates.coreSessionStatus?.nextRecommendedReadoutId === "dtc_snapshot", "Diagnostic scan session did not let explicit next_readout_candidates drive coreSessionStatus nextRecommendedReadoutId");
const scanSessionExplicitCandidatesEmptyReadouts = obd.buildDiagnosticScanSession({
  session_id: "shop-test-explicit-empty-readouts",
  dtc_snapshot: { blocked: false, capturedAt: "2026-07-06T00:22:00Z", codes: [], dtcs: [] },
  freeze_frame_snapshot: { blocked: false, capturedAt: "2026-07-06T00:22:01Z", monitorValues: [] },
  readiness_snapshot: { blocked: false, capturedAt: "2026-07-06T00:22:02Z", monitors: [], monitorCount: 0 },
  ecu_info_snapshot: { blocked: false, capturedAt: "2026-07-06T00:22:03Z", items: [], itemCount: 0 },
  supported_pid_matrix: { blocked: false, capturedAt: "2026-07-06T00:22:04Z", supportedPids: [], supportedCount: 0 },
  live_pid_snapshot: { blocked: false, capturedAt: "2026-07-06T00:22:05Z", monitorValues: [] },
  next_readout_candidates: [{ id: "custom_snapshot", label: "Custom Snapshot", priority: 1, reason: "outer override" }]
});
check(scanSessionExplicitCandidatesEmptyReadouts.coreSessionStatus?.readyForAnalysis === false, "Diagnostic scan session treated explicit-candidate empty readouts as analysis-ready");
check(scanSessionExplicitCandidatesEmptyReadouts.coreSessionStatus?.nextRecommendedReadoutId === "custom_snapshot", "Diagnostic scan session did not preserve explicit next_readout_candidates over empty readout fallback");
const scanSessionExplicitCandidatesManualBlocking = obd.buildDiagnosticScanSession({
  session_id: "shop-test-explicit-manual-blocking",
  vehicle_applicability: { status: "manual" },
  dtc_snapshot: { blocked: false, capturedAt: "2026-07-06T00:22:10Z", codes: [], dtcs: [] },
  next_readout_candidates: [{ id: "custom_snapshot", label: "Custom Snapshot", priority: 1, reason: "outer override" }]
});
check(scanSessionExplicitCandidatesManualBlocking.coreSessionStatus?.blockingWarningIds?.includes("vehicle_profile_manual"), "Diagnostic scan session did not surface manual applicability as a blocking warning with explicit next_readout_candidates");
check(scanSessionExplicitCandidatesManualBlocking.coreSessionStatus?.readyForAnalysis === false, "Diagnostic scan session treated manual applicability with explicit next_readout_candidates as analysis-ready");
check(scanSessionExplicitCandidatesManualBlocking.coreSessionStatus?.nextRecommendedReadoutId === "custom_snapshot", "Diagnostic scan session did not preserve explicit next_readout_candidates over manual applicability blocking");
const scanSessionExplicitCandidatesUnlistedBlocking = obd.buildDiagnosticScanSession({
  session_id: "shop-test-explicit-unlisted-blocking",
  vehicle_applicability: { status: "unlisted" },
  dtc_snapshot: { blocked: false, capturedAt: "2026-07-06T00:22:20Z", codes: [], dtcs: [] },
  next_readout_candidates: [{ id: "custom_snapshot", label: "Custom Snapshot", priority: 1, reason: "outer override" }]
});
check(scanSessionExplicitCandidatesUnlistedBlocking.coreSessionStatus?.blockingWarningIds?.includes("vehicle_applicability_unlisted"), "Diagnostic scan session did not surface unlisted applicability as a blocking warning with explicit next_readout_candidates");
check(scanSessionExplicitCandidatesUnlistedBlocking.coreSessionStatus?.readyForAnalysis === false, "Diagnostic scan session treated unlisted applicability with explicit next_readout_candidates as analysis-ready");
check(scanSessionExplicitCandidatesUnlistedBlocking.coreSessionStatus?.nextRecommendedReadoutId === "custom_snapshot", "Diagnostic scan session did not preserve explicit next_readout_candidates over unlisted applicability blocking");
const scanSessionExplicitCandidatesPartialWarning = obd.buildDiagnosticScanSession({
  session_id: "shop-test-explicit-partial-warning",
  vehicle_applicability: { status: "partial" },
  dtc_snapshot: { blocked: false, capturedAt: "2026-07-06T00:22:30Z", codes: [], dtcs: [] },
  next_readout_candidates: [{ id: "custom_snapshot", label: "Custom Snapshot", priority: 1, reason: "outer override" }]
});
check(scanSessionExplicitCandidatesPartialWarning.warnings.includes("vehicle_applicability_partial"), "Diagnostic scan session did not surface partial applicability warning with explicit next_readout_candidates");
check(!scanSessionExplicitCandidatesPartialWarning.coreSessionStatus?.blockingWarningIds?.includes("vehicle_applicability_partial"), "Diagnostic scan session incorrectly treated partial applicability as a blocking warning with explicit next_readout_candidates");
check(scanSessionExplicitCandidatesPartialWarning.coreSessionStatus?.readyForAnalysis === false, "Diagnostic scan session treated partial applicability with explicit next_readout_candidates as analysis-ready");
check(scanSessionExplicitCandidatesPartialWarning.coreSessionStatus?.nextRecommendedReadoutId === "custom_snapshot", "Diagnostic scan session did not preserve explicit next_readout_candidates over partial applicability warning");
const scanSessionPopulatedPartialApplicability = obd.buildDiagnosticScanSession({
  session_id: "shop-test-populated-partial-applicability",
  vehicle_applicability: { status: "partial" },
  dtc_snapshot: bridgeDtcSnapshot,
  live_pid_snapshot: bridgePidSnapshot,
  freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
  readiness_snapshot: bridgeReadinessSnapshot,
  ecu_info_snapshot: bridgeEcuInfoSnapshot,
  onboard_monitor_snapshot: bridgeOnboardMonitorSnapshot,
  supported_pid_matrix: bridgeSupportedPidSnapshot
});
check(scanSessionPopulatedPartialApplicability.warnings.includes("vehicle_applicability_partial"), "Diagnostic scan session did not keep partial applicability warning for populated readouts");
check(!scanSessionPopulatedPartialApplicability.coreSessionStatus?.blockingWarningIds?.includes("vehicle_applicability_partial"), "Diagnostic scan session incorrectly blocked populated partial applicability");
check(scanSessionPopulatedPartialApplicability.coreSessionStatus?.readyForAnalysis === true, "Diagnostic scan session did not allow populated partial applicability inputs to become analysis-ready");
check(scanSessionPopulatedPartialApplicability.coreSessionStatus?.status === "analysis_ready", "Diagnostic scan session did not expose analysis_ready status for populated partial applicability");
const scanSessionPopulatedPartialExplicitCandidates = obd.buildDiagnosticScanSession({
  session_id: "shop-test-populated-partial-explicit-candidates",
  vehicle_applicability: { status: "partial" },
  dtc_snapshot: bridgeDtcSnapshot,
  live_pid_snapshot: bridgePidSnapshot,
  freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
  readiness_snapshot: bridgeReadinessSnapshot,
  ecu_info_snapshot: bridgeEcuInfoSnapshot,
  onboard_monitor_snapshot: bridgeOnboardMonitorSnapshot,
  supported_pid_matrix: bridgeSupportedPidSnapshot,
  next_readout_candidates: [{ id: "custom_snapshot", label: "Custom Snapshot", priority: 1, reason: "outer override" }]
});
check(scanSessionPopulatedPartialExplicitCandidates.coreSessionStatus?.readyForAnalysis === true, "Diagnostic scan session did not keep populated partial applicability with explicit next_readout_candidates as analysis-ready");
check(scanSessionPopulatedPartialExplicitCandidates.coreSessionStatus?.status === "analysis_ready", "Diagnostic scan session did not expose analysis_ready status for populated partial applicability with explicit next_readout_candidates");
check(scanSessionPopulatedPartialExplicitCandidates.coreSessionStatus?.nextRecommendedReadoutId === "custom_snapshot", "Diagnostic scan session did not preserve explicit next_readout_candidates for populated partial applicability");
check(scanSessionPopulatedPartialExplicitCandidates.coreSessionStatus?.completionPercent === 100, "Diagnostic scan session did not keep populated partial applicability with explicit next_readout_candidates at 100 percent completion");
check(Array.isArray(scanSessionPopulatedPartialExplicitCandidates.coreSessionStatus?.remainingReadoutIds) && scanSessionPopulatedPartialExplicitCandidates.coreSessionStatus.remainingReadoutIds.length === 0, "Diagnostic scan session treated populated partial applicability with explicit next_readout_candidates as having unread core readouts");
check(Array.isArray(scanSessionPopulatedPartialExplicitCandidates.coreSessionStatus?.emptyReadoutIds) && scanSessionPopulatedPartialExplicitCandidates.coreSessionStatus.emptyReadoutIds.length === 0, "Diagnostic scan session treated populated partial applicability with explicit next_readout_candidates as having empty core readouts");
const scanSessionPopulatedManualApplicability = obd.buildDiagnosticScanSession({
  session_id: "shop-test-populated-manual-applicability",
  vehicle_applicability: { status: "manual" },
  dtc_snapshot: bridgeDtcSnapshot,
  live_pid_snapshot: bridgePidSnapshot,
  freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
  readiness_snapshot: bridgeReadinessSnapshot,
  ecu_info_snapshot: bridgeEcuInfoSnapshot,
  onboard_monitor_snapshot: bridgeOnboardMonitorSnapshot,
  supported_pid_matrix: bridgeSupportedPidSnapshot
});
check(scanSessionPopulatedManualApplicability.coreSessionStatus?.blockingWarningIds?.includes("vehicle_profile_manual"), "Diagnostic scan session did not keep manual applicability as a blocking warning for populated readouts");
check(scanSessionPopulatedManualApplicability.coreSessionStatus?.readyForAnalysis === false, "Diagnostic scan session incorrectly allowed populated manual applicability inputs to become analysis-ready");
check(scanSessionPopulatedManualApplicability.coreSessionStatus?.status === "collecting_readouts", "Diagnostic scan session did not keep populated manual applicability in collecting_readouts");
check(scanSessionPopulatedManualApplicability.coreSessionStatus?.completionPercent === 100, "Diagnostic scan session did not keep populated manual applicability at 100 percent completion");
check(Array.isArray(scanSessionPopulatedManualApplicability.coreSessionStatus?.remainingReadoutIds) && scanSessionPopulatedManualApplicability.coreSessionStatus.remainingReadoutIds.length === 0, "Diagnostic scan session treated populated manual applicability as having unread core readouts");
check(Array.isArray(scanSessionPopulatedManualApplicability.coreSessionStatus?.emptyReadoutIds) && scanSessionPopulatedManualApplicability.coreSessionStatus.emptyReadoutIds.length === 0, "Diagnostic scan session treated populated manual applicability as having empty core readouts");
const scanSessionPopulatedManualExplicitCandidates = obd.buildDiagnosticScanSession({
  session_id: "shop-test-populated-manual-explicit-candidates",
  vehicle_applicability: { status: "manual" },
  dtc_snapshot: bridgeDtcSnapshot,
  live_pid_snapshot: bridgePidSnapshot,
  freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
  readiness_snapshot: bridgeReadinessSnapshot,
  ecu_info_snapshot: bridgeEcuInfoSnapshot,
  onboard_monitor_snapshot: bridgeOnboardMonitorSnapshot,
  supported_pid_matrix: bridgeSupportedPidSnapshot,
  next_readout_candidates: [{ id: "custom_snapshot", label: "Custom Snapshot", priority: 1, reason: "outer override" }]
});
check(scanSessionPopulatedManualExplicitCandidates.coreSessionStatus?.blockingWarningIds?.includes("vehicle_profile_manual"), "Diagnostic scan session did not keep manual applicability blocking with explicit next_readout_candidates on populated readouts");
check(scanSessionPopulatedManualExplicitCandidates.coreSessionStatus?.completionPercent === 100, "Diagnostic scan session did not keep populated manual applicability with explicit next_readout_candidates at 100 percent completion");
check(scanSessionPopulatedManualExplicitCandidates.coreSessionStatus?.nextRecommendedReadoutId === "custom_snapshot", "Diagnostic scan session did not preserve explicit next_readout_candidates for populated manual applicability");
const scanSessionPopulatedUnlistedApplicability = obd.buildDiagnosticScanSession({
  session_id: "shop-test-populated-unlisted-applicability",
  vehicle_applicability: { status: "unlisted" },
  dtc_snapshot: bridgeDtcSnapshot,
  live_pid_snapshot: bridgePidSnapshot,
  freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
  readiness_snapshot: bridgeReadinessSnapshot,
  ecu_info_snapshot: bridgeEcuInfoSnapshot,
  onboard_monitor_snapshot: bridgeOnboardMonitorSnapshot,
  supported_pid_matrix: bridgeSupportedPidSnapshot
});
check(scanSessionPopulatedUnlistedApplicability.coreSessionStatus?.blockingWarningIds?.includes("vehicle_applicability_unlisted"), "Diagnostic scan session did not keep unlisted applicability as a blocking warning for populated readouts");
check(scanSessionPopulatedUnlistedApplicability.coreSessionStatus?.readyForAnalysis === false, "Diagnostic scan session incorrectly allowed populated unlisted applicability inputs to become analysis-ready");
check(scanSessionPopulatedUnlistedApplicability.coreSessionStatus?.status === "collecting_readouts", "Diagnostic scan session did not keep populated unlisted applicability in collecting_readouts");
check(scanSessionPopulatedUnlistedApplicability.coreSessionStatus?.completionPercent === 100, "Diagnostic scan session did not keep populated unlisted applicability at 100 percent completion");
check(Array.isArray(scanSessionPopulatedUnlistedApplicability.coreSessionStatus?.remainingReadoutIds) && scanSessionPopulatedUnlistedApplicability.coreSessionStatus.remainingReadoutIds.length === 0, "Diagnostic scan session treated populated unlisted applicability as having unread core readouts");
check(Array.isArray(scanSessionPopulatedUnlistedApplicability.coreSessionStatus?.emptyReadoutIds) && scanSessionPopulatedUnlistedApplicability.coreSessionStatus.emptyReadoutIds.length === 0, "Diagnostic scan session treated populated unlisted applicability as having empty core readouts");
const scanSessionPopulatedUnlistedExplicitCandidates = obd.buildDiagnosticScanSession({
  session_id: "shop-test-populated-unlisted-explicit-candidates",
  vehicle_applicability: { status: "unlisted" },
  dtc_snapshot: bridgeDtcSnapshot,
  live_pid_snapshot: bridgePidSnapshot,
  freeze_frame_snapshot: bridgeFreezeFrameSnapshot,
  readiness_snapshot: bridgeReadinessSnapshot,
  ecu_info_snapshot: bridgeEcuInfoSnapshot,
  onboard_monitor_snapshot: bridgeOnboardMonitorSnapshot,
  supported_pid_matrix: bridgeSupportedPidSnapshot,
  next_readout_candidates: [{ id: "custom_snapshot", label: "Custom Snapshot", priority: 1, reason: "outer override" }]
});
check(scanSessionPopulatedUnlistedExplicitCandidates.coreSessionStatus?.blockingWarningIds?.includes("vehicle_applicability_unlisted"), "Diagnostic scan session did not keep unlisted applicability blocking with explicit next_readout_candidates on populated readouts");
check(scanSessionPopulatedUnlistedExplicitCandidates.coreSessionStatus?.completionPercent === 100, "Diagnostic scan session did not keep populated unlisted applicability with explicit next_readout_candidates at 100 percent completion");
check(scanSessionPopulatedUnlistedExplicitCandidates.coreSessionStatus?.nextRecommendedReadoutId === "custom_snapshot", "Diagnostic scan session did not preserve explicit next_readout_candidates for populated unlisted applicability");
const scanSessionBridgeSessionCamelAlias = obd.buildDiagnosticScanSession({
  bridgeSession: bridgeDiagnosticImport.bridgeSession,
  session_id: "shop-test-bridge-session-camel"
});
check(scanSessionBridgeSessionCamelAlias.supportedPidMatrix.supportedPids.includes("40"), "Diagnostic scan session did not accept bridgeSession camelCase alias input");
check(scanSessionBridgeSessionCamelAlias.freezeFrameSnapshot.triggerDtc === "P0171", "Diagnostic scan session did not carry freeze frame from bridgeSession camelCase alias input");
check(scanSessionBridgeSessionCamelAlias.ecuInfoSnapshot.itemCount === bridgeEcuInfoSnapshot.itemCount, "Diagnostic scan session did not carry ECU info from bridgeSession camelCase alias input");
const scanSessionBridgeDiagnosticImportAlias = obd.buildDiagnosticScanSession({
  bridge_diagnostic_import: bridgeDiagnosticImport,
  session_id: "shop-test-bridge-import-alias"
});
check(scanSessionBridgeDiagnosticImportAlias.connectionStatus.vehicleConnected === true, "Diagnostic scan session did not accept bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportAlias.vciDevices[0]?.id === "vci-1", "Diagnostic scan session did not carry vci devices from bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportAlias.adapterIdentity?.adapterFamily === "elm327", "Diagnostic scan session did not carry adapter identity from bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportAlias.readoutCoverage?.progressPercent === bridgeDiagnosticImport.readoutCoverage?.progressPercent, "Diagnostic scan session did not carry readoutCoverage from bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportAlias.importClassification?.bucketCounts?.storedDtcResponses === bridgeDiagnosticImport.importClassification?.bucketCounts?.storedDtcResponses, "Diagnostic scan session did not carry importClassification from bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportAlias.analysisReadinessSummary?.ready === scanSessionBridgeDiagnosticImportAlias.coreSessionStatus?.analysisReadinessSummary?.ready, "Diagnostic scan session did not expose top-level analysis readiness summary");
check(scanSessionBridgeDiagnosticImportAlias.readoutRequestPlanGateSummary?.state === scanSessionBridgeDiagnosticImportAlias.coreSessionStatus?.readoutRequestPlanGateSummary?.state, "Diagnostic scan session did not expose top-level readout request plan gate summary");
check(scanSessionBridgeDiagnosticImportAlias.importedCoreSessionStatus?.schemaVersion === "core_session_status_v1", "Diagnostic scan session did not preserve imported core session status from bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportAlias.importedDiagnosticFlowSummary?.schemaVersion === "diagnostic_flow_summary_v1", "Diagnostic scan session did not preserve imported diagnostic flow summary from bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportAlias.importedReadoutCompletionSummary?.capturedIds?.includes("dtc_snapshot"), "Diagnostic scan session did not preserve imported readout completion summary from bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportAlias.importedAnalysisReadinessSummary?.ready === bridgeDiagnosticImport.analysisReadinessSummary?.ready, "Diagnostic scan session did not preserve imported analysis readiness summary from bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportAlias.importedReadoutRequestPlanGateSummary?.state === bridgeDiagnosticImport.readoutRequestPlanGateSummary?.state, "Diagnostic scan session did not preserve imported readout request plan gate summary from bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportAlias.importedCoreComparisonSummary?.schemaVersion === "imported_core_comparison_v1", "Diagnostic scan session did not compare imported and recalculated core session status");
check(Number.isFinite(scanSessionBridgeDiagnosticImportAlias.importedCoreComparisonSummary?.pendingReadoutDelta), "Diagnostic scan session did not expose imported core pending readout delta");
check(Number.isFinite(scanSessionBridgeDiagnosticImportAlias.importedCoreComparisonSummary?.capturedReadoutDelta), "Diagnostic scan session did not expose imported core captured readout delta");
check(Number.isFinite(scanSessionBridgeDiagnosticImportAlias.importedCoreComparisonSummary?.blockerCountDelta), "Diagnostic scan session did not expose imported core blocker count delta");
check(Number.isFinite(scanSessionBridgeDiagnosticImportAlias.importedCoreComparisonSummary?.checklistCompleteDelta), "Diagnostic scan session did not expose imported core checklist delta");
check(Number.isFinite(scanSessionBridgeDiagnosticImportAlias.importedCoreComparisonSummary?.requestPlanMappedDelta) && Number.isFinite(scanSessionBridgeDiagnosticImportAlias.importedCoreComparisonSummary?.requestPlanUnmappedDelta), "Diagnostic scan session did not expose imported core request plan mapping delta");
check("nextReadoutDetailsChanged" in scanSessionBridgeDiagnosticImportAlias.importedCoreComparisonSummary, "Diagnostic scan session did not expose imported core next readout detail change flag");
check(scanSessionBridgeDiagnosticImportAlias.importedDiagnosticFlowComparisonSummary?.schemaVersion === "imported_diagnostic_flow_comparison_v1", "Diagnostic scan session did not compare imported and recalculated diagnostic flow summary");
check(Number.isFinite(scanSessionBridgeDiagnosticImportAlias.importedDiagnosticFlowComparisonSummary?.completionDelta), "Diagnostic scan session did not expose imported diagnostic flow completion delta");
check(Number.isFinite(scanSessionBridgeDiagnosticImportAlias.importedDiagnosticFlowComparisonSummary?.pendingReadoutDelta), "Diagnostic scan session did not expose imported diagnostic flow readout count delta");
check(Number.isFinite(scanSessionBridgeDiagnosticImportAlias.importedDiagnosticFlowComparisonSummary?.blockerCountDelta), "Diagnostic scan session did not expose imported diagnostic flow blocker count delta");
check(Number.isFinite(scanSessionBridgeDiagnosticImportAlias.importedDiagnosticFlowComparisonSummary?.checklistPendingDelta), "Diagnostic scan session did not expose imported diagnostic flow checklist delta");
check(Number.isFinite(scanSessionBridgeDiagnosticImportAlias.importedDiagnosticFlowComparisonSummary?.requestPlanCountDelta), "Diagnostic scan session did not expose imported diagnostic flow request plan delta");
check(Number.isFinite(scanSessionBridgeDiagnosticImportAlias.importedDiagnosticFlowComparisonSummary?.requestPlanMappedDelta) && Number.isFinite(scanSessionBridgeDiagnosticImportAlias.importedDiagnosticFlowComparisonSummary?.requestPlanUnmappedDelta), "Diagnostic scan session did not expose imported diagnostic flow request plan mapping delta");
check("nextReadoutDetailsChanged" in scanSessionBridgeDiagnosticImportAlias.importedDiagnosticFlowComparisonSummary, "Diagnostic scan session did not expose imported diagnostic flow next readout detail change flag");
check(scanSessionBridgeDiagnosticImportAlias.importedReadoutCompletionComparisonSummary?.schemaVersion === "imported_readout_completion_comparison_v1", "Diagnostic scan session did not compare imported and recalculated readout completion summary");
check(Number.isFinite(scanSessionBridgeDiagnosticImportAlias.importedReadoutCompletionComparisonSummary?.pendingCountDelta), "Diagnostic scan session did not expose imported readout completion pending delta");
check(scanSessionBridgeDiagnosticImportAlias.importedAnalysisReadinessComparisonSummary?.schemaVersion === "imported_analysis_readiness_comparison_v1", "Diagnostic scan session did not compare imported and recalculated analysis readiness summary");
check(Number.isFinite(scanSessionBridgeDiagnosticImportAlias.importedAnalysisReadinessComparisonSummary?.pendingReadoutDelta), "Diagnostic scan session did not expose imported analysis readiness pending readout delta");
check("nextReadoutDetailsChanged" in scanSessionBridgeDiagnosticImportAlias.importedAnalysisReadinessComparisonSummary, "Diagnostic scan session did not expose imported analysis readiness next readout detail change flag");
check(scanSessionBridgeDiagnosticImportAlias.importedReadoutRequestPlanGateComparisonSummary?.schemaVersion === "imported_readout_request_plan_gate_comparison_v1", "Diagnostic scan session did not compare imported and recalculated readout request plan gate summary");
check("safeForBridgePlanningChanged" in scanSessionBridgeDiagnosticImportAlias.importedReadoutRequestPlanGateComparisonSummary && Number.isFinite(scanSessionBridgeDiagnosticImportAlias.importedReadoutRequestPlanGateComparisonSummary?.mappedCountDelta), "Diagnostic scan session did not expose imported readout request plan gate comparison details");
check(scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary?.schemaVersion === "imported_session_comparison_v1", "Diagnostic scan session did not summarize imported session comparison results");
check(Array.isArray(scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary?.changedSectionIds), "Diagnostic scan session did not expose imported session changed section ids");
check(Array.isArray(scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary?.comparedSectionIds) && Array.isArray(scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary?.unchangedSectionIds), "Diagnostic scan session did not expose imported session compared and unchanged section ids");
check(Array.isArray(scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary?.sectionSummaries) && scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary.sectionSummaries.length >= 5, "Diagnostic scan session did not expose imported session section summaries");
check(Array.isArray(scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary?.changedSectionSummaries), "Diagnostic scan session did not expose imported session changed section summaries");
check(Array.isArray(scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary?.unchangedSectionSummaries) && scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary?.unchangedSectionSummaryById && typeof scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary.unchangedSectionSummaryById === "object", "Diagnostic scan session did not expose imported session unchanged section summaries");
check(scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary?.sectionSummaryById?.core_session_status?.id === "core_session_status", "Diagnostic scan session did not expose imported session section summary map");
check(Array.isArray(scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary?.sectionSummaries?.[0]?.changeReasonIds), "Diagnostic scan session did not expose imported session section change reasons");
check(Array.isArray(scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary?.changedReasonIds) && Number.isInteger(scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary?.changedReasonCount), "Diagnostic scan session did not expose imported session top-level change reasons");
check(scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary?.changedReasonCountsById && "primaryChangedReasonId" in scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary, "Diagnostic scan session did not expose imported session reason counts");
check(scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary?.changedSectionsByReasonId && typeof scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary.changedSectionsByReasonId === "object", "Diagnostic scan session did not expose imported session sections by reason");
check(Array.isArray(scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary?.changedReasonSummaries) && scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary?.changedReasonSummaryById && typeof scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary.changedReasonSummaryById === "object", "Diagnostic scan session did not expose imported session reason summary maps");
check("primaryChangedReasonSummary" in scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary && Number.isInteger(scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary?.unchangedSectionCount), "Diagnostic scan session did not expose imported session primary reason details and unchanged count");
check(scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary?.comparedSectionCount >= 5, "Diagnostic scan session did not include request plan gate in imported session comparison count");
check(typeof scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary?.hasChanges === "boolean" && typeof scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary?.unchanged === "boolean", "Diagnostic scan session did not expose imported session direct change flags");
check(["changed", "unchanged"].includes(scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary?.status) && Number.isInteger(scanSessionBridgeDiagnosticImportAlias.importedSessionComparisonSummary?.changedSectionCount), "Diagnostic scan session did not expose imported session comparison status");
const scanSessionBridgeDiagnosticImportPopulatedManualExplicitCandidates = obd.buildDiagnosticScanSession({
  bridge_diagnostic_import: bridgeDiagnosticImportPopulatedManualExplicitCandidates,
  session_id: "shop-test-bridge-import-populated-manual-explicit-candidates"
});
check(scanSessionBridgeDiagnosticImportPopulatedManualExplicitCandidates.vehicleApplicability?.status === "manual", "Diagnostic scan session did not preserve manual vehicle applicability from populated bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportPopulatedManualExplicitCandidates.coreSessionStatus?.blockingWarningIds?.includes("vehicle_profile_manual"), "Diagnostic scan session did not keep manual applicability blocking for populated bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportPopulatedManualExplicitCandidates.coreSessionStatus?.readyForAnalysis === false, "Diagnostic scan session incorrectly marked populated manual bridge_diagnostic_import alias input as analysis-ready");
check(scanSessionBridgeDiagnosticImportPopulatedManualExplicitCandidates.coreSessionStatus?.completionPercent === 100, "Diagnostic scan session did not keep populated manual bridge_diagnostic_import alias input at 100 percent completion");
check(scanSessionBridgeDiagnosticImportPopulatedManualExplicitCandidates.coreSessionStatus?.nextRecommendedReadoutId === "custom_snapshot", "Diagnostic scan session did not preserve explicit next_readout_candidates from populated manual bridge_diagnostic_import alias input");
check(Array.isArray(scanSessionBridgeDiagnosticImportPopulatedManualExplicitCandidates.coreSessionStatus?.remainingReadoutIds) && scanSessionBridgeDiagnosticImportPopulatedManualExplicitCandidates.coreSessionStatus.remainingReadoutIds.length === 0, "Diagnostic scan session treated populated manual bridge_diagnostic_import alias input as having unread core readouts");
check(Array.isArray(scanSessionBridgeDiagnosticImportPopulatedManualExplicitCandidates.coreSessionStatus?.emptyReadoutIds) && scanSessionBridgeDiagnosticImportPopulatedManualExplicitCandidates.coreSessionStatus.emptyReadoutIds.length === 0, "Diagnostic scan session treated populated manual bridge_diagnostic_import alias input as having empty core readouts");
const scanSessionBridgeDiagnosticImportPopulatedPartial = obd.buildDiagnosticScanSession({
  bridge_diagnostic_import: bridgeDiagnosticImportPopulatedPartialExplicitCandidates,
  session_id: "shop-test-bridge-import-populated-partial"
});
check(scanSessionBridgeDiagnosticImportPopulatedPartial.vehicleApplicability?.status === "partial", "Diagnostic scan session did not preserve partial vehicle applicability from populated bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportPopulatedPartial.coreSessionStatus?.readyForAnalysis === true, "Diagnostic scan session did not keep populated partial bridge_diagnostic_import alias input analysis-ready");
check(scanSessionBridgeDiagnosticImportPopulatedPartial.coreSessionStatus?.status === "analysis_ready", "Diagnostic scan session did not expose analysis_ready for populated partial bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportPopulatedPartial.coreSessionStatus?.completionPercent === 100, "Diagnostic scan session did not keep populated partial bridge_diagnostic_import alias input at 100 percent completion");
check(scanSessionBridgeDiagnosticImportPopulatedPartial.coreSessionStatus?.nextRecommendedReadoutId === "custom_snapshot", "Diagnostic scan session did not preserve explicit next_readout_candidates from populated partial bridge_diagnostic_import alias input");
check(Array.isArray(scanSessionBridgeDiagnosticImportPopulatedPartial.coreSessionStatus?.remainingReadoutIds) && scanSessionBridgeDiagnosticImportPopulatedPartial.coreSessionStatus.remainingReadoutIds.length === 0, "Diagnostic scan session treated populated partial bridge_diagnostic_import alias input as having unread core readouts");
check(Array.isArray(scanSessionBridgeDiagnosticImportPopulatedPartial.coreSessionStatus?.emptyReadoutIds) && scanSessionBridgeDiagnosticImportPopulatedPartial.coreSessionStatus.emptyReadoutIds.length === 0, "Diagnostic scan session treated populated partial bridge_diagnostic_import alias input as having empty core readouts");
const scanSessionBridgeSessionToolHintsMerge = obd.buildDiagnosticScanSession({
  session_id: "shop-test-bridge-session-tool-hints",
  bridgeSession: {
    tool_hints: ["Techstream"]
  },
  toolHints: ["J2534"]
});
check(scanSessionBridgeSessionToolHintsMerge.toolHints.length === 2 && scanSessionBridgeSessionToolHintsMerge.toolHints.includes("Techstream") && scanSessionBridgeSessionToolHintsMerge.toolHints.includes("J2534"), "Diagnostic scan session did not merge outer and bridgeSession tool hints");
const scanSessionBridgeSessionSnakeAlias = obd.buildDiagnosticScanSession({
  bridge_session: bridgeDiagnosticImport.bridgeSession,
  session_id: "shop-test-bridge-session-snake"
});
check(scanSessionBridgeSessionSnakeAlias.monitorValueSummary.totalCount >= bridgePidSnapshot.monitorValues.length, "Diagnostic scan session did not accept bridge_session alias input");
check(scanSessionBridgeSessionSnakeAlias.dtcSnapshot.codes.join(",") === "P0171,P0300", "Diagnostic scan session did not carry DTCs from bridge_session alias input");
const scanSessionBridgeResponseAliases = obd.buildDiagnosticScanSession({
  session_id: "shop-test-bridge-response-aliases",
  bridge_session: {
    live_pid_response: { raw: "41 0C 1A F8 41 05 7B" },
    ecu_response_summary_response: bridgeSummary.ecuResponseSummary
  }
});
check(scanSessionBridgeResponseAliases.livePidSnapshot?.monitorValues?.find((item) => item.id === "engine_speed")?.value === 1726, "Diagnostic scan session did not decode live_pid_response from bridge_session alias input");
check(scanSessionBridgeResponseAliases.ecuResponseSummary?.schemaVersion === bridgeSummary.ecuResponseSummary.schemaVersion, "Diagnostic scan session did not accept ecu_response_summary_response from bridge_session alias input");
const scanSessionBridgeInfrastructureResponseAliases = obd.buildDiagnosticScanSession({
  session_id: "shop-test-bridge-infrastructure-response-aliases",
  bridge_session: {
    connection_status_response: {
      ok: true,
      blocked: false,
      would_transmit: false,
      data: { status: "ready", is_paired: true, vci_ready: true, car_connected: true }
    },
    list_vci_response: {
      ok: true,
      blocked: false,
      would_transmit: false,
      data: { items: [{ deviceId: "nested-response-vci", name: "Nested Response VCI", isConnected: true }], selectedVciId: "nested-response-vci" }
    },
    adapter_identity_response: {
      ok: true,
      blocked: false,
      would_transmit: false,
      data: { adapter: "Nested Response Adapter", family: "stn", version: "7.0" }
    }
  }
});
check(scanSessionBridgeInfrastructureResponseAliases.connectionStatus?.vehicleConnected === true, "Diagnostic scan session did not accept connection_status_response from bridge_session alias input");
check(scanSessionBridgeInfrastructureResponseAliases.vciDevices[0]?.id === "nested-response-vci", "Diagnostic scan session did not accept list_vci_response from bridge_session alias input");
check(scanSessionBridgeInfrastructureResponseAliases.adapterIdentity?.adapterFamily === "stn", "Diagnostic scan session did not accept adapter_identity_response from bridge_session alias input");
const scanSessionBridgeCamelResponseAliases = obd.buildDiagnosticScanSession({
  session_id: "shop-test-bridge-camel-response-aliases",
  bridgeSession: {
    livePidResponse: { raw: "41 0C 1A F8 41 05 7B" },
    supportedPidResponse: { raw: "41 00 18 18 00 01 41 20 80 00 00 01" },
    freezeFrameResponse: { raw: "42 02 00 01 71 42 01 00 82 07 22 00 42 03 00 01 00 42 24 00 80 00 20 00 42 0C 00 1A F8 42 05 00 7B" },
    readinessResponse: { raw: "41 01 81 07 22 00" },
    onboardMonitorResponse: { raw: "46 01 01 00 64 00 32 00 C8" },
    ecuInfoResponse: { raw: "49 04 01 43 41 4C 2D 31 32 33 34" },
    ecuResponseSummaryResponse: bridgeSummary.ecuResponseSummary,
    connectionStatusResponse: {
      ok: true,
      blocked: false,
      would_transmit: false,
      data: { status: "ready", is_paired: true, vci_ready: true, car_connected: true }
    },
    listVciResponse: {
      ok: true,
      blocked: false,
      would_transmit: false,
      data: { items: [{ deviceId: "camel-response-vci", name: "Camel Response VCI", isConnected: true }], selectedVciId: "camel-response-vci" }
    },
    adapterIdentityResponse: {
      ok: true,
      blocked: false,
      would_transmit: false,
      data: { adapter: "Camel Response Adapter", family: "stn", version: "7.5" }
    }
  }
});
check(scanSessionBridgeCamelResponseAliases.livePidSnapshot?.monitorValues?.find((item) => item.id === "engine_speed")?.value === 1726, "Diagnostic scan session did not decode livePidResponse from bridgeSession camelCase alias input");
check(scanSessionBridgeCamelResponseAliases.supportedPidMatrix?.supportedPids.includes("40"), "Diagnostic scan session did not decode supportedPidResponse from bridgeSession camelCase alias input");
check(scanSessionBridgeCamelResponseAliases.freezeFrameSnapshot?.monitorValues?.find((item) => item.id === "engine_speed")?.value === 1726, "Diagnostic scan session did not decode freezeFrameResponse from bridgeSession camelCase alias input");
check(scanSessionBridgeCamelResponseAliases.readinessSnapshot?.incompleteCount === 1, "Diagnostic scan session did not decode readinessResponse from bridgeSession camelCase alias input");
check(scanSessionBridgeCamelResponseAliases.onboardMonitorSnapshot?.testCount === 1, "Diagnostic scan session did not decode onboardMonitorResponse from bridgeSession camelCase alias input");
check(scanSessionBridgeCamelResponseAliases.ecuInfoSnapshot?.itemCount === 1, "Diagnostic scan session did not decode ecuInfoResponse from bridgeSession camelCase alias input");
check(scanSessionBridgeCamelResponseAliases.ecuResponseSummary?.schemaVersion === bridgeSummary.ecuResponseSummary.schemaVersion, "Diagnostic scan session did not accept ecuResponseSummaryResponse from bridgeSession camelCase alias input");
check(scanSessionBridgeCamelResponseAliases.connectionStatus?.vehicleConnected === true, "Diagnostic scan session did not accept connectionStatusResponse from bridgeSession camelCase alias input");
check(scanSessionBridgeCamelResponseAliases.vciDevices[0]?.id === "camel-response-vci", "Diagnostic scan session did not accept listVciResponse from bridgeSession camelCase alias input");
check(scanSessionBridgeCamelResponseAliases.adapterIdentity?.adapterFamily === "stn", "Diagnostic scan session did not accept adapterIdentityResponse from bridgeSession camelCase alias input");
const scanSessionNestedResponseAliases = obd.buildDiagnosticScanSession({
  session_id: "shop-test-scan-session-response-aliases",
  scan_session: {
    live_pid_response: { raw: "41 0C 1A F8 41 05 7B" },
    ecu_response_summary_response: bridgeSummary.ecuResponseSummary,
    connection_status_response: {
      ok: true,
      blocked: false,
      would_transmit: false,
      data: { status: "ready", is_paired: true, vci_ready: true, car_connected: true }
    }
  }
});
check(scanSessionNestedResponseAliases.livePidSnapshot?.monitorValues?.find((item) => item.id === "engine_speed")?.value === 1726, "Diagnostic scan session did not decode live_pid_response from scan_session alias input");
check(scanSessionNestedResponseAliases.ecuResponseSummary?.schemaVersion === bridgeSummary.ecuResponseSummary.schemaVersion, "Diagnostic scan session did not accept ecu_response_summary_response from scan_session alias input");
check(scanSessionNestedResponseAliases.connectionStatus?.vehicleConnected === true, "Diagnostic scan session did not accept connection_status_response from scan_session alias input");
const scanSessionNestedCamelResponseAliases = obd.buildDiagnosticScanSession({
  session_id: "shop-test-scan-session-camel-response-aliases",
  scanSession: {
    livePidResponse: { raw: "41 0C 1A F8 41 05 7B" },
    supportedPidResponse: { raw: "41 00 18 18 00 01 41 20 80 00 00 01" },
    freezeFrameResponse: { raw: "42 02 00 01 71 42 01 00 82 07 22 00 42 03 00 01 00 42 24 00 80 00 20 00 42 0C 00 1A F8 42 05 00 7B" },
    readinessResponse: { raw: "41 01 81 07 22 00" },
    onboardMonitorResponse: { raw: "46 01 01 00 64 00 32 00 C8" },
    ecuInfoResponse: { raw: "49 04 01 43 41 4C 2D 31 32 33 34" },
    ecuResponseSummaryResponse: bridgeSummary.ecuResponseSummary,
    connectionStatusResponse: {
      ok: true,
      blocked: false,
      would_transmit: false,
      data: { status: "ready", is_paired: true, vci_ready: true, car_connected: true }
    }
  }
});
check(scanSessionNestedCamelResponseAliases.livePidSnapshot?.monitorValues?.find((item) => item.id === "engine_speed")?.value === 1726, "Diagnostic scan session did not decode livePidResponse from scanSession camelCase alias input");
check(scanSessionNestedCamelResponseAliases.supportedPidMatrix?.supportedPids.includes("40"), "Diagnostic scan session did not decode supportedPidResponse from scanSession camelCase alias input");
check(scanSessionNestedCamelResponseAliases.freezeFrameSnapshot?.monitorValues?.find((item) => item.id === "engine_speed")?.value === 1726, "Diagnostic scan session did not decode freezeFrameResponse from scanSession camelCase alias input");
check(scanSessionNestedCamelResponseAliases.readinessSnapshot?.incompleteCount === 1, "Diagnostic scan session did not decode readinessResponse from scanSession camelCase alias input");
check(scanSessionNestedCamelResponseAliases.onboardMonitorSnapshot?.testCount === 1, "Diagnostic scan session did not decode onboardMonitorResponse from scanSession camelCase alias input");
check(scanSessionNestedCamelResponseAliases.ecuInfoSnapshot?.itemCount === 1, "Diagnostic scan session did not decode ecuInfoResponse from scanSession camelCase alias input");
check(scanSessionNestedCamelResponseAliases.ecuResponseSummary?.schemaVersion === bridgeSummary.ecuResponseSummary.schemaVersion, "Diagnostic scan session did not accept ecuResponseSummaryResponse from scanSession camelCase alias input");
check(scanSessionNestedCamelResponseAliases.connectionStatus?.vehicleConnected === true, "Diagnostic scan session did not accept connectionStatusResponse from scanSession camelCase alias input");
const scanSessionBridgeExportPayloadAlias = obd.buildDiagnosticScanSession({
  bridge_export_payload: bridgeExportPayload,
  session_id: "shop-test-bridge-export-alias"
});
check(scanSessionBridgeExportPayloadAlias.connectionStatus.vehicleConnected === true, "Diagnostic scan session did not accept bridge_export_payload alias input");
check(scanSessionBridgeExportPayloadAlias.vehicleProfile?.model === bridgeExportPayload.session.vehicle_profile?.model, "Diagnostic scan session did not carry vehicle_profile from bridge_export_payload alias input");
check(scanSessionBridgeExportPayloadAlias.nextReadoutCandidates[0]?.id === bridgeExportPayload.session.next_readout_candidates[0]?.id, "Diagnostic scan session did not carry next_readout_candidates from bridge_export_payload alias input");
check(scanSessionBridgeExportPayloadAlias.warnings.includes("freeze_frame_available"), "Diagnostic scan session did not carry warnings from bridge_export_payload alias input");
const scanSessionBridgeExportPayloadPopulatedPartialExplicitCandidates = obd.buildDiagnosticScanSession({
  bridge_export_payload: bridgeExportPayloadPopulatedPartialExplicitCandidates,
  session_id: "shop-test-bridge-export-populated-partial-explicit-candidates"
});
check(scanSessionBridgeExportPayloadPopulatedPartialExplicitCandidates.vehicleApplicability?.status === "partial", "Diagnostic scan session did not preserve partial vehicle applicability from populated bridge_export_payload alias input");
check(scanSessionBridgeExportPayloadPopulatedPartialExplicitCandidates.coreSessionStatus?.readyForAnalysis === true, "Diagnostic scan session did not keep populated partial bridge_export_payload alias input analysis-ready");
check(scanSessionBridgeExportPayloadPopulatedPartialExplicitCandidates.coreSessionStatus?.completionPercent === 100, "Diagnostic scan session did not keep populated partial bridge_export_payload alias input at 100 percent completion");
check(scanSessionBridgeExportPayloadPopulatedPartialExplicitCandidates.coreSessionStatus?.nextRecommendedReadoutId === "custom_snapshot", "Diagnostic scan session did not preserve explicit next_readout_candidates from populated partial bridge_export_payload alias input");
check(Array.isArray(scanSessionBridgeExportPayloadPopulatedPartialExplicitCandidates.coreSessionStatus?.remainingReadoutIds) && scanSessionBridgeExportPayloadPopulatedPartialExplicitCandidates.coreSessionStatus.remainingReadoutIds.length === 0, "Diagnostic scan session treated populated partial bridge_export_payload alias input as having unread core readouts");
check(Array.isArray(scanSessionBridgeExportPayloadPopulatedPartialExplicitCandidates.coreSessionStatus?.emptyReadoutIds) && scanSessionBridgeExportPayloadPopulatedPartialExplicitCandidates.coreSessionStatus.emptyReadoutIds.length === 0, "Diagnostic scan session treated populated partial bridge_export_payload alias input as having empty core readouts");
const scanSessionBridgeExportPayloadPopulatedUnlistedExplicitCandidates = obd.buildDiagnosticScanSession({
  bridge_export_payload: bridgeExportPayloadPopulatedUnlistedExplicitCandidates,
  session_id: "shop-test-bridge-export-populated-unlisted-explicit-candidates"
});
check(scanSessionBridgeExportPayloadPopulatedUnlistedExplicitCandidates.vehicleApplicability?.status === "unlisted", "Diagnostic scan session did not preserve unlisted vehicle applicability from populated bridge_export_payload alias input");
check(scanSessionBridgeExportPayloadPopulatedUnlistedExplicitCandidates.coreSessionStatus?.blockingWarningIds?.includes("vehicle_applicability_unlisted"), "Diagnostic scan session did not keep unlisted applicability blocking for populated bridge_export_payload alias input");
check(scanSessionBridgeExportPayloadPopulatedUnlistedExplicitCandidates.coreSessionStatus?.readyForAnalysis === false, "Diagnostic scan session incorrectly marked populated unlisted bridge_export_payload alias input as analysis-ready");
check(scanSessionBridgeExportPayloadPopulatedUnlistedExplicitCandidates.coreSessionStatus?.completionPercent === 100, "Diagnostic scan session did not keep populated unlisted bridge_export_payload alias input at 100 percent completion");
check(scanSessionBridgeExportPayloadPopulatedUnlistedExplicitCandidates.coreSessionStatus?.nextRecommendedReadoutId === "custom_snapshot", "Diagnostic scan session did not preserve explicit next_readout_candidates from populated unlisted bridge_export_payload alias input");
check(Array.isArray(scanSessionBridgeExportPayloadPopulatedUnlistedExplicitCandidates.coreSessionStatus?.remainingReadoutIds) && scanSessionBridgeExportPayloadPopulatedUnlistedExplicitCandidates.coreSessionStatus.remainingReadoutIds.length === 0, "Diagnostic scan session treated populated unlisted bridge_export_payload alias input as having unread core readouts");
check(Array.isArray(scanSessionBridgeExportPayloadPopulatedUnlistedExplicitCandidates.coreSessionStatus?.emptyReadoutIds) && scanSessionBridgeExportPayloadPopulatedUnlistedExplicitCandidates.coreSessionStatus.emptyReadoutIds.length === 0, "Diagnostic scan session treated populated unlisted bridge_export_payload alias input as having empty core readouts");
const scanSessionBridgeDiagnosticImportOuterOverride = obd.buildDiagnosticScanSession({
  bridge_diagnostic_import: bridgeDiagnosticImport,
  session_id: "shop-test-bridge-import-outer-override",
  vehicle_applicability: vehicleApplicabilityPartialSample,
  connection_status: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { status: "ready", is_paired: false, vci_ready: true, car_connected: false }
  },
  adapter_identity: { data: { adapter_family: "stn", firmware_version: "9.9", serial_number: "OVERRIDE-001" } },
  readout_coverage: legacyReadoutCoverage,
  tool_hints: ["CONSULT"],
  warning_flags: ["negative_obd_response_present"],
  source_length: 0,
  had_sensitive_identifier: false,
  next_readout_candidates: [{ id: "custom_outer_snapshot", label: "Outer Snapshot", priority: 1, reason: "outer override" }],
  freeze_frame_snapshot: outerOverrideFreezeFrameSnapshot,
  readiness_snapshot: outerOverrideReadinessSnapshot,
  supported_pid_matrix: outerOverrideSupportedPidSnapshot,
  ecu_info_snapshot: outerOverrideEcuInfoSnapshot,
  import_classification: {
    schemaVersion: "obd_response_line_classification_v1",
    bucketCounts: { storedDtcResponses: 9 }
  }
});
check(scanSessionBridgeDiagnosticImportOuterOverride.vehicleApplicability?.status === "partial", "Diagnostic scan session did not let outer vehicle_applicability override bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportOuterOverride.connectionStatus?.vehicleConnected === false, "Diagnostic scan session did not let outer connection_status override bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportOuterOverride.adapterIdentity?.adapterFamily === "stn", "Diagnostic scan session did not let outer adapter_identity override bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportOuterOverride.readoutCoverage?.capturedPercent === 29, "Diagnostic scan session did not let outer readout_coverage override bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportOuterOverride.toolHints.includes("CONSULT") && scanSessionBridgeDiagnosticImportOuterOverride.toolHints.includes("Techstream"), "Diagnostic scan session did not merge outer tool_hints with bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportOuterOverride.warnings.includes("negative_obd_response_present") && scanSessionBridgeDiagnosticImportOuterOverride.warnings.includes("freeze_frame_available"), "Diagnostic scan session did not merge outer warning_flags with bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportOuterOverride.sourceLength === 0, "Diagnostic scan session did not let outer source_length override bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportOuterOverride.hadSensitiveIdentifier === true, "Diagnostic scan session did not preserve nested sensitive identifier when outer bridge_diagnostic_import alias input set false");
check(scanSessionBridgeDiagnosticImportOuterOverride.nextReadoutCandidates[0]?.id === "custom_outer_snapshot", "Diagnostic scan session did not let outer next_readout_candidates override bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportOuterOverride.coreSessionStatus?.readyForAnalysis === true, "Diagnostic scan session did not keep populated outer-override bridge_diagnostic_import alias input analysis-ready");
check(scanSessionBridgeDiagnosticImportOuterOverride.coreSessionStatus?.status === "analysis_ready", "Diagnostic scan session did not expose analysis_ready for populated outer-override bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportOuterOverride.coreSessionStatus?.completionPercent === 100, "Diagnostic scan session did not keep populated outer-override bridge_diagnostic_import alias input at 100 percent completion");
check(scanSessionBridgeDiagnosticImportOuterOverride.coreSessionStatus?.nextRecommendedReadoutId === "custom_outer_snapshot", "Diagnostic scan session did not preserve explicit next_readout_candidates for populated outer-override bridge_diagnostic_import alias input");
check(Array.isArray(scanSessionBridgeDiagnosticImportOuterOverride.coreSessionStatus?.remainingReadoutIds) && scanSessionBridgeDiagnosticImportOuterOverride.coreSessionStatus.remainingReadoutIds.length === 0, "Diagnostic scan session treated populated outer-override bridge_diagnostic_import alias input as having unread core readouts");
check(Array.isArray(scanSessionBridgeDiagnosticImportOuterOverride.coreSessionStatus?.emptyReadoutIds) && scanSessionBridgeDiagnosticImportOuterOverride.coreSessionStatus.emptyReadoutIds.length === 0, "Diagnostic scan session treated populated outer-override bridge_diagnostic_import alias input as having empty core readouts");
check(scanSessionBridgeDiagnosticImportOuterOverride.freezeFrameSnapshot?.triggerDtc === "P0420", "Diagnostic scan session did not let outer freeze_frame_snapshot override bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportOuterOverride.readinessSnapshot?.incompleteCount === 0, "Diagnostic scan session did not let outer readiness_snapshot override bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportOuterOverride.supportedPidMatrix?.supportedPids.join(",") === "0C,0D", "Diagnostic scan session did not let outer supported_pid_matrix override bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportOuterOverride.ecuInfoSnapshot?.items?.[0]?.value === "Outer Override ECU", "Diagnostic scan session did not let outer ecu_info_snapshot override bridge_diagnostic_import alias input");
check(scanSessionBridgeDiagnosticImportOuterOverride.importClassification?.bucketCounts?.storedDtcResponses === 9, "Diagnostic scan session did not let outer import_classification override bridge_diagnostic_import alias input");
const scanSessionBridgeDiagnosticImportCamelOuterOverride = obd.buildDiagnosticScanSession({
  bridgeDiagnosticImport,
  sessionId: "shop-test-bridge-import-camel-outer-override",
  vehicleApplicability: vehicleApplicabilityPartialSample,
  connectionStatus: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { status: "ready", is_paired: false, vci_ready: true, car_connected: false }
  },
  adapterIdentity: { data: { adapter_family: "stn", firmware_version: "9.9", serial_number: "OVERRIDE-101" } },
  readoutCoverage: legacyReadoutCoverage,
  toolHints: ["CONSULT"],
  warningFlags: ["negative_obd_response_present"],
  sourceLength: 0,
  hadSensitiveIdentifier: false,
  nextReadoutCandidates: [{ id: "custom_camel_outer_snapshot", label: "Camel Outer Snapshot", priority: 1, reason: "camel outer override" }],
  freezeFrameSnapshot: outerOverrideFreezeFrameSnapshot,
  readinessSnapshot: outerOverrideReadinessSnapshot,
  supportedPidMatrix: outerOverrideSupportedPidSnapshot,
  ecuInfoSnapshot: outerOverrideEcuInfoSnapshot,
  importClassification: {
    schemaVersion: "obd_response_line_classification_v1",
    bucketCounts: { storedDtcResponses: 13 }
  }
});
check(scanSessionBridgeDiagnosticImportCamelOuterOverride.sessionId === "shop-test-bridge-import-camel-outer-override", "Diagnostic scan session did not accept sessionId camelCase override for bridgeDiagnosticImport input");
check(scanSessionBridgeDiagnosticImportCamelOuterOverride.vehicleApplicability?.status === "partial", "Diagnostic scan session did not let outer vehicleApplicability override bridgeDiagnosticImport alias input");
check(scanSessionBridgeDiagnosticImportCamelOuterOverride.connectionStatus?.vehicleConnected === false, "Diagnostic scan session did not let outer connectionStatus override bridgeDiagnosticImport alias input");
check(scanSessionBridgeDiagnosticImportCamelOuterOverride.adapterIdentity?.adapterFamily === "stn", "Diagnostic scan session did not let outer adapterIdentity override bridgeDiagnosticImport alias input");
check(scanSessionBridgeDiagnosticImportCamelOuterOverride.readoutCoverage?.capturedPercent === 29, "Diagnostic scan session did not let outer readoutCoverage override bridgeDiagnosticImport alias input");
check(scanSessionBridgeDiagnosticImportCamelOuterOverride.toolHints.includes("CONSULT") && scanSessionBridgeDiagnosticImportCamelOuterOverride.toolHints.includes("Techstream"), "Diagnostic scan session did not merge outer toolHints with bridgeDiagnosticImport alias input");
check(scanSessionBridgeDiagnosticImportCamelOuterOverride.warnings.includes("negative_obd_response_present") && scanSessionBridgeDiagnosticImportCamelOuterOverride.warnings.includes("freeze_frame_available"), "Diagnostic scan session did not merge outer warningFlags with bridgeDiagnosticImport alias input");
check(scanSessionBridgeDiagnosticImportCamelOuterOverride.sourceLength === 0, "Diagnostic scan session did not let outer sourceLength override bridgeDiagnosticImport alias input");
check(scanSessionBridgeDiagnosticImportCamelOuterOverride.hadSensitiveIdentifier === true, "Diagnostic scan session did not preserve nested sensitive identifier when outer bridgeDiagnosticImport alias input set false");
check(scanSessionBridgeDiagnosticImportCamelOuterOverride.nextReadoutCandidates[0]?.id === "custom_camel_outer_snapshot", "Diagnostic scan session did not let outer nextReadoutCandidates override bridgeDiagnosticImport alias input");
check(scanSessionBridgeDiagnosticImportCamelOuterOverride.coreSessionStatus?.readyForAnalysis === true, "Diagnostic scan session did not keep populated camel outer-override bridgeDiagnosticImport alias input analysis-ready");
check(scanSessionBridgeDiagnosticImportCamelOuterOverride.coreSessionStatus?.status === "analysis_ready", "Diagnostic scan session did not expose analysis_ready for populated camel outer-override bridgeDiagnosticImport alias input");
check(scanSessionBridgeDiagnosticImportCamelOuterOverride.coreSessionStatus?.completionPercent === 100, "Diagnostic scan session did not keep populated camel outer-override bridgeDiagnosticImport alias input at 100 percent completion");
check(scanSessionBridgeDiagnosticImportCamelOuterOverride.coreSessionStatus?.nextRecommendedReadoutId === "custom_camel_outer_snapshot", "Diagnostic scan session did not preserve explicit nextReadoutCandidates for populated camel outer-override bridgeDiagnosticImport alias input");
check(Array.isArray(scanSessionBridgeDiagnosticImportCamelOuterOverride.coreSessionStatus?.remainingReadoutIds) && scanSessionBridgeDiagnosticImportCamelOuterOverride.coreSessionStatus.remainingReadoutIds.length === 0, "Diagnostic scan session treated populated camel outer-override bridgeDiagnosticImport alias input as having unread core readouts");
check(Array.isArray(scanSessionBridgeDiagnosticImportCamelOuterOverride.coreSessionStatus?.emptyReadoutIds) && scanSessionBridgeDiagnosticImportCamelOuterOverride.coreSessionStatus.emptyReadoutIds.length === 0, "Diagnostic scan session treated populated camel outer-override bridgeDiagnosticImport alias input as having empty core readouts");
check(scanSessionBridgeDiagnosticImportCamelOuterOverride.freezeFrameSnapshot?.triggerDtc === "P0420", "Diagnostic scan session did not let outer freezeFrameSnapshot override bridgeDiagnosticImport alias input");
check(scanSessionBridgeDiagnosticImportCamelOuterOverride.readinessSnapshot?.incompleteCount === 0, "Diagnostic scan session did not let outer readinessSnapshot override bridgeDiagnosticImport alias input");
check(scanSessionBridgeDiagnosticImportCamelOuterOverride.supportedPidMatrix?.supportedPids.join(",") === "0C,0D", "Diagnostic scan session did not let outer supportedPidMatrix override bridgeDiagnosticImport alias input");
check(scanSessionBridgeDiagnosticImportCamelOuterOverride.ecuInfoSnapshot?.items?.[0]?.value === "Outer Override ECU", "Diagnostic scan session did not let outer ecuInfoSnapshot override bridgeDiagnosticImport alias input");
check(scanSessionBridgeDiagnosticImportCamelOuterOverride.importClassification?.bucketCounts?.storedDtcResponses === 13, "Diagnostic scan session did not let outer importClassification override bridgeDiagnosticImport alias input");
const scanSessionBridgeExportPayloadOuterOverride = obd.buildDiagnosticScanSession({
  bridge_export_payload: bridgeExportPayload,
  session_id: "shop-test-bridge-export-outer-override",
  vehicle_applicability: vehicleApplicabilityPartialSample,
  connection_status: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { status: "ready", is_paired: false, vci_ready: true, car_connected: false }
  },
  adapter_identity: { data: { adapter_family: "stn", firmware_version: "9.9", serial_number: "OVERRIDE-002" } },
  readout_coverage: legacyReadoutCoverage,
  tool_hints: ["CONSULT"],
  warning_flags: ["negative_obd_response_present"],
  source_length: 0,
  had_sensitive_identifier: false,
  next_readout_candidates: [{ id: "custom_outer_snapshot", label: "Outer Snapshot", priority: 1, reason: "outer override" }],
  freeze_frame_snapshot: outerOverrideFreezeFrameSnapshot,
  readiness_snapshot: outerOverrideReadinessSnapshot,
  supported_pid_matrix: outerOverrideSupportedPidSnapshot,
  ecu_info_snapshot: outerOverrideEcuInfoSnapshot,
  import_classification: {
    schemaVersion: "obd_response_line_classification_v1",
    bucketCounts: { storedDtcResponses: 11 }
  }
});
check(scanSessionBridgeExportPayloadOuterOverride.vehicleApplicability?.status === "partial", "Diagnostic scan session did not let outer vehicle_applicability override bridge_export_payload alias input");
check(scanSessionBridgeExportPayloadOuterOverride.connectionStatus?.vehicleConnected === false, "Diagnostic scan session did not let outer connection_status override bridge_export_payload alias input");
check(scanSessionBridgeExportPayloadOuterOverride.adapterIdentity?.adapterFamily === "stn", "Diagnostic scan session did not let outer adapter_identity override bridge_export_payload alias input");
check(scanSessionBridgeExportPayloadOuterOverride.readoutCoverage?.capturedPercent === 29, "Diagnostic scan session did not let outer readout_coverage override bridge_export_payload alias input");
check(scanSessionBridgeExportPayloadOuterOverride.toolHints.includes("CONSULT") && scanSessionBridgeExportPayloadOuterOverride.toolHints.includes("Techstream"), "Diagnostic scan session did not merge outer tool_hints with bridge_export_payload alias input");
check(scanSessionBridgeExportPayloadOuterOverride.warnings.includes("negative_obd_response_present") && scanSessionBridgeExportPayloadOuterOverride.warnings.includes("freeze_frame_available"), "Diagnostic scan session did not merge outer warning_flags with bridge_export_payload alias input");
check(scanSessionBridgeExportPayloadOuterOverride.sourceLength === 0, "Diagnostic scan session did not let outer source_length override bridge_export_payload alias input");
check(scanSessionBridgeExportPayloadOuterOverride.hadSensitiveIdentifier === true, "Diagnostic scan session did not preserve nested sensitive identifier when outer bridge_export_payload alias input set false");
check(scanSessionBridgeExportPayloadOuterOverride.nextReadoutCandidates[0]?.id === "custom_outer_snapshot", "Diagnostic scan session did not let outer next_readout_candidates override bridge_export_payload alias input");
check(scanSessionBridgeExportPayloadOuterOverride.coreSessionStatus?.readyForAnalysis === true, "Diagnostic scan session did not keep populated outer-override bridge_export_payload alias input analysis-ready");
check(scanSessionBridgeExportPayloadOuterOverride.coreSessionStatus?.status === "analysis_ready", "Diagnostic scan session did not expose analysis_ready for populated outer-override bridge_export_payload alias input");
check(scanSessionBridgeExportPayloadOuterOverride.coreSessionStatus?.completionPercent === 100, "Diagnostic scan session did not keep populated outer-override bridge_export_payload alias input at 100 percent completion");
check(scanSessionBridgeExportPayloadOuterOverride.coreSessionStatus?.nextRecommendedReadoutId === "custom_outer_snapshot", "Diagnostic scan session did not preserve explicit next_readout_candidates for populated outer-override bridge_export_payload alias input");
check(Array.isArray(scanSessionBridgeExportPayloadOuterOverride.coreSessionStatus?.remainingReadoutIds) && scanSessionBridgeExportPayloadOuterOverride.coreSessionStatus.remainingReadoutIds.length === 0, "Diagnostic scan session treated populated outer-override bridge_export_payload alias input as having unread core readouts");
check(Array.isArray(scanSessionBridgeExportPayloadOuterOverride.coreSessionStatus?.emptyReadoutIds) && scanSessionBridgeExportPayloadOuterOverride.coreSessionStatus.emptyReadoutIds.length === 0, "Diagnostic scan session treated populated outer-override bridge_export_payload alias input as having empty core readouts");
check(scanSessionBridgeExportPayloadOuterOverride.freezeFrameSnapshot?.triggerDtc === "P0420", "Diagnostic scan session did not let outer freeze_frame_snapshot override bridge_export_payload alias input");
check(scanSessionBridgeExportPayloadOuterOverride.readinessSnapshot?.incompleteCount === 0, "Diagnostic scan session did not let outer readiness_snapshot override bridge_export_payload alias input");
check(scanSessionBridgeExportPayloadOuterOverride.supportedPidMatrix?.supportedPids.join(",") === "0C,0D", "Diagnostic scan session did not let outer supported_pid_matrix override bridge_export_payload alias input");
check(scanSessionBridgeExportPayloadOuterOverride.ecuInfoSnapshot?.items?.[0]?.value === "Outer Override ECU", "Diagnostic scan session did not let outer ecu_info_snapshot override bridge_export_payload alias input");
check(scanSessionBridgeExportPayloadOuterOverride.importClassification?.bucketCounts?.storedDtcResponses === 11, "Diagnostic scan session did not let outer import_classification override bridge_export_payload alias input");
const scanSessionBridgeExportPayloadCamelOuterOverride = obd.buildDiagnosticScanSession({
  bridgeExportPayload,
  sessionId: "shop-test-bridge-export-camel-outer-override",
  vehicleApplicability: vehicleApplicabilityPartialSample,
  connectionStatus: {
    ok: true,
    blocked: false,
    would_transmit: false,
    data: { status: "ready", is_paired: false, vci_ready: true, car_connected: false }
  },
  adapterIdentity: { data: { adapter_family: "stn", firmware_version: "9.9", serial_number: "OVERRIDE-102" } },
  readoutCoverage: legacyReadoutCoverage,
  toolHints: ["CONSULT"],
  warningFlags: ["negative_obd_response_present"],
  sourceLength: 0,
  hadSensitiveIdentifier: false,
  nextReadoutCandidates: [{ id: "custom_camel_outer_snapshot", label: "Camel Outer Snapshot", priority: 1, reason: "camel outer override" }],
  freezeFrameSnapshot: outerOverrideFreezeFrameSnapshot,
  readinessSnapshot: outerOverrideReadinessSnapshot,
  supportedPidMatrix: outerOverrideSupportedPidSnapshot,
  ecuInfoSnapshot: outerOverrideEcuInfoSnapshot,
  importClassification: {
    schemaVersion: "obd_response_line_classification_v1",
    bucketCounts: { storedDtcResponses: 15 }
  }
});
check(scanSessionBridgeExportPayloadCamelOuterOverride.sessionId === "shop-test-bridge-export-camel-outer-override", "Diagnostic scan session did not accept sessionId camelCase override for bridgeExportPayload input");
check(scanSessionBridgeExportPayloadCamelOuterOverride.vehicleApplicability?.status === "partial", "Diagnostic scan session did not let outer vehicleApplicability override bridgeExportPayload alias input");
check(scanSessionBridgeExportPayloadCamelOuterOverride.connectionStatus?.vehicleConnected === false, "Diagnostic scan session did not let outer connectionStatus override bridgeExportPayload alias input");
check(scanSessionBridgeExportPayloadCamelOuterOverride.adapterIdentity?.adapterFamily === "stn", "Diagnostic scan session did not let outer adapterIdentity override bridgeExportPayload alias input");
check(scanSessionBridgeExportPayloadCamelOuterOverride.readoutCoverage?.capturedPercent === 29, "Diagnostic scan session did not let outer readoutCoverage override bridgeExportPayload alias input");
check(scanSessionBridgeExportPayloadCamelOuterOverride.toolHints.includes("CONSULT") && scanSessionBridgeExportPayloadCamelOuterOverride.toolHints.includes("Techstream"), "Diagnostic scan session did not merge outer toolHints with bridgeExportPayload alias input");
check(scanSessionBridgeExportPayloadCamelOuterOverride.warnings.includes("negative_obd_response_present") && scanSessionBridgeExportPayloadCamelOuterOverride.warnings.includes("freeze_frame_available"), "Diagnostic scan session did not merge outer warningFlags with bridgeExportPayload alias input");
check(scanSessionBridgeExportPayloadCamelOuterOverride.sourceLength === 0, "Diagnostic scan session did not let outer sourceLength override bridgeExportPayload alias input");
check(scanSessionBridgeExportPayloadCamelOuterOverride.hadSensitiveIdentifier === true, "Diagnostic scan session did not preserve nested sensitive identifier when outer bridgeExportPayload alias input set false");
check(scanSessionBridgeExportPayloadCamelOuterOverride.nextReadoutCandidates[0]?.id === "custom_camel_outer_snapshot", "Diagnostic scan session did not let outer nextReadoutCandidates override bridgeExportPayload alias input");
check(scanSessionBridgeExportPayloadCamelOuterOverride.coreSessionStatus?.readyForAnalysis === true, "Diagnostic scan session did not keep populated camel outer-override bridgeExportPayload alias input analysis-ready");
check(scanSessionBridgeExportPayloadCamelOuterOverride.coreSessionStatus?.status === "analysis_ready", "Diagnostic scan session did not expose analysis_ready for populated camel outer-override bridgeExportPayload alias input");
check(scanSessionBridgeExportPayloadCamelOuterOverride.coreSessionStatus?.completionPercent === 100, "Diagnostic scan session did not keep populated camel outer-override bridgeExportPayload alias input at 100 percent completion");
check(scanSessionBridgeExportPayloadCamelOuterOverride.coreSessionStatus?.nextRecommendedReadoutId === "custom_camel_outer_snapshot", "Diagnostic scan session did not preserve explicit nextReadoutCandidates for populated camel outer-override bridgeExportPayload alias input");
check(Array.isArray(scanSessionBridgeExportPayloadCamelOuterOverride.coreSessionStatus?.remainingReadoutIds) && scanSessionBridgeExportPayloadCamelOuterOverride.coreSessionStatus.remainingReadoutIds.length === 0, "Diagnostic scan session treated populated camel outer-override bridgeExportPayload alias input as having unread core readouts");
check(Array.isArray(scanSessionBridgeExportPayloadCamelOuterOverride.coreSessionStatus?.emptyReadoutIds) && scanSessionBridgeExportPayloadCamelOuterOverride.coreSessionStatus.emptyReadoutIds.length === 0, "Diagnostic scan session treated populated camel outer-override bridgeExportPayload alias input as having empty core readouts");
check(scanSessionBridgeExportPayloadCamelOuterOverride.freezeFrameSnapshot?.triggerDtc === "P0420", "Diagnostic scan session did not let outer freezeFrameSnapshot override bridgeExportPayload alias input");
check(scanSessionBridgeExportPayloadCamelOuterOverride.readinessSnapshot?.incompleteCount === 0, "Diagnostic scan session did not let outer readinessSnapshot override bridgeExportPayload alias input");
check(scanSessionBridgeExportPayloadCamelOuterOverride.supportedPidMatrix?.supportedPids.join(",") === "0C,0D", "Diagnostic scan session did not let outer supportedPidMatrix override bridgeExportPayload alias input");
check(scanSessionBridgeExportPayloadCamelOuterOverride.ecuInfoSnapshot?.items?.[0]?.value === "Outer Override ECU", "Diagnostic scan session did not let outer ecuInfoSnapshot override bridgeExportPayload alias input");
check(scanSessionBridgeExportPayloadCamelOuterOverride.importClassification?.bucketCounts?.storedDtcResponses === 15, "Diagnostic scan session did not let outer importClassification override bridgeExportPayload alias input");
const scanSessionSensitiveIdentifierSnakeAlias = obd.buildDiagnosticScanSession({
  session_id: "shop-test-sensitive-identifier-snake",
  had_sensitive_identifier: true
});
check(scanSessionSensitiveIdentifierSnakeAlias.hadSensitiveIdentifier === true, "Diagnostic scan session did not accept had_sensitive_identifier outer alias input");
const scanSessionNestedSensitiveIdentifierSnakeAlias = obd.buildDiagnosticScanSession({
  session_id: "shop-test-sensitive-identifier-nested-snake",
  scan_session: {
    had_sensitive_identifier: true
  }
});
check(scanSessionNestedSensitiveIdentifierSnakeAlias.hadSensitiveIdentifier === true, "Diagnostic scan session did not accept had_sensitive_identifier nested alias input");
const scanSessionNestedSourceLengthAlias = obd.buildDiagnosticScanSession({
  session_id: "shop-test-source-length-nested-snake",
  scan_session: {
    source_length: 128
  }
});
check(scanSessionNestedSourceLengthAlias.sourceLength === 128, "Diagnostic scan session did not accept source_length from nested scan_session alias input");
const scanSessionNestedWarningsAlias = obd.buildDiagnosticScanSession({
  session_id: "shop-test-warnings-nested",
  scan_session: {
    warnings: ["negative_obd_response_present", "freeze_frame_available"]
  }
});
check(scanSessionNestedWarningsAlias.warnings.includes("negative_obd_response_present"), "Diagnostic scan session did not preserve nested warnings from scan_session alias input");
const scanSessionOuterWarningsMerge = obd.buildDiagnosticScanSession({
  session_id: "shop-test-warnings-outer-merge",
  warnings: ["isotp_reassembly_issue"],
  scan_session: {
    warning_flags: ["negative_obd_response_present"]
  }
});
check(scanSessionOuterWarningsMerge.warnings.includes("isotp_reassembly_issue") && scanSessionOuterWarningsMerge.warnings.includes("negative_obd_response_present"), "Diagnostic scan session did not merge outer and nested warning flags");
const scanSessionNestedOuterZeroSourceLengthOverride = obd.buildDiagnosticScanSession({
  session_id: "shop-test-source-length-zero-override",
  sourceLength: 0,
  scan_session: {
    source_length: 128
  }
});
check(scanSessionNestedOuterZeroSourceLengthOverride.sourceLength === 0, "Diagnostic scan session did not let outer sourceLength=0 override nested scan_session alias input");
const scanSessionNonInfrastructureBridgeImport = obd.buildDiagnosticScanSession({
  scan_session: bridgeDiagnosticImportNonInfrastructureAliases,
  session_id: "shop-test-non-infra-import"
});
check(scanSessionNonInfrastructureBridgeImport.readoutCoverage.includeInfrastructure === false, "Diagnostic scan session did not preserve non-infrastructure readoutCoverage from bridge diagnostic import");
check(!scanSessionNonInfrastructureBridgeImport.warnings.includes("bridge_readout_incomplete") && !scanSessionNonInfrastructureBridgeImport.warnings.includes("bridge_readout_empty_sections"), "Diagnostic scan session emitted bridge readout warnings for non-infrastructure bridge diagnostic import");
const scanSessionLegacyCoverageImport = obd.buildDiagnosticScanSession({
  scan_session: bridgeDiagnosticImportLegacyCoverage,
  session_id: "shop-test-legacy-coverage-import"
});
check(scanSessionLegacyCoverageImport.readoutCoverage.capturedPercent === 29, "Diagnostic scan session did not preserve backfilled capturedPercent from legacy readout coverage");
const scanSessionPlainCoverageOverride = obd.buildDiagnosticScanSession({
  session_id: "shop-test-plain-coverage-override",
  readout_coverage: {
    includeInfrastructure: false,
    totalCategories: 7,
    availableCategories: 3,
    capturedCategories: 2,
    emptyCategories: 1,
    missingCategories: 4,
    capturedPercent: 29,
    progressPercent: 43,
    items: [
      { id: "dtc_snapshot", label: "DTC", status: "captured", available: true, count: 2 },
      { id: "live_pid_snapshot", status: "captured", available: true, count: 3 },
      { id: "freeze_frame_snapshot", status: "empty", available: true, count: 0 }
    ],
    emptyIds: ["freeze_frame_snapshot"],
    missingIds: ["readiness_snapshot", "ecu_info_snapshot", "onboard_monitor_snapshot", "supported_pid_matrix"]
  },
  bridge_session: {
    connection_status: { displayStatus: "connected", vehicleConnected: true },
    dtc_codes: [{ code: "P0300", status: "stored" }]
  }
});
check(scanSessionPlainCoverageOverride.readoutCoverage.includeInfrastructure === false, "Diagnostic scan session did not preserve plain-object includeInfrastructure override");
check(scanSessionPlainCoverageOverride.readoutCoverage.capturedPercent === 29, "Diagnostic scan session did not preserve plain-object capturedPercent override");
check(!scanSessionPlainCoverageOverride.warnings.includes("bridge_readout_incomplete") && !scanSessionPlainCoverageOverride.warnings.includes("bridge_readout_empty_sections"), "Diagnostic scan session emitted bridge readout warnings when plain-object coverage disabled infrastructure");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readyForAnalysis === false, "Diagnostic scan session incorrectly treated plain-object coverage override with empty and missing readouts as analysis-ready");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.nextRecommendedReadoutId === "freeze_frame_snapshot", "Diagnostic scan session did not prioritize freeze_frame_snapshot from plain-object coverage override emptyIds");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.nextReadoutSource === "explicit_candidate", "Diagnostic scan session did not mark explicit next readout source from generated candidates");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.nextReadoutCandidate?.id === "freeze_frame_snapshot" && Boolean(scanSessionPlainCoverageOverride.coreSessionStatus.nextReadoutCandidate?.reason), "Diagnostic scan session did not preserve next readout candidate details");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.nextReadoutState?.id === "freeze_frame_snapshot" && scanSessionPlainCoverageOverride.coreSessionStatus.nextReadoutState?.status === "empty", "Diagnostic scan session did not expose next readout state");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.nextReadoutSummary?.id === "freeze_frame_snapshot" && scanSessionPlainCoverageOverride.coreSessionStatus.nextReadoutSummary?.source === "explicit_candidate", "Diagnostic scan session did not expose next readout summary identity");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.nextReadoutSummary?.status === "empty" && scanSessionPlainCoverageOverride.coreSessionStatus.nextReadoutSummary?.isPending === true && scanSessionPlainCoverageOverride.coreSessionStatus.nextReadoutSummary?.isEmpty === true, "Diagnostic scan session did not expose next readout summary state");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.nextReadoutRequest?.bridgeIntent === "read_freeze_frame" && scanSessionPlainCoverageOverride.coreSessionStatus.nextReadoutRequest?.vehicleCommandEnabled === false, "Diagnostic scan session did not expose safe read-only next readout request metadata");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.nextReadoutSummary?.readoutRequest?.wouldTransmit === false, "Diagnostic scan session did not attach read-only request metadata to next readout summary");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.pendingReadoutRequestQueue?.length === 5 && scanSessionPlainCoverageOverride.coreSessionStatus.pendingReadoutRequestQueue[0]?.wouldTransmit === false, "Diagnostic scan session did not expose read-only request metadata for pending readout queue");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.pendingReadoutRequestQueueById?.readiness_snapshot?.bridgeIntent === "read_live_pid_snapshot", "Diagnostic scan session did not index pending readout request queue by readout id");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.pendingReadoutRequestPlan?.totalCount === 5 && scanSessionPlainCoverageOverride.coreSessionStatus.pendingReadoutRequestPlan?.vehicleCommandEnabled === false, "Diagnostic scan session did not expose read-only pending readout request plan");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.pendingReadoutRequestPlan?.mappedCount === 5 && scanSessionPlainCoverageOverride.coreSessionStatus.pendingReadoutRequestPlan?.allMapped === true, "Diagnostic scan session did not expose fully mapped readout request plan state");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.pendingReadoutRequestPlan?.mappedPercent === 100 && scanSessionPlainCoverageOverride.coreSessionStatus.pendingReadoutRequestPlan?.mappingStatus === "mapped", "Diagnostic scan session did not expose fully mapped readout request plan percent");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.pendingReadoutRequestPlan?.allReadOnly === true && scanSessionPlainCoverageOverride.coreSessionStatus.pendingReadoutRequestPlan?.allNonTransmitting === true && scanSessionPlainCoverageOverride.coreSessionStatus.pendingReadoutRequestPlan?.safeForBridgePlanning === true, "Diagnostic scan session did not expose safe readout request plan flags");
check(Array.isArray(scanSessionPlainCoverageOverride.coreSessionStatus?.pendingReadoutRequestPlan?.blockedReasonIds) && scanSessionPlainCoverageOverride.coreSessionStatus.pendingReadoutRequestPlan.blockedReasonIds.length === 0, "Diagnostic scan session did not expose empty request plan blocked reasons for safe plans");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutRequestPlanGateSummary?.state === "ready" && scanSessionPlainCoverageOverride.coreSessionStatus.readoutRequestPlanGateSummary?.vehicleCommandEnabled === false, "Diagnostic scan session did not expose ready readout request plan gate summary");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.coreWorkflowSummary?.currentStep === "readout_collection" && scanSessionPlainCoverageOverride.coreSessionStatus.coreWorkflowSummary?.nextAction === "collect_next_readout", "Diagnostic scan session did not expose core workflow collection step");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.coreWorkflowSummary?.nextReadoutId === "freeze_frame_snapshot" && scanSessionPlainCoverageOverride.coreSessionStatus.coreWorkflowSummary?.status === "collecting_readouts", "Diagnostic scan session did not expose core workflow next readout status");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.coreWorkflowSummary?.nextReadoutLabel && scanSessionPlainCoverageOverride.coreSessionStatus.coreWorkflowSummary?.nextReadoutSource === "explicit_candidate", "Diagnostic scan session did not expose actionable core workflow next readout details");
check(scanSessionPlainCoverageOverride.diagnosticFlowSummary?.currentStep === "readout_collection" && scanSessionPlainCoverageOverride.diagnosticFlowSummary?.nextAction === "collect_next_readout", "Diagnostic scan session did not expose top-level diagnostic flow step");
check(scanSessionPlainCoverageOverride.diagnosticFlowSummary?.nextReadoutId === "freeze_frame_snapshot" && scanSessionPlainCoverageOverride.diagnosticFlowSummary?.completionPercent === 29, "Diagnostic scan session did not expose top-level diagnostic flow progress");
check(scanSessionPlainCoverageOverride.diagnosticFlowSummary?.nextReadoutLabel && scanSessionPlainCoverageOverride.diagnosticFlowSummary?.nextReadoutSource === "explicit_candidate", "Diagnostic scan session did not expose actionable top-level diagnostic flow next readout details");
check(scanSessionPlainCoverageOverride.diagnosticFlowSummary?.nextReadoutBridgeIntent === "read_freeze_frame" && scanSessionPlainCoverageOverride.diagnosticFlowSummary?.nextReadoutExecutionEnabled === false, "Diagnostic scan session did not expose read-only next readout request in diagnostic flow summary");
check(scanSessionPlainCoverageOverride.diagnosticFlowSummary?.pendingReadoutRequestCount === 5 && scanSessionPlainCoverageOverride.diagnosticFlowSummary?.pendingReadoutRequestNext?.wouldTransmit === false, "Diagnostic scan session did not expose pending readout request queue in diagnostic flow summary");
check(scanSessionPlainCoverageOverride.diagnosticFlowSummary?.pendingReadoutRequestPlan?.requestIds?.includes("readiness_snapshot") && scanSessionPlainCoverageOverride.diagnosticFlowSummary.pendingReadoutRequestPlan?.wouldTransmit === false, "Diagnostic scan session did not expose read-only request plan in diagnostic flow summary");
check(scanSessionPlainCoverageOverride.diagnosticFlowSummary?.pendingReadoutRequestPlan?.unmappedCount === 0, "Diagnostic scan session did not expose mapped request plan summary in diagnostic flow summary");
check(scanSessionPlainCoverageOverride.diagnosticFlowSummary?.requestPlanMappedCount === 5 && scanSessionPlainCoverageOverride.diagnosticFlowSummary?.requestPlanUnmappedCount === 0 && scanSessionPlainCoverageOverride.diagnosticFlowSummary?.requestPlanSafeForBridgePlanning === true, "Diagnostic scan session did not expose direct diagnostic flow request plan safety fields");
check(Array.isArray(scanSessionPlainCoverageOverride.diagnosticFlowSummary?.requestPlanBlockedReasonIds) && scanSessionPlainCoverageOverride.diagnosticFlowSummary.requestPlanBlockedReasonIds.length === 0, "Diagnostic scan session did not expose direct diagnostic flow safe request plan reason state");
check(scanSessionPlainCoverageOverride.diagnosticFlowSummary?.requestPlanGateState === "ready" && scanSessionPlainCoverageOverride.diagnosticFlowSummary?.requestPlanGateReady === true, "Diagnostic scan session did not expose ready request plan gate in diagnostic flow summary");
check(scanSessionPlainCoverageOverride.diagnosticFlowSummary?.pendingQueueNextReadoutId === "readiness_snapshot" && scanSessionPlainCoverageOverride.diagnosticFlowSummary?.pendingQueueNextReadoutStatus === "missing", "Diagnostic scan session did not expose diagnostic flow pending queue cursor");
check(scanSessionPlainCoverageOverride.diagnosticFlowSummary?.recommendedReadoutId === "freeze_frame_snapshot" && scanSessionPlainCoverageOverride.diagnosticFlowSummary?.recommendedReadoutSource === "explicit_candidate", "Diagnostic scan session did not expose diagnostic flow recommended readout cursor");
check(scanSessionPlainCoverageOverride.diagnosticFlowSummary?.recommendedReadoutStatus === "empty" && scanSessionPlainCoverageOverride.diagnosticFlowSummary?.recommendedReadoutIsPending === true, "Diagnostic scan session did not expose diagnostic flow recommended readout state");
check(scanSessionPlainCoverageOverride.diagnosticFlowSummary?.canStartAnalysis === false && scanSessionPlainCoverageOverride.diagnosticFlowSummary?.analysisBlocked === true, "Diagnostic scan session did not expose diagnostic flow analysis gating flags");
check(scanSessionPlainCoverageOverride.diagnosticFlowSummary?.applicabilityStatus === "unknown" && scanSessionPlainCoverageOverride.diagnosticFlowSummary?.vehicleApplicabilityReviewRequired === false, "Diagnostic scan session did not expose diagnostic flow applicability status");
check(scanSessionPlainCoverageOverride.diagnosticFlowSummary?.readoutCollectionRequired === true && scanSessionPlainCoverageOverride.diagnosticFlowSummary?.blockingReasonIds?.includes("missing_readouts"), "Diagnostic scan session did not expose diagnostic flow blocking reasons");
check(scanSessionPlainCoverageOverride.diagnosticFlowSummary?.missingReadoutCount === 4 && scanSessionPlainCoverageOverride.diagnosticFlowSummary?.emptyReadoutCount === 1 && scanSessionPlainCoverageOverride.diagnosticFlowSummary?.pendingReadoutCount === 5, "Diagnostic scan session did not expose diagnostic flow readout completion counts");
check(scanSessionPlainCoverageOverride.diagnosticFlowSummary?.checklistTotalCount === 3 && scanSessionPlainCoverageOverride.diagnosticFlowSummary?.checklistPendingCount === 1, "Diagnostic scan session did not expose diagnostic flow checklist counts");
check(scanSessionPlainCoverageOverride.diagnosticFlowSummary?.checklistBlockedIds?.includes("required_readouts"), "Diagnostic scan session did not expose diagnostic flow checklist blocked ids");
check(scanSessionPlainCoverageOverride.readoutCompletionSummary?.complete === false && scanSessionPlainCoverageOverride.readoutCompletionSummary?.pendingIds?.length === 5, "Diagnostic scan session did not expose top-level readout completion summary");
check(scanSessionPlainCoverageOverride.readoutCompletionSummary?.pendingCount === 5 && scanSessionPlainCoverageOverride.readoutCompletionSummary?.missingCount === 4 && scanSessionPlainCoverageOverride.readoutCompletionSummary?.emptyCount === 1, "Diagnostic scan session did not expose readout completion counts");
check(scanSessionPlainCoverageOverride.readoutCompletionSummary?.emptyIds?.includes("freeze_frame_snapshot") && scanSessionPlainCoverageOverride.readoutCompletionSummary?.capturedIds?.includes("dtc_snapshot"), "Diagnostic scan session did not expose top-level readout completion ids");
const scanSessionImportedCountOnlyReadoutCompletion = obd.buildDiagnosticScanSession({
  session_id: "shop-test-imported-count-only-readout-completion",
  readout_coverage: scanSessionPlainCoverageOverride.readoutCoverage,
  readout_completion_summary: {
    complete: false,
    requiredCount: 7,
    capturedCount: 2,
    missingCount: 4,
    emptyCount: 1,
    pendingCount: 5
  }
});
check(scanSessionImportedCountOnlyReadoutCompletion.importedReadoutCompletionComparisonSummary?.importedPendingCount === 5 && scanSessionImportedCountOnlyReadoutCompletion.importedReadoutCompletionComparisonSummary?.importedMissingCount === 4, "Diagnostic scan session did not compare imported count-only readout completion summary");
check(Number.isFinite(scanSessionImportedCountOnlyReadoutCompletion.importedReadoutCompletionComparisonSummary?.requiredCountDelta) && Number.isFinite(scanSessionImportedCountOnlyReadoutCompletion.importedReadoutCompletionComparisonSummary?.capturedCountDelta), "Diagnostic scan session did not expose count-only readout completion deltas");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.analysisBlockers?.includes("missing_readouts") && scanSessionPlainCoverageOverride.coreSessionStatus?.analysisBlockers?.includes("empty_readouts"), "Diagnostic scan session did not expose analysis blockers for missing and empty readouts");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.analysisBlockerSummary?.missingReadoutCount === 4, "Diagnostic scan session did not expose missing readout blocker count");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.analysisBlockerSummary?.emptyReadoutCount === 1, "Diagnostic scan session did not expose empty readout blocker count");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.analysisBlockerSummary?.totalCount === 2, "Diagnostic scan session did not expose analysis blocker category count");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.analysisBlockerById?.missing_readouts?.count === 4, "Diagnostic scan session did not expose missing readout blocker details by id");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.analysisBlockerById?.missing_readouts?.readoutIds?.includes("readiness_snapshot"), "Diagnostic scan session did not expose missing readout ids in blocker details");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.analysisBlockerById?.empty_readouts?.readoutIds?.includes("freeze_frame_snapshot"), "Diagnostic scan session did not expose empty readout ids in blocker details");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.analysisReadinessSummary?.ready === false && scanSessionPlainCoverageOverride.coreSessionStatus.analysisReadinessSummary?.status === "collecting_readouts", "Diagnostic scan session did not expose analysis readiness state");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.analysisReadinessSummary?.blockerCount === 2 && scanSessionPlainCoverageOverride.coreSessionStatus.analysisReadinessSummary?.pendingReadoutCount === 5, "Diagnostic scan session did not expose analysis readiness blocker counts");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.analysisReadinessSummary?.blockerSummary?.missingReadoutCount === 4 && scanSessionPlainCoverageOverride.coreSessionStatus.analysisReadinessSummary?.blockersById?.empty_readouts?.count === 1, "Diagnostic scan session did not carry blocker details in analysis readiness summary");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.analysisReadinessSummary?.readoutRequestPlanGateSummary?.state === "ready", "Diagnostic scan session did not carry readout request plan gate into analysis readiness summary");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.analysisChecklistSummary?.totalCount === 3 && scanSessionPlainCoverageOverride.coreSessionStatus.analysisChecklistSummary?.pendingCount === 1, "Diagnostic scan session did not expose top-level analysis checklist summary");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.analysisChecklistById?.required_readouts?.pendingCount === 5, "Diagnostic scan session did not expose required-readout checklist details");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.analysisReadinessSummary?.checklistSummary?.blockingCount === 1, "Diagnostic scan session did not carry checklist summary into analysis readiness");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.analysisReadinessSummary?.checklistById?.vehicle_applicability?.state === "complete", "Diagnostic scan session did not carry vehicle-applicability checklist state");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.analysisReadinessSummary?.nextReadoutId === "freeze_frame_snapshot" && scanSessionPlainCoverageOverride.coreSessionStatus.analysisReadinessSummary?.completionPercent === 29, "Diagnostic scan session did not expose analysis readiness next readout progress");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.analysisReadinessSummary?.nextReadoutLabel && scanSessionPlainCoverageOverride.coreSessionStatus.analysisReadinessSummary?.nextReadoutSource === "explicit_candidate", "Diagnostic scan session did not expose actionable analysis readiness next readout details");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.capturedReadoutIds?.includes("dtc_snapshot") && scanSessionPlainCoverageOverride.coreSessionStatus?.capturedReadoutIds?.includes("live_pid_snapshot"), "Diagnostic scan session did not derive captured core readout ids from coverage items");
check(!scanSessionPlainCoverageOverride.coreSessionStatus?.remainingReadoutIds?.includes("dtc_snapshot") && !scanSessionPlainCoverageOverride.coreSessionStatus?.remainingReadoutIds?.includes("live_pid_snapshot"), "Diagnostic scan session kept coverage-captured readouts in remaining ids");
check(!scanSessionPlainCoverageOverride.coreSessionStatus?.remainingReadoutIds?.includes("freeze_frame_snapshot"), "Diagnostic scan session kept coverage-empty readouts in remaining ids");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.requiredReadoutIds?.length === 7 && scanSessionPlainCoverageOverride.coreSessionStatus.requiredReadoutIds.includes("onboard_monitor_snapshot"), "Diagnostic scan session did not expose required core readout ids");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.pendingReadoutIds?.length === 5 && scanSessionPlainCoverageOverride.coreSessionStatus.pendingReadoutIds.includes("freeze_frame_snapshot"), "Diagnostic scan session did not expose pending readout ids");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.pendingReadoutStates?.length === 5 && scanSessionPlainCoverageOverride.coreSessionStatus.pendingReadoutStates.some((item) => item.id === "freeze_frame_snapshot" && item.status === "empty"), "Diagnostic scan session did not expose pending readout states");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.pendingReadoutStateById?.freeze_frame_snapshot?.status === "empty", "Diagnostic scan session did not expose pending readout states by id");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.pendingReadoutQueue?.[0]?.position === 1 && scanSessionPlainCoverageOverride.coreSessionStatus.pendingReadoutQueue[0]?.isNext === true, "Diagnostic scan session did not expose ordered pending readout queue");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.pendingReadoutQueueById?.readiness_snapshot?.position === 1, "Diagnostic scan session did not expose pending readout queue by id");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.pendingReadoutQueueSummary?.totalCount === 5 && scanSessionPlainCoverageOverride.coreSessionStatus.pendingReadoutQueueSummary?.remainingAfterNextCount === 4, "Diagnostic scan session did not expose pending readout queue summary");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.pendingReadoutQueueSummary?.hasPendingReadouts === true && scanSessionPlainCoverageOverride.coreSessionStatus.pendingReadoutQueueSummary?.nextReadoutStatus === "missing", "Diagnostic scan session did not expose pending readout queue summary next state");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.pendingReadoutQueueSummary?.pendingPercent === 71, "Diagnostic scan session did not expose pending readout queue percent");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.pendingReadoutQueueSummary?.recommendedReadoutId === "freeze_frame_snapshot" && scanSessionPlainCoverageOverride.coreSessionStatus.pendingReadoutQueueSummary?.recommendedReadoutSource === "explicit_candidate", "Diagnostic scan session did not expose recommended readout cursor in pending queue summary");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.pendingReadoutQueueSummary?.recommendedReadoutStatus === "empty" && scanSessionPlainCoverageOverride.coreSessionStatus.pendingReadoutQueueSummary?.recommendedReadoutIsPending === true, "Diagnostic scan session did not expose recommended readout state in pending queue summary");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.nextPendingReadoutId === "readiness_snapshot" && scanSessionPlainCoverageOverride.coreSessionStatus?.nextPendingReadoutState?.status === "missing", "Diagnostic scan session did not expose next pending readout cursor");
check(Array.isArray(scanSessionPlainCoverageOverride.coreSessionStatus?.missingReadoutIds) && scanSessionPlainCoverageOverride.coreSessionStatus.missingReadoutIds.length === scanSessionPlainCoverageOverride.coreSessionStatus.remainingReadoutIds.length, "Diagnostic scan session did not expose missingReadoutIds alongside remainingReadoutIds");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutStates?.find((item) => item.id === "dtc_snapshot")?.status === "captured", "Diagnostic scan session did not expose captured readout state");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutStates?.find((item) => item.id === "dtc_snapshot")?.label === "DTC", "Diagnostic scan session did not preserve readout state label from coverage item");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutStates?.find((item) => item.id === "dtc_snapshot")?.priority === 100, "Diagnostic scan session did not expose readout state priority");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutStates?.find((item) => item.id === "freeze_frame_snapshot")?.status === "empty", "Diagnostic scan session did not expose empty readout state");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutStates?.find((item) => item.id === "readiness_snapshot")?.status === "missing", "Diagnostic scan session did not expose missing readout state");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutStateById?.dtc_snapshot?.status === "captured", "Diagnostic scan session did not expose readoutStateById captured state");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutStateById?.freeze_frame_snapshot?.status === "empty", "Diagnostic scan session did not expose readoutStateById empty state");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutStateById?.readiness_snapshot?.status === "missing", "Diagnostic scan session did not expose readoutStateById missing state");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutStatesByStatus?.captured?.some((item) => item.id === "dtc_snapshot"), "Diagnostic scan session did not group captured readout states");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutStatesByStatus?.empty?.some((item) => item.id === "freeze_frame_snapshot"), "Diagnostic scan session did not group empty readout states");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutStatesByStatus?.missing?.some((item) => item.id === "readiness_snapshot"), "Diagnostic scan session did not group missing readout states");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutStateSummary?.totalCount === 7, "Diagnostic scan session did not expose total readout state count");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutStateSummary?.capturedCount === 2, "Diagnostic scan session did not expose captured readout state count");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutStateSummary?.emptyCount === 1, "Diagnostic scan session did not expose empty readout state count");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutStateSummary?.missingCount === 4, "Diagnostic scan session did not expose missing readout state count");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutStateSummary?.pendingCount === 5, "Diagnostic scan session did not expose pending readout state count");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutStateSummary?.openCount === 5, "Diagnostic scan session did not expose open readout state count");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutStateSummary?.capturedPercent === 29, "Diagnostic scan session did not expose captured readout state percent");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutStateSummary?.pendingPercent === 71, "Diagnostic scan session did not expose pending readout state percent");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutStateSummary?.attemptedCount === 3, "Diagnostic scan session did not expose attempted readout state count");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutStateSummary?.attemptedPercent === 43, "Diagnostic scan session did not expose attempted readout state percent");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutProgressSummary?.requiredCount === 7, "Diagnostic scan session did not expose readout progress required count");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutProgressSummary?.capturedPercent === 29 && scanSessionPlainCoverageOverride.coreSessionStatus?.readoutProgressSummary?.pendingPercent === 71, "Diagnostic scan session did not expose readout progress percents");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutProgressSummary?.completionPercent === 29, "Diagnostic scan session did not expose readout progress completion percent");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutCompletionSummary?.complete === false && scanSessionPlainCoverageOverride.coreSessionStatus.readoutCompletionSummary?.hasMissingReadouts === true, "Diagnostic scan session did not expose incomplete readout completion summary");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutCompletionSummary?.hasEmptyReadouts === true && scanSessionPlainCoverageOverride.coreSessionStatus.readoutCompletionSummary?.emptyIds?.includes("freeze_frame_snapshot"), "Diagnostic scan session did not expose empty ids in readout completion summary");
check(scanSessionPlainCoverageOverride.coreSessionStatus?.readoutCompletionSummary?.pendingIds?.length === 5 && scanSessionPlainCoverageOverride.coreSessionStatus.readoutCompletionSummary?.capturedIds?.includes("dtc_snapshot"), "Diagnostic scan session did not expose grouped readout completion ids");
check(Array.isArray(scanSessionPlainCoverageOverride.coreSessionStatus?.emptyReadoutIds) && scanSessionPlainCoverageOverride.coreSessionStatus.emptyReadoutIds.length === 1 && scanSessionPlainCoverageOverride.coreSessionStatus.emptyReadoutIds[0] === "freeze_frame_snapshot", "Diagnostic scan session did not preserve plain-object coverage override emptyReadoutIds");
const scanSessionCamelCoverageOverride = obd.buildDiagnosticScanSession({
  sessionId: "shop-test-camel-coverage-override",
  readoutCoverage: {
    includeInfrastructure: false,
    totalCategories: 7,
    availableCategories: 3,
    capturedCategories: 2,
    emptyCategories: 1,
    missingCategories: 4,
    capturedPercent: 29,
    progressPercent: 43,
    items: [
      { id: "dtc_snapshot", status: "captured", available: true, count: 2 },
      { id: "live_pid_snapshot", status: "captured", available: true, count: 3 },
      { id: "freeze_frame_snapshot", status: "empty", available: true, count: 0 }
    ],
    emptyIds: ["freeze_frame_snapshot"],
    missingIds: ["readiness_snapshot", "ecu_info_snapshot", "onboard_monitor_snapshot", "supported_pid_matrix"]
  },
  nextReadoutCandidates: [{ id: "custom_camel_snapshot", label: "Camel Snapshot", priority: 1, reason: "camel override" }],
  toolHints: ["CONSULT"],
  warningFlags: ["negative_obd_response_present"],
  sourceLength: 9,
  hadSensitiveIdentifier: true,
  bridgeSession: {
    connectionStatusResponse: {
      ok: true,
      blocked: false,
      would_transmit: false,
      data: { status: "ready", is_paired: true, vci_ready: true, car_connected: true }
    },
    dtcSnapshot: bridgeDtcSnapshot
  }
});
check(scanSessionCamelCoverageOverride.sessionId === "shop-test-camel-coverage-override", "Diagnostic scan session did not accept sessionId camelCase input");
check(scanSessionCamelCoverageOverride.readoutCoverage.includeInfrastructure === false, "Diagnostic scan session did not preserve camelCase readoutCoverage override");
check(scanSessionCamelCoverageOverride.readoutCoverage.capturedPercent === 29, "Diagnostic scan session did not preserve camelCase readoutCoverage capturedPercent");
check(scanSessionCamelCoverageOverride.nextReadoutCandidates[0]?.id === "custom_camel_snapshot", "Diagnostic scan session did not preserve camelCase nextReadoutCandidates override");
check(scanSessionCamelCoverageOverride.toolHints.includes("CONSULT"), "Diagnostic scan session did not preserve camelCase toolHints override");
check(scanSessionCamelCoverageOverride.warnings.includes("negative_obd_response_present"), "Diagnostic scan session did not preserve camelCase warningFlags override");
check(scanSessionCamelCoverageOverride.sourceLength === 9, "Diagnostic scan session did not preserve camelCase sourceLength override");
check(scanSessionCamelCoverageOverride.hadSensitiveIdentifier === true, "Diagnostic scan session did not preserve camelCase hadSensitiveIdentifier override");
check(!scanSessionCamelCoverageOverride.warnings.includes("bridge_readout_incomplete") && !scanSessionCamelCoverageOverride.warnings.includes("bridge_readout_empty_sections"), "Diagnostic scan session emitted bridge readout warnings when camelCase coverage disabled infrastructure");
check(scanSessionCamelCoverageOverride.coreSessionStatus?.readyForAnalysis === false, "Diagnostic scan session incorrectly treated camelCase coverage override with empty and missing readouts as analysis-ready");
check(scanSessionCamelCoverageOverride.coreSessionStatus?.nextRecommendedReadoutId === "custom_camel_snapshot", "Diagnostic scan session did not preserve camelCase nextReadoutCandidates over coverage override emptyIds");
check(scanSessionCamelCoverageOverride.coreSessionStatus?.nextReadoutSource === "explicit_candidate", "Diagnostic scan session did not mark explicit next readout source");
check(scanSessionCamelCoverageOverride.coreSessionStatus?.pendingReadoutRequestPlan?.unmappedRequestIds?.includes("custom_camel_snapshot") && scanSessionCamelCoverageOverride.coreSessionStatus.pendingReadoutRequestPlan?.allMapped === false, "Diagnostic scan session did not expose unmapped custom readout request plan entries");
check(scanSessionCamelCoverageOverride.coreSessionStatus?.pendingReadoutRequestPlan?.hasUnmappedRequests === true && scanSessionCamelCoverageOverride.coreSessionStatus.pendingReadoutRequestPlan?.mappingStatus === "partial", "Diagnostic scan session did not expose partial request plan mapping state");
check(scanSessionCamelCoverageOverride.coreSessionStatus?.pendingReadoutRequestPlan?.safeForBridgePlanning === false && scanSessionCamelCoverageOverride.coreSessionStatus.pendingReadoutRequestPlan?.unmappedPercent > 0, "Diagnostic scan session did not block bridge planning for unmapped readout requests");
check(scanSessionCamelCoverageOverride.coreSessionStatus?.pendingReadoutRequestPlan?.blockedReasonIds?.includes("unmapped_readout_requests") && scanSessionCamelCoverageOverride.coreSessionStatus.pendingReadoutRequestPlan?.blockedReasonById?.unmapped_readout_requests?.readoutIds?.includes("custom_camel_snapshot"), "Diagnostic scan session did not expose unmapped request plan blocked reason details");
check(scanSessionCamelCoverageOverride.coreSessionStatus?.readoutRequestPlanGateSummary?.state === "blocked" && scanSessionCamelCoverageOverride.coreSessionStatus.readoutRequestPlanGateSummary?.nextBlockedReasonId === "unmapped_readout_requests", "Diagnostic scan session did not expose blocked readout request plan gate summary");
check(scanSessionCamelCoverageOverride.diagnosticFlowSummary?.requestPlanHasUnmappedRequests === true && scanSessionCamelCoverageOverride.diagnosticFlowSummary?.requestPlanMappingStatus === "partial", "Diagnostic scan session did not expose unmapped request plan status in diagnostic flow summary");
check(scanSessionCamelCoverageOverride.diagnosticFlowSummary?.requestPlanBlockedReasonIds?.includes("unmapped_readout_requests"), "Diagnostic scan session did not expose unmapped request plan blocked reason in diagnostic flow summary");
check(scanSessionCamelCoverageOverride.diagnosticFlowSummary?.requestPlanGateBlocked === true && scanSessionCamelCoverageOverride.diagnosticFlowSummary?.requestPlanNextBlockedReasonId === "unmapped_readout_requests", "Diagnostic scan session did not expose blocked request plan gate in diagnostic flow summary");
check(Array.isArray(scanSessionCamelCoverageOverride.coreSessionStatus?.emptyReadoutIds) && scanSessionCamelCoverageOverride.coreSessionStatus.emptyReadoutIds.length === 1 && scanSessionCamelCoverageOverride.coreSessionStatus.emptyReadoutIds[0] === "freeze_frame_snapshot", "Diagnostic scan session did not preserve camelCase coverage override emptyReadoutIds");
const scanSessionSnakeCoverageOverride = obd.buildDiagnosticScanSession({
  session_id: "shop-test-snake-coverage-override",
  readout_coverage: {
    include_infrastructure: false,
    totalCategories: 7,
    availableCategories: 3,
    capturedCategories: 2,
    emptyCategories: 1,
    missingCategories: 4
  },
  bridge_session: {
    connection_status: { displayStatus: "connected", vehicleConnected: true },
    dtc_codes: [{ code: "P0300", status: "stored" }]
  }
});
check(scanSessionSnakeCoverageOverride.readoutCoverage.includeInfrastructure === false, "Diagnostic scan session did not accept include_infrastructure readout coverage alias");
check(!scanSessionSnakeCoverageOverride.warnings.includes("bridge_readout_incomplete") && !scanSessionSnakeCoverageOverride.warnings.includes("bridge_readout_empty_sections"), "Diagnostic scan session emitted bridge readout warnings when include_infrastructure alias disabled infrastructure");
check(scanSessionSnakeCoverageOverride.coreSessionStatus?.applicabilityStatus === "unknown", "Diagnostic scan session did not preserve unknown applicability when coverage override omitted vehicle applicability");
check(scanSessionSnakeCoverageOverride.coreSessionStatus?.completionPercent === 29, "Diagnostic scan session did not preserve explicit coverage completion progress");
check(scanSessionSnakeCoverageOverride.coreSessionStatus?.nextRecommendedReadoutId === "dtc_snapshot", "Diagnostic scan session did not prioritize dtc_snapshot when coverage override omitted vehicle applicability");
check(scanSessionSnakeCoverageOverride.coreSessionStatus?.nextReadoutSource === "fallback_state", "Diagnostic scan session did not mark fallback next readout source");
const scanSessionCoverageOnlyProgress = obd.buildDiagnosticScanSession({
  session_id: "shop-test-coverage-only-progress",
  readout_coverage: {
    include_infrastructure: false,
    totalCategories: 7,
    availableCategories: 1,
    capturedCategories: 0,
    emptyCategories: 1,
    missingCategories: 6,
    emptyIds: ["dtc_snapshot"],
    missingIds: ["freeze_frame_snapshot", "readiness_snapshot", "ecu_info_snapshot", "onboard_monitor_snapshot", "supported_pid_matrix", "live_pid_snapshot"]
  }
});
check(scanSessionCoverageOnlyProgress.coreSessionStatus?.status === "collecting_readouts", "Diagnostic scan session did not treat explicit coverage-only progress as collecting readouts");
check(scanSessionCoverageOnlyProgress.coreSessionStatus?.completionPercent === 0, "Diagnostic scan session should keep zero completion for coverage-only empty progress");
const scanSessionConflictingCoverageStatus = obd.buildDiagnosticScanSession({
  session_id: "shop-test-conflicting-coverage-status",
  readout_coverage: {
    include_infrastructure: false,
    totalCategories: 7,
    availableCategories: 1,
    capturedCategories: 1,
    emptyCategories: 1,
    missingCategories: 5,
    items: [{ id: "dtc_snapshot", status: "captured", available: true, count: 1 }],
    emptyIds: ["dtc_snapshot"]
  }
});
check(scanSessionConflictingCoverageStatus.coreSessionStatus?.capturedReadoutIds?.includes("dtc_snapshot"), "Diagnostic scan session did not preserve captured readout when coverage status conflicted with emptyIds");
check(!scanSessionConflictingCoverageStatus.coreSessionStatus?.emptyReadoutIds?.includes("dtc_snapshot"), "Diagnostic scan session did not prefer captured coverage status over conflicting emptyIds");
const scanSessionSnakeCoverageManualApplicability = obd.buildDiagnosticScanSession({
  session_id: "shop-test-snake-coverage-manual-applicability",
  readout_coverage: {
    include_infrastructure: false,
    totalCategories: 7,
    availableCategories: 1,
    capturedCategories: 1,
    emptyCategories: 0,
    missingCategories: 6
  },
  vehicle_applicability: { status: "manual" },
  bridge_session: {
    connection_status: { displayStatus: "connected", vehicleConnected: true },
    dtc_codes: [{ code: "P0300", status: "stored" }]
  }
});
check(scanSessionSnakeCoverageManualApplicability.coreSessionStatus?.nextRecommendedReadoutId === "ecu_info_snapshot", "Diagnostic scan session did not prioritize ecu_info_snapshot for manual applicability when falling back nextRecommendedReadoutId");
const normalizedSnakeCoverage = obd.normalizeReadoutCoverageSnapshot({
  include_infrastructure: true,
  totalCategories: 10,
  availableCategories: 4,
  capturedCategories: 3,
  emptyCategories: 1,
  missingCategories: 6
});
check(normalizedSnakeCoverage.includeInfrastructure === true, "Readout coverage normalization did not accept include_infrastructure alias");
const normalizedSnakeCoverageFields = obd.normalizeReadoutCoverageSnapshot({
  schema_version: "readout_coverage_v1",
  include_infrastructure: false,
  total_categories: 7,
  available_categories: 3,
  captured_categories: 2,
  empty_categories: 1,
  missing_categories: 4,
  captured_percent: 29,
  progress_percent: 43,
  empty_ids: ["freeze_frame_snapshot"],
  empty_labels: ["Freeze Frame"],
  missing_ids: ["readiness_snapshot"],
  missing_labels: ["Readiness"]
});
check(normalizedSnakeCoverageFields.totalCategories === 7 && normalizedSnakeCoverageFields.availableCategories === 3, "Readout coverage normalization did not accept snake_case category counts");
check(normalizedSnakeCoverageFields.capturedPercent === 29 && normalizedSnakeCoverageFields.progressPercent === 43, "Readout coverage normalization did not accept snake_case progress aliases");
check(normalizedSnakeCoverageFields.emptyIds[0] === "freeze_frame_snapshot" && normalizedSnakeCoverageFields.missingIds[0] === "readiness_snapshot", "Readout coverage normalization did not accept snake_case id aliases");
const normalizedNextReadoutCandidatesAliases = obd.normalizeNextReadoutCandidates([
  {
    readout_id: "ecu_info_snapshot",
    display_label: "ECU Info",
    status: "empty",
    sort_order: "92",
    reason_label: "Need ECU info refresh",
    applicability_status: "partial"
  },
  {
    id: "dtc_snapshot",
    label: "DTC",
    status: "missing",
    priority: 100,
    reason: "Need DTC"
  }
]);
check(normalizedNextReadoutCandidatesAliases[0]?.id === "dtc_snapshot", "Next readout candidates did not sort alias input by normalized priority");
check(normalizedNextReadoutCandidatesAliases[1]?.id === "ecu_info_snapshot", "Next readout candidates did not preserve readout_id alias input");
check(normalizedNextReadoutCandidatesAliases[1]?.label === "ECU Info", "Next readout candidates did not preserve display_label alias input");
check(normalizedNextReadoutCandidatesAliases[1]?.priority === 92, "Next readout candidates did not normalize sort_order alias input");
check(normalizedNextReadoutCandidatesAliases[1]?.reason === "Need ECU info refresh", "Next readout candidates did not normalize reason_label alias input");
check(normalizedNextReadoutCandidatesAliases[1]?.applicabilityStatus === "partial", "Next readout candidates did not normalize applicability_status alias input");
const normalizedNextReadoutCandidatesCamelAliases = obd.normalizeNextReadoutCandidates([
  {
    readoutId: "freeze_frame_snapshot",
    displayLabel: "Freeze Frame",
    status: "empty",
    sortOrder: "95",
    reasonLabel: "Need freeze frame refresh",
    vehicleApplicabilityStatus: "partial"
  },
  {
    id: "dtc_snapshot",
    label: "DTC",
    status: "missing",
    priority: 100,
    reason: "Need DTC"
  }
]);
check(normalizedNextReadoutCandidatesCamelAliases[1]?.id === "freeze_frame_snapshot", "Next readout candidates did not preserve readoutId camelCase alias input");
check(normalizedNextReadoutCandidatesCamelAliases[1]?.label === "Freeze Frame", "Next readout candidates did not preserve displayLabel camelCase alias input");
check(normalizedNextReadoutCandidatesCamelAliases[1]?.priority === 95, "Next readout candidates did not normalize sortOrder camelCase alias input");
check(normalizedNextReadoutCandidatesCamelAliases[1]?.reason === "Need freeze frame refresh", "Next readout candidates did not normalize reasonLabel camelCase alias input");
check(normalizedNextReadoutCandidatesCamelAliases[1]?.applicabilityStatus === "partial", "Next readout candidates did not normalize vehicleApplicabilityStatus camelCase alias input");
const normalizedNextReadoutCandidatesMixedApplicabilityAliases = obd.normalizeNextReadoutCandidates([
  {
    readoutId: "supported_pid_matrix",
    display_label: "Supported PID",
    sortOrder: "75",
    reason: "Need supported PID map",
    vehicle_applicability_status: "manual"
  }
]);
check(normalizedNextReadoutCandidatesMixedApplicabilityAliases[0]?.id === "supported_pid_matrix", "Next readout candidates did not preserve mixed readoutId/display_label aliases");
check(normalizedNextReadoutCandidatesMixedApplicabilityAliases[0]?.priority === 75, "Next readout candidates did not normalize mixed sortOrder alias input");
check(normalizedNextReadoutCandidatesMixedApplicabilityAliases[0]?.applicabilityStatus === "manual", "Next readout candidates did not normalize vehicle_applicability_status alias input");
const scanSessionNonInfrastructureBridgeSession = obd.buildDiagnosticScanSession({
  bridge_session: bridgeDiagnosticImportNonInfrastructureAliases.bridgeSession,
  session_id: "shop-test-non-infra-bridge-session"
});
check(scanSessionNonInfrastructureBridgeSession.readoutCoverage.includeInfrastructure === false, "Diagnostic scan session did not preserve non-infrastructure readoutCoverage from bridge session input");
check(!scanSessionNonInfrastructureBridgeSession.warnings.includes("bridge_readout_incomplete") && !scanSessionNonInfrastructureBridgeSession.warnings.includes("bridge_readout_empty_sections"), "Diagnostic scan session emitted bridge readout warnings for non-infrastructure bridge session input");
const scanSessionNonInfrastructureBridgeExportPayload = obd.buildDiagnosticScanSession({
  bridge_export_payload: bridgeDiagnosticImportNonInfrastructureAliases.exportPayload,
  session_id: "shop-test-non-infra-bridge-export"
});
check(scanSessionNonInfrastructureBridgeExportPayload.readoutCoverage.includeInfrastructure === false, "Diagnostic scan session did not preserve non-infrastructure readoutCoverage from bridge_export_payload input");
check(!scanSessionNonInfrastructureBridgeExportPayload.warnings.includes("bridge_readout_incomplete") && !scanSessionNonInfrastructureBridgeExportPayload.warnings.includes("bridge_readout_empty_sections"), "Diagnostic scan session emitted bridge readout warnings for non-infrastructure bridge_export_payload input");
const scanSessionNestedOuterOverride = obd.buildDiagnosticScanSession({
  session_id: "shop-test-scan-session-outer-priority",
  protocol: "ISO9141-2",
  captured_at: "2026-06-28T00:18:00Z",
  vehicle_profile: { maker: "Toyota", model: "Allion" },
  vehicle_applicability: vehicleApplicabilityPartialSample,
  readout_coverage: legacyReadoutCoverage,
  ecu_info_snapshot: outerOverrideEcuInfoSnapshot,
  scan_session: bridgeExportPayload.session,
  sessionId: "shop-test-scan-session-outer-override"
});
check(scanSessionNestedOuterOverride.sessionId === "shop-test-scan-session-outer-priority", "Diagnostic scan session did not let outer session_id override scan_session alias input");
check(scanSessionNestedOuterOverride.protocol === "ISO9141-2", "Diagnostic scan session did not let outer protocol override scan_session alias input");
check(scanSessionNestedOuterOverride.capturedAt === "2026-06-28T00:18:00Z", "Diagnostic scan session did not let outer captured_at override scan_session alias input");
check(scanSessionNestedOuterOverride.vehicleProfile?.model === "Allion", "Diagnostic scan session did not let outer vehicle_profile override scan_session alias input");
check(scanSessionNestedOuterOverride.vehicleApplicability?.status === "partial", "Diagnostic scan session did not let outer vehicle_applicability override scan_session alias input");
check(scanSessionNestedOuterOverride.readoutCoverage?.capturedPercent === 29, "Diagnostic scan session did not let outer readout_coverage override scan_session alias input");
check(scanSessionNestedOuterOverride.ecuInfoSnapshot?.items?.[0]?.value === "Outer Override ECU", "Diagnostic scan session did not let outer ecu_info_snapshot override scan_session alias input");

if (failures.length) {
  failures.forEach((failure) => console.error(`ERROR: ${failure}`));
  process.exitCode = 1;
} else {
  console.log("OBD read-only safety checks: 720");
  console.log("Errors: 0");
}
