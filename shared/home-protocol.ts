export type HomeClientMessage =
  /** Synthesize one line with Gradium TTS; audio chunks come back tagged with `id`. */
  | { type: "say"; id: number; text: string; voice?: string }
  | { type: "stop_speech" }
  /** Opens a continuous Gradium STT stream for voice commands. */
  | { type: "listen_start"; language: string; keywords: string[] }
  /** Base64 16-bit mono PCM @ 24 kHz. */
  | { type: "listen_audio"; audio: string }
  | { type: "listen_stop" };

export type HomeServerMessage =
  | { type: "hello"; tts: boolean; stt: boolean }
  /** Base64 16-bit mono PCM chunk. */
  | { type: "speech_audio"; id: number; audio: string; sample_rate: number }
  /** `ok: false` means TTS was unavailable; the client shows the subtitle only. */
  | { type: "speech_end"; id: number; ok: boolean }
  | { type: "listening"; ready: boolean }
  | { type: "transcript"; text: string }
  | { type: "error"; message: string };
