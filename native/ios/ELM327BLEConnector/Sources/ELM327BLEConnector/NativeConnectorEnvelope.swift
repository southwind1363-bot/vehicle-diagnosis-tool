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
    public let readoutID: String?
    public let readoutScopeID: String?
    public let readoutAttempt: Int?
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
        case readoutID = "readout_id"
        case readoutScopeID = "readout_scope_id"
        case readoutAttempt = "readout_attempt"
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
        scopeID: String?,
        pageBase: String,
        pids: [String]
    ) -> NativeConnectorEnvelope {
        make(context: context, sequence: sequence, intent: "read_supported_pids", data: [
            "supported_pids": .array(pids.map(NativeConnectorJSONValue.string)),
            "supported_pid_page_bases": .array([.string(pageBase)]),
            "source_ecu": scopeID.map { .string($0) } ?? .null
        ], readoutScopeID: scopeID, readoutAttempt: 0)
    }

    public static func livePID(
        context: NativeConnectorSessionContext,
        sequence: Int,
        scopeID: String?,
        value: OBD2MonitorValue
    ) -> NativeConnectorEnvelope {
        make(context: context, sequence: sequence, intent: "read_live_pid_snapshot", data: [
            "readout_id": .string("live_pid_snapshot"),
            "monitor_values": .array([.object([
                "id": .string(value.id),
                "pid": .string(value.pid),
                "value": .number(value.value),
                "unit": .string(value.unit),
                "source_ecu": scopeID.map { .string($0) } ?? .null
            ])])
        ], readoutID: "live_pid_snapshot", readoutScopeID: scopeID, readoutAttempt: 0)
    }

    public static func dtcs(
        context: NativeConnectorSessionContext,
        sequence: Int,
        intent: String,
        scopeID: String?,
        dtcs: [OBD2DTC]
    ) -> NativeConnectorEnvelope {
        make(
            context: context,
            sequence: sequence,
            intent: intent,
            data: [
                "dtcs": .array(dtcs.map { .object(["code": .string($0.code), "status": .string($0.status)]) }),
                "source_ecu": scopeID.map { .string($0) } ?? .null
            ],
            readoutScopeID: scopeID,
            readoutAttempt: 0
        )
    }

    public static func readiness(
        context: NativeConnectorSessionContext,
        sequence: Int,
        scopeID: String?,
        status: OBD2ReadinessStatus
    ) -> NativeConnectorEnvelope {
        make(
            context: context,
            sequence: sequence,
            intent: "read_live_pid_snapshot",
            data: [
                "readout_id": .string("readiness_snapshot"),
                "pid": .string("01"),
                "source_ecu": scopeID.map { .string($0) } ?? .null,
                "mil_on": .bool(status.milOn),
                "dtc_count": .number(Double(status.dtcCount)),
                "readiness_status_byte_a": .number(Double(status.statusByteA)),
                "readiness_status_byte_b": .number(Double(status.statusByteB)),
                "readiness_status_byte_c": .number(Double(status.statusByteC)),
                "readiness_status_byte_d": .number(Double(status.statusByteD)),
                "readiness_ignition_type": .string(status.ignitionType),
                "monitors": .array([])
            ],
            readoutID: "readiness_snapshot",
            readoutScopeID: scopeID,
            readoutAttempt: 0
        )
    }

    public static func freezeFrameTriggerDTC(context: NativeConnectorSessionContext, sequence: Int, scopeID: String?, code: String?) -> NativeConnectorEnvelope {
        make(context: context, sequence: sequence, intent: "read_freeze_frame", data: [
            "trigger_dtc": code.map { .string($0) } ?? .null,
            "trigger_dtc_entries": .array(code.map { [.object(["code": .string($0)])] } ?? []),
            "values": .array([]),
            "freeze_frame_readout_status": .string("reported")
        ], readoutID: "freeze_frame_snapshot", readoutScopeID: scopeID, readoutAttempt: 0)
    }

    public static func freezeFrameValue(context: NativeConnectorSessionContext, sequence: Int, scopeID: String?, value: OBD2MonitorValue) -> NativeConnectorEnvelope {
        make(context: context, sequence: sequence, intent: "read_freeze_frame", data: [
            "values": .array([.object(["id": .string(value.id), "pid": .string(value.pid), "value": .number(value.value), "unit": .string(value.unit), "freeze_frame_number": .number(0)])]),
            "freeze_frame_readout_status": .string("reported")
        ], readoutID: "freeze_frame_snapshot", readoutScopeID: scopeID, readoutAttempt: 0)
    }

    public static func ecuInfo(context: NativeConnectorSessionContext, sequence: Int, scopeID: String?, id: String, infoType: String, value: String) -> NativeConnectorEnvelope {
        make(context: context, sequence: sequence, intent: "read_ecu_info", data: [
            "items": .array([.object(["id": .string(id), "service": .string("09"), "info_type": .string(infoType), "value": .string(value), "source_ecu": scopeID.map { .string($0) } ?? .null])]),
            "ecu_info_readout_status": .string("reported")
        ], readoutID: "ecu_info_snapshot", readoutScopeID: scopeID, readoutAttempt: 0)
    }

    public static func failedReadout(
        context: NativeConnectorSessionContext,
        sequence: Int,
        command: ELMReadCommand,
        error: String
    ) -> NativeConnectorEnvelope {
        var data: [String: NativeConnectorJSONValue] = command.intent == "read_supported_pids"
            ? ["supported_pids": .array([])]
            : command.intent == "read_live_pid_snapshot"
                ? ["monitor_values": .array([])]
                : ["adapter_family": .string("ELM327")]
        if let readoutID = command.readoutID { data["readout_id"] = .string(readoutID) }
        return make(context: context, sequence: sequence, intent: command.intent, data: data, ok: false, errors: [error], readoutID: command.readoutID, readoutAttempt: command.readoutID == nil ? nil : 0)
    }

    private static func make(
        context: NativeConnectorSessionContext,
        sequence: Int,
        intent: String,
        data: [String: NativeConnectorJSONValue],
        ok: Bool = true,
        errors: [String] = [],
        readoutID: String? = nil,
        readoutScopeID: String? = nil,
        readoutAttempt: Int? = nil
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
            readoutID: readoutID,
            readoutScopeID: readoutScopeID,
            readoutAttempt: readoutAttempt,
            ok: ok,
            blocked: false,
            wouldTransmit: false,
            errors: errors,
            data: data
        )
    }
}
