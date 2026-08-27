import { discoverJ2534RegistryDrivers, runJ2534WorkerReview } from "../local-bridge-readonly.js";

const devices = discoverJ2534RegistryDrivers({ enabled: true, inspectLibraries: true });
const controller = new AbortController();
const cancelReview = () => controller.abort();
process.on("SIGINT", cancelReview);
process.on("SIGTERM", cancelReview);
try {
  const result = await runJ2534WorkerReview(devices, {
    manual_connection_review_confirmed: process.argv.includes("--confirm-manual-review"),
    timeout_ms: 5000,
    signal: controller.signal
  });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.execution_status === "review_completed" ? 0 : result.execution_status === "worker_cancelled" ? 130 : 2;
} finally {
  process.removeListener("SIGINT", cancelReview);
  process.removeListener("SIGTERM", cancelReview);
}
