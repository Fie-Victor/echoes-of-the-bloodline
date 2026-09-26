import type { EraStory } from "../types.ts";

export const egyptEra: EraStory = {
  id: "egypt",
  title: "Le Char de Ramsès",
  place: "Qadesh",
  year: "1274 av. J.-C.",
  overview:
    "À la veille de la bataille de Qadesh contre Muwatalli II, l'armée égyptienne est divisée. Un faux messager menace de saboter le traité.",
  npcs: {
    ramses_01: {
      id: "ramses_01",
      name: "Ramsès II",
      voiceId: "7HhpTMy55D4HkXen",
      persona: "Ramsès II, jeune pharaon fougueux, béni par Amon. Confiant, majestueux et stratège.",
      eraRules: "Âge du bronze tardif, Égypte antique, chars de guerre, croyance absolue aux dieux et à Maât.",
      secrets: ["Les espions capturés ont menti sur la position de l'armée hittite."],
      initialTrust: 50,
      initialState: "idle",
    },
  },
  banter: {
    idleCompanionLines: [
      "Agent, le soleil de Qadesh est impitoyable. Ramsès prépare ses divisions d'Amon et de Rê.",
      "Méfie-toi des bédouins Shasou : leurs renseignements semblent forgés pour mener l'armée dans un piège.",
    ],
  },
};
