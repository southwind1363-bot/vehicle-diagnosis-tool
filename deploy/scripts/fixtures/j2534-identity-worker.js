import { runJ2534IdentityLifecycle } from "../j2534-identity-lifecycle.js";

const mode = process.argv[2];
if (!["open", "read", "close", "crash"].includes(mode)) process.exit(2);
function enter(stage) {
  process.stdout.write(`fixture:${stage}\n`);
  if (mode === "crash" && stage === "read") process.exit(23);
  if (mode === stage) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
}
const buffer = () => { const bytes = new Uint8Array(80); bytes.set([48, 52, 46, 48, 52]); return bytes; };
const result = await runJ2534IdentityLifecycle({
  open() { enter("open"); return { status: 0, device_id: 0 }; },
  readVersion() { enter("read"); return { status: 0, firmware: buffer(), dll: buffer(), api: buffer() }; },
  close() { enter("close"); return { status: 0 }; }
});
process.stdout.write(`result:${JSON.stringify(result)}\n`);
