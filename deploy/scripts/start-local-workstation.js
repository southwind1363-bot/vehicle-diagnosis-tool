import express from "express";
import http from "node:http";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLocalBridgeApp } from "../local-bridge-readonly.js";

const deployDirectory = fileURLToPath(new URL("../", import.meta.url));

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
}

function closeServer(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => server.closeAllConnections(), 2000);
    server.close(() => { clearTimeout(timer); resolve(); });
    server.closeIdleConnections();
  });
}

export async function startLocalWorkstation(options = {}) {
  const webPort = Number(options.webPort ?? process.env.PORT ?? 3001);
  const bridgePort = Number(options.bridgePort ?? process.env.LOCAL_BRIDGE_PORT ?? 8765);
  if (![webPort, bridgePort].every((port) => Number.isInteger(port) && port >= 0 && port <= 65535)) {
    throw new Error("invalid_workstation_port");
  }
  // A workstation must never inherit saved log replay as a live connection candidate.
  if (process.env.LOCAL_BRIDGE_REPLAY_LOG) throw new Error("workstation_replay_not_allowed");
  const pairingToken = String(options.pairingToken ?? process.env.LOCAL_BRIDGE_PAIRING_TOKEN ?? randomBytes(24).toString("hex"));
  if (pairingToken.length < 12) throw new Error("workstation_pairing_token_too_short");
  const bridgeServer = createLocalBridgeApp({
    pairingToken,
    discoverJ2534: true,
    j2534RegistryText: options.j2534RegistryText,
    enableSampleReadouts: false
  });
  const webApp = express();
  // Keep the original request stream and pairing checks in the bridge handler.
  webApp.post("/local-bridge/v1/request", (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    request.url = "/v1/request";
    bridgeServer.emit("request", request, response);
  });
  const webServer = http.createServer(webApp.use(express.static(deployDirectory)));
  let closing = null;
  const close = () => {
    if (!closing) closing = (async () => { await closeServer(webServer); await closeServer(bridgeServer); })();
    return closing;
  };
  try {
    await listen(webServer, webPort);
    await listen(bridgeServer, bridgePort);
  } catch (error) {
    await close();
    throw error;
  }
  return {
    webUrl: `http://127.0.0.1:${webServer.address().port}`,
    bridgeUrl: `http://127.0.0.1:${bridgeServer.address().port}`,
    pairingToken,
    webServer,
    bridgeServer,
    close
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const workstation = await startLocalWorkstation();
    console.log(`診断画面: ${workstation.webUrl}`);
    console.log(`J2534静的確認ブリッジ: ${workstation.bridgeUrl}`);
    console.log(`ペアリング値（外部共有しないでください）: ${workstation.pairingToken}`);
    console.log("DLLロード・車両接続・車両送信は無効です。終了: q + Enter または Ctrl+C");
    const input = createInterface({ input: process.stdin, terminal: false, crlfDelay: Infinity });
    let stopping = null;
    const stop = () => {
      if (!stopping) stopping = (async () => {
        input.removeListener("close", stop);
        input.close();
        process.stdin.pause();
        await workstation.close();
        process.removeListener("SIGINT", stop);
        process.removeListener("SIGTERM", stop);
        console.log("診断画面と確認ブリッジを終了しました。");
      })();
      return stopping;
    };
    input.on("line", (line) => {
      if (["q", "exit"].includes(line.trim().toLowerCase())) void stop();
    });
    input.once("close", stop);
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  } catch (error) {
    console.error(error.code === "EADDRINUSE" ? "起動先ポートは使用中です。PORTまたはLOCAL_BRIDGE_PORTを変更してください。" : "ローカル起動に失敗しました。ポート・ペアリング値・再生ログ設定を確認してください。");
    process.exitCode = 1;
  }
}
