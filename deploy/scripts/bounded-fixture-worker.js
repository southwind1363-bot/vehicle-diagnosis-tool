import { addAbortListener } from "node:events";

// Development fixture primitive. Callers own command/path validation.
export function createBoundedFixtureWorker({ spawnWorker, parseOutput, outputLimit = 4096, rejectStderr = false }) {
  if (typeof spawnWorker !== "function" || typeof parseOutput !== "function"
    || !Number.isInteger(outputLimit) || outputLimit < 1) throw new TypeError("fixture_worker_configuration_invalid");
  let active = false;
  return async function runBoundedFixtureWorker({ timeout, signal, context }) {
    const result = {
      execution_status: "worker_failed", worker_started: false, worker_exited: false,
      termination_requested: false, termination_signal_sent: false, parsed_result: null, errors: []
    };
    if (active) { result.execution_status = "worker_busy"; result.errors = ["worker_busy"]; return result; }
    active = true;
    try {
      return await new Promise((resolve) => {
        let child, timer, abortSubscription, reason = null, bytes = 0, closed = false;
        const chunks = [];
        try { child = spawnWorker(context); }
        catch { result.errors = ["worker_spawn_failed"]; resolve(result); return; }
        const stop = (code) => {
          if (closed || reason !== null) return;
          reason = code; chunks.length = 0; result.termination_requested = true;
          if (Number.isInteger(child.pid) && child.exitCode === null && child.signalCode === null) {
            try { result.termination_signal_sent = child.kill("SIGKILL") === true; } catch { /* Held until close. */ }
          }
        };
        const cancel = () => stop("worker_cancelled");
        const receive = (chunk, retain) => {
          if (reason !== null) return;
          bytes += chunk.length;
          if (bytes > outputLimit) { stop("worker_output_limit"); return; }
          if (!retain && rejectStderr && chunk.length > 0) { stop("worker_stderr"); return; }
          if (retain) chunks.push(chunk);
        };
        child.once("spawn", () => { result.worker_started = true; });
        child.on("error", () => { if (result.worker_started) stop("worker_process_error"); else reason ??= "worker_spawn_failed"; });
        child.once("exit", (code, signalName) => { if (code !== 0 || signalName !== null) reason ??= "worker_process_failed"; });
        child.stdout.on("data", chunk => receive(chunk, true));
        child.stderr.on("data", chunk => receive(chunk, false));
        child.stdout.on("error", () => stop("worker_stream_error"));
        child.stderr.on("error", () => stop("worker_stream_error"));
        child.once("close", (code, signalName) => {
          closed = true; clearTimeout(timer);
          try { abortSubscription?.[Symbol.dispose](); } catch { /* Remove intrinsically below. */ }
          try { if (signal) EventTarget.prototype.removeEventListener.call(signal, "abort", cancel); }
          catch { reason ??= "worker_signal_cleanup_failed"; }
          result.worker_exited = result.worker_started;
          if (reason !== null || code !== 0 || signalName !== null) {
            result.execution_status = reason === "worker_cancelled" ? "worker_cancelled"
              : reason === "worker_timeout" ? "worker_timed_out" : "worker_failed";
            result.errors = [reason || "worker_process_failed"];
          } else {
            try { result.parsed_result = parseOutput(Buffer.concat(chunks).toString("utf8"), context); } catch { result.parsed_result = null; }
            result.execution_status = result.parsed_result ? "worker_completed" : "invalid_worker_response";
            if (!result.parsed_result) result.errors = ["worker_response_invalid"];
          }
          chunks.length = 0; resolve(result);
        });
        timer = setTimeout(() => stop("worker_timeout"), timeout);
        try {
          if (signal) abortSubscription = addAbortListener(signal, cancel);
          if (signal?.aborted) cancel();
        } catch { stop("worker_signal_setup_failed"); }
      });
    } finally { active = false; }
  };
}
