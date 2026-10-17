import { createSimulatedReviewController } from './monitor-preview-controller.js';
import { createParserConnectionPreview } from './parser-connection-preview.js';

// Trusted synthetic factories/events only. No production connection or transport subscription.
export function createParserConnectionReview(createFixture, subscribeInvalidation, waitForPresentation) {
  if (typeof createFixture !== 'function' || typeof subscribeInvalidation !== 'function') throw new TypeError('fixture_lifecycle_required');
  if (waitForPresentation !== undefined && typeof waitForPresentation !== 'function') throw new TypeError('invalid_preview_scheduler');
  let disposed = false, acquisition = null;
  const pendingAcquisitions = new Set();
  const review = createSimulatedReviewController(() => {
    const fixture = createFixture();
    let preview;
    acquisition = null;
    let ready;
    try { ready = fixture.ready; }
    catch (error) { fixture.owner.invalidate(); throw error; }
    if (ready !== undefined) {
      const pending = Promise.resolve(ready);
      pendingAcquisitions.add(pending);
      acquisition = pending.finally(() => pendingAcquisitions.delete(pending));
      acquisition.catch(() => {}); // A synchronous invalidation may skip the presentation await.
    }
    return Object.freeze({
      inspect() {
        preview ||= createParserConnectionPreview(fixture.owner, fixture.api, fixture.records);
        const result = preview.inspect();
        return { ok: result.state === 'ready', text: result.state === 'ready' ? result.text : null,
          reason: result.state === 'ready' ? null : 'receipt_context_changed' };
      },
      dispose() { preview?.dispose(); fixture.owner.invalidate(); }
    });
  }, async () => {
    const pending = acquisition;
    if (pending) await pending;
    if (waitForPresentation) await waitForPresentation();
  });
  const unsubscribe = subscribeInvalidation(() => { if (!disposed) review.invalidate(); });
  if (typeof unsubscribe !== 'function') { review.invalidate(); throw new TypeError('fixture_unsubscribe_required'); }
  return Object.freeze({
    inspect: () => review.inspect(),
    subscribe: listener => review.subscribe(listener),
    read: () => disposed || pendingAcquisitions.size > 0 ? Promise.resolve(false) : review.read(),
    dispose() {
      if (disposed) return;
      disposed = true;
      // Clear published text even if the event source fails to unsubscribe.
      try { review.invalidate(); } finally { unsubscribe(); }
    }
  });
}
