# J2534 Windows Identity Binding

## Status

Development-only source, not a production bridge or runnable driver host.
`J2534IdentityNative.cs` implements loading and binding of exactly
`PassThruOpen`, `PassThruReadVersion`, and `PassThruClose`. It has no vehicle
channel, message transmission, discovery, public path input, or retry API.
The public app and PC package metadata are 3.13.356. This native binding remains
development-only and is not bundled in either release.

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

## Next Gates

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
