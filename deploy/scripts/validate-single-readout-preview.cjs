const assert = require('node:assert/strict');

module.exports = async function validateSingleReadoutPreview(page, api) {
  const { createSingleReadoutPreviewSession } = await import('./fixtures/single-readout-preview-session.js');
  const expected = {};
  for (const scenario of ['normal', 'compact', 'no_data', 'conflict', 'missing_prompt', 'codes_present', 'mixed_sources', 'mixed_conflict', 'negative_response']) {
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
  assert(expected.missing_prompt.includes('確認点: 応答の終端記号を確認できません。'));
  assert(expected.mixed_conflict.includes('確認点: DTC応答の件数・内容に不整合があります。'));
  assert(expected.mixed_conflict.includes('確認点: レディネス応答の長さ・内容に不整合があります。'));
  assert(!expected.normal.includes('確認点:'));
  assert(!expected.mixed_sources.includes('不整合があります'));
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
    // Corrupt only the observer's returned copy, after real fixed-sample acquisition.
    // A rejected presentation must retire the owner and clear a previously good DOM.
    {
      let mode = 'normal', active, observed = 0;
      const malformedApi = { ...window.ObdReadOnly,
        evaluateSingleReadoutRawReceipts(input) {
          const result = window.ObdReadOnly.evaluateSingleReadoutRawReceipts(input);
          const readouts = result.readouts.map(row => ({ ...row }));
          if (mode === 'reverse') readouts.reverse();
          if (mode === 'missing') readouts.pop();
          if (mode === 'intent') readouts[0].intent = 'private_invalid_intent';
          if (mode === 'ordinal') readouts[0].ordinal = 2;
          observed++;
          return { ...result, readouts };
        }
      };
      const controller = createSimulatedReviewController(() => {
        active = createSingleReadoutRunPreviewSession(mode === 'normal' ? window.ObdReadOnly : malformedApi);
        return active;
      }, () => active.ready);
      const root = document.createElement('main'); document.body.append(root);
      const attached = attachSingleReadoutPreviewView(root, controller);
      try {
        for (const corruption of ['reverse', 'missing', 'intent', 'ordinal']) {
          mode = 'normal';
          check(await controller.read() && root.querySelector('pre').textContent === expected.normal, 'good baseline before malformed acquisition');
          const previous = active, before = observed;
          mode = corruption;
          const pending = controller.read(), rejected = active;
          check(previous.inspect().text === null, 'previous acquisition retired');
          check(root.querySelector('pre').textContent === '' && root.querySelector('pre').hidden, 'old DOM cleared before malformed completion');
          check(await pending === false && observed === before + 1, 'malformed observer actually reached and rejected');
          check(controller.inspect().status === 'unavailable' && controller.inspect().text === null, 'malformed result unavailable');
          check(root.querySelector('pre').textContent === '' && root.querySelector('pre').hidden, 'malformed result never displayed');
          check(root.querySelector('[role=status]').textContent === '記録を確認できません', 'malformed result status');
          check(root.querySelector('.receipt-failure-reason').textContent === '取得結果の項目構成を確認できません。記録は表示しません。' && !root.querySelector('.receipt-failure-reason').hidden, 'malformed result explains presentation failure');
          check(!root.textContent.includes('private_') && !root.textContent.includes('semantic_observation_unavailable'), 'internal identifiers stay private');
          check(rejected.inspect().text === null && rejected.inspect().reason === 'scope_invalidated', 'rejected owner disposed');
          check(['executionEnabled', 'vehicleCommandEnabled', 'wouldTransmit', 'canExecute'].every(key => controller.inspect()[key] === false), 'malformed result grants no authority');
          mode = 'normal';
          const recovery = controller.read();
          check(root.querySelector('.receipt-failure-reason').textContent === '' && root.querySelector('.receipt-failure-reason').hidden, 'retry immediately clears previous explanation');
          check(await recovery && root.querySelector('pre').textContent === expected.normal, 'explicit acquisition recovers after malformed result');
          check(root.querySelector('.receipt-failure-reason').textContent === '' && root.querySelector('.receipt-failure-reason').hidden, 'recovered result has no stale explanation');
          check(root.querySelector('[role=status]').textContent === '固定の模擬記録を表示中', 'recovery clears failure status');
        }
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
