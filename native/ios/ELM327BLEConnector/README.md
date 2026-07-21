# ELM327 BLE Connector

This Swift package is the product-owned iPhone connection layer for BLE GATT ELM327-compatible adapters. It is intentionally a narrow first step, not an unrestricted scan-tool transport.

## Included readout

- User-initiated BLE scan, explicit peripheral selection, connection, service discovery, and characteristic selection.
- Notify/indicate subscription is confirmed before any command is written.
- One fixed read-only setup and core queue: adapter identity/protocol, stored/pending/permanent DTCs, Mode 01 PID support/readiness/live values, Mode 02 freeze-frame support and supported values, and scoped Mode 09 ECU-name support.
- Capability-gated follow-up reads only for PIDs and Mode 09 information types reported by the vehicle.
- Prompt-delimited response handling with a four-second per-command timeout and no automatic retry.
- Typed `native_connector_contract_v1` envelopes plus a separate terminal `native_connector_completion_manifest_v1` record for the existing diagnostic-session importer.
- `NativeConnectorScanArchiveBuilder` keeps one structured, in-memory scan boundary and exports only `{ envelopes, completion_manifest }`. It rejects raw transport strings, write intents, unsafe flags, mixed scan boundaries, sequence gaps, and terminal count/range mismatches.

## Safety boundary

There is no generic command API. Mode 04, DTC clear, active tests, coding, routines, UDS services, and arbitrary AT commands are absent. The envelope marks `vehicle_command_enabled:false`; `would_transmit:false` retains the product contract meaning of no state-changing vehicle command, even though a read request is physically sent to the adapter/ECU.

## Integration status

This package still needs an iOS host app, entitlement/configuration work, and a user-facing bridge into the offline diagnostic UI. The host app must include `NSBluetoothAlwaysUsageDescription`. It supports BLE GATT only; Bluetooth Classic ELM327 adapters require a separate MFi/vendor-supported route and are not claimed compatible.

Windows cannot build, sign, or run this iOS package. Before a vehicle trial, build it on macOS/Xcode, verify BLE discovery and GATT characteristic selection with the actual adapter, then run the fixed read-only queue while recording only the structured scan archive.
