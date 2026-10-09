import XCTest
@testable import ELM327BLEConnector

final class NativeControlRawTests: XCTestCase {
    private let cases: [(ELMReadCommand, String, String, Int)] = [
        (.commandedEGRAndError, "69", "egr_system_pid69_raw", 7),
        (.commandedDieselIntakeAirFlow, "6A", "intake_air_flow_pid6a_raw", 5),
        (.commandedThrottleControl, "6C", "throttle_control_pid6c_raw", 5)
    ]

    func testCompleteRawAndRefusedNumericResults() throws {
        for (command, pid, id, length) in cases {
            for support in 0...255 {
                let bytes = Array([support, 0x41, 0x0D, 0, 0x42, 0, 0x80].prefix(length))
                let raw = bytes.map { String(format: "%02X", $0) }.joined(separator: " ")
                let response = "41 \(pid) \(raw)"
                let values = try OBD2ReadoutDecoder.decodeLiveRawPID(command: command, response: response).get()
                XCTAssertEqual(values.count, 1)
                XCTAssertEqual(values.first?.value, OBD2RawMonitorValue(id: id, pid: pid, value: raw))
                XCTAssertThrowsError(try OBD2ReadoutDecoder.decodeLivePID(command: command, response: response).get())
            }
            for size in 0..<length {
                let response = "41 \(pid) " + Array(repeating: "80", count: size).joined(separator: " ")
                XCTAssertThrowsError(try OBD2ReadoutDecoder.decodeLiveRawPID(command: command, response: response).get())
                XCTAssertEqual(OBD2PIDDecoder.decodeValues(command, response: response), [])
            }
            let full = "41 \(pid) " + Array(repeating: "80", count: length).joined(separator: " ")
            let scoped = try OBD2ReadoutDecoder.decodeLiveRawPID(command: command, response: "7E8 \(full)\r7E9 \(full)").get()
            XCTAssertEqual(scoped.map(\.scopeID), ["7E8", "7E9"])
            XCTAssertTrue(scoped.allSatisfy { $0.value.id == id })
            for invalid in [full + " 00", "7F 01 11", full + "\r7F 01 11", "7E8 \(full)\r7E9 7F 01 11", "41 0D 00", "NO DATA", ""] {
                XCTAssertThrowsError(try OBD2ReadoutDecoder.decodeLiveRawPID(command: command, response: invalid).get())
            }
        }
        XCTAssertEqual(OBD2PIDDecoder.decode(.commandedEGR, response: "41 2C 00")?.value, 0)
        XCTAssertEqual(OBD2PIDDecoder.decode(.egrError, response: "41 2D 80")?.value, 0)
    }

    func testEnvelopeRoundTripPreviewAndWebFixture() throws {
        var fixtures: [NativeConnectorEnvelope] = []
        for (command, pid, _, length) in cases {
            let response = "41 \(pid) " + Array(repeating: "80", count: length).joined(separator: " ")
            let value = try XCTUnwrap(OBD2ReadoutDecoder.decodeLiveRawPID(command: command, response: response).get().first?.value)
            for ecu in ["7E8", "7E9"] {
                let envelope = NativeConnectorEnvelopeFactory.livePID(context: NativeConnectorSessionContext(), sequence: 1, scopeID: ecu, value: value)
                let restored = try JSONDecoder().decode(NativeConnectorEnvelope.self, from: JSONEncoder().encode(envelope))
                XCTAssertEqual(restored, envelope)
                let preview = NativeConnectorReadoutPreview(envelopes: [restored])
                XCTAssertTrue(preview.liveValues.isEmpty)
                let row = try XCTUnwrap(preview.liveTextValues.first)
                XCTAssertEqual(row.sourceScopeID, ecu)
                XCTAssertTrue(row.isUndecodedRaw)
                XCTAssertEqual(row.displayValue, "未換算RAW: \(value.value)")
                XCTAssertEqual(row.unit, "")
                fixtures.append(restored)
            }
        }
        let text = NativeConnectorEnvelopeFactory.livePID(context: NativeConnectorSessionContext(), sequence: 1, scopeID: "7E8", value: OBD2TextMonitorValue(id: "fuel_type", pid: "51", value: "diesel", unit: ""))
        XCTAssertFalse(try XCTUnwrap(NativeConnectorReadoutPreview(envelopes: [text]).liveTextValues.first).isUndecodedRaw)
        if let path = ProcessInfo.processInfo.environment["NATIVE_CONTROL_RAW_EXPORT"] {
            try JSONEncoder().encode(fixtures).write(to: URL(fileURLWithPath: path), options: .atomic)
        }
    }
}
