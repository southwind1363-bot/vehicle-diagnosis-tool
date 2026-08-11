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
        XCTAssertEqual(
            ReadoutCoordinatorViewModel.transmitCharacteristicCandidates(from: [transmit, receive, alternateTransmit]).map(\.characteristicUUID),
            ["FFF1", "FFF3"]
        )
        XCTAssertEqual(
            ReadoutCoordinatorViewModel.receiveCharacteristicCandidates(from: [transmit, receive, alternateTransmit]).map(\.characteristicUUID),
            ["FFF2"]
        )
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
          "readout_id": "stored_dtc_snapshot",
          "readout_scope_id": "7E8",
          "readout_attempt": 0,
          "data": { "dtcs": [{ "code": "P0300", "status": "stored" }], "source_ecu": "7E8", "vehicle_command_enabled": false }
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
          "expected_readout_scopes": [{ "readout_id": "stored_dtc_snapshot", "scope_id": "7E8" }],
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
        XCTAssertEqual(viewModel.readoutProfileLabel, "未記録")
        XCTAssertEqual(viewModel.readoutCompletionLabel, "予定 1 / 取得 1 / 未取得 0")
        XCTAssertEqual(viewModel.missingReadoutLabels, [])
        XCTAssertTrue(viewModel.canExportArchive)
        XCTAssertNil(viewModel.errorMessage)
    }

    func testReadoutProfileLabelKeepsInitialAndQuickScopesDistinct() {
        XCTAssertEqual(ReadoutCoordinatorViewModel.readoutProfileLabel(for: .initialDiagnostic), "初期診断読取")
        XCTAssertEqual(ReadoutCoordinatorViewModel.readoutProfileLabel(for: .quickCondition), "クイック状態確認")
        XCTAssertEqual(ReadoutCoordinatorViewModel.readoutProfileLabel(for: nil), "未記録")
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
          "readout_id": "stored_dtc_snapshot",
          "readout_scope_id": "7E8",
          "readout_attempt": 0,
          "data": { "dtcs": [{ "code": "P0300", "status": "stored" }], "source_ecu": "7E8", "vehicle_command_enabled": false }
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
          "expected_readout_scopes": [{ "readout_id": "stored_dtc_snapshot", "scope_id": "7E8" }],
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
    func testInvalidCompletionManifestCannotBeExported() async throws {
        let coordinator = NativeConnectorReadoutCoordinator()
        let viewModel = ReadoutCoordinatorViewModel(coordinator: coordinator)
        let envelope = try readoutEnvelope(readoutID: "live_pid_snapshot", scopeID: "7E8")
        let manifest = try decode(NativeConnectorCompletionManifest.self, json: """
        {
          "schema_version": "native_connector_completion_manifest_v1",
          "record_type": "completion_manifest",
          "platform": "ios",
          "interface_id": "user-vci-elm327",
          "scan_id": "\(envelope.scanID.uuidString)",
          "vehicle_context_id": "\(envelope.vehicleContextID.uuidString)",
          "captured_at": "2026-08-11T00:00:01Z",
          "scan_state": "completed",
          "expected_intents": ["read_live_pid_snapshot"],
          "expected_readouts": ["live_pid_snapshot"],
          "expected_readout_scopes": [{ "readout_id": "live_pid_snapshot", "scope_id": "7E9" }],
          "connection_segments": [{ "connection_id": "\(envelope.connectionID.uuidString)", "connection_sequence": 0, "first_sequence": 1, "last_sequence": 1, "envelope_count": 1 }],
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

        XCTAssertEqual(viewModel.archiveState, "Incomplete")
        XCTAssertFalse(viewModel.canExportArchive)
        XCTAssertNil(viewModel.exportURL)
        XCTAssertNotNil(viewModel.errorMessage)
    }

    @MainActor
    func testArchiveStateDistinguishesCompletedInterruptedAndMissingArchives() {
        XCTAssertEqual(ReadoutCoordinatorViewModel.archiveState(for: .completed), "Complete")
        XCTAssertEqual(ReadoutCoordinatorViewModel.archiveState(for: .completed, hasReadoutFailures: true), "Partial")
        XCTAssertEqual(ReadoutCoordinatorViewModel.archiveState(for: .interrupted), "Interrupted")
        XCTAssertEqual(ReadoutCoordinatorViewModel.archiveState(for: nil), "Incomplete")

        let viewModel = ReadoutCoordinatorViewModel()
        XCTAssertFalse(viewModel.canExportArchive)
    }

    @MainActor
    func testReadoutCompletionKeepsExpectedButUncapturedReadoutsVisible() {
        let completion = ReadoutCoordinatorViewModel.readoutCompletion(
            expectedReadoutIDs: ["stored_dtc_snapshot", "readiness_snapshot", "stored_dtc_snapshot"],
            envelopes: []
        )

        XCTAssertEqual(completion.expectedCount, 2)
        XCTAssertEqual(completion.capturedCount, 0)
        XCTAssertEqual(completion.missingIDs, ["readiness_snapshot", "stored_dtc_snapshot"])
    }

    @MainActor
    func testReadoutCompletionRejectsErrorBlockedAndTransmittingEnvelopes() throws {
        let completion = ReadoutCoordinatorViewModel.readoutCompletion(
            expectedReadoutIDs: ["live_pid_snapshot", "readiness_snapshot", "stored_dtc_snapshot", "freeze_frame_snapshot"],
            envelopes: [
                try readoutEnvelope(readoutID: "live_pid_snapshot", scopeID: "7E8", ok: true, blocked: false, wouldTransmit: false, errors: []),
                try readoutEnvelope(readoutID: "readiness_snapshot", scopeID: "7E8", ok: true, blocked: false, wouldTransmit: false, errors: ["transport_failure"]),
                try readoutEnvelope(readoutID: "stored_dtc_snapshot", scopeID: "7E8", ok: true, blocked: true, wouldTransmit: false, errors: []),
                try readoutEnvelope(readoutID: "freeze_frame_snapshot", scopeID: "7E8", ok: true, blocked: false, wouldTransmit: true, errors: [])
            ]
        )

        XCTAssertEqual(completion.expectedCount, 4)
        XCTAssertEqual(completion.capturedCount, 1)
        XCTAssertEqual(completion.missingIDs, ["freeze_frame_snapshot", "readiness_snapshot", "stored_dtc_snapshot"])
    }

    @MainActor
    func testReadoutScopeSummaryKeepsObservedECUScopesVisibleWithoutGuessingMissingECUs() {
        let summary = ReadoutCoordinatorViewModel.readoutScopeSummary([
            NativeConnectorReadoutScope(readoutID: "stored_dtc_snapshot", scopeID: "7E9"),
            NativeConnectorReadoutScope(readoutID: "readiness_snapshot", scopeID: "7E8"),
            NativeConnectorReadoutScope(readoutID: "stored_dtc_snapshot", scopeID: "7E8")
        ])

        XCTAssertEqual(summary, "2 ECU / 7E8 / 7E9")
        XCTAssertEqual(ReadoutCoordinatorViewModel.readoutScopeSummary([]), "ECUスコープ未取得")
    }

    @MainActor
    func testObservedReadoutScopesExcludeErrorsBlockedAndTransmittingEnvelopes() throws {
        let scopes = ReadoutCoordinatorViewModel.observedReadoutScopes([
            try readoutEnvelope(readoutID: "live_pid_snapshot", scopeID: "7E8"),
            try readoutEnvelope(readoutID: "readiness_snapshot", scopeID: "7E9", errors: ["transport_failure"]),
            try readoutEnvelope(readoutID: "stored_dtc_snapshot", scopeID: "7EA", blocked: true),
            try readoutEnvelope(readoutID: "freeze_frame_snapshot", scopeID: "7EB", wouldTransmit: true),
            try readoutEnvelope(readoutID: "live_pid_snapshot", scopeID: "7E8")
        ])

        XCTAssertEqual(scopes, [NativeConnectorReadoutScope(readoutID: "live_pid_snapshot", scopeID: "7E8")])
        XCTAssertEqual(ReadoutCoordinatorViewModel.readoutScopeSummary(scopes), "1 ECU / 7E8")
    }

    @MainActor
    func testCaptureRangeSummaryKeepsOnlyValidReadoutTimesAndPreservesTheirRange() {
        XCTAssertEqual(
            ReadoutCoordinatorViewModel.captureRangeSummary(capturedAtValues: [
                "2026-08-06T00:00:10Z",
                "invalid",
                "2026-08-06T00:00:00Z"
            ]),
            "2026-08-06T00:00:00Z -> 2026-08-06T00:00:10Z / 10秒"
        )
        XCTAssertEqual(ReadoutCoordinatorViewModel.captureRangeSummary(capturedAtValues: ["2026-08-06T00:00:00.250Z"]), "2026-08-06T00:00:00.250Z")
        XCTAssertEqual(ReadoutCoordinatorViewModel.captureRangeSummary(capturedAtValues: ["invalid"]), "未取得")
    }

    @MainActor
    func testReadoutFailureLabelsExplainTransportStopConditions() {
        let viewModel = ReadoutCoordinatorViewModel()

        XCTAssertEqual(viewModel.readoutFailureLabel("adapter_setup_failed"), "ELM327初期化応答を確認できないため、読取前に中断しました")
        XCTAssertEqual(viewModel.readoutFailureLabel("vehicle_link_error"), "車両ECUとの通信を確立できないため、以降の読取を中断しました")
        XCTAssertEqual(viewModel.readoutFailureLabel("transport_failure"), "アダプターまたは車両通信の異常を検出したため、中断しました")
    }

    @MainActor
    func testArchiveLimitErrorUsesTheActualArchiveSafetyLimit() {
        let viewModel = ReadoutCoordinatorViewModel()
        let expected = "読取結果が安全な保存上限の\(NativeConnectorScanArchiveBuilder.maximumEnvelopeCount)件を超えたため、中断しました。"

        XCTAssertEqual(viewModel.archiveErrorMessage(.tooManyEnvelopes), expected)
    }

    private func readoutEnvelope(
        readoutID: String,
        scopeID: String,
        ok: Bool = true,
        blocked: Bool = false,
        wouldTransmit: Bool = false,
        errors: [String] = []
    ) throws -> NativeConnectorEnvelope {
        let context = NativeConnectorSessionContext(scanID: UUID(), connectionID: UUID(), vehicleContextID: UUID())
        let encodedErrors = String(data: try JSONEncoder().encode(errors), encoding: .utf8) ?? "[]"
        return try decode(NativeConnectorEnvelope.self, json: """
        {
          "schema_version": "native_connector_contract_v1",
          "interface_id": "user-vci-elm327",
          "platform": "ios",
          "intent": "read_live_pid_snapshot",
          "captured_at": "2026-08-11T00:00:00Z",
          "scan_id": "\(context.scanID.uuidString)",
          "connection_id": "\(context.connectionID.uuidString)",
          "vehicle_context_id": "\(context.vehicleContextID.uuidString)",
          "sequence": 1,
          "readout_id": "\(readoutID)",
          "readout_scope_id": "\(scopeID)",
          "readout_attempt": 0,
          "ok": \(ok),
          "blocked": \(blocked),
          "would_transmit": \(wouldTransmit),
          "errors": \(encodedErrors),
          "data": { "vehicle_command_enabled": false }
        }
        """)
    }

    private func decode<T: Decodable>(_ type: T.Type, json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }
}
