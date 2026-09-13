# J2534 Windows Identity Binding

## Development DTC library binding (2026-09-13 approval)

The isolated DTC worker now acquires `J2534DtcExecutionLease` before preflight or
DLL loading. It reuses the existing global mutex name and performs one immediate
acquisition attempt per process. Busy acquisition exits without a result or DLL
load. Only confirmed module cleanup releases the lease in the worker's final
exit path. Uncertain cleanup retains a strong reference to the mutex until
process exit; a later completion call cannot upgrade it to released. Completion
from a different thread also retains rather than releasing an unowned mutex.
The existing abandoned-mutex policy is unchanged and is not evidence that a
vehicle/driver was cleaned up. This gate belongs to worker orchestration, not the
low-level loader; it is not wired into a public execution route.

Separate generated test processes check active ownership, retained ownership
after GC, and normal release against an actual generated-DLL DTC worker. They
also check same-process re-acquisition refusal. No real adapter is used.

`WindowsDtcReadLibrary.cs` is a separate internal loader, compiled only with
`J2534_DTC_DEVELOPMENT`. The existing three-export identity loader is unchanged.
Its `LoadVerified` entry first reuses the registered-driver preflight to check
file identity/final path, size, SHA256, PE/runtime architecture and Authenticode.
Only the callback under the held verification handle may invoke the private
loader. SHA256 case is normalized between the existing components; whitespace
or non-hex values are not accepted. Failure returns no library, and preflight's
non-execution flags are not presented as evidence about the loading callback.
The private loader rechecks SHA256 under a read-only file lease, loads with
the existing DLL-directory/System32 search flags, and requires all nine fixed
identity/channel/read/filter/write exports before returning. Unknown export
names are rejected. Failed binding unloads before any PassThru call; uncertain
ownership retains the module until process exit through the existing owner.

WriteMsgs/filter APIs are not inherently read-only: the existing fixed
03/07/0A request builder and ownership gates constrain their use. This loader
alone is not authorization to send, nor a verified-driver selection boundary.
Digest matching is not publisher authentication. Production entry points and
distribution do not reference the new loader or enable its compilation flag.

The combined isolated workers now exercise this binding using only generated
fixture DLLs. Separate process checks cover malformed/mismatched digests,
missing exports, forbidden names and release/retention. No vendor DLL is loaded.
The integrated preflight tests use `PREFLIGHT_FIXTURE_TESTS` and thus a signature
stub for generated DLLs, not real publisher trust. Incorrect size/architecture/
digest never reaches the verified callback; write access is denied while it is
held. Registration-to-selected-device provenance is not established by this test.
Integration with trusted driver selection and the public readout controller,
dependency identity, real VCI compatibility and vehicle timing remain unverified.

## Development result conversion (2026-09-12 approval)

`../j2534-dtc-result-converter.js` introduces a bounded JSON-only internal
conversion boundary. It requires schema `j2534-dtc-read-v1`, a successful parent
worker status and cleanup confirmation, request ECU/service, and the existing
C# `Status`/`ReportedCount`/`Messages` layout. These flags are not authentication:
the caller must supply them from the trusted bounded supervisor, not UI input.
The separate `OWNED_DTC_RESULT_OUTPUT` compile-time variant now serializes a
copied receive result only after confirmed filter/channel/device cleanup. Its
fixed generated DLL returns the synthetic 7E8 / 43 01 71 response, not vehicle
data. Ordinary fixture workers retain the original six-field summary.

`createJ2534DtcResultFixtureSupervisor` accepts only the dedicated fixed-data
scenarios and integrity-pinned worker/DLL paths. After normal process exit and
stream close, it checks the child envelope, supplies the fixed parent-owned
request ECU/service and completion status, and invokes the converter. Its output
contains the existing decoded snapshot with explicit `fixture_only:true` and
`vehicle_communication:false` markers, not the raw native records. The
ordinary summary supervisor rejects these data-output scenarios. Public/live
routes remain unconnected.

The development DTC factory also accepts an optional `quarantineStore` control,
using the existing store interface and saved format. A non-clear, unreadable or
malformed store blocks before spawn. Once a started worker returns without an
accepted result, the parent marks `cleanup_unconfirmed`; recreating the store
and supervisor then blocks another launch. A normally accepted result leaves a
clear store unchanged. This integration is exercised with the fixed generated
data and data-then-hang workers on x86/x64, not with vendor drivers or vehicles.
It does not add a public execution route, retry, reset, or new saved format.
The control is optional for existing isolated fixtures, not a production safety
gate. The bounded worker now waits at most 1000 ms after requesting termination
for a close event. Without it, the result is rejected as
`worker_termination_unconfirmed`, with `worker_exited:false`, and reuse of that
bounded worker remains blocked even after a late close. The DTC supervisor can
then persist its existing cleanup-unconfirmed record. Child references are held
until close; this neither proves OS process death nor forcibly releases a native
lock. The host process may still be held alive by the child. Synthetic event tests
cover kill false/throw/true and exit without close; real unkillable processes and
persistence failure across restart remain unverified limitations.
The DTC parent also records quarantine when termination is unconfirmed but no
spawn notification was observed; it does not reinterpret missing notification
as proof of non-execution. An inert-file/injected-child integration test follows
the real bounded worker, supervisor and disk store through the secondary deadline,
store recreation and blocked relaunch. No executable bytes run in this test.
The ordinary native-identity and verified-identity fixture supervisors apply the
same missing-notification rule. Their inert-file integration cases preserve the
interactive confirmation requirement, then verify that a recreated disk store
blocks another supervisor before spawn. This does not enable packaged identity
execution or alter the quarantine schema.

The DTC-result supervisor uses a 64 KiB output cap, sufficient for the worker's
two bounded decimal-byte records; summary-only workers retain 4 KiB. The cap is
still enforced before parsing and oversized output never reaches the decoder.
A real Node child pipe checks a 4099-byte synthetic padded response against both
caps and rejects output above 64 KiB. This is a pipe/decoder regression check,
not a long native response or real VCI test.

Only one complete ISO15765 11-bit positive 03/07/0A response from request ECU+8
is decoded. Exact start indicators may precede it; missing/trailing indicators,
multiple responses, unknown receive flags, different ECUs/services, extra data,
bad lengths/padding, and native statuses other than 0 or 9 yield
`unavailable` with no snapshot. It does not infer no faults from an empty queue.
Explicit valid zero-code payloads may pass the unchanged existing DTC decoder;
that is not a whole-vehicle health assertion.

With the 2026-09-13 approval, ERR_TIMEOUT (9) may carry a complete response:
the requested record count need not have been reached. Status 9 is preserved,
not rewritten to success, and must pass the same complete-payload checks as 0.
An empty queue, start indicator alone, truncated payload or timed-out parent
still produces no snapshot. There is no retry or additional read call.
The fixed data fixture now returns status 9/count 1 for requested count 3;
this tests the handoff and archive roundtrip, not real elapsed-time behavior.
Reference: https://quantexlab.de/en/develop/j2534/pt_readmsg.html

The result-output worker accepts one or two records, rather than assuming one
record equals one response. This lets an exact start indicator and its complete
response reach the existing strict parent converter. The parent still rejects
two data responses or a trailing/unmatched indicator. A dedicated generated
`owned-dtc-data-start` fixture covers the two-record handoff through archive
reopen; the single-record fixture remains covered. No extra receive call is made.

The converter reuses `decodeObdDtcResponse` and returns its existing snapshot
without changing diagnostic ranking or saved formats. It retains no raw envelope
or native frames, emits fixed error reasons, accepts no driver paths, and enables
no native execution. Coverage now includes the fixed generated native DLL through
the isolated C# worker, bounded parent and real existing decoder on x86/x64, plus
synthetic JSON rejection cases. A valid data envelope followed by a hung worker
must time out without invoking the decoder. This is not a native-to-UI readout or
real VCI validation.

## Status

The development-only `../j2534-fixture-session-builder.js` now accepts a completed,
non-terminated, error-free fixture result and calls the existing session builder.
It refuses missing/unavailable snapshots rather than constructing an empty DTC
session. The returned wrapper keeps fixture-only/no-vehicle flags. In the existing
archive format, `source: j2534_development_read` survives export/reopen together
with ECU-scoped DTC status; wrapper flags are not new saved-format fields. This is
not permission to present fixture data as live vehicle measurements in the UI.
The fixed native result is checked through session → in-memory JSON archive →
reopen on x86/x64. No user saved files, disk export, browser UI, or real VCI is
used by this check, and no public route is connected.

Development-only source, not a production bridge or runnable driver host.
`J2534IdentityNative.cs` implements loading and binding of exactly
`PassThruOpen`, `PassThruReadVersion`, and `PassThruClose`. Internal caller-bound
channel lifecycle and fixed read-request code remain disabled in shipped workers.
There is no live message transmission, discovery, public path input, or retry API.
This native binding remains development-only and is not bundled in the public
app or workstation release (currently 3.13.581).

### Fixed read request (2026-09-11 approval)

`J2534ReadRequestNative.cs` builds one v04.04 ISO15765 message with a physical
11-bit ECU address 0x7E0..0x7E7 and only SID 03, 07, or 0A. The owner must have
opened that device and connected that exact protocol-6, flags-0 channel. The
single request latch is shared across wrappers and rejects requests after a
receive attempt. No arbitrary payload, functional broadcast, erase, actuator,
or retry interface is exposed. A nonzero native status or uncertain buffer/call
failure poisons the owner and retains its module without further driver calls.

The guarded 4152-byte message is zero-initialized, with frame padding 0x40,
four big-endian address bytes, one SID, count 1, and timeout 0. Timeout-zero
success means queue acceptance, not vehicle transmission or a completed result;
see [vendor WriteMsgs API](https://quantexlab.com/en/develop/j2534/pt_writemsg.html).
That API also requires ISO15765 flow-control filters. The disabled
`PrepareDtcFilterOnce` now builds a full four-byte mask, response address
request+8, and flow-control address equal to the request ECU. All three messages
use protocol 6, padding 0x40, and size 4. See the vendor
[StartMsgFilter](https://quantexlab.com/en/develop/j2534/pt_start_msgfilt.html) and
[StopMsgFilter](https://quantexlab.com/en/develop/j2534/pt_stop_msgfilt.html) APIs.
Installing this filter on real hardware could trigger automatic transport
flow-control frames: it is NOT a passive receive feature or vehicle permission.

The owner retains one returned unsigned filter ID and its ECU address. A request
requires that matching active filter. Start failure, stop failure, or callback
uncertainty prevents further driver calls. A successful explicit filter stop is
required before Disconnect, and stops further request/receive operations. Start,
stop, request, receive, and Dispose share one gate. No retry or implicit cleanup
is performed. Protocol applicability and isolated-worker integration remain
prerequisites. No loader resolves WriteMsgs or filter exports here.

The new dispatch tests use managed callbacks on x86/x64: layout, all other byte
SIDs rejected, wrong owner/channel/protocol/flags, no retry, reentry/disposal,
fault retention, and request/receive/cleanup ordering. These managed tests alone
are NOT native ABI tests or real VCI evidence. Filter tests additionally
check exact mask/address layouts, unsigned IDs, ownership/ordering, and failure
retention. Existing generated identity/receive fixtures remain separate.

The additional fixed `request-abi.dll` fixture independently executes native
StartMsgFilter, StopMsgFilter and WriteMsgs entry points on x86/x64. It checks
channel/type/count/timeout, message protocol/length/address and read SID, writes
an unsigned filter ID through the sixth argument, and exercises x86 StdCall stack
cleanup and x64 register/stack arguments. Altered arguments return -8 without
changing the output. It has no imports, entry point, hardware access, or arbitrary
code input and stays within the existing 512-byte executable section limit.
Only the fixed sibling DLL in the bounded self-test process can be selected.

This joins the actual request/filter builders and owner lifecycle to native
fixture delegates, but identity/channel setup is still managed in this test.
It is not a complete native worker transaction, compiler-built C reference,
driver compatibility test, or vehicle readout. The production export allowlist,
worker execution policy, and public workstation package are unchanged.

The separate `OWNED_DTC_REQUEST_FIXTURE` compile-time variant now joins the full
Open → Connect → StartMsgFilter → WriteMsgs → ReadMsgs → StopMsgFilter →
Disconnect → Close lifecycle in the isolated owned-receive worker. Its single
generated DLL exports all nine entry points, uses flags 0 and fixed physical
request 7E0/03, and is pinned by a compiled SHA256 with the existing file lease.
Only this combined fixture permits up to 1024 bytes of generated machine code;
other fixture limits and captured prior fixture digests remain unchanged.

Native start/write/stop failure fixtures install illegal-instruction traps in forbidden
later calls. They must exit normally with failure code 1, retain the module, and
have their summary discarded by the bounded supervisor. Success requires normal
process exit and confirmed cleanup. The output remains a fixture summary, NOT
diagnostic results: the received synthetic records are the existing ABI markers.
No public worker path, vendor DLL, real VCI, automatic retry, or vehicle operation
is enabled. Combined fixtures also cover a filter-start hang, a receive hang
that ignores the 1000 ms argument, a filter-stop crash, and a flushed successful
summary followed by a hang. The bounded supervisor must wait for process close,
discard all abnormal results, send termination for hangs, and reject a second
run. Cancellation of the hanging-receive scenario likewise requires process exit
and no adopted result (the cancellation test does not instrument the native
entry point to establish its exact timing). These are synthetic failure-path checks; real response timing,
vendor cleanup behaviour and VCI compatibility remain unverified.

### One-shot response wait

The combined worker now calls `ReadDtcResponseOnce` after successful queue
acceptance. Unlike the unchanged `ReadOnce` queue snapshot (timeout 0), it asks
ReadMsgs to wait up to a fixed 1000 ms in a single call. It requires the same
owner, queued request and active filter; no caller-provided timeout or polling
loop is introduced. See the [vendor ReadMsgs API](https://quantexlab.de/en/develop/j2534/pt_readmsg.html)
for timeout-zero versus waiting semantics. 1000 ms is a development bound, NOT a
verified response deadline for any vehicle or VCI. The parent process deadline
is still needed if a driver ignores the argument.

Status 9 and partial/empty records remain unchanged in the internal result; they
are not upgraded to diagnostic completion. Both receive methods share the
one-attempt latch, so switching methods/wrappers cannot silently retry. Managed
tests cover pre-request refusal, wrong channel, partial/empty status preservation,
and no retry. The generated combined DLL validates the exact nonzero timeout on
x86/x64; it does not simulate elapsed response timing or prove real-device timing.

## Validation

Run `npm run validate:j2534-native` from `deploy` on 64-bit Windows with both
.NET Framework v4 compilers installed. The script compiles and runs explicit
x86 and x64 test executables in a temporary directory, then removes them.
It fails rather than silently skipping if Windows or a compiler is unavailable.
This platform-specific command is separate from the portable release suite.
No new dependencies, vendor DLLs, drivers, or devices are installed or executed.

`J2534RegisteredDriverPreflight.cs` is a separate non-executing verifier. It
opens a registered-library candidate with `CreateFileW`, denies write/delete
sharing, and derives the normalized final path, fixed volume, file identity,
size, SHA-256, and PE machine from one handle. It never calls `LoadLibraryExW`,
`GetProcAddress`, or any J2534 export. The fixture worker accepts no DLL path
and reports only path-free booleans and stable blockers. Verification output is
not a reusable load token; a future isolated worker must repeat the checks
immediately before any reviewed load.

The x86 and x64 fixture workers also require the PE machine to match their own
runtime. During an instrumented fixture-only callback, write, rename, and
delete attempts must fail while the verification handle is held; a read/write
open must succeed after verification returns. The packaged preflight worker does not
supply an execution callback. The verifier now combines the legacy volume serial and 64-bit file
index evidence with `GetFileInformationByHandleEx(FileIdInfo)` and compares the
128-bit file ID before and after hashing. This closes the previously documented
ReFS identity gap without making the preflight result reusable as a load token.

Production preflight also applies the Windows `WinVerifyTrust` file policy to
the same open handle. It disables UI, restricts trust retrieval to the local
cache, and rejects files that Windows does not trust. The x86/x64 production
tests accept a Windows catalog-signed system DLL and reject the unsigned
generated fixture. This verifies file trust only; it does not establish J2534
device compatibility or authorize DLL loading.

The packaged operation controller separately verifies the complete
package-integrity.json inventory when issuing an opaque operation and again
immediately before native preflight. A changed or incomplete package is rejected
before the worker starts. This is copy-integrity evidence only, cannot be
supplied by public caller fields, and does not prove publisher authenticity or
authorize DLL loading, PassThruOpen, or vehicle communication.

The production preflight worker also acquires the Windows named Global mutex
before opening the candidate DLL and holds it through the complete non-executing
preflight. Contention fails without waiting. Separate x86/x64 process fixtures
verify exclusion and acquisition after release. Production still ends the lease
with preflight and therefore does not authorize a vendor identity load.

The verifier now also exposes an internal compile-time callback that runs after
all file, architecture, hash, identity, and trust checks but before its original
file handle closes. A development-only x86/x64 worker uses that callback with
the generated fixture to load, Open, ReadVersion, Close, and release while the
share lock and Global mutex remain held. Cross-process probes confirm mutex
contention during that lifecycle and reacquisition after completion. This proves
the reusable holding mechanism with generated code only; it is not wired into
the packaged worker and no vendor DLL, VCI, or vehicle is used.

The packaged parent now owns a persistent fail-closed quarantine latch for the
non-executing preflight. If the secondary termination deadline cannot confirm
worker exit, it atomically writes a path-free state in the package's private
native directory. Recreated controllers read that state before spawning and
reject automatically; malformed state also blocks. There is no runtime clear or
overwrite API. This is an accidental-retry barrier, not tamper-proof storage.

The source implementation also retains a per-store failure latch if opening,
writing, syncing or closing the quarantine record fails. Subsequent reads and
marks on that store remain blocked without another persistence attempt, even
if no file exists. A failed disk write cannot provide a durable guarantee across
process restart or a new store instance; those remain limitations. This fix is
included in the 3.13.582 PC package; the previously generated 3.13.581 ZIP is unchanged.
Version 3.13.583 also retains that latch when post-write verification finds the
record missing or invalid, including a create collision followed by disappearance.
Successful write calls alone do not prove that the quarantine record persisted.

The generated verified-identity supervisor requires an explicit trial
confirmation, revalidates its pinned worker and DLL descriptors immediately
before spawn, and starts only the fixed x86/x64 fixture worker. It strictly
matches the request nonce and selected device ID, verifies the handle and Global
mutex lifecycle evidence, rejects concurrent runs, applies the parent deadline,
and records uncertain cleanup in the same persistent latch. Recreating the
supervisor with that state remains blocked. This remains development-only and is
not connected to a vendor worker.

The packaged registered-driver preflight now uses the strict v2 private-IPC
contract. The outer one-time operation nonce becomes the native request nonce;
the response must echo the operation, live-registry source, selected device, and
architecture. The C# worker independently rejects non-absolute paths, non-lowercase
SHA-256 values, files outside the 1-byte to 64-MiB range, unsupported
architectures, enabled execution flags, duplicate/extra keys, and v1 requests.
Private paths and hashes are not returned.

The tests verify managed delegate/function-pointer binding, unsigned 32-bit IDs
(including zero), signed 32-bit status codes, NULL Open input, three separate
80-byte buffers, missing exports, ordering, exceptions, disposal serialization,
guard damage (including overwrite followed by an exception), same-thread
reentrancy, uncertain ownership, and rejection of driver CLI arguments.
Managed delegates stay rooted for their use. Those callbacks use the same
managed delegate types as the binding, so those callbacks alone are not native
ABI evidence.

The validator also builds deterministic, import-free PE32 and PE32+ fixture DLLs
from fixed templates. It accepts no machine code, export names, paths, or driver
inputs. Separate `.text` (RX), `.rdata` (R), and `.reloc` (R/discardable)
sections prevent RWX memory; entry point is zero, exports are exact and sorted,
and ASLR/NX plus relocation data are required. x86 uses StdCall stack cleanup;
x64 uses the Windows x64 ABI. The DLLs execute actual native
Open/ReadVersion/Close code in separate x86/x64 processes and are then deleted.
Tests cover a high-bit device ID, signed Open failure, distinct buffers and tail
bytes, individual missing exports, decorated-only x86 export rejection,
cross-architecture rejection, guard poisoning, and deterministic SHA-256.
This provides independent native fixture ABI evidence.

The native success fixture rejects a non-NULL Open name and rejects any
ReadVersion/Close ID other than the exact high-bit ID returned by Open. A
successful lifecycle therefore checks argument forwarding at the native side,
not only the managed result object.

A fixed Windows `version.dll` is actually loaded, rejected for missing J2534
exports, and its acquired library reference released. Reference release does
not prove the DLL fully unloaded; other references can exist. No vendor code
or real adapter cleanup has been tested. The generated fixture is not a
compiler-built C reference; real driver/VCI trials are still required before
claiming compatibility.

## Safety Boundaries

- Load accepts a canonical, existing absolute DLL path on a fixed local drive.
  UNC/device paths, alternate streams, relative paths, and reparse points are
  rejected. This is input hygiene, not provenance validation or a race-free
  filesystem security boundary. Driver selection/inspection must come first.
- `LoadLibraryExW` uses `LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR` and
  `LOAD_LIBRARY_SEARCH_SYSTEM32`, with no permissive search fallback. These
  flags control dependency lookup; they do not sandbox code. Loading executes
  DLL initialization, so future integration must isolate BEFORE loading.
- Resolve all three exact exports before Open. The delegates declare StdCall,
  32-bit status/IDs, and caller-allocated version buffers. Do not infer a driver
  is compatible solely because its exports exist.
- Buffers have sentinel bytes and adjacent guards; copy exactly 80 bytes and
  never use unbounded native string reads. No terminator or text is invented.
  A disposed version buffer rejects pointer access, guard checks, and copying
  before touching native memory. Double disposal remains harmless. This is
  use-after-disposal rejection, not independent concurrent buffer safety; the
  binding's lifecycle lock still owns synchronization.
  Guards detect only nearby overwrite, not arbitrary native memory corruption.
  Detected damage poisons the binding: further Open/ReadVersion/Close calls are
  rejected and Dispose retains the library reference until process exit.
  Do not call Close or automatically restart after detected corruption.
  Version text validation remains the lifecycle's responsibility.
- Successful Open owns that exact ID. Close is explicit and attempted at most
  once. Dispose never implicitly Close. Unknown Open outcome, failed Close,
  or an unclosed device retains the library reference until process exit.
  Dispose cannot unload during a concurrent active call. Retaining a module
  does not recover a driver or prove cleanup; do not automatically retry.
  An explicit in-flight guard also rejects same-thread reentrant calls,
  including Dispose; a reentrant monitor lock alone would not protect them.
- Locks cannot interrupt a hung DLL. The future parent must enforce a process
  deadline and treat forced termination as unconfirmed adapter cleanup.

## Development Worker Isolation

`J2534NativeFixtureWorker.cs` connects the binding only to generated fixture
DLLs in its own temporary architecture directory. Its CLI accepts exactly
`--fixture` and one fixed scenario; it accepts no DLL path, driver path, command,
or extra argument. The worker and every fixture are pinned by canonical temp
location, file identity, size, and SHA-256 before every process start.

The shared bounded supervisor retains its busy guard until child `close`, caps
combined stdout/stderr at 4096 bytes, rejects any native-worker stderr, and
discards output after cancellation, timeout, crash, overflow, or other abnormal
exit. Native success, explicit Open failure, and detected guard corruption have
separate strict envelopes. Corruption records Close as unattempted and the DLL
reference as retained. A result printed before a later hang is not accepted.
Forced process termination always leaves fixture cleanup unconfirmed.
The native child receives only SystemRoot/WINDIR and temporary-directory
environment values; Node flags and CLR/CoreCLR/COMPlus profiler controls are not
inherited. File identity and hash checks narrow accidental substitution but do
not make the check-to-spawn/load sequence race-free against a local attacker.

Actual x86/x64 child processes test native ReadVersion hangs, illegal-instruction
crashes, cancellation, concurrent busy rejection, and result-then-hang. The
executable fixture remains development-only and is not packaged. Separately,
the PC package build compiles the non-executing registered-driver preflight for
x86 and x64, records both SHA-256 values in a strict worker manifest, and the
runtime accepts only those fixed workers. Neither worker loads a vendor DLL.

`J2534UdsTransportFixtureWorker.cs` is a development-only x86/x64 child that emits seven fixed, bounded UDS transport-result candidates. It imports no native API, accepts no DLL or driver path, reports vendor DLL and vehicle communication as false, and feeds only the strict JavaScript sanitizer and completion-manifest validator. It does not perform PassThruOpen, PassThruConnect, PassThruReadMsgs, PassThruWriteMsgs, or vehicle I/O. Its dedicated development supervisor pins the worker path, SHA-256, and file identity; limits combined output to 4096 bytes; rejects stderr; and discards results on timeout, cancellation, overflow, abnormal exit, concurrent execution, post-result hang, or pre-spawn file mutation. The readout-attempt controller now generates the operation nonce and attempt ID internally, binds them with the selected device, target/expected ECU pair, and DID, and accepts a completion manifest only when every value returns unchanged through the native fixture and sanitizer. A separate non-executing adapter-request boundary consumes only a trusted opaque preflight operation, retains its selected-device and ECU/DID scope in a one-shot WeakMap capability, and can create a scoped controller only for the fixture-only supervisor; public snapshots, clones, and reused requests cannot authorize it.

## Next Gates

The adapter-request boundary captures its validated preflight, completion and
fixture-run functions at construction. Replacing dependency properties later
cannot substitute another runner after preparation; a frozen internal facade
retains the original run function and receiver. This is dependency identity
stability, not a sandbox for untrusted callbacks or mutable callback internals.
Execution flags and the fixture-only requirement remain unchanged.
The readout controller also copies/freezes its ECU/DID scope and captures the
runner function, including when constructed directly. Mutating the caller's
scope cannot retarget a prepared readout. Caller objects are not frozen or
rewritten; this preserves their ownership without sharing the validated scope.
Completion conversion additionally requires `worker_completed`. Matching IDs
on a cancelled, timed-out or crashed worker response cannot publish a completion
manifest. This independently enforces the supervisor's existing discard policy;
it neither releases an in-flight owner early nor triggers another attempt.

### Receive code increment (2026-09-10)

`J2534ReceiveNative.cs` adds a development-only v04.04 `PassThruReadMsgs`
delegate call with a fixed 1–16 message allocation and nonblocking timeout zero.
It is not referenced by a production worker or loader. Each instance permits
one attempt, including exceptions and reentry; it performs no retry, Connect,
filter setup, or WriteMsgs. Channel ownership and a process deadline remain
prerequisites for future worker integration.

Following explicit user approval, the optional owner-bound constructor now
routes the entire receive operation (including copying and buffer disposal)
through the identity binding's gate. It requires the exact owned device ID.
Dispose on another thread waits for the receive; same-thread Dispose/Close
reentry is rejected. Only one receive attempt is allowed per owner, even if
another receive wrapper is created. Receive exceptions poison the owner.
For an untracked fixture channel, after any receive attempt Close is refused
and Dispose retains the library reference until process exit, even on success.
There is no implicit cleanup or automatic retry.

The unbound constructor remains for isolated ABI tests; it does not manage
module lifetime. The owner must exclusively control library release and receive
delegates must belong to that owner's module; this is not a sandbox against
callbacks that directly release a library behind the owner. The production
loader's three-export allowlist is unchanged and no production worker uses this
receive path. x86/x64 managed tests verify wrong-owner rejection, one-shot ownership,
reentry rejection, corruption retention and concurrent Dispose serialization.
These tests are not real driver/channel lifetime evidence.
Receive callback exceptions are replaced by `native_receive_call_threw` without
retaining their message or inner exception. Guard corruption still takes
precedence and the attempt remains consumed. This matches identity-call error
hygiene; it does not recover a failed driver or catch every native process fault.

The 4152-byte message layout uses six 32-bit fields and 4128 data bytes.
Count and message allocations have adjacent guards; invalid counts, data sizes
and extra-data offsets fail before any result is returned. Only status 0/9
returns copied messages; all other statuses retain their code/count without
publishing message data. RxStatus indicators remain raw observations, never
diagnostic results. Guards do not sandbox arbitrary native writes or detect
every incomplete payload. An isolated worker must terminate after corruption
without invoking driver cleanup or retrying.

The existing x86/x64 validator now also runs managed receive callbacks for
maximum payloads, multi-message stride, empty results, partial timeout, error
discard, corrupt lengths/counts/guards, exceptions and one-shot enforcement.
Those callbacks alone are NOT independent native ABI or real VCI evidence.
A separate import-free `receive-success.dll` now exports only PassThruReadMsgs.
Fixed x86 StdCall/x64 instructions independently check the channel, zero timeout,
and requested count, write two distinct 4152-byte-stride records, and update
the count from three to two. Tests bind its export and verify signed failure,
unsigned timestamp/channel, payload bytes and the preserved receive indicator.
The self-test accepts no driver path; it loads only the generated sibling DLL
in its temporary architecture directory, under the existing 30-second child
deadline. Production loaders and workers do not reference this fixture.
This is generated native receive ABI evidence, not a compiler-built C reference
or vendor/VCI compatibility evidence. No C compiler was found on PATH in this
run. An independent C reference is still needed
when a reviewed toolchain is available. Actual driver/vehicle execution stays disabled.

`J2534OwnedReceiveFixtureWorker.cs` now integrates the owner and native receive
binding inside a dedicated x86/x64 child process. It is compiled only with
`NATIVE_RECEIVE_FIXTURE_TESTS`, outside the workstation package. It opens only
the fixed sibling `owned-receive.dll`, checks the digest compiled by the validator
while holding a read-only file lease through loading, and binds identity and
receive/channel exports from the same module. It accepts no driver path or channel input.
The generated Connect returns a channel distinct from the device ID; the worker
uses that returned ID for one zero-timeout receive and Disconnect, then Close
and Dispose. Only the confirmed successful fixture sequence permits FreeLibrary.
Only a fixed fixture summary is emitted, with fixture cleanup confirmed;
no raw messages or exception details leave
the process. The validator requires normal exit within 30 seconds, exact summary
fields, argument rejection, and silent rejection of a substituted valid PE.
This is isolated generated-native integration evidence, not actual channel
creation, driver cleanup, vendor compatibility, or vehicle diagnosis. The
fixture-only loader does not widen `WindowsIdentityLibrary`'s export allowlist.

### Approved internal channel lifecycle (2026-09-11)

The internal identity owner now accepts caller-bound Connect/Disconnect delegates
without resolving new exports or enabling any shipped worker. Connect, receive,
Disconnect, Close and Dispose share its gate. One channel may be attempted, and
receive requires the exact channel obtained from successful Connect. The output
DWORD is guarded using the existing buffer with all remaining bytes protected.
Disconnect is attempted at most once and cannot run during receive. Only status
zero from Disconnect followed by status zero from Close permits library unload.
Failed/throwing Connect or Disconnect, and receive corruption, poison the owner;
Dispose retains the reference and performs no native cleanup calls. Protocol,
flags and rate are passed through, not certified as vehicle-safe or applicable.
Future callers must supply delegates from the same module, reviewed configuration
and an isolated process deadline; no vendor calls are authorized by this API.

Managed callback tests cover normal cleanup, wrong device/channel, repeated
operations, reentry, guarded output, failure/exception retention, Close failure,
Dispose without cleanup, and a concurrent Disconnect waiting for receive.
These are lifecycle tests, NOT independent native Connect/Disconnect ABI tests.
The generated worker now separately exercises the complete native success path.
Its fixed x86 StdCall and x64 instructions check all four Connect value arguments,
write the output DWORD (including the x64 fifth stack argument), and check the
distinct channel for receive/Disconnect. Additional direct ABI tests reject each
incorrect Connect argument without changing the guarded output, and reject the
device ID passed to Disconnect. This generated oracle has no imports or entry
point and does not emulate a vendor driver's internal channel state.
Two additional fixed, separately compiled/digest-bound binaries now return a
native failure from Connect or Disconnect. The worker stops the sequence,
retains the module and exits 1 even when its sanitized failure summary is valid
JSON. Failure fixtures put trap instructions in forbidden later calls (receive
and Disconnect after failed Connect, Close after either failure), so accidentally
continuing cannot pass as controlled failure. The validator requires exact
failure summaries and exit 1, not a crash/timeout or success. Shipped manifests
and production entry points explicitly exclude this development worker.
The owned receive supervisor now uses the existing bounded child runner, with
exact temp paths, pinned worker/DLL identities and SHA256, fixed CLI, minimal
environment, stderr rejection, and a one-attempt latch. It accepts a result only
after successful process close and strict summary validation. Native Connect
hang, Disconnect illegal-instruction crash, and a compile-only result-then-hang
variant exercise timeout/crash handling in both architectures. Timeout requests
termination and waits for the child's close event; all abnormal exits return no
parsed result, including the earlier valid JSON from status-failure workers.
These fixtures demonstrate process containment here, not physical adapter cleanup.
Additional integration checks cover cancellation before spawn and during the
hang-worker run: the latter requires termination signalling, child close, and
no parsed result. A modified pinned DLL blocks spawning; restoring it does not
reset the attempted supervisor. Cancellation also does not reset that latch.
The independent compiler-built C reference, other-PC and actual VCI remain
unverified; the production bridge still does not include this supervisor.
Owned-supervisor request inspection is guarded: throwing option getters or
proxy key enumeration return only `owned_fixture_request_invalid`, without
spawning a process, leaking exception text, or consuming the one-attempt latch.
A subsequent valid request still runs once. This hardens the development API;
it does not enable any vehicle operation or accept additional input fields.
Signatures checked against vendor primary documentation, v04.04 Windows DWORD
layout only: [Connect](https://quantexlab.com/en/develop/j2534/pt_connect.html),
[Disconnect](https://quantexlab.com/en/develop/j2534/pt_disconnect.html).

Layout/call reference: [Quantex PassThruReadMsgs](https://quantexlab.com/en/develop/j2534/pt_readmsg.html)
(checked 2026-09-10, v04.04 layout only; not a universal driver guarantee).

1. Cross-check the generated fixture with a compiler-built C reference when a
   reviewed native toolchain is available.
2. The packaged CLI emits `j2534-native-preflight-evidence-v1` without DLL
   paths, labels, device IDs, nonces, or execution authority. Its paired strict
   validator enforces a 32 KiB input limit, exact keys, semantic state binding,
   and disabled execution flags before accepting transported evidence. The
   current PC was observed in the safe `no_registered_driver` state on 2026-08-30.
3. Install the device vendor's registered J2534 driver on the target Windows
   tablet, then run the packaged v2 private-IPC preflight and retain only that
   sanitized evidence. Do not load the vendor DLL in this gate.
4. Keep explicit trial approval mandatory before any vendor identity worker or
   vehicle-channel work.

## References

Checked 2026-08-29; vendor documentation describes its API, not universal
compatibility with every J2534 implementation.

- [Windows LoadLibraryExW](https://learn.microsoft.com/en-us/windows/win32/api/libloaderapi/nf-libloaderapi-loadlibraryexw)
- [Windows CreateFileW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew)
- [Windows GetFinalPathNameByHandleW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfinalpathnamebyhandlew)
- [Windows BY_HANDLE_FILE_INFORMATION](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/ns-fileapi-by_handle_file_information)
- [Windows FreeLibrary](https://learn.microsoft.com/en-us/windows/win32/api/libloaderapi/nf-libloaderapi-freelibrary)
- [Marshal.GetDelegateForFunctionPointer](https://learn.microsoft.com/en-us/dotnet/api/system.runtime.interopservices.marshal.getdelegateforfunctionpointer?view=netframework-4.8.1)
- [Marshal.GetFunctionPointerForDelegate](https://learn.microsoft.com/en-us/dotnet/api/system.runtime.interopservices.marshal.getfunctionpointerfordelegate?view=netframework-4.8.1)
- [Quantex PassThruReadVersion](https://quantexlab.com/en/develop/j2534/pt_readver.html)
