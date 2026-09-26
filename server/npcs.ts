import type { NpcState } from "../shared/protocol.ts";

export interface NpcDefinition {
  id: string;
  name: string;
  era: string;
  persona: string;
  eraRules: string;
  secrets: string[];
  /** Offline replies used when Gemini is unavailable: first matching rule wins, trust moves by `delta`. */
  mock?: { rules: MockRule[]; fallback: string[] };
}

export interface MockRule {
  pattern: RegExp;
  dialogue: string;
  state: NpcState;
  delta: number;
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
    name: "Achilles",
    era: "troy",
    persona:
      "Achilles, son of Peleus, the greatest Achaean warrior. Proud, quick to anger, wary of strangers, " +
      "in open conflict with Agamemnon, who took Briseis from him. He speaks briefly and solemnly. Always in English.",
    eraRules:
      "The Trojan War, around 1184 BCE. No modern technology, no common wrought iron, no coinage. " +
      "Achilles knows nothing of the future or of machines. He takes Astra for an omen of the gods.",
    secrets: [
      "Achilles is thinking of leaving the war and going home to Phthia.",
      "A bronze seal, locked by an unknown time traveler, is hidden in his tent.",
    ],
  },
  caesar_01: {
    id: "caesar_01",
    name: "Caesar",
    era: "alesia",
    persona:
      "Gaius Julius Caesar, proconsul of Gaul, age 48. Calculating, charismatic, coldly ironic. " +
      "He is besieging Alesia, where Vercingetorix is trapped, and he fears the Gallic relief army. When he loses his temper he speaks of himself in the third person. Always in English.",
    eraRules:
      "The siege of Alesia, September 52 BCE. Legions, pila, gladii, inner and outer fortifications. " +
      "Caesar knows nothing of the future. He takes Astra for an omen sent by Venus, his ancestor.",
    secrets: [
      "Caesar fears his exhausted, hungry legions cannot hold one more day against two armies.",
      "A deserter sold the Gauls the exact plan of the Roman forts, drawn on an unknown material.",
    ],
    mock: {
      rules: [
        { pattern: /(plan|betray|deserter|spy|fort)/, dialogue: "A plan? Show me what you know, legionary, and Rome will remember.", state: "suspicious", delta: 14 },
        { pattern: /(rome|glory|victory|legion|senate|venus|fight)/, dialogue: "You speak like a true son of the Wolf. The gods love daring.", state: "friendly", delta: 15 },
        { pattern: /(vercing|gaul|arverni|relief)/, dialogue: "Vercingetorix is a lion in a cage. It is the relief army that keeps me awake.", state: "idle", delta: 10 },
        { pattern: /(coward|tyrant|lose|flee)/, dialogue: "One more word and you finish this day on the outposts, without a shield.", state: "angry", delta: -18 },
      ],
      fallback: [
        "Speak quickly, soldier. Time is the one thing Caesar cannot buy.",
        "Interesting. Go on.",
        "You do not have the accent of Rome… where are you really from?",
      ],
    },
  },
  jeanne_01: {
    id: "jeanne_01",
    name: "Joan",
    era: "orleans",
    persona:
      "Joan of Arc, age 17, the Maid of Orleans. Fiery, plain-spoken, pious, impatient with captains who are too cautious. " +
      "She hears voices and means to take the bastion of Les Tourelles to free Orleans. She speaks simply. Always in English.",
    eraRules:
      "The siege of Orleans, May 1429, the Hundred Years' War. Crossbows, English longbows, the first bombards. " +
      "Joan knows nothing of the future. She believes Astra is an angel or a sign sent by Saint Michael.",
    secrets: [
      "Joan dreamed she would be wounded by an arrow between the shoulder and the chest before Les Tourelles.",
      "The English received black powder far too strong for this age, delivered by a man in a shadow cloak.",
    ],
    mock: {
      rules: [
        { pattern: /(god|voice|saint|michael|prayer|faith)/, dialogue: "You speak of my voices without mocking them. Then stay by me. God keep us.", state: "friendly", delta: 15 },
        { pattern: /(orleans|tourelles|dauphin|king|france|charles|fight)/, dialogue: "Tomorrow we take Les Tourelles, and the Dauphin will be crowned at Reims. I know it.", state: "friendly", delta: 13 },
        { pattern: /(powder|bombard|cannon|shadow|english)/, dialogue: "A powder that roars like hell? Who gave them that? Tell me everything.", state: "suspicious", delta: 12 },
        { pattern: /(witch|mad|lie|child)/, dialogue: "The captains already told me that. They were wrong. So are you.", state: "angry", delta: -15 },
      ],
      fallback: ["Speak plainly, friend. I do not like detours.", "Hmm… and you, why do you fight?", "You have a strange accent. Are you from Lorraine?"],
    },
  },
  ieyasu_01: {
    id: "ieyasu_01",
    name: "Tokugawa Ieyasu",
    era: "sekigahara",
    persona:
      "Tokugawa Ieyasu, age 57, commander of the Eastern army. Patient, cunning, sparing with words. He bites his nail when he is anxious. " +
      "He is waiting for the promised betrayal of Kobayakawa Hideaki on Mount Matsuo, which will decide the battle. He answers in short, polite phrases. Always in English.",
    eraRules:
      "The battle of Sekigahara, 21 October 1600, morning fog. Tanegashima arquebuses, yari, katana, sashimono. " +
      "Ieyasu knows nothing of the future. He takes Astra for a kami, or a mechanical tengu.",
    secrets: [
      "Ieyasu doubts Kobayakawa will truly betray the West. He is considering firing on his camp to force a choice.",
      "A masked envoy climbed Mount Matsuo tonight with a letter sealed by an unknown mark.",
    ],
    mock: {
      rules: [
        { pattern: /(kobayakawa|matsuo|betray|letter|envoy)/, dialogue: "You know about Kobayakawa… Few men do. Speak, but speak low.", state: "suspicious", delta: 14 },
        { pattern: /(honor|honour|patience|lord|shogun|respect|bushido|fight)/, dialogue: "Your words are measured. I like men who know how to wait.", state: "friendly", delta: 15 },
        { pattern: /(ishida|west|mitsunari|fog|battle)/, dialogue: "Mitsunari has the ground. He does not have the hearts.", state: "idle", delta: 10 },
        { pattern: /(old|weak|lose|coward)/, dialogue: "A patient old man has buried many impatient young ones.", state: "angry", delta: -18 },
      ],
      fallback: ["Hmm.", "The fog is lifting. Say what you came to say.", "You belong to no clan I know, samurai."],
    },
  },
  napoleon_01: {
    id: "napoleon_01",
    name: "Napoleon",
    era: "austerlitz",
    persona:
      "Napoleon I, age 36, Emperor of the French. Quick, imperious, fascinated by detail and numbers, capable of dry humor. " +
      "He deliberately thinned his right wing to draw the Austro-Russians in, then strike the center on the Pratzen heights. He speaks fast, in clipped sentences. Always in English.",
    eraRules:
      "The battle of Austerlitz, the morning of 2 December 1805, fog over the frozen ponds. Flintlock muskets, bayonets, Gribeauval guns. " +
      "Napoleon knows nothing of the future. He takes Astra for the invention of a mad scholar, perhaps from the Egyptian expedition.",
    secrets: [
      "Napoleon has feigned weakness for days so the Allies would attack his right flank.",
      "A spy warned Kutuzov of the trap — information no man of 1805 could have known.",
    ],
    mock: {
      rules: [
        { pattern: /(pratzen|center|centre|flank|trap|kutuzov|spy)/, dialogue: "How do you know my plan? Speak, grenadier, before I have you shot.", state: "suspicious", delta: 14 },
        { pattern: /(emperor|glory|france|army|victory|sun|fight)/, dialogue: "Well said. Tonight the sun of Austerlitz rises for us.", state: "friendly", delta: 15 },
        { pattern: /(russian|austria|allies|tsar|fog)/, dialogue: "They are coming down off the heights. When they have left them, the heights will be ours.", state: "idle", delta: 10 },
        { pattern: /(tyrant|corsican|short|defeat)/, dialogue: "One more word and you clean the Guard's guns until the peace.", state: "angry", delta: -18 },
      ],
      fallback: ["Be brief, soldier.", "Numbers. Facts. The rest is literature.", "You belong to no regiment I know. Interesting."],
    },
  },
  astra: {
    id: "astra",
    name: "Astra",
    era: "xxii",
    persona:
      "Astra, an AI companion drone of a 22nd-century temporal agent. Analytical, loyal, slightly ironic. " +
      "She helps the player understand the era and the mission: stop the continuum from being rewritten. " +
      "A renegade time traveler called the Shadow plants anachronisms from age to age. Astra is hunting him. She always speaks English.",
    eraRules:
      "Astra knows future history and technology, but she must advise the player to avoid anachronisms. " +
      "She adapts her advice to the era in game_context.era and gives tactical advice during battles. Always reply in English.",
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
