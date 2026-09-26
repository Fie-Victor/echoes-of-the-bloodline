import type { NpcRequest, NpcResponse, NpcState } from "../shared/protocol.ts";
import type { NpcDefinition, NpcMemory } from "./npcs.ts";
import { getEra } from "./eras/index.ts";

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
const GEMINI_TIMEOUT_MS = 10_000;
const STATES: NpcState[] = ["idle", "angry", "suspicious", "friendly"];
const TRIGGERS = ["generate_puzzle_lock"];

function buildPrompt(def: NpcDefinition, mem: NpcMemory, req: NpcRequest): string {
  const secrets = def.secrets.map((s, i) => `${i}. ${s} (déjà révélé: ${mem.knowledge_revealed[i]})`).join("\n");
  const history = mem.history.slice(-10).map((h) => `${h.speaker === "player" ? "Joueur" : def.name}: ${h.text}`).join("\n");
  return `Tu incarnes un personnage d'un jeu vidéo narratif de voyage temporel. Reste strictement dans le personnage.

PERSONNAGE: ${def.persona}
RÈGLES D'ÉPOQUE (aucun anachronisme): ${def.eraRules}

ÉTAT ACTUEL:
- trust_level: ${mem.trust_level}/100
- patience: ${mem.patience}/100
- état émotionnel: ${mem.state}
- secrets:
${secrets || "(aucun)"}

CONTEXTE DE JEU: ${JSON.stringify(req.game_context)}

HISTORIQUE RÉCENT:
${history || "(début de la conversation)"}

RÈGLES DE JEU:
- Ne révèle un secret que si la confiance dépasse 70 et que le joueur le mérite.
${
    def.id === "achilles_01"
      ? `- Si le joueur parle de guerre, de combat, propose son aide, défend les vaisseaux ou fait preuve d'une grande vaillance (ou si la confiance atteint 75+), Achille accepte de l'emmener au combat : mets trigger_war à true et npc_state à "friendly".
- Si la confiance atteint 80 ou plus et que le joueur demande de l'aide pour le sceau / la tente / le verrou, mets trigger_devin_ui à "generate_puzzle_lock". Sinon null.`
      : "- trigger_devin_ui est toujours null et trigger_war est toujours false."
  }
- Ajuste new_trust (0-100) selon le respect, la pertinence et la sincérité du joueur (variation max ±15 par réplique).
- Réponds en français, 1 à 3 phrases courtes, adaptées à l'oral et percutantes.

Le joueur dit: "${req.player_input}"`;
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    dialogue: { type: "STRING" },
    npc_state: { type: "STRING", enum: STATES },
    new_trust: { type: "INTEGER" },
    trigger_devin_ui: { type: "STRING", nullable: true, enum: TRIGGERS },
    trigger_war: { type: "BOOLEAN", nullable: true },
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
  troy: ["Analyse en cours. Achille est près du feu, au nord. Gagne sa confiance sans évoquer le futur."],
  alesia: [
    "César est sous sa tente de commandement. Parle-lui de Rome, puis du plan vendu aux Gaulois : c'est l'anomalie.",
    "Les Gaulois de l'armée de secours frappent aux points faibles de la circonvallation. Reste dans la ligne des scuta.",
  ],
  orleans: [
    "Jeanne est près de son étendard. Parle-lui de sa foi et des Tourelles ; elle se méfie des beaux parleurs.",
    "Les archers anglais tirent par volées. Quand je crie « volée », esquive ou baisse-toi derrière un pavois.",
  ],
  sekigahara: [
    "Ieyasu attend près du maku. Sois patient et poli. Évoque Kobayakawa seulement quand il te fera confiance.",
    "Le brouillard masque l'Ouest. Écoute les tambours : ils annoncent leur charge avant de l'apercevoir.",
  ],
  austerlitz: [
    "L'Empereur est près des feux de bivouac. Il aime les faits : parle du plateau de Pratzen et de l'espion.",
    "Les lignes russes tirent en salves. Entre deux salves, tu as quatre secondes pour charger à la baïonnette.",
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

  // Try era-specific mock handler first
  const era = getEra(def.era);
  if (era?.handleMockDialogue) {
    const eraResult = era.handleMockDialogue(def.id, req.player_input, mem.trust_level, mem.state);
    if (eraResult) {
      return {
        dialogue: eraResult.dialogue,
        npc_state: eraResult.state,
        new_trust: eraResult.newTrust,
        trigger_devin_ui: eraResult.triggerDevinUi ?? null,
        trigger_war: eraResult.triggerWar ?? false,
        revealed_secret_index: eraResult.revealedSecretIndex ?? null,
      };
    }
  }

  if (/(combat|guerre|bataille|arme|lance|allons|gloire|navire|aider)/i.test(input) || mem.trust_level >= 75) {
    return {
      dialogue: "Par les dieux ! Ta flamme me réveille ! Les Troyens ne brûleront pas nos nefs ! Prends ta lance, étranger : SUIS-MOI AU COMBAT !",
      npc_state: "friendly",
      new_trust: Math.max(90, mem.trust_level + 20),
      trigger_devin_ui: null,
      trigger_war: true,
    };
  }

  if (/agamemnon/.test(input)) {
    return { dialogue: "Comment oses-tu prononcer ce nom ? Ce roi est sans honneur. Baisse la voix.", npc_state: "suspicious", new_trust: mem.trust_level + 10, trigger_devin_ui: null, trigger_war: false };
  }
  if (/(respect|honneur|gloire|héros)/.test(input)) {
    return { dialogue: "Tes paroles sont dignes d'un guerrier. Je t'écoute, étranger.", npc_state: "friendly", new_trust: mem.trust_level + 15, trigger_devin_ui: null, trigger_war: false };
  }
  if (/(sceau|tente|verrou)/.test(input) && mem.trust_level >= 80) {
    return { dialogue: "Ce sceau de bronze... aucun forgeron ne sait l'ouvrir. Essaie, si les dieux te guident.", npc_state: "friendly", new_trust: mem.trust_level, trigger_devin_ui: "generate_puzzle_lock", trigger_war: false, revealed_secret_index: 1 };
  }
  if (/(lâche|faible|idiot)/.test(input)) {
    return { dialogue: "Répète cela et ma lance te fera taire pour l'éternité.", npc_state: "angry", new_trust: mem.trust_level - 20, trigger_devin_ui: null, trigger_war: false };
  }
  return { dialogue: "Hmm. Que veux-tu, voyageur ? Mes guerriers s'impatientent.", npc_state: "idle", new_trust: mem.trust_level, trigger_devin_ui: null, trigger_war: false };
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
  const apiKey = process.env.GOOGLE_API_KEY;
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
    trigger_war: Boolean(raw.trigger_war),
  };

  mem.history.push({ speaker: "player", text: req.player_input }, { speaker: "npc", text: response.dialogue });
  mem.trust_level = response.new_trust;
  mem.state = response.npc_state;
  mem.patience = Math.max(0, Math.min(100, mem.patience + (response.npc_state === "angry" ? -20 : 5)));
  const idx = raw.revealed_secret_index;
  if (typeof idx === "number" && idx >= 0 && idx < mem.knowledge_revealed.length) mem.knowledge_revealed[idx] = true;

  return { response, source };
}
