import XCTest
@testable import ELM327BLEConnector

final class ELMReadResponseDispositionTests: XCTestCase {
    func testReadoutAvailabilityAndLinkFailuresAreSeparated() {
        XCTAssertEqual(classifyELMReadResponse("41 0C 1A F8"), .process)
        XCTAssertEqual(classifyELMReadResponse("NO DATA"), .noData)
        XCTAssertEqual(classifyELMReadResponse("UNABLE TO CONNECT"), .vehicleLinkFailure)
        XCTAssertEqual(classifyELMReadResponse("STOPPED"), .vehicleLinkFailure)
    }

    func testTransportFailuresStopTheReadoutSession() {
        XCTAssertEqual(classifyELMReadResponse("CAN ERROR"), .transportFailure)
        XCTAssertEqual(classifyELMReadResponse("BUS INIT: ERROR"), .transportFailure)
        XCTAssertEqual(classifyELMReadResponse("BUS ERROR"), .transportFailure)
        XCTAssertEqual(classifyELMReadResponse("BUFFER FULL"), .transportFailure)
        XCTAssertEqual(classifyELMReadResponse("LV RESET"), .transportFailure)
    }
}
