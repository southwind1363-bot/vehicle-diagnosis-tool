import XCTest
@testable import ELM327BLEConnector

final class OBD2ReadoutDecoderTests: XCTestCase {
    func testStoredDTCsDecodeWithoutAHeader() throws {
        let result = try OBD2ReadoutDecoder.decodeDTCs(command: .storedDTC, response: "43 01 71 03 00 00 00").get()
        XCTAssertEqual(result.count, 1)
        XCTAssertNil(result[0].scopeID)
        XCTAssertEqual(result[0].dtcs, [
            OBD2DTC(code: "P0171", status: "stored"),
            OBD2DTC(code: "P0300", status: "stored")
        ])
    }

    func testDTCSystemsAndHeaderScopesArePreserved() throws {
        let result = try OBD2ReadoutDecoder.decodeDTCs(
            command: .pendingDTC,
            response: "7E8 07 47 40 01 80 01 C0 01\n7E9 05 47 03 00 00 00"
        ).get()
        XCTAssertEqual(result.map(\.scopeID), ["7E8", "7E9"])
        XCTAssertEqual(result[0].dtcs.map(\.code), ["C0001", "B0001", "U0001"])
        XCTAssertEqual(result[1].dtcs, [OBD2DTC(code: "P0300", status: "pending")])
    }

    func testZeroDTCIsSuccessfulEmptyReadout() throws {
        let result = try OBD2ReadoutDecoder.decodeDTCs(command: .permanentDTC, response: "4A 00 00").get()
        XCTAssertEqual(result.count, 1)
        XCTAssertTrue(result[0].dtcs.isEmpty)
    }

    func testELMTransportPreambleDoesNotChangeTheReadout() throws {
        let result = try OBD2ReadoutDecoder.decodeDTCs(
            command: .storedDTC,
            response: "SEARCHING...\nBUS INIT: ...\nOK\n43 01 71 00 00"
        ).get()
        XCTAssertEqual(result[0].dtcs, [OBD2DTC(code: "P0171", status: "stored")])

        let inlineResult = try OBD2ReadoutDecoder.decodeDTCs(
            command: .storedDTC,
            response: "SEARCHING\nBUS INIT: OK\n43 01 71 00 00"
        ).get()
        XCTAssertEqual(inlineResult[0].dtcs, [OBD2DTC(code: "P0171", status: "stored")])

        assertDTCFailure("BUS INIT: ...\nERROR", expected: .malformedResponse)
    }

    func testOnboardMonitorTestsPreserveScopeAndRequireCompleteRows() throws {
        let results = try OBD2ReadoutDecoder.decodeOnboardMonitorTests(
            response: "7E8 10 12 46 01 02 00 03 00\n7E8 21 01 00 05 46 03 04 00\n7E8 22 06 00 01 00 05"
        ).get()
        XCTAssertEqual(results.count, 1)
        XCTAssertEqual(results[0].scopeID, "7E8")
        XCTAssertEqual(results[0].tests, [
            OBD2OnboardMonitorTest(testID: "01", componentID: "02", value: 3, minimum: 1, maximum: 5),
            OBD2OnboardMonitorTest(testID: "03", componentID: "04", value: 6, minimum: 1, maximum: 5)
        ])
        switch OBD2ReadoutDecoder.decodeOnboardMonitorTests(response: "46 01 02 00 03 00 01 00") {
        case .failure: break
        case .success: XCTFail("Incomplete Mode 06 rows must be rejected")
        }
        switch OBD2ReadoutDecoder.decodeOnboardMonitorTests(response: "47 01 02 00 03 00 01 00 05") {
        case .failure: break
        case .success: XCTFail("Non-Mode 06 responses must be rejected")
        }
    }

    func testInvalidOrIncompleteResponsesAreRejected() {
        assertDTCFailure("NO DATA", expected: .noData)
        assertDTCFailure("7F 03 11", expected: .negativeResponse)
        assertDTCFailure("43 01", expected: .malformedResponse)
        assertDTCFailure("43 00 00\n43 00 00", expected: .ambiguousResponse)
        assertDTCFailure("7E8 03 43 00 00\n7E8 03 43 00 00", expected: .malformedResponse)
        assertDTCFailure("7E8 10 07 43 01 71 03 00\n7E8 22 00 00", expected: .malformedResponse)
    }

    func testReadinessPreservesPid01StatusBytesAndScope() throws {
        let result = try OBD2ReadoutDecoder.decodeReadiness(response: "7E8 06 41 01 83 07 22 00").get()
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result[0].scopeID, "7E8")
        XCTAssertEqual(result[0].status.milOn, true)
        XCTAssertEqual(result[0].status.dtcCount, 3)
        XCTAssertEqual(result[0].status.statusByteB, 7)
        XCTAssertEqual(result[0].status.statusByteC, 34)
        XCTAssertEqual(result[0].status.statusByteD, 0)
        XCTAssertEqual(result[0].status.ignitionType, "spark")
        XCTAssertEqual(OBD2ReadoutDecoder.readinessMonitors(for: result[0].status).first(where: { $0.id == "misfire" }), OBD2ReadinessMonitor(id: "misfire", supported: true, complete: true))
        XCTAssertEqual(OBD2ReadoutDecoder.readinessMonitors(for: result[0].status).first(where: { $0.id == "oxygen_sensor" }), OBD2ReadinessMonitor(id: "oxygen_sensor", supported: true, complete: true))
    }

    func testReadinessMonitorsUseTheCompressionIgnitionLayout() {
        let status = OBD2ReadinessStatus(
            milOn: false,
            dtcCount: 0,
            statusByteA: 0,
            statusByteB: 0x0F,
            statusByteC: 0x21,
            statusByteD: 0x20,
            ignitionType: "compression"
        )
        let monitors = OBD2ReadoutDecoder.readinessMonitors(for: status)
        XCTAssertEqual(monitors.first(where: { $0.id == "nmhc_catalyst" }), OBD2ReadinessMonitor(id: "nmhc_catalyst", supported: true, complete: true))
        XCTAssertEqual(monitors.first(where: { $0.id == "exhaust_gas_sensor" }), OBD2ReadinessMonitor(id: "exhaust_gas_sensor", supported: true, complete: false))
        XCTAssertFalse(monitors.contains(where: { $0.id == "oxygen_sensor" }))
    }

    func testLivePidAndSupportedPidResponsesPreserveEveryEcuScope() throws {
        let liveValues = try OBD2ReadoutDecoder.decodeLivePID(
            command: .engineRPM,
            response: "7E8 04 41 0C 1A F8\n7E9 04 41 0C 0F A0"
        ).get()
        XCTAssertEqual(liveValues.map(\.scopeID), ["7E8", "7E9"])
        XCTAssertEqual(liveValues.map { $0.value.value }, [1726, 1000])

        let supported = try OBD2ReadoutDecoder.decodeSupportedPIDs(
            response: "7E8 06 41 00 A0 00 00 00\n7E9 06 41 00 90 00 00 00"
        ).get()
        XCTAssertEqual(supported.map(\.scopeID), ["7E8", "7E9"])
        XCTAssertEqual(supported[0].pids, ["01", "03"])
        XCTAssertEqual(supported[1].pids, ["01", "04"])
    }

    func testStandardLivePidEquationsUseTheDiagnosticMonitorDefinitions() throws {
        let cases: [(ELMReadCommand, String, OBD2MonitorValue)] = [
            (.calculatedLoad, "41 04 80", OBD2MonitorValue(id: "calculated_load", pid: "04", value: 50.19607843137255, unit: "%")),
            (.shortTermFuelTrimBank1, "41 06 90", OBD2MonitorValue(id: "stft_b1", pid: "06", value: 12.5, unit: "%")),
            (.longTermFuelTrimBank1, "41 07 70", OBD2MonitorValue(id: "ltft_b1", pid: "07", value: -12.5, unit: "%")),
            (.manifoldAbsolutePressure, "41 0B 64", OBD2MonitorValue(id: "map", pid: "0B", value: 100, unit: "kPa")),
            (.vehicleSpeed, "41 0D 3C", OBD2MonitorValue(id: "vehicle_speed", pid: "0D", value: 60, unit: "km/h")),
            (.timingAdvance, "41 0E 80", OBD2MonitorValue(id: "timing_advance", pid: "0E", value: 0, unit: "deg")),
            (.intakeAirTemperature, "41 0F 50", OBD2MonitorValue(id: "intake_air_temp", pid: "0F", value: 40, unit: "C")),
            (.massAirFlow, "41 10 01 F4", OBD2MonitorValue(id: "maf", pid: "10", value: 5, unit: "g/s")),
            (.throttlePosition, "41 11 FF", OBD2MonitorValue(id: "throttle_position", pid: "11", value: 100, unit: "%"))
        ]
        for (command, response, expected) in cases {
            let result = try OBD2ReadoutDecoder.decodeLivePID(command: command, response: response).get()
            XCTAssertEqual(result.map(\.value), [expected])
        }
    }

    func testOxygenSensorPidProducesVoltageAndShortTermFuelTrimForEveryEcuScope() throws {
        let result = try OBD2ReadoutDecoder.decodeLivePID(
            command: .oxygenSensorB1S1,
            response: "7E8 04 41 14 80 90\n7E9 04 41 14 64 70"
        ).get()
        XCTAssertEqual(result.map(\.scopeID), ["7E8", "7E8", "7E9", "7E9"])
        XCTAssertEqual(result.map(\.value), [
            OBD2MonitorValue(id: "o2_b1s1_voltage", pid: "14", value: 0.64, unit: "V"),
            OBD2MonitorValue(id: "o2_b1s1_stft", pid: "14", value: 12.5, unit: "%"),
            OBD2MonitorValue(id: "o2_b1s1_voltage", pid: "14", value: 0.5, unit: "V"),
            OBD2MonitorValue(id: "o2_b1s1_stft", pid: "14", value: -12.5, unit: "%")
        ])
        switch OBD2ReadoutDecoder.decodeLivePID(command: .oxygenSensorB1S1, response: "41 14 80") {
        case .failure: break
        case .success: XCTFail("Oxygen sensor PID requires voltage and trim bytes")
        }
    }

    func testWideOxygenPidsProduceTwoValuesForEveryEcuScope() throws {
        let voltageResult = try OBD2ReadoutDecoder.decodeLivePID(
            command: .wideOxygenVoltageB1S1,
            response: "7E8 06 41 24 80 00 20 00\n7E9 06 41 24 40 00 10 00"
        ).get()
        XCTAssertEqual(voltageResult.map(\.scopeID), ["7E8", "7E8", "7E9", "7E9"])
        XCTAssertEqual(voltageResult.map(\.value), [
            OBD2MonitorValue(id: "wide_o2_b1s1_ratio", pid: "24", value: 1, unit: ""),
            OBD2MonitorValue(id: "wide_o2_b1s1_voltage_wide", pid: "24", value: 1, unit: "V"),
            OBD2MonitorValue(id: "wide_o2_b1s1_ratio", pid: "24", value: 0.5, unit: ""),
            OBD2MonitorValue(id: "wide_o2_b1s1_voltage_wide", pid: "24", value: 0.5, unit: "V")
        ])
        let currentResult = try OBD2ReadoutDecoder.decodeLivePID(
            command: .wideOxygenCurrentB1S1,
            response: "41 34 80 00 7F 00"
        ).get()
        XCTAssertEqual(currentResult.map(\.value), [
            OBD2MonitorValue(id: "wide_o2_b1s1_current_ratio", pid: "34", value: 1, unit: ""),
            OBD2MonitorValue(id: "wide_o2_b1s1_current", pid: "34", value: -1, unit: "mA")
        ])
        switch OBD2ReadoutDecoder.decodeLivePID(command: .wideOxygenVoltageB1S1, response: "41 24 80 00 20") {
        case .failure: break
        case .success: XCTFail("Wide oxygen sensor PID requires four data bytes")
        }
    }

    func testEnginePercentTorqueDataProducesFiveScopedValues() throws {
        let result = try OBD2ReadoutDecoder.decodeLivePID(
            command: .enginePercentTorqueData,
            response: "7E8 07 41 64 7D 82 87 8C 91"
        ).get()
        XCTAssertEqual(result.map(\.scopeID), ["7E8", "7E8", "7E8", "7E8", "7E8"])
        XCTAssertEqual(result.map(\.value), [
            OBD2MonitorValue(id: "engine_percent_torque_idle", pid: "64", value: 0, unit: "%"),
            OBD2MonitorValue(id: "engine_percent_torque_point1", pid: "64", value: 5, unit: "%"),
            OBD2MonitorValue(id: "engine_percent_torque_point2", pid: "64", value: 10, unit: "%"),
            OBD2MonitorValue(id: "engine_percent_torque_point3", pid: "64", value: 15, unit: "%"),
            OBD2MonitorValue(id: "engine_percent_torque_point4", pid: "64", value: 20, unit: "%")
        ])
        switch OBD2ReadoutDecoder.decodeLivePID(command: .enginePercentTorqueData, response: "41 64 7D 82 87 8C") {
        case .failure: break
        case .success: XCTFail("Engine percent torque PID requires five data bytes")
        }
    }

    func testEvapVaporPressurePreservesScopeAndRejectsIncompleteResponse() throws {
        let result = try OBD2ReadoutDecoder.decodeLivePID(command: .evapVaporPressure, response: "7E8 04 41 32 FF 38").get()
        XCTAssertEqual(result.map(\.scopeID), ["7E8"])
        XCTAssertEqual(result.map(\.value), [OBD2MonitorValue(id: "evap_vapor_pressure", pid: "32", value: -50, unit: "Pa")])
        switch OBD2ReadoutDecoder.decodeLivePID(command: .evapVaporPressure, response: "41 32 FF") {
        case .failure: break
        case .success: XCTFail("EVAP vapor pressure PID requires two data bytes")
        }
    }

    func testSupportedPidContinuationPagesKeepTheirActualBase() throws {
        let page20 = try OBD2ReadoutDecoder.decodeSupportedPIDs(
            command: .supportedPIDs20,
            response: "41 20 80 00 00 01"
        ).get()
        XCTAssertEqual(page20[0].pids, ["21", "40"])

        let page40 = try OBD2ReadoutDecoder.decodeSupportedPIDs(
            command: .supportedPIDs40,
            response: "41 40 40 00 00 00"
        ).get()
        XCTAssertEqual(page40[0].pids, ["42"])

        let pageA0 = try OBD2ReadoutDecoder.decodeSupportedPIDs(
            command: .supportedPIDsA0,
            response: "41 A0 60 00 00 00"
        ).get()
        XCTAssertEqual(pageA0[0].pids, ["A2", "A3"])
    }

    func testFreezeFrameTriggerDTCRequiresFrameZeroAndPreservesScope() throws {
        let result = try OBD2ReadoutDecoder.decodeFreezeFrameTriggerDTC(response: "7E8 05 42 02 00 01 71").get()
        XCTAssertEqual(result[0].scopeID, "7E8")
        XCTAssertEqual(result[0].code, "P0171")
    }

    func testFreezeFrameCapabilityOnlyEnablesAdvertisedTriggerDTC() {
        XCTAssertTrue(OBD2ReadoutDecoder.freezeFrameSupportsTriggerDTC(response: "7E8 06 42 00 40 00 00 00"))
        XCTAssertFalse(OBD2ReadoutDecoder.freezeFrameSupportsTriggerDTC(response: "7E8 06 42 00 00 00 00 00"))
        XCTAssertEqual(OBD2ReadoutDecoder.freezeFrameSupportedPIDs(response: "7E8 06 42 00 C0 00 00 00"), Set(["01", "02"]))
        XCTAssertEqual(OBD2ReadoutDecoder.freezeFrameSupportedPIDs(response: "7E8 06 42 00 56 60 80 02"), Set(["02", "04", "06", "07", "0A", "0B", "11", "1F"]))
    }

    func testFreezeFrameValuesRequireMatchingPidAndFrame() throws {
        let coolant = try OBD2ReadoutDecoder.decodeFreezeFrameValue(command: .freezeFrameCoolantTemperature, response: "7E8 04 42 05 00 5A").get()
        XCTAssertEqual(coolant[0].scopeID, "7E8")
        XCTAssertEqual(coolant[0].value, OBD2MonitorValue(id: "coolant_temp", pid: "05", value: 50, unit: "C"))
        let rpm = try OBD2ReadoutDecoder.decodeFreezeFrameValue(command: .freezeFrameEngineRPM, response: "7E8 05 42 0C 00 1A F8").get()
        XCTAssertEqual(rpm[0].value.value, 1726)
        let fuelTrim = try OBD2ReadoutDecoder.decodeFreezeFrameValue(command: .freezeFrameShortTermFuelTrimBank1, response: "7E8 04 42 06 00 90").get()
        XCTAssertEqual(fuelTrim[0].value, OBD2MonitorValue(id: "stft_b1", pid: "06", value: 12.5, unit: "%"))
        let runtime = try OBD2ReadoutDecoder.decodeFreezeFrameValue(command: .freezeFrameEngineRuntime, response: "7E8 05 42 1F 00 02 58").get()
        XCTAssertEqual(runtime[0].value, OBD2MonitorValue(id: "engine_runtime", pid: "1F", value: 600, unit: "s"))
        switch OBD2ReadoutDecoder.decodeFreezeFrameValue(command: .freezeFrameVehicleSpeed, response: "42 0C 00 00") {
        case .failure(let error): XCTAssertEqual(error, .malformedResponse)
        case .success: XCTFail("Expected mismatched PID rejection")
        }
    }

    func testMode09AcceptsOnlyAdvertisedEcuNamesAndNeverVin() throws {
        let support = try OBD2ReadoutDecoder.decodeMode09SupportedInfoTypes(response: "7E8 06 49 00 00 40 00 00\n7E9 06 49 00 00 00 00 00").get()
        XCTAssertEqual(support.map(\.supportsCalibrationID), [false, false])
        XCTAssertEqual(support.map(\.supportsCalibrationVerificationNumber), [false, false])
        XCTAssertEqual(support.map(\.supportsEcuName), [true, false])
        let names = try OBD2ReadoutDecoder.decodeMode09EcuNames(response: "7E8 10 0B 49 0A 00 45 4E 47\n7E8 21 49 4E 45 20 20", supportedScopeIDs: ["7E8"]).get()
        XCTAssertEqual(names.count, 1)
        XCTAssertEqual(names[0].scopeID, "7E8")
        XCTAssertEqual(names[0].name, "ENGINE")
        let calibrationIDs = try OBD2ReadoutDecoder.decodeMode09CalibrationIDs(response: "7E8 10 13 49 04 01 43 41 4C\n7E8 21 2D 49 44 2D 30 31 20\n7E8 22 20 20 20 20 20 20", supportedScopeIDs: ["7E8"]).get()
        XCTAssertEqual(calibrationIDs.count, 1)
        XCTAssertEqual(calibrationIDs[0].scopeID, "7E8")
        XCTAssertEqual(calibrationIDs[0].calibrationID, "CAL-ID-01")
        switch OBD2ReadoutDecoder.decodeMode09EcuNames(response: "7E8 03 49 02 00", supportedScopeIDs: ["7E8"]) {
        case .failure: break
        case .success: XCTFail("VIN response must not be accepted")
        }
        switch OBD2ReadoutDecoder.decodeMode09CalibrationIDs(response: "7E8 03 49 02 00", supportedScopeIDs: ["7E8"]) {
        case .failure: break
        case .success: XCTFail("Non-calibration Mode 09 response must not be accepted")
        }
    }

    func testMode09CalibrationVerificationNumbersRequireAdvertisedScopeAndExactLength() throws {
        let support = try OBD2ReadoutDecoder.decodeMode09SupportedInfoTypes(response: "7E8 06 49 00 04 00 00 00\n7E9 06 49 00 00 00 00 00").get()
        XCTAssertEqual(support.map(\.supportsCalibrationVerificationNumber), [true, false])
        let values = try OBD2ReadoutDecoder.decodeMode09CalibrationVerificationNumbers(
            response: "7E8 10 0B 49 06 02 DE AD BE\n7E8 21 EF 01 23 45 67",
            supportedScopeIDs: ["7E8"]
        ).get()
        XCTAssertEqual(values.map(\.scopeID), ["7E8", "7E8"])
        XCTAssertEqual(values.map(\.value), ["DEADBEEF", "01234567"])
        switch OBD2ReadoutDecoder.decodeMode09CalibrationVerificationNumbers(response: "7E8 07 49 06 02 DE AD BE EF", supportedScopeIDs: ["7E8"]) {
        case .failure: break
        case .success: XCTFail("CVN count and payload length must match")
        }
        switch OBD2ReadoutDecoder.decodeMode09CalibrationVerificationNumbers(response: "7E8 07 49 04 01 DE AD BE EF", supportedScopeIDs: ["7E8"]) {
        case .failure: break
        case .success: XCTFail("Non-CVN Mode 09 response must not be accepted")
        }
    }

    private func assertDTCFailure(_ response: String, expected: OBD2ReadoutDecodeFailure, file: StaticString = #filePath, line: UInt = #line) {
        switch OBD2ReadoutDecoder.decodeDTCs(command: .storedDTC, response: response) {
        case .failure(let actual):
            XCTAssertEqual(actual, expected, file: file, line: line)
        case .success:
            XCTFail("Expected decoder failure", file: file, line: line)
        }
    }
}
