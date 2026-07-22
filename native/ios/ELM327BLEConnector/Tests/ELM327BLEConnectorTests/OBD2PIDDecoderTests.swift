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
        XCTAssertEqual(OBD2PIDDecoder.decode(.fuelRailPressureVacuum, response: "41 22 01 00")?.value, 20.224, accuracy: 0.000001)
        XCTAssertEqual(OBD2PIDDecoder.decode(.fuelRailPressure, response: "41 23 00 C8")?.value, 2000)
        XCTAssertEqual(OBD2PIDDecoder.decode(.commandedEGR, response: "41 2C 80")?.value, 50.19607843137255, accuracy: 0.0000001)
        XCTAssertEqual(OBD2PIDDecoder.decode(.egrError, response: "41 2D 90")?.value, 12.5)
        XCTAssertEqual(OBD2PIDDecoder.decode(.commandedEvapPurge, response: "41 2E 40")?.value, 25.098039215686274, accuracy: 0.0000001)
        XCTAssertEqual(OBD2PIDDecoder.decode(.fuelLevel, response: "41 2F 80")?.value, 50.19607843137255, accuracy: 0.0000001)
        XCTAssertEqual(OBD2PIDDecoder.decode(.warmupsSinceClear, response: "41 30 05")?.value, 5)
        XCTAssertEqual(OBD2PIDDecoder.decode(.distanceSinceClear, response: "41 31 00 64")?.value, 100)
        XCTAssertEqual(OBD2PIDDecoder.decode(.barometricPressure, response: "41 33 64")?.value, 100)
        XCTAssertEqual(OBD2PIDDecoder.decode(.catalystTemperatureB1S1, response: "41 3C 0F A0")?.value, 360)
        XCTAssertEqual(OBD2PIDDecoder.decode(.catalystTemperatureB1S2, response: "41 3D 0F A0")?.value, 360)
        XCTAssertEqual(OBD2PIDDecoder.decode(.catalystTemperatureB2S1, response: "41 3E 0F A0")?.value, 360)
        XCTAssertEqual(OBD2PIDDecoder.decode(.catalystTemperatureB2S2, response: "41 3F 0F A0")?.value, 360)
        XCTAssertEqual(OBD2PIDDecoder.decode(.commandedThrottleActuator, response: "41 4C 80")?.value, 50.19607843137255, accuracy: 0.0000001)
        XCTAssertEqual(OBD2PIDDecoder.decode(.absoluteLoad, response: "41 43 01 00")?.value, 100.3921568627451, accuracy: 0.0000001)
        XCTAssertEqual(OBD2PIDDecoder.decode(.commandedEquivalenceRatio, response: "41 44 80 00")?.value, 1)
        XCTAssertEqual(OBD2PIDDecoder.decode(.relativeThrottlePosition, response: "41 45 80")?.value, 50.19607843137255, accuracy: 0.0000001)
        XCTAssertEqual(OBD2PIDDecoder.decode(.ambientAirTemperature, response: "41 46 50")?.value, 40)
        XCTAssertEqual(OBD2PIDDecoder.decode(.timeWithMIL, response: "41 4D 00 3C")?.value, 60)
        XCTAssertEqual(OBD2PIDDecoder.decode(.timeSinceClear, response: "41 4E 00 78")?.value, 120)
        XCTAssertEqual(OBD2PIDDecoder.decode(.ethanolPercentage, response: "41 52 40")?.value, 25.098039215686274, accuracy: 0.0000001)
        XCTAssertEqual(OBD2PIDDecoder.decode(.hybridBatteryRemaining, response: "41 5B 90")?.value, 56.470588235294116, accuracy: 0.0000001)
        XCTAssertEqual(OBD2PIDDecoder.decode(.engineOilTemperature, response: "41 5C 64")?.value, 60)
        XCTAssertEqual(OBD2PIDDecoder.decode(.fuelInjectionTiming, response: "41 5D 6D 00")?.value, 8)
        XCTAssertEqual(OBD2PIDDecoder.decode(.engineFuelRate, response: "41 5E 00 64")?.value, 5)
        XCTAssertEqual(OBD2PIDDecoder.decode(.driverDemandTorque, response: "41 61 8C")?.value, 15)
        XCTAssertEqual(OBD2PIDDecoder.decode(.actualEngineTorque, response: "41 62 96")?.value, 25)
        XCTAssertEqual(OBD2PIDDecoder.decode(.engineReferenceTorque, response: "41 63 01 90")?.value, 400)
        XCTAssertEqual(OBD2PIDDecoder.decodeValues(.oxygenSensorB1S1, response: "41 14 80 90"), [
            OBD2MonitorValue(id: "o2_b1s1_voltage", pid: "14", value: 0.64, unit: "V"),
            OBD2MonitorValue(id: "o2_b1s1_stft", pid: "14", value: 12.5, unit: "%")
        ])
        XCTAssertNil(OBD2PIDDecoder.decode(.oxygenSensorB1S1, response: "41 14 80 90"))
        XCTAssertEqual(OBD2PIDDecoder.decodeValues(.wideOxygenVoltageB1S1, response: "41 24 80 00 20 00"), [
            OBD2MonitorValue(id: "wide_o2_b1s1_ratio", pid: "24", value: 1, unit: ""),
            OBD2MonitorValue(id: "wide_o2_b1s1_voltage_wide", pid: "24", value: 1, unit: "V")
        ])
        XCTAssertEqual(OBD2PIDDecoder.decodeValues(.wideOxygenCurrentB1S1, response: "41 34 80 00 7F 00"), [
            OBD2MonitorValue(id: "wide_o2_b1s1_current_ratio", pid: "34", value: 1, unit: ""),
            OBD2MonitorValue(id: "wide_o2_b1s1_current", pid: "34", value: -1, unit: "mA")
        ])
    }

    func testSupportedPidBitmap() {
        XCTAssertEqual(OBD2PIDDecoder.supportedPIDs(response: "41 00 A0 00 00 00"), ["01", "03"])
    }
}
