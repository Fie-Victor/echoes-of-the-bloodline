import "dotenv/config";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer, type WebSocket } from "ws";
import type { ClientMessage, NpcRequest, ServerMessage } from "../shared/protocol.ts";
import { think } from "./brain.ts";
import { SAMPLE_RATE, Transcriber, VOICES, gradiumEnabled, synthesize } from "./gradium.ts";
import { generateHologram } from "./holograms.ts";
import { NPCS, clearSession, getMemory } from "./npcs.ts";

const PORT = Number(process.env.PORT ?? 8787);
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");

const app = express();
app.use(express.static(distDir));
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

wss.on("connection", (ws) => {
  const sessionId = randomUUID();
  console.log(`[ws] session ${sessionId} connected`);

  let transcriber: Transcriber | null = null;
  let voiceRequest: Omit<NpcRequest, "player_input"> | null = null;
  let cancelSpeech = () => {};

  function speak(npcId: string, text: string): void {
    cancelSpeech();
    if (!gradiumEnabled()) {
      send(ws, { type: "speech_end", npc_id: npcId, ok: false, text });
      return;
    }
    const tts = synthesize(text, VOICES[npcId] ?? VOICES.astra, (audio) =>
      send(ws, { type: "speech_audio", npc_id: npcId, audio, sample_rate: SAMPLE_RATE }),
    );
    let cancelled = false;
    cancelSpeech = () => {
      cancelled = true;
      tts.cancel();
    };
    void tts.done.then((ok) => {
      if (!cancelled) send(ws, { type: "speech_end", npc_id: npcId, ok, text });
    });
  }

  async function talk(request: NpcRequest): Promise<void> {
    const def = NPCS[request.npc_id];
    if (!def) {
      send(ws, { type: "error", message: `unknown npc ${request.npc_id}` });
      return;
    }
    const mem = getMemory(sessionId, def.id);
    const { response, source } = await think(def, mem, request);
    send(ws, { type: "npc_reply", npc_id: def.id, response, source });
    speak(def.id, response.dialogue);
    if (response.trigger_devin_ui) {
      const holo = generateHologram(response.trigger_devin_ui);
      if (holo) send(ws, { type: "hologram", ...holo });
    }
  }

  ws.on("message", async (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString()) as ClientMessage;
    } catch {
      send(ws, { type: "error", message: "invalid JSON" });
      return;
    }

    if (msg.type === "talk") {
      await talk(msg.request);
    } else if (msg.type === "say") {
      speak(msg.npc_id, msg.text);
    } else if (msg.type === "stop_speech") {
      cancelSpeech();
    } else if (msg.type === "voice_start") {
      cancelSpeech();
      transcriber?.abort();
      if (!gradiumEnabled()) {
        send(ws, { type: "error", message: "voix indisponible (GRADIUM_API_KEY manquante)" });
        return;
      }
      voiceRequest = { npc_id: msg.npc_id, game_context: msg.game_context };
      transcriber = new Transcriber("fr", (text) => send(ws, { type: "transcript", text, final: false }));
    } else if (msg.type === "voice_audio") {
      transcriber?.push(msg.audio);
    } else if (msg.type === "voice_end") {
      const t = transcriber;
      const req = voiceRequest;
      transcriber = null;
      if (!t || !req) return;
      const text = await t.finish();
      send(ws, { type: "transcript", text, final: true });
      if (text) await talk({ ...req, player_input: text });
    } else if (msg.type === "puzzle_solved") {
      console.log(`[ws] session ${sessionId} solved ${msg.puzzle_id}`);
    }
  });

  ws.on("close", () => {
    cancelSpeech();
    transcriber?.abort();
    clearSession(sessionId);
  });
});

server.listen(PORT, () => {
  const ai = process.env.GOOGLE_API_KEY && process.env.MOCK_AI !== "1" ? "Gemini" : "mock";
  console.log(`[server] http://localhost:${PORT} (AI: ${ai}, voice: ${gradiumEnabled() ? "Gradium" : "browser"})`);
});
