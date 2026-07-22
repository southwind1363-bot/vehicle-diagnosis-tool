import Foundation

public struct OBD2MonitorValue: Equatable, Sendable {
    public let id: String
    public let pid: String
    public let value: Double
    public let unit: String
}

public enum OBD2PIDDecoder {
    public static func decode(_ command: ELMReadCommand, response: String) -> OBD2MonitorValue? {
        let values = decodeValues(command, response: response)
        return values.count == 1 ? values[0] : nil
    }

    public static func decodeValues(_ command: ELMReadCommand, response: String) -> [OBD2MonitorValue] {
        guard case .success(let results) = OBD2ReadoutDecoder.decodeLivePID(command: command, response: response) else { return [] }
        return results.map(\.value)
    }

    public static func supportedPIDs(response: String) -> [String] {
        guard case .success(let results) = OBD2ReadoutDecoder.decodeSupportedPIDs(response: response), results.count == 1 else { return [] }
        return results[0].pids
    }
}
