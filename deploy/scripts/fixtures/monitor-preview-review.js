// Node-only owner: input is always the fixed simulated receipt fixture.
import { createMonitorPairPreviewSession } from "../preview-dtc-clear-monitor-pairs.js";
import { createSimulatedReviewController } from "./monitor-preview-controller.js";

export function createMonitorPreviewReview(waitForPresentation = () => Promise.resolve()) {
  return createSimulatedReviewController(createMonitorPairPreviewSession, waitForPresentation);
}
