const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

// Exercise the actual wait loops with resolved false values, without a browser.
(async () => {
  let checks = 0;
  for (const file of ['validate-scanner-file-flow.cjs', 'validate-packaged-browser.cjs']) {
    const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
    assert.doesNotMatch(source, /waitForFunction\(\s*async/);
    const loops = [...source.matchAll(/const cacheDeadline = Date\.now\(\) \+ 60000;[\s\S]*?await new Promise\(resolve => setTimeout\(resolve, 100\)\);\s*}/g)];
    assert.equal(loops.length, 1, file + ': exact readiness loop required');
    const loop = new vm.Script(`(async () => { ${loops[0][0]} })()`);
    let calls = 0, pauses = 0;
    const run = (evaluate, now = () => 0) => loop.runInNewContext({
      page: { evaluate }, manifest: {}, assert, Date: { now },
      setTimeout(resolve, delay) { assert.equal(delay, 100); pauses += 1; resolve(); }
    });
    await run(async () => { calls += 1; return calls === 3; });
    assert.equal(calls, 3, file + ': resolved false must not pass');
    assert.equal(pauses, 2);
    calls = pauses = 0;
    await run(async () => { calls += 1; return true; });
    assert.equal(calls, 1); assert.equal(pauses, 0);
    let clock = 0;
    await assert.rejects(run(async () => false, () => { clock += 30001; return clock; }), /Complete offline cache did not become ready/);
    const error = new Error('synthetic page closed');
    await assert.rejects(run(async () => { throw error; }), value => value === error);
    checks += 8;
  }
  console.log(`Browser cache wait checks: ${checks} / Errors: 0`);
})().catch(error => { console.error(error); process.exitCode = 1; });
