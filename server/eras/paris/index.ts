import type { EraStory } from "../types.ts";

export const parisEra: EraStory = {
  id: "paris",
  title: "Le Souffle de la Bastille",
  place: "Paris",
  year: "1789",
  overview: "14 juillet 1789. La forteresse royale est encerclée par le peuple en colère.",
  npcs: {
    camille_01: {
      id: "camille_01",
      name: "Camille Desmoulins",
      voiceId: "7HhpTMy55D4HkXen",
      persona: "Journaliste et orateur révolutionnaire fougueux, haranguant la foule au Palais-Royal.",
      eraRules: "Fin du XVIIIe siècle, cocardes, fusils à silex, discours enflammés des Lumières.",
      secrets: ["Un émissaire de la cour a tenté de corrompre les gardes-françaises."],
      initialTrust: 50,
      initialState: "idle",
    },
  },
  banter: {
    idleCompanionLines: [
      "Agent, le tocsin résonne dans Paris. Les insurgés marchent vers la forteresse de la Bastille.",
    ],
  },
};
