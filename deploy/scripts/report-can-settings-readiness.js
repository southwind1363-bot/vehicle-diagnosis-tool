// Development audit only: synthetic acknowledgements, no application or transport execution.
import fs from "node:fs";
import vm from "node:vm";
import { pathToFileURL } from "node:url";

export function buildCanSettingsReadinessReport() {
  const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
  const context = vm.createContext({});
  const factory = source.match(/function createReadOnlySettingsObservation\([^\n]*\) \{[\s\S]*?\r?\n\}/)?.[0];
  const allowlist = source.match(/const WEB_SERIAL_READ_ONLY_COMMANDS = Object\.freeze\(\[[\s\S]*?\]\);/)?.[0];
  const gate = source.match(/function isAllowedObdDeveloperCommand\([^\n]*\) \{[\s\S]*?\r?\n\}/)?.[0];
  if (!factory || !allowlist || !gate) throw new Error("settings_audit_source_boundary_changed");
  vm.runInContext([factory, allowlist, gate].join("\n"), context);
  const commands = [["can_auto_format", "ATCAF1"], ["dlc_display", "ATD0"], ["can_addressing", "ATCEA"]];
  const scenarios = [];
  for (const protocol of [null, "A6", "A8", "A7", "A9", "A0"]) {
    const owner = context.createReadOnlySettingsObservation(), ticket = owner.begin();
    for (const command of ["ATZ", "ATE0", "ATL0", "ATS0", "ATH1", "ATSP0", "ATCAF1", "ATD0", "ATCEA"]) {
      if (!owner.recordInitialization(ticket, command, command === "ATZ" ? "Synthetic banner" : "OK").ok)
        throw new Error("settings_audit_initialization_changed");
    }
    if (protocol !== null && !owner.recordProtocol(ticket, protocol).ok) throw new Error("settings_audit_protocol_changed");
    const summary = owner.inspect(ticket).summary;
    scenarios.push({ protocolReport: protocol, phase: summary.phase,
      supported11bitReported: summary.protocol11bitReported,
      missingSettings: Array.from(summary.missingSettings),
      profile: summary.profile, profileVerified: summary.profileVerified,
      executionEnabled: summary.executionEnabled, realTransportProofAvailable: summary.realTransportProofAvailable });
    owner.invalidate();
    if (owner.inspect(ticket).summary !== null) throw new Error("settings_audit_expired_generation_reused");
  }
  return { sourceVersion: source.match(/const APP_VERSION = "([^"]+)";/)?.[1] || null,
    provenance: "synthetic_source_audit", vehicleTestPerformed: false,
    commands: commands.map(([setting, command]) => ({ setting, command,
      allowedByProduction: context.isAllowedObdDeveloperCommand(command) })),
    clearCommandAllowed: context.isAllowedObdDeveloperCommand("04"), scenarios };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(buildCanSettingsReadinessReport(), null, 2));
