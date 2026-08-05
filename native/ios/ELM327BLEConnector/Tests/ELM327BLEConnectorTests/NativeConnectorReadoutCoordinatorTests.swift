import XCTest
@testable import ELM327BLEConnector

final class NativeConnectorReadoutCoordinatorTests: XCTestCase {
    private let context = NativeConnectorSessionContext(
        scanID: UUID(uuidString: "11111111-1111-4111-8111-111111111111")!,
        connectionID: UUID(uuidString: "22222222-2222-4222-8222-222222222222")!,
        vehicleContextID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    )

    func testCoordinatorExportsOnlyACompletedStructuredArchive() throws {
        let coordinator = NativeConnectorReadoutCoordinator()
        var updateCount = 0
        coordinator.didUpdate = { updateCount += 1 }
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
            connectionSegments: [NativeConnectorConnectionSegment(connectionID: context.connectionID, connectionSequence: 0, firstSequence: 1, lastSequence: 1, envelopeCount: 1)],
            interruption: nil,
            readOnly: true,
            vehicleCommandEnabled: false,
            executionEnabled: false,
            wouldTransmit: false,
            retainedRawPayload: false
        )

        coordinator.connector(coordinator.connector, didEmit: envelope)
        XCTAssertEqual(coordinator.capturedEnvelopeCount, 1)
        coordinator.connector(coordinator.connector, didComplete: manifest)
        let archive = try coordinator.exportCompletedArchive()

        XCTAssertEqual(archive.envelopes, [envelope])
        XCTAssertEqual(archive.completionManifest, manifest)
        XCTAssertNil(coordinator.archiveError)
        XCTAssertGreaterThanOrEqual(updateCount, 2)
        XCTAssertThrowsError(try NativeConnectorReadoutCoordinator().exportCompletedArchive())
    }

    func testCoordinatorBuildsDeduplicatedPreviewFromAcceptedEnvelopes() {
        let coordinator = NativeConnectorReadoutCoordinator()
        let dtc = NativeConnectorEnvelopeFactory.dtcs(
            context: context,
            sequence: 1,
            intent: "read_stored_dtc",
            scopeID: "7E8",
            dtcs: [OBD2DTC(code: "P0300", status: "stored")]
        )
        let duplicateDTC = NativeConnectorEnvelopeFactory.dtcs(
            context: context,
            sequence: 2,
            intent: "read_stored_dtc",
            scopeID: "7E8",
            dtcs: [OBD2DTC(code: "P0300", status: "stored")]
        )
        let monitor = NativeConnectorEnvelopeFactory.livePID(
            context: context,
            sequence: 3,
            scopeID: "7E8",
            value: OBD2MonitorValue(id: "engine_speed", pid: "0C", value: 1726, unit: "rpm")
        )
        let textMonitor = NativeConnectorEnvelopeFactory.livePID(
            context: context,
            sequence: 4,
            scopeID: "7E8",
            value: OBD2TextMonitorValue(id: "obd_standard", pid: "1C", value: "eobd", unit: "")
        )
        let readiness = NativeConnectorEnvelopeFactory.readiness(
            context: context,
            sequence: 5,
            scopeID: "7E8",
            status: OBD2ReadinessStatus(
                milOn: false,
                dtcCount: 1,
                statusByteA: 1,
                statusByteB: 1,
                statusByteC: 0,
                statusByteD: 0,
                ignitionType: "spark"
            )
        )
        let ecuInfo = NativeConnectorEnvelopeFactory.ecuInfo(
            context: context,
            sequence: 6,
            scopeID: "7E8",
            id: "calibration_id",
            infoType: "04",
            value: "ECM-CAL-01"
        )
        let performanceTracking = NativeConnectorEnvelopeFactory.ecuInfo(
            context: context,
            sequence: 7,
            scopeID: "7E8",
            id: "in_use_performance_tracking_spark",
            infoType: "08",
            value: "00 00 00 01"
        )
        let secondaryEcuInfo = NativeConnectorEnvelopeFactory.ecuInfo(
            context: context,
            sequence: 8,
            scopeID: "7E9",
            id: "calibration_id",
            infoType: "04",
            value: "TCM-CAL-02"
        )
        let onboardMonitor = NativeConnectorEnvelopeFactory.onboardMonitor(
            context: context,
            sequence: 9,
            scopeID: "7E8",
            tests: [OBD2OnboardMonitorTest(testID: "01", componentID: "02", value: 3, minimum: 1, maximum: 5)]
        )
        let supportedPIDs = NativeConnectorEnvelopeFactory.supportedPIDs(
            context: context,
            sequence: 10,
            scopeID: "7E8",
            pageBase: "00",
            pids: ["0C", "04"]
        )
        let permanentDTCFailure = NativeConnectorEnvelopeFactory.failedReadout(
            context: context,
            sequence: 11,
            command: .permanentDTC,
            error: "readout_not_available"
        )
        let freezeFrameTrigger = NativeConnectorEnvelopeFactory.freezeFrameTriggerDTC(
            context: context,
            sequence: 12,
            scopeID: "7E8",
            code: "P0171"
        )
        let fallbackFreezeFrameTrigger = NativeConnectorEnvelope(
            schemaVersion: "native_connector_contract_v1",
            interfaceID: "user-vci-elm327",
            platform: "ios",
            intent: "read_freeze_frame",
            capturedAt: "2026-07-22T00:00:00Z",
            scanID: context.scanID,
            connectionID: context.connectionID,
            vehicleContextID: context.vehicleContextID,
            sequence: 13,
            readoutID: "freeze_frame_snapshot",
            readoutScopeID: "7E8",
            readoutAttempt: 0,
            ok: true,
            blocked: false,
            wouldTransmit: false,
            errors: [],
            data: [
                "trigger_dtc": .string("P0300"),
                "trigger_dtc_entries": .array([]),
                "values": .array([]),
                "freeze_frame_readout_status": .string("reported"),
                "vehicle_command_enabled": .bool(false)
            ]
        )
        let freezeFrameFuelStatus = NativeConnectorEnvelopeFactory.freezeFrameValue(
            context: context,
            sequence: 14,
            scopeID: "7E8",
            value: OBD2TextMonitorValue(id: "fuel_system_status", pid: "03", value: "closed_loop_using_oxygen_sensor", unit: "")
        )

        coordinator.connector(coordinator.connector, didEmit: dtc)
        coordinator.connector(coordinator.connector, didEmit: duplicateDTC)
        coordinator.connector(coordinator.connector, didEmit: monitor)
        coordinator.connector(coordinator.connector, didEmit: textMonitor)
        coordinator.connector(coordinator.connector, didEmit: readiness)
        coordinator.connector(coordinator.connector, didEmit: ecuInfo)
        coordinator.connector(coordinator.connector, didEmit: performanceTracking)
        coordinator.connector(coordinator.connector, didEmit: secondaryEcuInfo)
        coordinator.connector(coordinator.connector, didEmit: onboardMonitor)
        coordinator.connector(coordinator.connector, didEmit: supportedPIDs)
        coordinator.connector(coordinator.connector, didEmit: permanentDTCFailure)
        coordinator.connector(coordinator.connector, didEmit: freezeFrameTrigger)
        coordinator.connector(coordinator.connector, didEmit: fallbackFreezeFrameTrigger)
        coordinator.connector(coordinator.connector, didEmit: freezeFrameFuelStatus)

        XCTAssertEqual(coordinator.readoutPreview.storedDTCs.map(\.code), ["P0300"])
        XCTAssertEqual(coordinator.readoutPreview.liveValues, [NativeConnectorReadoutPreview.MonitorValue(monitorID: "engine_speed", pid: "0C", value: 1726, unit: "rpm", sourceScopeID: "7E8")])
        XCTAssertEqual(coordinator.readoutPreview.liveTextValues, [NativeConnectorReadoutPreview.TextMonitorValue(monitorID: "obd_standard", pid: "1C", value: "eobd", unit: "", sourceScopeID: "7E8")])
        XCTAssertEqual(coordinator.readoutPreview.freezeFrameTriggerDTCs, [
            NativeConnectorReadoutPreview.DTC(code: "P0171", status: "freeze_frame", sourceScopeID: "7E8"),
            NativeConnectorReadoutPreview.DTC(code: "P0300", status: "freeze_frame", sourceScopeID: "7E8")
        ])
        XCTAssertEqual(coordinator.readoutPreview.freezeFrameTextValues, [
            NativeConnectorReadoutPreview.TextMonitorValue(monitorID: "fuel_system_status", pid: "03", value: "closed_loop_using_oxygen_sensor", unit: "", sourceScopeID: "7E8")
        ])
        XCTAssertEqual(coordinator.readoutPreview.readiness, [NativeConnectorReadoutPreview.Readiness(sourceScopeID: "7E8", milOn: false, dtcCount: 1, ignitionType: "spark", supportedMonitorCount: 1, incompleteMonitorCount: 0)])
        XCTAssertEqual(coordinator.readoutPreview.ecuInfo, [
            NativeConnectorReadoutPreview.ECUInfo(infoID: "calibration_id", infoType: "04", value: "ECM-CAL-01", sourceScopeID: "7E8"),
            NativeConnectorReadoutPreview.ECUInfo(infoID: "in_use_performance_tracking_spark", infoType: "08", value: "00 00 00 01", sourceScopeID: "7E8"),
            NativeConnectorReadoutPreview.ECUInfo(infoID: "calibration_id", infoType: "04", value: "TCM-CAL-02", sourceScopeID: "7E9")
        ])
        XCTAssertEqual(coordinator.readoutPreview.onboardMonitors, [NativeConnectorReadoutPreview.OnboardMonitor(testID: "01", componentID: "02", value: 3, minimum: 1, maximum: 5, sourceScopeID: "7E8")])
        XCTAssertEqual(coordinator.readoutPreview.supportedPIDs, [NativeConnectorReadoutPreview.SupportedPIDs(sourceScopeID: "7E8", pids: ["04", "0C"])])
        XCTAssertEqual(coordinator.readoutPreview.readoutFailures, [NativeConnectorReadoutPreview.ReadoutFailure(intent: "read_permanent_dtc", readoutID: "permanent_dtc_snapshot", sourceScopeID: "LEGACY", errorCodes: ["readout_not_available"])])
    }

    func testPreviewDoesNotUseDiagnosticValuesFromFailedReadouts() {
        let accepted = NativeConnectorEnvelopeFactory.dtcs(
            context: context,
            sequence: 1,
            intent: "read_stored_dtc",
            scopeID: "7E8",
            dtcs: [OBD2DTC(code: "P0171", status: "stored")]
        )
        let failed = NativeConnectorEnvelope(
            schemaVersion: "native_connector_contract_v1",
            interfaceID: "user-vci-elm327",
            platform: "ios",
            intent: "read_stored_dtc",
            capturedAt: "2026-08-06T00:00:00Z",
            scanID: context.scanID,
            connectionID: context.connectionID,
            vehicleContextID: context.vehicleContextID,
            sequence: 2,
            readoutID: "stored_dtc_snapshot",
            readoutScopeID: "7E8",
            readoutAttempt: 0,
            ok: false,
            blocked: false,
            wouldTransmit: false,
            errors: ["transport_failure"],
            data: ["dtcs": .array([.object(["code": .string("P0300"), "status": .string("stored")])])]
        )

        let preview = NativeConnectorReadoutPreview(envelopes: [accepted, failed])

        XCTAssertEqual(preview.storedDTCs.map(\.code), ["P0171"])
        XCTAssertEqual(preview.readoutFailures, [NativeConnectorReadoutPreview.ReadoutFailure(intent: "read_stored_dtc", readoutID: "stored_dtc_snapshot", sourceScopeID: "7E8", errorCodes: ["transport_failure"])])
    }
}
