import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

const server = app.listen(PORT, () => {
  console.log(`自動車整備ツール: http://localhost:${PORT}`);
  console.log("AI相談は外部GPT連携方式です。APIキーは使用しません。");
});

export { app, server };
