export type NpcState = "idle" | "angry" | "suspicious" | "friendly";

export interface GameContext {
  era: string;
  player_inventory: string[];
  npc_trust: number;
}

export interface NpcRequest {
  npc_id: string;
  player_input: string;
  game_context: GameContext;
}

export interface NpcResponse {
  dialogue: string;
  npc_state: NpcState;
  new_trust: number;
  trigger_devin_ui: string | null;
}

export type ClientMessage =
  | { type: "talk"; request: NpcRequest }
  | { type: "puzzle_solved"; puzzle_id: string }
  /** Push-to-talk: opens a Gradium STT stream; the final transcript is routed to `npc_id` like a "talk". */
  | { type: "voice_start"; npc_id: string; game_context: GameContext }
  /** Base64 16-bit mono PCM @ 24 kHz. */
  | { type: "voice_audio"; audio: string }
  | { type: "voice_end" }
  /** Speak a scripted line (no LLM) with the speaker's voice. */
  | { type: "say"; npc_id: string; text: string }
  | { type: "stop_speech" };

export type ServerMessage =
  | { type: "npc_reply"; npc_id: string; response: NpcResponse; source: "gemini" | "mock" }
  | { type: "npc_thinking"; npc_id: string }
  | { type: "hologram"; puzzle_id: string; html: string }
  | { type: "transcript"; text: string; final: boolean }
  /** Base64 16-bit mono PCM chunk. */
  | { type: "speech_audio"; npc_id: string; audio: string; sample_rate: number }
  /** `ok: false` means TTS was unavailable; the client may fall back to local synthesis of `text`. */
  | { type: "speech_end"; npc_id: string; ok: boolean; text: string }
  | { type: "error"; message: string };
