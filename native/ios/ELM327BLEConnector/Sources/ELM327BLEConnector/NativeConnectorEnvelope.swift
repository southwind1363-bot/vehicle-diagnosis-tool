import Foundation

public enum NativeConnectorJSONValue: Codable, Sendable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case array([NativeConnectorJSONValue])
    case object([String: NativeConnectorJSONValue])
    case null

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if try container.decodeNil() { self = .null }
        else if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else if let value = try? container.decode(Double.self) { self = .number(value) }
        else if let value = try? container.decode(String.self) { self = .string(value) }
        else if let value = try? container.decode([NativeConnectorJSONValue].self) { self = .array(value) }
        else { self = .object(try container.decode([String: NativeConnectorJSONValue].self)) }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}

public struct NativeConnectorSessionContext: Sendable, Equatable {
    public let scanID: UUID
    public let connectionID: UUID
    public let vehicleContextID: UUID

    public init(scanID: UUID = UUID(), connectionID: UUID = UUID(), vehicleContextID: UUID = UUID()) {
        self.scanID = scanID
        self.connectionID = connectionID
        self.vehicleContextID = vehicleContextID
    }
}

public struct NativeConnectorEnvelope: Codable, Sendable, Equatable {
    public let schemaVersion: String
    public let interfaceID: String
    public let platform: String
    public let intent: String
    public let capturedAt: String
    public let scanID: UUID
    public let connectionID: UUID
    public let vehicleContextID: UUID
    public let sequence: Int
    public let ok: Bool
    public let blocked: Bool
    public let wouldTransmit: Bool
    public let errors: [String]
    public let data: [String: NativeConnectorJSONValue]

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version"
        case interfaceID = "interface_id"
        case platform, intent
        case capturedAt = "captured_at"
        case scanID = "scan_id"
        case connectionID = "connection_id"
        case vehicleContextID = "vehicle_context_id"
        case sequence, ok, blocked
        case wouldTransmit = "would_transmit"
        case errors, data
    }
}

public enum NativeConnectorEnvelopeFactory {
    private static let timestampFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    public static func adapterIdentity(
        context: NativeConnectorSessionContext,
        sequence: Int,
        adapterName: String?,
        protocolHint: String?
    ) -> NativeConnectorEnvelope {
        let safeName = adapterName?.trimmingCharacters(in: .whitespacesAndNewlines).prefix(80)
        let safeProtocol = protocolHint?.trimmingCharacters(in: .whitespacesAndNewlines).prefix(80)
        var data: [String: NativeConnectorJSONValue] = [
            "adapter_family": .string("ELM327"),
            "vehicle_command_enabled": .bool(false)
        ]
        if let safeName, !safeName.isEmpty { data["adapter_name"] = .string(String(safeName)) }
        if let safeProtocol, !safeProtocol.isEmpty { data["adapter_protocol_hint"] = .string(String(safeProtocol)) }
        return make(context: context, sequence: sequence, intent: "adapter_identity", data: data)
    }

    public static func supportedPIDs(
        context: NativeConnectorSessionContext,
        sequence: Int,
        pids: [String]
    ) -> NativeConnectorEnvelope {
        make(context: context, sequence: sequence, intent: "read_supported_pids", data: [
            "supported_pids": .array(pids.map(NativeConnectorJSONValue.string))
        ])
    }

    public static func livePID(
        context: NativeConnectorSessionContext,
        sequence: Int,
        value: OBD2MonitorValue
    ) -> NativeConnectorEnvelope {
        make(context: context, sequence: sequence, intent: "read_live_pid_snapshot", data: [
            "monitor_values": .array([.object([
                "id": .string(value.id),
                "pid": .string(value.pid),
                "value": .number(value.value),
                "unit": .string(value.unit)
            ])])
        ])
    }

    public static func failedReadout(
        context: NativeConnectorSessionContext,
        sequence: Int,
        command: ELMReadCommand,
        error: String
    ) -> NativeConnectorEnvelope {
        let data: [String: NativeConnectorJSONValue] = command.intent == "read_supported_pids"
            ? ["supported_pids": .array([])]
            : command.intent == "read_live_pid_snapshot"
                ? ["monitor_values": .array([])]
                : ["adapter_family": .string("ELM327")]
        return make(context: context, sequence: sequence, intent: command.intent, data: data, ok: false, errors: [error])
    }

    private static func make(
        context: NativeConnectorSessionContext,
        sequence: Int,
        intent: String,
        data: [String: NativeConnectorJSONValue],
        ok: Bool = true,
        errors: [String] = []
    ) -> NativeConnectorEnvelope {
        NativeConnectorEnvelope(
            schemaVersion: "native_connector_contract_v1",
            interfaceID: "user-vci-elm327",
            platform: "ios",
            intent: intent,
            capturedAt: timestampFormatter.string(from: Date()),
            scanID: context.scanID,
            connectionID: context.connectionID,
            vehicleContextID: context.vehicleContextID,
            sequence: sequence,
            ok: ok,
            blocked: false,
            wouldTransmit: false,
            errors: errors,
            data: data
        )
    }
}
