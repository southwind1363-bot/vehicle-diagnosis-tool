import Foundation

public struct NativeConnectorReadoutPreview: Sendable, Equatable {
    public struct DTC: Identifiable, Sendable, Equatable {
        public let code: String
        public let status: String
        public let sourceScopeID: String

        public var id: String { "\(status):\(code):\(sourceScopeID)" }
    }

    public struct MonitorValue: Identifiable, Sendable, Equatable {
        public let monitorID: String
        public let pid: String
        public let value: Double
        public let unit: String
        public let sourceScopeID: String

        public var id: String { "\(monitorID):\(pid):\(sourceScopeID)" }

        public var displayValue: String {
            let formatted = value.rounded() == value ? String(Int(value)) : String(format: "%.2f", value)
            return unit.isEmpty ? formatted : "\(formatted) \(unit)"
        }
    }

    public struct Readiness: Identifiable, Sendable, Equatable {
        public let sourceScopeID: String
        public let milOn: Bool
        public let dtcCount: Int
        public let ignitionType: String
        public let supportedMonitorCount: Int
        public let incompleteMonitorCount: Int

        public var id: String { sourceScopeID }
    }

    public let storedDTCs: [DTC]
    public let pendingDTCs: [DTC]
    public let permanentDTCs: [DTC]
    public let liveValues: [MonitorValue]
    public let freezeFrameValues: [MonitorValue]
    public let readiness: [Readiness]

    public init(
        storedDTCs: [DTC],
        pendingDTCs: [DTC],
        permanentDTCs: [DTC],
        liveValues: [MonitorValue],
        freezeFrameValues: [MonitorValue],
        readiness: [Readiness]
    ) {
        self.storedDTCs = storedDTCs
        self.pendingDTCs = pendingDTCs
        self.permanentDTCs = permanentDTCs
        self.liveValues = liveValues
        self.freezeFrameValues = freezeFrameValues
        self.readiness = readiness
    }

    public static let empty = NativeConnectorReadoutPreview(
        storedDTCs: [],
        pendingDTCs: [],
        permanentDTCs: [],
        liveValues: [],
        freezeFrameValues: [],
        readiness: []
    )

    public init(envelopes: [NativeConnectorEnvelope]) {
        var storedDTCs: [String: DTC] = [:]
        var pendingDTCs: [String: DTC] = [:]
        var permanentDTCs: [String: DTC] = [:]
        var liveValues: [String: MonitorValue] = [:]
        var freezeFrameValues: [String: MonitorValue] = [:]
        var readiness: [String: Readiness] = [:]

        for envelope in envelopes {
            let scopeID = envelope.readoutScopeID ?? "LEGACY"
            switch envelope.intent {
            case "read_stored_dtc", "read_pending_dtc", "read_permanent_dtc":
                let dtcs = Self.dtcs(in: envelope.data, status: Self.dtcStatus(for: envelope.intent), scopeID: scopeID)
                switch envelope.intent {
                case "read_stored_dtc": dtcs.forEach { storedDTCs[$0.id] = $0 }
                case "read_pending_dtc": dtcs.forEach { pendingDTCs[$0.id] = $0 }
                default: dtcs.forEach { permanentDTCs[$0.id] = $0 }
                }
            case "read_live_pid_snapshot":
                Self.monitorValues(in: envelope.data, scopeID: scopeID).forEach { liveValues[$0.id] = $0 }
                if let snapshot = Self.readiness(in: envelope.data, scopeID: scopeID) {
                    readiness[snapshot.id] = snapshot
                }
            case "read_freeze_frame":
                Self.monitorValues(in: envelope.data, scopeID: scopeID).forEach { freezeFrameValues[$0.id] = $0 }
            default:
                break
            }
        }

        self.storedDTCs = Self.sortedDTCs(storedDTCs.values)
        self.pendingDTCs = Self.sortedDTCs(pendingDTCs.values)
        self.permanentDTCs = Self.sortedDTCs(permanentDTCs.values)
        self.liveValues = Self.sortedMonitorValues(liveValues.values)
        self.freezeFrameValues = Self.sortedMonitorValues(freezeFrameValues.values)
        self.readiness = readiness.values.sorted { $0.sourceScopeID < $1.sourceScopeID }
    }

    private static func dtcStatus(for intent: String) -> String {
        switch intent {
        case "read_stored_dtc": return "stored"
        case "read_pending_dtc": return "pending"
        default: return "permanent"
        }
    }

    private static func dtcs(in data: [String: NativeConnectorJSONValue], status: String, scopeID: String) -> [DTC] {
        guard case .array(let values)? = data["dtcs"] else { return [] }
        return values.compactMap { value in
            guard case .object(let object) = value,
                  case .string(let rawCode)? = object["code"]
            else { return nil }
            let code = rawCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
            guard code.range(of: "^[PBCU][0-9A-F]{4}$", options: .regularExpression) != nil else { return nil }
            return DTC(code: code, status: status, sourceScopeID: scopeID)
        }
    }

    private static func monitorValues(in data: [String: NativeConnectorJSONValue], scopeID: String) -> [MonitorValue] {
        guard case .array(let values)? = data["monitor_values"] else { return [] }
        return values.compactMap { value in
            guard case .object(let object) = value,
                  case .string(let id)? = object["id"],
                  case .string(let pid)? = object["pid"],
                  case .number(let numericValue)? = object["value"],
                  numericValue.isFinite
            else { return nil }
            let unit: String
            if case .string(let rawUnit)? = object["unit"] {
                unit = rawUnit.trimmingCharacters(in: .whitespacesAndNewlines)
            } else {
                unit = ""
            }
            return MonitorValue(monitorID: id, pid: pid, value: numericValue, unit: unit, sourceScopeID: scopeID)
        }
    }

    private static func readiness(in data: [String: NativeConnectorJSONValue], scopeID: String) -> Readiness? {
        guard case .bool(let milOn)? = data["mil_on"],
              case .number(let rawDTCCount)? = data["dtc_count"],
              rawDTCCount.isFinite,
              rawDTCCount >= 0,
              rawDTCCount.rounded() == rawDTCCount,
              rawDTCCount <= 255,
              case .string(let ignitionType)? = data["readiness_ignition_type"],
              case .array(let monitors)? = data["monitors"]
        else { return nil }
        let supportedMonitors = monitors.compactMap { value -> (supported: Bool, complete: Bool)? in
            guard case .object(let object) = value,
                  case .bool(let supported)? = object["supported"],
                  case .bool(let complete)? = object["complete"]
            else { return nil }
            return (supported, complete)
        }.filter { $0.supported }
        return Readiness(
            sourceScopeID: scopeID,
            milOn: milOn,
            dtcCount: Int(rawDTCCount),
            ignitionType: ignitionType,
            supportedMonitorCount: supportedMonitors.count,
            incompleteMonitorCount: supportedMonitors.filter { !$0.complete }.count
        )
    }

    private static func sortedDTCs(_ values: Dictionary<String, DTC>.Values) -> [DTC] {
        values.sorted { lhs, rhs in
            lhs.sourceScopeID == rhs.sourceScopeID ? lhs.code < rhs.code : lhs.sourceScopeID < rhs.sourceScopeID
        }
    }

    private static func sortedMonitorValues(_ values: Dictionary<String, MonitorValue>.Values) -> [MonitorValue] {
        values.sorted { lhs, rhs in
            lhs.sourceScopeID == rhs.sourceScopeID ? lhs.pid < rhs.pid : lhs.sourceScopeID < rhs.sourceScopeID
        }
    }
}
