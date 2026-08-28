import { runJ2534IdentityLifecycle } from "../j2534-identity-lifecycle.js";

const mode = process.argv[2];
const supervised = process.argv[3] === "--supervised";
const modes = supervised ? ["success", "open_error", "read_error", "close_error", "read_close_error", "invalid_version", "open", "read", "close", "crash", "invalid_json", "bad_result", "stdout_limit", "stderr_limit", "combined_limit", "boundary", "result_then_hang"] : ["open", "read", "close", "crash"];
if (!modes.includes(mode)) process.exit(2);
function enter(stage) {
  if (!supervised) process.stdout.write(`fixture:${stage}\n`);
  if (mode === "crash" && stage === "read") process.exit(23);
  if (mode === stage) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
}
const buffer = () => { const bytes = new Uint8Array(80); bytes.set([48, 52, 46, 48, 52]); return bytes; };
const result = await runJ2534IdentityLifecycle({
  open() { enter("open"); return { status: mode === "open_error" ? 7 : 0, device_id: 0 }; },
  readVersion() { enter("read"); return { status: ["read_error", "read_close_error"].includes(mode) ? 7 : 0, firmware: mode === "invalid_version" ? new Uint8Array(80) : buffer(), dll: buffer(), api: buffer() }; },
  close() { enter("close"); return { status: ["close_error", "read_close_error"].includes(mode) ? 8 : 0 }; }
});
if (!supervised) process.stdout.write(`result:${JSON.stringify(result)}\n`);
else {
  if (mode === "bad_result") result.steps.close.attempted = false;
  const output = JSON.stringify({ schema_version: "j2534-identity-fixture-worker-v1", fixture_only: true, scenario: mode, result });
  if (mode === "invalid_json") process.stdout.write("{not-json}");
  else if (mode === "stdout_limit") process.stdout.write("x".repeat(4097));
  else if (mode === "stderr_limit") process.stderr.write("x".repeat(4097));
  else if (mode === "combined_limit") { process.stdout.write("x".repeat(2048)); process.stderr.write("x".repeat(2049)); }
  else process.stdout.write(mode === "boundary" ? output.padEnd(4096, " ") : output);
  if (mode === "result_then_hang") Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
}
