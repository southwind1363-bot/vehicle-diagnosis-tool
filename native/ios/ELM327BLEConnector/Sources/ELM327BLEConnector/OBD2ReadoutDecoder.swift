import Foundation

public struct OBD2DTC: Equatable, Sendable {
    public let code: String
    public let status: String
}

public struct OBD2ReadinessStatus: Equatable, Sendable {
    public let milOn: Bool
    public let dtcCount: Int
    public let statusByteA: Int
    public let statusByteB: Int
    public let statusByteC: Int
    public let statusByteD: Int
    public let ignitionType: String
}

public enum OBD2ReadoutDecodeFailure: String, Error, Equatable, Sendable {
    case noData = "readout_not_available"
    case negativeResponse = "negative_response"
    case ambiguousResponse = "ambiguous_response"
    case malformedResponse = "malformed_response"
}

public enum OBD2ReadoutDecoder {
    public static func decodeDTCs(command: ELMReadCommand, response: String) -> Result<[(scopeID: String?, dtcs: [OBD2DTC])], OBD2ReadoutDecodeFailure> {
        let expected: UInt8
        let status: String
        switch command {
        case .storedDTC: expected = 0x43; status = "stored"
        case .pendingDTC: expected = 0x47; status = "pending"
        case .permanentDTC: expected = 0x4A; status = "permanent"
        default: return .failure(.malformedResponse)
        }
        return packets(in: response).flatMap { packets in
            var decoded: [(scopeID: String?, dtcs: [OBD2DTC])] = []
            for packet in packets {
                guard packet.payload.first == expected else {
                    return packet.payload.first == 0x7F ? .failure(.negativeResponse) : .failure(.malformedResponse)
                }
                let bytes = Array(packet.payload.dropFirst())
                guard bytes.count.isMultiple(of: 2) else { return .failure(.malformedResponse) }
                var dtcs: [OBD2DTC] = []
                for index in stride(from: 0, to: bytes.count, by: 2) {
                    let high = bytes[index]
                    let low = bytes[index + 1]
                    if high == 0 && low == 0 { continue }
                    dtcs.append(OBD2DTC(code: dtcCode(high: high, low: low), status: status))
                }
                var seenCodes = Set<String>()
                decoded.append((scopeID: packet.scopeID, dtcs: dtcs.filter { seenCodes.insert($0.code).inserted }))
            }
            return .success(decoded)
        }
    }

    public static func decodeReadiness(response: String) -> Result<[(scopeID: String?, status: OBD2ReadinessStatus)], OBD2ReadoutDecodeFailure> {
        packets(in: response).flatMap { packets in
            var decoded: [(scopeID: String?, status: OBD2ReadinessStatus)] = []
            for packet in packets {
                let payload = packet.payload
                guard payload.count == 6, payload[0] == 0x41, payload[1] == 0x01 else {
                    return payload.first == 0x7F ? .failure(.negativeResponse) : .failure(.malformedResponse)
                }
                let a = payload[2]
                let b = payload[3]
                decoded.append((
                    scopeID: packet.scopeID,
                    status: OBD2ReadinessStatus(
                        milOn: (a & 0x80) != 0,
                        dtcCount: Int(a & 0x7F),
                        statusByteA: Int(a),
                        statusByteB: Int(b),
                        statusByteC: Int(payload[4]),
                        statusByteD: Int(payload[5]),
                        ignitionType: (b & 0x08) != 0 ? "compression" : "spark"
                    )
                ))
            }
            return .success(decoded)
        }
    }

    public static func decodeFreezeFrameTriggerDTC(response: String) -> Result<[(scopeID: String?, code: String?)], OBD2ReadoutDecodeFailure> {
        packets(in: response).flatMap { packets in
            var decoded: [(scopeID: String?, code: String?)] = []
            for packet in packets {
                let payload = packet.payload
                guard payload.count == 5, payload[0] == 0x42, payload[1] == 0x02, payload[2] == 0x00 else {
                    return payload.first == 0x7F ? .failure(.negativeResponse) : .failure(.malformedResponse)
                }
                decoded.append((scopeID: packet.scopeID, code: payload[3] == 0 && payload[4] == 0 ? nil : dtcCode(high: payload[3], low: payload[4])))
            }
            return .success(decoded)
        }
    }

    public static func freezeFrameSupportsTriggerDTC(response: String) -> Bool {
        guard case .success(let packets) = packets(in: response) else { return false }
        return packets.contains { packet in
            guard packet.payload.count == 6, packet.payload[0] == 0x42, packet.payload[1] == 0x00 else { return false }
            return (packet.payload[2] & 0x40) != 0
        }
    }

    private struct Packet: Sendable {
        let scopeID: String?
        let payload: [UInt8]
    }

    private static func packets(in response: String) -> Result<[Packet], OBD2ReadoutDecodeFailure> {
        let lines = response
            .split(whereSeparator: { $0.isNewline })
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() }
            .filter { !$0.isEmpty }
        guard !lines.isEmpty else { return .failure(.noData) }
        if lines.contains(where: { $0 == "NO DATA" || $0.contains("UNABLE TO CONNECT") }) { return .failure(.noData) }
        if lines.contains(where: { $0.contains("CAN ERROR") || $0.contains("BUFFER FULL") || $0 == "STOPPED" || $0 == "?" }) { return .failure(.malformedResponse) }

        var groups: [String?: [[UInt8]]] = [:]
        for line in lines {
            guard let parsed = parseLine(line) else { return .failure(.malformedResponse) }
            groups[parsed.scopeID, default: []].append(parsed.bytes)
        }
        guard !(groups[nil]?.count ?? 0 > 1) else { return .failure(.ambiguousResponse) }
        var result: [Packet] = []
        for (scopeID, frames) in groups {
            guard let payload = reassemble(frames: frames) else { return .failure(.malformedResponse) }
            result.append(Packet(scopeID: scopeID, payload: payload))
        }
        return .success(result.sorted { ($0.scopeID ?? "LEGACY") < ($1.scopeID ?? "LEGACY") })
    }

    private static func parseLine(_ line: String) -> (scopeID: String?, bytes: [UInt8])? {
        let tokens = line.split(whereSeparator: { $0 == " " || $0 == "\t" }).map(String.init)
        guard !tokens.isEmpty else { return nil }
        let hasHeader = tokens.count > 1 && (tokens[0].count == 3 || tokens[0].count == 8) && tokens[0].allSatisfy(\.isHexDigit)
        let scopeID = hasHeader ? tokens[0] : nil
        let payloadText = (hasHeader ? tokens.dropFirst() : tokens).joined()
        guard payloadText.count.isMultiple(of: 2), payloadText.allSatisfy(\.isHexDigit) else { return nil }
        let bytes = stride(from: 0, to: payloadText.count, by: 2).compactMap { offset -> UInt8? in
            let start = payloadText.index(payloadText.startIndex, offsetBy: offset)
            let end = payloadText.index(start, offsetBy: 2)
            return UInt8(payloadText[start..<end], radix: 16)
        }
        return bytes.isEmpty ? nil : (scopeID, bytes)
    }

    private static func reassemble(frames: [[UInt8]]) -> [UInt8]? {
        guard let first = frames.first, !first.isEmpty else { return nil }
        switch first[0] >> 4 {
        case 0:
            let length = Int(first[0] & 0x0F)
            guard first.count >= length + 1 else { return nil }
            return length == 0 ? [] : Array(first[1...length])
        case 1:
            guard first.count >= 2 else { return nil }
            let length = Int(first[0] & 0x0F) * 256 + Int(first[1])
            var payload = Array(first.dropFirst(2))
            var expectedSequence: UInt8 = 1
            for frame in frames.dropFirst() {
                guard frame.count >= 2, frame[0] >> 4 == 2, frame[0] & 0x0F == expectedSequence else { return nil }
                payload.append(contentsOf: frame.dropFirst())
                expectedSequence = (expectedSequence + 1) & 0x0F
            }
            guard payload.count >= length else { return nil }
            return Array(payload.prefix(length))
        default:
            return frames.count == 1 ? first : nil
        }
    }

    private static func dtcCode(high: UInt8, low: UInt8) -> String {
        let system = ["P", "C", "B", "U"][Int((high & 0xC0) >> 6)]
        return String(format: "%@%X%X%X%X", system, (high & 0x30) >> 4, high & 0x0F, (low & 0xF0) >> 4, low & 0x0F)
    }
}
