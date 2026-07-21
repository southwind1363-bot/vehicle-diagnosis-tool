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
        XCTAssertFalse(json.contains("vehicle_command_enabled\":true"))
    }
}
