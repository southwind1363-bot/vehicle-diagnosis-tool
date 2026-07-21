import Foundation

public enum NativeConnectorScanState: String, Codable, Sendable, Equatable {
    case completed
    case interrupted
}

public struct NativeConnectorReadoutScope: Codable, Sendable, Equatable {
    public let readoutID: String
    public let scopeID: String

    enum CodingKeys: String, CodingKey {
        case readoutID = "readout_id"
        case scopeID = "scope_id"
    }
}

public struct NativeConnectorConnectionSegment: Codable, Sendable, Equatable {
    public let connectionID: UUID
    public let connectionSequence: Int
    public let firstSequence: Int?
    public let lastSequence: Int?
    public let envelopeCount: Int

    enum CodingKeys: String, CodingKey {
        case connectionID = "connection_id"
        case connectionSequence = "connection_sequence"
        case firstSequence = "first_sequence"
        case lastSequence = "last_sequence"
        case envelopeCount = "envelope_count"
    }
}

public struct NativeConnectorInterruption: Codable, Sendable, Equatable {
    public let code: String
    public let connectionID: UUID?
    public let sequence: Int?

    enum CodingKeys: String, CodingKey {
        case code
        case connectionID = "connection_id"
        case sequence
    }
}

public struct NativeConnectorCompletionManifest: Codable, Sendable, Equatable {
    public let schemaVersion: String
    public let recordType: String
    public let platform: String
    public let interfaceID: String
    public let scanID: UUID
    public let vehicleContextID: UUID
    public let capturedAt: String
    public let scanState: NativeConnectorScanState
    public let expectedIntents: [String]
    public let expectedReadouts: [String]
    public let expectedReadoutScopes: [NativeConnectorReadoutScope]
    public let connectionSegments: [NativeConnectorConnectionSegment]
    public let interruption: NativeConnectorInterruption?
    public let readOnly: Bool
    public let vehicleCommandEnabled: Bool
    public let executionEnabled: Bool
    public let wouldTransmit: Bool
    public let retainedRawPayload: Bool

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version"
        case recordType = "record_type"
        case platform
        case interfaceID = "interface_id"
        case scanID = "scan_id"
        case vehicleContextID = "vehicle_context_id"
        case capturedAt = "captured_at"
        case scanState = "scan_state"
        case expectedIntents = "expected_intents"
        case expectedReadouts = "expected_readouts"
        case expectedReadoutScopes = "expected_readout_scopes"
        case connectionSegments = "connection_segments"
        case interruption
        case readOnly = "read_only"
        case vehicleCommandEnabled = "vehicle_command_enabled"
        case executionEnabled = "execution_enabled"
        case wouldTransmit = "would_transmit"
        case retainedRawPayload = "retained_raw_payload"
    }
}
