# ELM327 BLE Host

This is the iPhone host app for the product-owned BLE GATT ELM327 read-only connector. It discovers an adapter, requires explicit transmit/notify characteristic confirmation, runs only the fixed read queue, and exports the completed structured archive as local JSON.

The JSON file imports into the offline diagnostic UI through its existing file-import control. The host does not retain raw ELM responses and does not expose DTC clear, service functions, active tests, coding, or arbitrary commands.

## Build boundary

The app target is generated from `project.yml` with XcodeGen on macOS, then built and signed with Xcode for iOS 16 or later. `Info.plist` includes the required Bluetooth permission text. Windows cannot generate a signed iPhone application or perform the real BLE adapter validation.
