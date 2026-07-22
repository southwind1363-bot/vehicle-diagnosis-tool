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
    case freezeFrameCalculatedLoad
    case freezeFrameShortTermFuelTrimBank1
    case freezeFrameLongTermFuelTrimBank1
    case freezeFrameFuelPressure
    case freezeFrameManifoldAbsolutePressure
    case freezeFrameCoolantTemperature
    case freezeFrameEngineRPM
    case freezeFrameVehicleSpeed
    case freezeFrameIntakeAirTemperature
    case freezeFrameThrottlePosition
    case freezeFrameEngineRuntime
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
    case fuelPressure
    case manifoldAbsolutePressure
    case engineRPM
    case vehicleSpeed
    case timingAdvance
    case coolantTemperature
    case intakeAirTemperature
    case massAirFlow
    case throttlePosition
    case oxygenSensorB1S1
    case oxygenSensorB1S2
    case oxygenSensorB1S3
    case oxygenSensorB1S4
    case oxygenSensorB2S1
    case oxygenSensorB2S2
    case oxygenSensorB2S3
    case oxygenSensorB2S4
    case wideOxygenVoltageB1S1
    case wideOxygenVoltageB1S2
    case wideOxygenVoltageB1S3
    case wideOxygenVoltageB1S4
    case wideOxygenVoltageB2S1
    case wideOxygenVoltageB2S2
    case wideOxygenVoltageB2S3
    case wideOxygenVoltageB2S4
    case engineRuntime
    case distanceWithMIL
    case fuelRailPressureVacuum
    case fuelRailPressure
    case commandedEGR
    case egrError
    case commandedEvapPurge
    case fuelLevel
    case warmupsSinceClear
    case distanceSinceClear
    case evapVaporPressure
    case barometricPressure
    case wideOxygenCurrentB1S1
    case wideOxygenCurrentB1S2
    case wideOxygenCurrentB2S1
    case wideOxygenCurrentB2S2
    case catalystTemperatureB1S1
    case catalystTemperatureB1S2
    case catalystTemperatureB2S1
    case catalystTemperatureB2S2
    case commandedThrottleActuator
    case controlModuleVoltage
    case absoluteLoad
    case commandedEquivalenceRatio
    case relativeThrottlePosition
    case ambientAirTemperature
    case absoluteThrottlePositionB
    case absoluteThrottlePositionC
    case acceleratorPositionD
    case acceleratorPositionE
    case acceleratorPositionF
    case timeWithMIL
    case timeSinceClear
    case ethanolPercentage
    case fuelRailPressureAbsolute
    case relativeAcceleratorPosition
    case hybridBatteryRemaining
    case engineOilTemperature
    case fuelInjectionTiming
    case engineFuelRate
    case driverDemandTorque
    case actualEngineTorque
    case engineReferenceTorque
    case enginePercentTorqueData
    case commandedEGRAndError
    case odometer

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
        case .freezeFrameCalculatedLoad: return "020400"
        case .freezeFrameShortTermFuelTrimBank1: return "020600"
        case .freezeFrameLongTermFuelTrimBank1: return "020700"
        case .freezeFrameFuelPressure: return "020A00"
        case .freezeFrameManifoldAbsolutePressure: return "020B00"
        case .freezeFrameCoolantTemperature: return "020500"
        case .freezeFrameEngineRPM: return "020C00"
        case .freezeFrameVehicleSpeed: return "020D00"
        case .freezeFrameIntakeAirTemperature: return "020F00"
        case .freezeFrameThrottlePosition: return "021100"
        case .freezeFrameEngineRuntime: return "021F00"
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
        case .fuelPressure: return "010A"
        case .manifoldAbsolutePressure: return "010B"
        case .engineRPM: return "010C"
        case .vehicleSpeed: return "010D"
        case .timingAdvance: return "010E"
        case .coolantTemperature: return "0105"
        case .intakeAirTemperature: return "010F"
        case .massAirFlow: return "0110"
        case .throttlePosition: return "0111"
        case .oxygenSensorB1S1: return "0114"
        case .oxygenSensorB1S2: return "0115"
        case .oxygenSensorB1S3: return "0116"
        case .oxygenSensorB1S4: return "0117"
        case .oxygenSensorB2S1: return "0118"
        case .oxygenSensorB2S2: return "0119"
        case .oxygenSensorB2S3: return "011A"
        case .oxygenSensorB2S4: return "011B"
        case .wideOxygenVoltageB1S1: return "0124"
        case .wideOxygenVoltageB1S2: return "0125"
        case .wideOxygenVoltageB1S3: return "0126"
        case .wideOxygenVoltageB1S4: return "0127"
        case .wideOxygenVoltageB2S1: return "0128"
        case .wideOxygenVoltageB2S2: return "0129"
        case .wideOxygenVoltageB2S3: return "012A"
        case .wideOxygenVoltageB2S4: return "012B"
        case .engineRuntime: return "011F"
        case .distanceWithMIL: return "0121"
        case .fuelRailPressureVacuum: return "0122"
        case .fuelRailPressure: return "0123"
        case .commandedEGR: return "012C"
        case .egrError: return "012D"
        case .commandedEvapPurge: return "012E"
        case .fuelLevel: return "012F"
        case .warmupsSinceClear: return "0130"
        case .distanceSinceClear: return "0131"
        case .evapVaporPressure: return "0132"
        case .barometricPressure: return "0133"
        case .wideOxygenCurrentB1S1: return "0134"
        case .wideOxygenCurrentB1S2: return "0135"
        case .wideOxygenCurrentB2S1: return "0138"
        case .wideOxygenCurrentB2S2: return "0139"
        case .catalystTemperatureB1S1: return "013C"
        case .catalystTemperatureB1S2: return "013D"
        case .catalystTemperatureB2S1: return "013E"
        case .catalystTemperatureB2S2: return "013F"
        case .commandedThrottleActuator: return "014C"
        case .controlModuleVoltage: return "0142"
        case .absoluteLoad: return "0143"
        case .commandedEquivalenceRatio: return "0144"
        case .relativeThrottlePosition: return "0145"
        case .ambientAirTemperature: return "0146"
        case .absoluteThrottlePositionB: return "0147"
        case .absoluteThrottlePositionC: return "0148"
        case .acceleratorPositionD: return "0149"
        case .acceleratorPositionE: return "014A"
        case .acceleratorPositionF: return "014B"
        case .timeWithMIL: return "014D"
        case .timeSinceClear: return "014E"
        case .ethanolPercentage: return "0152"
        case .fuelRailPressureAbsolute: return "0159"
        case .relativeAcceleratorPosition: return "015A"
        case .hybridBatteryRemaining: return "015B"
        case .engineOilTemperature: return "015C"
        case .fuelInjectionTiming: return "015D"
        case .engineFuelRate: return "015E"
        case .driverDemandTorque: return "0161"
        case .actualEngineTorque: return "0162"
        case .engineReferenceTorque: return "0163"
        case .enginePercentTorqueData: return "0164"
        case .commandedEGRAndError: return "0169"
        case .odometer: return "01A6"
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
        case .freezeFrameTriggerDTC, .freezeFrameCalculatedLoad, .freezeFrameShortTermFuelTrimBank1, .freezeFrameLongTermFuelTrimBank1, .freezeFrameFuelPressure, .freezeFrameManifoldAbsolutePressure, .freezeFrameCoolantTemperature, .freezeFrameEngineRPM, .freezeFrameVehicleSpeed, .freezeFrameIntakeAirTemperature, .freezeFrameThrottlePosition, .freezeFrameEngineRuntime, .freezeFrameControlModuleVoltage: return "read_freeze_frame"
        case .mode09SupportedInfoTypes, .mode09CalibrationID, .mode09CalibrationVerificationNumber, .mode09EcuName: return "read_ecu_info"
        case .supportedPIDs, .supportedPIDs20, .supportedPIDs40, .supportedPIDs60, .supportedPIDs80, .supportedPIDsA0: return "read_supported_pids"
        case .odometer: return "read_live_pid_snapshot"
        case .readinessStatus, .calculatedLoad, .shortTermFuelTrimBank1, .longTermFuelTrimBank1, .fuelPressure, .manifoldAbsolutePressure, .engineRPM, .vehicleSpeed, .timingAdvance, .coolantTemperature, .intakeAirTemperature, .massAirFlow, .throttlePosition, .oxygenSensorB1S1, .oxygenSensorB1S2, .oxygenSensorB1S3, .oxygenSensorB1S4, .oxygenSensorB2S1, .oxygenSensorB2S2, .oxygenSensorB2S3, .oxygenSensorB2S4, .wideOxygenVoltageB1S1, .wideOxygenVoltageB1S2, .wideOxygenVoltageB1S3, .wideOxygenVoltageB1S4, .wideOxygenVoltageB2S1, .wideOxygenVoltageB2S2, .wideOxygenVoltageB2S3, .wideOxygenVoltageB2S4, .engineRuntime, .distanceWithMIL, .fuelRailPressureVacuum, .fuelRailPressure, .commandedEGR, .egrError, .commandedEvapPurge, .fuelLevel, .warmupsSinceClear, .distanceSinceClear, .evapVaporPressure, .barometricPressure, .wideOxygenCurrentB1S1, .wideOxygenCurrentB1S2, .wideOxygenCurrentB2S1, .wideOxygenCurrentB2S2, .catalystTemperatureB1S1, .catalystTemperatureB1S2, .catalystTemperatureB2S1, .catalystTemperatureB2S2, .commandedThrottleActuator, .controlModuleVoltage, .absoluteLoad, .commandedEquivalenceRatio, .relativeThrottlePosition, .ambientAirTemperature, .absoluteThrottlePositionB, .absoluteThrottlePositionC, .acceleratorPositionD, .acceleratorPositionE, .acceleratorPositionF, .timeWithMIL, .timeSinceClear, .ethanolPercentage, .fuelRailPressureAbsolute, .relativeAcceleratorPosition, .hybridBatteryRemaining, .engineOilTemperature, .fuelInjectionTiming, .engineFuelRate, .driverDemandTorque, .actualEngineTorque, .engineReferenceTorque, .enginePercentTorqueData, .commandedEGRAndError: return "read_live_pid_snapshot"
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
        case .freezeFrameCapabilities, .freezeFrameTriggerDTC, .freezeFrameCalculatedLoad, .freezeFrameShortTermFuelTrimBank1, .freezeFrameLongTermFuelTrimBank1, .freezeFrameFuelPressure, .freezeFrameManifoldAbsolutePressure, .freezeFrameCoolantTemperature, .freezeFrameEngineRPM, .freezeFrameVehicleSpeed, .freezeFrameIntakeAirTemperature, .freezeFrameThrottlePosition, .freezeFrameEngineRuntime, .freezeFrameControlModuleVoltage: return "freeze_frame_snapshot"
        case .mode09SupportedInfoTypes, .mode09CalibrationID, .mode09CalibrationVerificationNumber, .mode09EcuName: return "ecu_info_snapshot"
        case .odometer: return "live_pid_snapshot"
        case .calculatedLoad, .shortTermFuelTrimBank1, .longTermFuelTrimBank1, .fuelPressure, .manifoldAbsolutePressure, .engineRPM, .vehicleSpeed, .timingAdvance, .coolantTemperature, .intakeAirTemperature, .massAirFlow, .throttlePosition, .oxygenSensorB1S1, .oxygenSensorB1S2, .oxygenSensorB1S3, .oxygenSensorB1S4, .oxygenSensorB2S1, .oxygenSensorB2S2, .oxygenSensorB2S3, .oxygenSensorB2S4, .wideOxygenVoltageB1S1, .wideOxygenVoltageB1S2, .wideOxygenVoltageB1S3, .wideOxygenVoltageB1S4, .wideOxygenVoltageB2S1, .wideOxygenVoltageB2S2, .wideOxygenVoltageB2S3, .wideOxygenVoltageB2S4, .engineRuntime, .distanceWithMIL, .fuelRailPressureVacuum, .fuelRailPressure, .commandedEGR, .egrError, .commandedEvapPurge, .fuelLevel, .warmupsSinceClear, .distanceSinceClear, .evapVaporPressure, .barometricPressure, .wideOxygenCurrentB1S1, .wideOxygenCurrentB1S2, .wideOxygenCurrentB2S1, .wideOxygenCurrentB2S2, .catalystTemperatureB1S1, .catalystTemperatureB1S2, .catalystTemperatureB2S1, .catalystTemperatureB2S2, .commandedThrottleActuator, .controlModuleVoltage, .absoluteLoad, .commandedEquivalenceRatio, .relativeThrottlePosition, .ambientAirTemperature, .absoluteThrottlePositionB, .absoluteThrottlePositionC, .acceleratorPositionD, .acceleratorPositionE, .acceleratorPositionF, .timeWithMIL, .timeSinceClear, .ethanolPercentage, .fuelRailPressureAbsolute, .relativeAcceleratorPosition, .hybridBatteryRemaining, .engineOilTemperature, .fuelInjectionTiming, .engineFuelRate, .driverDemandTorque, .actualEngineTorque, .engineReferenceTorque, .enginePercentTorqueData, .commandedEGRAndError: return "live_pid_snapshot"
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
        case .pendingDTC, .permanentDTC, .freezeFrameCapabilities, .freezeFrameTriggerDTC, .freezeFrameCalculatedLoad, .freezeFrameShortTermFuelTrimBank1, .freezeFrameLongTermFuelTrimBank1, .freezeFrameFuelPressure, .freezeFrameManifoldAbsolutePressure, .freezeFrameCoolantTemperature, .freezeFrameEngineRPM, .freezeFrameVehicleSpeed, .freezeFrameIntakeAirTemperature, .freezeFrameThrottlePosition, .freezeFrameEngineRuntime, .freezeFrameControlModuleVoltage, .mode09SupportedInfoTypes, .mode09CalibrationID, .mode09CalibrationVerificationNumber, .mode09EcuName, .readinessStatus: return 8
        default: return 4
        }
    }

    public var freezeFramePID: String? {
        switch self {
        case .freezeFrameTriggerDTC: return "02"
        case .freezeFrameCalculatedLoad: return "04"
        case .freezeFrameShortTermFuelTrimBank1: return "06"
        case .freezeFrameLongTermFuelTrimBank1: return "07"
        case .freezeFrameFuelPressure: return "0A"
        case .freezeFrameManifoldAbsolutePressure: return "0B"
        case .freezeFrameCoolantTemperature: return "05"
        case .freezeFrameEngineRPM: return "0C"
        case .freezeFrameVehicleSpeed: return "0D"
        case .freezeFrameIntakeAirTemperature: return "0F"
        case .freezeFrameThrottlePosition: return "11"
        case .freezeFrameEngineRuntime: return "1F"
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
        case .fuelPressure: return "0A"
        case .manifoldAbsolutePressure: return "0B"
        case .engineRPM: return "0C"
        case .vehicleSpeed: return "0D"
        case .timingAdvance: return "0E"
        case .intakeAirTemperature: return "0F"
        case .massAirFlow: return "10"
        case .throttlePosition: return "11"
        case .oxygenSensorB1S1: return "14"
        case .oxygenSensorB1S2: return "15"
        case .oxygenSensorB1S3: return "16"
        case .oxygenSensorB1S4: return "17"
        case .oxygenSensorB2S1: return "18"
        case .oxygenSensorB2S2: return "19"
        case .oxygenSensorB2S3: return "1A"
        case .oxygenSensorB2S4: return "1B"
        case .wideOxygenVoltageB1S1: return "24"
        case .wideOxygenVoltageB1S2: return "25"
        case .wideOxygenVoltageB1S3: return "26"
        case .wideOxygenVoltageB1S4: return "27"
        case .wideOxygenVoltageB2S1: return "28"
        case .wideOxygenVoltageB2S2: return "29"
        case .wideOxygenVoltageB2S3: return "2A"
        case .wideOxygenVoltageB2S4: return "2B"
        case .engineRuntime: return "1F"
        case .distanceWithMIL: return "21"
        case .fuelRailPressureVacuum: return "22"
        case .fuelRailPressure: return "23"
        case .commandedEGR: return "2C"
        case .egrError: return "2D"
        case .commandedEvapPurge: return "2E"
        case .fuelLevel: return "2F"
        case .warmupsSinceClear: return "30"
        case .distanceSinceClear: return "31"
        case .evapVaporPressure: return "32"
        case .barometricPressure: return "33"
        case .wideOxygenCurrentB1S1: return "34"
        case .wideOxygenCurrentB1S2: return "35"
        case .wideOxygenCurrentB2S1: return "38"
        case .wideOxygenCurrentB2S2: return "39"
        case .catalystTemperatureB1S1: return "3C"
        case .catalystTemperatureB1S2: return "3D"
        case .catalystTemperatureB2S1: return "3E"
        case .catalystTemperatureB2S2: return "3F"
        case .commandedThrottleActuator: return "4C"
        case .controlModuleVoltage: return "42"
        case .absoluteLoad: return "43"
        case .commandedEquivalenceRatio: return "44"
        case .relativeThrottlePosition: return "45"
        case .ambientAirTemperature: return "46"
        case .absoluteThrottlePositionB: return "47"
        case .absoluteThrottlePositionC: return "48"
        case .acceleratorPositionD: return "49"
        case .acceleratorPositionE: return "4A"
        case .acceleratorPositionF: return "4B"
        case .timeWithMIL: return "4D"
        case .timeSinceClear: return "4E"
        case .ethanolPercentage: return "52"
        case .fuelRailPressureAbsolute: return "59"
        case .relativeAcceleratorPosition: return "5A"
        case .hybridBatteryRemaining: return "5B"
        case .engineOilTemperature: return "5C"
        case .fuelInjectionTiming: return "5D"
        case .engineFuelRate: return "5E"
        case .driverDemandTorque: return "61"
        case .actualEngineTorque: return "62"
        case .engineReferenceTorque: return "63"
        case .enginePercentTorqueData: return "64"
        case .commandedEGRAndError: return "69"
        case .odometer: return "A6"
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
