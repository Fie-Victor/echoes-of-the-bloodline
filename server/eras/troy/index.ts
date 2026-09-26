import type { EraStory } from "../types.ts";
import { ACHILLES_NPC } from "./npcs.ts";
import { TROY_BANTER, TROY_COMBAT_GUIDANCE } from "./banter.ts";

export const troyEra: EraStory = {
  id: "troy",
  title: "La Colère d'Achille",
  place: "Troie",
  year: "1184 av. J.-C.",
  overview:
    "Campement des Achéens sur le rivage de Troie. Achille s'est retiré du combat après son litige avec Agamemnon. " +
    "L'Agent temporel doit s'allier à Achille et le convaincre de mener la charge pour repousser l'assaut troyen.",
  npcs: {
    achilles_01: ACHILLES_NPC,
  },
  banter: TROY_BANTER,
  combatGuidance: TROY_COMBAT_GUIDANCE,
  handleMockDialogue(npcId, input, currentTrust, currentState) {
    if (npcId !== "achilles_01") return null;

    const lower = input.toLowerCase();

    // Trigger for going to battle / war!
    if (
      /(combat|guerre|bataille|battre|arme|allons|lance|troyen|ennemi|charge|gloire|navire|aider|attaque)/i.test(lower) ||
      currentTrust >= 75
    ) {
      return {
        dialogue:
          "Par les dieux ! Ta voix porte le feu du courage ! Les Troyens ne brûleront pas nos nefs ! Prends ta lance, étranger : SUIS-MOI AU COMBAT !",
        newTrust: Math.max(90, currentTrust + 20),
        state: "friendly",
        triggerWar: true,
        triggerDevinUi: null,
      };
    }

    if (/(agamemnon|briséis|briseis)/i.test(lower)) {
      return {
        dialogue: "Ce roi sans honneur a bafoué mon nom. Mais si les vaisseaux brûlent, tous nos hommes périront.",
        newTrust: currentTrust + 10,
        state: "suspicious",
      };
    }

    if (/(respect|honneur|héros|vaillance|force|légende)/i.test(lower)) {
      return {
        dialogue: "Tu parles en homme de valeur. Mon bras démange d'écraser les insolents qui menacent notre camp.",
        newTrust: currentTrust + 15,
        state: "friendly",
      };
    }

    if (/(sceau|tente|verrou|mystère)/i.test(lower) && currentTrust >= 60) {
      return {
        dialogue: "Un étrange artefact de bronze luit dans ma tente. Si tu combats à mes côtés, je te laisserai l'examiner.",
        newTrust: currentTrust + 5,
        state: "friendly",
        triggerDevinUi: "generate_puzzle_lock",
        revealedSecretIndex: 1,
      };
    }

    if (/(lâche|peur|faible|traître)/i.test(lower)) {
      return {
        dialogue: "Ose répéter cela et ma javeline transpercera ta gorge avant que le soleil ne décline !",
        newTrust: Math.max(10, currentTrust - 25),
        state: "angry",
      };
    }

    return {
      dialogue: "Je suis Achille. Si tu cherches un lâche, va voir Agamemnon. Si tu cherches la gloire, parle franchement.",
      newTrust: currentTrust,
      state: currentState,
    };
  },
};
