import * as THREE from "three";
import type { OutfitId } from "./outfits.ts";

/**
 * Paints period clothing onto the Rocketbox sm024 body UV layout. The modern camo texture marks which texels are
 * clothing (everything but the hands); the Greek chiton texture supplies bare skin and sandals for ancient kits.
 * Layout (u right, v down): outer columns top = legs (hip→ankle), outer columns middle = arms (shoulder→wrist),
 * bottom corners = hands, centre column = torso (hips at the top, chest front below), bottom centre = feet.
 */
type Fill = number | ((u: number, v: number) => number);

interface UniformSpec {
  chest: Fill;
  hips?: Fill;
  arms: Fill;
  /** Lower arm colour (cuffs / bare forearms use `null` for skin). */
  forearms?: Fill | null;
  thighs: Fill | null;
  shins?: Fill | null;
  feet: Fill | null;
  /** Front-of-chest details painted over `chest`: lapels, crosses, lacing… */
  detail?: (u: number, v: number) => number | null;
}

const SIZE = 512;
const REGION = { legsEnd: 0.45, armsEnd: 0.86, kneeV: 0.22, elbowV: 0.66, centreL: 0.31, centreR: 0.69 };

const tartan = (a: number, b: number, line: number) => (u: number, v: number) => {
  const x = Math.floor(u * 90) % 6;
  const y = Math.floor(v * 90) % 6;
  if (x === 0 || y === 0) return line;
  return (x < 3) !== (y < 3) ? a : b;
};
const lamellar = (plate: number, lace: number) => (_u: number, v: number) => (Math.floor(v * 140) % 4 === 0 ? lace : plate);
const chainmail = (base: number) => (u: number, v: number) => ((Math.floor(u * 200) + Math.floor(v * 200)) % 2 ? base : shade(base, 0.8));

function shade(c: number, k: number): number {
  const r = Math.min(255, ((c >> 16) & 255) * k);
  const g = Math.min(255, ((c >> 8) & 255) * k);
  const b = Math.min(255, (c & 255) * k);
  return (r << 16) | (g << 8) | b;
}

const inChestFront = (u: number, v: number) => u > 0.36 && u < 0.64 && v > 0.5 && v < 0.9;

const SPECS: Partial<Record<OutfitId, (team: number) => UniformSpec>> = {
  legionary: (team) => ({ chest: team, arms: team, forearms: null, thighs: null, feet: null }),
  caesar: () => ({ chest: 0xe8e0cc, arms: 0xe8e0cc, forearms: null, thighs: null, feet: null }),
  gaul: (team) => ({
    chest: 0x6b5634, arms: 0x6b5634, thighs: tartan(team, shade(team, 0.6), 0xc8b27a), shins: tartan(team, shade(team, 0.6), 0xc8b27a),
    feet: 0x3e2616,
  }),
  french_1429: () => ({ chest: chainmail(0x7d8084), arms: chainmail(0x7d8084), thighs: 0x243a8a, feet: 0x2a2018 }),
  jeanne: () => ({ chest: chainmail(0x9a9da2), arms: chainmail(0x9a9da2), thighs: 0xe9e1cf, feet: 0x2a2018 }),
  english_1429: () => ({
    chest: 0xe6e0d0, arms: 0x7a6a4a, thighs: 0x6a2a20, shins: 0x6a2a20, feet: 0x3e2616,
    detail: (u, v) => (inChestFront(u, v) && (Math.abs(u - 0.5) < 0.025 || Math.abs(v - 0.62) < 0.025) ? 0xb0201a : null),
  }),
  samurai_east: (team) => ({ chest: lamellar(0x241c18, team), arms: 0x2c2c3a, thighs: 0x3a3a48, shins: 0x1c1a18, feet: 0xd8d0bc }),
  samurai_west: (team) => ({ chest: lamellar(0x3a1410, team), arms: 0x3a2c2a, thighs: 0x4a3a30, shins: 0x1c1a18, feet: 0xd8d0bc }),
  ieyasu: () => ({ chest: lamellar(0x1c1614, 0xd4a93a), arms: 0x3a2a48, thighs: 0x3a2a48, shins: 0x1c1a18, feet: 0xd8d0bc }),
  french_line: () => ({
    chest: 0x1f2f6b, hips: 0xe6e0cf, arms: 0x1f2f6b, forearms: 0x1f2f6b, thighs: 0xe6e0cf, shins: 0x16161a, feet: 0x16161a,
    detail: (u, v) => {
      if (!inChestFront(u, v)) return null;
      if (v < 0.53) return 0xb0201a;
      if (Math.abs(u - 0.5) < 0.07 && v < 0.74) return Math.abs(u - 0.5) < 0.012 ? 0xe6e0cf : 0xf2efe6;
      return null;
    },
  }),
  russian_line: () => ({
    chest: 0x2f4a2a, hips: 0xd8d2c0, arms: 0x2f4a2a, thighs: 0xd8d2c0, shins: 0x16161a, feet: 0x16161a,
    detail: (u, v) => (inChestFront(u, v) && v < 0.53 ? 0xb0201a : inChestFront(u, v) && Math.abs(u - 0.5) < 0.006 && Math.floor(v * 60) % 3 === 0 ? 0xb08a3c : null),
  }),
  napoleon: () => ({
    chest: 0x2c5a3a, hips: 0xe6e0cf, arms: 0x2c5a3a, forearms: 0xb0201a, thighs: 0xe6e0cf, shins: 0x111111, feet: 0x111111,
    detail: (u, v) => (inChestFront(u, v) && v < 0.53 ? 0xb0201a : inChestFront(u, v) && Math.abs(u - 0.5) < 0.05 && v < 0.72 ? 0xe6e0cf : null),
  }),
};

function pixels(img: CanvasImageSource): Uint8ClampedArray {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, SIZE, SIZE);
  return g.getImageData(0, 0, SIZE, SIZE).data;
}

let camoPx: Uint8ClampedArray | null = null;
let greekPx: Uint8ClampedArray | null = null;
const cache = new Map<string, THREE.CanvasTexture>();

function fill(f: Fill, u: number, v: number): number {
  return typeof f === "number" ? f : f(u, v);
}

export function hasUniform(outfit: OutfitId): boolean {
  return outfit in SPECS;
}

export function paintUniform(outfit: OutfitId, team: number, camo: THREE.Texture, greek: THREE.Texture): THREE.CanvasTexture {
  const key = `${outfit}:${team}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const spec = SPECS[outfit]!(team);
  camoPx ??= pixels(camo.image as CanvasImageSource);
  greekPx ??= pixels(greek.image as CanvasImageSource);
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const g = c.getContext("2d")!;
  const out = g.createImageData(SIZE, SIZE);
  const o = out.data;
  const { legsEnd, armsEnd, kneeV, elbowV, centreL, centreR } = REGION;
  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE;
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const i = (y * SIZE + x) * 4;
      const [cr, cg, cb] = [camoPx[i], camoPx[i + 1], camoPx[i + 2]];
      const skin = cr > cg + 18 && cg > cb && cr > 120;
      const centre = u > centreL && u < centreR;
      const feet = !centre ? false : v > 0.7 && (u < 0.42 || u > 0.58);
      const outer = u < 0.25 || u > 0.75;
      let pick: Fill | null;
      if (outer && v > armsEnd && skin) pick = null;
      else if (feet || (!centre && v < legsEnd && v > 0.37)) pick = spec.feet;
      else if (!centre && v < legsEnd) pick = v < kneeV || spec.shins === undefined ? spec.thighs : spec.shins;
      else if (!centre) pick = v < elbowV || spec.forearms === undefined ? spec.arms : spec.forearms;
      else if (v < 0.48) pick = spec.hips ?? spec.chest;
      else pick = spec.detail?.(u, v) ?? spec.chest;
      const col = pick === null ? null : fill(pick, u, v);
      if (col === null) {
        o[i] = greekPx[i];
        o[i + 1] = greekPx[i + 1];
        o[i + 2] = greekPx[i + 2];
      } else {
        // Keep a little of the camo luminance as fabric grain.
        const lum = (cr + cg + cb) / 765;
        const k = 0.82 + lum * 0.36;
        o[i] = Math.min(255, ((col >> 16) & 255) * k);
        o[i + 1] = Math.min(255, ((col >> 8) & 255) * k);
        o[i + 2] = Math.min(255, (col & 255) * k);
      }
      if (outer && v > armsEnd && skin) {
        o[i] = cr;
        o[i + 1] = cg;
        o[i + 2] = cb;
      }
      o[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = camo.flipY;
  cache.set(key, tex);
  return tex;
}
