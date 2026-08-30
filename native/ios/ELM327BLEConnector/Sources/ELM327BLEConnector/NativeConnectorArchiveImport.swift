import Foundation

public enum NativeConnectorArchiveImportError: Error, Equatable, Sendable {
    case archiveTooLarge
    case malformedArchive
    case invalidArchive(NativeConnectorScanArchiveError)
}

public extension NativeConnectorScanArchive {
    /// Supported file-import entry point; enforces the transfer limit before semantic validation.
    static func decodeValidated(
        from data: Data,
        using decoder: JSONDecoder = JSONDecoder()
    ) throws -> NativeConnectorScanArchive {
        guard data.count <= maximumTransferBytes else {
            throw NativeConnectorArchiveImportError.archiveTooLarge
        }

        do {
            return try decoder.decode(Self.self, from: data)
        } catch let error as NativeConnectorScanArchiveError {
            throw NativeConnectorArchiveImportError.invalidArchive(error)
        } catch {
            throw NativeConnectorArchiveImportError.malformedArchive
        }
    }
}