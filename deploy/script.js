const THEME_KEY = "vehicle-diagnosis-theme";
const CASES_KEY = "vehicle-diagnosis-cases-v1";
const NOTICE_KEY = "vehicle-diagnosis-notice-accepted-v1";
const OBD_ACCESS_MODE_KEY = "vehicle-diagnosis-obd-access-v1";
const OBD_ACCESS_PASSWORD_HASH = "ff61c820434cfe58f495f0688990b3c02c12120bb1bd4d167d92f88b3de0d7e0";
const OBD_DEV_MODE_KEY = "vehicle-diagnosis-obd-dev-mode-v1";
const OBD_DEV_TOKEN_KEY = "vehicle-diagnosis-obd-dev-token-v1";
const OBD_LOCAL_BRIDGE_PORTS = [8765, 17653];
const OBD_LOCAL_BRIDGE_PATHS = ["/v1/bridge", "/v1/request", "/v1"];
const OBD_LOCAL_BRIDGE_TIMEOUT_MS = 20000;
const BRIDGE_BACKED_INTERFACE_IDS = Object.freeze([
  "user-vci-thinkcar-bluetooth",
  "user-vci-techstream-j2534",
  "user-vci-rcmall-mks-canable-v2-pro"
]);
const INTERFACE_CANDIDATE_DISPLAY_NAMES = Object.freeze({
  "user-vci-thinkcar-bluetooth": "THINKCAR系候補",
  "user-vci-techstream-j2534": "有線OBD2（J2534適合確認）",
  "user-vci-rcmall-mks-canable-v2-pro": "CANable候補"
});
const BRIDGE_BACKED_IMPLEMENTATION_CHECK_BUILDERS = Object.freeze({
  "user-vci-techstream-j2534": () => [
    {
      label: "VCI列挙表示",
      available: hasBridgeVciSupport()
    },
    {
      label: "アダプター識別",
      available: hasBridgeAdapterIdentitySupport()
    }
  ],
  "user-vci-thinkcar-bluetooth": () => [
    {
      label: "VCI列挙表示",
      available: hasBridgeVciSupport()
    },
    {
      label: "Bluetooth読取取込",
      available: hasBridgeBluetoothImportSupport()
    }
  ],
  "user-vci-rcmall-mks-canable-v2-pro": () => [
    {
      label: "VCI列挙表示",
      available: hasBridgeVciSupport()
    },
    {
      label: "CAN系読取取込の器",
      available: hasBridgeDiagnosticImportSupport()
    }
  ]
});
const ELM327_IMPLEMENTATION_CHECK_LABELS = Object.freeze({
  webSerial: "Web Serial準備",
  standardRead: "標準OBD読取要求"
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

function hasBridgeReadinessContractSupport() {
  const contract = window.ObdReadOnly?.getLocalBridgeContract?.();
  const schemas = window.ObdReadOnly?.getLocalBridgeResponseSchemas?.() || [];
  return hasBridgeIntentModel(
    "read_readiness",
    new Set(schemas.map((item) => item.intent)),
    new Set(contract?.allowedReadIntents || []),
    () => typeof window.ObdReadOnly?.normalizeBridgeReadinessSnapshot === "function"
  );
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

function hasBridgeDiagnosticScanSessionSupport() {
  return typeof window.ObdReadOnly?.buildDiagnosticScanSession === "function";
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
    progressPercent: 39,
    currentBasis: "Windowsレジストリ列挙、DLL静的確認、PassThruOpen前レビュー、別プロセスの非実行隔離ワーカー契約まで実装済み。実ドライバーは未登録。",
    nextBuild: "対応J2534ドライバーを登録して静的適合を確認し、隔離ワーカーへReadVersion限定のDLLロード段階を追加する。",
    etaTarget: "2026-Q3 見込み"
  }),
  uds_canfd: Object.freeze({
    progressPercent: 95,
    currentBasis: "read-only DID / ECU情報、拡張DTC、NRC、ISO-TPログ取込、DID要求マニフェスト、bridge ECU範囲一致、transport resultからcompletion manifestへのfail-closed変換、J2534隔離worker出力、x86/x64 native transport fixtureの7状態とbounded supervisor監督、全識別子を束縛するreadout attempt controller、検証済みpreflightをopaque・one-shotで引き継ぐfixture-only transport adapter request境界、production identity runnerの固定配線、公開snapshot偽造拒否、identity operation statusのverified_non_executable統一、workstation向けproduction UDS request準備の匿名化証拠と32KB上限付き厳格再検証まで実装済み。実transportアダプターは未実装。",
    nextBuild: "登録済み実J2534 driver環境で匿名化request準備証拠を採取し、実VCI互換性未確認のままproduction adapter lifecycleの実測差分を固定する。",
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
const OBD_CORE_PROGRESS_SNAPSHOT = Object.freeze({
  validationCheckLabel: "OBD安全検証 7269件",
  bridgeValidationCheckLabel: "bridge検証 384件",
  recentMilestone: "車両適合根拠の要確認表示を厳格化",
  scopeNote: "自動検証件数は実車確認済み車種数や完成率ではありません"
});
const APP_VERSION = "3.13.379";
const APP_LAST_UPDATED = "2026-08-31";
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
const offlineCacheStatus = document.querySelector("#offlineCacheStatus");
let offlineCacheStatusRevision = 0;
const symptomSelect = document.querySelector("#symptomSelect");
const vehicleInput = document.querySelector("#vehicle");
const vehicleMakerSelect = document.querySelector("#vehicleMaker");
const vehicleModelSelect = document.querySelector("#vehicleModel");
const vehicleModelCodeSelect = document.querySelector("#vehicleModelCode");
const vehicleEngineCodeSelect = document.querySelector("#vehicleEngineCode");
const vehicleYearSelect = document.querySelector("#vehicleYear");
const vehicleYearManualInput = document.querySelector("#vehicleYearManual");
const vehicleProductionDateInput = document.querySelector("#vehicleProductionDate");
const vehicleManualInput = document.querySelector("#vehicleManual");
const vehicleSelectionSummary = document.querySelector("#vehicleSelectionSummary");
const obdVehicleInput = document.querySelector("#obdVehicle");
const obdVehicleMakerSelect = document.querySelector("#obdVehicleMaker");
const obdVehicleModelSelect = document.querySelector("#obdVehicleModel");
const obdVehicleModelCodeSelect = document.querySelector("#obdVehicleModelCode");
const obdVehicleEngineCodeSelect = document.querySelector("#obdVehicleEngineCode");
const obdVehicleYearSelect = document.querySelector("#obdVehicleYear");
const obdVehicleYearManualInput = document.querySelector("#obdVehicleYearManual");
const obdVehicleProductionDateInput = document.querySelector("#obdVehicleProductionDate");
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
const causeCandidateLogList = document.querySelector("#causeCandidateLogList");
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
const nextMeasurementCandidateList = document.querySelector("#nextMeasurementCandidateList");
const postRepairReassessmentList = document.querySelector("#postRepairReassessmentList");
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
const caseStorageWarning = document.querySelector("#caseStorageWarning");
const caseStorageWarningText = document.querySelector("#caseStorageWarningText");
const retryCaseStorageButton = document.querySelector("#retryCaseStorageButton");
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
const obdStagePanel = document.querySelector("#obdStagePanel");
const obdStageBadge = document.querySelector("#obdStageBadge");
const obdStageStatus = document.querySelector("#obdStageStatus");
const obdStageTabs = document.querySelectorAll("[data-obd-stage]");
const obdStageSetupView = document.querySelector("#obdStageSetupView");
const obdStageResultsView = document.querySelector("#obdStageResultsView");
const obdStageDetailsView = document.querySelector("#obdStageDetailsView");
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
const obdBridgePairingControls = document.querySelector("#obdBridgePairingControls");
const obdBridgePairingInput = document.querySelector("#obdBridgePairingInput");
const obdBridgePairingApplyButton = document.querySelector("#obdBridgePairingApplyButton");
const obdBridgePairingClearButton = document.querySelector("#obdBridgePairingClearButton");
const obdBridgePairingStatus = document.querySelector("#obdBridgePairingStatus");
const obdDevModeBadge = document.querySelector("#obdDevModeBadge");
const obdDevControls = document.querySelector("#obdDevControls");
const obdDevIdentifyButton = document.querySelector("#obdDevIdentifyButton");
const obdDevCoreScanButton = document.querySelector("#obdDevCoreScanButton");
const obdDevQuickConditionButton = document.querySelector("#obdDevQuickConditionButton");
const obdDevReadDtcButton = document.querySelector("#obdDevReadDtcButton");
const obdDevReadFreezeFrameButton = document.querySelector("#obdDevReadFreezeFrameButton");
const obdDevReadReadinessButton = document.querySelector("#obdDevReadReadinessButton");
const obdDevSnapshotButton = document.querySelector("#obdDevSnapshotButton");
const obdLiveObservationCondition = document.querySelector("#obdLiveObservationCondition");
const obdLiveThermalState = document.querySelector("#obdLiveThermalState");
const obdVehicleMotionState = document.querySelector("#obdVehicleMotionState");
const obdTransmissionPosition = document.querySelector("#obdTransmissionPosition");
const obdAccessoryLoadState = document.querySelector("#obdAccessoryLoadState");
const obdSameVehicleConfirmed = document.querySelector("#obdSameVehicleConfirmed");
const obdDevReadEcuInfoButton = document.querySelector("#obdDevReadEcuInfoButton");
const obdDevReadOnboardMonitorButton = document.querySelector("#obdDevReadOnboardMonitorButton");
const obdDevBridgeStatusButton = document.querySelector("#obdDevBridgeStatusButton");
const obdDevBridgeVciButton = document.querySelector("#obdDevBridgeVciButton");
const obdDevBridgeDtcButton = document.querySelector("#obdDevBridgeDtcButton");
const obdDevBridgePendingDtcButton = document.querySelector("#obdDevBridgePendingDtcButton");
const obdDevBridgePermanentDtcButton = document.querySelector("#obdDevBridgePermanentDtcButton");
const obdDevBridgeEcuInfoButton = document.querySelector("#obdDevBridgeEcuInfoButton");
const obdDevBridgeMonitorButton = document.querySelector("#obdDevBridgeMonitorButton");
const obdDevBridgeSupportedPidButton = document.querySelector("#obdDevBridgeSupportedPidButton");
const obdDevBridgeFreezeFrameButton = document.querySelector("#obdDevBridgeFreezeFrameButton");
const obdDevBridgeReadinessButton = document.querySelector("#obdDevBridgeReadinessButton");
const obdDevBridgeLiveButton = document.querySelector("#obdDevBridgeLiveButton");
const obdDevDisconnectButton = document.querySelector("#obdDevDisconnectButton");
const obdDevStatus = document.querySelector("#obdDevStatus");
const obdDiagnosticFlowPanels = document.querySelectorAll("[data-obd-diagnostic-flow-panel]");
const obdDevSessionSummary = document.querySelector("#obdDevSessionSummary");
const obdDevSessionDetails = document.querySelector("#obdDevSessionDetails");
const obdNextReadoutPanel = document.querySelector("#obdNextReadoutPanel");
const obdNextReadoutList = document.querySelector("#obdNextReadoutList");
const obdScannerText = document.querySelector("#obdScannerText");
const obdAnalyzeButton = document.querySelector("#obdAnalyzeButton");
const obdImportPasteButton = document.querySelector("#obdImportPasteButton");
const obdImportFileInput = document.querySelector("#obdImportFileInput");
const obdSampleButton = document.querySelector("#obdSampleButton");
const obdManufacturerSampleTemplateButton = document.querySelector("#obdManufacturerSampleTemplateButton");
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

initializeObdStatusDisclosures();
initializeObdMonitorFilter();
initializeObdDtcFilter();

function initializeObdMonitorFilter() {
  initializeObdReadoutFilter(obdMonitorGrid, "obdMonitor", "monitorSearch", "項目");
}

function initializeObdDtcFilter() {
  initializeObdReadoutFilter(obdDetectedCodes, "obdDtc", "dtcSearch", "件");
}

function initializeObdReadoutFilter(grid, prefix, searchKey, unit) {
  const toolbar = document.querySelector(`#${prefix}Filter`);
  const input = document.querySelector(`#${prefix}Search`);
  const clear = document.querySelector(`#${prefix}SearchClear`);
  const count = document.querySelector(`#${prefix}FilterCount`);
  const empty = document.querySelector(`#${prefix}FilterEmpty`);
  if (!toolbar || !input || !clear || !count || !empty || typeof MutationObserver === "undefined") return;
  const normalize = (text) => String(text || "").normalize("NFKC").toLowerCase();
  const refresh = () => {
    const cards = Array.from(grid.children);
    if (!cards.length) input.value = "";
    const terms = normalize(input.value).trim().split(/\s+/).filter(Boolean);
    let visible = 0;
    for (const card of cards) {
      const searchText = normalize(card.dataset[searchKey]);
      const matches = terms.every((term) => searchText.includes(term));
      card.hidden = !matches;
      if (matches) visible += 1;
    }
    toolbar.hidden = cards.length === 0;
    clear.disabled = input.value.length === 0;
    count.textContent = terms.length ? `絞込中: ${visible} / ${cards.length}${unit}` : `全${cards.length}${unit}を表示`;
    empty.hidden = !cards.length || visible > 0;
  };
  input.addEventListener("input", refresh);
  clear.addEventListener("click", () => { input.value = ""; refresh(); input.focus(); });
  // Observe replacements only; changing card visibility must not trigger another refresh.
  new MutationObserver(refresh).observe(grid, { childList: true });
  refresh();
}

function initializeObdStatusDisclosures() {
  document.querySelectorAll(".obd-status-details").forEach((details) => {
    details.open = true;
    if (typeof MutationObserver === "undefined") {
      details.querySelector("summary")?.addEventListener("click", (event) => event.preventDefault());
      return;
    }
    // New results and errors must be visible even after a manual collapse.
    const observer = new MutationObserver(() => { details.open = true; });
    details.querySelectorAll("p, .obd-import-hints").forEach((content) => {
      observer.observe(content, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    });
  });
}

const OBD_NEXT_READOUT_ACTIONS = Object.freeze({
  dtc_snapshot: Object.freeze({ button: () => (obdDevSession.bridgeEndpoint ? obdDevBridgeDtcButton : obdDevReadDtcButton), label: "DTC読取" }),
  freeze_frame_snapshot: Object.freeze({ button: () => (obdDevSession.bridgeEndpoint ? obdDevBridgeFreezeFrameButton : obdDevReadFreezeFrameButton), label: "フリーズフレーム読取" }),
  readiness_snapshot: Object.freeze({ button: () => (obdDevSession.bridgeEndpoint ? obdDevBridgeReadinessButton : obdDevReadReadinessButton), label: "レディネス読取" }),
  ecu_info_snapshot: Object.freeze({ button: () => (obdDevSession.bridgeEndpoint ? obdDevBridgeEcuInfoButton : obdDevReadEcuInfoButton), label: "ECU情報読取" }),
  live_pid_snapshot: Object.freeze({ button: () => (obdDevSession.bridgeEndpoint ? obdDevBridgeLiveButton : obdDevSnapshotButton), label: "ライブデータ読取" }),
  supported_pid_matrix: Object.freeze({ button: () => (obdDevSession.bridgeEndpoint ? obdDevBridgeSupportedPidButton : obdDevSnapshotButton), label: "対応PID読取" }),
  onboard_monitor_snapshot: Object.freeze({ button: () => (obdDevSession.bridgeEndpoint ? obdDevBridgeMonitorButton : obdDevReadOnboardMonitorButton), label: "Mode06/監視結果読取" }),
  connection_status: Object.freeze({ button: () => obdDevBridgeStatusButton, label: "接続状態確認" }),
  vci_devices: Object.freeze({ button: () => obdDevBridgeVciButton, label: "VCI一覧読取" }),
  adapter_identity: Object.freeze({ button: () => obdDevIdentifyButton, label: "アダプター確認" })
});
const tabPanels = document.querySelectorAll("[data-tab-panel]");

let dataStore = fallbackData;
let caseStorageReadError = "";
let savedCases = loadCases();
let copyToastTimer = null;
let activeResultView = "flow";
let obdAccessUnlocked = readOptionalBrowserSetting(OBD_ACCESS_MODE_KEY, true) === "enabled";
let obdDevModeUnlocked = readOptionalBrowserSetting(OBD_DEV_MODE_KEY, true) === "enabled";
let obdBridgePairingToken = "";
let obdBridgeOperation = null;
let obdSerialRevision = 0;
let obdSerialResultOwner = null;
let obdSerialConnectPending = false;
let obdSerialDisconnectOperation = null;
let obdScannerImportOperation = null;
let activeObdStage = "setup";
const ELM327_CONNECTION_STATES = Object.freeze(["disconnected", "selecting", "opening", "initializing", "ready", "reading", "disconnecting"]);
const WEB_SERIAL_DEFAULT_LIVE_PID_COMMANDS = Object.freeze(["010C", "0105", "010F", "010D", "010E", "0104", "0103", "010B", "0123", "0159", "0110", "0111", "0106", "0107", "0108", "0109", "0121", "012F", "0130", "0131", "0133", "0142", "011C", "011F", "0146", "014D", "0151", "015B", "015C"]);
const WEB_SERIAL_DEFAULT_FREEZE_FRAME_PID_COMMANDS = Object.freeze(["020C", "0205", "020F", "020D", "020E", "0204", "0203", "020A", "020B", "0223", "0259", "0210", "0211", "0206", "0207", "021F", "0242"]);
const WEB_SERIAL_QUICK_LIVE_PID_COMMANDS = Object.freeze(["010C", "0105", "010D", "0142"]);
const WEB_SERIAL_READ_ONLY_COMMANDS = Object.freeze([
  "ATZ", "ATE0", "ATL0", "ATS0", "ATH1", "ATSP0", "ATI", "AT@1", "ATDP", "ATDPN",
  "03", "07", "0A", "0100", "0101", "0120", "0140", "0160", "0180", "01A0", "01C0", "01E0", "0200", "0202", "06", "0900", "0904", "0906", "0908", "090A", "090B",
  "010C", "0105", "010F", "010D", "010E", "0104", "0103", "010B", "0110", "0111", "0106", "0107", "0108", "0109", "0121", "0123", "012F", "0130", "0131", "0133", "0142", "011C", "011F", "0146", "014D", "0151", "0159", "015B", "015C",
  "020C", "0205", "020F", "020D", "020E", "0204", "0203", "020A", "020B", "0223", "0259", "0210", "0211", "0206", "0207", "021F", "0242"
]);
let obdReadoutExitGuardAttached = false;
const obdDevSession = {
  port: null,
  reader: null,
  writer: null,
  decoder: null,
  encoder: null,
  textBuffer: "",
  pendingCommandOperation: null,
  readLoopActive: false,
  readInProgress: false,
  initializing: false,
  coreScanInProgress: false,
  coreScanStopReason: null,
  readoutProfile: null,
  connectionState: "disconnected",
  lastDisconnectReason: null,
  disconnectedAt: null,
  lastRawText: "",
  connectedAt: null,
  scanSessionId: null,
  vehicleProfile: null,
  vehicleApplicability: null,
  observationContext: null,
  supportedPidDiscoveryComplete: false,
  supportedPidSet: [],
  supportedPidReadoutResponses: [],
  readoutAttempts: [],
  livePidTimeline: [],
  freezeFrameReadoutResponses: [],
  freezeFrameCapabilityResponse: null,
  ecuInfoReadoutResponses: [],
  bridgeEndpoint: null,
  bridgeStatus: null,
  bridgeVciList: null,
  adapterIdentity: null,
  adapterInitializationSummary: null,
  lastSession: null,
  previewMode: null,
  requestedInterfaceId: null,
  selectedPidList: [...WEB_SERIAL_DEFAULT_LIVE_PID_COMMANDS],
  freezeFramePidList: [...WEB_SERIAL_DEFAULT_FREEZE_FRAME_PID_COMMANDS]
};

appVersion.textContent = APP_VERSION;
lastUpdated.textContent = APP_LAST_UPDATED;
applyTheme(readOptionalBrowserSetting(THEME_KEY) || "light");
setDefaultCaseDate();
loadData();
renderCases();
renderSimilarCases();
updateCaseQualityPreview();
showInitialNotice();
updateAiButtonLabel();
registerOfflineCache();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  renderDiagnosis(buildDiagnosis(getInput()));
});

resultViewButtons.forEach((button) => {
  button.addEventListener("click", () => setResultView(button.dataset.resultView));
});

obdStageTabs.forEach((button) => {
  button.addEventListener("click", () => setObdStage(button.dataset.obdStage || "setup"));
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
[vehicleEngineCodeSelect, vehicleProductionDateInput, vehicleManualInput].forEach((element) => {
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
[obdVehicleEngineCodeSelect, obdVehicleProductionDateInput, obdVehicleManualInput, obdInterfaceSelect].forEach((element) => {
  element?.addEventListener("change", syncObdVehicleInput);
  element?.addEventListener("input", syncObdVehicleInput);
});
obdVehicleYearManualInput?.addEventListener("input", () => {
  obdVehicleYearManualInput.value = obdVehicleYearManualInput.value.replace(/\D/g, "").slice(0, 4);
  renderObdVehicleEngineOptions();
});
[
  obdVehicleMakerSelect,
  obdVehicleModelSelect,
  obdVehicleModelCodeSelect,
  obdVehicleYearSelect,
  obdVehicleYearManualInput,
  obdVehicleEngineCodeSelect,
  obdVehicleProductionDateInput,
  obdVehicleManualInput
].forEach((element) => {
  const clearSameVehicleConfirmation = () => {
    if (obdSameVehicleConfirmed) obdSameVehicleConfirmed.checked = false;
  };
  element?.addEventListener("change", clearSameVehicleConfirmation);
  element?.addEventListener("input", clearSameVehicleConfirmation);
});
obdLiveObservationCondition?.addEventListener("change", () => {
  if (obdLiveObservationCondition.value !== "post_repair" && obdSameVehicleConfirmed) obdSameVehicleConfirmed.checked = false;
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
obdAnalyzeButton.addEventListener("click", analyzeObdScannerImportManually);
obdScannerText.addEventListener("input", invalidateObdScannerImport);
obdImportPasteButton?.addEventListener("click", pasteObdScannerImport);
obdImportFileInput?.addEventListener("change", importObdScannerFile);
document.querySelector("#obdSessionOpenButton")?.addEventListener("click", () => obdImportFileInput?.click());
obdSampleButton.addEventListener("click", loadObdMonitorSample);
document.querySelector("#obdResultsSampleButton")?.addEventListener("click", loadObdMonitorSample);
obdManufacturerSampleTemplateButton?.addEventListener("click", downloadManufacturerSampleTemplate);
document.querySelectorAll("[data-obd-session-export]").forEach((button) => button.addEventListener("click", downloadObdSessionJson));
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
obdBridgePairingApplyButton.addEventListener("click", applyObdBridgePairingToken);
obdBridgePairingClearButton.addEventListener("click", clearObdBridgePairingToken);
obdDevConnectButton.addEventListener("click", handleObdPrimaryAction);
obdDevIdentifyButton.addEventListener("click", identifyObdDeveloperVci);
obdDevCoreScanButton.addEventListener("click", readObdDeveloperCoreScan);
obdDevQuickConditionButton.addEventListener("click", readObdDeveloperQuickCondition);
obdDevReadDtcButton.addEventListener("click", () => { clearWebSerialReadoutProfile(); void readObdDeveloperDtc(); });
obdDevReadFreezeFrameButton.addEventListener("click", () => { clearWebSerialReadoutProfile(); void readObdDeveloperFreezeFrame(); });
obdDevReadReadinessButton.addEventListener("click", () => { clearWebSerialReadoutProfile(); void readObdDeveloperReadiness(); });
obdDevSnapshotButton.addEventListener("click", () => { clearWebSerialReadoutProfile(); void readObdDeveloperLiveSnapshot(); });
obdDevReadEcuInfoButton.addEventListener("click", () => { clearWebSerialReadoutProfile(); void readObdDeveloperEcuInfo(); });
obdDevReadOnboardMonitorButton.addEventListener("click", () => { clearWebSerialReadoutProfile(); void readObdDeveloperOnboardMonitor(); });
obdDevBridgeStatusButton.addEventListener("click", startGeneralBridgeCheck);
obdDevBridgeVciButton.addEventListener("click", listObdLocalBridgeVci);
obdDevBridgeDtcButton.addEventListener("click", readObdLocalBridgeDtc);
obdDevBridgePendingDtcButton.addEventListener("click", readObdLocalBridgePendingDtc);
obdDevBridgePermanentDtcButton.addEventListener("click", readObdLocalBridgePermanentDtc);
obdDevBridgeEcuInfoButton.addEventListener("click", readObdLocalBridgeEcuInfo);
obdDevBridgeMonitorButton.addEventListener("click", readObdLocalBridgeOnboardMonitor);
obdDevBridgeSupportedPidButton.addEventListener("click", readObdLocalBridgeSupportedPids);
obdDevBridgeFreezeFrameButton.addEventListener("click", readObdLocalBridgeFreezeFrame);
obdDevBridgeReadinessButton.addEventListener("click", readObdLocalBridgeReadiness);
obdDevBridgeLiveButton.addEventListener("click", readObdLocalBridgeLiveSnapshot);
obdDevDisconnectButton.addEventListener("click", disconnectObdDeveloperVci);
if (navigator.serial?.addEventListener) navigator.serial.addEventListener("disconnect", handleObdSerialDisconnect);
obdPreviewElm327Button?.addEventListener("click", () => loadObdInterfacePreviewSample("user-vci-elm327"));
obdPreviewThinkcarButton?.addEventListener("click", () => loadObdInterfacePreviewSample("user-vci-thinkcar-bluetooth"));
obdPreviewJ2534Button?.addEventListener("click", () => loadObdInterfacePreviewSample("user-vci-techstream-j2534"));
obdScrollTargetButtons.forEach((button) => button.addEventListener("click", () => scrollToObdSection(button.dataset.obdScrollTarget)));
noticeCloseButton.addEventListener("click", () => {
  writeOptionalBrowserSetting(NOTICE_KEY, "accepted");
  noticeModal.close();
});
retryCaseStorageButton.addEventListener("click", reloadSavedCases);

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
  writeOptionalBrowserSetting(THEME_KEY, nextTheme);
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
      pidReferenceThresholdCatalog2026,
      manufacturerPidReferenceCandidates2026,
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
      fetchJson("data/pid-reference-thresholds-2026.json"),
      fetchJson("data/manufacturer-pid-reference-candidates-2026.json"),
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
    if (!window.ObdReadOnly?.configurePidReferenceThresholds(pidReferenceThresholdCatalog2026)) {
      throw new Error("PID基準値カタログを読み込めません");
    }
    if (!window.ObdReadOnly?.configureManufacturerPidReferenceCandidates(manufacturerPidReferenceCandidates2026)) {
      throw new Error("メーカーPID基準候補を読み込めません");
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
      pidReferenceThresholdCatalog2026,
      manufacturerPidReferenceCandidates2026,
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
  if (!("serviceWorker" in navigator) || !window.isSecureContext) {
    setOfflineCacheStatus("端末内オフライン診断データは、HTTPS対応ブラウザで有効になります。", true);
    return;
  }

  try {
    const registration = await getOfflineRegistration();
    let observedWorker = null;
    let installFailed = false;
    const refresh = () => {
      if (!installFailed && registration.active?.state === "activated"
        && (!observedWorker || observedWorker === registration.active)) {
        const worker = registration.active;
        void refreshOfflineCacheStatus(worker, () => registration.active === worker && !installFailed);
      }
    };
    const observe = () => {
      const worker = registration.installing || registration.waiting
        || (registration.active?.state === "activating" ? registration.active : null);
      if (!worker || worker === observedWorker) return;
      observedWorker = worker;
      installFailed = false;
      setOfflineCacheStatus("端末内オフライン診断データを準備中です。");
      const onStateChange = () => {
        if (observedWorker !== worker) return;
        if (worker.state === "redundant") {
          installFailed = true;
          setOfflineCacheStatus("今回のオフライン更新は採用されませんでした。失敗理由は未確認です。この版のオフライン利用は未確認です。", true);
        } else if (worker.state === "activated") {
          void refreshOfflineCacheStatus(worker, () => registration.active === worker && !installFailed);
        }
      };
      worker.addEventListener("statechange", onStateChange);
      onStateChange();
    };
    registration.addEventListener("updatefound", observe);
    setOfflineCacheStatus("端末内オフライン診断データの準備状態を確認中です。");
    observe();
    refresh();
    navigator.serviceWorker.ready.then(refresh).catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", () => { observe(); refresh(); });
    try {
      await registration.update();
      observe();
      refresh();
      if (!observedWorker && !registration.active) {
        setOfflineCacheStatus("この版の端末内オフライン診断データは未準備です。", true);
      }
    } catch (_) {
      if (registration.active?.state === "activated") refresh();
      else if (!observedWorker && !installFailed) setOfflineCacheStatus("端末内オフライン診断データの更新を確認できませんでした。", true);
    }
  } catch (_) {
    setOfflineCacheStatus("端末内オフライン診断データの準備を開始できませんでした。", true);
  }
}

async function getOfflineRegistration() {
  let existing;
  try { existing = await navigator.serviceWorker.getRegistration?.(); } catch (_) { /* Fall back to registration. */ }
  const worker = existing?.active;
  if (worker?.state === "activated") {
    const identity = await getOfflineWorkerIdentity(worker);
    if (existing.active === worker && worker.state === "activated" && identity?.version === APP_VERSION
      && identity?.cacheName === `vehicle-diagnosis-tool-${APP_VERSION}`) return existing;
  }
  const registration = await navigator.serviceWorker.register(`service-worker.js?version=${encodeURIComponent(APP_VERSION)}`);
  return registration;
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

function setOfflineCacheStatus(message, isError = false) {
  offlineCacheStatusRevision += 1;
  if (!offlineCacheStatus) return;
  offlineCacheStatus.textContent = message;
  offlineCacheStatus.classList.toggle("error", isError);
}

async function refreshOfflineCacheStatus(worker, isStillCurrent = () => true) {
  if (!offlineCacheStatus || worker?.state !== "activated" || !isStillCurrent()) return;
  if (!("caches" in window)) {
    setOfflineCacheStatus("このブラウザでは端末内のオフライン保存機能を確認できません。", true);
    return;
  }
  const revision = ++offlineCacheStatusRevision;
  const isCurrent = () => revision === offlineCacheStatusRevision && worker.state === "activated" && isStillCurrent();
  let failureMessage = "端末内の保存データを読み出せませんでした。この版のオフライン利用は未確認です。";
  try {
    const cacheName = `vehicle-diagnosis-tool-${APP_VERSION}`;
    const identity = await getOfflineWorkerIdentity(worker);
    if (!isCurrent()) return;
    if (identity?.version !== APP_VERSION || identity?.cacheName !== cacheName) {
      failureMessage = "画面とオフライン基盤の版を照合できません。この版のオフライン利用は未確認です。";
      throw new Error("offline_worker_unverified");
    }
    if (!(await caches.has(cacheName))) {
      failureMessage = "この版の端末内オフライン診断データは保存されていません。";
      throw new Error("offline_cache_missing");
    }
    if (!isCurrent()) return;
    const cache = await caches.open(cacheName);
    if (!isCurrent()) return;
    const response = await cache.match(OFFLINE_ASSET_MANIFEST);
    if (!isCurrent()) return;
    if (!response) {
      failureMessage = "オフライン資材一覧が保存されていません。準備完了は未確認です。";
      throw new Error("offline_manifest_missing");
    }
    let payload;
    try { payload = await response.json(); } catch (_) {
      failureMessage = "保存されたオフライン資材一覧を読み取れません。準備完了は未確認です。";
      throw new Error("offline_manifest_unreadable");
    }
    const urls = payload?.assets;
    if (payload?.version !== APP_VERSION || !Array.isArray(urls) || !urls.length || urls.length !== payload.asset_count) {
      failureMessage = "保存されたオフライン資材一覧の版または件数が一致しません。準備完了は未確認です。";
      throw new Error("offline_manifest_invalid");
    }
    let next = 0;
    let cachedCount = 0;
    let failed = false;
    await Promise.all(Array.from({ length: Math.min(4, urls.length) }, async () => {
      while (!failed && isCurrent() && next < urls.length) {
        const url = urls[next++];
        try {
          if (await cache.match(new Request(url))) cachedCount += 1;
        } catch (_) { failed = true; }
      }
    }));
    if (!isCurrent()) return;
    if (failed) throw new Error("offline_cache_read_failed");
    setOfflineCacheStatus(
      cachedCount === urls.length
        ? `端末内オフライン診断データ: ${cachedCount}/${urls.length} 件を準備済みです。`
        : `端末内オフライン診断データ: ${cachedCount}/${urls.length} 件。必要なデータが不足しています。`,
      cachedCount !== urls.length
    );
  } catch (_) {
    if (revision === offlineCacheStatusRevision && worker.state === "activated" && isStillCurrent()) setOfflineCacheStatus(failureMessage, true);
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

  syncObdReadoutSurface();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function syncObdReadoutSurface() {
  const surface = document.getElementById("obdReadoutSurface");
  const panel = document.getElementById("obd-panel");
  const showInObd = obdAccessUnlocked === true && panel?.classList.contains("is-active") && !panel.hidden;
  const host = document.getElementById(showInObd ? "obdReadoutResultsHost" : "obdReadoutHome");
  // Move the existing nodes so live updates and button listeners retain their identity.
  if (surface && host && surface.parentElement !== host) host.appendChild(surface);
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

function formatJapaneseEraYear(yearValue) {
  const year = Number.parseInt(yearValue, 10);
  if (!Number.isFinite(year)) return yearValue;
  const eras = [
    { name: "令和", startYear: 2019 },
    { name: "平成", startYear: 1989 },
    { name: "昭和", startYear: 1926 },
    { name: "大正", startYear: 1912 },
    { name: "明治", startYear: 1868 }
  ];
  const era = eras.find((entry) => year >= entry.startYear);
  if (!era) return String(year);
  const eraYear = year - era.startYear + 1;
  const eraYearLabel = eraYear === 1 ? "元" : String(eraYear);
  return `${year}（${era.name}${eraYearLabel}年）`;
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
  const shouldFormatYearLabel = (select === vehicleYearSelect || select === obdVehicleYearSelect) && label === value;
  option.textContent = shouldFormatYearLabel ? formatJapaneseEraYear(label) : label;
  select.appendChild(option);
}

function syncVehicleInput() {
  const values = [
    selectedVehicleValue(vehicleMakerSelect),
    selectedVehicleValue(vehicleModelSelect),
    selectedVehicleValue(vehicleModelCodeSelect),
    selectedVehicleYear(),
    vehicleProductionDateInput.value ? `生産 ${vehicleProductionDateInput.value}` : "",
    selectedVehicleValue(vehicleEngineCodeSelect),
    vehicleManualInput.value.trim()
  ];
  vehicleInput.value = collectUnique(values).join(" ");
  vehicleSelectionSummary.textContent = vehicleInput.value ? `車種情報: ${vehicleInput.value}` : "車種情報: 未選択";
}

function selectedVehicleYear() {
  const year = selectedVehicleValue(vehicleYearSelect) || vehicleYearManualInput.value.trim();
  return year ? `${formatJapaneseEraYear(year)}年式` : "";
}

function buildSelectedDiagnosticVehicleProfile() {
  const maker = selectedVehicleValue(vehicleMakerSelect);
  const model = selectedVehicleValue(vehicleModelSelect);
  const modelCode = selectedVehicleValue(vehicleModelCodeSelect);
  const year = selectedVehicleValue(vehicleYearSelect) || vehicleYearManualInput.value.trim();
  const engineCode = selectedVehicleValue(vehicleEngineCodeSelect);
  const productionDate = vehicleProductionDateInput.value || null;
  if (!maker && !model && !modelCode && !year && !engineCode && !productionDate) return null;
  return { maker: maker || null, model: model || null, modelCode: modelCode || null, model_code: modelCode || null, year: year || null, engineCode: engineCode || null, engine_code: engineCode || null, productionDate };
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
  return year ? `${formatJapaneseEraYear(year)}年式` : "";
}

function buildSelectedObdVehicleProfile() {
  const maker = selectedVehicleValue(obdVehicleMakerSelect);
  const model = selectedVehicleValue(obdVehicleModelSelect);
  const modelCode = selectedVehicleValue(obdVehicleModelCodeSelect);
  const year = selectedVehicleValue(obdVehicleYearSelect) || obdVehicleYearManualInput.value.trim();
  const productionDate = obdVehicleProductionDateInput.value || null;
  const engineCode = selectedVehicleValue(obdVehicleEngineCodeSelect);
  const freeText = obdVehicleManualInput.value.trim();
  if (!maker && !model && !modelCode && !year && !productionDate && !engineCode && !freeText) return null;
  return {
    maker: maker || null,
    model: model || null,
    modelCode: modelCode || null,
    year: year || null,
    productionDate,
    engineCode: engineCode || null,
    label: obdVehicleInput.value.trim() || freeText || null,
    notes: freeText || null
  };
}

function buildVehicleApplicabilityRangeDescriptors(ranges = []) {
  const normalizeCodes = (values) => collectUnique((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean))
    .slice(0, 12);
  const normalizeYear = (value) => {
    const year = Number(value);
    return Number.isFinite(year) && year >= 1900 && year <= 2100 ? Math.round(year) : null;
  };
  return (Array.isArray(ranges) ? ranges : [])
    .slice(0, 20)
    .map((range) => ({
      modelCodes: normalizeCodes(range?.model_codes || range?.modelCodes),
      engineCodes: normalizeCodes(range?.engine_codes || range?.engineCodes),
      yearFrom: normalizeYear(range?.year_from ?? range?.yearFrom),
      yearTo: normalizeYear(range?.year_to ?? range?.yearTo),
      verifiedThroughYear: normalizeYear(range?.verified_through_year ?? range?.verifiedThroughYear),
      sourceName: String(range?.source || range?.sourceName || "").trim().slice(0, 160) || null,
      sourceUrl: String(range?.source_url || range?.sourceUrl || "").trim() || null,
      sourceDate: String(range?.source_date || range?.sourceDate || "").trim().slice(0, 20) || null,
      detailConfirmationRequired: range?.detail_confirmation_required === true || range?.detailConfirmationRequired === true
    }))
    .filter((range) => range.modelCodes.length || range.engineCodes.length || range.yearFrom || range.yearTo || range.verifiedThroughYear || range.sourceName);
}

function buildSelectedObdVehicleApplicability(profile = null) {
  const selectedProfile = profile || buildSelectedObdVehicleProfile();
  if (!selectedProfile) return null;
  const maker = selectedProfile.maker || null;
  const model = selectedProfile.model || null;
  const modelCode = selectedProfile.modelCode || null;
  const year = selectedProfile.year || null;
  const engineCode = selectedProfile.engineCode || null;
  const hasCatalogSelection = Boolean(maker && model);
  const vehicleOption = hasCatalogSelection ? findVehicleOption(maker, model) : null;
  const candidateRanges = hasCatalogSelection ? findVehicleYearRanges(maker, model, modelCode || "") : [];
  const applicableRanges = hasCatalogSelection ? findApplicableVehicleYearRanges(maker, model, modelCode || "", year || "") : [];
  const supportedEngineCodes = collectUnique(applicableRanges.flatMap((item) => item.engine_codes || []));
  const candidateRangeDescriptors = buildVehicleApplicabilityRangeDescriptors(candidateRanges);
  const applicableRangeDescriptors = buildVehicleApplicabilityRangeDescriptors(applicableRanges);
  const catalogMatched = Boolean(vehicleOption);
  const modelCodeMatched = !modelCode || candidateRanges.some((item) => (item.model_codes || []).includes(modelCode));
  const yearMatched = !year || applicableRanges.length > 0;
  const engineMatched = !engineCode || supportedEngineCodes.includes(engineCode);
  let status = "manual";
  if (hasCatalogSelection) {
    if (!catalogMatched) {
      status = "unlisted";
    } else if (modelCodeMatched && yearMatched && engineMatched) {
      status = "matched";
    } else {
      status = "partial";
    }
  }
  const summaryParts = [
    selectedProfile.label || formatVehicleProfileLabel(selectedProfile, ""),
    status === "matched" ? "適合候補あり" : status === "partial" ? "候補要確認" : status === "unlisted" ? "未登録" : "手入力"
  ].filter(Boolean);
  return {
    schemaVersion: "vehicle_applicability_v2",
    maker,
    model,
    modelCode,
    year,
    engineCode,
    catalogMatched,
    yearMatched,
    engineMatched,
    modelCodeMatched,
    candidateRangeCount: candidateRanges.length,
    applicableRangeCount: applicableRanges.length,
    candidateRanges: candidateRangeDescriptors,
    applicableRanges: applicableRangeDescriptors,
    supportedEngineCodes,
    supportedEngineCodeCount: supportedEngineCodes.length,
    status,
    summaryLabel: summaryParts.join(" / ")
  };
}

function formatVehicleApplicabilitySummary(applicability, fallback = "") {
  if (!applicability || typeof applicability !== "object") return fallback || "";
  const statusLabel = {
    matched: "適合候補あり",
    partial: "候補要確認",
    unlisted: "未登録",
    manual: "手入力",
    unknown: "未判定"
  }[applicability.status] || applicability.status || "";
  const detailParts = [];
  if (Number.isFinite(applicability.applicableRangeCount) && applicability.applicableRangeCount > 0) detailParts.push(`適合 ${applicability.applicableRangeCount}件`);
  if (Number.isFinite(applicability.candidateRangeCount) && applicability.candidateRangeCount > 0) detailParts.push(`候補 ${applicability.candidateRangeCount}件`);
  if (applicability.engineCode && applicability.engineMatched === false) detailParts.push(`EG ${applicability.engineCode} 要確認`);
  if (applicability.year && applicability.yearMatched === false) detailParts.push(`年式 ${applicability.year} 要確認`);
  if (applicability.modelCode && applicability.modelCodeMatched === false) detailParts.push(`型式 ${applicability.modelCode} 要確認`);
  return [statusLabel, ...detailParts].filter(Boolean).join(" / ") || applicability.summaryLabel || fallback || "";
}

function formatVehicleApplicabilityEvidenceSummary(summary, fallback = "") {
  if (!summary || typeof summary !== "object") return fallback || "";
  const evidencePresent = summary.evidencePresent === true || summary.evidence_present === true;
  const sourceVerified = summary.sourceVerified === true || summary.source_verified === true || summary.verified === true;
  const reviewRequired = summary.reviewRequired === true || summary.review_required === true;
  const state = reviewRequired ? "review" : sourceVerified ? "verified" : evidencePresent ? "evidence present" : "not recorded";
  const sourceName = summary.sourceName || summary.source_name || "";
  const evidenceId = summary.evidenceId || summary.evidence_id || "";
  const confidenceValue = summary.confidence ?? summary.confidence_score ?? "";
  const confidence = confidenceValue !== "" && confidenceValue !== null ? `confidence ${confidenceValue}` : "";
  return [state, sourceName, evidenceId, confidence].filter(Boolean).join(" / ") || fallback || "";
}

function formatVehicleApplicabilityFieldMatchSummary(summary, fallback = "") {
  if (!summary || typeof summary !== "object") return fallback || "";
  const matchedCount = Number(summary.matchedCount ?? summary.matched_count ?? 0);
  const mismatchCount = Number(summary.mismatchCount ?? summary.mismatch_count ?? 0);
  const pendingCount = Number(summary.pendingCount ?? summary.pending_count ?? 0);
  return `候補照合: 一致 ${matchedCount} / 不一致 ${mismatchCount} / 未評価 ${pendingCount}`;
}

function formatVehicleProfileLabel(profile, fallback = "") {
  if (profile?.maker || profile?.model) {
    return `${profile?.maker || ""} ${profile?.model || ""}`.trim();
  }
  return profile?.label || fallback || "";
}

function formatObdReportedProfile(profile, fallback = "") {
  if (!profile || typeof profile !== "object") return fallback || "";
  const obdStandard = profile.obdStandard || profile.obd_standard || "";
  const fuelType = profile.fuelType || profile.fuel_type || "";
  const reportedPidIds = Array.isArray(profile.reportedPidIds)
    ? profile.reportedPidIds
    : Array.isArray(profile.reported_pid_ids)
      ? profile.reported_pid_ids
      : [];
  const evidence = reportedPidIds.length ? `PID ${reportedPidIds.join(", ")}` : "";
  return [obdStandard && `OBD ${obdStandard}`, fuelType && `Fuel ${fuelType}`, evidence].filter(Boolean).join(" / ") || fallback || "";
}

function getTopNextReadoutCandidates(candidates, limit = 4) {
  if (!Array.isArray(candidates) || limit <= 0) return [];
  return candidates.filter(isSafeNextReadoutCandidate).slice(0, limit);
}

function isSafeNextReadoutCandidate(candidate = null) {
  if (!candidate || typeof candidate !== "object") return false;
  const readOnly = candidate.readOnly !== false && candidate.read_only !== false;
  const wouldTransmit = candidate.wouldTransmit === true || candidate.would_transmit === true;
  const vehicleCommandEnabled = candidate.vehicleCommandEnabled === true || candidate.vehicle_command_enabled === true;
  const executionEnabled = candidate.executionEnabled === true || candidate.execution_enabled === true;
  return readOnly && !wouldTransmit && !vehicleCommandEnabled && !executionEnabled;
}

function buildSavedNextReadoutCandidate(session = null) {
  if (!session || typeof session !== "object") return null;
  const flow = session.diagnosticFlowSummary || session.diagnostic_flow_summary || {};
  const core = session.coreSessionStatus || session.core_session_status || {};
  const nextReadoutSummary = core.nextReadoutSummary || core.next_readout_summary || {};
  const request = flow.nextReadoutRequest
    || flow.next_readout_request
    || core.nextReadoutRequest
    || core.next_readout_request
    || nextReadoutSummary.readoutRequest
    || nextReadoutSummary.readout_request
    || session.nextReadoutRequest
    || session.next_readout_request
    || null;
  const plan = flow.pendingReadoutRequestPlan
    || flow.pending_readout_request_plan
    || flow.readoutRequestPlanSummary
    || flow.readout_request_plan_summary
    || core.pendingReadoutRequestPlan
    || core.pending_readout_request_plan
    || core.readoutRequestPlanSummary
    || core.readout_request_plan_summary
    || session.readoutRequestPlanSummary
    || session.readout_request_plan_summary
    || null;
  const readoutId = request?.readoutId || request?.readout_id || plan?.nextRequestId || plan?.next_request_id || null;
  if (!readoutId) return null;
  const readOnly = request?.readOnly !== false && request?.read_only !== false && plan?.readOnly !== false && plan?.read_only !== false && plan?.nextReadOnly !== false && plan?.next_read_only !== false;
  const wouldTransmit = request?.wouldTransmit === true || request?.would_transmit === true || plan?.wouldTransmit === true || plan?.would_transmit === true || plan?.nextWouldTransmit === true || plan?.next_would_transmit === true;
  const vehicleCommandEnabled = request?.vehicleCommandEnabled === true || request?.vehicle_command_enabled === true || plan?.vehicleCommandEnabled === true || plan?.vehicle_command_enabled === true || plan?.nextVehicleCommandEnabled === true || plan?.next_vehicle_command_enabled === true;
  if (!readOnly || wouldTransmit || vehicleCommandEnabled) return null;
  return {
    id: readoutId,
    label: request?.label || request?.displayLabel || request?.display_label || plan?.nextRequestLabel || plan?.next_request_label || formatCoreReadoutLabel(readoutId, readoutId),
    status: request?.status || request?.readoutStatus || request?.readout_status || "missing",
    applicabilityStatus: flow.applicabilityStatus || flow.applicability_status || core.applicabilityStatus || core.applicability_status || session.vehicleApplicability?.status || session.vehicle_applicability?.status || null,
    bridgeIntent: request?.bridgeIntent || request?.bridge_intent || plan?.nextBridgeIntent || plan?.next_bridge_intent || null,
    serviceMode: request?.serviceMode || request?.service_mode || plan?.nextServiceMode || plan?.next_service_mode || null,
    executionEnabled: request?.executionEnabled === true || request?.execution_enabled === true || plan?.nextExecutionEnabled === true || plan?.next_execution_enabled === true,
    readOnly: true,
    read_only: true,
    wouldTransmit: false,
    would_transmit: false,
    vehicleCommandEnabled: false,
    vehicle_command_enabled: false,
    savedFromRequest: true,
    saved_from_request: true
  };
}

function getSessionNextReadoutCandidates(session = null, limit = 4) {
  const candidates = getTopNextReadoutCandidates(session?.nextReadoutCandidates || session?.next_readout_candidates, limit);
  if (candidates.length || limit <= 0) return candidates;
  const savedCandidate = buildSavedNextReadoutCandidate(session);
  return savedCandidate ? [savedCandidate].slice(0, limit) : [];
}

function getTopNextReadoutLabels(candidates, limit = 2) {
  return getTopNextReadoutCandidates(candidates, limit).map((item) => item?.label).filter(Boolean);
}

function formatTopNextReadoutLabel(candidates, limit = 2, fallback = "") {
  const labels = getTopNextReadoutLabels(candidates, limit);
  return labels.length ? labels.join(" / ") : fallback;
}

function formatNextReadoutSummary(candidates, options = {}) {
  const { limit = 2, fallback = NO_DATA } = options;
  const topLabel = formatTopNextReadoutLabel(candidates, limit, "");
  const count = Array.isArray(candidates) ? candidates.filter(Boolean).length : 0;
  if (!count) return fallback;
  if (count === 1) return topLabel || "1件";
  return topLabel ? `${count}件 / ${topLabel}` : `${count}件`;
}

function syncObdVehicleInput() {
  cancelObdBridgeOperation();
  invalidateObdScannerImport();
  const values = [
    selectedVehicleValue(obdVehicleMakerSelect),
    selectedVehicleValue(obdVehicleModelSelect),
    selectedVehicleValue(obdVehicleModelCodeSelect),
    selectedObdVehicleYear(),
    obdVehicleProductionDateInput.value ? `生産 ${obdVehicleProductionDateInput.value}` : "",
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
  obdVehicleProductionDateInput.value = "";
  syncObdVehicleInput();
}

function getSelectedObdInterfaceLabel() {
  const requestedInterfaceId = obdInterfaceSelect.value || "";
  const resolvedInterfaceId = resolveObdInterfaceId();
  const label = {
    "user-vci-elm327": "ELM327 / Web Serial・iPhone接続準備",
    "user-vci-thinkcar-bluetooth": "THINKCAR Bluetooth",
    "user-vci-techstream-j2534": "有線OBD2（J2534適合確認）",
    "user-vci-rcmall-mks-canable-v2-pro": "CANable候補"
  }[resolvedInterfaceId] || "未選択";
  return requestedInterfaceId === "auto" ? `${label}（自動判定）` : label;
}

function resolveObdInterfaceId(capability = window.ObdReadOnly?.getCapability?.()) {
  const requestedInterfaceId = obdInterfaceSelect.value || "";
  if (requestedInterfaceId && requestedInterfaceId !== "auto") return requestedInterfaceId;
  const serialReady = capability?.secureContext === true && capability?.webSerialSupported === true;
  if (isMobileDevice()) return "user-vci-elm327";
  if (serialReady) return "user-vci-elm327";
  return "user-vci-techstream-j2534";
}

function isObdInterfaceAutoRequested() {
  return (obdInterfaceSelect.value || "") === "auto";
}

function getObdInterfaceSelectionNote(capability = window.ObdReadOnly?.getCapability?.()) {
  if (!isObdInterfaceAutoRequested()) return "手動選択";
  const serialReady = capability?.secureContext === true && capability?.webSerialSupported === true;
  if (isMobileDevice()) return "自動判定: スマホ用 ELM327 を優先（iPhone BLEホストと未署名実機ビルドは検証済み、Apple署名・実機確認待ち）";
  if (serialReady) return "自動判定: Web Serial 対応のため ELM327 を優先";
  return "自動判定: Web Serial 非対応のため有線OBD2/J2534適合確認を優先";
}

function getObdInterfaceReadoutRoute(interfaceId) {
  const userAgent = navigator.userAgent || "";
  const appleMobile = /iPhone|iPad|iPod/i.test(userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const platform = interfaceId === "user-vci-techstream-j2534"
    ? "desktop"
    : appleMobile
      ? "ios"
      : "desktop";
  return window.ObdReadOnly?.evaluateInterfaceReadoutRoute?.({ interfaceId, platform }) || null;
}

function buildSelectedObdReadoutInterface() {
  const interfaceId = resolveObdInterfaceId();
  const catalog = window.ObdReadOnly?.getVehicleInterfaceCatalog?.() || [];
  const catalogItem = catalog.find((item) => item?.id === interfaceId) || null;
  const route = getObdInterfaceReadoutRoute(interfaceId);
  return {
    interfaceId,
    label: catalogItem?.label || getSelectedObdInterfaceLabel(),
    deviceModel: catalogItem?.deviceModel || null,
    route: route?.route || "unconfirmed",
    platform: route?.platform || null,
    observedUse: catalogItem?.observedUse || null,
    hardwareCompatibilityConfirmed: catalogItem?.hardwareCompatibilityConfirmed === true,
    readOnly: true,
    vehicleCommandEnabled: false,
    wouldTransmit: false
  };
}

function buildSelectedObdObservationContext() {
  return window.ObdReadOnly?.normalizeObservationContext?.({
    condition: obdLiveObservationCondition?.value || null,
    thermalState: obdLiveThermalState?.value || null,
    vehicleMotionState: obdVehicleMotionState?.value || null,
    transmissionPosition: obdTransmissionPosition?.value || null,
    accessoryLoadState: obdAccessoryLoadState?.value || null,
    sameVehicleConfirmed: obdSameVehicleConfirmed?.checked === true
  }) || null;
}

function mergeObdObservationContexts(...contexts) {
  const normalizedContexts = contexts.map((context) => window.ObdReadOnly?.normalizeObservationContext?.(context)).filter(Boolean);
  const conditions = normalizedContexts.flatMap((normalized) => {
    return Array.isArray(normalized?.conditions) ? normalized.conditions : [];
  });
  const sameVehicleConfirmed = normalizedContexts.some((normalized) => normalized.sameVehicleConfirmed === true || normalized.same_vehicle_confirmed === true);
  const thermalStates = [...new Set(normalizedContexts.map((normalized) => normalized.thermalState || normalized.thermal_state).filter((value) => value && value !== "unspecified"))];
  const thermalStateConflict = thermalStates.length > 1 || normalizedContexts.some((normalized) => normalized.thermalStateConflict === true || normalized.thermal_state_conflict === true);
  const mergeState = (camelKey, snakeKey, camelConflictKey, snakeConflictKey) => {
    const values = [...new Set(normalizedContexts.map((normalized) => normalized[camelKey] || normalized[snakeKey]).filter((value) => value && value !== "unspecified"))];
    return { value: values.length === 1 ? values[0] : null, conflict: values.length > 1 || normalizedContexts.some((normalized) => normalized[camelConflictKey] === true || normalized[snakeConflictKey] === true) };
  };
  const motion = mergeState("vehicleMotionState", "vehicle_motion_state", "vehicleMotionStateConflict", "vehicle_motion_state_conflict");
  const transmission = mergeState("transmissionPosition", "transmission_position", "transmissionPositionConflict", "transmission_position_conflict");
  const accessoryLoad = mergeState("accessoryLoadState", "accessory_load_state", "accessoryLoadStateConflict", "accessory_load_state_conflict");
  return window.ObdReadOnly?.normalizeObservationContext?.({ conditions, thermalState: thermalStates.length === 1 ? thermalStates[0] : null, thermalStateConflict, vehicleMotionState: motion.value, vehicleMotionStateConflict: motion.conflict, transmissionPosition: transmission.value, transmissionPositionConflict: transmission.conflict, accessoryLoadState: accessoryLoad.value, accessoryLoadStateConflict: accessoryLoad.conflict, sameVehicleConfirmed }) || null;
}

function getObdInterfaceStrategyNote(interfaceId) {
  if (interfaceId === "user-vci-elm327") {
    if (getObdInterfaceReadoutRoute(interfaceId)?.platform === "ios") return "iPhoneでは自前のread-only接続コネクタを主経路として準備し、外部ログ取込は補助経路として扱います。";
    return "最小構成の実車読取入口で、複数VCI対応の基準動作として使います。";
  }
  if (interfaceId === "user-vci-techstream-j2534") return "有線OBD2機器のJ2534適合が確認できた場合に、PC系VCIの主経路として扱います。";
  return {
    "user-vci-elm327": "最小構成の実車読取入口。複数VCI対応の基準動作として使います。",
    "user-vci-thinkcar-bluetooth": "iPhoneでは自前のread-only接続コネクタ、PCではローカルブリッジを主経路として育てます。",
    "user-vci-techstream-j2534": "有線OBD2候補。J2534 DLL適合を確認できた場合だけPC系VCIの主経路として育てます。",
    "user-vci-rcmall-mks-canable-v2-pro": "CAN系候補。J2534後に読取専用取込の幅を広げる用途です。"
  }[interfaceId] || "複数VCIを選べる前提で、読取専用の安全範囲から順に増やします。";
}

function getObdDevelopmentOperationNote(interfaceId) {
  if (interfaceId === "user-vci-elm327") {
    return getObdInterfaceReadoutRoute(interfaceId)?.platform === "ios"
      ? "運用: 自前iPhoneコネクタでVCI接続 -> read-only読取 -> OBD側でセッション化して保存と確認"
      : "運用: 読取前プレビュー確認 -> Web Serial読取開始 -> DTC/ライブデータ読取 -> OBD側で保存と確認";
  }
  if (interfaceId === "user-vci-techstream-j2534") return "運用: 型番/J2534 DLL確認 -> 読取前プレビュー確認 -> ローカルブリッジ確認 -> 読取専用 DTC/ECU情報から実測";
  if (interfaceId === "user-vci-thinkcar-bluetooth") return getObdInterfaceReadoutRoute(interfaceId)?.platform === "ios"
    ? "運用: THINKCAR通信仕様を確認 -> iPhone用専用コネクタを実装 -> read-only読取を実機確認"
    : "運用: PC側でVCI確認 -> ローカルブリッジでread-only読取 -> OBD側で保存と確認";
  return "運用: 読取前プレビュー確認 -> 読取準備 -> 読取専用で取れる項目だけ確認 -> OBD側で保存と確認";
}

function getObdAvailableReadoutNote(interfaceId) {
  if (interfaceId === "user-vci-elm327" && getObdInterfaceReadoutRoute(interfaceId)?.platform === "ios") {
    return "現在使える読取: 外部ログの補助取込。iPhone BLEホストと未署名実機ビルドは検証済みですが、Apple署名・iPhoneインストール・直接アダプター実機確認は未完了です。";
  }
  return {
    "user-vci-elm327": "現在使える読取: DTC / ライブデータ / フリーズフレーム / 対応PIDの読取前確認、PCではWeb Serial読取へ移行。",
    "user-vci-thinkcar-bluetooth": "現在使える読取: DTC / ライブデータ / ECU情報の読取前確認。iPhone直接接続は自前コネクタを準備中。",
    "user-vci-techstream-j2534": "現在使える読取: DTC / ECU情報 / Mode06 / 対応PIDの読取前確認。実機読取はJ2534 DLL適合確認後にPCで行う。",
    "user-vci-rcmall-mks-canable-v2-pro": "現在使える読取: CAN系 読取専用応答、対応PID、診断取込の読取前確認。"
  }[interfaceId] || "現在使える読取項目を表示します。";
}

function getObdPrimaryActionLabel(interfaceId, state = {}) {
  if (state.connected) return "読取中";
  const nativeConnectorRoute = state.nativeConnectorRoute === true || getObdInterfaceReadoutRoute(interfaceId)?.route === "native_connector_required";
  if (nativeConnectorRoute) return state.unlocked ? "iPhone接続準備を確認" : "iPhone接続確認を有効化";
  if (!state.unlocked) {
    if (interfaceId === "user-vci-elm327") return "ELM327読取を有効化";
    if (interfaceId === "user-vci-techstream-j2534") return "有線OBD2適合確認を有効化";
    if (interfaceId === "user-vci-thinkcar-bluetooth") return "Bluetooth確認を有効化";
    if (interfaceId === "user-vci-rcmall-mks-canable-v2-pro") return "CAN確認を有効化";
    return "詳細読取を有効化";
  }
  if (interfaceId === "user-vci-elm327") {
    return state.serialReady ? "ELM327読取を開始" : "PCでELM327読取";
  }
  if (interfaceId === "user-vci-techstream-j2534") return "有線OBD2適合確認を開始";
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
    if (getObdInterfaceReadoutRoute(interfaceId)?.platform === "ios") {
      return `${autoPrefix}ELM327 を使います。iPhone BLEホストと未署名実機ビルドは検証済みですが、Apple署名・iPhoneインストール・実アダプター確認は未完了です。外部ログ取込は補助経路として利用できます。`;
    }
    return capability?.webSerialSupported
      ? `${autoPrefix}ELM327 を使います。デスクトップ版Chrome系ブラウザから読取を開始できます。`
      : `${autoPrefix}ELM327 を使います。読取はデスクトップ版Chrome系ブラウザから開始します。`;
  }
  if (interfaceId === "user-vci-techstream-j2534") {
    return `${autoPrefix}有線OBD2機器を使います。J2534 DLL適合とPC側ローカルブリッジ確認から進めます。`;
  }
  if (interfaceId === "user-vci-thinkcar-bluetooth") {
    return `${autoPrefix}THINKCAR Bluetooth 候補を選択しました。iPhoneからの直接接続は未実装のため、現時点では車両・VCIへの通信を開始しません。`;
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
      preview: "有線OBD2で読取前プレビュー",
      prepare: "J2534適合確認を準備"
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
  const interfaceRoute = getObdInterfaceReadoutRoute(interfaceId);
  const isIosElm = interfaceId === "user-vci-elm327" && interfaceRoute?.platform === "ios";
  const lines = isIosElm ? [
    "端末: iPhone BLEホストと未署名実機ビルドは検証済み。Apple署名・インストール・実機確認待ち",
    "読取手順: 自前iPhoneコネクタ実装後にELM327へ接続 -> read-only DTC/PID/FF/ECU読取",
    "安全: 車両送信は無効。BLE実機読取は適合確認待ち"
  ] : {
    "user-vci-elm327": [
      "端末: 読取はデスクトップ版Chrome系ブラウザが必要",
      "読取手順: Web SerialでELM327/STNを選択。WindowsでCOMポート化されたBluetooth Classic SPPも候補",
      "安全: DTC / ライブデータ / FFの読取専用のみ"
    ],
    "user-vci-thinkcar-bluetooth": [
      interfaceRoute?.platform === "ios" ? "端末: iPhone用THINKCARコネクタは未実装。BLE/SDK通信仕様の確認待ち" : "端末: PC側ローカルブリッジを使用",
      interfaceRoute?.platform === "ios" ? "読取手順: 通信仕様確認 -> 専用コネクタ実装 -> read-only診断セッションを実機確認" : "読取手順: VCI列挙 -> ローカルブリッジでread-only確認",
      "安全: 接続・送信は通信仕様と実機適合の確認まで無効"
    ],
    "user-vci-techstream-j2534": [
      "端末: Windows側ドライバ前提",
      "読取手順: 型番/J2534 DLL適合を確認後にローカルブリッジで確認",
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
  if (interfaceRoute?.route && interfaceRoute.route !== "unconfirmed") {
    const routeItem = document.createElement("span");
    const routeLabel = document.createElement("strong");
    routeLabel.textContent = "実装経路";
    const routeValue = interfaceRoute.route === "native_connector_required"
      ? interfaceId === "user-vci-elm327"
        ? "iPhone BLEホストと未署名実機ビルドは検証済み。Apple署名・インストール・実機確認待ち"
        : "iPhone direct transport is unimplemented; BLE/SDK protocol verification required"
      : interfaceRoute.route === "desktop_web_serial"
        ? "Web Serial（read-only実装済み・実機確認待ち）"
      : interfaceRoute.route === "desktop_local_bridge"
        ? "Windowsローカルブリッジ（接続・送信は未有効化）"
        : interfaceRoute.route;
    routeItem.append(routeLabel, document.createTextNode(routeValue));
    obdConnectionGuide.appendChild(routeItem);
  }
  if (isIosElm) {
    const profile = window.ObdReadOnly.getElmTransportProfile({ platform: "ios" });
    const profileItem = document.createElement("span");
    const profileLabel = document.createElement("strong");
    profileLabel.textContent = "ELM profile";
    profileItem.append(profileLabel, document.createTextNode(`${profile.adapterTransport} / ${profile.compatibilityStatus} / ${profile.connectorStatus}`));
    obdConnectionGuide.appendChild(profileItem);
  }
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
  let target = document.getElementById(targetId);
  if (!target) return;
  if (!obdAccessUnlocked) return;
  const emptyReadoutStatus = { obdDetectedCodes: "obdImportStatus", obdMonitorGrid: "obdMonitorStatus" }[targetId];
  if (emptyReadoutStatus && !target.children.length) target = document.getElementById(emptyReadoutStatus) || target;
  const filterId = { obdMonitorGrid: "obdMonitorFilter", obdDetectedCodes: "obdDtcFilter" }[targetId];
  if (filterId) {
    const filter = document.getElementById(filterId);
    if (filter && !filter.hidden) target = filter;
  }
  if (!document.getElementById("obd-panel")?.classList.contains("is-active")) {
    activateTab("obd-panel");
    // Cancel the tab-to-top animation before moving to a specific result.
    window.scrollTo({ top: window.scrollY, behavior: "instant" });
  }
  const stage = target.closest("#obdReadoutSurface") || target.closest("#obdStageResultsView") ? "results"
    : target.closest("#obdStageDetailsView") ? "details" : "setup";
  renderObdStageView(stage);
  for (let disclosure = target.closest("details"); disclosure; disclosure = disclosure.parentElement?.closest("details")) {
    disclosure.open = true;
  }
  target.scrollIntoView({ behavior: "instant", block: "start" });
}

function renderObdPreviewButtons() {
  if (obdPreviewSelectedButton) obdPreviewSelectedButton.disabled = Boolean(obdBridgeOperation);
  if (obdPrepareSelectedButton) obdPrepareSelectedButton.disabled = Boolean(obdBridgeOperation);
  const selectedInterfaceId = resolveObdInterfaceId();
  const previewInterfaceId = obdDevSession.previewMode || "";
  [
    [obdPreviewElm327Button, "user-vci-elm327"],
    [obdPreviewThinkcarButton, "user-vci-thinkcar-bluetooth"],
    [obdPreviewJ2534Button, "user-vci-techstream-j2534"]
  ].forEach(([button, interfaceId]) => {
    if (!button) return;
    button.disabled = Boolean(obdBridgeOperation);
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
  const selectedReadoutRoute = getObdInterfaceReadoutRoute(selectedInterfaceId);
  const currentSession = obdDevSession.lastSession || null;
  const currentNextReadoutCandidates = getSessionNextReadoutCandidates(currentSession, 2);
  const nextReadoutLabels = getTopNextReadoutLabels(currentNextReadoutCandidates, 2);
  const nextReadoutLabel = formatTopNextReadoutLabel(currentNextReadoutCandidates, 2);
  const coreSessionStatus = currentSession?.coreSessionStatus || currentSession?.core_session_status || null;
  const blockingSummary = formatCoreBlockingWarningSummary(coreSessionStatus, 2, "");
  const emptyReadoutSummary = formatCoreEmptyReadoutSummary(coreSessionStatus, 2, "");
  const serialReady = capability?.secureContext === true && capability?.webSerialSupported === true;
  const previewActive = Boolean(obdDevSession.previewMode);
  const connected = Boolean(obdDevSession.port) && !["disconnected", "disconnecting"].includes(obdDevSession.connectionState);
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
  } else if (selectedReadoutRoute?.route === "native_connector_required") {
    nextAction = detailUnlocked
      ? "自前iPhoneコネクタの実装・実機適合を確認"
      : "必要なら詳細トークンを入れてiPhone接続計画を確認";
  } else if (selectedInterfaceId === "user-vci-elm327" && !serialReady) {
    nextAction = "デスクトップ版Chrome系ブラウザでWeb Serial読取を開始";
  } else if (selectedInterfaceId === "user-vci-thinkcar-bluetooth") {
    nextAction = detailUnlocked
      ? "PC側ローカルブリッジでVCI列挙とread-only応答を確認"
      : "必要なら詳細トークンを入れてBluetooth確認を有効化";
  } else if (selectedInterfaceId === "user-vci-techstream-j2534") {
    nextAction = detailUnlocked
      ? "PCでJ2534ドライバ確認後にローカルブリッジ確認"
      : "必要なら詳細トークンを入れてJ2534確認を有効化";
  } else if (!detailUnlocked) {
    nextAction = "必要なら詳細トークンで詳細読取を有効化";
  }
  if ((connected || bridgeReady) && blockingSummary) {
    nextAction = nextReadoutLabels.length
      ? `保留要因: ${blockingSummary}。${nextReadoutLabel} を再確認`
      : `保留要因: ${blockingSummary}。適用判定と読取内容を再確認`;
  }
  if ((connected || bridgeReady) && emptyReadoutSummary && !blockingSummary && !nextReadoutLabels.length) {
    nextAction = `空応答: ${emptyReadoutSummary}。対象読取を再確認`;
  }
  if ((connected || bridgeReady) && nextReadoutLabels.length && !blockingSummary) {
    nextAction = connected
      ? `${nextReadoutLabel} 繧帝・↓遒ｺ隱・`
      : `${nextReadoutLabel} 繧堤｢ｺ隱・`;
  }
  if (readCoreSessionAliasValue(coreSessionStatus, "readyForAnalysis", "ready_for_analysis") === true && !nextReadoutLabels.length && !emptyReadoutSummary) {
    nextAction = "コア読取が揃ったため解析結果の確認へ進行可能";
  }
  const readoutPath = connected
    ? "Web Serial読取"
    : bridgeReady
      ? "ローカルブリッジ読取"
      : selectedReadoutRoute?.route === "native_connector_required"
      ? "iPhone読取契約 -> ネイティブBLEホスト経由のread-only診断セッション（アプリ配布・実機確認待ち）"
        : selectedInterfaceId === "user-vci-thinkcar-bluetooth"
          ? "THINKCAR -> PCローカルブリッジ読取"
          : selectedInterfaceId === "user-vci-techstream-j2534"
            ? "J2534 -> ローカルブリッジ読取"
            : selectedInterface;
  obdWorkflowGuide.innerHTML = "";
  [
    ["車両", selectedVehicle],
    ["方式", selectedInterface],
    ["現在", currentState],
    ["次操作", nextAction],
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
  obdVehicleProductionDateInput.value = vehicleProductionDateInput.value;
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
  if (obdBridgeOperation) return;
  if (!ensureObdVehicleSelection()) return;
  clearRequestedInterfaceSelection();
  loadObdInterfacePreviewSample(resolveObdInterfaceId());
  const selectedVehicle = obdVehicleInput.value.trim();
  if (selectedVehicle && obdPreviewStatus) {
    obdPreviewStatus.textContent = `${getSelectedObdInterfaceLabel()} / ${selectedVehicle} の読取前プレビュー中です。`;
  }
}

function prepareSelectedObdInterface() {
  if (obdBridgeOperation) return;
  if (!ensureObdVehicleSelection()) return;
  const interfaceId = resolveObdInterfaceId();
  const selectedVehicle = obdVehicleInput.value.trim() || "車両未選択";
  const catalog = window.ObdReadOnly?.getVehicleInterfaceCatalog?.() || [];
  const item = catalog.find((entry) => entry.id === interfaceId);
  const readoutRoute = getObdInterfaceReadoutRoute(interfaceId);
  if (readoutRoute?.route === "native_connector_required") {
    obdDevSession.previewMode = null;
    clearRequestedInterfaceSelection();
    obdDevStatus.textContent = `${getSelectedObdInterfaceLabel()} / ${selectedVehicle}: iPhone BLEホストと未署名実機ビルドは検証済みですが、Apple署名・iPhoneインストール・実アダプター確認は未完了です。現時点の外部ログ取込は接続確認用の補助経路です。`;
    renderObdDeveloperGate();
    return;
  }
  if (item && isBridgeBackedInterfaceCandidate(interfaceId)) {
    if (isObdBridgeOperationBlocked()) return;
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
  const dtcReference = normalizeDtcInputReference(document.querySelector("#obdCode").value);
  return {
    vehicle: vehicleInput.value.trim(),
    vehicleProfile: buildSelectedDiagnosticVehicleProfile(),
    obdCode: dtcReference.code,
    obdSubcode: dtcReference.subcode,
    symptomId: symptomSelect.value,
    facts: document.querySelector("#facts").value.trim(),
    interview: getInterviewInput()
  };
}

function buildDiagnosis(input) {
  const dtcDefinitions = findDtcDefinitionCandidates(input.obdCode, input.obdSubcode);
  const dtcApplicability = evaluateDtcDefinitionCandidatesApplicability(dtcDefinitions, input.vehicleProfile);
  const dtcApplicabilityScopeSummary = buildDtcDefinitionScopeSummary(dtcDefinitions);
  const sourceSpecificDtcContext = buildSourceSpecificDtcContext(dtcDefinitions, input.vehicleProfile);
  const obd = selectApplicableDtcDefinition(dtcDefinitions, input.vehicleProfile);
  const flow = findById(dataStore.symptomFlows, input.symptomId);
  const interview = buildInterviewAnalysis(input.interview);
  const modernGenericMatches = getModernGenericMatches(input.obdCode);
  const workflowMatches = getDiagnosticWorkflowMatches(input, flow);
  const modernReferences = buildModernReferences(input, obd, flow, workflowMatches);
  const safetyTags = collectUnique([
    ...(obd?.safetyTags || []),
    ...inferSafetyTagsFromDtcDefinition(obd),
    ...(flow?.safetyTags || []),
    ...interview.safetyTags,
    ...modernGenericMatches.flatMap(inferSafetyTagsFromModernItem),
    ...workflowMatches.flatMap((item) => item.safety_tags || [])
  ]);
  const confirmationBeforeParts = collectUnique([
    ...(flow?.beforeParts || []),
    ...interview.partsChecks,
    ...workflowMatches.flatMap((item) => item.before_replacement_checks || []),
    obd ? `DTC ${formatDtcReference(input.obdCode, input.obdSubcode)} のメーカー別診断手順、端子番号、基準値を確認してください。` : ""
  ]);
  const postRepairReassessmentSummary = obdDevSession.lastSession?.postRepairReassessmentSummary || obdDevSession.lastSession?.post_repair_reassessment_summary || null;
  const causeCandidateLog = buildCauseCandidateLog(input, obd, flow, interview, dtcApplicability, postRepairReassessmentSummary);
  const previousCauseCandidateLog = obdDevSession.lastSession?.importedCauseCandidateLog
    || obdDevSession.lastSession?.imported_cause_candidate_log
    || obdDevSession.lastSession?.causeCandidateLog
    || obdDevSession.lastSession?.cause_candidate_log
    || null;
  const causeCandidateLogReferenceComparisonSummary = typeof window.ObdReadOnly?.buildCauseCandidateLogReferenceComparisonSummary === "function"
    ? window.ObdReadOnly.buildCauseCandidateLogReferenceComparisonSummary(previousCauseCandidateLog, causeCandidateLog)
    : null;
  const measurements = buildMeasurements(flow, interview, workflowMatches);
  const liveDataGuidance = buildLiveDataGuidance(workflowMatches);
  const nextMeasurementCandidatePlan = buildNextMeasurementCandidatePlan(
    getSessionNextReadoutCandidates(obdDevSession.lastSession, 4),
    measurements,
    liveDataGuidance,
    {
      monitorDefinitions: dataStore.obdMonitorDefinitions,
      livePidSnapshot: obdDevSession.lastSession?.livePidSnapshot || obdDevSession.lastSession?.live_pid_snapshot || null,
      supportedPidMatrix: obdDevSession.lastSession?.supportedPidMatrix || obdDevSession.lastSession?.supported_pid_matrix || null
    }
  );

  return {
    confidence: getConfidence(obd, flow, interview),
    safety: buildSafetyMessage(safetyTags),
    facts: buildFacts(input, obd, flow, interview, dtcApplicability, dtcApplicabilityScopeSummary, sourceSpecificDtcContext),
    interview: interview.insights.length ? interview.insights : [NO_DATA],
    guesses: buildGuesses(obd, flow, interview),
    causeCandidateLog,
    causeCandidateLogReferenceComparisonSummary,
    modernReferences,
    quickView: buildQuickView(input, obd, flow, interview, safetyTags, modernGenericMatches, workflowMatches),
    summary: buildDiagnosisSummary(input, obd, flow, interview, modernReferences, safetyTags),
    checkOrder: buildCheckOrder(obd, flow, interview, workflowMatches),
    measurements,
    liveDataGuidance,
    nextMeasurementCandidatePlan,
    postRepairReassessmentSummary,
    branches: buildBranches(flow, interview, workflowMatches),
    cautions: buildCautions(obd, flow, confirmationBeforeParts, workflowMatches),
    partsChecks: confirmationBeforeParts.length ? confirmationBeforeParts : [NO_DATA],
    safetyItems: buildSafetyItems(safetyTags),
    customer: buildCustomerExplanation(flow, interview),
    sources: buildSources(obd, flow, workflowMatches, sourceSpecificDtcContext),
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

function describeDtcDefinitionApplicabilityReason(reason, fallback = "") {
  const descriptions = {
    dtc_state_confirmation_required: "DTC状態（current/history）が未確認です。",
    dtc_state_out_of_scope: "読取DTC状態は公式出典の対象範囲外です。"
  };
  return descriptions[reason] || fallback;
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

function buildFacts(input, obd, flow, interview, dtcApplicability = null, dtcApplicabilityScopeSummary = "", sourceSpecificDtcContext = null) {
  const displayedDtc = formatDtcReference(input.obdCode, input.obdSubcode);
  const facts = [
    input.vehicle ? `車種情報: ${input.vehicle}` : `車種情報: ${NO_DATA}`,
    input.facts ? `確認済みの事実: ${input.facts}` : `確認済みの事実: ${NO_DATA}`
  ];

  if (input.obdCode && obd) {
    facts.push(`登録済みOBD2コード: ${displayedDtc} ${obd.title}`);
    facts.push(`OBD2コード上の故障系統: ${obd.faultSystem || obd.system || NO_DATA}`);
    if (input.obdSubcode) facts.push(`報告サブコード: ${input.obdSubcode}。この定義の適用範囲を整備書で確認してください。`);
  } else if (input.obdCode) {
    facts.push(`OBD2コード ${input.obdCode}: ${NO_DATA}`);
    facts.push(describeUnregisteredDtc(input.obdCode));
  } else {
    facts.push(`OBD2コード: ${NO_DATA}`);
  }

  if (dtcApplicability?.status === "matched") {
    facts.push("出典限定DTCの適用範囲: 選択車両と一致しています。ECU・サブコード・整備書の適合確認は引き続き必要です。");
  } else if (dtcApplicability?.status === "mismatch") {
    facts.push(`出典限定DTCの適用範囲: ${describeDtcDefinitionApplicabilityReason(dtcApplicability.reason, "選択車両は対象外です。")}この定義は診断根拠に使わず、該当車種の整備書を確認してください。`);
  } else if (dtcApplicability?.status === "unverified") {
    const unverifiedReason = dtcApplicability.reason === "additional_scope_confirmation_required"
      ? "車種・年式は候補と一致しますが、VIN・トリム等の追加条件が未確認です。"
      : "車種・年式が揃っていないため未確認です。";
    facts.push(`出典限定DTCの適用範囲: ${describeDtcDefinitionApplicabilityReason(dtcApplicability.reason, unverifiedReason)}適合が確認できるまで診断手順を流用しないでください。`);
    if (dtcApplicabilityScopeSummary) facts.push(`出典限定DTCの適用候補: ${dtcApplicabilityScopeSummary}`);
  }

  if (dtcApplicability?.status === "mismatch" && dtcApplicability.reason === "production_date_out_of_scope") {
    const productionDate = input.vehicleProfile?.productionDate || input.vehicleProfile?.production_date || null;
    facts.push(`出典限定DTCの適用根拠: 入力生産日${productionDate ? ` ${productionDate}` : ""}は候補範囲外です。${dtcApplicabilityScopeSummary ? ` 候補: ${dtcApplicabilityScopeSummary}` : ""}`);
  }

  if (sourceSpecificDtcContext?.hasDefinitions) {
    if (sourceSpecificDtcContext.applicability.status === "unverified") {
      const sourceSpecificUnverifiedReason = sourceSpecificDtcContext.applicability.reason === "additional_scope_confirmation_required"
        ? "車種・年式は公式出典の候補と一致しますが、VIN・市場・装備・ECU等の追加条件が未確認です。"
        : "車種・年式は公式出典の候補と一致しますが、車両情報が未確認です。";
      facts.push(`出典限定DTCの補足: ${describeDtcDefinitionApplicabilityReason(sourceSpecificDtcContext.applicability.reason, sourceSpecificUnverifiedReason)}汎用DTCの診断内容を置換せず、適合確認後に出典を参照してください。${sourceSpecificDtcContext.scopeSummary ? ` 候補: ${sourceSpecificDtcContext.scopeSummary}` : ""}`);
    } else if (sourceSpecificDtcContext.applicability.status === "mismatch") {
      facts.push(`出典限定DTCの補足: ${describeDtcDefinitionApplicabilityReason(sourceSpecificDtcContext.applicability.reason, "この車両は公式出典の車種限定候補の対象外です。")}汎用DTCの診断内容を維持し、出典限定の手順は適用しません。${sourceSpecificDtcContext.scopeSummary ? ` 候補: ${sourceSpecificDtcContext.scopeSummary}` : ""}`);
    }
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

function buildCauseCandidateLog(input = {}, obd = null, flow = null, interview = {}, dtcApplicability = null, postRepairReassessmentSummary = null) {
  const candidates = [];
  const seen = new Set();
  const addCandidate = ({ kind, label, sourceType, sourceId, evidenceRefs = [], applicabilityStatus = "unknown", sourceUrl = null, sourceDate = null }) => {
    const normalizedLabel = String(label || "").trim().slice(0, 240);
    if (!normalizedLabel) return;
    const key = [kind, sourceType, sourceId, normalizedLabel].join("::");
    if (seen.has(key) || candidates.length >= 64) return;
    seen.add(key);
    const normalizedEvidenceRefs = collectUnique(evidenceRefs.map((item) => String(item || "").trim()).filter(Boolean)).slice(0, 12);
    candidates.push({
      id: `cause_candidate_${String(candidates.length + 1).padStart(3, "0")}`,
      kind,
      label: normalizedLabel,
      sourceType,
      source_type: sourceType,
      sourceId: sourceId || null,
      source_id: sourceId || null,
      evidenceRefs: normalizedEvidenceRefs,
      evidence_refs: normalizedEvidenceRefs,
      applicabilityStatus,
      applicability_status: applicabilityStatus,
      sourceUrl: sourceUrl || null,
      source_url: sourceUrl || null,
      sourceDate: sourceDate || null,
      source_date: sourceDate || null,
      candidateOnly: true,
      candidate_only: true,
      confirmed: false,
      rank: null
    });
  };
  const dtcReference = input.obdCode ? formatDtcReference(input.obdCode, input.obdSubcode) : null;
  const interviewEvidenceRefs = Object.entries(input.interview || {})
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim())
    .map(([key]) => `interview:${key}`);
  (interview.guesses || []).forEach((label) => addCandidate({
    kind: "interview_hypothesis",
    label,
    sourceType: "interview",
    sourceId: "current_interview",
    evidenceRefs: interviewEvidenceRefs
  }));
  const flowEvidenceRefs = [input.symptomId ? `symptom:${input.symptomId}` : null].filter(Boolean);
  const possibleSystems = flow?.possibleSystems?.length ? flow.possibleSystems : flow?.faultSystem ? [flow.faultSystem] : [];
  possibleSystems.forEach((label) => addCandidate({ kind: "possible_system", label, sourceType: "symptom_flow", sourceId: flow?.id || input.symptomId, evidenceRefs: flowEvidenceRefs }));
  (obd?.commonCauses || []).forEach((label) => addCandidate({
    kind: "registered_dtc_cause",
    label,
    sourceType: "dtc_definition",
    sourceId: obd?.id || dtcReference,
    evidenceRefs: dtcReference ? [`dtc:${dtcReference}`] : [],
    applicabilityStatus: dtcApplicability?.status || "unknown",
    sourceUrl: Array.isArray(obd?.source_url) ? obd.source_url[0] : obd?.source_url,
    sourceDate: obd?.source_date
  }));
  (flow?.likelyButUnconfirmed || []).forEach((label) => addCandidate({ kind: "unconfirmed_flow_candidate", label, sourceType: "symptom_flow", sourceId: flow?.id || input.symptomId, evidenceRefs: flowEvidenceRefs }));
  const sourceTypes = collectUnique(candidates.map((item) => item.sourceType));
  const dtcEvidenceResolutionComparable = postRepairReassessmentSummary?.eligible === true
    && (postRepairReassessmentSummary?.dtcEvidenceResolutionComparisonAvailable === true || postRepairReassessmentSummary?.dtc_evidence_resolution_comparison_available === true);
  const rawDtcEvidenceResolutionStatus = String(postRepairReassessmentSummary?.dtcEvidenceResolutionStatus || postRepairReassessmentSummary?.dtc_evidence_resolution_status || "not_comparable");
  const dtcEvidenceResolutionStatus = ["resolved", "improved", "persisting", "worsened", "changed", "clear"].includes(rawDtcEvidenceResolutionStatus)
    ? rawDtcEvidenceResolutionStatus
    : "not_comparable";
  const readResolutionCount = (camelKey, snakeKey) => {
    const value = postRepairReassessmentSummary?.[camelKey] ?? postRepairReassessmentSummary?.[snakeKey];
    return Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;
  };
  const readResolutionKeys = (camelKey, snakeKey) => {
    const values = Array.isArray(postRepairReassessmentSummary?.[camelKey])
      ? postRepairReassessmentSummary[camelKey]
      : Array.isArray(postRepairReassessmentSummary?.[snakeKey]) ? postRepairReassessmentSummary[snakeKey] : [];
    return collectUnique(values.filter((key) => /^[a-z0-9_]+\|[a-z0-9_]+$/i.test(String(key))).map(String)).slice(0, 32);
  };
  const resolvedCount = readResolutionCount("resolvedInvalidDtcEvidenceIssueCount", "resolved_invalid_dtc_evidence_issue_count");
  const persistingCount = readResolutionCount("persistingInvalidDtcEvidenceIssueCount", "persisting_invalid_dtc_evidence_issue_count");
  const newCount = readResolutionCount("newInvalidDtcEvidenceIssueCount", "new_invalid_dtc_evidence_issue_count");
  const resolutionIssueKeys = collectUnique([
    ...readResolutionKeys("resolvedInvalidDtcEvidenceIssueKeys", "resolved_invalid_dtc_evidence_issue_keys"),
    ...readResolutionKeys("persistingInvalidDtcEvidenceIssueKeys", "persisting_invalid_dtc_evidence_issue_keys"),
    ...readResolutionKeys("newInvalidDtcEvidenceIssueKeys", "new_invalid_dtc_evidence_issue_keys")
  ]).slice(0, 32);
  const referenceEntries = dtcEvidenceResolutionComparable && dtcEvidenceResolutionStatus !== "not_comparable"
    ? [{
      id: "cause_reference_dtc_evidence_quality_001",
      kind: "post_repair_dtc_evidence_quality",
      label: `DTC証跡品質 ${dtcEvidenceResolutionStatus} / 解消${resolvedCount}・継続${persistingCount}・新規${newCount}`,
      sourceType: "post_repair_reassessment",
      source_type: "post_repair_reassessment",
      evidenceRefs: resolutionIssueKeys.map((key) => `dtc_evidence:${key}`),
      evidence_refs: resolutionIssueKeys.map((key) => `dtc_evidence:${key}`),
      resolutionStatus: dtcEvidenceResolutionStatus,
      resolution_status: dtcEvidenceResolutionStatus,
      resolvedCount,
      resolved_count: resolvedCount,
      persistingCount,
      persisting_count: persistingCount,
      newCount,
      new_count: newCount,
      candidate: false,
      affectsRanking: false,
      affects_ranking: false,
      diagnosticConclusionAssigned: false,
      diagnostic_conclusion_assigned: false,
      repairOutcomeConfirmed: false,
      repair_outcome_confirmed: false,
      readOnly: true,
      read_only: true,
      wouldTransmit: false,
      would_transmit: false,
      vehicleCommandEnabled: false,
      vehicle_command_enabled: false
    }]
    : [];
  return {
    schemaVersion: "cause_candidate_log_v1",
    schema_version: "cause_candidate_log_v1",
    candidates,
    candidateCount: candidates.length,
    candidate_count: candidates.length,
    sourceTypes,
    source_types: sourceTypes,
    referenceEntries,
    reference_entries: referenceEntries,
    referenceEntryCount: referenceEntries.length,
    reference_entry_count: referenceEntries.length,
    candidateOnly: true,
    candidate_only: true,
    confirmedCount: 0,
    confirmed_count: 0,
    rankingAssigned: false,
    ranking_assigned: false,
    retainedInterviewValues: false,
    retained_interview_values: false
  };
}

function formatCauseCandidateLogEntries(log = null, comparison = null) {
  const candidates = Array.isArray(log?.candidates) ? log.candidates : [];
  const referenceEntries = Array.isArray(log?.referenceEntries) ? log.referenceEntries : Array.isArray(log?.reference_entries) ? log.reference_entries : [];
  const comparisonAvailable = comparison?.comparisonAvailable === true || comparison?.comparison_available === true;
  const comparisonRow = comparisonAvailable
    ? `DTC証跡参照監査 / 追加${comparison.addedReferenceCount ?? comparison.added_reference_count ?? 0}・継続${comparison.persistingReferenceCount ?? comparison.persisting_reference_count ?? 0}・解消${comparison.resolvedReferenceCount ?? comparison.resolved_reference_count ?? 0} / 候補順位・診断結論には不使用`
    : null;
  const rows = [
    ...candidates.map((item) => `${item.id} / ${item.sourceType} / ${item.label} / 根拠: ${item.evidenceRefs?.join(", ") || NO_DATA} / 未確定`),
    ...referenceEntries.map((item) => `${item.id} / 参照情報 / ${item.label} / 候補順位・診断結論には不使用`),
    ...(comparisonRow ? [comparisonRow] : [])
  ];
  return rows.length
    ? rows
    : ["記録できる原因候補はありません。"];
}

function retainCauseCandidateLogInCurrentSession(result = null) {
  if (!obdDevSession.lastSession || !result?.causeCandidateLog || typeof window.ObdReadOnly?.normalizeCauseCandidateLog !== "function") return;
  const serialOwned = obdSerialResultOwner?.revision === obdSerialRevision
    && obdSerialResultOwner.expectedLastSession === obdDevSession.lastSession;
  const causeCandidateLog = window.ObdReadOnly.normalizeCauseCandidateLog(result.causeCandidateLog);
  const causeCandidateLogReferenceComparisonSummary = typeof window.ObdReadOnly?.normalizeCauseCandidateLogReferenceComparisonSummary === "function"
    ? window.ObdReadOnly.normalizeCauseCandidateLogReferenceComparisonSummary(result.causeCandidateLogReferenceComparisonSummary)
    : null;
  const importedCauseCandidateLog = window.ObdReadOnly.normalizeCauseCandidateLog(
    obdDevSession.lastSession.importedCauseCandidateLog
    || obdDevSession.lastSession.imported_cause_candidate_log
    || obdDevSession.lastSession.causeCandidateLog
    || obdDevSession.lastSession.cause_candidate_log
    || null
  );
  obdDevSession.lastSession = {
    ...obdDevSession.lastSession,
    importedCauseCandidateLog,
    imported_cause_candidate_log: importedCauseCandidateLog,
    causeCandidateLog,
    cause_candidate_log: causeCandidateLog,
    causeCandidateLogReferenceComparisonSummary,
    cause_candidate_log_reference_comparison_summary: causeCandidateLogReferenceComparisonSummary
  };
  handleObdReadoutSessionReplacement();
  if (serialOwned) obdSerialResultOwner.expectedLastSession = obdDevSession.lastSession;
}

function normalizeMeasurementCandidateMatchText(value) {
  return String(value || "").normalize("NFKC").trim().toLocaleLowerCase("ja").replace(/\s+/g, " ");
}

function buildMeasurementPidEvidence(label, context = {}) {
  const definitions = Array.isArray(context.monitorDefinitions) ? context.monitorDefinitions : [];
  const normalizedLabel = normalizeMeasurementCandidateMatchText(label);
  const definition = definitions.find((item) => [item?.id, item?.label, ...(Array.isArray(item?.aliases) ? item.aliases : [])]
    .some((alias) => normalizeMeasurementCandidateMatchText(alias) === normalizedLabel));
  if (!definition) return null;
  const rawPid = String(definition.pid || "").trim().toUpperCase();
  const pid = rawPid ? rawPid.padStart(2, "0") : "";
  const serviceMode = String(definition.service || "01").trim().toUpperCase().padStart(2, "0");
  const monitorValues = context.livePidSnapshot?.monitorValues || context.livePidSnapshot?.monitor_values || [];
  const observed = (Array.isArray(monitorValues) ? monitorValues : []).some((item) => {
    if (String(item?.id || "").trim() === definition.id) return true;
    return [item?.label, item?.name].some((value) => normalizeMeasurementCandidateMatchText(value) === normalizedLabel);
  });
  const supportedPids = context.supportedPidMatrix?.supportedPids || context.supportedPidMatrix?.supported_pids || [];
  const supported = pid && (Array.isArray(supportedPids) ? supportedPids : []).some((value) => {
    const normalizedValue = String(value || "").trim().toUpperCase();
    const normalizedPid = normalizedValue.length === 4 && normalizedValue.startsWith(serviceMode)
      ? normalizedValue.slice(2)
      : normalizedValue;
    return normalizedPid.padStart(2, "0") === pid;
  });
  return {
    definitionId: definition.id || null,
    serviceMode,
    pid: pid || null,
    matchStatus: observed ? "observed_pid" : supported ? "supported_pid" : "dictionary_only",
    applicabilityStatus: observed ? "observed_pid" : supported ? "supported_pid" : "unconfirmed",
    applicabilityConfirmed: observed || supported,
    evidenceRefs: [
      definition.id ? `monitor_definition:${definition.id}` : null,
      observed && definition.id ? `live_pid:${definition.id}` : null,
      supported && pid ? `supported_pid:${serviceMode}${pid}` : null
    ].filter(Boolean)
  };
}

function buildNextMeasurementCandidatePlan(readoutCandidates = [], measurements = [], liveDataGuidance = [], measurementContext = {}) {
  const candidates = [];
  const seen = new Set();
  const addCandidate = ({ label, actionType, sourceType, readoutId = null, reason = null, status = "pending", applicabilityStatus = "unconfirmed", applicabilityConfirmed = false, priorityBasis, sourcePriority = null, evidenceRefs = [], measurementDefinitionId = null, serviceMode = null, pid = null, matchStatus = "unconfirmed" }) => {
    const normalizedLabel = String(label || "").trim().slice(0, 240);
    if (!normalizedLabel || normalizedLabel === NO_DATA || candidates.length >= 8) return;
    const key = normalizedLabel.toLocaleLowerCase("ja");
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      id: `next_measurement_${String(candidates.length + 1).padStart(2, "0")}`,
      label: normalizedLabel,
      actionType,
      action_type: actionType,
      sourceType,
      source_type: sourceType,
      readoutId,
      readout_id: readoutId,
      reason: reason ? String(reason).trim().slice(0, 320) : null,
      status,
      applicabilityStatus,
      applicability_status: applicabilityStatus,
      applicabilityConfirmed: applicabilityConfirmed === true,
      applicability_confirmed: applicabilityConfirmed === true,
      priorityBasis,
      priority_basis: priorityBasis,
      priorityReason: reason ? String(reason).trim().slice(0, 320) : null,
      priority_reason: reason ? String(reason).trim().slice(0, 320) : null,
      sourcePriority: sourcePriority !== null && sourcePriority !== "" && Number.isFinite(Number(sourcePriority)) ? Number(sourcePriority) : null,
      source_priority: sourcePriority !== null && sourcePriority !== "" && Number.isFinite(Number(sourcePriority)) ? Number(sourcePriority) : null,
      evidenceRefs: [...new Set((Array.isArray(evidenceRefs) ? evidenceRefs : []).map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 12),
      evidence_refs: [...new Set((Array.isArray(evidenceRefs) ? evidenceRefs : []).map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 12),
      measurementDefinitionId,
      measurement_definition_id: measurementDefinitionId,
      serviceMode,
      service_mode: serviceMode,
      pid,
      matchStatus,
      match_status: matchStatus,
      displayOrder: candidates.length + 1,
      display_order: candidates.length + 1,
      candidateOnly: true,
      candidate_only: true,
      readOnly: true,
      read_only: true,
      wouldTransmit: false,
      would_transmit: false,
      vehicleCommandEnabled: false,
      vehicle_command_enabled: false,
      executionEnabled: false,
      execution_enabled: false
    });
  };
  (Array.isArray(readoutCandidates) ? readoutCandidates : []).forEach((item) => {
    if (!isSafeNextReadoutCandidate(item)) return;
    const readoutId = item.id || item.readoutId || item.readout_id || null;
    addCandidate({
      label: item.label || item.displayLabel || item.display_label || readoutId,
      actionType: "diagnostic_readout",
      sourceType: "scan_session",
      readoutId,
      reason: item.reason || item.statusReason || item.status_reason || "未取得の読取データを補完",
      status: item.status || "missing",
      applicabilityStatus: item.applicabilityStatus || item.applicability_status || "unconfirmed",
      applicabilityConfirmed: item.applicabilityConfirmed === true || item.applicability_confirmed === true,
      priorityBasis: "saved_readout_candidate_order",
      sourcePriority: item.priority,
      evidenceRefs: [readoutId ? `readout:${readoutId}` : null, item.status ? `status:${item.status}` : null, item.statusReason || item.status_reason ? `reason:${item.statusReason || item.status_reason}` : null]
    });
  });
  (Array.isArray(measurements) ? measurements : []).forEach((label) => {
    const pidEvidence = buildMeasurementPidEvidence(label, measurementContext);
    addCandidate({
      label,
      actionType: "measurement_point",
      sourceType: "diagnostic_flow",
      reason: "現在のDTC・症状・問診から抽出した測定候補",
      applicabilityStatus: pidEvidence?.applicabilityStatus || "unconfirmed",
      applicabilityConfirmed: pidEvidence?.applicabilityConfirmed === true,
      priorityBasis: "diagnostic_flow_order",
      evidenceRefs: ["diagnostic_flow:measurement_point", ...(pidEvidence?.evidenceRefs || [])],
      measurementDefinitionId: pidEvidence?.definitionId || null,
      serviceMode: pidEvidence?.serviceMode || null,
      pid: pidEvidence?.pid || null,
      matchStatus: pidEvidence?.matchStatus || "unconfirmed"
    });
  });
  if (!candidates.length) {
    (Array.isArray(liveDataGuidance) ? liveDataGuidance : []).forEach((label) => {
      const pidEvidence = buildMeasurementPidEvidence(label, measurementContext);
      addCandidate({
        label,
        actionType: "observation_guidance",
        sourceType: "diagnostic_workflow",
        reason: "登録済み診断ワークフローの観察候補",
        applicabilityStatus: pidEvidence?.applicabilityStatus || "unconfirmed",
        applicabilityConfirmed: pidEvidence?.applicabilityConfirmed === true,
        priorityBasis: "diagnostic_workflow_order",
        evidenceRefs: ["diagnostic_workflow:observation_guidance", ...(pidEvidence?.evidenceRefs || [])],
        measurementDefinitionId: pidEvidence?.definitionId || null,
        serviceMode: pidEvidence?.serviceMode || null,
        pid: pidEvidence?.pid || null,
        matchStatus: pidEvidence?.matchStatus || "unconfirmed"
      });
    });
  }
  return {
    schemaVersion: "diagnostic_next_measurement_candidates_v1",
    schema_version: "diagnostic_next_measurement_candidates_v1",
    candidates,
    candidateCount: candidates.length,
    candidate_count: candidates.length,
    readoutCandidateCount: candidates.filter((item) => item.actionType === "diagnostic_readout").length,
    readout_candidate_count: candidates.filter((item) => item.actionType === "diagnostic_readout").length,
    applicabilityConfirmedCount: candidates.filter((item) => item.applicabilityConfirmed === true).length,
    applicability_confirmed_count: candidates.filter((item) => item.applicabilityConfirmed === true).length,
    applicabilityUnconfirmedCount: candidates.filter((item) => item.applicabilityConfirmed !== true).length,
    applicability_unconfirmed_count: candidates.filter((item) => item.applicabilityConfirmed !== true).length,
    observedPidMatchCount: candidates.filter((item) => item.matchStatus === "observed_pid").length,
    observed_pid_match_count: candidates.filter((item) => item.matchStatus === "observed_pid").length,
    supportedPidMatchCount: candidates.filter((item) => item.matchStatus === "supported_pid").length,
    supported_pid_match_count: candidates.filter((item) => item.matchStatus === "supported_pid").length,
    automatic: true,
    candidateOnly: true,
    candidate_only: true,
    allReadOnly: candidates.every((item) => item.readOnly === true),
    all_read_only: candidates.every((item) => item.readOnly === true),
    wouldTransmit: false,
    would_transmit: false,
    vehicleCommandEnabled: false,
    vehicle_command_enabled: false
  };
}

function formatNextMeasurementCandidateEntries(plan = null) {
  const candidates = Array.isArray(plan?.candidates) ? plan.candidates : [];
  const applicabilityLabels = { matched: "適合候補", partial: "適合要確認", observed_pid: "実測PID一致", supported_pid: "対応PID一致", unlisted: "未登録", manual: "手入力・要確認", unknown: "適合未確認", unconfirmed: "適合未確認" };
  const priorityLabels = { saved_readout_candidate_order: "保存読取順", diagnostic_flow_order: "診断フロー順", diagnostic_workflow_order: "登録手順順" };
  return candidates.length
    ? candidates.map((item) => `${String(item.displayOrder).padStart(2, "0")} / ${item.actionType === "diagnostic_readout" ? "読取候補" : "測定候補"} / ${item.label} / ${applicabilityLabels[item.applicabilityStatus] || item.applicabilityStatus} / 優先根拠: ${priorityLabels[item.priorityBasis] || item.priorityBasis}・${item.priorityReason || "根拠未登録"} / 読取専用・未実行`)
    : ["次の測定候補はまだありません。車両・DTC・症状・問診を入力してください。"];
}

function formatPostRepairReassessmentEntries(summary = null) {
  if (!summary) return ["整備後比較セッションはまだありません。"];
  const blockedReasons = summary.blockedReasonIds || summary.blocked_reason_ids || [];
  const blockedLabels = {
    post_repair_condition_not_recorded: "観察条件を修理後に設定",
    same_vehicle_not_confirmed: "前回と同一車両を明示確認",
    baseline_comparison_not_available: "整備前セッションを読み込み比較"
  };
  if (summary.state === "blocked") return [`再判定保留: ${blockedReasons.map((id) => blockedLabels[id] || id).join(" / ")}`];
  const changedIds = summary.changedSectionIds || summary.changed_section_ids || [];
  const evidenceRows = summary.evidenceRows || summary.evidence_rows || [];
  const livePidValueDeltaRows = summary.livePidValueDeltaRows || summary.live_pid_value_delta_rows || [];
  const kindLabels = { readout_id: "読取", bridge_intent: "ブリッジ", request_plan_action: "次読取", blocked_reason: "保留要因", analysis_checklist_id: "解析条件", unclassified: "診断値" };
  const directionLabels = { added: "整備後側に追加", removed: "整備後側で消失", mixed: "追加・消失の両方" };
  const dtcEvidenceResolutionLabels = { resolved: "解消", improved: "改善", persisting: "継続", worsened: "悪化", changed: "対象変化", clear: "問題なし", not_comparable: "比較不可" };
  const dtcEvidenceResolutionStatus = summary.dtcEvidenceResolutionStatus || summary.dtc_evidence_resolution_status || "not_comparable";
  const resolvedDtcEvidenceCount = summary.resolvedInvalidDtcEvidenceIssueCount ?? summary.resolved_invalid_dtc_evidence_issue_count ?? 0;
  const persistingDtcEvidenceCount = summary.persistingInvalidDtcEvidenceIssueCount ?? summary.persisting_invalid_dtc_evidence_issue_count ?? 0;
  const newDtcEvidenceCount = summary.newInvalidDtcEvidenceIssueCount ?? summary.new_invalid_dtc_evidence_issue_count ?? 0;
  const dtcEvidenceScopeBlockedReasonIds = summary.dtcEvidenceScopeBlockedReasonIds || summary.dtc_evidence_scope_blocked_reason_ids || [];
  const dtcEvidenceScopeBlockedLabels = {
    imported_dtc_evidence_scope_incomplete: "整備前の車両・ECU・DTC範囲不足",
    current_dtc_evidence_scope_incomplete: "現在の車両・ECU・DTC範囲不足",
    dtc_evidence_vehicle_scope_mismatch: "車両範囲不一致",
    dtc_evidence_ecu_dtc_scope_mismatch: "ECU・DTC範囲不一致",
    imported_dtc_evidence_acquisition_context_incomplete: "整備前の取得文脈不足",
    current_dtc_evidence_acquisition_context_incomplete: "現在の取得文脈不足",
    dtc_evidence_protocol_mismatch: "通信方式不一致",
    dtc_evidence_capture_order_invalid: "読取時系列不成立",
    dtc_evidence_scan_identity_reused: "同一スキャン識別子",
    imported_dtc_evidence_transport_context_incomplete: "整備前の通信文脈不足",
    current_dtc_evidence_transport_context_incomplete: "現在の通信文脈不足",
    dtc_evidence_readout_attempt_reused: "同一読取試行識別子",
    dtc_evidence_communication_route_mismatch: "通信経路不一致",
    dtc_evidence_vci_identity_mismatch: "VCI識別不一致",
    imported_dtc_evidence_readout_contract_incomplete: "整備前のDTC読取種別不足",
    current_dtc_evidence_readout_contract_incomplete: "現在のDTC読取種別不足",
    dtc_evidence_readout_category_mismatch: "DTC区分不一致",
    dtc_evidence_requested_service_mismatch: "要求サービス不一致",
    imported_dtc_evidence_response_contract_incomplete: "整備前の応答契約不足",
    current_dtc_evidence_response_contract_incomplete: "現在の応答契約不足",
    dtc_evidence_response_service_mismatch: "応答サービス不一致",
    dtc_evidence_ecu_response_status_mismatch: "ECU応答状態不一致",
    imported_dtc_evidence_negative_response_context_incomplete: "整備前の否定応答文脈不足",
    current_dtc_evidence_negative_response_context_incomplete: "現在の否定応答文脈不足",
    dtc_evidence_negative_response_code_mismatch: "否定応答コード不一致",
    dtc_evidence_response_pending_state_mismatch: "保留応答観測状態不一致",
    imported_dtc_evidence_response_attempt_context_incomplete: "整備前の応答試行条件不足",
    current_dtc_evidence_response_attempt_context_incomplete: "現在の応答試行条件不足",
    dtc_evidence_negative_requested_service_mismatch: "否定応答対象サービス不一致",
    dtc_evidence_response_count_mismatch: "応答回数不一致",
    dtc_evidence_response_wait_mismatch: "応答待機時間不一致"
  };
  const dtcEvidenceScopeNote = dtcEvidenceResolutionStatus === "not_comparable" && dtcEvidenceScopeBlockedReasonIds.length
    ? ` / ${dtcEvidenceScopeBlockedReasonIds.map((id) => dtcEvidenceScopeBlockedLabels[id] || id).join("・")}`
    : "";
  const formatPidDeltaThreshold = (row) => row.thresholdApplied === true || row.threshold_applied === true
    ? `出典基準差 ${row.threshold} / ${row.referenceDeltaStatus || row.reference_delta_status} / ${row.thresholdReferenceId || row.threshold_reference_id} / 出典日 ${row.sourceDate || row.source_date || "未登録"} / 要確認`
    : row.historicalThresholdEvidenceRetained === true || row.historical_threshold_evidence_retained === true
      ? `過去の出典証跡 ${row.thresholdEvidence?.referenceId || row.threshold_evidence?.reference_id || "不明"} / 現行基準で再確認できないため判定なし`
      : "閾値判定なし・要確認";
  return [
    summary.state === "changed_requires_review" ? "整備前後で読取状態に変化あり。整備士確認が必要です。" : "比較対象の読取状態に変化は検出されませんでした。",
    `比較セクション: ${summary.comparedSectionCount ?? summary.compared_section_count ?? 0} / 変化: ${changedIds.length}`,
    `DTC証跡品質: ${dtcEvidenceResolutionLabels[dtcEvidenceResolutionStatus] || dtcEvidenceResolutionStatus} / 解消${resolvedDtcEvidenceCount}・継続${persistingDtcEvidenceCount}・新規${newDtcEvidenceCount}${dtcEvidenceScopeNote}`,
    ...evidenceRows.map((row) => `${String(row.displayOrder || row.display_order).padStart(2, "0")} / ${kindLabels[row.kind] || row.kind} / ${row.id} / ${directionLabels[row.direction] || row.direction} / 要確認`),
    ...livePidValueDeltaRows.map((row) => `PID差分 ${String(row.displayOrder || row.display_order).padStart(2, "0")} / ${row.id} / ECU ${row.sourceEcu || row.source_ecu || "-"} / ${row.importedValue ?? row.imported_value} -> ${row.currentValue ?? row.current_value} ${row.unit || ""} / 差 ${row.delta} / ${formatPidDeltaThreshold(row)}`),
    "修理成功・故障解消の確定ではありません。DTC、FF、レディネス、ライブ値を個別に確認してください。"
  ];
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

function buildSources(obd, flow, workflowMatches = [], sourceSpecificDtcContext = null) {
  const sources = [];

  if (obd?.sources?.length) sources.push(...obd.sources);
  if (obd?.source) sources.push(obd.source);
  if (obd?.source_date) sources.push(`出典日: ${obd.source_date}`);
  sources.push(...(Array.isArray(obd?.source_url) ? obd.source_url : [obd?.source_url]).filter(Boolean));
  if (flow?.sources?.length) sources.push(...flow.sources);
  sources.push(...workflowMatches.flatMap((item) => [
    item.source,
    ...(Array.isArray(item.source_url) ? item.source_url : [item.source_url])
  ].filter(Boolean)));
  if (sourceSpecificDtcContext?.hasDefinitions) {
    sources.push(...sourceSpecificDtcContext.definitions.flatMap((item) => [
      item.source,
      item.source_date ? `出典日: ${item.source_date}` : null,
      ...(Array.isArray(item.source_url) ? item.source_url : [item.source_url])
    ].filter(Boolean)));
  }

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

const MODERN_GENERIC_DTC_STANDARD_SOURCE_URLS = new Set([
  "https://saemobilus.sae.org/standards/j2012_202509-diagnostic-trouble-code-definitions",
  "https://saemobilus.sae.org/standards/j2012da_202607-digital-annex-diagnostic-trouble-code-definitions-failure-type-byte-definitions",
  "https://saemobilus.sae.org/standards/j2012da_202510-digital-annex-diagnostic-trouble-code-definitions-failure-type-byte-definitions"
]);

function hasDirectModernGenericSourceUrl(item) {
  const sourceUrls = Array.isArray(item?.source_url) ? item.source_url : [item?.source_url];
  return item?.confidence !== "sample" && sourceUrls.some((url) => typeof url === "string" && MODERN_GENERIC_DTC_STANDARD_SOURCE_URLS.has(url.trim()));
}

function getModernGenericMatches(code) {
  return (dataStore.genericObdCodesModern || [])
    .filter((item) => item?.imported_definition_only !== true)
    .filter(hasDirectModernGenericSourceUrl)
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

function inferSafetyTagsFromDtcDefinition(item) {
  const text = normalizeLoose([
    item?.system,
    item?.powertrain,
    item?.vehicle_filter?.powertrain,
    ...(item?.safety_notes || []),
    ...(item?.possible_causes || [])
  ].join(" "));
  const tags = [];

  if (text.includes("brake") || text.includes("abs") || text.includes("ブレーキ") || text.includes("制動")) tags.push("brake");
  if (text.includes("srs") || text.includes("airbag") || text.includes("restraint") || text.includes("エアバッグ") || text.includes("拘束")) tags.push("airbag");
  if (text.includes("steering") || text.includes("ステアリング") || text.includes("操舵")) tags.push("steering");
  if (text.includes("adas") || text.includes("先進運転支援")) tags.push("adas");
  if (text.includes("immobilizer") || text.includes("security") || text.includes("イモビライザー") || text.includes("盗難防止")) tags.push("security");
  if (text.includes("fuel") || text.includes("evap") || text.includes("燃料")) tags.push("fuel");
  if (text.includes("hybrid") || text.includes("highvoltage") || text.includes("高電圧") || text.includes("hv")) tags.push("highVoltage");

  return tags;
}

function inferSafetyTagsFromModernItem(item) {
  return inferSafetyTagsFromDtcDefinition(item);
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
    steering: "操舵系は走行安全に直結します。異常を感じる場合は走行を中止し、メーカー指定手順と専門家の確認を優先してください。",
    adas: "ADAS系は安全支援機能の不作動や誤作動につながる可能性があります。校正・調整・分解はメーカー指定手順を優先してください。",
    security: "イモビライザー、盗難防止系は始動不能や認証機能の不作動につながる可能性があります。指定手順なしで配線・ECU・キー認証系を操作しないでください。",
    fuel: "燃料系作業は火災の危険があります。火気厳禁、換気、燃圧抜き手順、保護具を優先してください。",
    highVoltage: "高電圧システムは感電や重大事故の危険があります。有資格者とメーカー指定手順を優先してください。"
  };

  return tags.map((tag) => messages[tag]).filter(Boolean).join(" ");
}

function renderDiagnosis(result) {
  retainCauseCandidateLogInCurrentSession(result);
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
  renderItems(causeCandidateLogList, formatCauseCandidateLogEntries(result.causeCandidateLog, result.causeCandidateLogReferenceComparisonSummary));
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
  renderItems(nextMeasurementCandidateList, formatNextMeasurementCandidateEntries(result.nextMeasurementCandidatePlan));
  renderItems(postRepairReassessmentList, formatPostRepairReassessmentEntries(result.postRepairReassessmentSummary));
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
    ? "このブラウザはUSBシリアルと、OSがCOMポートとして公開したBluetooth Classic SPPの読取基盤に対応しています。BLE/Wi-Fiは対象外です。"
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
  renderObdStageView();
}

function getObdAutoStage() {
  const lastSession = obdDevSession.lastSession || null;
  const dtcSnapshot = lastSession?.dtcSnapshot || lastSession?.dtc_snapshot || null;
  const livePidSnapshot = lastSession?.livePidSnapshot || lastSession?.live_pid_snapshot || null;
  const freezeFrameSnapshot = lastSession?.freezeFrameSnapshot || lastSession?.freeze_frame_snapshot || null;
  const ecuInfoSnapshot = lastSession?.ecuInfoSnapshot || lastSession?.ecu_info_snapshot || null;
  const readinessSnapshot = lastSession?.readinessSnapshot || lastSession?.readiness_snapshot || null;
  const onboardMonitorSnapshot = lastSession?.onboardMonitorSnapshot || lastSession?.onboard_monitor_snapshot || null;
  const nextReadoutCandidates = getSessionNextReadoutCandidates(lastSession, 1);
  const hasReadout = Boolean(
    dtcSnapshot?.dtcs?.length
    || livePidSnapshot?.monitorValues?.length
    || hasObdFreezeFrameEvidence(freezeFrameSnapshot)
    || ecuInfoSnapshot?.itemCount
    || readinessSnapshot?.monitorCount
    || onboardMonitorSnapshot?.testCount
  );
  const hasPendingReadoutCandidates = Boolean(nextReadoutCandidates.length);
  if (hasPendingReadoutCandidates) return "results";
  if (obdDevModeUnlocked) return "details";
  if (hasReadout) return "results";
  return "setup";
}

function renderObdStageView(preferredStage = activeObdStage) {
  syncObdReadoutSurface();
  if (!obdStagePanel) return;
  const unlocked = obdAccessUnlocked === true;
  obdStagePanel.hidden = !unlocked;
  if (!unlocked) return;
  const allowedStages = new Set(["setup", "results", "details"]);
  const nextStage = allowedStages.has(preferredStage) ? preferredStage : getObdAutoStage();
  activeObdStage = nextStage;

  const stageMeta = {
    setup: {
      badge: "車両選択 / 接続",
      status: "車両選択、接続準備、プレビュー確認を先に進めます。"
    },
    results: {
      badge: "読取結果",
      status: "DTC、フリーズフレーム、ライブデータをまとめて確認する段階です。"
    },
    details: {
      badge: "詳細",
      status: "ブリッジ契約、詳細読取、検証情報を確認する段階です。"
    }
  };
  const meta = stageMeta[nextStage] || stageMeta.setup;
  obdStageBadge.textContent = meta.badge;
  obdStageStatus.textContent = meta.status;

  obdStageTabs.forEach((button) => {
    const active = button.dataset.obdStage === nextStage;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  if (obdStageSetupView) obdStageSetupView.hidden = nextStage !== "setup";
  if (obdStageResultsView) obdStageResultsView.hidden = nextStage !== "results";
  if (obdStageDetailsView) obdStageDetailsView.hidden = nextStage !== "details";
}

function setObdStage(stage = "setup") {
  renderObdStageView(stage);
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
    renderObdStageView("setup");
    return;
  }

  obdAccessStatus.textContent = getObdAccessStatusMessage(true, capability);
  renderObdStageView(getObdAutoStage());
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
    { id: "read_readiness", label: "レディネス応答の正規化", available: hasBridgeReadinessContractSupport() },
    { id: "read_ecu_info", label: "ECU情報応答の正規化", available: hasBridgeIntentModel("read_ecu_info", schemaIntents, allowedReadIntents, hasBridgeEcuInfoSupport) },
    { id: "read_onboard_monitor", label: "Mode06応答の正規化", available: hasBridgeIntentModel("read_onboard_monitor", schemaIntents, allowedReadIntents, hasBridgeOnboardMonitorSupport) },
    { id: "session_summary", label: "セッション要約", available: hasBridgeSessionSummarySupport() },
    { id: "session_export", label: "エクスポート", available: hasBridgeSessionExportSupport() },
    { id: "diagnostic_import", label: "診断取込", available: hasBridgeDiagnosticImportPipelineSupport() },
    { id: "diagnostic_import_top_level_session", label: "診断取込トップレベル互換", available: hasBridgeDiagnosticImportTopLevelSessionSupport() },
    { id: "merge_diagnostic_inputs", label: "統合入力", available: hasBridgeMergeDiagnosticInputsSupport() }
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
      available: item.hardwareCompatibilityConfirmed === true
    }));
  const modelDone = modelChecks.filter((item) => item.available).length;
  const driverDone = driverChecks.filter((item) => item.available).length;
  const progressPercent = modelChecks.length ? Math.round((modelDone / modelChecks.length) * 100) : 0;
  const doneLabels = modelChecks.filter((item) => item.available).map((item) => item.label);
  const missingLabels = modelChecks.filter((item) => !item.available).map((item) => item.label);
  const hardwareMissingLabels = driverChecks.filter((item) => !item.available).map((item) => `${item.label} 実機適合`);

  return {
    progressPercent,
    modelDone,
    modelTotal: modelChecks.length,
    driverDone,
    driverTotal: driverChecks.length,
    doneLabels,
    missingLabels,
    hardwareMissingLabels,
    currentBasis: `ソフト実装 ${modelDone}/${modelChecks.length}項目。実VCI適合は別集計で ${driverDone}/${driverChecks.length}系統を確認済み。`,
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
      label: "トップレベル互換",
      available: hasBridgeDiagnosticImportTopLevelSessionSupport()
    },
    {
      label: "統合入力",
      available: hasBridgeMergeDiagnosticInputsSupport()
    }
  ];
  const doneCount = checks.filter((check) => check.available).length;
  const missingLabels = checks.filter((check) => !check.available).map((check) => check.label);
  const progressPercent = checks.length ? Math.round((doneCount / checks.length) * 100) : 0;
  const guide = getInterfaceCandidateGuideByItem(item);
  const hardwareCompatibilityConfirmed = item?.hardwareCompatibilityConfirmed === true;
  const implementationStatus = doneCount >= checks.length
    ? guide?.statusReady || "実機読取確認待ち"
    : doneCount >= 6
      ? guide?.statusMid || "read-only取込あり"
      : guide?.statusEarly || "読取器を整備中";
  const currentStatus = hardwareCompatibilityConfirmed ? implementationStatus : "実機適合確認待ち";

  return {
    progressPercent,
    doneCount,
    totalCount: checks.length,
    missingLabels,
    currentStatus,
    currentBasis: `${guide?.basisPrefix
      ? `${guide.basisPrefix} ${doneCount}/${checks.length}項目を実装済み。${guide.basisSuffix || ""}`.trim()
      : `bridge候補の読取器 ${doneCount}/${checks.length}項目を実装済み。`} 実機適合: ${hardwareCompatibilityConfirmed ? "確認済み" : "未確認"}`,
    nextBuild: guide?.nextBuild || "実機読取応答を同じ read-only 契約へ揃える。",
    etaTarget: doneCount >= checks.length ? "実機確認後" : "2026-Q3 後半見込み"
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
    implementationProgressPercent: Number.isFinite(bridgeBackedSnapshot?.progressPercent)
      ? bridgeBackedSnapshot.progressPercent
      : Number.isFinite(progress?.progressPercent)
        ? progress.progressPercent
        : item?.progressPercent || 0,
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
      current_basis: `${snapshot.currentBasis} 応答型、要約、エクスポート、診断取込、統合入力まで同一モデルで扱えます。`,
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
    },
    {
      label: "トップレベル互換",
      available: hasBridgeDiagnosticImportTopLevelSessionSupport()
    },
    {
      label: "統合入力",
      available: hasBridgeMergeDiagnosticInputsSupport()
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
    basisSuffix: "自前iPhoneコネクタとPCローカルブリッジのread-only経路を優先。",
    nextBuild: "THINKCARのBLEまたは公式SDK仕様を確認し、DTC / フリーズフレーム / ライブデータ / ECU情報を同じセッション契約へ流す。",
    operatorNote: "iPhoneでは自前コネクタ、PCではローカルブリッジからread-only診断セッションへ取り込みます。",
    checkSummary: "先に確認: 1.BLE/SDK仕様 2.VCI識別 3.DTC/フリーズフレーム/ライブデータ/ECU情報のread-only応答",
    startStatus: `${getInterfaceCandidateDisplayName(interfaceId)}を確認します。自前コネクタまたはPCローカルブリッジのread-only経路を確認します。`,
    idleStatus: `${getInterfaceCandidateDisplayName(interfaceId)}を選択中です。通信仕様と実機適合の確認待ちです。`,
    readyStatus: `${getInterfaceCandidateDisplayName(interfaceId)}のread-only経路を確認済みです。次にDTC、フリーズフレーム、ライブデータ、ECU情報を同じセッションで確認できます。`
  }),
  "user-vci-techstream-j2534": (interfaceId) => ({
    actionLabel: "有線OBD2適合確認",
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
  if (isObdBridgeOperationBlocked()) return;
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
    capturedPercent: 100,
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
      operatorNote: "PCはWeb Serial、iPhoneは自前コネクタの実装・実機確認待ちです。"
    },
    "user-vci-thinkcar-bluetooth": {
      label: "THINKCAR Bluetooth",
      adapterIdentity: { adapterName: "THINKCAR Sample", adapterFamily: "THINKCAR", firmwareVersion: "bt-sim" },
      connectionStatus: { displayStatus: "Bluetooth読取前プレビュー中", nextAction: "読取は自前iPhoneコネクタまたはPCローカルブリッジで確認" },
      operatorNote: "自前iPhoneコネクタまたはPCローカルブリッジでread-only結果を取り込む前提です。"
    },
    "user-vci-techstream-j2534": {
      label: "J2534",
      adapterIdentity: { adapterName: "J2534 Sample", adapterFamily: "J2534 Pass-Thru", firmwareVersion: "drv-sim" },
      connectionStatus: { displayStatus: "J2534読取前プレビュー中", nextAction: "読取はPCドライバとローカルブリッジで確認" },
      operatorNote: "J2534はスマホ単体ではなくPC側ドライバ前提です。"
    }
  };
  const selected = table[interfaceId] || table["user-vci-elm327"];
  const previewRoute = interfaceId === "user-vci-thinkcar-bluetooth"
    ? "1.BLE/SDK仕様確認 2.自前コネクタまたはPCブリッジ確認 3.DTC/フリーズフレーム/ライブデータ/ECU情報確認"
    : interfaceId === "user-vci-techstream-j2534"
      ? "1.PCでJ2534ドライバ確認 2.ローカルブリッジ確認 3.VCI一覧/ECU情報/DTC確認"
      : "1.Web Serial読取開始 2.DTC/ライブデータ/FF確認 3.保存と比較";
  return {
    label: selected.label,
    statusText: `${selected.label}の読取前プレビューです。今見える項目を確認し、読取は ${selected.connectionStatus.nextAction}。`,
    previewStatus: `読取前プレビュー中: 今見える項目を確認。読取は ${selected.connectionStatus.nextAction}`,
    previewGuide: [
      `スマホ単体: ${interfaceId === "user-vci-elm327" ? "ELM327用iPhone BLEホストと未署名実機ビルドは検証済み・Apple署名と実機確認待ち" : interfaceId === "user-vci-thinkcar-bluetooth" ? "THINKCAR通信仕様確認と専用iPhoneコネクタ実装待ち" : "表示確認のみ"}`,
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
      source: "interface_preview",
      source_type: "interface_preview",
      protocol: interfaceId === "user-vci-elm327" ? "ELM327" : "local_bridge_preview",
      capturedAt,
      previewMode: true,
      preview_mode: true,
      sampleMode: true,
      sample_mode: true,
      vehicleCommandEnabled: false,
      vehicle_command_enabled: false,
      wouldTransmit: false,
      would_transmit: false,
      warnings: ["preview_not_vehicle_readout"],
      connectionStatus: { ...selected.connectionStatus, sample_mode: true, vehicle_connected: false, vci_connected: false },
      adapterIdentity: { ...selected.adapterIdentity, sample_mode: true, vehicle_command_enabled: false },
      vciDevices: [
        {
          id: interfaceId,
          label: selected.label,
          connected: false,
          selected: true,
          sample_mode: true,
          driverStatus: interfaceId === "user-vci-elm327" ? "not_required" : "sample_ready"
        }
      ]
    }
  };
}

function loadObdInterfacePreviewSample(interfaceId) {
  if (obdBridgeOperation) return;
  const preview = getObdInterfacePreviewConfig(interfaceId);
  obdDevSession.previewMode = interfaceId;
  obdDevSession.connectedAt = new Date().toISOString();
  obdDevSession.bridgeStatus = preview.session.connectionStatus;
  obdDevSession.bridgeVciList = preview.bridgeVciList;
  obdDevSession.adapterIdentity = preview.session.adapterIdentity;
  obdDevSession.lastSession = preview.session;
  handleObdReadoutSessionReplacement();

  const monitorValues = preview.session.livePidSnapshot?.monitorValues || [];
  const insights = preview.session.livePidSnapshot?.monitorInsights || [];
  const dtcs = preview.session.dtcSnapshot?.dtcs || [];
  renderObdMonitorValues(monitorValues, insights);
  obdDetectedCodes.innerHTML = "";
  dtcs.forEach((item) => {
    if (item?.code) obdDetectedCodes.appendChild(createObdDtcCard(item, dtcs, preview.session.vehicleProfile || preview.session.vehicle_profile || null));
  });
  obdImportStatus.textContent = `${preview.label}の読取前プレビューです。DTC・ライブデータは実車未読取です。`;
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
  renderObdStageView("setup");
}

function startGeneralBridgeCheck() {
  if (isObdBridgeOperationBlocked()) return;
  clearRequestedInterfaceSelection();
  probeObdLocalBridge();
}

function buildDiagnosticCoreProgressSnapshot() {
  const checks = [
    { id: "dtc_status", label: "DTC状態別保持", available: hasBridgeDtcSupport() },
    { id: "pid_live_data", label: "PID / ライブデータ", available: hasBridgeLivePidSupport() && hasBridgeSupportedPidSupport() },
    { id: "freeze_frame", label: "フリーズフレーム", available: hasBridgeFreezeFrameSupport() },
    { id: "readiness", label: "レディネス", available: hasBridgeReadinessContractSupport() },
    { id: "ecu_info_mode09", label: "ECU情報 / Mode09", available: hasBridgeEcuInfoSupport() },
    { id: "mode06", label: "Mode06監視結果", available: hasBridgeOnboardMonitorSupport() },
    { id: "diagnostic_import", label: "診断取込 / export", available: hasBridgeDiagnosticImportPipelineSupport() },
    { id: "scan_session", label: "scan session構造", available: hasBridgeDiagnosticScanSessionSupport() },
    { id: "saved_next_readout_request", label: "saved next readout request", available: typeof buildSavedNextReadoutCandidate === "function" },
    {
      id: "readout_request_plan_summary",
      label: "readout request plan summary",
      available: hasBridgeDiagnosticScanSessionSupport()
        && hasBridgeMergeDiagnosticInputsSupport()
    },
    {
      id: "imported_summary_comparisons",
      label: "imported summary comparisons",
      available: hasBridgeDiagnosticScanSessionSupport()
        && hasBridgeMergeDiagnosticInputsSupport()
        && hasBridgeDiagnosticImportPipelineSupport()
    },
    {
      id: "saved_request_reimport",
      label: "saved request re-import",
      available: hasBridgeDiagnosticScanSessionSupport()
        && hasBridgeDiagnosticImportPipelineSupport()
        && typeof analyzeObdScannerImport === "function"
    },
    {
      id: "request_gate_actions",
      label: "request gate / action",
      available: hasBridgeDiagnosticScanSessionSupport()
        && typeof window.ObdReadOnly?.mergeDiagnosticInputs === "function"
    },
    {
      id: "readout_request_safety_note",
      label: "readout request safety note",
      available: typeof formatNextReadoutRequestSafetySummary === "function"
        && typeof analyzeObdScannerImport === "function"
    },
    {
      id: "scan_session_request_safety_summary",
      label: "scan session request safety summary",
      available: window.ObdReadOnly?.buildDiagnosticScanSession
        && typeof formatNextReadoutRequestSafetySummary === "function"
    }
  ];
  const doneLabels = checks.filter((check) => check.available).map((check) => check.label);
  const missingLabels = checks.filter((check) => !check.available).map((check) => check.label);
  const doneCount = doneLabels.length;
  const totalCount = checks.length;
  const progressPercent = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
  const nextLabel = missingLabels[0] || "実機読取差分の確認";
  const recentDoneLabels = doneLabels.slice(-4).join(" / ");

  return {
    ...OBD_CORE_PROGRESS_SNAPSHOT,
    doneCount,
    totalCount,
    progressPercent,
    doneLabels,
    missingLabels,
    recentDoneLabels,
    nextLabel
  };
}

function getObdFreezeFrameTriggerEntries(snapshot = null) {
  const entries = Array.isArray(snapshot?.triggerDtcEntries)
    ? snapshot.triggerDtcEntries
    : Array.isArray(snapshot?.trigger_dtc_entries) ? snapshot.trigger_dtc_entries : [];
  return entries.filter((entry) => String(entry?.code || entry?.dtc || "").trim());
}

function hasObdFreezeFrameEvidence(snapshot = null) {
  return Boolean(snapshot?.monitorValues?.length || snapshot?.monitor_values?.length || snapshot?.triggerDtc || snapshot?.trigger_dtc || getObdFreezeFrameTriggerEntries(snapshot).length);
}

function formatObdFreezeFrameTriggerEntry(entry = null) {
  const code = String(entry?.code || entry?.dtc || "").trim().toUpperCase();
  if (!code) return "起点DTC未記録";
  const reportedStatus = String(entry?.reportedStatus ?? entry?.reported_status ?? "").trim();
  const frameNumber = entry?.frameNumber ?? entry?.frame_number ?? null;
  const ecu = String(entry?.sourceEcu ?? entry?.source_ecu ?? "").trim();
  return `${code}${reportedStatus ? ` / ${reportedStatus}` : ""}${Number.isInteger(Number(frameNumber)) ? ` / #${Number(frameNumber)}` : ""}${ecu ? ` / ${ecu}` : ""}`;
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
  const candidateProgress = averageProgressPercent(interfaceCatalogStates.map((item) => item.implementationProgressPercent));
  const interfaceProgress = averageProgressPercent([phaseProgress, candidateProgress]);
  const hardwareConfirmedCount = interfaceCatalogStates.filter((item) => item.hardwareCompatibilityConfirmed === true).length;
  const vehicleReadoutConfirmedCount = interfaceCatalogStates.filter((item) => item.connectionEnabled === true).length;
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
  const coreSnapshot = buildDiagnosticCoreProgressSnapshot();

  const cards = [
    {
      tone: "breakdown",
      trackingId: "diagnostic_core_progress",
      title: "診断コア進捗",
      primary: `内部構造 ${coreSnapshot.doneCount}/${coreSnapshot.totalCount}項目 (${coreSnapshot.progressPercent}%) / ${coreSnapshot.validationCheckLabel}`,
      detail: `${coreSnapshot.recentMilestone}。${coreSnapshot.bridgeValidationCheckLabel}。${coreSnapshot.scopeNote}。done: ${coreSnapshot.recentDoneLabels || "集計中"}。次: ${coreSnapshot.nextLabel}`
    },
    {
      tone: "score",
      highlight: true,
      title: "ソフト完成度",
      primary: `診断機全体 ${overallProgress}% / OBD2読取 ${readoutProgress}%`,
      detail: `機能 ${capabilityProgress}% / 網羅 ${coverageProgress}% / インターフェース実装 ${interfaceProgress}%。実機適合は含めません。`
    },
    {
      tone: "breakdown",
      title: "開発優先方針",
      primary: "アプリ内の統合OBD診断機を最優先",
      detail: "先に OBD読取、VCI読取、保存、レポートを診断機側で固める。"
    },
    {
      title: "完了見込み",
      primary: `Q3目標 ${q3Targets}系統 / Q4目標 ${q4Targets}系統`,
      detail: `先に進む候補: ${upcomingInterfaces || upcomingCapabilities || summarizeEtaTargets(allEtas, 3)}`
    },
    {
      title: "対応インターフェース",
      primary: `ソフト平均 ${candidateProgress}% / 実機適合 ${hardwareConfirmedCount}/${interfaceCatalogStates.length}件`,
      detail: `実車読取 ${vehicleReadoutConfirmedCount}/${interfaceCatalogStates.length}件 / ${autoRouteNote} / 実装遅れ: ${weakestInterfaces || "集計中"}`
    },
    {
      title: "読取機能",
      primary: `DTC / PID / FF / ECU情報 / Mode06 / Mode09 平均 ${readoutProgress}%`,
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
  cards.forEach((card) => {
    const article = document.createElement("article");
    article.className = card.tone === "score"
      ? "obd-progress-score-card"
      : card.tone === "breakdown"
        ? "obd-progress-breakdown-card"
        : "";

    const title = document.createElement("strong");
    title.textContent = card.title;
    const primary = document.createElement("span");
    if (card.highlight === true) primary.className = "obd-progress-score";
    primary.textContent = card.primary;
    const detail = document.createElement("span");
    detail.textContent = card.detail;

    article.append(title, primary, detail);
    obdProgressGrid.appendChild(article);
  });
}

function renderObdDeveloperGate(capability = window.ObdReadOnly?.getCapability?.()) {
  renderObdSessionExportControls();
  const unlocked = obdDevModeUnlocked === true;
  const connected = Boolean(obdDevSession.port) && !["disconnected", "disconnecting"].includes(obdDevSession.connectionState);
  const previewActive = Boolean(obdDevSession.previewMode);
  const serialReady = capability?.secureContext === true && capability?.webSerialSupported === true;
  const selectedVehicle = obdVehicleInput.value.trim();
  const selectedInterface = getSelectedObdInterfaceLabel();
  const selectedInterfaceId = resolveObdInterfaceId(capability);
  const selectedReadoutRoute = getObdInterfaceReadoutRoute(selectedInterfaceId);
  const nativeConnectorRoute = selectedReadoutRoute?.route === "native_connector_required";
  const primaryActionNeedsSerial = selectedInterfaceId === "user-vci-elm327" && selectedReadoutRoute?.route === "desktop_web_serial";
  const readBusy = obdDevSession.readInProgress === true;
  const serialBusy = readBusy || obdDevSession.initializing === true || obdDevSession.coreScanInProgress === true;
  const bridgeUnavailable = !unlocked || isObdBridgeOperationBlocked();
  document.querySelectorAll("[data-obd-bridge-request]").forEach((button) => {
    button.disabled = isObdBridgeOperationBlocked();
  });

  obdDevModeBadge.textContent = unlocked ? "詳細有効" : "ロック中";
  obdDevControls.hidden = !unlocked;
  renderObdBridgePairingControls();
  obdDevLockButton.disabled = !unlocked;
  obdDevConnectButton.disabled = !unlocked || Boolean(obdBridgeOperation || obdSerialConnectPending || obdSerialDisconnectOperation) || connected || (primaryActionNeedsSerial && !serialReady);
  obdDevConnectButton.textContent = getObdPrimaryActionLabel(selectedInterfaceId, { unlocked, connected, serialReady, nativeConnectorRoute });
  obdDevIdentifyButton.disabled = !unlocked || !connected || serialBusy;
  obdDevCoreScanButton.disabled = !unlocked || !connected || serialBusy;
  obdDevQuickConditionButton.disabled = !unlocked || !connected || serialBusy;
  obdDevReadDtcButton.disabled = !unlocked || !connected || serialBusy;
  obdDevReadFreezeFrameButton.disabled = !unlocked || !connected || serialBusy;
  obdDevReadReadinessButton.disabled = !unlocked || !connected || serialBusy;
  obdDevSnapshotButton.disabled = !unlocked || !connected || serialBusy;
  obdDevReadEcuInfoButton.disabled = !unlocked || !connected || serialBusy;
  obdDevReadOnboardMonitorButton.disabled = !unlocked || !connected || serialBusy;
  obdDevBridgeStatusButton.disabled = bridgeUnavailable;
  obdDevBridgeVciButton.disabled = bridgeUnavailable || !obdDevSession.bridgeEndpoint;
  obdDevBridgeDtcButton.disabled = bridgeUnavailable || !obdDevSession.bridgeEndpoint;
  obdDevBridgePendingDtcButton.disabled = bridgeUnavailable || !obdDevSession.bridgeEndpoint;
  obdDevBridgePermanentDtcButton.disabled = bridgeUnavailable || !obdDevSession.bridgeEndpoint;
  obdDevBridgeEcuInfoButton.disabled = bridgeUnavailable || !obdDevSession.bridgeEndpoint;
  obdDevBridgeMonitorButton.disabled = bridgeUnavailable || !obdDevSession.bridgeEndpoint;
  obdDevBridgeSupportedPidButton.disabled = bridgeUnavailable || !obdDevSession.bridgeEndpoint;
  obdDevBridgeFreezeFrameButton.disabled = bridgeUnavailable || !obdDevSession.bridgeEndpoint;
  obdDevBridgeReadinessButton.disabled = bridgeUnavailable || !obdDevSession.bridgeEndpoint;
  obdDevBridgeLiveButton.disabled = bridgeUnavailable || !obdDevSession.bridgeEndpoint;
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

  if (obdSerialDisconnectOperation) {
    obdDevConnectionState.textContent = obdSerialDisconnectOperation.cleanupFailed ? "終了未確認" : "終了処理中";
    obdDevStatus.textContent = obdSerialDisconnectOperation.cleanupFailed
      ? "VCIの終了処理を確認できないため、再接続を禁止しています。車両側の停止は未確認です。"
      : obdSerialDisconnectOperation.writeTimedOut
        ? "VCIへの送信待ち時間を超過しました。終了処理が未確認のため再接続は禁止しています。車両側の停止は未確認です。"
      : obdSerialDisconnectOperation.writePending
        ? "VCIへの未完了送信と終了処理を確認中です。再接続はできません。車両側の停止は未確認です。"
        : "VCIの終了処理を待っています。再接続はできません。車両側の停止は未確認です。";
  } else if (!unlocked) {
    obdDevStatus.textContent = "この端末に詳細トークンを設定した場合だけ詳細読取メニューを有効化できます。送信は読取専用のみです。";
  } else if (primaryActionNeedsSerial && !serialReady) {
    obdDevStatus.textContent = "Web Serial対応のデスクトップ版Chrome系ブラウザとHTTPS環境が必要です。";
  } else if (!connected) {
    const requestedStatus = obdDevSession.bridgeEndpoint
      ? getRequestedInterfaceReadyStatus()
      : getRequestedInterfaceIdleStatus();
    const defaultReadyMessage = nativeConnectorRoute
      ? "iPhone BLEホストと未署名実機ビルドは検証済みですが、Apple署名・iPhoneインストール・実アダプター確認は未完了です。外部ログ取込は接続確認用の補助経路です。"
      : selectedInterfaceId === "user-vci-elm327"
      ? "ELM327/STN の読取を開始できます。"
      : selectedInterfaceId === "user-vci-techstream-j2534"
        ? "J2534 の VCI一覧、アダプター識別、read-only ECU情報/DTC確認を続けられます。"
        : selectedInterfaceId === "user-vci-thinkcar-bluetooth"
          ? "Bluetooth の DTC、フリーズフレーム、ライブデータ、ECU情報確認を続けられます。"
      : `${selectedInterface} の read-only 確認を続けられます。`;
    const defaultIdleMessage = nativeConnectorRoute
      ? `${selectedInterface}${selectedVehicle ? ` / ${selectedVehicle}` : ""} を選択中です。iPhone BLEホストと未署名実機ビルドは検証済みですが、Apple署名・iPhoneインストール・実アダプター確認は未完了です。`
      : selectedInterfaceId === "user-vci-elm327"
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
  renderObdStageView(getObdAutoStage());
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
  invalidateObdScannerImport();
  obdAccessUnlocked = false;
  void disconnectObdDeveloperVci({ reason: "access_locked" });
  clearObdBridgePairingToken();
  try { sessionStorage.removeItem(OBD_ACCESS_MODE_KEY); } catch (_error) { /* Runtime lock still applies. */ }
  obdAccessPasswordInput.value = "";
  renderObdAccessGate();
}

function unlockObdDeveloperMode() {
  let configuredToken = localStorage.getItem(OBD_DEV_TOKEN_KEY) || "";
  if (configuredToken.length < 12) {
    const initialToken = obdDevPasswordInput.value.trim();
    if (initialToken.length < 12) {
      obdDevStatus.textContent = "初回の詳細トークンは12文字以上で設定してください。";
      return;
    }
    localStorage.setItem(OBD_DEV_TOKEN_KEY, initialToken);
    configuredToken = initialToken;
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
  invalidateObdScannerImport();
  obdDevModeUnlocked = false;
  void disconnectObdDeveloperVci({ reason: "developer_locked" });
  clearObdBridgePairingToken();
  try { sessionStorage.removeItem(OBD_DEV_MODE_KEY); } catch (_error) { /* Runtime lock still applies. */ }
  obdDevSession.previewMode = null;
  clearRequestedInterfaceSelection();
  obdDevStatus.textContent = "詳細読取メニューをロックしました。";
  renderObdDeveloperGate();
}

function handleObdPrimaryAction() {
  const interfaceId = resolveObdInterfaceId();
  if (interfaceId === "user-vci-elm327" && getObdInterfaceReadoutRoute(interfaceId)?.route === "desktop_web_serial") {
    void connectObdDeveloperVci();
    return;
  }
  prepareSelectedObdInterface();
}

async function connectObdDeveloperVci() {
  if (!obdAccessUnlocked || !obdDevModeUnlocked) return;
  if (obdBridgeOperation || obdSerialConnectPending || obdSerialDisconnectOperation) return;
  if (!["disconnected"].includes(obdDevSession.connectionState)) return;
  if (!("serial" in navigator)) {
    obdDevStatus.textContent = "このブラウザはWeb Serialに対応していません。";
    return;
  }

  const revision = ++obdSerialRevision;
  obdSerialResultOwner = { revision, expectedLastSession: obdDevSession.lastSession };
  obdSerialConnectPending = true;
  let port = null;
  let opened = false;
  let installed = false;
  try {
    resetWebSerialConnectionAttemptMetadata();
    setObdDeveloperConnectionState("selecting");
    obdDevSession.previewMode = null;
    clearRequestedInterfaceSelection();
    const baudRate = Number(obdDevBaudRate.value) || 38400;
    obdDevStatus.textContent = "VCIを選択してください。";
    port = await navigator.serial.requestPort();
    throwIfObdSerialOperationCancelled(revision);
    setObdDeveloperConnectionState("opening");
    await port.open({ baudRate });
    opened = true;
    throwIfObdSerialOperationCancelled(revision);
    obdDevSession.port = port;
    installed = true;
    obdDevSession.reader = port.readable.getReader();
    obdDevSession.writer = port.writable.getWriter();
    obdDevSession.decoder = new TextDecoder();
    obdDevSession.encoder = new TextEncoder();
    obdDevSession.textBuffer = "";
    obdDevSession.readLoopActive = true;
    obdDevSession.bridgeEndpoint = null;
    obdDevSession.bridgeStatus = null;
    obdDevSession.bridgeVciList = null;
    obdDevSession.adapterIdentity = null;
    obdDevSession.adapterInitializationSummary = buildWebSerialAdapterInitializationSummary({ status: "in_progress", baudRate });
    obdDevSession.lastRawText = "";
    obdDevSession.connectedAt = new Date().toISOString();
    obdDevSession.scanSessionId = `web-serial-${Date.now().toString(36)}`;
    obdDevSession.vehicleProfile = buildSelectedObdVehicleProfile();
    obdDevSession.vehicleApplicability = buildSelectedObdVehicleApplicability(obdDevSession.vehicleProfile);
    obdDevSession.observationContext = buildSelectedObdObservationContext();
    obdDevSession.supportedPidDiscoveryComplete = false;
    obdDevSession.supportedPidSet = [];
    obdDevSession.supportedPidReadoutResponses = [];
    obdDevSession.readoutAttempts = [];
    obdDevSession.coreScanStopReason = null;
    obdDevSession.readoutProfile = null;
    obdDevSession.livePidTimeline = [];
    obdDevSession.freezeFrameReadoutResponses = [];
    obdDevSession.freezeFrameCapabilityResponse = null;
    obdDevSession.ecuInfoReadoutResponses = [];
    obdDevSession.lastSession = null;
    handleObdReadoutSessionReplacement();
    obdSerialResultOwner.expectedLastSession = null;
    obdDevSession.initializing = true;
    setObdDeveloperConnectionState("initializing");
    obdDevStatus.textContent = `VCI読取を開始しました。通信速度 ${baudRate}。`;
    readElmDeveloperLoop();
    renderObdDeveloperGate();
    await initializeElmDeveloperAdapter();
    throwIfObdSerialOperationCancelled(revision);
    obdDevSession.initializing = false;
    await identifyObdDeveloperVci();
    throwIfObdSerialOperationCancelled(revision);
    if (obdDevSession.port) setObdDeveloperConnectionState("ready");
  } catch (error) {
if (!continueObdSerialOperation(revision)) return;
    obdDevSession.initializing = false;
    if (isWebSerialPortSelectionCancelled(error) && !obdDevSession.port) {
      setObdDeveloperConnectionState("disconnected", "port_selection_cancelled");
      clearRequestedInterfaceSelection();
      obdDevStatus.textContent = "VCI選択をキャンセルしました。車両への送信は行っていません。";
      renderObdDeveloperGate();
      return;
    }
    const writeTimedOut = error?.message?.startsWith("elm_transport_write_timeout:");
    const failureReason = writeTimedOut && error.connectionFailureReason
      ? error.connectionFailureReason
      : obdDevSession.lastDisconnectReason === "serial_response_too_large"
        ? "serial_response_too_large"
      : getWebSerialConnectionFailureReason(obdDevSession.connectionState, obdDevSession.adapterInitializationSummary);
    const failureMessage = formatWebSerialConnectionFailure(failureReason, obdDevSession.adapterInitializationSummary, error);
    const cleanup = disconnectObdDeveloperVci({ reason: failureReason, statusMessage: failureMessage });
    if (!writeTimedOut) await cleanup;
    if (continueObdSerialOperation(revision)) {
      if (writeTimedOut) {
        if (error.diagnosticContext) Object.assign(obdDevSession, error.diagnosticContext);
        obdDevSession.lastDisconnectReason = failureReason;
      }
      retainWebSerialConnectionAttempt();
      obdSerialResultOwner.expectedLastSession = obdDevSession.lastSession;
    }
  } finally {
    if (opened && !installed) {
      try { await port.close(); } catch (_error) { /* Only this attempt's opened port is owned here. */ }
    }
    obdSerialConnectPending = false;
    renderObdSessionExportControls();
  }
}

function resetWebSerialConnectionAttemptMetadata() {
  obdDevSession.lastDisconnectReason = null;
  obdDevSession.disconnectedAt = null;
  obdDevSession.connectedAt = null;
  obdDevSession.scanSessionId = null;
  obdDevSession.vehicleProfile = null;
  obdDevSession.vehicleApplicability = null;
  obdDevSession.observationContext = null;
  obdDevSession.bridgeEndpoint = null;
  obdDevSession.bridgeStatus = null;
  obdDevSession.bridgeVciList = null;
  obdDevSession.adapterIdentity = null;
  obdDevSession.adapterInitializationSummary = null;
  obdDevSession.readoutAttempts = [];
  obdDevSession.coreScanStopReason = null;
  obdDevSession.readoutProfile = null;
}

function isWebSerialPortSelectionCancelled(error) {
  return String(error?.name || "").trim() === "NotFoundError";
}

function getWebSerialConnectionFailureReason(connectionState, initializationSummary = null) {
  const state = String(connectionState || "").trim().toLowerCase();
  const initializationStatus = String(initializationSummary?.initializationStatus || initializationSummary?.initialization_status || "").trim().toLowerCase();
  if (state === "selecting") return "port_selection_failed";
  if (state === "opening") return "port_open_failed";
  if (state === "initializing" && initializationStatus === "completed") return "adapter_identification_failed";
  if (state === "initializing") return "adapter_initialization_failed";
  return "connection_failed";
}

function setObdDeveloperConnectionState(state, reason = null) {
  obdDevSession.connectionState = ELM327_CONNECTION_STATES.includes(state) ? state : "disconnected";
  if (reason) obdDevSession.lastDisconnectReason = String(reason).slice(0, 80);
}

function handleObdSerialDisconnect(event) {
  if (!obdDevSession.port) return;
  const disconnectedPort = event?.port || (event?.target && event.target !== navigator.serial ? event.target : null);
  if (disconnectedPort && disconnectedPort !== obdDevSession.port) return;
  void disconnectObdDeveloperVci({ reason: "device_disconnected" });
}

async function disconnectObdDeveloperVci(options = {}) {
  const reason = typeof options?.reason === "string" ? options.reason : "operator_disconnect";
  // Transport loss retains the original attempt's failure evidence; explicit cancellation invalidates it.
  if (["operator_disconnect", "access_locked", "developer_locked"].includes(reason)) obdSerialRevision += 1;
  if (obdSerialDisconnectOperation) return obdSerialDisconnectOperation.promise;
  if (obdDevSession.connectionState === "disconnected" && !obdDevSession.port && !obdSerialConnectPending) return;
  const statusMessage = typeof options?.statusMessage === "string" ? options.statusMessage : null;
  const operation = {};
  obdSerialDisconnectOperation = operation;
  const { reader, writer, port } = obdDevSession;
  const pendingWrite = obdDevSession.pendingWriteOperation;
  const waitForWrite = Boolean(pendingWrite && pendingWrite.writer === writer && pendingWrite.port === port);
  operation.writePending = waitForWrite;
  operation.writeTimedOut = waitForWrite && pendingWrite.timedOut === true;
  if (waitForWrite) {
    pendingWrite.diagnosticContext = {
      supportedPidDiscoveryComplete: obdDevSession.supportedPidDiscoveryComplete,
      supportedPidSet: obdDevSession.supportedPidSet,
      supportedPidReadoutResponses: obdDevSession.supportedPidReadoutResponses,
      freezeFrameCapabilityResponse: obdDevSession.freezeFrameCapabilityResponse,
      livePidTimeline: obdDevSession.livePidTimeline,
      observationContext: obdDevSession.observationContext
    };
  }
  setObdDeveloperConnectionState("disconnecting", reason);
  obdDevSession.reader = null;
  obdDevSession.writer = null;
  obdDevSession.port = null;
  obdDevSession.readLoopActive = false;
  obdDevSession.pendingCommandOperation = null;
  // A timed-out command's caller still needs this evidence to retain its failed attempt.
  if (!operation.writeTimedOut) {
    obdDevSession.supportedPidDiscoveryComplete = false;
    obdDevSession.supportedPidSet = [];
    obdDevSession.supportedPidReadoutResponses = [];
    obdDevSession.freezeFrameCapabilityResponse = null;
    obdDevSession.livePidTimeline = [];
    obdDevSession.observationContext = null;
  }
  obdDevSession.readInProgress = false;
  obdDevSession.initializing = false;
  obdDevSession.coreScanInProgress = false;
  obdDevSession.coreScanStopReason = null;

  operation.promise = (async () => {
    // Defer completion until the coalesced cleanup promise has been assigned.
    await Promise.resolve();
    if (reader) {
      try { await reader.cancel(); } catch (_error) {
        if (waitForWrite) operation.cleanupFailed = true;
      }
      try { reader.releaseLock(); } catch (_error) {
        if (waitForWrite) operation.cleanupFailed = true;
      }
    }
    if (waitForWrite) {
      await pendingWrite.settledPromise;
      operation.writePending = false;
    }
    if (writer) {
      try { writer.releaseLock(); } catch (_error) {
        if (waitForWrite) operation.cleanupFailed = true;
      }
    }
    if (port) {
      try { await port.close(); } catch (_error) {
        if (waitForWrite) operation.cleanupFailed = true;
      }
    }
    if (obdSerialDisconnectOperation !== operation) return;
    if (operation.cleanupFailed) {
      renderObdDeveloperGate();
      return;
    }
    obdSerialDisconnectOperation = null;
    obdDevSession.disconnectedAt = new Date().toISOString();
    setObdDeveloperConnectionState("disconnected", reason);
    clearRequestedInterfaceSelection();
    obdDevStatus.textContent = statusMessage || (reason === "serial_response_too_large"
      ? formatWebSerialConnectionFailure(reason)
      : reason === "operator_disconnect" ? "VCI読取を停止しました。" : "VCI接続が終了したため、安全に読取を停止しました。");
    renderObdDeveloperGate();
  })();
  renderObdDeveloperGate();
  return operation.promise;
}

function isCurrentObdSerialOperation(revision) {
  return revision === obdSerialRevision && obdAccessUnlocked && obdDevModeUnlocked;
}

function continueObdSerialOperation(revision) {
  if (!isCurrentObdSerialOperation(revision) || obdSerialResultOwner?.revision !== revision) return false;
  if (obdSerialResultOwner.expectedLastSession !== obdDevSession.lastSession) {
    void disconnectObdDeveloperVci({ reason: "operator_disconnect" });
    return false;
  }
  return true;
}

function throwIfObdSerialOperationCancelled(revision) {
  if (!continueObdSerialOperation(revision)) throw new Error("elm_operation_cancelled");
}

async function initializeElmDeveloperAdapter() {
  const revision = obdSerialRevision;
  const initSteps = [
    { command: "ATZ", step: "adapter_reset" },
    { command: "ATE0", step: "disable_echo" },
    { command: "ATL0", step: "disable_linefeeds" },
    { command: "ATS0", step: "disable_spaces" },
    { command: "ATH1", step: "enable_headers" },
    { command: "ATSP0", step: "automatic_protocol" }
  ];
  const responses = [];
  let completedStepCount = 0;
  for (const { command, step } of initSteps) {
    const timeoutMs = command === "ATZ" ? 5000 : 2500;
    let response;
    try {
      response = await sendElmDeveloperCommand(command, timeoutMs);
      throwIfObdSerialOperationCancelled(revision);
    } catch (error) {
      if (!continueObdSerialOperation(revision)) throw error;
      obdDevSession.adapterInitializationSummary = buildWebSerialAdapterInitializationSummary({
        status: "failed",
        baudRate: obdDevSession.adapterInitializationSummary?.baudRate,
        attemptedSetupStepCount: completedStepCount + 1,
        completedSetupStepCount: completedStepCount,
        failedSetupStep: step,
        stopReason: getWebSerialAdapterInitializationStopReason(error)
      });
      throw error;
    }
    const outcome = classifyWebSerialCommandResponse(command, response);
    if (outcome.commandStatus !== "completed") {
      obdDevSession.adapterInitializationSummary = buildWebSerialAdapterInitializationSummary({
        status: "failed",
        baudRate: obdDevSession.adapterInitializationSummary?.baudRate,
        attemptedSetupStepCount: completedStepCount + 1,
        completedSetupStepCount: completedStepCount,
        failedSetupStep: step,
        stopReason: outcome.stopReason || outcome.commandStatus
      });
      throw new Error(`elm_adapter_initialization_failed:${command}:${outcome.stopReason || outcome.commandStatus}`);
    }
    responses.push(`${command}\n${response}`);
    completedStepCount += 1;
  }
  obdDevSession.adapterInitializationSummary = buildWebSerialAdapterInitializationSummary({
    status: "completed",
    baudRate: obdDevSession.adapterInitializationSummary?.baudRate,
    attemptedSetupStepCount: initSteps.length,
    completedSetupStepCount: initSteps.length
  });
  appendObdDeveloperLog(responses.join("\n"));
  obdDevStatus.textContent = "VCI初期化を送信しました。次にVCI確認、DTC読取、ライブデータ読取を試せます。";
  renderObdDeveloperGate();
}

async function identifyObdDeveloperVci() {
  const revision = obdSerialRevision;
  if (!continueObdSerialOperation(revision)) return false;
  if (obdDevSession.readInProgress || obdDevSession.pendingCommandOperation || obdSerialDisconnectOperation) return false;
  const commands = ["ATI", "AT@1"];
  const commandResponses = [];
  obdDevSession.readInProgress = true;
  renderObdDeveloperGate();
  try {
    for (const command of commands) {
      const response = await sendElmDeveloperCommand(command, 2500);
      throwIfObdSerialOperationCancelled(revision);
      if (classifyWebSerialCommandResponse(command, response).commandStatus === "completed") {
        commandResponses.push({ command, response });
      }
    }
    const adapterIdentity = mergeWebSerialAdapterIdentity(obdDevSession.adapterIdentity, buildWebSerialAdapterIdentity(commandResponses));
    if (adapterIdentity) obdDevSession.adapterIdentity = adapterIdentity;
    appendObdDeveloperLog(commands.map((command) => `>${command}\n[adapter identity response not retained]`).join("\n"));
  } catch (error) {
    if (!continueObdSerialOperation(revision)) return false;
    if (obdSerialConnectPending) throw error;
    const message = error?.message || String(error);
    if (message === "elm_write_busy" || message.startsWith("elm_transport_write_timeout:")) return false;
    if (message.startsWith("elm_response_timeout:") || message.startsWith("elm_transport_")) {
      await disconnectObdDeveloperVci({ reason: obdDevSession.lastDisconnectReason === "serial_response_too_large"
        ? "serial_response_too_large" : message.startsWith("elm_response_timeout:") ? "response_timeout" : "transport_failed" });
      return false;
    }
    throw error;
  } finally {
    if (continueObdSerialOperation(revision)) {
      obdDevSession.readInProgress = false;
      renderObdDeveloperGate();
    }
  }
}

function mergeWebSerialAdapterIdentity(previous = null, update = null) {
  if (!previous && !update) return null;
  return {
    ...(previous || {}),
    ...(update || {}),
    adapterName: update?.adapterName || previous?.adapterName || null,
    adapterFamily: update?.adapterFamily || previous?.adapterFamily || null,
    firmwareVersion: update?.firmwareVersion || previous?.firmwareVersion || null,
    adapterProtocolHint: update?.adapterProtocolHint || previous?.adapterProtocolHint || null,
    adapter_protocol_hint: update?.adapterProtocolHint || previous?.adapterProtocolHint || null,
    adapterProtocolNumber: update?.adapterProtocolNumber || previous?.adapterProtocolNumber || null,
    adapter_protocol_number: update?.adapterProtocolNumber || previous?.adapterProtocolNumber || null,
    source: "web_serial",
    intent: "adapter_identity",
    ok: true,
    blocked: false,
    wouldTransmit: false,
    vehicleCommandEnabled: false,
    retainedRawText: false
  };
}

async function captureObdDeveloperProtocolAfterStoredDtc() {
  const revision = obdSerialRevision;
  if (!continueObdSerialOperation(revision)) return false;
  if (obdDevSession.pendingCommandOperation || obdSerialDisconnectOperation) return false;
  if (!obdDevSession.writer || !obdDevSession.reader || obdDevSession.readInProgress) return false;
  const commands = ["ATDP", "ATDPN"];
  const commandResponses = [];
  obdDevSession.readInProgress = true;
  setObdDeveloperConnectionState("reading");
  renderObdDeveloperGate();
  try {
    for (const command of commands) {
      const response = await sendElmDeveloperCommand(command, 2500);
      throwIfObdSerialOperationCancelled(revision);
      if (classifyWebSerialCommandResponse(command, response).commandStatus === "completed") {
        commandResponses.push({ command, response });
      }
    }
  } catch (error) {
    if (!continueObdSerialOperation(revision)) return false;
    const message = error?.message || String(error);
    if (message.startsWith("elm_transport_write_timeout:")) return false;
    if (message.startsWith("elm_response_timeout:") || message.startsWith("elm_transport_")) {
      await disconnectObdDeveloperVci({ reason: message.startsWith("elm_response_timeout:") ? "response_timeout" : "transport_failed" });
    }
    return false;
  } finally {
    if (continueObdSerialOperation(revision)) {
      obdDevSession.readInProgress = false;
      if (obdDevSession.port && obdDevSession.connectionState !== "disconnecting") setObdDeveloperConnectionState("ready");
      renderObdDeveloperGate();
    }
  }
  const adapterIdentity = mergeWebSerialAdapterIdentity(obdDevSession.adapterIdentity, buildWebSerialAdapterIdentity(commandResponses));
  if (adapterIdentity) obdDevSession.adapterIdentity = adapterIdentity;
  appendObdDeveloperLog(commands.map((command) => `>${command}\n[adapter identity response not retained]`).join("\n"));
  return commandResponses.length === commands.length;
}

function getWebSerialAdapterProtocolHint(commandResponses = []) {
  const response = commandResponses.find((item) => item?.command === "ATDP")?.response || "";
  return String(response)
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .find((line) => line && line !== ">" && line.toUpperCase() !== "ATDP" && line !== "AUTO" && !/^(?:OK|NO DATA|SEARCHING(?:\.\.\.)?|UNABLE TO CONNECT|STOPPED|ERROR)$/i.test(line))
    ?.slice(0, 80) || null;
}

function getWebSerialAdapterProtocolNumber(commandResponses = []) {
  const response = commandResponses.find((item) => item?.command === "ATDPN")?.response || "";
  return String(response)
    .split(/\r?\n/)
    .map((line) => line.trim().toUpperCase())
    .find((line) => /^(?:A?[0-9A-C])$/.test(line)) || null;
}

function buildWebSerialAdapterIdentity(commandResponses = []) {
  const atiResponse = commandResponses.find((item) => item?.command === "ATI")?.response || "";
  const match = String(atiResponse).match(/\b(ELM327|STN\d{3,4}|OBDLINK(?:\s+[A-Z0-9+.-]+)?)(?:\s+(?:V(?:ERSION)?\s*)?(\d+(?:\.\d+){0,3}))?\b/i);
  const adapterProtocolHint = getWebSerialAdapterProtocolHint(commandResponses);
  const adapterProtocolNumber = getWebSerialAdapterProtocolNumber(commandResponses);
  if (!match && !adapterProtocolHint && !adapterProtocolNumber) return null;

  const adapterName = match ? match[1].replace(/\s+/g, " ").trim().slice(0, 40) : null;
  const adapterFamily = /^STN/i.test(adapterName || "")
    ? "STN compatible"
    : /^OBDLINK/i.test(adapterName || "")
      ? "OBDLink"
      : adapterName ? "ELM327" : null;
  const firmwareVersion = match?.[2] ? `v${match[2]}` : null;
  return {
    source: "web_serial",
    intent: "adapter_identity",
    ok: true,
    blocked: false,
    wouldTransmit: false,
    adapterName,
    adapterFamily,
    firmwareVersion,
    adapterProtocolHint,
    adapter_protocol_hint: adapterProtocolHint,
    adapterProtocolNumber,
    adapter_protocol_number: adapterProtocolNumber,
    vehicleCommandEnabled: false,
    retainedRawText: false
  };
}

function isWebSerialReadoutReported(snapshot, camelStatusKey, snakeStatusKey) {
  return String(snapshot?.[camelStatusKey] || snapshot?.[snakeStatusKey] || "").trim().toLowerCase() === "reported";
}

function hasWebSerialReadinessCoverage(snapshot) {
  const ecuSnapshots = snapshot?.readinessEcuSnapshots || snapshot?.readiness_ecu_snapshots || [];
  return Array.isArray(ecuSnapshots) && ecuSnapshots.length > 0
    ? ecuSnapshots.every((item) => isWebSerialReadoutReported(item, "readinessReadoutStatus", "readiness_readout_status"))
    : isWebSerialReadoutReported(snapshot, "readinessReadoutStatus", "readiness_readout_status");
}

function hasWebSerialOnboardMonitorCoverage(snapshot) {
  const ecuSnapshots = snapshot?.onboardMonitorEcuSnapshots || snapshot?.onboard_monitor_ecu_snapshots || [];
  return Array.isArray(ecuSnapshots) && ecuSnapshots.length > 0
    ? ecuSnapshots.every((item) => isWebSerialReadoutReported(item, "onboardMonitorReadoutStatus", "onboard_monitor_readout_status"))
    : isWebSerialReadoutReported(snapshot, "onboardMonitorReadoutStatus", "onboard_monitor_readout_status");
}

function hasWebSerialLivePidCoverage(snapshot) {
  const ecuSnapshots = snapshot?.livePidEcuSnapshots || snapshot?.live_pid_ecu_snapshots || [];
  return Array.isArray(ecuSnapshots) && ecuSnapshots.length > 0
    ? ecuSnapshots.every((item) => isWebSerialReadoutReported(item, "livePidReadoutStatus", "live_pid_readout_status"))
    : isWebSerialReadoutReported(snapshot, "livePidReadoutStatus", "live_pid_readout_status");
}

function hasWebSerialFreezeFrameCoverage(snapshot) {
  const ecuSnapshots = snapshot?.freezeFrameEcuSnapshots || snapshot?.freeze_frame_ecu_snapshots || [];
  return Array.isArray(ecuSnapshots) && ecuSnapshots.length > 0
    ? ecuSnapshots.every((item) => isWebSerialReadoutReported(item, "freezeFrameReadoutStatus", "freeze_frame_readout_status"))
    : isWebSerialReadoutReported(snapshot, "freezeFrameReadoutStatus", "freeze_frame_readout_status");
}

function hasWebSerialDtcCoverage(statuses = []) {
  const snapshot = obdDevSession.lastSession?.dtcSnapshot;
  if (!isWebSerialReadoutReported(snapshot, "dtcReadoutStatus", "dtc_readout_status")) return false;
  const requiredStatuses = [...new Set((Array.isArray(statuses) ? statuses : [statuses]).filter((status) => ["stored", "pending", "permanent"].includes(status)))];
  const reportedStatuses = snapshot?.dtcStatusSummary?.reportedStatuses || snapshot?.dtc_status_summary?.reported_statuses || [];
  if (!requiredStatuses.every((status) => reportedStatuses.includes(status))) return false;
  const intentByStatus = { stored: "read_stored_dtc", pending: "read_pending_dtc", permanent: "read_permanent_dtc" };
  const requiredIntents = new Set(requiredStatuses.map((status) => intentByStatus[status]));
  const ecuResponses = snapshot?.ecuResponses || snapshot?.ecu_responses || [];
  const scopedResponses = Array.isArray(ecuResponses) ? ecuResponses.filter((row) => requiredIntents.has(row?.intent)) : [];
  return !scopedResponses.length || scopedResponses.every((row) => String(row?.status || "").trim().toLowerCase() === "reported");
}

function hasWebSerialDtcStatusReport(status) {
  return hasWebSerialDtcCoverage([status]);
}

function hasWebSerialSupportedPidPage(snapshot, basePid) {
  if (!isWebSerialReadoutReported(snapshot, "supportedPidReadoutStatus", "supported_pid_readout_status")) return false;
  const pageSummary = snapshot?.supportedPidPageSummary || snapshot?.supported_pid_page_summary || null;
  const pageBases = snapshot?.supportedPidPageBases
    || snapshot?.supported_pid_page_bases
    || pageSummary?.pageBases
    || pageSummary?.page_bases
    || [];
  const normalizedBasePid = String(basePid || "").trim().toUpperCase().padStart(2, "0");
  const hasRequestedPage = /^[0-9A-F]{2}$/.test(normalizedBasePid)
    && Array.isArray(pageBases)
    && pageBases.some((page) => String(page || "").trim().toUpperCase().padStart(2, "0") === normalizedBasePid);
  if (!hasRequestedPage) return false;
  const ecuSnapshots = snapshot?.supportedPidEcuSnapshots || snapshot?.supported_pid_ecu_snapshots || [];
  if (!Array.isArray(ecuSnapshots) || !ecuSnapshots.length) return true;
  const readEcu = (row) => String(row?.sourceEcu || row?.source_ecu || "").trim().toUpperCase();
  const expectedEcus = new Set((normalizedBasePid === "00"
    ? ecuSnapshots
    : ecuSnapshots.filter((row) => (row?.supportedPids || row?.supported_pids || []).some((pid) => String(pid || "").trim().toUpperCase().padStart(2, "0") === normalizedBasePid)))
    .map(readEcu)
    .filter(Boolean));
  if (!expectedEcus.size) return true;
  const reportedEcus = new Set(ecuSnapshots
    .filter((row) => isWebSerialReadoutReported(row, "supportedPidReadoutStatus", "supported_pid_readout_status"))
    .filter((row) => (row?.supportedPidPageBases || row?.supported_pid_page_bases || []).some((page) => String(page || "").trim().toUpperCase().padStart(2, "0") === normalizedBasePid))
    .map(readEcu)
    .filter(Boolean));
  return [...expectedEcus].every((ecu) => reportedEcus.has(ecu));
}

function decodeWebSerialMode09SupportedInfoTypes(value) {
  const bytes = String(value || "").toUpperCase().match(/[0-9A-F]{2}/g)?.slice(0, 4) || [];
  if (bytes.length !== 4) return new Set();
  const supported = new Set();
  bytes.forEach((byte, byteIndex) => {
    const numericByte = Number.parseInt(byte, 16);
    for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) {
      if ((numericByte & (1 << (7 - bitIndex))) !== 0) {
        supported.add((byteIndex * 8 + bitIndex + 1).toString(16).toUpperCase().padStart(2, "0"));
      }
    }
  });
  return supported;
}

function hasWebSerialEcuInfoTypeCoverage(snapshot, commands = []) {
  if (!isWebSerialReadoutReported(snapshot, "ecuInfoReadoutStatus", "ecu_info_readout_status")) return false;
  const requestedInfoTypes = [...new Set((Array.isArray(commands) ? commands : [])
    .map((command) => String(command || "").trim().toUpperCase())
    .filter((command) => /^09[0-9A-F]{2}$/.test(command) && command !== "0900")
    .map((command) => command.slice(2)))];
  if (!requestedInfoTypes.length) return true;
  const items = Array.isArray(snapshot?.items) ? snapshot.items : Array.isArray(snapshot?.values) ? snapshot.values : [];
  const supportItems = items.filter((item) => String(item?.id || item?.itemId || item?.item_id || "").trim().toLowerCase() === "supported_info_types_00");
  const normalizeScope = (item) => String(item?.sourceEcu || item?.source_ecu || snapshot?.sourceEcu || snapshot?.source_ecu || "").trim().toUpperCase();
  return requestedInfoTypes.every((infoType) => {
    const expectedScopes = new Set(supportItems
      .filter((item) => decodeWebSerialMode09SupportedInfoTypes(item?.value).has(infoType))
      .map(normalizeScope)
      .filter(Boolean));
    const reportedItems = items.filter((item) => {
      const itemInfoType = String(item?.infoType || item?.info_type || "").trim().toUpperCase();
      const value = item?.value ?? item?.displayValue ?? item?.display_value ?? null;
      return itemInfoType === infoType && String(value ?? "").trim() !== "";
    });
    if (!reportedItems.length) return false;
    if (!expectedScopes.size) return true;
    const reportedScopes = new Set(reportedItems.map(normalizeScope).filter(Boolean));
    return [...expectedScopes].every((scope) => reportedScopes.has(scope));
  });
}

async function readObdDeveloperDtc() {
  const revision = obdSerialRevision;
  const storedReadCompleted = await runObdDeveloperRead("保存DTC読取", ["03"]);
  if (!continueObdSerialOperation(revision) || !obdDevSession.port) return false;
  if (!storedReadCompleted || !hasWebSerialDtcStatusReport("stored")) return false;
  await captureObdDeveloperProtocolAfterStoredDtc();
  if (!continueObdSerialOperation(revision) || !obdDevSession.port) return false;
  await runObdDeveloperRead("保留・永久DTC読取", ["07", "0A"]);
  if (!continueObdSerialOperation(revision)) return false;
  return hasWebSerialDtcCoverage(["stored", "pending", "permanent"]);
}

async function readObdDeveloperCoreScan() {
  const revision = obdSerialRevision;
  if (!beginWebSerialReadoutProfile("initial_diagnostic")) return;
  obdDevSession.coreScanInProgress = true;
  obdDevSession.coreScanStopReason = null;
  renderObdDeveloperGate();
  const readSteps = [
    { label: "DTC", read: readObdDeveloperDtc },
    { label: "FF", read: readObdDeveloperFreezeFrame },
    { label: "レディネス", read: readObdDeveloperReadiness },
    { label: "ECU情報", read: readObdDeveloperEcuInfo },
    { label: "Mode06", read: readObdDeveloperOnboardMonitor },
    { label: "ライブデータ", read: readObdDeveloperLiveSnapshot }
  ];
  const incompleteLabels = [];
  try {
    for (const readStep of readSteps) {
      if (!obdDevSession.port) break;
      const readCompleted = await readStep.read();
      if (!continueObdSerialOperation(revision)) return;
      if (obdDevSession.port && readCompleted !== true) incompleteLabels.push(readStep.label);
      if (obdDevSession.coreScanStopReason) break;
    }
    if (!obdDevSession.port) {
      obdDevStatus.textContent = "基本読取を切断により停止しました。";
    } else if (obdDevSession.coreScanStopReason) {
      obdDevStatus.textContent = `基本読取を停止しました: ${formatWebSerialStopReason(obdDevSession.coreScanStopReason)}。接続状態を確認してから再試行してください。`;
    } else if (incompleteLabels.length) {
      obdDevStatus.textContent = `基本読取完了: 未完了 ${incompleteLabels.join(" / ")}`;
    } else {
      obdDevStatus.textContent = "基本読取を完了しました。";
    }
  } finally {
    if (continueObdSerialOperation(revision)) {
      obdDevSession.coreScanInProgress = false;
      obdDevSession.coreScanStopReason = null;
      renderObdDeveloperGate();
    }
  }
}

function beginWebSerialReadoutProfile(readoutProfile) {
  if (!["initial_diagnostic", "quick_condition"].includes(readoutProfile)) return false;
  if (!continueObdSerialOperation(obdSerialRevision)) return false;
  if (obdDevSession.connectionState !== "ready" || !obdDevSession.port || !obdDevSession.reader
    || !obdDevSession.writer || obdDevSession.readLoopActive !== true) return false;
  if (obdBridgeOperation || obdSerialConnectPending || obdSerialDisconnectOperation
    || obdDevSession.initializing || obdDevSession.readInProgress || obdDevSession.coreScanInProgress
    || obdDevSession.pendingCommandOperation || obdDevSession.pendingWriteOperation) return false;
  invalidateObdScannerImport();
  const vehicleProfile = buildSelectedObdVehicleProfile();
  obdDevSession.scanSessionId = `web-serial-${Date.now().toString(36)}`;
  obdDevSession.vehicleProfile = vehicleProfile;
  obdDevSession.vehicleApplicability = buildSelectedObdVehicleApplicability(vehicleProfile);
  obdDevSession.observationContext = buildSelectedObdObservationContext();
  obdDevSession.lastRawText = "";
  obdDevSession.supportedPidDiscoveryComplete = false;
  obdDevSession.supportedPidSet = [];
  obdDevSession.supportedPidReadoutResponses = [];
  obdDevSession.readoutAttempts = [];
  obdDevSession.livePidTimeline = [];
  obdDevSession.freezeFrameReadoutResponses = [];
  obdDevSession.freezeFrameCapabilityResponse = null;
  obdDevSession.ecuInfoReadoutResponses = [];
  obdDevSession.lastSession = null;
  handleObdReadoutSessionReplacement();
  obdDevSession.readoutProfile = readoutProfile;
  obdScannerText.value = "";
  obdDetectedCodes.innerHTML = "";
  renderObdMonitorValues([], []);
  hideResult();
  renderObdDeveloperSessionSummary(null);
  if (obdSerialResultOwner?.revision === obdSerialRevision) obdSerialResultOwner.expectedLastSession = obdDevSession.lastSession;
  return true;
}

async function readObdDeveloperQuickCondition() {
  const revision = obdSerialRevision;
  if (!beginWebSerialReadoutProfile("quick_condition")) return;
  obdDevSession.coreScanInProgress = true;
  obdDevSession.coreScanStopReason = null;
  renderObdDeveloperGate();
  const readSteps = [
    { label: "DTC", read: readObdDeveloperDtc },
    { label: "レディネス", read: readObdDeveloperReadiness },
    { label: "クイックライブ値", read: readObdDeveloperQuickLiveSnapshot }
  ];
  const incompleteLabels = [];
  try {
    for (const readStep of readSteps) {
      if (!obdDevSession.port) break;
      const readCompleted = await readStep.read();
      if (!continueObdSerialOperation(revision)) return;
      if (obdDevSession.port && readCompleted !== true) incompleteLabels.push(readStep.label);
      if (obdDevSession.coreScanStopReason) break;
    }
    if (!obdDevSession.port) {
      obdDevStatus.textContent = "クイック状態確認を切断により停止しました。";
    } else if (obdDevSession.coreScanStopReason) {
      obdDevStatus.textContent = `クイック状態確認を停止しました: ${formatWebSerialStopReason(obdDevSession.coreScanStopReason)}。接続状態を確認してから再試行してください。`;
    } else if (incompleteLabels.length) {
      obdDevStatus.textContent = `クイック状態確認完了: 未完了 ${incompleteLabels.join(" / ")}`;
    } else {
      obdDevStatus.textContent = "クイック状態確認を完了しました。追加診断には基本読取を実行してください。";
    }
  } finally {
    if (continueObdSerialOperation(revision)) {
      obdDevSession.coreScanInProgress = false;
      obdDevSession.coreScanStopReason = null;
      renderObdDeveloperGate();
    }
  }
}

async function readObdDeveloperFreezeFrame() {
  const revision = obdSerialRevision;
  const readCompleted = await runObdDeveloperRead("フリーズフレーム起点DTC読取", ["0202"]);
  if (!continueObdSerialOperation(revision) || !obdDevSession.port) return false;
  const freezeFrameSnapshot = obdDevSession.lastSession?.freezeFrameSnapshot;
  if (!readCompleted || !hasWebSerialFreezeFrameCoverage(freezeFrameSnapshot)) return false;
  if (!hasWebSerialFreezeFrameTriggerDtc(freezeFrameSnapshot)) {
    obdDevStatus.textContent = "フリーズフレーム起点DTCがないため、追加PID要求を送りませんでした。";
    renderObdDeveloperGate();
    return true;
  }
  const capabilityReadCompleted = await runObdDeveloperRead("フリーズフレーム対応PID読取", ["0200"]);
  if (!continueObdSerialOperation(revision) || !obdDevSession.port) return false;
  if (!capabilityReadCompleted || !hasWebSerialFreezeFrameCapabilityReport(obdDevSession.freezeFrameCapabilityResponse, freezeFrameSnapshot)) return false;
  const supportedPids = getWebSerialFreezeFrameSupportedPidsForTriggerScopes(obdDevSession.freezeFrameCapabilityResponse, freezeFrameSnapshot);
  if (!supportedPids.has("02")) {
    obdDevStatus.textContent = "Mode 02の対応PIDからフリーズフレーム起点DTCを確認できないため、値の追加要求を送りませんでした。";
    renderObdDeveloperGate();
    return true;
  }
  const supportedCommands = obdDevSession.freezeFramePidList.filter((command) => supportedPids.has(command.slice(2)));
  if (!supportedCommands.length) {
    obdDevStatus.textContent = "Mode 02の対応PIDからフリーズフレーム値を確認できないため、追加要求を送りませんでした。";
    renderObdDeveloperGate();
    return true;
  }
  const valuesReadCompleted = await runObdDeveloperRead("フリーズフレーム値読取", supportedCommands);
  if (!continueObdSerialOperation(revision)) return false;
  return valuesReadCompleted && hasWebSerialFreezeFrameCoverage(obdDevSession.lastSession?.freezeFrameSnapshot);
}

async function readObdDeveloperReadiness() {
  const revision = obdSerialRevision;
  const readCompleted = await runObdDeveloperRead("レディネス読取", ["0101"]);
  if (!continueObdSerialOperation(revision)) return false;
  return readCompleted && hasWebSerialReadinessCoverage(obdDevSession.lastSession?.readinessSnapshot);
}

async function readObdDeveloperEcuInfo() {
  const revision = obdSerialRevision;
  const supportReadCompleted = await runObdDeveloperRead("ECU情報対応確認", ["0900"]);
  if (!continueObdSerialOperation(revision) || !obdDevSession.port) return false;
  const ecuInfoSnapshot = obdDevSession.lastSession?.ecuInfoSnapshot;
  if (!supportReadCompleted || !isWebSerialReadoutReported(ecuInfoSnapshot, "ecuInfoReadoutStatus", "ecu_info_readout_status")) return false;
  const supportedInfoTypes = new Set(ecuInfoSnapshot?.supportInfoTypesSummary?.ids || []);
  const supportedCommands = [
    ["04", "0904"],
    ["06", "0906"],
    ["08", "0908"],
    ["0A", "090A"],
    ["0B", "090B"]
  ]
    .filter(([infoType]) => supportedInfoTypes.has(infoType))
    .map(([, command]) => command);
  if (!supportedCommands.length) {
    obdDevStatus.textContent = "対応する非識別ECU情報が確認できないため、追加要求を送りませんでした。";
    renderObdDeveloperGate();
    return true;
  }
  const readCompleted = await runObdDeveloperRead("ECU情報読取", supportedCommands);
  if (!continueObdSerialOperation(revision)) return false;
  const completedSnapshot = obdDevSession.lastSession?.ecuInfoSnapshot;
  return readCompleted && hasWebSerialEcuInfoTypeCoverage(completedSnapshot, supportedCommands);
}

async function readObdDeveloperOnboardMonitor() {
  const revision = obdSerialRevision;
  const readCompleted = await runObdDeveloperRead("Mode06読取", ["06"]);
  if (!continueObdSerialOperation(revision)) return false;
  return readCompleted && hasWebSerialOnboardMonitorCoverage(obdDevSession.lastSession?.onboardMonitorSnapshot);
}

async function readObdDeveloperPermanentDtc() {
  const revision = obdSerialRevision;
  const readCompleted = await runObdDeveloperRead("永久DTC読取", ["0A"]);
  if (!continueObdSerialOperation(revision)) return false;
  return readCompleted && hasWebSerialDtcStatusReport("permanent");
}

async function readObdDeveloperLiveSnapshot() {
  const revision = obdSerialRevision;
  const supportReadCompleted = await readObdDeveloperSupportedPidMaps();
  if (!continueObdSerialOperation(revision) || !obdDevSession.port) return false;
  if (!supportReadCompleted) return false;
  const supportedPids = new Set(obdDevSession.supportedPidSet);
  const supportedCommands = obdDevSession.selectedPidList.filter((command) => supportedPids.has(command.slice(2)));
  if (!supportedCommands.length) {
    obdDevStatus.textContent = "対応PIDが確認できないため、ライブデータ要求を送りませんでした。";
    renderObdDeveloperGate();
    return true;
  }
  const readCompleted = await runObdDeveloperRead("ライブデータ読取", supportedCommands);
  if (!continueObdSerialOperation(revision)) return false;
  return readCompleted && hasWebSerialLivePidCoverage(obdDevSession.lastSession?.livePidSnapshot);
}

async function readObdDeveloperQuickLiveSnapshot() {
  const revision = obdSerialRevision;
  const supportReadCompleted = await readObdDeveloperSupportedPidMaps();
  if (!continueObdSerialOperation(revision) || !obdDevSession.port) return false;
  if (!supportReadCompleted) return false;
  const supportedPids = new Set(obdDevSession.supportedPidSet);
  const supportedCommands = WEB_SERIAL_QUICK_LIVE_PID_COMMANDS.filter((command) => supportedPids.has(command.slice(2)));
  if (!supportedCommands.length) {
    obdDevStatus.textContent = "クイック表示用の対応PIDが確認できないため、ライブデータ要求を送りませんでした。";
    renderObdDeveloperGate();
    return true;
  }
  const readCompleted = await runObdDeveloperRead("クイックライブ値読取", supportedCommands);
  if (!continueObdSerialOperation(revision)) return false;
  return readCompleted && hasWebSerialLivePidCoverage(obdDevSession.lastSession?.livePidSnapshot);
}

async function readObdDeveloperSupportedPidMaps() {
  const revision = obdSerialRevision;
  if (!continueObdSerialOperation(revision)) return false;
  if (obdDevSession.supportedPidDiscoveryComplete) return true;
  const baseReadCompleted = await runObdDeveloperRead("対応PID確認", ["0100"]);
  if (!continueObdSerialOperation(revision) || !obdDevSession.port) return false;
  if (!baseReadCompleted || !hasWebSerialSupportedPidPage(obdDevSession.lastSession?.supportedPidMatrix, "00")) return false;
  for (const basePid of ["20", "40", "60", "80", "A0", "C0", "E0"]) {
    const supportedPids = new Set(obdDevSession.lastSession?.supportedPidMatrix?.supportedPids || []);
    if (!supportedPids.has(basePid)) break;
    const pageReadCompleted = await runObdDeveloperRead("対応PID確認", [`01${basePid}`]);
    if (!continueObdSerialOperation(revision) || !obdDevSession.port) return false;
    if (!pageReadCompleted || !hasWebSerialSupportedPidPage(obdDevSession.lastSession?.supportedPidMatrix, basePid)) return false;
  }
  const supportedPidMatrix = obdDevSession.lastSession?.supportedPidMatrix || null;
  obdDevSession.supportedPidSet = supportedPidMatrix?.supportedPidReadoutStatus === "reported"
    ? [...new Set(supportedPidMatrix.supportedPids || [])]
    : [];
  obdDevSession.supportedPidDiscoveryComplete = supportedPidMatrix?.supportedPidReadoutStatus === "reported";
  return obdDevSession.supportedPidDiscoveryComplete;
}

async function probeObdLocalBridge(contextLabel = "ローカルブリッジ") {
  const operation = beginObdBridgeOperation();
  if (!operation) return;
  let resultMessage = "";
  try {
    obdDevStatus.textContent = `${contextLabel}を確認しています。`;
    const response = await sendObdLocalBridgeStatusIntent("bridge_status", {}, { discover: true, operation });
    throwIfObdBridgeOperationCancelled(operation);
    if (!response.ok) throw new Error(response.errors.join(" / ") || "bridge_response_not_ok");
    const status = window.ObdReadOnly.normalizeBridgeConnectionStatus(response);
    let adapterIdentity = null;
    try {
      const adapterResponse = await sendObdLocalBridgeStatusIntent("adapter_identity", {}, { operation });
      throwIfObdBridgeOperationCancelled(operation);
      if (!adapterResponse.ok) throw new Error(adapterResponse.errors.join(" / ") || "bridge_response_not_ok");
      adapterIdentity = window.ObdReadOnly.normalizeBridgeAdapterIdentity(adapterResponse);
    } catch (adapterError) {
      throwIfObdBridgeOperationCancelled(operation);
      appendObdDeveloperLog(`adapter_identity\n${adapterError?.message || adapterError}`);
    }
    throwIfObdBridgeOperationCancelled(operation);
    if (operation.endpoint) obdDevSession.bridgeEndpoint = operation.endpoint;
    obdDevSession.bridgeStatus = status;
    obdDevSession.adapterIdentity = adapterIdentity;
    const adapterLabel = obdDevSession.adapterIdentity?.adapterName || obdDevSession.adapterIdentity?.adapterFamily || "識別未取得";
    resultMessage = `${contextLabel}: ${status.displayStatus} / ${adapterLabel}`;
    renderObdDeveloperSessionSummary(null);
  } catch (error) {
    resultMessage = `${contextLabel}を確認できません: ${formatObdLocalBridgeFailure(error)}`;
  } finally {
    finishObdBridgeOperation(operation, resultMessage);
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

async function readObdLocalBridgeReadiness() {
  await runObdLocalBridgeRead("ブリッジレディネス読取", "read_readiness", { readout_id: "readiness_snapshot", pid: "01" }, (response) => {
    renderObdBridgeReadout({ readinessResponse: response });
  });
}

async function readObdLocalBridgeLiveSnapshot() {
  await runObdLocalBridgeRead("ブリッジライブ読取", "read_live_pid_snapshot", {}, (response) => {
    renderObdBridgeReadout({ livePidResponse: response });
  });
}

async function runObdLocalBridgeRead(label, intent, payload, onSuccess) {
  if (!obdDevModeUnlocked) return;
  const operation = beginObdBridgeOperation();
  if (!operation) return;
  let resultMessage = "";
  try {
    obdDevStatus.textContent = `${label}中です。`;
    const response = await sendObdLocalBridgeIntent(intent, payload, { operation });
    throwIfObdBridgeOperationCancelled(operation);
    if (operation.endpoint) obdDevSession.bridgeEndpoint = operation.endpoint;
    if (response.blocked === true || response.ok === false) {
      throw new Error((response.errors || []).join(" / ") || "bridge_response_not_ok");
    }
    onSuccess(response);
    resultMessage = `${label}が完了しました。`;
  } catch (error) {
    resultMessage = `${label}に失敗しました: ${formatObdLocalBridgeFailure(error)}`;
  } finally {
    finishObdBridgeOperation(operation, resultMessage);
  }
}

function isObdBridgeOperationBlocked() {
  return Boolean(obdBridgeOperation || obdSerialConnectPending || obdSerialDisconnectOperation || obdDevSession.port || obdDevSession.readInProgress || obdDevSession.initializing || obdDevSession.coreScanInProgress)
    || Boolean(obdDevSession.connectionState && obdDevSession.connectionState !== "disconnected");
}

function beginObdBridgeOperation() {
  if (isObdBridgeOperationBlocked()) return null;
  obdSerialRevision += 1;
  const operation = { cancelled: false, controller: typeof AbortController === "function" ? new AbortController() : null };
  obdBridgeOperation = operation;
  renderObdDeveloperGate();
  return operation;
}

function cancelObdBridgeOperation() {
  if (!obdBridgeOperation) return;
  obdBridgeOperation.cancelled = true;
  obdBridgeOperation.controller?.abort();
}

function throwIfObdBridgeOperationCancelled(operation) {
  if (operation && (operation.cancelled || obdBridgeOperation !== operation)) throw new Error("local_bridge_cancelled");
}

function finishObdBridgeOperation(operation, resultMessage) {
  if (obdBridgeOperation !== operation) return;
  obdBridgeOperation = null;
  renderObdDeveloperGate();
  if (!operation.cancelled && obdDevModeUnlocked && resultMessage) obdDevStatus.textContent = resultMessage;
}

function formatObdLocalBridgeFailure(error) {
  const codes = String(error?.message || error || "").split(" / ");
  if (codes.includes("bridge_response_invalid")) return "ブリッジの応答形式または要求IDが一致しません。結果は採用していません。PC側と画面の版を確認してください。";
  if (codes.includes("pairing_token_mismatch")) return "ブリッジ接続キーが一致しません。起動時のペアリング値を「ブリッジ接続キー（今回のみ）」へ入力し直してください。";
  if (codes.includes("bridge_pairing_token_not_configured")) return "ブリッジ側の接続キーが未設定です。ブリッジの起動設定を確認してください。";
  if (codes.includes("vci_not_detected")) return "VCI未検出です。PCのドライバー登録と機器の接続を確認してください。車両データは未取得です。";
  if (codes.includes("vci_not_connected")) return "ドライバーは検出済みですが、VCIは未接続です。ドライバーの登録だけでは車両を読み取れません。";
  if (codes.includes("local_bridge_timeout")) return "ブリッジの応答が時間切れになりました。PC側のブリッジが動作しているか確認してください。";
  if (codes.includes("sample_mode_no_vehicle_readout")) return "サンプルモードのため車両データは取得できません。実車読取の結果ではありません。";
  if (codes.includes("write_intent_blocked")) return "車両状態を変更する要求は無効です。実行していません。";
  if (codes.includes("詳細トークンが未設定です。")) return "詳細トークンまたは今回のブリッジ接続キーが未設定です。";
  return "ブリッジの応答を確認できません。PC側の起動状態・接続先・対応機能を確認してください。";
}

async function fetchObdLocalBridgeEndpoint(endpoint, request, operation = null) {
  throwIfObdBridgeOperationCancelled(operation);
  const deadline = performance.now() + OBD_LOCAL_BRIDGE_TIMEOUT_MS;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const checkResponseDeadline = () => {
    throwIfObdBridgeOperationCancelled(operation);
    if (controller?.signal.aborted || performance.now() >= deadline) {
      controller?.abort();
      throw new Error("local_bridge_timeout");
    }
  };
  const cancelWait = () => controller?.abort();
  operation?.controller?.signal.addEventListener("abort", cancelWait, { once: true });
  const timeoutId = controller ? setTimeout(() => controller.abort(), OBD_LOCAL_BRIDGE_TIMEOUT_MS) : null;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      cache: "no-store",
      ...(controller ? { signal: controller.signal } : {})
    });
    checkResponseDeadline();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    checkResponseDeadline();
    validateObdLocalBridgeResponse(json, request);
    return json;
  } catch (error) {
    checkResponseDeadline();
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    operation?.controller?.signal.removeEventListener("abort", cancelWait);
  }
}

function validateObdLocalBridgeResponse(response, request) {
  const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  if (!isObject(response)
    || typeof request.request_id !== "string" || !request.request_id
    || response.request_id !== request.request_id
    || typeof response.ok !== "boolean" || typeof response.blocked !== "boolean"
    || response.would_transmit !== false
    || !Array.isArray(response.errors) || !response.errors.every((error) => typeof error === "string")
    || !(response.data === null || isObject(response.data))
    || (response.ok && (response.blocked || response.errors.length || !isObject(response.data)))) {
    throw new Error("bridge_response_invalid");
  }
}

function renderObdBridgePairingControls() {
  obdBridgePairingControls.hidden = !obdDevModeUnlocked;
  obdBridgePairingInput.disabled = !obdDevModeUnlocked || Boolean(obdBridgeOperation);
  obdBridgePairingApplyButton.disabled = !obdDevModeUnlocked || Boolean(obdBridgeOperation);
  obdBridgePairingClearButton.disabled = !obdDevModeUnlocked || !obdBridgePairingToken;
  obdBridgePairingStatus.textContent = obdBridgePairingToken ? "今回の接続キーを使用中（端末には保存しません）" : "詳細トークンと共通";
}

function applyObdBridgePairingToken() {
  if (!obdDevModeUnlocked || obdBridgeOperation) return;
  const token = obdBridgePairingInput.value;
  if (token.length < 12) {
    obdBridgePairingStatus.textContent = "ブリッジ接続キーは12文字以上必要です。";
    return;
  }
  obdBridgePairingToken = token;
  obdBridgePairingInput.value = "";
  renderObdBridgePairingControls();
}

function clearObdBridgePairingToken() {
  cancelObdBridgeOperation();
  obdBridgePairingToken = "";
  obdBridgePairingInput.value = "";
  renderObdBridgePairingControls();
}

function getObdLocalBridgeEndpoints(options = {}) {
  const endpoint = options.operation?.endpoint || obdDevSession.bridgeEndpoint;
  if (!options.discover && endpoint) return [endpoint];
  const endpoints = OBD_LOCAL_BRIDGE_PORTS.flatMap((port) => OBD_LOCAL_BRIDGE_PATHS.map((path) => `http://127.0.0.1:${port}${path}`));
  if (location.protocol === "http:" && location.hostname === "127.0.0.1") {
    endpoints.unshift(`${location.origin}/local-bridge/v1/request`);
  }
  return endpoints;
}

async function sendObdLocalBridgeIntent(intent, payload = {}, options = {}) {
  if (!isAllowedLocalBridgeIntent(intent)) throw new Error(`許可していないIntentです: ${intent}`);
  const pairingToken = obdBridgePairingToken || localStorage.getItem(OBD_DEV_TOKEN_KEY) || "";
  if (pairingToken.length < 12) throw new Error("詳細トークンが未設定です。");
  const request = {
    request_id: createId(),
    api_version: "v1",
    intent,
    timestamp: new Date().toISOString(),
    pairing_token: pairingToken,
    data: payload
  };

  const endpoints = getObdLocalBridgeEndpoints(options);

  let lastError = null;
  for (const endpoint of endpoints) {
    throwIfObdBridgeOperationCancelled(options.operation);
    try {
      const json = await fetchObdLocalBridgeEndpoint(endpoint, request, options.operation);
      throwIfObdBridgeOperationCancelled(options.operation);
      if (options.operation) options.operation.endpoint = endpoint;
      else obdDevSession.bridgeEndpoint = endpoint;
      return json;
    } catch (error) {
      throwIfObdBridgeOperationCancelled(options.operation);
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
    "read_readiness",
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
    request_id: createId(),
    api_version: "v1",
    intent,
    timestamp: new Date().toISOString(),
    data: payload
  };
  const endpoints = getObdLocalBridgeEndpoints(options);

  let lastError = null;
  for (const endpoint of endpoints) {
    throwIfObdBridgeOperationCancelled(options.operation);
    try {
      const json = await fetchObdLocalBridgeEndpoint(endpoint, request, options.operation);
      throwIfObdBridgeOperationCancelled(options.operation);
      if (options.operation) options.operation.endpoint = endpoint;
      else obdDevSession.bridgeEndpoint = endpoint;
      return json;
    } catch (error) {
      throwIfObdBridgeOperationCancelled(options.operation);
      lastError = error;
    }
  }
  throw lastError || new Error("local_bridge_not_found");
}

const WEB_SERIAL_ADAPTER_ERROR_LINES = new Set(["ERROR", "?", "STOPPED", "BUFFER FULL", "DATA ERROR", "FB ERROR"]);
const WEB_SERIAL_VEHICLE_LINK_ERROR_LINES = new Set(["UNABLE TO CONNECT", "BUS ERROR", "CAN ERROR", "BUS INIT: ERROR", "LV RESET"]);
const WEB_SERIAL_IGNORED_RESPONSE_LINES = new Set(["SEARCHING...", "BUS INIT: OK"]);

function hasWebSerialResponseError(lines, errorLines) {
  return lines.some((line) => [...errorLines].some((errorLine) => line === errorLine || line.startsWith(`${errorLine} `) || line.startsWith(`${errorLine}:`)));
}

function isWebSerialBusInitErrorLine(line) {
  return /^BUS INIT:\s*\.{0,3}ERROR$/.test(String(line || "").trim().toUpperCase());
}

function isWebSerialInformationalResponseLine(line) {
  const normalizedLine = String(line || "").trim().toUpperCase().replace(/\s+/g, " ");
  return WEB_SERIAL_IGNORED_RESPONSE_LINES.has(normalizedLine) || /^BUS INIT:\s*\.{0,3}OK$/.test(normalizedLine) || /^BUS INIT:\s*\.{3}$/.test(normalizedLine);
}

function getWebSerialResponseLines(command, response) {
  const normalizedCommand = String(command || "").trim().toUpperCase().replace(/\s+/g, "");
  return String(response || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim().toUpperCase().replace(/\s+/g, " "))
    .filter(Boolean)
    .filter((line) => line.replace(/\s+/g, "") !== normalizedCommand);
}

function formatWebSerialStopReason(reason) {
  if (reason === "vehicle_link_error") return "車両通信を確立できません";
  if (reason === "adapter_error") return "アダプター応答エラー";
  if (reason === "transport_error") return "シリアル通信エラー";
  return "読取応答を確認できません";
}

function classifyWebSerialCommandResponse(command, response) {
  const normalizedCommand = String(command || "").trim().toUpperCase();
  const lines = getWebSerialResponseLines(normalizedCommand, response)
    .filter((line) => !isWebSerialInformationalResponseLine(line));
  const requestedService = /^[0-9A-F]{2}/.test(normalizedCommand) ? normalizedCommand.slice(0, 2) : null;
  const compactResponseLines = lines.map((line) => line.replace(/[^0-9A-F]/g, "")).filter(Boolean);
  const expectedPositiveService = requestedService ? (Number.parseInt(requestedService, 16) + 0x40).toString(16).padStart(2, "0").toUpperCase() : null;
  const responseServiceStarts = [0, 2, 4, 3, 5, 7, 8, 10, 12];
  const parseResponseService = (line) => {
    for (const start of responseServiceStarts) {
      const service = line.slice(start, start + 2);
      if (service === expectedPositiveService) return { type: "positive" };
      if (service === "7F" && line.slice(start + 2, start + 4) === requestedService) return { type: "negative", nrc: line.slice(start + 4, start + 6) };
    }
    return null;
  };
  const responseServices = compactResponseLines.map(parseResponseService).filter(Boolean);
  const negativeResponses = responseServices.filter((item) => item.type === "negative");
  const pendingNegativeResponseCount = negativeResponses.filter((item) => item.nrc === "78").length;
  const negativeResponseCount = Math.max(0, negativeResponses.length - pendingNegativeResponseCount);
  const positiveResponse = normalizedCommand.startsWith("AT")
    ? lines.some((line) => line !== normalizedCommand)
    : responseServices.some((item) => item.type === "positive");
  if (!lines.length) return { commandStatus: "incomplete", emptyResponseCount: 1, stopScope: "none", stopReason: null };
  if (hasWebSerialResponseError(lines, WEB_SERIAL_VEHICLE_LINK_ERROR_LINES) || lines.some(isWebSerialBusInitErrorLine)) {
    return { commandStatus: "failed", unableToConnectCount: 1, stopScope: "scan", stopReason: "vehicle_link_error" };
  }
  if (hasWebSerialResponseError(lines, WEB_SERIAL_ADAPTER_ERROR_LINES)) {
    return { commandStatus: "failed", adapterErrorCount: 1, stopScope: "attempt", stopReason: "adapter_error" };
  }
  if (lines.some((line) => line === "NO DATA")) {
    return { commandStatus: "incomplete", noDataCount: 1, stopScope: "none", stopReason: null };
  }
  if (positiveResponse && negativeResponseCount) {
    return { commandStatus: "partial", positiveResponseCount: 1, negativeResponseCount, pendingNegativeResponseCount, stopScope: "none", stopReason: null };
  }
  if (positiveResponse) return { commandStatus: "completed", positiveResponseCount: 1, negativeResponseCount, pendingNegativeResponseCount, stopScope: "none", stopReason: null };
  if (negativeResponseCount || pendingNegativeResponseCount) {
    return { commandStatus: "incomplete", negativeResponseCount, pendingNegativeResponseCount, stopScope: "none", stopReason: null };
  }
  return { commandStatus: "incomplete", unrecognizedResponseCount: 1, stopScope: "none", stopReason: null };
}

function isWebSerialExpectedEmptyResponse(command, response) {
  const normalizedCommand = String(command || "").trim().toUpperCase();
  if (!["03", "07", "0A", "0202", "06", "0900"].includes(normalizedCommand)) return false;
  const lines = getWebSerialResponseLines(normalizedCommand, response);
  const hasBusInit = lines.some((line) => line.startsWith("BUS INIT:"));
  return lines.includes("NO DATA") && lines.every((line) => line === "NO DATA" || line.startsWith("SEARCHING") || isWebSerialInformationalResponseLine(line) || (hasBusInit && line === "OK"));
}

function buildWebSerialDtcResponseOverrides(commandResponses = [], attemptedCommands = []) {
  const dtcCommandMetadata = {
    "03": { key: "storedDtcResponse", status: "stored", intent: "read_stored_dtc" },
    "07": { key: "pendingDtcResponse", status: "pending", intent: "read_pending_dtc" },
    "0A": { key: "permanentDtcResponse", status: "permanent", intent: "read_permanent_dtc" }
  };
  const attemptedOverrides = (Array.isArray(attemptedCommands) ? attemptedCommands : []).reduce((overrides, value) => {
    const command = String(value || "").trim().toUpperCase();
    const metadata = dtcCommandMetadata[command];
    if (!metadata) return overrides;
    return {
      ...overrides,
      [metadata.key]: {
        source: "web_serial",
        intent: metadata.intent,
        dtcs: [],
        reportedStatuses: [],
        dtcReadoutStatus: "unknown",
        retainedRawText: false,
        wouldTransmit: false,
        vehicleCommandEnabled: false
      }
    };
  }, {});
  return (Array.isArray(commandResponses) ? commandResponses : []).reduce((overrides, item) => {
    const command = String(item?.command || "").trim().toUpperCase();
    const metadata = dtcCommandMetadata[command];
    const response = String(item?.response || "").trim();
    if (!metadata || !response) return overrides;
    return {
      ...overrides,
      [metadata.key]: isWebSerialExpectedEmptyResponse(command, response)
        ? {
          source: "web_serial",
          intent: metadata.intent,
          dtcs: [],
          reportedStatuses: [metadata.status],
          dtcReadoutStatus: "reported",
          retainedRawText: false,
          wouldTransmit: false,
          vehicleCommandEnabled: false
        }
        : {
          source: "web_serial",
          intent: metadata.intent,
          protocol: "ELM327",
          raw: response,
          retainedRawText: false,
          wouldTransmit: false,
          vehicleCommandEnabled: false
        }
    };
  }, attemptedOverrides);
}

function isWebSerialFreezeFrameCommand(command) {
  const normalizedCommand = String(command || "").trim().toUpperCase();
  return /^02[0-9A-F]{2}$/.test(normalizedCommand) && normalizedCommand !== "0200";
}

function resolveWebSerialFreezeFrameCapabilityResponse(previous = null, commandResponses = [], attemptedCommands = []) {
  const responses = (Array.isArray(commandResponses) ? commandResponses : [])
    .map((item) => ({
      command: String(item?.command || "").trim().toUpperCase(),
      response: String(item?.response || "").trim()
    }))
    .filter((item) => item.response);
  const currentCapability = responses.find((item) => item.command === "0200")?.response || null;
  const triggerReadAttempted = (Array.isArray(attemptedCommands) ? attemptedCommands : [])
    .some((command) => String(command || "").trim().toUpperCase() === "0202");
  if (triggerReadAttempted || responses.some((item) => item.command === "0202")) return currentCapability;
  return currentCapability || (typeof previous === "string" && previous.trim() ? previous : null);
}

function updateWebSerialFreezeFrameCapabilityResponse(commandResponses = [], attemptedCommands = []) {
  const resolved = resolveWebSerialFreezeFrameCapabilityResponse(obdDevSession.freezeFrameCapabilityResponse, commandResponses, attemptedCommands);
  obdDevSession.freezeFrameCapabilityResponse = resolved;
  return resolved;
}

function decodeWebSerialFreezeFrameSupportedPidBitmap(bitmap = "") {
  const supported = new Set();
  if (!/^[0-9A-F]{8}$/.test(String(bitmap || ""))) return supported;
  for (let byteIndex = 0; byteIndex < 4; byteIndex += 1) {
    const byte = Number.parseInt(bitmap.slice(byteIndex * 2, byteIndex * 2 + 2), 16);
    for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) {
      if ((byte & (1 << (7 - bitIndex))) !== 0) supported.add((byteIndex * 8 + bitIndex + 1).toString(16).padStart(2, "0").toUpperCase());
    }
  }
  return supported;
}

function parseWebSerialFreezeFrameSupportedPidRows(response = "") {
  return String(response || "").split(/\r?\n/).flatMap((line) => {
    const hex = String(line || "").toUpperCase().replace(/[^0-9A-F]/g, "");
    const standardHeaderMatch = hex.match(/^([0-9A-F]{3})(?:[0-9A-F]{2})?4200([0-9A-F]{8})/);
    const extendedHeaderMatch = standardHeaderMatch ? null : hex.match(/^([0-9A-F]{8})(?:[0-9A-F]{2})?4200([0-9A-F]{8})/);
    const headerlessMatch = standardHeaderMatch || extendedHeaderMatch ? null : hex.match(/^4200([0-9A-F]{8})/);
    const match = standardHeaderMatch || extendedHeaderMatch || headerlessMatch;
    if (!match) return [];
    const scopeId = standardHeaderMatch || extendedHeaderMatch ? match[1] : null;
    const bitmap = standardHeaderMatch || extendedHeaderMatch ? match[2] : match[1];
    return [{ scopeId, supportedPids: decodeWebSerialFreezeFrameSupportedPidBitmap(bitmap) }];
  });
}

function getWebSerialFreezeFrameSupportedPids(response = "") {
  return parseWebSerialFreezeFrameSupportedPidRows(response).reduce((supported, row) => {
    row.supportedPids.forEach((pid) => supported.add(pid));
    return supported;
  }, new Set());
}

function getWebSerialFreezeFrameTriggerScopeIds(freezeFrameSnapshot = null) {
  const entries = Array.isArray(freezeFrameSnapshot?.triggerDtcEntries)
    ? freezeFrameSnapshot.triggerDtcEntries
    : Array.isArray(freezeFrameSnapshot?.trigger_dtc_entries) ? freezeFrameSnapshot.trigger_dtc_entries : [];
  return new Set(entries
    .map((entry) => entry?.sourceEcu || entry?.source_ecu || null)
    .filter(Boolean)
    .map((scopeId) => String(scopeId).trim().toUpperCase()));
}

function hasWebSerialFreezeFrameTriggerDtc(freezeFrameSnapshot = null) {
  if (String(freezeFrameSnapshot?.triggerDtc || freezeFrameSnapshot?.trigger_dtc || "").trim()) return true;
  const entries = Array.isArray(freezeFrameSnapshot?.triggerDtcEntries)
    ? freezeFrameSnapshot.triggerDtcEntries
    : Array.isArray(freezeFrameSnapshot?.trigger_dtc_entries) ? freezeFrameSnapshot.trigger_dtc_entries : [];
  return entries.some((entry) => {
    const code = String(entry?.code || entry?.dtc || "").trim().toUpperCase();
    return code && code !== "P0000";
  });
}

function hasWebSerialFreezeFrameCapabilityReport(response = "", freezeFrameSnapshot = null) {
  const rows = parseWebSerialFreezeFrameSupportedPidRows(response);
  if (!rows.length) return false;
  const triggerScopeIds = getWebSerialFreezeFrameTriggerScopeIds(freezeFrameSnapshot);
  const scopedRows = rows.filter((row) => row.scopeId);
  if (!triggerScopeIds.size || !scopedRows.length) return true;
  const reportedScopeIds = new Set(scopedRows.map((row) => row.scopeId));
  return [...triggerScopeIds].every((scopeId) => reportedScopeIds.has(scopeId));
}

function getWebSerialFreezeFrameSupportedPidsForTriggerScopes(response = "", freezeFrameSnapshot = null) {
  const rows = parseWebSerialFreezeFrameSupportedPidRows(response);
  const triggerScopeIds = getWebSerialFreezeFrameTriggerScopeIds(freezeFrameSnapshot);
  const scopedRows = rows.filter((row) => row.scopeId);
  const applicableRows = triggerScopeIds.size && scopedRows.length
    ? scopedRows.filter((row) => triggerScopeIds.has(row.scopeId))
    : rows;
  return applicableRows.reduce((supported, row) => {
    row.supportedPids.forEach((pid) => supported.add(pid));
    return supported;
  }, new Set());
}

function mergeWebSerialFreezeFrameReadoutResponses(previous = [], commandResponses = [], attemptedCommands = []) {
  const currentResponses = (Array.isArray(commandResponses) ? commandResponses : [])
    .map((item) => ({
      command: String(item?.command || "").trim().toUpperCase(),
      response: String(item?.response || "").trim()
    }))
    .filter((item) => isWebSerialFreezeFrameCommand(item.command) && item.response);
  const triggerReadAttempted = (Array.isArray(attemptedCommands) ? attemptedCommands : [])
    .some((command) => String(command || "").trim().toUpperCase() === "0202");
  if (!currentResponses.length) return triggerReadAttempted ? [] : (Array.isArray(previous) ? previous : []);
  const previousResponses = triggerReadAttempted || currentResponses.some((item) => item.command === "0202")
    ? []
    : (Array.isArray(previous) ? previous : []);
  const responseByCommand = new Map(previousResponses.map((item) => [String(item?.command || "").trim().toUpperCase(), item]));
  currentResponses.forEach((item) => responseByCommand.set(item.command, item));
  return [...responseByCommand.values()];
}

function updateWebSerialFreezeFrameReadoutResponses(commandResponses = [], attemptedCommands = []) {
  const merged = mergeWebSerialFreezeFrameReadoutResponses(obdDevSession.freezeFrameReadoutResponses, commandResponses, attemptedCommands);
  obdDevSession.freezeFrameReadoutResponses = merged;
  return merged;
}

function buildWebSerialFreezeFrameResponseOverride(commandResponses = []) {
  const responses = (Array.isArray(commandResponses) ? commandResponses : [])
    .filter((item) => isWebSerialFreezeFrameCommand(item?.command));
  const response = responses.find((item) => String(item?.command || "").trim().toUpperCase() === "0202")?.response;
  if (isWebSerialExpectedEmptyResponse("0202", response)) {
    return {
      source: "web_serial",
      intent: "read_freeze_frame",
      values: [],
      freezeFrameReadoutStatus: "reported",
      retainedRawText: false,
      wouldTransmit: false,
      vehicleCommandEnabled: false
    };
  }
  const raw = responses.map((item) => `>${String(item.command || "").trim().toUpperCase()}\n${String(item.response || "").trim()}`).join("\n");
  return raw
    ? {
      source: "web_serial",
      intent: "read_freeze_frame",
      protocol: "ELM327",
      raw,
      retainedRawText: false,
      wouldTransmit: false,
      vehicleCommandEnabled: false
    }
    : null;
}

function isWebSerialEcuInfoCommand(command) {
  return new Set(["0900", "0904", "0906", "0908", "090A", "090B"])
    .has(String(command || "").trim().toUpperCase());
}

function mergeWebSerialEcuInfoReadoutResponses(previous = [], commandResponses = [], attemptedCommands = []) {
  const currentResponses = (Array.isArray(commandResponses) ? commandResponses : [])
    .map((item) => ({
      command: String(item?.command || "").trim().toUpperCase(),
      response: String(item?.response || "").trim()
    }))
    .filter((item) => isWebSerialEcuInfoCommand(item.command) && item.response);
  const supportReadAttempted = (Array.isArray(attemptedCommands) ? attemptedCommands : [])
    .some((command) => String(command || "").trim().toUpperCase() === "0900");
  if (!currentResponses.length) return supportReadAttempted ? [] : (Array.isArray(previous) ? previous : []);
  const previousResponses = supportReadAttempted || currentResponses.some((item) => item.command === "0900")
    ? []
    : (Array.isArray(previous) ? previous : []);
  const responseByCommand = new Map(previousResponses.map((item) => [String(item?.command || "").trim().toUpperCase(), item]));
  currentResponses.forEach((item) => responseByCommand.set(item.command, item));
  return [...responseByCommand.values()];
}

function updateWebSerialEcuInfoReadoutResponses(commandResponses = [], attemptedCommands = []) {
  const merged = mergeWebSerialEcuInfoReadoutResponses(obdDevSession.ecuInfoReadoutResponses, commandResponses, attemptedCommands);
  obdDevSession.ecuInfoReadoutResponses = merged;
  return merged;
}

function buildWebSerialEcuInfoResponseOverride(commandResponses = []) {
  const responses = (Array.isArray(commandResponses) ? commandResponses : [])
    .filter((item) => isWebSerialEcuInfoCommand(item?.command));
  const supportResponse = responses.find((item) => String(item?.command || "").trim().toUpperCase() === "0900")?.response;
  if (isWebSerialExpectedEmptyResponse("0900", supportResponse)) {
    return {
      source: "web_serial",
      intent: "read_ecu_info",
      values: [],
      ecuInfoReadoutStatus: "reported",
      retainedRawText: false,
      wouldTransmit: false,
      vehicleCommandEnabled: false
    };
  }
  const raw = responses.map((item) => `>${String(item.command || "").trim().toUpperCase()}\n${String(item.response || "").trim()}`).join("\n");
  return raw
    ? {
      source: "web_serial",
      intent: "read_ecu_info",
      protocol: "ELM327",
      raw,
      retainedRawText: false,
      wouldTransmit: false,
      vehicleCommandEnabled: false
    }
    : null;
}

function buildWebSerialReadinessResponseOverride(commandResponses = []) {
  const readinessResponses = (Array.isArray(commandResponses) ? commandResponses : [])
    .filter((item) => String(item?.command || "").trim().toUpperCase() === "0101");
  const response = String(readinessResponses[readinessResponses.length - 1]?.response || "").trim();
  if (!response) return null;
  return {
    source: "web_serial",
    intent: "read_readiness",
    protocol: "ELM327",
    raw: response,
    retainedRawText: false,
    wouldTransmit: false,
    vehicleCommandEnabled: false
  };
}

function buildWebSerialOnboardMonitorResponseOverride(commandResponses = []) {
  const response = String((Array.isArray(commandResponses) ? commandResponses : [])
    .find((item) => String(item?.command || "").trim().toUpperCase() === "06")?.response || "").trim();
  if (!response) return null;
  if (isWebSerialExpectedEmptyResponse("06", response)) {
    return {
      source: "web_serial",
      intent: "read_onboard_monitor",
      tests: [],
      onboardMonitorReadoutStatus: "reported",
      retainedRawText: false,
      wouldTransmit: false,
      vehicleCommandEnabled: false
    };
  }
  return {
    source: "web_serial",
    intent: "read_onboard_monitor",
    protocol: "ELM327",
    raw: response,
    retainedRawText: false,
    wouldTransmit: false,
    vehicleCommandEnabled: false
  };
}

function isWebSerialSupportedPidCommand(command) {
  return /^01(?:00|20|40|60|80|A0|C0|E0)$/.test(String(command || "").trim().toUpperCase());
}

function resolveWebSerialSupportedPidReadoutResponses(previous = [], commandResponses = [], attemptedCommands = []) {
  const currentResponses = (Array.isArray(commandResponses) ? commandResponses : [])
    .map((item) => ({
      command: String(item?.command || "").trim().toUpperCase(),
      response: String(item?.response || "").trim()
    }))
    .filter((item) => isWebSerialSupportedPidCommand(item.command) && item.response);
  const baseReadAttempted = (Array.isArray(attemptedCommands) ? attemptedCommands : [])
    .some((command) => String(command || "").trim().toUpperCase() === "0100");
  if (!currentResponses.length) return baseReadAttempted ? [] : (Array.isArray(previous) ? previous : []);
  const resolved = baseReadAttempted || currentResponses.some((item) => item.command === "0100")
    ? []
    : (Array.isArray(previous) ? previous : []).filter((item) => isWebSerialSupportedPidCommand(item?.command) && String(item?.response || "").trim());
  for (const item of currentResponses) {
    const index = resolved.findIndex((candidate) => candidate.command === item.command);
    if (index >= 0) resolved[index] = item;
    else resolved.push(item);
  }
  return resolved;
}

function updateWebSerialSupportedPidReadoutResponses(commandResponses = [], attemptedCommands = []) {
  const resolved = resolveWebSerialSupportedPidReadoutResponses(obdDevSession.supportedPidReadoutResponses, commandResponses, attemptedCommands);
  obdDevSession.supportedPidReadoutResponses = resolved;
  return resolved;
}

function buildWebSerialSupportedPidResponseOverride(commandResponses = []) {
  const transcript = buildWebSerialAttemptTranscript(commandResponses);
  if (!transcript) return null;
  return {
    source: "web_serial",
    intent: "read_supported_pids",
    protocol: "ELM327",
    raw: transcript,
    retainedRawText: false,
    wouldTransmit: false,
    vehicleCommandEnabled: false
  };
}

function buildWebSerialReadoutOutcome(commands, commandResponses, options = {}) {
  const requestedCommandCount = Array.isArray(commands) ? commands.map((command) => String(command || "").trim()).filter(Boolean).length : 0;
  const outcomes = (Array.isArray(commandResponses) ? commandResponses : []).map((item) => ({
    ...classifyWebSerialCommandResponse(item?.command, item?.response),
    expectedEmpty: isWebSerialExpectedEmptyResponse(item?.command, item?.response)
  }));
  const responseElapsedMs = (Array.isArray(commandResponses) ? commandResponses : [])
    .map((item) => Number(item?.responseElapsedMs))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const failedCommandElapsedMs = Number(options?.failedCommandElapsedMs);
  const totalResponseElapsedMs = responseElapsedMs.reduce((sum, value) => sum + value, 0)
    + (Number.isFinite(failedCommandElapsedMs) && failedCommandElapsedMs >= 0 ? failedCommandElapsedMs : 0);
  const total = (key) => outcomes.reduce((sum, outcome) => sum + (Number(outcome?.[key]) || 0), 0);
  const stopOutcome = outcomes.find((outcome) => outcome?.stopScope === "scan" || outcome?.stopScope === "attempt") || null;
  const attemptedCommandCount = Math.max(outcomes.length, Math.min(requestedCommandCount, Number(options.attemptedCommandCount) || outcomes.length));
  const transportErrorCount = options.transportErrorCount === true ? 1 : 0;
  const completedCommandCount = outcomes.filter((outcome) => outcome.commandStatus === "completed").length;
  const expectedEmptyCommandCount = outcomes.filter((outcome) => outcome.expectedEmpty === true).length;
  const partialCommandCount = outcomes.filter((outcome) => outcome.commandStatus === "partial").length;
  const hardFailure = transportErrorCount > 0 || outcomes.some((outcome) => outcome.commandStatus === "failed");
  const status = hardFailure
    ? "failed"
    : completedCommandCount + expectedEmptyCommandCount === requestedCommandCount && requestedCommandCount > 0
      ? "completed"
      : completedCommandCount > 0 || partialCommandCount > 0
        ? "partial"
        : "incomplete";
  return {
    status,
    readoutCompleted: status === "completed",
    requestedCommandCount,
    attemptedCommandCount,
    promptTerminatedCommandCount: outcomes.length,
    completedCommandCount,
    expectedEmptyCommandCount,
    positiveResponseCount: total("positiveResponseCount"),
    negativeResponseCount: total("negativeResponseCount"),
    pendingNegativeResponseCount: total("pendingNegativeResponseCount"),
    noDataCount: total("noDataCount"),
    unableToConnectCount: total("unableToConnectCount"),
    adapterErrorCount: total("adapterErrorCount"),
    emptyResponseCount: total("emptyResponseCount"),
    unrecognizedResponseCount: total("unrecognizedResponseCount"),
    transportErrorCount,
    responseTimingCount: responseElapsedMs.length,
    response_timing_count: responseElapsedMs.length,
    totalResponseElapsedMs,
    total_response_elapsed_ms: totalResponseElapsedMs,
    maxResponseElapsedMs: Math.max(0, ...responseElapsedMs, Number.isFinite(failedCommandElapsedMs) && failedCommandElapsedMs >= 0 ? failedCommandElapsedMs : 0),
    max_response_elapsed_ms: Math.max(0, ...responseElapsedMs, Number.isFinite(failedCommandElapsedMs) && failedCommandElapsedMs >= 0 ? failedCommandElapsedMs : 0),
    timedOut: options.timedOut === true,
    stopReason: transportErrorCount ? "transport_error" : (stopOutcome?.stopReason || null),
    stopScope: transportErrorCount ? "transport" : (stopOutcome?.stopScope || "none")
  };
}

async function runObdDeveloperRead(label, commands) {
  const revision = obdSerialRevision;
  if (!continueObdSerialOperation(revision)) return false;
  if (obdDevSession.pendingCommandOperation || obdDevSession.pendingWriteOperation || obdSerialDisconnectOperation) return false;
  if (!obdDevSession.writer || !obdDevSession.reader) {
    obdDevStatus.textContent = "VCI読取が開始されていません。";
    return false;
  }
  if (obdDevSession.readInProgress) return false;

  obdDevSession.readInProgress = true;
  setObdDeveloperConnectionState("reading");
  renderObdDeveloperGate();
  const startedAt = new Date().toISOString();
  const chunks = [];
  const commandResponses = [];
  const replaceLivePidSnapshot = commands.some((command) => obdDevSession.selectedPidList.includes(String(command || "").trim().toUpperCase()));
  const replaceReadinessSnapshot = commands.some((command) => String(command || "").trim().toUpperCase() === "0101");
  const replaceOnboardMonitorSnapshot = commands.some((command) => String(command || "").trim().toUpperCase() === "06");
  let attemptedCommandCount = 0;
  let currentCommandStartedAt = null;
  try {
    obdDevStatus.textContent = `${label}中です。`;
    for (const command of commands) {
      chunks.push(`>${command}`);
      attemptedCommandCount += 1;
      currentCommandStartedAt = Date.now();
      const response = await sendElmDeveloperCommand(command, 3500);
      throwIfObdSerialOperationCancelled(revision);
      commandResponses.push({ command, response, responseElapsedMs: Math.max(0, Date.now() - currentCommandStartedAt) });
      currentCommandStartedAt = null;
      chunks.push(["ATI", "AT@1", "ATDP", "ATDPN"].includes(command) ? "[adapter identity response not retained]" : response);
      const commandOutcome = classifyWebSerialCommandResponse(command, response);
      if (commandOutcome.stopScope === "attempt" || commandOutcome.stopScope === "scan") break;
    }
    const outcome = buildWebSerialReadoutOutcome(commands, commandResponses, { attemptedCommandCount });
    recordWebSerialReadoutAttempt({ label, startedAt, outcome });
    retainObdDeveloperReadout(commandResponses, chunks, {
      attemptedCommands: commands.slice(0, attemptedCommandCount),
      replaceLivePidSnapshot,
      replaceReadinessSnapshot,
      replaceOnboardMonitorSnapshot
    });
    obdSerialResultOwner.expectedLastSession = obdDevSession.lastSession;
    if (outcome.stopScope === "scan" && obdDevSession.coreScanInProgress) obdDevSession.coreScanStopReason = outcome.stopReason;
    obdDevStatus.textContent = outcome.readoutCompleted
      ? `${label}が完了しました。取れた値だけ表示します。`
      : `${label}は未完了です。応答品質を記録し、取得できた値だけ表示します。`;
    return outcome.readoutCompleted;
  } catch (error) {
    if (!continueObdSerialOperation(revision)) return false;
    const message = error?.message || String(error);
    if (message === "elm_write_busy") return false;
    const writeTimedOut = message.startsWith("elm_transport_write_timeout:");
    if (writeTimedOut && error.diagnosticContext) Object.assign(obdDevSession, error.diagnosticContext);
    const timedOut = writeTimedOut || message.startsWith("elm_response_timeout:");
    const responseTooLarge = obdDevSession.lastDisconnectReason === "serial_response_too_large" && message.startsWith("elm_transport_");
    const failedCommandElapsedMs = currentCommandStartedAt === null ? null : Math.max(0, Date.now() - currentCommandStartedAt);
    const outcome = buildWebSerialReadoutOutcome(commands, commandResponses, { timedOut, transportErrorCount: true, attemptedCommandCount, failedCommandElapsedMs });
    recordWebSerialReadoutAttempt({ label, startedAt, outcome });
    const partialReadoutRetained = Boolean(retainObdDeveloperReadout(commandResponses, chunks, {
      persistEmptyAttempt: true,
      connectionStatus: buildWebSerialConnectionStatus(outcome),
      attemptedCommands: commands.slice(0, attemptedCommandCount),
      replaceLivePidSnapshot,
      replaceReadinessSnapshot,
      replaceOnboardMonitorSnapshot
    }));
    obdSerialResultOwner.expectedLastSession = obdDevSession.lastSession;
    if (writeTimedOut) return false;
    const transportFailed = timedOut || message.startsWith("elm_transport_");
    if (transportFailed) await disconnectObdDeveloperVci({ reason: responseTooLarge ? "serial_response_too_large" : timedOut ? "response_timeout" : "transport_failed" });
    if (!continueObdSerialOperation(revision)) return false;
    if (obdDevSession.coreScanInProgress) obdDevSession.coreScanStopReason = "transport_error";
    obdDevStatus.textContent = responseTooLarge
      ? `${formatWebSerialConnectionFailure("serial_response_too_large")}${partialReadoutRetained ? " 読取実行結果を保持しています。" : ""}`
      : timedOut
      ? `${label}の応答がタイムアウトしたため、安全に切断しました。${partialReadoutRetained ? " 読取実行結果を保持しています。" : ""}`
      : `${label}に失敗しました: ${message}${partialReadoutRetained ? " 読取実行結果を保持しています。" : ""}`;
    return false;
  } finally {
    if (continueObdSerialOperation(revision)) {
      obdDevSession.readInProgress = false;
      if (obdDevSession.port && obdDevSession.connectionState !== "disconnecting") setObdDeveloperConnectionState("ready");
      renderObdDeveloperGate();
    }
  }
}

function recordWebSerialReadoutAttempt({ label, startedAt, outcome }) {
  const safeOutcome = outcome && typeof outcome === "object" ? outcome : buildWebSerialReadoutOutcome([], []);
  const attempt = {
    label: String(label || "Web Serial読取"),
    status: ["completed", "partial", "incomplete", "failed"].includes(safeOutcome.status) ? safeOutcome.status : "failed",
    startedAt: startedAt || new Date().toISOString(),
    endedAt: new Date().toISOString(),
    ...safeOutcome,
    retainedRawText: false,
    retainedCommands: false,
    readOnly: true,
    read_only: true,
    wouldTransmit: false,
    would_transmit: false,
    vehicleCommandEnabled: false,
    vehicle_command_enabled: false
  };
  obdDevSession.readoutAttempts = [...(obdDevSession.readoutAttempts || []), attempt].slice(-30);
  return attempt;
}

function buildWebSerialReadoutSummary() {
  const attempts = Array.isArray(obdDevSession.readoutAttempts) ? obdDevSession.readoutAttempts : [];
  const countByStatus = (status) => attempts.filter((item) => item?.status === status).length;
  const total = (key) => attempts.reduce((sum, attempt) => sum + (Number(attempt?.[key]) || 0), 0);
  const latestAttempt = attempts.at(-1) || null;
  const timedOutCount = attempts.filter((item) => item?.timedOut === true || item?.timed_out === true).length;
  const readoutProfile = ["initial_diagnostic", "quick_condition"].includes(obdDevSession.readoutProfile)
    ? obdDevSession.readoutProfile
    : null;
  return {
    schemaVersion: "web_serial_readout_execution_v2",
    schema_version: "web_serial_readout_execution_v2",
    source: "web_serial",
    readoutProfile,
    readout_profile: readoutProfile,
    attemptCount: attempts.length,
    attempt_count: attempts.length,
    completedCount: countByStatus("completed"),
    completed_count: countByStatus("completed"),
    partialCount: countByStatus("partial"),
    partial_count: countByStatus("partial"),
    incompleteCount: countByStatus("incomplete"),
    incomplete_count: countByStatus("incomplete"),
    failedCount: countByStatus("failed"),
    failed_count: countByStatus("failed"),
    positiveResponseCount: total("positiveResponseCount"),
    positive_response_count: total("positiveResponseCount"),
    expectedEmptyCommandCount: total("expectedEmptyCommandCount"),
    expected_empty_command_count: total("expectedEmptyCommandCount"),
    negativeResponseCount: total("negativeResponseCount"),
    negative_response_count: total("negativeResponseCount"),
    pendingNegativeResponseCount: total("pendingNegativeResponseCount"),
    pending_negative_response_count: total("pendingNegativeResponseCount"),
    noDataCount: total("noDataCount"),
    no_data_count: total("noDataCount"),
    unableToConnectCount: total("unableToConnectCount"),
    unable_to_connect_count: total("unableToConnectCount"),
    adapterErrorCount: total("adapterErrorCount"),
    adapter_error_count: total("adapterErrorCount"),
    emptyResponseCount: total("emptyResponseCount"),
    empty_response_count: total("emptyResponseCount"),
    unrecognizedResponseCount: total("unrecognizedResponseCount"),
    unrecognized_response_count: total("unrecognizedResponseCount"),
    transportErrorCount: total("transportErrorCount"),
    transport_error_count: total("transportErrorCount"),
    timedOutCount,
    timed_out_count: timedOutCount,
    responseTimingCount: total("responseTimingCount"),
    response_timing_count: total("responseTimingCount"),
    totalResponseElapsedMs: total("totalResponseElapsedMs"),
    total_response_elapsed_ms: total("totalResponseElapsedMs"),
    maxResponseElapsedMs: Math.max(0, ...attempts.map((item) => Number(item?.maxResponseElapsedMs) || 0)),
    max_response_elapsed_ms: Math.max(0, ...attempts.map((item) => Number(item?.maxResponseElapsedMs) || 0)),
    latestAttempt,
    latest_attempt: latestAttempt,
    attempts: attempts.map((item) => ({ ...item })),
    retainedRawText: false,
    retained_raw_text: false,
    retainedCommands: false,
    retained_commands: false,
    readOnly: true,
    read_only: true,
    wouldTransmit: false,
    would_transmit: false,
    vehicleCommandEnabled: false,
    vehicle_command_enabled: false
  };
}

const WEB_SERIAL_ADAPTER_INITIALIZATION_STEPS = Object.freeze({
  adapter_reset: "アダプター再起動",
  disable_echo: "エコー停止",
  disable_linefeeds: "改行停止",
  disable_spaces: "空白停止",
  enable_headers: "応答ヘッダー有効化",
  automatic_protocol: "プロトコル自動判定"
});

function buildWebSerialAdapterInitializationSummary(options = {}) {
  const status = ["not_started", "in_progress", "completed", "failed"].includes(options?.status)
    ? options.status
    : "not_started";
  const attemptedSetupStepCount = Math.max(0, Number(options?.attemptedSetupStepCount) || 0);
  const completedSetupStepCount = Math.min(attemptedSetupStepCount, Math.max(0, Number(options?.completedSetupStepCount) || 0));
  const failedSetupStep = WEB_SERIAL_ADAPTER_INITIALIZATION_STEPS[options?.failedSetupStep]
    ? options.failedSetupStep
    : null;
  const stopReason = typeof options?.stopReason === "string" && options.stopReason.trim()
    ? options.stopReason.trim().slice(0, 40)
    : null;
  const baudRate = Number(options?.baudRate);
  const normalizedBaudRate = Number.isInteger(baudRate) && baudRate >= 1200 && baudRate <= 1000000
    ? baudRate
    : null;
  return {
    schemaVersion: "web_serial_adapter_initialization_v1",
    schema_version: "web_serial_adapter_initialization_v1",
    source: "web_serial",
    initializationStatus: status,
    initialization_status: status,
    attemptedSetupStepCount,
    attempted_setup_step_count: attemptedSetupStepCount,
    completedSetupStepCount,
    completed_setup_step_count: completedSetupStepCount,
    ...(normalizedBaudRate ? { baudRate: normalizedBaudRate, baud_rate: normalizedBaudRate } : {}),
    ...(failedSetupStep ? { failedSetupStep, failed_setup_step: failedSetupStep } : {}),
    ...(stopReason ? { stopReason, stop_reason: stopReason } : {}),
    retainedRawText: false,
    retained_raw_text: false,
    retainedAdapterIdentity: false,
    retained_adapter_identity: false,
    readOnly: true,
    read_only: true,
    wouldTransmit: false,
    would_transmit: false,
    vehicleCommandEnabled: false,
    vehicle_command_enabled: false
  };
}

function getWebSerialAdapterInitializationStopReason(error) {
  const message = String(error?.message || error || "");
  if (message.startsWith("elm_response_timeout:")) return "response_timeout";
  if (message.startsWith("elm_transport_")) return "transport_error";
  return "initialization_error";
}

function formatWebSerialAdapterInitializationSummary(summary = null) {
  const status = summary?.initializationStatus || summary?.initialization_status;
  const baudRate = summary?.baudRate || summary?.baud_rate || null;
  const baudRateLabel = Number.isInteger(Number(baudRate)) ? ` / ${Number(baudRate)} bps` : "";
  if (status === "completed") return `完了 (${summary.completedSetupStepCount ?? summary.completed_setup_step_count ?? 0}/${summary.attemptedSetupStepCount ?? summary.attempted_setup_step_count ?? 0}${baudRateLabel})`;
  if (status === "in_progress") return "実行中";
  if (status === "failed") {
    const step = summary?.failedSetupStep || summary?.failed_setup_step;
    const label = WEB_SERIAL_ADAPTER_INITIALIZATION_STEPS[step] || "設定応答";
    return `停止: ${label}${baudRateLabel}`;
  }
  return null;
}

function formatWebSerialAdapterInitializationFailure(summary = null, error = null) {
  const summaryLabel = formatWebSerialAdapterInitializationSummary(summary);
  return summaryLabel
    ? `VCI初期化を完了できませんでした: ${summaryLabel}`
    : `読取を開始できませんでした: ${error?.message || error}`;
}

function formatWebSerialConnectionFailure(reason, summary = null, error = null) {
  if (reason === "serial_response_too_large") return "VCI応答が受信上限を超えたため切断しました。上限を超えた応答は診断に取り込んでいません。";
  if (reason === "port_selection_failed") return "VCI選択を開始できませんでした。ブラウザのシリアル権限とHTTPS環境を確認してください。";
  if (reason === "port_open_failed") return "VCIポートを開けませんでした。別アプリでの使用、通信速度、接続状態を確認してください。";
  if (reason === "adapter_identification_failed") return "VCI識別応答を確認できませんでした。アダプター電源とファームウェア応答を確認してください。";
  return formatWebSerialAdapterInitializationFailure(summary, error);
}

function retainWebSerialConnectionAttempt() {
  if (!hasBridgeDiagnosticScanSessionSupport()) return null;
  const capturedAt = new Date().toISOString();
  const session = window.ObdReadOnly.buildDiagnosticScanSession({
    source: "web_serial",
    session_id: obdDevSession.scanSessionId || "web-serial-connection-attempt",
    protocol: "ELM327",
    started_at: obdDevSession.connectedAt || capturedAt,
    ended_at: capturedAt,
    captured_at: capturedAt,
    readoutInterface: buildSelectedObdReadoutInterface(),
    vehicleProfile: obdDevSession.vehicleProfile || undefined,
    vehicleApplicability: obdDevSession.vehicleApplicability || undefined,
    observationContext: obdDevSession.observationContext || buildSelectedObdObservationContext() || undefined,
    connectionStatus: buildWebSerialConnectionStatus(),
    retained_raw_text: false,
    vehicle_command_enabled: false,
    would_transmit: false
  });
  obdDevSession.lastSession = session;
  handleObdReadoutSessionReplacement();
  renderObdDeveloperSessionSummary(session);
  return session;
}

function buildWebSerialConnectionStatus(outcome = null) {
  const latestAttempt = outcome && typeof outcome === "object"
    ? outcome
    : (obdDevSession.readoutAttempts || []).at(-1) || null;
  const transportError = Number(latestAttempt?.transportErrorCount) > 0 || [
    "serial_response_too_large", "serial_read_failed", "serial_stream_closed", "device_disconnected",
    "response_timeout", "serial_write_timeout", "transport_failed", "connection_failed"
  ].includes(obdDevSession.lastDisconnectReason);
  const adapterError = Number(latestAttempt?.adapterErrorCount) > 0;
  const vehicleLinkError = Number(latestAttempt?.unableToConnectCount) > 0;
  const adapterInitializationSummary = obdDevSession.adapterInitializationSummary;
  const adapterInitializationFailed = (adapterInitializationSummary?.initializationStatus || adapterInitializationSummary?.initialization_status) === "failed"
    || obdDevSession.lastDisconnectReason === "adapter_initialization_failed";
  const retainedConnectionFailure = ["port_selection_failed", "port_open_failed", "adapter_identification_failed"].includes(obdDevSession.lastDisconnectReason)
    ? obdDevSession.lastDisconnectReason
    : null;
  const adapterConnected = Boolean(obdDevSession.port) && !transportError && !adapterInitializationFailed;
  const connectionState = String(obdDevSession.connectionState || "disconnected");
  const status = adapterInitializationFailed
    ? "adapter_initialization_failed"
    : transportError
    ? "transport_error"
    : vehicleLinkError
      ? "vehicle_link_error"
      : adapterError
        ? "adapter_error"
        : retainedConnectionFailure
          ? retainedConnectionFailure
    : adapterConnected
      ? "adapter_connected"
      : "disconnected";
  const displayStatus = transportError
    ? "Web Serial通信エラー"
    : adapterConnected
      ? "Web Serialアダプター接続中"
      : "Web Serial未接続";
  const resolvedDisplayStatus = adapterInitializationFailed
    ? "Web Serialアダプター初期化を完了できません"
    : transportError
      ? displayStatus
      : vehicleLinkError
      ? "車両通信を確立できません"
      : adapterError
        ? "Web Serialアダプターエラー"
        : retainedConnectionFailure === "port_selection_failed"
          ? "Web Serial機器選択を開始できません"
          : retainedConnectionFailure === "port_open_failed"
            ? "Web Serialポートを開けません"
            : retainedConnectionFailure === "adapter_identification_failed"
              ? "Web Serialアダプターを識別できません"
              : displayStatus;
  const nextAction = adapterInitializationFailed
    ? "アダプター電源、通信速度、初期化応答を確認してから、読取専用で再接続"
    : transportError
      ? "アダプター接続と通信速度を確認してから、読取専用で再接続"
      : vehicleLinkError
      ? "イグニッション状態、OBDコネクター接続、車両プロトコル、アダプター状態を確認してから、読取専用で再試行"
      : adapterError
        ? "アダプター電源、ファームウェア応答、シリアル設定を確認してから、読取専用で再試行"
        : retainedConnectionFailure === "port_selection_failed"
          ? "HTTPS環境とブラウザのシリアル権限を確認してから再選択"
          : retainedConnectionFailure === "port_open_failed"
            ? "別アプリの使用、通信速度、接続状態を確認してから再接続"
            : retainedConnectionFailure === "adapter_identification_failed"
              ? "アダプター電源とファームウェア応答を確認してから再接続"
              : adapterConnected
                ? "読取専用でDTCまたは対応PIDを確認"
                : "Web Serialで読取アダプターを選択";
  return {
    source: "web_serial",
    intent: "connection_status",
    ok: !adapterInitializationFailed && !transportError && !adapterError && !vehicleLinkError && !retainedConnectionFailure,
    blocked: false,
    wouldTransmit: false,
    readOnly: true,
    read_only: true,
    vehicleCommandEnabled: false,
    status,
    displayStatus: resolvedDisplayStatus,
    display_status: resolvedDisplayStatus,
    nextAction,
    next_action: nextAction,
    connectionState,
    connection_state: connectionState,
    vciConnected: adapterConnected,
    vci_connected: adapterConnected,
    vehicleConnected: vehicleLinkError ? false : null,
    vehicle_connected: vehicleLinkError ? false : null,
    latestReadoutStatus: latestAttempt?.status || null,
    latest_readout_status: latestAttempt?.status || null,
    latestReadoutStopReason: latestAttempt?.stopReason || null,
    latest_readout_stop_reason: latestAttempt?.stopReason || null,
    ...(adapterInitializationSummary ? { adapterInitializationSummary, adapter_initialization_summary: adapterInitializationSummary } : {}),
    ...(obdDevSession.lastDisconnectReason ? { lastDisconnectReason: obdDevSession.lastDisconnectReason, last_disconnect_reason: obdDevSession.lastDisconnectReason } : {}),
    retainedRawText: false,
    retained_raw_text: false,
    vehicle_command_enabled: false,
    would_transmit: false
  };
}

function buildWebSerialAttemptTranscript(commandResponses = []) {
  return (Array.isArray(commandResponses) ? commandResponses : [])
    .map((item) => {
      const command = String(item?.command || "").trim().toUpperCase();
      const response = String(item?.response || "").trim();
      if (!command || !response || ["ATI", "AT@1", "ATDP", "ATDPN"].includes(command)) return "";
      return `>${command}\n${response}`;
    })
    .filter(Boolean)
    .join("\n");
}

function retainObdDeveloperReadout(commandResponses = [], chunks = [], options = {}) {
  const hasCommandResponses = commandResponses.length > 0;
  if (!hasCommandResponses && options?.persistEmptyAttempt !== true) return null;
  if (hasCommandResponses) appendObdDeveloperLog(chunks.join("\n"));
  const adapterIdentity = buildWebSerialAdapterIdentity(commandResponses);
  if (adapterIdentity) obdDevSession.adapterIdentity = adapterIdentity;
  const attemptedCommands = Array.isArray(options?.attemptedCommands) ? options.attemptedCommands : [];
  const attemptedCommandSet = new Set(attemptedCommands.map((command) => String(command || "").trim().toUpperCase()));
  updateWebSerialFreezeFrameCapabilityResponse(commandResponses, attemptedCommands);
  const capturedAt = new Date().toISOString();
  const dtcResponseOverrides = buildWebSerialDtcResponseOverrides(commandResponses, options?.attemptedCommands);
  const supportedPidResponseOverride = buildWebSerialSupportedPidResponseOverride(updateWebSerialSupportedPidReadoutResponses(commandResponses, attemptedCommands));
  const freezeFrameResponseOverride = buildWebSerialFreezeFrameResponseOverride(updateWebSerialFreezeFrameReadoutResponses(commandResponses, attemptedCommands));
  const ecuInfoResponseOverride = buildWebSerialEcuInfoResponseOverride(updateWebSerialEcuInfoReadoutResponses(commandResponses, attemptedCommands));
  const readinessResponseOverride = buildWebSerialReadinessResponseOverride(commandResponses);
  const onboardMonitorResponseOverride = buildWebSerialOnboardMonitorResponseOverride(commandResponses);
  const vehicleProfile = obdDevSession.vehicleProfile || buildSelectedObdVehicleProfile();
  const vehicleApplicability = obdDevSession.vehicleApplicability || buildSelectedObdVehicleApplicability(vehicleProfile);
  obdDevSession.observationContext = mergeObdObservationContexts(
    obdDevSession.observationContext,
    buildSelectedObdObservationContext()
  );
  const webSerialReadoutSummary = buildWebSerialReadoutSummary();
  const scanSessionOptions = {
    session_id: obdDevSession.scanSessionId || "web-serial-dev-readout",
    protocol: "ELM327",
    started_at: obdDevSession.connectedAt || capturedAt,
    ended_at: capturedAt,
    captured_at: capturedAt,
    readoutInterface: buildSelectedObdReadoutInterface(),
    vehicleProfile: vehicleProfile || undefined,
    vehicleApplicability: vehicleApplicability || undefined,
    observationContext: obdDevSession.observationContext || undefined,
    connectionStatus: options?.connectionStatus || buildWebSerialConnectionStatus(),
    webSerialReadoutSummary,
    ...(supportedPidResponseOverride ? { supportedPidResponse: supportedPidResponseOverride } : {}),
    ...(freezeFrameResponseOverride ? { freezeFrameResponse: freezeFrameResponseOverride } : {}),
    ...(ecuInfoResponseOverride ? { ecuInfoResponse: ecuInfoResponseOverride } : {}),
    ...dtcResponseOverrides
  };
  const classifiedAttemptSession = window.ObdReadOnly.buildScanSessionFromObdText(
    buildWebSerialAttemptTranscript(commandResponses),
    scanSessionOptions
  );
  const fallbackAttemptSession = readinessResponseOverride || onboardMonitorResponseOverride
    ? window.ObdReadOnly.buildDiagnosticScanSession({
      ...(readinessResponseOverride ? { readinessResponse: readinessResponseOverride } : {}),
      ...(onboardMonitorResponseOverride ? { onboardMonitorResponse: onboardMonitorResponseOverride } : {})
    })
    : null;
  const currentReadinessSnapshot = classifiedAttemptSession.readinessSnapshot?.readinessReadoutStatus !== "unknown"
    ? classifiedAttemptSession.readinessSnapshot
    : fallbackAttemptSession?.readinessSnapshot || classifiedAttemptSession.readinessSnapshot;
  const currentOnboardMonitorSnapshot = classifiedAttemptSession.onboardMonitorSnapshot?.onboardMonitorReadoutStatus !== "unknown"
    ? classifiedAttemptSession.onboardMonitorSnapshot
    : fallbackAttemptSession?.onboardMonitorSnapshot || classifiedAttemptSession.onboardMonitorSnapshot;
  const currentAttemptSession = {
    ...classifiedAttemptSession,
    readinessSnapshot: currentReadinessSnapshot,
    onboardMonitorSnapshot: currentOnboardMonitorSnapshot
  };
  const currentLivePidSnapshot = currentAttemptSession.livePidSnapshot;
  const requestedLivePidValues = options?.replaceLivePidSnapshot === true
    || commandResponses.some((item) => obdDevSession.selectedPidList.includes(String(item?.command || "").trim().toUpperCase()));
  const latestSnapshotOverrides = {
    ...(requestedLivePidValues ? { livePidSnapshot: currentLivePidSnapshot } : {}),
    ...(attemptedCommandSet.has("0100") ? { supportedPidMatrix: currentAttemptSession.supportedPidMatrix } : {}),
    ...(attemptedCommandSet.has("0202") ? { freezeFrameSnapshot: currentAttemptSession.freezeFrameSnapshot } : {}),
    ...(attemptedCommandSet.has("0900") ? { ecuInfoSnapshot: currentAttemptSession.ecuInfoSnapshot } : {}),
    ...(options?.replaceReadinessSnapshot === true
      ? { readinessSnapshot: currentReadinessSnapshot }
      : obdDevSession.lastSession?.readinessSnapshot ? { readinessSnapshot: obdDevSession.lastSession.readinessSnapshot } : {}),
    ...(options?.replaceOnboardMonitorSnapshot === true
      ? { onboardMonitorSnapshot: currentOnboardMonitorSnapshot }
      : obdDevSession.lastSession?.onboardMonitorSnapshot ? { onboardMonitorSnapshot: obdDevSession.lastSession.onboardMonitorSnapshot } : {})
  };
  const resolvedScanSession = window.ObdReadOnly.buildScanSessionFromObdText(
    obdDevSession.lastRawText,
    { ...scanSessionOptions, ...latestSnapshotOverrides }
  );
  const hasLivePidTimelineSample = hasWebSerialLivePidCoverage(currentLivePidSnapshot)
    && Array.isArray(currentLivePidSnapshot.monitorValues)
    && currentLivePidSnapshot.monitorValues.length > 0;
  const livePidTimeline = window.ObdReadOnly.normalizeLivePidTimeline({
    samples: hasLivePidTimelineSample
      ? [...obdDevSession.livePidTimeline, {
        capturedAt,
        livePidSnapshot: currentLivePidSnapshot,
        observationCondition: obdLiveObservationCondition?.value || "unspecified",
        adapterIdentity: obdDevSession.adapterIdentity || undefined
      }]
      : [...obdDevSession.livePidTimeline]
  });
  const livePidTimelineSummary = window.ObdReadOnly.buildLivePidTimelineSummary(livePidTimeline);
  obdDevSession.livePidTimeline = livePidTimeline.samples;
  const session = {
    ...resolvedScanSession,
    ...(obdDevSession.adapterIdentity ? { adapterIdentity: obdDevSession.adapterIdentity, adapter_identity: obdDevSession.adapterIdentity } : {}),
    webSerialReadoutSummary: resolvedScanSession.webSerialReadoutSummary || webSerialReadoutSummary,
    web_serial_readout_summary: resolvedScanSession.web_serial_readout_summary || webSerialReadoutSummary,
    livePidTimeline,
    live_pid_timeline: livePidTimeline,
    livePidTimelineSummary,
    live_pid_timeline_summary: livePidTimelineSummary
  };
  obdDevSession.lastSession = session;
  handleObdReadoutSessionReplacement();
  renderObdDeveloperReadout(session);
  return session;
}

async function sendElmDeveloperCommand(command, timeoutMs = 3000) {
  const revision = obdSerialRevision;
  throwIfObdSerialOperationCancelled(revision);
  const normalized = String(command || "").trim().toUpperCase();
  if (!isAllowedObdDeveloperCommand(normalized)) {
    throw new Error(`許可していないコマンドです: ${normalized}`);
  }
  const { writer, port, encoder } = obdDevSession;
  if (!writer || !port || !obdDevSession.readLoopActive) throw new Error("elm_transport_disconnected");
  if (obdSerialDisconnectOperation || obdDevSession.pendingCommandOperation || obdDevSession.pendingWriteOperation) throw new Error("elm_write_busy");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60000) throw new Error("elm_write_timeout_invalid");
  const commandOperation = { writer, port, revision };
  obdDevSession.pendingCommandOperation = commandOperation;
  try {
    let settleWrite;
    const operation = { writer, port, settledPromise: new Promise((resolve) => { settleWrite = resolve; }) };
    obdDevSession.pendingWriteOperation = operation;
    obdDevSession.textBuffer = "";
    const started = performance.now();
    const timeoutError = new Error(`elm_transport_write_timeout:${normalized}`);
    timeoutError.connectionFailureReason = obdSerialConnectPending
      ? getWebSerialConnectionFailureReason(obdDevSession.connectionState, obdDevSession.adapterInitializationSummary)
      : "serial_write_timeout";
    const expire = () => {
      if (!operation.timedOut) {
        operation.timedOut = true;
        if (obdDevSession.writer === writer && obdDevSession.port === port) {
          void disconnectObdDeveloperVci({ reason: timeoutError.connectionFailureReason });
        }
        timeoutError.diagnosticContext = operation.diagnosticContext;
      }
      return timeoutError;
    };
    const writing = (async () => {
      try {
        await writer.write(encoder.encode(`${normalized}\r`));
      } finally {
        try {
          if (performance.now() - started >= timeoutMs) throw expire();
        } finally {
          if (obdDevSession.pendingWriteOperation === operation) obdDevSession.pendingWriteOperation = null;
          settleWrite();
        }
      }
    })();
    let timer;
    try {
      await Promise.race([
        writing,
        new Promise((_, reject) => { timer = setTimeout(() => reject(expire()), timeoutMs); })
      ]);
    } catch (_error) {
      if (operation.timedOut) throw timeoutError;
      throw new Error(`elm_transport_write_failed:${normalized}`);
    } finally {
      clearTimeout(timer);
    }
    throwIfObdSerialOperationCancelled(revision);
    if (obdDevSession.writer !== writer || obdDevSession.port !== port) throw new Error("elm_transport_disconnected");
    const response = await readElmDeveloperResponse(timeoutMs);
    throwIfObdSerialOperationCancelled(revision);
    if (obdDevSession.pendingCommandOperation !== commandOperation || obdDevSession.writer !== writer || obdDevSession.port !== port) throw new Error("elm_transport_disconnected");
    if (!response) throw new Error(`elm_response_timeout:${normalized}`);
    return response;
  } finally {
    if (obdDevSession.pendingCommandOperation === commandOperation) obdDevSession.pendingCommandOperation = null;
  }
}

function isAllowedObdDeveloperCommand(command) {
  return WEB_SERIAL_READ_ONLY_COMMANDS.includes(command);
}

function isCurrentWebSerialReadLoop(reader, port) {
  return obdDevSession.readLoopActive === true
    && obdDevSession.reader === reader
    && obdDevSession.port === port;
}

async function readElmDeveloperLoop(reader = obdDevSession.reader, port = obdDevSession.port) {
  if (!reader || !port) return;
  let transportLossReason = null;
  while (isCurrentWebSerialReadLoop(reader, port)) {
    try {
      const result = await reader.read();
      if (!isCurrentWebSerialReadLoop(reader, port)) break;
      if (result.done) {
        transportLossReason = "serial_stream_closed";
        break;
      }
      const decoded = obdDevSession.decoder.decode(result.value || new Uint8Array(), { stream: true });
      if (obdDevSession.textBuffer.length + decoded.length > 12000) {
        obdDevSession.textBuffer = "";
        transportLossReason = "serial_response_too_large";
        break;
      }
      obdDevSession.textBuffer += decoded;
    } catch (_error) {
      if (isCurrentWebSerialReadLoop(reader, port)) {
        obdDevStatus.textContent = "VCI受信が停止しました。読取をやり直してください。";
        transportLossReason = "serial_read_failed";
      }
      break;
    }
  }
  if (transportLossReason && isCurrentWebSerialReadLoop(reader, port)) {
    void disconnectObdDeveloperVci({ reason: transportLossReason });
  }
}

function hasCompletedElmDeveloperResponse(buffer) {
  return />\s*$/.test(String(buffer || ""));
}

function takeCompletedElmDeveloperResponse(buffer) {
  return String(buffer || "").replace(/>\s*$/, "").replace(/\r/g, "").trim();
}

async function readElmDeveloperResponse(timeoutMs) {
  const revision = obdSerialRevision;
  const { reader, port, pendingCommandOperation } = obdDevSession;
  const deadline = performance.now() + timeoutMs;
  while (true) {
    throwIfObdSerialOperationCancelled(revision);
    if (!port || obdDevSession.port !== port || obdDevSession.reader !== reader || !obdDevSession.readLoopActive
      || obdDevSession.pendingCommandOperation !== pendingCommandOperation) throw new Error("elm_transport_disconnected");
    const remaining = deadline - performance.now();
    if (remaining <= 0) break;
    if (hasCompletedElmDeveloperResponse(obdDevSession.textBuffer)) {
      return takeCompletedElmDeveloperResponse(obdDevSession.textBuffer);
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(40, remaining)));
  }
  return "";
}

function appendObdDeveloperLog(text) {
  const sanitized = window.ObdReadOnly.redactSensitiveText(String(text || ""));
  obdDevSession.lastRawText = [obdDevSession.lastRawText, sanitized].filter(Boolean).join("\n").slice(-20000);
}

function renderObdDeveloperReadout(session) {
  renderObdImportToolHints();
  const monitorValues = session.livePidSnapshot?.monitorValues || [];
  const codes = session.dtcSnapshot?.dtcs?.filter((item) => item?.code) || [];
  obdScannerText.value = obdDevSession.lastRawText;
  analyzeObdScannerImport({ mergeWithCurrentSession: true });
  if (monitorValues.length) renderObdMonitorValues(monitorValues, session.livePidSnapshot.monitorInsights || []);
  obdDetectedCodes.innerHTML = "";
  if (codes.length) {
    [...new Map(codes.map((item) => [buildObdDtcDisplayKey(item), item])).values()].forEach((item) => obdDetectedCodes.appendChild(createObdDtcCard(item, codes, session.vehicleProfile || session.vehicle_profile || null)));
    obdImportStatus.textContent = `${codes.length}件の車両DTCを読取りました。`;
  } else if ((session.dtcSnapshot?.dtcReadoutStatus || session.dtcSnapshot?.dtc_readout_status) === "reported") {
    obdImportStatus.textContent = "車両DTCを読取りました。DTCは0件です。";
  }
  renderObdDeveloperSessionSummary(session);
  renderObdStageView("results");
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
  const readinessSnapshot = parts.readinessResponse
    ? window.ObdReadOnly.normalizeBridgeReadinessSnapshot(parts.readinessResponse)
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
  const vehicleProfile = buildSelectedObdVehicleProfile()
    || previousSession.vehicleProfile
    || null;
  const vehicleApplicability = buildSelectedObdVehicleApplicability(vehicleProfile)
    || previousSession.vehicleApplicability
    || null;
  const readoutInterface = previousSession.readoutInterface
    || previousSession.readout_interface
    || buildSelectedObdReadoutInterface();
  const previousDiagnosticFlowSummary = previousSession.diagnosticFlowSummary || previousSession.diagnostic_flow_summary || null;
  const previousCoreSessionStatus = previousSession.coreSessionStatus || previousSession.core_session_status || null;
  const previousNextReadoutCandidates = previousSession.nextReadoutCandidates || previousSession.next_readout_candidates || previousDiagnosticFlowSummary?.nextReadoutCandidates || previousDiagnosticFlowSummary?.next_readout_candidates || previousCoreSessionStatus?.nextReadoutCandidates || previousCoreSessionStatus?.next_readout_candidates || null;
  const previousNextReadoutRequest = previousSession.nextReadoutRequest || previousSession.next_readout_request || previousDiagnosticFlowSummary?.nextReadoutRequest || previousDiagnosticFlowSummary?.next_readout_request || previousCoreSessionStatus?.nextReadoutRequest || previousCoreSessionStatus?.next_readout_request || previousCoreSessionStatus?.nextReadoutSummary?.readoutRequest || previousCoreSessionStatus?.next_readout_summary?.readout_request || null;
  const previousNextReadoutRequestSafetySummary = previousSession.nextReadoutRequestSafetySummary || previousSession.next_readout_request_safety_summary || previousDiagnosticFlowSummary?.nextReadoutRequestSafetySummary || previousDiagnosticFlowSummary?.next_readout_request_safety_summary || previousCoreSessionStatus?.nextReadoutRequestSafetySummary || previousCoreSessionStatus?.next_readout_request_safety_summary || null;
  const previousNextReadoutReasonSummary = previousSession.nextReadoutReasonSummary || previousSession.next_readout_reason_summary || previousDiagnosticFlowSummary?.nextReadoutReasonSummary || previousDiagnosticFlowSummary?.next_readout_reason_summary || previousCoreSessionStatus?.nextReadoutReasonSummary || previousCoreSessionStatus?.next_readout_reason_summary || null;
  const previousNextReadoutCandidateSafetySummary = previousSession.nextReadoutCandidateSafetySummary || previousSession.next_readout_candidate_safety_summary || previousDiagnosticFlowSummary?.nextReadoutCandidateSafetySummary || previousDiagnosticFlowSummary?.next_readout_candidate_safety_summary || previousCoreSessionStatus?.nextReadoutCandidateSafetySummary || previousCoreSessionStatus?.next_readout_candidate_safety_summary || null;
  const previousReadoutRequestPlanSummary = previousSession.readoutRequestPlanSummary || previousSession.readout_request_plan_summary || previousDiagnosticFlowSummary?.readoutRequestPlanSummary || previousDiagnosticFlowSummary?.readout_request_plan_summary || previousCoreSessionStatus?.readoutRequestPlanSummary || previousCoreSessionStatus?.readout_request_plan_summary || null;
  const livePidTimeline = window.ObdReadOnly.normalizeLivePidTimeline({
    samples: [
      ...(previousSession.livePidTimeline?.samples || previousSession.live_pid_timeline?.samples || []),
      ...(parts.livePidResponse ? [{
        livePidSnapshot,
        observationCondition: livePidSnapshot?.observationCondition
          || livePidSnapshot?.observation_condition
          || obdLiveObservationCondition?.value
          || "unspecified",
        adapterIdentity: obdDevSession.adapterIdentity || previousSession.adapterIdentity || previousSession.adapter_identity || undefined
      }] : [])
    ]
  });
  const observationContext = mergeObdObservationContexts(
    previousSession.observationContext || previousSession.observation_context,
    livePidSnapshot?.observationContext || livePidSnapshot?.observation_context || livePidSnapshot?.observationCondition || livePidSnapshot?.observation_condition,
    parts.observationContext || parts.observation_context,
    buildSelectedObdObservationContext()
  );
  const importResult = window.ObdReadOnly.buildBridgeDiagnosticImport({
    dtcSnapshot: dtcSnapshot || undefined,
    livePidSnapshot: livePidSnapshot || undefined,
    readinessSnapshot: readinessSnapshot || undefined,
    freezeFrameSnapshot: freezeFrameSnapshot || undefined,
    ecuInfoSnapshot: ecuInfoSnapshot || undefined,
    onboardMonitorSnapshot: onboardMonitorSnapshot || undefined,
    supportedPidMatrix: supportedPidMatrix || undefined,
    vehicleProfile: vehicleProfile || undefined,
    vehicleApplicability: vehicleApplicability || undefined,
    observationContext: observationContext || undefined,
    readoutInterface,
    connectionStatus: obdDevSession.bridgeStatus || previousSession.connectionStatus || undefined,
    vciList: obdDevSession.bridgeVciList || (Array.isArray(previousSession.vciDevices) ? { devices: previousSession.vciDevices } : undefined),
    adapterIdentity: obdDevSession.adapterIdentity || previousSession.adapterIdentity || undefined,
    nextReadoutCandidates: previousNextReadoutCandidates || undefined,
    nextReadoutRequest: previousNextReadoutRequest || undefined,
    nextReadoutRequestSafetySummary: previousNextReadoutRequestSafetySummary || undefined,
    nextReadoutReasonSummary: previousNextReadoutReasonSummary || undefined,
    nextReadoutCandidateSafetySummary: previousNextReadoutCandidateSafetySummary || undefined,
    readoutRequestPlanSummary: previousReadoutRequestPlanSummary || undefined,
    toolHints: previousSession.toolHints || undefined,
    sourceLength: previousSession.sourceLength || undefined,
    hadSensitiveIdentifier: previousSession.hadSensitiveIdentifier === true
  });
  const session = window.ObdReadOnly.buildDiagnosticScanSession({
    session_id: "local-bridge-dev-readout",
    startedAt: previousSession.startedAt || importResult.startedAt || undefined,
    endedAt: previousSession.endedAt || importResult.endedAt || undefined,
    protocol: importResult.protocol || previousSession.protocol || undefined,
    capturedAt: importResult.capturedAt || previousSession.capturedAt || undefined,
    dtcSnapshot: dtcSnapshot || { dtcs: [] },
    livePidSnapshot: livePidSnapshot || { values: [] },
    livePidTimeline,
    readinessSnapshot: readinessSnapshot || { monitors: [] },
    freezeFrameSnapshot: freezeFrameSnapshot || { values: [] },
    ecuInfoSnapshot: ecuInfoSnapshot || { values: [] },
    onboardMonitorSnapshot: onboardMonitorSnapshot || { tests: [] },
    supportedPidMatrix: supportedPidMatrix || { supported_pids: [] },
    ecuResponseSummary: importResult.ecuResponseSummary,
    readoutCoverage: importResult.readoutCoverage || importResult.bridgeSession?.readoutCoverage,
    nextReadoutCandidates: importResult.nextReadoutCandidates || importResult.next_readout_candidates || importResult.bridgeSession?.nextReadoutCandidates || importResult.bridgeSession?.next_readout_candidates || previousNextReadoutCandidates,
    nextReadoutRequest: importResult.nextReadoutRequest || importResult.next_readout_request || importResult.bridgeSession?.nextReadoutRequest || importResult.bridgeSession?.next_readout_request || previousNextReadoutRequest,
    nextReadoutRequestSafetySummary: importResult.nextReadoutRequestSafetySummary || importResult.next_readout_request_safety_summary || importResult.bridgeSession?.nextReadoutRequestSafetySummary || importResult.bridgeSession?.next_readout_request_safety_summary || previousNextReadoutRequestSafetySummary,
    nextReadoutReasonSummary: importResult.nextReadoutReasonSummary || importResult.next_readout_reason_summary || importResult.bridgeSession?.nextReadoutReasonSummary || importResult.bridgeSession?.next_readout_reason_summary || previousNextReadoutReasonSummary,
    nextReadoutCandidateSafetySummary: importResult.nextReadoutCandidateSafetySummary || importResult.next_readout_candidate_safety_summary || importResult.bridgeSession?.nextReadoutCandidateSafetySummary || importResult.bridgeSession?.next_readout_candidate_safety_summary || previousNextReadoutCandidateSafetySummary,
    readoutRequestPlanSummary: importResult.readoutRequestPlanSummary || importResult.readout_request_plan_summary || importResult.bridgeSession?.readoutRequestPlanSummary || importResult.bridgeSession?.readout_request_plan_summary || previousReadoutRequestPlanSummary,
    connectionStatus: importResult.connectionStatus || importResult.bridgeSession?.connectionStatus,
    vciDevices: importResult.vciDevices || importResult.bridgeSession?.vciDevices,
    vehicleProfile: vehicleProfile || importResult.vehicleProfile || importResult.bridgeSession?.vehicleProfile || undefined,
    vehicleApplicability: vehicleApplicability || importResult.vehicleApplicability || importResult.bridgeSession?.vehicleApplicability || undefined,
    observationContext: observationContext || importResult.observationContext || importResult.observation_context || importResult.bridgeSession?.observationContext || importResult.bridgeSession?.observation_context || undefined,
    readoutInterface: importResult.readoutInterface || importResult.readout_interface || importResult.bridgeSession?.readoutInterface || importResult.bridgeSession?.readout_interface || readoutInterface,
    adapterIdentity: importResult.adapterIdentity || importResult.bridgeSession?.adapterIdentity || obdDevSession.adapterIdentity || previousSession.adapterIdentity || undefined,
    toolHints: importResult.toolHints || importResult.bridgeSession?.toolHints || previousSession.toolHints || undefined,
    sourceLength: importResult.sourceLength || importResult.bridgeSession?.sourceLength || previousSession.sourceLength || undefined,
    hadSensitiveIdentifier: importResult.hadSensitiveIdentifier === true || importResult.bridgeSession?.hadSensitiveIdentifier === true || previousSession.hadSensitiveIdentifier === true,
    warnings: importResult.warnings || importResult.bridgeSession?.warnings || previousSession.warnings || undefined
  });
  obdDevSession.lastSession = session;
  handleObdReadoutSessionReplacement();
  const monitorValues = livePidSnapshot?.monitorValues || [];
  const freezeFrameValues = freezeFrameSnapshot?.monitorValues || [];
  const currentCodes = currentDtcSnapshot?.dtcs?.filter((item) => item?.code) || [];
  const currentDtcReadoutStatus = currentDtcSnapshot?.dtcReadoutStatus || currentDtcSnapshot?.dtc_readout_status || null;
  const currentDtcResponseFormats = currentDtcSnapshot?.dtcResponseFormats || currentDtcSnapshot?.dtc_response_formats || [currentDtcSnapshot?.dtcResponseFormat || currentDtcSnapshot?.dtc_response_format].filter(Boolean);
  const currentDtcResponseFormatLabel = formatObdDtcResponseFormat(currentDtcResponseFormats, "");
  const currentReportedDtcEcuCountLabel = formatObdReportedDtcEcuCountSummary(currentDtcSnapshot);

  renderObdBridgeMeasurementValues(livePidSnapshot, freezeFrameSnapshot);
  if (currentCodes.length) {
    obdDetectedCodes.innerHTML = "";
    [...new Map(dtcSnapshot.dtcs.filter((item) => item?.code).map((item) => [buildObdDtcDisplayKey(item), item])).values()].forEach((item) => obdDetectedCodes.appendChild(createObdDtcCard(item, dtcSnapshot.dtcs, session.vehicleProfile || session.vehicle_profile || null)));
    const statusSummary = formatObdBridgeDtcStatusSummary(dtcSnapshot.dtcs);
    obdImportStatus.textContent = `${currentCodes.length}件のブリッジDTCを読取りました。累計${dtcSnapshot.dtcs.length}件です。${statusSummary}`;
  } else if (currentDtcReadoutStatus === "unparsed") {
    const formatSuffix = currentDtcResponseFormatLabel ? ` ${currentDtcResponseFormatLabel}。` : "";
    obdImportStatus.textContent = `ブリッジDTC応答を受け取りましたが、内容は未解析です。${formatSuffix}DTCは0件として扱いません。`;
  } else if (currentDtcReadoutStatus === "blocked") {
    obdImportStatus.textContent = "ブリッジDTC読取は遮断されました。DTCは0件として扱いません。";
  } else if (currentReportedDtcEcuCountLabel) {
    obdImportStatus.textContent = `ブリッジDTC件数応答を取得しました。${currentReportedDtcEcuCountLabel}。個別DTC一覧は未展開です。`;
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
      ? `ブリッジECU情報を${ecuInfoSnapshot.itemCount || 0}項目読取りました。${keySummary}${missingKeySummary}${supportedTypeSummary}${unsupportedSummary}`.trim()
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
  } else if (parts.readinessResponse && readinessSnapshot) {
    obdImportStatus.textContent = readinessSnapshot.monitorCount
      ? `ブリッジレディネスを${readinessSnapshot.monitorCount}項目読取りました。${formatObdBridgeReadinessSummary(readinessSnapshot, { includeObservedCount: true })}`.trim()
      : "ブリッジレディネス応答を受け取りました。項目は0件です。";
  } else if (parts.livePidResponse) {
    obdImportStatus.textContent = monitorValues.length
      ? `ブリッジライブ値を${monitorValues.length}項目読取りました。`
      : "ブリッジライブ値応答を受け取りました。項目は0件です。";
  }
  renderObdDeveloperSessionSummary(session);
  renderObdStageView("results");
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

function formatObdReportedDtcEcuCountSummary(snapshot = null, fallback = "") {
  const ecuResponses = Array.isArray(snapshot?.ecuResponses)
    ? snapshot.ecuResponses
    : Array.isArray(snapshot?.ecu_responses)
      ? snapshot.ecu_responses
      : [];
  const entries = ecuResponses.map((response) => {
    const count = response?.codeCount ?? response?.code_count ?? response?.dtcCount ?? response?.dtc_count ?? null;
    if (!Number.isFinite(Number(count)) || Number(count) <= 0) return null;
    const ecu = String(response?.ecuName || response?.ecu_name || response?.ecu || response?.ecu_id || response?.ecuId || response?.address || response?.module || response?.module_id || response?.moduleId || "ECU").trim() || "ECU";
    const intentLabel = {
      read_stored_dtc: "保存DTC",
      read_pending_dtc: "保留DTC",
      read_permanent_dtc: "永久DTC"
    }[response?.intent] || "";
    return `${intentLabel ? `${intentLabel} ` : ""}${ecu}: ${Math.round(Number(count))}件`;
  }).filter(Boolean);
  return entries.length ? entries.join(" / ") : fallback;
}

function formatObdReportedDtcStatusSummary(snapshot = null, fallback = "") {
  const summary = snapshot?.dtcReportedStatusSummary || snapshot?.dtc_reported_status_summary || null;
  const counts = Array.isArray(summary?.counts)
    ? summary.counts
    : Array.isArray(summary?.status_counts) ? summary.status_counts : [];
  const entries = counts.flatMap((item) => {
    const status = String(item?.status || "").trim();
    const count = Number(item?.count);
    return status && Number.isSafeInteger(count) && count > 0 ? [`${status} ${count}件`] : [];
  });
  return entries.length ? entries.join(" / ") : fallback;
}

function formatObdBridgeDtcStatusLabel(status = "unknown") {
  return {
    stored: "保存",
    pending: "保留",
    permanent: "永久",
    unknown: "不明"
  }[status] || status;
}

function formatObdDtcReadoutStatusSummary(summary = null, fallback = NO_DATA) {
  if (!summary || typeof summary !== "object") return fallback;
  const readList = (camelKey, snakeKey) => Array.isArray(summary[camelKey])
    ? summary[camelKey]
    : Array.isArray(summary[snakeKey]) ? summary[snakeKey] : [];
  const formatStatuses = (statuses) => statuses
    .map((status) => formatObdBridgeDtcStatusLabel(status))
    .filter(Boolean)
    .join(" / ");
  const reported = formatStatuses(readList("reportedStatuses", "reported_statuses"));
  const countOnly = formatStatuses(readList("reportedCountOnlyStatuses", "reported_count_only_statuses"));
  const empty = formatStatuses(readList("emptyStatuses", "empty_statuses"));
  const unreported = formatStatuses(readList("unreportedStatuses", "unreported_statuses"));
  const parts = [];
  if (countOnly) parts.push(`件数応答 ${countOnly}`);
  if (reported) parts.push(`取得 ${reported}`);
  if (empty) parts.push(`空 ${empty}`);
  if (unreported) parts.push(`未読取 ${unreported}`);
  return parts.length ? parts.join(" / ") : fallback;
}

function formatObdReadoutStatus(status = null, fallback = NO_DATA) {
  return {
    reported: "取得済み",
    unparsed: "応答未解析",
    blocked: "読取拒否",
    unknown: "状態未確認"
  }[String(status || "").trim().toLowerCase()] || fallback;
}

function formatObdBridgeCompositeValue(value, depth = 0) {
  if (value === null || value === undefined || value === "") return NO_DATA;
  if (Array.isArray(value)) {
    const items = value
      .map((item) => formatObdBridgeCompositeValue(item, depth + 1))
      .filter((item) => item && item !== NO_DATA);
    if (!items.length) return NO_DATA;
    const visible = items.slice(0, 4).join(" / ");
    return items.length > 4 ? `${visible} ... (${items.length}件)` : visible;
  }
  if (typeof value === "object") {
    if (depth >= 1) return "[詳細]";
    const entries = Object.entries(value)
      .filter(([, item]) => item !== null && item !== undefined && item !== "")
      .slice(0, 4)
      .map(([key, item]) => `${key}:${formatObdBridgeCompositeValue(item, depth + 1)}`);
    return entries.length ? entries.join(" / ") : NO_DATA;
  }
  return String(value);
}

function renderObdBridgeMeasurementValues(livePidSnapshot, freezeFrameSnapshot) {
  const values = livePidSnapshot?.monitorValues || [];
  renderObdMonitorValues(values, livePidSnapshot?.monitorInsights || []);
  if (!values.length && freezeFrameSnapshot?.monitorValues?.length) {
    obdMonitorStatus.textContent = "表示できるライブ値はありません。フリーズフレームは「FF・ECU」に表示します。";
  }
}

function formatObdFreezeFrameValueLine(item = {}) {
  const ecu = item.sourceEcu || item.source_ecu || "ECU未記録";
  const frameNumber = item.freezeFrameNumber ?? item.freeze_frame_number;
  const frame = Number.isInteger(frameNumber) && frameNumber >= 0 ? `FF #${frameNumber}` : "FF番号未記録";
  const raw = item.decoded === false || item.undecodedRaw === true ? " / 未換算" : "";
  return `${item.label || item.id || "項目"}: ${formatObdBridgeReadoutValue(item)} [${ecu} / ${frame}]${raw}`;
}

function formatObdBridgeReadoutValue(item = {}) {
  const value = item.value ?? item.result ?? item.raw ?? NO_DATA;
  const formattedValue = formatObdBridgeCompositeValue(value);
  const isScalarValue = !Array.isArray(value) && (!value || typeof value !== "object");
  const unit = isScalarValue && item.unit ? ` ${item.unit}` : "";
  return `${formattedValue}${unit}`;
}

function formatObdBridgeMonitorSummary(summary = null) {
  if (!summary?.totalCount) return NO_DATA;
  const parts = [`${summary.totalCount}項目`];
  if (summary.outOfRangeCount > 0) parts.push(`範囲外${summary.outOfRangeCount}`);
  if (summary.decodedCount > 0) parts.push(`変換済み${summary.decodedCount}`);
  if (summary.undecodedRawCount > 0) parts.push(`未変換${summary.undecodedRawCount}`);
  return parts.join(" / ");
}

function formatObdBridgeEcuKeySummary(summary = null) {
  if (!summary?.totalCount) return NO_DATA;
  const missing = summary.missingLabels?.slice(0, 3).join(" / ");
  return `${summary.capturedCount}/${summary.totalCount}${missing ? ` / 未取得 ${missing}` : ""}`;
}

function formatObdEcuSupportCapture(snapshot = null) {
  const captured = snapshot?.supportInfoTypesCaptured ?? snapshot?.support_info_types_captured;
  return captured === true ? "取得済み" : captured === false ? "未取得" : "未確認";
}

function formatObdEcuInfoItemLine(item = {}) {
  const ecu = item.sourceEcu || item.source_ecu || "ECU未記録";
  const did = item.dataIdentifier || item.data_identifier;
  const infoType = item.infoType || item.info_type;
  const identifier = did ? ` / DID 0x${did}` : infoType ? ` / Mode09 タイプ ${infoType}` : "";
  const sensitive = item.privacyClass === "sensitive_identifier" || item.privacy_class === "sensitive_identifier";
  const value = sensitive ? "識別情報（非表示）" : item.value == null || item.value === "" ? NO_DATA
    : typeof item.value === "object" ? JSON.stringify(item.value) : String(item.value);
  return `[${ecu}] ${item.label || item.id || "項目"}${identifier}: ${value}`;
}

function buildObdEcuInfoDisplayLines(snapshot = null) {
  const items = snapshot?.items || [];
  const ecus = snapshot?.ecuInfoEcuSnapshots || snapshot?.ecu_info_ecu_snapshots || [];
  const status = snapshot?.ecuInfoReadoutStatus || snapshot?.ecu_info_readout_status;
  if (!items.length && !ecus.length && !(snapshot?.itemCount > 0)
    && !["reported", "blocked", "unparsed"].includes(status) && formatObdEcuSupportCapture(snapshot) !== "取得済み") return [];
  const keySummary = snapshot?.keyItemSummary;
  const supported = snapshot?.supportInfoTypesSummary || snapshot?.support_info_types_summary;
  const expected = summarizeObdExpectedItems(snapshot?.expectedItems || []);
  const lines = [
    `記録項目数: ${snapshot?.itemCount ?? items.length} / 表示明細: ${items.length}`,
    `Mode09対応情報タイプ00: ${formatObdEcuSupportCapture(snapshot)}`
  ];
  (ecus.length ? ecus : [snapshot]).forEach((group) => {
    const ecu = group.sourceEcu || group.source_ecu || "ECU未記録";
    lines.push(`[${ecu}] 読取状態: ${formatObdReadoutStatus(group.ecuInfoReadoutStatus || group.ecu_info_readout_status, "状態未確認")}`);
    const service = group.ecuInfoNegativeResponseService || group.ecu_info_negative_response_service;
    const code = group.ecuInfoNegativeResponseCode || group.ecu_info_negative_response_code;
    if (service || code) lines.push(`[${ecu}] 負応答: サービス ${service || NO_DATA} / NRC ${code || NO_DATA}`);
    const errors = group.errorCodes || group.error_codes || [];
    errors.forEach((error) => lines.push(`[${ecu}] ${formatReadoutErrorCodes([error])}`));
  });
  lines.push(...items.map(formatObdEcuInfoItemLine));
  if (!items.length) lines.push("項目明細: 登録データなし");
  lines.push(`主要要約: ${formatObdBridgeEcuKeySummary(keySummary)}`);
  if (expected.totalCount) lines.push(`取得状況: ${expected.capturedCount}/${expected.totalCount}`);
  if (supported?.count) {
    lines.push(`対応タイプ00: ${supported.count}件`);
    lines.push(`対応: ${(supported.labels || []).join(" / ") || NO_DATA}`);
  }
  if (keySummary?.totalCount) {
    lines.push(`主要項目: ${keySummary.capturedCount}/${keySummary.totalCount}`);
    lines.push(`取得: ${keySummary.capturedLabels?.length ? keySummary.capturedLabels.join(" / ") : "なし"}`);
    lines.push(`未取得: ${keySummary.missingLabels?.length ? keySummary.missingLabels.join(" / ") : "なし"}`);
  }
  if (expected.missingCount) lines.push(`未取得用途: ${formatObdExpectedItemPreview(expected.missing, "diagnosticUse", 3)}`);
  return lines;
}

function buildObdEcuResponseDisplayLines(summary = null, indexOffset = 0) {
  const rows = summary?.ecus || [];
  if (!rows.length) return [];
  const lines = [`応答記録: ${rows.length}件`];
  const statusLabels = {
    reported: "応答取得", responded: "応答取得", response: "応答取得", ok: "応答取得",
    success: "応答取得", available: "応答取得", positive: "肯定応答", positive_response: "肯定応答",
    negative_response: "負応答", pending_response: "応答保留", no_response: "無応答",
    unparsed: "応答未解析", blocked: "読取拒否", unknown: "状態未確認"
  };
  const formatCount = (value) => Number.isInteger(value) && value >= 0 ? String(value) : "未記録";
  rows.forEach((row, index) => {
    const address = row.address || "ECUアドレス未記録";
    const label = row.name || row.id || "名称未記録";
    const status = row.status == null || row.status === "" ? "unknown" : String(row.status);
    const statusKey = status.trim().toLowerCase().replace(/[\s-]+/g, "_");
    const prefix = `#${indexOffset + index + 1} [${address}]`;
    const statusLabel = Object.prototype.hasOwnProperty.call(statusLabels, statusKey) ? statusLabels[statusKey] : "未分類";
    lines.push(`${prefix} ${label} / 記録状態: ${statusLabel} (${status})`);
    if (row.id && row.id !== row.address && row.id !== row.name) lines.push(`${prefix} 記録ID: ${row.id}`);
    lines.push(`${prefix} 報告DTC件数: ${formatCount(row.dtcCount ?? row.dtc_count)} / 応答回数: ${formatCount(row.responseCount ?? row.response_count)}`);
    lines.push(`${prefix} 記録の負応答集計: ${formatCount(row.negativeResponseCount ?? row.negative_response_count)} / うち保留: ${formatCount(row.pendingNegativeResponseCount ?? row.pending_negative_response_count)}`);
    const services = row.services || [];
    const responseServices = row.responseServices || row.response_services || [];
    const negativeServices = row.negativeRequestedServices || row.negative_requested_services || [];
    const negativeLabels = row.negativeResponseLabels || row.negative_response_labels || [];
    lines.push(`${prefix} 記録サービス: ${services.length ? services.join(", ") : "未記録"} / 応答サービス: ${responseServices.length ? responseServices.join(", ") : "未記録"}`);
    if (negativeServices.length) lines.push(`${prefix} 負応答対象サービス: ${negativeServices.join(", ")}`);
    if (negativeLabels.length) lines.push(`${prefix} 負応答記録: ${negativeLabels.join(" / ")}`);
    const metadata = [
      ["読取区分", row.readoutSection || row.readout_section],
      ["読取種別", row.readoutKind || row.readout_kind],
      ["試行ID", row.readoutAttemptId || row.readout_attempt_id],
      ["通信", row.protocol],
      ["記録時刻", row.capturedAt || row.captured_at]
    ].filter(([, value]) => value != null && value !== "");
    if (metadata.length) lines.push(`${prefix} ${metadata.map(([key, value]) => `${key}: ${value}`).join(" / ")}`);
  });
  return lines;
}

function createObdEcuResponseCard(summary = null) {
  const card = document.createElement("article");
  card.className = "obd-session-detail-card obd-ecu-response-card";
  const heading = document.createElement("strong");
  heading.textContent = "ECU応答";
  const toolbar = document.createElement("div");
  toolbar.className = "obd-monitor-filter";
  const label = document.createElement("label");
  label.htmlFor = "obdEcuResponseSearch";
  label.textContent = "ECU応答検索";
  const searchRow = document.createElement("div");
  searchRow.className = "obd-monitor-search-row";
  const input = document.createElement("input");
  input.id = "obdEcuResponseSearch";
  input.type = "search";
  input.maxLength = 100;
  input.autocomplete = "off";
  input.placeholder = "ECU / アドレス / 記録内の文字列";
  input.setAttribute("aria-controls", "obdEcuResponseRecords");
  const statusLabel = document.createElement("label");
  statusLabel.htmlFor = "obdEcuResponseStatus";
  statusLabel.textContent = "記録状態";
  const status = document.createElement("select");
  status.id = "obdEcuResponseStatus";
  status.setAttribute("aria-controls", "obdEcuResponseRecords");
  const allStatuses = document.createElement("option");
  allStatuses.value = "";
  allStatuses.textContent = "すべて";
  status.appendChild(allStatuses);
  const statuses = new Set();
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "secondary-button";
  clear.textContent = "\u00d7";
  clear.title = "ECU応答検索を解除";
  clear.setAttribute("aria-label", clear.title);
  const count = document.createElement("p");
  count.className = "data-status";
  count.setAttribute("role", "status");
  const empty = document.createElement("p");
  empty.className = "empty-state";
  empty.textContent = "検索に一致する応答記録はありません。";
  const list = document.createElement("ul");
  list.id = "obdEcuResponseRecords";
  const normalize = (value) => String(value || "").normalize("NFKC").toLowerCase();
  const records = (summary?.ecus || []).map((row, index) => {
    const lines = buildObdEcuResponseDisplayLines({ ecus: [row] }, index).slice(1);
    const item = document.createElement("li");
    item.className = "obd-ecu-response-record";
    lines.forEach((line) => {
      const detail = document.createElement("div");
      detail.textContent = line;
      item.appendChild(detail);
    });
    list.appendChild(item);
    const recordedStatus = row.status == null || row.status === "" ? "unknown" : String(row.status);
    if (!statuses.has(recordedStatus)) {
      const option = document.createElement("option");
      option.value = recordedStatus;
      option.textContent = recordedStatus;
      status.appendChild(option);
      statuses.add(recordedStatus);
    }
    return { item, recordedStatus, searchText: normalize(lines.join(" ")) };
  });
  const refresh = () => {
    const terms = normalize(input.value).trim().split(/\s+/).filter(Boolean);
    let visible = 0;
    records.forEach(({ item, recordedStatus, searchText }) => {
      item.hidden = (status.value !== "" && status.value !== recordedStatus) || !terms.every((term) => searchText.includes(term));
      if (!item.hidden) visible += 1;
    });
    clear.disabled = input.value.length === 0 && status.value === "";
    count.textContent = terms.length || status.value ? `絞込中: ${visible} / ${records.length}応答記録` : `全${records.length}応答記録を表示`;
    empty.hidden = visible > 0;
  };
  input.addEventListener("input", refresh);
  status.addEventListener("change", refresh);
  clear.addEventListener("click", () => { input.value = ""; status.value = ""; refresh(); input.focus(); });
  searchRow.append(input, clear);
  toolbar.append(label, searchRow, statusLabel, status, count);
  card.append(heading, toolbar, empty, list);
  refresh();
  return card;
}

function buildObdSupportedPidDisplayLines(snapshot = null) {
  const pids = snapshot?.supportedPids || snapshot?.supported_pids || [];
  const pages = snapshot?.supportedPidPageBases || snapshot?.supported_pid_page_bases || [];
  const ecus = snapshot?.supportedPidEcuSnapshots || snapshot?.supported_pid_ecu_snapshots || [];
  const status = snapshot?.supportedPidReadoutStatus || snapshot?.supported_pid_readout_status;
  const errors = snapshot?.errorCodes || snapshot?.error_codes || [];
  if (!pids.length && !pages.length && !ecus.length && !errors.length && !["reported", "blocked", "unparsed"].includes(status)) return [];
  const scope = snapshot?.supportedPidAggregationScope || snapshot?.supported_pid_aggregation_scope;
  const scopeLabel = { single_ecu: "単一ECU", multiple_ecus_union: "複数ECUの和集合", unspecified: "未確認" }[scope] || "未確認";
  const lines = [
    `記録上の集約範囲: ${scopeLabel}`,
    `全体の読取状態: ${formatObdReadoutStatus(status, "状態未確認")}`,
    `集約記録PID: ${pids.length}件${pids.length ? ` / ${pids.join(", ")}` : " / 記録なし"}`,
    `集約記録ページ: ${pages.length ? pages.join(" / ") : "未記録"}`
  ];
  if (ecus.length) {
    const ecuIds = new Set(ecus.map((group) => group.sourceEcu || group.source_ecu).filter(Boolean));
    lines.push(`明細: 識別済みECU ${ecuIds.size} / 応答 ${ecus.length}`);
  }
  errors.forEach((error) => lines.push(`全体: ${formatReadoutErrorCodes([error])}`));
  (ecus.length ? ecus : [snapshot]).forEach((group) => {
    const ecu = group.sourceEcu || group.source_ecu || "ECU未記録";
    const groupStatus = group.supportedPidReadoutStatus || group.supported_pid_readout_status;
    const groupPids = group.supportedPids || group.supported_pids || [];
    const groupPages = group.supportedPidPageBases || group.supported_pid_page_bases || [];
    const groupErrors = group.errorCodes || group.error_codes || [];
    lines.push(`[${ecu}] 読取状態: ${formatObdReadoutStatus(groupStatus, "状態未確認")}`);
    const label = groupStatus === "reported" ? "対応PID" : "記録PID（対応未確認）";
    lines.push(`[${ecu}] ${label}: ${groupPids.length}件${groupPids.length ? ` / ${groupPids.join(", ")}` : " / 記録なし"}`);
    lines.push(`[${ecu}] 記録ページ: ${groupPages.length ? groupPages.join(" / ") : "未記録"}`);
    groupErrors.forEach((error) => lines.push(`[${ecu}] ${formatReadoutErrorCodes([error])}`));
  });
  return lines;
}

function formatObdBridgeOnboardMonitorSummary(snapshot = null) {
  if (!snapshot?.testCount) return NO_DATA;
  const parts = [`${snapshot.testCount}件`];
  if (snapshot.passedCount > 0) parts.push(`合格${snapshot.passedCount}`);
  if (snapshot.failedCount > 0) parts.push(`不合格${snapshot.failedCount}`);
  if (snapshot.unknownCount > 0) parts.push(`未判定${snapshot.unknownCount}`);
  return parts.join(" / ");
}

function formatObdOnboardMonitorTestLine(item = {}) {
  const testId = item.testId ?? item.tid ?? "未記録";
  const componentId = item.componentId ?? item.cid ?? "未記録";
  const ecu = item.sourceEcu || item.source_ecu || "ECU未記録";
  const status = item.status === "pass" ? "合格" : item.status === "fail" ? "不合格"
    : !item.status || item.status === "unknown" ? "未判定" : `未判定 (${item.status})`;
  const min = formatObdBridgeReadoutValue({ value: item.min, unit: item.min == null ? null : item.unit });
  const max = formatObdBridgeReadoutValue({ value: item.max, unit: item.max == null ? null : item.unit });
  return `[${ecu}] TID ${testId} / CID ${componentId}: 記録値 ${formatObdBridgeReadoutValue(item)} / 下限 ${min} / 上限 ${max} / 記録判定: ${status}`;
}

function buildObdOnboardMonitorDisplayLines(snapshot = null) {
  const tests = snapshot?.tests || [];
  const ecuSnapshots = snapshot?.onboardMonitorEcuSnapshots || snapshot?.onboard_monitor_ecu_snapshots || [];
  const summaryOnly = !tests.length && snapshot?.testCount > 0;
  if (!tests.length && !ecuSnapshots.length && !summaryOnly) return [];
  const lines = [`${summaryOnly ? "記録された集計（検査明細なし）" : "要約"}: ${formatObdBridgeOnboardMonitorSummary(snapshot)}`];
  (ecuSnapshots.length ? ecuSnapshots : [snapshot]).forEach((group) => {
    const ecu = group.sourceEcu || group.source_ecu || "ECU未記録";
    lines.push(`${ecu}: ${formatObdReadoutStatus(group.onboardMonitorReadoutStatus || group.onboard_monitor_readout_status, "状態未確認")}`);
    if (ecuSnapshots.length && !group.tests?.length && group.testCount > 0) {
      lines.push(`${ecu}: 記録された集計（検査明細なし）: ${formatObdBridgeOnboardMonitorSummary(group)}`);
    }
  });
  lines.push(...tests.map(formatObdOnboardMonitorTestLine));
  if (!tests.length) lines.push("検査明細: 登録データなし");
  lines.push("TID/CIDの意味と単位は車種別の整備書で確認してください。記録判定は車両全体の正常・異常を示すものではありません。");
  return lines;
}

function summarizeObdBridgeReadiness(snapshot = null) {
  const monitors = Array.isArray(snapshot?.monitors) ? snapshot.monitors : [];
  const knownMonitors = Array.isArray(snapshot?.knownMonitors) ? snapshot.knownMonitors : [];
  const readinessEcuSnapshots = Array.isArray(snapshot?.readinessEcuSnapshots)
    ? snapshot.readinessEcuSnapshots
    : Array.isArray(snapshot?.readiness_ecu_snapshots)
      ? snapshot.readiness_ecu_snapshots
      : [];
  const supportedCount = monitors.filter((item) => item?.supported === true).length;
  const completeCount = monitors.filter((item) => item?.supported === true && item?.complete === true).length;
  const incompleteCount = monitors.filter((item) => item?.supported === true && item?.complete === false).length;
  const completionUnknownCount = monitors.filter((item) => item?.supported === true && (item?.complete === null || item?.complete === undefined)).length;
  const unsupportedCount = monitors.filter((item) => item?.supported === false).length;
  const supportUnknownCount = monitors.filter((item) => item?.supported === null || item?.supported === undefined).length;
  const unknownCount = knownMonitors.filter((item) => item?.observed === false).length;
  return {
    monitorCount: monitors.length,
    supportedCount,
    completeCount,
    incompleteCount,
    completionUnknownCount,
    unsupportedCount,
    supportUnknownCount,
    unknownCount,
    readinessEcuSnapshotCount: readinessEcuSnapshots.length
  };
}

function formatObdBridgeReadinessSummary(snapshot = null, options = {}) {
  const { includeObservedCount = false } = options;
  const summary = summarizeObdBridgeReadiness(snapshot);
  if (summary.readinessEcuSnapshotCount > 1) return `ECU別 ${summary.readinessEcuSnapshotCount}系統 / 集約判定なし`;
  if (!summary.monitorCount && !summary.unknownCount) return NO_DATA;
  const parts = [];
  if (includeObservedCount && summary.monitorCount > 0) parts.push(`${summary.monitorCount}項目`);
  if (summary.incompleteCount > 0) parts.push(`未完了${summary.incompleteCount}`);
  if (summary.completionUnknownCount > 0) parts.push(`完了状態不明${summary.completionUnknownCount}`);
  if (summary.completeCount > 0) parts.push(`完了${summary.completeCount}`);
  if (summary.unsupportedCount > 0) parts.push(`非対応${summary.unsupportedCount}`);
  if (summary.supportUnknownCount > 0) parts.push(`対応状態不明${summary.supportUnknownCount}`);
  if (summary.unknownCount > 0) parts.push(`未取得${summary.unknownCount}`);
  return parts.length ? parts.join(" / ") : NO_DATA;
}

function formatObdReadinessMonitorLine(item = {}) {
  const status = item.supported === false ? "非対応"
    : item.supported !== true ? "対応状態不明"
      : item.complete === true ? "完了"
        : item.complete === false ? "未完了" : "完了状態不明";
  const ecu = item.sourceEcu || item.source_ecu || "ECU未記録";
  return `${item.label || item.id || "項目"}: ${status} [${ecu}]${item.diagnosticUse ? ` / ${item.diagnosticUse}` : ""}`;
}

function buildObdReadinessDisplayLines(snapshot = null) {
  const ecuSnapshots = snapshot?.readinessEcuSnapshots || snapshot?.readiness_ecu_snapshots || [];
  if (!snapshot?.monitors?.length && !ecuSnapshots.length) return [];
  const groups = ecuSnapshots.length ? ecuSnapshots : [snapshot];
  const lines = ecuSnapshots.length > 1 ? [`ECU別 ${ecuSnapshots.length}系統 / 集約判定なし`] : [];
  groups.forEach((group) => {
    const ecu = group.sourceEcu || group.source_ecu || "ECU未記録";
    const readoutStatus = group.readinessReadoutStatus || group.readiness_readout_status;
    lines.push(`${ecu}: ${formatObdReadoutStatus(readoutStatus, "状態未確認")}`);
    lines.push(`MIL: ${group.milOn === true ? "ON" : group.milOn === false ? "OFF" : "未判定"} / ${formatObdBridgeReadinessSummary(group, { includeObservedCount: true })}`);
    const ignitionType = group.readinessIgnitionType || group.readiness_ignition_type;
    if (ignitionType === "spark" || ignitionType === "compression") {
      lines.push(`PID 01 観測点火方式: ${ignitionType === "compression" ? "圧縮着火" : "火花点火"}`);
    }
    lines.push(...(group.monitors || []).map(formatObdReadinessMonitorLine));
    if (!group.monitors?.length) lines.push("監視項目: 登録データなし");
    const unknownLabels = (group.knownMonitors || []).filter((item) => item?.observed === false).map((item) => item.label || item.id);
    if (unknownLabels.length) lines.push(`未取得: ${unknownLabels.join(" / ")}`);
  });
  return lines;
}

function summarizeObdExpectedItems(items = []) {
  const expectedItems = Array.isArray(items) ? items : [];
  const captured = expectedItems.filter((item) => item?.captured);
  const missing = expectedItems.filter((item) => !item?.captured);
  return {
    totalCount: expectedItems.length,
    capturedCount: captured.length,
    missingCount: missing.length,
    captured,
    missing
  };
}

function formatObdExpectedItemPreview(items = [], noteKey = "diagnosticUse", limit = 3) {
  const expectedItems = Array.isArray(items) ? items : [];
  return expectedItems
    .slice(0, limit)
    .map((item) => {
      const note = item?.[noteKey];
      return note ? `${item.label}: ${note}` : item.label;
    })
    .join(" / ");
}

function summarizeObdMonitorValues(values = []) {
  if (!values.length) return null;
  if (typeof window.ObdReadOnly?.buildMonitorValueSummary === "function") {
    return window.ObdReadOnly.buildMonitorValueSummary(values);
  }
  return { totalCount: values.length, outOfRangeCount: 0, decodedCount: 0, undecodedRawCount: 0 };
}

function getReadoutCoverageDisplay(coverage = null) {
  if (!coverage || typeof coverage !== "object") return null;
  if (typeof window.ObdReadOnly?.normalizeReadoutCoverageSnapshot === "function") {
    return window.ObdReadOnly.normalizeReadoutCoverageSnapshot(coverage);
  }
  const totalCategories = Number.isFinite(Number(coverage.totalCategories)) ? Math.max(0, Math.round(Number(coverage.totalCategories))) : 0;
  const availableCategories = Number.isFinite(Number(coverage.availableCategories)) ? Math.max(0, Math.round(Number(coverage.availableCategories))) : 0;
  const capturedCategories = Number.isFinite(Number(coverage.capturedCategories)) ? Math.max(0, Math.round(Number(coverage.capturedCategories))) : 0;
  return {
    ...coverage,
    totalCategories,
    availableCategories,
    capturedCategories,
    capturedPercent: Number.isFinite(Number(coverage.capturedPercent))
      ? Math.max(0, Math.min(100, Math.round(Number(coverage.capturedPercent))))
      : (totalCategories > 0 ? Math.round((capturedCategories / totalCategories) * 100) : 0),
    progressPercent: Number.isFinite(Number(coverage.progressPercent))
      ? Math.max(0, Math.min(100, Math.round(Number(coverage.progressPercent))))
      : (totalCategories > 0 ? Math.round((availableCategories / totalCategories) * 100) : 0)
  };
}

function readCoreSessionAliasValue(coreSessionStatus, camelKey, snakeKey) {
  if (!coreSessionStatus || typeof coreSessionStatus !== "object") return undefined;
  return coreSessionStatus[camelKey] ?? coreSessionStatus[snakeKey];
}

function readCoreSessionAliasArray(coreSessionStatus, camelKey, snakeKey) {
  const camelValue = coreSessionStatus?.[camelKey];
  if (Array.isArray(camelValue)) return camelValue;
  const snakeValue = coreSessionStatus?.[snakeKey];
  return Array.isArray(snakeValue) ? snakeValue : [];
}

function formatSessionCaptureIntegritySummary(summary = null, fallback = NO_DATA) {
  if (!summary || typeof summary !== "object") return fallback;
  const status = summary.status || "unknown";
  const capturedAt = summary.capturedAt || summary.captured_at || null;
  const earliestCapturedAt = summary.earliestCapturedAt || summary.earliest_captured_at || null;
  const latestCapturedAt = summary.latestCapturedAt || summary.latest_captured_at || null;
  const captureSpanSeconds = Number(summary.captureSpanSeconds ?? summary.capture_span_seconds);
  if (status === "single" && capturedAt) return formatDateTime(capturedAt);
  if (status === "range" && earliestCapturedAt && latestCapturedAt) {
    const spanLabel = Number.isFinite(captureSpanSeconds) ? ` / ${captureSpanSeconds}秒` : "";
    return `${formatDateTime(earliestCapturedAt)} -> ${formatDateTime(latestCapturedAt)}${spanLabel}`;
  }
  return fallback;
}

function formatSessionCaptureProtocolSummary(summary = null, fallback = NO_DATA) {
  if (!summary || typeof summary !== "object") return fallback;
  const protocols = Array.isArray(summary.captureProtocols)
    ? summary.captureProtocols
    : Array.isArray(summary.capture_protocols)
      ? summary.capture_protocols
      : [];
  const label = protocols.filter(Boolean).join(" / ");
  if (!label) return fallback;
  const consistency = summary.captureProtocolConsistency || summary.capture_protocol_consistency || null;
  return consistency === "mixed" ? `混在: ${label}` : label;
}

function formatCoreSessionStatusSummary(coreSessionStatus, fallback = NO_DATA) {
  if (!coreSessionStatus || typeof coreSessionStatus !== "object") return fallback;
  const completionPercentValue = readCoreSessionAliasValue(coreSessionStatus, "completionPercent", "completion_percent");
  const completionPercent = Number.isFinite(Number(completionPercentValue))
    ? Math.max(0, Math.min(100, Math.round(Number(completionPercentValue))))
    : null;
  const rawStatusLabel = {
    analysis_ready: "解析へ進行可能",
    collecting_readouts: "コア読取を継続",
    not_started: "読取待ち"
  }[coreSessionStatus.status] || coreSessionStatus.status || "";
  const remainingReadoutIds = readCoreSessionAliasArray(coreSessionStatus, "remainingReadoutIds", "remaining_readout_ids");
  const emptyReadoutIds = readCoreSessionAliasArray(coreSessionStatus, "emptyReadoutIds", "empty_readout_ids");
  const readyForAnalysis = readCoreSessionAliasValue(coreSessionStatus, "readyForAnalysis", "ready_for_analysis");
  const remainingCount = remainingReadoutIds.length;
  const emptyCount = emptyReadoutIds.length;
  const statusLabel = coreSessionStatus.status === "analysis_ready" && emptyCount > 0
    ? "コア読取完了"
    : rawStatusLabel;
  const parts = [];
  if (completionPercent !== null) parts.push(`${completionPercent}%`);
  if (statusLabel) parts.push(statusLabel);
  if (emptyCount > 0) parts.push(`空応答${emptyCount}件`);
  if (remainingCount > 0) parts.push(`残り${remainingCount}項目`);
  if (readyForAnalysis === true && emptyCount === 0) parts.push("解析準備完了");
  return parts.join(" / ") || fallback;
}

function formatCoreReadoutLabel(readoutId = "", fallback = "") {
  if (!readoutId) return fallback;
  const actionLabel = OBD_NEXT_READOUT_ACTIONS?.[readoutId]?.label;
  if (actionLabel) return actionLabel;
  return {
    dtc_snapshot: "DTC読取",
    freeze_frame_snapshot: "フリーズフレーム読取",
    readiness_snapshot: "レディネス読取",
    ecu_info_snapshot: "ECU情報読取",
    live_pid_snapshot: "ライブデータ読取",
    supported_pid_matrix: "対応PID読取",
    onboard_monitor_snapshot: "Mode06読取"
  }[readoutId] || fallback || readoutId;
}

function buildCoreReadinessHeadline(coreSessionStatus) {
  if (!coreSessionStatus || typeof coreSessionStatus !== "object") return "";
  const emptyReadoutSummary = formatCoreEmptyReadoutSummary(coreSessionStatus, 2, "");
  if (emptyReadoutSummary) return `空応答再確認: ${emptyReadoutSummary}。`;
  const blockingSummary = formatCoreBlockingWarningSummary(coreSessionStatus, 2, "");
  if (blockingSummary) return `保留要因確認: ${blockingSummary}。`;
  const readyForAnalysis = readCoreSessionAliasValue(coreSessionStatus, "readyForAnalysis", "ready_for_analysis");
  if (readyForAnalysis === true) return "解析準備完了。";
  const remainingReadoutIds = readCoreSessionAliasArray(coreSessionStatus, "remainingReadoutIds", "remaining_readout_ids");
  if (!remainingReadoutIds.length) return "";
  const labels = remainingReadoutIds
    .slice(0, 2)
    .map((item) => formatCoreReadoutLabel(item, item))
    .filter(Boolean);
  return labels.length ? `読取継続: ${labels.join(" / ")}。` : "";
}

function formatCoreBlockingWarningSummary(coreSessionStatus, limit = 2, fallback = "") {
  if (!coreSessionStatus || typeof coreSessionStatus !== "object") return fallback;
  const blockingWarningIds = readCoreSessionAliasArray(coreSessionStatus, "blockingWarningIds", "blocking_warning_ids");
  if (!blockingWarningIds.length) return fallback;
  const labels = blockingWarningIds
    .slice(0, Math.max(1, limit))
    .map((item) => formatObdBridgeWarningLabel(item))
    .filter(Boolean);
  return labels.length ? labels.join(" / ") : fallback;
}

function getNonBlockingWarningLabels(source = null, limit = 4) {
  if (!source || !Array.isArray(source.warnings) || !source.warnings.length) return [];
  const coreSessionStatus = source.coreSessionStatus || source.core_session_status || null;
  const blocked = new Set(readCoreSessionAliasArray(coreSessionStatus, "blockingWarningIds", "blocking_warning_ids"));
  return source.warnings
    .filter((item) => !blocked.has(item))
    .map((item) => formatObdBridgeWarningLabel(item))
    .filter(Boolean)
    .slice(0, Math.max(1, limit));
}

function formatCoreEmptyReadoutSummary(coreSessionStatus, limit = 2, fallback = "") {
  if (!coreSessionStatus || typeof coreSessionStatus !== "object") return fallback;
  const emptyReadoutIds = readCoreSessionAliasArray(coreSessionStatus, "emptyReadoutIds", "empty_readout_ids");
  if (!emptyReadoutIds.length) return fallback;
  const labels = emptyReadoutIds
    .slice(0, Math.max(1, limit))
    .map((item) => formatCoreReadoutLabel(item, item))
    .filter(Boolean);
  return labels.length ? labels.join(" / ") : fallback;
}

function formatWebSerialReadoutSummary(summary = null, fallback = NO_DATA) {
  if (!summary || typeof summary !== "object") return fallback;
  const attemptCount = Number(summary.attemptCount ?? summary.attempt_count ?? 0);
  if (!Number.isFinite(attemptCount) || attemptCount < 1) return fallback;
  const completedCount = Number(summary.completedCount ?? summary.completed_count ?? 0) || 0;
  const partialCount = Number(summary.partialCount ?? summary.partial_count ?? 0) || 0;
  const incompleteCount = Number(summary.incompleteCount ?? summary.incomplete_count ?? 0) || 0;
  const failedCount = Number(summary.failedCount ?? summary.failed_count ?? 0) || 0;
  const negativeResponseCount = Number(summary.negativeResponseCount ?? summary.negative_response_count ?? 0) || 0;
  const pendingNegativeResponseCount = Number(summary.pendingNegativeResponseCount ?? summary.pending_negative_response_count ?? 0) || 0;
  const noDataCount = Number(summary.noDataCount ?? summary.no_data_count ?? 0) || 0;
  const expectedEmptyCommandCount = Number(summary.expectedEmptyCommandCount ?? summary.expected_empty_command_count ?? 0) || 0;
  const timedOutCount = Number(summary.timedOutCount ?? summary.timed_out_count ?? 0) || 0;
  const unresolvedNoDataCount = Math.max(0, noDataCount - expectedEmptyCommandCount);
  const emptyResponseCount = Number(summary.emptyResponseCount ?? summary.empty_response_count ?? 0) || 0;
  const unrecognizedResponseCount = Number(summary.unrecognizedResponseCount ?? summary.unrecognized_response_count ?? 0) || 0;
  const latestAttempt = summary.latestAttempt || summary.latest_attempt || null;
  const readoutProfile = summary.readoutProfile || summary.readout_profile || null;
  const profileLabel = readoutProfile === "initial_diagnostic"
    ? "基本読取"
    : readoutProfile === "quick_condition"
      ? "クイック状態確認"
      : "";
  const latestLabel = latestAttempt?.label ? ` 最終:${latestAttempt.label}` : "";
  const responseQuality = [
    negativeResponseCount > 0 ? `NRC ${negativeResponseCount}` : "",
    pendingNegativeResponseCount > 0 ? `保留NRC ${pendingNegativeResponseCount}` : "",
    expectedEmptyCommandCount > 0 ? `正常空結果 ${expectedEmptyCommandCount}` : "",
    timedOutCount > 0 ? `タイムアウト ${timedOutCount}` : "",
    unresolvedNoDataCount > 0 ? `NO DATA ${unresolvedNoDataCount}` : "",
    emptyResponseCount > 0 ? `空応答 ${emptyResponseCount}` : "",
    unrecognizedResponseCount > 0 ? `未解釈 ${unrecognizedResponseCount}` : ""
  ].filter(Boolean);
  return `${profileLabel ? `${profileLabel} / ` : ""}${attemptCount}工程 / 完了${completedCount} / 部分${partialCount} / 未完了${incompleteCount} / 失敗${failedCount}${latestLabel}${responseQuality.length ? ` / ${responseQuality.join(" / ")}` : ""}`;
}

function clearWebSerialReadoutProfile() {
  if (!obdDevSession.coreScanInProgress) obdDevSession.readoutProfile = null;
}

function formatCoreNextStepSummary(coreSessionStatus, nextReadoutCandidates, fallback = NO_DATA) {
  const blockingSummary = formatCoreBlockingWarningSummary(coreSessionStatus, 2, "");
  if (blockingSummary) return "保留要因確認";
  const emptyReadoutSummary = formatCoreEmptyReadoutSummary(coreSessionStatus, 2, "");
  if (emptyReadoutSummary) return "空応答再確認";
  const nextReadoutSummary = formatNextReadoutSummary(nextReadoutCandidates, { limit: 2, fallback: "" });
  if (nextReadoutSummary) return nextReadoutSummary;
  if (readCoreSessionAliasValue(coreSessionStatus, "readyForAnalysis", "ready_for_analysis") === true) return "解析結果確認";
  return fallback;
}

function formatNextReadoutCandidateSafetySummary(summary = null, fallback = NO_DATA) {
  if (!summary || typeof summary !== "object") return fallback;
  const totalValue = summary.totalCount ?? summary.total_count;
  const safeValue = summary.safeCount ?? summary.safe_count;
  const unsafeValue = summary.unsafeCount ?? summary.unsafe_count;
  const executableValue = summary.executableCount ?? summary.executable_count;
  const transmittingValue = summary.transmittingCount ?? summary.transmitting_count;
  const totalCount = Number.isFinite(Number(totalValue)) ? Number(totalValue) : null;
  const safeCount = Number.isFinite(Number(safeValue)) ? Number(safeValue) : 0;
  const unsafeCount = Number.isFinite(Number(unsafeValue)) ? Number(unsafeValue) : 0;
  const executableCount = Number.isFinite(Number(executableValue)) ? Number(executableValue) : 0;
  const transmittingCount = Number.isFinite(Number(transmittingValue)) ? Number(transmittingValue) : 0;
  if (totalCount === null) return fallback;
  const parts = [`safe ${safeCount}/${totalCount}`];
  if (unsafeCount > 0) parts.push(`unsafe ${unsafeCount}`);
  parts.push((summary.allReadOnly ?? summary.all_read_only) === true ? "read-only" : "read-only未確認");
  parts.push(transmittingCount === 0 && (summary.allNonTransmitting ?? summary.all_non_transmitting) !== false ? "non-transmit" : `transmit ${transmittingCount}`);
  parts.push(executableCount === 0 && (summary.allExecutionDisabled ?? summary.all_execution_disabled) !== false ? "execution off" : `execution ${executableCount}`);
  return parts.join(" / ");
}

function formatNextReadoutRequestSafetySummary(request = null, plan = null, fallback = NO_DATA) {
  const sourceRequest = request && typeof request === "object" ? request : null;
  const sourcePlan = plan && typeof plan === "object" ? plan : null;
  if (!sourceRequest && !sourcePlan) return fallback;
  const bridgeIntent = sourceRequest?.bridgeIntent || sourceRequest?.bridge_intent || sourcePlan?.nextBridgeIntent || sourcePlan?.next_bridge_intent || "";
  const serviceMode = sourceRequest?.serviceMode || sourceRequest?.service_mode || sourcePlan?.nextServiceMode || sourcePlan?.next_service_mode || "";
  const readOnly = sourceRequest?.readOnly !== false && sourceRequest?.read_only !== false && sourcePlan?.readOnly !== false && sourcePlan?.read_only !== false && sourcePlan?.nextReadOnly !== false && sourcePlan?.next_read_only !== false;
  const wouldTransmit = sourceRequest?.wouldTransmit === true || sourceRequest?.would_transmit === true || sourcePlan?.wouldTransmit === true || sourcePlan?.would_transmit === true || sourcePlan?.nextWouldTransmit === true || sourcePlan?.next_would_transmit === true;
  const vehicleCommandEnabled = sourceRequest?.vehicleCommandEnabled === true || sourceRequest?.vehicle_command_enabled === true || sourcePlan?.vehicleCommandEnabled === true || sourcePlan?.vehicle_command_enabled === true || sourcePlan?.nextVehicleCommandEnabled === true || sourcePlan?.next_vehicle_command_enabled === true;
  const executionEnabled = sourceRequest?.executionEnabled === true || sourceRequest?.execution_enabled === true || sourcePlan?.nextExecutionEnabled === true || sourcePlan?.next_execution_enabled === true;
  const parts = [];
  if (bridgeIntent) parts.push(bridgeIntent);
  if (serviceMode) parts.push(`Mode ${serviceMode}`);
  parts.push(readOnly ? "read-only" : "read-only?");
  parts.push(wouldTransmit ? "transmit?" : "non-transmit");
  parts.push(vehicleCommandEnabled ? "vehicle command on" : "vehicle command off");
  parts.push(executionEnabled ? "execution on" : "execution off");
  return parts.join(" / ");
}

function formatNextReadoutReasonSummary(summary = null, fallback = NO_DATA) {
  if (!summary || typeof summary !== "object") return fallback;
  const readoutId = summary.readoutId || summary.readout_id || "";
  const label = summary.label || summary.readoutLabel || summary.readout_label || formatCoreReadoutLabel(readoutId, readoutId);
  const status = summary.status || summary.readoutStatus || summary.readout_status || "";
  const statusReason = summary.statusReason || summary.status_reason || summary.readoutStatusReason || summary.readout_status_reason || "";
  const statusReasonLabel = {
    transport_safety_blocked: "通信安全停止",
    blocked_readout: "読取拒否",
    not_supported: "非対応",
    transport_error: "通信エラー",
    unparsed_response: "応答未解析",
    unknown_response: "応答不明"
  }[statusReason] || "";
  const reasonId = summary.reasonId || summary.reason_id || summary.reason || "";
  const queuePositionValue = summary.queuePosition ?? summary.queue_position;
  const bridgeIntent = summary.bridgeIntent || summary.bridge_intent || summary.readoutRequest?.bridgeIntent || summary.readout_request?.bridge_intent || "";
  const serviceMode = summary.serviceMode || summary.service_mode || summary.readoutRequest?.serviceMode || summary.readout_request?.service_mode || "";
  const parts = [];
  if (label) parts.push(label);
  if (status) parts.push(status);
  if (statusReasonLabel) parts.push(statusReasonLabel);
  if (reasonId) parts.push(reasonId);
  if (Number.isFinite(Number(queuePositionValue))) parts.push(`queue ${Number(queuePositionValue)}`);
  if (bridgeIntent) parts.push(bridgeIntent);
  if (serviceMode) parts.push(`Mode ${serviceMode}`);
  return parts.length ? parts.join(" / ") : fallback;
}

function formatNextReadoutGuardSummary(summary = null, fallback = NO_DATA) {
  if (!summary || typeof summary !== "object") return fallback;
  const gateState = summary.gateState || summary.gate_state || "";
  const planningReady = summary.planningReady === true || summary.planning_ready === true || summary.safeForReadoutPlanning === true || summary.safe_for_readout_planning === true;
  const requestSafe = summary.requestSafe === true || summary.request_safe === true;
  const readOnly = summary.readOnly !== false && summary.read_only !== false;
  const nonTransmitting = summary.nonTransmitting === true || summary.non_transmitting === true;
  const vehicleCommandDisabled = summary.vehicleCommandDisabled === true || summary.vehicle_command_disabled === true;
  const executionDisabled = summary.executionDisabled === true || summary.execution_disabled === true;
  const nextActionId = summary.nextActionId || summary.next_action_id || "";
  const parts = [planningReady ? "planning ready" : "planning blocked"];
  if (gateState) parts.push(`gate ${gateState}`);
  parts.push(requestSafe ? "request safe" : "request?");
  parts.push(readOnly ? "read-only" : "read-only?");
  parts.push(nonTransmitting ? "non-transmit" : "transmit?");
  parts.push(vehicleCommandDisabled ? "vehicle command off" : "vehicle command?");
  parts.push(executionDisabled ? "execution off" : "execution?");
  if (nextActionId) parts.push(`action ${nextActionId}`);
  return parts.join(" / ");
}

function formatNextReadoutGuardComparisonSummary(summary = null, fallback = NO_DATA, reviewPlan = null) {
  const sourceSummary = summary && typeof summary === "object" ? summary : null;
  const sourcePlan = reviewPlan && typeof reviewPlan === "object"
    ? reviewPlan
    : sourceSummary?.reviewRequestPlanSummary || sourceSummary?.review_request_plan_summary || null;
  if (!sourceSummary && !sourcePlan) return fallback;
  const summarySource = sourceSummary || {};
  const changed = summarySource.changed === true || summarySource.hasChanges === true || summarySource.has_changes === true;
  const changedCountValue = summarySource.changedCount ?? summarySource.changed_count;
  const changedCount = Number.isFinite(Number(changedCountValue)) ? Math.max(0, Math.round(Number(changedCountValue))) : null;
  const importedReadoutId = summarySource.importedReadoutId || summarySource.imported_readout_id || "";
  const currentReadoutId = summarySource.currentReadoutId || summarySource.current_readout_id || "";
  const importedGateState = summarySource.importedGateState || summarySource.imported_gate_state || "";
  const currentGateState = summarySource.currentGateState || summarySource.current_gate_state || "";
  const importedBridgeIntent = summarySource.importedBridgeIntent || summarySource.imported_bridge_intent || "";
  const currentBridgeIntent = summarySource.currentBridgeIntent || summarySource.current_bridge_intent || "";
  const planningReadyChanged = summarySource.planningReadyChanged === true || summarySource.planning_ready_changed === true;
  const safetyChanged = summarySource.safetyChanged === true || summarySource.safety_changed === true;
  const bridgeIntentChanged = summarySource.bridgeIntentChanged === true || summarySource.bridge_intent_changed === true;
  const readoutIdChanged = summarySource.readoutIdChanged === true || summarySource.readout_id_changed === true || summarySource.readoutChanged === true || summarySource.readout_changed === true;
  const reviewRequestCountValue = summarySource.reviewRequestCount ?? summarySource.review_request_count ?? sourcePlan?.requestCount ?? sourcePlan?.request_count;
  const reviewRequestCount = Number.isFinite(Number(reviewRequestCountValue)) ? Math.max(0, Math.round(Number(reviewRequestCountValue))) : 0;
  const reviewReadoutIds = Array.isArray(sourcePlan?.readoutIds)
    ? sourcePlan.readoutIds
    : Array.isArray(sourcePlan?.readout_ids) ? sourcePlan.readout_ids : [];
  const parts = [sourceSummary ? (changed ? "changed" : "unchanged") : "review"];
  if (changedCount !== null) parts.push(`${changedCount} fields`);
  if (reviewRequestCount > 0) parts.push(`review ${reviewRequestCount}`);
  if (!sourceSummary && reviewReadoutIds[0]) parts.push(`target ${reviewReadoutIds[0]}`);
  if (readoutIdChanged) parts.push(`readout ${importedReadoutId || "-"} -> ${currentReadoutId || "-"}`);
  if (planningReadyChanged) parts.push("planning changed");
  if (safetyChanged) parts.push("safety changed");
  if ((summarySource.gateStateChanged === true || summarySource.gate_state_changed === true) && (importedGateState || currentGateState)) parts.push(`gate ${importedGateState || "-"} -> ${currentGateState || "-"}`);
  if (bridgeIntentChanged) parts.push(`intent ${importedBridgeIntent || "-"} -> ${currentBridgeIntent || "-"}`);
  return parts.join(" / ");
}

function formatNextReadoutChangeSummary(summary = null, fallback = NO_DATA) {
  if (!summary || typeof summary !== "object") return fallback;
  const changed = summary.changed === true;
  const consistent = summary.consistentAcrossSections === true || summary.consistent_across_sections === true;
  const reviewRequired = summary.consistencyReviewRequired === true || summary.consistency_review_required === true;
  const importedReasonId = summary.importedReasonId || summary.imported_reason_id || "-";
  const currentReasonId = summary.currentReasonId || summary.current_reason_id || "-";
  const importedGuardState = summary.importedGuardState || summary.imported_guard_state || "-";
  const currentGuardState = summary.currentGuardState || summary.current_guard_state || "-";
  const conflictingSectionIds = Array.isArray(summary.conflictingSectionIds)
    ? summary.conflictingSectionIds
    : Array.isArray(summary.conflicting_section_ids) ? summary.conflicting_section_ids : [];
  const sectionLabels = {
    core_session_status: "コア",
    diagnostic_flow_summary: "診断フロー",
    analysis_readiness_summary: "解析準備"
  };
  const parts = [consistent ? "3層一致" : "層間不一致"];
  if (changed) parts.push(`理由 ${importedReasonId} -> ${currentReasonId}`);
  if (changed) parts.push(`安全 ${importedGuardState} -> ${currentGuardState}`);
  if (conflictingSectionIds.length) parts.push(`競合 ${conflictingSectionIds.map((id) => sectionLabels[id] || id).join(" / ")}`);
  if (reviewRequired) parts.push("read-only確認");
  return parts.join(" / ");
}

function buildCoreAnalysisPendingStatus(coreSessionStatus, fallback = "") {
  if (!coreSessionStatus || typeof coreSessionStatus !== "object") return fallback;
  const blockingSummary = formatCoreBlockingWarningSummary(coreSessionStatus, 2, "");
  if (blockingSummary) return `解析保留: ${blockingSummary}。`;
  const emptyReadoutSummary = formatCoreEmptyReadoutSummary(coreSessionStatus, 2, "");
  if (emptyReadoutSummary) return `解析保留: ${emptyReadoutSummary} を再確認してください。`;
  if (readCoreSessionAliasValue(coreSessionStatus, "readyForAnalysis", "ready_for_analysis") === true) {
    return "解析待ち: コア読取は完了しています。解析結果の確認へ進めます。";
  }
  const remainingReadoutIds = readCoreSessionAliasArray(coreSessionStatus, "remainingReadoutIds", "remaining_readout_ids");
  if (remainingReadoutIds.length > 0) {
    const labels = remainingReadoutIds
      .slice(0, 2)
      .map((item) => formatCoreReadoutLabel(item, item))
      .filter(Boolean);
    if (labels.length) return `解析待ち: ${labels.join(" / ")} を読取後に解析します。`;
  }
  return fallback;
}

function buildCoreSessionStatusLines(coreSessionStatus) {
  if (!coreSessionStatus || typeof coreSessionStatus !== "object") return [];
  const lines = [`進捗: ${formatCoreSessionStatusSummary(coreSessionStatus, NO_DATA)}`];
  const applicabilityStatus = readCoreSessionAliasValue(coreSessionStatus, "applicabilityStatus", "applicability_status");
  const nextRecommendedReadoutId = readCoreSessionAliasValue(coreSessionStatus, "nextRecommendedReadoutId", "next_recommended_readout_id");
  const emptyReadoutIds = readCoreSessionAliasArray(coreSessionStatus, "emptyReadoutIds", "empty_readout_ids");
  const remainingReadoutIds = readCoreSessionAliasArray(coreSessionStatus, "remainingReadoutIds", "remaining_readout_ids");
  const blockingWarningIds = readCoreSessionAliasArray(coreSessionStatus, "blockingWarningIds", "blocking_warning_ids");
  if (applicabilityStatus) {
    const applicabilityLabel = formatVehicleApplicabilitySummary({ status: applicabilityStatus }, applicabilityStatus);
    lines.push(`適用判定: ${applicabilityLabel}`);
  }
  if (nextRecommendedReadoutId) lines.push(`次操作: ${formatCoreReadoutLabel(nextRecommendedReadoutId, nextRecommendedReadoutId)}`);
  if (emptyReadoutIds.length) {
    lines.push(`空応答: ${emptyReadoutIds.slice(0, 4).map((item) => formatCoreReadoutLabel(item, item)).join(" / ")}`);
  }
  if (remainingReadoutIds.length) {
    lines.push(`残件: ${remainingReadoutIds.slice(0, 4).map((item) => formatCoreReadoutLabel(item, item)).join(" / ")}`);
  }
  if (blockingWarningIds.length) {
    lines.push(`保留要因: ${blockingWarningIds.slice(0, 4).map((item) => formatObdBridgeWarningLabel(item)).join(" / ")}`);
  }
  return lines;
}

function appendObdAnalysisReadoutSummary(parts, analysis, options = {}) {
  const { includeReadinessCount = false } = options;
  const analysisCoreSessionStatus = analysis.coreSessionStatus || analysis.core_session_status || null;
  const analysisNextReadoutCandidates = getSessionNextReadoutCandidates(analysis, 2);
  const coverage = getReadoutCoverageDisplay(analysis.readoutCoverage || analysis.readout_coverage);
  const applicabilitySummary = formatVehicleApplicabilitySummary(analysis.vehicleApplicability || analysis.vehicle_applicability);
  const nextStepLabel = formatCoreNextStepSummary(analysisCoreSessionStatus, analysisNextReadoutCandidates, "");
  const coreSessionSummary = formatCoreSessionStatusSummary(analysisCoreSessionStatus, "");
  const emptyReadoutSummary = formatCoreEmptyReadoutSummary(analysisCoreSessionStatus, 2, "");
  const blockingSummary = formatCoreBlockingWarningSummary(analysisCoreSessionStatus, 2, "");
  if (coreSessionSummary) {
    parts.push(`コア進捗 ${coreSessionSummary}`);
  }
  if (emptyReadoutSummary) {
    parts.push(`空応答 ${emptyReadoutSummary}`);
  }
  if (blockingSummary) {
    parts.push(`保留 ${blockingSummary}`);
  }
  if (nextStepLabel) {
    parts.push(`次操作 ${nextStepLabel}`);
  }
  if (applicabilitySummary) {
    parts.push(`適用 ${applicabilitySummary}`);
  }
  if (coverage?.totalCategories) {
    parts.push(`取得率${coverage.capturedPercent || 0}%`);
    parts.push(`応答率${coverage.progressPercent}%`);
    if ((coverage.missingCategories || 0) > 0) {
      const missingLabels = coverage.missingLabels?.slice(0, 2).join(" / ");
      parts.push(`未取得${coverage.missingCategories}件${missingLabels ? ` (${missingLabels})` : ""}`);
    }
    if ((coverage.emptyCategories || 0) > 0) {
      const emptyLabels = coverage.emptyLabels?.slice(0, 2).join(" / ");
      parts.push(`空応答${coverage.emptyCategories}件${emptyLabels ? ` (${emptyLabels})` : ""}`);
    }
  }
  const readinessSummary = formatObdBridgeReadinessSummary(
    analysis.readinessSnapshot || analysis.readiness_snapshot,
    { includeObservedCount: includeReadinessCount }
  );
  if (readinessSummary !== NO_DATA) {
    parts.push(`レディネス${readinessSummary}`);
  }
  const monitorValueSummary = analysis.monitorValueSummary || analysis.monitor_value_summary || null;
  const supportedPidMatrix = analysis.supportedPidMatrix || analysis.supported_pid_matrix || null;
  const ecuInfoSnapshot = analysis.ecuInfoSnapshot || analysis.ecu_info_snapshot || null;
  const mode06Snapshot = analysis.mode06Snapshot || analysis.mode06_snapshot || null;
  const freezeFrameSnapshot = analysis.freezeFrameSnapshot || analysis.freeze_frame_snapshot || null;
  if (!analysis.monitorValueSummary && monitorValueSummary) analysis.monitorValueSummary = monitorValueSummary;
  if (!analysis.supportedPidMatrix && supportedPidMatrix) analysis.supportedPidMatrix = supportedPidMatrix;
  if (!analysis.ecuInfoSnapshot && ecuInfoSnapshot) analysis.ecuInfoSnapshot = ecuInfoSnapshot;
  if (!analysis.mode06Snapshot && mode06Snapshot) analysis.mode06Snapshot = mode06Snapshot;
  if (!analysis.freezeFrameSnapshot && freezeFrameSnapshot) analysis.freezeFrameSnapshot = freezeFrameSnapshot;
  if (monitorValueSummary?.totalCount > 0) {
    parts.push(`ライブ要約${formatObdBridgeMonitorSummary(analysis.monitorValueSummary)}`);
  }
  if (analysis.supportedPidMatrix?.supportedCount > 0) parts.push(`対応PID${analysis.supportedPidMatrix.supportedCount}件`);
  if (analysis.ecuInfoSnapshot?.supportInfoTypesSummary?.count > 0) {
    const labels = analysis.ecuInfoSnapshot.supportInfoTypesSummary.labels?.slice(0, 2).join(" / ");
    parts.push(`Mode09対応${analysis.ecuInfoSnapshot.supportInfoTypesSummary.count}件${labels ? ` (${labels})` : ""}`);
  }
  if (analysis.ecuInfoSnapshot?.supportInfoTypesCaptured === false) {
    parts.push("Mode09対応情報タイプ00未取得");
  }
  if (analysis.ecuInfoSnapshot?.keyItemSummary?.missingCount > 0) {
    const missingLabels = analysis.ecuInfoSnapshot.keyItemSummary.missingLabels?.slice(0, 2).join(" / ");
    parts.push(`Mode09未取得${analysis.ecuInfoSnapshot.keyItemSummary.missingCount}件${missingLabels ? ` (${missingLabels})` : ""}`);
  }
  if (analysis.ecuResponseSummary?.ecus?.length > 0) parts.push(`ECU応答${analysis.ecuResponseSummary.ecus.length}件`);
  if (analysis.ecuInfoSnapshot?.itemCount > 0) parts.push(`ECU情報${analysis.ecuInfoSnapshot.itemCount}項目`);
  if (analysis.onboardMonitorSnapshot?.testCount > 0) parts.push(`Mode06 ${analysis.onboardMonitorSnapshot.testCount}件`);
  if (analysis.freezeFrameSnapshot?.monitorValues?.length > 0) parts.push(`FF ${analysis.freezeFrameSnapshot.monitorValues.length}項目`);
  if (analysis.ecuInfoSnapshot?.keyItemSummary?.totalCount > 0) parts.push(`主要ECU情報${formatObdBridgeEcuKeySummary(analysis.ecuInfoSnapshot.keyItemSummary)}`);
  if (analysis.freezeFrameSnapshot?.triggerDtc) parts.push(`FF起点${analysis.freezeFrameSnapshot.triggerDtc}`);
  if (analysis.freezeFrameSnapshot?.monitorValueSummary?.totalCount > 0) parts.push(`FF要約${formatObdBridgeMonitorSummary(analysis.freezeFrameSnapshot.monitorValueSummary)}`);
  const warningLabels = getNonBlockingWarningLabels(analysis, 2);
  if (warningLabels.length) {
    parts.push(`注意${warningLabels.length}件${warningLabels.length ? ` (${warningLabels.join(" / ")})` : ""}`);
  }
}

function formatObdBridgeWarningLabel(code = "") {
  return {
    local_bridge_disabled: "送信は読取モデルのまま",
    confirm_dtc_with_service_manual: "DTCは整備書で再確認",
    bridge_readout_incomplete: "未取得の読取項目あり",
    bridge_readout_empty_sections: "空応答の読取項目あり",
    vehicle_profile_manual: "手入力車両情報の確認が必要",
    vehicle_applicability_manual_confirmation: "手入力車両情報の確認が必要",
    vehicle_applicability_unlisted: "車種未掲載のため車両情報確認が必要",
    vehicle_unlisted_confirm_vehicle_profile: "車種未掲載のため車両情報確認が必要",
    mode09_key_items_missing: "Mode09主要項目に未取得あり",
    mode09_supported_types_unknown: "Mode09対応情報タイプ00が未取得",
    freeze_frame_available: "フリーズフレームあり",
    freeze_frame_association_review_required: "FFのDTC・PID対応確認が必要",
    readiness_incomplete: "レディネス未完了あり",
    onboard_monitor_test_failed: "Mode06に不合格の記録あり",
    negative_obd_response_present: "OBD負応答あり",
    obd_response_pending_observed: "ECU応答保留あり",
    compare_values_under_same_conditions: "同条件比較が必要",
    mixed_protocol_readout: "通信方式が混在、再読取で固定確認",
    raw_pid_values_need_conversion: "未換算PIDあり",
    save_before_clear: "消去前保存が必要",
    sensitive_identifier_redacted: "識別情報は伏せて保持"
  }[code] || code;
}

function triggerObdNextReadoutCandidate(candidate = null) {
  if (!candidate) return;
  if ((candidate.savedFromRequest === true || candidate.saved_from_request === true) && candidate.executionEnabled !== true && candidate.execution_enabled !== true) {
    obdDevStatus.textContent = `${candidate.label || "次読取要求"} は保存済みの読取要求です。詳細読取メニューで実行条件を確認してください。`;
    renderObdStageView("details");
    return;
  }
  const action = OBD_NEXT_READOUT_ACTIONS[candidate.id];
  const targetButton = action?.button?.() || null;
  renderObdStageView("details");
  if (!targetButton) {
    obdDevStatus.textContent = `${candidate.label || "次読取候補"} に対応する読取ボタンをまだ割り当てていません。`;
    return;
  }
  targetButton.scrollIntoView({ behavior: "smooth", block: "center" });
  if (targetButton.disabled) {
    obdDevStatus.textContent = `${action.label || candidate.label} はまだ実行条件を満たしていません。接続状態と詳細機能を確認してください。`;
    targetButton.focus();
    return;
  }
  targetButton.click();
}

function formatObdNextReadoutCandidateReason(candidate = null) {
  if (!candidate) return "次に確認する候補です。";
  const parts = [];
  const suppressApplicabilityDetail = candidate.id === "ecu_info_snapshot"
    && (candidate.applicabilityStatus === "partial"
      || candidate.applicabilityStatus === "unlisted"
      || candidate.applicabilityStatus === "manual");
  parts.push(candidate.status === "missing" ? "まだ読取っていません。" : "空応答だったため再確認します。");
  if (!suppressApplicabilityDetail && candidate.applicabilityStatus === "partial") {
    parts.push("車両適用候補を確認しながら判断します。");
  } else if (!suppressApplicabilityDetail && candidate.applicabilityStatus === "unlisted") {
    parts.push("適用データ未登録のため実車照合を優先します。");
  } else if (!suppressApplicabilityDetail && candidate.applicabilityStatus === "manual") {
    parts.push("手入力車両情報のため実車照合を優先します。");
  }
  return parts.join(" ");
}

function renderObdNextReadoutActions(session = null) {
  if (!obdNextReadoutPanel || !obdNextReadoutList) return;
  obdNextReadoutList.innerHTML = "";
  const coreSessionStatus = session?.coreSessionStatus || session?.core_session_status || null;
  const candidates = getSessionNextReadoutCandidates(session, 4);
  const blockingSummary = formatCoreBlockingWarningSummary(coreSessionStatus, 2, "");
  const emptyReadoutSummary = formatCoreEmptyReadoutSummary(coreSessionStatus, 2, "");
  if (blockingSummary) {
    const holdCard = document.createElement("article");
    holdCard.className = "obd-operation-card";
    const holdHead = document.createElement("strong");
    holdHead.textContent = "保留要因あり";
    const holdStatus = document.createElement("p");
    holdStatus.textContent = formatCoreSessionStatusSummary(coreSessionStatus, NO_DATA);
    const holdReason = document.createElement("p");
    holdReason.textContent = `解析前に ${blockingSummary} を確認してください。`;
    holdCard.append(holdHead, holdStatus, holdReason);
    obdNextReadoutList.appendChild(holdCard);
  }
  if (emptyReadoutSummary) {
    const emptyCard = document.createElement("article");
    emptyCard.className = "obd-operation-card";
    const emptyHead = document.createElement("strong");
    emptyHead.textContent = "空応答あり";
    const emptyStatus = document.createElement("p");
    emptyStatus.textContent = formatCoreSessionStatusSummary(coreSessionStatus, NO_DATA);
    const emptyReason = document.createElement("p");
    emptyReason.textContent = `空応答だった ${emptyReadoutSummary} を再確認してください。`;
    emptyCard.append(emptyHead, emptyStatus, emptyReason);
    obdNextReadoutList.appendChild(emptyCard);
  }
  if (!candidates.length) {
    if (readCoreSessionAliasValue(coreSessionStatus, "readyForAnalysis", "ready_for_analysis") === true && !emptyReadoutSummary) {
      const card = document.createElement("article");
      card.className = "obd-operation-card";
      const head = document.createElement("strong");
      head.textContent = "解析へ進行可能";
      const status = document.createElement("p");
      status.textContent = formatCoreSessionStatusSummary(coreSessionStatus, NO_DATA);
      const reason = document.createElement("p");
      reason.textContent = "コア読取が揃っています。次操作候補がない場合は解析結果の確認へ進めます。";
      card.append(head, status, reason);
      obdNextReadoutList.appendChild(card);
      obdNextReadoutPanel.hidden = false;
      return;
    }
    obdNextReadoutPanel.hidden = !blockingSummary && !emptyReadoutSummary;
    return;
  }
  candidates.forEach((candidate) => {
    const action = OBD_NEXT_READOUT_ACTIONS[candidate.id] || null;
    const savedReadoutRequest = candidate.savedFromRequest === true || candidate.saved_from_request === true;
    const canTriggerCandidate = !savedReadoutRequest || candidate.executionEnabled === true || candidate.execution_enabled === true;
    const buttonTarget = canTriggerCandidate ? action?.button?.() || null : null;
    const card = document.createElement("article");
    card.className = "obd-operation-card";

    const head = document.createElement("strong");
    head.textContent = candidate.label || candidate.id || "次読取候補";

    const status = document.createElement("p");
    status.textContent = candidate.status === "missing" ? "未読取" : "空応答";

    const reason = document.createElement("p");
    reason.textContent = formatObdNextReadoutCandidateReason(candidate);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.textContent = action ? (buttonTarget ? action.label : "準備条件待ち") : "詳細へ";
    button.disabled = !buttonTarget;
    if (action && !buttonTarget) {
      button.title = "接続状態または詳細機能の条件が整うと実行できます。";
    }
    button.addEventListener("click", () => triggerObdNextReadoutCandidate(candidate));

    card.append(head, status, reason, button);
    obdNextReadoutList.appendChild(card);
  });
  obdNextReadoutPanel.hidden = false;
}

function formatObdSessionSourceLabel(source, fallback = NO_DATA) {
  return {
    local_bridge: "ローカルブリッジ",
    native_connector: "iPhone native read-only connector",
    scanner_text: "スキャナーテキスト",
    scanner_text_and_local_bridge: "統合入力",
    diagnostic_core: "診断コア",
    obd_text_import: "OBDテキスト取込",
    obd_response_decoder: "OBD応答デコード"
  }[source] || source || fallback;
}

function formatJ2534RuntimeCompatibility(item = null, fallback = null) {
  const adapterFamily = String(item?.adapterFamily || item?.adapter_family || "").trim().toLowerCase();
  const architecture = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    return ["x86", "x64", "arm64", "unknown"].includes(normalized) ? normalized : null;
  };
  const bitness = (value) => [32, 64].includes(Number(value)) ? Number(value) : null;
  const driverArchitecture = architecture(item?.driverLibraryArchitecture || item?.driver_library_architecture);
  const bridgeArchitecture = architecture(item?.bridgeRuntimeArchitecture || item?.bridge_runtime_architecture);
  if (adapterFamily !== "j2534_passthru" && !driverArchitecture && !bridgeArchitecture) return fallback;
  const driverBitness = bitness(item?.driverLibraryBitness ?? item?.driver_library_bitness);
  const bridgeBitness = bitness(item?.bridgeRuntimeBitness ?? item?.bridge_runtime_bitness);
  const status = String(item?.driverRuntimeCompatibilityStatus || item?.driver_runtime_compatibility_status || "not_inspected").trim().toLowerCase();
  const statusLabel = ["compatible", "architecture_mismatch", "unknown", "not_inspected"].includes(status) ? status : "not_inspected";
  const driverLabel = driverArchitecture ? `${driverArchitecture}${driverBitness ? `/${driverBitness}` : ""}` : "unknown";
  const bridgeLabel = bridgeArchitecture ? `${bridgeArchitecture}${bridgeBitness ? `/${bridgeBitness}` : ""}` : "unknown";
  return `driver ${driverLabel} -> bridge ${bridgeLabel} (${statusLabel})`;
}

function formatJ2534DriverReadiness(item = null, fallback = null) {
  const status = String(item?.driverReadinessStatus || item?.driver_readiness_status || "").trim().toLowerCase();
  return {
    no_registered_driver: "ドライバー未登録",
    static_inspection_pending: "DLL静的確認待ち",
    runtime_architecture_mismatch: "DLLとブリッジの32/64bit不一致",
    readonly_api_incomplete: "read-only API不足",
    readonly_static_check_complete: "静的read-only確認完了（VCI未接続）"
  }[status] || fallback;
}

function formatObdDtcResponseFormat(formats = null, fallback = NO_DATA) {
  const values = Array.isArray(formats) ? formats : [formats];
  const labels = {
    obd_mode03: "OBD Mode 03 (stored)",
    obd_mode07: "OBD Mode 07 (pending)",
    obd_mode0a: "OBD Mode 0A (permanent)",
    uds_read_dtc_information: "UDS ReadDTCInformation"
  };
  const resolved = [...new Set(values.map((value) => labels[value] || null).filter(Boolean))];
  return resolved.length ? resolved.join(" / ") : fallback;
}

function formatUdsDtcSubfunction(value, fallback = NO_DATA) {
  const normalized = String(value || "").toUpperCase();
  if (!/^[0-9A-F]{2}$/.test(normalized)) return fallback;
  const labels = {
    "01": "reportNumberOfDTCByStatusMask",
    "02": "reportDTCByStatusMask",
    "05": "reportDTCStoredDataByRecordNumber",
    "08": "reportDTCBySeverityMaskRecord",
    "09": "reportSeverityInformationOfDTC",
    "06": "reportDTCExtDataRecordByDTCNumber",
    "07": "reportNumberOfDTCBySeverityMaskRecord",
    "0A": "reportSupportedDTCs",
    "0B": "reportFirstTestFailedDTC",
    "0C": "reportFirstConfirmedDTC",
    "0D": "reportMostRecentTestFailedDTC",
    "0E": "reportMostRecentConfirmedDTC",
    "0F": "reportMirrorMemoryDTCByStatusMask",
    "10": "reportMirrorMemoryDTCExtDataRecordByDTCNumber",
    "12": "reportNumberOfEmissionsRelatedOBDDTCByStatusMask",
    "13": "reportEmissionsRelatedOBDDTCByStatusMask",
    "14": "reportDTCFaultDetectionCounter",
    "15": "reportDTCWithPermanentStatus",
    "16": "reportDTCExtDataRecordByRecordNumber",
    "17": "reportUserDefMemoryDTCByStatusMask",
    "18": "reportUserDefMemoryDTCSnapshotRecordByDTCNumber",
    "19": "reportUserDefMemoryDTCExtDataRecordByDTCNumber",
    "1A": "reportSupportedDTCExtDataRecord",
    "42": "reportWWHOBDDTCByMaskRecord",
    "55": "reportWWHOBDDTCWithPermanentStatus",
    "56": "reportDTCInformationByDTCReadinessGroupIdentifier",
    "11": "reportNumberOfMirrorMemoryDTCByStatusMask"
  };
  return labels[normalized] ? `0x${normalized} ${labels[normalized]}` : `0x${normalized}`;
}

function formatObdEcuInfoResponseFormat(format = null, fallback = NO_DATA) {
  return {
    obd_mode09: "OBD Mode 09",
    uds_read_data_by_identifier: "UDS ReadDataByIdentifier (unparsed)"
  }[format] || fallback;
}

function formatJ2534NextCheck(item = null, fallback = null) {
  const nextCheck = String(item?.nextCheck || item?.next_check || "").trim().toLowerCase();
  return {
    install_or_repair_j2534_driver_registration: "J2534ドライバー登録を確認",
    verify_driver_library_path: "登録DLLのパスと静的検査を確認",
    install_matching_j2534_driver_architecture: "PCと一致する32/64bitドライバーを確認",
    verify_driver_readonly_exports: "read-only必須APIのエクスポートを確認",
    manual_vci_connection_review: "VCI接続前の手順と適合を確認"
  }[nextCheck] || fallback;
}

function getRecoveredDiagnosticReadoutRoute(connectionStatus = null, vciDevices = [], adapterIdentity = null, readoutInterface = null, webSerialReadoutSummary = null) {
  const source = String(
    connectionStatus?.source
    || connectionStatus?.sourceType
    || connectionStatus?.source_type
    || adapterIdentity?.source
    || adapterIdentity?.sourceType
    || adapterIdentity?.source_type
    || ""
  ).trim().toLowerCase();
  if (source === "web_serial") return "web_serial";
  if (source === "local_bridge" || source === "j2534_passthru") return "local_bridge";
  const readoutRoute = String(readoutInterface?.readoutRoute || readoutInterface?.readout_route || "").trim().toLowerCase();
  if (readoutRoute === "desktop_web_serial" || readoutRoute === "web_serial") return "web_serial";
  if (["desktop_local_bridge", "local_bridge", "j2534_passthru"].includes(readoutRoute)) return "local_bridge";
  if (webSerialReadoutSummary && typeof webSerialReadoutSummary === "object") return "web_serial";
  if ((Array.isArray(vciDevices) && vciDevices.length > 0) || adapterIdentity?.adapterFamily || adapterIdentity?.adapterName) return "local_bridge";
  return null;
}

function renderObdBridgeSessionDetails(session = null) {
  if (!obdDevSessionDetails) return;
  obdDevSessionDetails.innerHTML = "";

  const sections = [];
  const sessionConnectionStatus = session?.connectionStatus || session?.connection_status || null;
  const sessionAdapterIdentity = session?.adapterIdentity || session?.adapter_identity || null;
  const sessionVciDevices = session?.vciDevices || session?.vci_devices || session?.vciList?.devices || session?.vci_list?.devices || null;
  const sessionVehicleProfile = session?.vehicleProfile || session?.vehicle_profile || null;
  const sessionVehicleApplicability = session?.vehicleApplicability || session?.vehicle_applicability || null;
  const sessionObdReportedProfile = session?.obdReportedProfile || session?.obd_reported_profile || null;
  const connectionStatus = sessionConnectionStatus
    ? { ...(obdDevSession.bridgeStatus || {}), ...sessionConnectionStatus }
    : obdDevSession.bridgeStatus;
  const vciDevices = sessionVciDevices || obdDevSession.bridgeVciList?.devices || [];
  const selectedVci = vciDevices.find((item) => item?.selected) || vciDevices[0] || null;
  const vciDriverStatus = selectedVci?.driverStatus || obdDevSession.bridgeVciList?.driverStatus || NO_DATA;
  const j2534DriverReadinessLabel = formatJ2534DriverReadiness(connectionStatus, formatJ2534DriverReadiness(obdDevSession.bridgeVciList));
  const j2534NextCheckLabel = formatJ2534NextCheck(connectionStatus, formatJ2534NextCheck(obdDevSession.bridgeVciList));
  const readJ2534StaticCount = (...values) => {
    const value = values.find((item) => item !== undefined && item !== null && item !== "");
    const count = Number(value);
    return Number.isInteger(count) && count >= 0 ? count : null;
  };
  const j2534StaticReadyVciCount = readJ2534StaticCount(connectionStatus?.staticReadyVciCount, connectionStatus?.static_ready_vci_count, obdDevSession.bridgeVciList?.staticReadyVciCount, obdDevSession.bridgeVciList?.static_ready_vci_count);
  const j2534StaticBlockedVciCount = readJ2534StaticCount(connectionStatus?.staticBlockedVciCount, connectionStatus?.static_blocked_vci_count, obdDevSession.bridgeVciList?.staticBlockedVciCount, obdDevSession.bridgeVciList?.static_blocked_vci_count);
  const connectionDisplayStatus = connectionStatus?.displayStatus || connectionStatus?.display_status || null;
  const connectionNextAction = connectionStatus?.nextAction || connectionStatus?.next_action || null;
  const connectionErrorLabel = formatReadoutErrorCodes(connectionStatus?.errorCodes || connectionStatus?.error_codes || connectionStatus?.errors || []);
  if (connectionDisplayStatus || vciDevices.length) {
    const lines = [
      `状態: ${connectionDisplayStatus || NO_DATA}`,
      `次動作: ${connectionNextAction || NO_DATA}`,
      `Driver: ${vciDriverStatus}`
    ];
    if (j2534DriverReadinessLabel) lines.push(`J2534準備: ${j2534DriverReadinessLabel}`);
    if (j2534NextCheckLabel) lines.push(`J2534次確認: ${j2534NextCheckLabel}`);
    if (j2534StaticReadyVciCount !== null || j2534StaticBlockedVciCount !== null) lines.push(`J2534静的確認: 読取候補 ${j2534StaticReadyVciCount ?? "未報告"} / 要確認 ${j2534StaticBlockedVciCount ?? "未報告"}`);
    if (connectionErrorLabel) lines.push(`接続エラー: ${connectionErrorLabel.replace(/^理由:/, "")}`);
    vciDevices.slice(0, 4).forEach((item) => {
      const runtimeCompatibility = formatJ2534RuntimeCompatibility(item);
      const vciErrorLabel = formatReadoutErrorCodes(item?.errorCodes || item?.error_codes || item?.errors || []);
      if (runtimeCompatibility) lines.push(`J2534 runtime: ${runtimeCompatibility}`);
      lines.push(`${item.label || item.id}: ${item.connected ? "読取中" : "未読取"} / ${item.selected ? "選択中" : "待機"}${vciErrorLabel ? ` / ${vciErrorLabel}` : ""}`);
    });
    sections.push(["読取", lines]);
  }

  const readoutProtocol = session?.protocol || session?.obd_protocol || NO_DATA;
  const observedProtocols = Array.isArray(session?.observedProtocols)
    ? session.observedProtocols
    : Array.isArray(session?.observed_protocols)
      ? session.observed_protocols
      : [];
  const observedProtocolLabel = observedProtocols.length ? observedProtocols.join(" / ") : readoutProtocol;
  const multipleProtocols = session?.multipleProtocols === true || session?.multiple_protocols === true || observedProtocols.length > 1;
  const capturedAt = session?.capturedAt || NO_DATA;
  const startedAt = session?.startedAt || NO_DATA;
  const endedAt = session?.endedAt || NO_DATA;
  const vehicleLabel = formatVehicleProfileLabel(sessionVehicleProfile, NO_DATA) || NO_DATA;
  const vehicleApplicabilitySummary = formatVehicleApplicabilitySummary(sessionVehicleApplicability, NO_DATA) || NO_DATA;
  const coreSessionStatus = session?.coreSessionStatus || session?.core_session_status || null;
  const dtcSnapshot = session?.dtcSnapshot || session?.dtc_snapshot || null;
  const ecuInfoSnapshot = session?.ecuInfoSnapshot || session?.ecu_info_snapshot || null;
  const readinessSnapshot = session?.readinessSnapshot || session?.readiness_snapshot || null;
  const livePidTimeline = session?.livePidTimeline || session?.live_pid_timeline || null;
  const livePidTimelineSummary = session?.livePidTimelineSummary || session?.live_pid_timeline_summary || null;
  const supportedPidMatrix = session?.supportedPidMatrix || session?.supported_pid_matrix || null;
  const freezeFrameSnapshot = session?.freezeFrameSnapshot || session?.freeze_frame_snapshot || null;
  const onboardMonitorSnapshot = session?.onboardMonitorSnapshot || session?.onboard_monitor_snapshot || null;
  const nextReadoutSummary = formatCoreNextStepSummary(coreSessionStatus, getSessionNextReadoutCandidates(session, 2), NO_DATA);
  const coreSessionLines = buildCoreSessionStatusLines(coreSessionStatus);
  const warningLines = getNonBlockingWarningLabels(session, 4);
  if (session && (readoutProtocol !== NO_DATA || capturedAt !== NO_DATA || startedAt !== NO_DATA || endedAt !== NO_DATA || vehicleLabel !== NO_DATA || coreSessionLines.length || warningLines.length)) {
    sections.push(["読取メタ", [
      `適用: ${vehicleApplicabilitySummary}`,
      `車両: ${vehicleLabel}`,
      `次操作: ${nextReadoutSummary}`,
      ...coreSessionLines.slice(0, 4),
      ...warningLines.slice(0, 4).map((item) => `注意: ${item}`),
      `プロトコル: ${readoutProtocol}`,
      `観測通信方式: ${observedProtocolLabel}`,
      ...(multipleProtocols ? ["通信方式が混在: 再読取では方式を固定して確認"] : []),
      `開始: ${startedAt === NO_DATA ? NO_DATA : formatDateTime(startedAt)}`,
      `終了: ${endedAt === NO_DATA ? NO_DATA : formatDateTime(endedAt)}`,
      `取得時刻: ${capturedAt === NO_DATA ? NO_DATA : formatDateTime(capturedAt)}`
    ]]);
  }

  const nativeConnectorScanLifecycle = session?.nativeConnectorScanLifecycle || session?.native_connector_scan_lifecycle || null;
  const nativeReadoutProfile = session?.nativeConnectorReadoutProfile || session?.native_connector_readout_profile || null;
  const nativeInterruption = nativeConnectorScanLifecycle?.interruption || null;
  const nativeFailedScopes = nativeConnectorScanLifecycle?.failedReadoutScopes || nativeConnectorScanLifecycle?.failed_readout_scopes || [];
  const nativeMissingScopes = nativeConnectorScanLifecycle?.missingReadoutScopes || nativeConnectorScanLifecycle?.missing_readout_scopes || [];
  const nativeUnexpectedScopes = nativeConnectorScanLifecycle?.unexpectedReadoutScopes || nativeConnectorScanLifecycle?.unexpected_readout_scopes || [];
  if (nativeReadoutProfile || nativeInterruption || (nativeConnectorScanLifecycle && (nativeFailedScopes.length || nativeMissingScopes.length || nativeUnexpectedScopes.length))) {
    const formatNativeScope = (item) => {
      const readoutId = item?.readoutId || item?.readout_id || "";
      const scopeId = item?.scopeId || item?.scope_id || "未確定";
      return `${formatCoreReadoutLabel(readoutId, readoutId || "読取")} / ECU ${scopeId}`;
    };
    const nativeLifecycleLines = [
      ...(nativeReadoutProfile === "initial_diagnostic" ? ["読取種別: 初期診断読取"] : []),
      ...(nativeReadoutProfile === "quick_condition" ? ["読取種別: クイック状態確認", "本診断: 追加読取が必要"] : [])
    ];
    if (nativeConnectorScanLifecycle && (nativeInterruption || nativeFailedScopes.length || nativeMissingScopes.length || nativeUnexpectedScopes.length)) {
      nativeLifecycleLines.push(`読取状態: ${nativeConnectorScanLifecycle.scanState === "interrupted" || nativeConnectorScanLifecycle.scan_state === "interrupted" ? "中断・一部取得" : "未完了"}`);
    }
    if (nativeInterruption?.code) nativeLifecycleLines.push(`通信停止: ${formatNativeConnectorInterruption(nativeInterruption.code)}`);
    if (nativeFailedScopes.length) nativeLifecycleLines.push(`失敗: ${nativeFailedScopes.slice(0, 4).map(formatNativeScope).join(" / ")}`);
    if (nativeMissingScopes.length) nativeLifecycleLines.push(`未取得: ${nativeMissingScopes.slice(0, 4).map(formatNativeScope).join(" / ")}`);
    if (nativeUnexpectedScopes.length) nativeLifecycleLines.push(`想定外応答: ${nativeUnexpectedScopes.slice(0, 4).map(formatNativeScope).join(" / ")}`);
    sections.push(["iPhone読取範囲", nativeLifecycleLines]);
  }

  const coverage = getReadoutCoverageDisplay(session?.readoutCoverage);
  if (coverage?.totalCategories) {
    const lines = [
      `取得率: ${coverage.capturedPercent || 0}% (${coverage.capturedCategories || 0}/${coverage.totalCategories})`,
      `応答率: ${coverage.progressPercent}% (${coverage.availableCategories}/${coverage.totalCategories})`,
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

  const dtcs = dtcSnapshot?.dtcs || [];
  if (dtcs.length) {
    const summary = formatObdBridgeDtcStatusSummary(dtcs).replace(/^ 内訳: /, "").replace(/。$/, "");
    const lines = dtcs.slice(0, 8).map((item) => `${item.code} ${formatObdBridgeDtcStatusLabel(item.status || "unknown")}`);
    sections.push(["DTC状態", [summary, ...lines].filter(Boolean)]);
  }

  const ecuInfoLines = buildObdEcuInfoDisplayLines(ecuInfoSnapshot);
  if (ecuInfoLines.length) sections.push(["ECU情報", ecuInfoLines]);

  const ecuResponseLines = buildObdEcuResponseDisplayLines(session?.ecuResponseSummary || session?.ecu_response_summary);
  if (ecuResponseLines.length) sections.push(["ECU応答", ecuResponseLines]);

  const adapterIdentity = sessionAdapterIdentity
    ? { ...(obdDevSession.adapterIdentity || {}), ...sessionAdapterIdentity }
    : obdDevSession.adapterIdentity;
  const adapterErrorLabel = formatReadoutErrorCodes(adapterIdentity?.errorCodes || adapterIdentity?.error_codes || adapterIdentity?.errors || []);
  if (adapterIdentity?.adapterName || adapterIdentity?.adapterFamily || adapterIdentity?.firmwareVersion || adapterErrorLabel) {
    const lines = [
      `名称: ${adapterIdentity.adapterName || NO_DATA}`,
      `系統: ${adapterIdentity.adapterFamily || NO_DATA}`,
      `FW: ${adapterIdentity.firmwareVersion || NO_DATA}`,
      `通信ヒント: ${adapterIdentity.adapterProtocolHint || adapterIdentity.adapter_protocol_hint || NO_DATA}`,
      `通信番号: ${adapterIdentity.adapterProtocolNumber || adapterIdentity.adapter_protocol_number || NO_DATA}`
    ];
    if (adapterErrorLabel) lines.push(`識別エラー: ${adapterErrorLabel.replace(/^理由:/, "")}`);
    sections.push(["アダプター", lines]);
  }

  if (livePidTimeline?.sampleCount) {
    const lines = [`取得回数: ${livePidTimeline.sampleCount}`];
    const latestObservationCondition = livePidTimelineSummary?.latestObservationCondition || livePidTimelineSummary?.latest_observation_condition || "unspecified";
    const observationConditionLabel = {
      unspecified: "条件未指定",
      cold: "冷間時",
      warm: "暖機後",
      symptom_reproduced: "症状再現時",
      post_repair: "修理後"
    }[latestObservationCondition] || "条件未指定";
    if (livePidTimelineSummary?.latestCapturedAt || livePidTimelineSummary?.latest_captured_at) {
      lines.push(`最新: ${formatDateTime(livePidTimelineSummary.latestCapturedAt || livePidTimelineSummary.latest_captured_at)}`);
    }
    lines.push(`観察条件: ${observationConditionLabel}`);
    if (livePidTimelineSummary?.adapterIdentityChanged) {
      lines.push("読取器識別が前回と異なります。値の差分は読取器差の可能性も確認");
    }
    if (livePidTimelineSummary?.comparisonAvailable) {
      lines.push(`比較: ${formatDateTime(livePidTimelineSummary.previousCapturedAt)} -> ${formatDateTime(livePidTimelineSummary.latestCapturedAt)}`);
      if (livePidTimelineSummary.changedValueCount) {
        lines.push(...livePidTimelineSummary.changes.slice(0, 6).map((item) => {
          const unit = item.unit ? ` ${item.unit}` : "";
          const delta = Number.isFinite(item.delta) ? ` / 差分 ${item.delta >= 0 ? "+" : ""}${item.delta}${unit}` : "";
          return `${item.label || item.id}: ${item.previousValue} -> ${item.latestValue}${unit}${delta}`;
        }));
      } else if (livePidTimelineSummary.comparedValueCount) {
        lines.push("同一PIDの数値差分なし");
      } else {
        lines.push("同一ECUの比較対象PIDなし");
      }
      if (livePidTimelineSummary.unitMismatchValueCount > 0) {
        lines.push(`単位が一致しないPID ${livePidTimelineSummary.unitMismatchValueCount}件は差分比較から除外`);
      }
    } else if (livePidTimelineSummary?.comparisonBlockedByUnrecordedTimestamp) {
      lines.push("取得時刻を確認できないため差分比較は行いません");
    } else if (livePidTimelineSummary?.comparisonBlockedByTimestamp) {
      lines.push("同一取得時刻の読取は差分比較しません");
    } else if (livePidTimelineSummary?.comparisonBlockedByProtocol) {
      lines.push("通信プロトコルが異なる読取は差分比較しません");
    } else {
      lines.push(livePidTimelineSummary?.comparisonBlockedByUnrecordedCondition ? "観察条件が記録されていないため差分比較は行いません" : livePidTimelineSummary?.comparisonBlockedByCondition ? "前回と観察条件が異なるため差分比較は行いません" : "前回比較は2回以上の読取後に表示");
    }
    sections.push(["ライブ履歴", lines]);
  }

  const monitorLines = buildObdOnboardMonitorDisplayLines(onboardMonitorSnapshot);
  if (monitorLines.length) sections.push(["Mode06", monitorLines]);

  const readinessLines = buildObdReadinessDisplayLines(readinessSnapshot);
  if (readinessLines.length) sections.push(["レディネス", readinessLines]);

  const supportedPidLines = buildObdSupportedPidDisplayLines(supportedPidMatrix);
  if (supportedPidLines.length) sections.push(["対応PID", supportedPidLines]);

  const freezeFrameValues = freezeFrameSnapshot?.monitorValues || [];
  const freezeFrameTriggerEntries = getObdFreezeFrameTriggerEntries(freezeFrameSnapshot);
  if (freezeFrameValues.length || freezeFrameTriggerEntries.length) {
    const freezeExpectedSummary = summarizeObdExpectedItems(freezeFrameSnapshot?.expectedItems || []);
    const freezeFrameEcuSnapshots = freezeFrameSnapshot?.freezeFrameEcuSnapshots || freezeFrameSnapshot?.freeze_frame_ecu_snapshots || [];
    const freezeFrameEcuScopeLines = freezeFrameEcuSnapshots.length > 1
      ? [
        `ECU別保存: ${freezeFrameEcuSnapshots.length} ECU`,
        ...freezeFrameEcuSnapshots.map((snapshot) => {
          const ecu = snapshot?.sourceEcu || snapshot?.source_ecu || "ECU未記録";
          const capturedAt = snapshot?.capturedAt || snapshot?.captured_at || "時刻未記録";
          const protocol = snapshot?.protocol || snapshot?.obd_protocol || "通信方式未記録";
          return `${ecu}: ${capturedAt} / ${protocol}`;
        })
      ]
      : [];
    const lines = [];
    lines.push(...freezeFrameEcuScopeLines);
    if (freezeFrameTriggerEntries.length) {
      lines.push(`起点DTC: ${freezeFrameTriggerEntries.map(formatObdFreezeFrameTriggerEntry).join(" / ")}`);
    } else if (freezeFrameSnapshot?.triggerDtc) {
      lines.push(`起点DTC: ${freezeFrameSnapshot.triggerDtc}`);
    }
    lines.push(freezeFrameValues.length
      ? `要約: ${formatObdBridgeMonitorSummary(freezeFrameSnapshot?.monitorValueSummary)}`
      : "読取値: 未出力 (起点情報のみ取得)");
    if (freezeExpectedSummary.totalCount) {
      lines.push(`取得状況: ${freezeExpectedSummary.capturedCount}/${freezeExpectedSummary.totalCount}`);
    }
    if (freezeExpectedSummary.missingCount) {
      lines.push(`未取得用途: ${formatObdExpectedItemPreview(freezeExpectedSummary.missing, "purpose", 3)}`);
    }
    lines.push(...freezeFrameValues.map(formatObdFreezeFrameValueLine));
    sections.push(["フリーズフレーム", lines]);
  }

  if (!sections.length) {
    obdDevSessionDetails.hidden = true;
    return;
  }

  sections.forEach(([title, lines]) => {
    if (title === "ECU応答") {
      obdDevSessionDetails.appendChild(createObdEcuResponseCard(session?.ecuResponseSummary || session?.ecu_response_summary));
      return;
    }
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
  const timelineChartRows = buildLivePidTimelineChartRows(livePidTimeline);
  if (timelineChartRows.length) {
    const card = document.createElement("article");
    card.className = "obd-session-detail-card obd-timeline-chart-card";
    const heading = document.createElement("strong");
    heading.textContent = "ライブ推移";
    const chart = document.createElement("div");
    chart.className = "obd-timeline-chart";
    timelineChartRows.forEach((row) => {
      const chartRow = document.createElement("div");
      chartRow.className = "obd-timeline-chart-row";
      const label = document.createElement("span");
      label.className = "obd-timeline-chart-label";
      const unit = row.unit ? ` ${row.unit}` : "";
      const delta = Number.isFinite(row.delta) ? ` / 変化 ${row.delta >= 0 ? "+" : ""}${row.delta}${unit}` : "";
      const sourceEcu = row.sourceEcu ? ` [${row.sourceEcu}]` : "";
      label.textContent = `${row.label}${sourceEcu}${unit} / 最小 ${row.minimum}${unit} / 最大 ${row.maximum}${unit} / 最新 ${row.latest}${unit}${delta}`;
      const bars = document.createElement("div");
      bars.className = "obd-timeline-chart-bars";
      row.points.forEach((point) => {
        const bar = document.createElement("span");
        bar.className = "obd-timeline-chart-bar";
        bar.style.setProperty("--obd-timeline-height", `${point.heightPercent}%`);
        bar.title = `${formatDateTime(point.capturedAt)}: ${point.value}${row.unit ? ` ${row.unit}` : ""}`;
        bars.appendChild(bar);
      });
      chartRow.append(label, bars);
      chart.appendChild(chartRow);
    });
    card.append(heading, chart);
    obdDevSessionDetails.appendChild(card);
  }
  obdDevSessionDetails.hidden = false;
}

function buildLivePidTimelineChartRows(timeline = null) {
  const samples = Array.isArray(timeline?.samples) ? timeline.samples : [];
  const latestCondition = samples.at(-1)?.observationCondition || samples.at(-1)?.observation_condition || "unspecified";
  const adapterIdentityKey = (sample) => {
    const identity = sample?.adapterIdentity || sample?.adapter_identity || {};
    return [
      identity.adapterFamily || identity.adapter_family || "",
      identity.adapterName || identity.adapter_name || "",
      identity.firmwareVersion || identity.firmware_version || ""
    ].map((value) => String(value).trim().toLocaleLowerCase("en-US")).join("|");
  };
  const latestAdapterIdentityKey = adapterIdentityKey(samples.at(-1));
  const hasLatestAdapterIdentity = Boolean(latestAdapterIdentityKey.replaceAll("|", ""));
  const rowsByKey = new Map();
  const normalizeUnit = (value) => String(value || "").trim().toLocaleLowerCase("en-US");
  const normalizeCanAddressKey = (value) => {
    const sourceEcu = String(value || "").trim();
    const compactCanAddress = sourceEcu.replace(/^0x/i, "");
    return /^[0-9A-F]{3}(?:[0-9A-F]{5})?$/i.test(compactCanAddress) ? compactCanAddress.toUpperCase() : sourceEcu;
  };
  samples
    .filter((sample) => {
      if ((sample?.observationCondition || sample?.observation_condition || "unspecified") !== latestCondition) return false;
      const sampleAdapterIdentityKey = adapterIdentityKey(sample);
      return !hasLatestAdapterIdentity || !sampleAdapterIdentityKey.replaceAll("|", "") || sampleAdapterIdentityKey === latestAdapterIdentityKey;
    })
    .forEach((sample) => {
      (sample?.monitorValues || sample?.monitor_values || []).forEach((item) => {
        if (!item?.id || !Number.isFinite(item.value)) return;
        const sourceEcu = item.sourceEcu || item.source_ecu || null;
        const unit = item.unit || "";
        const rowKey = `${item.id}::${normalizeCanAddressKey(sourceEcu)}::${normalizeUnit(unit)}`;
        const row = rowsByKey.get(rowKey) || { id: item.id, label: item.label || item.id, unit, sourceEcu, source_ecu: sourceEcu, points: [] };
        row.points.push({ value: item.value, capturedAt: sample.capturedAt || sample.captured_at || null });
        rowsByKey.set(rowKey, row);
      });
    });
  return [...rowsByKey.values()]
    .filter((row) => row.points.length >= 2)
    .sort((left, right) => right.points.length - left.points.length || left.label.localeCompare(right.label, "ja"))
    .slice(0, 4)
    .map((row) => {
      const values = row.points.map((point) => point.value);
      const minimum = Math.min(...values);
      const maximum = Math.max(...values);
      const range = maximum - minimum;
      return {
        ...row,
        minimum,
        maximum,
        latest: row.points.at(-1)?.value ?? null,
        delta: row.points.at(-1)?.value - row.points[0]?.value,
        points: row.points.map((point) => ({
          ...point,
          heightPercent: range ? 18 + ((point.value - minimum) / range) * 82 : 55
        }))
      };
    });
}

function mergeObdBridgeDtcSnapshots(previousSnapshot, currentSnapshot) {
  if (!previousSnapshot?.dtcs?.length) return currentSnapshot || null;
  if (!currentSnapshot?.dtcs) return previousSnapshot;
  const dtcsByKind = new Map();
  [...previousSnapshot.dtcs, ...currentSnapshot.dtcs].forEach((item) => {
    const code = item?.code;
    if (!code) return;
    const status = item.status || "unknown";
    const reportedStatus = String(item.reportedStatus ?? item.reported_status ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    const key = `${code}::${item.subcode || item.sub_code || ""}::${item.oemDetailCode || item.oem_detail_code || ""}::${item.ecu || item.ecu_id || item.ecuId || item.address || item.module || item.module_id || item.moduleId || ""}::${status}::${reportedStatus}`;
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

function formatDiagnosticFlowBlockerLabel(reasonId = "") {
  return {
    missing_readouts: "未取得の読取あり",
    empty_readouts: "空応答の読取あり",
    blocking_warnings: "保留要因あり"
  }[reasonId] || formatObdBridgeWarningLabel(reasonId) || reasonId;
}

function formatPrimaryBlockerChangeSummary(summary, fallback = NO_DATA) {
  if (!summary || typeof summary !== "object") return fallback;
  if (summary.changed !== true) return "変更なし";
  const changedIds = Array.isArray(summary.changedIds)
    ? summary.changedIds
    : [...new Set([...(summary.addedIds || []), ...(summary.removedIds || [])])];
  const labels = changedIds
    .slice(0, 3)
    .map((id) => formatCoreReadoutLabel(id, formatDiagnosticFlowBlockerLabel(id)))
    .filter(Boolean);
  const parts = [];
  const changedIdCount = Number.isFinite(Number(summary.changedIdCount))
    ? Number(summary.changedIdCount)
    : changedIds.length;
  if (changedIdCount > 0) parts.push(`${changedIdCount}件`);
  if (labels.length) parts.push(labels.join(" / "));
  if (summary.addedIdCount || summary.removedIdCount) {
    parts.push(`追加${Number(summary.addedIdCount || 0)} / 解除${Number(summary.removedIdCount || 0)}`);
  }
  return parts.length ? parts.join(" / ") : "変更あり";
}

function formatChangedIdReviewTargetLabel(reviewTarget = "") {
  return {
    readout_review: "確認:読取",
    bridge_contract_review: "確認:ブリッジ",
    request_plan_review: "確認:要求計画",
    blocked_reason_review: "確認:保留要因",
    analysis_checklist_review: "確認:解析前",
    session_review: "確認:セッション"
  }[reviewTarget] || reviewTarget || "";
}

function formatChangedIdDisplaySummary(summary, fallback = NO_DATA) {
  if (!summary || typeof summary !== "object") return fallback;
  if (summary.status === "unchanged" || summary.empty === true) return "変更なし";
  const row = summary.primaryRow || null;
  const impactSummary = summary.primaryChangedIdImpactSummary || {};
  const primaryId = row?.id || summary.primaryChangedId || null;
  const primaryKind = row?.kind || summary.primaryChangedIdKind || null;
  const primaryDirection = row?.direction || summary.primaryChangedIdDirection || null;
  const reviewTarget = impactSummary.reviewTarget || impactSummary.primaryChangedIdReviewTarget || summary.primaryChangedIdReviewTarget || "";
  const reviewTargetLabel = formatChangedIdReviewTargetLabel(reviewTarget);
  const kindLabel = {
    readout_id: "読取",
    bridge_intent: "ブリッジ要求",
    request_plan_action: "要求計画",
    blocked_reason: "保留理由",
    analysis_checklist_id: "確認項目"
  }[primaryKind] || primaryKind || "";
  const directionLabel = {
    added: "追加",
    removed: "解除",
    mixed: "変更"
  }[primaryDirection] || primaryDirection || "";
  const primaryLabel = primaryId
    ? formatCoreReadoutLabel(primaryId, formatDiagnosticFlowBlockerLabel(primaryId))
    : "";
  const count = Number.isFinite(Number(summary.displayRowCount))
    ? Number(summary.displayRowCount)
    : Number.isFinite(Number(summary.changedIdCount)) ? Number(summary.changedIdCount) : 0;
  const readoutDeltaCount = Number.isFinite(Number(summary.readoutChangedIdCount))
    ? Number(summary.readoutChangedIdCount)
    : 0;
  const bridgeIntentDeltaCount = Number.isFinite(Number(summary.bridgeIntentChangedIdCount))
    ? Number(summary.bridgeIntentChangedIdCount)
    : 0;
  const requestPlanDeltaCount = Number.isFinite(Number(summary.requestPlanActionChangedIdCount))
    ? Number(summary.requestPlanActionChangedIdCount)
    : 0;
  const blockedReasonDeltaCount = Number.isFinite(Number(summary.blockedReasonChangedIdCount))
    ? Number(summary.blockedReasonChangedIdCount)
    : 0;
  const checklistDeltaCount = Number.isFinite(Number(summary.analysisChecklistChangedIdCount))
    ? Number(summary.analysisChecklistChangedIdCount)
    : 0;
  const addedDeltaCount = Number.isFinite(Number(summary.addedDisplayRowCount))
    ? Number(summary.addedDisplayRowCount)
    : Number.isFinite(Number(summary.groups?.byDirectionValue?.added?.count))
      ? Number(summary.groups.byDirectionValue.added.count)
      : 0;
  const removedDeltaCount = Number.isFinite(Number(summary.removedDisplayRowCount))
    ? Number(summary.removedDisplayRowCount)
    : Number.isFinite(Number(summary.groups?.byDirectionValue?.removed?.count))
      ? Number(summary.groups.byDirectionValue.removed.count)
      : 0;
  const mixedDeltaCount = Number.isFinite(Number(summary.mixedDisplayRowCount))
    ? Number(summary.mixedDisplayRowCount)
    : 0;
  const parts = [];
  if (count > 0) parts.push(`${count}件`);
  if (readoutDeltaCount > 0) parts.push(`読取${readoutDeltaCount}`);
  if (bridgeIntentDeltaCount > 0) parts.push(`要求${bridgeIntentDeltaCount}`);
  if (requestPlanDeltaCount > 0) parts.push(`計画${requestPlanDeltaCount}`);
  if (blockedReasonDeltaCount > 0) parts.push(`保留${blockedReasonDeltaCount}`);
  if (checklistDeltaCount > 0) parts.push(`確認${checklistDeltaCount}`);
  if (addedDeltaCount > 0) parts.push(`追加${addedDeltaCount}`);
  if (removedDeltaCount > 0) parts.push(`解除${removedDeltaCount}`);
  if (mixedDeltaCount > 0) parts.push(`変更${mixedDeltaCount}`);
  if (primaryLabel) parts.push(`${kindLabel ? `${kindLabel}: ` : ""}${primaryLabel}`);
  if (directionLabel) parts.push(directionLabel);
  if (reviewTargetLabel) parts.push(reviewTargetLabel);
  return parts.length ? parts.join(" / ") : "変更あり";
}

function formatVehicleApplicabilityChangedRowSummary(summary, fallback = NO_DATA) {
  if (!summary || typeof summary !== "object") return fallback;
  const rowSummary = summary.vehicleApplicabilityChangedRowSummary || summary.vehicle_applicability_changed_row_summary || summary;
  if (!rowSummary || typeof rowSummary !== "object") return fallback;
  const rowById = rowSummary.rowById || rowSummary.row_by_id || {};
  const evidenceRow = rowSummary.evidenceRow || rowSummary.evidence_row || rowById.vehicle_applicability_evidence || null;
  const checklistRow = rowSummary.checklistRow || rowSummary.checklist_row || rowById.vehicle_applicability_checklist || null;
  const count = Number.isFinite(Number(rowSummary.count))
    ? Number(rowSummary.count)
    : Number.isFinite(Number(summary.vehicleApplicabilityChangedIdCount || summary.vehicle_applicability_changed_id_count))
      ? Number(summary.vehicleApplicabilityChangedIdCount || summary.vehicle_applicability_changed_id_count)
      : 0;
  if (count <= 0 && rowSummary.changed !== true) return fallback;
  const reviewTargets = Array.isArray(rowSummary.reviewTargets)
    ? rowSummary.reviewTargets
    : Array.isArray(rowSummary.review_targets) ? rowSummary.review_targets : [];
  const primaryRow = rowSummary.primaryRow || rowSummary.primary_row || evidenceRow || checklistRow || null;
  const directionCounts = rowSummary.directionCounts || rowSummary.direction_counts || {};
  const mixedCount = Number.isFinite(Number(rowSummary.mixedCount ?? rowSummary.mixed_count))
    ? Number(rowSummary.mixedCount ?? rowSummary.mixed_count)
    : Number.isFinite(Number(directionCounts.mixed)) ? Number(directionCounts.mixed) : 0;
  const addedCount = Number.isFinite(Number(rowSummary.addedCount ?? rowSummary.added_count))
    ? Number(rowSummary.addedCount ?? rowSummary.added_count)
    : Number.isFinite(Number(directionCounts.added)) ? Number(directionCounts.added) : 0;
  const removedCount = Number.isFinite(Number(rowSummary.removedCount ?? rowSummary.removed_count))
    ? Number(rowSummary.removedCount ?? rowSummary.removed_count)
    : Number.isFinite(Number(directionCounts.removed)) ? Number(directionCounts.removed) : 0;
  const directionLabel = {
    added: "追加",
    removed: "解除",
    mixed: "変更"
  }[primaryRow?.direction] || primaryRow?.direction || (mixedCount > 0 ? "変更" : addedCount > 0 ? "追加" : removedCount > 0 ? "解除" : "");
  const primaryReviewTarget = rowSummary.primaryReviewTarget || rowSummary.primary_review_target || reviewTargets[0] || primaryRow?.reviewTarget || primaryRow?.review_target || "";
  const parts = [];
  if (count > 0) parts.push(`${count}件`);
  if (mixedCount > 0) parts.push(`変更${mixedCount}`);
  if (addedCount > 0) parts.push(`追加${addedCount}`);
  if (removedCount > 0) parts.push(`解除${removedCount}`);
  if (evidenceRow) parts.push("根拠");
  if (checklistRow) parts.push("適合確認");
  if (directionLabel) parts.push(directionLabel);
  const reviewTargetLabel = formatChangedIdReviewTargetLabel(primaryReviewTarget);
  if (reviewTargetLabel) parts.push(reviewTargetLabel);
  return parts.length ? parts.join(" / ") : fallback;
}

function formatChangedIdReviewTargetIds(ids = []) {
  const labels = ids
    .slice(0, 3)
    .map((id) => formatCoreReadoutLabel(id, formatDiagnosticFlowBlockerLabel(id)))
    .filter(Boolean);
  if (ids.length > labels.length) labels.push(`他${ids.length - labels.length}`);
  return labels.join(",");
}

function formatChangedIdReviewTargetActionSummary(summary, fallback = NO_DATA) {
  if (!summary || typeof summary !== "object") return fallback;
  if (summary.status === "unchanged" || summary.empty === true) return "変更なし";
  const impactSummary = summary.primaryChangedIdImpactSummary || {};
  const reviewTarget = impactSummary.reviewTarget || impactSummary.primaryChangedIdReviewTarget || summary.primaryChangedIdReviewTarget || "";
  const reviewTargetLabel = formatChangedIdReviewTargetLabel(reviewTarget);
  const totalCount = Number.isFinite(Number(summary.primaryChangedReviewTargetTotalCount))
    ? Number(summary.primaryChangedReviewTargetTotalCount)
    : Number.isFinite(Number(impactSummary.reviewTargetTotalCount)) ? Number(impactSummary.reviewTargetTotalCount) : 0;
  const addedIds = Array.isArray(summary.primaryChangedReviewTargetAddedIds)
    ? summary.primaryChangedReviewTargetAddedIds
    : Array.isArray(impactSummary.reviewTargetAddedIds) ? impactSummary.reviewTargetAddedIds : [];
  const removedIds = Array.isArray(summary.primaryChangedReviewTargetRemovedIds)
    ? summary.primaryChangedReviewTargetRemovedIds
    : Array.isArray(impactSummary.reviewTargetRemovedIds) ? impactSummary.reviewTargetRemovedIds : [];
  const mixedIds = Array.isArray(summary.primaryChangedReviewTargetMixedIds)
    ? summary.primaryChangedReviewTargetMixedIds
    : Array.isArray(impactSummary.reviewTargetMixedIds) ? impactSummary.reviewTargetMixedIds : [];
  const parts = [];
  const addedLabel = formatChangedIdReviewTargetIds(addedIds);
  const removedLabel = formatChangedIdReviewTargetIds(removedIds);
  const mixedLabel = formatChangedIdReviewTargetIds(mixedIds);
  if (reviewTargetLabel) parts.push(reviewTargetLabel);
  if (totalCount > 0) parts.push(`${totalCount}項目`);
  if (addedLabel) parts.push(`+${addedLabel}`);
  if (removedLabel) parts.push(`-${removedLabel}`);
  if (mixedLabel) parts.push(`~${mixedLabel}`);
  return parts.length ? parts.join(" / ") : fallback;
}

function formatCoreReadoutInventorySummary(summary, fallback = NO_DATA) {
  if (!summary || typeof summary !== "object") return fallback;
  const countsSource = summary.countsById || summary.counts_by_id || {};
  const counts = countsSource && typeof countsSource === "object" ? countsSource : {};
  const totalValueCountValue = summary.totalValueCount ?? summary.total_value_count;
  const capturedReadoutCountValue = summary.capturedReadoutCount ?? summary.captured_readout_count;
  const attemptedReadoutCountValue = summary.attemptedReadoutCount ?? summary.attempted_readout_count;
  const pendingReadoutCountValue = summary.pendingReadoutCount ?? summary.pending_readout_count;
  const errorReadoutCountValue = summary.errorReadoutCount ?? summary.error_readout_count;
  const failedReadoutCountValue = summary.failedReadoutCount ?? summary.failed_readout_count;
  const errorCodesSource = summary.errorCodes ?? summary.error_codes ?? [];
  const totalReadoutCountValue = summary.totalReadoutCount ?? summary.total_readout_count;
  const totalValueCount = Number.isFinite(Number(totalValueCountValue)) ? Number(totalValueCountValue) : 0;
  const captured = Number.isFinite(Number(capturedReadoutCountValue)) ? Number(capturedReadoutCountValue) : 0;
  const attempted = Number.isFinite(Number(attemptedReadoutCountValue)) ? Number(attemptedReadoutCountValue) : captured;
  const pending = Number.isFinite(Number(pendingReadoutCountValue)) ? Number(pendingReadoutCountValue) : 0;
  const errorReadoutCount = Number.isFinite(Number(errorReadoutCountValue)) ? Number(errorReadoutCountValue) : 0;
  const failedReadoutCount = Number.isFinite(Number(failedReadoutCountValue)) ? Number(failedReadoutCountValue) : 0;
  const errorCodes = Array.isArray(errorCodesSource) ? errorCodesSource : [];
  const total = Number.isFinite(Number(totalReadoutCountValue)) ? Number(totalReadoutCountValue) : 0;
  const parts = [];
  if (total) parts.push(`${captured}/${total}読取`);
  if (total && attempted !== captured) parts.push(`試行${attempted}/${total}`);
  if (pending > 0) parts.push(`保留${pending}`);
  if (failedReadoutCount > 0) parts.push(`読取失敗状態${failedReadoutCount}`);
  if (errorReadoutCount > 0) parts.push(`読取失敗${errorReadoutCount}`);
  const errorReasonLabel = formatReadoutErrorCodes(errorCodes);
  if (errorReasonLabel) parts.push(errorReasonLabel);
  parts.push(`${totalValueCount}値`);
  [
    ["DTC", "dtc_snapshot"],
    ["PID", "live_pid_snapshot"],
    ["FF", "freeze_frame_snapshot"],
    ["RDY", "readiness_snapshot"],
    ["ECU", "ecu_info_snapshot"],
    ["M06", "onboard_monitor_snapshot"],
    ["SUP", "supported_pid_matrix"]
  ].forEach(([label, id]) => {
    const count = Number.isFinite(Number(counts[id])) ? Number(counts[id]) : 0;
    if (count > 0) parts.push(`${label}${count}`);
  });
  return parts.length ? parts.join(" / ") : fallback;
}

function formatReadoutErrorCodes(errorCodes = []) {
  const labels = [...new Set((Array.isArray(errorCodes) ? errorCodes : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((code) => {
      if (code === "vci_not_detected") return "VCI未検出";
      if (code === "vci_not_connected") return "VCI未接続";
      if (code === "adapter_timeout") return "アダプター応答タイムアウト";
      if (code === "driver_timeout") return "VCIドライバー応答タイムアウト";
      if (code === "adapter_identity_timeout") return "アダプター識別タイムアウト";
      if (code === "transport:timeout") return "通信タイムアウト";
      if (/_not_observed$/.test(code)) return "応答未観測";
      if (/_transport_incomplete$/.test(code)) return "通信途中";
      if (/_payload_incomplete$/.test(code)) return "応答不足";
      if (/_payload_unparsed$/.test(code)) return "応答形式未対応";
      return code;
    }))];
  return labels.length ? `理由:${labels.slice(0, 3).join(",")}` : "";
}

function formatNativeConnectorInterruption(code) {
  const normalized = String(code || "").trim();
  if (normalized === "transport:bluetooth_unavailable") return "Bluetoothが利用できません。端末のBluetooth設定を確認";
  if (normalized === "transport:connection_timeout") return "BLE接続またはサービス検出が時間切れ。VCIの電源と距離を確認";
  if (normalized === "transport:write_capacity_timeout") return "BLE送信待機が時間切れ。接続を切り直して再読取";
  if (normalized === "transport:write_failed") return "BLE送信に失敗。接続を切り直して再読取";
  if (normalized === "transport:response_timeout") return "ELM327応答が時間切れ。VCI電源と車両通信を確認";
  if (normalized === "transport:response_too_large") return "ELM327応答が上限を超過。読取を中断";
  if (normalized === "transport:disconnected") return "BLE接続が切断。再接続後に読取専用で再開";
  if (normalized === "connector:peripheral_not_selected") return "BLE機器が未選択。対象VCIを選択して再開";
  if (normalized === "connector:characteristic_not_ready") return "BLE送受信特性を確認できません。VCIの通信仕様を確認";
  if (normalized === "connector:invalid_state") return "接続手順が未完了。接続状態を最初から確認";
  if (normalized === "readout:invalid_response") return "ELM327または車両応答を解釈できません。読取を中断";
  return normalized || "停止理由を記録できませんでした";
}

function formatCoreReadoutInventoryComparisonSummary(summary, fallback = NO_DATA) {
  if (!summary || typeof summary !== "object") return fallback;
  const totalValueCountDeltaValue = summary.totalValueCountDelta ?? summary.total_value_count_delta;
  const capturedReadoutDeltaValue = summary.capturedReadoutDelta ?? summary.captured_readout_delta;
  const attemptedReadoutDeltaValue = summary.attemptedReadoutDelta ?? summary.attempted_readout_delta;
  const pendingReadoutDeltaValue = summary.pendingReadoutDelta ?? summary.pending_readout_delta;
  const failedReadoutDeltaValue = summary.failedReadoutDelta ?? summary.failed_readout_delta;
  const totalDelta = Number.isFinite(Number(totalValueCountDeltaValue)) ? Number(totalValueCountDeltaValue) : 0;
  const capturedDelta = Number.isFinite(Number(capturedReadoutDeltaValue)) ? Number(capturedReadoutDeltaValue) : 0;
  const attemptedDelta = Number.isFinite(Number(attemptedReadoutDeltaValue)) ? Number(attemptedReadoutDeltaValue) : 0;
  const pendingDelta = Number.isFinite(Number(pendingReadoutDeltaValue)) ? Number(pendingReadoutDeltaValue) : 0;
  const failedDelta = Number.isFinite(Number(failedReadoutDeltaValue)) ? Number(failedReadoutDeltaValue) : 0;
  const changedIds = Array.isArray(summary.changedValueCountIds) ? summary.changedValueCountIds : Array.isArray(summary.changed_value_count_ids) ? summary.changed_value_count_ids : [];
  const changedFailedReasonIds = Array.isArray(summary.changedFailedReasonIds) ? summary.changedFailedReasonIds : Array.isArray(summary.changed_failed_reason_ids) ? summary.changed_failed_reason_ids : [];
  const snakeNextPendingReadoutChanged = summary.next_pending_readout_changed === true && summary.nextPendingReadoutChanged !== true;
  const rawPidUndecodedDeltaValue = summary.rawPidUndecodedDelta ?? summary.raw_pid_undecoded_delta;
  const livePidValueComparisonAvailable = summary.livePidValueComparisonAvailable === true || summary.live_pid_value_comparison_available === true;
  const importedLivePidValueCount = Number(summary.importedLivePidValueCount ?? summary.imported_live_pid_value_count ?? 0);
  const currentLivePidValueCount = Number(summary.currentLivePidValueCount ?? summary.current_live_pid_value_count ?? 0);
  const addedLivePidValueKeys = Array.isArray(summary.livePidValueAddedKeys) ? summary.livePidValueAddedKeys : Array.isArray(summary.live_pid_value_added_keys) ? summary.live_pid_value_added_keys : [];
  const removedLivePidValueKeys = Array.isArray(summary.livePidValueRemovedKeys) ? summary.livePidValueRemovedKeys : Array.isArray(summary.live_pid_value_removed_keys) ? summary.live_pid_value_removed_keys : [];
  const livePidUnitMismatchKeys = Array.isArray(summary.livePidUnitMismatchKeys) ? summary.livePidUnitMismatchKeys : Array.isArray(summary.live_pid_unit_mismatch_keys) ? summary.live_pid_unit_mismatch_keys : [];
  const freezeFrameTriggerDeltaValue = summary.freezeFrameTriggerCountDelta ?? summary.freeze_frame_trigger_count_delta;
  const freezeFrameTriggerComparisonAvailable = summary.freezeFrameTriggerComparisonAvailable === true || summary.freeze_frame_trigger_comparison_available === true;
  const importedFreezeFrameTriggerCount = Number(summary.importedFreezeFrameTriggerCount ?? summary.imported_freeze_frame_trigger_count ?? 0);
  const currentFreezeFrameTriggerCount = Number(summary.currentFreezeFrameTriggerCount ?? summary.current_freeze_frame_trigger_count ?? 0);
  const addedFreezeFrameTriggerKeys = Array.isArray(summary.freezeFrameTriggerAddedKeys) ? summary.freezeFrameTriggerAddedKeys : Array.isArray(summary.freeze_frame_trigger_added_keys) ? summary.freeze_frame_trigger_added_keys : [];
  const removedFreezeFrameTriggerKeys = Array.isArray(summary.freezeFrameTriggerRemovedKeys) ? summary.freezeFrameTriggerRemovedKeys : Array.isArray(summary.freeze_frame_trigger_removed_keys) ? summary.freeze_frame_trigger_removed_keys : [];
  const freezeFrameValueComparisonAvailable = summary.freezeFrameValueComparisonAvailable === true || summary.freeze_frame_value_comparison_available === true;
  const importedFreezeFrameValueCount = Number(summary.importedFreezeFrameValueCount ?? summary.imported_freeze_frame_value_count ?? 0);
  const currentFreezeFrameValueCount = Number(summary.currentFreezeFrameValueCount ?? summary.current_freeze_frame_value_count ?? 0);
  const addedFreezeFrameValueKeys = Array.isArray(summary.freezeFrameValueAddedKeys) ? summary.freezeFrameValueAddedKeys : Array.isArray(summary.freeze_frame_value_added_keys) ? summary.freeze_frame_value_added_keys : [];
  const removedFreezeFrameValueKeys = Array.isArray(summary.freezeFrameValueRemovedKeys) ? summary.freezeFrameValueRemovedKeys : Array.isArray(summary.freeze_frame_value_removed_keys) ? summary.freeze_frame_value_removed_keys : [];
  const freezeFrameUdsRecordComparisonAvailable = summary.freezeFrameUdsRecordComparisonAvailable === true || summary.freeze_frame_uds_record_comparison_available === true;
  const importedFreezeFrameUdsRecordCount = Number(summary.importedFreezeFrameUdsRecordCount ?? summary.imported_freeze_frame_uds_record_count ?? 0);
  const currentFreezeFrameUdsRecordCount = Number(summary.currentFreezeFrameUdsRecordCount ?? summary.current_freeze_frame_uds_record_count ?? 0);
  const addedFreezeFrameUdsRecordKeys = Array.isArray(summary.freezeFrameUdsRecordAddedKeys) ? summary.freezeFrameUdsRecordAddedKeys : Array.isArray(summary.freeze_frame_uds_record_added_keys) ? summary.freeze_frame_uds_record_added_keys : [];
  const removedFreezeFrameUdsRecordKeys = Array.isArray(summary.freezeFrameUdsRecordRemovedKeys) ? summary.freezeFrameUdsRecordRemovedKeys : Array.isArray(summary.freeze_frame_uds_record_removed_keys) ? summary.freeze_frame_uds_record_removed_keys : [];
  const readinessMonitorComparisonAvailable = summary.readinessMonitorComparisonAvailable === true || summary.readiness_monitor_comparison_available === true;
  const importedReadinessMonitorCount = Number(summary.importedReadinessMonitorCount ?? summary.imported_readiness_monitor_count ?? 0);
  const currentReadinessMonitorCount = Number(summary.currentReadinessMonitorCount ?? summary.current_readiness_monitor_count ?? 0);
  const addedReadinessMonitorKeys = Array.isArray(summary.readinessMonitorAddedKeys) ? summary.readinessMonitorAddedKeys : Array.isArray(summary.readiness_monitor_added_keys) ? summary.readiness_monitor_added_keys : [];
  const removedReadinessMonitorKeys = Array.isArray(summary.readinessMonitorRemovedKeys) ? summary.readinessMonitorRemovedKeys : Array.isArray(summary.readiness_monitor_removed_keys) ? summary.readiness_monitor_removed_keys : [];
  const ecuInfoItemComparisonAvailable = summary.ecuInfoItemComparisonAvailable === true || summary.ecu_info_item_comparison_available === true;
  const importedEcuInfoItemCount = Number(summary.importedEcuInfoItemCount ?? summary.imported_ecu_info_item_count ?? 0);
  const currentEcuInfoItemCount = Number(summary.currentEcuInfoItemCount ?? summary.current_ecu_info_item_count ?? 0);
  const addedEcuInfoItemKeys = Array.isArray(summary.ecuInfoItemAddedKeys) ? summary.ecuInfoItemAddedKeys : Array.isArray(summary.ecu_info_item_added_keys) ? summary.ecu_info_item_added_keys : [];
  const removedEcuInfoItemKeys = Array.isArray(summary.ecuInfoItemRemovedKeys) ? summary.ecuInfoItemRemovedKeys : Array.isArray(summary.ecu_info_item_removed_keys) ? summary.ecu_info_item_removed_keys : [];
  const ecuInfoKeyValueComparisonAvailable = summary.ecuInfoKeyValueComparisonAvailable === true || summary.ecu_info_key_value_comparison_available === true;
  const importedEcuInfoKeyValueCount = Number(summary.importedEcuInfoKeyValueCount ?? summary.imported_ecu_info_key_value_count ?? 0);
  const currentEcuInfoKeyValueCount = Number(summary.currentEcuInfoKeyValueCount ?? summary.current_ecu_info_key_value_count ?? 0);
  const addedEcuInfoKeyValueKeys = Array.isArray(summary.ecuInfoKeyValueAddedKeys) ? summary.ecuInfoKeyValueAddedKeys : Array.isArray(summary.ecu_info_key_value_added_keys) ? summary.ecu_info_key_value_added_keys : [];
  const removedEcuInfoKeyValueKeys = Array.isArray(summary.ecuInfoKeyValueRemovedKeys) ? summary.ecuInfoKeyValueRemovedKeys : Array.isArray(summary.ecu_info_key_value_removed_keys) ? summary.ecu_info_key_value_removed_keys : [];
  const mode09SupportedTypeComparisonAvailable = summary.mode09SupportedTypeComparisonAvailable === true || summary.mode09_supported_type_comparison_available === true;
  const importedMode09SupportedTypeCount = Number(summary.importedMode09SupportedTypeCount ?? summary.imported_mode09_supported_type_count ?? 0);
  const currentMode09SupportedTypeCount = Number(summary.currentMode09SupportedTypeCount ?? summary.current_mode09_supported_type_count ?? 0);
  const addedMode09SupportedTypeKeys = Array.isArray(summary.mode09SupportedTypeAddedKeys) ? summary.mode09SupportedTypeAddedKeys : Array.isArray(summary.mode09_supported_type_added_keys) ? summary.mode09_supported_type_added_keys : [];
  const removedMode09SupportedTypeKeys = Array.isArray(summary.mode09SupportedTypeRemovedKeys) ? summary.mode09SupportedTypeRemovedKeys : Array.isArray(summary.mode09_supported_type_removed_keys) ? summary.mode09_supported_type_removed_keys : [];
  const supportedPidComparisonAvailable = summary.supportedPidComparisonAvailable === true || summary.supported_pid_comparison_available === true;
  const importedSupportedPidCount = Number(summary.importedSupportedPidCount ?? summary.imported_supported_pid_count ?? 0);
  const currentSupportedPidCount = Number(summary.currentSupportedPidCount ?? summary.current_supported_pid_count ?? 0);
  const addedSupportedPidKeys = Array.isArray(summary.supportedPidAddedKeys) ? summary.supportedPidAddedKeys : Array.isArray(summary.supported_pid_added_keys) ? summary.supported_pid_added_keys : [];
  const removedSupportedPidKeys = Array.isArray(summary.supportedPidRemovedKeys) ? summary.supportedPidRemovedKeys : Array.isArray(summary.supported_pid_removed_keys) ? summary.supported_pid_removed_keys : [];
  const onboardMonitorComparisonAvailable = summary.onboardMonitorComparisonAvailable === true || summary.onboard_monitor_comparison_available === true;
  const importedOnboardMonitorTestCount = Number(summary.importedOnboardMonitorTestCount ?? summary.imported_onboard_monitor_test_count ?? 0);
  const currentOnboardMonitorTestCount = Number(summary.currentOnboardMonitorTestCount ?? summary.current_onboard_monitor_test_count ?? 0);
  const addedOnboardMonitorTestKeys = Array.isArray(summary.onboardMonitorTestAddedKeys) ? summary.onboardMonitorTestAddedKeys : Array.isArray(summary.onboard_monitor_test_added_keys) ? summary.onboard_monitor_test_added_keys : [];
  const removedOnboardMonitorTestKeys = Array.isArray(summary.onboardMonitorTestRemovedKeys) ? summary.onboardMonitorTestRemovedKeys : Array.isArray(summary.onboard_monitor_test_removed_keys) ? summary.onboard_monitor_test_removed_keys : [];
  const onboardMonitorValueComparisonAvailable = summary.onboardMonitorValueComparisonAvailable === true || summary.onboard_monitor_value_comparison_available === true;
  const importedOnboardMonitorValueCount = Number(summary.importedOnboardMonitorValueCount ?? summary.imported_onboard_monitor_value_count ?? 0);
  const currentOnboardMonitorValueCount = Number(summary.currentOnboardMonitorValueCount ?? summary.current_onboard_monitor_value_count ?? 0);
  const addedOnboardMonitorValueKeys = Array.isArray(summary.onboardMonitorValueAddedKeys) ? summary.onboardMonitorValueAddedKeys : Array.isArray(summary.onboard_monitor_value_added_keys) ? summary.onboard_monitor_value_added_keys : [];
  const removedOnboardMonitorValueKeys = Array.isArray(summary.onboardMonitorValueRemovedKeys) ? summary.onboardMonitorValueRemovedKeys : Array.isArray(summary.onboard_monitor_value_removed_keys) ? summary.onboard_monitor_value_removed_keys : [];
  const readinessIncompleteDeltaValue = summary.readinessIncompleteDelta ?? summary.readiness_incomplete_delta;
  const ecuInfoMissingKeyDeltaValue = summary.ecuInfoMissingKeyDelta ?? summary.ecu_info_missing_key_delta;
  const rawDelta = Number.isFinite(Number(rawPidUndecodedDeltaValue)) ? Number(rawPidUndecodedDeltaValue) : 0;
  const freezeFrameTriggerDelta = Number.isFinite(Number(freezeFrameTriggerDeltaValue)) ? Number(freezeFrameTriggerDeltaValue) : 0;
  const readinessDelta = Number.isFinite(Number(readinessIncompleteDeltaValue)) ? Number(readinessIncompleteDeltaValue) : 0;
  const ecuDelta = Number.isFinite(Number(ecuInfoMissingKeyDeltaValue)) ? Number(ecuInfoMissingKeyDeltaValue) : 0;
  const parts = [];
  if (totalDelta !== 0) parts.push(`値${totalDelta > 0 ? "+" : ""}${totalDelta}`);
  if (capturedDelta !== 0) parts.push(`読取${capturedDelta > 0 ? "+" : ""}${capturedDelta}`);
  if (attemptedDelta !== 0) parts.push(`試行${attemptedDelta > 0 ? "+" : ""}${attemptedDelta}`);
  if (pendingDelta !== 0) parts.push(`保留${pendingDelta > 0 ? "+" : ""}${pendingDelta}`);
  if (failedDelta !== 0) parts.push(`失敗${failedDelta > 0 ? "+" : ""}${failedDelta}`);
  if (changedIds.length) parts.push(changedIds.slice(0, 3).map((id) => formatCoreReadoutLabel(id, id)).join(","));
  if (changedFailedReasonIds.length) parts.push(`失敗理由:${changedFailedReasonIds.slice(0, 3).map((id) => formatCoreReadoutLabel(id, id)).join(",")}`);
  if (summary.nextPendingReadoutChanged === true || snakeNextPendingReadoutChanged) {
    const nextId = summary.currentNextPendingReadoutId ?? summary.current_next_pending_readout_id;
    parts.push(`次${formatCoreReadoutLabel(nextId, nextId || "なし")}`);
  }
  if (rawDelta) parts.push(`raw${rawDelta > 0 ? "+" : ""}${rawDelta}`);
  if (addedLivePidValueKeys.length || removedLivePidValueKeys.length) {
    const displayLivePidValueKey = (key) => {
      const [id, ecu, unit, value] = String(key || "").split("|");
      return `${id || "PID"}${ecu && ecu !== "-" ? `@${ecu}` : ""}:${value || "?"}${unit || ""}`;
    };
    parts.push(`PID値:${[...addedLivePidValueKeys.map((key) => `+${displayLivePidValueKey(key)}`), ...removedLivePidValueKeys.map((key) => `-${displayLivePidValueKey(key)}`)].slice(0, 3).join(",")}`);
  }
  if (livePidUnitMismatchKeys.length) parts.push("PID単位不一致のため比較不可");
  if (!livePidValueComparisonAvailable && !livePidUnitMismatchKeys.length && (importedLivePidValueCount > 0 || currentLivePidValueCount > 0)) parts.push("PID値詳細比較不可");
  if (freezeFrameTriggerDelta) parts.push(`FF起点${freezeFrameTriggerDelta > 0 ? "+" : ""}${freezeFrameTriggerDelta}`);
  if (addedFreezeFrameTriggerKeys.length || removedFreezeFrameTriggerKeys.length) {
    const displayKey = (key) => String(key || "").split("|")[0] || "DTC";
    parts.push(`FF起点:${[...addedFreezeFrameTriggerKeys.map((key) => `+${displayKey(key)}`), ...removedFreezeFrameTriggerKeys.map((key) => `-${displayKey(key)}`)].slice(0, 3).join(",")}`);
  }
  if (!freezeFrameTriggerComparisonAvailable && (importedFreezeFrameTriggerCount > 0 || currentFreezeFrameTriggerCount > 0)) parts.push("FF起点詳細比較不可");
  if (addedFreezeFrameValueKeys.length || removedFreezeFrameValueKeys.length) {
    const displayFreezeFrameValueKey = (key) => {
      const [id, , , unit, value] = String(key || "").split("|");
      return `${id || "PID"}:${value || "?"}${unit && unit !== "-" ? unit : ""}`;
    };
    parts.push(`FF値:${[...addedFreezeFrameValueKeys.map((key) => `+${displayFreezeFrameValueKey(key)}`), ...removedFreezeFrameValueKeys.map((key) => `-${displayFreezeFrameValueKey(key)}`)].slice(0, 3).join(",")}`);
  }
  if (!freezeFrameValueComparisonAvailable && (importedFreezeFrameValueCount > 0 || currentFreezeFrameValueCount > 0)) parts.push("FF値詳細比較不可");
  if (addedFreezeFrameUdsRecordKeys.length || removedFreezeFrameUdsRecordKeys.length) {
    const displayFreezeFrameUdsRecordKey = (key) => {
      const [kind, code, , , , recordNumber] = String(key || "").split("|");
      return kind === "snapshot" ? `${code || "DTC"}#${recordNumber || "?"}` : `保存#${recordNumber || "?"}`;
    };
    parts.push(`UDS FF:${[...addedFreezeFrameUdsRecordKeys.map((key) => `+${displayFreezeFrameUdsRecordKey(key)}`), ...removedFreezeFrameUdsRecordKeys.map((key) => `-${displayFreezeFrameUdsRecordKey(key)}`)].slice(0, 3).join(",")}`);
  }
  if (!freezeFrameUdsRecordComparisonAvailable && (importedFreezeFrameUdsRecordCount > 0 || currentFreezeFrameUdsRecordCount > 0)) parts.push("UDS FF詳細比較不可");
  if (addedReadinessMonitorKeys.length || removedReadinessMonitorKeys.length) {
    const displayReadinessKey = (key) => {
      const [id, , , complete] = String(key || "").split("|");
      return `${id || "monitor"}:${complete === "complete" ? "完了" : complete === "not_complete" ? "未完" : "不明"}`;
    };
    parts.push(`RDY状態:${[...addedReadinessMonitorKeys.map((key) => `+${displayReadinessKey(key)}`), ...removedReadinessMonitorKeys.map((key) => `-${displayReadinessKey(key)}`)].slice(0, 3).join(",")}`);
  }
  if (!readinessMonitorComparisonAvailable && (importedReadinessMonitorCount > 0 || currentReadinessMonitorCount > 0)) parts.push("RDY詳細比較不可");
  if (addedEcuInfoItemKeys.length || removedEcuInfoItemKeys.length) {
    const displayEcuInfoKey = (key) => String(key || "").split("|")[0] || "item";
    parts.push(`ECU項目:${[...addedEcuInfoItemKeys.map((key) => `+${displayEcuInfoKey(key)}`), ...removedEcuInfoItemKeys.map((key) => `-${displayEcuInfoKey(key)}`)].slice(0, 3).join(",")}`);
  }
  if (!ecuInfoItemComparisonAvailable && (importedEcuInfoItemCount > 0 || currentEcuInfoItemCount > 0)) parts.push("ECU詳細比較不可");
  if (addedEcuInfoKeyValueKeys.length || removedEcuInfoKeyValueKeys.length) {
    const displayEcuInfoKeyValue = (key) => {
      const [id, , ecu] = String(key || "").split("|");
      const label = id === "calibration_id" ? "CALID" : id === "calibration_verification_number" ? "CVN" : "ECU値";
      return `${label}${ecu && ecu !== "-" ? `@${ecu}` : ""}`;
    };
    parts.push(`ECU値:${[...addedEcuInfoKeyValueKeys.map((key) => `+${displayEcuInfoKeyValue(key)}`), ...removedEcuInfoKeyValueKeys.map((key) => `-${displayEcuInfoKeyValue(key)}`)].slice(0, 3).join(",")}`);
  }
  if (!ecuInfoKeyValueComparisonAvailable && (importedEcuInfoKeyValueCount > 0 || currentEcuInfoKeyValueCount > 0)) parts.push("ECU値詳細比較不可");
  if (addedMode09SupportedTypeKeys.length || removedMode09SupportedTypeKeys.length) {
    const displayMode09SupportedTypeKey = (key) => {
      const [infoType, ecu] = String(key || "").split("|");
      return `${infoType || "情報"}${ecu && ecu !== "-" ? `@${ecu}` : ""}`;
    };
    parts.push(`Mode09対応:${[...addedMode09SupportedTypeKeys.map((key) => `+${displayMode09SupportedTypeKey(key)}`), ...removedMode09SupportedTypeKeys.map((key) => `-${displayMode09SupportedTypeKey(key)}`)].slice(0, 3).join(",")}`);
  }
  if (!mode09SupportedTypeComparisonAvailable && (importedMode09SupportedTypeCount > 0 || currentMode09SupportedTypeCount > 0)) parts.push("Mode09対応詳細比較不可");
  if (addedSupportedPidKeys.length || removedSupportedPidKeys.length) {
    const displaySupportedPidKey = (key) => String(key || "").split("|")[0] || "PID";
    parts.push(`PID対応:${[...addedSupportedPidKeys.map((key) => `+${displaySupportedPidKey(key)}`), ...removedSupportedPidKeys.map((key) => `-${displaySupportedPidKey(key)}`)].slice(0, 3).join(",")}`);
  }
  if (!supportedPidComparisonAvailable && (importedSupportedPidCount > 0 || currentSupportedPidCount > 0)) parts.push("PID詳細比較不可");
  if (addedOnboardMonitorTestKeys.length || removedOnboardMonitorTestKeys.length) {
    const displayOnboardMonitorKey = (key) => {
      const [testId, componentId, , status] = String(key || "").split("|");
      return (testId || "TID") + "-" + (componentId || "CID") + ":" + (status === "pass" ? "合格" : status === "fail" ? "範囲外" : "不明");
    };
    parts.push("M06状態:" + [...addedOnboardMonitorTestKeys.map((key) => "+" + displayOnboardMonitorKey(key)), ...removedOnboardMonitorTestKeys.map((key) => "-" + displayOnboardMonitorKey(key))].slice(0, 3).join(","));
  }
  if (!onboardMonitorComparisonAvailable && (importedOnboardMonitorTestCount > 0 || currentOnboardMonitorTestCount > 0)) parts.push("M06詳細比較不可");
  if (addedOnboardMonitorValueKeys.length || removedOnboardMonitorValueKeys.length) {
    const displayOnboardMonitorValueKey = (key) => {
      const [testId, componentId, ecu, value, minimum, maximum] = String(key || "").split("|");
      const limits = minimum !== "-" && maximum !== "-" ? ` (${minimum}-${maximum})` : "";
      return `${testId || "TID"}-${componentId || "CID"}${ecu && ecu !== "-" ? `@${ecu}` : ""}:${value || "?"}${limits}`;
    };
    parts.push(`M06値:${[...addedOnboardMonitorValueKeys.map((key) => `+${displayOnboardMonitorValueKey(key)}`), ...removedOnboardMonitorValueKeys.map((key) => `-${displayOnboardMonitorValueKey(key)}`)].slice(0, 3).join(",")}`);
  }
  if (!onboardMonitorValueComparisonAvailable && (importedOnboardMonitorValueCount > 0 || currentOnboardMonitorValueCount > 0)) parts.push("M06値詳細比較不可");
  if (readinessDelta) parts.push(`RDY未完${readinessDelta > 0 ? "+" : ""}${readinessDelta}`);
  if (ecuDelta) parts.push(`ECU不足${ecuDelta > 0 ? "+" : ""}${ecuDelta}`);
  return parts.length ? parts.join(" / ") : "変化なし";
}

function formatObservedEcuComparisonSummary(summary, fallback = NO_DATA) {
  if (!summary || typeof summary !== "object") return fallback;
  const available = summary.observedEcuComparisonAvailable === true || summary.observed_ecu_comparison_available === true;
  const added = Array.isArray(summary.observedEcuAddedKeys) ? summary.observedEcuAddedKeys : Array.isArray(summary.observed_ecu_added_keys) ? summary.observed_ecu_added_keys : [];
  const removed = Array.isArray(summary.observedEcuRemovedKeys) ? summary.observedEcuRemovedKeys : Array.isArray(summary.observed_ecu_removed_keys) ? summary.observed_ecu_removed_keys : [];
  const displayKey = (key) => {
    const [ecu, readoutId, status] = String(key || "").split("|");
    const readoutLabels = { dtc_snapshot: "DTC", ecu_response_summary: "ECU応答", live_pid_snapshot: "ライブ", freeze_frame_snapshot: "FF", readiness_snapshot: "RDY", ecu_info_snapshot: "ECU情報", onboard_monitor_snapshot: "M06", supported_pid_matrix: "PID" };
    const statusLabels = { reported: "応答", negative_response: "負応答", pending_response: "保留応答", unparsed: "未解析", no_response: "無応答", unknown: "不明" };
    return `${ecu || "ECU"}:${readoutLabels[readoutId] || readoutId || "読取"}:${statusLabels[status] || "不明"}`;
  };
  if (added.length || removed.length) return `ECU応答:${[...added.map((key) => `+${displayKey(key)}`), ...removed.map((key) => `-${displayKey(key)}`)].slice(0, 3).join(",")}`;
  return available ? "変化なし" : "ECU応答詳細比較不可";
}

function formatDtcIdentityComparisonSummary(summary, fallback = NO_DATA) {
  if (!summary || typeof summary !== "object") return fallback;
  const available = summary.dtcIdentityComparisonAvailable === true || summary.dtc_identity_comparison_available === true;
  const added = Array.isArray(summary.dtcIdentityAddedKeys) ? summary.dtcIdentityAddedKeys : Array.isArray(summary.dtc_identity_added_keys) ? summary.dtc_identity_added_keys : [];
  const removed = Array.isArray(summary.dtcIdentityRemovedKeys) ? summary.dtcIdentityRemovedKeys : Array.isArray(summary.dtc_identity_removed_keys) ? summary.dtc_identity_removed_keys : [];
  const displayKey = (key) => {
    const [code, subcode, , status, reportedStatus, ecu, oemDetailCode] = String(key || "").split("|");
    const statusLabel = { stored: "保存", pending: "保留", permanent: "永久", unknown: "不明" }[status] || "不明";
    const reported = reportedStatus && reportedStatus !== "unreported" ? `/${reportedStatus}` : "";
    const detail = oemDetailCode ? `-${oemDetailCode}` : "";
    return `${code || "DTC"}${subcode && subcode !== "-" ? `:${subcode}` : detail}${ecu && ecu !== "-" ? `@${ecu}` : ""}:${statusLabel}${reported}`;
  };
  if (added.length || removed.length) return `DTC:${[...added.map((key) => `+${displayKey(key)}`), ...removed.map((key) => `-${displayKey(key)}`)].slice(0, 3).join(",")}`;
  return available ? "変化なし" : "DTC詳細比較不可";
}

function formatDtcStatusByteComparisonSummary(summary, fallback = NO_DATA) {
  if (!summary || typeof summary !== "object") return fallback;
  const available = summary.dtcStatusByteComparisonAvailable === true || summary.dtc_status_byte_comparison_available === true;
  const added = Array.isArray(summary.dtcStatusByteAddedKeys) ? summary.dtcStatusByteAddedKeys : Array.isArray(summary.dtc_status_byte_added_keys) ? summary.dtc_status_byte_added_keys : [];
  const removed = Array.isArray(summary.dtcStatusByteRemovedKeys) ? summary.dtcStatusByteRemovedKeys : Array.isArray(summary.dtc_status_byte_removed_keys) ? summary.dtc_status_byte_removed_keys : [];
  const displayKey = (key) => {
    const [code, , , , , ecu, statusByte, memory] = String(key || "").split("|");
    const status = statusByte && statusByte !== "-" ? `0x${statusByte}` : "状態未報告";
    const selection = memory && memory !== "-" ? `/M${memory}` : "";
    return `${code || "DTC"}${ecu && ecu !== "-" ? `@${ecu}` : ""}:${status}${selection}`;
  };
  if (added.length || removed.length) return `DTC状態:${[...added.map((key) => `+${displayKey(key)}`), ...removed.map((key) => `-${displayKey(key)}`)].slice(0, 3).join(",")}`;
  return available ? "変化なし" : "DTC状態詳細比較不可";
}

function formatDtcMetadataComparisonSummary(summary, fallback = NO_DATA) {
  if (!summary || typeof summary !== "object") return fallback;
  const available = summary.dtcMetadataComparisonAvailable === true || summary.dtc_metadata_comparison_available === true;
  const added = Array.isArray(summary.dtcMetadataAddedKeys) ? summary.dtcMetadataAddedKeys : Array.isArray(summary.dtc_metadata_added_keys) ? summary.dtc_metadata_added_keys : [];
  const removed = Array.isArray(summary.dtcMetadataRemovedKeys) ? summary.dtcMetadataRemovedKeys : Array.isArray(summary.dtc_metadata_removed_keys) ? summary.dtc_metadata_removed_keys : [];
  const displayKey = (key) => {
    const [code, , , , , ecu, severity, occurrenceCount] = String(key || "").split("|");
    const details = [
      severity && severity !== "-" ? `重大度${severity}` : null,
      occurrenceCount && occurrenceCount !== "-" ? `回数${occurrenceCount}` : null
    ].filter(Boolean).join("/");
    return `${code || "DTC"}${ecu && ecu !== "-" ? `@${ecu}` : ""}:${details || "報告詳細なし"}`;
  };
  if (added.length || removed.length) return `DTC報告:${[...added.map((key) => `+${displayKey(key)}`), ...removed.map((key) => `-${displayKey(key)}`)].slice(0, 3).join(",")}`;
  return available ? "変化なし" : "DTC報告詳細比較不可";
}

function formatDtcFaultDetectionCounterComparisonSummary(summary, fallback = NO_DATA) {
  if (!summary || typeof summary !== "object") return fallback;
  const available = summary.dtcFaultDetectionCounterComparisonAvailable === true || summary.dtc_fault_detection_counter_comparison_available === true;
  const added = Array.isArray(summary.dtcFaultDetectionCounterAddedKeys) ? summary.dtcFaultDetectionCounterAddedKeys : Array.isArray(summary.dtc_fault_detection_counter_added_keys) ? summary.dtc_fault_detection_counter_added_keys : [];
  const removed = Array.isArray(summary.dtcFaultDetectionCounterRemovedKeys) ? summary.dtcFaultDetectionCounterRemovedKeys : Array.isArray(summary.dtc_fault_detection_counter_removed_keys) ? summary.dtc_fault_detection_counter_removed_keys : [];
  const displayKey = (key) => {
    const [code, , , , , ecu, counter] = String(key || "").split("|");
    return `${code || "DTC"}${ecu && ecu !== "-" ? `@${ecu}` : ""}:0x${counter || "--"}`;
  };
  if (added.length || removed.length) return `DTC検出回数:${[...added.map((key) => `+${displayKey(key)}`), ...removed.map((key) => `-${displayKey(key)}`)].slice(0, 3).join(",")}`;
  return available ? "変化なし" : "DTC検出回数比較不可";
}

function formatDtcEvidenceFieldIds(fieldIds = []) {
  const labels = {
    dtc_first_detected_at: "初回検出時刻",
    dtc_last_detected_at: "最終検出時刻",
    dtc_confirmed_at: "確定時刻",
    dtc_fault_occurrence_distance: "故障時距離",
    dtc_fault_occurrence_distance_unit: "故障時距離単位",
    dtc_distance_since_clear: "消去後距離",
    dtc_distance_since_clear_unit: "消去後距離単位",
    dtc_warm_up_cycle_count: "暖機回数",
    dtc_ignition_cycle_count: "IG回数",
    dtc_fault_duration: "故障継続時間",
    dtc_fault_duration_unit: "故障継続単位",
    dtc_time_since_clear: "消去後時間",
    dtc_time_since_clear_unit: "消去後時間単位",
    dtc_failure_occurrence_count: "故障発生回数",
    dtc_recovery_count: "正常化回数",
    dtc_last_cleared_at: "最終消去時刻",
    dtc_confirmation_threshold: "確定閾値",
    dtc_recovery_threshold: "正常化閾値",
    dtc_aging_cycle_count: "エージング回数"
  };
  const ids = [...new Set((Array.isArray(fieldIds) ? fieldIds : []).filter(Boolean).map(String))];
  const visible = ids.slice(0, 2).map((id) => Object.prototype.hasOwnProperty.call(labels, id) ? labels[id] : id);
  if (ids.length > visible.length) visible.push(`他${ids.length - visible.length}`);
  return visible.join("・");
}

function readReadoutQualityDisplayCount(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+$/.test(value.trim())) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function formatDtcEvidenceReasonCounts(reasonCounts = {}) {
  const labels = {
    invalid_timestamp: "時刻形式",
    invalid_number: "数値形式",
    invalid_integer: "整数形式",
    unsupported_unit: "単位未対応",
    invalid_value: "値不正"
  };
  return Object.entries(reasonCounts && typeof reasonCounts === "object" ? reasonCounts : {})
    .filter(([, count]) => readReadoutQualityDisplayCount(count) > 0)
    .slice(0, 3)
    .map(([reason, count]) => `${Object.prototype.hasOwnProperty.call(labels, reason) ? labels[reason] : reason}${readReadoutQualityDisplayCount(count)}`)
    .join("・");
}

function formatReadoutQualitySummary(summary, fallback = NO_DATA) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return fallback;
  const issueCountValue = summary.issueCount ?? summary.issue_count;
  const rawCountValue = summary.rawPidUndecodedCount ?? summary.raw_pid_undecoded_count;
  const readinessCountValue = summary.readinessIncompleteCount ?? summary.readiness_incomplete_count;
  const ecuCountValue = summary.ecuInfoMissingKeyCount ?? summary.ecu_info_missing_key_count;
  const mode06CountValue = summary.onboardMonitorFailedCount ?? summary.onboard_monitor_failed_count;
  const webSerialResponseReviewCountValue = summary.webSerialResponseReviewCount ?? summary.web_serial_response_review_count;
  const invalidDtcEvidenceCountValue = summary.invalidDtcEvidenceObservationCount ?? summary.invalid_dtc_evidence_observation_count;
  const invalidDtcEvidenceFieldIds = Array.isArray(summary.invalidDtcEvidenceFieldIds) ? summary.invalidDtcEvidenceFieldIds : Array.isArray(summary.invalid_dtc_evidence_field_ids) ? summary.invalid_dtc_evidence_field_ids : [];
  const invalidDtcEvidenceReasonCounts = summary.invalidDtcEvidenceReasonCounts || summary.invalid_dtc_evidence_reason_counts || {};
  const issueCount = readReadoutQualityDisplayCount(issueCountValue);
  const rawCount = readReadoutQualityDisplayCount(rawCountValue);
  const readinessCount = readReadoutQualityDisplayCount(readinessCountValue);
  const ecuCount = readReadoutQualityDisplayCount(ecuCountValue);
  const mode06Count = readReadoutQualityDisplayCount(mode06CountValue);
  const webSerialResponseReviewCount = readReadoutQualityDisplayCount(webSerialResponseReviewCountValue);
  const invalidDtcEvidenceCount = readReadoutQualityDisplayCount(invalidDtcEvidenceCountValue);
  const invalidEvidenceReported = summary.dtcEvidenceValidationStatus === "invalid_evidence_excluded" || summary.dtc_evidence_validation_status === "invalid_evidence_excluded";
  const parts = [];
  if (rawCount) parts.push(`RAW${rawCount}`);
  if (readinessCount) parts.push(`RDY未完${readinessCount}`);
  if (ecuCount) parts.push(`ECU不足${ecuCount}`);
  if (mode06Count) parts.push(`M06失敗${mode06Count}`);
  if (webSerialResponseReviewCount) parts.push(`通信応答${webSerialResponseReviewCount}`);
  if (invalidDtcEvidenceCount || invalidDtcEvidenceFieldIds.length || invalidEvidenceReported) {
    const fieldLabel = formatDtcEvidenceFieldIds(invalidDtcEvidenceFieldIds);
    const reasonLabel = formatDtcEvidenceReasonCounts(invalidDtcEvidenceReasonCounts);
    parts.push(`DTC証跡除外${invalidDtcEvidenceCount > 0 ? invalidDtcEvidenceCount : "（件数未記録）"}${fieldLabel ? `(${fieldLabel})` : ""}${reasonLabel ? ` 理由:${reasonLabel}` : ""}`);
  }
  if (parts.length) return parts.join(" / ");
  if (issueCount > 0) return `${issueCount}件`;
  if (summary.reviewRequired === true || summary.review_required === true
    || [summary.issueIds, summary.issue_ids].some((ids) => Array.isArray(ids) && ids.length > 0)) return "要確認（項目未記録）";
  const hasInvalidCount = [issueCountValue, rawCountValue, readinessCountValue, ecuCountValue, mode06CountValue, webSerialResponseReviewCountValue, invalidDtcEvidenceCountValue]
    .some((value) => value !== undefined && value !== null && !(typeof value === "string" && value.trim() === "") && readReadoutQualityDisplayCount(value) === null);
  return issueCount === 0 && !hasInvalidCount ? "要確認なし" : fallback;
}

function getImportedReadoutQualityForDisplay(session) {
  const summary = session?.importedReadoutQualitySummary || session?.imported_readout_quality_summary;
  return summary && typeof summary === "object" && !Array.isArray(summary) ? summary : null;
}

function formatManufacturerSampleReadinessSummary(summary, fallback = NO_DATA) {
  if (!summary || typeof summary !== "object") return fallback;
  const status = String(summary.status || "").trim();
  const requirementCountValue = summary.requirementCount ?? summary.requirement_count;
  const completeRequirementCountValue = summary.completeRequirementCount ?? summary.complete_requirement_count;
  const requirementCount = Number.isFinite(Number(requirementCountValue)) ? Number(requirementCountValue) : 0;
  const completeRequirementCount = Number.isFinite(Number(completeRequirementCountValue)) ? Number(completeRequirementCountValue) : 0;
  const missingRequirementIds = Array.isArray(summary.missingRequirementIds)
    ? summary.missingRequirementIds
    : Array.isArray(summary.missing_requirement_ids) ? summary.missing_requirement_ids : [];
  const missingLabels = {
    dtc_evidence_scope: "車両/ECU/DTC範囲",
    acquisition_context: "取得時刻/方式/スキャンID",
    transport_context: "試行/経路/VCI",
    readout_contract: "読取区分/要求",
    response_contract: "応答サービス/状態",
    negative_response_context: "NRC/保留応答",
    response_attempt_context: "否定対象/回数/待機",
    evidence_validation_reported: "証跡検証報告",
    evidence_values_valid: "証跡値"
  };
  if (status === "sample_not_observed" || summary.sampleObserved === false || summary.sample_observed === false) {
    return "DTCサンプル未取込";
  }
  if (status === "contract_ready_unverified" || summary.contractCompleteForSampleReview === true || summary.contract_complete_for_sample_review === true) {
    return `実機比較準備済み ${completeRequirementCount || requirementCount}/${requirementCount || completeRequirementCount} / 実車未検証`;
  }
  const visibleMissing = missingRequirementIds.slice(0, 2).map((id) => missingLabels[id] || id);
  if (missingRequirementIds.length > visibleMissing.length) visibleMissing.push(`他${missingRequirementIds.length - visibleMissing.length}`);
  const countLabel = requirementCount ? `${completeRequirementCount}/${requirementCount}` : `${missingRequirementIds.length}項目不足`;
  return `証跡不足 ${countLabel}${visibleMissing.length ? ` (${visibleMissing.join("・")})` : ""}`;
}

function formatManufacturerSampleResponseComparisonSummary(summary, fallback = NO_DATA) {
  if (!summary || typeof summary !== "object") return fallback;
  const comparable = summary.comparable === true;
  const status = String(summary.status || "not_comparable");
  const importedOutcome = String(summary.importedOutcome || summary.imported_outcome || "unknown");
  const currentOutcome = String(summary.currentOutcome || summary.current_outcome || "unknown");
  const outcomeLabels = {
    positive_response: "正常応答",
    negative_response: "否定応答",
    pending_response: "応答保留",
    no_response: "無応答",
    unknown: "未分類"
  };
  if (!comparable || status === "not_comparable") {
    const blockedReasonIds = Array.isArray(summary.blockedReasonIds)
      ? summary.blockedReasonIds
      : Array.isArray(summary.blocked_reason_ids) ? summary.blocked_reason_ids : [];
    const blockedReasonLabels = {
      imported_manufacturer_sample_incomplete: "保存側証跡不足",
      current_manufacturer_sample_incomplete: "現在側証跡不足",
      manufacturer_sample_request_scope_mismatch: "要求条件不一致"
    };
    const reason = blockedReasonIds.slice(0, 2).map((id) => blockedReasonLabels[id] || id).join("・");
    return `比較不可${reason ? ` (${reason})` : ""}`;
  }
  const importedLabel = outcomeLabels[importedOutcome] || outcomeLabels.unknown;
  const currentLabel = outcomeLabels[currentOutcome] || outcomeLabels.unknown;
  if (status === "unchanged") return `${currentLabel} (変化なし)`;
  const nrcChanged = summary.negativeResponseCodeChanged === true || summary.negative_response_code_changed === true;
  return `${importedLabel} → ${currentLabel}${nrcChanged ? " / NRC変化" : ""}`;
}

function formatReadoutQualityComparisonSummary(summary, fallback = NO_DATA) {
  if (!summary || typeof summary !== "object") return fallback;
  const issueDeltaValue = summary.issueCountDelta ?? summary.issue_count_delta;
  const rawDeltaValue = summary.rawPidUndecodedDelta ?? summary.raw_pid_undecoded_delta;
  const readinessDeltaValue = summary.readinessIncompleteDelta ?? summary.readiness_incomplete_delta;
  const ecuDeltaValue = summary.ecuInfoMissingKeyDelta ?? summary.ecu_info_missing_key_delta;
  const mode06DeltaValue = summary.onboardMonitorFailedDelta ?? summary.onboard_monitor_failed_delta;
  const webSerialResponseReviewDeltaValue = summary.webSerialResponseReviewDelta ?? summary.web_serial_response_review_delta;
  const webSerialNegativeResponseDeltaValue = summary.webSerialNegativeResponseDelta ?? summary.web_serial_negative_response_delta;
  const webSerialNoDataDeltaValue = summary.webSerialNoDataDelta ?? summary.web_serial_no_data_delta;
  const webSerialExpectedEmptyCommandDeltaValue = summary.webSerialExpectedEmptyCommandDelta ?? summary.web_serial_expected_empty_command_delta;
  const webSerialUnresolvedNoDataDeltaValue = summary.webSerialUnresolvedNoDataDelta ?? summary.web_serial_unresolved_no_data_delta;
  const invalidDtcEvidenceDeltaValue = summary.invalidDtcEvidenceObservationDelta ?? summary.invalid_dtc_evidence_observation_delta;
  const issueDelta = Number.isFinite(Number(issueDeltaValue)) ? Number(issueDeltaValue) : 0;
  const rawDelta = Number.isFinite(Number(rawDeltaValue)) ? Number(rawDeltaValue) : 0;
  const readinessDelta = Number.isFinite(Number(readinessDeltaValue)) ? Number(readinessDeltaValue) : 0;
  const ecuDelta = Number.isFinite(Number(ecuDeltaValue)) ? Number(ecuDeltaValue) : 0;
  const mode06Delta = Number.isFinite(Number(mode06DeltaValue)) ? Number(mode06DeltaValue) : 0;
  const webSerialResponseReviewDelta = Number.isFinite(Number(webSerialResponseReviewDeltaValue)) ? Number(webSerialResponseReviewDeltaValue) : 0;
  const webSerialNegativeResponseDelta = Number.isFinite(Number(webSerialNegativeResponseDeltaValue)) ? Number(webSerialNegativeResponseDeltaValue) : 0;
  const webSerialNoDataDelta = Number.isFinite(Number(webSerialNoDataDeltaValue)) ? Number(webSerialNoDataDeltaValue) : 0;
  const webSerialExpectedEmptyCommandDelta = Number.isFinite(Number(webSerialExpectedEmptyCommandDeltaValue)) ? Number(webSerialExpectedEmptyCommandDeltaValue) : 0;
  const webSerialUnresolvedNoDataDelta = Number.isFinite(Number(webSerialUnresolvedNoDataDeltaValue)) ? Number(webSerialUnresolvedNoDataDeltaValue) : webSerialNoDataDelta;
  const invalidDtcEvidenceDelta = Number.isFinite(Number(invalidDtcEvidenceDeltaValue)) ? Number(invalidDtcEvidenceDeltaValue) : 0;
  const parts = [];
  if (issueDelta !== 0) parts.push(`品質${issueDelta > 0 ? "+" : ""}${issueDelta}`);
  if (rawDelta !== 0) parts.push(`RAW${rawDelta > 0 ? "+" : ""}${rawDelta}`);
  if (readinessDelta !== 0) parts.push(`RDY${readinessDelta > 0 ? "+" : ""}${readinessDelta}`);
  if (ecuDelta !== 0) parts.push(`ECU${ecuDelta > 0 ? "+" : ""}${ecuDelta}`);
  if (mode06Delta !== 0) parts.push(`M06${mode06Delta > 0 ? "+" : ""}${mode06Delta}`);
  if (webSerialResponseReviewDelta !== 0) parts.push(`通信${webSerialResponseReviewDelta > 0 ? "+" : ""}${webSerialResponseReviewDelta}`);
  if (webSerialNegativeResponseDelta !== 0) parts.push(`NRC${webSerialNegativeResponseDelta > 0 ? "+" : ""}${webSerialNegativeResponseDelta}`);
  if (webSerialExpectedEmptyCommandDelta !== 0) parts.push(`正常空結果${webSerialExpectedEmptyCommandDelta > 0 ? "+" : ""}${webSerialExpectedEmptyCommandDelta}`);
  if (webSerialUnresolvedNoDataDelta !== 0) parts.push(`NO DATA${webSerialUnresolvedNoDataDelta > 0 ? "+" : ""}${webSerialUnresolvedNoDataDelta}`);
  if (invalidDtcEvidenceDelta !== 0) parts.push(`DTC証跡${invalidDtcEvidenceDelta > 0 ? "+" : ""}${invalidDtcEvidenceDelta}`);
  if (summary.invalidDtcEvidenceFieldIdsChanged === true || summary.invalid_dtc_evidence_field_ids_changed === true) parts.push("DTC証跡項目変化");
  const dtcEvidenceScopeBlockedReasonIds = summary.dtcEvidenceScopeBlockedReasonIds || summary.dtc_evidence_scope_blocked_reason_ids || [];
  const dtcEvidenceScopeBlockedLabels = {
    imported_dtc_evidence_scope_incomplete: "整備前範囲不足",
    current_dtc_evidence_scope_incomplete: "現在範囲不足",
    dtc_evidence_vehicle_scope_mismatch: "車両範囲不一致",
    dtc_evidence_ecu_dtc_scope_mismatch: "ECU・DTC範囲不一致",
    imported_dtc_evidence_acquisition_context_incomplete: "整備前取得文脈不足",
    current_dtc_evidence_acquisition_context_incomplete: "現在取得文脈不足",
    dtc_evidence_protocol_mismatch: "通信方式不一致",
    dtc_evidence_capture_order_invalid: "読取時系列不成立",
    dtc_evidence_scan_identity_reused: "同一スキャンID",
    imported_dtc_evidence_transport_context_incomplete: "整備前通信文脈不足",
    current_dtc_evidence_transport_context_incomplete: "現在通信文脈不足",
    dtc_evidence_readout_attempt_reused: "同一読取試行ID",
    dtc_evidence_communication_route_mismatch: "通信経路不一致",
    dtc_evidence_vci_identity_mismatch: "VCI識別不一致",
    imported_dtc_evidence_readout_contract_incomplete: "整備前読取種別不足",
    current_dtc_evidence_readout_contract_incomplete: "現在読取種別不足",
    dtc_evidence_readout_category_mismatch: "DTC区分不一致",
    dtc_evidence_requested_service_mismatch: "要求サービス不一致",
    imported_dtc_evidence_response_contract_incomplete: "整備前応答契約不足",
    current_dtc_evidence_response_contract_incomplete: "現在応答契約不足",
    dtc_evidence_response_service_mismatch: "応答サービス不一致",
    dtc_evidence_ecu_response_status_mismatch: "ECU応答状態不一致",
    imported_dtc_evidence_negative_response_context_incomplete: "整備前否定応答文脈不足",
    current_dtc_evidence_negative_response_context_incomplete: "現在否定応答文脈不足",
    dtc_evidence_negative_response_code_mismatch: "否定応答コード不一致",
    dtc_evidence_response_pending_state_mismatch: "保留応答観測状態不一致",
    imported_dtc_evidence_response_attempt_context_incomplete: "整備前応答試行条件不足",
    current_dtc_evidence_response_attempt_context_incomplete: "現在応答試行条件不足",
    dtc_evidence_negative_requested_service_mismatch: "否定応答対象サービス不一致",
    dtc_evidence_response_count_mismatch: "応答回数不一致",
    dtc_evidence_response_wait_mismatch: "応答待機時間不一致"
  };
  if ((summary.dtcEvidenceResolutionComparisonAvailable === false || summary.dtc_evidence_resolution_comparison_available === false) && dtcEvidenceScopeBlockedReasonIds.length) {
    parts.push(`DTC証跡比較不可:${dtcEvidenceScopeBlockedReasonIds.map((id) => dtcEvidenceScopeBlockedLabels[id] || id).join("・")}`);
  }
  if (summary.issueIdsChanged === true) parts.push("項目変化");
  if (summary.reviewRequiredChanged === true) parts.push("確認状態変化");
  const reviewActionSummary = summary.reviewActionSummary || summary.review_action_summary || null;
  const primaryReviewTarget = summary.primaryReviewTargetReadoutId || summary.primary_review_target_readout_id || reviewActionSummary?.primaryReadoutId || reviewActionSummary?.primary_readout_id || "";
  if (primaryReviewTarget) parts.push(`確認:${formatCoreReadoutLabel(primaryReviewTarget, primaryReviewTarget)}`);
  return parts.length ? parts.join(" / ") : "変化なし";
}

function formatReadoutQualityReviewRequestSummary(summary, fallback = NO_DATA) {
  if (!summary || typeof summary !== "object") return fallback;
  const planSummary = summary.readoutQualityReviewRequestPlanSummary || summary.readout_quality_review_request_plan_summary || null;
  const request = summary.primaryReadoutQualityReviewRequest
    || summary.primary_readout_quality_review_request
    || summary.primaryRequest
    || summary.primary_request
    || planSummary?.primaryReadoutQualityReviewRequest
    || planSummary?.primary_readout_quality_review_request
    || planSummary?.primaryRequest
    || planSummary?.primary_request
    || summary.readoutQualityReviewRequestSummaries?.[0]
    || summary.readout_quality_review_request_summaries?.[0]
    || planSummary?.readoutQualityReviewRequestSummaries?.[0]
    || planSummary?.readout_quality_review_request_summaries?.[0]
    || summary.readoutQualityReviewActionSummary
    || summary.readout_quality_review_action_summary
    || null;
  if (!request || typeof request !== "object") return fallback;
  const readoutId = request.readoutId || request.readout_id || request.primaryReadoutId || request.primary_readout_id || summary.primaryReadoutQualityReviewTargetReadoutId || summary.primary_readout_quality_review_target_readout_id || planSummary?.primaryReadoutQualityReviewTargetReadoutId || planSummary?.primary_readout_quality_review_target_readout_id || "";
  const label = readoutId ? formatCoreReadoutLabel(readoutId, readoutId) : "";
  const bridgeIntent = request.bridgeIntent || request.bridge_intent || request.actionId || request.action_id || "";
  const serviceModeValue = request.serviceMode || request.service_mode || "";
  const serviceMode = serviceModeValue ? `Mode ${serviceModeValue}` : "";
  const requestCountValue = planSummary?.requestCount ?? planSummary?.request_count ?? summary.requestCount ?? summary.request_count ?? summary.readoutQualityReviewRequestCount ?? summary.readout_quality_review_request_count;
  const requestCount = Number.isFinite(Number(requestCountValue))
    ? Number(requestCountValue)
    : 0;
  const parts = [label, bridgeIntent, serviceMode].filter(Boolean);
  if (requestCount > 1) parts.push(`${requestCount}件`);
  if (!parts.length) return fallback;
  const requestReadOnly =
    request.vehicleCommandEnabled === false
    || request.vehicle_command_enabled === false
    || request.wouldTransmit === false
    || request.would_transmit === false
    || request.retainedRawText === false
    || request.retained_raw_text === false
    || planSummary?.vehicleCommandEnabled === false
    || planSummary?.vehicle_command_enabled === false
    || planSummary?.wouldTransmit === false
    || planSummary?.would_transmit === false
    || planSummary?.retainedRawText === false
    || planSummary?.retained_raw_text === false;
  if (requestReadOnly) parts.push("read-only");
  return parts.join(" / ");
}

function addObdDiagnosticFlowMetric(container, label, value, tone = "") {
  const item = document.createElement("article");
  item.className = `obd-diagnostic-flow-card${tone ? ` obd-diagnostic-flow-${tone}` : ""}`;
  const title = document.createElement("span");
  title.textContent = label;
  const body = document.createElement("strong");
  body.textContent = value || NO_DATA;
  item.append(title, body);
  container.appendChild(item);
}

function renderObdDiagnosticFlowPanel(session = null) {
  if (!obdDiagnosticFlowPanels.length) return;
  obdDiagnosticFlowPanels.forEach((panel) => {
    panel.innerHTML = "";
  });
  if (!session || typeof session !== "object") {
    obdDiagnosticFlowPanels.forEach((panel) => {
      panel.hidden = true;
    });
    return;
  }
  const flow = session.diagnosticFlowSummary || session.diagnostic_flow_summary || {};
  const core = session.coreSessionStatus || session.core_session_status || {};
  const canStartAnalysis = flow.canStartAnalysis === true || flow.can_start_analysis === true || core.readyForAnalysis === true || core.ready_for_analysis === true;
  const coreReadyForAnalysis = core.readyForAnalysis ?? core.ready_for_analysis;
  const analysisBlocked = flow.analysisBlocked === true || flow.analysis_blocked === true || (coreReadyForAnalysis === false && !canStartAnalysis);
  const corePendingReadoutIds = Array.isArray(core.pendingReadoutIds) ? core.pendingReadoutIds : Array.isArray(core.pending_readout_ids) ? core.pending_readout_ids : [];
  const collectionRequired = flow.readoutCollectionRequired === true || flow.readout_collection_required === true || corePendingReadoutIds.length > 0;
  const flowCompletionPercentValue = flow.completionPercent ?? flow.completion_percent;
  const coreCompletionPercentValue = core.completionPercent ?? core.completion_percent;
  const completionPercent = Number.isFinite(Number(flowCompletionPercentValue))
    ? Math.max(0, Math.min(100, Math.round(Number(flowCompletionPercentValue))))
    : Number.isFinite(Number(coreCompletionPercentValue)) ? Math.max(0, Math.min(100, Math.round(Number(coreCompletionPercentValue)))) : null;
  const pendingReadoutCountValue = flow.pendingReadoutCount ?? flow.pending_readout_count;
  const pendingCount = Number.isFinite(Number(pendingReadoutCountValue))
    ? Number(pendingReadoutCountValue)
    : corePendingReadoutIds.length;
  const nextReadoutRequest = flow.nextReadoutRequest || flow.next_readout_request || core.nextReadoutRequest || core.next_readout_request || core.nextReadoutSummary?.readoutRequest || core.next_readout_summary?.readout_request || session.nextReadoutRequest || session.next_readout_request || null;
  const readoutRequestPlan = flow.pendingReadoutRequestPlan || flow.pending_readout_request_plan || flow.readoutRequestPlanSummary || flow.readout_request_plan_summary || core.pendingReadoutRequestPlan || core.pending_readout_request_plan || core.readoutRequestPlanSummary || core.readout_request_plan_summary || session.readoutRequestPlanSummary || session.readout_request_plan_summary || null;
  const nextReadoutId = flow.recommendedReadoutId || flow.recommended_readout_id || flow.nextReadoutId || flow.next_readout_id || core.nextRecommendedReadoutId || core.next_recommended_readout_id || nextReadoutRequest?.readoutId || nextReadoutRequest?.readout_id || readoutRequestPlan?.nextRequestId || readoutRequestPlan?.next_request_id || null;
  const nextReadoutLabel = flow.nextReadoutLabel || flow.next_readout_label || nextReadoutRequest?.label || nextReadoutRequest?.displayLabel || nextReadoutRequest?.display_label || formatCoreReadoutLabel(nextReadoutId, nextReadoutId || NO_DATA);
  const pendingReadoutRequestCountValue = flow.pendingReadoutRequestCount ?? flow.pending_readout_request_count;
  const readoutRequestPlanTotalCountValue = readoutRequestPlan?.totalCount ?? readoutRequestPlan?.total_count;
  const mappedReadoutRequestCountValue = readoutRequestPlan?.mappedCount ?? readoutRequestPlan?.mapped_count;
  const unmappedReadoutRequestCountValue = readoutRequestPlan?.unmappedCount ?? readoutRequestPlan?.unmapped_count;
  const pendingReadoutRequestCount = Number.isFinite(Number(pendingReadoutRequestCountValue))
    ? Number(pendingReadoutRequestCountValue)
    : Number.isFinite(Number(readoutRequestPlanTotalCountValue))
      ? Number(readoutRequestPlanTotalCountValue)
      : Array.isArray(core.pendingReadoutRequestQueue) ? core.pendingReadoutRequestQueue.length : Array.isArray(core.pending_readout_request_queue) ? core.pending_readout_request_queue.length : 0;
  const mappedReadoutRequestCount = Number.isFinite(Number(mappedReadoutRequestCountValue))
    ? Number(mappedReadoutRequestCountValue)
    : null;
  const unmappedReadoutRequestCount = Number.isFinite(Number(unmappedReadoutRequestCountValue))
    ? Number(unmappedReadoutRequestCountValue)
    : null;
  const readoutRequestQueueLabel = pendingReadoutRequestCount
    ? ` / queue ${pendingReadoutRequestCount}${mappedReadoutRequestCount !== null ? ` / mapped ${mappedReadoutRequestCount}` : ""}${unmappedReadoutRequestCount ? ` / unmapped ${unmappedReadoutRequestCount}` : ""}`
    : "";
  const nextReadoutRequestBridgeIntent = nextReadoutRequest?.bridgeIntent || nextReadoutRequest?.bridge_intent || readoutRequestPlan?.nextBridgeIntent || readoutRequestPlan?.next_bridge_intent || "";
  const nextReadoutRequestServiceMode = nextReadoutRequest?.serviceMode || nextReadoutRequest?.service_mode || readoutRequestPlan?.nextServiceMode || readoutRequestPlan?.next_service_mode || "";
  const nextReadoutRequestExecutionEnabled = nextReadoutRequest?.executionEnabled === true || nextReadoutRequest?.execution_enabled === true || readoutRequestPlan?.nextExecutionEnabled === true || readoutRequestPlan?.next_execution_enabled === true;
  const readoutRequestTone = unmappedReadoutRequestCount ? "blocked" : nextReadoutRequestExecutionEnabled ? "ready" : "";
  const nextReadoutRequestLabel = nextReadoutRequestBridgeIntent
    ? `${nextReadoutRequestBridgeIntent}${nextReadoutRequestServiceMode ? ` / Mode ${nextReadoutRequestServiceMode}` : ""}${readoutRequestQueueLabel}`
    : pendingReadoutRequestCount ? `queue ${pendingReadoutRequestCount}${mappedReadoutRequestCount !== null ? ` / mapped ${mappedReadoutRequestCount}` : ""}${unmappedReadoutRequestCount ? ` / unmapped ${unmappedReadoutRequestCount}` : ""}` : NO_DATA;
  const nextReadoutRequestSafetySummary = session.nextReadoutRequestSafetySummary || session.next_readout_request_safety_summary || core.nextReadoutRequestSafetySummary || core.next_readout_request_safety_summary || flow.nextReadoutRequestSafetySummary || flow.next_readout_request_safety_summary || null;
  const nextReadoutRequestSafetyLabel = nextReadoutRequestSafetySummary
    ? formatNextReadoutRequestSafetySummary(nextReadoutRequestSafetySummary, null, NO_DATA)
    : formatNextReadoutRequestSafetySummary(nextReadoutRequest, readoutRequestPlan, NO_DATA);
  const nextReadoutCandidateSafetySummary = session.nextReadoutCandidateSafetySummary || session.next_readout_candidate_safety_summary || core.nextReadoutCandidateSafetySummary || core.next_readout_candidate_safety_summary || flow.nextReadoutCandidateSafetySummary || flow.next_readout_candidate_safety_summary || null;
  const nextReadoutCandidateSafetyLabel = formatNextReadoutCandidateSafetySummary(nextReadoutCandidateSafetySummary, NO_DATA);
  const nextReadoutReasonSummary = session.nextReadoutReasonSummary || session.next_readout_reason_summary || core.nextReadoutReasonSummary || core.next_readout_reason_summary || flow.nextReadoutReasonSummary || flow.next_readout_reason_summary || null;
  const nextReadoutReasonLabel = formatNextReadoutReasonSummary(nextReadoutReasonSummary, NO_DATA);
  const nextReadoutGuardSummary = session.nextReadoutGuardSummary || session.next_readout_guard_summary || core.nextReadoutGuardSummary || core.next_readout_guard_summary || flow.nextReadoutGuardSummary || flow.next_readout_guard_summary || null;
  const nextReadoutGuardLabel = formatNextReadoutGuardSummary(nextReadoutGuardSummary, NO_DATA);
  const analysisReadinessSummary = core.analysisReadinessSummary || core.analysis_readiness_summary || null;
  const readoutCompletionSummary = core.readoutCompletionSummary || core.readout_completion_summary || null;
  const blockerIds = Array.isArray(flow.blockingReasonIds)
    ? flow.blockingReasonIds
    : Array.isArray(flow.blocking_reason_ids)
      ? flow.blocking_reason_ids
    : Array.isArray(core.analysisBlockers) ? core.analysisBlockers : Array.isArray(core.analysis_blockers) ? core.analysis_blockers : [];
  const blockerLabel = blockerIds.length
    ? blockerIds.slice(0, 3).map((item) => formatDiagnosticFlowBlockerLabel(item)).join(" / ")
    : canStartAnalysis ? "なし" : NO_DATA;
  const primaryBlockingReasonId = flow.primaryBlockingReasonId || flow.primary_blocking_reason_id || core.primaryBlockingReasonId || core.primary_blocking_reason_id || analysisReadinessSummary?.primaryBlockingReasonId || analysisReadinessSummary?.primary_blocking_reason_id || readoutCompletionSummary?.primaryBlockingReasonId || readoutCompletionSummary?.primary_blocking_reason_id || null;
  const primaryBlockingReadoutId = flow.primaryBlockingReadoutId || flow.primary_blocking_readout_id || core.primaryBlockingReadoutId || core.primary_blocking_readout_id || analysisReadinessSummary?.primaryBlockingReadoutId || analysisReadinessSummary?.primary_blocking_readout_id || readoutCompletionSummary?.primaryBlockingReadoutId || readoutCompletionSummary?.primary_blocking_readout_id || null;
  const primaryBlockingReadoutLabel = flow.primaryBlockingReadoutLabel || flow.primary_blocking_readout_label || core.primaryBlockingReadoutLabel || core.primary_blocking_readout_label || analysisReadinessSummary?.primaryBlockingReadoutLabel || analysisReadinessSummary?.primary_blocking_readout_label || readoutCompletionSummary?.primaryBlockingReadoutLabel || readoutCompletionSummary?.primary_blocking_readout_label || formatCoreReadoutLabel(primaryBlockingReadoutId, primaryBlockingReadoutId || "");
  const primaryBlockingLabel = primaryBlockingReasonId
    ? `${formatDiagnosticFlowBlockerLabel(primaryBlockingReasonId)}${primaryBlockingReadoutLabel ? ` / ${primaryBlockingReadoutLabel}` : ""}`
    : NO_DATA;
  const primaryBlockingReadoutRequest = flow.primaryBlockingReadoutRequest || flow.primary_blocking_readout_request || core.primaryBlockingReadoutRequest || core.primary_blocking_readout_request || analysisReadinessSummary?.primaryBlockingReadoutRequest || analysisReadinessSummary?.primary_blocking_readout_request || readoutCompletionSummary?.primaryBlockingReadoutRequest || readoutCompletionSummary?.primary_blocking_readout_request || null;
  const primaryBlockingBridgeIntent = primaryBlockingReadoutRequest?.bridgeIntent || primaryBlockingReadoutRequest?.bridge_intent || "";
  const primaryBlockingServiceMode = primaryBlockingReadoutRequest?.serviceMode || primaryBlockingReadoutRequest?.service_mode || "";
  const primaryBlockingExecutionEnabled = primaryBlockingReadoutRequest?.executionEnabled === true || primaryBlockingReadoutRequest?.execution_enabled === true;
  const primaryBlockingReadoutRequestLabel = primaryBlockingBridgeIntent
    ? `${primaryBlockingBridgeIntent}${primaryBlockingServiceMode ? ` / Mode ${primaryBlockingServiceMode}` : ""}`
    : NO_DATA;
  const importedSessionComparisonSummary = session.importedSessionComparisonSummary || session.imported_session_comparison_summary || null;
  const nextReadoutChangeSummary = importedSessionComparisonSummary?.nextReadoutChangeSummary || importedSessionComparisonSummary?.next_readout_change_summary || null;
  const nextReadoutChangeLabel = formatNextReadoutChangeSummary(nextReadoutChangeSummary, NO_DATA);
  const importedNextReadoutGuardComparisonSummary = session.importedNextReadoutGuardComparisonSummary || session.imported_next_readout_guard_comparison_summary || importedSessionComparisonSummary?.nextReadoutGuardComparison || importedSessionComparisonSummary?.next_readout_guard_comparison || null;
  const importedNextReadoutGuardReviewRequestPlanSummary = session.importedNextReadoutGuardReviewRequestPlanSummary || session.imported_next_readout_guard_review_request_plan_summary || importedSessionComparisonSummary?.nextReadoutGuardReviewRequestPlanSummary || importedSessionComparisonSummary?.next_readout_guard_review_request_plan_summary || importedNextReadoutGuardComparisonSummary?.reviewRequestPlanSummary || importedNextReadoutGuardComparisonSummary?.review_request_plan_summary || null;
  const importedNextReadoutGuardComparisonLabel = formatNextReadoutGuardComparisonSummary(importedNextReadoutGuardComparisonSummary, NO_DATA, importedNextReadoutGuardReviewRequestPlanSummary);
  const primaryBlockerComparisonSummary = importedSessionComparisonSummary?.primaryBlockerChangeSummary || importedSessionComparisonSummary?.primary_blocker_change_summary || null;
  const primaryBlockerComparisonLabel = formatPrimaryBlockerChangeSummary(primaryBlockerComparisonSummary, NO_DATA);
  const changedIdDisplaySummary = importedSessionComparisonSummary?.changedIdDisplaySummary || importedSessionComparisonSummary?.changed_id_display_summary || null;
  const changedIdDisplayLabel = formatChangedIdDisplaySummary(changedIdDisplaySummary, NO_DATA);
  const vehicleApplicabilityChangedRowSummary = session.importedVehicleApplicabilityChangedRowSummary || session.imported_vehicle_applicability_changed_row_summary || changedIdDisplaySummary?.vehicleApplicabilityChangedRowSummary || changedIdDisplaySummary?.vehicle_applicability_changed_row_summary || importedSessionComparisonSummary?.vehicleApplicabilityChangedRowSummary || importedSessionComparisonSummary?.vehicle_applicability_changed_row_summary || null;
  const vehicleApplicabilityChangedRowLabel = formatVehicleApplicabilityChangedRowSummary(vehicleApplicabilityChangedRowSummary, NO_DATA);
  const changedIdReviewTargetActionLabel = formatChangedIdReviewTargetActionSummary(changedIdDisplaySummary, NO_DATA);
  const coreReadoutInventorySummary = session.coreReadoutInventorySummary || session.core_readout_inventory_summary || null;
  const coreReadoutInventoryComparisonSummary = session.importedCoreReadoutInventoryComparisonSummary || session.imported_core_readout_inventory_comparison_summary || null;
  const observedEcuComparisonLabel = formatObservedEcuComparisonSummary(session.importedCoreComparisonSummary || session.imported_core_comparison_summary || importedSessionComparisonSummary?.coreComparison || importedSessionComparisonSummary?.core_comparison || null, NO_DATA);
  const dtcIdentityComparisonLabel = formatDtcIdentityComparisonSummary(session.importedCoreComparisonSummary || session.imported_core_comparison_summary || importedSessionComparisonSummary?.coreComparison || importedSessionComparisonSummary?.core_comparison || null, NO_DATA);
  const dtcStatusByteComparisonLabel = formatDtcStatusByteComparisonSummary(session.importedCoreComparisonSummary || session.imported_core_comparison_summary || importedSessionComparisonSummary?.coreComparison || importedSessionComparisonSummary?.core_comparison || null, NO_DATA);
  const dtcMetadataComparisonLabel = formatDtcMetadataComparisonSummary(session.importedCoreComparisonSummary || session.imported_core_comparison_summary || importedSessionComparisonSummary?.coreComparison || importedSessionComparisonSummary?.core_comparison || null, NO_DATA);
  const dtcFaultDetectionCounterComparisonLabel = formatDtcFaultDetectionCounterComparisonSummary(session.importedCoreComparisonSummary || session.imported_core_comparison_summary || importedSessionComparisonSummary?.coreComparison || importedSessionComparisonSummary?.core_comparison || null, NO_DATA);
  const coreReadoutInventoryLabel = formatCoreReadoutInventorySummary(coreReadoutInventorySummary, NO_DATA);
  const coreReadoutInventoryComparisonLabel = formatCoreReadoutInventoryComparisonSummary(coreReadoutInventoryComparisonSummary, NO_DATA);
  const readoutQualitySummary = core.readoutQualitySummary || core.readout_quality_summary || flow.readoutQualitySummary || flow.readout_quality_summary || null;
  const readoutQualityLabel = formatReadoutQualitySummary(readoutQualitySummary, NO_DATA);
  const importedReadoutQualitySummary = getImportedReadoutQualityForDisplay(session);
  const importedReadoutQualityLabel = formatReadoutQualitySummary(importedReadoutQualitySummary, NO_DATA);
  const manufacturerSampleReadinessSummary = session.manufacturerSampleReadinessSummary || session.manufacturer_sample_readiness_summary || null;
  const manufacturerSampleReadinessLabel = formatManufacturerSampleReadinessSummary(manufacturerSampleReadinessSummary, NO_DATA);
  const manufacturerSampleResponseComparisonSummary = session.manufacturerSampleResponseComparisonSummary || session.manufacturer_sample_response_comparison_summary || null;
  const manufacturerSampleResponseComparisonLabel = formatManufacturerSampleResponseComparisonSummary(manufacturerSampleResponseComparisonSummary, NO_DATA);
  const readoutQualityComparisonLabel = formatReadoutQualityComparisonSummary(session.importedReadoutQualityComparisonSummary || session.imported_readout_quality_comparison_summary, NO_DATA);
  const readoutQualityReviewRequestLabel = formatReadoutQualityReviewRequestSummary(session.importedReadoutQualityReviewRequestPlanSummary || session.imported_readout_quality_review_request_plan_summary || importedSessionComparisonSummary, NO_DATA);
  const checklistSummary = core.analysisChecklistSummary || core.analysis_checklist_summary || analysisReadinessSummary?.checklistSummary || analysisReadinessSummary?.checklist_summary || null;
  const checklistLabel = checklistSummary && Number.isFinite(Number(checklistSummary.totalCount))
    ? `${Number(checklistSummary.completeCount || 0)}/${Number(checklistSummary.totalCount)}`
    : NO_DATA;
  const applicabilityStatus = flow.applicabilityStatus || flow.applicability_status || core.applicabilityStatus || core.applicability_status || session.vehicleApplicability?.status || session.vehicle_applicability?.status || null;
  const applicabilityChecklist = core.analysisChecklistById?.vehicle_applicability || core.analysis_checklist_by_id?.vehicle_applicability || analysisReadinessSummary?.checklistById?.vehicle_applicability || analysisReadinessSummary?.checklist_by_id?.vehicle_applicability || null;
  const applicabilityLabel = formatVehicleApplicabilitySummary(session.vehicleApplicability || session.vehicle_applicability || { status: applicabilityStatus }, applicabilityStatus || NO_DATA) || NO_DATA;
  const applicabilityEvidenceSummary = core.vehicleApplicabilityEvidenceSummary || core.vehicle_applicability_evidence_summary || analysisReadinessSummary?.vehicleApplicabilityEvidenceSummary || analysisReadinessSummary?.vehicle_applicability_evidence_summary || applicabilityChecklist?.evidenceSummary || applicabilityChecklist?.evidence_summary || null;
  const applicabilityEvidenceLabel = formatVehicleApplicabilityEvidenceSummary(applicabilityEvidenceSummary, NO_DATA) || NO_DATA;
  const applicabilityFieldMatchSummary = core.vehicleApplicabilityFieldMatchSummary || core.vehicle_applicability_field_match_summary || analysisReadinessSummary?.vehicleApplicabilityFieldMatchSummary || analysisReadinessSummary?.vehicle_applicability_field_match_summary || applicabilityChecklist?.fieldMatchSummary || applicabilityChecklist?.field_match_summary || null;
  const applicabilityFieldMatchLabel = formatVehicleApplicabilityFieldMatchSummary(applicabilityFieldMatchSummary, NO_DATA) || NO_DATA;
  const applicabilityTone = flow.vehicleApplicabilityBlocking === true || applicabilityChecklist?.blocking === true
    ? "blocked"
    : flow.vehicleApplicabilityReviewRequired === true || applicabilityChecklist?.state === "review" ? "pending" : "";
  const applicabilityEvidenceTone = applicabilityEvidenceSummary?.reviewRequired === true || applicabilityEvidenceSummary?.review_required === true
    ? "pending"
    : applicabilityEvidenceSummary?.sourceVerified === true || applicabilityEvidenceSummary?.source_verified === true ? "ready" : "";
  const statusLabel = canStartAnalysis
    ? "解析へ進めます"
    : collectionRequired
      ? "読取を継続"
      : analysisBlocked ? "確認が必要" : "待機中";

  const renderPanel = (obdDiagnosticFlowPanel) => {
  const header = document.createElement("div");
  header.className = "obd-diagnostic-flow-head";
  const titleBlock = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow obd-eyebrow";
  eyebrow.textContent = "DIAGNOSTIC FLOW";
  const title = document.createElement("h4");
  title.textContent = "診断セッションの現在地";
  titleBlock.append(eyebrow, title);
  const badge = document.createElement("span");
  badge.className = "confidence-badge";
  badge.textContent = canStartAnalysis ? "解析可能" : "read-only確認中";
  header.append(titleBlock, badge);

  const grid = document.createElement("div");
  grid.className = "obd-diagnostic-flow-grid";
  addObdDiagnosticFlowMetric(grid, "品質比較", readoutQualityComparisonLabel, session.importedReadoutQualityComparisonSummary?.issueIdsChanged === true || session.importedReadoutQualityComparisonSummary?.issueCountsChanged === true ? "pending" : "");
  addObdDiagnosticFlowMetric(grid, "品質確認要求", readoutQualityReviewRequestLabel, importedSessionComparisonSummary?.readoutQualityReviewRequired === true || importedSessionComparisonSummary?.readout_quality_review_required === true ? "pending" : "");
  addObdDiagnosticFlowMetric(grid, "現在地", statusLabel, canStartAnalysis ? "ready" : "pending");
  addObdDiagnosticFlowMetric(grid, "読取進捗", completionPercent === null ? NO_DATA : `${completionPercent}%`);
  addObdDiagnosticFlowMetric(grid, "次の読取", nextReadoutLabel);
  addObdDiagnosticFlowMetric(grid, "読取理由", nextReadoutReasonLabel, nextReadoutReasonSummary ? "pending" : "");
  addObdDiagnosticFlowMetric(grid, "計画安全", nextReadoutGuardLabel, nextReadoutGuardSummary?.safeForReadoutPlanning === true || nextReadoutGuardSummary?.safe_for_readout_planning === true ? "ready" : nextReadoutGuardSummary ? "blocked" : "");
  addObdDiagnosticFlowMetric(grid, "計画差分", importedNextReadoutGuardComparisonLabel, importedNextReadoutGuardComparisonSummary?.changed === true || importedNextReadoutGuardComparisonSummary?.has_changes === true || Number(importedNextReadoutGuardReviewRequestPlanSummary?.requestCount ?? importedNextReadoutGuardReviewRequestPlanSummary?.request_count ?? 0) > 0 ? "pending" : "");
  addObdDiagnosticFlowMetric(grid, "次読取整合", nextReadoutChangeLabel, nextReadoutChangeSummary?.consistencyReviewRequired === true || nextReadoutChangeSummary?.consistency_review_required === true ? "pending" : "");
  addObdDiagnosticFlowMetric(grid, "読取要求", nextReadoutRequestLabel, readoutRequestTone);
  addObdDiagnosticFlowMetric(grid, "要求安全", nextReadoutRequestSafetyLabel, nextReadoutRequestSafetySummary?.safe === true || nextReadoutRequestSafetySummary?.safe_for_readout_request === true ? "ready" : "pending");
  addObdDiagnosticFlowMetric(grid, "候補安全", nextReadoutCandidateSafetyLabel, nextReadoutCandidateSafetySummary?.allSafe === true || nextReadoutCandidateSafetySummary?.all_safe === true ? "ready" : "pending");
  addObdDiagnosticFlowMetric(grid, "保留理由", blockerLabel, analysisBlocked ? "blocked" : "");
  addObdDiagnosticFlowMetric(grid, "主保留", primaryBlockingLabel, primaryBlockingReasonId ? "blocked" : "");
  addObdDiagnosticFlowMetric(grid, "主保留要求", primaryBlockingReadoutRequestLabel, primaryBlockingExecutionEnabled ? "ready" : primaryBlockingReadoutRequest ? "pending" : "");
  addObdDiagnosticFlowMetric(grid, "主保留比較", primaryBlockerComparisonLabel, primaryBlockerComparisonSummary?.changed === true ? "pending" : "");
  addObdDiagnosticFlowMetric(grid, "読取差分", changedIdDisplayLabel, changedIdDisplaySummary?.hasChangedIds === true ? "pending" : "");
  addObdDiagnosticFlowMetric(grid, "差分確認", changedIdReviewTargetActionLabel, changedIdDisplaySummary?.hasChangedIds === true ? "pending" : "");
  addObdDiagnosticFlowMetric(grid, "読取内訳", coreReadoutInventoryLabel, coreReadoutInventorySummary?.missingReadoutCount || coreReadoutInventorySummary?.missing_readout_count ? "pending" : "");
  addObdDiagnosticFlowMetric(grid, "DTC比較", dtcIdentityComparisonLabel, dtcIdentityComparisonLabel !== "変化なし" && dtcIdentityComparisonLabel !== NO_DATA ? "pending" : "");
  addObdDiagnosticFlowMetric(grid, "DTC状態比較", dtcStatusByteComparisonLabel, dtcStatusByteComparisonLabel !== "変化なし" && dtcStatusByteComparisonLabel !== NO_DATA ? "pending" : "");
  addObdDiagnosticFlowMetric(grid, "DTC報告比較", dtcMetadataComparisonLabel, dtcMetadataComparisonLabel !== "変化なし" && dtcMetadataComparisonLabel !== NO_DATA ? "pending" : "");
  addObdDiagnosticFlowMetric(grid, "DTC検出回数比較", dtcFaultDetectionCounterComparisonLabel, dtcFaultDetectionCounterComparisonLabel !== "変化なし" && dtcFaultDetectionCounterComparisonLabel !== NO_DATA ? "pending" : "");
  addObdDiagnosticFlowMetric(grid, "ECU応答比較", observedEcuComparisonLabel, observedEcuComparisonLabel !== "変化なし" && observedEcuComparisonLabel !== NO_DATA ? "pending" : "");
  addObdDiagnosticFlowMetric(grid, "在庫比較", coreReadoutInventoryComparisonLabel, coreReadoutInventoryComparisonSummary?.valueCountsChanged === true || coreReadoutInventoryComparisonSummary?.value_counts_changed === true ? "pending" : "");
  addObdDiagnosticFlowMetric(grid, "読取品質", readoutQualityLabel, readoutQualitySummary?.reviewRequired || readoutQualitySummary?.review_required ? "pending" : "");
  if (importedReadoutQualitySummary) addObdDiagnosticFlowMetric(grid, "受信品質", importedReadoutQualityLabel, importedReadoutQualityLabel !== NO_DATA && importedReadoutQualityLabel !== "要確認なし" ? "pending" : "");
  addObdDiagnosticFlowMetric(grid, "実機サンプル", manufacturerSampleReadinessLabel, manufacturerSampleReadinessSummary?.contractCompleteForSampleReview === true || manufacturerSampleReadinessSummary?.contract_complete_for_sample_review === true ? "ready" : manufacturerSampleReadinessSummary?.sampleObserved === true || manufacturerSampleReadinessSummary?.sample_observed === true ? "pending" : "");
  addObdDiagnosticFlowMetric(grid, "実機応答比較", manufacturerSampleResponseComparisonLabel, manufacturerSampleResponseComparisonSummary?.status === "changed" ? "pending" : manufacturerSampleResponseComparisonSummary?.status === "unchanged" ? "ready" : "");
  addObdDiagnosticFlowMetric(grid, "解析前確認", checklistLabel, checklistSummary?.blockingCount ? "blocked" : checklistSummary?.pendingCount ? "pending" : "");
  addObdDiagnosticFlowMetric(grid, "適用確認", applicabilityLabel, applicabilityTone);
  addObdDiagnosticFlowMetric(grid, "候補照合", applicabilityFieldMatchLabel, applicabilityFieldMatchSummary?.reviewRequired === true || applicabilityFieldMatchSummary?.review_required === true ? "pending" : "");
  addObdDiagnosticFlowMetric(grid, "適合差分", vehicleApplicabilityChangedRowLabel, vehicleApplicabilityChangedRowSummary?.changed === true ? "pending" : "");
  addObdDiagnosticFlowMetric(grid, "未完了", `${pendingCount}項目`);
  addObdDiagnosticFlowMetric(grid, "送信状態", "read-only維持");

  addObdDiagnosticFlowMetric(grid, "Evidence", applicabilityEvidenceLabel, applicabilityEvidenceTone);

  const note = document.createElement("p");
  note.className = "obd-diagnostic-flow-note";
  note.textContent = canStartAnalysis
    ? "主要読取は揃っています。解析結果を確認する前に、保存済みDTCとフリーズフレームを残してください。"
    : "まだ車両へ書き込みません。表示された次の読取を確認し、必要なデータを揃えてから解析へ進みます。";

  const actions = document.createElement("div");
  actions.className = "button-row obd-diagnostic-flow-actions";
  if (nextReadoutId) {
    const action = OBD_NEXT_READOUT_ACTIONS[nextReadoutId] || null;
    const targetButton = action?.button?.() || null;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.textContent = targetButton ? "該当読取ボタンへ移動" : "詳細読取メニューを確認";
    button.addEventListener("click", () => {
      renderObdStageView("details");
      const target = targetButton || obdDevControls || obdDevSessionSummary;
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (targetButton) targetButton.focus();
    });
    actions.appendChild(button);
  }

  obdDiagnosticFlowPanel.append(header, grid, note, actions);
  obdDiagnosticFlowPanel.hidden = false;
  };

  obdDiagnosticFlowPanels.forEach(renderPanel);
}

function renderObdDeveloperSessionSummary(session = null) {
  renderObdSessionExportControls();
  renderObdDiagnosticFlowPanel(session);
  obdDevSessionSummary.innerHTML = "";
  const coreSessionStatus = session?.coreSessionStatus || session?.core_session_status || null;
  const sessionConnectionStatus = session?.connectionStatus || session?.connection_status || null;
  const sessionAdapterIdentity = session?.adapterIdentity || session?.adapter_identity || null;
  const sessionVciDevices = session?.vciDevices || session?.vci_devices || session?.vciList?.devices || session?.vci_list?.devices || null;
  const sessionVehicleProfile = session?.vehicleProfile || session?.vehicle_profile || null;
  const sessionVehicleApplicability = session?.vehicleApplicability || session?.vehicle_applicability || null;
  const sessionReadoutInterface = session?.readoutInterface || session?.readout_interface || null;
  const sessionObdReportedProfile = session?.obdReportedProfile || session?.obd_reported_profile || null;
  const connectionStatus = sessionConnectionStatus
    ? { ...(obdDevSession.bridgeStatus || {}), ...sessionConnectionStatus }
    : obdDevSession.bridgeStatus;
  const adapterIdentity = sessionAdapterIdentity
    ? { ...(obdDevSession.adapterIdentity || {}), ...sessionAdapterIdentity }
    : obdDevSession.adapterIdentity;
  const bridgeDeviceCount = Array.isArray(sessionVciDevices)
    ? sessionVciDevices.length
    : (obdDevSession.bridgeVciList?.deviceCount ?? 0);
  const vciDevices = Array.isArray(sessionVciDevices) ? sessionVciDevices : (obdDevSession.bridgeVciList?.devices || []);
  const selectedVci = vciDevices.find((item) => item?.selected) || vciDevices[0] || null;
  const connectionErrorLabel = formatReadoutErrorCodes(connectionStatus?.errorCodes || connectionStatus?.error_codes || connectionStatus?.errors || []) || NO_DATA;
  const selectedVciErrorLabel = formatReadoutErrorCodes(selectedVci?.errorCodes || selectedVci?.error_codes || selectedVci?.errors || []) || NO_DATA;
  const adapterErrorLabel = formatReadoutErrorCodes(adapterIdentity?.errorCodes || adapterIdentity?.error_codes || adapterIdentity?.errors || []) || NO_DATA;
  const j2534RuntimeCompatibilityLabel = formatJ2534RuntimeCompatibility(selectedVci);
  const j2534DriverReadinessLabel = formatJ2534DriverReadiness(connectionStatus, formatJ2534DriverReadiness(obdDevSession.bridgeVciList));
  const j2534NextCheckLabel = formatJ2534NextCheck(connectionStatus, formatJ2534NextCheck(obdDevSession.bridgeVciList));
  const dtcSnapshot = session?.dtcSnapshot || session?.dtc_snapshot || null;
  const ecuInfoSnapshot = session?.ecuInfoSnapshot || session?.ecu_info_snapshot || null;
  const ecuInfoProtocolProvenance = ecuInfoSnapshot?.protocolProvenance || ecuInfoSnapshot?.protocol_provenance || null;
  const sessionProtocolProvenance = session?.protocolProvenance || session?.protocol_provenance || null;
  const ecuInfoProtocolEntries = [
    ["診断", ecuInfoProtocolProvenance?.diagnosticProtocol || ecuInfoProtocolProvenance?.diagnostic_protocol || ecuInfoSnapshot?.diagnosticProtocol || ecuInfoSnapshot?.diagnostic_protocol || sessionProtocolProvenance?.diagnosticProtocol || sessionProtocolProvenance?.diagnostic_protocol || session?.diagnosticProtocol || session?.diagnostic_protocol || null],
    ["搬送", ecuInfoProtocolProvenance?.transportProtocol || ecuInfoProtocolProvenance?.transport_protocol || ecuInfoSnapshot?.transportProtocol || ecuInfoSnapshot?.transport_protocol || sessionProtocolProvenance?.transportProtocol || sessionProtocolProvenance?.transport_protocol || session?.transportProtocol || session?.transport_protocol || null],
    ["ネットワーク", ecuInfoProtocolProvenance?.networkProtocol || ecuInfoProtocolProvenance?.network_protocol || ecuInfoSnapshot?.networkProtocol || ecuInfoSnapshot?.network_protocol || sessionProtocolProvenance?.networkProtocol || sessionProtocolProvenance?.network_protocol || session?.networkProtocol || session?.network_protocol || null]
  ].filter(([, value]) => typeof value === "string" && value.trim());
  const ecuInfoProtocolLabel = ecuInfoProtocolEntries.length
    ? ecuInfoProtocolEntries.map(([label, value]) => `${label}: ${value}`).join(" / ")
    : ecuInfoSnapshot?.protocol || session?.protocol || NO_DATA;
  const freezeFrameSnapshot = session?.freezeFrameSnapshot || session?.freeze_frame_snapshot || null;
  const livePidSnapshot = session?.livePidSnapshot || session?.live_pid_snapshot || null;
  const livePidTimeline = session?.livePidTimeline || session?.live_pid_timeline || null;
  const livePidTimelineSummary = session?.livePidTimelineSummary || session?.live_pid_timeline_summary || null;
  const manufacturerPidVehicleReadoutSummary = session?.manufacturerPidVehicleReadoutSummary || session?.manufacturer_pid_vehicle_readout_summary || null;
  const manufacturerPidEvidencePackageCount = Math.max(0, Number(manufacturerPidVehicleReadoutSummary?.packageCount ?? manufacturerPidVehicleReadoutSummary?.package_count ?? 0) || 0);
  const manufacturerPidEvidenceCandidateCount = Math.max(0, Number(manufacturerPidVehicleReadoutSummary?.candidateCount ?? manufacturerPidVehicleReadoutSummary?.candidate_count ?? 0) || 0);
  const manufacturerPidEvidenceMeasurementCount = Math.max(0, Number(manufacturerPidVehicleReadoutSummary?.measurementCount ?? manufacturerPidVehicleReadoutSummary?.measurement_count ?? 0) || 0);
  const manufacturerPidEvidenceTransports = manufacturerPidVehicleReadoutSummary?.transportIds || manufacturerPidVehicleReadoutSummary?.transport_ids || [];
  const manufacturerPidEvidenceLabel = manufacturerPidEvidencePackageCount > 0
    ? `${manufacturerPidEvidencePackageCount}件 / 候補${manufacturerPidEvidenceCandidateCount} / 測定${manufacturerPidEvidenceMeasurementCount} / ${Array.isArray(manufacturerPidEvidenceTransports) && manufacturerPidEvidenceTransports.length ? manufacturerPidEvidenceTransports.slice(0, 4).join(" / ") : "経路未確認"} / 手動評価待ち`
    : "証跡なし";
  const manufacturerPidVehicleReadoutComparisonSummary = session?.manufacturerPidVehicleReadoutComparisonSummary || session?.manufacturer_pid_vehicle_readout_comparison_summary || null;
  const manufacturerPidEvidenceComparisonLabel = !manufacturerPidVehicleReadoutComparisonSummary
    ? "前回証跡なし"
    : manufacturerPidVehicleReadoutComparisonSummary.changed === true
      ? `変更あり / パッケージ${Number(manufacturerPidVehicleReadoutComparisonSummary.packageCountDelta ?? manufacturerPidVehicleReadoutComparisonSummary.package_count_delta ?? 0) >= 0 ? "+" : ""}${manufacturerPidVehicleReadoutComparisonSummary.packageCountDelta ?? manufacturerPidVehicleReadoutComparisonSummary.package_count_delta ?? 0} / 測定${Number(manufacturerPidVehicleReadoutComparisonSummary.measurementCountDelta ?? manufacturerPidVehicleReadoutComparisonSummary.measurement_count_delta ?? 0) >= 0 ? "+" : ""}${manufacturerPidVehicleReadoutComparisonSummary.measurementCountDelta ?? manufacturerPidVehicleReadoutComparisonSummary.measurement_count_delta ?? 0} / 手動確認`
      : "変更なし / 手動確認";
  const livePidTimelineComparisonLabel = !livePidTimelineSummary?.comparisonAvailable
    ? NO_DATA
    : livePidTimelineSummary.changedValueCount
      ? `${livePidTimelineSummary.changedValueCount}項目`
      : "差分なし";
  const readinessSnapshot = session?.readinessSnapshot || session?.readiness_snapshot || null;
  const onboardMonitorSnapshot = session?.onboardMonitorSnapshot || session?.onboard_monitor_snapshot || null;
  const supportedPidMatrix = session?.supportedPidMatrix || session?.supported_pid_matrix || null;
  const webSerialReadoutSummary = session?.webSerialReadoutSummary || session?.web_serial_readout_summary || null;
  const dtcStatusSummary = formatObdBridgeDtcStatusSummary(dtcSnapshot?.dtcs || []).replace(/^ 内訳: /, "").replace(/。$/, "");
  const dtcReadoutStatusSummary = dtcSnapshot?.dtcStatusSummary
    || dtcSnapshot?.dtc_status_summary
    || coreSessionStatus?.dtcStatusSummary
    || coreSessionStatus?.dtc_status_summary
    || session?.diagnosticFlowSummary?.dtcStatusSummary
    || session?.diagnosticFlowSummary?.dtc_status_summary
    || session?.diagnostic_flow_summary?.dtcStatusSummary
    || session?.diagnostic_flow_summary?.dtc_status_summary
    || null;
  const dtcReadoutStatusLabel = formatObdDtcReadoutStatusSummary(dtcReadoutStatusSummary, NO_DATA);
  const reportedDtcStatusLabel = formatObdReportedDtcStatusSummary(dtcSnapshot, NO_DATA);
  const dtcResponseStatusLabel = formatObdReadoutStatus(dtcSnapshot?.dtcReadoutStatus || dtcSnapshot?.dtc_readout_status, NO_DATA);
  const dtcResponseFormats = dtcSnapshot?.dtcResponseFormats || dtcSnapshot?.dtc_response_formats || [dtcSnapshot?.dtcResponseFormat || dtcSnapshot?.dtc_response_format].filter(Boolean);
  const dtcResponseFormatLabel = formatObdDtcResponseFormat(dtcResponseFormats, NO_DATA);
  const dtcResponseSubfunction = dtcSnapshot?.dtcResponseSubfunction || dtcSnapshot?.dtc_response_subfunction || null;
  const dtcNegativeResponseService = dtcSnapshot?.dtcNegativeResponseService || dtcSnapshot?.dtc_negative_response_service || null;
  const dtcNegativeResponseCode = dtcSnapshot?.dtcNegativeResponseCode || dtcSnapshot?.dtc_negative_response_code || null;
  const dtcNegativeResponseLabel = /^[0-9A-F]{2}$/i.test(String(dtcNegativeResponseService || "")) && /^[0-9A-F]{2}$/i.test(String(dtcNegativeResponseCode || ""))
    ? `service 0x${String(dtcNegativeResponseService).toUpperCase()} / NRC 0x${String(dtcNegativeResponseCode).toUpperCase()} (reported)`
    : NO_DATA;
  const reportedDtcEcuCountLabel = formatObdReportedDtcEcuCountSummary(dtcSnapshot, NO_DATA);
  const dtcStatusAvailabilityMask = dtcSnapshot?.dtcStatusAvailabilityMask || dtcSnapshot?.dtc_status_availability_mask || null;
  const dtcFormatIdentifier = dtcSnapshot?.dtcFormatIdentifier || dtcSnapshot?.dtc_format_identifier || null;
  const dtcMemorySelection = dtcSnapshot?.dtcMemorySelection || dtcSnapshot?.dtc_memory_selection || null;
  const dtcReadinessGroupIdentifier = dtcSnapshot?.dtcReadinessGroupIdentifier || dtcSnapshot?.dtc_readiness_group_identifier || null;
  const udsDtcExtendedDataRecordCount = (dtcSnapshot?.dtcs || []).filter((item) => Number.isInteger(Number(item?.extendedDataRecordNumber ?? item?.extended_data_record_number))).length;
  const udsDtcExtendedDataRecordResponseCount = Array.isArray(dtcSnapshot?.udsDtcExtendedDataRecordResponses || dtcSnapshot?.uds_dtc_extended_data_record_responses)
    ? (dtcSnapshot.udsDtcExtendedDataRecordResponses || dtcSnapshot.uds_dtc_extended_data_record_responses).length
    : 0;
  const udsDtcFaultDetectionCounterCount = (dtcSnapshot?.dtcs || []).filter((item) => /^[0-9A-F]{2}$/i.test(String(item?.faultDetectionCounterRaw || item?.fault_detection_counter_raw || ""))).length;
  const dtcMetadataSummary = dtcSnapshot?.dtcMetadataSummary || dtcSnapshot?.dtc_metadata_summary || null;
  const dtcMetadataTotalCount = Number(dtcMetadataSummary?.totalCount ?? dtcMetadataSummary?.total_count ?? 0);
  const dtcMetadataLabel = dtcMetadataTotalCount > 0
    ? `status byte ${Number(dtcMetadataSummary?.statusByteCount ?? dtcMetadataSummary?.status_byte_count ?? 0)}/${dtcMetadataTotalCount} / severity ${Number(dtcMetadataSummary?.severityCount ?? dtcMetadataSummary?.severity_count ?? 0)}/${dtcMetadataTotalCount} / occurrence ${Number(dtcMetadataSummary?.occurrenceCount ?? dtcMetadataSummary?.occurrence_count ?? 0)}/${dtcMetadataTotalCount} / mask ${dtcMetadataSummary?.statusAvailabilityMaskCaptured === true || dtcMetadataSummary?.status_availability_mask_captured === true ? "reported" : "not reported"}`
    : NO_DATA;
  const dtcFreezeFrameLinkSummary = dtcSnapshot?.freezeFrameLinkSummary || dtcSnapshot?.freeze_frame_link_summary || null;
  const dtcFreezeFrameTriggerEntryCount = Number(dtcFreezeFrameLinkSummary?.triggerEntryCount ?? dtcFreezeFrameLinkSummary?.trigger_entry_count ?? 0);
  const dtcFreezeFrameMatchedDtcCount = Number(dtcFreezeFrameLinkSummary?.matchedDtcCount ?? dtcFreezeFrameLinkSummary?.matched_dtc_count ?? 0);
  const dtcFreezeFrameUnmatchedTriggerCount = Number(dtcFreezeFrameLinkSummary?.unmatchedTriggerEntryCount ?? dtcFreezeFrameLinkSummary?.unmatched_trigger_entry_count ?? 0);
  const dtcFreezeFrameLinkLabel = dtcFreezeFrameTriggerEntryCount > 0
    ? `一致DTC ${dtcFreezeFrameMatchedDtcCount} / FF起点 ${dtcFreezeFrameTriggerEntryCount} / 未一致起点 ${dtcFreezeFrameUnmatchedTriggerCount}`
    : NO_DATA;
  const livePidReadoutStatusLabel = formatObdReadoutStatus(livePidSnapshot?.livePidReadoutStatus || livePidSnapshot?.live_pid_readout_status, NO_DATA);
  const ecuInfoReadoutStatusLabel = formatObdReadoutStatus(ecuInfoSnapshot?.ecuInfoReadoutStatus || ecuInfoSnapshot?.ecu_info_readout_status, NO_DATA);
  const ecuInfoResponseFormatLabel = formatObdEcuInfoResponseFormat(ecuInfoSnapshot?.ecuInfoResponseFormat || ecuInfoSnapshot?.ecu_info_response_format, NO_DATA);
  const freezeFrameReadoutStatusLabel = formatObdReadoutStatus(freezeFrameSnapshot?.freezeFrameReadoutStatus || freezeFrameSnapshot?.freeze_frame_readout_status, NO_DATA);
  const freezeFrameTriggerEntries = getObdFreezeFrameTriggerEntries(freezeFrameSnapshot);
  const freezeFrameSummaryLabel = freezeFrameSnapshot?.monitorValues?.length
    ? `${formatObdBridgeMonitorSummary(freezeFrameSnapshot?.monitorValueSummary)}${freezeFrameSnapshot?.triggerDtc ? ` / 起点${freezeFrameSnapshot.triggerDtc}` : ""}`
    : freezeFrameTriggerEntries.length
      ? `起点 ${freezeFrameTriggerEntries.length}件 / 値未出力`
      : 0;
  const freezeFrameTriggerNumber = freezeFrameSnapshot?.triggerFrameNumber ?? freezeFrameSnapshot?.trigger_frame_number ?? null;
  const udsDtcSnapshotRecordCount = Array.isArray(freezeFrameSnapshot?.udsDtcSnapshotRecords || freezeFrameSnapshot?.uds_dtc_snapshot_records)
    ? (freezeFrameSnapshot.udsDtcSnapshotRecords || freezeFrameSnapshot.uds_dtc_snapshot_records).length
    : 0;
  const udsDtcStoredDataRecordCount = Array.isArray(freezeFrameSnapshot?.udsDtcStoredDataRecords || freezeFrameSnapshot?.uds_dtc_stored_data_records)
    ? (freezeFrameSnapshot.udsDtcStoredDataRecords || freezeFrameSnapshot.uds_dtc_stored_data_records).length
    : 0;
  const freezeFrameNumberSummary = freezeFrameSnapshot?.freezeFrameNumberSummary || freezeFrameSnapshot?.freeze_frame_number_summary || null;
  const freezeFrameNumbersLabel = Array.isArray(freezeFrameNumberSummary?.frameValueCounts || freezeFrameNumberSummary?.frame_value_counts)
    ? (freezeFrameNumberSummary.frameValueCounts || freezeFrameNumberSummary.frame_value_counts).map((item) => `#${item.frameNumber ?? item.frame_number}: ${item.valueCount ?? item.value_count}`).join(" / ") || NO_DATA
    : NO_DATA;
  const freezeFrameAssociationSummary = freezeFrameSnapshot?.freezeFrameAssociationSummary || freezeFrameSnapshot?.freeze_frame_association_summary || null;
  const freezeFrameAssociationLabel = freezeFrameAssociationSummary?.associationComplete === true || freezeFrameAssociationSummary?.association_complete === true
    ? `一致 ${freezeFrameAssociationSummary.matchedGroupCount ?? freezeFrameAssociationSummary.matched_group_count ?? 0}組`
    : freezeFrameAssociationSummary?.reviewRequired === true || freezeFrameAssociationSummary?.review_required === true
      ? `要確認 ${freezeFrameAssociationSummary.ambiguousGroupCount ?? freezeFrameAssociationSummary.ambiguous_group_count ?? 0}曖昧 / ${freezeFrameAssociationSummary.unmatchedGroupCount ?? freezeFrameAssociationSummary.unmatched_group_count ?? 0}未対応`
      : NO_DATA;
  const readinessReadoutStatusLabel = formatObdReadoutStatus(readinessSnapshot?.readinessReadoutStatus || readinessSnapshot?.readiness_readout_status, NO_DATA);
  const readinessIgnitionType = readinessSnapshot?.readinessIgnitionType || readinessSnapshot?.readiness_ignition_type || null;
  const readinessStatusBytes = readinessSnapshot?.readinessStatusBytes || readinessSnapshot?.readiness_status_bytes || null;
  const readinessStatusBytesLabel = readinessStatusBytes && typeof readinessStatusBytes === "object"
    ? ["A", "B", "C", "D"].map((letter) => readinessStatusBytes[letter.toLowerCase()] ? `${letter}:0x${readinessStatusBytes[letter.toLowerCase()]}` : null).filter(Boolean).join(" / ") || NO_DATA
    : NO_DATA;
  const readinessIgnitionTypeLabel = readinessIgnitionType === "compression"
    ? "圧縮着火 (PID 01観測)"
    : readinessIgnitionType === "spark"
      ? "火花点火 (PID 01観測)"
      : NO_DATA;
  const onboardMonitorReadoutStatusLabel = formatObdReadoutStatus(onboardMonitorSnapshot?.onboardMonitorReadoutStatus || onboardMonitorSnapshot?.onboard_monitor_readout_status, NO_DATA);
  const supportedPidReadoutStatusLabel = formatObdReadoutStatus(supportedPidMatrix?.supportedPidReadoutStatus || supportedPidMatrix?.supported_pid_readout_status, NO_DATA);
  const supportedPidPageBases = supportedPidMatrix?.supportedPidPageBases || supportedPidMatrix?.supported_pid_page_bases || supportedPidMatrix?.supportedPidPageSummary?.pageBases || supportedPidMatrix?.supported_pid_page_summary?.page_bases || null;
  const supportedPidPageLabel = Array.isArray(supportedPidPageBases) && supportedPidPageBases.length ? supportedPidPageBases.join(" / ") : NO_DATA;
  const coverage = getReadoutCoverageDisplay(session?.readoutCoverage || session?.readout_coverage);
  const selectedInterface = getSelectedObdInterfaceLabel();
  const selectedInterfaceId = resolveObdInterfaceId();
  const readoutInterfaceLabel = sessionReadoutInterface?.label
    || sessionReadoutInterface?.interfaceLabel
    || sessionReadoutInterface?.interface_label
    || selectedInterface;
  const vehicleLabel = formatVehicleProfileLabel(sessionVehicleProfile, obdVehicleInput.value.trim() || NO_DATA) || NO_DATA;
  const obdReportedProfileLabel = formatObdReportedProfile(sessionObdReportedProfile, NO_DATA) || NO_DATA;
  const vehicleApplicabilityLabel = formatVehicleApplicabilitySummary(sessionVehicleApplicability, NO_DATA) || NO_DATA;
  const vehicleApplicabilityEvidenceSummary = coreSessionStatus?.vehicleApplicabilityEvidenceSummary || coreSessionStatus?.vehicle_applicability_evidence_summary || coreSessionStatus?.analysisReadinessSummary?.vehicleApplicabilityEvidenceSummary || coreSessionStatus?.analysisReadinessSummary?.vehicle_applicability_evidence_summary || coreSessionStatus?.analysisReadinessSummary?.checklistById?.vehicle_applicability?.evidenceSummary || coreSessionStatus?.analysisReadinessSummary?.checklist_by_id?.vehicle_applicability?.evidence_summary || null;
  const vehicleApplicabilityEvidenceLabel = formatVehicleApplicabilityEvidenceSummary(vehicleApplicabilityEvidenceSummary, NO_DATA) || NO_DATA;
  const vehicleApplicabilityFieldMatchSummary = coreSessionStatus?.vehicleApplicabilityFieldMatchSummary || coreSessionStatus?.vehicle_applicability_field_match_summary || coreSessionStatus?.analysisReadinessSummary?.vehicleApplicabilityFieldMatchSummary || coreSessionStatus?.analysisReadinessSummary?.vehicle_applicability_field_match_summary || coreSessionStatus?.analysisReadinessSummary?.checklistById?.vehicle_applicability?.fieldMatchSummary || coreSessionStatus?.analysisReadinessSummary?.checklist_by_id?.vehicle_applicability?.field_match_summary || null;
  const vehicleApplicabilityFieldMatchLabel = formatVehicleApplicabilityFieldMatchSummary(vehicleApplicabilityFieldMatchSummary, NO_DATA) || NO_DATA;
  const vehicleApplicabilityEcuMatchSummary = coreSessionStatus?.vehicleApplicabilityEcuMatchSummary || coreSessionStatus?.vehicle_applicability_ecu_match_summary || coreSessionStatus?.analysisReadinessSummary?.vehicleApplicabilityEcuMatchSummary || coreSessionStatus?.analysisReadinessSummary?.vehicle_applicability_ecu_match_summary || coreSessionStatus?.analysisReadinessSummary?.checklistById?.vehicle_applicability?.ecuMatchSummary || coreSessionStatus?.analysisReadinessSummary?.checklist_by_id?.vehicle_applicability?.ecu_match_summary || null;
  const expectedApplicabilityEcu = vehicleApplicabilityEcuMatchSummary?.expectedAddress || vehicleApplicabilityEcuMatchSummary?.expected_address || null;
  const observedApplicabilityEcus = vehicleApplicabilityEcuMatchSummary?.observedAddresses || vehicleApplicabilityEcuMatchSummary?.observed_addresses || [];
  const vehicleApplicabilityEcuMatchLabel = vehicleApplicabilityEcuMatchSummary?.status === "matched"
    ? `一致: ${expectedApplicabilityEcu}`
    : vehicleApplicabilityEcuMatchSummary?.status === "mismatch"
      ? `要確認: 適合 ${expectedApplicabilityEcu || NO_DATA} / 応答 ${Array.isArray(observedApplicabilityEcus) ? observedApplicabilityEcus.join(" / ") || NO_DATA : NO_DATA}`
      : NO_DATA;
  const nextReadoutLabel = formatCoreNextStepSummary(coreSessionStatus, getSessionNextReadoutCandidates(session, 2), NO_DATA);
  const nextReadoutReasonLabel = formatNextReadoutReasonSummary(session?.nextReadoutReasonSummary || session?.next_readout_reason_summary || coreSessionStatus?.nextReadoutReasonSummary || coreSessionStatus?.next_readout_reason_summary || session?.diagnosticFlowSummary?.nextReadoutReasonSummary || session?.diagnosticFlowSummary?.next_readout_reason_summary || session?.diagnostic_flow_summary?.nextReadoutReasonSummary || session?.diagnostic_flow_summary?.next_readout_reason_summary, NO_DATA);
  const nextReadoutGuardLabel = formatNextReadoutGuardSummary(session?.nextReadoutGuardSummary || session?.next_readout_guard_summary || coreSessionStatus?.nextReadoutGuardSummary || coreSessionStatus?.next_readout_guard_summary || session?.diagnosticFlowSummary?.nextReadoutGuardSummary || session?.diagnosticFlowSummary?.next_readout_guard_summary || session?.diagnostic_flow_summary?.nextReadoutGuardSummary || session?.diagnostic_flow_summary?.next_readout_guard_summary, NO_DATA);
  const nextReadoutRequestSafetyLabel = formatNextReadoutRequestSafetySummary(session?.nextReadoutRequestSafetySummary || session?.next_readout_request_safety_summary || coreSessionStatus?.nextReadoutRequestSafetySummary || coreSessionStatus?.next_readout_request_safety_summary || session?.diagnosticFlowSummary?.nextReadoutRequestSafetySummary || session?.diagnosticFlowSummary?.next_readout_request_safety_summary || session?.diagnostic_flow_summary?.nextReadoutRequestSafetySummary || session?.diagnostic_flow_summary?.next_readout_request_safety_summary, null, NO_DATA);
  const nextReadoutCandidateSafetyLabel = formatNextReadoutCandidateSafetySummary(session?.nextReadoutCandidateSafetySummary || session?.next_readout_candidate_safety_summary || coreSessionStatus?.nextReadoutCandidateSafetySummary || coreSessionStatus?.next_readout_candidate_safety_summary || session?.diagnosticFlowSummary?.nextReadoutCandidateSafetySummary || session?.diagnosticFlowSummary?.next_readout_candidate_safety_summary || session?.diagnostic_flow_summary?.nextReadoutCandidateSafetySummary || session?.diagnostic_flow_summary?.next_readout_candidate_safety_summary, NO_DATA);
  const coreSessionStatusLabel = formatCoreSessionStatusSummary(coreSessionStatus, NO_DATA);
  const emptyReadoutLabel = formatCoreEmptyReadoutSummary(coreSessionStatus, 2, NO_DATA);
  const blockingSummaryLabel = formatCoreBlockingWarningSummary(coreSessionStatus, 2, NO_DATA);
  const importedSessionComparisonSummary = session?.importedSessionComparisonSummary || session?.imported_session_comparison_summary || null;
  const nextReadoutChangeSummary = importedSessionComparisonSummary?.nextReadoutChangeSummary || importedSessionComparisonSummary?.next_readout_change_summary || null;
  const nextReadoutChangeLabel = formatNextReadoutChangeSummary(nextReadoutChangeSummary, NO_DATA);
  const importedNextReadoutGuardComparisonSummary = session?.importedNextReadoutGuardComparisonSummary || session?.imported_next_readout_guard_comparison_summary || importedSessionComparisonSummary?.nextReadoutGuardComparison || importedSessionComparisonSummary?.next_readout_guard_comparison || null;
  const importedNextReadoutGuardReviewRequestPlanSummary = session?.importedNextReadoutGuardReviewRequestPlanSummary || session?.imported_next_readout_guard_review_request_plan_summary || importedSessionComparisonSummary?.nextReadoutGuardReviewRequestPlanSummary || importedSessionComparisonSummary?.next_readout_guard_review_request_plan_summary || importedNextReadoutGuardComparisonSummary?.reviewRequestPlanSummary || importedNextReadoutGuardComparisonSummary?.review_request_plan_summary || null;
  const importedNextReadoutGuardComparisonLabel = formatNextReadoutGuardComparisonSummary(importedNextReadoutGuardComparisonSummary, NO_DATA, importedNextReadoutGuardReviewRequestPlanSummary);
  const changedIdDisplaySummary = importedSessionComparisonSummary?.changedIdDisplaySummary || importedSessionComparisonSummary?.changed_id_display_summary || null;
  const primaryBlockerComparisonLabel = formatPrimaryBlockerChangeSummary(importedSessionComparisonSummary?.primaryBlockerChangeSummary || importedSessionComparisonSummary?.primary_blocker_change_summary, NO_DATA);
  const changedIdDisplayLabel = formatChangedIdDisplaySummary(changedIdDisplaySummary, NO_DATA);
  const vehicleApplicabilityChangedRowSummary = session?.importedVehicleApplicabilityChangedRowSummary || session?.imported_vehicle_applicability_changed_row_summary || changedIdDisplaySummary?.vehicleApplicabilityChangedRowSummary || changedIdDisplaySummary?.vehicle_applicability_changed_row_summary || importedSessionComparisonSummary?.vehicleApplicabilityChangedRowSummary || importedSessionComparisonSummary?.vehicle_applicability_changed_row_summary || null;
  const vehicleApplicabilityChangedRowLabel = formatVehicleApplicabilityChangedRowSummary(vehicleApplicabilityChangedRowSummary, NO_DATA);
  const changedIdReviewTargetActionLabel = formatChangedIdReviewTargetActionSummary(changedIdDisplaySummary, NO_DATA);
  const coreReadoutInventoryLabel = formatCoreReadoutInventorySummary(session?.coreReadoutInventorySummary || session?.core_readout_inventory_summary, NO_DATA);
  const coreReadoutInventoryComparisonLabel = formatCoreReadoutInventoryComparisonSummary(session?.importedCoreReadoutInventoryComparisonSummary || session?.imported_core_readout_inventory_comparison_summary, NO_DATA);
  const observedEcuComparisonLabel = formatObservedEcuComparisonSummary(session?.importedCoreComparisonSummary || session?.imported_core_comparison_summary || importedSessionComparisonSummary?.coreComparison || importedSessionComparisonSummary?.core_comparison || null, NO_DATA);
  const dtcIdentityComparisonLabel = formatDtcIdentityComparisonSummary(session?.importedCoreComparisonSummary || session?.imported_core_comparison_summary || importedSessionComparisonSummary?.coreComparison || importedSessionComparisonSummary?.core_comparison || null, NO_DATA);
  const dtcStatusByteComparisonLabel = formatDtcStatusByteComparisonSummary(session?.importedCoreComparisonSummary || session?.imported_core_comparison_summary || importedSessionComparisonSummary?.coreComparison || importedSessionComparisonSummary?.core_comparison || null, NO_DATA);
  const dtcMetadataComparisonLabel = formatDtcMetadataComparisonSummary(session?.importedCoreComparisonSummary || session?.imported_core_comparison_summary || importedSessionComparisonSummary?.coreComparison || importedSessionComparisonSummary?.core_comparison || null, NO_DATA);
  const dtcFaultDetectionCounterComparisonLabel = formatDtcFaultDetectionCounterComparisonSummary(session?.importedCoreComparisonSummary || session?.imported_core_comparison_summary || importedSessionComparisonSummary?.coreComparison || importedSessionComparisonSummary?.core_comparison || null, NO_DATA);
  const readoutQualityLabel = formatReadoutQualitySummary(coreSessionStatus?.readoutQualitySummary || coreSessionStatus?.readout_quality_summary || session?.diagnosticFlowSummary?.readoutQualitySummary || session?.diagnosticFlowSummary?.readout_quality_summary, NO_DATA);
  const importedReadoutQualitySummary = getImportedReadoutQualityForDisplay(session);
  const importedReadoutQualityLabel = formatReadoutQualitySummary(importedReadoutQualitySummary, NO_DATA);
  const manufacturerSampleReadinessLabel = formatManufacturerSampleReadinessSummary(session?.manufacturerSampleReadinessSummary || session?.manufacturer_sample_readiness_summary, NO_DATA);
  const manufacturerSampleResponseComparisonLabel = formatManufacturerSampleResponseComparisonSummary(session?.manufacturerSampleResponseComparisonSummary || session?.manufacturer_sample_response_comparison_summary, NO_DATA);
  const readoutQualityComparisonLabel = formatReadoutQualityComparisonSummary(session?.importedReadoutQualityComparisonSummary || session?.imported_readout_quality_comparison_summary, NO_DATA);
  const readoutQualityReviewRequestLabel = formatReadoutQualityReviewRequestSummary(session?.importedReadoutQualityReviewRequestPlanSummary || session?.imported_readout_quality_review_request_plan_summary || importedSessionComparisonSummary, NO_DATA);
  const sourceLabel = formatObdSessionSourceLabel(session?.source || session?.source_type, NO_DATA);
  const sourceLengthValue = session?.sourceLength ?? session?.source_length;
  const hadSensitiveIdentifier = session?.hadSensitiveIdentifier === true || session?.had_sensitive_identifier === true;
  const startedAtValue = session?.startedAt || session?.started_at;
  const endedAtValue = session?.endedAt || session?.ended_at;
  const capturedAtValue = session?.capturedAt || session?.captured_at;
  const sessionCaptureIntegritySummary = session?.sessionCaptureIntegritySummary || session?.session_capture_integrity_summary || coreSessionStatus?.sessionCaptureIntegritySummary || coreSessionStatus?.session_capture_integrity_summary || session?.diagnosticFlowSummary?.sessionCaptureIntegritySummary || session?.diagnosticFlowSummary?.session_capture_integrity_summary || null;
  const sourceLengthLabel = sourceLengthValue ? `${sourceLengthValue}文字` : NO_DATA;
  const webSerialReadoutLabel = formatWebSerialReadoutSummary(webSerialReadoutSummary, NO_DATA);
  const observedEcuSummary = coreSessionStatus?.observedEcuSummary || coreSessionStatus?.observed_ecu_summary || session?.diagnosticFlowSummary?.observedEcuSummary || session?.diagnosticFlowSummary?.observed_ecu_summary || null;
  const observedEcuIds = Array.isArray(observedEcuSummary?.ecuIds || observedEcuSummary?.ecu_ids)
    ? (observedEcuSummary.ecuIds || observedEcuSummary.ecu_ids).slice(0, 8)
    : [...new Set([
    ...(dtcSnapshot?.dtcs || []).map((item) => item?.ecu || item?.ecu_id || item?.ecuId || item?.address || null),
    ...(livePidSnapshot?.monitorValues || []).map((item) => item?.sourceEcu || item?.source_ecu || null),
    ...(freezeFrameSnapshot?.monitorValues || []).map((item) => item?.sourceEcu || item?.source_ecu || null),
    readinessSnapshot?.sourceEcu || readinessSnapshot?.source_ecu || null,
    ...(ecuInfoSnapshot?.items || []).map((item) => item?.sourceEcu || item?.source_ecu || null),
    ...(onboardMonitorSnapshot?.tests || []).map((item) => item?.sourceEcu || item?.source_ecu || null),
    supportedPidMatrix?.sourceEcu || supportedPidMatrix?.source_ecu || null
  ].map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 8);
  const observedEcuReadoutLabels = {
    dtc_snapshot: "DTC",
    ecu_response_summary: "ECU応答",
    live_pid_snapshot: "ライブ",
    freeze_frame_snapshot: "FF",
    readiness_snapshot: "RDY",
    ecu_info_snapshot: "ECU情報",
    onboard_monitor_snapshot: "M06",
    supported_pid_matrix: "PID"
  };
  const observedEcuEntries = Array.isArray(observedEcuSummary?.ecus) ? observedEcuSummary.ecus.slice(0, 8) : [];
  const observedEcuLabel = observedEcuEntries.length
    ? observedEcuEntries.map((entry) => {
      const readoutIds = entry?.readoutIds || entry?.readout_ids || [];
      const readoutLabels = Array.isArray(readoutIds) ? readoutIds.map((id) => observedEcuReadoutLabels[id]).filter(Boolean).slice(0, 4) : [];
      return readoutLabels.length ? `${entry.id} (${readoutLabels.join("/")})` : entry.id;
    }).join(" / ")
    : observedEcuIds.length ? observedEcuIds.join(" / ") : NO_DATA;
  const observedEcuSourceCoveragePercent = Number(observedEcuSummary?.sourceCoveragePercent ?? observedEcuSummary?.source_coverage_percent);
  const observedEcuUnscopedReadoutIds = observedEcuSummary?.unscopedReadoutIds || observedEcuSummary?.unscoped_readout_ids || [];
  const observedEcuSourceCoverageLabel = Number.isFinite(observedEcuSourceCoveragePercent)
    ? observedEcuUnscopedReadoutIds.length
      ? `確認済み ${observedEcuSourceCoveragePercent}% / 未確認 ${observedEcuUnscopedReadoutIds.map((id) => observedEcuReadoutLabels[id] || id).join("/")}`
      : `確認済み ${observedEcuSourceCoveragePercent}%`
    : NO_DATA;
  const sensitiveLabel = hadSensitiveIdentifier ? "検出" : "なし";
  const startedAtLabel = startedAtValue
    ? formatDateTime(startedAtValue)
    : (obdDevSession.connectedAt ? formatDateTime(obdDevSession.connectedAt) : NO_DATA);
  const endedAtLabel = endedAtValue ? formatDateTime(endedAtValue) : NO_DATA;
  const capturedAtLabel = capturedAtValue ? formatDateTime(capturedAtValue) : NO_DATA;
  const captureIntegrityLabel = formatSessionCaptureIntegritySummary(sessionCaptureIntegritySummary, NO_DATA);
  const captureProtocolLabel = formatSessionCaptureProtocolSummary(sessionCaptureIntegritySummary, NO_DATA);
  const recoveredReadoutRoute = getRecoveredDiagnosticReadoutRoute(sessionConnectionStatus, sessionVciDevices, sessionAdapterIdentity, sessionReadoutInterface, webSerialReadoutSummary);
  const hasRecoveredWebSerialSession = recoveredReadoutRoute === "web_serial";
  const hasRecoveredBridgeSession = recoveredReadoutRoute === "local_bridge";
  const connectionLabel = obdDevSession.port
    ? selectedInterfaceId === "user-vci-elm327"
      ? "Web Serial読取"
      : `${selectedInterface} 読取`
    : obdDevSession.bridgeEndpoint
      ? "ローカルブリッジ読取"
      : hasRecoveredWebSerialSession
        ? "Web Serial読取"
      : hasRecoveredBridgeSession
        ? "ローカルブリッジ読取"
      : obdDevSession.previewMode
        ? "読取前プレビュー"
        : "未読取";
  const adapterInitializationLabel = formatWebSerialAdapterInitializationSummary(
    connectionStatus?.adapterInitializationSummary || connectionStatus?.adapter_initialization_summary || obdDevSession.adapterInitializationSummary
  );
  const values = [
    ["読取", connectionLabel],
    ["方式", selectedInterface],
    ["読取経路", readoutInterfaceLabel],
    ["車両", vehicleLabel],
    ["状態", connectionStatus?.displayStatus || connectionStatus?.display_status || NO_DATA],
    ["接続エラー", connectionErrorLabel],
    ["VCIエラー", selectedVciErrorLabel],
    ["アダプターエラー", adapterErrorLabel],
    ...(adapterInitializationLabel ? [["VCI初期化", adapterInitializationLabel]] : []),
    ["DTC", dtcSnapshot?.dtcs?.length ?? 0],
    ["DTC比較", dtcIdentityComparisonLabel],
    ["DTC状態比較", dtcStatusByteComparisonLabel],
    ["DTC報告比較", dtcMetadataComparisonLabel],
    ["DTC検出回数比較", dtcFaultDetectionCounterComparisonLabel],
    ["UDS DTC extended raw records", udsDtcExtendedDataRecordCount ? `${udsDtcExtendedDataRecordCount} (raw evidence)` : NO_DATA],
    ["UDS DTC extended raw response envelopes", udsDtcExtendedDataRecordResponseCount ? `${udsDtcExtendedDataRecordResponseCount} (raw evidence)` : NO_DATA],
    ["UDS DTC fault counter records", udsDtcFaultDetectionCounterCount ? `${udsDtcFaultDetectionCounterCount} (raw evidence)` : NO_DATA],
    ["UDS FF raw records", udsDtcSnapshotRecordCount ? `${udsDtcSnapshotRecordCount} (raw evidence)` : NO_DATA],
    ["UDS DTC stored data raw records", udsDtcStoredDataRecordCount ? `${udsDtcStoredDataRecordCount} (raw evidence)` : NO_DATA],
    ...(reportedDtcEcuCountLabel !== NO_DATA ? [["ECU報告DTC件数", `${reportedDtcEcuCountLabel} (個別DTC詳細未展開)`]] : []),
    ["DTC内訳", dtcStatusSummary || NO_DATA],
    ["DTC診断機報告状態", reportedDtcStatusLabel],
    ["DTC応答状態", dtcResponseStatusLabel],
    ["DTC応答形式", dtcResponseFormatLabel],
    ["UDS DTCサブ機能", formatUdsDtcSubfunction(dtcResponseSubfunction)],
    ["DTC負応答", dtcNegativeResponseLabel],
    ["DTC読取状態", dtcReadoutStatusLabel],
    ["DTC状態ビット可用マスク", dtcStatusAvailabilityMask ? `0x${dtcStatusAvailabilityMask} (reported)` : NO_DATA],
    ["DTC形式識別子", dtcFormatIdentifier ? `0x${dtcFormatIdentifier} (reported)` : NO_DATA],
    ["DTCメモリ選択", dtcMemorySelection ? `0x${dtcMemorySelection} (reported)` : NO_DATA],
    ["DTC readiness group", dtcReadinessGroupIdentifier ? `0x${dtcReadinessGroupIdentifier} (reported)` : NO_DATA],
    ["DTC詳細報告値", dtcMetadataLabel],
    ["DTC/FF照合", dtcFreezeFrameLinkLabel],
    ["ECU応答", session?.ecuResponseSummary?.ecus?.length ?? 0],
    ["応答ECU", observedEcuLabel],
    ["ECU由来", observedEcuSourceCoverageLabel],
    ["ECU応答比較", observedEcuComparisonLabel],
    ["ECU情報", ecuInfoSnapshot?.itemCount ?? 0],
    ["ECU情報状態", ecuInfoReadoutStatusLabel],
    ["ECU情報応答形式", ecuInfoResponseFormatLabel],
    ["ECU通信", ecuInfoProtocolLabel],
    ["主要ECU情報", ecuInfoSnapshot?.keyItemSummary?.totalCount ? `${ecuInfoSnapshot.keyItemSummary.capturedCount}/${ecuInfoSnapshot.keyItemSummary.totalCount}` : NO_DATA],
    ["Mode09対応", ecuInfoSnapshot?.supportInfoTypesSummary?.count ?? 0],
    ["Mode09対応タイプ00", formatObdEcuSupportCapture(ecuInfoSnapshot)],
    ["FF", freezeFrameSummaryLabel],
    ["FF読取状態", freezeFrameReadoutStatusLabel],
    ["FF起点番号", freezeFrameTriggerNumber === null ? NO_DATA : `#${freezeFrameTriggerNumber}`],
    ["FF番号", freezeFrameNumbersLabel],
    ["FF対応", freezeFrameAssociationLabel],
    ["ライブ値", livePidSnapshot?.monitorValues?.length
      ? formatObdBridgeMonitorSummary(livePidSnapshot?.monitorValueSummary)
      : 0],
    ["ライブ値読取状態", livePidReadoutStatusLabel],
    ["メーカーPID証跡", manufacturerPidEvidenceLabel],
    ["メーカーPID証跡比較", manufacturerPidEvidenceComparisonLabel],
    ["ライブ履歴", livePidTimeline?.sampleCount ? `${livePidTimeline.sampleCount}回` : 0],
    ["前回比較", livePidTimelineComparisonLabel],
    ["レディネス", readinessSnapshot?.monitorCount || readinessSnapshot?.knownMonitorCount
      ? formatObdBridgeReadinessSummary(readinessSnapshot)
      : 0],
    ["レディネス点火方式", readinessIgnitionTypeLabel],
    ["レディネス状態バイト", readinessStatusBytesLabel],
    ["レディネス読取状態", readinessReadoutStatusLabel],
    ["Mode06", onboardMonitorSnapshot?.testCount ? formatObdBridgeOnboardMonitorSummary(onboardMonitorSnapshot) : 0],
    ["Mode06読取状態", onboardMonitorReadoutStatusLabel],
    ["記録PID", (supportedPidMatrix?.supportedPids || supportedPidMatrix?.supported_pids || []).length],
    ["対応PID（辞書一致）", supportedPidMatrix?.supportedCount ?? 0],
    ["対応PIDページ", supportedPidPageLabel],
    ["対応PID読取状態", supportedPidReadoutStatusLabel],
    ["開始", startedAtLabel],
    ["終了", endedAtLabel],
    ["取得時刻", capturedAtLabel],
    ["読取時刻範囲", captureIntegrityLabel],
    ["読取通信方式", captureProtocolLabel],
    ["ブリッジ", obdDevSession.bridgeEndpoint || hasRecoveredBridgeSession ? "確認済み" : obdDevSession.previewMode ? "プレビュー" : "未確認"],
    ["VCI", bridgeDeviceCount],
    ...(j2534RuntimeCompatibilityLabel ? [["J2534 runtime", j2534RuntimeCompatibilityLabel]] : []),
    ...(j2534DriverReadinessLabel ? [["J2534準備", j2534DriverReadinessLabel]] : []),
    ...(j2534NextCheckLabel ? [["J2534次確認", j2534NextCheckLabel]] : []),
    ["アダプター", adapterIdentity?.adapterFamily || adapterIdentity?.adapterName || NO_DATA],
    ["取得率", coverage?.totalCategories ? `${coverage.capturedPercent || 0}% (${coverage.capturedCategories || 0}/${coverage.totalCategories})` : NO_DATA],
    ["応答率", coverage?.totalCategories ? `${coverage.progressPercent}% (${coverage.availableCategories}/${coverage.totalCategories})` : NO_DATA],
    ["取得済", coverage?.capturedCategories ?? 0],
    ["空応答", coverage?.emptyCategories ?? 0],
    ["未取得", coverage?.missingLabels?.length ? coverage.missingLabels.join(" / ") : "なし"]
  ];
  values.splice(2, 0, ["入力源", sourceLabel], ["入力長", sourceLengthLabel]);
  values.splice(4, 0, ["読取実行", webSerialReadoutLabel]);
  values.splice(5, 0, ["ECU報告プロファイル", obdReportedProfileLabel]);
  values.splice(5, 0, ["適用範囲", vehicleApplicabilityLabel]);
  values.splice(6, 0, ["候補照合", vehicleApplicabilityFieldMatchLabel]);
  values.splice(6, 0, ["ECU適合", vehicleApplicabilityEcuMatchLabel]);
  values.splice(6, 0, ["適合差分", vehicleApplicabilityChangedRowLabel]);
  values.splice(values.length - 1, 0, ["識別情報", sensitiveLabel]);
  values.splice(6, 0, ["コア進捗", coreSessionStatusLabel], ["読取内訳", coreReadoutInventoryLabel], ["在庫比較", coreReadoutInventoryComparisonLabel], ["読取品質", readoutQualityLabel], ...(importedReadoutQualitySummary ? [["受信品質", importedReadoutQualityLabel]] : []), ["実機サンプル", manufacturerSampleReadinessLabel], ["実機応答比較", manufacturerSampleResponseComparisonLabel], ["空応答", emptyReadoutLabel], ["保留要因", blockingSummaryLabel], ["主保留比較", primaryBlockerComparisonLabel], ["読取差分", changedIdDisplayLabel], ["差分確認", changedIdReviewTargetActionLabel], ["次操作", nextReadoutLabel], ["読取理由", nextReadoutReasonLabel], ["計画安全", nextReadoutGuardLabel], ["計画差分", importedNextReadoutGuardComparisonLabel], ["次読取整合", nextReadoutChangeLabel], ["要求安全", nextReadoutRequestSafetyLabel], ["候補安全", nextReadoutCandidateSafetyLabel]);
  values.splice(10, 0, ["品質比較", readoutQualityComparisonLabel]);
  values.splice(11, 0, ["品質確認要求", readoutQualityReviewRequestLabel]);
  values.push(["Evidence", vehicleApplicabilityEvidenceLabel]);
  values.forEach(([label, value]) => {
    const item = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = label;
    item.append(strong, document.createTextNode(String(value)));
    obdDevSessionSummary.appendChild(item);
  });
  renderObdNextReadoutActions(session);
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

    const readiness = item.commandClass === "state-changing"
      ? window.ObdReadOnly?.buildServiceOperationReadiness?.(item.id)
      : null;
    const readinessLine = document.createElement("p");
    readinessLine.className = "obd-readout-request-note";
    readinessLine.textContent = readiness
      ? `安全条件 ${readiness.completedCount}/${readiness.totalCount} / 実車送信なし`
      : "読取側の安全確認を継続";

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

    card.append(head, goal, readinessLine, list, button);
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
    badge.textContent = `${progress.progressPercent || 0}% ソフト`;
    head.append(title, badge);

    const role = document.createElement("p");
    role.textContent = item.role;

    const scope = document.createElement("p");
    scope.textContent = item.capabilityScope.join(" / ");

    const status = document.createElement("p");
    status.textContent = `${item.currentAvailability || "確認中"} / ${progress.currentBasis || ""}`;

    const phaseCandidateIds = item.id === "local_bridge"
      ? ["user-vci-elm327", ...BRIDGE_BACKED_INTERFACE_IDS]
      : Object.entries(OBD_INTERFACE_PROGRESS_BY_CATALOG_ID)
        .filter(([, phaseId]) => phaseId === item.id)
        .map(([catalogId]) => catalogId);
    const phaseCandidates = interfaceCatalog.filter((candidate) => phaseCandidateIds.includes(candidate.id));
    const hardwareConfirmed = phaseCandidates.filter((candidate) => candidate.hardwareCompatibilityConfirmed === true).length;
    const vehicleReadoutConfirmed = phaseCandidates.filter((candidate) => candidate.connectionEnabled === true).length;
    const hardware = document.createElement("p");
    hardware.textContent = phaseCandidates.length
      ? `実機適合 ${hardwareConfirmed}/${phaseCandidates.length} / 実車読取 ${vehicleReadoutConfirmed}/${phaseCandidates.length}`
      : "実機適合: 対象VCI未選定";

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
      button.dataset.obdBridgeRequest = "true";
      button.disabled = isObdBridgeOperationBlocked();
      button.textContent = "読取確認";
      button.addEventListener("click", () => {
        startGeneralBridgeCheck();
      });
    }
    card.append(head, role, scope, status, hardware, next, eta, button);
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
    badge.textContent = `${display.implementationProgressPercent || display.progressPercent || 0}% 実装`;
    head.append(title, badge);

    const role = document.createElement("p");
    role.textContent = `${display.transport} / ${display.primaryUse}`;

    const scope = document.createElement("p");
    scope.textContent = display.readScopeCandidates.slice(0, 4).join(" / ") || display.interfaceFamily;

    const status = document.createElement("p");
    status.textContent = `${display.currentStatus || "確認中"} / 実機適合: ${display.hardwareCompatibilityConfirmed === true ? "確認済み" : "未確認"} / ${display.currentBasis || ""}`;

    const observedUse = document.createElement("p");
    observedUse.textContent = `実機実績: ${display.observedUse || "未確認"}`;

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
      button.dataset.obdBridgeRequest = "true";
      button.disabled = isObdBridgeOperationBlocked();
      button.textContent = getInterfaceCandidateActionLabel(display);
      button.title = getInterfaceCandidateProbeLabel(display);
      button.addEventListener("click", () => {
        startInterfaceCandidateCheck(display);
      });
    }

    card.append(head, role, scope, status, observedUse, next, eta, note, implementation, checks, button);
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

    const measured = document.createElement("p");
    measured.textContent = item.source_date ? `集計日: ${item.source_date}` : "集計日: 未登録";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.disabled = true;
    button.textContent = item.blocked_until?.length ? "ソース確認待ち" : "拡張中";

    card.append(head, current, target, next, remaining, eta, measured, button);
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

    const measured = document.createElement("p");
    measured.textContent = item.source_date ? `集計日: ${item.source_date}` : "集計日: 未登録";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.disabled = true;
    button.textContent = item.safety_gate || "確認中";

    card.append(head, status, progressDetail, missing, next, eta, measured, button);
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

function analyzeObdScannerImport(options = {}) {
  invalidateObdScannerImport();
  const scannerText = obdScannerText.value;
  if (typeof window.ObdReadOnly?.getDiagnosticSessionJsonPolicy === "function") {
    const policy = window.ObdReadOnly.getDiagnosticSessionJsonPolicy(scannerText);
    if (!policy.accepted) {
      obdImportStatus.textContent = "読取入力の形式またはサイズが取込条件を満たしていません。現在の読取結果を保持しています。";
      return;
    }
  }
  const hasScannerText = scannerText.trim().length > 0;
  const mergeWithCurrentSession = options?.mergeWithCurrentSession === true;
  const currentSession = obdDevSession.lastSession;
  const currentDtcSnapshot = currentSession?.dtcSnapshot || currentSession?.dtc_snapshot || null;
  const currentLivePidSnapshot = currentSession?.livePidSnapshot || currentSession?.live_pid_snapshot || null;
  const currentFreezeFrameSnapshot = currentSession?.freezeFrameSnapshot || currentSession?.freeze_frame_snapshot || null;
  const currentReadinessSnapshot = currentSession?.readinessSnapshot || currentSession?.readiness_snapshot || null;
  const currentEcuInfoSnapshot = currentSession?.ecuInfoSnapshot || currentSession?.ecu_info_snapshot || null;
  const currentOnboardMonitorSnapshot = currentSession?.onboardMonitorSnapshot || currentSession?.onboard_monitor_snapshot || null;
  const currentSupportedPidMatrix = currentSession?.supportedPidMatrix || currentSession?.supported_pid_matrix || null;
  const currentEcuResponseSummary = currentSession?.ecuResponseSummary || currentSession?.ecu_response_summary || null;
  const currentReadoutCoverage = currentSession?.readoutCoverage || currentSession?.readout_coverage || null;
  const currentNextReadoutCandidates = currentSession?.nextReadoutCandidates || currentSession?.next_readout_candidates || null;
  const currentDiagnosticFlowSummary = currentSession?.diagnosticFlowSummary || currentSession?.diagnostic_flow_summary || null;
  const currentCoreSessionStatus = currentSession?.coreSessionStatus || currentSession?.core_session_status || null;
  const currentReadoutCompletionSummary = currentSession?.readoutCompletionSummary || currentSession?.readout_completion_summary || null;
  const currentAnalysisReadinessSummary = currentSession?.analysisReadinessSummary || currentSession?.analysis_readiness_summary || null;
  const currentReadoutQualitySummary = currentSession?.readoutQualitySummary || currentSession?.readout_quality_summary || null;
  const currentReadoutRequestPlanGateSummary = currentSession?.readoutRequestPlanGateSummary || currentSession?.readout_request_plan_gate_summary || null;
  const currentNextReadoutGuardSummary = currentSession?.nextReadoutGuardSummary || currentSession?.next_readout_guard_summary || null;
  const currentCoreReadoutInventorySummary = currentSession?.coreReadoutInventorySummary || currentSession?.core_readout_inventory_summary || null;
  const currentManufacturerPidVehicleReadoutPackages = currentSession?.manufacturerPidVehicleReadoutPackages || currentSession?.manufacturer_pid_vehicle_readout_packages || [];
  const currentNextReadoutRequest = currentSession?.nextReadoutRequest || currentSession?.next_readout_request || currentDiagnosticFlowSummary?.nextReadoutRequest || currentDiagnosticFlowSummary?.next_readout_request || currentCoreSessionStatus?.nextReadoutRequest || currentCoreSessionStatus?.next_readout_request || currentCoreSessionStatus?.nextReadoutSummary?.readoutRequest || currentCoreSessionStatus?.next_readout_summary?.readout_request || null;
  const currentReadoutRequestPlanSummary = currentSession?.readoutRequestPlanSummary || currentSession?.readout_request_plan_summary || currentDiagnosticFlowSummary?.readoutRequestPlanSummary || currentDiagnosticFlowSummary?.readout_request_plan_summary || currentCoreSessionStatus?.readoutRequestPlanSummary || currentCoreSessionStatus?.readout_request_plan_summary || null;
  const currentNextReadoutRequestSafetySummary = currentSession?.nextReadoutRequestSafetySummary || currentSession?.next_readout_request_safety_summary || currentDiagnosticFlowSummary?.nextReadoutRequestSafetySummary || currentDiagnosticFlowSummary?.next_readout_request_safety_summary || currentCoreSessionStatus?.nextReadoutRequestSafetySummary || currentCoreSessionStatus?.next_readout_request_safety_summary || null;
  const currentNextReadoutReasonSummary = currentSession?.nextReadoutReasonSummary || currentSession?.next_readout_reason_summary || currentDiagnosticFlowSummary?.nextReadoutReasonSummary || currentDiagnosticFlowSummary?.next_readout_reason_summary || currentCoreSessionStatus?.nextReadoutReasonSummary || currentCoreSessionStatus?.next_readout_reason_summary || null;
  const currentNextReadoutCandidateSafetySummary = currentSession?.nextReadoutCandidateSafetySummary || currentSession?.next_readout_candidate_safety_summary || currentDiagnosticFlowSummary?.nextReadoutCandidateSafetySummary || currentDiagnosticFlowSummary?.next_readout_candidate_safety_summary || currentCoreSessionStatus?.nextReadoutCandidateSafetySummary || currentCoreSessionStatus?.next_readout_candidate_safety_summary || null;
  const currentStartedAt = currentSession?.startedAt || currentSession?.started_at;
  const currentEndedAt = currentSession?.endedAt || currentSession?.ended_at;
  const currentCapturedAt = currentSession?.capturedAt || currentSession?.captured_at;
  const currentVehicleProfile = currentSession?.vehicleProfile || currentSession?.vehicle_profile || null;
  const currentVehicleApplicability = currentSession?.vehicleApplicability || currentSession?.vehicle_applicability || null;
  const currentReadoutInterface = currentSession?.readoutInterface || currentSession?.readout_interface || buildSelectedObdReadoutInterface();
  const currentConnectionStatus = currentSession?.connectionStatus || currentSession?.connection_status || null;
  const currentVciDevices = currentSession?.vciDevices || currentSession?.vci_devices || currentSession?.vciList?.devices || currentSession?.vci_list?.devices || [];
  const currentAdapterIdentity = currentSession?.adapterIdentity || currentSession?.adapter_identity || null;
  const currentWebSerialReadoutSummary = currentSession?.webSerialReadoutSummary || currentSession?.web_serial_readout_summary || null;
  const currentSourceLength = currentSession?.sourceLength ?? currentSession?.source_length;
  const currentHadSensitiveIdentifier = currentSession?.hadSensitiveIdentifier === true || currentSession?.had_sensitive_identifier === true;
  const currentProtocol = currentSession?.protocol || currentSession?.obd_protocol || null;
  const currentWarnings = currentSession?.warnings || currentSession?.warning_ids || [];
  const currentToolHints = currentSession?.toolHints || currentSession?.tool_hints || [];
  const bridgeImport = mergeWithCurrentSession && currentSession && hasBridgeDiagnosticImportPipelineSupport()
    ? window.ObdReadOnly.buildBridgeDiagnosticImport({
      startedAt: currentStartedAt,
      endedAt: currentEndedAt,
      protocol: currentProtocol,
      capturedAt: currentCapturedAt,
      vehicleProfile: currentVehicleProfile,
      vehicleApplicability: currentVehicleApplicability,
      readoutInterface: currentReadoutInterface,
      connectionStatus: currentConnectionStatus,
      vciList: { devices: currentVciDevices },
      adapterIdentity: currentAdapterIdentity,
      dtcSnapshot: currentDtcSnapshot,
      livePidSnapshot: currentLivePidSnapshot,
      freezeFrameSnapshot: currentFreezeFrameSnapshot,
      readinessSnapshot: currentReadinessSnapshot,
      ecuInfoSnapshot: currentEcuInfoSnapshot,
      onboardMonitorSnapshot: currentOnboardMonitorSnapshot,
      supportedPidMatrix: currentSupportedPidMatrix,
      ecuResponseSummary: currentEcuResponseSummary,
      readoutCoverage: currentReadoutCoverage,
      nextReadoutCandidates: currentNextReadoutCandidates,
      nextReadoutRequest: currentNextReadoutRequest,
      nextReadoutRequestSafetySummary: currentNextReadoutRequestSafetySummary,
      nextReadoutReasonSummary: currentNextReadoutReasonSummary,
      nextReadoutCandidateSafetySummary: currentNextReadoutCandidateSafetySummary,
      readoutRequestPlanSummary: currentReadoutRequestPlanSummary,
      manufacturerPidVehicleReadoutPackages: currentManufacturerPidVehicleReadoutPackages,
      warnings: currentWarnings,
      toolHints: currentToolHints,
      sourceLength: currentSourceLength,
      hadSensitiveIdentifier: currentHadSensitiveIdentifier
    })
    : null;
  const jsonImportSession = hasScannerText && typeof window.ObdReadOnly?.buildDiagnosticScanSessionFromJson === "function"
    ? window.ObdReadOnly.buildDiagnosticScanSessionFromJson(scannerText)
    : null;
  const csvImportSession = !jsonImportSession && hasScannerText && typeof window.ObdReadOnly?.buildDiagnosticScanSessionFromCsv === "function"
    ? window.ObdReadOnly.buildDiagnosticScanSessionFromCsv(scannerText)
    : null;
  const structuredImportSession = jsonImportSession || csvImportSession;
  const structuredImportRejected = structuredImportSession
    && (structuredImportSession.accepted === false || structuredImportSession.ok === false || structuredImportSession.blocked === true);
  if (structuredImportRejected) {
    const errors = Array.isArray(structuredImportSession.errors) ? structuredImportSession.errors.filter(Boolean) : [];
    if (hasActiveObdReadoutForExitWarning()) {
      obdImportStatus.textContent = `診断結果ファイルを取り込めませんでした: ${errors.slice(0, 3).join(" / ") || "検証に失敗"}。現在の読取結果を保持しています。`;
      return;
    }
    obdDetectedCodes.innerHTML = "";
    obdMonitorGrid.innerHTML = "";
    obdMonitorInsightList.innerHTML = "";
    obdMonitorInsightList.hidden = true;
    renderObdImportToolHints();
    obdImportStatus.textContent = `診断結果ファイルを取り込めませんでした: ${errors.slice(0, 3).join(" / ") || "検証に失敗"}`;
    obdMonitorStatus.textContent = "拒否された読取ファイルから診断値を表示しません。";
    obdMonitorCount.textContent = "0項目";
    return;
  }
  const analysis = structuredImportSession || (bridgeImport && hasBridgeMergeDiagnosticInputsSupport()
    ? window.ObdReadOnly.mergeDiagnosticInputs({ scannerText, bridgeImport })
    : window.ObdReadOnly.analyzeScannerText(scannerText));
  if (bridgeImport && hasBridgeDiagnosticScanSessionSupport()) {
    obdDevSession.lastSession = window.ObdReadOnly.buildDiagnosticScanSession({
      session_id: obdDevSession.lastSession?.sessionId || "scanner-bridge-merge-session",
      scan_session: analysis,
      readoutInterface: currentReadoutInterface,
      webSerialReadoutSummary: currentWebSerialReadoutSummary || undefined
    });
    handleObdReadoutSessionReplacement();
  }
  if (structuredImportSession && hasBridgeDiagnosticScanSessionSupport()) {
    const importedVehicleProfile = structuredImportSession.vehicleProfile || structuredImportSession.vehicle_profile || null;
    const structuredImportVehicleProfile = importedVehicleProfile || buildSelectedObdVehicleProfile();
    const importedVehicleApplicability = structuredImportSession.vehicleApplicability || structuredImportSession.vehicle_applicability || null;
    const structuredImportVehicleApplicability = importedVehicleApplicability || buildSelectedObdVehicleApplicability(structuredImportVehicleProfile);
    const importedReadoutInterface = structuredImportSession.readoutInterface || structuredImportSession.readout_interface || null;
    const structuredManufacturerPidVehicleReadoutPackages = structuredImportSession.manufacturerPidVehicleReadoutPackages || structuredImportSession.manufacturer_pid_vehicle_readout_packages || [];
    const compareManufacturerPidVehicleReadouts = mergeWithCurrentSession
      && currentManufacturerPidVehicleReadoutPackages.length > 0
      && structuredManufacturerPidVehicleReadoutPackages.length > 0;
    obdDevSession.lastSession = window.ObdReadOnly.buildDiagnosticScanSession({
      scan_session: structuredImportSession,
      vehicleProfile: structuredImportVehicleProfile || undefined,
      vehicleApplicability: structuredImportVehicleApplicability || undefined,
      readoutInterface: importedReadoutInterface || buildSelectedObdReadoutInterface(),
      importedCoreSessionStatus: mergeWithCurrentSession ? currentCoreSessionStatus || undefined : undefined,
      importedDiagnosticFlowSummary: mergeWithCurrentSession ? currentDiagnosticFlowSummary || undefined : undefined,
      importedReadoutCompletionSummary: mergeWithCurrentSession ? currentReadoutCompletionSummary || undefined : undefined,
      importedAnalysisReadinessSummary: mergeWithCurrentSession ? currentAnalysisReadinessSummary || undefined : undefined,
      importedReadoutQualitySummary: mergeWithCurrentSession ? currentReadoutQualitySummary || undefined : undefined,
      importedReadoutRequestPlanGateSummary: mergeWithCurrentSession ? currentReadoutRequestPlanGateSummary || undefined : undefined,
      importedNextReadoutGuardSummary: mergeWithCurrentSession ? currentNextReadoutGuardSummary || undefined : undefined,
      importedCoreReadoutInventorySummary: mergeWithCurrentSession ? currentCoreReadoutInventorySummary || undefined : undefined,
      importedManufacturerPidVehicleReadoutPackages: compareManufacturerPidVehicleReadouts ? currentManufacturerPidVehicleReadoutPackages : undefined
    });
    handleObdReadoutSessionReplacement();
  }
  if (!bridgeImport && !structuredImportSession && hasScannerText && hasBridgeDiagnosticScanSessionSupport()) {
    const textImportVehicleProfile = buildSelectedObdVehicleProfile();
    obdDevSession.lastSession = window.ObdReadOnly.buildDiagnosticScanSession({
      session_id: "scanner-text-import-session",
      source: "scanner_text",
      dtcSnapshot: analysis.dtcSnapshot || analysis.dtc_snapshot || { source: "scanner_text", codes: analysis.codes },
      livePidSnapshot: analysis.livePidSnapshot || analysis.live_pid_snapshot || {
        source: "scanner_text",
        monitorValues: analysis.monitorValues,
        monitorInsights: analysis.monitorInsights
      },
      freezeFrameSnapshot: analysis.freezeFrameSnapshot || analysis.freeze_frame_snapshot || undefined,
      readinessSnapshot: analysis.readinessSnapshot || analysis.readiness_snapshot || undefined,
      ecuInfoSnapshot: analysis.ecuInfoSnapshot || analysis.ecu_info_snapshot || undefined,
      supportedPidMatrix: analysis.supportedPidMatrix || analysis.supported_pid_matrix || undefined,
      onboardMonitorSnapshot: analysis.onboardMonitorSnapshot || analysis.onboard_monitor_snapshot || analysis.mode06Snapshot || analysis.mode06_snapshot || undefined,
      ecuResponseSummary: analysis.ecuResponseSummary || analysis.ecu_response_summary || undefined,
      toolHints: analysis.toolHints,
      sourceLength: analysis.sourceLength,
      hadSensitiveIdentifier: analysis.hadSensitiveIdentifier === true,
      vehicleProfile: textImportVehicleProfile || undefined,
      vehicleApplicability: buildSelectedObdVehicleApplicability(textImportVehicleProfile) || undefined,
      readoutInterface: buildSelectedObdReadoutInterface()
    });
    handleObdReadoutSessionReplacement();
  }
  if (!mergeWithCurrentSession && obdDevSession.lastSession !== currentSession) {
    cancelObdBridgeOperation();
  }
  const mergedSession = bridgeImport || hasScannerText ? (obdDevSession.lastSession || null) : null;
  const mergedCodes = mergedSession?.dtcSnapshot?.codes || analysis.codes;
  const mergedDtcs = mergedSession?.dtcSnapshot?.dtcs || [];
  const mergedMonitorValues = mergedSession?.livePidSnapshot?.monitorValues || analysis.monitorValues;
  const summarySource = mergedSession || analysis;
  const summaryToolHints = summarySource.toolHints || summarySource.tool_hints || [];
  const summaryProtocol = summarySource.protocol || summarySource.obd_protocol || null;
  const summarySourceType = summarySource.source || summarySource.source_type || null;
  obdDetectedCodes.innerHTML = "";
  obdMonitorGrid.innerHTML = "";
  obdMonitorInsightList.innerHTML = "";
  obdMonitorInsightList.hidden = true;
  renderObdImportToolHints(summaryToolHints);

  if (!hasScannerText && !bridgeImport) {
    obdImportStatus.textContent = buildCoreAnalysisPendingStatus(
      obdDevSession.lastSession?.coreSessionStatus,
      "外部診断機の読取結果を入力してください。"
    );
    obdMonitorStatus.textContent = "読取後にライブデータを表示します。";
    obdMonitorCount.textContent = "0項目";
    return;
  }

  const notes = [];
  if (Array.isArray(summaryToolHints) && summaryToolHints.length > 0) {
    notes.push(`入力元 ${summaryToolHints.join(" / ")}`);
    if (summaryToolHints.some((hint) => OEM_SCANNER_TOOL_HINTS.has(hint))) {
      notes.push("メーカー固有候補は未確認扱い");
    }
  }
  if (summaryProtocol) notes.push(`Protocol ${summaryProtocol}`);
  const summaryVehicleProfile = summarySource.vehicleProfile || summarySource.vehicle_profile || null;
  const summaryVehicleApplicability = summarySource.vehicleApplicability || summarySource.vehicle_applicability || null;
  const summaryConnectionStatus = summarySource.connectionStatus || summarySource.connection_status || null;
  const summaryAdapterIdentity = summarySource.adapterIdentity || summarySource.adapter_identity || null;
  const summaryVciDevices = summarySource.vciDevices || summarySource.vci_devices || summarySource.vciList?.devices || summarySource.vci_list?.devices || null;
  const summaryStartedAt = summarySource.startedAt || summarySource.started_at;
  const summaryEndedAt = summarySource.endedAt || summarySource.ended_at;
  const analysisVehicleLabel = formatVehicleProfileLabel(summaryVehicleProfile);
  const analysisApplicabilityLabel = formatVehicleApplicabilitySummary(summaryVehicleApplicability);
  const summaryCoreSessionStatus = summarySource.coreSessionStatus || summarySource.core_session_status || null;
  const analysisApplicabilityEvidenceLabel = formatVehicleApplicabilityEvidenceSummary(summaryCoreSessionStatus?.vehicleApplicabilityEvidenceSummary || summaryCoreSessionStatus?.vehicle_applicability_evidence_summary || summaryCoreSessionStatus?.analysisReadinessSummary?.vehicleApplicabilityEvidenceSummary || summaryCoreSessionStatus?.analysisReadinessSummary?.vehicle_applicability_evidence_summary, "");
  const summaryNextReadoutCandidates = getSessionNextReadoutCandidates(summarySource, 2);
  const analysisCoreStatusLabel = formatCoreSessionStatusSummary(summaryCoreSessionStatus, "");
  const analysisEmptyReadoutLabel = formatCoreEmptyReadoutSummary(summaryCoreSessionStatus, 2, "");
  const analysisNextStepLabel = formatCoreNextStepSummary(summaryCoreSessionStatus, summaryNextReadoutCandidates, "");
  const summaryDiagnosticFlow = summarySource.diagnosticFlowSummary || summarySource.diagnostic_flow_summary || null;
  const summaryNextReadoutSummary = summaryCoreSessionStatus?.nextReadoutSummary || summaryCoreSessionStatus?.next_readout_summary || null;
  const analysisNextReadoutRequest = summarySource.nextReadoutRequest || summarySource.next_readout_request || summaryCoreSessionStatus?.nextReadoutRequest || summaryCoreSessionStatus?.next_readout_request || summaryNextReadoutSummary?.readoutRequest || summaryNextReadoutSummary?.readout_request || summaryDiagnosticFlow?.nextReadoutRequest || summaryDiagnosticFlow?.next_readout_request || null;
  const analysisReadoutRequestPlan = summarySource.readoutRequestPlanSummary || summarySource.readout_request_plan_summary || summaryCoreSessionStatus?.readoutRequestPlanSummary || summaryCoreSessionStatus?.readout_request_plan_summary || summaryDiagnosticFlow?.pendingReadoutRequestPlan || summaryDiagnosticFlow?.pending_readout_request_plan || summaryDiagnosticFlow?.readoutRequestPlanSummary || summaryDiagnosticFlow?.readout_request_plan_summary || null;
  const analysisNextReadoutReasonNote = formatNextReadoutReasonSummary(summarySource.nextReadoutReasonSummary || summarySource.next_readout_reason_summary || summaryCoreSessionStatus?.nextReadoutReasonSummary || summaryCoreSessionStatus?.next_readout_reason_summary || summaryDiagnosticFlow?.nextReadoutReasonSummary || summaryDiagnosticFlow?.next_readout_reason_summary, "");
  const analysisNextReadoutGuardNote = formatNextReadoutGuardSummary(summarySource.nextReadoutGuardSummary || summarySource.next_readout_guard_summary || summaryCoreSessionStatus?.nextReadoutGuardSummary || summaryCoreSessionStatus?.next_readout_guard_summary || summaryDiagnosticFlow?.nextReadoutGuardSummary || summaryDiagnosticFlow?.next_readout_guard_summary, "");
  const analysisNextReadoutRequestSafetySummary = summarySource.nextReadoutRequestSafetySummary || summarySource.next_readout_request_safety_summary || summaryCoreSessionStatus?.nextReadoutRequestSafetySummary || summaryCoreSessionStatus?.next_readout_request_safety_summary || summaryDiagnosticFlow?.nextReadoutRequestSafetySummary || summaryDiagnosticFlow?.next_readout_request_safety_summary || null;
  const analysisNextReadoutRequestSafetyNote = analysisNextReadoutRequestSafetySummary
    ? formatNextReadoutRequestSafetySummary(analysisNextReadoutRequestSafetySummary, null, "")
    : formatNextReadoutRequestSafetySummary(analysisNextReadoutRequest, analysisReadoutRequestPlan, "");
  const analysisNextReadoutCandidateSafetyNote = formatNextReadoutCandidateSafetySummary(summarySource.nextReadoutCandidateSafetySummary || summarySource.next_readout_candidate_safety_summary || summaryCoreSessionStatus?.nextReadoutCandidateSafetySummary || summaryCoreSessionStatus?.next_readout_candidate_safety_summary || summarySource.diagnosticFlowSummary?.nextReadoutCandidateSafetySummary || summarySource.diagnosticFlowSummary?.next_readout_candidate_safety_summary || summarySource.diagnostic_flow_summary?.nextReadoutCandidateSafetySummary || summarySource.diagnostic_flow_summary?.next_readout_candidate_safety_summary, "");
  if (analysisVehicleLabel) {
    notes.push(`車両 ${analysisVehicleLabel}`);
  }
  if (analysisApplicabilityLabel) {
    notes.push(`適用 ${analysisApplicabilityLabel}`);
  }
  if (analysisApplicabilityEvidenceLabel) {
    notes.push(`Evidence ${analysisApplicabilityEvidenceLabel}`);
  }
  if (analysisCoreStatusLabel) {
    notes.push(`コア ${analysisCoreStatusLabel}`);
  }
  const coreReadoutInventoryNote = formatCoreReadoutInventorySummary(summarySource.coreReadoutInventorySummary || summarySource.core_readout_inventory_summary, "");
  if (coreReadoutInventoryNote) {
    notes.push(`読取内訳 ${coreReadoutInventoryNote}`);
  }
  const coreReadoutInventoryComparisonNote = formatCoreReadoutInventoryComparisonSummary(summarySource.importedCoreReadoutInventoryComparisonSummary || summarySource.imported_core_readout_inventory_comparison_summary, "");
  if (coreReadoutInventoryComparisonNote) {
    notes.push(`在庫比較 ${coreReadoutInventoryComparisonNote}`);
  }
  const readoutQualityNote = formatReadoutQualitySummary(summaryCoreSessionStatus?.readoutQualitySummary || summaryCoreSessionStatus?.readout_quality_summary || summarySource.diagnosticFlowSummary?.readoutQualitySummary || summarySource.diagnosticFlowSummary?.readout_quality_summary, "");
  if (readoutQualityNote) {
    notes.push(`読取品質 ${readoutQualityNote}`);
  }
  const importedReadoutQualitySummary = getImportedReadoutQualityForDisplay(summarySource);
  if (importedReadoutQualitySummary) {
    notes.push(`受信品質 ${formatReadoutQualitySummary(importedReadoutQualitySummary, NO_DATA)}`);
  }
  const manufacturerSampleReadinessNote = formatManufacturerSampleReadinessSummary(summarySource.manufacturerSampleReadinessSummary || summarySource.manufacturer_sample_readiness_summary, "");
  if (manufacturerSampleReadinessNote) {
    notes.push(`実機サンプル ${manufacturerSampleReadinessNote}`);
  }
  const manufacturerSampleResponseComparisonNote = formatManufacturerSampleResponseComparisonSummary(summarySource.manufacturerSampleResponseComparisonSummary || summarySource.manufacturer_sample_response_comparison_summary, "");
  if (manufacturerSampleResponseComparisonNote) {
    notes.push(`実機応答比較 ${manufacturerSampleResponseComparisonNote}`);
  }
  const readoutQualityComparisonNote = formatReadoutQualityComparisonSummary(summarySource.importedReadoutQualityComparisonSummary || summarySource.imported_readout_quality_comparison_summary, "");
  if (readoutQualityComparisonNote) {
    notes.push(`品質比較 ${readoutQualityComparisonNote}`);
  }
  const importedSessionComparisonSummary = summarySource.importedSessionComparisonSummary || summarySource.imported_session_comparison_summary || null;
  const nextReadoutChangeNote = formatNextReadoutChangeSummary(importedSessionComparisonSummary?.nextReadoutChangeSummary || importedSessionComparisonSummary?.next_readout_change_summary, "");
  const importedNextReadoutGuardComparisonForNote = summarySource.importedNextReadoutGuardComparisonSummary || summarySource.imported_next_readout_guard_comparison_summary || importedSessionComparisonSummary?.nextReadoutGuardComparison || importedSessionComparisonSummary?.next_readout_guard_comparison || null;
  const importedNextReadoutGuardReviewRequestPlanForNote = summarySource.importedNextReadoutGuardReviewRequestPlanSummary || summarySource.imported_next_readout_guard_review_request_plan_summary || importedSessionComparisonSummary?.nextReadoutGuardReviewRequestPlanSummary || importedSessionComparisonSummary?.next_readout_guard_review_request_plan_summary || importedNextReadoutGuardComparisonForNote?.reviewRequestPlanSummary || importedNextReadoutGuardComparisonForNote?.review_request_plan_summary || null;
  const importedNextReadoutGuardComparisonNote = formatNextReadoutGuardComparisonSummary(importedNextReadoutGuardComparisonForNote, "", importedNextReadoutGuardReviewRequestPlanForNote);
  const readoutQualityReviewRequestNote = formatReadoutQualityReviewRequestSummary(summarySource.importedReadoutQualityReviewRequestPlanSummary || summarySource.imported_readout_quality_review_request_plan_summary || importedSessionComparisonSummary, "");
  if (readoutQualityReviewRequestNote) {
    notes.push(`品質確認要求 ${readoutQualityReviewRequestNote}`);
  }
  if (analysisEmptyReadoutLabel) {
    notes.push(`空応答 ${analysisEmptyReadoutLabel}`);
  }
  if (analysisNextStepLabel) {
    notes.push(`次操作 ${analysisNextStepLabel}`);
  }
  if (analysisNextReadoutReasonNote) {
    notes.push(`読取理由 ${analysisNextReadoutReasonNote}`);
  }
  if (analysisNextReadoutGuardNote) {
    notes.push(`計画安全 ${analysisNextReadoutGuardNote}`);
  }
  if (importedNextReadoutGuardComparisonNote) {
    notes.push(`計画差分 ${importedNextReadoutGuardComparisonNote}`);
  }
  if (nextReadoutChangeNote) {
    notes.push(`次読取整合 ${nextReadoutChangeNote}`);
  }
  if (analysisNextReadoutRequestSafetyNote) {
    notes.push(`読取要求 ${analysisNextReadoutRequestSafetyNote}`);
  }
  if (analysisNextReadoutCandidateSafetyNote) {
    notes.push(`候補安全 ${analysisNextReadoutCandidateSafetyNote}`);
  }
  const primaryBlockerComparisonNote = formatPrimaryBlockerChangeSummary(importedSessionComparisonSummary?.primaryBlockerChangeSummary || importedSessionComparisonSummary?.primary_blocker_change_summary, "");
  if (primaryBlockerComparisonNote) {
    notes.push(`主保留比較 ${primaryBlockerComparisonNote}`);
  }
  const changedIdDisplaySummary = importedSessionComparisonSummary?.changedIdDisplaySummary || importedSessionComparisonSummary?.changed_id_display_summary || null;
  const changedIdDisplayNote = formatChangedIdDisplaySummary(changedIdDisplaySummary, "");
  if (changedIdDisplayNote) {
    notes.push(`読取差分 ${changedIdDisplayNote}`);
  }
  const vehicleApplicabilityChangedRowNote = formatVehicleApplicabilityChangedRowSummary(summarySource.importedVehicleApplicabilityChangedRowSummary || summarySource.imported_vehicle_applicability_changed_row_summary || changedIdDisplaySummary?.vehicleApplicabilityChangedRowSummary || changedIdDisplaySummary?.vehicle_applicability_changed_row_summary || importedSessionComparisonSummary?.vehicleApplicabilityChangedRowSummary || importedSessionComparisonSummary?.vehicle_applicability_changed_row_summary, "");
  if (vehicleApplicabilityChangedRowNote) {
    notes.push(`適合差分 ${vehicleApplicabilityChangedRowNote}`);
  }
  const changedIdReviewTargetActionNote = formatChangedIdReviewTargetActionSummary(changedIdDisplaySummary, "");
  if (changedIdReviewTargetActionNote) {
    notes.push(`差分確認 ${changedIdReviewTargetActionNote}`);
  }
  const summaryBlockingWarningIds = readCoreSessionAliasArray(summaryCoreSessionStatus, "blockingWarningIds", "blocking_warning_ids");
  if (summaryBlockingWarningIds.length > 0) {
    notes.push(`保留要因 ${summaryBlockingWarningIds.slice(0, 2).map((item) => formatObdBridgeWarningLabel(item)).join(" / ")}`);
  }
  if (summaryStartedAt) {
    notes.push(`開始 ${formatDateTime(summaryStartedAt)}`);
  }
  if (summaryEndedAt) {
    notes.push(`終了 ${formatDateTime(summaryEndedAt)}`);
  }
  const summaryConnectionDisplayStatus = summaryConnectionStatus?.displayStatus || summaryConnectionStatus?.display_status || null;
  if (summaryConnectionDisplayStatus) {
    notes.push(`状態 ${summaryConnectionDisplayStatus}`);
  }
  if (mergedSession?.adapterIdentity?.adapterFamily || mergedSession?.adapterIdentity?.adapterName) {
    notes.push(`Adapter ${mergedSession.adapterIdentity.adapterFamily || mergedSession.adapterIdentity.adapterName}`);
  } else if (summaryAdapterIdentity?.adapterFamily || summaryAdapterIdentity?.adapterName) {
    notes.push(`Adapter ${summaryAdapterIdentity.adapterFamily || summaryAdapterIdentity.adapterName}`);
  }
  if (Array.isArray(mergedSession?.vciDevices) && mergedSession.vciDevices.length > 0) {
    notes.push(`VCI ${mergedSession.vciDevices.length}件`);
  } else if (Array.isArray(summaryVciDevices) && summaryVciDevices.length > 0) {
    notes.push(`VCI ${summaryVciDevices.length}件`);
  }
  if (mergedSession?.sourceLength > 0) {
    notes.push(`入力長 ${mergedSession.sourceLength}文字`);
  }
  if (mergedSession?.hadSensitiveIdentifier === true) {
    notes.push("識別情報候補はマスク済み");
  }
  const summaryReadinessSnapshot = summarySource.readinessSnapshot || summarySource.readiness_snapshot || null;
  const summaryMonitorValueSummary = summarySource.monitorValueSummary || summarySource.monitor_value_summary || null;
  const summarySupportedPidMatrix = summarySource.supportedPidMatrix || summarySource.supported_pid_matrix || null;
  const summaryReadoutCoverage = summarySource.readoutCoverage || summarySource.readout_coverage || null;
  const summaryEcuInfoSnapshot = summarySource.ecuInfoSnapshot || summarySource.ecu_info_snapshot || null;
  const summaryEcuResponseSummary = summarySource.ecuResponseSummary || summarySource.ecu_response_summary || null;
  const summaryOnboardMonitorSnapshot = summarySource.onboardMonitorSnapshot || summarySource.onboard_monitor_snapshot || null;
  const summaryFreezeFrameSnapshot = summarySource.freezeFrameSnapshot || summarySource.freeze_frame_snapshot || null;
  const summaryFreezeFrameTriggerEntries = getObdFreezeFrameTriggerEntries(summaryFreezeFrameSnapshot);
  const readinessNoteSummary = formatObdBridgeReadinessSummary(summaryReadinessSnapshot);
  if (readinessNoteSummary !== NO_DATA) {
    notes.push(`レディネス${readinessNoteSummary}`);
  }
  if (summaryMonitorValueSummary?.totalCount > 0) {
    notes.push(`ライブデータ${summaryMonitorValueSummary.totalCount}項目`);
  }
  if (summarySupportedPidMatrix?.supportedCount > 0) {
    notes.push(`対応PID${summarySupportedPidMatrix.supportedCount}件`);
  }
  const coverage = getReadoutCoverageDisplay(summaryReadoutCoverage);
  if (coverage?.totalCategories) {
    notes.push(`取得率${coverage.capturedPercent || 0}% (${coverage.capturedCategories || 0}/${coverage.totalCategories})`);
    notes.push(`応答率${coverage.progressPercent}% (${coverage.availableCategories}/${coverage.totalCategories})`);
    if ((coverage.missingCategories || 0) > 0) {
      const missingLabels = coverage.missingLabels?.slice(0, 2).join(" / ");
      notes.push(`未取得${coverage.missingCategories}件${missingLabels ? ` (${missingLabels})` : ""}`);
    }
    if ((coverage.emptyCategories || 0) > 0) {
      const emptyLabels = coverage.emptyLabels?.slice(0, 2).join(" / ");
      notes.push(`空応答${coverage.emptyCategories}件${emptyLabels ? ` (${emptyLabels})` : ""}`);
    }
  }
  if (summaryEcuInfoSnapshot?.supportInfoTypesSummary?.count > 0) {
    const labels = summaryEcuInfoSnapshot.supportInfoTypesSummary.labels?.slice(0, 3).join(" / ");
    notes.push(`Mode09対応${summaryEcuInfoSnapshot.supportInfoTypesSummary.count}件${labels ? ` (${labels})` : ""}`);
  }
  if (summaryEcuInfoSnapshot?.supportInfoTypesCaptured === false) {
    notes.push("Mode09対応情報タイプ00未取得");
  }
  if (summaryEcuInfoSnapshot?.keyItemSummary?.missingCount > 0) {
    const missingLabels = summaryEcuInfoSnapshot.keyItemSummary.missingLabels?.slice(0, 3).join(" / ");
    notes.push(`Mode09未取得${summaryEcuInfoSnapshot.keyItemSummary.missingCount}件${missingLabels ? ` (${missingLabels})` : ""}`);
  }
  if (summaryEcuResponseSummary?.ecus?.length > 0) {
    notes.push(`ECU応答${summaryEcuResponseSummary.ecus.length}件`);
  }
  if (summaryEcuInfoSnapshot?.itemCount > 0) {
    notes.push(`ECU情報${summaryEcuInfoSnapshot.itemCount}項目`);
  }
  if (summaryOnboardMonitorSnapshot?.testCount > 0) {
    notes.push(`Mode06 ${summaryOnboardMonitorSnapshot.testCount}件`);
  }
  if (summaryFreezeFrameSnapshot?.monitorValues?.length > 0) {
    notes.push(`FF ${summaryFreezeFrameSnapshot.monitorValues.length}項目`);
  }
  if (summaryEcuInfoSnapshot?.keyItemSummary?.totalCount > 0) notes.push(`主要ECU情報${formatObdBridgeEcuKeySummary(summaryEcuInfoSnapshot.keyItemSummary)}`);
  if (summaryFreezeFrameTriggerEntries.length) {
    notes.push(`FF起点${summaryFreezeFrameTriggerEntries.slice(0, 3).map(formatObdFreezeFrameTriggerEntry).join(" / ")}`);
  } else if (summaryFreezeFrameSnapshot?.triggerDtc) {
    notes.push(`FF起点${summaryFreezeFrameSnapshot.triggerDtc}`);
  }
  if (summaryFreezeFrameSnapshot?.monitorValueSummary?.totalCount > 0) notes.push(`FF要約${formatObdBridgeMonitorSummary(summaryFreezeFrameSnapshot.monitorValueSummary)}`);
  const warningLabels = getNonBlockingWarningLabels(summarySource, 2);
  if (warningLabels.length) {
    notes.push(`注意${warningLabels.length}件${warningLabels.length ? ` (${warningLabels.join(" / ")})` : ""}`);
  }
  const sourcePrefix = bridgeImport
    ? hasScannerText
      ? "貼り付け結果とローカルブリッジ読取を統合し、"
      : "ローカルブリッジ読取結果を反映し、"
    : summarySourceType === "native_connector"
      ? "iPhone native read-only connector archive を検証して取り込み、"
    : "";
  const coreReadinessHeadline = buildCoreReadinessHeadline(summaryCoreSessionStatus);
  const detailNote = notes.length ? ` ${notes.join(" / ")}。` : "";

  if (!mergedCodes.length) {
    obdImportStatus.textContent = summarySource.hadSensitiveIdentifier
      ? `${coreReadinessHeadline}識別情報候補をマスクしましたが、標準形式のDTCは検出できませんでした。${detailNote}`
      : bridgeImport
        ? `${coreReadinessHeadline}${hasScannerText ? "ローカルブリッジ読取と統合しましたが" : "ローカルブリッジ読取結果では"}、標準形式のDTCは検出できませんでした。${detailNote}`
        : `${coreReadinessHeadline}標準形式のDTCは検出できませんでした。スキャンツールの表示形式を確認してください。${importedReadoutQualitySummary ? ` 受信品質 ${formatReadoutQualitySummary(importedReadoutQualitySummary, NO_DATA)}。` : ""}`;
  } else {
    obdImportStatus.textContent = `${coreReadinessHeadline}${sourcePrefix}${mergedCodes.length}件のDTCを検出しました。登録済みデータを日本語で表示します。${detailNote}`;
    const displayedDtcs = mergedDtcs.length
      ? [...new Map(mergedDtcs.filter((item) => item?.code).map((item) => [buildObdDtcDisplayKey(item), item])).values()]
      : mergedCodes;
    displayedDtcs.forEach((item) => {
      obdDetectedCodes.appendChild(createObdDtcCard(item, displayedDtcs, summarySource?.vehicleProfile || summarySource?.vehicle_profile || null));
    });
  }

  renderObdMonitorValues(
    mergedMonitorValues,
    summarySource?.livePidSnapshot?.monitorInsights || summarySource?.monitorInsights || analysis.monitorInsights
  );
  if (bridgeImport && mergedMonitorValues.length) {
    const bridgeValueCount = mergedMonitorValues.filter((item) => item.source === "local_bridge").length;
    const scannerValueCount = mergedMonitorValues.filter((item) => item.source === "scanner_text").length;
    const summary = [summarySourceType === "local_bridge"
      ? `ローカルブリッジ読取で${mergedMonitorValues.length}項目を表示しています。`
      : `統合入力で${mergedMonitorValues.length}項目を表示しています。`];
    if (bridgeValueCount > 0) summary.push(`ブリッジ${bridgeValueCount}項目`);
    if (scannerValueCount > 0) summary.push(`貼り付け${scannerValueCount}項目`);
    if (analysisVehicleLabel) {
      summary.push(`車両 ${analysisVehicleLabel}`);
    }
    if (summaryStartedAt) summary.push(`開始 ${formatDateTime(summaryStartedAt)}`);
    if (summaryEndedAt) summary.push(`終了 ${formatDateTime(summaryEndedAt)}`);
    if (Array.isArray(mergedSession?.vciDevices) && mergedSession.vciDevices.length > 0) summary.push(`VCI ${mergedSession.vciDevices.length}件`);
    else if (Array.isArray(summaryVciDevices) && summaryVciDevices.length > 0) summary.push(`VCI ${summaryVciDevices.length}件`);
    if (mergedSession?.adapterIdentity?.adapterFamily || mergedSession?.adapterIdentity?.adapterName) {
      summary.push(`Adapter ${mergedSession.adapterIdentity.adapterFamily || mergedSession.adapterIdentity.adapterName}`);
    } else if (summaryAdapterIdentity?.adapterFamily || summaryAdapterIdentity?.adapterName) {
      summary.push(`Adapter ${summaryAdapterIdentity.adapterFamily || summaryAdapterIdentity.adapterName}`);
    }
    appendObdAnalysisReadoutSummary(summary, summarySource);
    obdMonitorStatus.textContent = `${coreReadinessHeadline}${summary.join(" / ")}。`;
  } else if (bridgeImport && !mergedMonitorValues.length) {
    const summary = [summarySourceType === "local_bridge"
      ? "ローカルブリッジ読取の計測値は0項目です。"
      : "計測値は0項目です。"];
    if (analysisVehicleLabel) {
      summary.push(`車両 ${analysisVehicleLabel}`);
    }
    if (summaryStartedAt) summary.push(`開始 ${formatDateTime(summaryStartedAt)}`);
    if (summaryEndedAt) summary.push(`終了 ${formatDateTime(summaryEndedAt)}`);
    if (Array.isArray(mergedSession?.vciDevices) && mergedSession.vciDevices.length > 0) summary.push(`VCI ${mergedSession.vciDevices.length}件`);
    else if (Array.isArray(summaryVciDevices) && summaryVciDevices.length > 0) summary.push(`VCI ${summaryVciDevices.length}件`);
    if (mergedSession?.adapterIdentity?.adapterFamily || mergedSession?.adapterIdentity?.adapterName) {
      summary.push(`Adapter ${mergedSession.adapterIdentity.adapterFamily || mergedSession.adapterIdentity.adapterName}`);
    } else if (summaryAdapterIdentity?.adapterFamily || summaryAdapterIdentity?.adapterName) {
      summary.push(`Adapter ${summaryAdapterIdentity.adapterFamily || summaryAdapterIdentity.adapterName}`);
    }
    appendObdAnalysisReadoutSummary(summary, summarySource, { includeReadinessCount: true });
    obdMonitorStatus.textContent = `${coreReadinessHeadline}${summary.join(" / ")}。`;
  }
  if (bridgeImport && obdDevSession.lastSession) {
    renderObdWorkflowGuide();
    renderObdDeveloperSessionSummary(obdDevSession.lastSession);
  } else if (obdDevSession.lastSession) {
    renderObdDeveloperSessionSummary(obdDevSession.lastSession);
  }
  renderObdSessionExportControls();
}

function buildObdDtcDisplayKey(item = null) {
  const dtc = item && typeof item === "object" ? item : {};
  const code = String(dtc.code || "").trim().toUpperCase();
  const subcode = String(dtc.subcode || dtc.sub_code || "").trim().toUpperCase();
  const oemDetailCode = String(dtc.oemDetailCode || dtc.oem_detail_code || dtc.infCode || dtc.inf_code || "").trim();
  const ecu = String(dtc.ecu || dtc.ecu_id || dtc.ecuId || dtc.address || dtc.module || dtc.module_id || dtc.moduleId || "").trim().toUpperCase();
  const status = String(dtc.status || dtc.kind || dtc.dtc_status || dtc.dtcStatus || "").trim().toLowerCase();
  const reportedStatus = String(dtc.reportedStatus || dtc.reported_status || "").replace(/\s+/g, " ").trim().toLowerCase();
  return `${code}:${subcode}:${oemDetailCode}:${ecu}:${status}:${reportedStatus}`;
}

function createObdDtcCard(codeOrDtc, observedDtcs = null, vehicleProfileOverride = null) {
  const dtc = codeOrDtc && typeof codeOrDtc === "object" ? codeOrDtc : { code: codeOrDtc };
  const code = dtc.code;
  const status = String(dtc.status || dtc.kind || dtc.dtc_status || dtc.dtcStatus || "unknown").trim().toLowerCase() || "unknown";
  const hasKnownStatus = ["stored", "pending", "permanent"].includes(status);
  const statusLabel = hasKnownStatus ? `${formatObdBridgeDtcStatusLabel(status)}DTC` : "DTC状態不明";
  const subcode = dtc.subcode || dtc.sub_code || null;
  const oemDetailCode = dtc.oemDetailCode || dtc.oem_detail_code || dtc.infCode || dtc.inf_code || null;
  const statusByte = dtc.statusByte || dtc.status_byte || dtc.dtcStatusByte || dtc.dtc_status_byte || null;
  const severity = dtc.severity || dtc.dtc_severity || dtc.dtcSeverity || dtc.severityByte || dtc.severity_byte || null;
  const functionalUnitRaw = dtc.dtcFunctionalUnitRaw || dtc.dtc_functional_unit_raw || dtc.functionalUnitRaw || dtc.functional_unit_raw || null;
  const occurrenceCount = dtc.occurrenceCount ?? dtc.occurrence_count ?? dtc.occurrenceCounter ?? dtc.occurrence_counter ?? null;
  const manufacturerSpecific = dtc.manufacturerSpecific === true || dtc.manufacturer_specific === true || dtc.codeFormat === "manufacturer_specific" || dtc.code_format === "manufacturer_specific";
  const reportedDescription = dtc.reportedDescription || dtc.reported_description || null;
  const reportedStatus = dtc.reportedStatus || dtc.reported_status || null;
  const ecu = dtc.ecu || dtc.ecu_id || dtc.ecuId || dtc.address || dtc.module || dtc.module_id || dtc.moduleId || null;
  const ecuName = dtc.ecuName || dtc.ecu_name || dtc.name || dtc.label || dtc.displayName || dtc.display_name || null;
  const ecuDisplay = ecuName && ecu ? `${ecuName} / ${ecu}` : ecuName || ecu || null;
  const displayCode = `${subcode ? `${code}:${subcode}` : oemDetailCode ? `${code}-${oemDetailCode}` : code}${ecuDisplay ? ` [${ecuDisplay}]` : ""}`;
  const hasSessionVehicleProfile = vehicleProfileOverride && typeof vehicleProfileOverride === "object";
  const vehicleProfile = hasSessionVehicleProfile
    ? vehicleProfileOverride
    : buildSelectedObdVehicleProfile();
  const dtcVehicleProfile = withReportedDtcEcu(vehicleProfile, dtc);
  const dtcDefinitions = findDtcDefinitionCandidates(code, subcode);
  const definitionApplicability = evaluateDtcDefinitionCandidatesApplicability(dtcDefinitions, dtcVehicleProfile);
  const definitionScopeSummary = buildDtcDefinitionScopeSummary(dtcDefinitions);
  const sourceSpecificDtcContext = buildSourceSpecificDtcContext(dtcDefinitions, dtcVehicleProfile);
  const registered = selectApplicableDtcDefinition(dtcDefinitions, dtcVehicleProfile);
  const modern = getModernGenericMatches(code)[0];
  const hasImportedDefinitionEvidence = registered?.imported_definition_only === true && Boolean(registered?.source);
  const system = registered?.faultSystem || registered?.system || modern?.system;
  const firstCheck = registered?.firstChecks?.[0] || registered?.check_order?.[0] || modern?.check_order?.[0];
  const wrapper = document.createElement("article");
  wrapper.className = "obd-dtc-card";
  wrapper.dataset.dtcSearch = [displayCode, code, subcode, oemDetailCode, ecuDisplay, status, statusLabel, reportedStatus]
    .filter((value) => typeof value === "string" || typeof value === "number").join(" ");

  const head = document.createElement("div");
  head.className = "obd-dtc-head";

  const codeText = document.createElement("strong");
  codeText.textContent = displayCode;
  head.appendChild(codeText);

  const badge = document.createElement("span");
  badge.className = "obd-dtc-status";
  badge.textContent = registered || modern ? "登録データあり" : "個別定義未登録";
  head.appendChild(badge);
  if (manufacturerSpecific) badge.textContent = "メーカー固有・報告値";
  wrapper.appendChild(head);

  const readoutState = document.createElement("p");
  readoutState.className = "obd-dtc-readout-state";
  readoutState.textContent = statusLabel;
  if (!hasKnownStatus && status !== "unknown") readoutState.textContent += ` / 分類値: ${status}`;
  wrapper.appendChild(readoutState);

  const description = document.createElement("p");
  description.className = "obd-dtc-description";
  description.textContent = hasImportedDefinitionEvidence
    ? `出典確認済みの報告定義: ${registered.title}。コードだけで故障部品は確定しません。`
    : system
    ? `${system}に関するDTCです。コードだけで故障部品は確定しません。`
    : describeUnregisteredDtc(code);
  wrapper.appendChild(description);

  if (reportedDescription) description.textContent = `診断機報告: ${reportedDescription}`;

  if (oemDetailCode) {
    const detailEvidence = document.createElement("p");
    detailEvidence.className = "obd-dtc-check";
    detailEvidence.textContent = `メーカー詳細コード: ${oemDetailCode}（読取証跡のみ。定義・適合は未照合）`;
    wrapper.appendChild(detailEvidence);
  }

  if (hasImportedDefinitionEvidence && registered.applicability_note) {
    const applicability = document.createElement("p");
    applicability.className = "obd-dtc-check";
    applicability.textContent = `適用範囲: ${registered.applicability_note}`;
    wrapper.appendChild(applicability);
  }
  const concurrentRequirement = evaluateDtcConcurrentRequirements(registered, observedDtcs);
  if (concurrentRequirement.required.length) {
    const concurrent = document.createElement("p");
    concurrent.className = "obd-dtc-check";
    concurrent.textContent = concurrentRequirement.missing.length
      ? `同時DTC条件: ${concurrentRequirement.missing.join(" / ")} の読取・保存条件を確認してください。`
      : `同時DTC条件: ${concurrentRequirement.required.join(" / ")} を同一読取結果で確認しました。`;
    wrapper.appendChild(concurrent);
  }

  if (definitionApplicability.status === "matched") {
    const applicabilityMatched = document.createElement("p");
    applicabilityMatched.className = "obd-dtc-check";
    applicabilityMatched.textContent = "適用範囲: 選択車両と一致しています。ECU・サブコード・整備書の適合確認は引き続き必要です。";
    wrapper.appendChild(applicabilityMatched);
    if (hasSessionVehicleProfile) {
      const sessionProfileSource = document.createElement("p");
      sessionProfileSource.className = "obd-dtc-check";
      sessionProfileSource.textContent = "適用判定は、読取セッションに保存された車両情報を使用しています。";
      wrapper.appendChild(sessionProfileSource);
    }
  } else if (definitionApplicability.status === "mismatch") {
    const applicabilityMismatch = document.createElement("p");
    applicabilityMismatch.className = "obd-dtc-check";
    applicabilityMismatch.textContent = `適用範囲: ${describeDtcDefinitionApplicabilityReason(definitionApplicability.reason, "選択車両はこの出典限定定義の対象外です。")}定義を診断根拠に使わず、該当車種の整備書を確認してください。`;
    wrapper.appendChild(applicabilityMismatch);
    if (hasSessionVehicleProfile) {
      const sessionProfileSource = document.createElement("p");
      sessionProfileSource.className = "obd-dtc-check";
      sessionProfileSource.textContent = "適用判定は、読取セッションに保存された車両情報を使用しています。";
      wrapper.appendChild(sessionProfileSource);
    }
  } else if (definitionApplicability.status === "unverified") {
    const applicabilityUnverified = document.createElement("p");
    applicabilityUnverified.className = "obd-dtc-check";
    const unverifiedReason = definitionApplicability.reason === "additional_scope_confirmation_required"
      ? "車種・年式は候補と一致しますが、VIN・トリム等の追加条件が未確認です。"
      : "車種・年式が揃っていないため未確認です。";
    applicabilityUnverified.textContent = `適用範囲: ${describeDtcDefinitionApplicabilityReason(definitionApplicability.reason, unverifiedReason)}適合が確認できるまで診断手順を流用しないでください。${definitionScopeSummary ? ` 候補: ${definitionScopeSummary}` : ""}`;
    wrapper.appendChild(applicabilityUnverified);
  }

  if (sourceSpecificDtcContext.hasDefinitions && sourceSpecificDtcContext.applicability.status === "unverified") {
    const sourceSpecificApplicability = document.createElement("p");
    sourceSpecificApplicability.className = "obd-dtc-check";
    const sourceSpecificUnverifiedReason = sourceSpecificDtcContext.applicability.reason === "additional_scope_confirmation_required"
      ? "車種・年式は候補と一致しますが、VIN・市場・装備・ECU等の追加条件が未確認です。"
      : "車種・年式は候補と一致しますが、車両情報が未確認です。";
    sourceSpecificApplicability.textContent = `出典限定の補足: ${describeDtcDefinitionApplicabilityReason(sourceSpecificDtcContext.applicability.reason, sourceSpecificUnverifiedReason)}汎用DTCの診断内容を置換せず、適合確認後に出典を参照してください。${sourceSpecificDtcContext.scopeSummary ? ` 候補: ${sourceSpecificDtcContext.scopeSummary}` : ""}`;
    wrapper.appendChild(sourceSpecificApplicability);
  } else if (sourceSpecificDtcContext.hasDefinitions && sourceSpecificDtcContext.applicability.status === "mismatch") {
    const sourceSpecificMismatch = document.createElement("p");
    sourceSpecificMismatch.className = "obd-dtc-check";
    sourceSpecificMismatch.textContent = `出典限定の補足: ${describeDtcDefinitionApplicabilityReason(sourceSpecificDtcContext.applicability.reason, "選択車両はこの公式出典の車種限定候補の対象外です。")}汎用DTCの診断内容を維持し、出典限定の手順は適用しません。${sourceSpecificDtcContext.scopeSummary ? ` 候補: ${sourceSpecificDtcContext.scopeSummary}` : ""}`;
    wrapper.appendChild(sourceSpecificMismatch);
  }

  if (definitionApplicability.status === "mismatch" && definitionApplicability.reason === "production_date_out_of_scope") {
    const productionDate = vehicleProfile?.productionDate || vehicleProfile?.production_date || null;
    const productionDateReason = document.createElement("p");
    productionDateReason.className = "obd-dtc-check";
    productionDateReason.textContent = `適用根拠: 入力生産日${productionDate ? ` ${productionDate}` : ""}は候補範囲外です。${definitionScopeSummary ? ` 候補: ${definitionScopeSummary}` : ""}`;
    wrapper.appendChild(productionDateReason);
  }

  if (hasImportedDefinitionEvidence) {
    const sourceMeta = [registered.source, registered.source_date].filter(Boolean).join(" / ");
    if (sourceMeta) {
      const source = document.createElement("p");
      source.className = "obd-dtc-check";
      source.textContent = `出典: ${sourceMeta}`;
      wrapper.appendChild(source);
    }
    if (registered.confidence) {
      const confidence = document.createElement("p");
      confidence.className = "obd-dtc-check";
      confidence.textContent = `確信度: ${registered.confidence}`;
      wrapper.appendChild(confidence);
    }
    if (registered.service_manual_required === true) {
      const manual = document.createElement("p");
      manual.className = "obd-dtc-check";
      manual.textContent = "整備書確認必須: 車種・ECU・報告DTCが適合した場合だけ診断手順を参照してください。";
      wrapper.appendChild(manual);
    }
  }

  if (manufacturerSpecific) {
    const note = document.createElement("p");
    note.className = "obd-dtc-check";
    note.textContent = "メーカー固有コードのため、車種・ECU・整備書で定義を確認してください。";
    wrapper.appendChild(note);
  }

  if (reportedStatus && String(reportedStatus).trim().toLowerCase() !== status) {
    const reported = document.createElement("p");
    reported.className = "obd-dtc-check";
    reported.textContent = `診断機報告ステータス: ${reportedStatus}`;
    wrapper.appendChild(reported);
  }

  if (statusByte) {
    const reportedStatusByte = document.createElement("p");
    reportedStatusByte.className = "obd-dtc-check";
    reportedStatusByte.textContent = `DTC status byte: 0x${statusByte} (reported)`;
    wrapper.appendChild(reportedStatusByte);
  }

  if (severity) {
    const reportedSeverity = document.createElement("p");
    reportedSeverity.className = "obd-dtc-check";
    reportedSeverity.textContent = `DTC severity: ${severity} (reported)`;
    wrapper.appendChild(reportedSeverity);
  }
  if (functionalUnitRaw) {
    const reportedFunctionalUnit = document.createElement("p");
    reportedFunctionalUnit.className = "obd-dtc-check";
    reportedFunctionalUnit.textContent = `DTC functional unit: 0x${functionalUnitRaw} (reported)`;
    wrapper.appendChild(reportedFunctionalUnit);
  }

  if (occurrenceCount !== null) {
    const reportedOccurrenceCount = document.createElement("p");
    reportedOccurrenceCount.className = "obd-dtc-check";
    reportedOccurrenceCount.textContent = `DTC occurrence count: ${occurrenceCount} (reported)`;
    wrapper.appendChild(reportedOccurrenceCount);
  }

  const freezeFrameMatches = Array.isArray(dtc.freezeFrameMatches)
    ? dtc.freezeFrameMatches
    : Array.isArray(dtc.freeze_frame_matches) ? dtc.freeze_frame_matches : [];
  const freezeFrameMatchCount = Number(dtc.freezeFrameMatchCount ?? dtc.freeze_frame_match_count ?? freezeFrameMatches.length);
  if (freezeFrameMatchCount > 0 && freezeFrameMatches.length) {
    const frames = [...new Set(freezeFrameMatches
      .map((item) => item?.frameNumber ?? item?.frame_number ?? null)
      .filter((item) => Number.isInteger(Number(item)))
      .map((item) => `#${Number(item)}`))];
    const freezeFrameReportedStatuses = [...new Set(freezeFrameMatches
      .map((item) => item?.reportedStatus ?? item?.reported_status ?? null)
      .filter(Boolean))];
    const matchedFreezeFrame = document.createElement("p");
    matchedFreezeFrame.className = "obd-dtc-check";
    matchedFreezeFrame.textContent = `フリーズフレーム: DTC / サブコード / ECU 一致確認済み${frames.length ? ` (${frames.join(", ")})` : ""}${freezeFrameReportedStatuses.length ? ` / 診断機報告状態 ${freezeFrameReportedStatuses.join(", ")}` : ""}`;
    wrapper.appendChild(matchedFreezeFrame);
    const verifiedFreezeFrameValueIds = [...new Set(freezeFrameMatches.flatMap((item) => item?.freezeFrameValueIds || item?.freeze_frame_value_ids || []))];
    const verifiedFreezeFrameValueCount = Math.max(0, ...freezeFrameMatches.map((item) => Number(item?.freezeFrameValueCount ?? item?.freeze_frame_value_count ?? 0) || 0));
    if (verifiedFreezeFrameValueCount > 0) {
      const freezeFrameValues = document.createElement("p");
      freezeFrameValues.className = "obd-dtc-check";
      freezeFrameValues.textContent = `FF読取値: ${verifiedFreezeFrameValueCount}項目${verifiedFreezeFrameValueIds.length ? ` (${verifiedFreezeFrameValueIds.slice(0, 4).join(" / ")}${verifiedFreezeFrameValueIds.length > 4 ? " ほか" : ""})` : ""}`;
      wrapper.appendChild(freezeFrameValues);
    }
    const verifiedFreezeFrameValueRefs = [...new Map(freezeFrameMatches
      .flatMap((item) => item?.freezeFrameValueRefs || item?.freeze_frame_value_refs || [])
      .map((item) => [`${item?.id || ""}::${String(item?.value ?? "")}::${item?.unit || ""}`, item])).values()];
    if (verifiedFreezeFrameValueRefs.length) {
      const freezeFrameReadings = document.createElement("p");
      freezeFrameReadings.className = "obd-dtc-check";
      freezeFrameReadings.textContent = `FF実測: ${verifiedFreezeFrameValueRefs.slice(0, 6).map((item) => `${item.label || item.id} ${item.value ?? NO_DATA}${item.unit ? ` ${item.unit}` : ""}${item.decoded === false ? " (未換算)" : ""}`).join(" / ")}${verifiedFreezeFrameValueRefs.length > 6 ? " / ほか" : ""}`;
      wrapper.appendChild(freezeFrameReadings);
    }
    const udsSnapshotEvidence = [...new Set(freezeFrameMatches
      .map((item) => {
        const recordType = item?.snapshotRecordType || item?.snapshot_record_type || null;
        const statusByte = item?.statusByte || item?.status_byte || null;
        return recordType || statusByte ? `${recordType || "record"}${statusByte ? ` / status byte 0x${statusByte}` : ""}` : null;
      })
      .filter(Boolean))];
    if (udsSnapshotEvidence.length) {
      const udsSnapshot = document.createElement("p");
      udsSnapshot.className = "obd-dtc-check";
      udsSnapshot.textContent = `UDSスナップショット読取値: ${udsSnapshotEvidence.join(" / ")} (reported)`;
      wrapper.appendChild(udsSnapshot);
    }
  } else if (dtc.freezeFrameAvailable === true || dtc.freeze_frame_available === true) {
    const reportedFreezeFrame = document.createElement("p");
    reportedFreezeFrame.className = "obd-dtc-check";
    reportedFreezeFrame.textContent = "フリーズフレーム: 読取報告あり (DTC/ECU照合は未確認)";
    wrapper.appendChild(reportedFreezeFrame);
  }

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
  button.dataset.dtcSubcode = subcode || "";
  button._obdVehicleProfile = vehicleProfile;
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

  const monitorSummary = summarizeObdMonitorValues(values);
  const summaryLabel = formatObdBridgeMonitorSummary(monitorSummary);
  obdMonitorStatus.textContent = `${summaryLabel !== NO_DATA ? summaryLabel : `${values.length}項目`}を読取りました。スナップショット表示のみで、原文は保存していません。`;
  values.forEach((item) => {
    const card = document.createElement("article");
    card.className = "obd-monitor-card";
    if (item.outOfRange === true || item.status === "fail") card.classList.add("is-caution");
    if (item.undecodedRaw === true) card.classList.add("is-raw");

    const sourceEcu = item.sourceEcu || item.source_ecu || null;
    card.dataset.monitorSearch = [item.label, item.id, item.pid, sourceEcu, item.category, item.unit]
      .filter((value) => typeof value === "string" || typeof value === "number").join(" ");
    const category = document.createElement("span");
    category.className = "obd-monitor-category";
    category.textContent = [item.category, sourceEcu ? `ECU ${sourceEcu}` : null].filter(Boolean).join(" / ") || "ライブデータ";

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

function getObdMonitorSampleText() {
  return [
    "Toyota Techstream",
    "J2534",
    "Current DTCs",
    "P0171 P0300",
    "Pending Codes",
    "P0420",
    "Permanent DTC",
    "P0440",
    "Freeze Frame DTC: P0171",
    "Engine RPM: 1500 rpm",
    "Coolant Temp: 76 C",
    "I/M Readiness",
    "MIL Status: OFF",
    "Misfire: Complete",
    "Fuel System: Not Ready",
    "ECU Information",
    "ECU Name: Engine Control Module",
    "CALID: 89661-52A10",
    "CVN: 1A2B3C4D",
    "Supported PIDs: 01, 05, 0C, 0D",
    "Mode 06",
    "TID: 01 CID: 02 Value: 3 Min: 1 Max: 5",
    "ECU Responses",
    "Engine Control Module: Responded",
    "ABS/VSC: No Response",
    "Live Data",
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
}

function loadObdMonitorSample() {
  const dialog = document.getElementById("obdSampleDialog");
  const body = document.getElementById("obdSampleBody");
  const status = document.getElementById("obdSampleStatus");
  if (!dialog || !body || !status || typeof dialog.showModal !== "function") return;
  body.replaceChildren();
  status.textContent = "架空データ・実車未読取";
  if (!dialog.open) dialog.showModal();
  try {
    // Keep fixture parsing and rendering outside the active diagnostic session.
    const sample = window.ObdReadOnly.analyzeScannerText(getObdMonitorSampleText());
    const fragment = document.createDocumentFragment();
    const addSection = (title, lines) => {
      const section = document.createElement("section");
      section.className = "obd-sample-section";
      const heading = document.createElement("h3");
      heading.textContent = title;
      const list = document.createElement("ul");
      for (const line of lines.length ? lines : ["入力例にデータなし"]) {
        const item = document.createElement("li");
        item.textContent = line;
        list.appendChild(item);
      }
      section.append(heading, list);
      fragment.appendChild(section);
    };
    const valueLine = (item) => `${item.label}: ${item.value ?? "未取得"}${item.unit ? ` ${item.unit}` : ""}`;
    const statuses = { stored: "保存", pending: "保留", permanent: "永久" };
    addSection("DTC", (sample.dtcSnapshot?.dtcs || []).map((item) => `${item.code} / ${statuses[item.status] || item.status || "状態未取得"}`));
    addSection("ライブデータ", (sample.monitorValues || []).map(valueLine));
    addSection("フリーズフレーム", (sample.freezeFrameSnapshot?.monitorValues || []).map(valueLine));
    addSection("レディネス", (sample.readinessSnapshot?.monitors || []).map((item) =>
      `${item.label} (${item.id}): ${item.complete === true ? "完了" : item.complete === false ? "未完了" : "未取得"}`));
    body.replaceChildren(fragment);
  } catch (_error) {
    body.replaceChildren();
    status.textContent = "入力例を表示できませんでした。現在の読取結果は変更していません。";
  }
}

function hasActiveObdReadoutForExitWarning() {
  const session = obdDevSession.lastSession;
  return Boolean(session && typeof session === "object" && !Array.isArray(session) && Object.keys(session).length
    && session.accepted !== false && session.ok !== false && session.blocked !== true
    && !session.previewMode && !session.preview_mode && session.source !== "interface_preview" && session.source_type !== "interface_preview");
}

function handleObdReadoutBeforeUnload(event) {
  if (!hasActiveObdReadoutForExitWarning()) return;
  event.preventDefault();
  event.returnValue = true;
}

function syncObdReadoutExitGuard() {
  const needed = hasActiveObdReadoutForExitWarning();
  if (needed === obdReadoutExitGuardAttached) return;
  if (needed) window.addEventListener("beforeunload", handleObdReadoutBeforeUnload);
  else window.removeEventListener("beforeunload", handleObdReadoutBeforeUnload);
  obdReadoutExitGuardAttached = needed;
}

function getObdSessionExportBlockReason() {
  if (!obdDevSession.lastSession) return "保存する読取結果がありません。";
  const session = obdDevSession.lastSession;
  if (typeof session !== "object" || Array.isArray(session) || !Object.keys(session).length
    || session.accepted === false || session.ok === false || session.blocked === true) return "この読取結果は保存できません。";
  if (obdBridgeOperation || obdScannerImportOperation || obdSerialConnectPending || obdSerialDisconnectOperation
    || obdDevSession.readInProgress || obdDevSession.initializing || obdDevSession.coreScanInProgress
    || ["selecting", "opening", "initializing", "reading", "disconnecting"].includes(obdDevSession.connectionState)) {
    return "読取・取込処理の完了または停止後に保存してください。";
  }
  if (session.previewMode || session.preview_mode || session.source === "interface_preview" || session.source_type === "interface_preview") {
    return "接続前プレビューは読取結果として保存できません。";
  }
  if (typeof window.ObdReadOnly?.buildBridgeSessionExportPayload !== "function") return "JSON保存機能を読み込めていません。";
  return "";
}

function handleObdReadoutSessionReplacement() {
  syncObdReadoutExitGuard();
  setObdSessionExportStatus("");
}

function renderObdReadoutVehicle(session = null) {
  const summary = document.getElementById("obdReadoutVehicle");
  if (!summary) return;
  summary.replaceChildren();
  summary.hidden = !session || typeof session !== "object" || Array.isArray(session);
  if (summary.hidden) return;
  const profile = session.vehicleProfile || session.vehicle_profile || null;
  const applicability = session.vehicleApplicability || session.vehicle_applicability || null;
  const preview = session.previewMode || session.preview_mode || session.source === "interface_preview" || session.source_type === "interface_preview";
  const recorded = (value) => value === null || value === undefined || value === "" ? "未記録" : String(value);
  const fields = [
    [preview ? "プレビューの車両（未読取）" : "読取結果の車両", formatVehicleProfileLabel(profile, "未記録")],
    ["型式", recorded(profile?.modelCode ?? profile?.model_code)],
    ["年式", recorded(profile?.year)],
    ["エンジン型式", recorded(profile?.engineCode ?? profile?.engine_code)],
    ["車種適合", formatVehicleApplicabilitySummary(applicability, "未判定")]
  ];
  for (const [label, value] of fields) {
    const group = document.createElement("div");
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = value;
    group.append(term, detail);
    summary.appendChild(group);
  }
}

function renderObdSessionExportControls() {
  syncObdReadoutExitGuard();
  renderObdReadoutVehicle(obdDevSession.lastSession);
  const reason = getObdSessionExportBlockReason();
  document.querySelectorAll("[data-obd-session-export]").forEach((button) => {
    button.disabled = Boolean(reason);
    button.title = reason || "現在の読取セッションをJSONファイルに保存";
  });
}

function setObdSessionExportStatus(message) {
  document.querySelectorAll("[data-obd-session-export-status]").forEach((status) => { status.textContent = message; });
}

function downloadObdSessionJson() {
  const reason = getObdSessionExportBlockReason();
  if (reason) {
    setObdSessionExportStatus(reason);
    return false;
  }
  let link = null;
  let objectUrl = null;
  try {
    const payload = window.ObdReadOnly.buildBridgeSessionExportPayload(obdDevSession.lastSession);
    if (payload?.schema_version !== "bridge_session_export_v1" || !payload.session || typeof payload.session !== "object") throw new Error("invalid_export");
    const text = JSON.stringify(payload);
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    // Match the existing file-import limit so every download can be opened again.
    const hasSessionJsonPolicy = typeof window.ObdReadOnly.getDiagnosticSessionJsonPolicy === "function";
    const maxBytes = hasSessionJsonPolicy ? (window.ObdReadOnly.diagnosticSessionMaxBytes || 2000000) : 2000000;
    if (blob.size > maxBytes) {
      setObdSessionExportStatus(`読取結果が再取込上限の${maxBytes / 1000000} MBを超えるため、JSON保存を開始しませんでした。元の結果は保持しています。`);
      return false;
    }
    if (hasSessionJsonPolicy && !window.ObdReadOnly.getDiagnosticSessionJsonPolicy(text).accepted) {
      setObdSessionExportStatus("再取込できるセッションJSONとして確認できないため、保存を開始しませんでした。元の結果は保持しています。");
      return false;
    }
    link = document.createElement("a");
    objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = `diagnostic-session-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    setObdSessionExportStatus("読取結果のJSON保存を開始しました。");
    return true;
  } catch (_error) {
    setObdSessionExportStatus("JSON保存を開始できませんでした。読取結果は変更していません。");
    return false;
  } finally {
    link?.remove();
    if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

function downloadManufacturerSampleTemplate() {
  const buildExport = window.ObdReadOnly?.buildManufacturerSampleCollectionExport;
  if (typeof buildExport !== "function") {
    obdImportStatus.textContent = "実機サンプルTSVを準備できませんでした。画面を再読み込みしてください。";
    return;
  }
  let exportBundle;
  try {
    exportBundle = buildExport(obdDevSession.lastSession);
  } catch (error) {
    obdImportStatus.textContent = error?.code === "manufacturer_sample_tsv_invalid_evidence_history"
      ? "補足値を除外した履歴はTSVでは保持できないため、保存を開始しませんでした。読取結果は保持しています。「読取結果をJSON保存」を使用してください。"
      : "実機サンプルTSVを準備できませんでした。読取結果は変更していません。";
    return;
  }
  const blob = new Blob([`\uFEFF${exportBundle.tsv}`], { type: "text/tab-separated-values;charset=utf-8" });
  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = `メーカー実機サンプル_${new Date().toISOString().slice(0, 10)}.tsv`;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  obdImportStatus.textContent = exportBundle.truncated
    ? `DTC ${exportBundle.exportedRowCount}/${exportBundle.sourceDtcCount}件を保存しました。上限500件を超えたため、残りは別セッションで収集してください。`
    : exportBundle.exportedRowCount > 0 && exportBundle.contractCompleteForSampleReview !== true
      ? `読取済みDTC ${exportBundle.exportedRowCount}件を保存しました。証跡不足 ${exportBundle.incompleteRowCount}行 / ${exportBundle.missingRequirementCount}要件は未確認です。`
      : exportBundle.exportedRowCount > 0
        ? `読取済みDTC ${exportBundle.exportedRowCount}件を実機サンプルTSVへ保存しました。この欄から再取込できます。`
    : "空の実機サンプルTSVを保存しました。車両・ECU・要求・応答を1行ずつ記録し、この欄から再取込できます。";
}

function invalidateObdScannerImport() {
  obdScannerImportOperation = null;
  renderObdSessionExportControls();
}

function beginObdScannerImport() {
  const operation = { textAtStart: obdScannerText.value, sessionAtStart: obdDevSession.lastSession };
  obdScannerImportOperation = operation;
  renderObdSessionExportControls();
  return operation;
}

function isCurrentObdScannerImport(operation) {
  if (obdScannerImportOperation !== operation) return false;
  if (obdScannerText.value !== operation.textAtStart || obdDevSession.lastSession !== operation.sessionAtStart) {
    invalidateObdScannerImport();
    return false;
  }
  return true;
}

function confirmObdReadoutReplacement() {
  if (!hasActiveObdReadoutForExitWarning()) return true;
  try {
    if (typeof window.confirm === "function" && window.confirm("現在の読取結果を新しい入力で置き換えますか？\n残す場合はキャンセルして、読取結果をJSON保存してください。") === true) return true;
  } catch (error) {
    obdImportStatus.textContent = "置換確認を表示できませんでした。現在の読取結果を保持しています。";
    return false;
  }
  obdImportStatus.textContent = "読取結果の置換を中止しました。現在の読取結果を保持しています。";
  return false;
}

function validateObdScannerImportTextSize(text) {
  const archiveMaxBytes = typeof window.ObdReadOnly?.getDiagnosticSessionJsonPolicy === "function"
    ? (window.ObdReadOnly.diagnosticSessionMaxBytes || 2000000) : 2000000;
  let maxBytes = archiveMaxBytes;
  try {
    if (text.length <= archiveMaxBytes) {
      const bytes = new Blob([text]).size;
      if (bytes <= archiveMaxBytes) {
        if (typeof window.ObdReadOnly?.getDiagnosticSessionJsonPolicy !== "function") return bytes <= 2000000;
        const policy = window.ObdReadOnly.getDiagnosticSessionJsonPolicy(text);
        if (policy.accepted) return true;
        maxBytes = policy.maxBytes;
        if (bytes <= maxBytes) {
          obdImportStatus.textContent = "診断JSONの形式を確認できないため解析を開始しませんでした。現在の読取結果は変更していません。";
          return false;
        }
      }
    }
  } catch (_error) {
    obdImportStatus.textContent = "入力サイズを確認できないため解析を開始しませんでした。現在の読取結果は変更していません。";
    return false;
  }
  obdImportStatus.textContent = `この形式の入力はUTF-8で${maxBytes / 1000000} MB以下にしてください。入力を切り詰めず、現在の読取結果は変更していません。`;
  return false;
}

function analyzeObdScannerImportManually() {
  invalidateObdScannerImport();
  if (!validateObdScannerImportTextSize(obdScannerText.value)) return;
  if (!obdScannerText.value.trim()) {
    obdImportStatus.textContent = "外部診断機の読取結果を入力してください。";
    return;
  }
  if (!confirmObdReadoutReplacement()) return;
  analyzeObdScannerImport();
}

function applyObdScannerImportText(text) {
  invalidateObdScannerImport();
  if (!validateObdScannerImportTextSize(text)) return;
  if (text.trim() && !confirmObdReadoutReplacement()) return;
  obdScannerText.value = text;
  try {
    analyzeObdScannerImport();
  } catch (error) {
    obdImportStatus.textContent = "診断結果を解析できませんでした。入力形式を確認してください。";
  }
}

async function pasteObdScannerImport() {
  const operation = beginObdScannerImport();
  if (!navigator.clipboard?.readText) {
    invalidateObdScannerImport();
    obdScannerText.focus();
    obdImportStatus.textContent = "このブラウザではクリップボードを読めません。読取結果を長押しして貼り付けてから「診断機データを解析」を押してください。";
    return;
  }
  let text;
  try {
    text = await navigator.clipboard.readText();
  } catch (error) {
    if (!isCurrentObdScannerImport(operation)) return;
    invalidateObdScannerImport();
    obdScannerText.focus();
    obdImportStatus.textContent = "クリップボードを読めませんでした。読取結果を長押しして貼り付けてから「診断機データを解析」を押してください。";
    return;
  }
  if (!isCurrentObdScannerImport(operation)) return;
  invalidateObdScannerImport();
  if (text.length <= 2000000 && !text.trim()) {
    obdImportStatus.textContent = "クリップボードに診断結果がありません。";
    return;
  }
  applyObdScannerImportText(text);
}

function normalizeObdScannerImportFileText(value, file = {}) {
  const text = String(value || "");
  const isHtml = file?.type === "text/html" || /\.html?$/i.test(file?.name || "");
  if (!isHtml || typeof DOMParser !== "function") return text;
  const lineBreakHtml = text
    .replace(/<br\s*\/?\s*>|<\/(?:p|div|li|tr|h[1-6]|section|article|table|ul|ol)\s*>/gi, "\n")
    .replace(/<\/(?:td|th)\s*>/gi, "\t");
  const document = new DOMParser().parseFromString(lineBreakHtml, "text/html");
  document.querySelectorAll("script,style,iframe,object").forEach((node) => node.remove());
  return String(document.body?.textContent || "").replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function importObdScannerFile(event) {
  const input = event.currentTarget;
  const file = input?.files?.[0];
  if (!file) return;
  const operation = beginObdScannerImport();

  const acceptedTypes = new Set(["application/json", "text/csv", "text/tab-separated-values", "text/plain", "text/html"]);
  const hasAcceptedExtension = /\.(json|csv|tsv|txt|html?|htm)$/i.test(file.name || "");
  if (!hasAcceptedExtension && !acceptedTypes.has(file.type)) {
    invalidateObdScannerImport();
    obdImportStatus.textContent = "JSON、CSV、TSV、テキスト、またはHTML形式の診断結果を選択してください。";
    input.value = "";
    return;
  }
  const isSessionJsonCandidate = file.type === "application/json" || /\.json$/i.test(file.name || "");
  const fileMaxBytes = isSessionJsonCandidate ? (window.ObdReadOnly?.diagnosticSessionMaxBytes || 2000000) : 2000000;
  if (file.size > fileMaxBytes) {
    invalidateObdScannerImport();
    obdImportStatus.textContent = `診断結果ファイルは${fileMaxBytes / 1000000} MB以下にしてください。`;
    input.value = "";
    return;
  }

  const onFailure = () => {
    if (!isCurrentObdScannerImport(operation)) return;
    invalidateObdScannerImport();
    obdImportStatus.textContent = "診断結果ファイルを読めませんでした。";
    input.value = "";
  };
  try {
    const reader = new FileReader();
    reader.onload = () => {
      if (!isCurrentObdScannerImport(operation)) return;
      const rawText = typeof reader.result === "string" ? reader.result : "";
      const isJson = file.type === "application/json" || /\.json$/i.test(file.name || "");
      if (isJson && rawText.trim()) {
        try {
          JSON.parse(rawText.trim());
        } catch (error) {
          invalidateObdScannerImport();
          input.value = "";
          obdImportStatus.textContent = "JSONの構文を読み取れません。ファイルが途中で切れていないか確認してください。現在の読取結果は変更していません。";
          return;
        }
      }
      let text;
      try {
        text = normalizeObdScannerImportFileText(rawText, file);
      } catch (error) {
        onFailure();
        return;
      }
      invalidateObdScannerImport();
      input.value = "";
      if (!text.trim()) {
        obdImportStatus.textContent = "選択したファイルに診断結果がありません。";
        return;
      }
      applyObdScannerImportText(text);
    };
    reader.onerror = onFailure;
    reader.onabort = onFailure;
    reader.readAsText(file, "utf-8");
  } catch (error) {
    onFailure();
  }
}

function clearObdScannerImport() {
  invalidateObdScannerImport();
  cancelObdBridgeOperation();
  obdScannerText.value = "";
  if (hasActiveObdReadoutForExitWarning()) return;
  obdDetectedCodes.innerHTML = "";
  obdMonitorGrid.innerHTML = "";
  obdMonitorInsightList.innerHTML = "";
  obdMonitorInsightList.hidden = true;
  renderObdImportToolHints();
  obdImportStatus.textContent = buildCoreAnalysisPendingStatus(
    obdDevSession.lastSession?.coreSessionStatus,
    "まだ解析していません。"
  );
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

  document.querySelector("#obdCode").value = formatDtcReference(button.dataset.dtcCode, button.dataset.dtcSubcode);
  activateTab("diagnosis-panel");
  const input = getInput();
  if (button._obdVehicleProfile && typeof button._obdVehicleProfile === "object") {
    input.vehicleProfile = button._obdVehicleProfile;
  }
  renderDiagnosis(buildDiagnosis(input));
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

  if (!persistCases([record, ...savedCases])) return;
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

function findDuplicateCase(record, cases = savedCases) {
  const key = duplicateKey(record);
  return cases.find((item) => duplicateKey(item) === key);
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
  renderCaseStorageWarning();
  const keyword = caseSearch.value.trim().toLowerCase();
  const filtered = savedCases.filter((item) => {
    const target = [item.maker, item.model, item.symptom, item.obdCode, item.finalCause, item.confirmedFacts].join(" ").toLowerCase();
    return target.includes(keyword);
  });

  renderCaseCards(caseList, filtered, caseStorageReadError ? "保存事例を読み込めていません。" : "保存済み事例はまだありません。");
  if (caseStorageReadError) {
    caseStatus.textContent = caseStorageReadError;
    return;
  }
  if (!keyword) {
    caseStatus.textContent = `整備事例はこのブラウザのlocalStorageに保存されます。保存件数: ${savedCases.length}件`;
  } else {
    caseStatus.textContent = `検索結果: ${filtered.length}件 / 保存件数: ${savedCases.length}件`;
  }
}

function renderSimilarCases() {
  if (caseStorageReadError) {
    renderCaseCards(similarCases, [], "保存事例が未読込のため、類似事例は未確認です。");
    return;
  }
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

  if (!persistCases(savedCases.filter((item) => item.id !== button.dataset.deleteCase))) return;
  renderCases();
  renderSimilarCases();
}

function exportCasesCsv() {
  if (caseStorageReadError) { alert(caseStorageReadError); return; }
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
  if (caseStorageReadError) { alert(caseStorageReadError); return; }
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
  const nextCases = [...savedCases];
  let added = 0;
  let skipped = 0;

  dummyCases.forEach((record) => {
    if (findDuplicateCase(record, nextCases) || nextCases.some((item) => item.id === record.id)) {
      skipped += 1;
      return;
    }
    nextCases.unshift(record);
    added += 1;
  });

  if (!persistCases(nextCases)) {
    renderOpsResults([caseStatus.textContent]);
    return;
  }
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

  const candidateCases = [testRecord, ...savedCases];
  const temporaryKey = `${CASES_KEY}:selftest:${createId()}`;
  try {
    localStorage.setItem(temporaryKey, JSON.stringify(candidateCases));
    const restored = JSON.parse(localStorage.getItem(temporaryKey));
    results.push(Array.isArray(restored) && restored.length === candidateCases.length && restored[0]?.id === testRecord.id
      ? "一時領域の保存・再読込チェック: OK" : "一時領域の保存・再読込チェック: NG");
  } catch (error) {
    results.push("一時領域の保存・再読込チェック: NG（空き容量・保存権限を確認）");
  } finally {
    try {
      localStorage.removeItem(temporaryKey);
      results.push("セルフチェック用一時データ削除: OK");
    } catch (error) {
      results.push("セルフチェック用一時データ削除: NG（実際の整備事例は変更していません）");
    }
  }

  const found = candidateCases.filter((item) => [item.model, item.symptom, item.obdCode].join(" ").includes("P0171"));
  results.push(found.length ? "検索チェック: OK" : "検索チェック: NG");

  const csvPreview = buildCasesCsv(candidateCases);
  results.push(csvPreview.includes("事例ID") && csvPreview.includes(testRecord.id) ? "CSV出力チェック: OK" : "CSV出力チェック: NG");

  const backup = buildCasesBackup(candidateCases);
  results.push(backup.records.some((item) => item.id === testRecord.id) ? "JSONバックアップチェック: OK" : "JSONバックアップチェック: NG");

  const importPreview = [...backup.records, null].filter(isCaseRecord).map(normalizeCase);
  const importCheck = importPreview.some((item) => item.id === testRecord.id) && importPreview.length === backup.records.length;
  results.push(importCheck ? "JSONインポート形式・不正行除外チェック: OK" : "JSONインポート形式・不正行除外チェック: NG");

  results.push("実際の整備事例: 変更なし");
  renderOpsResults(results);
}

function clearAllLocalStorage() {
  if (!confirm("このアプリの整備事例、テーマ設定、注意事項確認状態をすべて削除しますか？")) return;
  if (!confirm("本当に削除しますか？この操作は元に戻せません。")) return;

  try {
    localStorage.removeItem(CASES_KEY);
  } catch (error) {
    renderOpsResults(["保存事例を削除できませんでした。事例一覧と読込エラー状態は変更していません。"]);
    return;
  }
  savedCases = [];
  caseStorageReadError = "";
  let preferencesCleared = true;
  for (const key of [THEME_KEY, NOTICE_KEY]) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      preferencesCleared = false;
    }
  }
  renderCaseStorageWarning();
  applyTheme("light");
  renderCases();
  renderSimilarCases();
  updateCaseQualityPreview();
  renderOpsResults([preferencesCleared ? "アプリ保存データ全削除: OK" : "整備事例の削除: OK / テーマ・注意事項の設定削除: 一部失敗"]);
}

function buildCasesBackup(cases = savedCases) {
  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    app: "vehicle-diagnosis-tool",
    appVersion: APP_VERSION,
    records: cases.map(normalizeCase)
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
  if (readOptionalBrowserSetting(NOTICE_KEY) === "accepted") return;
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
      const nextCases = [...savedCases];
      records.forEach((item) => {
        if (!isCaseRecord(item)) {
          invalid += 1;
          return;
        }
        const record = normalizeCase(item);
        if (findDuplicateCase(record, nextCases) || nextCases.some((item) => item.id === record.id)) {
          skipped += 1;
          return;
        }
        nextCases.push(record);
        added += 1;
      });

      if (!persistCases(nextCases)) return;
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
  try {
    const stored = localStorage.getItem(CASES_KEY);
    if (stored === null) {
      caseStorageReadError = "";
      return [];
    }
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed) || !parsed.every(isCaseRecord)) throw new Error("invalid_saved_cases");
    const cases = parsed.map(normalizeCase);
    caseStorageReadError = "";
    return cases;
  } catch (error) {
    caseStorageReadError = "保存事例を読み込めません。元データ保護のため、事例の変更・出力を停止しています。";
    return [];
  }
}

function renderCaseStorageWarning() {
  caseStorageWarning.hidden = !caseStorageReadError;
  caseStorageWarningText.textContent = caseStorageReadError;
}

function reloadSavedCases() {
  const cases = loadCases();
  renderCaseStorageWarning();
  if (caseStorageReadError) return;
  savedCases = cases;
  renderCases();
  renderSimilarCases();
  updateCaseQualityPreview();
  caseStatus.textContent = `保存事例を再読込しました。保存件数: ${savedCases.length}件`;
}

function readOptionalBrowserSetting(key, session = false) {
  try {
    return (session ? sessionStorage : localStorage).getItem(key);
  } catch (error) {
    return null;
  }
}

function writeOptionalBrowserSetting(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    // Theme and notice preferences must not interrupt the current screen.
  }
}

function persistCases(nextCases) {
  if (caseStorageReadError) {
    caseStatus.textContent = caseStorageReadError;
    alert(caseStorageReadError);
    return false;
  }
  try {
    localStorage.setItem(CASES_KEY, JSON.stringify(nextCases));
  } catch (error) {
    caseStatus.textContent = "端末内への保存に失敗しました。一覧は変更していません。空き容量・保存権限を確認してください。";
    alert(caseStatus.textContent);
    return false;
  }
  savedCases = nextCases;
  return true;
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

function normalizeDtcInputReference(value) {
  const normalized = normalizeCode(String(value || ""));
  const match = normalized.match(/^([PBCU][0-9A-F]{4})(?:(?:[:-]([0-9A-F]{1,4}))|([0-9A-F]{2}))?$/);
  return {
    code: match ? match[1] : normalized,
    subcode: match?.[2] || match?.[3] || null
  };
}

function formatDtcReference(code, subcode = null) {
  return subcode ? `${code}:${subcode}` : code;
}

const SOURCE_SCOPED_CONCURRENT_DTC_REQUIREMENTS = Object.freeze({
  "https://static.nhtsa.gov/odi/tsbs/2026/MC-11030186-0001.pdf": ["C1110:13", "C1100:94"],
  "https://static.nhtsa.gov/odi/tsbs/2025/MC-11019256-0001.pdf": ["P2C8A", "P2C8B", "U3577", "U3578", "U3579", "U357A", "U357B", "U357C", "U357D", "U357E", "U357F", "U3580", "U35AF"],
  "https://static.nhtsa.gov/odi/tsbs/2026/MC-11028091-0001.pdf": ["P0126:00"]
});

function evaluateDtcConcurrentRequirements(definition, observedDtcs = null) {
  const required = SOURCE_SCOPED_CONCURRENT_DTC_REQUIREMENTS[definition?.source_url] || [];
  const observed = new Set((Array.isArray(observedDtcs) ? observedDtcs : [])
    .map((item) => normalizeDtcInputReference(typeof item === "string" ? item : formatDtcReference(item?.code, item?.subcode || item?.sub_code)))
    .filter((item) => item.code)
    .map((item) => formatDtcReference(item.code, item.subcode)));
  return { required, missing: required.filter((reference) => !observed.has(reference)) };
}

function findDtcDefinitionCandidates(code, subcode = null) {
  if (!code) return [];
  const importedDefinitions = (dataStore.genericObdCodesModern || [])
    .filter((item) => item?.imported_definition_only === true);
  const matches = [...(dataStore.obdCodes || []), ...importedDefinitions]
    .filter((item) => item.code === code);
  const normalizedSubcode = String(subcode || "").trim().toUpperCase().replace(/^0X/, "");
  const codeLevelMatches = matches.filter((item) => !item.subcode && !item.sub_code);
  if (/^[0-9A-F]{1,4}$/.test(normalizedSubcode)) {
    const exactMatches = matches.filter((item) => String(item.subcode || item.sub_code || "").trim().toUpperCase() === normalizedSubcode);
    if (exactMatches.length) return [...codeLevelMatches, ...exactMatches];
  }
  return codeLevelMatches;
}

function findByCode(code, subcode = null, vehicleProfile = null) {
  return selectApplicableDtcDefinition(findDtcDefinitionCandidates(code, subcode), vehicleProfile);
}

function buildSourceSpecificDtcContext(definitions, vehicleProfile = null) {
  const sourceSpecificDefinitions = (Array.isArray(definitions) ? definitions : [])
    .filter((item) => item?.imported_definition_only === true && Boolean(item?.source));
  return {
    hasDefinitions: sourceSpecificDefinitions.length > 0,
    definitions: sourceSpecificDefinitions,
    applicability: evaluateDtcDefinitionCandidatesApplicability(sourceSpecificDefinitions, vehicleProfile),
    scopeSummary: buildDtcDefinitionScopeSummary(sourceSpecificDefinitions)
  };
}

function evaluateDtcDefinitionCandidatesApplicability(definitions, vehicleProfile = null) {
  const evaluations = (Array.isArray(definitions) ? definitions : [])
    .map((item) => evaluateDtcDefinitionApplicability(item, vehicleProfile));
  const statuses = evaluations.map((item) => item.status);
  if (!statuses.length) return { status: "not_limited" };
  if (statuses.includes("matched")) return { status: "matched" };
  if (statuses.includes("not_limited")) return { status: "not_limited" };
  if (statuses.includes("unverified")) return evaluations.find((item) => item.status === "unverified") || { status: "unverified" };
  return evaluations.find((item) => item.status === "mismatch") || { status: "mismatch" };
}

function evaluateDtcDefinitionApplicability(definition, vehicleProfile = null) {
  const filter = definition?.vehicle_filter || definition?.vehicleFilter || null;
  if (!filter || typeof filter !== "object") return { status: "not_limited" };
  const normalize = (value) => String(value || "").trim().toLocaleLowerCase("en-US");
  const normalizeModel = (value) => normalize(value).replace(/[\s_-]+/g, "");
  const normalizeDrivetrain = (value) => {
    const normalized = normalize(value).replace(/[\s_-]+/g, "");
    if (["4wd", "4x4", "fourwheeldrive"].includes(normalized)) return "4wd";
    if (["2wd", "2x4", "twowheeldrive"].includes(normalized)) return "2wd";
    if (["awd", "allwheeldrive"].includes(normalized)) return "awd";
    if (["fwd", "frontwheeldrive"].includes(normalized)) return "fwd";
    if (["rwd", "rearwheeldrive"].includes(normalized)) return "rwd";
    return normalized;
  };
  const normalizeEngine = (value) => normalize(value).replace(/[\s_.-]+/g, "");
  const normalizeTransmission = (value) => {
    const normalized = normalize(value).replace(/[\s_.-]+/g, "");
    if (["automatic", "at", "autotransmission", "cvt", "ecvt", "continuouslyvariabletransmission", "electroniccontinuouslyvariabletransmission"].includes(normalized)) return "automatic";
    if (["manual", "mt", "manualtransmission"].includes(normalized)) return "manual";
    return normalized;
  };
  const normalizeElectrification = (value) => {
    const normalized = normalize(value).replace(/[\s_.-]+/g, "");
    if (["hybrid", "hev", "fullhybrid"].includes(normalized)) return "hybrid";
    if (["pluginhybrid", "phev", "pluginhev"].includes(normalized)) return "plug-in-hybrid";
    if (["electric", "ev", "bev", "batteryelectric"].includes(normalized)) return "electric";
    if (["mildhybrid", "mhev"].includes(normalized)) return "mild-hybrid";
    return normalized;
  };
  const normalizeMarket = (value) => {
    const normalized = normalize(value).replace(/[\s_.-]+/g, "");
    if (["us", "usa", "unitedstates", "unitedstatesofamerica", "usmarket"].includes(normalized)) return "us";
    if (["canada", "ca", "canadianmarket"].includes(normalized)) return "canada";
    if (["mexico", "mx", "mexicanmarket"].includes(normalized)) return "mexico";
    if (["northamerica", "na", "northamericanmarket"].includes(normalized)) return "north-america";
    if (["japan", "jp", "japanese", "japanmarket"].includes(normalized)) return "japan";
    return normalized;
  };
  const normalizeEcu = (value) => {
    const normalized = normalize(value).replace(/[^a-z0-9]+/g, "");
    if (["ipma", "imageprocessingmodulea"].includes(normalized)) return "ipma";
    return normalized;
  };
  const normalizeProductionDate = (value) => {
    const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const utc = new Date(Date.UTC(year, month - 1, day));
    return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day ? `${match[1]}-${match[2]}-${match[3]}` : null;
  };
  const normalizeDtcState = (value) => {
    const normalized = normalize(value).replace(/[\s_-]+/g, "");
    if (["current", "failed/current", "current/failed"].includes(normalized)) return "current";
    if (normalized === "history") return "history";
    return null;
  };
  const makers = (Array.isArray(filter.makers) ? filter.makers : []).map(normalize).filter(Boolean);
  const models = (Array.isArray(filter.models) ? filter.models : []).map(normalizeModel).filter(Boolean);
  const modelCodeValues = Array.isArray(filter.model_codes)
    ? filter.model_codes
    : [filter.model_code ?? filter.modelCode ?? filter.chassis_code ?? filter.chassisCode];
  const modelCodes = modelCodeValues.map(normalizeModel).filter(Boolean);
  const engineValues = Array.isArray(filter.engines)
    ? filter.engines
    : [filter.engine ?? filter.engine_code ?? filter.engineCode];
  const engines = engineValues.map(normalizeEngine).filter(Boolean);
  const drivetrainValues = Array.isArray(filter.drivetrains)
    ? filter.drivetrains
    : [filter.drivetrain ?? filter.drive_type ?? filter.driveType];
  const drivetrains = drivetrainValues.map(normalizeDrivetrain).filter(Boolean);
  const transmissionValues = Array.isArray(filter.transmissions)
    ? filter.transmissions
    : [filter.transmission ?? filter.transmission_type ?? filter.transmissionType];
  const transmissions = transmissionValues.map(normalizeTransmission).filter(Boolean);
  const electrificationValues = Array.isArray(filter.electrifications)
    ? filter.electrifications
    : [filter.electrification ?? filter.hybrid_system ?? filter.hybridSystem ?? filter.ev_system ?? filter.evSystem];
  const electrifications = electrificationValues.map(normalizeElectrification).filter(Boolean);
  const marketValues = Array.isArray(filter.markets)
    ? filter.markets
    : [filter.market ?? filter.region ?? filter.destination_market ?? filter.destinationMarket];
  const markets = marketValues.map(normalizeMarket).filter(Boolean);
  const ecuValues = Array.isArray(filter.ecus)
    ? filter.ecus
    : [filter.ecu ?? filter.ecu_name ?? filter.ecuName ?? filter.reporting_ecu ?? filter.reportingEcu];
  const ecus = ecuValues.map(normalizeEcu).filter(Boolean);
  const dtcStateValues = Array.isArray(filter.dtc_states)
    ? filter.dtc_states
    : Array.isArray(filter.dtcStates) ? filter.dtcStates : [filter.dtc_state ?? filter.dtcState];
  const dtcStates = dtcStateValues.map(normalizeDtcState).filter(Boolean);
  const yearFrom = Number(filter.year_from ?? filter.yearFrom);
  const yearTo = Number(filter.year_to ?? filter.yearTo);
  const rawModelYearScopes = Array.isArray(filter.model_year_scopes)
    ? filter.model_year_scopes
    : Array.isArray(filter.modelYearScopes) ? filter.modelYearScopes : null;
  const modelYearScopes = (rawModelYearScopes || [])
    .map((scope) => ({
      makers: (Array.isArray(scope?.makers) ? scope.makers : []).map(normalize).filter(Boolean),
      models: (Array.isArray(scope?.models) ? scope.models : []).map(normalizeModel).filter(Boolean),
      yearFrom: Number(scope?.year_from ?? scope?.yearFrom),
      yearTo: Number(scope?.year_to ?? scope?.yearTo)
    }))
    .filter((scope) => scope.models.length && Number.isInteger(scope.yearFrom) && Number.isInteger(scope.yearTo) && scope.yearFrom <= scope.yearTo);
  const scopes = rawModelYearScopes
    ? modelYearScopes
    : [{ makers: [], models, yearFrom, yearTo }];
  const maker = normalize(vehicleProfile?.maker);
  const model = normalizeModel(vehicleProfile?.model);
  const year = Number(vehicleProfile?.year);
  if (!maker || !model || !Number.isInteger(year)) return { status: "unverified", reason: "vehicle_profile_incomplete" };
  const matched = makers.includes(maker) && scopes.some((scope) => {
    const scopeMakerMatches = scope.makers.length === 0 || scope.makers.includes(maker);
    return scopeMakerMatches && (scope.models.includes("all") || scope.models.includes(model)) && year >= scope.yearFrom && year <= scope.yearTo;
  });
  if (!matched) return { status: "mismatch" };
  const modelCode = normalizeModel(vehicleProfile?.modelCode ?? vehicleProfile?.model_code ?? vehicleProfile?.chassisCode ?? vehicleProfile?.chassis_code ?? vehicleProfile?.vehicleModelCode ?? vehicleProfile?.vehicle_model_code);
  if (modelCodes.length && !modelCode) return { status: "unverified", reason: "model_code_confirmation_required" };
  if (modelCodes.length && !modelCodes.includes(modelCode)) return { status: "mismatch", reason: "model_code_out_of_scope" };
  const engine = normalizeEngine(vehicleProfile?.engineCode ?? vehicleProfile?.engine_code ?? vehicleProfile?.engine ?? vehicleProfile?.engineModel ?? vehicleProfile?.engine_model ?? vehicleProfile?.engineType ?? vehicleProfile?.engine_type ?? vehicleProfile?.powertrainCode ?? vehicleProfile?.powertrain_code);
  if (engines.length && !engine) return { status: "unverified", reason: "engine_confirmation_required" };
  if (engines.length && !engines.includes(engine)) return { status: "mismatch", reason: "engine_out_of_scope" };
  const drivetrain = normalizeDrivetrain(vehicleProfile?.drivetrain ?? vehicleProfile?.drive_type ?? vehicleProfile?.driveType ?? vehicleProfile?.drivetrainType ?? vehicleProfile?.drivenWheels);
  if (drivetrains.length && !drivetrain) return { status: "unverified", reason: "drivetrain_confirmation_required" };
  if (drivetrains.length && !drivetrains.includes(drivetrain)) return { status: "mismatch", reason: "drivetrain_out_of_scope" };
  const transmission = normalizeTransmission(vehicleProfile?.transmission ?? vehicleProfile?.transmission_type ?? vehicleProfile?.transmissionType ?? vehicleProfile?.gearbox ?? vehicleProfile?.transaxle);
  if (transmissions.length && !transmission) return { status: "unverified", reason: "transmission_confirmation_required" };
  if (transmissions.length && !transmissions.includes(transmission)) return { status: "mismatch", reason: "transmission_out_of_scope" };
  const electrification = normalizeElectrification(vehicleProfile?.electrification ?? vehicleProfile?.hybridSystem ?? vehicleProfile?.hybrid_system ?? vehicleProfile?.evSystem ?? vehicleProfile?.ev_system);
  if (electrifications.length && !electrification) return { status: "unverified", reason: "electrification_confirmation_required" };
  if (electrifications.length && !electrifications.includes(electrification)) return { status: "mismatch", reason: "electrification_out_of_scope" };
  const market = normalizeMarket(vehicleProfile?.market ?? vehicleProfile?.region ?? vehicleProfile?.destinationMarket ?? vehicleProfile?.destination_market ?? vehicleProfile?.salesRegion ?? vehicleProfile?.sales_region ?? vehicleProfile?.country ?? vehicleProfile?.countryCode ?? vehicleProfile?.country_code);
  if (markets.length && !market) return { status: "unverified", reason: "market_confirmation_required" };
  if (markets.length && !markets.includes(market)) return { status: "mismatch", reason: "market_out_of_scope" };
  const ecu = normalizeEcu(vehicleProfile?.targetEcu ?? vehicleProfile?.target_ecu ?? vehicleProfile?.ecuName ?? vehicleProfile?.ecu_name ?? vehicleProfile?.ecu ?? vehicleProfile?.module ?? vehicleProfile?.moduleName ?? vehicleProfile?.module_name);
  if (ecus.length && !ecu) return { status: "unverified", reason: "ecu_confirmation_required" };
  if (ecus.length && !ecus.includes(ecu)) return { status: "mismatch", reason: "ecu_out_of_scope" };
  const reportedDtcState = normalizeDtcState(vehicleProfile?.dtcReportedStatus ?? vehicleProfile?.dtc_reported_status ?? vehicleProfile?.reportedStatus ?? vehicleProfile?.reported_status);
  if (dtcStates.length && !reportedDtcState) return { status: "unverified", reason: "dtc_state_confirmation_required" };
  if (dtcStates.length && !dtcStates.includes(reportedDtcState)) return { status: "mismatch", reason: "dtc_state_out_of_scope" };
  const productionPeriod = filter.production_period || filter.productionPeriod || null;
  const productionDate = normalizeProductionDate(vehicleProfile?.productionDate ?? vehicleProfile?.production_date ?? vehicleProfile?.buildDate ?? vehicleProfile?.build_date ?? vehicleProfile?.manufactureDate ?? vehicleProfile?.manufacture_date);
  const productionFrom = normalizeProductionDate(productionPeriod?.from ?? productionPeriod?.start);
  const productionTo = normalizeProductionDate(productionPeriod?.to ?? productionPeriod?.end);
  if (productionDate && ((productionFrom && productionDate < productionFrom) || (productionTo && productionDate > productionTo))) {
    return { status: "mismatch", reason: "production_date_out_of_scope" };
  }
  if (filter.scope_confirmation_required === true || filter.scopeConfirmationRequired === true) {
    return { status: "unverified", reason: "additional_scope_confirmation_required" };
  }
  return { status: "matched" };
}

function withReportedDtcEcu(vehicleProfile = null, dtc = null) {
  if (!vehicleProfile || typeof vehicleProfile !== "object") return vehicleProfile;
  const explicitEcu = vehicleProfile.targetEcu
    ?? vehicleProfile.target_ecu
    ?? vehicleProfile.ecuName
    ?? vehicleProfile.ecu_name
    ?? vehicleProfile.ecu
    ?? vehicleProfile.module
    ?? vehicleProfile.moduleName
    ?? vehicleProfile.module_name;
  const reportedDtcStatus = dtc?.reportedStatus ?? dtc?.reported_status ?? null;
  const hasReportedDtcStatus = !String(vehicleProfile.dtcReportedStatus ?? vehicleProfile.dtc_reported_status ?? vehicleProfile.reportedStatus ?? vehicleProfile.reported_status ?? "").trim()
    && String(reportedDtcStatus || "").trim();
  if (String(explicitEcu || "").trim()) {
    return hasReportedDtcStatus ? { ...vehicleProfile, dtcReportedStatus: reportedDtcStatus } : vehicleProfile;
  }
  const reportedEcuName = dtc?.ecuName
    ?? dtc?.ecu_name
    ?? dtc?.sourceEcuName
    ?? dtc?.source_ecu_name
    ?? dtc?.moduleName
    ?? dtc?.module_name;
  if (!String(reportedEcuName || "").trim()) {
    return hasReportedDtcStatus ? { ...vehicleProfile, dtcReportedStatus: reportedDtcStatus } : vehicleProfile;
  }
  return { ...vehicleProfile, ...(hasReportedDtcStatus ? { dtcReportedStatus: reportedDtcStatus } : {}), ecuName: reportedEcuName };
}

function buildDtcDefinitionScopeSummary(definitions) {
  const scopes = [...new Set((Array.isArray(definitions) ? definitions : [])
    .flatMap((definition) => {
      const filter = definition?.vehicle_filter || definition?.vehicleFilter || null;
      if (!filter || typeof filter !== "object") return [];
      const makers = (Array.isArray(filter.makers) ? filter.makers : []).map((value) => String(value || "").trim()).filter(Boolean);
      const models = (Array.isArray(filter.models) ? filter.models : []).map((value) => String(value || "").trim()).filter(Boolean);
      const modelCodeValues = Array.isArray(filter.model_codes)
        ? filter.model_codes
        : [filter.model_code ?? filter.modelCode ?? filter.chassis_code ?? filter.chassisCode];
      const modelCodes = modelCodeValues.map((value) => String(value || "").trim()).filter(Boolean);
      const engineValues = Array.isArray(filter.engines)
        ? filter.engines
        : [filter.engine ?? filter.engine_code ?? filter.engineCode];
      const engines = engineValues.map((value) => String(value || "").trim()).filter(Boolean);
      const drivetrainValues = Array.isArray(filter.drivetrains)
        ? filter.drivetrains
        : [filter.drivetrain ?? filter.drive_type ?? filter.driveType];
      const drivetrains = drivetrainValues.map((value) => String(value || "").trim()).filter(Boolean);
      const transmissionValues = Array.isArray(filter.transmissions)
        ? filter.transmissions
        : [filter.transmission ?? filter.transmission_type ?? filter.transmissionType];
      const transmissions = transmissionValues.map((value) => String(value || "").trim()).filter(Boolean);
      const electrificationValues = Array.isArray(filter.electrifications)
        ? filter.electrifications
        : [filter.electrification ?? filter.hybrid_system ?? filter.hybridSystem ?? filter.ev_system ?? filter.evSystem];
      const electrifications = electrificationValues.map((value) => String(value || "").trim()).filter(Boolean);
      const marketValues = Array.isArray(filter.markets)
        ? filter.markets
        : [filter.market ?? filter.region ?? filter.destination_market ?? filter.destinationMarket];
      const markets = marketValues.map((value) => String(value || "").trim()).filter(Boolean);
      const ecuValues = Array.isArray(filter.ecus)
        ? filter.ecus
        : [filter.ecu ?? filter.ecu_name ?? filter.ecuName ?? filter.reporting_ecu ?? filter.reportingEcu];
      const ecus = ecuValues.map((value) => String(value || "").trim()).filter(Boolean);
      const dtcStateValues = Array.isArray(filter.dtc_states)
        ? filter.dtc_states
        : Array.isArray(filter.dtcStates) ? filter.dtcStates : [filter.dtc_state ?? filter.dtcState];
      const dtcStates = dtcStateValues.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
      const yearFrom = Number(filter.year_from ?? filter.yearFrom);
      const yearTo = Number(filter.year_to ?? filter.yearTo);
      const rawModelYearScopes = Array.isArray(filter.model_year_scopes)
        ? filter.model_year_scopes
        : Array.isArray(filter.modelYearScopes) ? filter.modelYearScopes : null;
      const modelYearScopes = (rawModelYearScopes || [])
        .map((scope) => ({
          makers: (Array.isArray(scope?.makers) ? scope.makers : []).map((value) => String(value || "").trim()).filter(Boolean),
          models: (Array.isArray(scope?.models) ? scope.models : []).map((value) => String(value || "").trim()).filter(Boolean),
          yearFrom: Number(scope?.year_from ?? scope?.yearFrom),
          yearTo: Number(scope?.year_to ?? scope?.yearTo)
        }))
        .filter((scope) => scope.models.length && Number.isInteger(scope.yearFrom) && Number.isInteger(scope.yearTo) && scope.yearFrom <= scope.yearTo);
      const summaryScopes = rawModelYearScopes
        ? modelYearScopes
        : [{ makers: [], models, yearFrom, yearTo }];
      if (!makers.length || !summaryScopes.length) return [];
      const productionPeriod = filter.production_period || filter.productionPeriod || null;
      const productionFrom = String(productionPeriod?.from || productionPeriod?.start || "").trim();
      const productionTo = String(productionPeriod?.to || productionPeriod?.end || "").trim();
      const productionRange = productionFrom && productionTo
        ? `${productionFrom}-${productionTo}`
        : productionFrom || productionTo;
      const additionalScope = filter.scope_confirmation_required === true || filter.scopeConfirmationRequired === true
        ? " VIN/trim確認必須"
        : "";
      return summaryScopes.map((scope) => {
        const years = scope.yearFrom === scope.yearTo ? String(scope.yearFrom) : `${scope.yearFrom}-${scope.yearTo}`;
        const scopeMakers = scope.makers.length ? scope.makers : makers;
        return `${scopeMakers.join("/")} ${scope.models.join("/")} ${years}${modelCodes.length ? ` 型式 ${modelCodes.join("/")}` : ""}${engines.length ? ` エンジン ${engines.join("/")}` : ""}${transmissions.length ? ` 変速機 ${transmissions.join("/")}` : ""}${electrifications.length ? ` 電動化 ${electrifications.join("/")}` : ""}${markets.length ? ` 市場 ${markets.join("/")}` : ""}${ecus.length ? ` ECU ${ecus.join("/")}` : ""}${dtcStates.length ? ` DTC状態 ${dtcStates.join("/")}` : ""}${productionRange ? ` 生産 ${productionRange}` : ""}${drivetrains.length ? ` 駆動 ${drivetrains.join("/")}` : ""}${additionalScope}`;
      });
    }))];
  if (!scopes.length) return "";
  return scopes.length > 3 ? `${scopes.slice(0, 3).join(" / ")} ほか${scopes.length - 3}件` : scopes.join(" / ");
}

function selectApplicableDtcDefinition(definitions, vehicleProfile = null) {
  const candidates = Array.isArray(definitions) ? definitions : [];
  return candidates.find((item) => evaluateDtcDefinitionApplicability(item, vehicleProfile).status === "matched")
    || candidates.find((item) => evaluateDtcDefinitionApplicability(item, vehicleProfile).status !== "mismatch")
    || null;
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
