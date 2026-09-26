import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { handleGameSocket } from "../server/game.ts";
import { gradiumEnabled } from "../server/gradium.ts";
import { handleHomeSocket } from "../server/home.ts";

const server = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, voice: gradiumEnabled(), ai: Boolean(process.env.GOOGLE_API_KEY) }));
});

const gameWss = new WebSocketServer({ noServer: true });
gameWss.on("connection", handleGameSocket);
const homeWss = new WebSocketServer({ noServer: true });
homeWss.on("connection", handleHomeSocket);

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  // Vercel réécrit /ws et /ws/home vers cette fonction, le chemin d'origine peut donc varier.
  const home = url.pathname.endsWith("/home") || url.searchParams.has("home");
  const target = home ? homeWss : gameWss;
  target.handleUpgrade(req, socket, head, (ws) => target.emit("connection", ws, req));
});

export default server;
