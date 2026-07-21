import SwiftUI

struct ReadoutCoordinatorView: View {
    @ObservedObject var viewModel: ReadoutCoordinatorViewModel

    var body: some View {
        NavigationStack {
            Form {
                Section("Readout status") {
                    LabeledContent("Connection", value: viewModel.connectorState.rawValue)
                    LabeledContent("Archive", value: viewModel.archiveState)
                    LabeledContent("Archive records", value: "\(viewModel.archiveRecordCount)")
                    if let errorMessage = viewModel.errorMessage {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                    }
                }

                Section("1. BLE adapter") {
                    Text("Only BLE GATT ELM327 adapters are supported. Bluetooth Classic-only ELM327 mini adapters cannot use this iPhone transport.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Button("Scan nearby adapters") {
                        viewModel.startPeripheralScan()
                    }
                    ForEach(viewModel.peripherals) { peripheral in
                        Button {
                            viewModel.selectPeripheral(peripheral)
                        } label: {
                            HStack {
                                Text(peripheral.displayName.isEmpty ? "Unnamed adapter" : peripheral.displayName)
                                Spacer()
                                if viewModel.selectedPeripheralID == peripheral.id {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    }
                    Button("Connect selected adapter") {
                        viewModel.connectSelectedPeripheral()
                    }
                    .disabled(!viewModel.canConnect)
                }

                Section("2. GATT characteristics") {
                    Text("After connection, choose a write characteristic for commands and a notify characteristic for responses.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Picker("Transmit", selection: $viewModel.selectedTransmitID) {
                        Text("Choose").tag("")
                        ForEach(viewModel.characteristicChoices) { choice in
                            Text(choice.label).tag(choice.id)
                        }
                    }
                    Picker("Receive", selection: $viewModel.selectedReceiveID) {
                        Text("Choose").tag("")
                        ForEach(viewModel.characteristicChoices) { choice in
                            Text(choice.label).tag(choice.id)
                        }
                    }
                    Button("Confirm read characteristics") {
                        viewModel.configureReadCharacteristics()
                    }
                    .disabled(!viewModel.canConfigure)
                }

                Section("3. Read-only scan") {
                    Text("Reads DTCs, freeze frame, readiness, ECU information, supported PIDs, and standard PIDs. It does not send clear, active test, or write commands.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Button("Start initial readout") {
                        viewModel.beginInitialReadout()
                    }
                    .disabled(!viewModel.canStartReadout)
                    Button("Disconnect", role: .destructive) {
                        viewModel.disconnect()
                    }
                }

                Section("4. Result") {
                    Button("Build verified JSON") {
                        viewModel.prepareArchiveExport()
                    }
                    .disabled(viewModel.archiveState != "Complete")
                    if let exportURL = viewModel.exportURL {
                        ShareLink(item: exportURL) {
                            Label("Share JSON", systemImage: "square.and.arrow.up")
                        }
                    }
                }
            }
            .navigationTitle("Vehicle readout")
        }
    }
}
