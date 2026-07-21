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

    private func assertDTCFailure(_ response: String, expected: OBD2ReadoutDecodeFailure, file: StaticString = #filePath, line: UInt = #line) {
        switch OBD2ReadoutDecoder.decodeDTCs(command: .storedDTC, response: response) {
        case .failure(let actual):
            XCTAssertEqual(actual, expected, file: file, line: line)
        case .success:
            XCTFail("Expected decoder failure", file: file, line: line)
        }
    }
}
