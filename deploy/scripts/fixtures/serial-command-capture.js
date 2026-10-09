// Test loader: exercise the production factory without starting the application.
import fs from "node:fs";
import vm from "node:vm";
const source = fs.readFileSync(new URL("../../script.js", import.meta.url), "utf8");
const match = source.match(/function createSerialCommandCapture\([^\n]*\) \{[\s\S]*?\r?\n\}/);
if (!match) throw new Error("missing_serial_command_capture_factory");
const context = vm.createContext({});
vm.runInContext(match[0], context);
export const createSerialCommandCapture = context.createSerialCommandCapture;
