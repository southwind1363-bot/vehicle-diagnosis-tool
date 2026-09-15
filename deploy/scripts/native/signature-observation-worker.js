import { createBoundedFixtureWorker } from "../bounded-fixture-worker.js";
import { convertNativeSignatureResult } from "./native-signature-result.js";

// Private development composition. The trusted parent must pin the executable,
// validate its paths and own spawn options. This does not authenticate a worker
// or expose any public command/driver execution endpoint.
export function createSignatureObservationWorker({ spawnWorker, expectedFileSha256 }) {
  if (typeof spawnWorker !== "function" || typeof expectedFileSha256 !== "string"
    || !/^[a-fA-F0-9]{64}$/.test(expectedFileSha256)) throw new TypeError("signature_worker_configuration_invalid");
  const digest = expectedFileSha256.toUpperCase();
  const run = createBoundedFixtureWorker({ spawnWorker: () => spawnWorker(),
    outputLimit: 4096, rejectStderr: true,
    parseOutput(stdout) {
      // The bounded runner calls this only after successful close, with no
      // timeout, stream error, stderr or output overflow.
      const converted = convertNativeSignatureResult({ status: 0, signal: null, stderr: "", stdout }, digest);
      return converted.signature_report ? converted : null;
    }
  });
  let attempted = false;
  return async function observe() {
    if (attempted) return { execution_status: "worker_failed", worker_started: false,
      worker_exited: false, termination_requested: false, termination_signal_sent: false,
      parsed_result: null, errors: ["signature_worker_already_attempted"] };
    attempted = true;
    return run({ timeout: 15000 });
  };
}
