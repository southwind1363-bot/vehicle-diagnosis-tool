const THEME_KEY = "vehicle-diagnosis-theme";
const CASES_KEY = "vehicle-diagnosis-cases-v1";
const NOTICE_KEY = "vehicle-diagnosis-notice-accepted-v1";
const OBD_ACCESS_MODE_KEY = "vehicle-diagnosis-obd-access-v1";
const OBD_ACCESS_PASSWORD_HASH = "ff61c820434cfe58f495f0688990b3c02c12120bb1bd4d167d92f88b3de0d7e0";
const OBD_DEV_MODE_KEY = "vehicle-diagnosis-obd-dev-mode-v1";
const OBD_DEV_TOKEN_KEY = "vehicle-diagnosis-obd-dev-token-v1";
const OBD_LOCAL_BRIDGE_PORTS = [8765, 17653];
const OBD_LOCAL_BRIDGE_PATHS = ["/v1/bridge", "/v1/request", "/v1"];
const BRIDGE_BACKED_INTERFACE_IDS = Object.freeze([
  "user-vci-thinkcar-bluetooth",
  "user-vci-techstream-j2534",
  "user-vci-rcmall-mks-canable-v2-pro"
]);
const INTERFACE_CANDIDATE_DISPLAY_NAMES = Object.freeze({
  "user-vci-thinkcar-bluetooth": "THINKCAR系候補",
  "user-vci-techstream-j2534": "J2534候補",
  "user-vci-rcmall-mks-canable-v2-pro": "CANable候補"
});
const BRIDGE_BACKED_IMPLEMENTATION_CHECK_BUILDERS = Object.freeze({
  "user-vci-techstream-j2534": (item) => [
    {
      label: "VCI列挙表示",
      available: hasBridgeVciSupport()
    },
    {
      label: "アダプター識別",
      available: hasBridgeAdapterIdentitySupport()
    },
    {
      label: "実機読取",
      available: item.connectionEnabled === true
    }
  ],
  "user-vci-thinkcar-bluetooth": (item) => [
    {
      label: "VCI列挙表示",
      available: hasBridgeVciSupport()
    },
    {
      label: "Bluetooth読取取込",
      available: hasBridgeBluetoothImportSupport()
    },
    {
      label: "実機読取",
      available: item.connectionEnabled === true
    }
  ],
  "user-vci-rcmall-mks-canable-v2-pro": (item) => [
    {
      label: "VCI列挙表示",
      available: hasBridgeVciSupport()
    },
    {
      label: "CAN系読取取込の器",
      available: hasBridgeDiagnosticImportSupport()
    },
    {
      label: "実機読取",
      available: item.connectionEnabled === true
    }
  ]
});
const ELM327_IMPLEMENTATION_CHECK_LABELS = Object.freeze({
  webSerial: "Web Serial準備",
  standardRead: "標準OBD読取要求",
  liveConnection: "実機読取"
});
const OEM_SCANNER_TOOL_HINTS = new Set(["Techstream", "CONSULT", "HDS", "IDS"]);

function hasBridgeAdapterIdentitySupport() {
  return typeof window.ObdReadOnly?.normalizeBridgeAdapterIdentity === "function";
}

function hasBridgeDiagnosticImportSupport() {
  return typeof window.ObdReadOnly?.buildBridgeDiagnosticImport === "function";
}

function hasBridgeDiagnosticImportTopLevelSessionSupport() {
  if (!hasBridgeDiagnosticImportSupport()) return false;
  const snapshot = window.ObdReadOnly.buildBridgeDiagnosticImport({
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
      data: { items: [{ deviceId: "compat-vci", name: "Compat VCI", isConnected: true }], selectedVciId: "compat-vci" }
    },
    adapter_identity: {
      ok: true,
      blocked: false,
      would_transmit: false,
      data: { adapter: "Compat Adapter", family: "elm327", version: "1.0" }
    }
  });
  return snapshot?.connectionStatus?.vehicleConnected === true
    && Array.isArray(snapshot?.vciDevices) && snapshot.vciDevices[0]?.id === "compat-vci"
    && snapshot?.adapterIdentity?.adapterFamily === "elm327";
}

function hasBridgeLivePidSupport() {
  return typeof window.ObdReadOnly?.normalizeBridgeLivePidSnapshot === "function";
}

function hasBridgeFreezeFrameSupport() {
  return typeof window.ObdReadOnly?.normalizeBridgeFreezeFrameSnapshot === "function";
}

function hasBridgeDtcSupport() {
  return typeof window.ObdReadOnly?.normalizeBridgeDtcSnapshot === "function";
}

function hasBridgeEcuInfoSupport() {
  return typeof window.ObdReadOnly?.normalizeBridgeEcuInfoSnapshot === "function";
}

function hasBridgeConnectionStatusSupport() {
  return typeof window.ObdReadOnly?.normalizeBridgeConnectionStatus === "function";
}

function hasBridgeSupportedPidSupport() {
  return typeof window.ObdReadOnly?.normalizeBridgeSupportedPidSnapshot === "function";
}

function hasBridgeVciSupport() {
  return typeof window.ObdReadOnly?.normalizeBridgeVciList === "function";
}

function hasBridgeIntentModel(intentId, schemaIntents, allowedReadIntents, supportCheck) {
  return allowedReadIntents.has(intentId) && schemaIntents.has(intentId) && supportCheck();
}

function hasBridgeReadinessSupport() {
  return typeof window.ObdReadOnly?.normalizeBridgeReadinessSnapshot === "function";
}

function hasBridgeOnboardMonitorSupport() {
  return typeof window.ObdReadOnly?.normalizeBridgeOnboardMonitorSnapshot === "function";
}

function hasBridgeSessionSummarySupport() {
  return typeof window.ObdReadOnly?.buildBridgeSessionSummary === "function";
}

function hasBridgeSessionExportSupport() {
  return typeof window.ObdReadOnly?.buildBridgeSessionExportPayload === "function";
}

function hasBridgeMergeDiagnosticInputsSupport() {
  return typeof window.ObdReadOnly?.mergeDiagnosticInputs === "function";
}

function hasBridgeDiagnosticImportPipelineSupport() {
  return hasBridgeSessionSummarySupport()
    && hasBridgeSessionExportSupport()
    && hasBridgeDiagnosticImportSupport();
}

function hasBridgeBluetoothImportSupport() {
  return hasBridgeDiagnosticImportSupport()
    && hasBridgeLivePidSupport()
    && hasBridgeFreezeFrameSupport();
}

function hasBridgeReadNormalizationSupport() {
  return hasBridgeDtcSupport()
    && hasBridgeLivePidSupport()
    && hasBridgeFreezeFrameSupport()
    && hasBridgeEcuInfoSupport();
}

const OBD_INTERFACE_PROGRESS = Object.freeze({
  web_serial_obd: Object.freeze({
    progressPercent: 61,
    currentBasis: "Web Serial と ELM327 系の読取モデル、PID 辞書、フリーズフレーム整形まで実装済み。",
    nextBuild: "実アダプター差分、初期化手順、貼り付け結果との比較を詰める。",
    etaTarget: "2026-Q3 前半見込み"
  }),
  local_bridge: Object.freeze({
    progressPercent: 52,
    currentBasis: "ブラウザからローカルブリッジの状態確認、読取応答整形、セッション統合まで実装済み。",
    nextBuild: "J2534 / CANable / THINKCAR の実機読取差分と読取応答の差分吸収を進める。",
    etaTarget: "2026-Q3 見込み"
  }),
  j2534_passthru: Object.freeze({
    progressPercent: 36,
    currentBasis: "read-only 受け口と候補整理まで完了。DLL 実機読取は未着手。",
    nextBuild: "DLL ローダー、読取確認、読取応答の正規化を追加する。",
    etaTarget: "2026-Q3 見込み"
  }),
  uds_canfd: Object.freeze({
    progressPercent: 24,
    currentBasis: "UDS / CAN FD の対象範囲と安全境界を整理済み。実 transport は未実装。",
    nextBuild: "read-only DID / ECU 情報の応答モデルとログ整形を先に固める。",
    etaTarget: "2026-Q4 見込み"
  }),
  doip: Object.freeze({
    progressPercent: 16,
    currentBasis: "対象レイヤーと前提条件の整理段階。読取基盤は未着手。",
    nextBuild: "ローカルブリッジ経由の読取確認と UDS over IP の読取モデルを準備する。",
    etaTarget: "2026-Q4 以降見込み"
  }),
  vci_sdk: Object.freeze({
    progressPercent: 12,
    currentBasis: "候補管理と安全境界の整理段階。SDK 連携は未実装。",
    nextBuild: "対象 SDK の選定、導入条件、read-only ラッパー設計を進める。",
    etaTarget: "2026-Q4 以降見込み"
  })
});
const OBD_INTERFACE_PROGRESS_BY_CATALOG_ID = Object.freeze({
  "user-vci-elm327": "web_serial_obd",
  "user-vci-techstream-j2534": "j2534_passthru",
  "user-vci-thinkcar-bluetooth": "local_bridge",
  "user-vci-rcmall-mks-canable-v2-pro": "uds_canfd"
});
const APP_VERSION = "2.353.0";
const APP_LAST_UPDATED = "2026-07-04";
const OFFLINE_ASSET_MANIFEST = "offline-assets.json";
const MY_GPT_URL = "https://chatgpt.com/g/g-6a0a54ba861481919e63d5e2b4bbbe8b-zheng-bei-xiang-tan-yong-gpt";
const NO_DATA = "登録データなし";
const MANUAL_VEHICLE_VALUE = "__manual__";

const fallbackData = {
  obdCodes: [
    {
      code: "P0171",
      title: "System Too Lean Bank 1",
      faultSystem: "燃料補正・リーン系統 バンク1",
      firstChecks: ["吸気漏れを確認する。", "燃料トリムとMAF値を確認する。", "燃圧を確認する。"],
      commonCauses: ["二次空気吸い込み", "燃圧不足", "MAFセンサー汚れ", "排気漏れ"],
      prematureConclusionWarning: "O2センサーがリーンを検出しているだけの場合があります。O2センサー不良と即断しないでください。",
      manualRequired: true,
      confidence: "中",
      safetyTags: [],
      sources: ["SAE J2012 / ISO 15031-6系の汎用DTC定義", "登録データ: obd-codes.json"]
    },
    {
      code: "P0300",
      title: "Random/Multiple Cylinder Misfire Detected",
      faultSystem: "ランダム・複数気筒失火",
      firstChecks: ["フリーズフレームを確認する。", "失火カウンターを確認する。", "点火、燃料、吸気、圧縮の順に切り分ける。"],
      commonCauses: ["スパークプラグ劣化", "イグニッションコイル不良", "吸気漏れ", "燃圧不足", "圧縮低下"],
      prematureConclusionWarning: "複数気筒失火は単体コイルだけでなく、燃料や吸気など共通原因も疑ってください。",
      manualRequired: true,
      confidence: "中",
      safetyTags: ["fuel"],
      sources: ["SAE J2012 / ISO 15031-6系の汎用DTC定義", "登録データ: obd-codes.json"]
    },
    {
      code: "P0420",
      title: "Catalyst System Efficiency Below Threshold Bank 1",
      faultSystem: "触媒効率低下 バンク1",
      firstChecks: ["排気漏れを確認する。", "失火履歴を確認する。", "O2センサー前後波形と燃料トリムを確認する。"],
      commonCauses: ["触媒劣化", "排気漏れ", "O2センサー劣化", "失火や燃調異常による触媒損傷"],
      prematureConclusionWarning: "触媒不良と即断しないでください。失火、燃調異常、排気漏れが先にある場合があります。",
      manualRequired: true,
      confidence: "中",
      safetyTags: [],
      sources: ["SAE J2012 / ISO 15031-6系の汎用DTC定義", "登録データ: obd-codes.json"]
    }
  ],
  serviceNotes: [],
  genericObdCodesModern: [],
  vehiclePatterns: [],
  vehicleInputOptions: [],
  vehicleModelCatalogDomestic2004To2026: [],
  vehicleModelCatalogDomestic2026: [],
  vehicleYearRangesDomestic2026: [],
  recallsTsbNotes: [],
  japanObdInspectionNotes: [],
  realWorldCases: [],
  diagnosticWorkflows: [],
  diagnosticCapabilityStatus: [],
  diagnosticCoverageRoadmap: [],
  dtcScopeRules: [],
  symptomFlows: [
    makeFlow("engine-no-start", "エンジン始動不良", "始動系、電源系、燃料系、点火系、吸気系", ["バッテリー電圧", "クランキング回転数", "燃圧", "点火信号", "DTCとフリーズフレーム"], ["battery", "starter", "fuel", "ignition"]),
    makeFlow("idle-unstable", "アイドリング不調", "吸気系、燃料補正、点火系、EGR、機械圧縮", ["燃料トリム", "MAF値", "失火カウンター", "吸気漏れ", "アイドル学習値"], ["intake", "fuel", "ignition"]),
    makeFlow("acceleration-poor", "加速不良", "燃料系、吸気系、排気詰まり、点火系、変速系", ["燃圧", "MAF値", "スロットル開度", "失火カウンター", "排気背圧"], ["fuel", "intake", "exhaust"]),
    makeFlow("check-engine", "チェックランプ点灯", "DTCにより異なる", ["DTC", "フリーズフレーム", "同時コード", "レディネス状態"], []),
    makeFlow("abnormal-noise", "異音", "回転部、ベルト、足回り、排気、エンジン内部", ["発生条件", "回転数", "車速", "負荷", "音の発生位置"], []),
    makeFlow("brake-abnormal", "ブレーキ異常", "ブレーキ液圧、摩耗、漏れ、ABS系統", ["ブレーキ液量", "漏れ", "パッド残量", "ローター状態", "ABS DTC"], ["brake"]),
    makeFlow("electrical-trouble", "電装系トラブル", "12V電源、充電系、アース、ヒューズ、通信系、高電圧系", ["12V電圧", "充電電圧", "暗電流", "ヒューズ", "アース電圧降下", "通信DTC"], ["highVoltage"])
  ]
};

const form = document.querySelector("#diagnosisForm");
const aiButton = document.querySelector("#aiButton");
const resetButton = document.querySelector("#resetButton");
const themeButton = document.querySelector("#themeButton");
const dataStatus = document.querySelector("#dataStatus");
const symptomSelect = document.querySelector("#symptomSelect");
const vehicleInput = document.querySelector("#vehicle");
const vehicleMakerSelect = document.querySelector("#vehicleMaker");
const vehicleModelSelect = document.querySelector("#vehicleModel");
const vehicleModelCodeSelect = document.querySelector("#vehicleModelCode");
const vehicleEngineCodeSelect = document.querySelector("#vehicleEngineCode");
const vehicleYearSelect = document.querySelector("#vehicleYear");
const vehicleYearManualInput = document.querySelector("#vehicleYearManual");
const vehicleManualInput = document.querySelector("#vehicleManual");
const vehicleSelectionSummary = document.querySelector("#vehicleSelectionSummary");
const obdVehicleInput = document.querySelector("#obdVehicle");
const obdVehicleMakerSelect = document.querySelector("#obdVehicleMaker");
const obdVehicleModelSelect = document.querySelector("#obdVehicleModel");
const obdVehicleModelCodeSelect = document.querySelector("#obdVehicleModelCode");
const obdVehicleEngineCodeSelect = document.querySelector("#obdVehicleEngineCode");
const obdVehicleYearSelect = document.querySelector("#obdVehicleYear");
const obdVehicleYearManualInput = document.querySelector("#obdVehicleYearManual");
const obdVehicleManualInput = document.querySelector("#obdVehicleManual");
const obdVehicleSelectionSummary = document.querySelector("#obdVehicleSelectionSummary");
const obdAvailableReadoutSummary = document.querySelector("#obdAvailableReadoutSummary");
const obdInterfaceSelect = document.querySelector("#obdInterfaceSelect");
const obdUseDiagnosisVehicleButton = document.querySelector("#obdUseDiagnosisVehicleButton");
const obdPreviewSelectedButton = document.querySelector("#obdPreviewSelectedButton");
const obdPrepareSelectedButton = document.querySelector("#obdPrepareSelectedButton");
const obdConnectionGuide = document.querySelector("#obdConnectionGuide");
const emptyState = document.querySelector("#emptyState");
const resultContent = document.querySelector("#resultContent");
const flowView = document.querySelector("#flowView");
const flowChart = document.querySelector("#flowChart");
const resultViewButtons = document.querySelectorAll("[data-result-view]");
const safetyPanel = document.querySelector("#safetyPanel");
const safetyText = document.querySelector("#safetyText");
const confidenceBadge = document.querySelector("#confidenceBadge");

const factList = document.querySelector("#factList");
const interviewList = document.querySelector("#interviewList");
const guessList = document.querySelector("#guessList");
const aiStatus = document.querySelector("#aiStatus");
const aiList = document.querySelector("#aiList");
const copyToast = document.querySelector("#copyToast");
const priorityCheckList = document.querySelector("#priorityCheckList");
const nextLookText = document.querySelector("#nextLookText");
const quickMeasurementText = document.querySelector("#quickMeasurementText");
const quickMistakeText = document.querySelector("#quickMistakeText");
const quickSafetyText = document.querySelector("#quickSafetyText");
const diagnosisSummaryList = document.querySelector("#diagnosisSummaryList");
const modernGenericList = document.querySelector("#modernGenericList");
const vehiclePatternList = document.querySelector("#vehiclePatternList");
const recallTsbList = document.querySelector("#recallTsbList");
const japanInspectionList = document.querySelector("#japanInspectionList");
const realWorldCaseList = document.querySelector("#realWorldCaseList");
const dataGapList = document.querySelector("#dataGapList");
const checkOrderList = document.querySelector("#checkOrderList");
const measurementList = document.querySelector("#measurementList");
const liveDataGuideList = document.querySelector("#liveDataGuideList");
const branchList = document.querySelector("#branchList");
const cautionList = document.querySelector("#cautionList");
const partsCheckList = document.querySelector("#partsCheckList");
const safetyList = document.querySelector("#safetyList");
const customerList = document.querySelector("#customerList");
const sourceList = document.querySelector("#sourceList");
const confidenceList = document.querySelector("#confidenceList");
const caseForm = document.querySelector("#caseForm");
const caseResetButton = document.querySelector("#caseResetButton");
const caseSearch = document.querySelector("#caseSearch");
const caseList = document.querySelector("#caseList");
const similarCases = document.querySelector("#similarCases");
const exportCsvButton = document.querySelector("#exportCsvButton");
const exportJsonButton = document.querySelector("#exportJsonButton");
const importJsonInput = document.querySelector("#importJsonInput");
const caseStatus = document.querySelector("#caseStatus");
const caseQualityScore = document.querySelector("#caseQualityScore");
const caseQualityIssues = document.querySelector("#caseQualityIssues");
const appVersion = document.querySelector("#appVersion");
const lastUpdated = document.querySelector("#lastUpdated");
const seedDummyButton = document.querySelector("#seedDummyButton");
const runSelfTestButton = document.querySelector("#runSelfTestButton");
const clearStorageButton = document.querySelector("#clearStorageButton");
const opsResultList = document.querySelector("#opsResultList");
const obdCapabilityBadge = document.querySelector("#obdCapabilityBadge");
const obdCapabilityText = document.querySelector("#obdCapabilityText");
const obdSetupPanel = document.querySelector("#obdSetupPanel");
const obdAccessProtected = document.querySelector("#obdAccessProtected");
const obdAccessPasswordInput = document.querySelector("#obdAccessPasswordInput");
const obdAccessUnlockButton = document.querySelector("#obdAccessUnlockButton");
const obdAccessLockButton = document.querySelector("#obdAccessLockButton");
const obdAccessModeBadge = document.querySelector("#obdAccessModeBadge");
const obdAccessStatus = document.querySelector("#obdAccessStatus");
const obdProgressGrid = document.querySelector(".obd-progress-grid");
const obdWorkflowGuide = document.querySelector("#obdWorkflowGuide");
const obdOperationGrid = document.querySelector("#obdOperationGrid");
const obdConnectionProfile = document.querySelector("#obdConnectionProfile");
const obdPreparedRequestGrid = document.querySelector("#obdPreparedRequestGrid");
const obdInterfaceRoadmapGrid = document.querySelector("#obdInterfaceRoadmapGrid");
const obdCapabilityStatusGrid = document.querySelector("#obdCapabilityStatusGrid");
const obdCoverageRoadmapGrid = document.querySelector("#obdCoverageRoadmapGrid");
const obdBridgeContractGrid = document.querySelector("#obdBridgeContractGrid");
const obdBridgeSchemaGrid = document.querySelector("#obdBridgeSchemaGrid");
const obdInterlockSummary = document.querySelector("#obdInterlockSummary");
const obdInterlockChecklist = document.querySelector("#obdInterlockChecklist");
const obdDevConnectionState = document.querySelector("#obdDevConnectionState");
const obdDevConnectButton = document.querySelector("#obdDevConnectButton");
const obdPreviewElm327Button = document.querySelector("#obdPreviewElm327Button");
const obdPreviewThinkcarButton = document.querySelector("#obdPreviewThinkcarButton");
const obdPreviewJ2534Button = document.querySelector("#obdPreviewJ2534Button");
const obdScrollTargetButtons = document.querySelectorAll("[data-obd-scroll-target]");
const obdPreviewStatus = document.querySelector("#obdPreviewStatus");
const obdPreviewGuide = document.querySelector("#obdPreviewGuide");
const obdDevPasswordInput = document.querySelector("#obdDevPasswordInput");
const obdDevBaudRate = document.querySelector("#obdDevBaudRate");
const obdDevUnlockButton = document.querySelector("#obdDevUnlockButton");
const obdDevLockButton = document.querySelector("#obdDevLockButton");
const obdDevModeBadge = document.querySelector("#obdDevModeBadge");
const obdDevControls = document.querySelector("#obdDevControls");
const obdDevIdentifyButton = document.querySelector("#obdDevIdentifyButton");
const obdDevReadDtcButton = document.querySelector("#obdDevReadDtcButton");
const obdDevSnapshotButton = document.querySelector("#obdDevSnapshotButton");
const obdDevBridgeStatusButton = document.querySelector("#obdDevBridgeStatusButton");
const obdDevBridgeVciButton = document.querySelector("#obdDevBridgeVciButton");
const obdDevBridgeDtcButton = document.querySelector("#obdDevBridgeDtcButton");
const obdDevBridgePendingDtcButton = document.querySelector("#obdDevBridgePendingDtcButton");
const obdDevBridgePermanentDtcButton = document.querySelector("#obdDevBridgePermanentDtcButton");
const obdDevBridgeEcuInfoButton = document.querySelector("#obdDevBridgeEcuInfoButton");
const obdDevBridgeMonitorButton = document.querySelector("#obdDevBridgeMonitorButton");
const obdDevBridgeSupportedPidButton = document.querySelector("#obdDevBridgeSupportedPidButton");
const obdDevBridgeFreezeFrameButton = document.querySelector("#obdDevBridgeFreezeFrameButton");
const obdDevBridgeLiveButton = document.querySelector("#obdDevBridgeLiveButton");
const obdDevDisconnectButton = document.querySelector("#obdDevDisconnectButton");
const obdDevStatus = document.querySelector("#obdDevStatus");
const obdDevSessionSummary = document.querySelector("#obdDevSessionSummary");
const obdDevSessionDetails = document.querySelector("#obdDevSessionDetails");
const obdScannerText = document.querySelector("#obdScannerText");
const obdAnalyzeButton = document.querySelector("#obdAnalyzeButton");
const obdSampleButton = document.querySelector("#obdSampleButton");
const obdImportClearButton = document.querySelector("#obdImportClearButton");
const obdImportStatus = document.querySelector("#obdImportStatus");
const obdImportToolHints = document.querySelector("#obdImportToolHints");
const obdDetectedCodes = document.querySelector("#obdDetectedCodes");
const obdMonitorStatus = document.querySelector("#obdMonitorStatus");
const obdMonitorCount = document.querySelector("#obdMonitorCount");
const obdMonitorGrid = document.querySelector("#obdMonitorGrid");
const obdMonitorInsightList = document.querySelector("#obdMonitorInsightList");
const noticeModal = document.querySelector("#noticeModal");
const noticeCloseButton = document.querySelector("#noticeCloseButton");
const mobileGptModal = document.querySelector("#mobileGptModal");
const mobileGptOpenButton = document.querySelector("#mobileGptOpenButton");
const mobileGptCloseButton = document.querySelector("#mobileGptCloseButton");
const tabButtons = document.querySelectorAll("[data-tab-target]");
const tabPanels = document.querySelectorAll("[data-tab-panel]");

let dataStore = fallbackData;
let savedCases = loadCases();
let copyToastTimer = null;
let activeResultView = "flow";
let obdAccessUnlocked = sessionStorage.getItem(OBD_ACCESS_MODE_KEY) === "enabled";
let obdDevModeUnlocked = sessionStorage.getItem(OBD_DEV_MODE_KEY) === "enabled";
const obdDevSession = {
  port: null,
  reader: null,
  writer: null,
  decoder: null,
  encoder: null,
  textBuffer: "",
  readLoopActive: false,
  lastRawText: "",
  connectedAt: null,
  bridgeEndpoint: null,
  bridgeStatus: null,
  bridgeVciList: null,
  adapterIdentity: null,
  lastSession: null,
  previewMode: null,
  requestedInterfaceId: null,
  selectedPidList: ["010C", "0105", "010D", "0104", "010B", "0110", "0111", "0106", "0107", "0142"]
};

appVersion.textContent = APP_VERSION;
lastUpdated.textContent = APP_LAST_UPDATED;
applyTheme(localStorage.getItem(THEME_KEY) || "light");
setDefaultCaseDate();
loadData();
renderCases();
renderSimilarCases();
updateCaseQualityPreview();
showInitialNotice();
updateAiButtonLabel();
initializeObdReadOnlyPanel();
registerOfflineCache();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  renderDiagnosis(buildDiagnosis(getInput()));
});

resultViewButtons.forEach((button) => {
  button.addEventListener("click", () => setResultView(button.dataset.resultView));
});

aiButton.addEventListener("click", sendToExternalGpt);
window.addEventListener("resize", () => {
  updateAiButtonLabel();
  if (!isMobileDevice()) {
    hideMobileGptModal();
  }
});

resetButton.addEventListener("click", () => {
  form.reset();
  resetVehicleSelector();
  hideResult();
});

vehicleMakerSelect.addEventListener("change", renderVehicleModelOptions);
vehicleModelSelect.addEventListener("change", renderVehicleDetailOptions);
vehicleModelCodeSelect.addEventListener("change", () => {
  vehicleYearManualInput.value = "";
  renderVehicleYearOptions();
});
vehicleYearSelect.addEventListener("change", () => {
  updateVehicleYearManualVisibility();
  renderVehicleEngineOptions();
});
[vehicleEngineCodeSelect, vehicleManualInput].forEach((element) => {
  element.addEventListener("input", syncVehicleInput);
  element.addEventListener("change", syncVehicleInput);
});
vehicleYearManualInput.addEventListener("input", () => {
  vehicleYearManualInput.value = vehicleYearManualInput.value.replace(/\D/g, "").slice(0, 4);
  renderVehicleEngineOptions();
});
obdVehicleMakerSelect?.addEventListener("change", renderObdVehicleModelOptions);
obdVehicleModelSelect?.addEventListener("change", renderObdVehicleDetailOptions);
obdVehicleModelCodeSelect?.addEventListener("change", () => {
  obdVehicleYearManualInput.value = "";
  renderObdVehicleYearOptions();
});
obdVehicleYearSelect?.addEventListener("change", () => {
  updateObdVehicleYearManualVisibility();
  renderObdVehicleEngineOptions();
});
[obdVehicleEngineCodeSelect, obdVehicleManualInput, obdInterfaceSelect].forEach((element) => {
  element?.addEventListener("change", syncObdVehicleInput);
  element?.addEventListener("input", syncObdVehicleInput);
});
obdVehicleYearManualInput?.addEventListener("input", () => {
  obdVehicleYearManualInput.value = obdVehicleYearManualInput.value.replace(/\D/g, "").slice(0, 4);
  renderObdVehicleEngineOptions();
});
obdUseDiagnosisVehicleButton?.addEventListener("click", applyDiagnosisVehicleToObdSetup);
obdPreviewSelectedButton?.addEventListener("click", previewSelectedObdInterface);
obdPrepareSelectedButton?.addEventListener("click", prepareSelectedObdInterface);

caseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveCase();
});

caseResetButton.addEventListener("click", () => {
  caseForm.reset();
  setDefaultCaseDate();
  updateCaseQualityPreview();
});

caseSearch.addEventListener("input", renderCases);

exportCsvButton.addEventListener("click", exportCasesCsv);
exportJsonButton.addEventListener("click", exportCasesJson);
importJsonInput.addEventListener("change", importCasesJson);
caseForm.addEventListener("input", updateCaseQualityPreview);
seedDummyButton.addEventListener("click", seedDummyCases);
runSelfTestButton.addEventListener("click", runSelfCheck);
clearStorageButton.addEventListener("click", clearAllLocalStorage);
obdAnalyzeButton.addEventListener("click", analyzeObdScannerImport);
obdSampleButton.addEventListener("click", loadObdMonitorSample);
obdImportClearButton.addEventListener("click", clearObdScannerImport);
obdDetectedCodes.addEventListener("click", handleDetectedDtcClick);
obdAccessUnlockButton.addEventListener("click", unlockObdAccess);
obdAccessLockButton.addEventListener("click", lockObdAccess);
obdAccessPasswordInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  void unlockObdAccess();
});
obdDevUnlockButton.addEventListener("click", unlockObdDeveloperMode);
obdDevLockButton.addEventListener("click", lockObdDeveloperMode);
obdDevConnectButton.addEventListener("click", handleObdPrimaryAction);
obdDevIdentifyButton.addEventListener("click", identifyObdDeveloperVci);
obdDevReadDtcButton.addEventListener("click", readObdDeveloperDtc);
obdDevSnapshotButton.addEventListener("click", readObdDeveloperLiveSnapshot);
obdDevBridgeStatusButton.addEventListener("click", startGeneralBridgeCheck);
obdDevBridgeVciButton.addEventListener("click", listObdLocalBridgeVci);
obdDevBridgeDtcButton.addEventListener("click", readObdLocalBridgeDtc);
obdDevBridgePendingDtcButton.addEventListener("click", readObdLocalBridgePendingDtc);
obdDevBridgePermanentDtcButton.addEventListener("click", readObdLocalBridgePermanentDtc);
obdDevBridgeEcuInfoButton.addEventListener("click", readObdLocalBridgeEcuInfo);
obdDevBridgeMonitorButton.addEventListener("click", readObdLocalBridgeOnboardMonitor);
obdDevBridgeSupportedPidButton.addEventListener("click", readObdLocalBridgeSupportedPids);
obdDevBridgeFreezeFrameButton.addEventListener("click", readObdLocalBridgeFreezeFrame);
obdDevBridgeLiveButton.addEventListener("click", readObdLocalBridgeLiveSnapshot);
obdDevDisconnectButton.addEventListener("click", disconnectObdDeveloperVci);
obdPreviewElm327Button?.addEventListener("click", () => loadObdInterfacePreviewSample("user-vci-elm327"));
obdPreviewThinkcarButton?.addEventListener("click", () => loadObdInterfacePreviewSample("user-vci-thinkcar-bluetooth"));
obdPreviewJ2534Button?.addEventListener("click", () => loadObdInterfacePreviewSample("user-vci-techstream-j2534"));
obdScrollTargetButtons.forEach((button) => button.addEventListener("click", () => scrollToObdSection(button.dataset.obdScrollTarget)));
noticeCloseButton.addEventListener("click", () => {
  localStorage.setItem(NOTICE_KEY, "accepted");
  noticeModal.close();
});

mobileGptOpenButton.addEventListener("click", () => {
  window.open(MY_GPT_URL, "_blank");
});

mobileGptCloseButton.addEventListener("click", () => {
  hideMobileGptModal();
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => activateTab(button.dataset.tabTarget));
});

themeButton.addEventListener("click", () => {
  const nextTheme = document.body.classList.contains("dark") ? "light" : "dark";
  applyTheme(nextTheme);
  localStorage.setItem(THEME_KEY, nextTheme);
});

async function loadData() {
  try {
    const [
      obdCodes,
      serviceNotes,
      symptomFlows,
      genericObdCodesModern,
      genericObdCodesModern2026,
      genericObdCodesModern2026Part2,
      genericObdCodesModern2026Part3,
      genericObdCodesModern2026Part4,
      genericObdCodesModern2026Part5,
      genericObdCodesModern2026Part6,
      genericObdCodesModern2026Part7,
      genericObdCodesModern2026Part8,
      genericObdCodesModern2026Part9,
      genericObdCodesModern2026Part10,
      genericObdCodesModern2026Part11,
      genericObdCodesModern2026Part12,
      genericObdCodesModern2026Part13,
      genericObdCodesModern2026Part14,
      genericObdCodesModern2026Part15,
      genericObdCodesModern2026Part16,
      genericObdCodesModern2026Part17,
      genericObdCodesModern2026Part18,
      genericObdCodesModern2026Part19,
      genericObdCodesModern2026Part20,
      genericObdCodesModern2026Part21,
      genericObdCodesModern2026Part22,
      genericObdCodesModern2026Part23,
      genericObdCodesModern2026Part24,
      genericObdCodesModern2026Part25,
      genericObdCodesModern2026Part26,
      genericObdCodesModern2026Part27,
      genericObdCodesModern2026Part28,
      genericObdCodesModern2026Part29,
      genericObdCodesModern2026Part30,
      genericObdCodesModern2026Part31,
      genericObdCodesModern2026Part32,
      genericObdCodesModern2026Part33,
      genericObdCodesModern2026Part34,
      genericObdCodesModern2026Part35,
      genericObdCodesModern2026Part36,
      genericObdCodesModern2026Part37,
      genericObdCodesModern2026Part38,
      genericObdCodesModern2026Part39,
      genericObdCodesModern2026Part40,
      genericObdCodesModern2026Part41,
      genericObdCodesModern2026Part42,
      genericObdCodesModern2026Part43,
      genericObdCodesModern2026Part44,
      genericObdCodesModern2026Part45,
      genericObdCodesModern2026Part46,
      genericObdCodesModern2026Part47,
      genericObdCodesModern2026Part48,
      genericObdCodesModern2026Part49,
      genericObdCodesModern2026Part50,
      genericObdCodesModern2026Part51,
      genericObdCodesModern2026Part52,
      genericObdCodesModern2026Part53,
      genericObdCodesModern2026Part54,
      genericObdCodesModern2026Part55,
      genericObdCodesModern2026Part56,
      genericObdCodesModern2026Part57,
      genericObdCodesModern2026Part58,
      genericObdCodesModern2026Part59,
      genericObdCodesModern2026Part60,
      genericObdCodesModern2026Part61,
      genericObdCodesModern2026Part62,
      genericObdCodesModern2026Part63,
      genericObdCodesModern2026Part64,
      genericObdCodesModern2026Part65,
      genericObdCodesModern2026Part66,
      genericObdCodesModern2026Part67,
      genericObdCodesModern2026Part68,
      genericObdCodesModern2026Part69,
      genericObdCodesModern2026Part70,
      genericObdCodesModern2026Part71,
      genericObdCodesModern2026Part72,
      genericObdCodesModern2026Part73,
      genericObdCodesModern2026Part74,
      genericObdCodesModern2026Part75,
      genericObdCodesModern2026Part76,
      genericObdCodesModern2026Part77,
      genericObdCodesModern2026Part78,
      genericObdCodesModern2026Part79,
      genericObdCodesModern2026Part80,
      genericObdCodesModern2026Part81,
      genericObdCodesModern2026Part82,
      genericObdCodesModern2026Part83,
      genericObdCodesModern2026Part84,
      genericObdCodesModern2026Part85,
      genericObdCodesModern2026Part86,
      genericObdCodesModern2026Part87,
      genericObdCodesModern2026Part88,
      genericObdCodesModern2026Part89,
      genericObdCodesModern2026Part90,
      genericObdCodesModern2026Part91,
      genericObdCodesModern2026Part92,
      genericObdCodesModern2026Part93,
      genericObdCodesModern2026Part94,
      genericObdCodesModern2026Part95,
      genericObdCodesModern2026Part96,
      genericObdCodesModern2026Part97,
      genericObdCodesModern2026Part98,
      genericObdCodesModern2026Part99,
      genericObdCodesModern2026Part100,
      genericObdCodesModern2026Part101,
      genericObdCodesModern2026Part102,
      genericObdCodesModern2026Part103,
      genericObdCodesModern2026Part104,
      genericObdCodesModern2026Part105,
      genericObdCodesModern2026Part106,
      genericObdCodesModern2026Part107,
      genericObdCodesModern2026Part108,
      genericObdCodesModern2026Part109,
      genericObdCodesModern2026Part110,
      genericObdCodesModern2026Part111,
      genericObdCodesModern2026Part112,
      genericObdCodesModern2026Part113,
      genericObdCodesModern2026Part114,
      genericObdCodesModern2026Part115,
      genericObdCodesModern2026Part116,
      genericObdCodesModern2026Part117,
      genericObdCodesModern2026Part118,
      genericObdCodesModern2026Part119,
      genericObdCodesModern2026Part120,
      genericObdCodesModern2026Part121,
      genericObdCodesModern2026Part122,
      genericObdCodesModern2026Part123,
      genericObdCodesModern2026Part124,
      genericObdCodesModern2026Part125,
      genericObdCodesModern2026Part126,
      genericObdCodesModern2026Part127,
      genericObdCodesModern2026Part128,
      genericObdCodesModern2026Part129,
      genericObdCodesModern2026Part130,
      genericObdCodesModern2026Part131,
      genericObdCodesModern2026Part132,
      genericObdCodesModern2026Part133,
      genericObdCodesModern2026Part134,
      genericObdCodesModern2026Part135,
      genericObdCodesModern2026Part136,
      genericObdCodesModern2026Part137,
      genericObdCodesModern2026Part138,
      genericObdCodesModern2026Part139,
      genericObdCodesModern2026Part140,
      genericObdCodesModern2026Part141,
      genericObdCodesModern2026Part142,
      genericObdCodesModern2026Part143,
      genericObdCodesModern2026Part144,
      genericObdCodesModern2026Part145,
      genericObdCodesModern2026Part146,
      genericObdCodesModern2026Part147,
      genericObdCodesModern2026Part148,
      genericObdCodesModern2026Part149,
      genericObdCodesModern2026Part150,
      genericObdCodesModern2026Part151,
      genericObdCodesModern2026Part152,
      genericObdCodesModern2026Part153,
      genericObdCodesModern2026Part154,
      genericObdCodesModern2026Part155,
      genericObdCodesModern2026Part156,
      genericObdCodesModern2026Part157,
      genericObdCodesModern2026Part158,
      genericObdCodesModern2026Part159,
      genericObdCodesModern2026Part160,
      genericObdCodesModern2026Part161,
      genericObdCodesModern2026Part162,
      genericObdCodesModern2026Part163,
      genericObdCodesModern2026Part164,
      genericObdCodesModern2026Part165,
      genericObdCodesModern2026Part166,
      genericObdCodesModern2026Part167,
      importedVerifiedDtc,
      vehiclePatterns,
      vehiclePatternsDomestic2026,
      vehicleInputOptions,
      vehicleModelCatalogDomestic2004To2026,
      vehicleModelCatalogDomestic2026,
      vehicleYearRangesDomestic2026,
      recallsTsbNotes,
      officialReferenceNotes2026,
      japanObdInspectionNotes,
      japanObdInspectionNotes2026,
      realWorldCases,
      diagnosticWorkflows,
      diagnosticWorkflowsPractical2026,
      componentInspectionFlows,
      componentInspectionFlowsExam2026,
      componentInspectionFlowsExam2026Part2,
      dtcFamilyWorkflows2026,
      dtcScopeRules,
      obdMonitorDefinitions,
      obdFreezeFrameItems2026,
      obdReadinessMonitors2026,
      obdEcuInfoItems2026,
      vehicleInterfaceCatalog2026,
      diagnosticCapabilityStatus2026,
      diagnosticCoverageRoadmap2026
    ] = await Promise.all([
      fetchJson("data/obd-codes.json"),
      fetchJson("data/service-notes.json"),
      fetchJson("data/symptom-flows.json"),
      fetchJson("data/generic-obd-codes-modern.json"),
      fetchJson("data/generic-obd-codes-modern-2026.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part2.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part3.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part4.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part5.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part6.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part7.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part8.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part9.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part10.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part11.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part12.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part13.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part14.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part15.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part16.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part17.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part18.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part19.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part20.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part21.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part22.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part23.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part24.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part25.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part26.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part27.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part28.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part29.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part30.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part31.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part32.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part33.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part34.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part35.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part36.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part37.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part38.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part39.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part40.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part41.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part42.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part43.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part44.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part45.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part46.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part47.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part48.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part49.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part50.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part51.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part52.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part53.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part54.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part55.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part56.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part57.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part58.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part59.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part60.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part61.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part62.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part63.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part64.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part65.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part66.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part67.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part68.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part69.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part70.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part71.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part72.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part73.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part74.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part75.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part76.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part77.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part78.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part79.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part80.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part81.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part82.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part83.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part84.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part85.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part86.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part87.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part88.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part89.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part90.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part91.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part92.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part93.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part94.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part95.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part96.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part97.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part98.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part99.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part100.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part101.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part102.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part103.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part104.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part105.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part106.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part107.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part108.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part109.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part110.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part111.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part112.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part113.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part114.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part115.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part116.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part117.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part118.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part119.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part120.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part121.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part122.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part123.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part124.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part125.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part126.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part127.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part128.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part129.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part130.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part131.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part132.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part133.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part134.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part135.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part136.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part137.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part138.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part139.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part140.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part141.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part142.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part143.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part144.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part145.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part146.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part147.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part148.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part149.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part150.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part151.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part152.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part153.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part154.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part155.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part156.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part157.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part158.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part159.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part160.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part161.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part162.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part163.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part164.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part165.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part166.json"),
      fetchJson("data/generic-obd-codes-modern-2026-part167.json"),
      fetchJson("data/imported-verified-dtc.json"),
      fetchJson("data/vehicle-patterns.json"),
      fetchJson("data/vehicle-patterns-domestic-2026.json"),
      fetchJson("data/vehicle-input-options.json"),
      fetchJson("data/vehicle-model-catalog-domestic-2004-2026.json"),
      fetchJson("data/vehicle-model-catalog-domestic-2026.json"),
      fetchJson("data/vehicle-year-ranges-domestic-2026.json"),
      fetchJson("data/recalls-tsb-notes.json"),
      fetchJson("data/official-reference-notes-2026.json"),
      fetchJson("data/japan-obd-inspection-notes.json"),
      fetchJson("data/japan-obd-inspection-notes-2026.json"),
      fetchJson("data/real-world-cases.json"),
      fetchJson("data/diagnostic-workflows.json"),
      fetchJson("data/diagnostic-workflows-practical-2026.json"),
      fetchJson("data/component-inspection-flows.json"),
      fetchJson("data/component-inspection-flows-exam-2026.json"),
      fetchJson("data/component-inspection-flows-exam-2026-part2.json"),
      fetchJson("data/dtc-family-workflows-2026.json"),
      fetchJson("data/dtc-scope-rules.json"),
      fetchJson("data/obd-monitor-definitions.json"),
      fetchJson("data/obd-freeze-frame-items-2026.json"),
      fetchJson("data/obd-readiness-monitors-2026.json"),
      fetchJson("data/obd-ecu-info-items-2026.json"),
      fetchJson("data/vehicle-interface-catalog-2026.json"),
      fetchJson("data/diagnostic-capability-status-2026.json"),
      fetchJson("data/diagnostic-coverage-roadmap-2026.json")
    ]);

    if (!window.ObdReadOnly?.configureMonitorDefinitions(obdMonitorDefinitions)) {
      throw new Error("OBDデータモニター辞書を読み込めません");
    }
    if (!window.ObdReadOnly?.configureFreezeFrameItems(obdFreezeFrameItems2026)) {
      throw new Error("OBDフリーズフレーム項目辞書を読み込めません");
    }
    if (!window.ObdReadOnly?.configureReadinessMonitors(obdReadinessMonitors2026)) {
      throw new Error("OBDレディネスモニター辞書を読み込めません");
    }
    if (!window.ObdReadOnly?.configureEcuInfoItems(obdEcuInfoItems2026)) {
      throw new Error("OBD ECU情報項目辞書を読み込めません");
    }
    if (!window.ObdReadOnly?.configureVehicleInterfaceCatalog(vehicleInterfaceCatalog2026)) {
      throw new Error("VCI候補カタログを読み込めません");
    }

    dataStore = {
      obdCodes,
      serviceNotes,
      symptomFlows,
      genericObdCodesModern: [...genericObdCodesModern, ...genericObdCodesModern2026, ...genericObdCodesModern2026Part2, ...genericObdCodesModern2026Part3, ...genericObdCodesModern2026Part4, ...genericObdCodesModern2026Part5, ...genericObdCodesModern2026Part6, ...genericObdCodesModern2026Part7, ...genericObdCodesModern2026Part8, ...genericObdCodesModern2026Part9, ...genericObdCodesModern2026Part10, ...genericObdCodesModern2026Part11, ...genericObdCodesModern2026Part12, ...genericObdCodesModern2026Part13, ...genericObdCodesModern2026Part14, ...genericObdCodesModern2026Part15, ...genericObdCodesModern2026Part16, ...genericObdCodesModern2026Part17, ...genericObdCodesModern2026Part18, ...genericObdCodesModern2026Part19, ...genericObdCodesModern2026Part20, ...genericObdCodesModern2026Part21, ...genericObdCodesModern2026Part22, ...genericObdCodesModern2026Part23, ...genericObdCodesModern2026Part24, ...genericObdCodesModern2026Part25, ...genericObdCodesModern2026Part26, ...genericObdCodesModern2026Part27, ...genericObdCodesModern2026Part28, ...genericObdCodesModern2026Part29, ...genericObdCodesModern2026Part30, ...genericObdCodesModern2026Part31, ...genericObdCodesModern2026Part32, ...genericObdCodesModern2026Part33, ...genericObdCodesModern2026Part34, ...genericObdCodesModern2026Part35, ...genericObdCodesModern2026Part36, ...genericObdCodesModern2026Part37, ...genericObdCodesModern2026Part38, ...genericObdCodesModern2026Part39, ...genericObdCodesModern2026Part40, ...genericObdCodesModern2026Part41, ...genericObdCodesModern2026Part42, ...genericObdCodesModern2026Part43, ...genericObdCodesModern2026Part44, ...genericObdCodesModern2026Part45, ...genericObdCodesModern2026Part46, ...genericObdCodesModern2026Part47, ...genericObdCodesModern2026Part48, ...genericObdCodesModern2026Part49, ...genericObdCodesModern2026Part50, ...genericObdCodesModern2026Part51, ...genericObdCodesModern2026Part52, ...genericObdCodesModern2026Part53, ...genericObdCodesModern2026Part54, ...genericObdCodesModern2026Part55, ...genericObdCodesModern2026Part56, ...genericObdCodesModern2026Part57, ...genericObdCodesModern2026Part58, ...genericObdCodesModern2026Part59, ...genericObdCodesModern2026Part60, ...genericObdCodesModern2026Part61, ...genericObdCodesModern2026Part62, ...genericObdCodesModern2026Part63, ...genericObdCodesModern2026Part64, ...genericObdCodesModern2026Part65, ...genericObdCodesModern2026Part66, ...genericObdCodesModern2026Part67, ...genericObdCodesModern2026Part68, ...genericObdCodesModern2026Part69, ...genericObdCodesModern2026Part70, ...genericObdCodesModern2026Part71, ...genericObdCodesModern2026Part72, ...genericObdCodesModern2026Part73, ...genericObdCodesModern2026Part74, ...genericObdCodesModern2026Part75, ...genericObdCodesModern2026Part76, ...genericObdCodesModern2026Part77, ...genericObdCodesModern2026Part78, ...genericObdCodesModern2026Part79, ...genericObdCodesModern2026Part80, ...genericObdCodesModern2026Part81, ...genericObdCodesModern2026Part82, ...genericObdCodesModern2026Part83, ...genericObdCodesModern2026Part84, ...genericObdCodesModern2026Part85, ...genericObdCodesModern2026Part86, ...genericObdCodesModern2026Part87, ...genericObdCodesModern2026Part88, ...genericObdCodesModern2026Part89, ...genericObdCodesModern2026Part90, ...genericObdCodesModern2026Part91, ...genericObdCodesModern2026Part92, ...genericObdCodesModern2026Part93, ...genericObdCodesModern2026Part94, ...genericObdCodesModern2026Part95, ...genericObdCodesModern2026Part96, ...genericObdCodesModern2026Part97, ...genericObdCodesModern2026Part98, ...genericObdCodesModern2026Part99, ...genericObdCodesModern2026Part100, ...genericObdCodesModern2026Part101, ...genericObdCodesModern2026Part102, ...genericObdCodesModern2026Part103, ...genericObdCodesModern2026Part104, ...genericObdCodesModern2026Part105, ...genericObdCodesModern2026Part106, ...genericObdCodesModern2026Part107, ...genericObdCodesModern2026Part108, ...genericObdCodesModern2026Part109, ...genericObdCodesModern2026Part110, ...genericObdCodesModern2026Part111, ...genericObdCodesModern2026Part112, ...genericObdCodesModern2026Part113, ...genericObdCodesModern2026Part114, ...genericObdCodesModern2026Part115, ...genericObdCodesModern2026Part116, ...genericObdCodesModern2026Part117, ...genericObdCodesModern2026Part118, ...genericObdCodesModern2026Part119, ...genericObdCodesModern2026Part120, ...genericObdCodesModern2026Part121, ...genericObdCodesModern2026Part122, ...genericObdCodesModern2026Part123, ...genericObdCodesModern2026Part124, ...genericObdCodesModern2026Part125, ...genericObdCodesModern2026Part126, ...genericObdCodesModern2026Part127, ...genericObdCodesModern2026Part128, ...genericObdCodesModern2026Part129, ...genericObdCodesModern2026Part130, ...genericObdCodesModern2026Part131, ...genericObdCodesModern2026Part132, ...genericObdCodesModern2026Part133, ...genericObdCodesModern2026Part134, ...genericObdCodesModern2026Part135, ...genericObdCodesModern2026Part136, ...genericObdCodesModern2026Part137, ...genericObdCodesModern2026Part138, ...genericObdCodesModern2026Part139, ...genericObdCodesModern2026Part140, ...genericObdCodesModern2026Part141, ...genericObdCodesModern2026Part142, ...genericObdCodesModern2026Part143, ...genericObdCodesModern2026Part144, ...genericObdCodesModern2026Part145, ...genericObdCodesModern2026Part146, ...genericObdCodesModern2026Part147, ...genericObdCodesModern2026Part148, ...genericObdCodesModern2026Part149, ...genericObdCodesModern2026Part150, ...genericObdCodesModern2026Part151, ...genericObdCodesModern2026Part152, ...genericObdCodesModern2026Part153, ...genericObdCodesModern2026Part154, ...genericObdCodesModern2026Part155, ...genericObdCodesModern2026Part156, ...genericObdCodesModern2026Part157, ...genericObdCodesModern2026Part158, ...genericObdCodesModern2026Part159, ...genericObdCodesModern2026Part160, ...genericObdCodesModern2026Part161, ...genericObdCodesModern2026Part162, ...genericObdCodesModern2026Part163, ...genericObdCodesModern2026Part164, ...genericObdCodesModern2026Part165, ...genericObdCodesModern2026Part166, ...genericObdCodesModern2026Part167, ...importedVerifiedDtc],
      vehiclePatterns: [...vehiclePatterns, ...vehiclePatternsDomestic2026],
      vehicleInputOptions: mergeVehicleInputOptions(
        vehicleInputOptions,
        expandVehicleModelCatalog(vehicleModelCatalogDomestic2004To2026),
        expandVehicleModelCatalog(vehicleModelCatalogDomestic2026)
      ),
      vehicleModelCatalogDomestic2004To2026,
      vehicleModelCatalogDomestic2026,
      vehicleYearRangesDomestic2026,
      recallsTsbNotes: [...recallsTsbNotes, ...officialReferenceNotes2026],
      japanObdInspectionNotes: [...japanObdInspectionNotes, ...japanObdInspectionNotes2026],
      realWorldCases,
      diagnosticWorkflows: [...diagnosticWorkflows, ...diagnosticWorkflowsPractical2026, ...componentInspectionFlows, ...componentInspectionFlowsExam2026, ...componentInspectionFlowsExam2026Part2, ...dtcFamilyWorkflows2026],
      diagnosticCapabilityStatus: diagnosticCapabilityStatus2026,
      diagnosticCoverageRoadmap: diagnosticCoverageRoadmap2026,
      dtcScopeRules,
      obdMonitorDefinitions,
      obdFreezeFrameItems2026,
      obdReadinessMonitors2026,
      obdEcuInfoItems2026,
      vehicleInterfaceCatalog2026
    };
    dataStatus.textContent = `登録済み整備データを読み込みました。車種候補 ${countVehicleModels(dataStore.vehicleInputOptions)}件 / 詳細候補 ${countVehicleDetailOptions(dataStore.vehicleInputOptions)}件 / 年式範囲 ${dataStore.vehicleYearRangesDomestic2026.length}件。`;
    dataStatus.classList.remove("error");
  } catch (error) {
    dataStore = fallbackData;
    dataStatus.textContent = "JSON読込不可のため、内蔵サンプルデータで動作中です。ローカルサーバーで開くと data フォルダのJSONを参照します。";
    dataStatus.classList.add("error");
  }

  initializeObdReadOnlyPanel();
  renderSymptomOptions();
  renderVehicleMakerOptions();
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} を読み込めません`);
  return response.json();
}

async function registerOfflineCache() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

  try {
    const registration = await navigator.serviceWorker.register("service-worker.js");
    const response = await fetch(OFFLINE_ASSET_MANIFEST, { cache: "no-store" });
    if (!response.ok) return;

    const payload = await response.json();
    const urls = Array.isArray(payload.assets) ? payload.assets : [];
    if (!urls.length) return;

    const postCacheMessage = () => {
      const worker = registration.active || registration.waiting || registration.installing;
      worker?.postMessage({ type: "PRECACHE_URLS", urls });
    };

    if (registration.installing) {
      registration.installing.addEventListener("statechange", postCacheMessage);
    }
    postCacheMessage();
  } catch (_) {
    // Offline support is best-effort and should never block diagnosis assistance.
  }
}

function activateTab(targetId) {
  if (!targetId) return;

  tabPanels.forEach((panel) => {
    const active = panel.id === targetId;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });

  tabButtons.forEach((button) => {
    const active = button.dataset.tabTarget === targetId;
    if (button.classList.contains("tab-button")) {
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    }
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderSymptomOptions() {
  const currentValue = symptomSelect.value;
  symptomSelect.innerHTML = '<option value="">選択してください</option>';

  dataStore.symptomFlows.forEach((flow) => {
    const option = document.createElement("option");
    option.value = flow.id;
    option.textContent = flow.symptomName;
    symptomSelect.appendChild(option);
  });

  symptomSelect.value = currentValue;
}

function renderVehicleMakerOptions() {
  const currentValue = vehicleMakerSelect.value;
  const makers = collectUnique(dataStore.vehicleInputOptions.map((item) => item.maker)).sort((a, b) => a.localeCompare(b, "ja"));

  replaceSelectOptions(vehicleMakerSelect, "選択してください", makers);
  appendSelectOption(vehicleMakerSelect, MANUAL_VEHICLE_VALUE, "その他 / 手入力");
  vehicleMakerSelect.value = makers.includes(currentValue) || currentValue === MANUAL_VEHICLE_VALUE ? currentValue : "";
  renderVehicleModelOptions();
}

function expandVehicleModelCatalog(catalog) {
  return catalog.flatMap((group) => (group.models || []).map((model) => ({
    maker: group.maker,
    model,
    model_codes: [],
    engine_codes: [],
    source: group.source,
    source_url: group.source_url,
    source_date: group.source_date,
    detail_confirmation_required: true
  })));
}

function mergeVehicleInputOptions(...groups) {
  const merged = new Map();

  groups.flat().forEach((row) => {
    const key = `${row.maker}::${row.model || ""}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, row);
      return;
    }

    merged.set(key, {
      ...row,
      ...existing,
      source_url: existing.source_url || row.source_url,
      model_codes: collectUnique([...(existing.model_codes || []), ...(row.model_codes || [])]),
      engine_codes: collectUnique([...(existing.engine_codes || []), ...(row.engine_codes || [])])
    });
  });

  return [...merged.values()];
}

function countVehicleModels(options) {
  return collectUnique(options.filter((item) => item.model).map((item) => `${item.maker}::${item.model}`)).length;
}

function countVehicleDetailOptions(options) {
  return options.filter((item) => item.model && item.model_codes.length).length;
}

function renderVehicleModelOptions() {
  const maker = vehicleMakerSelect.value;
  const rows = dataStore.vehicleInputOptions.filter((item) => item.maker === maker && item.model);
  const models = collectUnique(rows.map((item) => item.model)).sort((a, b) => a.localeCompare(b, "ja"));

  replaceSelectOptions(vehicleModelSelect, maker ? "選択してください" : "先にメーカーを選択", models);
  if (maker) appendSelectOption(vehicleModelSelect, MANUAL_VEHICLE_VALUE, "一覧にない車種 / 手入力");
  vehicleModelSelect.disabled = !maker || maker === MANUAL_VEHICLE_VALUE;
  renderVehicleDetailOptions();
}

function renderVehicleDetailOptions() {
  const row = getSelectedVehicleOption();
  const hasSelectedModel = Boolean(vehicleModelSelect.value);
  const modelCodes = row?.model_codes || [];
  vehicleYearManualInput.value = "";

  replaceSelectOptions(vehicleModelCodeSelect, hasSelectedModel ? "選択してください" : "先に車種を選択", modelCodes);
  if (hasSelectedModel) {
    appendSelectOption(vehicleModelCodeSelect, MANUAL_VEHICLE_VALUE, "一覧にない型式 / 手入力");
  }
  vehicleModelCodeSelect.disabled = !hasSelectedModel;
  renderVehicleYearOptions();
}

function getSelectedVehicleOption() {
  return dataStore.vehicleInputOptions.find((item) => item.maker === vehicleMakerSelect.value && item.model === vehicleModelSelect.value) || null;
}

function renderVehicleYearOptions() {
  const hasSelectedModel = Boolean(vehicleModelSelect.value);
  const matches = getSelectedVehicleYearRanges();
  const years = collectUnique(matches.flatMap(toYearOptions)).sort((a, b) => Number(b) - Number(a));

  replaceSelectOptions(vehicleYearSelect, years.length ? "選択してください" : "登録期間なし / 手入力してください", years);
  if (years.length) appendSelectOption(vehicleYearSelect, MANUAL_VEHICLE_VALUE, "一覧にない年式 / 手入力");
  vehicleYearSelect.disabled = !hasSelectedModel || !years.length;
  updateVehicleYearManualVisibility();
  renderVehicleEngineOptions();
}

function getSelectedVehicleYearRanges() {
  const selectedCode = selectedVehicleValue(vehicleModelCodeSelect);
  return dataStore.vehicleYearRangesDomestic2026.filter((item) => {
    if (item.maker !== vehicleMakerSelect.value || item.model !== vehicleModelSelect.value) return false;
    return !selectedCode || item.model_codes.includes(selectedCode);
  });
}

function getApplicableVehicleYearRanges() {
  const selectedYear = Number(selectedVehicleValue(vehicleYearSelect) || vehicleYearManualInput.value);
  return getSelectedVehicleYearRanges().filter((item) => {
    if (!selectedYear) return true;
    const yearTo = item.year_to || item.verified_through_year;
    return item.year_from <= selectedYear && selectedYear <= yearTo;
  });
}

function renderVehicleEngineOptions() {
  const row = getSelectedVehicleOption();
  const hasSelectedModel = Boolean(vehicleModelSelect.value);
  const narrowedEngineCodes = collectUnique(getApplicableVehicleYearRanges().flatMap((item) => item.engine_codes || []));
  const engineCodes = narrowedEngineCodes.length ? narrowedEngineCodes : (row?.engine_codes || []);

  replaceSelectOptions(vehicleEngineCodeSelect, hasSelectedModel ? "選択してください" : "先に車種を選択", engineCodes);
  if (hasSelectedModel) {
    appendSelectOption(vehicleEngineCodeSelect, MANUAL_VEHICLE_VALUE, "一覧にないエンジン型式 / 手入力");
  }
  vehicleEngineCodeSelect.disabled = !hasSelectedModel;
  syncVehicleInput();
}

function toYearOptions(range) {
  const yearTo = range.year_to || range.verified_through_year;
  const years = [];
  for (let year = range.year_from; year <= yearTo; year += 1) years.push(String(year));
  return years;
}

function updateVehicleYearManualVisibility() {
  const needsManualYear = !vehicleYearSelect.disabled && vehicleYearSelect.value === MANUAL_VEHICLE_VALUE;
  const hasNoRegisteredYears = Boolean(vehicleModelSelect.value) && vehicleYearSelect.disabled;
  vehicleYearManualInput.hidden = !(needsManualYear || hasNoRegisteredYears);
}

function replaceSelectOptions(select, placeholder, values) {
  select.innerHTML = "";
  appendSelectOption(select, "", placeholder);
  values.forEach((value) => appendSelectOption(select, value, value));
}

function appendSelectOption(select, value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.appendChild(option);
}

function syncVehicleInput() {
  const values = [
    ["車両", selectedVehicle],
    ["方式", selectedInterface],
    selectedVehicleValue(vehicleMakerSelect),
    selectedVehicleValue(vehicleModelSelect),
    selectedVehicleValue(vehicleModelCodeSelect),
    selectedVehicleYear(),
    selectedVehicleValue(vehicleEngineCodeSelect),
    vehicleManualInput.value.trim()
  ];
  vehicleInput.value = collectUnique(values).join(" ");
  vehicleSelectionSummary.textContent = vehicleInput.value ? `車種情報: ${vehicleInput.value}` : "車種情報: 未選択";
}

function selectedVehicleYear() {
  const year = selectedVehicleValue(vehicleYearSelect) || vehicleYearManualInput.value.trim();
  return year ? `${year}年式` : "";
}

function selectedVehicleValue(select) {
  return select.value && select.value !== MANUAL_VEHICLE_VALUE ? select.value : "";
}

function resetVehicleSelector() {
  vehicleModelSelect.disabled = true;
  vehicleModelCodeSelect.disabled = true;
  vehicleYearSelect.disabled = true;
  vehicleEngineCodeSelect.disabled = true;
  replaceSelectOptions(vehicleModelSelect, "先にメーカーを選択", []);
  replaceSelectOptions(vehicleModelCodeSelect, "先に車種を選択", []);
  replaceSelectOptions(vehicleYearSelect, "先に車種を選択", []);
  replaceSelectOptions(vehicleEngineCodeSelect, "先に車種を選択", []);
  vehicleYearManualInput.hidden = true;
  syncVehicleInput();
}

function getVehicleMakers() {
  return collectUnique(dataStore.vehicleInputOptions.map((item) => item.maker)).sort((a, b) => a.localeCompare(b, "ja"));
}

function findVehicleOption(maker, model) {
  return dataStore.vehicleInputOptions.find((item) => item.maker === maker && item.model === model) || null;
}

function findVehicleYearRanges(maker, model, selectedCode = "") {
  return dataStore.vehicleYearRangesDomestic2026.filter((item) => {
    if (item.maker !== maker || item.model !== model) return false;
    return !selectedCode || item.model_codes.includes(selectedCode);
  });
}

function findApplicableVehicleYearRanges(maker, model, selectedCode = "", selectedYear = "") {
  const numericYear = Number(selectedYear);
  return findVehicleYearRanges(maker, model, selectedCode).filter((item) => {
    if (!numericYear) return true;
    const yearTo = item.year_to || item.verified_through_year;
    return item.year_from <= numericYear && numericYear <= yearTo;
  });
}

function syncVehicleSelectionSummary(targetInput, targetSummary, values, prefix) {
  targetInput.value = collectUnique(values).join(" ");
  targetSummary.textContent = targetInput.value ? `${prefix}: ${targetInput.value}` : `${prefix}: 未選択`;
}

function renderObdVehicleMakerOptions() {
  const currentValue = obdVehicleMakerSelect.value;
  const makers = getVehicleMakers();
  replaceSelectOptions(obdVehicleMakerSelect, "選択してください", makers);
  appendSelectOption(obdVehicleMakerSelect, MANUAL_VEHICLE_VALUE, "その他 / 手入力");
  obdVehicleMakerSelect.value = makers.includes(currentValue) || currentValue === MANUAL_VEHICLE_VALUE ? currentValue : "";
  renderObdVehicleModelOptions();
}

function renderObdVehicleModelOptions() {
  const maker = obdVehicleMakerSelect.value;
  const rows = dataStore.vehicleInputOptions.filter((item) => item.maker === maker && item.model);
  const models = collectUnique(rows.map((item) => item.model)).sort((a, b) => a.localeCompare(b, "ja"));
  replaceSelectOptions(obdVehicleModelSelect, maker ? "選択してください" : "先にメーカーを選択", models);
  if (maker) appendSelectOption(obdVehicleModelSelect, MANUAL_VEHICLE_VALUE, "一覧にない車種 / 手入力");
  obdVehicleModelSelect.disabled = !maker || maker === MANUAL_VEHICLE_VALUE;
  renderObdVehicleDetailOptions();
}

function renderObdVehicleDetailOptions() {
  const row = findVehicleOption(obdVehicleMakerSelect.value, obdVehicleModelSelect.value);
  const hasSelectedModel = Boolean(obdVehicleModelSelect.value);
  const modelCodes = row?.model_codes || [];
  obdVehicleYearManualInput.value = "";
  replaceSelectOptions(obdVehicleModelCodeSelect, hasSelectedModel ? "選択してください" : "先に車種を選択", modelCodes);
  if (hasSelectedModel) appendSelectOption(obdVehicleModelCodeSelect, MANUAL_VEHICLE_VALUE, "一覧にない型式 / 手入力");
  obdVehicleModelCodeSelect.disabled = !hasSelectedModel;
  renderObdVehicleYearOptions();
}

function renderObdVehicleYearOptions() {
  const hasSelectedModel = Boolean(obdVehicleModelSelect.value);
  const selectedCode = selectedVehicleValue(obdVehicleModelCodeSelect);
  const years = collectUnique(findVehicleYearRanges(obdVehicleMakerSelect.value, obdVehicleModelSelect.value, selectedCode).flatMap(toYearOptions))
    .sort((a, b) => Number(b) - Number(a));
  replaceSelectOptions(obdVehicleYearSelect, years.length ? "選択してください" : "登録期間なし / 手入力してください", years);
  if (years.length) appendSelectOption(obdVehicleYearSelect, MANUAL_VEHICLE_VALUE, "一覧にない年式 / 手入力");
  obdVehicleYearSelect.disabled = !hasSelectedModel || !years.length;
  updateObdVehicleYearManualVisibility();
  renderObdVehicleEngineOptions();
}

function updateObdVehicleYearManualVisibility() {
  const needsManualYear = !obdVehicleYearSelect.disabled && obdVehicleYearSelect.value === MANUAL_VEHICLE_VALUE;
  const hasNoRegisteredYears = Boolean(obdVehicleModelSelect.value) && obdVehicleYearSelect.disabled;
  obdVehicleYearManualInput.hidden = !(needsManualYear || hasNoRegisteredYears);
}

function renderObdVehicleEngineOptions() {
  const row = findVehicleOption(obdVehicleMakerSelect.value, obdVehicleModelSelect.value);
  const hasSelectedModel = Boolean(obdVehicleModelSelect.value);
  const narrowedEngineCodes = collectUnique(
    findApplicableVehicleYearRanges(
      obdVehicleMakerSelect.value,
      obdVehicleModelSelect.value,
      selectedVehicleValue(obdVehicleModelCodeSelect),
      selectedVehicleValue(obdVehicleYearSelect) || obdVehicleYearManualInput.value
    ).flatMap((item) => item.engine_codes || [])
  );
  const engineCodes = narrowedEngineCodes.length ? narrowedEngineCodes : (row?.engine_codes || []);
  replaceSelectOptions(obdVehicleEngineCodeSelect, hasSelectedModel ? "選択してください" : "先に車種を選択", engineCodes);
  if (hasSelectedModel) appendSelectOption(obdVehicleEngineCodeSelect, MANUAL_VEHICLE_VALUE, "一覧にないエンジン型式 / 手入力");
  obdVehicleEngineCodeSelect.disabled = !hasSelectedModel;
  syncObdVehicleInput();
}

function selectedObdVehicleYear() {
  const year = selectedVehicleValue(obdVehicleYearSelect) || obdVehicleYearManualInput.value.trim();
  return year ? `${year}年式` : "";
}

function syncObdVehicleInput() {
  const values = [
    selectedVehicleValue(obdVehicleMakerSelect),
    selectedVehicleValue(obdVehicleModelSelect),
    selectedVehicleValue(obdVehicleModelCodeSelect),
    selectedObdVehicleYear(),
    selectedVehicleValue(obdVehicleEngineCodeSelect),
    obdVehicleManualInput.value.trim()
  ];
  syncVehicleSelectionSummary(obdVehicleInput, obdVehicleSelectionSummary, values, "OBD車両情報");
  renderObdConnectionGuide();
}

function resetObdVehicleSelector() {
  obdVehicleModelSelect.disabled = true;
  obdVehicleModelCodeSelect.disabled = true;
  obdVehicleYearSelect.disabled = true;
  obdVehicleEngineCodeSelect.disabled = true;
  replaceSelectOptions(obdVehicleModelSelect, "先にメーカーを選択", []);
  replaceSelectOptions(obdVehicleModelCodeSelect, "先に車種を選択", []);
  replaceSelectOptions(obdVehicleYearSelect, "先に車種を選択", []);
  replaceSelectOptions(obdVehicleEngineCodeSelect, "先に車種を選択", []);
  obdVehicleYearManualInput.hidden = true;
  syncObdVehicleInput();
}

function getSelectedObdInterfaceLabel() {
  const requestedInterfaceId = obdInterfaceSelect.value || "";
  const resolvedInterfaceId = resolveObdInterfaceId();
  const label = {
    "user-vci-elm327": "Web Serial / ELM327（必須）",
    "user-vci-thinkcar-bluetooth": "THINKCAR Bluetooth",
    "user-vci-techstream-j2534": "J2534 Pass-Thru（必須）",
    "user-vci-rcmall-mks-canable-v2-pro": "CANable候補"
  }[resolvedInterfaceId] || "未選択";
  return requestedInterfaceId === "auto" ? `${label}（自動判定）` : label;
}

function resolveObdInterfaceId(capability = window.ObdReadOnly?.getCapability?.()) {
  const requestedInterfaceId = obdInterfaceSelect.value || "";
  if (requestedInterfaceId && requestedInterfaceId !== "auto") return requestedInterfaceId;
  const serialReady = capability?.secureContext === true && capability?.webSerialSupported === true;
  if (isMobileDevice()) return "user-vci-thinkcar-bluetooth";
  if (serialReady) return "user-vci-elm327";
  return "user-vci-techstream-j2534";
}

function isObdInterfaceAutoRequested() {
  return (obdInterfaceSelect.value || "") === "auto";
}

function getObdInterfaceSelectionNote(capability = window.ObdReadOnly?.getCapability?.()) {
  if (!isObdInterfaceAutoRequested()) return "手動選択";
  const serialReady = capability?.secureContext === true && capability?.webSerialSupported === true;
  if (isMobileDevice()) return "自動判定: スマホのため Bluetooth 系を優先";
  if (serialReady) return "自動判定: Web Serial 対応のため ELM327 を優先";
  return "自動判定: Web Serial 非対応のため J2534 を優先";
}

function getObdInterfaceStrategyNote(interfaceId) {
  if (interfaceId === "user-vci-elm327") return "必須ルート。最小構成の実車読取入口で、複数VCI対応の基準動作として使います。";
  if (interfaceId === "user-vci-techstream-j2534") return "必須ルート。G-scan/AUTEL級に近づけるためPC系VCIの主経路として優先します。";
  return {
    "user-vci-elm327": "最小構成の実車読取入口。複数VCI対応の基準動作として使います。",
    "user-vci-thinkcar-bluetooth": "スマホBT系候補。単体読取ではなくPCローカルブリッジ連携を前提に育てます。",
    "user-vci-techstream-j2534": "重要ルート。G-scan/AUTEL級に近づけるためPC系VCIの主経路として優先します。",
    "user-vci-rcmall-mks-canable-v2-pro": "CAN系候補。J2534後に読取専用取込の幅を広げる用途です。"
  }[interfaceId] || "複数VCIを選べる前提で、読取専用の安全範囲から順に増やします。";
}

function getObdDevelopmentOperationNote(interfaceId) {
  if (interfaceId === "user-vci-elm327") return "運用: 読取前プレビュー確認 -> Web Serial読取開始 -> DTC/ライブデータ読取 -> OBD側で保存と確認";
  if (interfaceId === "user-vci-techstream-j2534") return "運用: 読取前プレビュー確認 -> J2534ドライバ確認 -> ローカルブリッジ確認 -> 読取専用 DTC/ECU情報から実測";
  return "運用: 読取前プレビュー確認 -> 読取準備 -> 読取専用で取れる項目だけ確認 -> OBD側で保存と確認";
}

function getObdAvailableReadoutNote(interfaceId) {
  return {
    "user-vci-elm327": "現在使える読取: DTC / ライブデータ / フリーズフレーム / 対応PIDの読取前確認、PCではWeb Serial読取へ移行。",
    "user-vci-thinkcar-bluetooth": "現在使える読取: DTC / ライブデータ / ECU情報の読取前確認、読取はスマホBT後にPCローカルブリッジ経由。",
    "user-vci-techstream-j2534": "現在使える読取: DTC / ECU情報 / Mode06 / 対応PIDの読取前確認、読取はPC J2534経由。",
    "user-vci-rcmall-mks-canable-v2-pro": "現在使える読取: CAN系 読取専用応答、対応PID、診断取込の読取前確認。"
  }[interfaceId] || "現在使える読取項目を表示します。";
}

function getObdPrimaryActionLabel(interfaceId, state = {}) {
  if (state.connected) return "読取中";
  if (!state.unlocked) {
    if (interfaceId === "user-vci-elm327") return "ELM327読取を有効化";
    if (interfaceId === "user-vci-techstream-j2534") return "J2534確認を有効化";
    if (interfaceId === "user-vci-thinkcar-bluetooth") return "Bluetooth確認を有効化";
    if (interfaceId === "user-vci-rcmall-mks-canable-v2-pro") return "CAN確認を有効化";
    return "詳細読取を有効化";
  }
  if (interfaceId === "user-vci-elm327") {
    return state.serialReady ? "ELM327読取を開始" : "PCでELM327読取";
  }
  if (interfaceId === "user-vci-techstream-j2534") return "J2534確認を開始";
  if (interfaceId === "user-vci-thinkcar-bluetooth") return "Bluetooth確認を開始";
  if (interfaceId === "user-vci-rcmall-mks-canable-v2-pro") return "CAN確認を開始";
  return "読取確認を開始";
}

function getObdAccessStatusMessage(unlocked, capability = window.ObdReadOnly?.getCapability?.()) {
  const interfaceId = resolveObdInterfaceId(capability);
  const autoPrefix = isObdInterfaceAutoRequested() ? "自動判定: " : "";
  if (!unlocked) {
    return "パスワードを知っている端末だけ、この診断機画面を開けます。";
  }
  if (interfaceId === "user-vci-elm327") {
    return capability?.webSerialSupported
      ? `${autoPrefix}ELM327 を使います。デスクトップ版Chrome系ブラウザから読取を開始できます。`
      : `${autoPrefix}ELM327 を使います。読取はデスクトップ版Chrome系ブラウザから開始します。`;
  }
  if (interfaceId === "user-vci-techstream-j2534") {
    return `${autoPrefix}J2534 を使います。PC側ドライバとローカルブリッジ確認から進めます。`;
  }
  if (interfaceId === "user-vci-thinkcar-bluetooth") {
    return `${autoPrefix}THINKCAR Bluetooth を使います。スマホBT読取後にローカルブリッジ確認へ進めます。`;
  }
  if (interfaceId === "user-vci-rcmall-mks-canable-v2-pro") {
    return `${autoPrefix}CANable 候補を使います。CAN系 読取専用応答確認から進めます。`;
  }
  return "このセッションでは OBD2 読取画面を開いています。";
}

function renderObdSetupActionButtons() {
  if (!obdPreviewSelectedButton || !obdPrepareSelectedButton) return;
  const interfaceId = resolveObdInterfaceId();
  const labels = {
    "user-vci-elm327": {
      preview: "ELM327で読取前プレビュー",
      prepare: "ELM327読取を準備"
    },
    "user-vci-thinkcar-bluetooth": {
      preview: "Bluetoothで読取前プレビュー",
      prepare: "Bluetooth確認を準備"
    },
    "user-vci-techstream-j2534": {
      preview: "J2534で読取前プレビュー",
      prepare: "J2534確認を準備"
    },
    "user-vci-rcmall-mks-canable-v2-pro": {
      preview: "CANで読取前プレビュー",
      prepare: "CAN確認を準備"
    }
  }[interfaceId] || {
    preview: "この設定で読取前プレビュー",
      prepare: "この設定で読取準備"
  };
  obdPreviewSelectedButton.textContent = labels.preview;
  obdPrepareSelectedButton.textContent = labels.prepare;
}

function renderObdConnectionGuide() {
  if (!obdConnectionGuide) return;
  const interfaceId = resolveObdInterfaceId();
  const selectedVehicle = obdVehicleInput.value.trim() || "未選択";
  const lines = {
    "user-vci-elm327": [
      "端末: 読取はデスクトップ版Chrome系ブラウザが必要",
      "読取手順: Web SerialでELM327/STNを選択",
      "安全: DTC / ライブデータ / FFの読取専用のみ"
    ],
    "user-vci-thinkcar-bluetooth": [
      "端末: スマホ単体では表示確認のみ",
      "読取手順: スマホBT読取後にPCローカルブリッジへ流す",
      "安全: DTC / ライブデータ / ECU情報の読取専用確認"
    ],
    "user-vci-techstream-j2534": [
      "端末: PC側ドライバ前提",
      "読取手順: J2534ドライバとローカルブリッジで確認",
      "安全: 読取専用 ECU情報 / DTCから開始"
    ],
    "user-vci-rcmall-mks-canable-v2-pro": [
      "端末: PC側設定前提",
      "読取手順: CANable系をローカルブリッジへ接続",
      "安全: 読取専用診断取込の確認段階"
    ]
  }[interfaceId];
  obdConnectionGuide.innerHTML = "";
  const interfaceStrategyNote = getObdInterfaceStrategyNote(interfaceId);
  [
    ["車両", selectedVehicle],
    ["方式", getSelectedObdInterfaceLabel()],
    ["判定", getObdInterfaceSelectionNote()],
    ["使用", lines[0]],
    ["経路", lines[1]],
    ["安全", lines[2]]
  ].forEach(([label, value]) => {
    const item = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = label;
    item.append(strong, document.createTextNode(value));
    obdConnectionGuide.appendChild(item);
  });
  const strategyItem = document.createElement("span");
  const strategyLabel = document.createElement("strong");
  strategyLabel.textContent = "VCI方針";
  strategyItem.append(strategyLabel, document.createTextNode(interfaceStrategyNote));
  obdConnectionGuide.appendChild(strategyItem);
  const operationItem = document.createElement("span");
  const operationLabel = document.createElement("strong");
  operationLabel.textContent = "現場運用";
  operationItem.append(operationLabel, document.createTextNode(getObdDevelopmentOperationNote(interfaceId)));
  obdConnectionGuide.appendChild(operationItem);
  renderObdAccessGate();
  renderObdSetupActionButtons();
  if (obdAvailableReadoutSummary) {
    obdAvailableReadoutSummary.textContent = `${getSelectedObdInterfaceLabel()}: ${getObdAvailableReadoutNote(interfaceId)}`;
  }
  renderObdPreviewButtons();
  renderObdWorkflowGuide();
}

function scrollToObdSection(targetId) {
  if (!targetId) return;
  const target = document.getElementById(targetId);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderObdPreviewButtons() {
  const selectedInterfaceId = resolveObdInterfaceId();
  const previewInterfaceId = obdDevSession.previewMode || "";
  [
    [obdPreviewElm327Button, "user-vci-elm327"],
    [obdPreviewThinkcarButton, "user-vci-thinkcar-bluetooth"],
    [obdPreviewJ2534Button, "user-vci-techstream-j2534"]
  ].forEach(([button, interfaceId]) => {
    if (!button) return;
    const selected = selectedInterfaceId === interfaceId;
    const active = previewInterfaceId === interfaceId;
    button.classList.toggle("is-selected", selected);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderObdWorkflowGuide(capability = window.ObdReadOnly?.getCapability?.()) {
  if (!obdWorkflowGuide) return;
  const selectedVehicle = obdVehicleInput.value.trim() || "OBD側で車両選択";
  const selectedInterface = getSelectedObdInterfaceLabel();
  const selectedInterfaceId = resolveObdInterfaceId(capability);
  const serialReady = capability?.secureContext === true && capability?.webSerialSupported === true;
  const previewActive = Boolean(obdDevSession.previewMode);
  const connected = Boolean(obdDevSession.port);
  const bridgeReady = Boolean(obdDevSession.bridgeEndpoint);
  const detailUnlocked = obdDevModeUnlocked === true;
  const currentState = connected
    ? "実車読取中"
    : bridgeReady
      ? "読取基盤確認済み"
      : previewActive
        ? "読取前プレビュー確認中"
        : "読取前設定済み";
  let nextAction = "読取前プレビューか読取確認を開始";
  if (!obdVehicleInput.value.trim()) {
    nextAction = "OBD側で車両情報を選択";
  } else if (connected) {
    nextAction = "故障コード、ライブデータ、フリーズフレームを順に確認";
  } else if (bridgeReady) {
    nextAction = selectedInterfaceId === "user-vci-techstream-j2534"
      ? "VCI一覧、アダプター識別、ECU情報を確認"
      : selectedInterfaceId === "user-vci-thinkcar-bluetooth"
        ? "VCI一覧、DTC、ライブデータを確認"
        : "VCI一覧、ECU情報、ライブデータを確認";
  } else if (selectedInterfaceId === "user-vci-elm327" && !serialReady) {
    nextAction = "デスクトップ版Chrome系ブラウザでWeb Serial読取を開始";
  } else if (selectedInterfaceId === "user-vci-thinkcar-bluetooth") {
    nextAction = detailUnlocked
      ? "スマホでBluetooth読取後にローカルブリッジ確認"
      : "必要なら詳細トークンを入れてBluetooth確認を有効化";
  } else if (selectedInterfaceId === "user-vci-techstream-j2534") {
    nextAction = detailUnlocked
      ? "PCでJ2534ドライバ確認後にローカルブリッジ確認"
      : "必要なら詳細トークンを入れてJ2534確認を有効化";
  } else if (!detailUnlocked) {
    nextAction = "必要なら詳細トークンで詳細読取を有効化";
  }
  const readoutPath = connected
    ? "Web Serial読取"
    : bridgeReady
      ? "ローカルブリッジ読取"
      : selectedInterfaceId === "user-vci-thinkcar-bluetooth"
        ? "スマホBT -> ローカルブリッジ読取"
        : selectedInterfaceId === "user-vci-techstream-j2534"
          ? "J2534 -> ローカルブリッジ読取"
          : selectedInterface;
  obdWorkflowGuide.innerHTML = "";
  [
    ["車両", selectedVehicle],
    ["方式", selectedInterface],
    ["現在", currentState],
    ["次の操作", nextAction],
    ["読取経路", readoutPath],
    ["安全", "読取専用のみ。有効化していない送信は開かない"]
  ].forEach(([label, value]) => {
    const item = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = label;
    item.append(strong, document.createTextNode(value));
    obdWorkflowGuide.appendChild(item);
  });
}

function applyDiagnosisVehicleToObdSetup() {
  obdVehicleMakerSelect.value = vehicleMakerSelect.value;
  renderObdVehicleModelOptions();
  obdVehicleModelSelect.value = vehicleModelSelect.value;
  renderObdVehicleDetailOptions();
  obdVehicleModelCodeSelect.value = vehicleModelCodeSelect.value;
  renderObdVehicleYearOptions();
  obdVehicleYearSelect.value = vehicleYearSelect.value;
  obdVehicleYearManualInput.value = vehicleYearManualInput.value;
  updateObdVehicleYearManualVisibility();
  renderObdVehicleEngineOptions();
  obdVehicleEngineCodeSelect.value = vehicleEngineCodeSelect.value;
  obdVehicleManualInput.value = vehicleManualInput.value;
  syncObdVehicleInput();
  if (obdPreviewStatus) obdPreviewStatus.textContent = "診断補助側の車両情報をOBD側へコピーしました。必要ならOBD側で調整してください。";
}

function ensureObdVehicleSelection() {
  if (obdVehicleInput.value.trim()) return true;
  obdVehicleSelectionSummary.textContent = "OBD車両情報: 未選択。パスワード保護されたOBD側で車両を選択してください。";
  if (obdPreviewStatus) obdPreviewStatus.textContent = "OBD車両読取はパスワード保護された独立画面です。先にOBD側の車両情報を選択してください。";
  return false;
}

function previewSelectedObdInterface() {
  if (!ensureObdVehicleSelection()) return;
  clearRequestedInterfaceSelection();
  loadObdInterfacePreviewSample(resolveObdInterfaceId());
  const selectedVehicle = obdVehicleInput.value.trim();
  if (selectedVehicle && obdPreviewStatus) {
    obdPreviewStatus.textContent = `${getSelectedObdInterfaceLabel()} / ${selectedVehicle} の読取前プレビュー中です。`;
  }
}

function prepareSelectedObdInterface() {
  if (!ensureObdVehicleSelection()) return;
  const interfaceId = resolveObdInterfaceId();
  const selectedVehicle = obdVehicleInput.value.trim() || "車両未選択";
  const catalog = window.ObdReadOnly?.getVehicleInterfaceCatalog?.() || [];
  const item = catalog.find((entry) => entry.id === interfaceId);
  if (item && isBridgeBackedInterfaceCandidate(interfaceId)) {
    obdDevStatus.textContent = `${getSelectedObdInterfaceLabel()} / ${selectedVehicle}: 読取準備を開始。次はローカルブリッジ確認です。`;
    startInterfaceCandidateCheck(item);
    return;
  }
  obdDevSession.previewMode = null;
  clearRequestedInterfaceSelection();
  obdDevStatus.textContent = interfaceId === "user-vci-elm327"
    ? `${selectedVehicle} / ELM327: デスクトップ版Chrome系ブラウザで Web Serial 読取を開始。`
    : `${getSelectedObdInterfaceLabel()} / ${selectedVehicle}: 設定を保存。次は読取前プレビューかローカルブリッジ確認です。`;
  renderObdDeveloperGate();
}

function getInput() {
  return {
    vehicle: vehicleInput.value.trim(),
    obdCode: normalizeCode(document.querySelector("#obdCode").value),
    symptomId: symptomSelect.value,
    facts: document.querySelector("#facts").value.trim(),
    interview: getInterviewInput()
  };
}

function buildDiagnosis(input) {
  const obd = findByCode(input.obdCode);
  const flow = findById(dataStore.symptomFlows, input.symptomId);
  const interview = buildInterviewAnalysis(input.interview);
  const modernGenericMatches = getModernGenericMatches(input.obdCode);
  const workflowMatches = getDiagnosticWorkflowMatches(input, flow);
  const modernReferences = buildModernReferences(input, obd, flow, workflowMatches);
  const safetyTags = collectUnique([
    ...(obd?.safetyTags || []),
    ...(flow?.safetyTags || []),
    ...interview.safetyTags,
    ...modernGenericMatches.flatMap(inferSafetyTagsFromModernItem),
    ...workflowMatches.flatMap((item) => item.safety_tags || [])
  ]);
  const confirmationBeforeParts = collectUnique([
    ...(flow?.beforeParts || []),
    ...interview.partsChecks,
    ...workflowMatches.flatMap((item) => item.before_replacement_checks || []),
    obd ? `DTC ${obd.code} のメーカー別診断手順、端子番号、基準値を確認してください。` : ""
  ]);

  return {
    confidence: getConfidence(obd, flow, interview),
    safety: buildSafetyMessage(safetyTags),
    facts: buildFacts(input, obd, flow, interview),
    interview: interview.insights.length ? interview.insights : [NO_DATA],
    guesses: buildGuesses(obd, flow, interview),
    modernReferences,
    quickView: buildQuickView(input, obd, flow, interview, safetyTags, modernGenericMatches, workflowMatches),
    summary: buildDiagnosisSummary(input, obd, flow, interview, modernReferences, safetyTags),
    checkOrder: buildCheckOrder(obd, flow, interview, workflowMatches),
    measurements: buildMeasurements(flow, interview, workflowMatches),
    liveDataGuidance: buildLiveDataGuidance(workflowMatches),
    branches: buildBranches(flow, interview, workflowMatches),
    cautions: buildCautions(obd, flow, confirmationBeforeParts, workflowMatches),
    partsChecks: confirmationBeforeParts.length ? confirmationBeforeParts : [NO_DATA],
    safetyItems: buildSafetyItems(safetyTags),
    customer: buildCustomerExplanation(flow, interview),
    sources: buildSources(obd, flow, workflowMatches),
    confidenceItems: buildConfidenceItems(obd, flow, interview)
  };
}

function getInterviewInput() {
  return {
    since: document.querySelector("#qSince").value.trim(),
    coldOnly: document.querySelector("#qColdOnly").value,
    warm: document.querySelector("#qWarm").value,
    wet: document.querySelector("#qWet").value,
    warningLight: document.querySelector("#qWarningLight").value,
    obdExists: document.querySelector("#qObdExists").value,
    noiseLocation: document.querySelector("#qNoiseLocation").value.trim(),
    frequency: document.querySelector("#qFrequency").value,
    recentParts: document.querySelector("#qRecentParts").value.trim(),
    batteryVoltage: document.querySelector("#qBatteryVoltage").value.trim(),
    cranking: document.querySelector("#qCranking").value,
    drivingCondition: document.querySelector("#qDrivingCondition").value
  };
}

function buildInterviewAnalysis(interview) {
  const facts = [];
  const insights = [];
  const guesses = [];
  const checks = [];
  const measurements = [];
  const normalNext = [];
  const abnormalSuspect = [];
  const partsChecks = [];
  const safetyTags = [];

  addInterviewFact(facts, "いつから症状が出たか", interview.since);
  addInterviewFact(facts, "冷間時だけか", yesNoText(interview.coldOnly));
  addInterviewFact(facts, "暖気後も出るか", yesNoText(interview.warm));
  addInterviewFact(facts, "雨の日や湿気が多い日に出るか", yesNoText(interview.wet));
  addInterviewFact(facts, "警告灯は点灯しているか", yesNoText(interview.warningLight));
  addInterviewFact(facts, "OBD2コードはあるか", yesNoText(interview.obdExists));
  addInterviewFact(facts, "異音はどこから出るか", interview.noiseLocation);
  addInterviewFact(facts, "症状の頻度", frequencyText(interview.frequency));
  addInterviewFact(facts, "最近交換した部品", interview.recentParts);
  addInterviewFact(facts, "バッテリー電圧", interview.batteryVoltage);
  addInterviewFact(facts, "セルの回り方", crankingText(interview.cranking));
  addInterviewFact(facts, "出るタイミング", drivingText(interview.drivingCondition));

  if (interview.coldOnly === "yes") {
    insights.push("冷間時だけ出るため、温度依存のセンサー値、燃料補正、始動増量、点火状態を優先して確認します。");
    checks.push("冷間時のフリーズフレーム、冷却水温、吸気温、燃料トリムを確認する。");
    measurements.push("冷却水温センサー値", "吸気温センサー値", "冷間時燃料トリム");
    abnormalSuspect.push("冷間時だけ異常なら、水温センサー値、吸気温センサー値、点火、燃料補正を疑う。");
  }

  if (interview.warm === "yes") {
    insights.push("暖気後も出るため、冷間補正だけでなく常時条件の異常として確認します。");
    checks.push("暖気後の燃料トリム、失火カウンター、アイドル制御を確認する。");
    normalNext.push("暖気後測定値が正常なら、発生条件の再現と機械的な振動、マウント、負荷変化を確認する。");
  }

  if (interview.wet === "yes") {
    insights.push("雨天や湿気で出るため、点火リーク、コネクタ水入り、アース不良を優先して確認します。");
    guesses.push("湿気による点火リーク、端子接触不良、アース不良の可能性があります。");
    checks.push("点火コイル、プラグホール、コネクタ、アースポイントの水入りや腐食を確認する。");
    partsChecks.push("点火部品を交換する前に、湿気条件でのリーク跡、端子腐食、アース電圧降下を確認する。");
  }

  if (interview.warningLight === "yes" || interview.obdExists === "yes") {
    insights.push("警告灯またはOBD2コードがあるため、コード消去前にDTCとフリーズフレームを保存します。");
    checks.push("DTC、同時コード、フリーズフレーム、レディネス状態を確認する。");
    measurements.push("DTC", "フリーズフレーム", "レディネス状態");
    partsChecks.push("コード名だけで部品を判断せず、メーカー別DTC診断手順を確認する。");
  }

  if (interview.noiseLocation) {
    insights.push(`異音の発生位置は「${interview.noiseLocation}」として整理します。位置、速度、回転数で再現確認します。`);
    checks.push("異音の発生位置、発生速度、発生回転数、制動時変化を確認する。");
    measurements.push("発生車速", "発生回転数", "制動時変化", "旋回時変化");
    safetyTags.push("brake");
  }

  if (interview.frequency === "sometimes" || interview.frequency === "once") {
    insights.push("症状が常時ではないため、再現条件と履歴データの保存を優先します。");
    checks.push("症状が出た日時、気温、路面、負荷、走行状態を記録する。");
    normalNext.push("入庫時に正常なら、履歴コード、フリーズフレーム、再現条件を確認する。");
  }

  if (interview.recentParts) {
    insights.push(`最近交換した部品「${interview.recentParts}」の作業箇所、コネクタ、締付、学習作業を確認します。`);
    checks.push("最近の作業箇所周辺のコネクタ、ホース、締付、学習作業の有無を確認する。");
    partsChecks.push("交換済み部品を再交換する前に、作業箇所周辺の接続、締付、初期化、学習値を確認する。");
  }

  if (interview.batteryVoltage) {
    insights.push(`バッテリー電圧は「${interview.batteryVoltage}」として整理します。測定条件を確認します。`);
    measurements.push("12V静止電圧", "始動時電圧降下", "充電電圧");
    checks.push("測定時の条件、端子緩み、アース電圧降下、充電電圧を確認する。");
  } else {
    measurements.push("12Vバッテリー電圧");
  }

  if (interview.cranking === "slow" || interview.cranking === "none") {
    insights.push("セルの回り方に異常があるため、12V電源、端子、アース、スターター系統を優先します。");
    guesses.push("12V電源低下、端子緩み、アース不良、スターター系統の可能性があります。");
    checks.push("クランキング時電圧降下、スターター信号、アース電圧降下を確認する。");
    abnormalSuspect.push("始動時電圧降下が大きい場合は、バッテリー、端子、アース、スターター系統を疑う。");
  }

  if (interview.drivingCondition) {
    insights.push(`症状の出るタイミングは「${drivingText(interview.drivingCondition)}」として整理します。`);
    checks.push("発生タイミングに合わせて、加速、減速、停車、一定走行で再現確認する。");
  }

  if (interview.drivingCondition === "accel") {
    measurements.push("燃圧", "MAF値", "スロットル開度", "失火カウンター");
    abnormalSuspect.push("加速時だけ異常なら、燃料供給、吸気計測、点火、排気詰まりを疑う。");
    safetyTags.push("fuel");
  }

  if (interview.drivingCondition === "decel") {
    measurements.push("ブレーキ引きずり", "エンジンマウント", "負圧系統", "回生または変速制御");
    abnormalSuspect.push("減速時だけ異常なら、ブレーキ、マウント、変速、負圧系統を確認する。");
    safetyTags.push("brake");
  }

  if (interview.drivingCondition === "stop") {
    measurements.push("アイドル回転数", "燃料トリム", "失火カウンター", "充電電圧");
    abnormalSuspect.push("停車時だけ異常なら、アイドル制御、充電負荷、エンジンマウントを確認する。");
  }

  if (!facts.some((item) => !item.endsWith(NO_DATA))) {
    insights.push(NO_DATA);
  }

  return {
    facts,
    insights: collectUnique(insights),
    guesses: collectUnique(guesses),
    checks: collectUnique(checks),
    measurements: collectUnique(measurements),
    normalNext: collectUnique(normalNext),
    abnormalSuspect: collectUnique(abnormalSuspect),
    partsChecks: collectUnique(partsChecks),
    safetyTags: collectUnique(safetyTags)
  };
}

function addInterviewFact(facts, label, value) {
  facts.push(value ? `${label}: ${value}` : `${label}: ${NO_DATA}`);
}

function yesNoText(value) {
  if (value === "yes") return "はい";
  if (value === "no") return "いいえ";
  return "";
}

function frequencyText(value) {
  const labels = {
    always: "常に出る",
    sometimes: "たまに出る",
    once: "一度だけ"
  };
  return labels[value] || "";
}

function crankingText(value) {
  const labels = {
    normal: "普通に回る",
    slow: "弱い、遅い",
    none: "回らない",
    unknown: "確認していない"
  };
  return labels[value] || "";
}

function drivingText(value) {
  const labels = {
    accel: "加速時",
    decel: "減速時",
    stop: "停車時",
    cruise: "一定走行時",
    all: "常時"
  };
  return labels[value] || "";
}

function buildFacts(input, obd, flow, interview) {
  const facts = [
    input.vehicle ? `車種情報: ${input.vehicle}` : `車種情報: ${NO_DATA}`,
    input.facts ? `確認済みの事実: ${input.facts}` : `確認済みの事実: ${NO_DATA}`
  ];

  if (input.obdCode && obd) {
    facts.push(`登録済みOBD2コード: ${obd.code} ${obd.title}`);
    facts.push(`OBD2コード上の故障系統: ${obd.faultSystem}`);
  } else if (input.obdCode) {
    facts.push(`OBD2コード ${input.obdCode}: ${NO_DATA}`);
    facts.push(describeUnregisteredDtc(input.obdCode));
  } else {
    facts.push(`OBD2コード: ${NO_DATA}`);
  }

  if (flow) {
    facts.push(`症状の整理: ${flow.symptomSummary || flow.symptomName}`);
    facts.push(...(flow.facts || []));
  } else {
    facts.push(`症状選択: ${NO_DATA}`);
  }

  return [...facts, ...interview.facts];
}

function buildGuesses(obd, flow, interview) {
  const guesses = [...interview.guesses];

  if (flow?.possibleSystems?.length) {
    guesses.push(...flow.possibleSystems.map((item) => `可能性のある系統: ${item}`));
  } else if (flow?.faultSystem) {
    guesses.push(`可能性のある系統: ${flow.faultSystem}`);
  }

  if (obd?.commonCauses?.length) {
    guesses.push(...obd.commonCauses.map((cause) => `OBD2登録データ上の原因候補: ${cause}`));
  }

  if (flow?.likelyButUnconfirmed?.length) {
    guesses.push(...flow.likelyButUnconfirmed.map((item) => `未確定の候補: ${item}`));
  }

  return guesses.length ? guesses : [NO_DATA];
}

function buildCheckOrder(obd, flow, interview, workflowMatches = []) {
  const checks = [
    ...workflowMatches.flatMap((item) => item.trial_steps || []),
    ...interview.checks
  ];

  if (flow?.priorityChecks?.length) checks.push(...flow.priorityChecks.map((item) => `優先確認順位: ${item}`));
  if (flow?.firstLook?.length) checks.push(...flow.firstLook.map((item) => `まず見る場所: ${item}`));
  if (obd?.firstChecks?.length) checks.push(...obd.firstChecks.map((item) => `OBD2からの初期確認: ${item}`));
  if (flow?.checks?.length) checks.push(...flow.checks);

  return collectUnique(checks).length ? collectUnique(checks) : [NO_DATA];
}

function buildMeasurements(flow, interview, workflowMatches = []) {
  const measurements = [
    ...workflowMatches.flatMap((item) => item.measurement_points || []),
    ...interview.measurements,
    ...(flow?.measurements || []),
    ...(flow?.measurementPoints || [])
  ];

  return measurements.length ? collectUnique(measurements) : [NO_DATA];
}

function buildLiveDataGuidance(workflowMatches = []) {
  const monitorById = new Map((dataStore.obdMonitorDefinitions || []).map((item) => [item.id, item]));
  const guidance = [];

  workflowMatches.forEach((workflow) => {
    const definitions = (workflow.monitor_ids || [])
      .map((id) => monitorById.get(id))
      .filter(Boolean);

    if (!definitions.length) return;

    const monitorLabels = definitions.map((item) => {
      const address = item.scope === "standard-generic"
        ? `Mode ${item.service} PID ${item.pid}`
        : "メーカー拡張・識別子要確認";
      return `${item.label}（${address}）`;
    });

    guidance.push(`${workflow.title}: ${monitorLabels.join("、")}`);
    (workflow.monitor_observation_conditions || []).forEach((condition) => {
      guidance.push(`観察条件: ${condition}`);
    });
    if (workflow.monitor_interpretation_note) {
      guidance.push(`解析上の注意: ${workflow.monitor_interpretation_note}`);
    }
  });

  return collectUnique(guidance).length
    ? collectUnique(guidance)
    : ["該当する登録済みライブデータ手順はありません。測定条件とメーカー整備書を確認してください。"];
}

function buildBranches(flow, interview, workflowMatches = []) {
  const branches = [];
  if (workflowMatches.length) {
    branches.push(...workflowMatches.flatMap((workflow) => [
      ...(workflow.if_normal_next || []).map((item) => `正常なら次に確認: ${item}`),
      ...(workflow.if_abnormal_suspect || []).map((item) => `異常なら疑う場所: ${item}`)
    ]));
  }
  if (flow?.ifNormalNext?.length) {
    branches.push(...flow.ifNormalNext.map((item) => `正常なら次に見る場所: ${item}`));
  }
  if (flow?.ifAbnormalSuspect?.length) {
    branches.push(...flow.ifAbnormalSuspect.map((item) => `異常なら疑う場所: ${item}`));
  }
  if (interview.normalNext.length) {
    branches.push(...interview.normalNext.map((item) => `正常なら次に見る場所: ${item}`));
  }
  if (interview.abnormalSuspect.length) {
    branches.push(...interview.abnormalSuspect.map((item) => `異常なら疑う場所: ${item}`));
  }

  return branches.length ? branches : [NO_DATA];
}

function buildCautions(obd, flow, beforeParts, workflowMatches = []) {
  const cautions = [];

  cautions.push(...workflowMatches.flatMap((item) => item.common_mistakes || []));
  if (obd?.prematureConclusionWarning) cautions.push(`よくある早とちり: ${obd.prematureConclusionWarning}`);
  if (flow?.commonMistakes?.length) cautions.push(...flow.commonMistakes.map((item) => `よくある早とちり: ${item}`));
  if (beforeParts.length) cautions.push(...beforeParts.map((item) => `部品交換前に必ず確認: ${item}`));
  if (flow?.customerExplanation) cautions.push(`お客様への説明文: ${flow.customerExplanation}`);
  if (flow?.manualRequiredItems?.length) cautions.push(...flow.manualRequiredItems.map((item) => `整備書確認必須項目: ${item}`));
  if (obd?.manualRequired) cautions.push(`整備書確認必須項目: DTC ${obd.code} のメーカー別診断手順`);

  cautions.push("原因を1つに決めつけず、登録データ、測定値、実車確認が一致するか確認してください。");
  cautions.push("交換してくださいではなく、確認してください。最終判断は実車確認とメーカー整備書を優先してください。");

  return collectUnique(cautions);
}

function buildSources(obd, flow, workflowMatches = []) {
  const sources = [];

  if (obd?.sources?.length) sources.push(...obd.sources);
  if (flow?.sources?.length) sources.push(...flow.sources);
  sources.push(...workflowMatches.flatMap((item) => [
    item.source,
    ...(Array.isArray(item.source_url) ? item.source_url : [item.source_url])
  ].filter(Boolean)));

  return collectUnique(sources).length ? collectUnique(sources) : [NO_DATA];
}

function buildSafetyItems(tags) {
  const message = buildSafetyMessage(tags);
  return message ? [message] : ["安全に関わる兆候がある場合は作業を中止し、メーカー整備書と専門家の確認を優先してください。"];
}

function buildCustomerExplanation(flow, interview) {
  const explanations = [];

  if (flow?.customerExplanation) explanations.push(flow.customerExplanation);
  if (interview.insights.length && interview.insights[0] !== NO_DATA) {
    explanations.push("問診内容から発生条件を整理できました。現車確認では、回答内容と測定値が一致するかを順番に確認します。");
  }

  explanations.push("現時点では原因を断定せず、問診、登録データ、測定値、実車確認を照合して判断します。");
  return collectUnique(explanations);
}

function buildConfidenceItems(obd, flow, interview) {
  const hasInterview = interview.insights.length && interview.insights[0] !== NO_DATA;

  return [
    `確信度: ${getConfidence(obd, flow, interview)}`,
    obd || flow || hasInterview ? "登録済みデータと問診に基づく診断補助です。原因断定ではありません。" : NO_DATA,
    "最終判断は実車確認とメーカー整備書を優先してください。"
  ];
}

function getConfidence(obd, flow, interview = { insights: [] }) {
  const hasInterview = interview.insights?.length && interview.insights[0] !== NO_DATA;
  if (obd && flow && hasInterview) return "中";
  if (obd && flow) return "中";
  if (flow && hasInterview) return "中";
  if (obd) return obd.confidence || "低";
  if (flow) return flow.confidence || "低";
  if (hasInterview) return "低";
  return "低";
}

function buildModernReferences(input, obd, flow, workflowMatches = []) {
  const context = buildReferenceContext(input, flow);
  const generic = [
    ...buildGenericObdReference(input, obd),
    ...workflowMatches.map(formatDiagnosticWorkflow)
  ];
  const vehiclePatterns = filterReferenceItems(dataStore.vehiclePatterns, context).map(formatVehiclePattern);
  const recallTsb = filterRecallTsbNotes(dataStore.recallsTsbNotes, context).map(formatRecallTsbNote);
  const japanInspection = filterJapanInspectionNotes(dataStore.japanObdInspectionNotes, context).map(formatJapanInspectionNote);
  const realCases = filterRealWorldCases(dataStore.realWorldCases, context).map(formatRealWorldCase);

  return {
    generic: ensureMatchList(generic),
    vehiclePatterns: ensureMatchList(vehiclePatterns),
    recallTsb: ensureMatchList(recallTsb),
    japanInspection: ensureMatchList(japanInspection),
    realCases: ensureMatchList(realCases),
    dataGaps: buildDataGapNotes(input, {
      generic,
      vehiclePatterns,
      recallTsb,
      japanInspection,
      realCases
    })
  };
}

function buildReferenceContext(input, flow) {
  const vehicleText = normalizeLoose([input.vehicle, input.facts].join(" "));
  const symptomText = normalizeLoose([flow?.symptomName, input.facts].join(" "));
  const yearMatch = input.vehicle.match(/(19|20)\d{2}/);

  return {
    vehicleText,
    symptomText,
    code: input.obdCode,
    year: yearMatch ? Number(yearMatch[0]) : null,
    engineText: vehicleText
  };
}

function buildGenericObdReference(input, obd) {
  const items = [];
  if (obd) {
    items.push(`従来汎用OBD: ${obd.code} ${obd.title || ""} / 系統: ${obd.faultSystem || obd.system || NO_DATA} / 参考情報です。原因断定ではありません。`);
  } else if (input.obdCode) {
    items.push(`従来汎用OBD: ${input.obdCode} は登録データなし。メーカー独自コードの可能性もあるため断定しないでください。`);
    items.push(describeUnregisteredDtc(input.obdCode));
  }

  const modernMatches = getModernGenericMatches(input.obdCode);
  modernMatches.forEach((item) => {
    items.push(formatModernGenericCode(item));
  });

  return items;
}

function buildQuickView(input, obd, flow, interview, safetyTags, modernGenericMatches = [], workflowMatches = []) {
  const checks = collectUnique([
    ...workflowMatches.flatMap((item) => item.trial_steps || []),
    ...modernGenericMatches.flatMap((item) => item.check_order || []),
    ...(obd?.firstChecks || []),
    ...(flow?.priorityChecks || []),
    ...(flow?.firstLook || []).map((item) => `${item}を確認`),
    ...interview.checks
  ].filter(Boolean));
  const nextLook = collectUnique([
    ...workflowMatches.flatMap((item) => item.if_normal_next || []),
    ...modernGenericMatches.flatMap((item) => item.possible_causes || []),
    ...(flow?.firstLook || []),
    ...(flow?.possibleSystems || []),
    ...(obd?.possible_causes || []),
    ...(obd?.commonCauses || [])
  ].filter(Boolean));
  const measurements = collectUnique([
    ...workflowMatches.flatMap((item) => item.measurement_points || []),
    ...modernGenericMatches.flatMap((item) => item.measurement_points || []),
    ...(flow?.measurements || []),
    ...(obd?.measurement_points || []),
    ...interview.measurements
  ].filter(Boolean));
  const mistakes = collectUnique([
    ...workflowMatches.flatMap((item) => item.common_mistakes || []),
    ...modernGenericMatches.flatMap((item) => item.common_mistakes || []),
    obd?.prematureConclusionWarning,
    ...(obd?.common_mistakes || []),
    ...(flow?.commonMistakes || [])
  ].filter(Boolean));

  return {
    priorityChecks: fillToThree(checks),
    nextLook: compactInline(nextLook, "登録データなし"),
    measurements: compactInline(measurements, "登録データなし"),
    mistake: compactInline(mistakes, "コード名だけで部品交換を判断しないでください。", 1),
    safety: buildSafetyMessage(safetyTags) || "安全に関わる作業はメーカー整備書を確認してください。"
  };
}

function fillToThree(items) {
  const fallback = [
    "DTCとフリーズフレームを保存",
    "12V電源、アース、コネクタを確認",
    "該当系統の実測値をメーカー基準と比較"
  ];
  return [...items, ...fallback].filter(Boolean).slice(0, 3);
}

function compactInline(items, fallback, limit = 4) {
  const values = collectUnique(items.filter((item) => item && item !== NO_DATA)).slice(0, limit);
  return values.length ? values.join("、") : fallback;
}

function buildDiagnosisSummary(input, obd, flow, interview, modernReferences, safetyTags) {
  const summary = [];
  const firstCheck = [
    ...(obd?.firstChecks || []),
    ...(flow?.priorityChecks || []),
    ...interview.checks
  ].filter(Boolean);
  const measurements = [
    ...(flow?.measurements || []),
    ...interview.measurements
  ].filter(Boolean);
  const mistakes = [
    obd?.prematureConclusionWarning,
    ...(flow?.commonMistakes || [])
  ].filter(Boolean);
  const hasModernReference = [
    modernReferences.generic,
    modernReferences.vehiclePatterns,
    modernReferences.recallTsb,
    modernReferences.japanInspection,
    modernReferences.realCases
  ].some((items) => items.some((item) => item !== "該当データなし"));

  summary.push(input.obdCode ? `入力DTC ${input.obdCode}: 原因断定ではなく、確認順に沿って切り分けます。` : "DTC未入力: 症状と問診から確認順を整理します。");
  summary.push(`まず確認すること: ${firstCheck[0] || "DTC、フリーズフレーム、12V電源、目視点検を確認してください。"}`);
  summary.push(`優先確認順: ${firstCheck.slice(0, 3).join(" → ") || "登録データなし"}`);
  summary.push(`測定ポイント: ${measurements.slice(0, 4).join("、") || "登録データなし"}`);
  summary.push(`早とちり注意: ${mistakes[0] || "コード名だけで部品交換を判断しないでください。"}`);
  summary.push(`安全注意: ${buildSafetyMessage(safetyTags) || "安全に関わる作業はメーカー整備書を確認してください。"}`);
  summary.push(buildPrecisionHint(input, modernReferences));
  summary.push(hasModernReference ? "参考情報あり。参照元や詳細は折りたたみを開いて確認できます。" : "追加参考情報: 該当データなし。登録データ外の内容は断定しないでください。");

  return summary;
}

function buildPrecisionHint(input, modernReferences) {
  const hints = [];
  const hasReference = [
    modernReferences.generic,
    modernReferences.vehiclePatterns,
    modernReferences.recallTsb,
    modernReferences.japanInspection,
    modernReferences.realCases
  ].some((items) => items.some((item) => item !== "該当データなし"));

  if (!input.obdCode) hints.push("OBD2コードを入れるとDTC別情報の精度が上がります。");
  if (!input.vehicle) hints.push("メーカー・車種・年式・エンジン型式を入れると車種別傾向を絞れます。");
  if (input.obdCode && input.vehicle && hasReference) hints.push("DTCと車両情報から参考データを絞り込みました。");
  if (!hasReference) hints.push("登録データに合う参考情報が少ないため、断定せず実測値を優先してください。");

  return `精度メモ: ${hints.join(" ")}`;
}

function codeMatchesModern(pattern, code) {
  if (!pattern || !code) return false;
  if (pattern.toUpperCase() === code.toUpperCase()) return true;
  if (!pattern.toUpperCase().includes("X")) return false;
  const expression = pattern.toUpperCase().replace(/X/g, "[0-9A-F]");
  return new RegExp(`^${expression}$`).test(code.toUpperCase());
}

function scoreModernGenericCode(item, code) {
  if (!item?.code || !code) return { score: 0, reasons: [] };
  if (item.code === code) return { score: 5, reasons: [`DTC ${code} 完全一致`] };
  if (codeMatchesModern(item.code, code)) return { score: 2, reasons: [`DTC ${code} が ${item.code} の範囲に該当`] };
  return { score: 0, reasons: [] };
}

function getModernGenericMatches(code) {
  return (dataStore.genericObdCodesModern || [])
    .map((item) => ({ ...item, _matchInfo: scoreModernGenericCode(item, code) }))
    .filter((item) => item._matchInfo.score > 0)
    .sort((a, b) => b._matchInfo.score - a._matchInfo.score);
}

function getDiagnosticWorkflowMatches(input, flow) {
  const context = buildReferenceContext(input, flow);
  return (dataStore.diagnosticWorkflows || [])
    .map((item) => {
      if (item.id === "workflow-obd-readout-baseline" && (input.obdCode || input.symptomId)) {
        return { ...item, _matchInfo: { score: 1, reasons: ["OBD2読取時の基本手順"] } };
      }
      if (item.id?.startsWith("family-flow-") && !hasCodeHit(item.dtc_codes, context.code)) {
        return { ...item, _matchInfo: { score: 0, reasons: [] } };
      }
      return { ...item, _matchInfo: scoreReferenceItem(item, context) };
    })
    .filter((item) => item._matchInfo.score > 0)
    .sort((a, b) => b._matchInfo.score - a._matchInfo.score);
}

function inferSafetyTagsFromModernItem(item) {
  const text = normalizeLoose([
    item.system,
    item.powertrain,
    item.vehicle_filter?.powertrain,
    ...(item.safety_notes || []),
    ...(item.possible_causes || [])
  ].join(" "));
  const tags = [];

  if (text.includes("brake") || text.includes("abs") || text.includes("ブレーキ")) tags.push("brake");
  if (text.includes("srs") || text.includes("airbag") || text.includes("エアバッグ")) tags.push("airbag");
  if (text.includes("fuel") || text.includes("evap") || text.includes("燃料")) tags.push("fuel");
  if (text.includes("hybrid") || text.includes("highvoltage") || text.includes("高電圧") || text.includes("hv")) tags.push("highVoltage");

  return tags;
}

function filterReferenceItems(items = [], context) {
  return matchReferenceItems(items, context, 2);
}

function filterRecallTsbNotes(items = [], context) {
  return items
    .map((item) => {
      if (item.note_type === "lookup_rule" && (context.code || context.vehicleText)) {
        return { ...item, _matchInfo: { score: 2, reasons: ["公式確認ルール"] } };
      }
      const match = scoreReferenceItem(item, context);
      return { ...item, _matchInfo: match };
    })
    .filter((item) => item._matchInfo.score >= 2)
    .sort((a, b) => b._matchInfo.score - a._matchInfo.score);
}

function filterJapanInspectionNotes(items = [], context) {
  return items.filter((item) => {
    if (!context.vehicleText && !context.year && !context.code) return false;
    if (item.id === "japan-obd-inspection-scope-2024") return !context.year || context.year >= 2021;
    return true;
  });
}

function filterRealWorldCases(items = [], context) {
  return items
    .map((item) => {
    const vehicle = item.vehicle || {};
      const match = scoreReferenceItem({ ...item, ...vehicle, year_from: vehicle.year, year_to: vehicle.year }, context);
      return { ...item, _matchInfo: match };
    })
    .filter((item) => item._matchInfo.score >= 2)
    .sort((a, b) => b._matchInfo.score - a._matchInfo.score);
}

function hasCodeHit(codes = [], code) {
  return Boolean(code && Array.isArray(codes) && codes.some((pattern) => codeMatchesModern(pattern, code)));
}

function hasWordHit(words = [], targetText) {
  if (!targetText || !Array.isArray(words)) return false;
  return words.some((word) => word && targetText.includes(normalizeLoose(word)));
}

function matchReferenceItems(items = [], context, minScore = 2) {
  return items
    .map((item) => ({ ...item, _matchInfo: scoreReferenceItem(item, context) }))
    .filter((item) => item._matchInfo.score >= minScore)
    .sort((a, b) => b._matchInfo.score - a._matchInfo.score);
}

function scoreReferenceItem(item, context) {
  const reasons = [];
  let score = 0;

  if (hasCodeHit(item.dtc_codes, context.code)) {
    const exactMatch = item.dtc_codes.includes(context.code);
    score += exactMatch ? 5 : 1;
    reasons.push(exactMatch ? `DTC ${context.code} 一致` : `DTC ${context.code} の系統フロー`);
  }

  if (hasWordHit(item.symptoms, context.symptomText)) {
    score += 2;
    reasons.push("症状一致");
  }

  const vehicle = scoreVehicleFilter(item, context);
  score += vehicle.score;
  reasons.push(...vehicle.reasons);

  return { score, reasons };
}

function scoreVehicleFilter(item, context) {
  const makers = [item.maker, ...(item.maker_aliases || [])].map(normalizeLoose).filter(Boolean);
  const models = [item.model, ...(item.model_aliases || [])].map(normalizeLoose).filter(Boolean);
  const engines = [item.engine_code, ...(item.engine_aliases || [])].map(normalizeLoose).filter(Boolean);
  const powertrains = [item.powertrain, ...(item.powertrain_aliases || [])].map(normalizeLoose).filter(Boolean);
  const yearFrom = Number(item.year_from || item.year || 0) || null;
  const yearTo = Number(item.year_to || item.year || 0) || null;
  const reasons = [];
  let score = 0;

  const makerHit = makers.some((maker) => context.vehicleText.includes(maker));
  const modelHit = models.some((model) => context.vehicleText.includes(model));
  const engineHit = engines.some((engine) => context.engineText.includes(engine));
  const powertrainHit = powertrains.some((powertrain) => context.vehicleText.includes(powertrain));
  const yearHit = context.year && (!yearFrom || context.year >= yearFrom) && (!yearTo || context.year <= yearTo);

  if (makerHit) {
    score += 3;
    reasons.push("メーカー一致");
  }
  if (modelHit) {
    score += 3;
    reasons.push("車種一致");
  }
  if (engineHit) {
    score += 3;
    reasons.push("エンジン型式一致");
  }
  if (powertrainHit) {
    score += 2;
    reasons.push("パワートレイン一致");
  }
  if (yearHit && score > 0) {
    score += 1;
    reasons.push("年式範囲一致");
  }

  return { score, reasons };
}

function matchReason(item) {
  const reasons = item?._matchInfo?.reasons || [];
  return reasons.length ? `一致理由: ${reasons.join("、")}` : "一致理由: 登録データによる参考表示";
}

function formatModernGenericCode(item) {
  return [
    `汎用DTC: ${item.code} ${item.title || ""}`,
    matchReason(item),
    `系統: ${item.system || NO_DATA}`,
    `まず確認: ${firstInline(item.check_order)}`,
    `早とちり注意: ${firstInline(item.common_mistakes)}`,
    "参考情報あり。詳細な参照元は出典欄を確認してください。"
  ].join(" / ");
}

function formatDiagnosticWorkflow(item) {
  return [
    `診断フロー: ${item.title || NO_DATA}`,
    matchReason(item),
    `まず試す: ${firstInline(item.trial_steps)}`,
    `正常なら次へ: ${firstInline(item.if_normal_next)}`,
    `交換前に確認: ${firstInline(item.before_replacement_checks)}`,
    "部品交換の指示ではありません。実測値とメーカー整備書で確認してください。"
  ].join(" / ");
}

function formatVehiclePattern(item) {
  return [
    `車種別傾向: ${item.maker || "メーカー未指定"} ${item.model || ""}`,
    matchReason(item),
    item.pattern_summary || NO_DATA,
    `まず確認: ${firstInline(item.check_order)}`,
    "参考情報あり。該当車の原因断定ではありません。"
  ].join(" / ");
}

function formatRecallTsbNote(item) {
  return [
    `公開リコール/TSBメモ: ${item.title || item.note_type || NO_DATA}`,
    matchReason(item),
    `まず確認: ${firstInline(item.check_order)}`,
    "対象可否は車台番号、型式、製作期間、公式情報で確認してください。"
  ].join(" / ");
}

function formatJapanInspectionNote(item) {
  return [
    `日本のOBD検査メモ: ${item.topic || NO_DATA}`,
    `まず確認: ${firstInline(item.check_order)}`,
    "診断補助と車検時のOBD検査判定は分けて扱ってください。"
  ].join(" / ");
}

function formatRealWorldCase(item) {
  return [
    `実整備事例: ${item.id || NO_DATA}`,
    matchReason(item),
    `車両: ${item.vehicle?.maker || NO_DATA} ${item.vehicle?.model || ""} ${item.vehicle?.year || ""}`,
    `DTC: ${listInline(item.dtc_codes)}`,
    `確認事実: ${firstInline(item.confirmed_facts)}`,
    `結果: ${item.repair_result || NO_DATA}`,
    "過去事例であり、今回の車両の原因断定ではありません。"
  ].join(" / ");
}

function buildDataGapNotes(input, groups) {
  const notes = [];
  if (!input.vehicle) notes.push("車種情報が未入力のため、車種別傾向、リコール/TSB、OBD検査対象可否は絞り込めません。");
  if (!input.obdCode) notes.push("OBD2コードが未入力のため、DTC別の追加データは絞り込めません。");
  Object.entries(groups).forEach(([key, list]) => {
    if (!list.length) notes.push(`${modernGroupLabel(key)}: 該当データなし。登録データ外の内容は断定しないでください。`);
  });
  notes.push("メーカー独自コード、リコール/TSB対象可否、OBD検査対象可否はメーカー整備書と公式情報を優先してください。");
  return collectUnique(notes);
}

function modernGroupLabel(key) {
  const labels = {
    generic: "汎用OBD情報",
    vehiclePatterns: "車種別傾向",
    recallTsb: "公開リコール/TSBメモ",
    japanInspection: "日本のOBD検査メモ",
    realCases: "実整備事例"
  };
  return labels[key] || key;
}

function ensureMatchList(items) {
  return items.length ? collectUnique(items) : ["該当データなし"];
}

function listInline(items) {
  return Array.isArray(items) && items.length ? items.join("、") : NO_DATA;
}

function firstInline(items) {
  return Array.isArray(items) && items.length ? items[0] : NO_DATA;
}

function normalizeLoose(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function describeUnregisteredDtc(code) {
  if (!/^[PBCU][0-9A-F]{4}$/.test(code)) {
    return `DTC形式注意: ${code || NO_DATA} は標準的な5文字形式として確認できません。入力を確認してください。`;
  }

  const rule = (dataStore.dtcScopeRules || []).find((item) => item.prefix === code[0]);
  const allocationNote = "汎用定義、標準割当、メーカー独自定義の区別はコード領域により異なるため、メーカー整備書で確認してください。";

  if (!rule) {
    return `DTC領域メモ: ${code} は登録済み個別定義なし。メーカー整備書と対応スキャンツールで確認してください。`;
  }

  return [
    `DTC領域メモ: ${code} は${rule.system}領域です。`,
    allocationNote,
    rule.description,
    `まず確認: ${(rule.first_checks || [])[0] || "メーカー整備書で定義を確認する"}`,
    "個別故障は断定しません。"
  ].join(" ");
}

function buildSafetyMessage(tags) {
  const messages = {
    brake: "ブレーキ系は事故に直結します。異常を感じる場合は走行を中止し、メーカー整備書と専門家の確認を優先してください。",
    airbag: "エアバッグ、SRS系は誤作動や不作動の危険があります。指定手順なしで分解、測定しないでください。",
    fuel: "燃料系作業は火災の危険があります。火気厳禁、換気、燃圧抜き手順、保護具を優先してください。",
    highVoltage: "高電圧システムは感電や重大事故の危険があります。有資格者とメーカー指定手順を優先してください。"
  };

  return tags.map((tag) => messages[tag]).filter(Boolean).join(" ");
}

function renderDiagnosis(result) {
  emptyState.hidden = true;
  confidenceBadge.textContent = `確信度: ${result.confidence}`;
  renderSimilarCases();
  renderDiagnosisFlow(result);
  setResultView(activeResultView);

  renderItems(priorityCheckList, result.quickView.priorityChecks);
  nextLookText.textContent = result.quickView.nextLook;
  quickMeasurementText.textContent = result.quickView.measurements;
  quickMistakeText.textContent = result.quickView.mistake;
  quickSafetyText.textContent = result.quickView.safety;
  renderItems(diagnosisSummaryList, result.summary);
  renderItems(factList, result.facts);
  renderItems(interviewList, result.interview);
  renderItems(guessList, result.guesses);
  renderItems(modernGenericList, result.modernReferences.generic);
  renderItems(vehiclePatternList, result.modernReferences.vehiclePatterns);
  renderItems(recallTsbList, result.modernReferences.recallTsb);
  renderItems(japanInspectionList, result.modernReferences.japanInspection);
  renderItems(realWorldCaseList, result.modernReferences.realCases);
  renderItems(dataGapList, result.modernReferences.dataGaps);
  if (!aiList.children.length) {
    aiStatus.textContent = "AI相談は未送信です。";
  }
  renderItems(checkOrderList, result.checkOrder);
  renderItems(measurementList, result.measurements);
  renderItems(liveDataGuideList, result.liveDataGuidance);
  renderItems(branchList, result.branches);
  renderItems(cautionList, result.cautions);
  renderItems(partsCheckList, result.partsChecks);
  renderItems(safetyList, result.safetyItems);
  renderItems(customerList, result.customer);
  renderItems(sourceList, result.sources);
  renderItems(confidenceList, result.confidenceItems);

  safetyPanel.hidden = !result.safety;
  safetyText.textContent = result.safety;
}

function initializeObdReadOnlyPanel() {
  const capability = window.ObdReadOnly?.getCapability();
  renderObdVehicleMakerOptions();
  renderObdConnectionGuide();
  if (!capability) {
    obdCapabilityBadge.textContent = "準備機能を読込できません";
    obdCapabilityText.textContent = "OBD2読取準備モジュールを読み込めませんでした。";
    obdCapabilityText.classList.add("error");
    renderObdAccessGate();
    return;
  }

  const serialStatus = capability.webSerialSupported
    ? "このブラウザはUSBシリアル読取基盤に対応しています。"
    : "このブラウザはWeb Serial非対応です。実機読取にはデスクトップ版Chrome系ブラウザが必要です。";
  const secureStatus = capability.secureContext
    ? "HTTPS読取環境は正常です。"
    : "HTTPSではないため実機読取機能は使用できません。";
  const catalogStatus = `読取辞書 ${capability.monitorDefinitionCount}項目を準備しています。`;

  obdCapabilityBadge.textContent = "実機読取準備中";
  obdCapabilityText.textContent = `${secureStatus} ${serialStatus} ${catalogStatus} VCI読取、DTC読取、ライブデータ、ECU情報は機能単位で準備し、安全検証が終わるまで車両への送信は無効にしています。`;
  renderObdAccessGate();
  renderObdProgressOverview(capability);
  renderObdPreviewButtons();
  renderObdWorkflowGuide(capability);
  renderObdDeveloperGate(capability);
  renderObdOperationPlan(window.ObdReadOnly.getVehicleOperationPlan?.() || []);
  renderObdPreparedRequests(
    window.ObdReadOnly.getVehicleConnectionProfile?.(),
    window.ObdReadOnly.getPreparedVehicleRequests?.() || []
  );
  renderObdInterfaceRoadmap(
    window.ObdReadOnly.getAdvancedInterfaceRoadmap?.() || [],
    window.ObdReadOnly.getVehicleInterfaceCatalog?.() || []
  );
  renderObdCapabilityStatus(dataStore.diagnosticCapabilityStatus || []);
  renderObdCoverageRoadmap(dataStore.diagnosticCoverageRoadmap || []);
  renderObdBridgeContract(
    window.ObdReadOnly.getLocalBridgeContract?.(),
    window.ObdReadOnly.getLocalBridgeResponseSchemas?.() || []
  );
  renderObdSafetyInterlock(window.ObdReadOnly.getVehicleDamagePreventionInterlock?.());
}

async function hashObdAccessPassword(value) {
  const normalized = typeof value === "string" ? value : "";
  const encoded = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function renderObdAccessGate(capability = window.ObdReadOnly?.getCapability?.()) {
  const unlocked = obdAccessUnlocked === true;

  obdAccessModeBadge.textContent = unlocked ? "解除済み" : "ロック中";
  obdAccessUnlockButton.disabled = unlocked;
  obdAccessLockButton.disabled = !unlocked;
  if (obdSetupPanel) obdSetupPanel.hidden = !unlocked;
  obdAccessProtected.hidden = !unlocked;

  if (!unlocked) {
    obdAccessStatus.textContent = getObdAccessStatusMessage(false, capability);
    return;
  }

  obdAccessStatus.textContent = getObdAccessStatusMessage(true, capability);
}

function normalizeProgressPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function averageProgressPercent(values) {
  const normalized = values.map((value) => normalizeProgressPercent(value)).filter((value) => value !== null);
  if (!normalized.length) return 0;
  return Math.round(normalized.reduce((sum, value) => sum + value, 0) / normalized.length);
}

function sortEtaTargets(values = []) {
  const order = new Map([
    ["2026-Q3 前半見込み", 1],
    ["2026-Q3 見込み", 2],
    ["2026-Q3 後半見込み", 3],
    ["2026-Q4 見込み", 4],
    ["2026-Q4 以降見込み", 5],
    ["2027 以降見込み", 6],
    ["時期未定", 99]
  ]);
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))]
    .sort((a, b) => (order.get(a) || 98) - (order.get(b) || 98) || a.localeCompare(b, "ja"));
}

function getEtaSortValue(value) {
  return sortEtaTargets([value])[0] === value
    ? {
        "2026-Q3 前半見込み": 1,
        "2026-Q3 見込み": 2,
        "2026-Q3 後半見込み": 3,
        "2026-Q4 見込み": 4,
        "2026-Q4 以降見込み": 5,
        "2027 以降見込み": 6,
        "時期未定": 99
      }[value] || 98
    : 98;
}

function summarizeEtaTargets(values = [], limit = 2) {
  const sorted = sortEtaTargets(values);
  return sorted.length ? sorted.slice(0, limit).join(" / ") : "時期未定";
}

function summarizeLowestProgress(items = [], getLabel, getProgress, limit = 2) {
  return items
    .map((item) => ({
      label: getLabel(item),
      progress: normalizeProgressPercent(getProgress(item))
    }))
    .filter((item) => item.label && item.progress !== null)
    .sort((a, b) => a.progress - b.progress || a.label.localeCompare(b.label, "ja"))
    .slice(0, limit)
    .map((item) => `${item.label} ${item.progress}%`)
    .join(" / ");
}

function summarizeUpcomingReadiness(items = [], getLabel, getProgress, getEta, limit = 2) {
  return items
    .map((item) => ({
      label: getLabel(item),
      progress: normalizeProgressPercent(getProgress(item)),
      eta: getEta(item)
    }))
    .filter((item) => item.label && item.progress !== null && item.eta)
    .sort((a, b) => getEtaSortValue(a.eta) - getEtaSortValue(b.eta) || b.progress - a.progress || a.label.localeCompare(b.label, "ja"))
    .slice(0, limit)
    .map((item) => `${item.label} ${item.progress}% (${item.eta})`)
    .join(" / ");
}

function summarizeTaskCount(doneItems = [], missingItems = []) {
  const doneCount = Array.isArray(doneItems) ? doneItems.length : 0;
  const missingCount = Array.isArray(missingItems) ? missingItems.length : 0;
  const totalCount = doneCount + missingCount;
  if (!totalCount) return "進捗項目を整理中";
  return `完了 ${doneCount}/${totalCount}項目 / 残り${missingCount}項目`;
}

function summarizeRemainingChecks(items = [], limit = 2) {
  if (!Array.isArray(items) || !items.length) return "確認項目なし";
  return `残り確認 ${items.length}件: ${items.slice(0, limit).join(" / ")}`;
}

function buildLocalBridgeImplementationSnapshot() {
  const contract = window.ObdReadOnly?.getLocalBridgeContract?.();
  const schemas = window.ObdReadOnly?.getLocalBridgeResponseSchemas?.() || [];
  const schemaIntents = new Set(schemas.map((item) => item.intent));
  const allowedReadIntents = new Set(contract?.allowedReadIntents || []);
  const interfaceCatalog = window.ObdReadOnly?.getVehicleInterfaceCatalog?.() || [];

  const modelChecks = [
    { id: "bridge_contract", label: "read-onlyブリッジ契約", available: Boolean(contract?.connectionEnabled && contract?.vehicleCommandEnabled === false) },
    { id: "bridge_status", label: "読取状態の表示モデル", available: hasBridgeIntentModel("bridge_status", schemaIntents, allowedReadIntents, hasBridgeConnectionStatusSupport) },
    { id: "list_vci", label: "VCI一覧の表示モデル", available: hasBridgeIntentModel("list_vci", schemaIntents, allowedReadIntents, hasBridgeVciSupport) },
    { id: "adapter_identity", label: "アダプター情報の表示モデル", available: hasBridgeIntentModel("adapter_identity", schemaIntents, allowedReadIntents, hasBridgeAdapterIdentitySupport) },
    { id: "read_stored_dtc", label: "保存DTC応答の正規化", available: hasBridgeIntentModel("read_stored_dtc", schemaIntents, allowedReadIntents, hasBridgeDtcSupport) },
    { id: "read_pending_dtc", label: "保留DTC応答の正規化", available: hasBridgeIntentModel("read_pending_dtc", schemaIntents, allowedReadIntents, hasBridgeDtcSupport) },
    { id: "read_permanent_dtc", label: "永久DTC応答の正規化", available: hasBridgeIntentModel("read_permanent_dtc", schemaIntents, allowedReadIntents, hasBridgeDtcSupport) },
    { id: "read_freeze_frame", label: "フリーズフレーム応答の正規化", available: hasBridgeIntentModel("read_freeze_frame", schemaIntents, allowedReadIntents, hasBridgeFreezeFrameSupport) },
    { id: "read_supported_pids", label: "対応PID応答の正規化", available: hasBridgeIntentModel("read_supported_pids", schemaIntents, allowedReadIntents, hasBridgeSupportedPidSupport) },
    { id: "read_live_pid_snapshot", label: "ライブPID応答の正規化", available: hasBridgeIntentModel("read_live_pid_snapshot", schemaIntents, allowedReadIntents, hasBridgeLivePidSupport) },
    { id: "readiness_snapshot", label: "レディネス整形", available: hasBridgeReadinessSupport() },
    { id: "read_ecu_info", label: "ECU情報応答の正規化", available: hasBridgeIntentModel("read_ecu_info", schemaIntents, allowedReadIntents, hasBridgeEcuInfoSupport) },
    { id: "read_onboard_monitor", label: "Mode06応答の正規化", available: hasBridgeIntentModel("read_onboard_monitor", schemaIntents, allowedReadIntents, hasBridgeOnboardMonitorSupport) },
    { id: "session_summary", label: "セッション要約", available: hasBridgeSessionSummarySupport() },
    { id: "session_export", label: "エクスポート", available: hasBridgeSessionExportSupport() },
    { id: "diagnostic_import", label: "診断取込", available: hasBridgeDiagnosticImportPipelineSupport() },
    { id: "diagnostic_import_top_level_session", label: "診断取込トップレベル互換", available: hasBridgeDiagnosticImportTopLevelSessionSupport() }
  ];
  const pendingDriverIds = new Set([
    "user-vci-elm327",
    ...BRIDGE_BACKED_INTERFACE_IDS
  ]);
  const driverChecks = interfaceCatalog
    .filter((item) => pendingDriverIds.has(item.id))
    .map((item) => ({
      id: item.id,
      label: item.label,
      available: Number.isFinite(item.progressPercent) ? item.progressPercent > 0 : Boolean(item.currentBasis || item.nextBuild)
    }));
  const modelDone = modelChecks.filter((item) => item.available).length;
  const driverDone = driverChecks.filter((item) => item.available).length;
  const totalCount = modelChecks.length + driverChecks.length;
  const progressPercent = totalCount ? Math.round(((modelDone + driverDone) / totalCount) * 100) : 0;
  const doneLabels = [
    ...modelChecks.filter((item) => item.available).map((item) => item.label),
    ...driverChecks.filter((item) => item.available).map((item) => `${item.label} 実機読取`)
  ];
  const missingLabels = [
    ...modelChecks.filter((item) => !item.available).map((item) => item.label),
    ...driverChecks.filter((item) => !item.available).map((item) => `${item.label} 実機読取`)
  ];

  return {
    progressPercent,
    modelDone,
    modelTotal: modelChecks.length,
    driverDone,
    driverTotal: driverChecks.length,
    doneLabels,
    missingLabels,
    currentBasis: `読取モデル ${modelDone}/${modelChecks.length}項目、実VCI連携 ${driverDone}/${driverChecks.length}系統を実装済み。`,
    nextBuild: "J2534 / CANable / THINKCAR の実機読取差分を同じread-onlyブリッジ契約へ揃える。",
    etaTarget: "2026-Q3 見込み"
  };
}

function buildBridgeBackedInterfaceSnapshot(item = {}) {
  const contract = window.ObdReadOnly?.getLocalBridgeContract?.();
  const schemas = window.ObdReadOnly?.getLocalBridgeResponseSchemas?.() || [];
  const schemaIntents = new Set(schemas.map((entry) => entry.intent));
  const allowedReadIntents = new Set(contract?.allowedReadIntents || []);
  const checks = [
    {
      label: "read-only境界",
      available: Boolean(contract?.connectionEnabled && contract?.vehicleCommandEnabled === false)
    },
    {
      label: "VCI一覧表示",
      available: hasBridgeIntentModel("list_vci", schemaIntents, allowedReadIntents, hasBridgeVciSupport)
    },
    {
      label: "アダプター識別",
      available: hasBridgeIntentModel("adapter_identity", schemaIntents, allowedReadIntents, hasBridgeAdapterIdentitySupport)
    },
    {
      label: "DTC読取応答",
      available: hasBridgeIntentModel("read_stored_dtc", schemaIntents, allowedReadIntents, hasBridgeDtcSupport)
    },
    {
      label: "ライブPID応答",
      available: hasBridgeIntentModel("read_live_pid_snapshot", schemaIntents, allowedReadIntents, hasBridgeLivePidSupport)
    },
    {
      label: "フリーズフレーム応答",
      available: hasBridgeIntentModel("read_freeze_frame", schemaIntents, allowedReadIntents, hasBridgeFreezeFrameSupport)
    },
    {
      label: "ECU情報応答",
      available: hasBridgeIntentModel("read_ecu_info", schemaIntents, allowedReadIntents, hasBridgeEcuInfoSupport)
    },
    {
      label: "診断取込",
      available: hasBridgeDiagnosticImportPipelineSupport()
    },
    {
      label: getInterfaceConnectionCheckLabel(item?.id),
      available: item.connectionEnabled === true
    }
  ];
  const doneCount = checks.filter((check) => check.available).length;
  const missingLabels = checks.filter((check) => !check.available).map((check) => check.label);
  const progressPercent = checks.length ? Math.round((doneCount / checks.length) * 100) : 0;
  const guide = getInterfaceCandidateGuideByItem(item);
  const currentStatus = doneCount >= checks.length - 1
    ? guide?.statusReady || "実機読取確認待ち"
    : doneCount >= 6
      ? guide?.statusMid || "read-only取込あり"
      : guide?.statusEarly || "読取器を整備中";

  return {
    progressPercent,
    doneCount,
    totalCount: checks.length,
    missingLabels,
    currentStatus,
    currentBasis: guide?.basisPrefix
      ? `${guide.basisPrefix} ${doneCount}/${checks.length}項目を実装済み。${guide.basisSuffix || ""}`.trim()
      : `bridge候補の読取器 ${doneCount}/${checks.length}項目を実装済み。`,
    nextBuild: guide?.nextBuild || "実機読取応答を同じ read-only 契約へ揃える。",
    etaTarget: doneCount >= checks.length - 1 ? "2026-Q3 見込み" : "2026-Q3 後半見込み"
  };
}

function getInterfaceProgressState(interfaceId) {
  if (interfaceId === "local_bridge") return buildLocalBridgeImplementationSnapshot();
  return OBD_INTERFACE_PROGRESS[interfaceId] || {
    progressPercent: 0,
    currentBasis: "確認中",
    nextBuild: "",
    etaTarget: "時期未定"
  };
}

function getInterfaceCatalogDisplayState(item) {
  const mappedInterfaceId = OBD_INTERFACE_PROGRESS_BY_CATALOG_ID[item?.id];
  const progress = mappedInterfaceId ? getInterfaceProgressState(mappedInterfaceId) : getInterfaceProgressState(item?.id);
  const bridgeBackedSnapshot = isBridgeBackedInterfaceCandidate(item?.id)
    ? buildBridgeBackedInterfaceSnapshot(item)
    : null;
  return {
    ...item,
    currentStatus: bridgeBackedSnapshot?.currentStatus || item?.currentStatus || "確認中",
    progressPercent: Number.isFinite(bridgeBackedSnapshot?.progressPercent)
      ? bridgeBackedSnapshot.progressPercent
      : Number.isFinite(progress?.progressPercent)
        ? progress.progressPercent
        : item?.progressPercent || 0,
    currentBasis: bridgeBackedSnapshot?.currentBasis || progress?.currentBasis || item?.currentBasis || "",
    nextBuild: bridgeBackedSnapshot?.nextBuild || progress?.nextBuild || item?.nextBuild || "",
    etaTarget: bridgeBackedSnapshot?.etaTarget || progress?.etaTarget || item?.etaTarget || "時期未定"
  };
}

function getCapabilityDisplayItems(items = []) {
  return items.map((item) => {
    if (item?.id !== "capability-local-bridge") return item;
    const snapshot = buildLocalBridgeImplementationSnapshot();
    return {
      ...item,
      progress_percent: snapshot.progressPercent,
      current_basis: `${snapshot.currentBasis} 応答型、要約、エクスポート、診断取込まで同一モデルで扱えます。`,
      done: snapshot.doneLabels,
      missing: snapshot.missingLabels,
      next_build: snapshot.nextBuild,
      eta_target: snapshot.etaTarget
    };
  });
}

function getCoverageRoadmapDisplayItems(items = []) {
  return items.map((item) => {
    if (item?.id !== "coverage-live-data-and-active-test") return item;
    const snapshot = buildLocalBridgeImplementationSnapshot();
    return {
      ...item,
      progress_percent: Math.max(normalizeProgressPercent(item.progress_percent) || 0, snapshot.progressPercent || 0),
      current_state: "read-only 実装を優先して拡張中",
      current_count_note: `実装根拠 ${snapshot.modelDone || 0}/${snapshot.modelTotal || 0} / VCI候補 ${snapshot.driverDone || 0}/${snapshot.driverTotal || 0}`,
      next_actions: Array.isArray(snapshot.missingLabels) && snapshot.missingLabels.length
        ? snapshot.missingLabels.slice(0, 3)
        : item.next_actions,
      eta_target: snapshot.etaTarget || item.eta_target,
      source: "ローカルブリッジ実装スナップショット"
    };
  });
}

function buildInterfaceImplementationEvidence(item) {
  const contract = window.ObdReadOnly?.getLocalBridgeContract?.();
  const preparedRequests = window.ObdReadOnly?.getPreparedVehicleRequests?.() || [];
  const connectionProfile = window.ObdReadOnly?.getVehicleConnectionProfile?.();
  const sharedChecks = [
    {
      label: "read-only境界",
      available: Boolean(contract?.connectionEnabled && contract?.vehicleCommandEnabled === false)
    },
    {
      label: "読取応答整形",
      available: hasBridgeReadNormalizationSupport()
    },
    {
      label: "診断取込",
      available:
        hasBridgeDiagnosticImportPipelineSupport()
    }
  ];
  const candidateChecks = item.id === "user-vci-elm327"
    ? getElm327ImplementationChecks(item, connectionProfile, preparedRequests)
    : getBridgeBackedImplementationChecks(item);
  const allChecks = [...sharedChecks, ...candidateChecks];
  const doneCount = allChecks.filter((check) => check.available).length;
  const totalCount = allChecks.length;
  const missingLabels = allChecks.filter((check) => !check.available).map((check) => check.label);

  return {
    summary: totalCount ? `実装根拠 ${doneCount}/${totalCount}項目` : "実装根拠を整理中",
    missing: missingLabels.length ? `未実装: ${missingLabels.join(" / ")}` : "未実装: なし"
  };
}

function isBridgeBackedInterfaceCandidate(interfaceId) {
  return BRIDGE_BACKED_INTERFACE_IDS.includes(interfaceId);
}

function getInterfaceCandidateDisplayName(interfaceId) {
  return INTERFACE_CANDIDATE_DISPLAY_NAMES[interfaceId] || "候補";
}

const INTERFACE_CANDIDATE_GUIDE_BUILDERS = Object.freeze({
  "user-vci-thinkcar-bluetooth": (interfaceId) => ({
    actionLabel: "Bluetooth読取確認",
    statusEarly: "読取器を整備中",
    statusMid: "read-only読取あり",
    statusReady: "実機読取確認待ち",
    basisPrefix: "スマホ/BT候補の読取器",
    basisSuffix: "ローカルブリッジ経由の read-only 読取を優先。",
    nextBuild: "THINKCAR系の実機読取応答をローカルブリッジへ流し、DTC / フリーズフレーム / ライブデータ / ECU情報を同じ契約で確認する。",
    operatorNote: "スマホ側でBluetooth読取を開始し、PC側はローカルブリッジの read-only 応答確認へ寄せます。",
    checkSummary: "先に確認: 1.スマホBT読取開始 2.PC側ローカルブリッジ応答 3.DTC/フリーズフレーム/ライブデータ/ECU情報の読取",
    startStatus: `${getInterfaceCandidateDisplayName(interfaceId)}を確認します。先にスマホ側でBluetooth読取を開始し、その後PC側のローカルブリッジ応答を確認します。`,
    idleStatus: `${getInterfaceCandidateDisplayName(interfaceId)}を選択中です。スマホ側Bluetooth読取後に、PC側のローカルブリッジ応答を確認できます。`,
    readyStatus: `${getInterfaceCandidateDisplayName(interfaceId)}のローカルブリッジ確認済みです。次に VCI一覧、DTC、フリーズフレーム、ライブデータ、ECU情報の読取を試せます。`
  }),
  "user-vci-techstream-j2534": (interfaceId) => ({
    actionLabel: "J2534読取確認",
    statusEarly: "読取器を整備中",
    statusMid: "read-only読取あり",
    statusReady: "実機読取確認待ち",
    basisPrefix: "J2534候補の読取器",
    basisSuffix: "VCI列挙と識別を先に固めています。",
    nextBuild: "J2534実機の列挙結果と read-only ECU情報/DTC応答を同じ契約へ流す。",
    operatorNote: "PC側でVCIを列挙し、アダプター識別と read-only ECU情報/DTC 応答を同じブリッジ契約で確認します。",
    checkSummary: "先に確認: 1.VCI列挙 2.アダプター識別 3.read-only DTC/ECU情報",
    startStatus: `${getInterfaceCandidateDisplayName(interfaceId)}を確認します。VCI列挙とアダプター識別が読めるかを先に見ます。`,
    idleStatus: `${getInterfaceCandidateDisplayName(interfaceId)}を選択中です。VCI列挙とアダプター識別の読取を先に確認できます。`,
    readyStatus: `${getInterfaceCandidateDisplayName(interfaceId)}のローカルブリッジ確認済みです。次に VCI一覧、アダプター識別、read-only DTC/ECU情報を試せます。`
  }),
  "user-vci-rcmall-mks-canable-v2-pro": (interfaceId) => ({
    actionLabel: "CAN系読取確認",
    statusEarly: "読取器を整備中",
    statusMid: "read-only読取あり",
    statusReady: "実機読取確認待ち",
    basisPrefix: "CANable候補の読取器",
    basisSuffix: "read-only CAN系取込の器を先に揃えています。",
    nextBuild: "CANable系の read-only 応答をローカルブリッジへ流し、診断取込まで同じ器で確認する。",
    operatorNote: "PC側でCAN系VCIを列挙し、read-only 応答を診断取込まで同じ器で確認します。",
    checkSummary: "先に確認: 1.VCI列挙 2.read-only CAN系応答 3.診断取込",
    startStatus: `${getInterfaceCandidateDisplayName(interfaceId)}を確認します。VCI列挙とread-only CAN系応答が見えるかを先に見ます。`,
    idleStatus: `${getInterfaceCandidateDisplayName(interfaceId)}を選択中です。VCI列挙とread-only CAN系応答の確認を先に進められます。`,
    readyStatus: `${getInterfaceCandidateDisplayName(interfaceId)}のローカルブリッジ確認済みです。次に VCI一覧、read-only 応答、診断取込の確認を進められます。`
  })
});

function getInterfaceCandidateGuide(interfaceId) {
  const builder = INTERFACE_CANDIDATE_GUIDE_BUILDERS[interfaceId];
  return typeof builder === "function" ? builder(interfaceId) : null;
}

function getInterfaceCandidateGuideByItem(item) {
  return getInterfaceCandidateGuide(item?.id);
}

function getRequestedInterfaceGuide() {
  return getInterfaceCandidateGuide(obdDevSession.requestedInterfaceId);
}

function getBridgeBackedImplementationChecks(item) {
  const builder = BRIDGE_BACKED_IMPLEMENTATION_CHECK_BUILDERS[item?.id];
  return typeof builder === "function" ? builder(item) : [];
}

function getElm327ImplementationChecks(item, connectionProfile, preparedRequests) {
  return [
    {
      label: ELM327_IMPLEMENTATION_CHECK_LABELS.webSerial,
      available: Boolean(connectionProfile?.interfaceType === "web-serial-obd-adapter")
    },
    {
      label: ELM327_IMPLEMENTATION_CHECK_LABELS.standardRead,
      available: ["read_stored_dtc", "read_live_pid_snapshot", "read_freeze_frame"].every((id) => preparedRequests.some((request) => request.id === id))
    },
    {
      label: ELM327_IMPLEMENTATION_CHECK_LABELS.liveConnection,
      available: item.connectionEnabled === true
    }
  ];
}

function getInterfaceConnectionCheckLabel(interfaceId) {
  return interfaceId === "user-vci-thinkcar-bluetooth" ? "実Bluetooth読取" : "実機読取";
}

function getInterfaceCandidateActionLabel(item) {
  const guide = getInterfaceCandidateGuideByItem(item);
  if (guide?.actionLabel) return guide.actionLabel;
  if (isBridgeBackedInterfaceCandidate(item?.id)) return "ローカルブリッジ確認";
  return Array.isArray(item?.verificationRequired) && item.verificationRequired.length
    ? `残り${item.verificationRequired.length}確認`
    : "候補管理";
}

function getInterfaceCandidateOperatorNote(item) {
  const guide = getInterfaceCandidateGuideByItem(item);
  if (guide?.operatorNote) return guide.operatorNote;
  return item?.integrationNote || "";
}

function getInterfaceCandidateCheckSummary(item) {
  const guide = getInterfaceCandidateGuideByItem(item);
  if (guide?.checkSummary) return guide.checkSummary;
  return summarizeRemainingChecks(item?.verificationRequired);
}

function startInterfaceCandidateCheck(item) {
  obdDevSession.requestedInterfaceId = item?.id || null;
  const guide = getInterfaceCandidateGuideByItem(item);
  const selectedVehicle = obdVehicleInput.value.trim();
  const selectedInterface = getSelectedObdInterfaceLabel();
  if (guide?.startStatus) obdDevStatus.textContent = `${selectedInterface}${selectedVehicle ? ` / ${selectedVehicle}` : ""} ${guide.startStatus}`;
  probeObdLocalBridge(getInterfaceCandidateProbeLabel(item));
}

function getInterfaceCandidateProbeLabel(item) {
  if (isBridgeBackedInterfaceCandidate(item?.id)) return `${getInterfaceCandidateDisplayName(item.id)}のローカルブリッジ確認`;
  return "ローカルブリッジ確認";
}

function getRequestedInterfaceIdleStatus() {
  const guide = getRequestedInterfaceGuide();
  if (guide?.idleStatus) return guide.idleStatus;
  return "";
}

function getRequestedInterfaceReadyStatus() {
  const guide = getRequestedInterfaceGuide();
  if (guide?.readyStatus) return guide.readyStatus;
  return "";
}

function clearRequestedInterfaceSelection() {
  obdDevSession.requestedInterfaceId = null;
}

function getObdInterfacePreviewConfig(interfaceId) {
  const capturedAt = new Date().toISOString();
  const sharedMonitorValues = [
    { id: "rpm", label: "エンジン回転数", category: "engine", value: 782, unit: "rpm", supportNote: "アイドル域として確認" },
    { id: "coolant", label: "冷却水温", category: "engine", value: 86, unit: "C", supportNote: "暖機後の参考値" },
    { id: "load", label: "計算負荷", category: "engine", value: 21.6, unit: "%", supportNote: "アイドル時の参考値" },
    { id: "throttle", label: "スロットル開度", category: "air", value: 14.1, unit: "%", supportNote: "吸気系と合わせて確認" },
    { id: "voltage", label: "制御電圧", category: "power", value: 14.2, unit: "V", supportNote: "発電状態の参考値" }
  ];
  const sharedFreezeFrame = [
    { id: "ff_rpm", label: "故障時回転数", category: "freeze-frame", value: 1640, unit: "rpm" },
    { id: "ff_load", label: "故障時負荷", category: "freeze-frame", value: 38.4, unit: "%" },
    { id: "ff_temp", label: "故障時冷却水温", category: "freeze-frame", value: 82, unit: "C" }
  ];
  const sharedReadiness = {
    milOn: true,
    incompleteCount: 1,
    monitorCount: 4,
    monitors: [
      { id: "misfire", label: "ミスファイア", supported: true, complete: true },
      { id: "fuel", label: "燃料系", supported: true, complete: true },
      { id: "catalyst", label: "触媒", supported: true, complete: false },
      { id: "evap", label: "EVAP", supported: true, complete: true }
    ]
  };
  const sharedEcuInfo = {
    itemCount: 4,
    items: [
      { id: "vin", label: "VIN", value: "JH4**************" },
      { id: "calid", label: "CAL ID", value: "SIM-ELM-001" },
      { id: "cvn", label: "CVN", value: "7A12F944" },
      { id: "ignition", label: "Ignition", value: "Spark" }
    ],
    keyItemSummary: {
      totalCount: 4,
      capturedCount: 4,
      capturedLabels: ["VIN", "CAL ID", "CVN", "Ignition"],
      missingLabels: []
    },
    supportInfoTypesSummary: {
      count: 3,
      labels: ["VIN", "CAL ID", "CVN"]
    }
  };
  const sharedMonitorTests = {
    testCount: 2,
    tests: [
      { id: "21/01", testId: "21", componentId: "01", value: 0.09, unit: "V", status: "pass" },
      { id: "31/02", testId: "31", componentId: "02", value: 0.42, unit: "ratio", status: "pass" }
    ]
  };
  const sharedSupportedPids = {
    supportedCount: 12,
    supportedPids: ["0104", "0105", "0106", "0107", "010B", "010C", "010D", "010F", "0110", "0111", "0142", "0151"]
  };
  const sharedCoverage = {
    progressPercent: 100,
    availableCategories: 7,
    totalCategories: 7,
    capturedCategories: 7,
    emptyCategories: 0,
    missingCategories: 0,
    missingLabels: [],
    emptyLabels: [],
    items: [
      { label: "DTC", count: 2, status: "captured", available: true },
      { label: "ライブデータ", count: 5, status: "captured", available: true },
      { label: "レディネス", count: 4, status: "captured", available: true },
      { label: "FF", count: 3, status: "captured", available: true },
      { label: "ECU情報", count: 4, status: "captured", available: true },
      { label: "Mode06", count: 2, status: "captured", available: true },
      { label: "対応PID", count: 12, status: "captured", available: true }
    ]
  };

  const table = {
    "user-vci-elm327": {
      label: "ELM327",
      adapterIdentity: { adapterName: "ELM327 Sample", adapterFamily: "ELM327", firmwareVersion: "v1.5-sim" },
      connectionStatus: { displayStatus: "読取前プレビュー中", nextAction: "読取はデスクトップ版Chrome系ブラウザのWeb Serialで確認" },
      dtcs: [
        { code: "P0171", status: "stored" },
        { code: "P0300", status: "pending" }
      ],
      ecuResponses: [{ address: "7E8", status: "ok", dtcCount: 2, services: ["01", "03", "09"], negativeResponseCount: 0 }],
      operatorNote: "スマホでは見え方確認のみ。読取はWeb Serial前提です。"
    },
    "user-vci-thinkcar-bluetooth": {
      label: "THINKCAR Bluetooth",
      adapterIdentity: { adapterName: "THINKCAR Sample", adapterFamily: "THINKCAR", firmwareVersion: "bt-sim" },
      connectionStatus: { displayStatus: "Bluetooth読取前プレビュー中", nextAction: "読取はスマホBT読取後にPCローカルブリッジで確認" },
      dtcs: [
        { code: "P0420", status: "stored" },
        { code: "P0133", status: "pending" }
      ],
      ecuResponses: [{ address: "7E8", status: "ok", dtcCount: 2, services: ["01", "03", "09"], negativeResponseCount: 0 }],
      operatorNote: "スマホ側でBluetooth読取を開始し、PC側ローカルブリッジへ流す前提です。"
    },
    "user-vci-techstream-j2534": {
      label: "J2534",
      adapterIdentity: { adapterName: "J2534 Sample", adapterFamily: "J2534 Pass-Thru", firmwareVersion: "drv-sim" },
      connectionStatus: { displayStatus: "J2534読取前プレビュー中", nextAction: "読取はPCドライバとローカルブリッジで確認" },
      dtcs: [
        { code: "U0100", status: "stored" },
        { code: "P0606", status: "permanent" }
      ],
      ecuResponses: [{ address: "7E0", status: "ok", dtcCount: 2, services: ["01", "03", "09"], negativeResponseCount: 0 }],
      operatorNote: "J2534はスマホ単体ではなくPC側ドライバ前提です。"
    }
  };
  const selected = table[interfaceId] || table["user-vci-elm327"];
  const previewRoute = interfaceId === "user-vci-thinkcar-bluetooth"
    ? "1.スマホBluetooth読取開始 2.PCローカルブリッジ確認 3.DTC/フリーズフレーム/ライブデータ/ECU情報確認"
    : interfaceId === "user-vci-techstream-j2534"
      ? "1.PCでJ2534ドライバ確認 2.ローカルブリッジ確認 3.VCI一覧/ECU情報/DTC確認"
      : "1.Web Serial読取開始 2.DTC/ライブデータ/FF確認 3.保存と比較";
  return {
    label: selected.label,
    statusText: `${selected.label}の読取前プレビューです。今見える項目を確認し、読取は ${selected.connectionStatus.nextAction}。`,
    previewStatus: `読取前プレビュー中: 今見える項目を確認。読取は ${selected.connectionStatus.nextAction}`,
    previewGuide: [
      `スマホ単体: ${interfaceId === "user-vci-thinkcar-bluetooth" ? "Bluetooth読取開始までは進行可" : "表示確認のみ"}`,
      `読取入口: ${selected.connectionStatus.nextAction.replace(/^読取は/, "").replace(/で確認$/, "")}`,
      `操作順: ${previewRoute}`,
      "表示項目: DTC / フリーズフレーム / ライブデータ / ECU情報 / Mode06 / 対応PID"
    ],
    bridgeVciList: {
      deviceCount: 1,
      driverStatus: interfaceId === "user-vci-elm327" ? "not_required" : "sample_ready",
      devices: [
        {
          id: interfaceId,
          label: selected.label,
          connected: false,
          selected: true,
          driverStatus: interfaceId === "user-vci-elm327" ? "not_required" : "sample_ready"
        }
      ]
    },
    session: {
      protocol: interfaceId === "user-vci-elm327" ? "ELM327" : "local_bridge_preview",
      capturedAt,
      warnings: ["confirm_dtc_with_service_manual"],
      connectionStatus: selected.connectionStatus,
      adapterIdentity: selected.adapterIdentity,
      vciDevices: [
        {
          id: interfaceId,
          label: selected.label,
          connected: false,
          selected: true,
          driverStatus: interfaceId === "user-vci-elm327" ? "not_required" : "sample_ready"
        }
      ],
      dtcSnapshot: {
        dtcs: selected.dtcs,
        capturedAt,
        ecuResponses: selected.ecuResponses
      },
      livePidSnapshot: {
        monitorValues: sharedMonitorValues,
        monitorInsights: [
          { level: "caution", title: "読取前プレビュー", detail: "実車値ではありません。表示確認用です。", nextStep: "実車では同条件で再測定する" }
        ]
      },
      readinessSnapshot: sharedReadiness,
      freezeFrameSnapshot: {
        monitorValues: sharedFreezeFrame
      },
      ecuInfoSnapshot: sharedEcuInfo,
      onboardMonitorSnapshot: sharedMonitorTests,
      supportedPidMatrix: sharedSupportedPids,
      ecuResponseSummary: {
        ecus: selected.ecuResponses
      },
      readoutCoverage: sharedCoverage
    }
  };
}

function loadObdInterfacePreviewSample(interfaceId) {
  const preview = getObdInterfacePreviewConfig(interfaceId);
  obdDevSession.previewMode = interfaceId;
  obdDevSession.connectedAt = new Date().toISOString();
  obdDevSession.bridgeStatus = preview.session.connectionStatus;
  obdDevSession.bridgeVciList = preview.bridgeVciList;
  obdDevSession.adapterIdentity = preview.session.adapterIdentity;
  obdDevSession.lastSession = preview.session;

  const monitorValues = preview.session.livePidSnapshot?.monitorValues || [];
  const insights = preview.session.livePidSnapshot?.monitorInsights || [];
  const dtcs = preview.session.dtcSnapshot?.dtcs || [];
  renderObdMonitorValues(monitorValues, insights);
  obdDetectedCodes.innerHTML = "";
  dtcs.forEach((item) => {
    if (item?.code) obdDetectedCodes.appendChild(createObdDtcCard(item.code));
  });
  obdImportStatus.textContent = dtcs.length
    ? `${preview.label}プレビューのDTC ${dtcs.length}件を表示しています。`
    : `${preview.label}プレビューでDTCは0件です。`;
  if (obdPreviewStatus) obdPreviewStatus.textContent = preview.previewStatus;
  if (obdPreviewGuide) {
    obdPreviewGuide.innerHTML = "";
    preview.previewGuide.forEach((line, index) => {
      const item = document.createElement("span");
      const strong = document.createElement("strong");
      strong.textContent = index === 0 ? "端末" : index === 1 ? "実経路" : "内容";
      item.append(strong, document.createTextNode(line));
      obdPreviewGuide.appendChild(item);
    });
  }
  obdDevStatus.textContent = preview.statusText;
  renderObdDeveloperGate();
  renderObdDeveloperSessionSummary(preview.session);
}

function startGeneralBridgeCheck() {
  clearRequestedInterfaceSelection();
  probeObdLocalBridge();
}

function renderObdProgressOverview() {
  if (!obdProgressGrid) return;

  const selectedInterface = getSelectedObdInterfaceLabel();
  const autoRouteNote = isObdInterfaceAutoRequested()
    ? `${getObdInterfaceSelectionNote()} (${selectedInterface})`
    : `現在は ${selectedInterface} を手動選択`;
  const interfacePhases = window.ObdReadOnly?.getAdvancedInterfaceRoadmap?.() || [];
  const interfaceCatalog = window.ObdReadOnly?.getVehicleInterfaceCatalog?.() || [];
  const interfaceCatalogStates = interfaceCatalog.map((item) => getInterfaceCatalogDisplayState(item));
  const capabilityItems = getCapabilityDisplayItems(dataStore.diagnosticCapabilityStatus || []);
  const coverageItems = getCoverageRoadmapDisplayItems(dataStore.diagnosticCoverageRoadmap || []);
  const readoutCapabilityIds = new Set([
    "capability-generic-obd2-dtc",
    "capability-live-data",
    "capability-local-bridge",
    "capability-guided-diagnostics"
  ]);

  const phaseProgress = averageProgressPercent(interfacePhases.map((item) => getInterfaceProgressState(item.id)?.progressPercent));
  const candidateProgress = averageProgressPercent(interfaceCatalogStates.map((item) => item.progressPercent));
  const interfaceProgress = averageProgressPercent([phaseProgress, candidateProgress]);
  const capabilityProgress = averageProgressPercent(capabilityItems.map((item) => item.progress_percent));
  const coverageProgress = averageProgressPercent(coverageItems.map((item) => item.progress_percent));
  const readoutProgress = averageProgressPercent(
    capabilityItems.filter((item) => readoutCapabilityIds.has(item.id)).map((item) => item.progress_percent)
  );
  const overallProgress = averageProgressPercent([capabilityProgress, coverageProgress, interfaceProgress]);

  const interfaceEtas = summarizeEtaTargets([
    ...interfacePhases.map((item) => getInterfaceProgressState(item.id)?.etaTarget),
    ...interfaceCatalogStates.map((item) => item.etaTarget)
  ]);
  const capabilityEtas = summarizeEtaTargets(capabilityItems.map((item) => item.eta_target));
  const coverageEtas = summarizeEtaTargets(coverageItems.map((item) => item.eta_target));
  const weakestCapabilities = summarizeLowestProgress(capabilityItems, (item) => item.label, (item) => item.progress_percent);
  const weakestCoverage = summarizeLowestProgress(coverageItems, (item) => item.label, (item) => item.progress_percent);
  const weakestInterfaces = summarizeLowestProgress(interfaceCatalogStates, (item) => item.label, (item) => item.progressPercent);
  const upcomingInterfaces = summarizeUpcomingReadiness(
    interfaceCatalogStates,
    (item) => item.label,
    (item) => item.progressPercent,
    (item) => item.etaTarget
  );
  const upcomingCapabilities = summarizeUpcomingReadiness(
    capabilityItems,
    (item) => item.label,
    (item) => item.progress_percent,
    (item) => item.eta_target
  );
  const allEtas = [
    ...capabilityItems.map((item) => item.eta_target),
    ...coverageItems.map((item) => item.eta_target),
    ...interfaceCatalogStates.map((item) => item.etaTarget)
  ].filter((value) => typeof value === "string" && value.length > 0);
  const q3Targets = allEtas.filter((value) => value.startsWith("2026-Q3")).length;
  const q4Targets = allEtas.filter((value) => value.startsWith("2026-Q4")).length;

  const cards = [
    {
      title: "開発優先方針",
      primary: "パスワード内の統合OBD診断機を最優先",
      detail: "先に OBD読取、VCI読取、保存、レポートを診断機側で固める。"
    },
    {
      title: "完成度",
      primary: `診断機全体 ${overallProgress}% / OBD2読取 ${readoutProgress}%`,
      detail: `機能 ${capabilityProgress}% / 網羅 ${coverageProgress}% / 読取 ${interfaceProgress}%`
    },
    {
      title: "完了見込み",
      primary: `Q3目標 ${q3Targets}系統 / Q4目標 ${q4Targets}系統`,
      detail: `先に進む候補: ${upcomingInterfaces || upcomingCapabilities || summarizeEtaTargets(allEtas, 3)}`
    },
    {
      title: "対応インターフェース",
      primary: `候補 ${interfaceCatalogStates.length}件 / 平均 ${candidateProgress}%`,
      detail: `${autoRouteNote} / 遅れ: ${weakestInterfaces || "集計中"}`
    },
    {
      title: "読取機能",
      primary: `DTC / PID / FF / ECU情報 / Mode06 平均 ${readoutProgress}%`,
      detail: `先に使う機能: ${upcomingCapabilities || "集計中"} / 遅れ: ${weakestCapabilities || "集計中"}`
    },
    {
      title: "データ網羅",
      primary: `P/U/B/C/OEM/作業支援 平均 ${coverageProgress}%`,
      detail: `遅れ: ${weakestCoverage || "集計中"} / 目標: ${coverageEtas}`
    },
    {
      title: "判定基準",
      primary: "数字は実装済みだけを反映",
      detail: "読取、整形、取込、比較、保存まで入った分だけ更新する。"
    }
  ];

  obdProgressGrid.innerHTML = "";
  cards.forEach((card, index) => {
    const article = document.createElement("article");
    article.className = index === 0
      ? "obd-progress-score-card"
      : index === 1
        ? "obd-progress-breakdown-card"
        : "";

    const title = document.createElement("strong");
    title.textContent = card.title;
    const primary = document.createElement("span");
    if (index === 0) primary.className = "obd-progress-score";
    primary.textContent = card.primary;
    const detail = document.createElement("span");
    detail.textContent = card.detail;

    article.append(title, primary, detail);
    obdProgressGrid.appendChild(article);
  });
}

function renderObdDeveloperGate(capability = window.ObdReadOnly?.getCapability?.()) {
  const unlocked = obdDevModeUnlocked === true;
  const connected = Boolean(obdDevSession.port);
  const previewActive = Boolean(obdDevSession.previewMode);
  const serialReady = capability?.secureContext === true && capability?.webSerialSupported === true;
  const selectedVehicle = obdVehicleInput.value.trim();
  const selectedInterface = getSelectedObdInterfaceLabel();
  const selectedInterfaceId = resolveObdInterfaceId(capability);
  const primaryActionNeedsSerial = selectedInterfaceId === "user-vci-elm327";

  obdDevModeBadge.textContent = unlocked ? "詳細有効" : "ロック中";
  obdDevControls.hidden = !unlocked;
  obdDevLockButton.disabled = !unlocked;
  obdDevConnectButton.disabled = !unlocked || connected || (primaryActionNeedsSerial && !serialReady);
  obdDevConnectButton.textContent = getObdPrimaryActionLabel(selectedInterfaceId, { unlocked, connected, serialReady });
  obdDevIdentifyButton.disabled = !unlocked || !connected;
  obdDevReadDtcButton.disabled = !unlocked || !connected;
  obdDevSnapshotButton.disabled = !unlocked || !connected;
  obdDevBridgeStatusButton.disabled = !unlocked;
  obdDevBridgeVciButton.disabled = !unlocked || !obdDevSession.bridgeEndpoint;
  obdDevBridgeDtcButton.disabled = !unlocked || !obdDevSession.bridgeEndpoint;
  obdDevBridgePendingDtcButton.disabled = !unlocked || !obdDevSession.bridgeEndpoint;
  obdDevBridgePermanentDtcButton.disabled = !unlocked || !obdDevSession.bridgeEndpoint;
  obdDevBridgeEcuInfoButton.disabled = !unlocked || !obdDevSession.bridgeEndpoint;
  obdDevBridgeMonitorButton.disabled = !unlocked || !obdDevSession.bridgeEndpoint;
  obdDevBridgeSupportedPidButton.disabled = !unlocked || !obdDevSession.bridgeEndpoint;
  obdDevBridgeFreezeFrameButton.disabled = !unlocked || !obdDevSession.bridgeEndpoint;
  obdDevBridgeLiveButton.disabled = !unlocked || !obdDevSession.bridgeEndpoint;
  obdDevDisconnectButton.disabled = !connected;
  obdDevConnectionState.textContent = connected
    ? selectedInterfaceId === "user-vci-elm327"
      ? "Web Serial読取中"
      : `${selectedInterface} 読取中`
    : obdDevSession.bridgeEndpoint
      ? selectedInterfaceId === "user-vci-techstream-j2534"
        ? "J2534ローカルブリッジ確認済み"
        : selectedInterfaceId === "user-vci-thinkcar-bluetooth"
          ? "Bluetoothローカルブリッジ確認済み"
          : "ローカルブリッジ確認済み"
      : previewActive
        ? selectedInterfaceId === "user-vci-techstream-j2534"
          ? "J2534読取前プレビュー中"
          : selectedInterfaceId === "user-vci-thinkcar-bluetooth"
            ? "Bluetooth読取前プレビュー中"
            : "読取前プレビュー中"
        : "読取待機中";

  if (!unlocked) {
    obdDevStatus.textContent = "この端末に詳細トークンを設定した場合だけ詳細読取メニューを有効化できます。送信は読取専用のみです。";
  } else if (primaryActionNeedsSerial && !serialReady) {
    obdDevStatus.textContent = "Web Serial対応のデスクトップ版Chrome系ブラウザとHTTPS環境が必要です。";
  } else if (!connected) {
    const requestedStatus = obdDevSession.bridgeEndpoint
      ? getRequestedInterfaceReadyStatus()
      : getRequestedInterfaceIdleStatus();
    const defaultReadyMessage = selectedInterfaceId === "user-vci-elm327"
      ? "ELM327/STN の読取を開始できます。"
      : selectedInterfaceId === "user-vci-techstream-j2534"
        ? "J2534 の VCI一覧、アダプター識別、read-only ECU情報/DTC確認を続けられます。"
        : selectedInterfaceId === "user-vci-thinkcar-bluetooth"
          ? "Bluetooth の DTC、フリーズフレーム、ライブデータ、ECU情報確認を続けられます。"
      : `${selectedInterface} の read-only 確認を続けられます。`;
    const defaultIdleMessage = selectedInterfaceId === "user-vci-elm327"
      ? `${selectedInterface}${selectedVehicle ? ` / ${selectedVehicle}` : ""} を選択中です。Web SerialのELM327/STN読取を試せます。`
      : `${selectedInterface}${selectedVehicle ? ` / ${selectedVehicle}` : ""} を選択中です。ローカルブリッジ経由のread-only確認を試せます。`;
    obdDevStatus.textContent = obdDevSession.bridgeEndpoint
      ? requestedStatus || `ローカルブリッジ確認済みです。${defaultReadyMessage}`
      : previewActive
        ? obdDevStatus.textContent
        : requestedStatus || defaultIdleMessage;
  }

  renderObdPreviewButtons();
  renderObdWorkflowGuide(capability);
  renderObdDeveloperSessionSummary(obdDevSession.lastSession);
}

async function unlockObdAccess() {
  if (!crypto?.subtle) {
    obdAccessStatus.textContent = "このブラウザではパスワード照合を開始できません。";
    return;
  }
  obdAccessUnlockButton.disabled = true;
  const passwordHash = await hashObdAccessPassword(obdAccessPasswordInput.value);
  if (passwordHash !== OBD_ACCESS_PASSWORD_HASH) {
    obdAccessUnlockButton.disabled = false;
    obdAccessStatus.textContent = "パスワードが違います。";
    return;
  }
  obdAccessUnlocked = true;
  sessionStorage.setItem(OBD_ACCESS_MODE_KEY, "enabled");
  obdAccessPasswordInput.value = "";
  obdAccessUnlockButton.disabled = false;
  renderObdAccessGate();
}

function lockObdAccess() {
  obdAccessUnlocked = false;
  sessionStorage.removeItem(OBD_ACCESS_MODE_KEY);
  obdAccessPasswordInput.value = "";
  renderObdAccessGate();
}

function unlockObdDeveloperMode() {
  const configuredToken = localStorage.getItem(OBD_DEV_TOKEN_KEY) || "";
  if (configuredToken.length < 12) {
    obdDevStatus.textContent = "この端末に詳細トークンが未設定です。";
    return;
  }
  if (obdDevPasswordInput.value !== configuredToken) {
    obdDevStatus.textContent = "詳細トークンが違います。";
    return;
  }
  obdDevModeUnlocked = true;
  sessionStorage.setItem(OBD_DEV_MODE_KEY, "enabled");
  obdDevPasswordInput.value = "";
  obdDevStatus.textContent = "詳細読取メニューを有効化しました。読取系コマンドだけ使用できます。";
  renderObdDeveloperGate();
}

function lockObdDeveloperMode() {
  obdDevModeUnlocked = false;
  sessionStorage.removeItem(OBD_DEV_MODE_KEY);
  obdDevSession.previewMode = null;
  clearRequestedInterfaceSelection();
  obdDevStatus.textContent = "詳細読取メニューをロックしました。";
  renderObdDeveloperGate();
}

function handleObdPrimaryAction() {
  const interfaceId = resolveObdInterfaceId();
  if (interfaceId === "user-vci-elm327") {
    void connectObdDeveloperVci();
    return;
  }
  prepareSelectedObdInterface();
}

async function connectObdDeveloperVci() {
  if (!obdDevModeUnlocked) return;
  if (!("serial" in navigator)) {
    obdDevStatus.textContent = "このブラウザはWeb Serialに対応していません。";
    return;
  }

  try {
    obdDevSession.previewMode = null;
    clearRequestedInterfaceSelection();
    const baudRate = Number(obdDevBaudRate.value) || 38400;
    obdDevStatus.textContent = "VCIを選択してください。";
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate });
    obdDevSession.port = port;
    obdDevSession.reader = port.readable.getReader();
    obdDevSession.writer = port.writable.getWriter();
    obdDevSession.decoder = new TextDecoder();
    obdDevSession.encoder = new TextEncoder();
    obdDevSession.textBuffer = "";
    obdDevSession.readLoopActive = true;
    obdDevSession.lastRawText = "";
    obdDevSession.connectedAt = new Date().toISOString();
    obdDevSession.lastSession = null;
    obdDevStatus.textContent = `VCI読取を開始しました。通信速度 ${baudRate}。`;
    readElmDeveloperLoop();
    renderObdDeveloperGate();
    await initializeElmDeveloperAdapter();
  } catch (error) {
    obdDevStatus.textContent = `読取を開始できませんでした: ${error?.message || error}`;
    await disconnectObdDeveloperVci();
  }
}

async function disconnectObdDeveloperVci() {
  const { reader, writer, port } = obdDevSession;
  obdDevSession.reader = null;
  obdDevSession.writer = null;
  obdDevSession.port = null;
  obdDevSession.readLoopActive = false;

  try {
    if (reader) {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    if (writer) {
      writer.releaseLock();
    }
    if (port) {
      await port.close().catch(() => {});
    }
  } finally {
    clearRequestedInterfaceSelection();
    obdDevStatus.textContent = "VCI読取を停止しました。";
    renderObdDeveloperGate();
  }
}

async function initializeElmDeveloperAdapter() {
  const initCommands = ["ATZ", "ATE0", "ATL0", "ATS0", "ATH1", "ATSP0"];
  const responses = [];
  for (const command of initCommands) {
    responses.push(`${command}\n${await sendElmDeveloperCommand(command, 2500)}`);
  }
  appendObdDeveloperLog(responses.join("\n"));
  obdDevStatus.textContent = "VCI初期化を送信しました。次にVCI確認、DTC読取、ライブデータ読取を試せます。";
  renderObdDeveloperGate();
}

async function identifyObdDeveloperVci() {
  await runObdDeveloperRead("VCI確認", ["ATI", "AT@1"]);
}

async function readObdDeveloperDtc() {
  await runObdDeveloperRead("DTC読取", ["03", "07"]);
}

async function readObdDeveloperPermanentDtc() {
  await runObdDeveloperRead("永久DTC読取", ["0A"]);
}

async function readObdDeveloperLiveSnapshot() {
  await runObdDeveloperRead("ライブデータ読取", ["0100", ...obdDevSession.selectedPidList]);
}

async function probeObdLocalBridge(contextLabel = "ローカルブリッジ") {
  try {
    obdDevStatus.textContent = `${contextLabel}を確認しています。`;
    const response = await sendObdLocalBridgeStatusIntent("bridge_status", {}, { discover: true });
    const status = window.ObdReadOnly.normalizeBridgeConnectionStatus(response);
    obdDevSession.bridgeStatus = status;
    try {
      const adapterResponse = await sendObdLocalBridgeStatusIntent("adapter_identity", {});
      obdDevSession.adapterIdentity = window.ObdReadOnly.normalizeBridgeAdapterIdentity(adapterResponse);
    } catch (adapterError) {
      obdDevSession.adapterIdentity = null;
      appendObdDeveloperLog(`adapter_identity\n${adapterError?.message || adapterError}`);
    }
    const adapterLabel = obdDevSession.adapterIdentity?.adapterName || obdDevSession.adapterIdentity?.adapterFamily || "識別未取得";
    obdDevStatus.textContent = `${contextLabel}: ${status.displayStatus} / ${adapterLabel}`;
    renderObdDeveloperSessionSummary(null);
  } catch (error) {
    obdDevStatus.textContent = `${contextLabel}を確認できません: ${error?.message || error}`;
  } finally {
    renderObdDeveloperGate();
  }
}

async function listObdLocalBridgeVci() {
  await runObdLocalBridgeRead("VCI一覧", "list_vci", {}, (response) => {
    const vciList = window.ObdReadOnly.normalizeBridgeVciList(response);
    obdDevSession.bridgeVciList = vciList;
    obdDevStatus.textContent = `VCI ${vciList.deviceCount}件 / Driver ${vciList.driverStatus}`;
    renderObdDeveloperSessionSummary(null);
  });
}

async function readObdLocalBridgeDtc() {
  await runObdLocalBridgeRead("ブリッジDTC読取", "read_stored_dtc", {}, (response) => {
    renderObdBridgeReadout({ dtcResponse: { ...response, intent: "read_stored_dtc" } });
  });
}

async function readObdLocalBridgePendingDtc() {
  await runObdLocalBridgeRead("ブリッジ保留DTC読取", "read_pending_dtc", {}, (response) => {
    renderObdBridgeReadout({ dtcResponse: { ...response, intent: "read_pending_dtc" } });
  });
}

async function readObdLocalBridgePermanentDtc() {
  await runObdLocalBridgeRead("ブリッジ永久DTC読取", "read_permanent_dtc", {}, (response) => {
    renderObdBridgeReadout({ dtcResponse: { ...response, intent: "read_permanent_dtc" } });
  });
}

async function readObdLocalBridgeEcuInfo() {
  await runObdLocalBridgeRead("ブリッジECU情報読取", "read_ecu_info", {}, (response) => {
    renderObdBridgeReadout({ ecuInfoResponse: response });
  });
}

async function readObdLocalBridgeOnboardMonitor() {
  await runObdLocalBridgeRead("ブリッジ監視結果読取", "read_onboard_monitor", {}, (response) => {
    renderObdBridgeReadout({ onboardMonitorResponse: response });
  });
}

async function readObdLocalBridgeSupportedPids() {
  await runObdLocalBridgeRead("ブリッジ対応PID読取", "read_supported_pids", {}, (response) => {
    renderObdBridgeReadout({ supportedPidResponse: response });
  });
}

async function readObdLocalBridgeFreezeFrame() {
  await runObdLocalBridgeRead("ブリッジフリーズフレーム読取", "read_freeze_frame", {}, (response) => {
    renderObdBridgeReadout({ freezeFrameResponse: response });
  });
}

async function readObdLocalBridgeLiveSnapshot() {
  await runObdLocalBridgeRead("ブリッジライブ読取", "read_live_pid_snapshot", {}, (response) => {
    renderObdBridgeReadout({ livePidResponse: response });
  });
}

async function runObdLocalBridgeRead(label, intent, payload, onSuccess) {
  if (!obdDevModeUnlocked) return;
  try {
    obdDevStatus.textContent = `${label}中です。`;
    const response = await sendObdLocalBridgeIntent(intent, payload);
    if (response.blocked === true || response.ok === false) {
      throw new Error((response.errors || []).join(" / ") || "bridge_response_not_ok");
    }
    onSuccess(response);
    obdDevStatus.textContent = `${label}が完了しました。`;
  } catch (error) {
    obdDevStatus.textContent = `${label}に失敗しました: ${error?.message || error}`;
  } finally {
    renderObdDeveloperGate();
  }
}

async function sendObdLocalBridgeIntent(intent, payload = {}, options = {}) {
  if (!isAllowedLocalBridgeIntent(intent)) throw new Error(`許可していないIntentです: ${intent}`);
  const pairingToken = localStorage.getItem(OBD_DEV_TOKEN_KEY) || "";
  if (pairingToken.length < 12) throw new Error("詳細トークンが未設定です。");
  const request = {
    request_id: generateId(),
    api_version: "v1",
    intent,
    timestamp: new Date().toISOString(),
    pairing_token: pairingToken,
    data: payload
  };

  const endpoints = options.discover || !obdDevSession.bridgeEndpoint
    ? OBD_LOCAL_BRIDGE_PORTS.flatMap((port) => OBD_LOCAL_BRIDGE_PATHS.map((path) => `http://127.0.0.1:${port}${path}`))
    : [obdDevSession.bridgeEndpoint];

  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        cache: "no-store"
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      obdDevSession.bridgeEndpoint = endpoint;
      return json;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("local_bridge_not_found");
}

function isAllowedLocalBridgeIntent(intent) {
  return [
    "bridge_status",
    "list_vci",
    "adapter_identity",
    "read_stored_dtc",
    "read_pending_dtc",
    "read_permanent_dtc",
    "read_freeze_frame",
    "read_supported_pids",
    "read_ecu_info",
    "read_onboard_monitor",
    "read_live_pid_snapshot"
  ].includes(intent);
}

function isSafeLocalBridgeIntent(intent) {
  return ["bridge_status", "list_vci", "adapter_identity"].includes(intent);
}

async function sendObdLocalBridgeStatusIntent(intent, payload = {}, options = {}) {
  if (!isSafeLocalBridgeIntent(intent)) {
    throw new Error(`unsupported_public_local_bridge_intent ${intent}`);
  }
  const request = {
    request_id: generateId(),
    api_version: "v1",
    intent,
    timestamp: new Date().toISOString(),
    data: payload
  };
  const endpoints = options.discover || !obdDevSession.bridgeEndpoint
    ? OBD_LOCAL_BRIDGE_PORTS.flatMap((port) => OBD_LOCAL_BRIDGE_PATHS.map((path) => `http://127.0.0.1:${port}${path}`))
    : [obdDevSession.bridgeEndpoint];

  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        cache: "no-store"
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      obdDevSession.bridgeEndpoint = endpoint;
      return json;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("local_bridge_not_found");
}

async function runObdDeveloperRead(label, commands) {
  if (!obdDevSession.writer || !obdDevSession.reader) {
    obdDevStatus.textContent = "VCI読取が開始されていません。";
    return;
  }

  try {
    obdDevStatus.textContent = `${label}中です。`;
    const chunks = [];
    for (const command of commands) {
      chunks.push(`>${command}`);
      chunks.push(await sendElmDeveloperCommand(command, 3500));
    }
    appendObdDeveloperLog(chunks.join("\n"));
    const session = window.ObdReadOnly.buildScanSessionFromObdText(obdDevSession.lastRawText, {
      session_id: "web-serial-dev-readout",
      protocol: "ELM327"
    });
    obdDevSession.lastSession = session;
    renderObdDeveloperReadout(session);
    obdDevStatus.textContent = `${label}が完了しました。取れた値だけ表示します。`;
  } catch (error) {
    obdDevStatus.textContent = `${label}に失敗しました: ${error?.message || error}`;
  } finally {
    renderObdDeveloperGate();
  }
}

async function sendElmDeveloperCommand(command, timeoutMs = 3000) {
  const normalized = String(command || "").trim().toUpperCase();
  if (!isAllowedObdDeveloperCommand(normalized)) {
    throw new Error(`許可していないコマンドです: ${normalized}`);
  }
  obdDevSession.textBuffer = "";
  await obdDevSession.writer.write(obdDevSession.encoder.encode(`${normalized}\r`));
  return readElmDeveloperResponse(timeoutMs);
}

function isAllowedObdDeveloperCommand(command) {
  return [
    "ATZ", "ATE0", "ATL0", "ATS0", "ATH1", "ATSP0", "ATI", "AT@1",
    "03", "07", "0A", "0100",
    ...obdDevSession.selectedPidList
  ].includes(command);
}

async function readElmDeveloperLoop() {
  while (obdDevSession.readLoopActive && obdDevSession.reader) {
    try {
      const result = await obdDevSession.reader.read();
      if (result.done) break;
      obdDevSession.textBuffer += obdDevSession.decoder.decode(result.value || new Uint8Array(), { stream: true });
      obdDevSession.textBuffer = obdDevSession.textBuffer.slice(-12000);
    } catch (_error) {
      if (obdDevSession.readLoopActive) {
        obdDevStatus.textContent = "VCI受信が停止しました。読取をやり直してください。";
      }
      break;
    }
  }
}

async function readElmDeveloperResponse(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (obdDevSession.textBuffer.includes(">")) break;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return obdDevSession.textBuffer.replace(/[>\r]/g, "").trim();
}

function appendObdDeveloperLog(text) {
  const sanitized = window.ObdReadOnly.redactSensitiveText(String(text || ""));
  obdDevSession.lastRawText = [obdDevSession.lastRawText, sanitized].filter(Boolean).join("\n").slice(-20000);
}

function renderObdDeveloperReadout(session) {
  renderObdImportToolHints();
  const monitorValues = session.livePidSnapshot?.monitorValues || [];
  const codes = session.dtcSnapshot?.dtcs?.map((item) => item.code).filter(Boolean) || [];
  obdScannerText.value = obdDevSession.lastRawText;
  analyzeObdScannerImport();
  if (monitorValues.length) renderObdMonitorValues(monitorValues, session.livePidSnapshot.monitorInsights || []);
  if (codes.length) {
    obdDetectedCodes.innerHTML = "";
    [...new Set(codes)].forEach((code) => obdDetectedCodes.appendChild(createObdDtcCard(code)));
    obdImportStatus.textContent = `${codes.length}件の車両DTCを読取りました。`;
  }
  renderObdDeveloperSessionSummary(session);
}

function renderObdBridgeReadout(parts = {}) {
  renderObdImportToolHints();
  const previousSession = obdDevSession.lastSession || {};
  const currentDtcSnapshot = parts.dtcResponse
    ? window.ObdReadOnly.normalizeBridgeDtcSnapshot(parts.dtcResponse)
    : null;
  const dtcSnapshot = mergeObdBridgeDtcSnapshots(previousSession.dtcSnapshot, currentDtcSnapshot);
  const livePidSnapshot = parts.livePidResponse
    ? window.ObdReadOnly.normalizeBridgeLivePidSnapshot(parts.livePidResponse)
    : previousSession.livePidSnapshot || null;
  const readinessSnapshot = parts.livePidResponse
    ? window.ObdReadOnly.normalizeBridgeReadinessSnapshot(parts.livePidResponse)
    : previousSession.readinessSnapshot || null;
  const freezeFrameSnapshot = parts.freezeFrameResponse
    ? window.ObdReadOnly.normalizeBridgeFreezeFrameSnapshot(parts.freezeFrameResponse)
    : previousSession.freezeFrameSnapshot || null;
  const ecuInfoSnapshot = parts.ecuInfoResponse
    ? window.ObdReadOnly.normalizeBridgeEcuInfoSnapshot(parts.ecuInfoResponse)
    : previousSession.ecuInfoSnapshot || null;
  const onboardMonitorSnapshot = parts.onboardMonitorResponse
    ? window.ObdReadOnly.normalizeBridgeOnboardMonitorSnapshot(parts.onboardMonitorResponse)
    : previousSession.onboardMonitorSnapshot || null;
  const supportedPidMatrix = parts.supportedPidResponse
    ? window.ObdReadOnly.normalizeBridgeSupportedPidSnapshot(parts.supportedPidResponse)
    : previousSession.supportedPidMatrix || null;
  const importResult = window.ObdReadOnly.buildBridgeDiagnosticImport({
    dtcSnapshot: dtcSnapshot || undefined,
    livePidSnapshot: livePidSnapshot || undefined,
    readinessSnapshot: readinessSnapshot || undefined,
    freezeFrameSnapshot: freezeFrameSnapshot || undefined,
    ecuInfoSnapshot: ecuInfoSnapshot || undefined,
    onboardMonitorSnapshot: onboardMonitorSnapshot || undefined,
    supportedPidMatrix: supportedPidMatrix || undefined,
    connectionStatus: obdDevSession.bridgeStatus || undefined,
    vciList: obdDevSession.bridgeVciList || undefined
  });
  const session = window.ObdReadOnly.buildDiagnosticScanSession({
    session_id: "local-bridge-dev-readout",
    dtcSnapshot: dtcSnapshot || { dtcs: [] },
    livePidSnapshot: livePidSnapshot || { values: [] },
    readinessSnapshot: readinessSnapshot || { monitors: [] },
    freezeFrameSnapshot: freezeFrameSnapshot || { values: [] },
    ecuInfoSnapshot: ecuInfoSnapshot || { values: [] },
    onboardMonitorSnapshot: onboardMonitorSnapshot || { tests: [] },
    supportedPidMatrix: supportedPidMatrix || { supported_pids: [] },
    ecuResponseSummary: importResult.ecuResponseSummary,
    connectionStatus: importResult.connectionStatus || importResult.bridgeSession?.connectionStatus,
    vciDevices: importResult.vciDevices || importResult.bridgeSession?.vciDevices,
    adapterIdentity: obdDevSession.adapterIdentity || importResult.adapterIdentity || importResult.bridgeSession?.adapterIdentity || undefined
  });
  obdDevSession.lastSession = session;
  const monitorValues = livePidSnapshot?.monitorValues || [];
  const freezeFrameValues = freezeFrameSnapshot?.monitorValues || [];
  const currentCodes = currentDtcSnapshot?.dtcs?.map((item) => item.code).filter(Boolean) || [];

  if (monitorValues.length) {
    renderObdMonitorValues(monitorValues, livePidSnapshot.monitorInsights || []);
  } else if (freezeFrameValues.length) {
    renderObdMonitorValues(freezeFrameValues, freezeFrameSnapshot.monitorInsights || []);
  }
  if (currentCodes.length) {
    obdDetectedCodes.innerHTML = "";
    [...new Set(dtcSnapshot.dtcs.map((item) => item.code).filter(Boolean))].forEach((code) => obdDetectedCodes.appendChild(createObdDtcCard(code)));
    const statusSummary = formatObdBridgeDtcStatusSummary(dtcSnapshot.dtcs);
    obdImportStatus.textContent = `${currentCodes.length}件のブリッジDTCを読取りました。累計${dtcSnapshot.dtcs.length}件です。${statusSummary}`;
  } else if (currentDtcSnapshot) {
    obdImportStatus.textContent = "ブリッジDTC応答を受け取りました。DTCは0件です。";
  } else if (parts.freezeFrameResponse && freezeFrameSnapshot) {
    const triggerSummary = freezeFrameSnapshot.triggerDtc ? ` 起点${freezeFrameSnapshot.triggerDtc}` : "";
    obdImportStatus.textContent = freezeFrameValues.length
      ? `ブリッジフリーズフレームを${freezeFrameValues.length}項目読取りました。${triggerSummary}`.trim()
      : "ブリッジフリーズフレーム応答を受け取りました。項目は0件です。";
  } else if (parts.ecuInfoResponse && ecuInfoSnapshot) {
    const keySummary = ecuInfoSnapshot.keyItemSummary?.totalCount
      ? ` 主要${ecuInfoSnapshot.keyItemSummary.capturedCount}/${ecuInfoSnapshot.keyItemSummary.totalCount}件`
      : "";
    const missingLabels = ecuInfoSnapshot.keyItemSummary?.missingLabels?.slice(0, 2).join(" / ");
    const missingKeySummary = ecuInfoSnapshot.keyItemSummary?.missingCount
      ? ` / 未取得${ecuInfoSnapshot.keyItemSummary.missingCount}件${missingLabels ? ` (${missingLabels})` : ""}`
      : "";
    const supportedLabels = ecuInfoSnapshot.supportInfoTypesSummary?.labels?.slice(0, 2).join(" / ");
    const supportedTypeSummary = ecuInfoSnapshot.supportInfoTypesSummary?.count
      ? ` / Mode09対応${ecuInfoSnapshot.supportInfoTypesSummary.count}件${supportedLabels ? ` (${supportedLabels})` : ""}`
      : "";
    const unsupportedSummary = ecuInfoSnapshot.supportInfoTypesCaptured === false ? " / Mode09対応情報タイプ00は未取得" : "";
    obdImportStatus.textContent = ecuInfoSnapshot.itemCount
      ? `ブリッジECU情報を${ecuInfoSnapshot.itemCount || 0}項目読取りました。${keySummary}${missingKeySummary}${supportedTypeSummary}`.trim()
      : `ブリッジECU情報応答を受け取りました。項目は0件です。${unsupportedSummary}`.trim();
  } else if (parts.onboardMonitorResponse && onboardMonitorSnapshot) {
    const failedSummary = onboardMonitorSnapshot.failedCount > 0
      ? ` 範囲外${onboardMonitorSnapshot.failedCount}件`
      : " 範囲外0件";
    obdImportStatus.textContent = onboardMonitorSnapshot.testCount
      ? `ブリッジ監視結果を${onboardMonitorSnapshot.testCount || 0}項目読取りました。${failedSummary}`.trim()
      : "ブリッジ監視結果応答を受け取りました。項目は0件です。";
  } else if (parts.supportedPidResponse && supportedPidMatrix) {
    const pidPreview = supportedPidMatrix.supportedPids?.slice(0, 4).join(", ");
    obdImportStatus.textContent = supportedPidMatrix.supportedCount
      ? `ブリッジ対応PIDを${supportedPidMatrix.supportedCount || 0}件読取りました。${pidPreview ? ` 先頭 ${pidPreview}` : ""}`.trim()
      : "ブリッジ対応PID応答を受け取りました。対応PIDは0件です。";
  } else if (parts.livePidResponse && readinessSnapshot?.monitorCount) {
    const valueSummary = monitorValues.length ? ` ライブ値${monitorValues.length}項目` : "";
    obdImportStatus.textContent = `ブリッジライブ値とレディネス${readinessSnapshot.monitorCount}項目を読取りました。${valueSummary} / 未完了${readinessSnapshot.incompleteCount}項目`.trim();
  } else if (parts.livePidResponse && readinessSnapshot) {
    obdImportStatus.textContent = monitorValues.length
      ? `ブリッジライブ値を${monitorValues.length}項目読取りました。レディネス項目は0件です。`
      : "ブリッジライブ値応答を受け取りました。項目は0件です。";
  }
  renderObdDeveloperSessionSummary(session);
}

function formatObdBridgeDtcStatusSummary(dtcs = []) {
  const counts = dtcs.reduce((acc, item) => {
    const status = item?.status || "unknown";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const parts = ["stored", "pending", "permanent", "unknown"]
    .filter((status) => counts[status] > 0)
    .map((status) => `${formatObdBridgeDtcStatusLabel(status)}${counts[status]}件`);
  return parts.length ? ` 内訳: ${parts.join(" / ")}。` : "";
}

function formatObdBridgeDtcStatusLabel(status = "unknown") {
  return {
    stored: "保存",
    pending: "保留",
    permanent: "永久",
    unknown: "不明"
  }[status] || status;
}

function formatObdBridgeReadoutValue(item = {}) {
  const value = item.value ?? item.result ?? item.raw ?? NO_DATA;
  const unit = item.unit ? ` ${item.unit}` : "";
  return `${value}${unit}`;
}

function formatObdBridgeWarningLabel(code = "") {
  return {
    local_bridge_disabled: "送信は読取モデルのまま",
    confirm_dtc_with_service_manual: "DTCは整備書で再確認",
    bridge_readout_incomplete: "未取得の読取項目あり",
    bridge_readout_empty_sections: "空応答の読取項目あり",
    mode09_key_items_missing: "Mode09主要項目に未取得あり",
    mode09_supported_types_unknown: "Mode09対応情報タイプ00が未取得",
    freeze_frame_available: "フリーズフレームあり",
    readiness_incomplete: "レディネス未完了あり",
    onboard_monitor_test_failed: "Mode06で範囲外あり",
    compare_values_under_same_conditions: "同条件比較が必要",
    raw_pid_values_need_conversion: "未換算PIDあり",
    save_before_clear: "消去前保存が必要",
    sensitive_identifier_redacted: "識別情報は伏せて保持"
  }[code] || code;
}

function renderObdBridgeSessionDetails(session = null) {
  if (!obdDevSessionDetails) return;
  obdDevSessionDetails.innerHTML = "";

  const sections = [];
  const connectionStatus = session?.connectionStatus || obdDevSession.bridgeStatus;
  const vciDevices = session?.vciDevices || obdDevSession.bridgeVciList?.devices || [];
  const vciDriverStatus = obdDevSession.bridgeVciList?.driverStatus || vciDevices[0]?.driverStatus || NO_DATA;
  if (connectionStatus?.displayStatus || vciDevices.length) {
    const lines = [
      `状態: ${connectionStatus?.displayStatus || NO_DATA}`,
      `次動作: ${connectionStatus?.nextAction || NO_DATA}`,
      `Driver: ${vciDriverStatus}`
    ];
    vciDevices.slice(0, 4).forEach((item) => {
      lines.push(`${item.label || item.id}: ${item.connected ? "読取中" : "未読取"} / ${item.selected ? "選択中" : "待機"}`);
    });
    sections.push(["読取", lines]);
  }

  const readoutProtocol = session?.protocol || NO_DATA;
  const capturedAt = session?.capturedAt || NO_DATA;
  const warningLines = Array.isArray(session?.warnings) ? session.warnings.map((item) => formatObdBridgeWarningLabel(item)) : [];
  if (session && (readoutProtocol !== NO_DATA || capturedAt !== NO_DATA || warningLines.length)) {
    sections.push(["読取メタ", [
      `Protocol: ${readoutProtocol}`,
      `Captured: ${capturedAt === NO_DATA ? NO_DATA : formatDateTime(capturedAt)}`,
      ...warningLines.slice(0, 6).map((item) => `注意: ${item}`)
    ]]);
  }

  const coverage = session?.readoutCoverage;
  if (coverage?.totalCategories) {
    const lines = [
      `進捗: ${coverage.progressPercent}% (${coverage.availableCategories}/${coverage.totalCategories})`,
      `取得済み: ${coverage.capturedCategories || 0} / 空応答: ${coverage.emptyCategories || 0} / 未取得: ${coverage.missingCategories || 0}`,
      `未取得: ${coverage.missingLabels?.length ? coverage.missingLabels.join(" / ") : "なし"}`,
      `空応答: ${coverage.emptyLabels?.length ? coverage.emptyLabels.join(" / ") : "なし"}`
    ];
    coverage.items
      .filter((item) => item.available)
      .slice(0, 6)
      .forEach((item) => lines.push(`${item.label}: ${item.count} / ${item.status === "empty" ? "空応答" : "取得済み"}`));
    sections.push(["読取カバレッジ", lines]);
  }

  const dtcs = session?.dtcSnapshot?.dtcs || [];
  if (dtcs.length) {
    const summary = formatObdBridgeDtcStatusSummary(dtcs).replace(/^ 内訳: /, "").replace(/。$/, "");
    const lines = dtcs.slice(0, 8).map((item) => `${item.code} ${formatObdBridgeDtcStatusLabel(item.status || "unknown")}`);
    sections.push(["DTC状態", [summary, ...lines].filter(Boolean)]);
  }

  const ecuItems = session?.ecuInfoSnapshot?.items || [];
  if (ecuItems.length) {
    const keySummary = session?.ecuInfoSnapshot?.keyItemSummary;
    const supportedTypeSummary = session?.ecuInfoSnapshot?.supportInfoTypesSummary;
    const lines = [];
    if (supportedTypeSummary?.count) {
      lines.push(`対応タイプ00: ${supportedTypeSummary.count}件`);
      lines.push(`対応: ${supportedTypeSummary.labels.slice(0, 6).join(" / ")}${supportedTypeSummary.count > 6 ? "..." : ""}`);
    }
    if (keySummary?.totalCount) {
      lines.push(`主要項目: ${keySummary.capturedCount}/${keySummary.totalCount}`);
      lines.push(`取得: ${keySummary.capturedLabels?.length ? keySummary.capturedLabels.join(" / ") : "なし"}`);
      lines.push(`未取得: ${keySummary.missingLabels?.length ? keySummary.missingLabels.join(" / ") : "なし"}`);
    }
    lines.push(...ecuItems.slice(0, 6).map((item) => `${item.label || item.id || "項目"}: ${formatObdBridgeReadoutValue(item)}`));
    sections.push(["ECU情報", lines]);
  }

  const ecuResponses = session?.ecuResponseSummary?.ecus || [];
  if (ecuResponses.length) {
    sections.push(["ECU応答", ecuResponses.slice(0, 6).map((item) => {
      const services = item.services?.length ? ` / Svc ${item.services.join(",")}` : "";
      const negatives = item.negativeResponseCount ? ` / 否定応答${item.negativeResponseCount}` : "";
      const dtcs = Number.isInteger(item.dtcCount) ? ` / DTC ${item.dtcCount}` : "";
      return `${item.address || item.id}: ${item.status || "unknown"}${dtcs}${services}${negatives}`;
    })]);
  }

  const adapterIdentity = session?.adapterIdentity || obdDevSession.adapterIdentity;
  if (adapterIdentity?.adapterName || adapterIdentity?.adapterFamily || adapterIdentity?.firmwareVersion) {
    sections.push(["アダプター", [
      `名称: ${adapterIdentity.adapterName || NO_DATA}`,
      `系統: ${adapterIdentity.adapterFamily || NO_DATA}`,
      `FW: ${adapterIdentity.firmwareVersion || NO_DATA}`
    ]]);
  }

  const monitorTests = session?.onboardMonitorSnapshot?.tests || [];
  if (monitorTests.length) {
    sections.push(["Mode06", monitorTests.slice(0, 6).map((item) => {
      const id = [item.testId || item.tid, item.componentId || item.cid].filter(Boolean).join("/");
      const status = item.status ? ` ${item.status}` : "";
      return `${id || item.id || "test"}: ${formatObdBridgeReadoutValue(item)}${status}`;
    })]);
  }

  const readinessMonitors = session?.readinessSnapshot?.monitors || [];
  if (readinessMonitors.length) {
    const incomplete = readinessMonitors.filter((item) => item.supported && !item.complete);
    const visible = (incomplete.length ? incomplete : readinessMonitors.filter((item) => item.supported)).slice(0, 6);
    const lines = [
      `MIL: ${session.readinessSnapshot.milOn ? "ON" : "OFF"} / 未完了 ${session.readinessSnapshot.incompleteCount}項目`,
      ...visible.map((item) => `${item.label || item.id}: ${item.complete ? "完了" : "未完了"}`)
    ];
    sections.push(["レディネス", lines]);
  }

  const supportedPids = session?.supportedPidMatrix?.supportedPids || [];
  if (supportedPids.length) {
    const suffix = supportedPids.length > 18 ? "..." : "";
    sections.push(["対応PID", [`${supportedPids.length}件: ${supportedPids.slice(0, 18).join(", ")}${suffix}`]]);
  }

  const freezeFrameValues = session?.freezeFrameSnapshot?.monitorValues || [];
  if (freezeFrameValues.length) {
    sections.push(["フリーズフレーム", freezeFrameValues.slice(0, 6).map((item) => `${item.label || item.id || "項目"}: ${formatObdBridgeReadoutValue(item)}`)]);
  }

  if (!sections.length) {
    obdDevSessionDetails.hidden = true;
    return;
  }

  sections.forEach(([title, lines]) => {
    const card = document.createElement("article");
    card.className = "obd-session-detail-card";
    const heading = document.createElement("strong");
    heading.textContent = title;
    const list = document.createElement("ul");
    lines.forEach((line) => {
      const item = document.createElement("li");
      item.textContent = line;
      list.appendChild(item);
    });
    card.append(heading, list);
    obdDevSessionDetails.appendChild(card);
  });
  obdDevSessionDetails.hidden = false;
}

function mergeObdBridgeDtcSnapshots(previousSnapshot, currentSnapshot) {
  if (!previousSnapshot?.dtcs?.length) return currentSnapshot || null;
  if (!currentSnapshot?.dtcs) return previousSnapshot;
  const dtcsByKind = new Map();
  [...previousSnapshot.dtcs, ...currentSnapshot.dtcs].forEach((item) => {
    const code = item?.code;
    if (!code) return;
    const status = item.status || "unknown";
    const key = `${code}::${status}`;
    if (!dtcsByKind.has(key)) dtcsByKind.set(key, { ...item, status });
  });
  const ecuResponses = [
    ...(previousSnapshot.ecuResponses || []),
    ...(currentSnapshot.ecuResponses || [])
  ];
  return {
    ...currentSnapshot,
    codes: [...new Set([...dtcsByKind.values()].map((item) => item.code))],
    dtcs: [...dtcsByKind.values()],
    protocol: currentSnapshot.protocol || previousSnapshot.protocol || null,
    ecuResponses,
    capturedAt: currentSnapshot.capturedAt || previousSnapshot.capturedAt || null,
    retainedRawText: false
  };
}

function renderObdDeveloperSessionSummary(session = null) {
  obdDevSessionSummary.innerHTML = "";
  const bridgeDeviceCount = obdDevSession.bridgeVciList?.deviceCount ?? 0;
  const dtcStatusSummary = formatObdBridgeDtcStatusSummary(session?.dtcSnapshot?.dtcs || []).replace(/^ 内訳: /, "").replace(/。$/, "");
  const coverage = session?.readoutCoverage || null;
  const selectedVehicle = obdVehicleInput.value.trim() || NO_DATA;
  const selectedInterface = getSelectedObdInterfaceLabel();
  const selectedInterfaceId = resolveObdInterfaceId();
  const connectionLabel = obdDevSession.port
    ? selectedInterfaceId === "user-vci-elm327"
      ? "Web Serial読取"
      : `${selectedInterface} 読取`
    : obdDevSession.bridgeEndpoint
      ? "ローカルブリッジ読取"
      : obdDevSession.previewMode
        ? "読取前プレビュー"
        : "未読取";
  const values = [
    ["読取", connectionLabel],
    ["方式", selectedInterface],
    ["状態", session?.connectionStatus?.displayStatus || obdDevSession.bridgeStatus?.displayStatus || NO_DATA],
    ["DTC", session?.dtcSnapshot?.dtcs?.length ?? 0],
    ["DTC内訳", dtcStatusSummary || NO_DATA],
    ["ECU応答", session?.ecuResponseSummary?.ecus?.length ?? 0],
    ["ECU情報", session?.ecuInfoSnapshot?.itemCount ?? 0],
    ["FF", session?.freezeFrameSnapshot?.monitorValues?.length ?? 0],
    ["ライブ値", session?.livePidSnapshot?.monitorValues?.length ?? 0],
    ["レディネス", session?.readinessSnapshot?.monitorCount ? `未完了${session.readinessSnapshot.incompleteCount}` : 0],
    ["Mode06", session?.onboardMonitorSnapshot?.testCount ?? 0],
    ["対応PID", session?.supportedPidMatrix?.supportedCount ?? 0],
    ["開始", obdDevSession.connectedAt ? formatDateTime(obdDevSession.connectedAt) : NO_DATA],
    ["ブリッジ", obdDevSession.bridgeEndpoint ? "確認済み" : obdDevSession.previewMode ? "プレビュー" : "未確認"],
    ["VCI", bridgeDeviceCount],
    ["アダプター", session?.adapterIdentity?.adapterFamily || obdDevSession.adapterIdentity?.adapterFamily || NO_DATA],
    ["読取率", coverage?.totalCategories ? `${coverage.progressPercent}% (${coverage.availableCategories}/${coverage.totalCategories})` : NO_DATA],
    ["取得済", coverage?.capturedCategories ?? 0],
    ["空応答", coverage?.emptyCategories ?? 0],
    ["未取得", coverage?.missingLabels?.length ? coverage.missingLabels.join(" / ") : "なし"],
    ["主要ECU情報", session?.ecuInfoSnapshot?.keyItemSummary?.totalCount ? `${session.ecuInfoSnapshot.keyItemSummary.capturedCount}/${session.ecuInfoSnapshot.keyItemSummary.totalCount}` : NO_DATA],
    ["Mode09対応", session?.ecuInfoSnapshot?.supportInfoTypesSummary?.count ?? 0]
  ];
  values.forEach(([label, value]) => {
    const item = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = label;
    item.append(strong, document.createTextNode(String(value)));
    obdDevSessionSummary.appendChild(item);
  });
  renderObdBridgeSessionDetails(session);
}

function renderObdOperationPlan(items) {
  obdOperationGrid.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "読取機能の準備状況を取得できませんでした。";
    obdOperationGrid.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = `obd-operation-card obd-operation-${item.commandClass}`;

    const head = document.createElement("div");
    head.className = "obd-operation-head";
    const title = document.createElement("strong");
    title.textContent = item.label;
    const badge = document.createElement("span");
    badge.className = "obd-operation-state";
    badge.textContent = item.currentAvailability;
    head.append(title, badge);

    const goal = document.createElement("p");
    goal.textContent = item.goal;

    const list = document.createElement("ul");
    item.requiredBeforeEnable.slice(0, 5).forEach((condition) => {
      const li = document.createElement("li");
      li.textContent = condition;
      list.appendChild(li);
    });

    const button = document.createElement("button");
    button.type = "button";
    button.className = item.commandClass === "state-changing" ? "small-danger-button" : "secondary-button";
    button.disabled = true;
    button.textContent = item.commandClass === "state-changing" ? "安全検証完了まで無効" : "準備中";

    card.append(head, goal, list, button);
    obdOperationGrid.appendChild(card);
  });
}

function renderObdPreparedRequests(profile, requests) {
  obdConnectionProfile.innerHTML = "";
  obdPreparedRequestGrid.innerHTML = "";

  if (profile) {
    [
      ["読取方式", "Web Serial"],
      ["状態", profile.currentState === "safety-gated" ? "準備中" : profile.currentState],
      ["対応候補", profile.adapterFamilies.join(" / ")],
      ["通信速度候補", profile.baudRateCandidates.join(" / ")]
    ].forEach(([label, value]) => {
      const item = document.createElement("span");
      const strong = document.createElement("strong");
      strong.textContent = label;
      item.append(strong, document.createTextNode(value));
      obdConnectionProfile.appendChild(item);
    });
  }

  if (!requests.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "通信準備の定義を取得できませんでした。";
    obdPreparedRequestGrid.appendChild(empty);
    return;
  }

  requests.forEach((request) => {
    const card = document.createElement("article");
    card.className = `obd-request-card obd-request-${request.group}`;

    const head = document.createElement("div");
    head.className = "obd-operation-head";
    const title = document.createElement("strong");
    title.textContent = request.label;
    const badge = document.createElement("span");
    badge.className = "obd-operation-state";
    badge.textContent = request.safetyGate;
    head.append(title, badge);

    const meta = document.createElement("p");
    const pidText = request.pid ? ` PID ${request.pid}` : "";
    meta.textContent = `${request.destination} / Mode ${request.service}${pidText} / ${request.resultTarget}`;

    const note = document.createElement("p");
    note.textContent = request.note;

    const button = document.createElement("button");
    button.type = "button";
    button.className = request.stateChanging ? "small-danger-button" : "secondary-button";
    button.disabled = true;
    button.textContent = request.stateChanging ? "実行不可" : "送信無効";

    card.append(head, meta, note, button);
    obdPreparedRequestGrid.appendChild(card);
  });
}

function renderObdInterfaceRoadmap(items, interfaceCatalog = []) {
  obdInterfaceRoadmapGrid.innerHTML = "";

  if (!items.length && !interfaceCatalog.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "対応インターフェースの準備順を取得できませんでした。";
    obdInterfaceRoadmapGrid.appendChild(empty);
    return;
  }

  [...items].sort((a, b) => a.phase - b.phase).forEach((item) => {
    const progress = getInterfaceProgressState(item.id);
    const card = document.createElement("article");
    card.className = "obd-interface-card";

    const head = document.createElement("div");
    head.className = "obd-operation-head";
    const title = document.createElement("strong");
    title.textContent = `${item.phase}. ${item.label}`;
    const badge = document.createElement("span");
    badge.className = "obd-operation-state";
    badge.textContent = `${progress.progressPercent || 0}%`;
    head.append(title, badge);

    const role = document.createElement("p");
    role.textContent = item.role;

    const scope = document.createElement("p");
    scope.textContent = item.capabilityScope.join(" / ");

    const status = document.createElement("p");
    status.textContent = `${item.currentAvailability || "確認中"} / ${progress.currentBasis || ""}`;

    const next = document.createElement("p");
    next.textContent = progress.nextBuild || "";

    const eta = document.createElement("p");
    eta.textContent = `使える状態の目標: ${progress.etaTarget || "時期未定"}`;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.disabled = true;
    button.textContent = item.requiresLocalBridge ? "ローカルブリッジ準備後" : "準備中";

    if (item.id === "local_bridge") {
      button.disabled = false;
      button.textContent = "読取確認";
      button.addEventListener("click", () => {
        startGeneralBridgeCheck();
      });
    }
    card.append(head, role, scope, status, next, eta, button);
    obdInterfaceRoadmapGrid.appendChild(card);
  });

  interfaceCatalog.forEach((item) => {
    const display = getInterfaceCatalogDisplayState(item);
    const evidence = buildInterfaceImplementationEvidence(display);
    const card = document.createElement("article");
    card.className = "obd-interface-card";

    const head = document.createElement("div");
    head.className = "obd-operation-head";
    const title = document.createElement("strong");
    title.textContent = item.label;
    const badge = document.createElement("span");
    badge.className = "obd-operation-state";
    badge.textContent = `${display.progressPercent || 0}%`;
    head.append(title, badge);

    const role = document.createElement("p");
    role.textContent = `${display.transport} / ${display.primaryUse}`;

    const scope = document.createElement("p");
    scope.textContent = display.readScopeCandidates.slice(0, 4).join(" / ") || display.interfaceFamily;

    const status = document.createElement("p");
    status.textContent = `${display.currentStatus || "確認中"} / ${display.currentBasis || ""}`;

    const next = document.createElement("p");
    next.textContent = display.nextBuild || "";

    const eta = document.createElement("p");
    eta.textContent = `使える状態の目標: ${display.etaTarget || "時期未定"}`;

    const note = document.createElement("p");
    note.textContent = getInterfaceCandidateOperatorNote(display);

    const implementation = document.createElement("p");
    implementation.textContent = `${evidence.summary} / ${evidence.missing}`;

    const checks = document.createElement("p");
    checks.textContent = getInterfaceCandidateCheckSummary(display);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.disabled = true;
    button.textContent = getInterfaceCandidateActionLabel(display);
    button.title = getInterfaceCandidateProbeLabel(display);

    if (isBridgeBackedInterfaceCandidate(item.id)) {
      button.disabled = false;
      button.textContent = getInterfaceCandidateActionLabel(display);
      button.title = getInterfaceCandidateProbeLabel(display);
      button.addEventListener("click", () => {
        startInterfaceCandidateCheck(display);
      });
    }

    card.append(head, role, scope, status, next, eta, note, implementation, checks, button);
    obdInterfaceRoadmapGrid.appendChild(card);
  });
}

function renderObdCoverageRoadmap(items) {
  obdCoverageRoadmapGrid.innerHTML = "";
  const displayItems = getCoverageRoadmapDisplayItems(items);

  if (!displayItems.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "診断データ網羅計画を取得できませんでした。";
    obdCoverageRoadmapGrid.appendChild(empty);
    return;
  }

  [...displayItems].sort((a, b) => (a.priority || 99) - (b.priority || 99)).forEach((item) => {
    const card = document.createElement("article");
    card.className = "obd-interface-card";

    const head = document.createElement("div");
    head.className = "obd-operation-head";
    const title = document.createElement("strong");
    title.textContent = item.label;
    const badge = document.createElement("span");
    badge.className = "obd-operation-state";
    badge.textContent = normalizeProgressPercent(item.progress_percent) !== null
      ? `${normalizeProgressPercent(item.progress_percent)}%`
      : item.current_state || "確認中";
    head.append(title, badge);

    const current = document.createElement("p");
    current.textContent = `${item.current_state || "確認中"} / ${item.current_count_note || item.coverage_area || ""}`;

    const target = document.createElement("p");
    target.textContent = item.target_state || "";

    const next = document.createElement("p");
    next.textContent = Array.isArray(item.next_actions) ? item.next_actions.slice(0, 2).join(" / ") : "";

    const remaining = document.createElement("p");
    remaining.textContent = Array.isArray(item.blocked_until) && item.blocked_until.length
      ? `停止条件 ${item.blocked_until.length}件: ${item.blocked_until.slice(0, 1).join(" / ")}`
      : `次工程 ${Array.isArray(item.next_actions) ? item.next_actions.length : 0}件`;

    const eta = document.createElement("p");
    eta.textContent = `使える状態の目標: ${item.eta_target || "時期未定"}`;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.disabled = true;
    button.textContent = item.blocked_until?.length ? "ソース確認待ち" : "拡張中";

    card.append(head, current, target, next, remaining, eta, button);
    obdCoverageRoadmapGrid.appendChild(card);
  });
}

function renderObdCapabilityStatus(items) {
  obdCapabilityStatusGrid.innerHTML = "";
  const displayItems = getCapabilityDisplayItems(items);

  if (!displayItems.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "診断機能の完成度を取得できませんでした。";
    obdCapabilityStatusGrid.appendChild(empty);
    return;
  }

  displayItems.forEach((item) => {
    const card = document.createElement("article");
    card.className = "obd-interface-card";

    const head = document.createElement("div");
    head.className = "obd-operation-head";
    const title = document.createElement("strong");
    title.textContent = item.label;
    const badge = document.createElement("span");
    badge.className = "obd-operation-state";
    badge.textContent = `${item.progress_percent || 0}%`;
    head.append(title, badge);

    const status = document.createElement("p");
    status.textContent = `${item.current_status || "確認中"} / ${item.current_basis || ""}`;

    const progressDetail = document.createElement("p");
    progressDetail.textContent = summarizeTaskCount(item.done, item.missing);

    const missing = document.createElement("p");
    missing.textContent = Array.isArray(item.missing) ? `不足: ${item.missing.slice(0, 3).join(" / ")}` : "";

    const next = document.createElement("p");
    next.textContent = item.next_build || "";

    const eta = document.createElement("p");
    eta.textContent = `使える状態の目標: ${item.eta_target || "時期未定"}`;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.disabled = true;
    button.textContent = item.safety_gate || "確認中";

    card.append(head, status, progressDetail, missing, next, eta, button);
    obdCapabilityStatusGrid.appendChild(card);
  });
}

function renderObdBridgeContract(contract, schemas) {
  obdBridgeContractGrid.innerHTML = "";
  obdBridgeSchemaGrid.innerHTML = "";

  if (!contract) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "ローカルブリッジ契約を取得できませんでした。";
    obdBridgeContractGrid.appendChild(empty);
    return;
  }

  [
    ["状態", contract.connectionEnabled ? "利用可" : "準備中"],
    ["API", `${contract.apiVersion} / ${contract.transport}`],
    ["候補ポート", contract.endpointPortCandidates.join(" / ")],
    ["読取Intent", `${contract.allowedReadIntents.length}件`],
    ["変更系Intent", "未開放"],
    ["ログ方針", contract.logPolicy.storeRawFrames ? "原文保存あり" : "原文保存なし"],
    ["表示モデル", hasBridgeConnectionStatusSupport() ? "準備済み" : "未読込"],
    ["セッション要約", hasBridgeSessionSummarySupport() ? "準備済み" : "未読込"],
    ["エクスポート", hasBridgeSessionExportSupport() ? "準備済み" : "未読込"],
    ["診断取込", hasBridgeDiagnosticImportPipelineSupport() ? "準備済み" : "未読込"],
    ["取込トップレベル互換", hasBridgeDiagnosticImportTopLevelSessionSupport() ? "準備済み" : "未読込"],
    ["統合入力", hasBridgeMergeDiagnosticInputsSupport() ? "準備済み" : "未読込"]
  ].forEach(([label, value]) => {
    const item = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = label;
    item.append(strong, document.createTextNode(value));
    obdBridgeContractGrid.appendChild(item);
  });

  schemas.slice(0, 6).forEach((schema) => {
    const card = document.createElement("article");
    card.className = "obd-bridge-schema-card";

    const title = document.createElement("strong");
    title.textContent = schema.label;

    const fields = document.createElement("p");
    fields.textContent = schema.dataShape.join(" / ");

    card.append(title, fields);
    obdBridgeSchemaGrid.appendChild(card);
  });
}

function renderObdSafetyInterlock(interlock) {
  obdInterlockSummary.innerHTML = "";
  obdInterlockChecklist.innerHTML = "";

  if (!interlock) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "読取保護の状態を取得できませんでした。";
    obdInterlockSummary.appendChild(empty);
    return;
  }

  [
    ["読取送信", interlock.outboundTransportEnabled ? "有効" : "準備中"],
    ["既定動作", interlock.defaultDecision === "block" ? "停止" : interlock.defaultDecision],
    ["失敗時", interlock.failClosed ? "安全側で停止" : "未設定"],
    ["状態変更", interlock.allowsPhysicalVehicleCommands ? "利用可" : "準備中"]
  ].forEach(([label, value]) => {
    const item = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = label;
    item.append(strong, document.createTextNode(value));
    obdInterlockSummary.appendChild(item);
  });

  interlock.preEnableChecklist.forEach((condition) => {
    const li = document.createElement("li");
    li.textContent = condition;
    obdInterlockChecklist.appendChild(li);
  });
}

function analyzeObdScannerImport() {
  const scannerText = obdScannerText.value;
  const hasScannerText = scannerText.trim().length > 0;
  const currentSession = obdDevSession.lastSession;
  const bridgeImport = currentSession && hasBridgeDiagnosticImportPipelineSupport()
    ? window.ObdReadOnly.buildBridgeDiagnosticImport({
      connectionStatus: currentSession.connectionStatus,
      vciList: { devices: currentSession.vciDevices || [] },
      adapterIdentity: currentSession.adapterIdentity,
      dtcSnapshot: currentSession.dtcSnapshot,
      livePidSnapshot: currentSession.livePidSnapshot,
      freezeFrameSnapshot: currentSession.freezeFrameSnapshot,
      readinessSnapshot: currentSession.readinessSnapshot,
      ecuInfoSnapshot: currentSession.ecuInfoSnapshot,
      onboardMonitorSnapshot: currentSession.onboardMonitorSnapshot,
      supportedPidMatrix: currentSession.supportedPidMatrix,
      ecuResponseSummary: currentSession.ecuResponseSummary
    })
    : null;
  const analysis = bridgeImport && hasBridgeMergeDiagnosticInputsSupport()
    ? window.ObdReadOnly.mergeDiagnosticInputs({ scannerText, bridgeImport })
    : window.ObdReadOnly.analyzeScannerText(scannerText);
  obdDetectedCodes.innerHTML = "";
  obdMonitorGrid.innerHTML = "";
  obdMonitorInsightList.innerHTML = "";
  obdMonitorInsightList.hidden = true;
  renderObdImportToolHints(analysis.toolHints);

  if (!hasScannerText && !bridgeImport) {
    obdImportStatus.textContent = "外部診断機の読取結果を入力してください。";
    obdMonitorStatus.textContent = "読取後にライブデータを表示します。";
    obdMonitorCount.textContent = "0項目";
    return;
  }

  const notes = [];
  if (Array.isArray(analysis.toolHints) && analysis.toolHints.length > 0) {
    notes.push(`入力元 ${analysis.toolHints.join(" / ")}`);
    if (analysis.toolHints.some((hint) => OEM_SCANNER_TOOL_HINTS.has(hint))) {
      notes.push("メーカー固有候補は未確認扱い");
    }
  }
  if (analysis.protocol) notes.push(`Protocol ${analysis.protocol}`);
  if (analysis.connectionStatus?.displayStatus) {
    notes.push(`状態 ${analysis.connectionStatus.displayStatus}`);
  }
  if (analysis.adapterIdentity?.adapterFamily || analysis.adapterIdentity?.adapterName) {
    notes.push(`Adapter ${analysis.adapterIdentity.adapterFamily || analysis.adapterIdentity.adapterName}`);
  }
  if (Array.isArray(analysis.vciDevices) && analysis.vciDevices.length > 0) {
    notes.push(`VCI ${analysis.vciDevices.length}件`);
  }
  if (analysis.readinessSnapshot?.incompleteCount > 0) {
    notes.push(`レディネス未完了${analysis.readinessSnapshot.incompleteCount}項目`);
  }
  if (analysis.monitorValueSummary?.totalCount > 0) {
    notes.push(`ライブデータ${analysis.monitorValueSummary.totalCount}項目`);
  }
  if (analysis.supportedPidMatrix?.supportedCount > 0) {
    notes.push(`対応PID${analysis.supportedPidMatrix.supportedCount}件`);
  }
  if (analysis.readoutCoverage?.totalCategories) {
    notes.push(`読取率${analysis.readoutCoverage.progressPercent}% (${analysis.readoutCoverage.availableCategories}/${analysis.readoutCoverage.totalCategories})`);
    if ((analysis.readoutCoverage.missingCategories || 0) > 0) {
      const missingLabels = analysis.readoutCoverage.missingLabels?.slice(0, 2).join(" / ");
      notes.push(`未取得${analysis.readoutCoverage.missingCategories}件${missingLabels ? ` (${missingLabels})` : ""}`);
    }
    if ((analysis.readoutCoverage.emptyCategories || 0) > 0) {
      const emptyLabels = analysis.readoutCoverage.emptyLabels?.slice(0, 2).join(" / ");
      notes.push(`空応答${analysis.readoutCoverage.emptyCategories}件${emptyLabels ? ` (${emptyLabels})` : ""}`);
    }
  }
  if (analysis.ecuInfoSnapshot?.supportInfoTypesSummary?.count > 0) {
    const labels = analysis.ecuInfoSnapshot.supportInfoTypesSummary.labels?.slice(0, 3).join(" / ");
    notes.push(`Mode09対応${analysis.ecuInfoSnapshot.supportInfoTypesSummary.count}件${labels ? ` (${labels})` : ""}`);
  }
  if (analysis.ecuInfoSnapshot?.keyItemSummary?.missingCount > 0) {
    const missingLabels = analysis.ecuInfoSnapshot.keyItemSummary.missingLabels?.slice(0, 3).join(" / ");
    notes.push(`Mode09未取得${analysis.ecuInfoSnapshot.keyItemSummary.missingCount}件${missingLabels ? ` (${missingLabels})` : ""}`);
  }
  if (analysis.ecuResponseSummary?.ecus?.length > 0) {
    notes.push(`ECU応答${analysis.ecuResponseSummary.ecus.length}件`);
  }
  if (analysis.ecuInfoSnapshot?.itemCount > 0) {
    notes.push(`ECU情報${analysis.ecuInfoSnapshot.itemCount}項目`);
  }
  if (analysis.onboardMonitorSnapshot?.testCount > 0) {
    notes.push(`Mode06 ${analysis.onboardMonitorSnapshot.testCount}件`);
  }
  if (analysis.freezeFrameSnapshot?.monitorValues?.length > 0) {
    notes.push(`FF ${analysis.freezeFrameSnapshot.monitorValues.length}項目`);
  }
  if (Array.isArray(analysis.warnings) && analysis.warnings.length) {
    const warningLabels = analysis.warnings.slice(0, 2).map((item) => formatObdBridgeWarningLabel(item));
    notes.push(`注意${analysis.warnings.length}件${warningLabels.length ? ` (${warningLabels.join(" / ")})` : ""}`);
  }
  const sourcePrefix = bridgeImport
    ? hasScannerText
      ? "貼り付け結果とローカルブリッジ読取を統合し、"
      : "ローカルブリッジ読取結果を反映し、"
    : "";
  const detailNote = notes.length ? ` ${notes.join(" / ")}。` : "";

  if (!analysis.codes.length) {
    obdImportStatus.textContent = analysis.hadSensitiveIdentifier
      ? `識別情報候補をマスクしましたが、標準形式のDTCは検出できませんでした。${detailNote}`
      : bridgeImport
        ? `${hasScannerText ? "ローカルブリッジ読取と統合しましたが" : "ローカルブリッジ読取結果では"}、標準形式のDTCは検出できませんでした。${detailNote}`
        : "標準形式のDTCは検出できませんでした。スキャンツールの表示形式を確認してください。";
  } else {
    obdImportStatus.textContent = `${sourcePrefix}${analysis.codes.length}件のDTCを検出しました。登録済みデータを日本語で表示します。${detailNote}`;
    analysis.codes.forEach((code) => {
      obdDetectedCodes.appendChild(createObdDtcCard(code));
    });
  }

  renderObdMonitorValues(analysis.monitorValues, analysis.monitorInsights);
  if (bridgeImport && analysis.monitorValues.length) {
    const bridgeValueCount = analysis.monitorValues.filter((item) => item.source === "local_bridge").length;
    const scannerValueCount = analysis.monitorValues.filter((item) => item.source === "scanner_text").length;
    const summary = [`統合入力で${analysis.monitorValues.length}項目を表示しています。`];
    if (bridgeValueCount > 0) summary.push(`ブリッジ${bridgeValueCount}項目`);
    if (scannerValueCount > 0) summary.push(`貼り付け${scannerValueCount}項目`);
    if (Array.isArray(analysis.warnings) && analysis.warnings.length) {
      const warningLabels = analysis.warnings.slice(0, 2).map((item) => formatObdBridgeWarningLabel(item));
      summary.push(`注意${analysis.warnings.length}件${warningLabels.length ? ` (${warningLabels.join(" / ")})` : ""}`);
    }
    obdMonitorStatus.textContent = `${summary.join(" / ")}。`;
  } else if (bridgeImport && !analysis.monitorValues.length) {
    const summary = ["計測値は0項目です。"];
    if (analysis.readinessSnapshot?.monitorCount > 0) summary.push(`レディネス${analysis.readinessSnapshot.monitorCount}項目`);
    if (analysis.supportedPidMatrix?.supportedCount > 0) summary.push(`対応PID${analysis.supportedPidMatrix.supportedCount}件`);
    if (analysis.ecuInfoSnapshot?.supportInfoTypesSummary?.count > 0) {
      const labels = analysis.ecuInfoSnapshot.supportInfoTypesSummary.labels?.slice(0, 2).join(" / ");
      summary.push(`Mode09対応${analysis.ecuInfoSnapshot.supportInfoTypesSummary.count}件${labels ? ` (${labels})` : ""}`);
    }
    if (analysis.ecuInfoSnapshot?.keyItemSummary?.missingCount > 0) {
      const missingLabels = analysis.ecuInfoSnapshot.keyItemSummary.missingLabels?.slice(0, 2).join(" / ");
      summary.push(`Mode09未取得${analysis.ecuInfoSnapshot.keyItemSummary.missingCount}件${missingLabels ? ` (${missingLabels})` : ""}`);
    }
    if (analysis.ecuInfoSnapshot?.itemCount > 0) summary.push(`ECU情報${analysis.ecuInfoSnapshot.itemCount}項目`);
    if (analysis.freezeFrameSnapshot?.monitorValues?.length > 0) summary.push(`フリーズフレーム${analysis.freezeFrameSnapshot.monitorValues.length}項目`);
    if (Array.isArray(analysis.warnings) && analysis.warnings.length) {
      const warningLabels = analysis.warnings.slice(0, 2).map((item) => formatObdBridgeWarningLabel(item));
      summary.push(`注意${analysis.warnings.length}件${warningLabels.length ? ` (${warningLabels.join(" / ")})` : ""}`);
    }
    obdMonitorStatus.textContent = `${summary.join(" / ")}。`;
  }
}

function createObdDtcCard(code) {
  const registered = findByCode(code);
  const modern = getModernGenericMatches(code)[0];
  const system = registered?.faultSystem || registered?.system || modern?.system;
  const firstCheck = registered?.firstChecks?.[0] || registered?.check_order?.[0] || modern?.check_order?.[0];
  const wrapper = document.createElement("article");
  wrapper.className = "obd-dtc-card";

  const head = document.createElement("div");
  head.className = "obd-dtc-head";

  const codeText = document.createElement("strong");
  codeText.textContent = code;
  head.appendChild(codeText);

  const badge = document.createElement("span");
  badge.className = "obd-dtc-status";
  badge.textContent = registered || modern ? "登録データあり" : "個別定義未登録";
  head.appendChild(badge);
  wrapper.appendChild(head);

  const description = document.createElement("p");
  description.className = "obd-dtc-description";
  description.textContent = system
    ? `${system}に関するDTCです。コードだけで故障部品は確定しません。`
    : describeUnregisteredDtc(code);
  wrapper.appendChild(description);

  if (firstCheck) {
    const check = document.createElement("p");
    check.className = "obd-dtc-check";
    check.textContent = `最初に確認: ${firstCheck}`;
    wrapper.appendChild(check);
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "obd-code-button";
  button.dataset.dtcCode = code;
  button.textContent = "詳しい診断手順を見る";
  wrapper.appendChild(button);
  return wrapper;
}

function renderObdMonitorValues(values, insights = []) {
  obdMonitorGrid.innerHTML = "";
  obdMonitorInsightList.innerHTML = "";
  obdMonitorInsightList.hidden = true;
  obdMonitorCount.textContent = `${values.length}項目`;

  if (!values.length) {
    obdMonitorStatus.textContent = "対応する計測値を検出できませんでした。「項目名: 数値 単位」の形式を確認してください。";
    return;
  }

  obdMonitorStatus.textContent = `${values.length}項目を読取りました。スナップショット表示のみで、原文は保存していません。`;
  values.forEach((item) => {
    const card = document.createElement("article");
    card.className = "obd-monitor-card";

    const category = document.createElement("span");
    category.className = "obd-monitor-category";
    category.textContent = item.category;

    const label = document.createElement("strong");
    label.textContent = item.label;

    const reading = document.createElement("p");
    reading.className = "obd-monitor-reading";
    reading.textContent = `${item.value}${item.unit ? ` ${item.unit}` : ""}`;

    const note = document.createElement("span");
    note.className = "obd-monitor-note";
    note.textContent = item.supportNote || "メーカー整備書の基準値と比較してください。";

    card.append(category, label, reading, note);
    obdMonitorGrid.appendChild(card);
  });

  renderObdMonitorInsights(insights);
}

function renderObdMonitorInsights(insights = []) {
  const values = insights.filter(Boolean).slice(0, 6);
  if (!values.length) return;

  const heading = document.createElement("h4");
  heading.textContent = "値・相関の見方";
  const list = document.createElement("ul");

  values.forEach((item) => {
    const li = document.createElement("li");
    li.className = item.level === "caution" ? "is-caution" : "is-info";

    const title = document.createElement("strong");
    title.textContent = item.title || "確認ポイント";
    const detail = document.createElement("span");
    detail.textContent = item.detail || "測定条件とメーカー整備書の基準値を確認してください。";
    const next = document.createElement("em");
    next.textContent = `次の確認: ${item.nextStep || "同じ条件で再測定し、DTCとフリーズフレームと照合する"}`;

    li.append(title, detail, next);
    list.appendChild(li);
  });

  obdMonitorInsightList.append(heading, list);
  obdMonitorInsightList.hidden = false;
}

function loadObdMonitorSample() {
  obdScannerText.value = [
    "Toyota Techstream",
    "J2534",
    "Current DTCs",
    "P0171 P0300",
    "Pending Codes",
    "P0420",
    "Permanent DTC",
    "P0440",
    "Engine RPM: 780 rpm",
    "Vehicle Speed: 0 km/h",
    "Coolant Temp: 88 C",
    "Intake Air Temp: 32 C",
    "Calculated Load: 21.6 %",
    "Throttle Position: 14.1 %",
    "MAF: 3.4 g/s",
    "MAP: 31 kPa",
    "STFT B1: 3.1 %",
    "LTFT B1: 8.6 %",
    "Control Module Voltage: 14.2 V"
  ].join("\n");
  analyzeObdScannerImport();
}

function clearObdScannerImport() {
  obdScannerText.value = "";
  obdDetectedCodes.innerHTML = "";
  obdMonitorGrid.innerHTML = "";
  obdMonitorInsightList.innerHTML = "";
  obdMonitorInsightList.hidden = true;
  renderObdImportToolHints();
  obdImportStatus.textContent = "まだ解析していません。";
  obdMonitorStatus.textContent = "読取後にライブデータを表示します。";
  obdMonitorCount.textContent = "0項目";
}

function renderObdImportToolHints(toolHints = []) {
  if (!obdImportToolHints) return;
  obdImportToolHints.innerHTML = "";
  const hints = Array.isArray(toolHints) ? toolHints.filter(Boolean) : [];
  if (!hints.length) {
    obdImportToolHints.hidden = true;
    return;
  }
  const fragment = document.createDocumentFragment();
  hints.forEach((hint) => {
    const badge = document.createElement("span");
    badge.className = "obd-operation-state";
    badge.textContent = hint;
    fragment.appendChild(badge);
  });
  if (hints.some((hint) => OEM_SCANNER_TOOL_HINTS.has(hint))) {
    const oemBadge = document.createElement("span");
    oemBadge.className = "obd-operation-state obd-import-hint-oem";
    oemBadge.textContent = "メーカー固有候補は未確認";
    fragment.appendChild(oemBadge);
  }
  obdImportToolHints.appendChild(fragment);
  obdImportToolHints.hidden = false;
}

function handleDetectedDtcClick(event) {
  const button = event.target.closest("[data-dtc-code]");
  if (!button) return;

  document.querySelector("#obdCode").value = button.dataset.dtcCode;
  activateTab("diagnosis-panel");
  renderDiagnosis(buildDiagnosis(getInput()));
  document.querySelector("#resultTitle").scrollIntoView({ behavior: "smooth", block: "start" });
}

function setResultView(view) {
  activeResultView = view === "detail" ? "detail" : "flow";
  const showFlow = activeResultView === "flow";

  flowView.hidden = !showFlow || emptyState.hidden === false;
  resultContent.hidden = showFlow || emptyState.hidden === false;

  resultViewButtons.forEach((button) => {
    const active = button.dataset.resultView === activeResultView;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderDiagnosisFlow(result) {
  flowChart.innerHTML = "";
  const checks = usableFlowItems(result.checkOrder, result.quickView.priorityChecks, 4);
  const measurements = usableFlowItems(result.liveDataGuidance, result.measurements, 4);
  const normalBranches = result.branches.filter((item) => item.includes("正常なら")).slice(0, 3);
  const abnormalBranches = result.branches.filter((item) => item.includes("異常なら")).slice(0, 3);
  const partsChecks = usableFlowItems(result.partsChecks, [], 3);

  flowChart.appendChild(createFlowNode({
    step: "START",
    title: "情報を保存",
    text: result.summary[0] || "入力情報と発生条件を保存します。",
    tone: "start"
  }));

  checks.forEach((item, index) => {
    flowChart.appendChild(createFlowConnector());
    flowChart.appendChild(createFlowNode({
      step: String(index + 1).padStart(2, "0"),
      title: index === 0 ? "最初に確認" : "確認を続ける",
      text: item,
      tone: "check",
      checkable: true
    }));
  });

  flowChart.appendChild(createFlowConnector());
  flowChart.appendChild(createFlowNode({
    step: "MEASURE",
    title: "指定ライブデータを観察",
    text: measurements.join(" / "),
    tone: "measure",
    checkable: true
  }));

  flowChart.appendChild(createFlowConnector());
  flowChart.appendChild(createBranchNode(normalBranches, abnormalBranches));

  flowChart.appendChild(createFlowConnector());
  flowChart.appendChild(createFlowNode({
    step: "VERIFY",
    title: "部品交換前に再確認",
    text: partsChecks.join(" / "),
    tone: "verify",
    checkable: true
  }));

  flowChart.appendChild(createFlowConnector());
  flowChart.appendChild(createFlowNode({
    step: "SAFETY",
    title: "作業可否を判断",
    text: result.quickView.safety,
    tone: "safety"
  }));
}

function usableFlowItems(primary, fallback, limit) {
  const items = [...(primary || []), ...(fallback || [])]
    .filter((item) => item && item !== NO_DATA);
  return collectUnique(items).slice(0, limit);
}

function createFlowNode({ step, title, text, tone, checkable = false }) {
  const node = document.createElement("article");
  node.className = `flow-node flow-node-${tone}`;

  const marker = document.createElement("span");
  marker.className = "flow-step";
  marker.textContent = step;

  const content = document.createElement("div");
  content.className = "flow-node-content";

  const heading = document.createElement("h4");
  heading.textContent = title;
  const description = document.createElement("p");
  description.textContent = text || NO_DATA;
  content.append(heading, description);

  if (checkable) {
    const label = document.createElement("label");
    label.className = "flow-check";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.addEventListener("change", () => {
      node.classList.toggle("is-complete", checkbox.checked);
    });
    const labelText = document.createElement("span");
    labelText.textContent = "確認済み";
    label.append(checkbox, labelText);
    content.appendChild(label);
  }

  node.append(marker, content);
  return node;
}

function createFlowConnector() {
  const connector = document.createElement("div");
  connector.className = "flow-connector";
  connector.setAttribute("aria-hidden", "true");
  return connector;
}

function createBranchNode(normalItems, abnormalItems) {
  const wrapper = document.createElement("section");
  wrapper.className = "flow-branch";

  const title = document.createElement("h4");
  title.textContent = "測定結果で分岐";
  wrapper.appendChild(title);

  const grid = document.createElement("div");
  grid.className = "flow-branch-grid";
  grid.append(
    createBranchPath("正常・基準内", normalItems, "normal", "次の系統へ進む"),
    createBranchPath("異常・基準外", abnormalItems, "abnormal", "該当系統を深掘り")
  );
  wrapper.appendChild(grid);
  return wrapper;
}

function createBranchPath(title, items, tone, fallback) {
  const path = document.createElement("article");
  path.className = `flow-branch-path flow-branch-${tone}`;
  const heading = document.createElement("h5");
  heading.textContent = title;
  const list = document.createElement("ul");
  const values = items.length ? items : [fallback];
  values.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item.replace(/^(正常なら次に確認|正常なら次に見る場所|異常なら疑う場所):\s*/, "");
    list.appendChild(li);
  });
  path.append(heading, list);
  return path;
}

async function sendToExternalGpt() {
  const input = getInput();
  const localResult = buildDiagnosis(input);
  renderDiagnosis(localResult);
  aiButton.disabled = true;
  aiStatus.textContent = "相談文を作成しています。";
  aiList.innerHTML = "";

  try {
    const consultationText = buildExternalGptConsultation(input, localResult);
    await copyTextToClipboard(consultationText);

    const isMobile = isMobileDevice();
    const pasteGuide = isMobile
      ? "相談内容をコピーしました。GPT画面の入力欄を長押しして『貼り付け』してください"
      : "相談内容をコピーしました。GPT画面で Ctrl + V を押してください";

    if (isMobile) {
      aiStatus.textContent = "相談内容をコピーしました。GPTを開く場合は画面中央のボタンを押してください。";
      showMobileGptModal();
      return;
    }

    showCopyToast(pasteGuide, "success");
    aiStatus.textContent = `${pasteGuide} アプリ内ではAI実行していません。`;
    renderItems(aiList, [
      pasteGuide,
      "APIキーは使用していません。",
      "相談文には、車両情報、OBD2コード、症状、確認済みの事実、問診内容を含めています。",
      "相談先では原因断定ではなく、確認順序、測定ポイント、早とちり注意の整理として扱ってください。"
    ]);

    setTimeout(() => {
      const gptWindow = window.open(MY_GPT_URL, "_blank");
      if (!gptWindow) renderGptOpenLink();
    }, 1300);
  } catch (error) {
    const errorMessage = "相談内容をコピーできませんでした。ブラウザのクリップボード権限を確認してください。";
    showCopyToast(errorMessage, "error");
    aiStatus.textContent = errorMessage;
    if (!isMobileDevice()) {
      renderGptOpenLink();
    }
  } finally {
    aiButton.disabled = false;
  }
}

function showCopyToast(message, type = "success") {
  copyToast.textContent = message;
  copyToast.classList.toggle("is-error", type === "error");
  copyToast.hidden = false;

  if (copyToastTimer) {
    clearTimeout(copyToastTimer);
  }

  copyToastTimer = setTimeout(() => {
    copyToast.hidden = true;
    copyToast.classList.remove("is-error");
  }, 5200);
}

function renderGptOpenLink() {
  const item = document.createElement("li");
  const link = document.createElement("a");
  link.href = MY_GPT_URL;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "GPTを開く";
  item.append("新しいタブが開かない場合は、こちらから開いてください: ", link);
  aiList.appendChild(item);
}

function showMobileGptModal() {
  if (!isMobileDevice()) return;
  mobileGptModal.hidden = false;
  mobileGptOpenButton.focus();
}

function hideMobileGptModal() {
  mobileGptModal.hidden = true;
}

function updateAiButtonLabel() {
  aiButton.textContent = isMobileDevice() ? "AI相談用コピー" : "AI相談へ送る";
}

function buildExternalGptConsultation(input, localResult) {
  const interview = getInterviewInput();
  const symptomName = selectedSymptomName(input.symptomId) || NO_DATA;
  const lines = [
    "整備相談用GPTへの相談文",
    "",
    "以下は現車確認前または確認途中の情報です。原因を断定せず、事実と推測を分けて診断補助をお願いします。",
    "",
    "【車両情報】",
    input.vehicle || NO_DATA,
    "",
    "【OBD2コード】",
    input.obdCode || NO_DATA,
    "",
    "【症状】",
    symptomName,
    "",
    "【確認済みの事実】",
    input.facts || NO_DATA,
    "",
    "【登録データから整理済みの事実】",
    listForPrompt(localResult.facts),
    "",
    "【問診内容】",
    `いつから症状が出たか: ${interview.since || NO_DATA}`,
    `冷間時だけか: ${yesNoText(interview.coldOnly) || NO_DATA}`,
    `暖気後も出るか: ${yesNoText(interview.warm) || NO_DATA}`,
    `雨の日や湿気が多い日に出るか: ${yesNoText(interview.wet) || NO_DATA}`,
    `警告灯は点灯しているか: ${yesNoText(interview.warningLight) || NO_DATA}`,
    `OBD2コードはあるか: ${yesNoText(interview.obdExists) || NO_DATA}`,
    `異音はどこから出るか: ${interview.noiseLocation || NO_DATA}`,
    `症状は常に出るか、たまに出るか: ${frequencyText(interview.frequency) || NO_DATA}`,
    `最近交換した部品はあるか: ${interview.recentParts || NO_DATA}`,
    `バッテリー電圧は測定したか: ${interview.batteryVoltage || NO_DATA}`,
    `エンジン始動時のセルの回り方: ${crankingText(interview.cranking) || NO_DATA}`,
    `加速時、減速時、停車時のどこで出るか: ${drivingText(interview.drivingCondition) || NO_DATA}`,
    "",
    "【安全注意】",
    listForPrompt(localResult.safetyItems),
    "",
    "【相談したいこと】",
    "原因を断定せず、確認順序・測定ポイント・早とちり注意を整理してください。"
  ];

  return lines.join("\n");
}

function listForPrompt(items) {
  if (!items || !items.length) return NO_DATA;
  return items.map((item) => `- ${item}`).join("\n");
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      // Some mobile and embedded browsers expose Clipboard API but reject writeText.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    textarea.remove();
  }

  if (!copied) {
    throw new Error("クリップボードへコピーできませんでした。ブラウザの権限を確認してください。");
  }
}

function isMobileDevice() {
  return window.innerWidth <= 768;
}

function saveCase() {
  const record = collectCaseForm();
  const quality = evaluateCaseQuality(record);
  renderCaseQuality(quality);

  if (quality.blockers.length) {
    caseStatus.textContent = `保存不可: ${quality.blockers.join(" / ")}`;
    return;
  }

  const confirmMessage = [
    "この内容で保存しますか？",
    "",
    `データ品質スコア: ${quality.score}点`,
    `不足・注意項目: ${quality.issues.length ? quality.issues.join(" / ") : "なし"}`,
    "",
    `AI推測: ${record.aiGuess || NO_DATA}`,
    `実整備結果: ${record.confirmedFacts || NO_DATA}`,
    `最終原因: ${record.finalCause || NO_DATA}`,
    "",
    "AI推測と実整備結果を混同していないこと、個人情報やナンバーを含まないことを確認してください。"
  ].join("\n");

  if (!confirm(confirmMessage)) {
    caseStatus.textContent = "保存をキャンセルしました。";
    return;
  }

  const duplicate = findDuplicateCase(record);
  if (duplicate && !confirm(`類似または重複の可能性がある事例があります。\n既存ID: ${duplicate.id}\nそれでも保存しますか？`)) {
    caseStatus.textContent = "重複の可能性があるため保存を中止しました。";
    return;
  }

  savedCases.unshift(record);
  persistCases();
  caseForm.reset();
  setDefaultCaseDate();
  setNextCaseId();
  updateCaseQualityPreview();
  renderCases();
  renderSimilarCases();
  caseStatus.textContent = `保存しました。現在の保存件数: ${savedCases.length}件`;
}

function collectCaseForm() {
  const now = new Date().toISOString();
  const id = valueOf("#caseId") || createCaseId();
  const creatorName = valueOf("#caseCreator");

  return {
    schemaVersion: 2,
    id,
    createdAt: now,
    updatedAt: now,
    creatorName,
    registrationDate: valueOf("#caseDate") || new Date().toISOString().slice(0, 10),
    technician: valueOf("#caseTechnician"),
    maker: valueOf("#caseMaker"),
    model: valueOf("#caseModel"),
    year: valueOf("#caseYear"),
    engine: valueOf("#caseEngine"),
    mileage: valueOf("#caseMileage"),
    symptom: valueOf("#caseSymptom"),
    obdCode: normalizeCode(valueOf("#caseObd")),
    aiGuess: valueOf("#caseAiGuess"),
    confirmedFacts: valueOf("#caseConfirmed"),
    measurements: valueOf("#caseMeasurements"),
    finalCause: valueOf("#caseCause"),
    work: valueOf("#caseWork"),
    replacedParts: valueOf("#caseParts"),
    repairResult: valueOf("#caseResult"),
    recurrence: valueOf("#caseRecurrence"),
    memo: valueOf("#caseMemo"),
    confidence: valueOf("#caseConfidence"),
    sources: valueOf("#caseSources")
  };
}

function normalizeCase(item) {
  const source = isCaseRecord(item) ? item : {};
  const now = new Date().toISOString();
  return {
    schemaVersion: Number(source.schemaVersion || 1) >= 2 ? source.schemaVersion : 2,
    id: source.id || createCaseId(),
    createdAt: source.createdAt || now,
    updatedAt: source.updatedAt || source.createdAt || now,
    creatorName: source.creatorName || source.technician || "",
    registrationDate: source.registrationDate || source.date || "",
    technician: source.technician || "",
    maker: source.maker || "",
    model: source.model || "",
    year: source.year || "",
    engine: source.engine || "",
    mileage: source.mileage || "",
    symptom: source.symptom || "",
    obdCode: normalizeCode(source.obdCode || ""),
    aiGuess: source.aiGuess || "",
    confirmedFacts: source.confirmedFacts || "",
    measurements: source.measurements || "",
    finalCause: source.finalCause || "",
    work: source.work || "",
    replacedParts: source.replacedParts || "",
    repairResult: source.repairResult || "経過観察",
    recurrence: source.recurrence || "不明",
    memo: source.memo || "",
    confidence: source.confidence || "低",
    sources: source.sources || ""
  };
}

function isCaseRecord(item) {
  return Boolean(item)
    && typeof item === "object"
    && !Array.isArray(item)
    && ["id", "maker", "model", "symptom", "confirmedFacts", "finalCause", "work"].some((key) => key in item);
}

function findDuplicateCase(record) {
  const key = duplicateKey(record);
  return savedCases.find((item) => duplicateKey(item) === key);
}

function duplicateKey(item) {
  return [
    item.maker,
    item.model,
    item.year,
    item.engine,
    item.obdCode,
    item.symptom,
    item.finalCause
  ].map((value) => String(value || "").trim().toLowerCase()).join("|");
}

function evaluateCaseQuality(record) {
  const blockers = [];
  const issues = [];
  const recommended = [];
  const requiredFields = [
    ["registrationDate", "登録日"],
    ["creatorName", "作成者名"],
    ["maker", "メーカー"],
    ["model", "車種"],
    ["year", "年式"],
    ["mileage", "走行距離"],
    ["symptom", "症状"],
    ["confirmedFacts", "実際に確認した内容"],
    ["finalCause", "最終原因"],
    ["work", "作業内容"],
    ["repairResult", "修理結果"],
    ["confidence", "確信度"],
    ["sources", "出典"]
  ];

  requiredFields.forEach(([key, label]) => {
    if (!record[key]) blockers.push(`${label}が未入力です`);
  });

  if (record.obdCode && !/^[PCBU][0-9A-F]{4}$/.test(record.obdCode)) {
    blockers.push("OBD2コード形式が不正です");
  }

  if (record.mileage && !/^[0-9]+$/.test(record.mileage)) {
    blockers.push("走行距離は数字のみで入力してください");
  }

  if (record.year && !/^[0-9]+$/.test(record.year)) {
    blockers.push("年式は数字のみで入力してください");
  }

  if (!["直った", "直らなかった", "経過観察"].includes(record.repairResult)) {
    blockers.push("修理結果を選択してください");
  }

  if (record.aiGuess && !record.confirmedFacts) {
    blockers.push("AI推測だけでは保存できません。実際に確認した内容を入力してください");
  }

  if (record.aiGuess && sameLooseText(record.aiGuess, record.confirmedFacts)) {
    issues.push("AI推測と実際に確認した内容が同一です。仮説と事実を分けてください");
  }

  if (!record.obdCode) recommended.push("OBD2コードがない場合は、なし・未取得などをメモに残すと後で検索しやすくなります");
  if (!record.measurements) recommended.push("測定値が未入力です");
  if (!record.replacedParts) recommended.push("交換部品がない場合は、なしと記録すると後で集計しやすくなります");
  if (!record.recurrence || record.recurrence === "不明") recommended.push("再発の有無が不明です。後日更新できるようにしてください");
  if (containsPersonalInfoRisk(record)) issues.push("個人情報やナンバーらしき文字列が含まれていないか確認してください");

  const totalChecks = requiredFields.length + 5;
  const penalty = blockers.length * 10 + issues.length * 6 + recommended.length * 3;
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty + Math.min(totalChecks, 18))));

  return {
    blockers,
    issues: [...issues, ...recommended],
    score
  };
}

function updateCaseQualityPreview() {
  const quality = evaluateCaseQuality(collectCaseForm());
  renderCaseQuality(quality);
}

function renderCaseQuality(quality) {
  caseQualityScore.textContent = `品質スコア: ${quality.score}点`;
  caseQualityIssues.innerHTML = "";
  const items = [...quality.blockers.map((item) => `保存不可: ${item}`), ...quality.issues.map((item) => `不足・注意: ${item}`)];

  if (!items.length) {
    const ok = document.createElement("li");
    ok.textContent = "不足項目はありません。保存前確認へ進めます。";
    caseQualityIssues.appendChild(ok);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    caseQualityIssues.appendChild(li);
  });
}

function sameLooseText(a, b) {
  return normalizeLooseText(a) && normalizeLooseText(a) === normalizeLooseText(b);
}

function normalizeLooseText(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function containsPersonalInfoRisk(record) {
  const text = [
    record.symptom,
    record.confirmedFacts,
    record.memo,
    record.sources
  ].join(" ");
  const phoneLike = /0\\d{1,4}-?\\d{1,4}-?\\d{3,4}/.test(text);
  const plateLike = /[ぁ-ん]{1,4}\\s?\\d{2,3}\\s?[ぁ-ん]\\s?\\d{2,4}/.test(text);
  return phoneLike || plateLike;
}

function renderCases() {
  const keyword = caseSearch.value.trim().toLowerCase();
  const filtered = savedCases.filter((item) => {
    const target = [item.maker, item.model, item.symptom, item.obdCode, item.finalCause, item.confirmedFacts].join(" ").toLowerCase();
    return target.includes(keyword);
  });

  renderCaseCards(caseList, filtered, "保存済み事例はまだありません。");
  if (!keyword) {
    caseStatus.textContent = `整備事例はこのブラウザのlocalStorageに保存されます。保存件数: ${savedCases.length}件`;
  } else {
    caseStatus.textContent = `検索結果: ${filtered.length}件 / 保存件数: ${savedCases.length}件`;
  }
}

function renderSimilarCases() {
  const input = getInput();
  const terms = collectUnique([
    input.obdCode,
    selectedSymptomName(input.symptomId),
    ...input.facts.split(/\s+/).filter(Boolean)
  ]).filter((term) => term && term.length >= 2);
  const scored = savedCases
    .map((item) => ({ item, score: scoreCase(item, terms, input) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((entry) => entry.item);

  renderCaseCards(similarCases, scored, "類似事例はまだありません。診断条件や事例を増やすと表示されます。");
}

function renderCaseCards(container, cases, emptyText) {
  container.innerHTML = "";

  if (!cases.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  cases.forEach((item) => {
    const card = document.createElement("article");
    card.className = "case-card";
    card.innerHTML = `
      <h4>${escapeHtml(item.registrationDate || NO_DATA)} / ${escapeHtml(item.maker || NO_DATA)} ${escapeHtml(item.model || "")}</h4>
      <p><strong>事例ID:</strong> ${escapeHtml(item.id || NO_DATA)} / <strong>作成:</strong> ${escapeHtml(formatDateTime(item.createdAt))} / <strong>更新:</strong> ${escapeHtml(formatDateTime(item.updatedAt))}</p>
      <p><strong>作成者:</strong> ${escapeHtml(item.creatorName || NO_DATA)}</p>
      <p><strong>症状:</strong> ${escapeHtml(item.symptom || NO_DATA)}</p>
      <p><strong>OBD2:</strong> ${escapeHtml(item.obdCode || NO_DATA)} / <strong>結果:</strong> ${escapeHtml(item.repairResult || NO_DATA)} / <strong>再発:</strong> ${escapeHtml(item.recurrence || NO_DATA)}</p>
      <p><strong>AI推測:</strong> ${escapeHtml(item.aiGuess || NO_DATA)}</p>
      <p><strong>実際に確認した内容:</strong> ${escapeHtml(item.confirmedFacts || NO_DATA)}</p>
      <p><strong>最終原因:</strong> ${escapeHtml(item.finalCause || NO_DATA)}</p>
      <p><strong>交換部品:</strong> ${escapeHtml(item.replacedParts || NO_DATA)}</p>
      <div class="case-actions">
        <button class="small-danger-button" type="button" data-delete-case="${item.id}">削除</button>
      </div>
    `;
    fragment.appendChild(card);
  });

  container.appendChild(fragment);
}

caseList.addEventListener("click", handleCaseDelete);
similarCases.addEventListener("click", handleCaseDelete);

function handleCaseDelete(event) {
  const button = event.target.closest("[data-delete-case]");
  if (!button) return;
  if (!confirm("この整備事例を削除しますか？")) return;

  savedCases = savedCases.filter((item) => item.id !== button.dataset.deleteCase);
  persistCases();
  renderCases();
  renderSimilarCases();
}

function exportCasesCsv() {
  if (!savedCases.length) {
    alert("エクスポートできる整備事例がありません。");
    return;
  }

  const csv = buildCasesCsv(savedCases);
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `整備事例_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportCasesJson() {
  const backup = buildCasesBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `整備事例バックアップ_${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function seedDummyCases() {
  const dummyCases = createDummyCases();
  let added = 0;
  let skipped = 0;

  dummyCases.forEach((record) => {
    if (findDuplicateCase(record) || savedCases.some((item) => item.id === record.id)) {
      skipped += 1;
      return;
    }
    savedCases.unshift(record);
    added += 1;
  });

  persistCases();
  renderCases();
  renderSimilarCases();
  updateCaseQualityPreview();
  renderOpsResults([
    `ダミーデータ作成: 追加 ${added}件 / 重複スキップ ${skipped}件`,
    `現在の保存件数: ${savedCases.length}件`
  ]);
}

function createDummyCases() {
  const now = new Date().toISOString();
  const base = [
    ["CASE-DUMMY-001", "トヨタ", "プリウス", "2018", "2ZR-FXE", "85000", "アイドリング不調", "P0171", "吸気漏れの可能性があります。", "燃料トリム+18%、吸気ダクト亀裂を確認。", "LTFT +18%", "吸気ダクト亀裂", "吸気ダクト確認と交換後、燃料トリム確認", "吸気ダクト", "直った", "なし", "中"],
    ["CASE-DUMMY-002", "ホンダ", "フィット", "2016", "L13B", "72000", "チェックランプ点灯", "P0300", "点火または燃料系の可能性があります。", "2番コイル入替で失火気筒が移動。", "失火カウンター増加", "イグニッションコイル不良", "コイル入替確認、プラグ確認", "イグニッションコイル", "直った", "なし", "中"],
    ["CASE-DUMMY-003", "日産", "セレナ", "2015", "MR20", "93000", "加速不良", "P0420", "触媒効率低下の可能性があります。", "排気漏れなし、失火履歴あり。", "O2前後波形類似", "触媒劣化の疑い", "失火修理後に再確認", "なし", "経過観察", "不明", "低"],
    ["CASE-DUMMY-004", "スズキ", "ワゴンR", "2014", "R06A", "66000", "エンジン始動不良", "", "12V電源低下の可能性があります。", "始動時電圧8.9V、端子腐食あり。", "始動時8.9V", "バッテリー端子接触不良", "端子清掃、充電電圧確認", "なし", "直った", "なし", "高"],
    ["CASE-DUMMY-005", "ダイハツ", "タント", "2017", "KF", "58000", "ブレーキ異音", "", "摩耗または異物噛み込みの可能性があります。", "右前パッド残量少、ローター傷あり。", "パッド残量2mm", "ブレーキパッド摩耗", "残量とローター厚み確認", "ブレーキパッド", "直った", "なし", "高"]
  ];

  return base.map((item) => normalizeCase({
    id: item[0],
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    creatorName: "テスト整備士",
    registrationDate: new Date().toISOString().slice(0, 10),
    technician: "テスト整備士",
    maker: item[1],
    model: item[2],
    year: item[3],
    engine: item[4],
    mileage: item[5],
    symptom: item[6],
    obdCode: item[7],
    aiGuess: item[8],
    confirmedFacts: item[9],
    measurements: item[10],
    finalCause: item[11],
    work: item[12],
    replacedParts: item[13],
    repairResult: item[14],
    recurrence: item[15],
    memo: "実運用前チェック用ダミーデータ",
    confidence: item[16],
    sources: "テストデータ"
  }));
}

function runSelfCheck() {
  const results = [];
  const before = savedCases.length;
  const testRecord = normalizeCase({
    id: `CASE-SELFTEST-${Date.now()}`,
    schemaVersion: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    creatorName: "セルフチェック",
    registrationDate: new Date().toISOString().slice(0, 10),
    technician: "セルフチェック",
    maker: "テスト",
    model: "テスト車",
    year: "2020",
    engine: "TEST",
    mileage: "10000",
    symptom: "保存検索テスト",
    obdCode: "P0171",
    aiGuess: "吸気漏れの可能性があります。",
    confirmedFacts: "セルフチェック用の確認事実。",
    measurements: "LTFT +10%",
    finalCause: "テスト原因",
    work: "テスト作業",
    replacedParts: "なし",
    repairResult: "経過観察",
    recurrence: "不明",
    memo: "セルフチェック後に自動削除",
    confidence: "低",
    sources: "セルフチェック"
  });

  savedCases.unshift(testRecord);
  persistCases();
  results.push(savedCases.length === before + 1 ? "保存チェック: OK" : "保存チェック: NG");

  const found = savedCases.filter((item) => [item.model, item.symptom, item.obdCode].join(" ").includes("P0171"));
  results.push(found.length ? "検索チェック: OK" : "検索チェック: NG");

  const csvPreview = buildCasesCsv(savedCases);
  results.push(csvPreview.includes("事例ID") && csvPreview.includes(testRecord.id) ? "CSV出力チェック: OK" : "CSV出力チェック: NG");

  const backup = buildCasesBackup();
  results.push(backup.records.some((item) => item.id === testRecord.id) ? "JSONバックアップチェック: OK" : "JSONバックアップチェック: NG");

  const importPreview = [...backup.records, null].filter(isCaseRecord).map(normalizeCase);
  const importCheck = importPreview.some((item) => item.id === testRecord.id) && importPreview.length === backup.records.length;
  results.push(importCheck ? "JSONインポート形式・不正行除外チェック: OK" : "JSONインポート形式・不正行除外チェック: NG");

  savedCases = savedCases.filter((item) => item.id !== testRecord.id);
  persistCases();
  renderCases();
  renderSimilarCases();
  results.push("セルフチェック用データ削除: OK");
  renderOpsResults(results);
}

function clearAllLocalStorage() {
  if (!confirm("このアプリの整備事例、テーマ設定、注意事項確認状態をすべて削除しますか？")) return;
  if (!confirm("本当に削除しますか？この操作は元に戻せません。")) return;

  localStorage.removeItem(CASES_KEY);
  localStorage.removeItem(THEME_KEY);
  localStorage.removeItem(NOTICE_KEY);
  savedCases = [];
  applyTheme("light");
  renderCases();
  renderSimilarCases();
  updateCaseQualityPreview();
  renderOpsResults(["アプリ保存データ全削除: OK"]);
}

function buildCasesBackup() {
  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    app: "vehicle-diagnosis-tool",
    appVersion: APP_VERSION,
    records: savedCases.map(normalizeCase)
  };
}

function buildCasesCsv(cases) {
  const headers = ["事例ID", "作成日時", "更新日時", "作成者名", "登録日", "整備士名", "メーカー", "車種", "年式", "エンジン型式", "走行距離", "症状", "OBD2コード", "AI推測", "実際に確認した内容", "測定値", "最終原因", "作業内容", "交換部品", "修理結果", "再発の有無", "メモ", "確信度", "出典"];
  const rows = cases.map((item) => [item.id, item.createdAt, item.updatedAt, item.creatorName, item.registrationDate, item.technician, item.maker, item.model, item.year, item.engine, item.mileage, item.symptom, item.obdCode, item.aiGuess, item.confirmedFacts, item.measurements, item.finalCause, item.work, item.replacedParts, item.repairResult, item.recurrence, item.memo, item.confidence, item.sources]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function renderOpsResults(items) {
  opsResultList.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    opsResultList.appendChild(li);
  });
}

function showInitialNotice() {
  if (localStorage.getItem(NOTICE_KEY) === "accepted") return;
  if (typeof noticeModal.showModal === "function") {
    noticeModal.showModal();
  }
}

function importCasesJson(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const records = Array.isArray(parsed) ? parsed : parsed.records;
      if (!Array.isArray(records)) throw new Error("records 配列が見つかりません。");

      let added = 0;
      let skipped = 0;
      let invalid = 0;
      records.forEach((item) => {
        if (!isCaseRecord(item)) {
          invalid += 1;
          return;
        }
        const record = normalizeCase(item);
        if (findDuplicateCase(record) || savedCases.some((item) => item.id === record.id)) {
          skipped += 1;
          return;
        }
        savedCases.push(record);
        added += 1;
      });

      persistCases();
      renderCases();
      renderSimilarCases();
      caseStatus.textContent = `JSONインポート完了: 追加 ${added}件 / 重複スキップ ${skipped}件 / 不正行スキップ ${invalid}件`;
      setNextCaseId();
    } catch (error) {
      caseStatus.textContent = `JSONインポート失敗: ${error.message}`;
    } finally {
      importJsonInput.value = "";
    }
  };
  reader.readAsText(file, "utf-8");
}

function scoreCase(item, terms, input) {
  let score = 0;
  const target = [item.maker, item.model, item.symptom, item.obdCode, item.finalCause, item.confirmedFacts, item.measurements].join(" ").toLowerCase();

  if (input.obdCode && item.obdCode === input.obdCode) score += 5;
  terms.forEach((term) => {
    if (target.includes(String(term).toLowerCase())) score += 1;
  });

  return score;
}

function selectedSymptomName(symptomId) {
  const flow = findById(dataStore.symptomFlows, symptomId);
  return flow ? flow.symptomName : "";
}

function loadCases() {
  const stored = localStorage.getItem(CASES_KEY);
  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isCaseRecord).map(normalizeCase) : [];
  } catch (error) {
    return [];
  }
}

function persistCases() {
  localStorage.setItem(CASES_KEY, JSON.stringify(savedCases));
}

function setDefaultCaseDate() {
  const dateInput = document.querySelector("#caseDate");
  if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
  setNextCaseId();
}

function setNextCaseId() {
  const idInput = document.querySelector("#caseId");
  if (idInput && !idInput.value) idInput.value = createCaseId();
}

function valueOf(selector) {
  return document.querySelector(selector).value.trim();
}

function csvCell(value) {
  const textValue = String(value || "");
  return `"${textValue.replace(/"/g, '""')}"`;
}

function createCaseId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CASE-${date}-${random}`;
}

function createId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return entities[char];
  });
}

function formatDateTime(value) {
  if (!value) return NO_DATA;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function renderItems(container, items) {
  container.innerHTML = "";
  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
    const element = document.createElement("li");
    element.textContent = item;
    fragment.appendChild(element);
  });

  container.appendChild(fragment);
}

function hideResult() {
  emptyState.hidden = false;
  resultContent.hidden = true;
  flowView.hidden = true;
  flowChart.innerHTML = "";
  safetyPanel.hidden = true;
  confidenceBadge.textContent = "確信度: 未作成";
  aiStatus.textContent = "AI相談は未送信です。";
  aiList.innerHTML = "";
  renderSimilarCases();
}

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.body.classList.toggle("dark", isDark);
  themeButton.textContent = isDark ? "ライト" : "ダーク";
  themeButton.setAttribute("aria-pressed", String(isDark));
}

function findByCode(code) {
  if (!code) return null;
  return dataStore.obdCodes.find((item) => item.code === code) || null;
}

function findById(items, id) {
  if (!id) return null;
  return items.find((item) => item.id === id) || null;
}

function normalizeCode(value) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function collectUnique(items) {
  return [...new Set(items.filter(Boolean))];
}

function makeFlow(id, symptomName, faultSystem, measurements, safetyTags) {
  return {
    id,
    symptomName,
    symptomSummary: `${symptomName}は複数系統で起きるため、症状条件と測定値を分けて確認します。`,
    faultSystem,
    possibleSystems: faultSystem.split("、"),
    facts: [`${symptomName}として登録されたサンプル症状フローです。`],
    priorityChecks: ["警告灯とDTCを確認する。", "症状が出る条件を確認する。", "安全に関わる兆候を確認する。"],
    firstLook: ["目視できる漏れ、外れ、損傷、異臭、異音を確認する。"],
    measurements,
    ifNormalNext: ["次の系統へ進み、同じ症状が再現する条件を確認する。"],
    ifAbnormalSuspect: ["異常が出た測定項目に関係する配線、コネクタ、作動部、機械部を確認する。"],
    likelyButUnconfirmed: faultSystem.split("、"),
    commonMistakes: ["コード名や症状名だけで部品不良と決めつける。"],
    beforeParts: ["DTC、フリーズフレーム、電源、アース、コネクタ、基準値を確認する。"],
    customerExplanation: "現時点では原因候補を絞る段階です。測定値と実車確認を行い、整備書の基準と照合して判断します。",
    manualRequiredItems: ["症状別診断表", "DTC別診断手順", "基準値", "締付トルク", "脱着手順"],
    safetyTags,
    confidence: "低",
    sources: ["登録データ: symptom-flows.json"]
  };
}
