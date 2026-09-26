import type { EraStory } from "./types.ts";
import { troyEra } from "./troy/index.ts";
import { egyptEra } from "./egypt/index.ts";
import { romeEra } from "./rome/index.ts";
import { florenceEra } from "./florence/index.ts";
import { orleansEra } from "./orleans/index.ts";
import { parisEra } from "./paris/index.ts";
import { berlinEra } from "./berlin/index.ts";

export * from "./types.ts";
export { troyEra, egyptEra, romeEra, florenceEra, orleansEra, parisEra, berlinEra };

export const ERAS_BY_ID: Record<string, EraStory> = {
  troy: troyEra,
  egypt: egyptEra,
  rome: romeEra,
  florence: florenceEra,
  orleans: orleansEra,
  paris: parisEra,
  berlin: berlinEra,
};

export function getEra(id: string): EraStory | undefined {
  return ERAS_BY_ID[id];
}

export function getAllNpcDefinitions() {
  const result: Record<string, import("./types.ts").EraNpcDef> = {};
  for (const era of Object.values(ERAS_BY_ID)) {
    for (const [npcId, def] of Object.entries(era.npcs)) {
      result[npcId] = def;
    }
  }
  return result;
}
