import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { createJ2534RegisteredDriverDescriptor, discoverJ2534RegistryDrivers, getJ2534DiscoveryEnvironment, runJ2534RegisteredDriverNativePreflight } from "../local-bridge-readonly.js";

const READINESS = {
  no_registered_driver: "登録ドライバーを検出できません",
  static_inspection_pending: "DLLの静的検査が未完了です",
  runtime_architecture_mismatch: "DLLと実行環境の構成が一致していません",
  readonly_api_incomplete: "読取に必要なAPIを確認できません",
  readonly_static_check_complete: "静的検査済み（実機接続は未確認）"
};
const NEXT_CHECK = {
  install_or_repair_j2534_driver_registration: "機器に対応する正規ドライバーの導入・登録状態を確認してください。自動導入はしません。",
  verify_driver_library_path: "登録されたDLLの存在・読込権限を確認してください。DLLはロードしていません。",
  install_matching_j2534_driver_architecture: "DLLとNode.jsの32/64bit・CPU構成を確認してください。32bit DLLは64bit Node.jsに直接ロードできません。",
  verify_driver_readonly_exports: "ドライバーの読取APIを確認してください。機器の故障を示す判定ではありません。",
  manual_vci_connection_review: "次は隔離ワーカーのDLL実行機能と実機試験が必要です。この版では実機通信できません。"
};
const PREFLIGHT_BLOCKERS = {
  descriptor_not_issued: "登録ドライバーの安全な検査対象を発行できませんでした",
  registered_driver_not_found: "選択後に登録ドライバーを再確認できませんでした",
  registered_driver_file_changed: "登録後にドライバーファイルが変更されています",
  registered_driver_preflight_ineligible: "非実行検査の前提となる静的確認が揃っていません",
  native_preflight_worker_missing: "配布版の非実行検査workerを確認できません",
  native_preflight_worker_integrity_mismatch: "非実行検査workerの内容が配布時と一致しません",
  native_preflight_request_invalid: "非実行検査要求の内容を確認できません",
  native_preflight_in_progress: "別の非実行検査が終了していません",
  native_preflight_cancelled: "非実行検査が中止されました",
  native_preflight_timeout: "非実行検査が制限時間内に終了しませんでした",
  native_preflight_termination_unconfirmed: "非実行検査workerの終了を確認できません",
  native_preflight_quarantine_not_clear: "以前のworker終了を確認できないため、J2534検査を隔離しています",
  native_preflight_response_invalid: "非実行検査workerの応答を確認できません",
  native_authenticode_not_trusted: "Windowsの署名ポリシーでJ2534ドライバーDLLを信頼済みと確認できません"
};

const safeLabel = (value) => typeof value === "string"
  ? value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ").slice(0, 120).trim() || "名称未確認"
  : "名称未確認";

export function formatJ2534WorkstationInspection(devices = [], platform = process.platform) {
  const lines = ["J2534接続準備チェック", "車両通信: 未実施 / DLL実行: 未実施 / 診断データ保存・外部送信: なし / 異常終了時のみ安全隔離状態を端末保存"];
  if (platform !== "win32") return [...lines, "Windows専用です。対象のWindows PCで確認してください。"].join("\n");
  const registered = Array.isArray(devices) ? devices : [];
  const environment = getJ2534DiscoveryEnvironment(registered);
  const bitness = (value) => value === 32 || value === 64 ? `${value}bit` : "未確認";
  lines.push(`実行環境: ${environment.bridge_runtime_architecture} / ${bitness(environment.bridge_runtime_bitness)}`);
  lines.push(`登録検出: ${registered.length}件 / 静的検査済み: ${environment.static_ready_vci_count}件 / 要確認: ${environment.static_blocked_vci_count}件`);
  lines.push(`全体: ${READINESS[environment.driver_readiness_status] || "未確認"}`);
  lines.push(`次の確認: ${NEXT_CHECK[environment.next_check] || "ドライバーの状態を確認してください。"}`);
  for (const [index, device] of registered.entries()) {
    const status = getJ2534DiscoveryEnvironment([device]);
    lines.push("", `${index + 1}. ${safeLabel(device?.label)}`);
    lines.push(`DLL: ${bitness(device?.driver_library_bitness)} / ${READINESS[status.driver_readiness_status] || "未確認"}`);
    lines.push(`次の確認: ${NEXT_CHECK[status.next_check] || "ドライバーの状態を確認してください。"}`);
  }
  lines.push("", "登録・静的検査だけでは、USB接続、VCIの電源、車種適合、車両応答を確認できません。",
    "実機接続、DTC読取・消去、EPB/ABSの作動は実行しません。車両やVCIをつながず確認できます。");
  return lines.join("\n");
}

export function parseJ2534PreflightSelection(args = [], deviceCount = 0) {
  if (!Array.isArray(args) || !Number.isInteger(deviceCount) || deviceCount < 0) return { status: "invalid", index: null };
  if (args.length === 0) return { status: "none", index: null };
  if (args.length !== 2 || args[0] !== "--preflight-index" || !/^[1-9]\d*$/.test(args[1])) return { status: "invalid", index: null };
  const index = Number(args[1]) - 1;
  return Number.isSafeInteger(index) && index < deviceCount ? { status: "selected", index } : { status: "invalid", index: null };
}

export function parseJ2534InspectionArguments(args = [], deviceCount = 0) {
  if (!Array.isArray(args)) return { status: "invalid", index: null, evidenceJson: false };
  const evidenceCount = args.filter((item) => item === "--evidence-json").length;
  if (evidenceCount > 1) return { status: "invalid", index: null, evidenceJson: false };
  const selection = parseJ2534PreflightSelection(args.filter((item) => item !== "--evidence-json"), deviceCount);
  return { ...selection, evidenceJson: evidenceCount === 1 };
}

const isVerifiedNonExecutablePreflight = (result) => result?.verification_status === "verified_non_executable"
  && result?.fixed_drive_verified === true && result?.final_path_matches === true
  && result?.file_identity_stable === true && result?.sha256_matches === true
  && result?.size_matches === true && result?.architecture_matches === true
  && result?.runtime_architecture_matches === true
  && result?.authenticode_status === "verified_file_policy"
  && result?.authenticode_network_retrieval_allowed === false
  && result?.global_mutex_status === "acquired_for_preflight";

const safeEvidenceToken = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
const safeEvidenceBlockers = (value, fallback = []) => {
  const sanitize = (items) => [...new Set(items
    .filter((item) => typeof item === "string" && /^[a-z0-9_]{3,96}$/.test(item))
    .slice(0, 8))];
  const blockers = sanitize(Array.isArray(value) ? value : []);
  return Object.freeze(blockers.length ? blockers : sanitize(fallback));
};

export function buildJ2534NativePreflightEvidence(devices = [], options = {}) {
  const registered = Array.isArray(devices) ? devices : [];
  const environment = getJ2534DiscoveryEnvironment(registered);
  const selectedIndex = Number.isInteger(options.selectedIndex) && options.selectedIndex >= 0 && options.selectedIndex < registered.length
    ? options.selectedIndex : null;
  const selected = selectedIndex === null ? null : registered[selectedIndex];
  const result = options.result && typeof options.result === "object" && !Array.isArray(options.result) ? options.result : null;
  const capturedAt = typeof options.capturedAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(options.capturedAt)
    ? options.capturedAt : new Date().toISOString();
  const platform = options.platform ?? process.platform;
  const preflightStatus = result
    ? safeEvidenceToken(result.verification_status, ["verified_non_executable", "rejected"], "rejected")
    : "not_requested";
  const blockers = result
    ? safeEvidenceBlockers(result.blockers, ["native_preflight_response_invalid"])
    : safeEvidenceBlockers(environment.open_review_blockers, ["no_registered_driver"]);
  return Object.freeze({
    schema_version: "j2534-native-preflight-evidence-v1",
    captured_at: capturedAt,
    evidence_scope: "registered_driver_non_executable_preflight",
    platform: platform === "win32" ? "windows" : "unsupported",
    bridge_runtime_architecture: safeEvidenceToken(environment.bridge_runtime_architecture, ["x86", "x64"], "unknown"),
    bridge_runtime_bitness: [32, 64].includes(environment.bridge_runtime_bitness) ? environment.bridge_runtime_bitness : null,
    registration_status: platform === "win32" ? environment.registration_status : "not_checked",
    registered_driver_count: registered.length,
    selected_driver_index: selectedIndex === null ? null : selectedIndex + 1,
    selected_driver_architecture: safeEvidenceToken(selected?.driver_library_architecture, ["x86", "x64"], null),
    preflight_contract_version: result?.contract_version === "j2534-native-preflight-response-v2" ? result.contract_version : null,
    preflight_verification_status: preflightStatus,
    blockers,
    authenticode_status: safeEvidenceToken(result?.authenticode_status, ["not_verified", "not_trusted", "verified_file_policy"], "not_verified"),
    authenticode_network_retrieval_allowed: false,
    global_mutex_status: safeEvidenceToken(result?.global_mutex_status, ["not_acquired", "acquired_for_preflight"], "not_acquired"),
    fixed_drive_verified: result?.fixed_drive_verified === true,
    final_path_matches: result?.final_path_matches === true,
    file_identity_stable: result?.file_identity_stable === true,
    sha256_matches: result?.sha256_matches === true,
    size_matches: result?.size_matches === true,
    architecture_matches: result?.architecture_matches === true,
    runtime_architecture_matches: result?.runtime_architecture_matches === true,
    private_fields_included: false,
    evidence_authorizes_execution: false,
    dll_load_attempted: false,
    get_proc_address_attempted: false,
    pass_thru_open_attempted: false,
    vehicle_connection_attempted: false,
    vehicle_communication_started: false,
    would_transmit: false,
    vehicle_command_enabled: false,
    execution_enabled: false
  });
}

export function formatJ2534NativePreflightResult(result = {}, device = {}, index = 0) {
  const driverBits = device?.driver_library_bitness === 32 || device?.driver_library_bitness === 64 ? `${device.driver_library_bitness}bit` : "未確認";
  const runtimeBits = device?.bridge_runtime_bitness === 32 || device?.bridge_runtime_bitness === 64 ? `${device.bridge_runtime_bitness}bit` : "未確認";
  const lines = ["", "J2534登録ドライバー 非実行事前検査", `選択: ${index + 1}. ${safeLabel(device?.label)}`,
    `対象DLL構成: ${driverBits}`, `Node.js実行環境: ${runtimeBits}`, `検査方式: 対象DLLと同じ${driverBits}専用worker`];
  if (isVerifiedNonExecutablePreflight(result)) {
    lines.push("", "結果: 非実行の事前検査に合格しました",
      "確認済み: 固定ローカルドライブ / 登録時と同一ファイル / ファイル内容・サイズ / PE構成 / Windows署名ポリシー / 専用worker構成",
      "署名確認: WinVerifyTrust / ネットワーク取得なし");
  } else {
    const blocker = Array.isArray(result?.blockers) && typeof result.blockers[0] === "string" ? result.blockers[0] : "native_preflight_failed";
    lines.push("", "結果: 非実行の事前検査を完了できませんでした",
      `理由: ${PREFLIGHT_BLOCKERS[blocker] || "安全な検査結果を確認できませんでした"}`,
      `理由コード: ${/^[a-z0-9_]{3,96}$/.test(blocker) ? blocker : "native_preflight_failed"}`);
  }
  lines.push("", "J2534ドライバーDLLロード: 未実施", "PassThruOpen: 未実施", "VCI・車両接続: 未実施", "車両への送信: 未実施",
    "", "注意: VCI接続、実車適合、車両通信の成功を証明する結果ではありません。");
  if (device?.driver_runtime_compatible === false) lines.push("Node.jsとDLLのbit数不一致は残っています。今後DLLを扱う場合も対象bit数の隔離workerが必要です。");
  return lines.join("\n");
}

export async function runJ2534WorkstationPreflight(devices, index, dependencies = {}) {
  const registered = Array.isArray(devices) ? devices : [];
  if (!Number.isInteger(index) || index < 0 || index >= registered.length) throw new Error("j2534_preflight_selection_invalid");
  const selected = registered[index];
  const createDescriptor = dependencies.createDescriptor || createJ2534RegisteredDriverDescriptor;
  const runPreflight = dependencies.runPreflight || runJ2534RegisteredDriverNativePreflight;
  const descriptor = createDescriptor({ enabled: true, selectedDeviceId: selected?.id });
  const result = await runPreflight(descriptor, { timeout_ms: 5000 });
  return Object.freeze({
    output: formatJ2534NativePreflightResult(result, selected, index),
    passed: isVerifiedNonExecutablePreflight(result),
    evidence: buildJ2534NativePreflightEvidence(registered, {
      selectedIndex: index, result, capturedAt: dependencies.capturedAt, platform: dependencies.platform
    })
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const devices = process.platform === "win32" ? discoverJ2534RegistryDrivers({ enabled: true, inspectLibraries: true }) : [];
    const parsed = parseJ2534InspectionArguments(process.argv.slice(2), devices.length);
    if (!parsed.evidenceJson) console.log(formatJ2534WorkstationInspection(devices));
    if (process.platform !== "win32") {
      if (parsed.evidenceJson) console.log(JSON.stringify(buildJ2534NativePreflightEvidence(devices, { platform: process.platform })));
      process.exitCode = 2;
    } else {
      let selection = parsed;
      if (selection.status === "none" && !selection.evidenceJson && process.stdin.isTTY && devices.length) {
        const input = createInterface({ input: process.stdin, output: process.stdout });
        try {
          const answer = (await input.question("非実行検査する番号を入力してください。Enterのみで終了します: ")).trim();
          selection = answer ? parseJ2534InspectionArguments(["--preflight-index", answer], devices.length) : selection;
        } finally { input.close(); }
      }
      if (selection.status === "invalid") {
        console.error("検査番号を確認できません。表示された候補番号を1件だけ指定してください。DLLロード・車両通信は行っていません。");
        process.exitCode = 2;
      } else if (selection.status === "selected") {
        const outcome = await runJ2534WorkstationPreflight(devices, selection.index);
        console.log(selection.evidenceJson ? JSON.stringify(outcome.evidence) : outcome.output);
        if (!outcome.passed) process.exitCode = 1;
      } else if (selection.evidenceJson) {
        console.log(JSON.stringify(buildJ2534NativePreflightEvidence(devices, { platform: process.platform })));
      }
    }
  } catch {
    console.error("J2534接続準備チェックを完了できませんでした。配布ファイルとドライバー登録の読込権限を確認してください。車両通信・DLL実行は行っていません。");
    process.exitCode = 1;
  }
}
