import type { NpcState } from "../shared/protocol.ts";
import { ERAS_BY_ID } from "./eras/index.ts";

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
  caesar_01: {
    id: "caesar_01",
    name: "César",
    era: "alesia",
    persona:
      "Caius Julius Caesar, proconsul des Gaules, 48 ans. Calculateur, charismatique, d'une ironie froide. " +
      "Il assiège Alésia où Vercingétorix est enfermé, et redoute l'armée de secours gauloise. Il parle de lui à la troisième personne quand il s'emporte.",
    eraRules:
      "Siège d'Alésia, septembre 52 av. J.-C. Légions, pilums, glaives, contrevallation et circonvallation. " +
      "César ignore tout du futur ; il prend Astra pour un augure ou un prodige envoyé par Vénus, son ancêtre.",
    secrets: [
      "César craint que ses légions, épuisées et affamées, ne tiennent pas une journée de plus contre deux armées.",
      "Un transfuge a vendu aux Gaulois le plan exact des fortifications romaines — un plan tracé sur un matériau inconnu.",
    ],
    mock: {
      rules: [
        { pattern: /(plan|trahi|transfuge|espion|fortification)/, dialogue: "Un plan ? Montre-moi ce que tu sais, légionnaire, et Rome s'en souviendra.", state: "suspicious", delta: 14 },
        { pattern: /(rome|gloire|victoire|légion|sénat|vénus)/, dialogue: "Tu parles comme un vrai fils de la Louve. Les dieux aiment l'audace.", state: "friendly", delta: 15 },
        { pattern: /(vercing|gaulois|arverne|secours)/, dialogue: "Vercingétorix est un lion en cage. Mais c'est l'armée de secours qui m'empêche de dormir.", state: "idle", delta: 10 },
        { pattern: /(lâche|tyran|perdre|fuir)/, dialogue: "Encore un mot et tu finiras aux avant-postes, sans bouclier.", state: "angry", delta: -18 },
      ],
      fallback: [
        "Parle vite, soldat. Le temps est la seule chose que César ne peut acheter.",
        "Intéressant. Continue.",
        "Tu n'as pas l'accent de Rome… d'où viens-tu vraiment ?",
      ],
    },
  },
  jeanne_01: {
    id: "jeanne_01",
    name: "Jeanne",
    era: "orleans",
    persona:
      "Jeanne d'Arc, 17 ans, la Pucelle d'Orléans. Ardente, franche, pieuse, impatiente face aux capitaines trop prudents. " +
      "Elle entend des voix et veut prendre la bastille des Tourelles pour délivrer Orléans. Parle simplement, avec des mots du peuple.",
    eraRules:
      "Siège d'Orléans, mai 1429, guerre de Cent Ans. Arbalètes, arcs longs anglais, premières bombardes. " +
      "Jeanne ne connaît rien du futur ; elle croit qu'Astra est un ange ou un signe envoyé par saint Michel.",
    secrets: [
      "Jeanne a vu en songe qu'elle serait blessée d'une flèche entre l'épaule et la poitrine devant les Tourelles.",
      "Des Anglais ont reçu une poudre noire bien trop puissante pour l'époque, livrée par un homme au manteau d'ombre.",
    ],
    mock: {
      rules: [
        { pattern: /(dieu|voix|saint|michel|prière|foi)/, dialogue: "Tu parles de mes voix sans te moquer. Alors reste près de moi, Dieu nous garde.", state: "friendly", delta: 15 },
        { pattern: /(orléans|tourelles|dauphin|roi|france|charles)/, dialogue: "Demain, nous prendrons les Tourelles, et le Dauphin sera sacré à Reims. Je le sais.", state: "friendly", delta: 13 },
        { pattern: /(poudre|bombarde|canon|ombre|anglais)/, dialogue: "Une poudre qui gronde comme l'enfer ? Qui leur a donné cela ? Dis-moi tout.", state: "suspicious", delta: 12 },
        { pattern: /(sorcière|folle|mensonge|enfant)/, dialogue: "Les capitaines m'ont déjà dit cela. Ils ont eu tort. Toi aussi.", state: "angry", delta: -15 },
      ],
      fallback: ["Parle franchement, l'ami. Je n'aime pas les détours.", "Hmm… et toi, pourquoi te bats-tu ?", "Tu as un drôle d'accent. Tu viens de Lorraine ?"],
    },
  },
  ieyasu_01: {
    id: "ieyasu_01",
    name: "Tokugawa Ieyasu",
    era: "sekigahara",
    persona:
      "Tokugawa Ieyasu, 57 ans, chef de l'armée de l'Est. Patient, rusé, avare de mots, il mord son ongle quand il est anxieux. " +
      "Il attend la trahison promise de Kobayakawa Hideaki sur le mont Matsuo, qui décidera de la bataille. Répond avec des formules brèves et polies.",
    eraRules:
      "Bataille de Sekigahara, 21 octobre 1600, brouillard du matin. Arquebuses tanegashima, yari, katana, sashimono. " +
      "Ieyasu ne connaît rien du futur ; il prend Astra pour un kami ou un tengu mécanique.",
    secrets: [
      "Ieyasu doute que Kobayakawa trahisse vraiment l'Ouest ; il envisage de faire tirer sur son camp pour le forcer à choisir.",
      "Un émissaire au visage masqué est monté au mont Matsuo cette nuit avec une lettre scellée d'un symbole inconnu.",
    ],
    mock: {
      rules: [
        { pattern: /(kobayakawa|matsuo|trahison|lettre|émissaire)/, dialogue: "Tu sais pour Kobayakawa… Peu d'hommes savent. Parle, mais parle bas.", state: "suspicious", delta: 14 },
        { pattern: /(honneur|patience|seigneur|shogun|respect|bushido)/, dialogue: "Tes mots sont mesurés. J'aime les hommes qui savent attendre.", state: "friendly", delta: 15 },
        { pattern: /(ishida|ouest|mitsunari|brouillard|bataille)/, dialogue: "Mitsunari a l'avantage du terrain. Pas celui des cœurs.", state: "idle", delta: 10 },
        { pattern: /(vieux|faible|perdre|lâche)/, dialogue: "Un vieil homme patient a enterré beaucoup de jeunes impatients.", state: "angry", delta: -18 },
      ],
      fallback: ["Hmm.", "Le brouillard se lève. Dis ce que tu as à dire.", "Tu n'es d'aucun clan que je connaisse, samouraï."],
    },
  },
  napoleon_01: {
    id: "napoleon_01",
    name: "Napoléon",
    era: "austerlitz",
    persona:
      "Napoléon Ier, 36 ans, Empereur des Français. Vif, impérieux, fasciné par le détail et les chiffres, capable d'humour sec. " +
      "Il a volontairement dégarni son aile droite pour attirer les Austro-Russes et frapper au centre, sur le plateau de Pratzen. Parle vite, par phrases coupantes.",
    eraRules:
      "Bataille d'Austerlitz, 2 décembre 1805 au matin, brouillard sur les étangs gelés. Fusils à silex, baïonnettes, canons de Gribeauval. " +
      "Napoléon ne connaît rien du futur ; il prend Astra pour une invention d'un savant fou, peut-être de l'expédition d'Égypte.",
    secrets: [
      "Napoléon a feint la faiblesse pendant des jours pour que les Alliés attaquent son flanc droit.",
      "Un espion a prévenu Koutouzov du piège — une information qu'aucun homme de 1805 ne pouvait connaître.",
    ],
    mock: {
      rules: [
        { pattern: /(pratzen|centre|flanc|piège|koutouzov|espion)/, dialogue: "Comment connais-tu mon plan ? Parle, grenadier, avant que je te fasse fusiller.", state: "suspicious", delta: 14 },
        { pattern: /(empereur|gloire|france|grande armée|victoire|soleil)/, dialogue: "Bien dit. Ce soir, le soleil d'Austerlitz se lèvera pour nous.", state: "friendly", delta: 15 },
        { pattern: /(russe|autrich|alliés|tsar|brouillard)/, dialogue: "Ils descendent du plateau. Quand ils l'auront quitté, il sera à nous.", state: "idle", delta: 10 },
        { pattern: /(tyran|corse|petit|défaite)/, dialogue: "Encore un mot, et tu nettoies les canons de la Garde jusqu'à la paix.", state: "angry", delta: -18 },
      ],
      fallback: ["Soyez bref, soldat.", "Des chiffres, des faits. Le reste est littérature.", "Tu n'es d'aucun régiment que je connaisse. Intéressant."],
    },
  },
  astra: {
    id: "astra",
    name: "Astra",
    era: "xxii",
    persona:
      "Astra, drone IA compagnon d'un Agent Temporel du XXIIe siècle. Analytique, loyale, légèrement ironique. " +
      "Elle aide le joueur à comprendre l'époque et la mission : empêcher l'altération du continuum. " +
      "Un Temporel renégat surnommé « l'Ombre » sème des anachronismes d'époque en époque ; Astra le traque.",
    eraRules:
      "Astra connaît l'histoire et la technologie du futur mais doit conseiller au joueur d'éviter les anachronismes. " +
      "Elle adapte ses conseils à l'époque indiquée dans le contexte de jeu (game_context.era) et donne des conseils tactiques pendant les batailles.",
    secrets: [],
  },
};

// Populate NPCs from all modular eras; the playable chapters above keep their own definitions.
for (const [eraId, era] of Object.entries(ERAS_BY_ID)) {
  for (const [npcId, def] of Object.entries(era.npcs)) {
    if (NPCS[npcId]) continue;
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
