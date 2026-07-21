import XCTest
@testable import ELM327BLEConnector

final class OBD2PIDDecoderTests: XCTestCase {
    func testStandardPidEquations() {
        XCTAssertEqual(OBD2PIDDecoder.decode(.engineRPM, response: "41 0C 1A F8")?.value, 1726)
        XCTAssertEqual(OBD2PIDDecoder.decode(.coolantTemperature, response: "41 05 7B")?.value, 83)
        XCTAssertEqual(OBD2PIDDecoder.decode(.controlModuleVoltage, response: "41 42 37 10")?.value, 14.096)
        XCTAssertEqual(OBD2PIDDecoder.decode(.fuelPressure, response: "41 0A 32")?.value, 150)
        XCTAssertEqual(OBD2PIDDecoder.decode(.engineRuntime, response: "41 1F 02 58")?.value, 600)
        XCTAssertEqual(OBD2PIDDecoder.decode(.distanceWithMIL, response: "41 21 01 F4")?.value, 500)
        XCTAssertEqual(OBD2PIDDecoder.decode(.fuelLevel, response: "41 2F 80")?.value, 50.19607843137255, accuracy: 0.0000001)
        XCTAssertEqual(OBD2PIDDecoder.decode(.warmupsSinceClear, response: "41 30 05")?.value, 5)
        XCTAssertEqual(OBD2PIDDecoder.decode(.distanceSinceClear, response: "41 31 00 64")?.value, 100)
        XCTAssertEqual(OBD2PIDDecoder.decode(.barometricPressure, response: "41 33 64")?.value, 100)
        XCTAssertEqual(OBD2PIDDecoder.decode(.ambientAirTemperature, response: "41 46 50")?.value, 40)
        XCTAssertEqual(OBD2PIDDecoder.decode(.timeWithMIL, response: "41 4D 00 3C")?.value, 60)
        XCTAssertEqual(OBD2PIDDecoder.decode(.timeSinceClear, response: "41 4E 00 78")?.value, 120)
        XCTAssertEqual(OBD2PIDDecoder.decode(.engineOilTemperature, response: "41 5C 64")?.value, 60)
        XCTAssertEqual(OBD2PIDDecoder.decode(.engineFuelRate, response: "41 5E 00 64")?.value, 5)
    }

    func testSupportedPidBitmap() {
        XCTAssertEqual(OBD2PIDDecoder.supportedPIDs(response: "41 00 A0 00 00 00"), ["01", "03"])
    }
}
