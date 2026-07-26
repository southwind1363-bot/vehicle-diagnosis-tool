# VehicleDiagnosisELMHost

Minimal SwiftUI host for a BLE GATT ELM327 adapter on iPhone. It performs read-only DTC, freeze-frame, readiness, ECU-information, supported-PID, and standard-PID acquisition.

There is no DTC clear, active test, coding, or relearn operation in this host or in the connector package.

## Build on macOS

1. Install Xcode and XcodeGen.
2. Run `xcodegen generate` in this directory.
3. Open `VehicleDiagnosisELMHost.xcodeproj`, then set a development team for code signing.
4. Build to an iPhone running iOS 16 or later.

Bluetooth Classic-only ELM327 mini adapters cannot use this iPhone BLE GATT route. Actual compatibility remains unproven until tested with an adapter that publishes BLE GATT characteristics.

The adapter search runs for 12 seconds, retains the discovered BLE devices after it finishes, and can be run again. When no BLE device is found, treat the result as an iPhone transport incompatibility check, not a vehicle or ECU diagnosis result.

The export action writes only a validated structured archive with its completion manifest. Raw response frames and debug logs are not retained.
