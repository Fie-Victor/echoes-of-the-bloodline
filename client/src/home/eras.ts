export interface Era {
  id: string;
  place: string;
  year: string;
  /** Signed year used to place the card on the timeline. */
  yearValue: number;
  title: string;
  conflict: string;
  figure: string;
  /** Spoken by Astra when the card gets focus. */
  voiceLine: string;
  /** Words recognised by voice to jump to this era. */
  aliases: string[];
  url: string | null;
  accent: string;
}

export const ERAS: Era[] = [
  {
    id: "troy",
    place: "Troie",
    year: "1184 av. J.-C.",
    yearValue: -1184,
    title: "La Colère d'Achille",
    conflict: "Achille refuse de combattre et les Troyens menacent de brûler les nefs. Gagne sa confiance et mène la charge héroïque.",
    figure: "Achille",
    voiceLine: "Troie, 1184 avant notre ère. Achille doute sous sa tente, et le sceau du temps se fissure sur les rivages d'Ilios.",
    aliases: ["troie", "troy", "achille", "grèce", "grece", "grec", "myrmidons"],
    url: "troy.html?era=troy",
    accent: "#e0a64a",
  },
  {
    id: "alesia",
    place: "Alésia",
    year: "52 av. J.-C.",
    yearValue: -52,
    title: "Le Choc des Légions",
    conflict: "César encercle Alésia mais l'armée de secours gauloise frappe ses lignes extérieures. Bats-toi aux côtés de la Dixième Légion.",
    figure: "Jules César",
    voiceLine: "Alésia, septembre 52 avant J.-C. Les fortifications de César sont prises en étau par l'armée de secours gauloise.",
    aliases: ["alésia", "alesia", "rome", "césar", "cesar", "gaulois", "gaul"],
    url: "troy.html?era=alesia",
    accent: "#c2573f",
  },
  {
    id: "orleans",
    place: "Orléans",
    year: "1429",
    yearValue: 1429,
    title: "La Bannière de Jeanne",
    conflict: "Orléans est assiégée depuis sept mois. Suis l'étendard de Jeanne d'Arc et donne l'assaut contre la bastille des Tourelles.",
    figure: "Jeanne d'Arc",
    voiceLine: "Orléans, mai 1429. Jeanne d'Arc mène l'assaut pour briser le siège anglais des Tourelles.",
    aliases: ["orléans", "orleans", "jeanne", "tourelles", "anglais", "dauphin"],
    url: "troy.html?era=orleans",
    accent: "#8fb6d9",
  },
  {
    id: "sekigahara",
    place: "Sekigahara",
    year: "1600",
    yearValue: 1600,
    title: "Le Destin du Shogunat",
    conflict: "Dans le brouillard d'octobre 1600, l'armée de l'Est affronte l'armée de l'Ouest. Les arquebuses grondent pour sceller le sort du Japon.",
    figure: "Tokugawa Ieyasu",
    voiceLine: "Sekigahara, octobre 1600. Les bannières de l'Est et de l'Ouest se heurtent dans la brume matinale.",
    aliases: ["sekigahara", "tokugawa", "ieyasu", "japon", "samurai", "samouraï", "shogun"],
    url: "troy.html?era=sekigahara",
    accent: "#d98f4e",
  },
  {
    id: "austerlitz",
    place: "Austerlitz",
    year: "1805",
    yearValue: 1805,
    title: "Le Soleil d'Austerlitz",
    conflict: "2 décembre 1805. La Grande Armée de Napoléon piège les armées austro-russes sur le plateau du Pratzen sous le feu des canons.",
    figure: "Napoléon Ier",
    voiceLine: "Austerlitz, 2 décembre 1805. Le soleil perce la brume d'hiver alors que l'artillerie française ouvre le feu.",
    aliases: ["austerlitz", "napoléon", "napoleon", "empire", "tsar", "pratzen", "canons"],
    url: "troy.html?era=austerlitz",
    accent: "#4f7fd1",
  },
];
