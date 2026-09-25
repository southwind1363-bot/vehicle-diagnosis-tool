import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validatePackagedLocalImports } from "./package-workstation.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "package-imports-"));
const write = (file, source) => fs.writeFileSync(path.join(root, file), source);
write("entry.js", "import './child.js'; throw Error('must never execute');");
write("child.js", "export { value } from './leaf.js';");
write("leaf.js", "export const value = 1;");
validatePackagedLocalImports(root, ["entry.js"]);
write("leaf.js", "import './entry.js'; export const value = 1;");
validatePackagedLocalImports(root, ["entry.js"]);
for (const source of ["import './missing.js';", "export * from './missing.js';",
  "import '../outside.js';", "import './leaf.js?query';", "export const = ;"]) {
  write("child.js", source);
  assert.throws(() => validatePackagedLocalImports(root, ["entry.js"]),
    error => error.message === "workstation_package_local_import_invalid");
}
write("child.js", "// import './missing.js';\nexport const text = \"import './missing.js'\";");
validatePackagedLocalImports(root, ["entry.js"]);
console.log("Package static imports: transitive closure, cycles, missing/re-export/outside/syntax rejection and non-execution passed");
