// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "ELM327BLEConnector",
    platforms: [.iOS(.v16)],
    products: [
        .library(name: "ELM327BLEConnector", targets: ["ELM327BLEConnector"])
    ],
    targets: [
        .target(name: "ELM327BLEConnector"),
        .testTarget(name: "ELM327BLEConnectorTests", dependencies: ["ELM327BLEConnector"])
    ]
)
