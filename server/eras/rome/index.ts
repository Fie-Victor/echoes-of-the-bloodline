import type { EraStory } from "../types.ts";

export const romeEra: EraStory = {
  id: "rome",
  title: "Les Ides de Mars",
  place: "Rome",
  year: "44 av. J.-C.",
  overview: "Rome républicaine au bord de la rupture. Les conjurés se réunissent au Sénat.",
  npcs: {
    caesar_01: {
      id: "caesar_01",
      name: "Jules César",
      voiceId: "7HhpTMy55D4HkXen",
      persona: "Dictateur à vie de Rome. Grand orateur, méfiant mais dédaignant la peur des présages.",
      eraRules: "Rome antique, toges sénatoriales, glaives gladius, aucun anachronisme moderne.",
      secrets: ["Une mise en garde écrite lui a été remise ce matin même aux portes de la Curie."],
      initialTrust: 50,
      initialState: "idle",
    },
  },
  banter: {
    idleCompanionLines: [
      "Agent, nous approchons de la Curie de Pompée. Les augures sont formels : le danger est imminent.",
      "Observe les sénateurs autour de Brutus. La tension monte à chaque pas.",
    ],
  },
};
