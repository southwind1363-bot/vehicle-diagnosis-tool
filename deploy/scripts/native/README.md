# J2534 Windows Identity Binding

## Status

Development-only source, not a production bridge or runnable driver host.
`J2534IdentityNative.cs` implements loading and binding of exactly
`PassThruOpen`, `PassThruReadVersion`, and `PassThruClose`. It has no vehicle
channel, message transmission, discovery, public path input, or retry API.
The public app and PC package remain unchanged at 3.13.333.

## Validation

Run `npm run validate:j2534-native` from `deploy` on 64-bit Windows with both
.NET Framework v4 compilers installed. The script compiles and runs explicit
x86 and x64 test executables in a temporary directory, then removes them.
It fails rather than silently skipping if Windows or a compiler is unavailable.
This platform-specific command is separate from the portable release suite.
No new dependencies, vendor DLLs, drivers, or devices are installed or executed.

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

## Next Gates

1. Cross-check the generated fixture with a compiler-built C reference when a
   reviewed native toolchain is available; add crash/hang worker cases.
2. A native helper IPC adapter for the existing supervised lifecycle, with
   driver architecture selection, bounded output, and no public raw DLL path.
3. Driver provenance, registered static inspection, explicit trial approval,
   and actual Open/ReadVersion/Close evidence before vehicle-channel work.

## References

Checked 2026-08-29; vendor documentation describes its API, not universal
compatibility with every J2534 implementation.

- [Windows LoadLibraryExW](https://learn.microsoft.com/en-us/windows/win32/api/libloaderapi/nf-libloaderapi-loadlibraryexw)
- [Windows FreeLibrary](https://learn.microsoft.com/en-us/windows/win32/api/libloaderapi/nf-libloaderapi-freelibrary)
- [Marshal.GetDelegateForFunctionPointer](https://learn.microsoft.com/en-us/dotnet/api/system.runtime.interopservices.marshal.getdelegateforfunctionpointer?view=netframework-4.8.1)
- [Marshal.GetFunctionPointerForDelegate](https://learn.microsoft.com/en-us/dotnet/api/system.runtime.interopservices.marshal.getfunctionpointerfordelegate?view=netframework-4.8.1)
- [Quantex PassThruReadVersion](https://quantexlab.com/en/develop/j2534/pt_readver.html)
