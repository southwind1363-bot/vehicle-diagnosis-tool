const THEME_KEY = "vehicle-diagnosis-theme";
const CASES_KEY = "vehicle-diagnosis-cases-v1";
const NOTICE_KEY = "vehicle-diagnosis-notice-accepted-v1";
const APP_VERSION = "2.92.0";
const APP_LAST_UPDATED = "2026-06-13";
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
const obdScannerText = document.querySelector("#obdScannerText");
const obdAnalyzeButton = document.querySelector("#obdAnalyzeButton");
const obdSampleButton = document.querySelector("#obdSampleButton");
const obdImportClearButton = document.querySelector("#obdImportClearButton");
const obdImportStatus = document.querySelector("#obdImportStatus");
const obdDetectedCodes = document.querySelector("#obdDetectedCodes");
const obdMonitorStatus = document.querySelector("#obdMonitorStatus");
const obdMonitorCount = document.querySelector("#obdMonitorCount");
const obdMonitorGrid = document.querySelector("#obdMonitorGrid");
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
      componentInspectionFlows,
      componentInspectionFlowsExam2026,
      componentInspectionFlowsExam2026Part2,
      dtcFamilyWorkflows2026,
      dtcScopeRules,
      obdMonitorDefinitions
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
      fetchJson("data/component-inspection-flows.json"),
      fetchJson("data/component-inspection-flows-exam-2026.json"),
      fetchJson("data/component-inspection-flows-exam-2026-part2.json"),
      fetchJson("data/dtc-family-workflows-2026.json"),
      fetchJson("data/dtc-scope-rules.json"),
      fetchJson("data/obd-monitor-definitions.json")
    ]);

    if (!window.ObdReadOnly?.configureMonitorDefinitions(obdMonitorDefinitions)) {
      throw new Error("OBDデータモニター辞書を読み込めません");
    }

    dataStore = {
      obdCodes,
      serviceNotes,
      symptomFlows,
      genericObdCodesModern: [...genericObdCodesModern, ...genericObdCodesModern2026, ...genericObdCodesModern2026Part2, ...genericObdCodesModern2026Part3, ...genericObdCodesModern2026Part4, ...genericObdCodesModern2026Part5, ...genericObdCodesModern2026Part6, ...genericObdCodesModern2026Part7, ...genericObdCodesModern2026Part8, ...genericObdCodesModern2026Part9, ...genericObdCodesModern2026Part10, ...genericObdCodesModern2026Part11, ...genericObdCodesModern2026Part12, ...genericObdCodesModern2026Part13, ...genericObdCodesModern2026Part14, ...genericObdCodesModern2026Part15, ...genericObdCodesModern2026Part16, ...genericObdCodesModern2026Part17, ...genericObdCodesModern2026Part18, ...genericObdCodesModern2026Part19, ...genericObdCodesModern2026Part20, ...genericObdCodesModern2026Part21, ...genericObdCodesModern2026Part22, ...genericObdCodesModern2026Part23, ...genericObdCodesModern2026Part24, ...genericObdCodesModern2026Part25, ...genericObdCodesModern2026Part26, ...genericObdCodesModern2026Part27, ...genericObdCodesModern2026Part28, ...genericObdCodesModern2026Part29, ...genericObdCodesModern2026Part30, ...genericObdCodesModern2026Part31, ...genericObdCodesModern2026Part32, ...genericObdCodesModern2026Part33, ...genericObdCodesModern2026Part34, ...genericObdCodesModern2026Part35, ...genericObdCodesModern2026Part36, ...genericObdCodesModern2026Part37, ...genericObdCodesModern2026Part38, ...genericObdCodesModern2026Part39, ...genericObdCodesModern2026Part40, ...genericObdCodesModern2026Part41, ...genericObdCodesModern2026Part42, ...genericObdCodesModern2026Part43, ...genericObdCodesModern2026Part44, ...genericObdCodesModern2026Part45, ...genericObdCodesModern2026Part46, ...genericObdCodesModern2026Part47, ...genericObdCodesModern2026Part48, ...genericObdCodesModern2026Part49, ...genericObdCodesModern2026Part50, ...genericObdCodesModern2026Part51, ...genericObdCodesModern2026Part52, ...importedVerifiedDtc],
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
      diagnosticWorkflows: [...diagnosticWorkflows, ...componentInspectionFlows, ...componentInspectionFlowsExam2026, ...componentInspectionFlowsExam2026Part2, ...dtcFamilyWorkflows2026],
      dtcScopeRules,
      obdMonitorDefinitions
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
  if (!capability) {
    obdCapabilityBadge.textContent = "準備機能を読込できません";
    obdCapabilityText.textContent = "OBD2読取準備モジュールを読み込めませんでした。";
    obdCapabilityText.classList.add("error");
    return;
  }

  const serialStatus = capability.webSerialSupported
    ? "このブラウザはUSBシリアル接続基盤に対応しています。"
    : "このブラウザはWeb Serial非対応です。実機接続にはデスクトップ版Chrome系ブラウザが必要です。";
  const secureStatus = capability.secureContext
    ? "HTTPS接続は正常です。"
    : "HTTPSではないため実機接続機能は使用できません。";
  const catalogStatus = `読取辞書 ${capability.monitorDefinitionCount}項目を準備しています。`;

  obdCapabilityBadge.textContent = "実機接続準備中";
  obdCapabilityText.textContent = `${secureStatus} ${serialStatus} ${catalogStatus} 現在は安全検証中のため車両接続を無効にしています。`;
}

function analyzeObdScannerImport() {
  const analysis = window.ObdReadOnly.analyzeScannerText(obdScannerText.value);
  obdDetectedCodes.innerHTML = "";
  obdMonitorGrid.innerHTML = "";

  if (!obdScannerText.value.trim()) {
    obdImportStatus.textContent = "外部診断機の読取結果を入力してください。";
    obdMonitorStatus.textContent = "計測値はまだ解析していません。";
    obdMonitorCount.textContent = "0項目";
    return;
  }

  if (!analysis.codes.length) {
    obdImportStatus.textContent = analysis.hadSensitiveIdentifier
      ? "識別情報候補をマスクしましたが、標準形式のDTCは検出できませんでした。"
      : "標準形式のDTCは検出できませんでした。スキャンツールの表示形式を確認してください。";
  } else {
    obdImportStatus.textContent = `${analysis.codes.length}件のDTCを検出しました。登録済みデータを日本語で表示します。`;
    analysis.codes.forEach((code) => {
      obdDetectedCodes.appendChild(createObdDtcCard(code));
    });
  }

  renderObdMonitorValues(analysis.monitorValues);
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

function renderObdMonitorValues(values) {
  obdMonitorGrid.innerHTML = "";
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
}

function loadObdMonitorSample() {
  obdScannerText.value = [
    "P0171 P0300",
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
  obdImportStatus.textContent = "まだ解析していません。";
  obdMonitorStatus.textContent = "計測値はまだ解析していません。";
  obdMonitorCount.textContent = "0項目";
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
