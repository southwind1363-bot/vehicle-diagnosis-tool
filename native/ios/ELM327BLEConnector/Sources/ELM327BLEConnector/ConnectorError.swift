import Foundation

public enum ELMConnectorError: Error, Equatable, Sendable {
    case bluetoothUnavailable
    case invalidState
    case peripheralNotSelected
    case characteristicNotReady
    case responseTooLarge
    case responseTimeout
    case disconnected
    case invalidResponse
}
