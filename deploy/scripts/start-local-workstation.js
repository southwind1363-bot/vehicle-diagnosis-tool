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
        ["url.dll,FileProtocolHandler", `${webUrl}/#obd-panel`], { windowsHide: true, timeout: 5000, signal: options.signal },
        (error) => resolve(!error));
    } catch { resolve(false); }
  });
}

export function describeWorkstationPortError(error = {}) {
  if (error?.code === "workstation_ports_overlap") {
    return "画面と確認ブリッジに同じポートが設定されています。PORTとLOCAL_BRIDGE_PORTを別の値にして再起動してください。今回の起動は行っていません。";
  }
  if (error?.code !== "EADDRINUSE") return null;
  const service = error.workstationService;
  const port = error.workstationPort;
  if (!["web", "bridge"].includes(service) || !Number.isInteger(port) || port < 1 || port > 65535) {
    return "起動先ポートは使用中です。PORTまたはLOCAL_BRIDGE_PORTを確認してください。他のプログラムは停止していません。";
  }
  const setting = service === "web" ? "PORT" : "LOCAL_BRIDGE_PORT";
  return `${service === "web" ? "診断画面" : "確認ブリッジ"}用ポート ${port} は使用中です。今回の起動を中止しました。\n`
    + `本ツールを起動済みなら既存の起動ウィンドウを確認してください。別のアプリが使用中なら${setting}を変更してください。他のプログラムは停止していません。`
    + (service === "web" ? "\n画面ポートを変更すると保存領域も別になります。元のURLの保存データは残ります。" : "");
}

function listen(server, port, service) {
  return new Promise((resolve, reject) => {
    const failed = (error) => {
      error.workstationService = service;
      error.workstationPort = port;
      reject(error);
    };
    server.once("error", failed);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", failed);
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
  if (!(Number(process.versions.node.split(".")[0]) >= 22)) throw new Error("workstation_node_version_unsupported");
  const webPort = Number(options.webPort ?? process.env.PORT ?? 3001);
  const bridgePort = Number(options.bridgePort ?? process.env.LOCAL_BRIDGE_PORT ?? 8765);
  if (![webPort, bridgePort].every((port) => Number.isInteger(port) && port >= 0 && port <= 65535)) {
    throw new Error("invalid_workstation_port");
  }
  if (webPort !== 0 && webPort === bridgePort) {
    throw Object.assign(new Error("workstation_ports_overlap"), { code: "workstation_ports_overlap" });
  }
  // A workstation must never inherit saved log replay as a live connection candidate.
  if (process.env.LOCAL_BRIDGE_REPLAY_LOG) throw new Error("workstation_replay_not_allowed");
  const configuredPairingToken = options.pairingToken ?? process.env.LOCAL_BRIDGE_PAIRING_TOKEN;
  if (configuredPairingToken !== undefined && String(configuredPairingToken).length < 12) throw new Error("workstation_pairing_token_too_short");
  const validatedAssets = validateWorkstationAssets(deployDirectory);
  const publicPaths = new Set(["/", "/offline-assets.json", ...validatedAssets.assets.map((asset) => asset === "./" ? "/" : `/${asset}`)]);
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
  // Only validated app assets belong on HTTP; local logs and runtime files do not.
  webApp.use((request, response, next) => {
    if (!["GET", "HEAD"].includes(request.method) || !publicPaths.has(request.path)) {
      response.status(404).end();
      return;
    }
    next();
  });
  const webServer = http.createServer(webApp.use(express.static(deployDirectory)));
  let closing = null;
  const close = () => {
    if (!closing) closing = (async () => { await closeServer(webServer); await closeServer(bridgeServer); })();
    return closing;
  };
  try {
    await listen(webServer, webPort, "web");
    await listen(bridgeServer, bridgePort, "bridge");
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
    console.log(`診断画面: ${workstation.webUrl}/#obd-panel`);
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
      : error.message === "workstation_node_version_unsupported" ? "Node.js 22以降が必要です。Node.js 24 LTSを推奨します。自動インストールは行いません。"
      : describeWorkstationPortError(error) || "ローカル起動に失敗しました。ポート・ペアリング値・再生ログ設定を確認してください。");
    process.exitCode = 1;
  }
}
