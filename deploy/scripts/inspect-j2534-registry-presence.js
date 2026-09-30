import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Development-only observation. Enumerate the fixed parent; a failed open or
// enumeration is never interpreted as an absent J2534 registration key.
const COMMAND = String.raw`
$ErrorActionPreference = 'Stop'
$rows = @()
$is64 = [Environment]::Is64BitOperatingSystem
foreach ($view in @('Registry64', 'Registry32')) {
  $status = 'query_failed'
  $base = $null
  $parent = $null
  try {
    if ($view -eq 'Registry64' -and -not $is64) {
      $status = 'view_unavailable'
    } else {
      $registryView = [Microsoft.Win32.RegistryView]::$view
      $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, $registryView)
      $parent = $base.OpenSubKey('SOFTWARE', $false)
      if ($null -eq $parent) { throw 'parent_unavailable' }
      $names = $parent.GetSubKeyNames()
      $status = if ($names -icontains 'PassThruSupport.04.04') { 'listed' } else { 'not_listed' }
    }
  } catch { $status = 'query_failed' }
  finally {
    try { if ($null -ne $parent) { $parent.Dispose() } } catch { $status = 'query_failed' }
    try { if ($null -ne $base) { $base.Dispose() } } catch { $status = 'query_failed' }
  }
  $rows += @{ view = $view; status = $status }
}
@{ is64BitOperatingSystem = $is64; views = $rows } | ConvertTo-Json -Compress -Depth 3
`;

const VIEWS = ["Registry64", "Registry32"];
function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

export function inspectJ2534RegistryPresence({ platform = process.platform, run = execFileSync } = {}) {
  const report = {
    inspection: "j2534_registry_parent_enumeration",
    scope: "HKLM\\SOFTWARE\\PassThruSupport.04.04",
    observation_complete: false,
    views: VIEWS.map(view => ({ view, status: platform === "win32" ? "query_failed" : "unsupported_platform" })),
    driver_inventory_verified: false,
    dll_load_attempted: false,
    vehicle_communication_started: false,
    execution_enabled: false
  };
  if (platform !== "win32") return report;
  try {
    const text = run("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", COMMAND], {
      encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"], timeout: 4000, maxBuffer: 16384
    });
    if (typeof text !== "string" || Buffer.byteLength(text) > 16384) return report;
    const result = JSON.parse(text.replace(/^\uFEFF/, ""));
    if (!exactKeys(result, ["is64BitOperatingSystem", "views"]) || typeof result.is64BitOperatingSystem !== "boolean"
      || !Array.isArray(result.views) || result.views.length !== 2) return report;
    for (const [index, row] of result.views.entries()) {
      if (!exactKeys(row, ["view", "status"]) || row.view !== VIEWS[index]) return report;
      const unavailable = index === 0 && result.is64BitOperatingSystem === false;
      if (unavailable ? row.status !== "view_unavailable" : !["listed", "not_listed", "query_failed"].includes(row.status)) return report;
    }
    report.views = result.views.map(({ view, status }) => ({ view, status }));
    report.observation_complete = report.views.every(row => row.status !== "query_failed");
  } catch { /* No stderr, exception text, parent names or user paths escape. */ }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) {
    console.error("引数は指定できません。固定のJ2534登録先だけを読み取り確認します。");
    process.exitCode = 2;
  } else {
    const report = inspectJ2534RegistryPresence();
    console.log(JSON.stringify(report, null, 2));
    if (!report.observation_complete) process.exitCode = 2;
  }
}
