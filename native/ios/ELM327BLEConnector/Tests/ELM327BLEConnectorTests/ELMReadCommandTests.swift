import XCTest
@testable import ELM327BLEConnector

final class ELMReadCommandTests: XCTestCase {
    func testInitialReadoutPlanIsAnExplicitReadOnlyAllowlist() {
        XCTAssertEqual(
            ELMReadCommand.initialReadoutCommands,
            [
                .disableEcho, .disableLinefeeds, .enableHeaders, .autoProtocol,
                .identifyAdapter, .describeProtocol, .describeProtocolNumber,
                .storedDTC, .pendingDTC, .permanentDTC,
                .onboardMonitor, .freezeFrameCapabilities, .mode09SupportedInfoTypes,
                .supportedPIDs, .readinessStatus
            ]
        )
        XCTAssertFalse(ELMReadCommand.initialReadoutCommands.contains(.freezeFrameTriggerDTC))
        XCTAssertFalse(ELMReadCommand.initialReadoutCommands.contains(.mode09CalibrationID))
        XCTAssertFalse(ELMReadCommand.initialReadoutCommands.contains(.engineRPM))
        XCTAssertFalse(ELMReadCommand.initialReadoutCommands.contains(.shortTermFuelTrimBank2))
        XCTAssertFalse(ELMReadCommand.initialReadoutCommands.contains(.longTermFuelTrimBank2))
    }

    func testInitialLivePIDPlanIsBoundedToTheCoreReadoutSet() {
        XCTAssertEqual(
            ELMReadCommand.initialLivePIDCommands.map(\.wireValue),
            ["010C", "0105", "010F", "010D", "010E", "0104", "0103", "010B", "0123", "0159", "0110", "0111", "0106", "0107", "0108", "0109", "0121", "012F", "0130", "0131", "0133", "0142", "011C", "011F", "0146", "014D", "0151", "015B", "015C"]
        )
        XCTAssertEqual(ELMReadCommand.initialLivePIDCommands.count, 29)
        XCTAssertTrue(ELMReadCommand.initialLivePIDCommands.allSatisfy { $0.intent == "read_live_pid_snapshot" && $0.readoutID == "live_pid_snapshot" })
        XCTAssertTrue(ELMReadCommand.initialLivePIDCommands.contains(.hybridBatteryRemaining))
        XCTAssertTrue(ELMReadCommand.initialLivePIDCommands.contains(.engineOilTemperature))
        XCTAssertFalse(ELMReadCommand.initialLivePIDCommands.contains(.odometer))
        XCTAssertFalse(ELMReadCommand.initialLivePIDCommands.contains(.commandedDieselExhaustFluid))
    }

    func testQuickReadoutPlanKeepsOnlyTheFastReadOnlyCore() {
        XCTAssertEqual(
            ELMReadCommand.quickReadoutCommands,
            [
                .disableEcho, .disableLinefeeds, .enableHeaders, .autoProtocol,
                .identifyAdapter, .describeProtocol, .describeProtocolNumber,
                .storedDTC, .pendingDTC, .permanentDTC,
                .supportedPIDs, .readinessStatus
            ]
        )
        XCTAssertEqual(
            ELMReadCommand.quickLivePIDCommands.map(\.wireValue),
            ["010C", "0105", "010D", "0142"]
        )
        XCTAssertTrue(ELMReadCommand.quickLivePIDCommands.allSatisfy { $0.intent == "read_live_pid_snapshot" && $0.readoutID == "live_pid_snapshot" })
        XCTAssertFalse(ELMReadCommand.quickReadoutCommands.contains(.onboardMonitor))
        XCTAssertFalse(ELMReadCommand.quickReadoutCommands.contains(.freezeFrameCapabilities))
        XCTAssertFalse(ELMReadCommand.quickReadoutCommands.contains(.mode09SupportedInfoTypes))
    }

    func testAdapterSetupRequiresAnExplicitSuccessfulResponse() {
        XCTAssertTrue(isCompletedELMAdapterSetupResponse(command: .disableEcho, response: "ATE0\rOK"))
        XCTAssertTrue(isCompletedELMAdapterSetupResponse(command: .autoProtocol, response: "OK"))
        XCTAssertFalse(isCompletedELMAdapterSetupResponse(command: .enableHeaders, response: "ATH1"))
        XCTAssertFalse(isCompletedELMAdapterSetupResponse(command: .disableLinefeeds, response: "?"))
        XCTAssertFalse(isCompletedELMAdapterSetupResponse(command: .autoProtocol, response: "ERROR"))
        XCTAssertFalse(isCompletedELMAdapterSetupResponse(command: .autoProtocol, response: "ERROR 1\rOK"))
        XCTAssertFalse(isCompletedELMAdapterSetupResponse(command: .autoProtocol, response: "BUS INIT: ERROR\rOK"))
        XCTAssertFalse(isCompletedELMAdapterSetupResponse(command: .autoProtocol, response: "NO DATA"))
        XCTAssertFalse(isCompletedELMAdapterSetupResponse(command: .storedDTC, response: "OK"))
    }

    func testWriteWithoutResponseWaitsForBleCapacity() {
        XCTAssertTrue(requiresELMWriteCapacityWait(writeWithoutResponse: true, canSendWithoutResponse: false))
        XCTAssertFalse(requiresELMWriteCapacityWait(writeWithoutResponse: true, canSendWithoutResponse: true))
        XCTAssertFalse(requiresELMWriteCapacityWait(writeWithoutResponse: false, canSendWithoutResponse: false))
    }

    func testResponseNotificationsRequireTheActiveBleRead() {
        XCTAssertTrue(acceptsELMResponseNotification(peripheralMatches: true, awaitingPrompt: true, hasActiveCommand: true))
        XCTAssertFalse(acceptsELMResponseNotification(peripheralMatches: false, awaitingPrompt: true, hasActiveCommand: true))
        XCTAssertFalse(acceptsELMResponseNotification(peripheralMatches: true, awaitingPrompt: false, hasActiveCommand: true))
        XCTAssertFalse(acceptsELMResponseNotification(peripheralMatches: true, awaitingPrompt: true, hasActiveCommand: false))
    }

    func testNotificationStateUpdatesRequireTheCurrentSubscription() {
        XCTAssertTrue(acceptsELMNotificationStateUpdate(peripheralMatches: true, subscribing: true))
        XCTAssertFalse(acceptsELMNotificationStateUpdate(peripheralMatches: false, subscribing: true))
        XCTAssertFalse(acceptsELMNotificationStateUpdate(peripheralMatches: true, subscribing: false))
    }

    func testCharacteristicDiscoveryRequiresWritableAndNotifiableCandidates() {
        let writable = BLECharacteristicCandidate(serviceUUID: "FFF0", characteristicUUID: "FFF1", supportsNotify: false, supportsWrite: true, supportsWriteWithoutResponse: false)
        let writableWithoutResponse = BLECharacteristicCandidate(serviceUUID: "FFF0", characteristicUUID: "FFF2", supportsNotify: false, supportsWrite: false, supportsWriteWithoutResponse: true)
        let notifiable = BLECharacteristicCandidate(serviceUUID: "FFF0", characteristicUUID: "FFF3", supportsNotify: true, supportsWrite: false, supportsWriteWithoutResponse: false)

        XCTAssertTrue(hasELMCharacteristicConfigurationCandidates([writable, notifiable]))
        XCTAssertTrue(hasELMCharacteristicConfigurationCandidates([writableWithoutResponse, notifiable]))
        XCTAssertFalse(hasELMCharacteristicConfigurationCandidates([]))
        XCTAssertFalse(hasELMCharacteristicConfigurationCandidates([writable]))
        XCTAssertFalse(hasELMCharacteristicConfigurationCandidates([notifiable]))
    }

    func testCompletedBleScanStillAllowsSelectingADiscoveredPeripheral() {
        XCTAssertTrue(allowsELMPeripheralSelection(state: .scanning))
        XCTAssertTrue(allowsELMPeripheralSelection(state: .scanComplete))
        XCTAssertFalse(allowsELMPeripheralSelection(state: .idle))
        XCTAssertFalse(allowsELMPeripheralSelection(state: .discovering))
        XCTAssertTrue(allowsELMScanStart(state: .idle))
        XCTAssertTrue(allowsELMScanStart(state: .scanComplete))
        XCTAssertTrue(allowsELMScanStart(state: .interrupted))
        XCTAssertFalse(allowsELMScanStart(state: .scanning))
    }

    func testConnectionLifecycleTimeoutOnlyInterruptsItsExpectedStage() {
        XCTAssertTrue(shouldInterruptELMConnectionLifecycle(state: .connecting, expectedState: .connecting))
        XCTAssertTrue(shouldInterruptELMConnectionLifecycle(state: .discovering, expectedState: .discovering))
        XCTAssertTrue(shouldInterruptELMConnectionLifecycle(state: .subscribing, expectedState: .subscribing))
        XCTAssertFalse(shouldInterruptELMConnectionLifecycle(state: .ready, expectedState: .subscribing))
        XCTAssertFalse(shouldInterruptELMConnectionLifecycle(state: .awaitingPrompt, expectedState: .connecting))
    }

    func testSupportedPIDFollowUpsKeepReadinessAheadOfLiveValues() {
        XCTAssertEqual(
            enqueueSupportedPIDFollowUps(
                pendingCommands: [.readinessStatus],
                liveCommands: [.engineRPM, .coolantTemperature],
                nextSupportedPIDPage: .supportedPIDs20
            ),
            [.supportedPIDs20, .readinessStatus, .engineRPM, .coolantTemperature]
        )
        XCTAssertEqual(
            enqueueSupportedPIDFollowUps(
                pendingCommands: [.readinessStatus],
                liveCommands: [.engineRPM],
                nextSupportedPIDPage: nil
            ),
            [.readinessStatus, .engineRPM]
        )
    }

    func testFreezeFrameValuesRequireAReportedTriggerDTC() {
        let supportedPIDs: Set<String> = ["02", "03", "05", "0C", "23", "59"]
        XCTAssertEqual(
            freezeFrameValueFollowUpCommands(triggerDtcReported: true, supportedPIDs: supportedPIDs),
            [.freezeFrameFuelSystemStatus, .freezeFrameFuelRailPressure, .freezeFrameFuelRailPressureAbsolute, .freezeFrameCoolantTemperature, .freezeFrameEngineRPM]
        )
        XCTAssertEqual(
            freezeFrameValueFollowUpCommands(triggerDtcReported: false, supportedPIDs: supportedPIDs),
            []
        )
        let scopedSupport = [
            "7E8": Set(["02", "03", "05"]),
            "7E9": Set(["02", "0C"])
        ]
        XCTAssertEqual(
            freezeFrameSupportedPIDsForTriggerScopes(triggerScopeIDs: ["7E8"], supportedPIDsByScope: scopedSupport),
            Set(["02", "03", "05"])
        )
        XCTAssertEqual(
            freezeFrameSupportedPIDsForTriggerScopes(triggerScopeIDs: ["7E9"], supportedPIDsByScope: scopedSupport),
            Set(["02", "0C"])
        )
        XCTAssertTrue(isReportedFreezeFrameTriggerScope("7E8", triggerScopeIDs: ["7E8"]))
        XCTAssertFalse(isReportedFreezeFrameTriggerScope("7E9", triggerScopeIDs: ["7E8"]))
        XCTAssertTrue(isReportedFreezeFrameTriggerScope(nil, triggerScopeIDs: ["LEGACY"]))
    }

    func testInitialQueueIsExactlyTheFixedReadOnlySet() {
        XCTAssertEqual(
            ELMReadCommand.allCases.map(\.wireValue).filter { !["0103", "0108", "0109", "0112", "0113", "011C", "011D", "011E", "0151", "016A", "016C", "0184", "018C", "018E", "01A5", "0908", "090B"].contains($0) },
            ["ATE0", "ATL0", "ATH1", "ATSP0", "ATI", "ATDP", "ATDPN", "03", "07", "0A", "06", "0200", "0202", "0203", "0204", "0206", "0207", "020A", "020B", "0223", "0259", "0205", "020C", "020D", "020E", "020F", "0210", "0211", "021F", "0242", "0900", "0904", "0906", "090A", "0100", "0120", "0140", "0160", "0180", "01A0", "01C0", "01E0", "0101", "0104", "0106", "0107", "010A", "010B", "010C", "010D", "010E", "0105", "010F", "0110", "0111", "0114", "0115", "0116", "0117", "0118", "0119", "011A", "011B", "0124", "0125", "0126", "0127", "0128", "0129", "012A", "012B", "011F", "0121", "0122", "0123", "012C", "012D", "012E", "012F", "0130", "0131", "0132", "0133", "0134", "0135", "0138", "0139", "013C", "013D", "013E", "013F", "014C", "0142", "0143", "0144", "0145", "0146", "0147", "0148", "0149", "014A", "014B", "014D", "014E", "0152", "0159", "015A", "015B", "015C", "015D", "015E", "0161", "0162", "0163", "0164", "0169", "01A6"]
        )
        XCTAssertFalse(ELMReadCommand.allCases.map(\.wireValue).contains("04"))
        XCTAssertFalse(ELMReadCommand.allCases.map(\.wireValue).contains(where: { $0.hasPrefix("ATZ") }))
        XCTAssertFalse(ELMReadCommand.allCases.map(\.wireValue).contains("0902"))
        XCTAssertTrue(["0908", "090B"].allSatisfy(ELMReadCommand.allCases.map(\.wireValue).contains))
        XCTAssertTrue(ELMReadCommand.allCases.map(\.wireValue).contains("0108"))
        XCTAssertTrue(ELMReadCommand.allCases.map(\.wireValue).contains("0109"))
        XCTAssertTrue(["0103", "0112", "0113", "011C", "011D", "011E", "0151"].allSatisfy(ELMReadCommand.allCases.map(\.wireValue).contains))
        XCTAssertTrue(["016A", "016C", "0184", "018C", "018E", "01A5"].allSatisfy(ELMReadCommand.allCases.map(\.wireValue).contains))
        XCTAssertEqual(ELMReadCommand.mode09CalibrationID.intent, "read_ecu_info")
        XCTAssertEqual(ELMReadCommand.mode09CalibrationVerificationNumber.intent, "read_ecu_info")
        XCTAssertEqual(ELMReadCommand.mode09SparkPerformanceTracking.intent, "read_ecu_info")
        XCTAssertEqual(ELMReadCommand.mode09CompressionPerformanceTracking.intent, "read_ecu_info")
        XCTAssertEqual(ELMReadCommand.onboardMonitor.intent, "read_onboard_monitor")
        XCTAssertEqual(ELMReadCommand.freezeFrameEngineRuntime.intent, "read_freeze_frame")
        XCTAssertEqual(ELMReadCommand.freezeFrameTimingAdvance.intent, "read_freeze_frame")
        XCTAssertEqual(ELMReadCommand.freezeFrameMassAirFlow.intent, "read_freeze_frame")
        XCTAssertEqual(ELMReadCommand.freezeFrameFuelSystemStatus.intent, "read_freeze_frame")
        XCTAssertEqual(ELMReadCommand.freezeFrameFuelRailPressure.intent, "read_freeze_frame")
        XCTAssertEqual(ELMReadCommand.freezeFrameFuelRailPressureAbsolute.intent, "read_freeze_frame")
    }

    func testEveryVehicleReadoutUsesAnAllowedReadIntent() {
        XCTAssertEqual(ELMReadCommand.supportedPIDs.intent, "read_supported_pids")
        XCTAssertEqual(ELMReadCommand.storedDTC.intent, "read_stored_dtc")
        XCTAssertEqual(ELMReadCommand.pendingDTC.intent, "read_pending_dtc")
        XCTAssertEqual(ELMReadCommand.permanentDTC.intent, "read_permanent_dtc")
        XCTAssertTrue([ELMReadCommand.fuelSystemStatus, .calculatedLoad, .shortTermFuelTrimBank1, .longTermFuelTrimBank1, .shortTermFuelTrimBank2, .longTermFuelTrimBank2, .fuelPressure, .manifoldAbsolutePressure, .engineRPM, .vehicleSpeed, .timingAdvance, .coolantTemperature, .intakeAirTemperature, .massAirFlow, .throttlePosition, .secondaryAirStatus, .oxygenSensorLocationsTwoBanks, .obdStandard, .oxygenSensorLocations, .auxiliaryInputStatus, .oxygenSensorB1S1, .oxygenSensorB1S2, .oxygenSensorB1S3, .oxygenSensorB1S4, .oxygenSensorB2S1, .oxygenSensorB2S2, .oxygenSensorB2S3, .oxygenSensorB2S4, .engineRuntime, .distanceWithMIL, .fuelLevel, .warmupsSinceClear, .distanceSinceClear, .barometricPressure, .catalystTemperatureB1S1, .catalystTemperatureB1S2, .catalystTemperatureB2S1, .catalystTemperatureB2S2, .commandedThrottleActuator, .controlModuleVoltage, .ambientAirTemperature, .absoluteThrottlePositionB, .absoluteThrottlePositionC, .acceleratorPositionD, .acceleratorPositionE, .acceleratorPositionF, .timeWithMIL, .timeSinceClear, .fuelType, .ethanolPercentage, .hybridBatteryRemaining, .engineOilTemperature, .fuelInjectionTiming, .engineFuelRate, .driverDemandTorque, .actualEngineTorque, .engineReferenceTorque, .commandedDieselIntakeAirFlow, .commandedThrottleControl, .manifoldSurfaceTemperature, .commandedThrottleActuatorControl, .engineFrictionTorque, .commandedDieselExhaustFluid].allSatisfy {
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
        XCTAssertEqual(ELMReadCommand.mode09SparkPerformanceTracking.readoutID, "ecu_info_snapshot")
        XCTAssertEqual(ELMReadCommand.mode09CompressionPerformanceTracking.readoutID, "ecu_info_snapshot")
        XCTAssertEqual(ELMReadCommand.onboardMonitor.readoutID, "onboard_monitor_snapshot")
        XCTAssertEqual(ELMReadCommand.supportedPIDs.readoutID, "supported_pid_matrix")
        XCTAssertEqual(ELMReadCommand.readinessStatus.readoutID, "readiness_snapshot")
        XCTAssertEqual(ELMReadCommand.engineRPM.readoutID, "live_pid_snapshot")
        XCTAssertEqual(ELMReadCommand.freezeFrameTimingAdvance.freezeFramePID, "0E")
        XCTAssertEqual(ELMReadCommand.freezeFrameMassAirFlow.freezeFramePID, "10")
        XCTAssertEqual(ELMReadCommand.freezeFrameFuelSystemStatus.freezeFramePID, "03")
        XCTAssertEqual(ELMReadCommand.freezeFrameFuelRailPressure.freezeFramePID, "23")
        XCTAssertEqual(ELMReadCommand.freezeFrameFuelRailPressureAbsolute.freezeFramePID, "59")
        XCTAssertEqual(ELMReadCommand.massAirFlow.livePID, "10")
        XCTAssertEqual(ELMReadCommand.shortTermFuelTrimBank2.livePID, "08")
        XCTAssertEqual(ELMReadCommand.longTermFuelTrimBank2.livePID, "09")
        XCTAssertEqual(ELMReadCommand.obdStandard.livePID, "1C")
        XCTAssertEqual(ELMReadCommand.secondaryAirStatus.livePID, "12")
        XCTAssertEqual(ELMReadCommand.fuelSystemStatus.livePID, "03")
        XCTAssertEqual(ELMReadCommand.oxygenSensorLocationsTwoBanks.livePID, "13")
        XCTAssertEqual(ELMReadCommand.oxygenSensorLocations.livePID, "1D")
        XCTAssertEqual(ELMReadCommand.auxiliaryInputStatus.livePID, "1E")
        XCTAssertEqual(ELMReadCommand.fuelType.livePID, "51")
        XCTAssertEqual(ELMReadCommand.commandedDieselIntakeAirFlow.livePID, "6A")
        XCTAssertEqual(ELMReadCommand.commandedThrottleControl.livePID, "6C")
        XCTAssertEqual(ELMReadCommand.manifoldSurfaceTemperature.livePID, "84")
        XCTAssertEqual(ELMReadCommand.commandedThrottleActuatorControl.livePID, "8C")
        XCTAssertEqual(ELMReadCommand.engineFrictionTorque.livePID, "8E")
        XCTAssertEqual(ELMReadCommand.commandedDieselExhaustFluid.livePID, "A5")
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
        XCTAssertEqual(ELMReadCommand.evapVaporPressure.livePID, "32")
        XCTAssertEqual(ELMReadCommand.commandedEGRAndError.livePID, "69")
        XCTAssertEqual(ELMReadCommand.odometer.livePID, "A6")
        XCTAssertEqual(ELMReadCommand.engineReferenceTorque.livePID, "63")
        XCTAssertEqual(ELMReadCommand.supportedPIDs20.supportedPIDPageBase, "20")
        XCTAssertEqual(ELMReadCommand.supportedPIDs20.nextSupportedPIDPage, .supportedPIDs40)
        XCTAssertEqual(ELMReadCommand.supportedPIDs80.nextSupportedPIDPage, .supportedPIDsA0)
        XCTAssertEqual(ELMReadCommand.supportedPIDsA0.nextSupportedPIDPage, .supportedPIDsC0)
        XCTAssertEqual(ELMReadCommand.supportedPIDsC0.nextSupportedPIDPage, .supportedPIDsE0)
        XCTAssertNil(ELMReadCommand.supportedPIDsE0.nextSupportedPIDPage)
        XCTAssertNil(ELMReadCommand.disableEcho.readoutID)
    }
}
