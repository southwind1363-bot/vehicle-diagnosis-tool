// Node-only test loader. Execute the two pure production factories, never the application or transport.
import fs from "node:fs";
import vm from "node:vm";
const source = fs.readFileSync(new URL("../../script.js", import.meta.url), "utf8");
const context = vm.createContext({});
for (const name of ["createReadOnlySettingsObservation", "createReadOnlySettingsSession"]) {
  const match = source.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`));
  if (!match) throw new Error("missing_settings_factory");
  vm.runInContext(match[0], context);
}
export const createReadOnlySettingsObservation = context.createReadOnlySettingsObservation;
export const createReadOnlySettingsSession = context.createReadOnlySettingsSession;
