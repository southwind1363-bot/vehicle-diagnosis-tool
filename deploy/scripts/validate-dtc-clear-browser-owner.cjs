const assert = require('node:assert/strict');

module.exports = async function validateBrowserOwner(page, expectedText) {
  const result = await page.evaluate(async expected => {
    const { createDtcClearBrowserPreviewSession } = await import('./dtc-clear-browser-preview-session.js');
    const { createSimulatedReviewController } = await import('./monitor-preview-controller.js');
    const { attachMonitorPreviewView } = await import('./monitor-preview-view.js');
    let checks = 0;
    const check = (value, message) => { if (!value) throw new Error(message); checks++; };
    const sessions = [], gates = [];
    const review = createSimulatedReviewController(() => {
      const session = createDtcClearBrowserPreviewSession(window.ObdReadOnly);
      sessions.push(session);
      check(Object.isFrozen(session) && Object.keys(session).join(',') === 'inspect,dispose', 'private owner surface');
      return session;
    }, () => new Promise((resolve, reject) => gates.push({ resolve, reject })));
    const container = document.createElement('main');
    document.body.append(container);
    let view = attachMonitorPreviewView(container, review);
    const output = () => container.querySelector('pre');
    const blank = () => !output() || (output().hidden && output().textContent === '');
    const ready = () => {
      check(review.inspect().status === 'ready', 'ready status');
      check(output().textContent === expected && !output().hidden, 'raw receipt derived DOM matches Node');
      check(['executionEnabled', 'vehicleCommandEnabled', 'wouldTransmit', 'canExecute'].every(k => review.inspect()[k] === false), 'no authority');
    };
    const closed = session => check(!session.inspect().ok && session.inspect().reason === 'scope_invalidated', 'owner scope invalidated');
    const close = () => { view.dispose(); review.invalidate(); };
    try {
      const first = review.read();
      check(blank() && review.inspect().status === 'reading', 'initial reading blank');
      gates[0].resolve(); check(await first, 'initial read'); ready();
      const update = review.read();
      check(blank(), 'update synchronously clears old DOM'); closed(sessions[0]);
      check(await review.read() === false && sessions.length === 2, 'duplicate read rejected');
      review.invalidate(); check(blank(), 'invalidation clears DOM'); closed(sessions[1]);
      gates[1].resolve(); check(await update === false && blank(), 'late success after invalidation');

      const closing = review.read();
      close(); closed(sessions[2]);
      check(container.childElementCount === 0, 'close removes view');
      gates[2].resolve(); check(await closing === false && container.childElementCount === 0, 'late success after close');
      view = attachMonitorPreviewView(container, review);
      check(blank(), 'reopened view starts blank');
      const oldFailure = review.read(); close(); closed(sessions[3]);
      view = attachMonitorPreviewView(container, review);
      const fresh = review.read();
      check(sessions[4] !== sessions[3], 'fresh owned session');
      gates[4].resolve(); check(await fresh, 'fresh success'); ready();
      gates[3].reject(new Error('private old failure'));
      check(await oldFailure === false, 'old failure rejected'); ready();

      const failure = review.read(); check(blank(), 'failure attempt clears old DOM'); closed(sessions[4]);
      gates[5].reject(new Error('private current failure'));
      check(await failure === false && review.inspect().status === 'unavailable' && blank(), 'current failure blank');
      closed(sessions[5]);
      check(!container.textContent.includes('private'), 'exception hidden');
      const recovery = review.read(); gates[6].resolve(); check(await recovery, 'explicit recovery'); ready();
      close(); close(); closed(sessions[6]);
      check(container.childElementCount === 0, 'idempotent close');
      return { checks, sessions: sessions.length };
    } finally { close(); container.remove(); }
  }, expectedText);
  assert.equal(result.sessions, 7);
  assert(result.checks >= 40);
  console.log(`Fixed receipt browser owner/controller/DOM: ${result.checks} assertions passed`);
};
