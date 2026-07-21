import Foundation

public struct ELMPromptDecoder: Sendable {
    private let maximumResponseBytes: Int
    private var buffer = ""

    public init(maximumResponseBytes: Int = 16 * 1024) {
        self.maximumResponseBytes = maximumResponseBytes
    }

    public mutating func append(_ chunk: Data) throws -> String? {
        guard let text = String(data: chunk, encoding: .utf8) else {
            throw ELMConnectorError.invalidResponse
        }
        buffer.append(text)
        guard buffer.utf8.count <= maximumResponseBytes else {
            buffer = ""
            throw ELMConnectorError.responseTooLarge
        }
        guard let promptIndex = buffer.firstIndex(of: ">") else { return nil }
        let response = String(buffer[..<promptIndex])
        buffer = String(buffer[buffer.index(after: promptIndex)...])
        return response.replacingOccurrences(of: "\r", with: "\n")
            .split(whereSeparator: { $0.isNewline })
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: "\n")
    }

    public mutating func reset() {
        buffer = ""
    }
}
