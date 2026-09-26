// Procedural battle sound effects using Web Audio API (zero asset loading delay / no 404s)

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
  return audioCtx;
}

/** Resounding ancient Greek war horn */
export function playWarHorn(): void {
  try {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc1.type = "sawtooth";
    osc2.type = "triangle";

    // Horn pitch envelope (rise then sustain)
    osc1.frequency.setValueAtTime(146.83, t); // D3
    osc1.frequency.linearRampToValueAtTime(164.81, t + 0.3); // E3
    osc1.frequency.exponentialRampToValueAtTime(146.83, t + 2.0);

    osc2.frequency.setValueAtTime(220, t); // A3 fifth
    osc2.frequency.linearRampToValueAtTime(246.94, t + 0.3);
    osc2.frequency.exponentialRampToValueAtTime(220, t + 2.0);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.linearRampToValueAtTime(1200, t + 0.4);
    filter.frequency.exponentialRampToValueAtTime(300, t + 2.4);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.35, t + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 2.5);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 2.6);
    osc2.stop(t + 2.6);
  } catch {}
}

/** Deep war drum beat */
export function playWarDrum(intensity = 0.4): void {
  try {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.25);

    gain.gain.setValueAtTime(intensity, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.5);
  } catch {}
}

/** Metallic clash of spears and bronze shields */
export function playClashSound(): void {
  try {
    const ctx = getAudioContext();
    const t = ctx.currentTime;

    // Noise burst
    const bufferSize = ctx.sampleRate * 0.15;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.03));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // Resonant ring of bronze
    const ring = ctx.createOscillator();
    ring.type = "sine";
    ring.frequency.setValueAtTime(840, t);
    ring.frequency.exponentialRampToValueAtTime(420, t + 0.3);

    const ringGain = ctx.createGain();
    ringGain.gain.setValueAtTime(0.25, t);
    ringGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    noise.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    ring.connect(ringGain);
    ringGain.connect(ctx.destination);

    noise.start(t);
    ring.start(t);
    ring.stop(t + 0.4);
  } catch {}
}

/** Dodge swish / roll */
export function playDodgeSound(): void {
  try {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.22);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.26);
  } catch {}
}

/** Hit impact sound */
export function playHitSound(): void {
  try {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.18);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.22);
  } catch {}
}
