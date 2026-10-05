// Node-only assembly of a fixed local module list for the standalone offline demo.
import fs from "node:fs";

export function createMonitorPreviewBrowserSource() {
  const files = [
    ["dtc-clear-readout-scope.js", [], ["inspectDtcClearReadoutFixtureScope", "createDtcClearReadoutFixtureScope"]],
    ["dtc-clear-scoped-readout-core.js", ['import { inspectDtcClearReadoutFixtureScope } from "./dtc-clear-readout-scope.js";'], ["createDtcClearFixtureValidators"]],
    ["dtc-clear-browser-sample.js", ['import { createDtcClearReadoutFixtureScope } from "./dtc-clear-readout-scope.js";'], ["createDtcClearBrowserFixtureInput"]],
    ["dtc-clear-browser-preview-session.js", [
      'import { createDtcClearFixtureValidators } from "./dtc-clear-scoped-readout-core.js";',
      'import { createDtcClearBrowserFixtureInput } from "./dtc-clear-browser-sample.js";'
    ], ["createDtcClearBrowserPreviewSession"]]
  ];
  const modules = files.map(([file, imports, exports]) => {
    let source = fs.readFileSync(new URL(file, import.meta.url), "utf8").replace(/\r\n?/g, "\n");
    // This is a closed manifest, not a general JavaScript bundler. Source changes fail closed.
    for (const statement of imports) {
      if (source.split(statement).length !== 2) throw new Error("preview_import_manifest_changed");
      source = source.replace(statement, "");
    }
    for (const name of exports) {
      const declaration = `export function ${name}(`;
      if (source.split(declaration).length !== 2) throw new Error("preview_export_manifest_changed");
      source = source.replace(declaration, `function ${name}(`);
    }
    if (/^\s*(?:import|export)\s/m.test(source)) throw new Error("preview_module_manifest_changed");
    return `const { ${exports.join(", ")} } = (() => {\n${source}\nreturn { ${exports.join(", ")} };\n})();`;
  }).join("\n");
  const runtime = fs.readFileSync(new URL("../../obd-readonly.js", import.meta.url), "utf8");
  // The runtime receives private capability-free host objects, not the page's window/navigator.
  const source = `const fixtureApi = (() => { const window = {}, navigator = {};\n${runtime}\nreturn window.ObdReadOnly; })();\n${modules}`;
  if (/<\/script|<!--/i.test(source)) throw new Error("unsafe_preview_script_source");
  return source;
}
