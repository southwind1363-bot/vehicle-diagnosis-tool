const assert = require('node:assert/strict');

module.exports = async function validateReadOnlyCaptureBrowser(page, api) {
  const { runCaptureBrowserCases } = await import('./fixtures/readonly-capture-browser-cases.js');
  const expected = JSON.parse(JSON.stringify(runCaptureBrowserCases(api)));
  for (const result of expected.summaries) {
    assert.equal(result.ok, true);
    assert.equal(result.summary.status, 'finished');
    assert.equal(result.summary.rawTranscriptValidation.status, 'parsed');
    assert.equal(result.summary.vehicleCommandEnabled, false);
    assert.deepEqual(result, expected.summaries[0]);
  }
  assert.equal(expected.invalidated.summary, null);
  assert.equal(expected.overflow.reason, 'transcript_limit');
  assert.equal(expected.rejected.summary, null);
  assert.equal(expected.delayed.reason, 'unknown_or_expired_command');
  assert(expected.operations.every(row => row.ok || ['unknown_or_expired_attempt',
    'unknown_or_expired_command', 'transcript_limit'].includes(row.reason)));
  const actual = await page.evaluate(async () => {
    const { runCaptureBrowserCases } = await import('/readonly-capture-browser-cases.js');
    return runCaptureBrowserCases(window.ObdReadOnly);
  });
  assert.deepEqual(actual, expected, 'Chunk capture differs between Node and Chromium');
  console.log(`Read-only capture Node/Chromium parity: ${expected.operations.length} operations, 3 chunk sizes, stale/forged tickets, overflow and disposal passed`);
};
