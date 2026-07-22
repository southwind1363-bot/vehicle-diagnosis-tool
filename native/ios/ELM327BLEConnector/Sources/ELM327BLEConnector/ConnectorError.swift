import Foundation

public enum ELMConnectorError: Error, Equatable, Sendable {
    case bluetoothUnavailable
    case invalidState
    case peripheralNotSelected
    case characteristicNotReady
    case responseTooLarge
    case writeCapacityTimeout
    case writeFailed
    case responseTimeout
    case disconnected
    case invalidResponse
}
