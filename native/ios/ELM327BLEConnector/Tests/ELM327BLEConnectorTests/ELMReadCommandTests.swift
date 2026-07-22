import XCTest
@testable import ELM327BLEConnector

final class ELMReadCommandTests: XCTestCase {
    func testInitialQueueIsExactlyTheFixedReadOnlySet() {
        XCTAssertEqual(
            ELMReadCommand.allCases.map(\.wireValue),
            ["ATE0", "ATL0", "ATH1", "ATSP0", "ATI", "ATDP", "03", "07", "0A", "06", "020000", "020200", "020400", "020600", "020700", "020A00", "020B00", "020500", "020C00", "020D00", "020F00", "021100", "021F00", "024200", "0900", "0904", "0906", "090A", "0100", "0120", "0140", "0160", "0180", "01A0", "0101", "0104", "0106", "0107", "010A", "010B", "010C", "010D", "010E", "0105", "010F", "0110", "0111", "0114", "0115", "0116", "0117", "0118", "0119", "011A", "011B", "0124", "0125", "0126", "0127", "0128", "0129", "012A", "012B", "011F", "0121", "0122", "0123", "012C", "012D", "012E", "012F", "0130", "0131", "0133", "0134", "0135", "0138", "0139", "013C", "013D", "013E", "013F", "014C", "0142", "0143", "0144", "0145", "0146", "0147", "0148", "0149", "014A", "014B", "014D", "014E", "0152", "0159", "015A", "015B", "015C", "015D", "015E", "0161", "0162", "0163", "0164"]
        )
        XCTAssertFalse(ELMReadCommand.allCases.map(\.wireValue).contains("04"))
        XCTAssertFalse(ELMReadCommand.allCases.map(\.wireValue).contains(where: { $0.hasPrefix("ATZ") }))
        XCTAssertFalse(ELMReadCommand.allCases.map(\.wireValue).contains("0902"))
        XCTAssertEqual(ELMReadCommand.mode09CalibrationID.intent, "read_ecu_info")
        XCTAssertEqual(ELMReadCommand.mode09CalibrationVerificationNumber.intent, "read_ecu_info")
        XCTAssertEqual(ELMReadCommand.onboardMonitor.intent, "read_onboard_monitor")
        XCTAssertEqual(ELMReadCommand.freezeFrameEngineRuntime.intent, "read_freeze_frame")
    }

    func testEveryVehicleReadoutUsesAnAllowedReadIntent() {
        XCTAssertEqual(ELMReadCommand.supportedPIDs.intent, "read_supported_pids")
        XCTAssertEqual(ELMReadCommand.storedDTC.intent, "read_stored_dtc")
        XCTAssertEqual(ELMReadCommand.pendingDTC.intent, "read_pending_dtc")
        XCTAssertEqual(ELMReadCommand.permanentDTC.intent, "read_permanent_dtc")
        XCTAssertTrue([ELMReadCommand.calculatedLoad, .shortTermFuelTrimBank1, .longTermFuelTrimBank1, .fuelPressure, .manifoldAbsolutePressure, .engineRPM, .vehicleSpeed, .timingAdvance, .coolantTemperature, .intakeAirTemperature, .massAirFlow, .throttlePosition, .oxygenSensorB1S1, .oxygenSensorB1S2, .oxygenSensorB1S3, .oxygenSensorB1S4, .oxygenSensorB2S1, .oxygenSensorB2S2, .oxygenSensorB2S3, .oxygenSensorB2S4, .engineRuntime, .distanceWithMIL, .fuelLevel, .warmupsSinceClear, .distanceSinceClear, .barometricPressure, .catalystTemperatureB1S1, .catalystTemperatureB1S2, .catalystTemperatureB2S1, .catalystTemperatureB2S2, .commandedThrottleActuator, .controlModuleVoltage, .ambientAirTemperature, .absoluteThrottlePositionB, .absoluteThrottlePositionC, .acceleratorPositionD, .acceleratorPositionE, .acceleratorPositionF, .timeWithMIL, .timeSinceClear, .ethanolPercentage, .hybridBatteryRemaining, .engineOilTemperature, .fuelInjectionTiming, .engineFuelRate, .driverDemandTorque, .actualEngineTorque, .engineReferenceTorque].allSatisfy {
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
        XCTAssertEqual(ELMReadCommand.onboardMonitor.readoutID, "onboard_monitor_snapshot")
        XCTAssertEqual(ELMReadCommand.supportedPIDs.readoutID, "supported_pid_matrix")
        XCTAssertEqual(ELMReadCommand.readinessStatus.readoutID, "readiness_snapshot")
        XCTAssertEqual(ELMReadCommand.engineRPM.readoutID, "live_pid_snapshot")
        XCTAssertEqual(ELMReadCommand.massAirFlow.livePID, "10")
        XCTAssertEqual(ELMReadCommand.engineFuelRate.livePID, "5E")
        XCTAssertEqual(ELMReadCommand.distanceSinceClear.livePID, "31")
        XCTAssertEqual(ELMReadCommand.commandedEquivalenceRatio.livePID, "44")
        XCTAssertEqual(ELMReadCommand.catalystTemperatureB1S1.livePID, "3C")
        XCTAssertEqual(ELMReadCommand.oxygenSensorB1S1.livePID, "14")
        XCTAssertEqual(ELMReadCommand.wideOxygenVoltageB1S1.livePID, "24")
        XCTAssertEqual(ELMReadCommand.wideOxygenCurrentB1S1.livePID, "34")
        XCTAssertEqual(ELMReadCommand.absoluteThrottlePositionB.livePID, "47")
        XCTAssertEqual(ELMReadCommand.fuelRailPressureAbsolute.livePID, "59")
        XCTAssertEqual(ELMReadCommand.relativeAcceleratorPosition.livePID, "5A")
        XCTAssertEqual(ELMReadCommand.enginePercentTorqueData.livePID, "64")
        XCTAssertEqual(ELMReadCommand.engineReferenceTorque.livePID, "63")
        XCTAssertEqual(ELMReadCommand.supportedPIDs20.supportedPIDPageBase, "20")
        XCTAssertEqual(ELMReadCommand.supportedPIDs20.nextSupportedPIDPage, .supportedPIDs40)
        XCTAssertEqual(ELMReadCommand.supportedPIDs80.nextSupportedPIDPage, .supportedPIDsA0)
        XCTAssertNil(ELMReadCommand.supportedPIDsA0.nextSupportedPIDPage)
        XCTAssertNil(ELMReadCommand.disableEcho.readoutID)
    }
}
