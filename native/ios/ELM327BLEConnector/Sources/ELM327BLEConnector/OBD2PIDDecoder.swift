import Foundation

public struct OBD2MonitorValue: Equatable, Sendable {
    public let id: String
    public let pid: String
    public let value: Double
    public let unit: String
}

public enum OBD2PIDDecoder {
    public static func decode(_ command: ELMReadCommand, response: String) -> OBD2MonitorValue? {
        switch command {
        case .engineRPM:
            guard let bytes = bytes(after: "410C", count: 2, in: response) else { return nil }
            return OBD2MonitorValue(id: "engine_speed", pid: "0C", value: Double(Int(bytes[0]) * 256 + Int(bytes[1])) / 4, unit: "rpm")
        case .coolantTemperature:
            guard let bytes = bytes(after: "4105", count: 1, in: response) else { return nil }
            return OBD2MonitorValue(id: "coolant_temp", pid: "05", value: Double(Int(bytes[0]) - 40), unit: "C")
        case .controlModuleVoltage:
            guard let bytes = bytes(after: "4142", count: 2, in: response) else { return nil }
            return OBD2MonitorValue(id: "control_module_voltage", pid: "42", value: Double(Int(bytes[0]) * 256 + Int(bytes[1])) / 1000, unit: "V")
        default:
            return nil
        }
    }

    public static func supportedPIDs(response: String) -> [String] {
        guard let bytes = bytes(after: "4100", count: 4, in: response) else { return [] }
        return bytes.enumerated().flatMap { byteIndex, byte in
            (0..<8).compactMap { bitIndex in
                guard byte & UInt8(1 << (7 - bitIndex)) != 0 else { return nil }
                return String(format: "%02X", byteIndex * 8 + bitIndex + 1)
            }
        }
    }

    private static func bytes(after marker: String, count: Int, in response: String) -> [UInt8]? {
        let normalized = response.uppercased().filter { $0.isHexDigit }
        guard let markerRange = normalized.range(of: marker) else { return nil }
        let start = markerRange.upperBound
        let end = normalized.index(start, offsetBy: count * 2, limitedBy: normalized.endIndex) ?? normalized.endIndex
        let payload = String(normalized[start..<end])
        guard payload.count == count * 2 else { return nil }
        return stride(from: 0, to: payload.count, by: 2).compactMap { offset in
            let index = payload.index(payload.startIndex, offsetBy: offset)
            let next = payload.index(index, offsetBy: 2)
            return UInt8(payload[index..<next], radix: 16)
        }
    }
}
