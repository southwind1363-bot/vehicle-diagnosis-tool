import Foundation
import XCTest
@testable import ELM327BLEConnector

final class NativeConnectorCompletionManifestTests: XCTestCase {
    func testReadoutProfilesRoundTripAndLegacyProfileRemainsOptional() throws {
        for profile in [NativeConnectorReadoutProfile.adapterPreflight, .initialDiagnostic, .quickCondition] {
            let encoded = try JSONEncoder().encode(profile)
            XCTAssertEqual(try JSONDecoder().decode(NativeConnectorReadoutProfile.self, from: encoded), profile)
        }
        let legacy = Data(#"{"schema_version":"native_connector_completion_manifest_v1","record_type":"completion_manifest","platform":"ios","interface_id":"user-vci-elm327","adapter_transport":"ble_gatt","scan_id":"11111111-1111-4111-8111-111111111111","vehicle_context_id":"33333333-3333-4333-8333-333333333333","captured_at":"2026-07-21T00:00:00Z","scan_state":"completed","expected_intents":["adapter_identity"],"expected_readouts":["adapter_identity"],"expected_readout_scopes":[],"connection_segments":[{"connection_id":"22222222-2222-4222-8222-222222222222","connection_sequence":0,"first_sequence":1,"last_sequence":1,"envelope_count":1}],"interruption":null,"read_only":true,"vehicle_command_enabled":false,"execution_enabled":false,"would_transmit":false,"retained_raw_payload":false}"#.utf8)
        XCTAssertNil(try JSONDecoder().decode(NativeConnectorCompletionManifest.self, from: legacy).readoutProfile)
    }

    func testCompletedManifestUsesSeparateReadOnlyTerminalSchema() throws {
        let context = NativeConnectorSessionContext(
            scanID: UUID(uuidString: "11111111-1111-4111-8111-111111111111")!,
            connectionID: UUID(uuidString: "22222222-2222-4222-8222-222222222222")!,
            vehicleContextID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
        )
        let manifest = NativeConnectorCompletionManifest(
            schemaVersion: "native_connector_completion_manifest_v1",
            recordType: "completion_manifest",
            platform: "ios",
            interfaceID: "user-vci-elm327",
            scanID: context.scanID,
            vehicleContextID: context.vehicleContextID,
            capturedAt: "2026-07-21T00:00:00Z",
            scanState: .completed,
            expectedIntents: ["read_stored_dtc"],
            expectedReadouts: ["stored_dtc_snapshot"],
            expectedReadoutScopes: [],
            connectionSegments: [NativeConnectorConnectionSegment(connectionID: context.connectionID, connectionSequence: 0, firstSequence: 1, lastSequence: 1, envelopeCount: 1)],
            interruption: nil,
            readOnly: true,
            vehicleCommandEnabled: false,
            executionEnabled: false,
            wouldTransmit: false,
            retainedRawPayload: false
        )
        let object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(manifest)) as? [String: Any]

        XCTAssertEqual(object?["schema_version"] as? String, "native_connector_completion_manifest_v1")
        XCTAssertEqual(object?["record_type"] as? String, "completion_manifest")
        XCTAssertEqual(object?["adapter_transport"] as? String, "ble_gatt")
        XCTAssertEqual(object?["scan_state"] as? String, "completed")
        XCTAssertEqual(object?["vehicle_command_enabled"] as? Bool, false)
        XCTAssertEqual(object?["execution_enabled"] as? Bool, false)
        XCTAssertEqual(object?["would_transmit"] as? Bool, false)
        XCTAssertEqual(object?["retained_raw_payload"] as? Bool, false)
        XCTAssertNil(object?["envelopes"])
    }

    func testInterruptionKeepsOnlyStableBoundaryFields() {
        let interruption = NativeConnectorInterruption(
            code: "transport:disconnected",
            connectionID: UUID(uuidString: "22222222-2222-4222-8222-222222222222"),
            sequence: 0
        )

        XCTAssertEqual(interruption.code, "transport:disconnected")
        XCTAssertEqual(interruption.sequence, 0)
        XCTAssertNotNil(interruption.connectionID)
    }
}
