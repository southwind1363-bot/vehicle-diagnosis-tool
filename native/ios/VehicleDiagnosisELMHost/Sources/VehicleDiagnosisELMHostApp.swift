import SwiftUI

@main
struct VehicleDiagnosisELMHostApp: App {
    @StateObject private var viewModel = ReadoutCoordinatorViewModel()

    var body: some Scene {
        WindowGroup {
            ReadoutCoordinatorView(viewModel: viewModel)
        }
    }
}
