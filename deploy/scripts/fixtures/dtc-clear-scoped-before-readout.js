// Node-only test harness: never imported by the app, bridge, or vehicle workflow.
import fs from "node:fs";
import vm from "node:vm";
import { createDtcClearFixtureValidators } from "./dtc-clear-scoped-readout-core.js";

const runtime = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(fs.readFileSync(new URL("../../obd-readonly.js", import.meta.url), "utf8"), runtime);

export const { createDtcClearFixtureReceiveWindow, evaluateDtcClearScopedBeforeReadoutFixture, evaluateDtcClearScopedPostReadoutFixture, evaluateDtcClearReadoutSequenceFixture, createDtcClearBeforeDtcEvidenceFixture, createDtcClearPostDtcEvidenceFixture, createDtcClearDtcEvidencePairFixture } = createDtcClearFixtureValidators(runtime.window.ObdReadOnly);
