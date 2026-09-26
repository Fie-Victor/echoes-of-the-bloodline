import * as THREE from "three";

/** Gradium's PCM rate. The AudioContext runs at the device rate; capture is resampled in the worklet. */
const SAMPLE_RATE = 24000;
const CHUNK = 1920; // 80 ms

const ctx = new AudioContext();
THREE.AudioContext.setContext(ctx);
export const audioListener = new THREE.AudioListener();

export function resumeAudio(): void {
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Plays streamed PCM chunks from a 3D emitter per speaker with dual positional + clear dialogue blend. */
export class VoicePlayer {
  private emitters: Record<string, THREE.PositionalAudio> = {};
  private endTime: Record<string, number> = {};
  private sources = new Set<AudioBufferSourceNode>();
  private masterGain: GainNode;

  constructor() {
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 1.0;
    this.masterGain.connect(ctx.destination);
  }

  register(id: string, anchor: THREE.Object3D, height: number): void {
    const emitter = new THREE.PositionalAudio(audioListener);
    emitter.setRefDistance(10.0);
    emitter.setRolloffFactor(0.25);
    emitter.setMaxDistance(120);
    emitter.position.y = height;
    anchor.add(emitter);
    this.emitters[id] = emitter;
  }

  play(id: string, b64: string, sampleRate: number): void {
    resumeAudio();
    const raw = atob(b64);
    const pcm = new Int16Array(raw.length >> 1);
    for (let i = 0; i < pcm.length; i++) pcm[i] = raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8);
    const buf = ctx.createBuffer(1, pcm.length, sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const emitter = this.emitters[id];
    if (emitter) {
      // Connect to positional audio for spatial feeling
      try {
        src.connect(emitter.getOutput());
      } catch {}
      // Dual-connect with a direct dialogue gain so speech is never muffled or inaudible
      const directGain = ctx.createGain();
      directGain.gain.value = 0.85;
      src.connect(directGain).connect(this.masterGain);
    } else {
      src.connect(this.masterGain);
    }

    const at = Math.max(ctx.currentTime + 0.05, this.endTime[id] ?? 0);
    src.start(at);
    this.endTime[id] = at + buf.duration;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }

  isSpeaking(id?: string): boolean {
    if (id) return ctx.currentTime < (this.endTime[id] ?? 0);
    return Object.values(this.endTime).some((t) => ctx.currentTime < t);
  }

  stop(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {}
    }
    this.sources.clear();
    this.endTime = {};
    if ("speechSynthesis" in window) {
      try {
        speechSynthesis.cancel();
      } catch {}
    }
  }
}

const WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Int16Array(${CHUNK});
    this.n = 0;
    this.acc = 0;
    this.cnt = 0;
    this.t = 0;
    this.energy = 0;
    this.port.onmessage = () => {
      if (this.n) this.port.postMessage({ pcm: this.buf.slice(0, this.n), rms: 0 });
      this.n = 0;
      this.port.postMessage("flushed");
    };
  }
  process(inputs) {
    const ch = inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i];
      this.cnt++;
      this.t += ${SAMPLE_RATE};
      if (this.t < sampleRate) continue;
      this.t -= sampleRate;
      const s = Math.max(-1, Math.min(1, this.acc / this.cnt));
      this.acc = 0;
      this.cnt = 0;
      this.energy += s * s;
      this.buf[this.n++] = s < 0 ? s * 32768 : s * 32767;
      if (this.n === ${CHUNK}) {
        this.port.postMessage({ pcm: this.buf.slice(), rms: Math.sqrt(this.energy / ${CHUNK}) });
        this.n = 0;
        this.energy = 0;
      }
    }
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
`;

export interface MicEvents {
  /** 80 ms of base64 16-bit PCM @ 24 kHz, only while an utterance is open. */
  onChunk(b64: string): void;
  onSpeechStart(): void;
  onSpeechEnd(): void;
}

const PREROLL = 4;
const START_FRAMES = 3;
const END_FRAMES = 12; // ~960 ms of silence closes the utterance
const MAX_FRAMES = 220; // ~17 s

/**
 * Microphone streaming to Gradium. In "vad" mode it listens hands-free and opens/closes utterances on voice
 * activity (with a short pre-roll so the first syllable is kept); in "ptt" mode the caller opens/closes them.
 */
export class Microphone {
  private node: AudioWorkletNode | null = null;
  private mode: "off" | "vad" | "ptt" = "off";
  private open = false;
  private preroll: string[] = [];
  private loud = 0;
  private quiet = 0;
  private frames = 0;
  private floor = 0.01;
  private flushed: (() => void) | null = null;
  /** Raised while an NPC is speaking so its own voice leaking into the mic does not trigger barge-in. */
  strict = false;

  constructor(private ev: MicEvents) {}

  private async init(): Promise<AudioWorkletNode> {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("le micro exige une page en https");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" })));
    const node = new AudioWorkletNode(ctx, "pcm-capture");
    node.port.onmessage = (e: MessageEvent<{ pcm: Int16Array; rms: number } | string>) => {
      if (typeof e.data === "string") this.flushed?.();
      else this.frame(toBase64(new Uint8Array(e.data.pcm.buffer)), e.data.rms);
    };
    const mute = ctx.createGain();
    mute.gain.value = 0;
    ctx.createMediaStreamSource(stream).connect(node).connect(mute).connect(ctx.destination);
    return node;
  }

  get listening(): boolean {
    return this.mode !== "off";
  }

  async listen(mode: "vad" | "ptt"): Promise<void> {
    await ctx.resume();
    this.node ??= await this.init();
    if (this.open) await this.close();
    this.mode = mode;
    this.loud = this.quiet = 0;
    this.preroll = [];
    if (mode === "ptt") this.begin();
  }

  /** Stops listening; an open utterance is flushed and ended. */
  async stop(): Promise<void> {
    if (this.open) await this.close();
    this.mode = "off";
  }

  private begin(): void {
    this.open = true;
    this.frames = 0;
    this.quiet = 0;
    this.ev.onSpeechStart();
    for (const c of this.preroll.splice(0)) this.ev.onChunk(c);
  }

  private close(): Promise<void> {
    this.open = false;
    const node = this.node;
    if (!node) return Promise.resolve();
    return new Promise((resolve) => {
      this.flushed = () => {
        this.flushed = null;
        this.ev.onSpeechEnd();
        resolve();
      };
      node.port.postMessage("flush");
    });
  }

  private frame(b64: string, rms: number): void {
    if (this.mode === "off") return;
    if (this.open) {
      this.ev.onChunk(b64);
      this.frames++;
      if (this.mode !== "vad") return;
      this.quiet = rms < this.threshold() ? this.quiet + 1 : 0;
      if (this.quiet >= END_FRAMES || this.frames >= MAX_FRAMES) void this.close();
      return;
    }
    if (this.flushed) return;
    this.preroll.push(b64);
    if (this.preroll.length > PREROLL) this.preroll.shift();
    const thr = this.threshold();
    if (rms < thr) this.floor += (rms - this.floor) * 0.05;
    this.loud = rms > thr ? this.loud + 1 : 0;
    if (this.mode === "vad" && this.loud >= (this.strict ? START_FRAMES + 3 : START_FRAMES)) this.begin();
  }

  private threshold(): number {
    return Math.max(this.strict ? 0.09 : 0.02, this.floor * (this.strict ? 6 : 3));
  }
}

/** Browser speech synthesis fallback. */
export function speakLocal(text: string, speaker: "npc" | "astra"): void {
  if (!("speechSynthesis" in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    u.pitch = speaker === "astra" ? 1.2 : 0.8;
    speechSynthesis.speak(u);
  } catch {}
}
