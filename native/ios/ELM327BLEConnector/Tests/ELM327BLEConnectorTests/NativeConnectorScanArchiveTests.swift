import Foundation
import XCTest
@testable import ELM327BLEConnector

@MainActor
final class NativeConnectorScanArchiveTests: XCTestCase {
    private let context = NativeConnectorSessionContext(
        scanID: UUID(uuidString: "11111111-1111-4111-8111-111111111111")!,
        connectionID: UUID(uuidString: "22222222-2222-4222-8222-222222222222")!,
        vehicleContextID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    )

    private func envelope(sequence: Int, code: String = "P0300") -> NativeConnectorEnvelope {
        NativeConnectorEnvelopeFactory.dtcs(context: context, sequence: sequence, intent: "read_stored_dtc", scopeID: nil, dtcs: [OBD2DTC(code: code, status: "stored")])
    }

    private func manifest(state: NativeConnectorScanState = .completed, count: Int = 2, first: Int? = 1, last: Int? = 2, interruption: NativeConnectorInterruption? = nil) -> NativeConnectorCompletionManifest {
        NativeConnectorCompletionManifest(
            schemaVersion: "native_connector_completion_manifest_v1",
            recordType: "completion_manifest",
            platform: "ios",
            interfaceID: "user-vci-elm327",
            scanID: context.scanID,
            vehicleContextID: context.vehicleContextID,
            capturedAt: "2026-07-21T00:00:00Z",
            scanState: state,
            expectedIntents: ["read_stored_dtc"],
            expectedReadouts: ["stored_dtc_snapshot"],
            expectedReadoutScopes: [],
            connectionSegments: [NativeConnectorConnectionSegment(connectionID: context.connectionID, connectionSequence: 0, firstSequence: first, lastSequence: last, envelopeCount: count)],
            interruption: interruption,
            readOnly: true,
            vehicleCommandEnabled: false,
            executionEnabled: false,
            wouldTransmit: false,
            retainedRawPayload: false
        )
    }

    func testExportsSeparateTerminalManifestAfterContiguousReadOnlyEnvelopes() throws {
        let builder = NativeConnectorScanArchiveBuilder()
        try builder.append(envelope(sequence: 1))
        try builder.append(envelope(sequence: 2, code: "P0171"))
        try builder.complete(with: manifest())
        let archive = try builder.export()
        let object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(archive)) as? [String: Any]
        let manifestObject = object?["completion_manifest"] as? [String: Any]

        XCTAssertEqual(archive.envelopes.count, 2)
        XCTAssertEqual(manifestObject?["record_type"] as? String, "completion_manifest")
        XCTAssertNil(object?["raw_frames"])
        XCTAssertThrowsError(try builder.append(envelope(sequence: 3)))
    }

    func testRejectsMixedBoundaryAndUnsafeData() throws {
        let builder = NativeConnectorScanArchiveBuilder()
        try builder.append(envelope(sequence: 1))
        var mixed = envelope(sequence: 2)
        mixed = NativeConnectorEnvelope(
            schemaVersion: mixed.schemaVersion,
            interfaceID: mixed.interfaceID,
            platform: mixed.platform,
            intent: mixed.intent,
            capturedAt: mixed.capturedAt,
            scanID: mixed.scanID,
            connectionID: UUID(uuidString: "44444444-4444-4444-8444-444444444444")!,
            vehicleContextID: mixed.vehicleContextID,
            sequence: mixed.sequence,
            readoutID: mixed.readoutID,
            readoutScopeID: mixed.readoutScopeID,
            ok: mixed.ok,
            blocked: mixed.blocked,
            wouldTransmit: mixed.wouldTransmit,
            errors: mixed.errors,
            data: mixed.data
        )
        XCTAssertThrowsError(try builder.append(mixed))

        let unsafe = NativeConnectorEnvelope(
            schemaVersion: "native_connector_contract_v1", interfaceID: "user-vci-elm327", platform: "ios", intent: "read_stored_dtc", capturedAt: "2026-07-21T00:00:00Z", scanID: context.scanID, connectionID: context.connectionID, vehicleContextID: context.vehicleContextID, sequence: 2, readoutID: nil, readoutScopeID: nil, ok: true, blocked: false, wouldTransmit: false, errors: [], data: ["nested": .object(["raw_frames": .array([])])]
        )
        XCTAssertThrowsError(try builder.append(unsafe))
    }

    func testRejectsSequenceAndTerminalBoundaryMismatch() throws {
        let builder = NativeConnectorScanArchiveBuilder()
        try builder.append(envelope(sequence: 1))
        XCTAssertThrowsError(try builder.append(envelope(sequence: 3)))
        XCTAssertThrowsError(try builder.complete(with: manifest(count: 1, first: 1, last: 2)))
    }

    func testRetainsEmptyInterruptedSessionWithoutSyntheticEnvelope() throws {
        let builder = NativeConnectorScanArchiveBuilder()
        let interruption = NativeConnectorInterruption(code: "transport:disconnected", connectionID: context.connectionID, sequence: 0)
        try builder.complete(with: manifest(state: .interrupted, count: 0, first: nil, last: nil, interruption: interruption))
        let archive = try builder.export()

        XCTAssertTrue(archive.envelopes.isEmpty)
        XCTAssertEqual(archive.completionManifest.scanState, .interrupted)
        XCTAssertEqual(archive.completionManifest.interruption?.code, "transport:disconnected")
    }
}
