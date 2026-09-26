import type { Era } from "./eras.ts";

export type VoiceCommand =
  | { kind: "prev" }
  | { kind: "next" }
  | { kind: "enter" }
  | { kind: "focus"; index: number }
  | { kind: "skip" }
  | { kind: "repeat" };

export const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9' -]/g, " ");

const tokens = (s: string): string[] => normalize(s).split(/[\s'-]+/).filter(Boolean);

const PREV = new Set(["gauche", "precedent", "precedente", "recule", "left", "previous", "back"]);
const NEXT = new Set(["droite", "suivant", "suivante", "avance", "right", "next"]);
const ENTER = new Set(["entrer", "entre", "entrez", "rentrer", "lance", "lancer", "lancez", "commencer", "commence", "enter", "go", "voyager", "choisir", "choisis", "partir", "valide", "valider", "ouvre", "ouvrir"]);
const ENTER_BIGRAMS = new Set(["vas y", "allons y", "on y", "j y"]);
const SKIP = new Set(["silence", "stop", "passe", "passer", "tais", "skip"]);
const REPEAT = new Set(["repete", "repeter", "repetez", "encore", "repeat"]);

/** Voice keywords sent to Gradium to bias recognition. */
export function commandKeywords(eras: Era[]): string[] {
  return ["gauche", "droite", "entrer", "suivant", "précédent", "vas-y", "silence", "répète", ...eras.map((e) => e.place)];
}

/** Turns streamed STT segments into navigation commands, ignoring words Astra is currently saying (echo). */
export class CommandParser {
  private prevToken = "";

  constructor(private eras: Era[]) {}

  feed(segment: string, echo: Set<string>): VoiceCommand[] {
    const out: VoiceCommand[] = [];
    for (const t of tokens(segment)) {
      const bigram = `${this.prevToken} ${t}`;
      this.prevToken = t;
      if (echo.has(t)) continue;
      const eraIndex = this.eras.findIndex((e) => e.aliases.some((a) => { const n = normalize(a); return n === t || n === bigram; }));
      if (eraIndex >= 0) out.push({ kind: "focus", index: eraIndex });
      else if (PREV.has(t)) out.push({ kind: "prev" });
      else if (NEXT.has(t)) out.push({ kind: "next" });
      else if (ENTER.has(t) || ENTER_BIGRAMS.has(bigram)) out.push({ kind: "enter" });
      else if (SKIP.has(t)) out.push({ kind: "skip" });
      else if (REPEAT.has(t)) out.push({ kind: "repeat" });
    }
    return out;
  }
}

export const echoWords = (text: string): Set<string> => new Set(tokens(text));
