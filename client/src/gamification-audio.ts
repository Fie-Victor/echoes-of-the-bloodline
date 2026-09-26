// Procedural sound effects for gamification using Web Audio API (zero external assets needed)

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

/** Bright crystalline chime when points are gained */
export function playPointChime(combo = 1): void {
  try {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    const baseFreq = 660 * Math.min(2.0, 1 + (combo - 1) * 0.15);

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc2.type = "triangle";

    osc1.frequency.setValueAtTime(baseFreq, t);
    osc1.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, t + 0.15);

    osc2.frequency.setValueAtTime(baseFreq * 2, t);
    osc2.frequency.exponentialRampToValueAtTime(baseFreq * 2.5, t + 0.18);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.3);
    osc2.stop(t + 0.3);
  } catch {}
}

/** Ascending arpeggio when combo multiplier increases */
export function playComboSound(multiplier: number): void {
  try {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880, 1108.73, 1318.51];
    const baseIdx = Math.min(notes.length - 2, Math.max(0, multiplier - 1));

    [notes[baseIdx], notes[baseIdx + 1]].forEach((freq, idx) => {
      const noteTime = t + idx * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, noteTime);

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1400, noteTime);

      gain.gain.setValueAtTime(0.18, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.22);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.24);
    });
  } catch {}
}

/** Visceral impact when taking damage */
export function playPlayerHurtSound(): void {
  try {
    const ctx = getAudioContext();
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(32, t + 0.3);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(500, t);

    gain.gain.setValueAtTime(0.45, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.36);
  } catch {}
}

/** Dramatic temporal glitch when a Chrono-Core / life is lost */
export function playLifeLostSound(): void {
  try {
    const ctx = getAudioContext();
    const t = ctx.currentTime;

    // Sub rumble
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(90, t);
    sub.frequency.exponentialRampToValueAtTime(25, t + 0.7);
    subGain.gain.setValueAtTime(0.5, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(t);
    sub.stop(t + 0.8);

    // Glitch sweep
    const glitch = ctx.createOscillator();
    const glitchGain = ctx.createGain();
    glitch.type = "square";
    glitch.frequency.setValueAtTime(800, t);
    glitch.frequency.exponentialRampToValueAtTime(70, t + 0.45);
    glitchGain.gain.setValueAtTime(0.3, t);
    glitchGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(600, t);
    filter.Q.setValueAtTime(4, t);

    glitch.connect(filter);
    filter.connect(glitchGain);
    glitchGain.connect(ctx.destination);
    glitch.start(t);
    glitch.stop(t + 0.52);
  } catch {}
}

/** Triumphant 4-note brass fanfare for unlocked achievement */
export function playAchievementFanfare(): void {
  try {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    const notes = [
      { f: 523.25, d: 0.14 }, // C5
      { f: 659.25, d: 0.14 }, // E5
      { f: 783.99, d: 0.14 }, // G5
      { f: 1046.5, d: 0.5 },  // C6
    ];

    let offset = 0;
    notes.forEach((n) => {
      const noteTime = t + offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(n.f, noteTime);

      gain.gain.setValueAtTime(0.28, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + n.d);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + n.d + 0.05);

      offset += n.d * 0.8;
    });
  } catch {}
}

/** Epic victory chords */
export function playVictoryChords(): void {
  try {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    const chords = [
      [523.25, 659.25, 783.99],   // C maj
      [587.33, 739.99, 880.0],    // D maj
      [659.25, 830.61, 987.77],   // E maj
      [1046.5, 1318.5, 1567.98],  // High C maj
    ];

    chords.forEach((chord, cIdx) => {
      const chordTime = t + cIdx * 0.28;
      chord.forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, chordTime);

        gain.gain.setValueAtTime(0.18, chordTime);
        gain.gain.exponentialRampToValueAtTime(0.001, chordTime + 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(chordTime);
        osc.stop(chordTime + 0.65);
      });
    });
  } catch {}
}
