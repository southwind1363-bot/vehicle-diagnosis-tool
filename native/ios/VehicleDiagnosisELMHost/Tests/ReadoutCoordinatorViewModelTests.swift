import Foundation
import XCTest
@testable import VehicleDiagnosisELMHost
import ELM327BLEConnector

final class ReadoutCoordinatorViewModelTests: XCTestCase {
    @MainActor
    func testUniqueGattCharacteristicPairIsSuggestedButAmbiguousPairsAreNot() {
        let transmit = BLECharacteristicCandidate(
            serviceUUID: "FFF0",
            characteristicUUID: "FFF1",
            supportsNotify: false,
            supportsWrite: true,
            supportsWriteWithoutResponse: false
        )
        let receive = BLECharacteristicCandidate(
            serviceUUID: "FFF0",
            characteristicUUID: "FFF2",
            supportsNotify: true,
            supportsWrite: false,
            supportsWriteWithoutResponse: false
        )
        let suggestion = ReadoutCoordinatorViewModel.suggestedCharacteristicIDs(from: [transmit, receive])
        XCTAssertEqual(suggestion?.transmitID, "FFF0/FFF1")
        XCTAssertEqual(suggestion?.receiveID, "FFF0/FFF2")

        let alternateTransmit = BLECharacteristicCandidate(
            serviceUUID: "FFF0",
            characteristicUUID: "FFF3",
            supportsNotify: false,
            supportsWrite: false,
            supportsWriteWithoutResponse: true
        )
        XCTAssertNil(ReadoutCoordinatorViewModel.suggestedCharacteristicIDs(from: [transmit, receive, alternateTransmit]))
    }

    @MainActor
    func testCompletedArchiveUpdatesTheHostState() async throws {
        let context = NativeConnectorSessionContext(
            scanID: UUID(uuidString: "11111111-1111-4111-8111-111111111111")!,
            connectionID: UUID(uuidString: "22222222-2222-4222-8222-222222222222")!,
            vehicleContextID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
        )
        let coordinator = NativeConnectorReadoutCoordinator()
        let viewModel = ReadoutCoordinatorViewModel(coordinator: coordinator)
        let envelope = try decode(NativeConnectorEnvelope.self, json: """
        {
          "schema_version": "native_connector_contract_v1",
          "interface_id": "user-vci-elm327",
          "platform": "ios",
          "intent": "read_stored_dtc",
          "captured_at": "2026-07-22T00:00:00Z",
          "scan_id": "\(context.scanID.uuidString)",
          "connection_id": "\(context.connectionID.uuidString)",
          "vehicle_context_id": "\(context.vehicleContextID.uuidString)",
          "sequence": 1,
          "ok": true,
          "blocked": false,
          "would_transmit": false,
          "errors": [],
          "data": { "dtcs": [{ "code": "P0300", "status": "stored" }], "source_ecu": "7E8" }
        }
        """)
        let manifest = try decode(NativeConnectorCompletionManifest.self, json: """
        {
          "schema_version": "native_connector_completion_manifest_v1",
          "record_type": "completion_manifest",
          "platform": "ios",
          "interface_id": "user-vci-elm327",
          "scan_id": "\(context.scanID.uuidString)",
          "vehicle_context_id": "\(context.vehicleContextID.uuidString)",
          "captured_at": "2026-07-22T00:00:00Z",
          "scan_state": "completed",
          "expected_intents": ["read_stored_dtc"],
          "expected_readouts": ["stored_dtc_snapshot"],
          "expected_readout_scopes": [],
          "connection_segments": [{ "connection_id": "\(context.connectionID.uuidString)", "connection_sequence": 0, "first_sequence": 1, "last_sequence": 1, "envelope_count": 1 }],
          "interruption": null,
          "read_only": true,
          "vehicle_command_enabled": false,
          "execution_enabled": false,
          "would_transmit": false,
          "retained_raw_payload": false
        }
        """)

        coordinator.connector(coordinator.connector, didEmit: envelope)
        coordinator.connector(coordinator.connector, didComplete: manifest)
        await Task.yield()

        XCTAssertEqual(viewModel.archiveState, "Complete")
        XCTAssertEqual(viewModel.archiveRecordCount, 1)
        XCTAssertTrue(viewModel.canExportArchive)
        XCTAssertNil(viewModel.errorMessage)
    }

    @MainActor
    func testCompletedArchiveWritesAShareableValidatedJSONFile() async throws {
        let context = NativeConnectorSessionContext(
            scanID: UUID(uuidString: "44444444-4444-4444-8444-444444444444")!,
            connectionID: UUID(uuidString: "55555555-5555-4555-8555-555555555555")!,
            vehicleContextID: UUID(uuidString: "66666666-6666-4666-8666-666666666666")!
        )
        let coordinator = NativeConnectorReadoutCoordinator()
        let viewModel = ReadoutCoordinatorViewModel(coordinator: coordinator)
        let envelope = try decode(NativeConnectorEnvelope.self, json: """
        {
          "schema_version": "native_connector_contract_v1",
          "interface_id": "user-vci-elm327",
          "platform": "ios",
          "intent": "read_stored_dtc",
          "captured_at": "2026-07-23T00:00:00Z",
          "scan_id": "\(context.scanID.uuidString)",
          "connection_id": "\(context.connectionID.uuidString)",
          "vehicle_context_id": "\(context.vehicleContextID.uuidString)",
          "sequence": 1,
          "ok": true,
          "blocked": false,
          "would_transmit": false,
          "errors": [],
          "data": { "dtcs": [{ "code": "P0300", "status": "stored" }], "source_ecu": "7E8" }
        }
        """)
        let manifest = try decode(NativeConnectorCompletionManifest.self, json: """
        {
          "schema_version": "native_connector_completion_manifest_v1",
          "record_type": "completion_manifest",
          "platform": "ios",
          "interface_id": "user-vci-elm327",
          "scan_id": "\(context.scanID.uuidString)",
          "vehicle_context_id": "\(context.vehicleContextID.uuidString)",
          "captured_at": "2026-07-23T00:00:01Z",
          "scan_state": "completed",
          "expected_intents": ["read_stored_dtc"],
          "expected_readouts": ["stored_dtc_snapshot"],
          "expected_readout_scopes": [],
          "connection_segments": [{ "connection_id": "\(context.connectionID.uuidString)", "connection_sequence": 0, "first_sequence": 1, "last_sequence": 1, "envelope_count": 1 }],
          "interruption": null,
          "read_only": true,
          "vehicle_command_enabled": false,
          "execution_enabled": false,
          "would_transmit": false,
          "retained_raw_payload": false
        }
        """)

        coordinator.connector(coordinator.connector, didEmit: envelope)
        coordinator.connector(coordinator.connector, didComplete: manifest)
        await Task.yield()
        viewModel.prepareArchiveExport()

        let url = try XCTUnwrap(viewModel.exportURL)
        defer { try? FileManager.default.removeItem(at: url) }
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]

        XCTAssertEqual(url.lastPathComponent, "vehicle-diagnosis-readout-44444444.json")
        XCTAssertEqual((object?["completion_manifest"] as? [String: Any])?["record_type"] as? String, "completion_manifest")
        XCTAssertEqual((object?["envelopes"] as? [[String: Any]])?.count, 1)
        XCTAssertNil(object?["raw_frames"])
        XCTAssertNil(viewModel.errorMessage)
    }

    @MainActor
    func testArchiveStateDistinguishesCompletedInterruptedAndMissingArchives() {
        XCTAssertEqual(ReadoutCoordinatorViewModel.archiveState(for: .completed), "Complete")
        XCTAssertEqual(ReadoutCoordinatorViewModel.archiveState(for: .interrupted), "Interrupted")
        XCTAssertEqual(ReadoutCoordinatorViewModel.archiveState(for: nil), "Incomplete")

        let viewModel = ReadoutCoordinatorViewModel()
        XCTAssertFalse(viewModel.canExportArchive)
    }

    private func decode<T: Decodable>(_ type: T.Type, json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }
}
