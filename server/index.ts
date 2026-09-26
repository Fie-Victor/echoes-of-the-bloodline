import "dotenv/config";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import { handleGameSocket } from "./game.ts";
import { gradiumEnabled } from "./gradium.ts";
import { handleHomeSocket } from "./home.ts";

const PORT = Number(process.env.PORT ?? 8787);
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");

const app = express();
app.use(express.static(distDir));
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });
wss.on("connection", handleGameSocket);
const homeWss = new WebSocketServer({ noServer: true });
homeWss.on("connection", handleHomeSocket);

server.on("upgrade", (req, socket, head) => {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  const target = pathname === "/ws" ? wss : pathname === "/ws/home" ? homeWss : null;
  if (!target) {
    socket.destroy();
    return;
  }
  target.handleUpgrade(req, socket, head, (ws) => target.emit("connection", ws, req));
});

server.listen(PORT, () => {
  const ai = process.env.GOOGLE_API_KEY && process.env.MOCK_AI !== "1" ? "Gemini" : "mock";
  console.log(`[server] http://localhost:${PORT} (AI: ${ai}, voice: ${gradiumEnabled() ? "Gradium" : "browser"})`);
});
