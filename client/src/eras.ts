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
  { label: "Hold the line", reply: hold, tactic: "hold" },
  { label: "Charge first", reply: charge, tactic: "charge" },
  { label: "Take the flank", reply: flank, tactic: "flank" },
];

export const ERAS: Record<EraId, EraConfig> = {
  troy: {
    id: "troy",
    chapter: "Chronicle I — Troy",
    title: "Troy, c. 1184 BCE",
    palette: {
      sky: 0x8ec6ef, haze: 0xe4d2b0, fog: 0.005, sun: 0xfff3d2, sunIntensity: 3.8, sunDir: [0.35, 0.92, 0.15],
      hemiSky: 0xd7eeff, hemiGround: 0x8d7350, ground: 0xd2b48a, vistaTint: 0xfff8ea, banner: 0x8e1b16, weather: "dust", exposure: 1.25,
    },
    player: { outfit: "legionary", weapon: "pilum" },
    leader: { id: "achilles_01", name: "Achilles", outfit: "legionary", weapon: "pilum" },
    intro: [
      {
        text: "Jump complete. Around 1184 BCE, the shores of Troy. You wear an Achaean warrior's linothorax and spear. The ships are beached, and the camp is on edge.",
        choices: [
          { label: "Where is the temporal anomaly?", reply: "A quantum distortion is coming off this beach. The Shadow slipped into camp to talk Achilles into deserting. If the Trojans burn the ships, the timeline collapses." },
          { label: "Who is the warrior by the fire?", reply: "That is Achilles, the deadliest fighter of the ancient world. Furious with Agamemnon, he refuses to fight. Wake his pride." },
        ],
      },
      {
        text: "Achilles is by the fire. He despises courtiers and respects courage. Remind him that his glory has to echo through the centuries.",
        choices: [
          { label: "I will speak to him.", reply: "Press E beside him. I am watching the dunes. Press T if you need me." },
          { label: "What if the Trojans attack?", reply: "Take your javelin or your spear. When the fight starts, stand with Achilles." },
        ],
      },
    ],
    objectives: {
      meet: "Objective: speak once to Achilles. The fight follows.",
      battle: "Objective: cut down three Trojans. Astra will guide you.",
      after: "The Trojans are down. Step through the rift.",
    },
    warCall: "By the gods! Your fire wakes me! The Trojans will not burn our ships! Take your spear, stranger: FOLLOW ME TO BATTLE!",
    briefing: {
      text: "Trojans are charging off the dunes with swords and bows. Achilles leads the counterattack. What is your plan?",
      choices: TACTICS(
        "Hold the ships beside Achilles and his wall of spears.",
        "Break the center with Achilles and split the Trojan wave.",
        "Circle the dunes and silence the Trojan archers.",
      ),
    },
    allies: {
      name: "Myrmidons and Achaeans",
      team: 0x8e1b16,
      squads: [
        { count: 6, role: "melee", outfit: "achaean", weapon: "pilum", hp: 130 },
        { count: 4, role: "javelin", outfit: "achaean", weapon: "pilum", hp: 100 },
      ],
    },
    enemies: {
      name: "Trojan army",
      team: 0x3a5a8a,
      squads: [
        { count: 8, role: "melee", outfit: "trojan", weapon: "sword", hp: 75 },
        { count: 4, role: "archer", outfit: "trojan", weapon: "longbow", hp: 65 },
      ],
    },
    callouts: {
      volley: "Trojan arrows! Raise your shield or dodge with Space!",
      charge: "The Trojans are hitting the camp! Hold the line beside Achilles!",
      lowHp: "Vitals dropping! Fall back behind Achilles!",
      losing: "The Achaean line is bending! Keep them off the ships!",
      winning: "The Trojan line is cracking! Achilles is through!",
      rout: "The Trojans are running for the walls! The field is ours!",
    },
    debrief: [
      {
        text: "First anomaly contained. Achilles held the ships, and his name will live in the songs of the Iliad.",
        choices: [
          { label: "Where is the next age?", reply: "The Shadow's signal rings more than a thousand years later, in 52 BCE, at the siege of Alesia." },
          { label: "And the anomaly?", reply: "The Shadow tries to reverse every great war. We have to restore each link." },
        ],
      },
      { text: "A temporal rift has opened by the camp. Step through it and jump to Alesia." },
    ],
  },
  alesia: {
    id: "alesia",
    chapter: "Chronicle II — Alesia",
    title: "Alesia, 52 BCE",
    palette: {
      sky: 0x9ecff2, haze: 0xd5e0e8, fog: 0.006, sun: 0xfffaf0, sunIntensity: 3.3, sunDir: [0.25, 0.88, -0.35],
      hemiSky: 0xdceaf6, hemiGround: 0x6e6844, ground: 0xa3b47c, vistaTint: 0xeef3f6, banner: 0x8e1b16, weather: "mist", exposure: 1.18,
    },
    player: { outfit: "legionary", weapon: "gladius" },
    leader: { id: "caesar_01", name: "Caesar", outfit: "caesar", weapon: "gladius" },
    intro: [
      {
        text: "Jump complete. September 52 BCE, Alesia. You wear the segmented armor of a legionary of the Tenth. Do not drop your shield. Here it is worth more than a life.",
        choices: [
          { label: "What is happening here?", reply: "Caesar has ringed Vercingetorix with two lines of forts. A Gallic relief army is coming from the outside. The Romans are caught in the middle." },
          { label: "Where is the anomaly?", reply: "I read a temporal signature in the camp. Someone sold the Gauls a plan of the forts, printed on polymer. That is the Shadow." },
        ],
      },
      {
        text: "Caesar is in his tent, by the fire. He trusts no one since the betrayal. Praise Rome, then tell him about the plan. Stay humble. He is a proconsul.",
        choices: [
          { label: "Understood. I will see him.", reply: "Press E beside him. I stay on the line. Press T if you need me." },
          { label: "What if I fight alone?", reply: "A legionary alone is a dead legionary. Rome's strength is the line. Speak to Caesar first." },
        ],
      },
    ],
    objectives: {
      meet: "Objective: speak once to Caesar. The fight follows.",
      battle: "Objective: cut down three Gauls. Astra will guide you.",
      after: "Victory. Step through the rift.",
    },
    warCall: "To arms! The Gallic relief army is hitting the outer line. Legionary, with me — for Rome!",
    briefing: {
      text: "About fifteen Gallic warriors are charging, with javelineers behind them. The Romans throw their pila first, then it is close combat. What is your plan?",
      choices: TACTICS(
        "Tight formation, shields locked. Let them spend themselves on the wall of scuta.",
        "Bold. Strike before their javelins fly, but do not get cut off.",
        "I will guide you on the right. The Gauls guard their flanks poorly.",
      ),
    },
    allies: {
      name: "Caesar's legions",
      team: 0x8e1b16,
      squads: [
        { count: 6, role: "javelin", outfit: "legionary", weapon: "pilum", hp: 130 },
        { count: 6, role: "melee", outfit: "legionary", weapon: "gladius", hp: 140 },
      ],
    },
    enemies: {
      name: "Gallic relief army",
      team: 0x3a5a8a,
      squads: [
        { count: 10, role: "melee", outfit: "gaul", weapon: "sword", hp: 80 },
        { count: 4, role: "javelin", outfit: "gaul", weapon: "yari", hp: 70 },
      ],
    },
    callouts: {
      volley: "Javelins! Raise your shield, dodge with Space!",
      charge: "They are charging! Hold the line, strike between the shields!",
      lowHp: "Your vitals are dropping. Fall back behind the line and breathe!",
      losing: "The Roman line is bending. If it breaks, Alesia is lost, and history with it.",
      winning: "Their rush is breaking. Keep going, they are hesitating!",
      rout: "They are running! The relief army is coming apart. Vercingetorix will surrender tomorrow.",
    },
    debrief: [
      {
        text: "Anomaly neutralized. The Shadow's plan was not enough. Vercingetorix will lay down his arms at Caesar's feet, just as the archives say.",
        choices: [
          { label: "Who is the Shadow, really?", reply: "A renegade agent from my own age. He thinks that by rewriting the wars he can erase yours. Your bloodline, agent." },
          { label: "All these dead…", reply: "I know. They would have died anyway. We only make sure the history stays theirs." },
        ],
      },
      { text: "New signature, fifteen centuries later. A rift is opening by the tent. Step through when you are ready." },
    ],
  },
  orleans: {
    id: "orleans",
    chapter: "Chronicle III — Orleans",
    title: "Orleans, May 1429",
    palette: {
      sky: 0xb7c6d4, haze: 0xd0d6dc, fog: 0.008, sun: 0xeef3f8, sunIntensity: 2.6, sunDir: [-0.25, 0.8, -0.35],
      hemiSky: 0xdfe6ee, hemiGround: 0x5a5848, ground: 0x8a9470, vistaTint: 0xd8dee6, banner: 0x243a8a, weather: "rain", exposure: 1.12,
    },
    player: { outfit: "french_1429", weapon: "sword" },
    leader: { id: "jeanne_01", name: "Joan", outfit: "jeanne", weapon: "banner" },
    intro: [
      {
        text: "May 1429. Orleans has been besieged by the English for seven months. You wear the harness of one of the Dauphin's men-at-arms. Watch the rain. The mud is slick.",
        choices: [
          { label: "Who is in command?", reply: "On paper, Dunois, the Bastard of Orleans. In truth, a girl of seventeen: Joan. The soldiers follow her like a miracle." },
          { label: "And the anomaly?", reply: "The English at Les Tourelles have refined black powder, three centuries too early. If those bombards fire, Joan dies tomorrow." },
        ],
      },
      {
        text: "Joan is by her standard. She hates court manners. Speak plainly. Speak of her faith, and of Les Tourelles.",
        choices: [
          { label: "Do you believe her voices, Astra?", reply: "I believe what she gets done. And you, keep your doubts to yourself. She will feel them." },
          { label: "Let's go.", reply: "Press E to speak to her. I am watching the English walls." },
        ],
      },
    ],
    objectives: {
      meet: "Objective: speak once to Joan. The fight follows.",
      battle: "Objective: cut down three English. Astra will guide you.",
      after: "Les Tourelles have fallen. Step through the rift.",
    },
    warCall: "In God's name, forward! Les Tourelles will be ours before night. Follow my standard!",
    briefing: {
      text: "English longbowmen, and a dozen men-at-arms. A Welsh archer looses ten arrows a minute. You have to cross the killing ground fast. Your order?",
      choices: TACTICS(
        "Let our crossbowmen wear their archers down first. Cautious, but the arrows will fall for a long time.",
        "Straight at them, like Joan. The sooner we are in contact, the less the bows matter.",
        "Along the river side. The archers will not pivot in time.",
      ),
    },
    allies: {
      name: "The Dauphin's companies",
      team: 0x243a8a,
      squads: [
        { count: 7, role: "melee", outfit: "french_1429", weapon: "sword", hp: 130 },
        { count: 3, role: "archer", outfit: "french_1429", weapon: "crossbow", hp: 90 },
      ],
    },
    enemies: {
      name: "English garrison of Les Tourelles",
      team: 0xb0201a,
      squads: [
        { count: 6, role: "archer", outfit: "english_1429", weapon: "longbow", hp: 80 },
        { count: 7, role: "melee", outfit: "english_1429", weapon: "axe", hp: 120 },
      ],
    },
    callouts: {
      volley: "Arrow volley! Dodge, or get behind a man in armor!",
      charge: "English men-at-arms are coming out! Axe and sword, aim for the gaps in the plate.",
      lowHp: "You are bleeding. An arrow went through the mail. Fall back, I am stabilizing you.",
      losing: "The French are falling back toward the Loire… Joan is hit in the shoulder, just as the chronicles say. Hold!",
      winning: "Joan is back in the fight, her standard is on the wall! The English are wavering!",
      rout: "Les Tourelles are falling! The siege of Orleans is broken. In two months the Dauphin will be crowned at Reims.",
    },
    debrief: [
      {
        text: "The Shadow's powder went into the Loire. Joan was wounded by an arrow, exactly as history says. Nothing more.",
        choices: [
          { label: "I know how she ends…", reply: "Rouen, 1431. We cannot save her, agent. If we do, the France she made never exists." },
          { label: "Was the Shadow here?", reply: "A man in a shadow-cloak was seen on the quays. He left before we did. He is always one move ahead." },
        ],
      },
      { text: "Next signature: Japan, 1600. Thick fog. A rift has opened by the tent." },
    ],
  },
  sekigahara: {
    id: "sekigahara",
    chapter: "Chronicle IV — Sekigahara",
    title: "Sekigahara, 21 October 1600",
    palette: {
      sky: 0xc5d6de, haze: 0xdce4e2, fog: 0.01, sun: 0xfff6e4, sunIntensity: 2.8, sunDir: [0.55, 0.72, -0.2],
      hemiSky: 0xe7eef0, hemiGround: 0x5a5840, ground: 0x8ea06a, vistaTint: 0xe4ece8, banner: 0xf2efe6, weather: "mist", exposure: 1.12,
    },
    player: { outfit: "samurai_east", weapon: "katana" },
    leader: { id: "ieyasu_01", name: "Tokugawa Ieyasu", outfit: "ieyasu", weapon: "katana" },
    intro: [
      {
        text: "21 October 1600, at dawn. Sekigahara, Japan. You wear the lacquered cuirass and the white sashimono of the Eastern army. The fog is so thick you cannot see thirty meters.",
        choices: [
          { label: "Who is fighting whom?", reply: "Tokugawa Ieyasu and the Eastern army, against Ishida Mitsunari and the West. The winner will rule Japan for two hundred and fifty years." },
          { label: "Why does this fog worry me?", reply: "Because the arquebuses are firing blind, and the Shadow is counting on that. He sent a masked envoy up Mount Matsuo." },
        ],
      },
      {
        text: "Lord Ieyasu waits behind the maku, the camp curtain. He is patient and very polite. Bow, and speak little. Do not mention Kobayakawa until he already trusts you.",
        choices: [
          { label: "Kobayakawa?", reply: "A Western general who must betray at noon and swing the battle. If the Shadow talks him out of it, Ieyasu loses, and modern Japan never exists." },
          { label: "Hai.", reply: "Good. You learn fast. Press E to speak to the lord." },
        ],
      },
    ],
    objectives: {
      meet: "Objective: speak once to Lord Ieyasu. The fight follows.",
      battle: "Objective: cut down three of the West. Astra will guide you.",
      after: "Kobayakawa has betrayed the West. Step through the rift.",
    },
    warCall: "The fog is lifting. Mitsunari attacks. Let your sword speak for the Tokugawa.",
    briefing: {
      text: "Western arquebusiers will fire a volley, then the yari samurai will charge. An arquebus volley at fifty meters is lethal. Your plan?",
      choices: TACTICS(
        "Our arquebusiers answer volley for volley, then we take the charge on the spears.",
        "Charge while they reload. An arquebus takes thirty seconds.",
        "The fog covers us. We go around by the rice fields, on the left.",
      ),
    },
    allies: {
      name: "Eastern army (Tokugawa)",
      team: 0xf2efe6,
      squads: [
        { count: 4, role: "musket", outfit: "samurai_east", weapon: "arquebus", hp: 90 },
        { count: 10, role: "melee", outfit: "samurai_east", weapon: "yari", hp: 130 },
      ],
    },
    enemies: {
      name: "Western army (Ishida)",
      team: 0x2a2a2a,
      squads: [
        { count: 5, role: "musket", outfit: "samurai_west", weapon: "arquebus", hp: 90 },
        { count: 9, role: "melee", outfit: "samurai_west", weapon: "katana", hp: 120 },
      ],
    },
    callouts: {
      volley: "Matchlocks lit ahead! Arquebus volley, get down or dodge!",
      charge: "The Western taiko are beating the charge! Spears forward!",
      lowHp: "A lead ball hit your cuirass. It held, but not twice. Fall back!",
      losing: "The East is giving way… Kobayakawa still has not moved on Mount Matsuo. Hold until noon!",
      winning: "Banners are coming down Mount Matsuo… Kobayakawa is attacking the West! The betrayal is happening!",
      rout: "The West is collapsing. Mitsunari is fleeing. The Edo era begins today.",
    },
    debrief: [
      {
        text: "The Shadow's envoy did not convince Kobayakawa. Your stand bought the time the historical betrayal needed.",
        choices: [
          { label: "Is the Shadow falling back?", reply: "No. He is speeding up. Every age brings him closer to his own… and to your bloodline. The next target is a battle everyone knows." },
          { label: "I am starting to like this armor.", reply: "Seventy kilos of lacquer and iron. You held. The next kit is lighter, but the bullets are faster." },
        ],
      },
      { text: "Last jump of this chronicle: December 1805, Moravia. Bring gloves. It is freezing. The rift is open by the tent." },
    ],
  },
  austerlitz: {
    id: "austerlitz",
    chapter: "Chronicle V — Austerlitz",
    title: "Austerlitz, 2 December 1805",
    palette: {
      sky: 0xd4e6f6, haze: 0xe7eef4, fog: 0.006, sun: 0xfff8e6, sunIntensity: 3.5, sunDir: [0.2, 0.78, -0.45],
      hemiSky: 0xeaf3fb, hemiGround: 0x8a8e94, ground: 0xeef1f4, vistaTint: 0xf4f7fb, banner: 0x1f2f6b, weather: "snow", exposure: 1.22,
    },
    player: { outfit: "french_line", weapon: "musket" },
    leader: { id: "napoleon_01", name: "Napoleon", outfit: "napoleon", weapon: "sword" },
    intro: [
      {
        text: "2 December 1805, eight in the morning, Moravia. Line infantry coat, shako, Charleville musket and bayonet. It is five below freezing. Snow covers the frozen ponds.",
        choices: [
          { label: "Which battle?", reply: "Austerlitz. The Battle of the Three Emperors. Napoleon against Tsar Alexander and Emperor Francis. His masterpiece, if everything goes as planned." },
          { label: "What did the Shadow do?", reply: "He warned Kutuzov of Napoleon's trap. If the Russians do not leave the Pratzen heights, the Grand Army is crushed." },
        ],
      },
      {
        text: "The Emperor is by the campfires. He hates chatter and loves precise facts. Tell him about the heights, and about the spy.",
        choices: [
          { label: "What if he has me shot?", reply: "Possible. But he is curious. A grenadier who knows his secret plan will intrigue him more than frighten him." },
          { label: "Forward.", reply: "Press E beside him. I will calculate the artillery arcs while you talk." },
        ],
      },
    ],
    objectives: {
      meet: "Objective: speak once to the Emperor. The fight follows.",
      battle: "Objective: cut down three Russians. Astra will guide you.",
      after: "The sun of Austerlitz is rising. Step through the rift.",
    },
    warCall: "Soldiers! One clap of thunder and this war is finished. The heights, now! Vive la France!",
    briefing: {
      text: "A Russian column is coming in: line infantry, grenadiers with bayonets. Our Gribeauval battery is about to fire. A musket manages three shots a minute, and is barely accurate at a hundred meters. Your order?",
      choices: TACTICS(
        "Volley fire by rank, then wait for them to come onto our bayonets. French discipline will do the rest.",
        "One volley, then the bayonet! That is what Saint-Hilaire would do.",
        "Along the ponds. The guns pin them, we take them from the side.",
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
      name: "Kutuzov's Russian column",
      team: 0x2f4a2a,
      squads: [
        { count: 8, role: "musket", outfit: "russian_line", weapon: "musket", hp: 90 },
        { count: 6, role: "melee", outfit: "russian_line", weapon: "musket", hp: 110 },
      ],
    },
    callouts: {
      volley: "They are aiming! Russian volley, get down or dodge!",
      charge: "Russian grenadiers with bayonets, hurrah! Receive them in line!",
      lowHp: "You are hit. A lead ball in the shoulder. You can still hold the musket. Stay in cover!",
      losing: "The Russians are taking the heights back… If Pratzen falls, the trap fails.",
      winning: "The Russian column is breaking under the shot! The allied center is pierced!",
      rout: "Pratzen is ours! The Allies are fleeing onto the frozen ponds. The sun of Austerlitz, agent!",
      cannon: "The battery is opening fire. Shot in the air. Do not stand in its path.",
    },
    debrief: [
      {
        text: "The Shadow's warning arrived too late. Austerlitz remains Austerlitz. Your bloodline's chronicle is stable… for now.",
        choices: [
          { label: "What now?", reply: "Now we hunt him to his own age. That is another chronicle. You can replay any era from the title screen." },
          { label: "Thank you, Astra.", reply: "Thank you. I never had a human partner before you. You are… a good anomaly." },
        ],
      },
    ],
  },
};
