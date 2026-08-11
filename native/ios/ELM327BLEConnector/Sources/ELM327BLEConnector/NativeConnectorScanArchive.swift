import Foundation

public enum NativeConnectorScanArchiveError: Error, Equatable, Sendable {
    case scanNotStarted
    case scanAlreadyCompleted
    case invalidEnvelope
    case unsafeEnvelope
    case mixedScanBoundary
    case invalidSequence
    case tooManyEnvelopes
    case invalidManifest
    case manifestBoundaryMismatch
}

public struct NativeConnectorScanArchive: Codable, Sendable, Equatable {
    public let envelopes: [NativeConnectorEnvelope]
    public let completionManifest: NativeConnectorCompletionManifest

    enum CodingKeys: String, CodingKey {
        case envelopes
        case completionManifest = "completion_manifest"
    }

    public init(envelopes: [NativeConnectorEnvelope], completionManifest: NativeConnectorCompletionManifest) {
        self.envelopes = envelopes
        self.completionManifest = completionManifest
    }
}

public final class NativeConnectorScanArchiveBuilder {
    // Multi-ECU replies can produce several scoped envelopes for one readout command.
    public static let maximumEnvelopeCount = 1_024

    private static let allowedIntents: Set<String> = [
        "adapter_identity",
        "read_stored_dtc",
        "read_pending_dtc",
        "read_permanent_dtc",
        "read_freeze_frame",
        "read_supported_pids",
        "read_ecu_info",
        "read_onboard_monitor",
        "read_live_pid_snapshot"
    ]

    private static let allowedReadoutIDs: Set<String> = [
        "adapter_identity",
        "stored_dtc_snapshot",
        "pending_dtc_snapshot",
        "permanent_dtc_snapshot",
        "freeze_frame_snapshot",
        "supported_pid_matrix",
        "ecu_info_snapshot",
        "onboard_monitor_snapshot",
        "readiness_snapshot",
        "live_pid_snapshot"
    ]

    private static let allowedReadoutIDsByIntent: [String: Set<String>] = [
        "adapter_identity": ["adapter_identity"],
        "read_stored_dtc": ["stored_dtc_snapshot"],
        "read_pending_dtc": ["pending_dtc_snapshot"],
        "read_permanent_dtc": ["permanent_dtc_snapshot"],
        "read_freeze_frame": ["freeze_frame_snapshot"],
        "read_supported_pids": ["supported_pid_matrix"],
        "read_ecu_info": ["ecu_info_snapshot"],
        "read_onboard_monitor": ["onboard_monitor_snapshot"],
        "read_live_pid_snapshot": ["readiness_snapshot", "live_pid_snapshot"]
    ]

    private static let sensitiveDataKeys: Set<String> = [
        "adapter_name",
        "adapter_serial",
        "adapter_serial_number",
        "serial",
        "serial_number",
        "mac",
        "mac_address",
        "bluetooth_address",
        "peripheral_id",
        "device_id",
        "vin",
        "vehicle_identification_number"
    ]

    private var envelopes: [NativeConnectorEnvelope] = []
    private var completionManifest: NativeConnectorCompletionManifest?

    public init() {}

    public func append(_ envelope: NativeConnectorEnvelope) throws {
        guard completionManifest == nil else { throw NativeConnectorScanArchiveError.scanAlreadyCompleted }
        guard envelopes.count < Self.maximumEnvelopeCount else { throw NativeConnectorScanArchiveError.tooManyEnvelopes }
        guard envelope.schemaVersion == "native_connector_contract_v1",
              envelope.platform == "ios",
              envelope.interfaceID == "user-vci-elm327",
              Self.allowedIntents.contains(envelope.intent),
              !envelope.blocked,
              !envelope.wouldTransmit,
              (!envelope.ok || envelope.errors.isEmpty),
              Self.hasExplicitVehicleCommandDisabled(in: envelope.data),
              Self.isEnvelopeReadoutConsistent(intent: envelope.intent, readoutID: envelope.readoutID),
              envelope.sequence >= 0
        else { throw NativeConnectorScanArchiveError.invalidEnvelope }
        guard Self.isSafe(data: envelope.data) else { throw NativeConnectorScanArchiveError.unsafeEnvelope }

        if let first = envelopes.first {
            guard envelope.scanID == first.scanID,
                  envelope.vehicleContextID == first.vehicleContextID,
                  envelope.interfaceID == first.interfaceID,
                  envelope.connectionID == first.connectionID
            else { throw NativeConnectorScanArchiveError.mixedScanBoundary }
            guard envelope.sequence == first.sequence + envelopes.count else { throw NativeConnectorScanArchiveError.invalidSequence }
        }
        envelopes.append(envelope)
    }

    public func complete(with manifest: NativeConnectorCompletionManifest) throws {
        guard completionManifest == nil else { throw NativeConnectorScanArchiveError.scanAlreadyCompleted }
        guard manifest.schemaVersion == "native_connector_completion_manifest_v1",
              manifest.recordType == "completion_manifest",
              manifest.platform == "ios",
              manifest.interfaceID == "user-vci-elm327",
              manifest.readOnly,
              !manifest.vehicleCommandEnabled,
              !manifest.executionEnabled,
              !manifest.wouldTransmit,
              !manifest.retainedRawPayload,
              manifest.connectionSegments.count == 1,
              Set(manifest.expectedIntents).count == manifest.expectedIntents.count,
              Set(manifest.expectedReadouts).count == manifest.expectedReadouts.count,
              Set(manifest.expectedReadoutScopes).count == manifest.expectedReadoutScopes.count,
              Set(manifest.expectedIntents).isSubset(of: Self.allowedIntents),
              Set(manifest.expectedReadouts).isSubset(of: Self.allowedReadoutIDs),
              manifest.expectedReadouts.allSatisfy({ readoutID in
                  manifest.expectedIntents.contains { intent in
                      Self.isManifestReadoutConsistent(intent: intent, readoutID: readoutID)
                  }
              }),
              manifest.expectedIntents.allSatisfy({ intent in
                  manifest.expectedReadouts.contains { readoutID in
                      Self.isManifestReadoutConsistent(intent: intent, readoutID: readoutID)
                  }
              }),
              manifest.expectedReadoutScopes.allSatisfy({
                  manifest.expectedReadouts.contains($0.readoutID)
                      && Self.isValidScope($0.scopeID)
              }),
              Self.isReadoutProfileConsistent(manifest)
        else { throw NativeConnectorScanArchiveError.invalidManifest }
        guard (manifest.scanState == .completed && manifest.interruption == nil)
              || (manifest.scanState == .interrupted && manifest.interruption != nil)
        else { throw NativeConnectorScanArchiveError.invalidManifest }
        if manifest.scanState == .completed && manifest.expectedReadouts.isEmpty { throw NativeConnectorScanArchiveError.invalidManifest }

        let segment = manifest.connectionSegments[0]
        guard segment.connectionSequence == 0 else { throw NativeConnectorScanArchiveError.manifestBoundaryMismatch }
        let archivedIntents = Set(envelopes.map(\.intent))
        let archivedReadoutIDs = Set(envelopes.compactMap(\.readoutID))
        guard archivedIntents.isSubset(of: Set(manifest.expectedIntents)),
              archivedReadoutIDs.isSubset(of: Set(manifest.expectedReadouts))
        else { throw NativeConnectorScanArchiveError.manifestBoundaryMismatch }
        let archivedReadoutScopes = Set(envelopes.compactMap { envelope -> NativeConnectorReadoutScope? in
            guard let readoutID = envelope.readoutID,
                  let scopeID = envelope.readoutScopeID,
                  !scopeID.isEmpty
            else { return nil }
            return NativeConnectorReadoutScope(readoutID: readoutID, scopeID: scopeID)
        })
        guard Set(manifest.expectedReadoutScopes) == archivedReadoutScopes
        else { throw NativeConnectorScanArchiveError.manifestBoundaryMismatch }
        if let first = envelopes.first {
            guard manifest.scanID == first.scanID,
                  manifest.vehicleContextID == first.vehicleContextID,
                  manifest.interfaceID == first.interfaceID,
                  segment.connectionID == first.connectionID,
                  segment.envelopeCount == envelopes.count,
                  segment.firstSequence == first.sequence,
                  segment.lastSequence == envelopes.last?.sequence,
                  segment.lastSequence! - segment.firstSequence! + 1 == segment.envelopeCount
            else { throw NativeConnectorScanArchiveError.manifestBoundaryMismatch }
        } else {
            guard manifest.scanState == .interrupted,
                  segment.envelopeCount == 0,
                  segment.firstSequence == nil,
                  segment.lastSequence == nil
            else { throw NativeConnectorScanArchiveError.manifestBoundaryMismatch }
        }
        completionManifest = manifest
    }

    public func export() throws -> NativeConnectorScanArchive {
        guard let completionManifest else { throw NativeConnectorScanArchiveError.scanNotStarted }
        return NativeConnectorScanArchive(envelopes: envelopes, completionManifest: completionManifest)
    }

    public func reset() {
        envelopes.removeAll()
        completionManifest = nil
    }

    private static func isSafe(data: [String: NativeConnectorJSONValue]) -> Bool {
        if isSensitiveEcuInfoItem(data) { return false }
        return data.allSatisfy { key, value in
            let normalizedKey = key.lowercased()
            if ["raw", "raw_payload", "raw_frames", "frame", "frames", "payload", "response", "responses", "log", "logs", "debug"].contains(normalizedKey) { return false }
            if sensitiveDataKeys.contains(normalizedKey) { return false }
            if ["vehicle_command_enabled", "vehiclecommandenabled", "execution_enabled", "executionenabled", "would_transmit", "wouldtransmit"].contains(normalizedKey) && isEnabled(value) { return false }
            if ["read_only", "readonly"].contains(normalizedKey) && !isEnabled(value) { return false }
            return isSafe(value: value)
        }
    }

    private static func isReadoutProfileConsistent(_ manifest: NativeConnectorCompletionManifest) -> Bool {
        guard manifest.scanState == .completed, let profile = manifest.readoutProfile else { return true }
        let expectedReadouts = Set(manifest.expectedReadouts)
        switch profile {
        case .initialDiagnostic:
            return Set([
                "stored_dtc_snapshot",
                "pending_dtc_snapshot",
                "permanent_dtc_snapshot",
                "freeze_frame_snapshot",
                "onboard_monitor_snapshot",
                "supported_pid_matrix",
                "ecu_info_snapshot",
                "readiness_snapshot"
            ]).isSubset(of: expectedReadouts)
        case .quickCondition:
            return Set([
                "stored_dtc_snapshot",
                "pending_dtc_snapshot",
                "permanent_dtc_snapshot",
                "supported_pid_matrix",
                "readiness_snapshot"
            ]).isSubset(of: expectedReadouts)
                && Set(["freeze_frame_snapshot", "onboard_monitor_snapshot", "ecu_info_snapshot"]).isDisjoint(with: expectedReadouts)
        }
    }

    private static func isSensitiveEcuInfoItem(_ data: [String: NativeConnectorJSONValue]) -> Bool {
        let identifier: String
        if case .string(let value)? = data["id"] {
            identifier = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        } else {
            identifier = ""
        }
        let infoType: String
        if case .string(let value)? = data["info_type"] {
            infoType = value.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        } else {
            infoType = ""
        }
        return ["vin", "vehicle_identification_number"].contains(identifier) || infoType == "02"
    }

    private static func hasExplicitVehicleCommandDisabled(in data: [String: NativeConnectorJSONValue]) -> Bool {
        guard case .bool(false) = data["vehicle_command_enabled"] else { return false }
        return true
    }

    private static func isEnvelopeReadoutConsistent(intent: String, readoutID: String?) -> Bool {
        if intent == "adapter_identity" { return readoutID == nil }
        return isManifestReadoutConsistent(intent: intent, readoutID: readoutID)
    }

    private static func isManifestReadoutConsistent(intent: String, readoutID: String?) -> Bool {
        guard let allowedReadoutIDs = allowedReadoutIDsByIntent[intent] else { return false }
        guard let readoutID else { return false }
        return allowedReadoutIDs.contains(readoutID)
    }

    private static func isValidScope(_ value: String) -> Bool {
        guard !value.isEmpty, value.count <= 80 else { return false }
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.:-")
        return value.unicodeScalars.allSatisfy(allowed.contains)
    }

    private static func isSafe(value: NativeConnectorJSONValue) -> Bool {
        switch value {
        case .array(let values): return values.allSatisfy(isSafe(value:))
        case .object(let object): return isSafe(data: object)
        default: return true
        }
    }

    private static func isEnabled(_ value: NativeConnectorJSONValue) -> Bool {
        switch value {
        case .bool(let value): return value
        case .number(let value): return value != 0
        case .string(let value): return ["true", "1", "yes", "on"].contains(value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
        default: return false
        }
    }
}
