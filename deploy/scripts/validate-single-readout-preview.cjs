const assert = require('node:assert/strict');

module.exports = async function validateSingleReadoutPreview(page, api) {
  const { createSingleReadoutPreviewSession } = await import('./fixtures/single-readout-preview-session.js');
  const expected = {};
  for (const scenario of ['normal', 'compact', 'no_data', 'conflict', 'missing_prompt', 'codes_present', 'mixed_sources']) {
    const session = createSingleReadoutPreviewSession(api, scenario);
    expected[scenario] = session.inspect().text;
    assert.equal(typeof expected[scenario], 'string');
    session.dispose(); session.dispose();
    assert.equal(session.inspect().ok, false);
  }
  assert(!expected.no_data.includes('報告元からコード0件の応答'));
  assert(expected.no_data.includes('NO DATA報告あり'));
  assert(expected.conflict.includes('保存DTC: 判定保留'));
  assert(expected.missing_prompt.includes('応答形式: 確認できません'));
  assert.throws(() => createSingleReadoutPreviewSession(api, '{}'));
  const grammarOnly = createSingleReadoutPreviewSession({ parseElmReadOnlyRawTranscript: api.parseElmReadOnlyRawTranscript });
  assert.equal(grammarOnly.inspect().reason, 'semantic_observation_unavailable'); grammarOnly.dispose();
  const checks = await page.evaluate(async expected => {
    const { createSingleReadoutPreviewSession } = await import('./single-readout-preview-session.js');
    const { createSingleReadoutRunPreviewSession } = await import('./single-readout-run-preview-session.js');
    const { attachSingleReadoutPreviewView } = await import('./single-readout-preview-view.js');
    const { createSimulatedReviewController } = await import('./monitor-preview-controller.js');
    let checks = 0, scenario = 'normal';
    const check = (condition, name) => { if (!condition) throw new Error(name); checks++; };
    for (const phase of ['factory', 'inspect', 'text']) {
      for (const replace of [false, true]) {
        let controller, newer, calls = 0;
        const disposed = [], published = [];
        const cancel = () => { controller.invalidate(); if (replace) newer = controller.read(); };
        controller = createSimulatedReviewController(() => {
          const id = ++calls;
          const session = {
            inspect() {
              if (id === 1 && phase === 'inspect') cancel();
              return { ok: true, get text() {
                if (id === 1 && phase === 'text') cancel();
                return id === 1 ? 'stale' : 'fresh';
              } };
            },
            dispose() { disposed.push(id); }
          };
          if (id === 1 && phase === 'factory') cancel();
          return session;
        });
        controller.subscribe(value => published.push(value.text));
        check(await controller.read() === false, 'callback cancellation rejects old read');
        if (replace) check(await newer && controller.inspect().text === 'fresh', 'newer result survives callback replacement');
        else check(controller.inspect().status === 'invalidated' && controller.inspect().text === null, 'cancelled text stays hidden');
        check(!published.includes('stale'), 'old result never published');
        check(disposed.join(',') === '1', 'old callback cannot dispose new owner');
        controller.invalidate();
        check(disposed.join(',') === (replace ? '1,2' : '1'), 'each owner released once');
      }
    }
    for (const [scenario, text] of Object.entries(expected)) {
      const session = createSingleReadoutRunPreviewSession(window.ObdReadOnly, scenario);
      check(!session.inspect().ok, 'acquisition is initially pending');
      await session.ready;
      check(session.inspect().ok && session.inspect().text === text, 'async acquisition matches existing rendering');
      session.dispose(); check(session.inspect().text === null, 'completed acquisition disposal');
      const pending = createSingleReadoutRunPreviewSession(window.ObdReadOnly, scenario);
      pending.dispose(); await pending.ready;
      check(!pending.inspect().ok && pending.inspect().text === null, 'cancelled acquisition cannot publish late text');
    }
    // A failing cleanup must clear an attached view, contain its private error,
    // and forbid recursive reads without preventing a later explicit read.
    {
      let controller, calls = 0, nested;
      controller = createSimulatedReviewController(() => {
        const id = ++calls;
        return {
          inspect() { return { ok: true, text: id === 1 ? 'old' : 'fresh' }; },
          dispose() {
            if (id !== 1) return;
            controller.invalidate(); nested = controller.read();
            throw new Error('private_cleanup_detail');
          }
        };
      });
      const root = document.createElement('main'); document.body.append(root);
      const attached = attachSingleReadoutPreviewView(root, controller);
      try {
        check(await controller.read(), 'initial cleanup fixture ready');
        check(root.querySelector('pre').textContent === 'old', 'initial text visible');
        controller.invalidate();
        check(await nested === false && calls === 1, 'no reentrant acquisition');
        check(root.querySelector('pre').textContent === '' && root.querySelector('pre').hidden, 'cleanup failure clears DOM');
        check(root.querySelector('[role=status]').textContent === '記録を確認できません', 'cleanup failure status');
        check(!root.textContent.includes('private_'), 'cleanup error is private');
        check(await controller.read() && root.querySelector('pre').textContent === 'fresh', 'explicit read recovers');
      } finally { controller.invalidate(); attached.dispose(); root.remove(); }
    }
    const sessions = [], gates = [];
    const review = createSimulatedReviewController(() => {
      const session = createSingleReadoutPreviewSession(window.ObdReadOnly, scenario);
      sessions.push(session); return session;
    }, () => new Promise((resolve, reject) => gates.push({ resolve, reject })));
    const container = document.createElement('main'); document.body.append(container);
    let view = attachSingleReadoutPreviewView(container, review);
    const close = () => { view.dispose(); review.invalidate(); };
    try {
      for (const name of Object.keys(expected)) {
        scenario = name;
        const reading = review.read();
        check(container.querySelector('pre').textContent === '', 'synchronous clearing');
        check(container.querySelector('[role=status]').textContent === '一回分の記録を確認中', 'single-readout status');
        if (sessions.length > 1) check(!sessions.at(-2).inspect().ok, 'old owner disposed');
        gates.at(-1).resolve(); check(await reading, 'read completion');
        check(container.querySelector('pre').textContent === expected[name], 'Node/browser text parity');
        check(container.querySelector('h2').textContent === '模擬の一回分の記録', 'single-readout heading');
        check(['executionEnabled', 'vehicleCommandEnabled', 'wouldTransmit', 'canExecute'].every(key => review.inspect()[key] === false), 'no authority');
      }
      const pending = review.read(), oldGate = gates.at(-1), oldSession = sessions.at(-1);
      close(); check(container.childElementCount === 0 && !oldSession.inspect().ok, 'close disposes owner');
      view = attachSingleReadoutPreviewView(container, review); scenario = 'normal';
      const newer = review.read(); gates.at(-1).resolve(); check(await newer, 'fresh read');
      oldGate.reject(new Error('private late error')); check(await pending === false, 'late failure rejected');
      check(container.querySelector('pre').textContent === expected.normal, 'late failure cannot clear new view');
      const late = review.read(), lateGate = gates.at(-1);
      close(); lateGate.resolve(); check(await late === false && container.childElementCount === 0, 'late success rejected');
      view = attachSingleReadoutPreviewView(container, review);
      const failed = review.read(); gates.at(-1).reject(new Error('private error'));
      check(await failed === false && container.querySelector('pre').textContent === '', 'current failure empty');
      check(!sessions.at(-1).inspect().ok && !container.textContent.includes('private'), 'failure disposal and privacy');
      return checks;
    } finally { close(); container.remove(); }
  }, expected);
  console.log(`Single-readout preview: ${Object.keys(expected).length} sample cases / ${checks} browser lifecycle checks passed`);
};
