import XCTest
@testable import ELM327BLEConnector

final class NativeConnectorEnvelopeTests: XCTestCase {
    func testAdapterIdentityOmitsRawAdapterIdentifiers() throws {
        let envelope = NativeConnectorEnvelopeFactory.adapterIdentity(
            context: NativeConnectorSessionContext(),
            sequence: 1,
            adapterName: "STN1170 SN: 979867700221",
            protocolHint: "AUTO, ISO 15765-4 (CAN 11/500)",
            protocolNumber: "A6"
        )

        let json = String(data: try JSONEncoder().encode(envelope), encoding: .utf8)!
        XCTAssertTrue(json.contains("\"adapter_family\":\"STN\""))
        XCTAssertTrue(json.contains("\"adapter_protocol_hint\":\"ISO 15765-4\""))
        XCTAssertTrue(json.contains("\"adapter_protocol_number\":\"A6\""))
        XCTAssertTrue(json.contains("\"readout_id\":\"adapter_identity\""))
        XCTAssertEqual(envelope.readoutID, "adapter_identity")
        XCTAssertFalse(json.contains("adapter_name"))
        XCTAssertFalse(json.contains("979867700221"))
    }

    func testUnknownAdapterIdentityIsNotPromotedToELM327() throws {
        let envelope = NativeConnectorEnvelopeFactory.adapterIdentity(
            context: NativeConnectorSessionContext(),
            sequence: 1,
            adapterName: "OBD Adapter 1.0",
            protocolHint: "AUTO",
            protocolNumber: "A0"
        )
        let json = String(data: try JSONEncoder().encode(envelope), encoding: .utf8)!
        XCTAssertTrue(json.contains("\"adapter_family\":\"unknown\""))
        XCTAssertFalse(json.contains("\"adapter_family\":\"ELM327\""))
    }

    func testLivePidEnvelopeUsesTheExistingReadOnlyContract() throws {
        let context = NativeConnectorSessionContext(
            scanID: UUID(uuidString: "11111111-1111-4111-8111-111111111111")!,
            connectionID: UUID(uuidString: "22222222-2222-4222-8222-222222222222")!,
            vehicleContextID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
        )
        let envelope = NativeConnectorEnvelopeFactory.livePID(
            context: context,
            sequence: 3,
            scopeID: "7E8",
            value: OBD2MonitorValue(id: "engine_speed", pid: "0C", value: 1726, unit: "rpm")
        )
        let json = String(data: try JSONEncoder().encode(envelope), encoding: .utf8)!
        XCTAssertTrue(json.contains("\"schema_version\":\"native_connector_contract_v1\""))
        XCTAssertTrue(json.contains("\"adapter_transport\":\"ble_gatt\""))
        XCTAssertTrue(json.contains("\"would_transmit\":false"))
        XCTAssertTrue(json.contains("\"readout_id\":\"live_pid_snapshot\""))
        XCTAssertTrue(json.contains("\"readout_scope_id\":\"7E8\""))
        XCTAssertTrue(json.contains("\"readout_attempt\":0"))
        XCTAssertTrue(json.contains("\"vehicle_command_enabled\":false"))
    }

    func testTextLivePidEnvelopeKeepsStringValueAndReadOnlyContract() throws {
        let envelope = NativeConnectorEnvelopeFactory.livePID(
            context: NativeConnectorSessionContext(),
            sequence: 4,
            scopeID: "7E8",
            value: OBD2TextMonitorValue(id: "obd_standard", pid: "1C", value: "eobd", unit: "")
        )
        let json = String(data: try JSONEncoder().encode(envelope), encoding: .utf8)!
        XCTAssertTrue(json.contains("\"value\":\"eobd\""))
        XCTAssertTrue(json.contains("\"vehicle_command_enabled\":false"))
        XCTAssertTrue(json.contains("\"would_transmit\":false"))
    }

    func testEmptyDTCEnvelopeExplicitlyMarksTheReadoutAsReported() throws {
        let envelope = NativeConnectorEnvelopeFactory.dtcs(
            context: NativeConnectorSessionContext(),
            sequence: 1,
            intent: "read_stored_dtc",
            scopeID: "7E8",
            dtcs: []
        )

        let json = String(data: try JSONEncoder().encode(envelope), encoding: .utf8)!
        XCTAssertTrue(json.contains("\"dtcs\":[]"))
        XCTAssertTrue(json.contains("\"dtc_readout_status\":\"reported\""))
        XCTAssertTrue(json.contains("\"readout_id\":\"stored_dtc_snapshot\""))
        XCTAssertTrue(json.contains("\"readout_scope_id\":\"7E8\""))
        XCTAssertTrue(json.contains("\"would_transmit\":false"))
    }

    func testDTCEnvelopeMapsEachAllowedIntentToItsReadoutID() {
        let context = NativeConnectorSessionContext()
        XCTAssertEqual(NativeConnectorEnvelopeFactory.dtcs(context: context, sequence: 1, intent: "read_stored_dtc", scopeID: nil, dtcs: []).readoutID, "stored_dtc_snapshot")
        XCTAssertEqual(NativeConnectorEnvelopeFactory.dtcs(context: context, sequence: 2, intent: "read_pending_dtc", scopeID: nil, dtcs: []).readoutID, "pending_dtc_snapshot")
        XCTAssertEqual(NativeConnectorEnvelopeFactory.dtcs(context: context, sequence: 3, intent: "read_permanent_dtc", scopeID: nil, dtcs: []).readoutID, "permanent_dtc_snapshot")
        XCTAssertNil(NativeConnectorEnvelopeFactory.dtcs(context: context, sequence: 4, intent: "unknown", scopeID: nil, dtcs: []).readoutID)
    }

    func testEmptySupportedPIDEnvelopeMarksItsReadoutAndScope() throws {
        let envelope = NativeConnectorEnvelopeFactory.supportedPIDs(
            context: NativeConnectorSessionContext(),
            sequence: 1,
            scopeID: "7E8",
            pageBase: "00",
            pids: []
        )

        let json = String(data: try JSONEncoder().encode(envelope), encoding: .utf8)!
        XCTAssertTrue(json.contains("\"supported_pids\":[]"))
        XCTAssertTrue(json.contains("\"supported_pid_readout_status\":\"reported\""))
        XCTAssertTrue(json.contains("\"readout_id\":\"supported_pid_matrix\""))
        XCTAssertTrue(json.contains("\"readout_scope_id\":\"7E8\""))
        XCTAssertTrue(json.contains("\"would_transmit\":false"))
    }

    func testFreezeFrameTriggerDTCUsesStructuredReadOnlyData() throws {
        let envelope = NativeConnectorEnvelopeFactory.freezeFrameTriggerDTC(
            context: NativeConnectorSessionContext(),
            sequence: 2,
            scopeID: "7E8",
            code: "P0300"
        )

        let json = String(data: try JSONEncoder().encode(envelope), encoding: .utf8)!
        XCTAssertTrue(json.contains("\"intent\":\"read_freeze_frame\""))
        XCTAssertTrue(json.contains("\"readout_id\":\"freeze_frame_snapshot\""))
        XCTAssertTrue(json.contains("\"trigger_dtc\":\"P0300\""))
        XCTAssertTrue(json.contains("\"code\":\"P0300\""))
        XCTAssertTrue(json.contains("\"frame_number\":0"))
        XCTAssertTrue(json.contains("\"trigger_frame_number\":0"))
        XCTAssertTrue(json.contains("\"source_ecu\":\"7E8\""))
        XCTAssertTrue(json.contains("\"values\":[]"))
        XCTAssertTrue(json.contains("\"readout_scope_id\":\"7E8\""))
        XCTAssertTrue(json.contains("\"vehicle_command_enabled\":false"))
        XCTAssertTrue(json.contains("\"would_transmit\":false"))
    }

    func testFreezeFrameTextValueUsesTheReadOnlyArchiveShape() throws {
        let envelope = NativeConnectorEnvelopeFactory.freezeFrameValue(
            context: NativeConnectorSessionContext(),
            sequence: 3,
            scopeID: "7E8",
            value: OBD2TextMonitorValue(id: "fuel_system_status", pid: "03", value: "closed_loop_using_oxygen_sensor", unit: "")
        )

        let json = String(data: try JSONEncoder().encode(envelope), encoding: .utf8)!
        XCTAssertTrue(json.contains("\"readout_id\":\"freeze_frame_snapshot\""))
        XCTAssertTrue(json.contains("\"id\":\"fuel_system_status\""))
        XCTAssertTrue(json.contains("\"value\":\"closed_loop_using_oxygen_sensor\""))
        XCTAssertTrue(json.contains("\"freeze_frame_number\":0"))
        XCTAssertTrue(json.contains("\"source_ecu\":\"7E8\""))
        XCTAssertTrue(json.contains("\"vehicle_command_enabled\":false"))
        XCTAssertTrue(json.contains("\"would_transmit\":false"))
    }

    func testReadinessEnvelopeCarriesThePid01ScopeAndStatusBytes() throws {
        let context = NativeConnectorSessionContext(
            scanID: UUID(uuidString: "11111111-1111-4111-8111-111111111111")!,
            connectionID: UUID(uuidString: "22222222-2222-4222-8222-222222222222")!,
            vehicleContextID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
        )
        let envelope = NativeConnectorEnvelopeFactory.readiness(
            context: context,
            sequence: 4,
            scopeID: "7E8",
            status: OBD2ReadinessStatus(
                milOn: true,
                dtcCount: 3,
                statusByteA: 131,
                statusByteB: 7,
                statusByteC: 34,
                statusByteD: 0,
                ignitionType: "spark"
            )
        )
        let json = String(data: try JSONEncoder().encode(envelope), encoding: .utf8)!
        XCTAssertTrue(json.contains("\"intent\":\"read_readiness\""))
        XCTAssertTrue(json.contains("\"readout_id\":\"readiness_snapshot\""))
        XCTAssertTrue(json.contains("\"readout_scope_id\":\"7E8\""))
        XCTAssertTrue(json.contains("\"vehicle_command_enabled\":false"))
        XCTAssertTrue(json.contains("\"readiness_status_byte_b\":7"))
        XCTAssertTrue(json.contains("\"id\":\"misfire\""))
        XCTAssertTrue(json.contains("\"id\":\"oxygen_sensor\""))
        XCTAssertTrue(json.contains("\"status\":\"complete\""))
    }

    func testOnboardMonitorEnvelopeUsesTheReadOnlyMode06Contract() throws {
        let context = NativeConnectorSessionContext(
            scanID: UUID(uuidString: "11111111-1111-4111-8111-111111111111")!,
            connectionID: UUID(uuidString: "22222222-2222-4222-8222-222222222222")!,
            vehicleContextID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
        )
        let envelope = NativeConnectorEnvelopeFactory.onboardMonitor(
            context: context,
            sequence: 5,
            scopeID: "7E8",
            tests: [OBD2OnboardMonitorTest(testID: "01", componentID: "02", value: 3, minimum: 1, maximum: 5)]
        )
        let json = String(data: try JSONEncoder().encode(envelope), encoding: .utf8)!
        XCTAssertTrue(json.contains("\"intent\":\"read_onboard_monitor\""))
        XCTAssertTrue(json.contains("\"readout_id\":\"onboard_monitor_snapshot\""))
        XCTAssertTrue(json.contains("\"source_ecu\":\"7E8\""))
        XCTAssertTrue(json.contains("\"would_transmit\":false"))
    }

    func testEmptyECUInfoUsesTheReadOnlyArchiveShape() throws {
        let envelope = NativeConnectorEnvelopeFactory.ecuInfoEmpty(
            context: NativeConnectorSessionContext(),
            sequence: 6,
            scopeID: nil
        )
        let json = String(data: try JSONEncoder().encode(envelope), encoding: .utf8)!
        XCTAssertTrue(json.contains("\"intent\":\"read_ecu_info\""))
        XCTAssertTrue(json.contains("\"readout_id\":\"ecu_info_snapshot\""))
        XCTAssertTrue(json.contains("\"items\":[]"))
        XCTAssertTrue(json.contains("\"ecu_info_readout_status\":\"reported\""))
        XCTAssertTrue(json.contains("\"would_transmit\":false"))
    }
}
