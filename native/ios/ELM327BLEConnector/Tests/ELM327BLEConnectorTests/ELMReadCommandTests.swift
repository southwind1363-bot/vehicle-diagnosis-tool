import XCTest
@testable import ELM327BLEConnector

final class ELMReadCommandTests: XCTestCase {
    func testInitialQueueIsExactlyTheFixedReadOnlySet() {
        XCTAssertEqual(
            ELMReadCommand.allCases.map(\.wireValue),
            ["ATE0", "ATL0", "ATH1", "ATSP0", "ATI", "ATDP", "03", "07", "0A", "020000", "020200", "020500", "020C00", "020D00", "020F00", "024200", "0900", "090A", "0100", "0101", "010C", "0105", "0142"]
        )
        XCTAssertFalse(ELMReadCommand.allCases.map(\.wireValue).contains("04"))
        XCTAssertFalse(ELMReadCommand.allCases.map(\.wireValue).contains(where: { $0.hasPrefix("ATZ") }))
        XCTAssertFalse(ELMReadCommand.allCases.map(\.wireValue).contains("0902"))
    }

    func testEveryVehicleReadoutUsesAnAllowedReadIntent() {
        XCTAssertEqual(ELMReadCommand.supportedPIDs.intent, "read_supported_pids")
        XCTAssertEqual(ELMReadCommand.storedDTC.intent, "read_stored_dtc")
        XCTAssertEqual(ELMReadCommand.pendingDTC.intent, "read_pending_dtc")
        XCTAssertEqual(ELMReadCommand.permanentDTC.intent, "read_permanent_dtc")
        XCTAssertTrue([ELMReadCommand.engineRPM, .coolantTemperature, .controlModuleVoltage].allSatisfy {
            $0.intent == "read_live_pid_snapshot"
        })
    }
}
