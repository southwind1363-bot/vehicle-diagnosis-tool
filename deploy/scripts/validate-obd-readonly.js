import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8");
const context = {
  window: { isSecureContext: true },
  navigator: { serial: {} }
};

vm.createContext(context);
vm.runInContext(source, context);

const obd = context.window.ObdReadOnly;
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

check(obd?.policy?.transmitsVehicleCommands === false, "車両コマンド送信が禁止されていません");
check(obd?.policy?.storesRawInput === false, "入力原文の保存が禁止されていません");
check(obd?.policy?.uploadsRawInput === false, "入力原文の外部送信が禁止されていません");
check(obd?.policy?.blockedOperations?.includes("DTC消去"), "DTC消去が禁止一覧にありません");

const analysis = obd.analyzeScannerText("P0171 p0300 JTDKN3DU0A0123456 P0171");
check(analysis.codes.join(",") === "P0171,P0300", "DTC抽出または重複除外が不正です");
check(analysis.hadSensitiveIdentifier === true, "車台番号候補を検出できません");
check(analysis.retainedRawText === false, "入力原文を保持する設定になっています");
check(obd.getCapability().hardwareConnectionEnabled === false, "実機接続が予期せず有効です");

if (failures.length) {
  failures.forEach((failure) => console.error(`ERROR: ${failure}`));
  process.exitCode = 1;
} else {
  console.log("OBD read-only safety checks: 9");
  console.log("Errors: 0");
}
