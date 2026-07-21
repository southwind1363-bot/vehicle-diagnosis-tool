import Foundation

public enum ELMReadCommand: CaseIterable, Sendable, Equatable {
    case identifyAdapter
    case describeProtocol
    case supportedPIDs
    case engineRPM
    case coolantTemperature
    case controlModuleVoltage

    public var wireValue: String {
        switch self {
        case .identifyAdapter: return "ATI"
        case .describeProtocol: return "ATDP"
        case .supportedPIDs: return "0100"
        case .engineRPM: return "010C"
        case .coolantTemperature: return "0105"
        case .controlModuleVoltage: return "0142"
        }
    }

    public var intent: String {
        switch self {
        case .identifyAdapter, .describeProtocol: return "adapter_identity"
        case .supportedPIDs: return "read_supported_pids"
        case .engineRPM, .coolantTemperature, .controlModuleVoltage: return "read_live_pid_snapshot"
        }
    }

    public var timeout: TimeInterval { 4 }
}
