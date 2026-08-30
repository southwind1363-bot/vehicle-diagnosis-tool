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

Each discovered candidate displays only in-memory advertisement evidence: RSSI, the advertised connectable flag, and up to four advertised service UUIDs. Missing advertisement fields do not reject a candidate, and a matching name or service never establishes ELM327 compatibility. Compatibility still requires connection, writable/notifiable GATT characteristic confirmation, and a usable read-only adapter identity response.

The export action writes only a validated structured archive with its completion manifest. Raw response frames and debug logs are not retained.

## CI device artifact

The `iOS Read-Only Host` GitHub Actions workflow runs the Swift unit tests, simulator build and integration tests, and Web diagnostic-archive validation before creating an `iphoneos` Release artifact. On a `main` push only, it uploads an IPA named with `unsigned`, the source commit, and the workflow run number, together with its SHA-256 and `unsigned-device-build.json` manifest.

This CI artifact is an unsigned device build for a later controlled local-signing check. It is not directly installable or launchable on an iPhone, is not a TestFlight/App Store package, and does not establish ELM327 hardware compatibility. The manifest must retain `signed:false`, `installable:false`, and `vehicle_command_enabled:false`. A usable vehicle trial still requires a matching development signature and provisioning profile, installation on the test iPhone, and BLE GATT verification with the actual adapter.

## Controlled development signing

The manually dispatched `iOS Signed Development Host` workflow can create a development-signed IPA after the protected `ios-device-signing` GitHub Environment has been configured. It never runs on a push or pull request. Configure an environment approval rule and these environment secrets:

- `IOS_DEVELOPMENT_CERTIFICATE_P12_BASE64`: Base64 of an Apple Development certificate and private key exported as PKCS#12.
- `IOS_DEVELOPMENT_CERTIFICATE_PASSWORD`: Password of that PKCS#12 file.
- `IOS_DEVELOPMENT_PROVISIONING_PROFILE_BASE64`: Base64 of an unexpired iOS App Development profile for the exact `com.mukiguri.VehicleDiagnosisELMHost` App ID and registered test iPhone.

The job accepts only a development profile with `get-task-allow:true`, an exact App ID match, at least one registered device, and more than 24 hours of validity. It imports the certificate into a temporary keychain, removes the keychain and installed profile on every exit, verifies the signed app before and after IPA packaging, and retains the artifact for three days. The resulting IPA is only a candidate for devices included in that profile; its manifest keeps `target_device_installation_verified:false`, `read_only:true`, and `vehicle_command_enabled:false` until installation and actual BLE GATT verification are completed.
