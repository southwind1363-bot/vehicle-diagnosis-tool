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

public struct OBD2ReadinessMonitor: Equatable, Sendable {
    public let id: String
    public let supported: Bool
    public let complete: Bool
}

public struct OBD2OnboardMonitorTest: Equatable, Sendable {
    public let testID: String
    public let componentID: String
    public let value: Int
    public let minimum: Int
    public let maximum: Int
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

    public static func decodeOnboardMonitorTests(response: String) -> Result<[(scopeID: String?, tests: [OBD2OnboardMonitorTest])], OBD2ReadoutDecodeFailure> {
        packets(in: response).flatMap { packets in
            var decoded: [(scopeID: String?, tests: [OBD2OnboardMonitorTest])] = []
            for packet in packets {
                let payload = packet.payload
                guard payload.count >= 9, payload.count.isMultiple(of: 9) else {
                    return payload.first == 0x7F ? .failure(.negativeResponse) : .failure(.malformedResponse)
                }
                var tests: [OBD2OnboardMonitorTest] = []
                for index in stride(from: 0, to: payload.count, by: 9) {
                    guard payload[index] == 0x46 else { return .failure(.malformedResponse) }
                    tests.append(OBD2OnboardMonitorTest(
                        testID: String(format: "%02X", payload[index + 1]),
                        componentID: String(format: "%02X", payload[index + 2]),
                        value: Int(payload[index + 3]) * 256 + Int(payload[index + 4]),
                        minimum: Int(payload[index + 5]) * 256 + Int(payload[index + 6]),
                        maximum: Int(payload[index + 7]) * 256 + Int(payload[index + 8])
                    ))
                }
                decoded.append((packet.scopeID, tests))
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

    public static func readinessMonitors(for status: OBD2ReadinessStatus) -> [OBD2ReadinessMonitor] {
        let b = status.statusByteB
        let c = status.statusByteC
        let d = status.statusByteD
        let monitorBits: [(id: String, supportedByte: Int, supportedBit: Int, incompleteByte: Int, incompleteBit: Int)] = status.ignitionType == "compression"
            ? [
                ("misfire", b, 0x01, b, 0x10),
                ("fuel_system", b, 0x02, b, 0x20),
                ("comprehensive_component", b, 0x04, b, 0x40),
                ("nmhc_catalyst", c, 0x01, d, 0x01),
                ("nox_scr", c, 0x02, d, 0x02),
                ("boost_pressure", c, 0x08, d, 0x08),
                ("exhaust_gas_sensor", c, 0x20, d, 0x20),
                ("pm_filter", c, 0x40, d, 0x40),
                ("egr_vvt", c, 0x80, d, 0x80)
            ]
            : [
                ("misfire", b, 0x01, b, 0x10),
                ("fuel_system", b, 0x02, b, 0x20),
                ("comprehensive_component", b, 0x04, b, 0x40),
                ("catalyst", c, 0x01, d, 0x01),
                ("heated_catalyst", c, 0x02, d, 0x02),
                ("evaporative_system", c, 0x04, d, 0x04),
                ("secondary_air", c, 0x08, d, 0x08),
                ("ac_refrigerant", c, 0x10, d, 0x10),
                ("oxygen_sensor", c, 0x20, d, 0x20),
                ("oxygen_sensor_heater", c, 0x40, d, 0x40),
                ("egr_vvt", c, 0x80, d, 0x80)
            ]
        return monitorBits.map { monitor in
            let supported = (monitor.supportedByte & monitor.supportedBit) != 0
            return OBD2ReadinessMonitor(
                id: monitor.id,
                supported: supported,
                complete: supported && (monitor.incompleteByte & monitor.incompleteBit) == 0
            )
        }
    }

    public static func decodeSupportedPIDs(command: ELMReadCommand = .supportedPIDs, response: String) -> Result<[(scopeID: String?, pids: [String])], OBD2ReadoutDecodeFailure> {
        guard let pageBase = command.supportedPIDPageBase, let pageBaseByte = UInt8(pageBase, radix: 16) else { return .failure(.malformedResponse) }
        packets(in: response).flatMap { packets in
            var decoded: [(scopeID: String?, pids: [String])] = []
            for packet in packets {
                let payload = packet.payload
                guard payload.count == 6, payload[0] == 0x41, payload[1] == pageBaseByte else {
                    return payload.first == 0x7F ? .failure(.negativeResponse) : .failure(.malformedResponse)
                }
                decoded.append((scopeID: packet.scopeID, pids: supportedPIDs(from: Array(payload.dropFirst(2)), pageBase: Int(pageBaseByte))))
            }
            return .success(decoded)
        }
    }

    public static func decodeLivePID(command: ELMReadCommand, response: String) -> Result<[(scopeID: String?, value: OBD2MonitorValue)], OBD2ReadoutDecodeFailure> {
        guard let expectedPID = command.livePID, let expectedPIDByte = UInt8(expectedPID, radix: 16) else { return .failure(.malformedResponse) }
        return packets(in: response).flatMap { packets in
            var decoded: [(scopeID: String?, value: OBD2MonitorValue)] = []
            for packet in packets {
                let payload = packet.payload
                guard payload.count >= 3, payload[0] == 0x41, payload[1] == expectedPIDByte else {
                    return payload.first == 0x7F ? .failure(.negativeResponse) : .failure(.malformedResponse)
                }
                let bytes = Array(payload.dropFirst(2))
                let values = oxygenSensorValues(command: command, bytes: bytes)
                    ?? wideOxygenVoltageValues(command: command, bytes: bytes)
                    ?? wideOxygenCurrentValues(command: command, bytes: bytes)
                    ?? livePIDValue(command: command, bytes: bytes).map { [$0] }
                guard let values else {
                    return .failure(.malformedResponse)
                }
                decoded.append(contentsOf: values.map { (scopeID: packet.scopeID, value: $0) })
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
        freezeFrameSupportedPIDs(response: response).contains("02")
    }

    public static func freezeFrameSupportedPIDs(response: String) -> Set<String> {
        guard case .success(let packets) = packets(in: response) else { return [] }
        return Set(packets.flatMap { packet in
            guard packet.payload.count == 6, packet.payload[0] == 0x42, packet.payload[1] == 0x00 else { return [] }
            return packet.payload.dropFirst(2).enumerated().flatMap { byteIndex, byte in
                (0..<8).compactMap { bitIndex in
                    byte & UInt8(1 << (7 - bitIndex)) == 0 ? nil : String(format: "%02X", byteIndex * 8 + bitIndex + 1)
                }
            }
        }
    }

    public static func decodeFreezeFrameValue(command: ELMReadCommand, response: String) -> Result<[(scopeID: String?, value: OBD2MonitorValue)], OBD2ReadoutDecodeFailure> {
        guard let pid = command.freezeFramePID, pid != "02", let expectedPID = UInt8(pid, radix: 16) else { return .failure(.malformedResponse) }
        return packets(in: response).flatMap { packets in
            var values: [(scopeID: String?, value: OBD2MonitorValue)] = []
            for packet in packets {
                let payload = packet.payload
                guard payload.count >= 4, payload[0] == 0x42, payload[1] == expectedPID, payload[2] == 0x00 else {
                    return payload.first == 0x7F ? .failure(.negativeResponse) : .failure(.malformedResponse)
                }
                let bytes = Array(payload.dropFirst(3))
                let value: OBD2MonitorValue?
                switch command {
                case .freezeFrameCalculatedLoad: value = bytes.count == 1 ? OBD2MonitorValue(id: "calculated_load", pid: pid, value: Double(bytes[0]) * 100 / 255, unit: "%") : nil
                case .freezeFrameShortTermFuelTrimBank1: value = bytes.count == 1 ? OBD2MonitorValue(id: "stft_b1", pid: pid, value: Double(Int(bytes[0]) - 128) * 100 / 128, unit: "%") : nil
                case .freezeFrameLongTermFuelTrimBank1: value = bytes.count == 1 ? OBD2MonitorValue(id: "ltft_b1", pid: pid, value: Double(Int(bytes[0]) - 128) * 100 / 128, unit: "%") : nil
                case .freezeFrameFuelPressure: value = bytes.count == 1 ? OBD2MonitorValue(id: "fuel_pressure", pid: pid, value: Double(bytes[0]) * 3, unit: "kPa") : nil
                case .freezeFrameManifoldAbsolutePressure: value = bytes.count == 1 ? OBD2MonitorValue(id: "map", pid: pid, value: Double(bytes[0]), unit: "kPa") : nil
                case .freezeFrameCoolantTemperature: value = bytes.count == 1 ? OBD2MonitorValue(id: "coolant_temp", pid: pid, value: Double(Int(bytes[0]) - 40), unit: "C") : nil
                case .freezeFrameEngineRPM: value = bytes.count == 2 ? OBD2MonitorValue(id: "engine_speed", pid: pid, value: Double(Int(bytes[0]) * 256 + Int(bytes[1])) / 4, unit: "rpm") : nil
                case .freezeFrameVehicleSpeed: value = bytes.count == 1 ? OBD2MonitorValue(id: "vehicle_speed", pid: pid, value: Double(bytes[0]), unit: "km/h") : nil
                case .freezeFrameIntakeAirTemperature: value = bytes.count == 1 ? OBD2MonitorValue(id: "intake_air_temp", pid: pid, value: Double(Int(bytes[0]) - 40), unit: "C") : nil
                case .freezeFrameThrottlePosition: value = bytes.count == 1 ? OBD2MonitorValue(id: "throttle_position", pid: pid, value: Double(bytes[0]) * 100 / 255, unit: "%") : nil
                case .freezeFrameEngineRuntime: value = bytes.count == 2 ? OBD2MonitorValue(id: "engine_runtime", pid: pid, value: Double(Int(bytes[0]) * 256 + Int(bytes[1])), unit: "s") : nil
                case .freezeFrameControlModuleVoltage: value = bytes.count == 2 ? OBD2MonitorValue(id: "control_module_voltage", pid: pid, value: Double(Int(bytes[0]) * 256 + Int(bytes[1])) / 1000, unit: "V") : nil
                default: value = nil
                }
                guard let value else { return .failure(.malformedResponse) }
                values.append((scopeID: packet.scopeID, value: value))
            }
            return .success(values)
        }
    }

    public static func decodeMode09SupportedInfoTypes(response: String) -> Result<[(scopeID: String?, bitmap: String, supportsCalibrationID: Bool, supportsCalibrationVerificationNumber: Bool, supportsEcuName: Bool)], OBD2ReadoutDecodeFailure> {
        packets(in: response).flatMap { packets in
            var decoded: [(scopeID: String?, bitmap: String, supportsCalibrationID: Bool, supportsCalibrationVerificationNumber: Bool, supportsEcuName: Bool)] = []
            for packet in packets {
                let payload = packet.payload
                guard payload.count == 6, payload[0] == 0x49, payload[1] == 0x00 else {
                    return payload.first == 0x7F ? .failure(.negativeResponse) : .failure(.malformedResponse)
                }
                decoded.append((
                    packet.scopeID,
                    payload.dropFirst(2).map { String(format: "%02X", $0) }.joined(),
                    (payload[2] & 0x10) != 0,
                    (payload[2] & 0x04) != 0,
                    (payload[3] & 0x40) != 0
                ))
            }
            return .success(decoded)
        }
    }

    public static func decodeMode09EcuNames(response: String, supportedScopeIDs: Set<String>) -> Result<[(scopeID: String?, name: String)], OBD2ReadoutDecodeFailure> {
        packets(in: response).flatMap { packets in
            var decoded: [(scopeID: String?, name: String)] = []
            for packet in packets {
                let scopeKey = packet.scopeID ?? "LEGACY"
                let payload = packet.payload
                guard supportedScopeIDs.contains(scopeKey), payload.count >= 4, payload[0] == 0x49, payload[1] == 0x0A else { continue }
                var textBytes = Array(payload.dropFirst(3))
                while textBytes.last == 0x00 || textBytes.last == 0x20 { textBytes.removeLast() }
                guard !textBytes.isEmpty, textBytes.allSatisfy({ $0 >= 0x20 && $0 <= 0x7E }), let name = String(bytes: textBytes, encoding: .ascii), name.count <= 80 else { return .failure(.malformedResponse) }
                decoded.append((packet.scopeID, name))
            }
            return decoded.isEmpty ? .failure(.malformedResponse) : .success(decoded)
        }
    }

    public static func decodeMode09CalibrationIDs(response: String, supportedScopeIDs: Set<String>) -> Result<[(scopeID: String?, calibrationID: String)], OBD2ReadoutDecodeFailure> {
        packets(in: response).flatMap { packets in
            var decoded: [(scopeID: String?, calibrationID: String)] = []
            for packet in packets {
                let scopeKey = packet.scopeID ?? "LEGACY"
                let payload = packet.payload
                guard supportedScopeIDs.contains(scopeKey), payload.count >= 4, payload[0] == 0x49, payload[1] == 0x04 else { continue }
                var textBytes = Array(payload.dropFirst(3))
                while textBytes.last == 0x00 || textBytes.last == 0x20 { textBytes.removeLast() }
                guard !textBytes.isEmpty, textBytes.allSatisfy({ $0 >= 0x20 && $0 <= 0x7E }), let calibrationID = String(bytes: textBytes, encoding: .ascii), calibrationID.count <= 80 else { return .failure(.malformedResponse) }
                decoded.append((packet.scopeID, calibrationID))
            }
            return decoded.isEmpty ? .failure(.malformedResponse) : .success(decoded)
        }
    }

    public static func decodeMode09CalibrationVerificationNumbers(response: String, supportedScopeIDs: Set<String>) -> Result<[(scopeID: String?, value: String)], OBD2ReadoutDecodeFailure> {
        packets(in: response).flatMap { packets in
            var decoded: [(scopeID: String?, value: String)] = []
            for packet in packets {
                let scopeKey = packet.scopeID ?? "LEGACY"
                let payload = packet.payload
                guard supportedScopeIDs.contains(scopeKey), payload.count >= 7, payload[0] == 0x49, payload[1] == 0x06 else { continue }
                let count = Int(payload[2])
                let valueBytes = Array(payload.dropFirst(3))
                guard count > 0, count <= 16, valueBytes.count == count * 4 else { return .failure(.malformedResponse) }
                for index in stride(from: 0, to: valueBytes.count, by: 4) {
                    decoded.append((packet.scopeID, valueBytes[index..<(index + 4)].map { String(format: "%02X", $0) }.joined()))
                }
            }
            return decoded.isEmpty ? .failure(.malformedResponse) : .success(decoded)
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
            guard frames.count == 1 else { return nil }
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

    private static func supportedPIDs(from bitmap: [UInt8], pageBase: Int) -> [String] {
        bitmap.enumerated().flatMap { byteIndex, byte in
            (0..<8).compactMap { bitIndex in
                byte & UInt8(1 << (7 - bitIndex)) == 0 ? nil : String(format: "%02X", pageBase + byteIndex * 8 + bitIndex + 1)
            }
        }
    }

    private static func livePIDValue(command: ELMReadCommand, bytes: [UInt8]) -> OBD2MonitorValue? {
        switch command {
        case .calculatedLoad:
            guard bytes.count == 1 else { return nil }
            return OBD2MonitorValue(id: "calculated_load", pid: "04", value: Double(bytes[0]) * 100 / 255, unit: "%")
        case .shortTermFuelTrimBank1:
            guard bytes.count == 1 else { return nil }
            return OBD2MonitorValue(id: "stft_b1", pid: "06", value: Double(Int(bytes[0]) - 128) * 100 / 128, unit: "%")
        case .longTermFuelTrimBank1:
            guard bytes.count == 1 else { return nil }
            return OBD2MonitorValue(id: "ltft_b1", pid: "07", value: Double(Int(bytes[0]) - 128) * 100 / 128, unit: "%")
        case .fuelPressure:
            guard bytes.count == 1 else { return nil }
            return OBD2MonitorValue(id: "fuel_pressure", pid: "0A", value: Double(bytes[0]) * 3, unit: "kPa")
        case .manifoldAbsolutePressure:
            guard bytes.count == 1 else { return nil }
            return OBD2MonitorValue(id: "map", pid: "0B", value: Double(bytes[0]), unit: "kPa")
        case .engineRPM:
            guard bytes.count == 2 else { return nil }
            return OBD2MonitorValue(id: "engine_speed", pid: "0C", value: Double(Int(bytes[0]) * 256 + Int(bytes[1])) / 4, unit: "rpm")
        case .vehicleSpeed:
            guard bytes.count == 1 else { return nil }
            return OBD2MonitorValue(id: "vehicle_speed", pid: "0D", value: Double(bytes[0]), unit: "km/h")
        case .timingAdvance:
            guard bytes.count == 1 else { return nil }
            return OBD2MonitorValue(id: "timing_advance", pid: "0E", value: Double(bytes[0]) / 2 - 64, unit: "deg")
        case .coolantTemperature:
            guard bytes.count == 1 else { return nil }
            return OBD2MonitorValue(id: "coolant_temp", pid: "05", value: Double(Int(bytes[0]) - 40), unit: "C")
        case .intakeAirTemperature:
            guard bytes.count == 1 else { return nil }
            return OBD2MonitorValue(id: "intake_air_temp", pid: "0F", value: Double(Int(bytes[0]) - 40), unit: "C")
        case .massAirFlow:
            guard bytes.count == 2 else { return nil }
            return OBD2MonitorValue(id: "maf", pid: "10", value: Double(Int(bytes[0]) * 256 + Int(bytes[1])) / 100, unit: "g/s")
        case .throttlePosition:
            guard bytes.count == 1 else { return nil }
            return OBD2MonitorValue(id: "throttle_position", pid: "11", value: Double(bytes[0]) * 100 / 255, unit: "%")
        case .engineRuntime:
            guard bytes.count == 2 else { return nil }
            return OBD2MonitorValue(id: "engine_runtime", pid: "1F", value: Double(Int(bytes[0]) * 256 + Int(bytes[1])), unit: "s")
        case .distanceWithMIL:
            guard bytes.count == 2 else { return nil }
            return OBD2MonitorValue(id: "distance_with_mil", pid: "21", value: Double(Int(bytes[0]) * 256 + Int(bytes[1])), unit: "km")
        case .fuelRailPressureVacuum:
            guard bytes.count == 2 else { return nil }
            return OBD2MonitorValue(id: "fuel_rail_pressure_vacuum", pid: "22", value: Double(Int(bytes[0]) * 256 + Int(bytes[1])) * 0.079, unit: "kPa")
        case .fuelRailPressure:
            guard bytes.count == 2 else { return nil }
            return OBD2MonitorValue(id: "fuel_rail_pressure", pid: "23", value: Double(Int(bytes[0]) * 256 + Int(bytes[1])) * 10, unit: "kPa")
        case .commandedEGR:
            guard bytes.count == 1 else { return nil }
            return OBD2MonitorValue(id: "commanded_egr", pid: "2C", value: Double(bytes[0]) * 100 / 255, unit: "%")
        case .egrError:
            guard bytes.count == 1 else { return nil }
            return OBD2MonitorValue(id: "egr_error", pid: "2D", value: Double(Int(bytes[0]) - 128) * 100 / 128, unit: "%")
        case .commandedEvapPurge:
            guard bytes.count == 1 else { return nil }
            return OBD2MonitorValue(id: "commanded_evap_purge", pid: "2E", value: Double(bytes[0]) * 100 / 255, unit: "%")
        case .fuelLevel:
            guard bytes.count == 1 else { return nil }
            return OBD2MonitorValue(id: "fuel_level", pid: "2F", value: Double(bytes[0]) * 100 / 255, unit: "%")
        case .warmupsSinceClear:
            guard bytes.count == 1 else { return nil }
            return OBD2MonitorValue(id: "warmups_since_clear", pid: "30", value: Double(bytes[0]), unit: "count")
        case .distanceSinceClear:
            guard bytes.count == 2 else { return nil }
            return OBD2MonitorValue(id: "distance_since_clear", pid: "31", value: Double(Int(bytes[0]) * 256 + Int(bytes[1])), unit: "km")
        case .barometricPressure:
            guard bytes.count == 1 else { return nil }
            return OBD2MonitorValue(id: "barometric_pressure", pid: "33", value: Double(bytes[0]), unit: "kPa")
        case .catalystTemperatureB1S1:
            guard bytes.count == 2 else { return nil }
            return OBD2MonitorValue(id: "catalyst_temp_b1s1", pid: "3C", value: Double(Int(bytes[0]) * 256 + Int(bytes[1])) / 10 - 40, unit: "C")
        case .catalystTemperatureB1S2:
            guard bytes.count == 2 else { return nil }
            return OBD2MonitorValue(id: "catalyst_temp_b1s2", pid: "3D", value: Double(Int(bytes[0]) * 256 + Int(bytes[1])) / 10 - 40, unit: "C")
        case .catalystTemperatureB2S1:
            guard bytes.count == 2 else { return nil }
            return OBD2MonitorValue(id: "catalyst_temp_b2s1", pid: "3E", value: Double(Int(bytes[0]) * 256 + Int(bytes[1])) / 10 - 40, unit: "C")
        case .catalystTemperatureB2S2:
            guard bytes.count == 2 else { return nil }
            return OBD2MonitorValue(id: "catalyst_temp_b2s2", pid: "3F", value: Double(Int(bytes[0]) * 256 + Int(bytes[1])) / 10 - 40, unit: "C")
        case .commandedThrottleActuator:
            guard bytes.count == 1 else { return nil }
            return OBD2MonitorValue(id: "commanded_throttle_actuator", pid: "4C", value: Double(bytes[0]) * 100 / 255, unit: "%")
        case .controlModuleVoltage:
            guard bytes.count == 2 else { return nil }
            return OBD2MonitorValue(id: "control_module_voltage", pid: "42", value: Double(Int(bytes[0]) * 256 + Int(bytes[1])) / 1000, unit: "V")
        case .absoluteLoad:
            guard bytes.count == 2 else { return nil }
            return OBD2MonitorValue(id: "absolute_load", pid: "43", value: Double(Int(bytes[0]) * 256 + Int(bytes[1])) * 100 / 255, unit: "%")
        case .commandedEquivalenceRatio:
            guard bytes.count == 2 else { return nil }
            return OBD2MonitorValue(id: "commanded_equivalence_ratio", pid: "44", value: Double(Int(bytes[0]) * 256 + Int(bytes[1])) / 32768, unit: "")
        case .relativeThrottlePosition:
            guard bytes.count == 1 else { return nil }
            return OBD2MonitorValue(id: "relative_throttle_position", pid: "45", value: Double(bytes[0]) * 100 / 255, unit: "%")
        case .ambientAirTemperature:
            guard bytes.count == 1 else { return nil }
            return OBD2MonitorValue(id: "ambient_air_temp", pid: "46", value: Double(Int(bytes[0]) - 40), unit: "C")
        case .timeWithMIL:
            guard bytes.count == 2 else { return nil }
            return OBD2MonitorValue(id: "time_with_mil", pid: "4D", value: Double(Int(bytes[0]) * 256 + Int(bytes[1])), unit: "min")
        case .timeSinceClear:
            guard bytes.count == 2 else { return nil }
            return OBD2MonitorValue(id: "time_since_clear", pid: "4E", value: Double(Int(bytes[0]) * 256 + Int(bytes[1])), unit: "min")
        case .ethanolPercentage:
            guard bytes.count == 1 else { return nil }
            return OBD2MonitorValue(id: "ethanol_percentage", pid: "52", value: Double(bytes[0]) * 100 / 255, unit: "%")
        case .hybridBatteryRemaining:
            guard bytes.count == 1 else { return nil }
            return OBD2MonitorValue(id: "hybrid_battery_remaining", pid: "5B", value: Double(bytes[0]) * 100 / 255, unit: "%")
        case .engineOilTemperature:
            guard bytes.count == 1 else { return nil }
            return OBD2MonitorValue(id: "engine_oil_temp", pid: "5C", value: Double(Int(bytes[0]) - 40), unit: "C")
        case .fuelInjectionTiming:
            guard bytes.count == 2 else { return nil }
            return OBD2MonitorValue(id: "fuel_injection_timing", pid: "5D", value: (Double(Int(bytes[0]) * 256 + Int(bytes[1])) - 26880) / 128, unit: "deg")
        case .engineFuelRate:
            guard bytes.count == 2 else { return nil }
            return OBD2MonitorValue(id: "engine_fuel_rate", pid: "5E", value: Double(Int(bytes[0]) * 256 + Int(bytes[1])) * 0.05, unit: "L/h")
        case .driverDemandTorque:
            guard bytes.count == 1 else { return nil }
            return OBD2MonitorValue(id: "driver_demand_torque", pid: "61", value: Double(Int(bytes[0]) - 125), unit: "%")
        case .actualEngineTorque:
            guard bytes.count == 1 else { return nil }
            return OBD2MonitorValue(id: "actual_engine_torque", pid: "62", value: Double(Int(bytes[0]) - 125), unit: "%")
        case .engineReferenceTorque:
            guard bytes.count == 2 else { return nil }
            return OBD2MonitorValue(id: "engine_reference_torque", pid: "63", value: Double(Int(bytes[0]) * 256 + Int(bytes[1])), unit: "Nm")
        default:
            return nil
        }
    }

    private static func oxygenSensorValues(command: ELMReadCommand, bytes: [UInt8]) -> [OBD2MonitorValue]? {
        let ids: (voltage: String, trim: String, pid: String)
        switch command {
        case .oxygenSensorB1S1: ids = ("o2_b1s1_voltage", "o2_b1s1_stft", "14")
        case .oxygenSensorB1S2: ids = ("o2_b1s2_voltage", "o2_b1s2_stft", "15")
        case .oxygenSensorB1S3: ids = ("o2_b1s3_voltage", "o2_b1s3_stft", "16")
        case .oxygenSensorB1S4: ids = ("o2_b1s4_voltage", "o2_b1s4_stft", "17")
        case .oxygenSensorB2S1: ids = ("o2_b2s1_voltage", "o2_b2s1_stft", "18")
        case .oxygenSensorB2S2: ids = ("o2_b2s2_voltage", "o2_b2s2_stft", "19")
        case .oxygenSensorB2S3: ids = ("o2_b2s3_voltage", "o2_b2s3_stft", "1A")
        case .oxygenSensorB2S4: ids = ("o2_b2s4_voltage", "o2_b2s4_stft", "1B")
        default: return nil
        }
        guard bytes.count == 2 else { return nil }
        return [
            OBD2MonitorValue(id: ids.voltage, pid: ids.pid, value: Double(bytes[0]) / 200, unit: "V"),
            OBD2MonitorValue(id: ids.trim, pid: ids.pid, value: Double(Int(bytes[1]) - 128) * 100 / 128, unit: "%")
        ]
    }

    private static func wideOxygenVoltageValues(command: ELMReadCommand, bytes: [UInt8]) -> [OBD2MonitorValue]? {
        let ids: (ratio: String, voltage: String, pid: String)
        switch command {
        case .wideOxygenVoltageB1S1: ids = ("wide_o2_b1s1_ratio", "wide_o2_b1s1_voltage_wide", "24")
        case .wideOxygenVoltageB1S2: ids = ("wide_o2_b1s2_ratio", "wide_o2_b1s2_voltage_wide", "25")
        case .wideOxygenVoltageB1S3: ids = ("wide_o2_b1s3_ratio", "wide_o2_b1s3_voltage_wide", "26")
        case .wideOxygenVoltageB1S4: ids = ("wide_o2_b1s4_ratio", "wide_o2_b1s4_voltage_wide", "27")
        case .wideOxygenVoltageB2S1: ids = ("wide_o2_b2s1_ratio", "wide_o2_b2s1_voltage_wide", "28")
        case .wideOxygenVoltageB2S2: ids = ("wide_o2_b2s2_ratio", "wide_o2_b2s2_voltage_wide", "29")
        case .wideOxygenVoltageB2S3: ids = ("wide_o2_b2s3_ratio", "wide_o2_b2s3_voltage_wide", "2A")
        case .wideOxygenVoltageB2S4: ids = ("wide_o2_b2s4_ratio", "wide_o2_b2s4_voltage_wide", "2B")
        default: return nil
        }
        guard bytes.count == 4 else { return nil }
        return [
            OBD2MonitorValue(id: ids.ratio, pid: ids.pid, value: Double(Int(bytes[0]) * 256 + Int(bytes[1])) / 32768, unit: ""),
            OBD2MonitorValue(id: ids.voltage, pid: ids.pid, value: Double(Int(bytes[2]) * 256 + Int(bytes[3])) / 8192, unit: "V")
        ]
    }

    private static func wideOxygenCurrentValues(command: ELMReadCommand, bytes: [UInt8]) -> [OBD2MonitorValue]? {
        let ids: (ratio: String, current: String, pid: String)
        switch command {
        case .wideOxygenCurrentB1S1: ids = ("wide_o2_b1s1_current_ratio", "wide_o2_b1s1_current", "34")
        case .wideOxygenCurrentB1S2: ids = ("wide_o2_b1s2_current_ratio", "wide_o2_b1s2_current", "35")
        case .wideOxygenCurrentB2S1: ids = ("wide_o2_b2s1_current_ratio", "wide_o2_b2s1_current", "38")
        case .wideOxygenCurrentB2S2: ids = ("wide_o2_b2s2_current_ratio", "wide_o2_b2s2_current", "39")
        default: return nil
        }
        guard bytes.count == 4 else { return nil }
        return [
            OBD2MonitorValue(id: ids.ratio, pid: ids.pid, value: Double(Int(bytes[0]) * 256 + Int(bytes[1])) / 32768, unit: ""),
            OBD2MonitorValue(id: ids.current, pid: ids.pid, value: Double(Int(bytes[2]) * 256 + Int(bytes[3])) / 256 - 128, unit: "mA")
        ]
    }
}
