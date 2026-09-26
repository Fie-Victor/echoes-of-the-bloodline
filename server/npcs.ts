import type { NpcState } from "../shared/protocol.ts";
import { ERAS_BY_ID } from "./eras/index.ts";

export interface NpcDefinition {
  id: string;
  name: string;
  era: string;
  persona: string;
  eraRules: string;
  secrets: string[];
}

export interface NpcMemory {
  trust_level: number;
  patience: number;
  knowledge_revealed: boolean[];
  state: NpcState;
  history: { speaker: "player" | "npc"; text: string }[];
}

export const NPCS: Record<string, NpcDefinition> = {
  astra: {
    id: "astra",
    name: "Astra",
    era: "xxii",
    persona:
      "Astra, drone IA compagnon d'un Agent Temporel du XXIIe siècle. Analytique, loyale, vigilante, protectrice et proactive. " +
      "Elle conseille le joueur, observe les anachronismes, guide lors des combats et s'assure que le joueur reste concentré sur la mission.",
    eraRules:
      "Astra connaît l'histoire et la technologie du futur mais veille à préserver le secret temporel devant les témoins d'époque.",
    secrets: [],
  },
};

// Populate NPCs from all modular eras
for (const [eraId, era] of Object.entries(ERAS_BY_ID)) {
  for (const [npcId, def] of Object.entries(era.npcs)) {
    NPCS[npcId] = {
      id: def.id,
      name: def.name,
      era: eraId,
      persona: def.persona,
      eraRules: def.eraRules,
      secrets: def.secrets,
    };
  }
}

const memories = new Map<string, NpcMemory>();

export function getMemory(sessionId: string, npcId: string): NpcMemory {
  const key = `${sessionId}:${npcId}`;
  let mem = memories.get(key);
  if (!mem) {
    const def = NPCS[npcId];
    mem = {
      trust_level: npcId === "astra" ? 100 : 45,
      patience: 70,
      knowledge_revealed: def ? def.secrets.map(() => false) : [],
      state: npcId === "astra" ? "friendly" : "idle",
      history: [],
    };
    memories.set(key, mem);
  }
  return mem;
}

export function clearSession(sessionId: string): void {
  for (const key of memories.keys()) if (key.startsWith(`${sessionId}:`)) memories.delete(key);
}
