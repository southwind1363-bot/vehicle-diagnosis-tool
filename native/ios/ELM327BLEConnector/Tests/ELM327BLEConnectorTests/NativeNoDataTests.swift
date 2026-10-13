import Foundation
import XCTest
@testable import ELM327BLEConnector

final class NativeNoDataTests: XCTestCase {
    func testMissingReadoutsRemainFailedThroughArchiveAndPreview() throws {
        let commands: [ELMReadCommand] = [.storedDTC, .pendingDTC, .permanentDTC, .freezeFrameCapabilities, .onboardMonitor, .mode09SupportedInfoTypes]
        var fixtures: [NativeConnectorEnvelope] = []
        for (index, command) in commands.enumerated() {
            XCTAssertEqual(classifyELMReadResponse("SEARCHING...\rNO DATA"), .noData)
            XCTAssertFalse(isExpectedEmptyELMReadoutCommand(command))
            let envelope = NativeConnectorEnvelopeFactory.failedReadout(context: NativeConnectorSessionContext(), sequence: index + 1, command: command, error: "readout_not_available")
            let restored = try JSONDecoder().decode(NativeConnectorEnvelope.self, from: JSONEncoder().encode(envelope))
            XCTAssertEqual(restored, envelope)
            XCTAssertFalse(restored.ok)
            XCTAssertFalse(restored.wouldTransmit)
            XCTAssertEqual(restored.readoutID, command.readoutID)
            XCTAssertEqual(restored.errors, ["readout_not_available"])
            XCTAssertTrue(NativeConnectorReadoutPreview(envelopes: [restored]).emptyReadouts.isEmpty)
            fixtures.append(restored)
        }
        if let path = ProcessInfo.processInfo.environment["NATIVE_NO_DATA_EXPORT"] {
            try JSONEncoder().encode(fixtures).write(to: URL(fileURLWithPath: path), options: .atomic)
        }
    }

    func testPositiveZeroDTCAndErrorPriorityArePreserved() throws {
        for (command, response) in [(ELMReadCommand.storedDTC, "43 00 00"), (.pendingDTC, "47 00 00"), (.permanentDTC, "4A 00 00")] {
            XCTAssertEqual(classifyELMReadResponse(response), .process)
            let result = try OBD2ReadoutDecoder.decodeDTCs(command: command, response: response).get()
            XCTAssertEqual(result.count, 1)
            XCTAssertTrue(result[0].dtcs.isEmpty)
        }
        XCTAssertEqual(classifyELMReadResponse("BUS ERROR\rNO DATA"), .transportFailure)
        XCTAssertEqual(classifyELMReadResponse("UNABLE TO CONNECT\rNO DATA"), .vehicleLinkFailure)
        XCTAssertFalse(isCompletedELMAdapterSetupResponse(command: .autoProtocol, response: "NO DATA"))
    }
}
