import SwiftUI
import UniformTypeIdentifiers
import ELM327BLEConnector

struct NativeConnectorArchiveDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }

    let data: Data

    init(archive: NativeConnectorScanArchive) throws {
        data = try archive.jsonData()
    }

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else {
            throw CocoaError(.fileReadCorruptFile)
        }
        self.data = data
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}
