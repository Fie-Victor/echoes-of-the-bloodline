import type { EraId } from "../../shared/eras.ts";
import type { OutfitId, Weapon } from "./outfits.ts";

export type UnitRole = "melee" | "archer" | "javelin" | "musket" | "cannon";

export interface Squad {
  count: number;
  role: UnitRole;
  outfit: OutfitId;
  weapon: Weapon;
  hp: number;
}

export interface ArmyConfig {
  name: string;
  team: number;
  squads: Squad[];
}

export interface AstraChoice {
  label: string;
  reply: string;
  tactic?: Tactic;
}

export interface AstraBeat {
  text: string;
  choices?: AstraChoice[];
}

/** Player-chosen battle plan: shapes ally behaviour (hold the line, charge, flank). */
export type Tactic = "hold" | "charge" | "flank";

export interface Palette {
  sky: number;
  haze: number;
  fog: number;
  sun: number;
  sunIntensity: number;
  sunDir: [number, number, number];
  hemiSky: number;
  hemiGround: number;
  ground: number;
  vistaTint: number;
  banner: number;
  weather: "dust" | "rain" | "snow" | "mist" | "embers" | "clear";
  exposure: number;
}

export interface EraConfig {
  id: EraId;
  chapter: string;
  title: string;
  palette: Palette;
  player: { outfit: OutfitId; weapon: Weapon };
  leader: { id: string; name: string; outfit: OutfitId; weapon: Weapon };
  intro: AstraBeat[];
  objectives: { meet: string; battle: string; after: string };
  /** Line the leader speaks when the battle is called, then Astra's tactical briefing. */
  warCall: string;
  briefing: AstraBeat;
  allies?: ArmyConfig;
  enemies?: ArmyConfig;
  /** Astra's live battlefield callouts. */
  callouts: { volley: string; charge: string; lowHp: string; losing: string; winning: string; rout: string; cannon?: string };
  debrief: AstraBeat[];
}

const TACTICS = (hold: string, charge: string, flank: string): AstraChoice[] => [
  { label: "Tenir la ligne", reply: hold, tactic: "hold" },
  { label: "Charger en premier", reply: charge, tactic: "charge" },
  { label: "Prendre le flanc", reply: flank, tactic: "flank" },
];

export const ERAS: Record<EraId, EraConfig> = {
  troy: {
    id: "troy",
    chapter: "Chronique I — Troie",
    title: "Troie, 1200 av. J.-C.",
    palette: {
      sky: 0x373033, haze: 0x6b4a38, fog: 0.011, sun: 0xffb070, sunIntensity: 3.2, sunDir: [-0.35, 0.28, -1],
      hemiSky: 0xffc9a0, hemiGround: 0x2a2030, ground: 0xb8a58c, vistaTint: 0xffffff, banner: 0x8e1b16, weather: "dust", exposure: 1.05,
    },
    player: { outfit: "legionary", weapon: "pilum" },
    leader: { id: "achilles_01", name: "Achille", outfit: "legionary", weapon: "pilum" },
    intro: [],
    objectives: { meet: "Objectif : gagner la confiance d'Achille.", battle: "", after: "Traverser la brèche temporelle." },
    warCall: "",
    briefing: { text: "" },
    callouts: { volley: "", charge: "", lowHp: "", losing: "", winning: "", rout: "" },
    debrief: [],
  },
  alesia: {
    id: "alesia",
    chapter: "Chronique II — Alésia",
    title: "Alésia, 52 av. J.-C.",
    palette: {
      sky: 0x5f8fc8, haze: 0xc9d6e0, fog: 0.007, sun: 0xfff2dc, sunIntensity: 3.6, sunDir: [0.45, 1.1, -0.6],
      hemiSky: 0xbcd4ee, hemiGround: 0x5a5038, ground: 0x9aa070, vistaTint: 0xa8c4e0, banner: 0x8e1b16, weather: "clear", exposure: 1.1,
    },
    player: { outfit: "legionary", weapon: "gladius" },
    leader: { id: "caesar_01", name: "César", outfit: "caesar", weapon: "gladius" },
    intro: [
      {
        text: "Saut réussi. Septembre 52 avant J.-C., Alésia. Tu portes la lorica segmentata d'un légionnaire de la Xe. Ne perds pas ton scutum, ici il vaut plus qu'une vie.",
        choices: [
          { label: "Que se passe-t-il ici ?", reply: "César encercle Vercingétorix avec deux lignes de fortifications. Et une armée de secours gauloise arrive par l'extérieur. Les Romains sont pris en sandwich." },
          { label: "Où est l'anomalie ?", reply: "Je détecte une signature temporelle dans le camp. Quelqu'un a vendu aux Gaulois un plan des fortifications, imprimé sur du polymère. C'est l'Ombre." },
        ],
      },
      {
        text: "César est sous sa tente, près du feu. Il se méfie de tout le monde depuis la trahison. Flatte Rome, puis parle-lui du plan. Et reste humble, c'est un proconsul.",
        choices: [
          { label: "Compris, je vais le voir.", reply: "Appuie sur E près de lui. Je reste en ligne, appuie sur T si tu as besoin de moi." },
          { label: "Et si je me bats seul ?", reply: "Un légionnaire seul est un légionnaire mort. La force de Rome, c'est la ligne. Parle d'abord à César." },
        ],
      },
    ],
    objectives: {
      meet: "Objectif : convaincre César de la trahison (confiance 70).",
      battle: "Objectif : repousser l'assaut gaulois sur la circonvallation.",
      after: "Victoire. Rejoindre la brèche temporelle.",
    },
    warCall: "Aux armes ! Les Gaulois de l'armée de secours attaquent la ligne extérieure. Légionnaire, avec moi — pour Rome !",
    briefing: {
      text: "Environ quinze guerriers gaulois chargent, des lanceurs de javelots derrière. Les Romains lancent leurs pila d'abord, puis c'est le corps à corps. Quel est ton plan ?",
      choices: TACTICS(
        "Formation serrée, boucliers joints. Laisse-les s'épuiser contre le mur de scuta.",
        "Audacieux. Frappe avant que leurs javelots ne partent, mais ne t'isole pas.",
        "Je te guide par la droite. Les Gaulois protègent mal leurs flancs.",
      ),
    },
    allies: {
      name: "Légions de César",
      team: 0x8e1b16,
      squads: [
        { count: 6, role: "javelin", outfit: "legionary", weapon: "pilum", hp: 130 },
        { count: 6, role: "melee", outfit: "legionary", weapon: "gladius", hp: 140 },
      ],
    },
    enemies: {
      name: "Armée de secours gauloise",
      team: 0x3a5a8a,
      squads: [
        { count: 10, role: "melee", outfit: "gaul", weapon: "sword", hp: 80 },
        { count: 4, role: "javelin", outfit: "gaul", weapon: "yari", hp: 70 },
      ],
    },
    callouts: {
      volley: "Javelots ! Lève ton bouclier, esquive avec Espace !",
      charge: "Ils chargent ! Garde la ligne, frappe entre les boucliers !",
      lowHp: "Tes signes vitaux chutent. Recule derrière la ligne, respire !",
      losing: "La ligne romaine plie. Si elle cède, Alésia est perdue et l'Histoire avec.",
      winning: "Leur élan se brise. Continue, ils hésitent !",
      rout: "Ils fuient ! L'armée de secours se disloque. Vercingétorix se rendra demain.",
    },
    debrief: [
      {
        text: "Anomalie neutralisée : le plan de l'Ombre n'a pas suffi. Vercingétorix déposera les armes aux pieds de César, comme dans les archives.",
        choices: [
          { label: "Qui est vraiment l'Ombre ?", reply: "Un agent renégat de ma propre époque. Il pense qu'en réécrivant les guerres, il peut effacer la tienne. Ta lignée, agent." },
          { label: "Tous ces morts…", reply: "Je sais. Ils seraient morts de toute façon. Nous, on s'assure seulement que l'Histoire reste la leur." },
        ],
      },
      { text: "Nouvelle signature détectée, quinze siècles plus tard. Une brèche s'ouvre près de la tente. Passe-la quand tu es prêt." },
    ],
  },
  orleans: {
    id: "orleans",
    chapter: "Chronique III — Orléans",
    title: "Orléans, mai 1429",
    palette: {
      sky: 0x6a9ad6, haze: 0xd4dce4, fog: 0.006, sun: 0xfff6e6, sunIntensity: 3.8, sunDir: [-0.5, 1.2, -0.5],
      hemiSky: 0xc4dcf4, hemiGround: 0x4e5a34, ground: 0x7e9a58, vistaTint: 0xb4cce8, banner: 0x243a8a, weather: "clear", exposure: 1.1,
    },
    player: { outfit: "french_1429", weapon: "sword" },
    leader: { id: "jeanne_01", name: "Jeanne", outfit: "jeanne", weapon: "banner" },
    intro: [
      {
        text: "Mai 1429. Orléans est assiégée par les Anglais depuis sept mois. Tu portes le harnois d'un homme d'armes du Dauphin. Attention, la pluie rend la boue glissante.",
        choices: [
          { label: "Qui commande ici ?", reply: "Officiellement, Dunois, le Bâtard d'Orléans. En réalité, une jeune fille de dix-sept ans : Jeanne. Les soldats la suivent comme un miracle." },
          { label: "Et l'anomalie ?", reply: "Les Anglais des Tourelles ont reçu de la poudre noire raffinée, trois siècles trop tôt. Si ces bombardes tirent, Jeanne meurt demain." },
        ],
      },
      {
        text: "Jeanne est près de son étendard. Elle déteste les manières des courtisans : parle franchement, parle de sa foi et des Tourelles.",
        choices: [
          { label: "Tu crois en ses voix, Astra ?", reply: "Je crois en ce qu'elle accomplit. Et toi, garde tes doutes pour toi : elle les sentira." },
          { label: "Allons-y.", reply: "E pour lui parler. Je surveille les remparts anglais." },
        ],
      },
    ],
    objectives: {
      meet: "Objectif : gagner la confiance de Jeanne (confiance 70).",
      battle: "Objectif : prendre la bastille des Tourelles.",
      after: "Les Tourelles sont tombées. Rejoindre la brèche temporelle.",
    },
    warCall: "Au nom de Dieu, en avant ! Les Tourelles seront à nous avant la nuit. Suis mon étendard !",
    briefing: {
      text: "Des archers anglais à arc long, une douzaine d'hommes d'armes. Un archer gallois tire dix flèches à la minute. Il faut traverser la zone de tir vite. Ton ordre ?",
      choices: TACTICS(
        "Laisser nos arbalétriers user leurs archers d'abord. Prudent, mais les flèches pleuvront longtemps.",
        "Droit sur eux, comme Jeanne. Plus vite on est au contact, moins les arcs servent.",
        "Par le côté de la rivière. Les archers ne pourront pas pivoter à temps.",
      ),
    },
    allies: {
      name: "Compagnies du Dauphin",
      team: 0x243a8a,
      squads: [
        { count: 7, role: "melee", outfit: "french_1429", weapon: "sword", hp: 130 },
        { count: 3, role: "archer", outfit: "french_1429", weapon: "crossbow", hp: 90 },
      ],
    },
    enemies: {
      name: "Garnison anglaise des Tourelles",
      team: 0xb0201a,
      squads: [
        { count: 6, role: "archer", outfit: "english_1429", weapon: "longbow", hp: 80 },
        { count: 7, role: "melee", outfit: "english_1429", weapon: "axe", hp: 120 },
      ],
    },
    callouts: {
      volley: "Volée de flèches ! Esquive ou mets-toi derrière un homme en armure !",
      charge: "Les hommes d'armes anglais sortent ! Hache et épée, vise les jointures de l'armure.",
      lowHp: "Tu saignes. Une flèche a traversé la maille. Recule, je stabilise.",
      losing: "Les Français reculent vers la Loire… Jeanne est blessée à l'épaule, comme dans les chroniques. Tiens bon !",
      winning: "Jeanne est revenue au combat, son étendard touche le rempart ! Les Anglais vacillent !",
      rout: "Les Tourelles tombent ! Le siège d'Orléans est brisé. Dans deux mois, le Dauphin sera sacré à Reims.",
    },
    debrief: [
      {
        text: "La poudre de l'Ombre a été noyée dans la Loire. Jeanne a été blessée d'une flèche, exactement comme l'Histoire le dit. Rien de plus.",
        choices: [
          { label: "Je sais comment elle finit…", reply: "Rouen, 1431. On ne peut pas la sauver, agent. Si on le fait, la France qu'elle a faite n'existe plus." },
          { label: "L'Ombre était ici ?", reply: "Un homme au manteau d'ombre a été vu sur les quais. Il est reparti avant nous. Il a toujours un coup d'avance." },
        ],
      },
      { text: "Signature suivante : Japon, 1600. Brouillard dense. Une brèche s'est ouverte près de la tente." },
    ],
  },
  sekigahara: {
    id: "sekigahara",
    chapter: "Chronique IV — Sekigahara",
    title: "Sekigahara, 21 octobre 1600",
    palette: {
      sky: 0x86a8cc, haze: 0xd8dcdc, fog: 0.011, sun: 0xffeccc, sunIntensity: 3.2, sunDir: [0.6, 0.8, -0.8],
      hemiSky: 0xd8e4ee, hemiGround: 0x4a4a36, ground: 0x7c8a5e, vistaTint: 0xc8d4dc, banner: 0xf2efe6, weather: "mist", exposure: 1.0,
    },
    player: { outfit: "samurai_east", weapon: "katana" },
    leader: { id: "ieyasu_01", name: "Tokugawa Ieyasu", outfit: "ieyasu", weapon: "katana" },
    intro: [
      {
        text: "21 octobre 1600, à l'aube. Sekigahara, Japon. Tu portes le dō laqué et le sashimono blanc des troupes de l'Est. Le brouillard est si dense qu'on ne voit pas à trente mètres.",
        choices: [
          { label: "Qui se bat contre qui ?", reply: "Tokugawa Ieyasu et l'armée de l'Est, contre Ishida Mitsunari et l'Ouest. Le vainqueur gouvernera le Japon pendant deux cent cinquante ans." },
          { label: "Pourquoi ce brouillard m'inquiète ?", reply: "Parce que les arquebuses tirent à l'aveugle, et que l'Ombre compte dessus. Il a fait monter un émissaire masqué au mont Matsuo." },
        ],
      },
      {
        text: "Le seigneur Ieyasu attend derrière le maku, le rideau de camp. Il est patient et très poli : incline-toi, parle peu. Kobayakawa, ne l'évoque que s'il t'a déjà accordé sa confiance.",
        choices: [
          { label: "Kobayakawa ?", reply: "Un général de l'Ouest qui doit trahir à midi et basculer la bataille. Si l'Ombre l'en dissuade, Ieyasu perd, et le Japon moderne n'existe pas." },
          { label: "Hai.", reply: "Parfait, tu apprends vite. E pour parler au seigneur." },
        ],
      },
    ],
    objectives: {
      meet: "Objectif : obtenir la confiance du seigneur Ieyasu (confiance 70).",
      battle: "Objectif : tenir face à la charge de l'Ouest dans le brouillard.",
      after: "Kobayakawa a trahi l'Ouest. Rejoindre la brèche temporelle.",
    },
    warCall: "Le brouillard se lève. Mitsunari attaque. Que ton sabre parle pour les Tokugawa.",
    briefing: {
      text: "Des arquebusiers de l'Ouest vont tirer une salve, puis les samouraïs à la yari chargeront. Une salve d'arquebuse à cinquante mètres est mortelle. Ton plan ?",
      choices: TACTICS(
        "Nos arquebusiers ripostent salve pour salve, puis on reçoit la charge sur les lances.",
        "Chargeons pendant qu'ils rechargent : une arquebuse met trente secondes à recharger.",
        "Le brouillard nous couvre. On contourne par les rizières, à gauche.",
      ),
    },
    allies: {
      name: "Armée de l'Est (Tokugawa)",
      team: 0xf2efe6,
      squads: [
        { count: 4, role: "musket", outfit: "samurai_east", weapon: "arquebus", hp: 90 },
        { count: 8, role: "melee", outfit: "samurai_east", weapon: "yari", hp: 120 },
      ],
    },
    enemies: {
      name: "Armée de l'Ouest (Ishida)",
      team: 0x2a2a2a,
      squads: [
        { count: 5, role: "musket", outfit: "samurai_west", weapon: "arquebus", hp: 90 },
        { count: 9, role: "melee", outfit: "samurai_west", weapon: "katana", hp: 120 },
      ],
    },
    callouts: {
      volley: "Mèches allumées en face ! Salve d'arquebuses, baisse-toi ou esquive !",
      charge: "Les taikos de l'Ouest battent la charge ! Lances en avant !",
      lowHp: "Une balle de plomb a touché ton dō. Il a tenu, mais pas deux fois. Recule !",
      losing: "L'Est cède… Kobayakawa ne bouge toujours pas du mont Matsuo. Il faut tenir jusqu'à midi !",
      winning: "Des bannières descendent du mont Matsuo… Kobayakawa attaque l'Ouest ! La trahison a lieu !",
      rout: "L'Ouest s'effondre. Mitsunari s'enfuit. L'ère Edo commence aujourd'hui.",
    },
    debrief: [
      {
        text: "L'émissaire de l'Ombre n'a pas convaincu Kobayakawa. Ta résistance a donné le temps nécessaire à la trahison historique.",
        choices: [
          { label: "L'Ombre recule ?", reply: "Non. Il accélère. Chaque époque le rapproche de la sienne… et de ta lignée. La prochaine cible est une bataille que tout le monde connaît." },
          { label: "Je commence à aimer ces armures.", reply: "Soixante-dix kilos de laque et de fer. Tu as bien tenu. La prochaine tenue est plus légère, mais les balles vont plus vite." },
        ],
      },
      { text: "Dernier saut de cette chronique : décembre 1805, Moravie. Prends des gants, il gèle. Brèche ouverte près de la tente." },
    ],
  },
  austerlitz: {
    id: "austerlitz",
    chapter: "Chronique V — Austerlitz",
    title: "Austerlitz, 2 décembre 1805",
    palette: {
      sky: 0x5c8cd0, haze: 0xdce4ee, fog: 0.008, sun: 0xfff0d4, sunIntensity: 2.8, sunDir: [0.7, 0.7, -0.7],
      hemiSky: 0xd4e4f8, hemiGround: 0x8a8c90, ground: 0xe8ecf2, vistaTint: 0xb8d0ec, banner: 0x1f2f6b, weather: "snow", exposure: 0.85,
    },
    player: { outfit: "french_line", weapon: "musket" },
    leader: { id: "napoleon_01", name: "Napoléon", outfit: "napoleon", weapon: "sword" },
    intro: [
      {
        text: "2 décembre 1805, huit heures du matin, Moravie. Uniforme de fusilier de ligne, shako, fusil Charleville et baïonnette. Il fait moins cinq, la neige couvre les étangs gelés.",
        choices: [
          { label: "Quelle bataille ?", reply: "Austerlitz. La bataille des Trois Empereurs. Napoléon contre le tsar Alexandre et l'empereur François. Son chef-d'œuvre, si tout se passe comme prévu." },
          { label: "Qu'a fait l'Ombre ?", reply: "Il a averti Koutouzov du piège de Napoléon. Si les Russes ne quittent pas le plateau de Pratzen, la Grande Armée est écrasée." },
        ],
      },
      {
        text: "L'Empereur est près des feux de bivouac. Il déteste les bavards et adore les faits précis. Parle-lui du plateau, et de l'espion.",
        choices: [
          { label: "Et s'il me fait fusiller ?", reply: "Possible. Mais il est curieux. Un grenadier qui connaît son plan secret l'intriguera plus qu'il ne l'inquiète." },
          { label: "En avant.", reply: "E près de lui. Je calcule les trajectoires d'artillerie en attendant." },
        ],
      },
    ],
    objectives: {
      meet: "Objectif : convaincre l'Empereur de l'espion (confiance 70).",
      battle: "Objectif : briser la colonne russe sur le plateau de Pratzen.",
      after: "Le soleil d'Austerlitz se lève. Rejoindre la brèche temporelle.",
    },
    warCall: "Soldats ! Un seul coup de tonnerre, et cette guerre est finie. Le plateau, maintenant ! Vive la France !",
    briefing: {
      text: "Colonne russe en approche : des fusiliers en ligne, des grenadiers à la baïonnette. Notre batterie de Gribeauval va tirer. Un fusil tire trois coups par minute, à peine précis à cent mètres. Ton ordre ?",
      choices: TACTICS(
        "Feu de salve par rang, puis on attend qu'ils viennent sur nos baïonnettes. La discipline française fera le reste.",
        "Une salve, puis à la baïonnette ! C'est ce que ferait Saint-Hilaire.",
        "Par le flanc des étangs. L'artillerie les fixe, nous les prenons de côté.",
      ),
    },
    allies: {
      name: "Division Saint-Hilaire",
      team: 0x1f2f6b,
      squads: [
        { count: 9, role: "musket", outfit: "french_line", weapon: "musket", hp: 90 },
        { count: 2, role: "cannon", outfit: "french_line", weapon: "musket", hp: 90 },
      ],
    },
    enemies: {
      name: "Colonne russe de Koutouzov",
      team: 0x2f4a2a,
      squads: [
        { count: 8, role: "musket", outfit: "russian_line", weapon: "musket", hp: 90 },
        { count: 6, role: "melee", outfit: "russian_line", weapon: "musket", hp: 110 },
      ],
    },
    callouts: {
      volley: "Ils mettent en joue ! Salve russe, à terre ou esquive !",
      charge: "Grenadiers russes à la baïonnette, hourra ! Reçois-les en ligne !",
      lowHp: "Tu es touché. Une balle de plomb dans l'épaule, tu peux encore tenir le fusil. Reste à couvert !",
      losing: "Les Russes reprennent le plateau… Si Pratzen tombe, le piège échoue.",
      winning: "La colonne russe se disloque sous la mitraille ! Le centre allié est percé !",
      rout: "Pratzen est à nous ! Les Alliés fuient sur les étangs gelés. Le soleil d'Austerlitz, agent !",
      cannon: "La batterie ouvre le feu. Boulets en l'air, ne te mets pas sur leur trajectoire.",
    },
    debrief: [
      {
        text: "L'avertissement de l'Ombre est arrivé trop tard. Austerlitz reste Austerlitz. La chronique de ta lignée est stable… pour l'instant.",
        choices: [
          { label: "Et maintenant ?", reply: "Maintenant, on le traque jusqu'à son époque. Mais ça, c'est une autre chronique. Tu peux rejouer n'importe quelle époque depuis l'écran titre." },
          { label: "Merci, Astra.", reply: "Merci à toi. Je n'ai jamais eu de partenaire humain avant toi. Tu es… une bonne anomalie." },
        ],
      },
    ],
  },
};
