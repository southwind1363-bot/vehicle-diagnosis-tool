# J2534 Windows Identity Binding

## Status

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
That API also requires ISO15765 flow-control filters. Filter ownership, protocol
applicability, and isolated-worker integration are still prerequisites, not
implemented or bypassed by this source. No loader resolves WriteMsgs here.

The new dispatch tests use managed callbacks on x86/x64: layout, all other byte
SIDs rejected, wrong owner/channel/protocol/flags, no retry, reentry/disposal,
fault retention, and request/receive/cleanup ordering. These are NOT independent
native WriteMsgs ABI tests or real VCI evidence. The complete native suite passes
6009 checks; existing generated identity/receive fixtures remain separate.

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
