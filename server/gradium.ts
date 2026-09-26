import WebSocket from "ws";

const API = "wss://api.gradium.ai/api/speech";
export const SAMPLE_RATE = 24000;
const KEY = process.env.GRADIUM_API_KEY;

export const VOICES: Record<string, string> = {
  achilles_01: process.env.GRADIUM_VOICE_ACHILLES ?? "7HhpTMy55D4HkXen", // Vianney: deep, resonant
  astra: process.env.GRADIUM_VOICE_ASTRA ?? "b-1LP0pKWL1tNgml", // Albane: precise, clinical
};

export const gradiumEnabled = (): boolean => Boolean(KEY) && process.env.MOCK_VOICE !== "1";

function open(endpoint: "tts" | "asr", setup: object): WebSocket {
  const ws = new WebSocket(`${API}/${endpoint}`, { headers: { "x-api-key": KEY ?? "" } });
  ws.on("open", () => ws.send(JSON.stringify({ type: "setup", model_name: "default", ...setup })));
  return ws;
}

interface GradiumMessage {
  type: string;
  text?: string;
  audio?: string;
  message?: string;
}

/** Streams synthesized PCM chunks; resolves true when the stream completed normally. */
export function synthesize(text: string, voiceId: string, onAudio: (b64: string) => void): { done: Promise<boolean>; cancel: () => void } {
  const ws = open("tts", { voice_id: voiceId, output_format: `pcm_${SAMPLE_RATE}` });
  let sent = false;
  const done = new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => ws.terminate(), 15_000);
    ws.on("message", (data) => {
      const m = JSON.parse(data.toString()) as GradiumMessage;
      if (m.type === "ready") {
        ws.send(JSON.stringify({ type: "text", text }));
        ws.send(JSON.stringify({ type: "end_of_stream" }));
      } else if (m.type === "audio" && m.audio) {
        sent = true;
        onAudio(m.audio);
      } else if (m.type === "error") console.warn("[gradium tts]", m.message);
    });
    ws.on("error", (e) => console.warn("[gradium tts]", e.message));
    ws.on("close", () => {
      clearTimeout(timer);
      resolve(sent);
    });
  });
  return { done, cancel: () => ws.terminate() };
}

/** One push-to-talk utterance: feed audio, then `finish()` flushes and resolves the full transcript. */
export class Transcriber {
  private ws: WebSocket;
  private ready = false;
  private finishing = false;
  private pending: string[] = [];
  private words: string[] = [];
  private result: Promise<string>;

  constructor(language: string, onPartial: (text: string) => void) {
    this.ws = open("asr", { input_format: "pcm", json_config: { language } });
    this.result = new Promise((resolve) => {
      const timer = setTimeout(() => this.ws.terminate(), 60_000);
      this.ws.on("message", (data) => {
        const m = JSON.parse(data.toString()) as GradiumMessage;
        if (m.type === "ready") {
          this.ready = true;
          for (const a of this.pending.splice(0)) this.sendAudio(a);
          if (this.finishing) this.flush();
        } else if (m.type === "text" && m.text) {
          this.words.push(m.text);
          onPartial(this.text());
        } else if (m.type === "flushed") {
          this.ws.send(JSON.stringify({ type: "end_of_stream" }));
        } else if (m.type === "error") console.warn("[gradium stt]", m.message);
      });
      this.ws.on("error", (e) => console.warn("[gradium stt]", e.message));
      this.ws.on("close", () => {
        clearTimeout(timer);
        resolve(this.text());
      });
    });
  }

  private text(): string {
    return this.words.join(" ").replace(/\s+/g, " ").trim();
  }

  private sendAudio(b64: string): void {
    this.ws.send(JSON.stringify({ type: "audio", audio: b64 }));
  }

  push(b64: string): void {
    if (this.ready && this.ws.readyState === WebSocket.OPEN) this.sendAudio(b64);
    else this.pending.push(b64);
  }

  private flush(): void {
    this.ws.send(JSON.stringify({ type: "flush", flush_id: 1 }));
  }

  finish(): Promise<string> {
    this.finishing = true;
    if (this.ready) this.flush();
    return this.result;
  }

  abort(): void {
    this.ws.terminate();
  }
}
