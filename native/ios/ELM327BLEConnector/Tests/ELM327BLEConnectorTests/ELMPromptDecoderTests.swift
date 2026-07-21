import XCTest
@testable import ELM327BLEConnector

final class ELMPromptDecoderTests: XCTestCase {
    func testSplitPromptDelimitedResponse() throws {
        var decoder = ELMPromptDecoder()
        XCTAssertNil(try decoder.append(Data("41 0C ".utf8)))
        XCTAssertEqual(try decoder.append(Data("1A F8>".utf8)), "41 0C 1A F8")
    }

    func testOversizedResponseIsRejected() {
        var decoder = ELMPromptDecoder(maximumResponseBytes: 4)
        XCTAssertThrowsError(try decoder.append(Data("12345".utf8))) { error in
            XCTAssertEqual(error as? ELMConnectorError, .responseTooLarge)
        }
    }
}
