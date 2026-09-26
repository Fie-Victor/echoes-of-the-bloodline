export type EraId = "troy" | "alesia" | "orleans" | "sekigahara" | "austerlitz";

export const ERA_ORDER: EraId[] = ["troy", "alesia", "orleans", "sekigahara", "austerlitz"];

export function isEraId(v: string | null): v is EraId {
  return v !== null && (ERA_ORDER as string[]).includes(v);
}

export function nextEra(era: EraId): EraId | null {
  return ERA_ORDER[ERA_ORDER.indexOf(era) + 1] ?? null;
}
