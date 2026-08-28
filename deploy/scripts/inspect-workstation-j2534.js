import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverJ2534RegistryDrivers, getJ2534DiscoveryEnvironment } from "../local-bridge-readonly.js";

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

export function formatJ2534WorkstationInspection(devices = [], platform = process.platform) {
  const lines = ["J2534接続準備チェック", "車両通信: 未実施 / DLL実行: 未実施 / ファイル保存・外部送信: なし"];
  if (platform !== "win32") return [...lines, "Windows専用です。対象のWindows PCで確認してください。"].join("\n");
  const registered = Array.isArray(devices) ? devices : [];
  const environment = getJ2534DiscoveryEnvironment(registered);
  const bitness = (value) => value === 32 || value === 64 ? `${value}bit` : "未確認";
  const label = (value) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ").slice(0, 120).trim() || "名称未確認" : "名称未確認";
  lines.push(`実行環境: ${environment.bridge_runtime_architecture} / ${bitness(environment.bridge_runtime_bitness)}`);
  lines.push(`登録検出: ${registered.length}件 / 静的検査済み: ${environment.static_ready_vci_count}件 / 要確認: ${environment.static_blocked_vci_count}件`);
  lines.push(`全体: ${READINESS[environment.driver_readiness_status] || "未確認"}`);
  lines.push(`次の確認: ${NEXT_CHECK[environment.next_check] || "ドライバーの状態を確認してください。"}`);
  for (const [index, device] of registered.entries()) {
    const status = getJ2534DiscoveryEnvironment([device]);
    lines.push("", `${index + 1}. ${label(device?.label)}`);
    lines.push(`DLL: ${bitness(device?.driver_library_bitness)} / ${READINESS[status.driver_readiness_status] || "未確認"}`);
    lines.push(`次の確認: ${NEXT_CHECK[status.next_check] || "ドライバーの状態を確認してください。"}`);
  }
  lines.push("", "登録・静的検査だけでは、USB接続、VCIの電源、車種適合、車両応答を確認できません。",
    "実機接続、DTC読取・消去、EPB/ABSの作動は実行しません。車両やVCIをつながず確認できます。");
  return lines.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const devices = process.platform === "win32" ? discoverJ2534RegistryDrivers({ enabled: true, inspectLibraries: true }) : [];
    console.log(formatJ2534WorkstationInspection(devices));
    if (process.platform !== "win32") process.exitCode = 2;
  } catch {
    console.error("J2534接続準備チェックを完了できませんでした。配布ファイルとドライバー登録の読込権限を確認してください。車両通信・DLL実行は行っていません。");
    process.exitCode = 1;
  }
}
