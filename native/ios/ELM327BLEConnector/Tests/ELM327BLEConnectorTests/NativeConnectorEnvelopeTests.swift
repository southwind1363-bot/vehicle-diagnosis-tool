import XCTest
@testable import ELM327BLEConnector

final class NativeConnectorEnvelopeTests: XCTestCase {
    func testLivePidEnvelopeUsesTheExistingReadOnlyContract() throws {
        let context = NativeConnectorSessionContext(
            scanID: UUID(uuidString: "11111111-1111-4111-8111-111111111111")!,
            connectionID: UUID(uuidString: "22222222-2222-4222-8222-222222222222")!,
            vehicleContextID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
        )
        let envelope = NativeConnectorEnvelopeFactory.livePID(
            context: context,
            sequence: 3,
            value: OBD2MonitorValue(id: "engine_speed", pid: "0C", value: 1726, unit: "rpm")
        )
        let json = String(data: try JSONEncoder().encode(envelope), encoding: .utf8)!
        XCTAssertTrue(json.contains("\"schema_version\":\"native_connector_contract_v1\""))
        XCTAssertTrue(json.contains("\"would_transmit\":false"))
        XCTAssertTrue(json.contains("\"readout_id\":\"live_pid_snapshot\""))
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
    }
}
