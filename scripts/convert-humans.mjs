import fs from "node:fs";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

globalThis.FileReader = class { readAsArrayBuffer(b) { b.arrayBuffer().then(r => { this.result = r; this.onloadend?.(); }); } readAsDataURL(b) { b.arrayBuffer().then(r => { this.result = "data:application/octet-stream;base64," + Buffer.from(r).toString("base64"); this.onloadend?.(); }); } };
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };

// Converts Microsoft Rocketbox (MIT) FBX avatars + animations into GLB files for the game.
// Usage: git clone --depth 1 https://github.com/microsoft/Microsoft-Rocketbox.git ../rocketbox
//        ROCKETBOX=../rocketbox node scripts/convert-humans.mjs && python3 scripts/convert-human-textures.py
const R = `${process.env.ROCKETBOX ?? "../rocketbox"}/Assets`;
const OUT = new URL("../client/public/assets/humans/", import.meta.url);
fs.mkdirSync(OUT, { recursive: true });
const loader = new FBXLoader();
const load = (f) => loader.parse(fs.readFileSync(f).buffer, "");
const anims = {
  Idle: "Animations/all_animations_max_motextr_static/m_idle_neutral_01.max.fbx",
  Angry: "Animations/all_animations_max_motextr_static/m_idle_angry_01.max.fbx",
  Talk: "Animations/all_animations_max_motextr_static/m_gestic_talk_neutral_01.max.fbx",
  Deny: "Animations/all_animations_max_motextr_static/m_gestic_listen_deny_01.max.fbx",
  Friendly: "Animations/all_animations_max_motextr_static/m_gestic_talk_relaxed_01.max.fbx",
  Walk: "Animations/all_animations_max_motextr_xy/m_walk_neutral_01.max.fbx",
  Run: "Animations/all_animations_max_motextr_xy/m_run_neutral_01.max.fbx",
};
const clips = [];
for (const [name, f] of Object.entries(anims)) {
  const o = load(`${R}/${f}`);
  const c = o.animations[0];
  c.name = name;
  c.tracks = c.tracks.filter(t => !t.name.endsWith(".scale"));
  const root = c.tracks.find(t => t.name.endsWith(".position") && /^Bip01\.|^Bip01_/.test(t.name) && !t.name.includes("Pelvis"));
  console.log(name, c.duration.toFixed(2), c.tracks.length, "root:", root?.name);
  if (root) { const v = root.values; const r = [0, 1, 2].map(k => { let a = Infinity, b = -Infinity; for (let i = k; i < v.length; i += 3) { a = Math.min(a, v[i]); b = Math.max(b, v[i]); } return (b - a).toFixed(1); }); console.log("  range xyz", r.join(" ")); }
  if (c.duration > 12) { c.duration = 12; for (const t of c.tracks) { const n = t.times.findIndex(x => x > 12); if (n > 0) { const sz = t.getValueSize(); t.times = t.times.slice(0, n); t.values = t.values.slice(0, n * sz); } } }
  if (root && (name === "Walk" || name === "Run")) {
    const v = root.values; const x0 = v[0], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
  }
  c.tracks = c.tracks.filter(t => !t.name.endsWith(".position") || t === root);
  clips.push(c);
}
for (const [id, file] of [["agent", "Avatars/Professions/Military_Male_02/Export/Military_Male_02.fbx"], ["achilles", "Avatars/Professions/Sports_Male_01/Export/Sports_Male_01.fbx"]]) {
  const m = load(`${R}/${file}`);
  for (const l of m.children.filter(o => o.isLight)) m.remove(l);
  const names = [];
  m.traverse(o => { if (o.isMesh) { names.push(`${o.name}:${[].concat(o.material).map(x => x.name).join(",")}:${o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3}`); [].concat(o.material).forEach(mt => { mt.map = null; mt.normalMap = null; mt.specularMap = null; }); } });
  const box = new THREE.Box3().setFromObject(m);
  console.log(id, names, "height", (box.max.y - box.min.y).toFixed(2));
  const bones = []; m.traverse(o => o.isBone && bones.push(o.name));
  const glb = await new GLTFExporter().parseAsync(m, { binary: true, animations: clips });
  fs.writeFileSync(new URL(`${id}.glb`, OUT), Buffer.from(glb));
}
