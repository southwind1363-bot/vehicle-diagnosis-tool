import XCTest
@testable import VehicleDiagnosisELMHost
import ELM327BLEConnector

@MainActor
final class ReadoutCoordinatorViewModelTests: XCTestCase {
    func testCompletedArchiveUpdatesTheHostState() async throws {
        let context = NativeConnectorSessionContext(
            scanID: UUID(uuidString: "11111111-1111-4111-8111-111111111111")!,
            connectionID: UUID(uuidString: "22222222-2222-4222-8222-222222222222")!,
            vehicleContextID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
        )
        let coordinator = NativeConnectorReadoutCoordinator()
        let viewModel = ReadoutCoordinatorViewModel(coordinator: coordinator)
        let envelope = NativeConnectorEnvelopeFactory.dtcs(
            context: context,
            sequence: 1,
            intent: "read_stored_dtc",
            scopeID: "7E8",
            dtcs: [OBD2DTC(code: "P0300", status: "stored")]
        )
        let manifest = NativeConnectorCompletionManifest(
            schemaVersion: "native_connector_completion_manifest_v1",
            recordType: "completion_manifest",
            platform: "ios",
            interfaceID: "user-vci-elm327",
            scanID: context.scanID,
            vehicleContextID: context.vehicleContextID,
            capturedAt: "2026-07-22T00:00:00Z",
            scanState: .completed,
            expectedIntents: ["read_stored_dtc"],
            expectedReadouts: ["stored_dtc_snapshot"],
            expectedReadoutScopes: [],
            connectionSegments: [
                NativeConnectorConnectionSegment(
                    connectionID: context.connectionID,
                    connectionSequence: 0,
                    firstSequence: 1,
                    lastSequence: 1,
                    envelopeCount: 1
                )
            ],
            interruption: nil,
            readOnly: true,
            vehicleCommandEnabled: false,
            executionEnabled: false,
            wouldTransmit: false,
            retainedRawPayload: false
        )

        coordinator.connector(coordinator.connector, didEmit: envelope)
        coordinator.connector(coordinator.connector, didComplete: manifest)
        await Task.yield()

        XCTAssertEqual(viewModel.archiveState, "Complete")
        XCTAssertEqual(viewModel.archiveRecordCount, 1)
        XCTAssertNil(viewModel.errorMessage)
    }
}
