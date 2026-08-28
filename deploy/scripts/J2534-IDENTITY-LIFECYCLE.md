# J2534 Adapter Identity Lifecycle

Development-only building block: `j2534-identity-lifecycle.js` sequences an
injected transport's `open(null)`, `readVersion(deviceId)`, and `close(deviceId)`.
It is not imported by the public bridge or packaged worker. There is no native
DLL loader, transport discovery, CLI operation, vehicle channel, or automatic
retry in this module. It does not make J2534 hardware usable yet.

## Contract

- `open(null)` returns `{ status, device_id }`. A successful status is numeric
  zero; device IDs are unsigned 32-bit integers including zero. No coercion.
- `readVersion(deviceId)` returns `{ status, firmware, dll, api }`. The three
  version fields are 80-byte `Uint8Array` buffers with an in-buffer NUL. Bytes
  before NUL must be printable ASCII; blank/invalid fields are null and the
  probe fails rather than inventing version or compatibility information.
- `close(deviceId)` returns `{ status }`. Status codes are signed 32-bit integers.
  Unknown numeric failure codes are retained without guessed explanations.
- Methods retain the injected object's `this`. Only the three methods above
  are used. The injection point is trusted internal code, not a sandbox for
  arbitrary callbacks or a public request dispatcher.

The result contains independent step attempts/status codes, a primary status,
error codes, version fields, and cleanup evidence. It is not a saved scan-session
format and is not imported into diagnostic results. Synthetic fixture results
are not evidence of DLL, VCI, or vehicle compatibility.

## Ownership and Cancellation

Only successful Open with a valid ID establishes ownership. Explicit Open
failure needs no Close. Thrown/malformed Open leaves cleanup unconfirmed and
must not be followed by Close with an invented ID. Once acquired, Close is
attempted exactly once, including after ReadVersion fails or cancellation.
Only validated Close success confirms cleanup. Primary and Close failures
remain separate; no exception messages or driver paths are returned.

AbortSignal prevents the next normal step but cannot cancel an active native
call. Cleanup waits for the active call to settle. The same transport object
remains busy through cleanup; the guard does not cover different wrappers or
processes. Settling releases this in-process guard, not permission to retry an
uncertain real device. Real-host recovery after uncertain cleanup still needs
an explicit policy and operator review.

Future native integration must run outside the UI/server process with a parent
deadline and cancellation handler. A hung call cannot be safely timed out with
`Promise.race` followed by Close. Killing a worker proves process termination,
not normal adapter cleanup. The current tests exercise synchronous hangs and a
crash using only synthetic methods in a child process; no vendor DLL is loaded.

## Remaining Integration

1. Implement and verify native ABI and DLL-loading isolation for a selected,
   statically inspected registered driver; do not accept public raw DLL paths.
2. Establish native-worker startup, deadline, cancellation, crash, and recovery
   reporting. Existing review-only requests remain unchanged until then.
3. Review driver provenance, actual adapter behavior, user authorization, and
   test conditions before a real Open/ReadVersion/Close trial.
4. Add vehicle-channel operations separately with their own verified protocol,
   applicability, preconditions, logging, stop, and recovery rules.

## Evidence and Validation

API shape and buffers were checked on 2026-08-29 against vendor documentation
(pages dated 2026-01-11). Vendor-specific connection settings and timeout values
are not assumed to apply to other J2534 drivers:

- [PassThruOpen](https://quantexlab.com/en/develop/j2534/pt_open.html)
- [PassThruReadVersion](https://quantexlab.com/en/develop/j2534/pt_readver.html)
- [PassThruClose](https://quantexlab.com/en/develop/j2534/pt_close.html)

Run `npm run validate:j2534-lifecycle`. The suite tests call ordering, device
ID zero/bounds, malformed statuses/buffers, exceptions, cancellation, concurrent
use, failed cleanup, and independently terminated hung/crashed workers. It also
checks that the existing review worker rejects identity/vehicle operations and
that production entry points do not import this module.
