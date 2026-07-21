import XCTest
@testable import ELM327BLEConnector

final class ELMReadCommandTests: XCTestCase {
    func testInitialQueueIsExactlyTheFixedReadOnlySet() {
        XCTAssertEqual(
            ELMReadCommand.allCases.map(\.wireValue),
            ["ATI", "ATDP", "0100", "010C", "0105", "0142"]
        )
        XCTAssertFalse(ELMReadCommand.allCases.map(\.wireValue).contains("04"))
    }

    func testEveryVehicleReadoutUsesAnAllowedReadIntent() {
        XCTAssertEqual(ELMReadCommand.supportedPIDs.intent, "read_supported_pids")
        XCTAssertTrue([ELMReadCommand.engineRPM, .coolantTemperature, .controlModuleVoltage].allSatisfy {
            $0.intent == "read_live_pid_snapshot"
        })
    }
}
