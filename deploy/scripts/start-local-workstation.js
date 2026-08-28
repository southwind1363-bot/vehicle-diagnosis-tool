import express from "express";
import http from "node:http";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateWorkstationAssets } from "./workstation-assets.js";

const deployDirectory = fileURLToPath(new URL("../", import.meta.url));

export function openWorkstationBrowser(webUrl, options = {}) {
  // Never pass tokens, paths, or arbitrary URLs to the operating system launcher.
  if ((options.platform ?? process.platform) !== "win32" || typeof webUrl !== "string"
    || !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(webUrl)
    || Number(webUrl.split(":").at(-1)) > 65535 || options.signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      (options.execFile ?? execFile)(path.win32.join(process.env.SystemRoot || "C:\\Windows", "System32", "rundll32.exe"),
        ["url.dll,FileProtocolHandler", webUrl], { windowsHide: true, timeout: 5000, signal: options.signal },
        (error) => resolve(!error));
    } catch { resolve(false); }
  });
}

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
  const configuredPairingToken = options.pairingToken ?? process.env.LOCAL_BRIDGE_PAIRING_TOKEN;
  if (configuredPairingToken !== undefined && String(configuredPairingToken).length < 12) throw new Error("workstation_pairing_token_too_short");
  validateWorkstationAssets(deployDirectory);
  const pairingToken = String(configuredPairingToken ?? randomBytes(24).toString("hex"));
  const { createLocalBridgeApp } = await import("../local-bridge-readonly.js");
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
    const browserAbort = new AbortController();
    let stopping = null;
    const stop = () => {
      if (!stopping) stopping = (async () => {
        browserAbort.abort();
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
    if (process.argv.includes("--open-browser") && !process.argv.includes("--no-browser")) {
      void openWorkstationBrowser(workstation.webUrl, { signal: browserAbort.signal }).then((opened) => {
        if (!opened && !stopping) console.log("ブラウザーを自動で開けませんでした。上の診断画面URLを手動で開いてください。サーバーは起動しています。");
      });
    }
  } catch (error) {
    console.error(error.code === "workstation_assets_invalid"
      ? `ローカル資材を確認できません（${error.asset.slice(0, 160)}）。同じ版のdeployフォルダーを一式復元してから再起動してください。`
      : error.code === "EADDRINUSE" ? "起動先ポートは使用中です。PORTまたはLOCAL_BRIDGE_PORTを変更してください。" : "ローカル起動に失敗しました。ポート・ペアリング値・再生ログ設定を確認してください。");
    process.exitCode = 1;
  }
}
