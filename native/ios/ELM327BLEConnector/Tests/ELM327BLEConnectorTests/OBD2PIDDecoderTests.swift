import XCTest
@testable import ELM327BLEConnector

final class OBD2PIDDecoderTests: XCTestCase {
    func testStandardPidEquations() {
        XCTAssertEqual(OBD2PIDDecoder.decode(.engineRPM, response: "41 0C 1A F8")?.value, 1726)
        XCTAssertEqual(OBD2PIDDecoder.decode(.coolantTemperature, response: "41 05 7B")?.value, 83)
        XCTAssertEqual(OBD2PIDDecoder.decode(.controlModuleVoltage, response: "41 42 37 10")?.value, 14.096)
    }

    func testSupportedPidBitmap() {
        XCTAssertEqual(OBD2PIDDecoder.supportedPIDs(response: "41 00 A0 00 00 00"), ["01", "03"])
    }
}
