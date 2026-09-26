import type { NpcState } from "../../shared/protocol.ts";

export interface EraNpcDef {
  id: string;
  name: string;
  voiceId: string;
  persona: string;
  eraRules: string;
  secrets: string[];
  initialTrust: number;
  initialState: NpcState;
}

export interface EraBanter {
  idleCompanionLines: string[];
  landmarkLines?: { trigger: string; text: string }[];
}

export interface EraCombatGuidance {
  dangerWarnings: string[];
  dodgeCallouts: string[];
  attackOpenings: string[];
  flankWarnings: string[];
  victoryLines: string[];
}

export interface EraStory {
  id: string;
  title: string;
  place: string;
  year: string;
  overview: string;
  npcs: Record<string, EraNpcDef>;
  banter: EraBanter;
  combatGuidance?: EraCombatGuidance;
  handleMockDialogue?(
    npcId: string,
    input: string,
    currentTrust: number,
    currentState: NpcState,
  ): {
    dialogue: string;
    newTrust: number;
    state: NpcState;
    triggerWar?: boolean;
    triggerDevinUi?: string | null;
    revealedSecretIndex?: number | null;
  } | null;
}
