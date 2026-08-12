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
        XCTAssertEqual(classifyELMReadResponse("?"), .transportFailure)
        XCTAssertEqual(classifyELMReadResponse("ERROR"), .transportFailure)
        XCTAssertEqual(classifyELMReadResponse("DATA ERROR"), .transportFailure)
        XCTAssertEqual(classifyELMReadResponse("BUS BUSY"), .transportFailure)
        XCTAssertEqual(classifyELMReadResponse("ACT ALERT"), .transportFailure)
    }

    func testAdapterIdentityRejectsExplicitFailureResponses() {
        for command in [ELMReadCommand.identifyAdapter, .describeProtocol, .describeProtocolNumber] {
            XCTAssertFalse(isUsableELMAdapterIdentityResponse(command: command, response: "?"))
            XCTAssertFalse(isUsableELMAdapterIdentityResponse(command: command, response: "ERROR"))
            XCTAssertFalse(isUsableELMAdapterIdentityResponse(command: command, response: "NO DATA"))
            XCTAssertFalse(isUsableELMAdapterIdentityResponse(command: command, response: command.wireValue))
        }
    }

    func testAdapterIdentityAcceptsUsableELMAndProtocolResponses() {
        XCTAssertTrue(isUsableELMAdapterIdentityResponse(command: .identifyAdapter, response: "ATI\nELM327 v1.5"))
        XCTAssertTrue(isUsableELMAdapterIdentityResponse(command: .describeProtocol, response: "ATDP\nAUTO, ISO 15765-4 (CAN 11/500)"))
        XCTAssertTrue(isUsableELMAdapterIdentityResponse(command: .describeProtocolNumber, response: "ATDPN\nA6"))
        XCTAssertFalse(isUsableELMAdapterIdentityResponse(command: .storedDTC, response: "ELM327 v1.5"))
    }

    func testAdapterProtocolNumberRetainsOnlyELMProtocolValues() {
        XCTAssertEqual(normalizedELMAdapterProtocolNumber(response: "ATDPN\nA6"), "A6")
        XCTAssertEqual(normalizedELMAdapterProtocolNumber(response: "ATDPN\n6"), "6")
        XCTAssertNil(normalizedELMAdapterProtocolNumber(response: "ATDPN\nAUTO"))
        XCTAssertNil(normalizedELMAdapterProtocolNumber(response: "ATDPN\nA6\nserial=979867700221"))
    }

    func testAdapterProtocolHintIgnoresTransientLines() {
        XCTAssertEqual(
            normalizedELMAdapterProtocolHint(response: "ATDP\nSEARCHING...\nAUTO, ISO 15765-4 (CAN 11/500)\n>"),
            "AUTO, ISO 15765-4 (CAN 11/500)"
        )
        XCTAssertNil(normalizedELMAdapterProtocolHint(response: "ATDP\nAUTO\n>"))
    }
}
