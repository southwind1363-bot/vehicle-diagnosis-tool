import { createSimulatedReviewController } from './monitor-preview-controller.js';
import { createParserConnectionPreview } from './parser-connection-preview.js';

// Trusted synthetic factories/events only. No production connection or transport subscription.
export function createParserConnectionReview(createFixture, subscribeInvalidation, waitForPresentation) {
  if (typeof createFixture !== 'function' || typeof subscribeInvalidation !== 'function') throw new TypeError('fixture_lifecycle_required');
  let disposed = false;
  const review = createSimulatedReviewController(() => {
    const fixture = createFixture();
    let preview;
    try { preview = createParserConnectionPreview(fixture.owner, fixture.api, fixture.records); }
    catch (error) { fixture.owner.invalidate(); throw error; }
    return Object.freeze({
      inspect() {
        const result = preview.inspect();
        return { ok: result.state === 'ready', text: result.state === 'ready' ? result.text : null,
          reason: result.state === 'ready' ? null : 'receipt_context_changed' };
      },
      dispose() { preview.dispose(); fixture.owner.invalidate(); }
    });
  }, waitForPresentation);
  const unsubscribe = subscribeInvalidation(() => { if (!disposed) review.invalidate(); });
  if (typeof unsubscribe !== 'function') { review.invalidate(); throw new TypeError('fixture_unsubscribe_required'); }
  return Object.freeze({
    inspect: () => review.inspect(),
    subscribe: listener => review.subscribe(listener),
    read: () => disposed ? Promise.resolve(false) : review.read(),
    dispose() {
      if (disposed) return;
      disposed = true;
      // Clear published text even if the event source fails to unsubscribe.
      try { review.invalidate(); } finally { unsubscribe(); }
    }
  });
}
