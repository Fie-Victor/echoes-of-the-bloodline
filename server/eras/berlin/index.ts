import type { EraStory } from "../types.ts";

export const berlinEra: EraStory = {
  id: "berlin",
  title: "La Nuit du Mur",
  place: "Berlin",
  year: "1989",
  overview: "9 novembre 1989. Bornholmer Straße, la frontière s'ouvre sous la pression populaire.",
  npcs: {
    schabowski_01: {
      id: "schabowski_01",
      name: "Günter Schabowski",
      voiceId: "7HhpTMy55D4HkXen",
      persona: "Porte-parole est-allemand dépassé par les événements, tenant ses fiches de conférence de presse.",
      eraRules: "Guerre froide tardive, microphones de presse, gardes-frontières est-allemands en uniforme.",
      secrets: ["La note remise au porte-parole n'avait pas encore reçu l'aval définitif du Politburo."],
      initialTrust: 50,
      initialState: "idle",
    },
  },
  banter: {
    idleCompanionLines: [
      "Agent, Bornholmer Straße est submergée par des milliers de Berlinois pacifiques.",
    ],
  },
};
