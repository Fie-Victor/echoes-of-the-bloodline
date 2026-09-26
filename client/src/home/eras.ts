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
    place: "Troy",
    year: "1184 BCE",
    yearValue: -1184,
    title: "The Wrath of Achilles",
    conflict: "Achilles refuses to fight, and the Trojans threaten to burn the ships. Earn his trust and lead the charge.",
    figure: "Achilles",
    voiceLine: "Troy, 1184 BCE. Achilles broods in his tent, and the seal of time is cracking on the shore of Ilium.",
    aliases: ["troy", "troie", "achilles", "achille", "greece", "greek"],
    url: "troy.html?era=troy",
    accent: "#e0a64a",
  },
  {
    id: "alesia",
    place: "Alesia",
    year: "52 BCE",
    yearValue: -52,
    title: "The Clash of Legions",
    conflict: "Caesar has ringed Alesia, but a Gallic relief army is hitting his outer lines. Fight beside the Tenth Legion.",
    figure: "Julius Caesar",
    voiceLine: "Alesia, September 52 BCE. Caesar's forts are caught between Vercingetorix and the Gallic relief army.",
    aliases: ["alesia", "alésia", "rome", "caesar", "cesar", "gaul", "gallic"],
    url: "troy.html?era=alesia",
    accent: "#c2573f",
  },
  {
    id: "orleans",
    place: "Orleans",
    year: "1429",
    yearValue: 1429,
    title: "Joan's Standard",
    conflict: "Orleans has been besieged for seven months. Follow Joan of Arc's banner and storm Les Tourelles.",
    figure: "Joan of Arc",
    voiceLine: "Orleans, May 1429. Joan of Arc is leading the assault to break the English siege of Les Tourelles.",
    aliases: ["orleans", "orléans", "joan", "jeanne", "tourelles", "english"],
    url: "troy.html?era=orleans",
    accent: "#8fb6d9",
  },
  {
    id: "sekigahara",
    place: "Sekigahara",
    year: "1600",
    yearValue: 1600,
    title: "The Fate of the Shogunate",
    conflict: "In the fog of October 1600, the Eastern army meets the West. Arquebuses will decide Japan.",
    figure: "Tokugawa Ieyasu",
    voiceLine: "Sekigahara, October 1600. The banners of East and West clash in the morning mist.",
    aliases: ["sekigahara", "tokugawa", "ieyasu", "japan", "samurai", "shogun"],
    url: "troy.html?era=sekigahara",
    accent: "#d98f4e",
  },
  {
    id: "austerlitz",
    place: "Austerlitz",
    year: "1805",
    yearValue: 1805,
    title: "The Sun of Austerlitz",
    conflict: "2 December 1805. Napoleon's Grand Army traps the Austro-Russian armies on the Pratzen heights.",
    figure: "Napoleon I",
    voiceLine: "Austerlitz, 2 December 1805. The sun breaks the winter mist as the French guns open fire.",
    aliases: ["austerlitz", "napoleon", "napoléon", "empire", "tsar", "pratzen"],
    url: "troy.html?era=austerlitz",
    accent: "#4f7fd1",
  },
];
