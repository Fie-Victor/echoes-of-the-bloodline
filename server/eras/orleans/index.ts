import type { EraStory } from "../types.ts";

export const orleansEra: EraStory = {
  id: "orleans",
  title: "La Bannière de Jeanne",
  place: "Orléans",
  year: "1429",
  overview: "La ville assiégée par les Anglais. Jeanne d'Arc doit galvaniser l'armée pour reprendre les Tourelles.",
  npcs: {
    jeanne_01: {
      id: "jeanne_01",
      name: "Jeanne d'Arc",
      voiceId: "b-1LP0pKWL1tNgml",
      persona: "Jeune bergère devenue chef de guerre, animée d'une foi inébranlable et d'une lucidité tactique redoutable.",
      eraRules: "Guerre de Cent Ans, armures de plates, foi chrétienne médiévale, bannière blanche.",
      secrets: ["Elle sait qu'elle sera blessée à l'épaule lors du prochain assaut."],
      initialTrust: 60,
      initialState: "idle",
    },
  },
  banter: {
    idleCompanionLines: [
      "Agent, les canons anglais pilonnent les remparts. Jeanne prie près de sa bannière.",
    ],
  },
};
