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

## Development Worker Supervision

`j2534-identity-supervisor.js` now hosts the lifecycle in the fixed synthetic
worker. `runJ2534IdentityFixture` requires `mode: "fixture"`; it accepts only a
listed scenario, an integer `timeout_ms` of 1000-10000 (default 5000), and an
optional AbortSignal. No executable, DLL path, native backend, or Node flags can
be supplied. The worker path is module-relative and `NODE_OPTIONS`/`NODE_PATH`
are removed case-insensitively from its environment. This is process isolation
for tests, not an OS security sandbox or native-driver execution permission.

The parent caps combined stdout/stderr at 4096 bytes and retains the first
observed failure reason. Cancellation, timeout, or overflow requests SIGKILL;
the singleton busy guard is held until `close`, not after a kill request or
`exit` alone. Failed termination does not release the guard. The deadline bounds
when termination is requested, not an absolute guarantee of OS process exit.
Cancellation uses Node's `addAbortListener` so another listener cannot suppress
it with `stopImmediatePropagation`. Listener setup failure requests termination
and still waits for `close`; disposal also covers partial registration failure.

Only zero exit plus closed streams permits parsing one bounded JSON envelope.
Schema, scenario, literal fixture marker, steps, status codes, versions, errors,
and cleanup relationships must agree. Raw stdout/stderr and exception text are
not returned. Valid worker completion can still contain a failed lifecycle.
Killed/crashed/invalid workers yield no lifecycle result and unconfirmed fixture
cleanup, even if they printed a result first. Real adapter cleanup is always
`not_tested`; successful synthetic cleanup is never evidence of native cleanup.

Run `npm run validate:j2534-supervisor` for process execution,
abort/deadline/overflow races, the 4096/4097-byte boundary, malformed responses,
spawn/kill failures, busy ownership through `close`, and subsequent reuse. This
module remains absent from the public bridge and PC distribution.

## Remaining Integration

The Windows native binding source and architecture-specific self-tests are now
implemented separately in [native/README.md](native/README.md). This is partial
binding verification, not a verified native backend or real VCI compatibility.
The generated native fixture is also executed in bounded x86/x64 child workers;
hang, crash, corruption, and result-before-hang remain isolated test evidence.
No worker executable, fixture DLL, or vendor driver is shipped or production-wired.

1. Cross-check the generated PE32/PE32+ native fixture with a compiler-built C
   reference when a reviewed native toolchain is available.
2. The static verifier now has an internal callback that keeps its verified file
   handle and Global mutex through generated-fixture Open/ReadVersion/Close.
   The packaged worker does not supply that callback and loads no vendor DLL.
3. The packaged registered-driver preflight now uses a strict v2 request and
   response contract bound to the outer one-time operation nonce. The worker
   independently validates path, SHA-256, size, architecture, and disabled safety
   flags, while the parent matches operation/source/device/architecture evidence.
   `j2534-native-preflight-evidence-v1` retains only sanitized status and safety
   fields; raw DLL paths, labels, device IDs, and nonces remain excluded.
   `j2534-native-preflight-evidence-validation-v1` rejects extra/missing keys,
   oversized input, inconsistent lifecycle states, and any enabled safety flag.
4. The current PC reported `no_registered_driver` on 2026-08-30. Install the
   device vendor's registered J2534 driver on the target Windows tablet, verify
   the packaged CLI, and run the v2 non-executing preflight there next.
5. Review driver provenance, actual adapter behavior, user authorization, and
   test conditions before a real Open/ReadVersion/Close trial.
6. Add vehicle-channel operations separately with their own verified protocol,
   applicability, preconditions, logging, stop, and recovery rules.

## Evidence and Validation

API shape and buffers were checked on 2026-08-29 against vendor documentation
(pages dated 2026-01-11). Vendor-specific connection settings and timeout values
are not assumed to apply to other J2534 drivers:

- [PassThruOpen](https://quantexlab.com/en/develop/j2534/pt_open.html)
- [PassThruReadVersion](https://quantexlab.com/en/develop/j2534/pt_readver.html)
- [PassThruClose](https://quantexlab.com/en/develop/j2534/pt_close.html)
- [Node.js child process lifecycle and termination](https://nodejs.org/api/child_process.html)
- [Node.js cancellation listeners](https://nodejs.org/api/events.html#eventsaddabortlistenersignal-listener)

Run `npm run validate:j2534-lifecycle`. The suite tests call ordering, device
ID zero/bounds, malformed statuses/buffers, exceptions, cancellation, concurrent
use, failed cleanup, and independently terminated hung/crashed workers. It also
checks that the existing review worker rejects identity/vehicle operations and
that production entry points do not import this module.
