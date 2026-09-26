import type { HomeClientMessage, HomeServerMessage } from "../../../shared/home-protocol.ts";
import { PcmPlayer } from "./audio.ts";

interface Line {
  id: number;
  text: string;
  chunks: { audio: string; rate: number }[];
  ended: boolean;
  ok: boolean;
  shown: boolean;
}

/**
 * Plays Astra's lines in order through Gradium TTS. All lines of a batch are
 * requested at once for low latency; each subtitle appears when its audio starts.
 */
export class Speaker {
  readonly player = new PcmPlayer();
  private nextId = 1;
  private queue: Line[] = [];
  private timers: number[] = [];
  private finish: (() => void) | null = null;
  current = "";

  constructor(
    private send: (m: HomeClientMessage) => void,
    private onSubtitle: (text: string) => void,
  ) {}

  say(lines: string[]): Promise<void> {
    this.interrupt();
    this.queue = lines.map((text) => ({ id: this.nextId++, text, chunks: [], ended: false, ok: false, shown: false }));
    for (const l of this.queue) this.send({ type: "say", id: l.id, text: l.text });

    // Offline / timeout fallback if WebSocket server doesn't respond
    const fallbackTimer = window.setTimeout(() => {
      let triggered = false;
      for (const line of this.queue) {
        if (!line.ended && line.chunks.length === 0) {
          line.ended = true;
          line.ok = false;
          triggered = true;
        }
      }
      if (triggered) {
        this.pump();
        // Optional local speech synthesis fallback
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          try {
            const first = lines[0];
            if (first) {
              const u = new SpeechSynthesisUtterance(first);
              u.lang = "fr-FR";
              u.pitch = 1.2;
              speechSynthesis.speak(u);
            }
          } catch {}
        }
      }
    }, 750);
    this.timers.push(fallbackTimer);

    return new Promise((resolve) => {
      this.finish = resolve;
    });
  }

  interrupt(): void {
    if (this.queue.length) this.send({ type: "stop_speech" });
    this.queue = [];
    this.player.stop();
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.current = "";
    this.onSubtitle("");
    const f = this.finish;
    this.finish = null;
    f?.();
  }

  get speaking(): boolean {
    return this.queue.length > 0 || this.player.playing;
  }

  handle(m: HomeServerMessage): void {
    if (m.type === "speech_audio") {
      const line = this.queue.find((l) => l.id === m.id);
      if (!line) return;
      line.chunks.push({ audio: m.audio, rate: m.sample_rate });
      this.pump();
    } else if (m.type === "speech_end") {
      const line = this.queue.find((l) => l.id === m.id);
      if (!line) return;
      line.ended = true;
      line.ok = m.ok;
      this.pump();
    }
  }

  private later(atCtxTime: number, fn: () => void): void {
    const ms = Math.max(0, (atCtxTime - this.player.ctx.currentTime) * 1000);
    this.timers.push(window.setTimeout(fn, ms));
  }

  private pump(): void {
    while (this.queue.length) {
      const line = this.queue[0];
      if (line.chunks.length) {
        let start = -1;
        for (const c of line.chunks.splice(0)) {
          const t = this.player.enqueue(c.audio, c.rate);
          if (start < 0) start = t;
        }
        if (!line.shown) {
          line.shown = true;
          this.later(start, () => {
            this.current = line.text;
            this.onSubtitle(line.text);
          });
        }
      }
      if (!line.ended) return;
      this.queue.shift();
      if (!line.shown) {
        // TTS unavailable: subtitle only, timed on reading speed.
        const start = this.player.endTime;
        const dur = Math.max(1.8, line.text.length * 0.055);
        this.later(start, () => {
          this.current = line.text;
          this.onSubtitle(line.text);
        });
        this.player.enqueueSilence(dur);
      }
    }
    const end = this.player.endTime;
    this.later(end + 0.15, () => {
      if (this.queue.length) return;
      this.current = "";
      this.onSubtitle("");
      const f = this.finish;
      this.finish = null;
      f?.();
    });
  }
}
