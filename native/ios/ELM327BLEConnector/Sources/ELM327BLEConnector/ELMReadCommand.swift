import Foundation

public enum ELMReadCommand: CaseIterable, Sendable, Equatable {
    case disableEcho
    case disableLinefeeds
    case enableHeaders
    case autoProtocol
    case identifyAdapter
    case describeProtocol
    case storedDTC
    case pendingDTC
    case permanentDTC
    case freezeFrameCapabilities
    case freezeFrameTriggerDTC
    case supportedPIDs
    case readinessStatus
    case engineRPM
    case coolantTemperature
    case controlModuleVoltage

    public var wireValue: String {
        switch self {
        case .disableEcho: return "ATE0"
        case .disableLinefeeds: return "ATL0"
        case .enableHeaders: return "ATH1"
        case .autoProtocol: return "ATSP0"
        case .identifyAdapter: return "ATI"
        case .describeProtocol: return "ATDP"
        case .storedDTC: return "03"
        case .pendingDTC: return "07"
        case .permanentDTC: return "0A"
        case .freezeFrameCapabilities: return "020000"
        case .freezeFrameTriggerDTC: return "020200"
        case .supportedPIDs: return "0100"
        case .readinessStatus: return "0101"
        case .engineRPM: return "010C"
        case .coolantTemperature: return "0105"
        case .controlModuleVoltage: return "0142"
        }
    }

    public var intent: String {
        switch self {
        case .disableEcho, .disableLinefeeds, .enableHeaders, .autoProtocol, .identifyAdapter, .describeProtocol: return "adapter_identity"
        case .storedDTC: return "read_stored_dtc"
        case .pendingDTC: return "read_pending_dtc"
        case .permanentDTC: return "read_permanent_dtc"
        case .freezeFrameCapabilities: return "read_freeze_frame"
        case .freezeFrameTriggerDTC: return "read_freeze_frame"
        case .supportedPIDs: return "read_supported_pids"
        case .readinessStatus, .engineRPM, .coolantTemperature, .controlModuleVoltage: return "read_live_pid_snapshot"
        }
    }

    public var readoutID: String? {
        switch self {
        case .readinessStatus: return "readiness_snapshot"
        case .freezeFrameCapabilities, .freezeFrameTriggerDTC: return "freeze_frame_snapshot"
        case .engineRPM, .coolantTemperature, .controlModuleVoltage: return "live_pid_snapshot"
        default: return nil
        }
    }

    public var isAdapterSetup: Bool {
        switch self {
        case .disableEcho, .disableLinefeeds, .enableHeaders, .autoProtocol: return true
        default: return false
        }
    }

    public var timeout: TimeInterval {
        switch self {
        case .storedDTC: return 12
        case .pendingDTC, .permanentDTC, .freezeFrameCapabilities, .freezeFrameTriggerDTC, .readinessStatus: return 8
        default: return 4
        }
    }
}
