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

## CI device artifact

The `iOS Read-Only Host` GitHub Actions workflow runs the Swift unit tests, simulator build and integration tests, and Web diagnostic-archive validation before creating an `iphoneos` Release artifact. On a `main` push only, it uploads an IPA named with `unsigned`, the source commit, and the workflow run number, together with its SHA-256 and `unsigned-device-build.json` manifest.

This CI artifact is an unsigned device build for a later controlled local-signing check. It is not directly installable or launchable on an iPhone, is not a TestFlight/App Store package, and does not establish ELM327 hardware compatibility. The manifest must retain `signed:false`, `installable:false`, and `vehicle_command_enabled:false`. A usable vehicle trial still requires a matching development signature and provisioning profile, installation on the test iPhone, and BLE GATT verification with the actual adapter.
