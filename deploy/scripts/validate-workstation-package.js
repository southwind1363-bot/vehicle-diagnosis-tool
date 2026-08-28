import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { packageWorkstation } from "./package-workstation.js";

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };
const root = fs.mkdtempSync(path.join(os.tmpdir(), "vehicle package & test-"));
let next = 0;
function fixture() {
  const sourceDirectory = path.join(root, `source-${next}`);
  const outputDirectory = path.join(root, `output-${next++}`);
  fs.mkdirSync(path.join(sourceDirectory, "scripts"), { recursive: true });
  const assets = ["./", "index.html", "style.css", "script.js", "obd-readonly.js", "local-bridge-readonly.js", "manifest.webmanifest", "service-worker.js"];
  for (const asset of assets.filter((asset) => asset !== "./")) fs.writeFileSync(path.join(sourceDirectory, asset), "fixture");
  fs.writeFileSync(path.join(sourceDirectory, "script.js"), 'const APP_VERSION = "1.0.0";');
  fs.writeFileSync(path.join(sourceDirectory, "service-worker.js"), 'const CACHE_VERSION = "1.0.0";');
  fs.writeFileSync(path.join(sourceDirectory, "offline-assets.json"), JSON.stringify({ version: "1.0.0", asset_count: assets.length, assets }));
  for (const entry of ["start-workstation.cmd", "scripts/start-local-workstation.js", "scripts/workstation-assets.js", "scripts/j2534-readonly-worker.js"]) fs.writeFileSync(path.join(sourceDirectory, entry), "fixture");
  const pkg = { name: "fixture", version: "1.0.0", type: "module", dependencies: { express: "1.0.0" } };
  const lock = { lockfileVersion: 3, packages: { "": { name: pkg.name, version: pkg.version, dependencies: pkg.dependencies } } };
  for (const name of ["node_modules/express", "node_modules/express/node_modules/nested"]) {
    fs.mkdirSync(path.join(sourceDirectory, name), { recursive: true });
    fs.writeFileSync(path.join(sourceDirectory, name, "package.json"), JSON.stringify({ name: path.basename(name), version: "1.0.0", dependencies: name === "node_modules/express" ? { nested: "1.0.0" } : {}, exports: name.endsWith("/nested") ? { "./item": "./index.js", "./package.json": "./package.json" } : undefined }));
    fs.writeFileSync(path.join(sourceDirectory, name, "index.js"), "module.exports = {};");
    fs.writeFileSync(path.join(sourceDirectory, name, "LICENSE"), "fixture-license");
    lock.packages[name] = { version: "1.0.0", resolved: "https://registry.npmjs.org/example/-/example-1.0.0.tgz" };
  }
  fs.writeFileSync(path.join(sourceDirectory, "package.json"), JSON.stringify(pkg));
  fs.writeFileSync(path.join(sourceDirectory, "package-lock.json"), JSON.stringify(lock));
  return { sourceDirectory, outputDirectory, lock };
}
const run = (code, args, environment = {}) => new Promise((resolve) => {
  const env = { ...process.env, ...environment, NODE_PATH: "" };
  delete env.NODE_OPTIONS;
  delete env.LOCAL_BRIDGE_REPLAY_LOG;
  const child = execFile(process.execPath, ["--input-type=module", "-e", code, ...args], { cwd: os.tmpdir(), env, windowsHide: true, timeout: 15000 },
    (error, stdout, stderr) => resolve({ code: error?.code ?? 0, output: stdout + stderr }));
  child.stdin.end();
});
try {
  const valid = fixture();
  fs.writeFileSync(path.join(valid.sourceDirectory, ".env"), "private-fixture");
  fs.writeFileSync(path.join(valid.sourceDirectory, "saved-case.json"), "private-fixture");
  fs.mkdirSync(path.join(valid.sourceDirectory, "node_modules", "extraneous"));
  fs.writeFileSync(path.join(valid.sourceDirectory, "node_modules", "extraneous", "private.txt"), "private-fixture");
  const result = packageWorkstation(valid);
  check(result.dependencyCount === 2 && result.includesNode === false, "Package metadata overstated runtime or dependencies");
  check(!fs.existsSync(path.join(result.directory, ".env")) && !fs.existsSync(path.join(result.directory, "saved-case.json"))
    && !fs.existsSync(path.join(result.directory, "node_modules", "extraneous")), "Package included unlisted private files");
  check(fs.readFileSync(path.join(result.directory, "node_modules/express/node_modules/nested/LICENSE"), "utf8") === "fixture-license", "Nested dependency or license was omitted");
  const packaged = JSON.parse(fs.readFileSync(path.join(result.directory, "package.json"), "utf8"));
  const instructions = fs.readFileSync(path.join(result.directory, "README.txt"), "utf8");
  check(instructions.includes("Node.js 22以降") && instructions.includes("24 LTS"), "Package instructions omitted the runtime prerequisite");
  check(packaged.scripts.start === "node scripts/start-local-workstation.js" && Object.keys(packaged.scripts).length === 2, "Package retained unavailable development commands");
  assert.throws(() => packageWorkstation(valid), /workstation_package_exists/);
  check(fs.readdirSync(valid.outputDirectory).length === 1, "Repeated packaging modified an existing package or leaked staging files");

  for (const kind of ["directory", "file", "junction", "busy", "mismatch", "missing", "secret", "source-link", "output-link", "registry"]) {
    const item = fixture();
    fs.mkdirSync(item.outputDirectory);
    const destination = path.join(item.outputDirectory, "vehicle-diagnosis-tool-1.0.0");
    if (kind === "directory") fs.mkdirSync(destination);
    if (kind === "file") fs.writeFileSync(destination, "retain");
    if (kind === "junction") fs.symlinkSync(valid.sourceDirectory, destination, process.platform === "win32" ? "junction" : "dir");
    if (kind === "busy") fs.writeFileSync(path.join(item.outputDirectory, ".workstation-1.0.0.lock"), "retain");
    if (kind === "mismatch") fs.writeFileSync(path.join(item.sourceDirectory, "node_modules/express/package.json"), '{"version":"2.0.0"}');
    if (kind === "missing") fs.unlinkSync(path.join(item.sourceDirectory, "node_modules/express/package.json"));
    if (kind === "secret") fs.writeFileSync(path.join(item.sourceDirectory, "node_modules/express/.env"), "retain");
    if (kind === "source-link") {
      fs.symlinkSync(valid.sourceDirectory, path.join(item.sourceDirectory, "linked"), process.platform === "win32" ? "junction" : "dir");
      item.sourceDirectory = path.join(item.sourceDirectory, "linked");
    }
    if (kind === "output-link") {
      fs.symlinkSync(valid.outputDirectory, path.join(item.outputDirectory, "linked"), process.platform === "win32" ? "junction" : "dir");
      item.outputDirectory = path.join(item.outputDirectory, "linked", "child");
    }
    if (kind === "registry") {
      item.lock.packages["node_modules/express"].resolved = "https://user:secret@registry.npmjs.org/example.tgz";
      fs.writeFileSync(path.join(item.sourceDirectory, "package-lock.json"), JSON.stringify(item.lock));
    }
    assert.throws(() => packageWorkstation(item), kind.endsWith("-link") ? /workstation_package_link_not_allowed/ : undefined);
    check(!fs.existsSync(item.outputDirectory) || !fs.readdirSync(item.outputDirectory).some((name) => name.startsWith(".workstation-staging-")), `${kind}: failed build leaked staging`);
    if (kind === "file") check(fs.readFileSync(destination, "utf8") === "retain", "Existing output was overwritten");
  }

  for (const asset of ["data/.env", "data/.npmrc", "data/session.key", "node_modules/extraneous/private.txt"]) {
    const item = fixture();
    const manifestPath = path.join(item.sourceDirectory, "offline-assets.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.assets.push(asset);
    manifest.asset_count += 1;
    fs.mkdirSync(path.dirname(path.join(item.sourceDirectory, asset)), { recursive: true });
    fs.writeFileSync(path.join(item.sourceDirectory, asset), "private-fixture");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(() => packageWorkstation(item), /workstation_package_(private_file|asset_invalid)/);
    check(fs.readdirSync(item.outputDirectory).length === 0, "Manifest private entry leaked output");
  }
  for (const name of ["package.json", "package-lock.json", "offline-assets.json"]) {
    const item = fixture();
    const manifestPath = path.join(item.sourceDirectory, name);
    fs.unlinkSync(manifestPath);
    // Windows file symlinks require a privilege that ordinary workstation users lack.
    fs.symlinkSync(process.platform === "win32" ? valid.sourceDirectory : path.join(valid.sourceDirectory, name), manifestPath, process.platform === "win32" ? "junction" : "file");
    assert.throws(() => packageWorkstation(item), /workstation_package_link_not_allowed/);
    check(!fs.existsSync(item.outputDirectory), "Linked input manifest reached output creation");
  }

  const competing = fixture();
  const moduleUrl = new URL("./package-workstation.js", import.meta.url).href;
  const builder = `import {packageWorkstation} from ${JSON.stringify(moduleUrl)};try{packageWorkstation({sourceDirectory:process.argv[1],outputDirectory:process.argv[2]});console.log("created");}catch(error){console.log(error.message);process.exitCode=1;}`;
  const races = await Promise.all([run(builder, [competing.sourceDirectory, competing.outputDirectory]), run(builder, [competing.sourceDirectory, competing.outputDirectory])]);
  check(races.filter((value) => value.code === 0).length === 1 && races.some((value) => /workstation_package_(busy|exists)/.test(value.output)), "Concurrent builders did not protect publication");
  check(fs.readdirSync(competing.outputDirectory).length === 1, "Concurrent publication left locks or staging behind");

  const actual = packageWorkstation({ outputDirectory: path.join(root, "relocated") });
  const smoke = `
    import assert from "node:assert/strict";
    import fs from "node:fs";
    import path from "node:path";
    import {pathToFileURL} from "node:url";
    import {validatePackagedDependencies} from ${JSON.stringify(moduleUrl)};
    const root=process.argv[1];
    validatePackagedDependencies(root);
    assert(fs.existsSync(path.join(root,"scripts/j2534-readonly-worker.js")));
    fs.writeFileSync(path.join(root,"saved-session.json"),"private-fixture");
    fs.writeFileSync(path.join(root,"data","saved-session.json"),"private-fixture");
    const {startLocalWorkstation}=await import(pathToFileURL(path.join(root,"scripts/start-local-workstation.js")));
    let app;
    try {
      app=await startLocalWorkstation({webPort:0,bridgePort:0,j2534RegistryText:""});
      const response=await fetch(app.webUrl);
      assert.equal(response.status,200);
      await response.arrayBuffer();
      for(const file of ["/saved-session.json","/data/saved-session.json","/package-info.json","/node_modules/express/package.json","/scripts/start-local-workstation.js"]) {
        const denied=await fetch(app.webUrl+file);
        assert.equal(denied.status,404);
        assert.equal(await denied.text(),"");
      }
      console.log("static-private-denied");
      const health=await(await fetch(app.bridgeUrl+"/health")).json();
      assert.equal(health.vehicle_command_enabled,false);
      assert.equal(health.sample_readouts_enabled,false);
      console.log("isolated-ready");
    } finally {await app?.close();}
  `;
  const healthy = await run(smoke, [actual.directory]);
  check(healthy.code === 0 && healthy.output.includes("isolated-ready"), `Relocated package failed isolated startup: ${healthy.output}`);
  check(healthy.code === 0 && healthy.output.includes("static-private-denied"), "Relocated package exposed local-only files over HTTP");
  const manifestPath = path.join(actual.directory, "offline-assets.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.assets = manifest.assets.filter((asset) => asset !== "./");
  manifest.asset_count = manifest.assets.length;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const withoutRootAlias = await run(smoke, [actual.directory]);
  check(withoutRootAlias.code === 0 && withoutRootAlias.output.includes("isolated-ready"), "Valid index.html-only manifest lost the launcher root URL");
  const dependency = path.join(actual.directory, "node_modules/accepts/index.js");
  fs.renameSync(dependency, `${dependency}.disabled`);
  const broken = await run(smoke, [actual.directory]);
  check(broken.code !== 0 && !broken.output.includes("isolated-ready"), "Relocated package borrowed a missing dependency from the development environment");
  fs.renameSync(`${dependency}.disabled`, dependency);
  const fallbackDirectory = path.join(root, "fallback");
  fs.mkdirSync(fallbackDirectory);
  fs.renameSync(path.join(actual.directory, "node_modules/accepts"), path.join(fallbackDirectory, "accepts"));
  const incompleteLockPath = path.join(actual.directory, "package-lock.json");
  const incompleteLock = JSON.parse(fs.readFileSync(incompleteLockPath, "utf8"));
  delete incompleteLock.packages["node_modules/accepts"];
  fs.writeFileSync(incompleteLockPath, JSON.stringify(incompleteLock));
  const fallback = await run(`import assert from "node:assert/strict";import path from "node:path";import Module,{createRequire} from "node:module";import {validatePackagedDependencies} from ${JSON.stringify(moduleUrl)};process.env.NODE_PATH=process.argv[2];Module._initPaths();const require=createRequire(path.join(process.argv[1],"node_modules/express/package.json"));assert.equal(require.resolve("accepts"),path.join(process.argv[2],"accepts/index.js"));assert.throws(()=>validatePackagedDependencies(process.argv[1]),/workstation_package_external_dependency/);console.log("fallback-rejected");`, [actual.directory, fallbackDirectory]);
  check(fallback.code === 0 && fallback.output.includes("fallback-rejected"), `External transitive dependency escaped confinement: ${fallback.output}`);
} finally {
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
  assert(path.basename(root).startsWith("vehicle package & test-"));
  fs.rmSync(root, { recursive: true, force: true });
}
console.log(`Workstation package checks: ${checks} / Errors: 0`);
