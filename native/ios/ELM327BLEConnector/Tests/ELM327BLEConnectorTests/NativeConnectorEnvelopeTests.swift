import XCTest
@testable import ELM327BLEConnector

final class NativeConnectorEnvelopeTests: XCTestCase {
    func testAdapterIdentityOmitsRawAdapterIdentifiers() throws {
        let envelope = NativeConnectorEnvelopeFactory.adapterIdentity(
            context: NativeConnectorSessionContext(),
            sequence: 1,
            adapterName: "STN1170 SN: 979867700221",
            protocolHint: "AUTO, ISO 15765-4 (CAN 11/500)"
        )

        let json = String(data: try JSONEncoder().encode(envelope), encoding: .utf8)!
        XCTAssertTrue(json.contains("\"adapter_family\":\"STN\""))
        XCTAssertTrue(json.contains("\"adapter_protocol_hint\":\"ISO 15765-4\""))
        XCTAssertFalse(json.contains("adapter_name"))
        XCTAssertFalse(json.contains("979867700221"))
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
        XCTAssertTrue(json.contains("\"would_transmit\":false"))
        XCTAssertTrue(json.contains("\"readout_id\":\"live_pid_snapshot\""))
        XCTAssertTrue(json.contains("\"readout_scope_id\":\"7E8\""))
        XCTAssertTrue(json.contains("\"readout_attempt\":0"))
        XCTAssertFalse(json.contains("vehicle_command_enabled\":true"))
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
}
