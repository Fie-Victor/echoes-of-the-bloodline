import type { NpcRequest, NpcResponse, NpcState } from "../shared/protocol.ts";
import type { NpcDefinition, NpcMemory } from "./npcs.ts";

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
const GEMINI_TIMEOUT_MS = 10_000;
const STATES: NpcState[] = ["idle", "angry", "suspicious", "friendly"];
const TRIGGERS = ["generate_puzzle_lock"];

function buildPrompt(def: NpcDefinition, mem: NpcMemory, req: NpcRequest): string {
  const secrets = def.secrets.map((s, i) => `${i}. ${s} (already revealed: ${mem.knowledge_revealed[i]})`).join("\n");
  const history = mem.history.slice(-10).map((h) => `${h.speaker === "player" ? "Player" : def.name}: ${h.text}`).join("\n");
  return `You are a character in a narrative time-travel video game. Stay strictly in character.

CHARACTER: ${def.persona}
ERA RULES (no anachronisms): ${def.eraRules}

CURRENT STATE:
- trust_level: ${mem.trust_level}/100
- patience: ${mem.patience}/100
- mood: ${mem.state}
- secrets:
${secrets || "(none)"}

GAME CONTEXT: ${JSON.stringify(req.game_context)}

RECENT HISTORY:
${history || "(start of the conversation)"}

GAME RULES:
- Reveal a secret only if trust is above 70 and the player has earned it.
${
    def.id === "achilles_01"
      ? `- If trust is 80 or higher and the player asks for help with the seal, the tent, or the lock, set trigger_devin_ui to "generate_puzzle_lock". Otherwise null.`
      : "- trigger_devin_ui is always null."
  }
- Adjust new_trust (0-100) from the player's respect, relevance, and sincerity (at most ±15 per line).
- Reply in English only, 1 to 3 short sentences, written to be spoken aloud.

The player says: "${req.player_input}"`;
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    dialogue: { type: "STRING" },
    npc_state: { type: "STRING", enum: STATES },
    new_trust: { type: "INTEGER" },
    trigger_devin_ui: { type: "STRING", nullable: true, enum: TRIGGERS },
    revealed_secret_index: { type: "INTEGER", nullable: true },
  },
  required: ["dialogue", "npc_state", "new_trust"],
};

interface GeminiNpcResponse extends NpcResponse {
  revealed_secret_index?: number | null;
}

interface GeminiApiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

async function askGemini(prompt: string, apiKey: string): Promise<GeminiNpcResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.8,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as GeminiApiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini: empty response");
  return JSON.parse(text) as GeminiNpcResponse;
}

const ASTRA_HINTS: Record<string, string[]> = {
  troy: ["Scanning. Achilles is by the fire, to the north. Earn his trust, and do not mention the future."],
  alesia: [
    "Caesar is in his command tent. Speak of Rome, then of the plan sold to the Gauls. That is the anomaly.",
    "The Gallic relief army is hitting the weak points of the outer wall. Stay in the shield line.",
  ],
  orleans: [
    "Joan is by her standard. Speak of her faith and of Les Tourelles. She does not trust smooth talkers.",
    "The English archers shoot in volleys. When I shout volley, dodge or drop behind a pavise.",
  ],
  sekigahara: [
    "Ieyasu waits by the maku. Be patient and polite. Mention Kobayakawa only after he trusts you.",
    "The fog hides the West. Listen for the drums. They announce the charge before you see it.",
  ],
  austerlitz: [
    "The Emperor is by the campfires. He likes facts. Speak of the Pratzen heights and of the spy.",
    "The Russian lines fire in volleys. Between two volleys you have four seconds to charge with the bayonet.",
  ],
};

function mockBrain(def: NpcDefinition, mem: NpcMemory, req: NpcRequest): GeminiNpcResponse {
  const input = req.player_input.toLowerCase();
  if (def.id === "astra") {
    const hints = ASTRA_HINTS[req.game_context.era] ?? ASTRA_HINTS.troy;
    return { dialogue: hints[mem.history.length / 2 % hints.length], npc_state: "friendly", new_trust: 100, trigger_devin_ui: null };
  }
  if (def.mock) {
    const rule = def.mock.rules.find((r) => r.pattern.test(input));
    if (rule) return { dialogue: rule.dialogue, npc_state: rule.state, new_trust: mem.trust_level + rule.delta, trigger_devin_ui: null };
    const line = def.mock.fallback[(mem.history.length / 2) % def.mock.fallback.length];
    return { dialogue: line, npc_state: "idle", new_trust: mem.trust_level + (input.length > 20 ? 6 : 0), trigger_devin_ui: null };
  }
  if (/agamemnon|briseis/.test(input)) {
    return { dialogue: "How do you know that, traveler? Lower your voice.", npc_state: "suspicious", new_trust: mem.trust_level + 10, trigger_devin_ui: null };
  }
  if (/(fight|battle|stand with you|glory|honor|honour|hero)/.test(input)) {
    return { dialogue: "Your words are true. Speak. I am listening. Then we fight.", npc_state: "friendly", new_trust: mem.trust_level + 15, trigger_devin_ui: null };
  }
  if (/(seal|tent|lock)/.test(input) && mem.trust_level >= 80) {
    return { dialogue: "This bronze seal... no smith can open it. Try, if the gods guide you.", npc_state: "friendly", new_trust: mem.trust_level, trigger_devin_ui: "generate_puzzle_lock", revealed_secret_index: 1 };
  }
  if (/(coward|weak|fool|idiot)/.test(input)) {
    return { dialogue: "Say that again and my spear will silence you.", npc_state: "angry", new_trust: mem.trust_level - 20, trigger_devin_ui: null };
  }
  return { dialogue: "Hmm. What do you want, stranger?", npc_state: "idle", new_trust: mem.trust_level, trigger_devin_ui: null };
}

function clampTrust(prev: number, next: number): number {
  const n = Number.isFinite(next) ? next : prev;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export async function think(
  def: NpcDefinition,
  mem: NpcMemory,
  req: NpcRequest,
): Promise<{ response: NpcResponse; source: "gemini" | "mock" }> {
  const apiKey = process.env.GOOGLE_API_KEY || (globalThis as { __GOOGLE?: string }).__GOOGLE;
  let raw: GeminiNpcResponse;
  let source: "gemini" | "mock" = "mock";
  if (apiKey && process.env.MOCK_AI !== "1") {
    try {
      raw = await askGemini(buildPrompt(def, mem, req), apiKey);
      source = "gemini";
    } catch (err) {
      console.warn("[brain] Gemini failed, falling back to mock:", (err as Error).message);
      raw = mockBrain(def, mem, req);
    }
  } else {
    raw = mockBrain(def, mem, req);
  }

  const response: NpcResponse = {
    dialogue: raw.dialogue,
    npc_state: STATES.includes(raw.npc_state) ? raw.npc_state : "idle",
    new_trust: clampTrust(mem.trust_level, raw.new_trust),
    trigger_devin_ui: raw.trigger_devin_ui && TRIGGERS.includes(raw.trigger_devin_ui) ? raw.trigger_devin_ui : null,
  };

  mem.history.push({ speaker: "player", text: req.player_input }, { speaker: "npc", text: response.dialogue });
  mem.trust_level = response.new_trust;
  mem.state = response.npc_state;
  mem.patience = Math.max(0, Math.min(100, mem.patience + (response.npc_state === "angry" ? -20 : 5)));
  const idx = raw.revealed_secret_index;
  if (typeof idx === "number" && idx >= 0 && idx < mem.knowledge_revealed.length) mem.knowledge_revealed[idx] = true;

  return { response, source };
}
