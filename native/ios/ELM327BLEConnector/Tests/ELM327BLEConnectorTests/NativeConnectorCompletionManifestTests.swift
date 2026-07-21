import Foundation
import XCTest
@testable import ELM327BLEConnector

final class NativeConnectorCompletionManifestTests: XCTestCase {
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
