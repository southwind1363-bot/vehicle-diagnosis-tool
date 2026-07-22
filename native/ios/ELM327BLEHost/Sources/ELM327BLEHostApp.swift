import SwiftUI

@main
struct ELM327BLEHostApp: App {
    @StateObject private var model = NativeConnectorHostModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(model)
        }
    }
}
