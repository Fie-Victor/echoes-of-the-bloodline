import { audioListener } from "./voice.ts";

export type Sfx = "musket" | "cannon" | "clash" | "hit" | "bow" | "thud" | "drum" | "horn" | "explosion";

const ctx = audioListener.context;
let noise: AudioBuffer | null = null;

function noiseBuffer(): AudioBuffer {
  if (noise) return noise;
  noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

function envelope(gain: number, attack: number, decay: number, at: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  g.connect(ctx.destination);
  return g;
}

function noiseHit(gain: number, decay: number, type: BiquadFilterType, freq: number, q: number, at: number): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer();
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  src.connect(f).connect(envelope(gain, 0.004, decay, at));
  src.start(at, Math.random());
  src.stop(at + decay + 0.1);
}

function tone(type: OscillatorType, from: number, to: number, gain: number, attack: number, decay: number, at: number): void {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, at);
  o.frequency.exponentialRampToValueAtTime(to, at + attack + decay);
  o.connect(envelope(gain, attack, decay, at));
  o.start(at);
  o.stop(at + attack + decay + 0.05);
}

/** Procedural battle sounds; `distance` (metres) delays and attenuates them like a real battlefield would. */
export function playSfx(kind: Sfx, distance = 0): void {
  if (ctx.state !== "running") return;
  const at = ctx.currentTime + distance / 343;
  const v = 1 / (1 + distance * 0.08);
  switch (kind) {
    case "musket":
      noiseHit(0.9 * v, 0.35, "lowpass", 2200 - distance * 20, 0.7, at);
      tone("sine", 140, 40, 0.5 * v, 0.003, 0.25, at);
      break;
    case "cannon":
      noiseHit(1.2 * v, 1.6, "lowpass", 600, 0.8, at);
      tone("sine", 70, 25, 1.0 * v, 0.005, 1.2, at);
      break;
    case "explosion":
      noiseHit(1.0 * v, 1.1, "lowpass", 900, 0.6, at);
      tone("triangle", 90, 30, 0.6 * v, 0.004, 0.8, at);
      break;
    case "clash":
      for (const f of [2300, 3400, 5100]) tone("square", f * (0.95 + Math.random() * 0.1), f * 0.97, 0.05 * v, 0.001, 0.25, at);
      noiseHit(0.35 * v, 0.08, "highpass", 3000, 0.5, at);
      break;
    case "hit":
      noiseHit(0.6 * v, 0.12, "bandpass", 500, 1.2, at);
      tone("sine", 110, 60, 0.4 * v, 0.002, 0.12, at);
      break;
    case "thud":
      tone("sine", 90, 45, 0.5 * v, 0.004, 0.3, at);
      noiseHit(0.3 * v, 0.2, "lowpass", 400, 0.7, at);
      break;
    case "bow":
      noiseHit(0.25 * v, 0.45, "bandpass", 1500, 3, at);
      break;
    case "drum":
      tone("sine", 75, 50, 0.9 * v, 0.004, 0.55, at);
      noiseHit(0.2 * v, 0.15, "lowpass", 300, 0.7, at);
      break;
    case "horn":
      tone("sawtooth", 196, 190, 0.12 * v, 0.15, 1.6, at);
      tone("sawtooth", 294, 290, 0.08 * v, 0.2, 1.5, at);
      break;
  }
}
