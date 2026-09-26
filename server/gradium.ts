import WebSocket from "ws";

const API = "wss://api.gradium.ai/api/speech";
export const SAMPLE_RATE = 24000;
const KEY = process.env.GRADIUM_API_KEY;

export const VOICES: Record<string, string> = {
  achilles_01: process.env.GRADIUM_VOICE_ACHILLES ?? "7HhpTMy55D4HkXen", // Vianney: deep, resonant
  caesar_01: process.env.GRADIUM_VOICE_CAESAR ?? "7HhpTMy55D4HkXen",
  jeanne_01: process.env.GRADIUM_VOICE_JEANNE ?? "b-1LP0pKWL1tNgml",
  ieyasu_01: process.env.GRADIUM_VOICE_IEYASU ?? "7HhpTMy55D4HkXen",
  napoleon_01: process.env.GRADIUM_VOICE_NAPOLEON ?? "7HhpTMy55D4HkXen",
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

// Queue to serialize TTS requests and respect Gradium's active session limit
let ttsQueue = Promise.resolve();

function doSynthesize(
  text: string,
  voiceId: string,
  onAudio: (b64: string) => void,
  isCancelled: () => boolean,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (isCancelled()) {
      resolve(false);
      return;
    }

    let ws: WebSocket | null = null;
    let sent = false;
    let timer: NodeJS.Timeout;

    const cleanup = () => {
      clearTimeout(timer);
      if (ws) {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          try {
            ws.close();
          } catch {}
        }
        ws = null;
      }
    };

    timer = setTimeout(() => {
      cleanup();
      resolve(sent);
    }, 15_000);

    try {
      ws = open("tts", { voice_id: voiceId, output_format: `pcm_${SAMPLE_RATE}` });
    } catch (e) {
      cleanup();
      resolve(false);
      return;
    }

    ws.on("message", (data) => {
      if (isCancelled()) {
        cleanup();
        resolve(sent);
        return;
      }
      try {
        const m = JSON.parse(data.toString()) as GradiumMessage;
        if (m.type === "ready") {
          ws?.send(JSON.stringify({ type: "text", text }));
          ws?.send(JSON.stringify({ type: "end_of_stream" }));
        } else if (m.type === "audio" && m.audio) {
          sent = true;
          onAudio(m.audio);
        } else if (m.type === "end_of_stream") {
          // Immediately close socket to free Gradium session slot
          cleanup();
          resolve(sent);
        } else if (m.type === "error") {
          console.warn("[gradium tts]", m.message);
          cleanup();
          resolve(sent);
        }
      } catch (err) {
        console.warn("[gradium tts parse error]", err);
      }
    });

    ws.on("error", (e) => {
      console.warn("[gradium tts error]", e.message);
      cleanup();
      resolve(sent);
    });

    ws.on("close", () => {
      cleanup();
      resolve(sent);
    });
  });
}

/** Streams synthesized PCM chunks; resolves true when the stream completed normally. */
export function synthesize(
  text: string,
  voiceId: string,
  onAudio: (b64: string) => void,
): { done: Promise<boolean>; cancel: () => void } {
  let cancelled = false;

  const job = async (): Promise<boolean> => {
    if (cancelled) return false;
    let ok = await doSynthesize(text, voiceId, onAudio, () => cancelled);
    // If failed and not cancelled, retry once after 350ms (in case a previous session just released)
    if (!ok && !cancelled) {
      await new Promise((r) => setTimeout(r, 350));
      if (!cancelled) {
        ok = await doSynthesize(text, voiceId, onAudio, () => cancelled);
      }
    }
    return ok;
  };

  const done = ttsQueue.then(job, job);
  ttsQueue = done.then(() => {}, () => {});

  return {
    done,
    cancel: () => {
      cancelled = true;
    },
  };
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
        } else if (m.type === "end_of_stream") {
          try {
            this.ws.close();
          } catch {}
        } else if (m.type === "error") {
          console.warn("[gradium stt]", m.message);
          try {
            this.ws.close();
          } catch {}
        }
      });
      this.ws.on("error", (e) => {
        console.warn("[gradium stt]", e.message);
        try {
          this.ws.close();
        } catch {}
      });
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
    try {
      this.ws.terminate();
    } catch {}
  }
}

/** Long-lived STT stream: every transcribed segment is reported as it arrives; reconnects if Gradium closes it. */
export class CommandListener {
  private ws: WebSocket | null = null;
  private ready = false;
  private closed = false;

  constructor(
    private language: string,
    private keywords: string[],
    private onText: (text: string) => void,
    private onReady: (ready: boolean) => void,
  ) {
    this.connect();
  }

  private connect(): void {
    this.ready = false;
    const json_config: Record<string, unknown> = { language: this.language };
    if (this.keywords.length) json_config.keywords = { words: this.keywords, boost: 3 };
    const ws = open("asr", { input_format: "pcm", json_config });
    this.ws = ws;
    ws.on("message", (data) => {
      const m = JSON.parse(data.toString()) as GradiumMessage;
      if (m.type === "ready") {
        this.ready = true;
        this.onReady(true);
      } else if (m.type === "text" && m.text) this.onText(m.text);
      else if (m.type === "error") console.warn("[gradium stt]", m.message);
    });
    ws.on("error", (e) => console.warn("[gradium stt]", e.message));
    ws.on("close", () => {
      if (this.ws !== ws) return;
      this.ready = false;
      this.onReady(false);
      if (!this.closed) setTimeout(() => !this.closed && this.connect(), 1000);
    });
  }

  push(b64: string): void {
    if (this.ready && this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: "audio", audio: b64 }));
  }

  close(): void {
    this.closed = true;
    try {
      this.ws?.terminate();
    } catch {}
    this.ws = null;
  }
}
