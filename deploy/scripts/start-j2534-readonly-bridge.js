import { createLocalBridgeApp } from "../local-bridge-readonly.js";

// Keep J2534 discovery explicit: this starts no DLL and opens no VCI or vehicle connection.
process.env.LOCAL_BRIDGE_DISCOVER_J2534 = "1";

const port = Number(process.env.LOCAL_BRIDGE_PORT || process.env.PORT || 8765);
const server = createLocalBridgeApp();

server.listen(port, "127.0.0.1", () => {
  console.log(`J2534 static read-only bridge: http://127.0.0.1:${port}`);
  console.log("registry and PE export inspection only; vehicle_command_enabled=false");
  console.log("set LOCAL_BRIDGE_PAIRING_TOKEN before requesting protected read intents");
});
