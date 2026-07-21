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

    func testFreezeFrameTriggerDTCRequiresFrameZeroAndPreservesScope() throws {
        let result = try OBD2ReadoutDecoder.decodeFreezeFrameTriggerDTC(response: "7E8 05 42 02 00 01 71").get()
        XCTAssertEqual(result[0].scopeID, "7E8")
        XCTAssertEqual(result[0].code, "P0171")
    }

    func testFreezeFrameCapabilityOnlyEnablesAdvertisedTriggerDTC() {
        XCTAssertTrue(OBD2ReadoutDecoder.freezeFrameSupportsTriggerDTC(response: "7E8 06 42 00 40 00 00 00"))
        XCTAssertFalse(OBD2ReadoutDecoder.freezeFrameSupportsTriggerDTC(response: "7E8 06 42 00 00 00 00 00"))
        XCTAssertEqual(OBD2ReadoutDecoder.freezeFrameSupportedPIDs(response: "7E8 06 42 00 C0 00 00 00"), Set(["01", "02"]))
    }

    func testFreezeFrameValuesRequireMatchingPidAndFrame() throws {
        let coolant = try OBD2ReadoutDecoder.decodeFreezeFrameValue(command: .freezeFrameCoolantTemperature, response: "7E8 04 42 05 00 5A").get()
        XCTAssertEqual(coolant[0].scopeID, "7E8")
        XCTAssertEqual(coolant[0].value, OBD2MonitorValue(id: "coolant_temp", pid: "05", value: 50, unit: "C"))
        let rpm = try OBD2ReadoutDecoder.decodeFreezeFrameValue(command: .freezeFrameEngineRPM, response: "7E8 05 42 0C 00 1A F8").get()
        XCTAssertEqual(rpm[0].value.value, 1726)
        switch OBD2ReadoutDecoder.decodeFreezeFrameValue(command: .freezeFrameVehicleSpeed, response: "42 0C 00 00") {
        case .failure(let error): XCTAssertEqual(error, .malformedResponse)
        case .success: XCTFail("Expected mismatched PID rejection")
        }
    }

    func testMode09AcceptsOnlyAdvertisedEcuNamesAndNeverVin() throws {
        let support = try OBD2ReadoutDecoder.decodeMode09SupportedInfoTypes(response: "7E8 06 49 00 00 40 00 00\n7E9 06 49 00 00 00 00 00").get()
        XCTAssertEqual(support.map(\.supportsEcuName), [true, false])
        let names = try OBD2ReadoutDecoder.decodeMode09EcuNames(response: "7E8 10 0B 49 0A 00 45 4E 47\n7E8 21 49 4E 45 20 20", supportedScopeIDs: ["7E8"]).get()
        XCTAssertEqual(names.count, 1)
        XCTAssertEqual(names[0].scopeID, "7E8")
        XCTAssertEqual(names[0].name, "ENGINE")
        switch OBD2ReadoutDecoder.decodeMode09EcuNames(response: "7E8 03 49 02 00", supportedScopeIDs: ["7E8"]) {
        case .failure: break
        case .success: XCTFail("VIN response must not be accepted")
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
