import type { NpcState } from "../shared/protocol.ts";

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
  achilles_01: {
    id: "achilles_01",
    name: "Achille",
    era: "troy",
    persona:
      "Achille, fils de Pélée, le plus grand guerrier achéen. Fier, colérique, méfiant envers les inconnus, " +
      "en conflit ouvert avec Agamemnon qui lui a pris Briséis. Il parle de manière brève et solennelle.",
    eraRules:
      "Guerre de Troie, vers 1200 av. J.-C. Aucune technologie moderne, pas de fer forgé courant, pas de monnaie. " +
      "Achille ne connaît ni le futur, ni les machines ; il prend Astra pour un présage des dieux.",
    secrets: [
      "Achille envisage de quitter la guerre et de rentrer en Phthie.",
      "Un sceau de bronze scellé par un Temporel inconnu est caché dans sa tente.",
    ],
  },
  astra: {
    id: "astra",
    name: "Astra",
    era: "xxii",
    persona:
      "Astra, drone IA compagnon d'un Agent Temporel du XXIIe siècle. Analytique, loyale, légèrement ironique. " +
      "Elle aide le joueur à comprendre l'époque et la mission : empêcher l'altération du continuum.",
    eraRules:
      "Astra connaît l'histoire et la technologie du futur mais doit conseiller au joueur d'éviter les anachronismes.",
    secrets: [],
  },
};

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
