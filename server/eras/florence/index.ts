import type { EraStory } from "../types.ts";

export const florenceEra: EraStory = {
  id: "florence",
  title: "La Rivalité des Génies",
  place: "Florence",
  year: "1504",
  overview: "Palazzo Vecchio : Léonard de Vinci et Michel-Ange s'affrontent sur leurs fresques monumentales.",
  npcs: {
    vinci_01: {
      id: "vinci_01",
      name: "Léonard de Vinci",
      voiceId: "7HhpTMy55D4HkXen",
      persona: "Maître humaniste, ingénieur et peintre visionnaire, curieux de chaque phénomène naturel.",
      eraRules: "Renaissance italienne, écriture spéculaire, peintures à l'huile, pigments alchimiques.",
      secrets: ["Un dessin technique crypté a disparu de son atelier hier soir."],
      initialTrust: 55,
      initialState: "idle",
    },
  },
  banter: {
    idleCompanionLines: [
      "Agent, l'air de Florence sent l'huile de lin et la pierre taillée. Léonard étudie les mouvements de l'eau.",
    ],
  },
};
