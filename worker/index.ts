import type { ClientMessage, NpcRequest, ServerMessage } from "../shared/protocol.ts";
import type { HomeClientMessage, HomeServerMessage } from "../shared/home-protocol.ts";
import { think } from "../server/brain.ts";
import { generateHologram } from "../server/holograms.ts";
import { NPCS, clearSession, getMemory } from "../server/npcs.ts";
import { SAMPLE_RATE, CommandListener, Transcriber, VOICES, gradiumEnabled, synthesize, whenTtsIdle } from "./gradium.ts";

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  GRADIUM_API_KEY?: string;
  GOOGLE_API_KEY?: string;
}

function applyEnv(env: Env): void {
  const bag = globalThis as typeof globalThis & { __GRADIUM?: string; __GOOGLE?: string };
  bag.__GRADIUM = env.GRADIUM_API_KEY ?? "";
  bag.__GOOGLE = env.GOOGLE_API_KEY ?? "";
  process.env.GRADIUM_API_KEY = bag.__GRADIUM;
  process.env.GOOGLE_API_KEY = bag.__GOOGLE;
}

function accept(): { client: WebSocket; server: WebSocket } {
  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();
  return { client, server };
}

function gameSocket(): Response {
  const { client, server } = accept();
  const send = (msg: ServerMessage) => {
    if (server.readyState === WebSocket.OPEN) server.send(JSON.stringify(msg));
  };
  const sessionId = crypto.randomUUID();
  let transcriber: Transcriber | null = null;
  let voiceRequest: Omit<NpcRequest, "player_input"> | null = null;
  let voiceInbox: string[] = [];
  let voiceGate: Promise<void> = Promise.resolve();
  let cancelSpeech = () => {};

  function speak(npcId: string, text: string): void {
    cancelSpeech();
    if (!gradiumEnabled()) {
      send({ type: "speech_end", npc_id: npcId, ok: false, text });
      return;
    }
    const tts = synthesize(text, VOICES[npcId] ?? VOICES.astra, (audio) =>
      send({ type: "speech_audio", npc_id: npcId, audio, sample_rate: SAMPLE_RATE }),
    );
    let cancelled = false;
    cancelSpeech = () => {
      cancelled = true;
      tts.cancel();
    };
    void tts.done.then((ok) => {
      if (!cancelled) send({ type: "speech_end", npc_id: npcId, ok, text });
    });
  }

  async function talk(request: NpcRequest): Promise<void> {
    const def = NPCS[request.npc_id];
    if (!def) {
      send({ type: "error", message: `unknown npc ${request.npc_id}` });
      return;
    }
    const mem = getMemory(sessionId, def.id);
    const { response, source } = await think(def, mem, request);
    send({ type: "npc_reply", npc_id: def.id, response, source });
    speak(def.id, response.dialogue);
    if (response.trigger_devin_ui) {
      const holo = generateHologram(response.trigger_devin_ui);
      if (holo) send({ type: "hologram", ...holo });
    }
  }

  server.addEventListener("message", (event) => {
    void (async () => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(event.data)) as ClientMessage;
      } catch {
        send({ type: "error", message: "invalid JSON" });
        return;
      }
      if (msg.type === "talk") await talk(msg.request);
      else if (msg.type === "say") speak(msg.npc_id, msg.text);
      else if (msg.type === "stop_speech") cancelSpeech();
      else if (msg.type === "voice_start") {
        cancelSpeech();
        transcriber?.abort();
        transcriber = null;
        voiceInbox = [];
        if (!gradiumEnabled()) {
          send({ type: "error", message: "voice unavailable (GRADIUM_API_KEY missing)" });
          return;
        }
        voiceRequest = { npc_id: msg.npc_id, game_context: msg.game_context };
        const npcId = msg.npc_id;
        voiceGate = (async () => {
          await whenTtsIdle();
          await new Promise((r) => setTimeout(r, 160));
          if (voiceRequest?.npc_id !== npcId) return;
          transcriber = new Transcriber("en", (text) => send({ type: "transcript", text, final: false }));
          for (const chunk of voiceInbox) transcriber.push(chunk);
          voiceInbox = [];
        })();
      } else if (msg.type === "voice_audio") {
        if (transcriber) transcriber.push(msg.audio);
        else voiceInbox.push(msg.audio);
      } else if (msg.type === "voice_end") {
        await voiceGate;
        const t = transcriber;
        const req = voiceRequest;
        transcriber = null;
        voiceRequest = null;
        voiceInbox = [];
        if (!t || !req) {
          send({ type: "transcript", text: "", final: true });
          return;
        }
        const text = await t.finish();
        send({ type: "transcript", text, final: true });
        if (text) await talk({ ...req, player_input: text });
      }
    })();
  });

  server.addEventListener("close", () => {
    cancelSpeech();
    transcriber?.abort();
    clearSession(sessionId);
  });

  return new Response(null, { status: 101, webSocket: client });
}

function homeSocket(): Response {
  const { client, server } = accept();
  const send = (m: HomeServerMessage) => {
    if (server.readyState === WebSocket.OPEN) server.send(JSON.stringify(m));
  };
  const speeches = new Map<number, () => void>();
  let listener: CommandListener | null = null;
  const stopSpeech = () => {
    for (const cancel of speeches.values()) cancel();
    speeches.clear();
  };
  send({ type: "hello", tts: gradiumEnabled(), stt: gradiumEnabled() });

  server.addEventListener("message", (event) => {
    let msg: HomeClientMessage;
    try {
      msg = JSON.parse(String(event.data)) as HomeClientMessage;
    } catch {
      return;
    }
    if (msg.type === "say") {
      const { id } = msg;
      if (!gradiumEnabled()) {
        send({ type: "speech_end", id, ok: false });
        return;
      }
      const job = synthesize(msg.text, msg.voice ?? VOICES.astra, (audio) => send({ type: "speech_audio", id, audio, sample_rate: SAMPLE_RATE }));
      speeches.set(id, job.cancel);
      void job.done.then((ok) => {
        if (speeches.delete(id)) send({ type: "speech_end", id, ok });
      });
    } else if (msg.type === "stop_speech") stopSpeech();
    else if (msg.type === "listen_start") {
      listener?.close();
      if (!gradiumEnabled()) {
        send({ type: "error", message: "Speech recognition unavailable (Gradium key missing)." });
        return;
      }
      listener = new CommandListener(
        msg.language,
        msg.keywords,
        (text) => send({ type: "transcript", text }),
        (ready) => send({ type: "listening", ready }),
      );
    } else if (msg.type === "listen_audio") listener?.push(msg.audio);
    else if (msg.type === "listen_stop") {
      listener?.close();
      listener = null;
    }
  });

  server.addEventListener("close", () => {
    stopSpeech();
    listener?.close();
  });

  return new Response(null, { status: 101, webSocket: client });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    applyEnv(env);
    const url = new URL(request.url);
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      if (url.pathname === "/ws") return gameSocket();
      if (url.pathname === "/ws/home") return homeSocket();
      return new Response("unknown socket", { status: 404 });
    }
    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        voice: gradiumEnabled(),
        ai: Boolean(process.env.GOOGLE_API_KEY || (globalThis as { __GOOGLE?: string }).__GOOGLE),
      });
    }
    return env.ASSETS.fetch(request);
  },
};
