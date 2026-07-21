import XCTest
@testable import ELM327BLEConnector

final class ELMReadCommandTests: XCTestCase {
    func testInitialQueueIsExactlyTheFixedReadOnlySet() {
        XCTAssertEqual(
            ELMReadCommand.allCases.map(\.wireValue),
            ["ATE0", "ATL0", "ATH1", "ATSP0", "ATI", "ATDP", "03", "07", "0A", "020000", "020200", "020500", "020C00", "020D00", "020F00", "024200", "0900", "0904", "0906", "090A", "0100", "0120", "0140", "0101", "0104", "0106", "0107", "010B", "010C", "010D", "010E", "0105", "010F", "0110", "0111", "0142"]
        )
        XCTAssertFalse(ELMReadCommand.allCases.map(\.wireValue).contains("04"))
        XCTAssertFalse(ELMReadCommand.allCases.map(\.wireValue).contains(where: { $0.hasPrefix("ATZ") }))
        XCTAssertFalse(ELMReadCommand.allCases.map(\.wireValue).contains("0902"))
        XCTAssertEqual(ELMReadCommand.mode09CalibrationID.intent, "read_ecu_info")
        XCTAssertEqual(ELMReadCommand.mode09CalibrationVerificationNumber.intent, "read_ecu_info")
    }

    func testEveryVehicleReadoutUsesAnAllowedReadIntent() {
        XCTAssertEqual(ELMReadCommand.supportedPIDs.intent, "read_supported_pids")
        XCTAssertEqual(ELMReadCommand.storedDTC.intent, "read_stored_dtc")
        XCTAssertEqual(ELMReadCommand.pendingDTC.intent, "read_pending_dtc")
        XCTAssertEqual(ELMReadCommand.permanentDTC.intent, "read_permanent_dtc")
        XCTAssertTrue([ELMReadCommand.calculatedLoad, .shortTermFuelTrimBank1, .longTermFuelTrimBank1, .manifoldAbsolutePressure, .engineRPM, .vehicleSpeed, .timingAdvance, .coolantTemperature, .intakeAirTemperature, .massAirFlow, .throttlePosition, .controlModuleVoltage].allSatisfy {
            $0.intent == "read_live_pid_snapshot"
        })
    }

    func testReadoutPlanMapsOnlyKnownReadoutIDs() {
        XCTAssertEqual(ELMReadCommand.storedDTC.readoutID, "stored_dtc_snapshot")
        XCTAssertEqual(ELMReadCommand.pendingDTC.readoutID, "pending_dtc_snapshot")
        XCTAssertEqual(ELMReadCommand.permanentDTC.readoutID, "permanent_dtc_snapshot")
        XCTAssertEqual(ELMReadCommand.freezeFrameCapabilities.readoutID, "freeze_frame_snapshot")
        XCTAssertEqual(ELMReadCommand.mode09SupportedInfoTypes.readoutID, "ecu_info_snapshot")
        XCTAssertEqual(ELMReadCommand.mode09CalibrationID.readoutID, "ecu_info_snapshot")
        XCTAssertEqual(ELMReadCommand.mode09CalibrationVerificationNumber.readoutID, "ecu_info_snapshot")
        XCTAssertEqual(ELMReadCommand.supportedPIDs.readoutID, "supported_pid_matrix")
        XCTAssertEqual(ELMReadCommand.readinessStatus.readoutID, "readiness_snapshot")
        XCTAssertEqual(ELMReadCommand.engineRPM.readoutID, "live_pid_snapshot")
        XCTAssertEqual(ELMReadCommand.massAirFlow.livePID, "10")
        XCTAssertEqual(ELMReadCommand.supportedPIDs20.supportedPIDPageBase, "20")
        XCTAssertEqual(ELMReadCommand.supportedPIDs20.nextSupportedPIDPage, .supportedPIDs40)
        XCTAssertNil(ELMReadCommand.disableEcho.readoutID)
    }
}
