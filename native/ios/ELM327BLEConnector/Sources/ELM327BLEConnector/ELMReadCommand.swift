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
    case onboardMonitor
    case freezeFrameCapabilities
    case freezeFrameTriggerDTC
    case freezeFrameCoolantTemperature
    case freezeFrameEngineRPM
    case freezeFrameVehicleSpeed
    case freezeFrameIntakeAirTemperature
    case freezeFrameControlModuleVoltage
    case mode09SupportedInfoTypes
    case mode09CalibrationID
    case mode09CalibrationVerificationNumber
    case mode09EcuName
    case supportedPIDs
    case supportedPIDs20
    case supportedPIDs40
    case supportedPIDs60
    case supportedPIDs80
    case supportedPIDsA0
    case readinessStatus
    case calculatedLoad
    case shortTermFuelTrimBank1
    case longTermFuelTrimBank1
    case manifoldAbsolutePressure
    case engineRPM
    case vehicleSpeed
    case timingAdvance
    case coolantTemperature
    case intakeAirTemperature
    case massAirFlow
    case throttlePosition
    case engineRuntime
    case fuelLevel
    case controlModuleVoltage
    case ambientAirTemperature
    case timeWithMIL
    case engineOilTemperature
    case engineFuelRate

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
        case .onboardMonitor: return "06"
        case .freezeFrameCapabilities: return "020000"
        case .freezeFrameTriggerDTC: return "020200"
        case .freezeFrameCoolantTemperature: return "020500"
        case .freezeFrameEngineRPM: return "020C00"
        case .freezeFrameVehicleSpeed: return "020D00"
        case .freezeFrameIntakeAirTemperature: return "020F00"
        case .freezeFrameControlModuleVoltage: return "024200"
        case .mode09SupportedInfoTypes: return "0900"
        case .mode09CalibrationID: return "0904"
        case .mode09CalibrationVerificationNumber: return "0906"
        case .mode09EcuName: return "090A"
        case .supportedPIDs: return "0100"
        case .supportedPIDs20: return "0120"
        case .supportedPIDs40: return "0140"
        case .supportedPIDs60: return "0160"
        case .supportedPIDs80: return "0180"
        case .supportedPIDsA0: return "01A0"
        case .readinessStatus: return "0101"
        case .calculatedLoad: return "0104"
        case .shortTermFuelTrimBank1: return "0106"
        case .longTermFuelTrimBank1: return "0107"
        case .manifoldAbsolutePressure: return "010B"
        case .engineRPM: return "010C"
        case .vehicleSpeed: return "010D"
        case .timingAdvance: return "010E"
        case .coolantTemperature: return "0105"
        case .intakeAirTemperature: return "010F"
        case .massAirFlow: return "0110"
        case .throttlePosition: return "0111"
        case .engineRuntime: return "011F"
        case .fuelLevel: return "012F"
        case .controlModuleVoltage: return "0142"
        case .ambientAirTemperature: return "0146"
        case .timeWithMIL: return "014D"
        case .engineOilTemperature: return "015C"
        case .engineFuelRate: return "015E"
        }
    }

    public var intent: String {
        switch self {
        case .disableEcho, .disableLinefeeds, .enableHeaders, .autoProtocol, .identifyAdapter, .describeProtocol: return "adapter_identity"
        case .storedDTC: return "read_stored_dtc"
        case .pendingDTC: return "read_pending_dtc"
        case .permanentDTC: return "read_permanent_dtc"
        case .onboardMonitor: return "read_onboard_monitor"
        case .freezeFrameCapabilities: return "read_freeze_frame"
        case .freezeFrameTriggerDTC, .freezeFrameCoolantTemperature, .freezeFrameEngineRPM, .freezeFrameVehicleSpeed, .freezeFrameIntakeAirTemperature, .freezeFrameControlModuleVoltage: return "read_freeze_frame"
        case .mode09SupportedInfoTypes, .mode09CalibrationID, .mode09CalibrationVerificationNumber, .mode09EcuName: return "read_ecu_info"
        case .supportedPIDs, .supportedPIDs20, .supportedPIDs40, .supportedPIDs60, .supportedPIDs80, .supportedPIDsA0: return "read_supported_pids"
        case .readinessStatus, .calculatedLoad, .shortTermFuelTrimBank1, .longTermFuelTrimBank1, .manifoldAbsolutePressure, .engineRPM, .vehicleSpeed, .timingAdvance, .coolantTemperature, .intakeAirTemperature, .massAirFlow, .throttlePosition, .engineRuntime, .fuelLevel, .controlModuleVoltage, .ambientAirTemperature, .timeWithMIL, .engineOilTemperature, .engineFuelRate: return "read_live_pid_snapshot"
        }
    }

    public var readoutID: String? {
        switch self {
        case .identifyAdapter, .describeProtocol: return "adapter_identity"
        case .storedDTC: return "stored_dtc_snapshot"
        case .pendingDTC: return "pending_dtc_snapshot"
        case .permanentDTC: return "permanent_dtc_snapshot"
        case .onboardMonitor: return "onboard_monitor_snapshot"
        case .supportedPIDs, .supportedPIDs20, .supportedPIDs40, .supportedPIDs60, .supportedPIDs80, .supportedPIDsA0: return "supported_pid_matrix"
        case .readinessStatus: return "readiness_snapshot"
        case .freezeFrameCapabilities, .freezeFrameTriggerDTC, .freezeFrameCoolantTemperature, .freezeFrameEngineRPM, .freezeFrameVehicleSpeed, .freezeFrameIntakeAirTemperature, .freezeFrameControlModuleVoltage: return "freeze_frame_snapshot"
        case .mode09SupportedInfoTypes, .mode09CalibrationID, .mode09CalibrationVerificationNumber, .mode09EcuName: return "ecu_info_snapshot"
        case .calculatedLoad, .shortTermFuelTrimBank1, .longTermFuelTrimBank1, .manifoldAbsolutePressure, .engineRPM, .vehicleSpeed, .timingAdvance, .coolantTemperature, .intakeAirTemperature, .massAirFlow, .throttlePosition, .engineRuntime, .fuelLevel, .controlModuleVoltage, .ambientAirTemperature, .timeWithMIL, .engineOilTemperature, .engineFuelRate: return "live_pid_snapshot"
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
        case .storedDTC, .onboardMonitor: return 12
        case .pendingDTC, .permanentDTC, .freezeFrameCapabilities, .freezeFrameTriggerDTC, .freezeFrameCoolantTemperature, .freezeFrameEngineRPM, .freezeFrameVehicleSpeed, .freezeFrameIntakeAirTemperature, .freezeFrameControlModuleVoltage, .mode09SupportedInfoTypes, .mode09CalibrationID, .mode09CalibrationVerificationNumber, .mode09EcuName, .readinessStatus: return 8
        default: return 4
        }
    }

    public var freezeFramePID: String? {
        switch self {
        case .freezeFrameTriggerDTC: return "02"
        case .freezeFrameCoolantTemperature: return "05"
        case .freezeFrameEngineRPM: return "0C"
        case .freezeFrameVehicleSpeed: return "0D"
        case .freezeFrameIntakeAirTemperature: return "0F"
        case .freezeFrameControlModuleVoltage: return "42"
        default: return nil
        }
    }

    public var livePID: String? {
        switch self {
        case .calculatedLoad: return "04"
        case .coolantTemperature: return "05"
        case .shortTermFuelTrimBank1: return "06"
        case .longTermFuelTrimBank1: return "07"
        case .manifoldAbsolutePressure: return "0B"
        case .engineRPM: return "0C"
        case .vehicleSpeed: return "0D"
        case .timingAdvance: return "0E"
        case .intakeAirTemperature: return "0F"
        case .massAirFlow: return "10"
        case .throttlePosition: return "11"
        case .engineRuntime: return "1F"
        case .fuelLevel: return "2F"
        case .controlModuleVoltage: return "42"
        case .ambientAirTemperature: return "46"
        case .timeWithMIL: return "4D"
        case .engineOilTemperature: return "5C"
        case .engineFuelRate: return "5E"
        default: return nil
        }
    }

    public var supportedPIDPageBase: String? {
        switch self {
        case .supportedPIDs: return "00"
        case .supportedPIDs20: return "20"
        case .supportedPIDs40: return "40"
        case .supportedPIDs60: return "60"
        case .supportedPIDs80: return "80"
        case .supportedPIDsA0: return "A0"
        default: return nil
        }
    }

    public var nextSupportedPIDPage: ELMReadCommand? {
        switch self {
        case .supportedPIDs: return .supportedPIDs20
        case .supportedPIDs20: return .supportedPIDs40
        case .supportedPIDs40: return .supportedPIDs60
        case .supportedPIDs60: return .supportedPIDs80
        case .supportedPIDs80: return .supportedPIDsA0
        default: return nil
        }
    }
}
