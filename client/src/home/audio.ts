export const SAMPLE_RATE = 24000;

function b64ToInt16(b64: string): Int16Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer, 0, bytes.length >> 1);
}

function bufferToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Gapless playback of streamed PCM chunks, with an analyser for the speaking visualiser. */
export class PcmPlayer {
  readonly ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  readonly analyser = this.ctx.createAnalyser();
  private gain = this.ctx.createGain();
  private cursor = 0;
  private sources = new Set<AudioBufferSourceNode>();

  constructor() {
    this.analyser.fftSize = 256;
    this.gain.connect(this.analyser).connect(this.ctx.destination);
  }

  resume(): Promise<void> {
    return this.ctx.resume();
  }

  /** Schedules a chunk and returns the context time at which it starts. */
  enqueue(b64: string, sampleRate: number): number {
    const pcm = b64ToInt16(b64);
    const buf = this.ctx.createBuffer(1, pcm.length, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) data[i] = pcm[i] / 0x8000;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);
    const start = Math.max(this.cursor, this.ctx.currentTime + 0.05);
    src.start(start);
    this.cursor = start + buf.duration;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
    return start;
  }

  /** Reserves a silent gap in the playback timeline (used when a line has no audio). */
  enqueueSilence(seconds: number): void {
    this.cursor = Math.max(this.cursor, this.ctx.currentTime) + seconds;
  }

  /** Context time at which everything queued so far will have finished. */
  get endTime(): number {
    return Math.max(this.cursor, this.ctx.currentTime);
  }

  get playing(): boolean {
    return this.cursor > this.ctx.currentTime;
  }

  stop(): void {
    for (const s of this.sources) s.stop();
    this.sources.clear();
    this.cursor = 0;
  }
}

export type MicError = "denied" | "no-device" | "insecure" | "unsupported" | "unknown";

/** Microphone capture as base64 16-bit PCM frames at 24 kHz. */
export class MicCapture {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  level = 0;

  async start(onFrame: (b64: string) => void): Promise<MicError | null> {
    if (!window.isSecureContext) return "insecure";
    if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") return "denied";
      if (name === "NotFoundError" || name === "OverconstrainedError") return "no-device";
      return "unknown";
    }
    this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    const workletUrl = new URL("pcm-worklet.js", document.baseURI || window.location.href).href;
    await this.ctx.audioWorklet.addModule(workletUrl);
    const src = this.ctx.createMediaStreamSource(this.stream);
    const node = new AudioWorkletNode(this.ctx, "pcm-capture");
    node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      const pcm = new Int16Array(e.data);
      let sum = 0;
      for (let i = 0; i < pcm.length; i += 8) sum += Math.abs(pcm[i]);
      this.level = sum / (pcm.length / 8) / 0x8000;
      onFrame(bufferToB64(e.data));
    };
    src.connect(node);
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    node.connect(sink).connect(this.ctx.destination);
    await this.ctx.resume();
    return null;
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.ctx = null;
    this.stream = null;
  }
}
