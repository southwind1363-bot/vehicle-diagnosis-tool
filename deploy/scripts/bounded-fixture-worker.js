import { addAbortListener } from "node:events";
const unconfirmedChildren = new Set();

// Development fixture primitive. Callers own command/path validation.
export function createBoundedFixtureWorker({ spawnWorker, parseOutput, outputLimit = 4096, rejectStderr = false }) {
  if (typeof spawnWorker !== "function" || typeof parseOutput !== "function"
    || !Number.isInteger(outputLimit) || outputLimit < 1) throw new TypeError("fixture_worker_configuration_invalid");
  let active = false, terminationUnconfirmed = false;
  return async function runBoundedFixtureWorker({ timeout, signal, context }) {
    const result = {
      execution_status: "worker_failed", worker_started: false, worker_exited: false,
      termination_requested: false, termination_signal_sent: false, parsed_result: null, errors: []
    };
    if (terminationUnconfirmed) { result.errors = ["worker_termination_unconfirmed"]; return result; }
    if (active) { result.execution_status = "worker_busy"; result.errors = ["worker_busy"]; return result; }
    active = true;
    try {
      return await new Promise((resolve) => {
        let child, timer, terminationTimer, abortSubscription, reason = null, bytes = 0, closed = false, settled = false;
        const chunks = [];
        try { child = spawnWorker(context); }
        catch { result.errors = ["worker_spawn_failed"]; resolve(result); return; }
        const removeAbort = () => {
          try { abortSubscription?.[Symbol.dispose](); } catch { /* Remove intrinsically below. */ }
          try { if (signal) EventTarget.prototype.removeEventListener.call(signal, "abort", cancel); }
          catch { reason ??= "worker_signal_cleanup_failed"; }
        };
        const stop = (code) => {
          if (closed || settled || terminationTimer !== undefined) return;
          reason ??= code; chunks.length = 0; result.termination_requested = true;
          terminationTimer = setTimeout(() => {
            if (closed || settled) return;
            settled = true; terminationUnconfirmed = true;
            unconfirmedChildren.add(child);
            clearTimeout(timer); removeAbort(); chunks.length = 0;
            result.execution_status = "worker_failed";
            result.errors = ["worker_termination_unconfirmed"];
            resolve(result);
          }, 1000);
          if (Number.isInteger(child.pid) && child.exitCode === null && child.signalCode === null) {
            try { result.termination_signal_sent = child.kill("SIGKILL") === true; } catch { /* Held until close. */ }
          }
        };
        const cancel = () => stop("worker_cancelled");
        const receive = (chunk, retain) => {
          if (settled || reason !== null) return;
          bytes += chunk.length;
          if (bytes > outputLimit) { stop("worker_output_limit"); return; }
          if (!retain && rejectStderr && chunk.length > 0) { stop("worker_stderr"); return; }
          if (retain) chunks.push(chunk);
        };
        child.once("spawn", () => { if (!settled) result.worker_started = true; });
        child.on("error", () => stop(result.worker_started ? "worker_process_error" : "worker_spawn_failed"));
        child.once("exit", (code, signalName) => { if (code !== 0 || signalName !== null) stop("worker_process_failed"); });
        child.stdout.on("data", chunk => receive(chunk, true));
        child.stderr.on("data", chunk => receive(chunk, false));
        child.stdout.on("error", () => stop("worker_stream_error"));
        child.stderr.on("error", () => stop("worker_stream_error"));
        child.once("close", (code, signalName) => {
          closed = true; clearTimeout(timer); clearTimeout(terminationTimer);
          unconfirmedChildren.delete(child);
          if (settled) return; // A late close must not rewrite an already rejected result.
          settled = true; removeAbort();
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
