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

    private func envelope(sequence: Int, code: String = "P0300", scopeID: String? = nil) -> NativeConnectorEnvelope {
        NativeConnectorEnvelopeFactory.dtcs(context: context, sequence: sequence, intent: "read_stored_dtc", scopeID: scopeID, dtcs: [OBD2DTC(code: code, status: "stored")])
    }

    private func manifest(state: NativeConnectorScanState = .completed, count: Int = 2, first: Int? = 1, last: Int? = 2, interruption: NativeConnectorInterruption? = nil, scopes: [NativeConnectorReadoutScope] = []) -> NativeConnectorCompletionManifest {
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
            expectedReadoutScopes: scopes,
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
            readoutAttempt: mixed.readoutAttempt,
            ok: mixed.ok,
            blocked: mixed.blocked,
            wouldTransmit: mixed.wouldTransmit,
            errors: mixed.errors,
            data: mixed.data
        )
        XCTAssertThrowsError(try builder.append(mixed))

        let unsafe = NativeConnectorEnvelope(
            schemaVersion: "native_connector_contract_v1", interfaceID: "user-vci-elm327", platform: "ios", intent: "read_stored_dtc", capturedAt: "2026-07-21T00:00:00Z", scanID: context.scanID, connectionID: context.connectionID, vehicleContextID: context.vehicleContextID, sequence: 2, readoutID: nil, readoutScopeID: nil, readoutAttempt: 0, ok: true, blocked: false, wouldTransmit: false, errors: [], data: ["nested": .object(["raw_frames": .array([])])]
        )
        XCTAssertThrowsError(try builder.append(unsafe))

        for key in ["adapter_name", "serial_number", "bluetooth_address", "vin"] {
            let sensitive = NativeConnectorEnvelope(
                schemaVersion: "native_connector_contract_v1", interfaceID: "user-vci-elm327", platform: "ios", intent: "read_stored_dtc", capturedAt: "2026-07-21T00:00:00Z", scanID: context.scanID, connectionID: context.connectionID, vehicleContextID: context.vehicleContextID, sequence: 1, readoutID: "stored_dtc_snapshot", readoutScopeID: nil, readoutAttempt: 0, ok: true, blocked: false, wouldTransmit: false, errors: [], data: [key: .string("sensitive-value")]
            )
            XCTAssertThrowsError(try NativeConnectorScanArchiveBuilder().append(sensitive))
        }
    }

    func testRejectsSequenceAndTerminalBoundaryMismatch() throws {
        let builder = NativeConnectorScanArchiveBuilder()
        try builder.append(envelope(sequence: 1))
        XCTAssertThrowsError(try builder.append(envelope(sequence: 3)))
        XCTAssertThrowsError(try builder.complete(with: manifest(count: 1, first: 1, last: 2)))
    }

    func testAcceptsOnlyUniqueDeclaredReadoutScopes() throws {
        let scope = NativeConnectorReadoutScope(readoutID: "stored_dtc_snapshot", scopeID: "7E8")
        let builder = NativeConnectorScanArchiveBuilder()
        try builder.append(envelope(sequence: 1, scopeID: "7E8"))
        try builder.complete(with: manifest(count: 1, first: 1, last: 1, scopes: [scope]))
        XCTAssertEqual(try builder.export().completionManifest.expectedReadoutScopes, [scope])

        let duplicateScopeBuilder = NativeConnectorScanArchiveBuilder()
        try duplicateScopeBuilder.append(envelope(sequence: 1, scopeID: "7E8"))
        XCTAssertThrowsError(try duplicateScopeBuilder.complete(with: manifest(count: 1, first: 1, last: 1, scopes: [scope, scope])))

        let mismatchedScopeBuilder = NativeConnectorScanArchiveBuilder()
        try mismatchedScopeBuilder.append(envelope(sequence: 1, scopeID: "7E8"))
        let mismatchedScope = NativeConnectorReadoutScope(readoutID: "ecu_info_snapshot", scopeID: "7E8")
        XCTAssertThrowsError(try mismatchedScopeBuilder.complete(with: manifest(count: 1, first: 1, last: 1, scopes: [mismatchedScope])))
    }

    func testEnforcesTheSharedNativeArchiveEnvelopeLimit() throws {
        let builder = NativeConnectorScanArchiveBuilder()
        for sequence in 1...NativeConnectorScanArchiveBuilder.maximumEnvelopeCount {
            try builder.append(envelope(sequence: sequence))
        }
        XCTAssertThrowsError(try builder.append(envelope(sequence: NativeConnectorScanArchiveBuilder.maximumEnvelopeCount + 1))) { error in
            XCTAssertEqual(error as? NativeConnectorScanArchiveError, .tooManyEnvelopes)
        }
        try builder.complete(with: manifest(
            count: NativeConnectorScanArchiveBuilder.maximumEnvelopeCount,
            first: 1,
            last: NativeConnectorScanArchiveBuilder.maximumEnvelopeCount
        ))
        XCTAssertEqual(try builder.export().envelopes.count, NativeConnectorScanArchiveBuilder.maximumEnvelopeCount)
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

    func testExportsBoundedLocalJsonWithNonSensitiveFilename() throws {
        let builder = NativeConnectorScanArchiveBuilder()
        try builder.append(envelope(sequence: 1))
        try builder.append(envelope(sequence: 2, code: "P0171"))
        try builder.complete(with: manifest())
        let archive = try builder.export()
        let json = try archive.jsonData()
        let object = try JSONSerialization.jsonObject(with: json) as? [String: Any]

        XCTAssertLessThanOrEqual(json.count, NativeConnectorScanArchive.maximumTransferBytes)
        XCTAssertEqual(archive.suggestedExportFilename, "vehicle-diagnosis-readout-11111111.json")
        XCTAssertEqual((object?["completion_manifest"] as? [String: Any])?["record_type"] as? String, "completion_manifest")
        XCTAssertNil(object?["raw_frames"])
    }

    func testRejectsArchiveExportBeyondTheOfflineImportLimit() {
        let base = envelope(sequence: 1)
        let oversizedEnvelope = NativeConnectorEnvelope(
            schemaVersion: base.schemaVersion,
            interfaceID: base.interfaceID,
            platform: base.platform,
            intent: base.intent,
            capturedAt: base.capturedAt,
            scanID: base.scanID,
            connectionID: base.connectionID,
            vehicleContextID: base.vehicleContextID,
            sequence: base.sequence,
            readoutID: base.readoutID,
            readoutScopeID: base.readoutScopeID,
            readoutAttempt: base.readoutAttempt,
            ok: base.ok,
            blocked: base.blocked,
            wouldTransmit: base.wouldTransmit,
            errors: base.errors,
            data: ["note": .string(String(repeating: "x", count: NativeConnectorScanArchive.maximumTransferBytes))]
        )
        let archive = NativeConnectorScanArchive(envelopes: [oversizedEnvelope], completionManifest: manifest(count: 1, first: 1, last: 1))

        XCTAssertThrowsError(try archive.jsonData()) { error in
            XCTAssertEqual(error as? NativeConnectorArchiveExportError, .archiveTooLarge)
        }
    }
}
