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
    id: "egypt",
    place: "Qadesh",
    year: "1274 av. J.-C.",
    yearValue: -1274,
    title: "Le Char de Ramsès",
    conflict: "À la veille de la bataille contre les Hittites, un faux messager menace d'effacer le traité de paix le plus ancien du monde.",
    figure: "Ramsès II",
    voiceLine: "Qadesh, 1274 avant notre ère. Ramsès le Grand marche vers les Hittites.",
    aliases: ["égypte", "egypte", "ramsès", "ramses", "qadesh", "kadesh", "pharaon"],
    url: null,
    accent: "#d9b35b",
  },
  {
    id: "troy",
    place: "Troie",
    year: "1184 av. J.-C.",
    yearValue: -1184,
    title: "La Colère d'Achille",
    conflict: "Achille refuse de combattre et le sceau temporel du camp grec est brisé. Gagne sa confiance avant que la guerre ne bascule.",
    figure: "Achille",
    voiceLine: "Troie, 1184 avant notre ère. Achille boude sous sa tente, et le sceau du temps se fissure.",
    aliases: ["troie", "troy", "achille", "grèce", "grece", "grec"],
    url: "/troy.html",
    accent: "#e0a64a",
  },
  {
    id: "alesia",
    place: "Alésia",
    year: "52 av. J.-C.",
    yearValue: -52,
    title: "Le Siège d'Alésia",
    conflict: "Un transfuge a vendu aux Gaulois le plan des fortifications de César. Tiens la circonvallation face à l'armée de secours.",
    figure: "Jules César",
    voiceLine: "Alésia, 52 avant notre ère. César assiège Vercingétorix, et l'armée de secours gauloise approche.",
    aliases: ["alésia", "alesia", "gaulois", "vercingétorix", "vercingetorix", "siège"],
    url: "/troy.html?era=alesia",
    accent: "#b0442e",
  },
  {
    id: "rome",
    place: "Rome",
    year: "44 av. J.-C.",
    yearValue: -44,
    title: "Les Ides de Mars",
    conflict: "Les conjurés hésitent, et une lettre venue du futur circule au Sénat. Préserve le cours de l'histoire romaine.",
    figure: "Jules César",
    voiceLine: "Rome, les Ides de Mars, 44 avant notre ère. Les poignards sont prêts au Sénat.",
    aliases: ["rome", "romain", "césar", "cesar", "sénat", "senat"],
    url: null,
    accent: "#c2573f",
  },
  {
    id: "orleans",
    place: "Orléans",
    year: "1429",
    yearValue: 1429,
    title: "La Bannière de Jeanne",
    conflict: "La ville assiégée doute de la jeune Jeanne. Aide-la à rallier les capitaines avant l'assaut des Tourelles.",
    figure: "Jeanne d'Arc",
    voiceLine: "Orléans, 1429. Jeanne d'Arc doit convaincre une ville assiégée.",
    aliases: ["orléans", "orleans", "jeanne", "moyen âge", "moyen-âge"],
    url: "/troy.html?era=orleans",
    accent: "#8fb6d9",
  },
  {
    id: "florence",
    place: "Florence",
    year: "1504",
    yearValue: 1504,
    title: "La Rivalité des Génies",
    conflict: "Léonard et Michel-Ange s'affrontent pour la fresque du Palazzo Vecchio. Un carnet volé pourrait tout changer.",
    figure: "Léonard de Vinci",
    voiceLine: "Florence, 1504. Léonard et Michel-Ange se disputent la gloire.",
    aliases: ["florence", "léonard", "leonard", "vinci", "renaissance", "michel-ange"],
    url: null,
    accent: "#d98f4e",
  },
  {
    id: "sekigahara",
    place: "Sekigahara",
    year: "1600",
    yearValue: 1600,
    title: "Le Brouillard de Sekigahara",
    conflict: "Une lettre scellée d'un symbole inconnu pourrait empêcher la trahison de Kobayakawa. Tiens la ligne de l'Est avec Ieyasu.",
    figure: "Tokugawa Ieyasu",
    voiceLine: "Sekigahara, 1600. Le brouillard se lève sur la plus grande bataille des samouraïs.",
    aliases: ["sekigahara", "japon", "samouraï", "samourai", "ieyasu", "tokugawa"],
    url: "/troy.html?era=sekigahara",
    accent: "#c9b27a",
  },
  {
    id: "paris",
    place: "Paris",
    year: "1789",
    yearValue: 1789,
    title: "Le Souffle de la Bastille",
    conflict: "Le 14 juillet vacille : un ordre contradictoire pourrait noyer la révolution dans le sang. Trouve qui l'a écrit.",
    figure: "Camille Desmoulins",
    voiceLine: "Paris, 14 juillet 1789. La Bastille gronde.",
    aliases: ["paris", "bastille", "révolution", "revolution", "1789"],
    url: null,
    accent: "#4f7fd1",
  },
  {
    id: "austerlitz",
    place: "Austerlitz",
    year: "1805",
    yearValue: 1805,
    title: "Le Soleil d'Austerlitz",
    conflict: "Un espion a révélé le piège de Napoléon aux Alliés. Brise la colonne russe sur le plateau de Pratzen.",
    figure: "Napoléon",
    voiceLine: "Austerlitz, 2 décembre 1805. Le soleil se lève sur le plateau de Pratzen.",
    aliases: ["austerlitz", "napoléon", "napoleon", "empereur", "pratzen", "1805"],
    url: "/troy.html?era=austerlitz",
    accent: "#5a78c8",
  },
  {
    id: "berlin",
    place: "Berlin",
    year: "1989",
    yearValue: 1989,
    title: "La Nuit du Mur",
    conflict: "Le 9 novembre, une annonce mal comprise peut ouvrir le mur… ou déclencher le chaos. Guide les gardes et la foule.",
    figure: "Günter Schabowski",
    voiceLine: "Berlin, 9 novembre 1989. Le Mur est sur le point de tomber.",
    aliases: ["berlin", "mur", "allemagne", "1989"],
    url: null,
    accent: "#a8a8c8",
  },
];
