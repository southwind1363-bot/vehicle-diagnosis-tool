import Foundation

public enum NativeConnectorArchiveExportError: Error, Equatable, Sendable {
    case archiveTooLarge
}

public extension NativeConnectorScanArchive {
    static var maximumTransferBytes: Int { 2_000_000 }

    func jsonData(prettyPrinted: Bool = true) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = prettyPrinted ? [.prettyPrinted, .sortedKeys] : [.sortedKeys]
        let data = try encoder.encode(self)
        guard data.count <= Self.maximumTransferBytes else { throw NativeConnectorArchiveExportError.archiveTooLarge }
        return data
    }

    var suggestedExportFilename: String {
        "vehicle-diagnosis-readout-\(completionManifest.scanID.uuidString.prefix(8).lowercased()).json"
    }
}
