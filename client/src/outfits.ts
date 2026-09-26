import * as THREE from "three";
import { type Character, makeSpear } from "./characters.ts";

/** Period kits built from primitives on the Rocketbox rig (bind pose, +z forward, +x = character's left). */
export type OutfitId =
  | "achaean" | "trojan"
  | "legionary" | "caesar" | "gaul"
  | "french_1429" | "jeanne" | "english_1429"
  | "samurai_east" | "samurai_west" | "ieyasu"
  | "french_line" | "napoleon" | "russian_line";

export type Weapon = "gladius" | "sword" | "axe" | "longbow" | "crossbow" | "katana" | "yari" | "arquebus" | "musket" | "pilum" | "banner";

const cache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: number, roughness = 0.85, metalness = 0, side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial {
  const key = `${color}:${roughness}:${metalness}:${side}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness, side });
    cache.set(key, m);
  }
  return m;
}
const iron = () => mat(0x8a8d92, 0.38, 1);
const steel = () => mat(0xc4c8cc, 0.25, 1);
const brass = () => mat(0xb08a3c, 0.35, 1);
const wood = () => mat(0x5a3a22, 0.85);
const leather = () => mat(0x3e2616, 0.8);
const cloth = (c: number) => mat(c, 0.95, 0, THREE.DoubleSide);

function mesh(geo: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.castShadow = true;
  return o;
}

const at = (c: Character, bone: string) => c.bone(bone).getWorldPosition(new THREE.Vector3());

// ---------- Generic pieces ----------

function helmet(c: Character, m: THREE.Material, opts: { scaleY?: number; brim?: number; neck?: boolean } = {}): THREE.Group {
  const head = at(c, "Head");
  const g = new THREE.Group();
  const dome = mesh(new THREE.SphereGeometry(0.13, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), m);
  dome.scale.set(0.95, opts.scaleY ?? 1.05, 1.1);
  g.add(dome);
  if (opts.brim) {
    const brim = mesh(new THREE.CylinderGeometry(opts.brim, opts.brim, 0.01, 24), m);
    brim.position.y = -0.005;
    g.add(brim);
  }
  if (opts.neck) {
    const guard = mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.08, 20, 1, true, Math.PI * 0.6, Math.PI * 0.8), m);
    guard.position.set(0, -0.06, -0.01);
    g.add(guard);
  }
  g.position.set(head.x, head.y + 0.09, head.z - 0.005);
  c.attachTo("Head", g);
  return g;
}

function torso(c: Character, m: THREE.Material, opts: { bands?: THREE.Material; length?: number; widen?: number } = {}): void {
  const chest = at(c, "Spine2");
  const pelvis = at(c, "Pelvis");
  const h = (opts.length ?? 1) * (chest.y - pelvis.y + 0.2);
  const w = opts.widen ?? 1;
  const body = mesh(new THREE.CylinderGeometry(0.2 * w, 0.18 * w, h, 18, 1, true), m);
  body.scale.z = 0.78;
  body.position.set(chest.x, chest.y + 0.12 - h / 2, chest.z + 0.01);
  c.attachTo("Spine1", body);
  if (opts.bands) {
    for (let i = 0; i < 5; i++) {
      const band = mesh(new THREE.TorusGeometry(0.2 * w, 0.009, 4, 22), opts.bands);
      band.rotation.x = Math.PI / 2;
      band.scale.set(1, 0.78, 1);
      band.position.set(chest.x, chest.y + 0.08 - i * (h / 5), chest.z + 0.01);
      c.attachTo("Spine1", band);
    }
  }
}

function skirt(c: Character, m: THREE.Material, len: number, flare = 0.1, strips = 16, arc = Math.PI * 2, start = 0): void {
  const pelvis = at(c, "Pelvis");
  const g = new THREE.Group();
  for (let i = 0; i < strips; i++) {
    const a = start + (i / strips) * arc;
    const s = mesh(new THREE.BoxGeometry((arc * 0.18) / strips + 0.02, len, 0.012), m);
    s.position.set(Math.sin(a) * 0.175, -len / 2, Math.cos(a) * 0.14);
    s.rotation.set(Math.cos(a) * flare, a, 0);
    g.add(s);
  }
  g.position.set(pelvis.x, pelvis.y + 0.1, pelvis.z);
  c.attachTo("Pelvis", g);
}

function cape(c: Character, m: THREE.Material, len: number, width = 0.54): void {
  const neck = at(c, "Neck");
  const geo = new THREE.PlaneGeometry(width, len, 6, 8);
  geo.translate(0, -len / 2, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, -Math.pow(Math.abs(p.getX(i)) * 2, 2) * 0.06 + p.getY(i) * 0.08);
  geo.computeVertexNormals();
  const o = mesh(geo, m);
  o.position.set(neck.x, neck.y - 0.04, neck.z - 0.13);
  c.attachTo("Spine2", o);
}

function shoulders(c: Character, m: THREE.Material, size = 0.1, drop = 0.02): void {
  for (const side of ["L", "R"] as const) {
    const s = at(c, `${side}_UpperArm`);
    const pad = mesh(new THREE.SphereGeometry(size, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), m);
    pad.scale.set(1, 0.7, 1.1);
    pad.position.set(s.x, s.y + drop, s.z);
    c.attachTo(`${side}_UpperArm`, pad);
  }
}

function crossbelts(c: Character, m: THREE.Material): void {
  const chest = at(c, "Spine2");
  for (const side of [-1, 1]) {
    const belt = mesh(new THREE.BoxGeometry(0.05, 0.52, 0.01), m);
    belt.position.set(chest.x, chest.y - 0.08, chest.z + 0.125);
    belt.rotation.z = side * 0.62;
    c.attachTo("Spine2", belt);
  }
}

function coatTails(c: Character, m: THREE.Material, len: number): void {
  const pelvis = at(c, "Pelvis");
  for (const side of [-1, 1]) {
    const tail = mesh(new THREE.BoxGeometry(0.13, len, 0.015), m);
    tail.position.set(pelvis.x + side * 0.08, pelvis.y + 0.1 - len / 2, pelvis.z - 0.13);
    tail.rotation.x = -0.12;
    c.attachTo("Pelvis", tail);
  }
}

function sleeves(c: Character, m: THREE.Material, cuffs?: THREE.Material): void {
  for (const side of ["L", "R"] as const) {
    const a = at(c, `${side}_UpperArm`);
    const f = at(c, `${side}_Forearm`);
    const h = at(c, `${side}_Hand`);
    const upper = mesh(new THREE.CylinderGeometry(0.068, 0.058, a.distanceTo(f), 10, 1, true), m);
    upper.position.lerpVectors(a, f, 0.5);
    upper.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), f.clone().sub(a).normalize());
    c.attachTo(`${side}_UpperArm`, upper);
    const lower = mesh(new THREE.CylinderGeometry(0.056, 0.048, f.distanceTo(h) * 0.9, 10, 1, true), cuffs ?? m);
    lower.position.lerpVectors(f, h, 0.45);
    lower.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), h.clone().sub(f).normalize());
    c.attachTo(`${side}_Forearm`, lower);
  }
}

function trousers(c: Character, m: THREE.Material, toKnee = false): void {
  for (const side of ["L", "R"] as const) {
    const t = at(c, `${side}_Thigh`);
    const k = at(c, `${side}_Calf`);
    const f = at(c, `${side}_Foot`);
    const thigh = mesh(new THREE.CylinderGeometry(0.105, 0.078, t.distanceTo(k), 10, 1, true), m);
    thigh.position.lerpVectors(t, k, 0.5);
    thigh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), t.clone().sub(k).normalize());
    c.attachTo(`${side}_Thigh`, thigh);
    if (toKnee) continue;
    const calf = mesh(new THREE.CylinderGeometry(0.074, 0.058, k.distanceTo(f) * 0.9, 10, 1, true), m);
    calf.position.lerpVectors(k, f, 0.5);
    calf.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), k.clone().sub(f).normalize());
    c.attachTo(`${side}_Calf`, calf);
  }
}

function backBanner(c: Character, color: number, emblem: number): void {
  const chest = at(c, "Spine2");
  const g = new THREE.Group();
  const pole = mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.3, 6), wood());
  pole.position.y = 0.45;
  const flag = mesh(new THREE.PlaneGeometry(0.3, 0.75), cloth(color));
  flag.position.set(0.16, 0.68, 0);
  const mon = mesh(new THREE.CircleGeometry(0.08, 16), cloth(emblem));
  mon.position.set(0.16, 0.8, 0.003);
  const mon2 = mon.clone();
  mon2.position.z = -0.003;
  g.add(pole, flag, mon, mon2);
  g.position.set(chest.x - 0.02, chest.y, chest.z - 0.16);
  g.rotation.y = Math.PI / 2;
  c.attachTo("Spine2", g);
}

// ---------- Weapons & shields ----------

function blade(len: number, width: number, curve = 0): THREE.Group {
  const g = new THREE.Group();
  const grip = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 6), leather());
  const guard = mesh(new THREE.BoxGeometry(curve ? 0.07 : 0.16, 0.02, curve ? 0.07 : 0.03), curve ? brass() : iron());
  guard.position.y = 0.09;
  const b = mesh(new THREE.BoxGeometry(width, len, 0.008), steel());
  b.position.set(0, 0.1 + len / 2, 0);
  if (curve) {
    const p = b.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / len + 0.5;
      p.setZ(i, p.getZ(i) - curve * y * y);
    }
  }
  g.add(grip, guard, b);
  return g;
}

function weaponMesh(w: Weapon, color: number): THREE.Object3D {
  switch (w) {
    case "gladius": return blade(0.5, 0.05);
    case "sword": return blade(0.85, 0.045);
    case "katana": return blade(0.72, 0.032, 0.05);
    case "axe": {
      const g = new THREE.Group();
      const haft = mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.8, 6), wood());
      haft.position.y = 0.25;
      const head = mesh(new THREE.BoxGeometry(0.02, 0.16, 0.18), iron());
      head.position.set(0, 0.58, 0.07);
      g.add(haft, head);
      return g;
    }
    case "yari":
    case "pilum": {
      const s = makeSpear(color, false);
      s.position.y = 0.25;
      if (w === "pilum") s.scale.set(1, 0.85, 1);
      return s;
    }
    case "longbow": {
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.85, 0), new THREE.Vector3(0, 0, 0.18), new THREE.Vector3(0, 0.85, 0));
      const g = new THREE.Group();
      g.add(mesh(new THREE.TubeGeometry(curve, 16, 0.012, 5), mat(0x6b4a2a, 0.7)));
      const string = mesh(new THREE.CylinderGeometry(0.002, 0.002, 1.7, 3), mat(0xddd6c0));
      g.add(string);
      g.position.y = 0.1;
      return g;
    }
    case "crossbow": {
      const g = new THREE.Group();
      const stock = mesh(new THREE.BoxGeometry(0.04, 0.05, 0.7), wood());
      const prod = mesh(new THREE.BoxGeometry(0.6, 0.02, 0.03), iron());
      prod.position.z = 0.3;
      g.add(stock, prod);
      g.rotation.x = -Math.PI / 2;
      g.position.y = 0.2;
      return g;
    }
    case "arquebus":
    case "musket": {
      const g = new THREE.Group();
      const len = w === "musket" ? 1.5 : 1.3;
      const stock = mesh(new THREE.BoxGeometry(0.045, len * 0.62, 0.07), mat(w === "musket" ? 0x5b3a1e : 0x3a1c10, 0.6));
      stock.position.y = len * 0.31 - 0.3;
      const barrel = mesh(new THREE.CylinderGeometry(0.012, 0.014, len * 0.72, 8), iron());
      barrel.position.set(0, len * 0.46, 0.012);
      g.add(stock, barrel);
      if (w === "musket") {
        const bayonet = mesh(new THREE.ConeGeometry(0.01, 0.42, 3), steel());
        bayonet.position.set(0, len * 0.82 + 0.21, 0.03);
        g.add(bayonet);
      } else {
        const match = mesh(new THREE.TorusGeometry(0.04, 0.005, 4, 10), mat(0x996633));
        match.position.set(0, 0.15, 0.04);
        g.add(match);
      }
      return g;
    }
    case "banner": {
      const g = new THREE.Group();
      const pole = mesh(new THREE.CylinderGeometry(0.018, 0.02, 2.8, 6), wood());
      pole.position.y = 0.6;
      const flag = mesh(new THREE.PlaneGeometry(0.8, 1.1), bannerCloth(color));
      flag.position.set(0, 1.45, 0.42);
      flag.rotation.y = -Math.PI / 2;
      g.add(pole, flag);
      return g;
    }
  }
}

let fleurTex: THREE.CanvasTexture | null = null;
function bannerCloth(color: number): THREE.MeshStandardMaterial {
  if (!fleurTex) {
    const cv = document.createElement("canvas");
    cv.width = 128;
    cv.height = 180;
    const g = cv.getContext("2d")!;
    g.fillStyle = "#e9e1cf";
    g.fillRect(0, 0, 128, 180);
    g.fillStyle = "#2b3f8c";
    g.font = "bold 44px serif";
    for (const [x, y] of [[20, 50], [70, 50], [45, 105], [20, 160], [70, 160]]) g.fillText("⚜", x, y);
    fleurTex = new THREE.CanvasTexture(cv);
    fleurTex.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.MeshStandardMaterial({ map: fleurTex, color, roughness: 0.9, side: THREE.DoubleSide });
}

function shieldMesh(kind: "scutum" | "oval" | "heater" | "aspis", color: number): THREE.Object3D {
  const g = new THREE.Group();
  if (kind === "scutum") {
    const geo = new THREE.CylinderGeometry(0.5, 0.5, 1.05, 16, 1, true, -0.55, 1.1);
    const face = mesh(geo, mat(color, 0.7, 0, THREE.DoubleSide));
    face.position.z = -0.45;
    const boss = mesh(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), brass());
    boss.rotation.x = Math.PI / 2;
    boss.position.z = 0.05;
    const rim = mesh(new THREE.BoxGeometry(0.02, 1.05, 0.03), brass());
    for (const x of [-0.26, 0.26]) {
      const r = rim.clone();
      r.position.set(x, 0, -0.02);
      g.add(r);
    }
    g.add(face, boss);
  } else if (kind === "aspis") {
    const face = mesh(new THREE.CircleGeometry(0.42, 20), mat(color, 0.7, 0, THREE.DoubleSide));
    const rim = mesh(new THREE.TorusGeometry(0.4, 0.035, 8, 24), brass());
    const boss = mesh(new THREE.SphereGeometry(0.07, 12, 8), brass());
    boss.position.z = 0.04;
    g.add(face, rim, boss);
  } else {
    const shape = new THREE.Shape();
    if (kind === "oval") shape.absellipse(0, 0, 0.3, 0.5, 0, Math.PI * 2, false, 0);
    else {
      shape.moveTo(-0.28, 0.3);
      shape.lineTo(0.28, 0.3);
      shape.quadraticCurveTo(0.28, -0.2, 0, -0.42);
      shape.quadraticCurveTo(-0.28, -0.2, -0.28, 0.3);
    }
    const face = mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false }), mat(color, 0.75));
    const boss = mesh(new THREE.SphereGeometry(0.06, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), iron());
    boss.rotation.x = Math.PI / 2;
    boss.position.z = 0.02;
    g.add(face);
    if (kind === "oval") g.add(boss);
  }
  const holder = new THREE.Group();
  holder.add(g);
  return holder;
}

function holdRight(c: Character, w: Weapon, color = 0xffa040): void {
  const hand = at(c, "R_Hand");
  const obj = weaponMesh(w, color);
  obj.position.add(new THREE.Vector3(hand.x, hand.y - 0.05, hand.z + 0.03));
  obj.rotation.x += 0.12;
  c.attachTo("R_Hand", obj);
}

function holdLeft(c: Character, obj: THREE.Object3D, dx = 0.16): void {
  const fore = at(c, "L_Forearm");
  const hand = at(c, "L_Hand");
  obj.position.lerpVectors(fore, hand, 0.5).add(new THREE.Vector3(dx, -0.05, 0.06));
  obj.rotation.y += 0.35;
  c.attachTo("L_Forearm", obj);
}

function scabbard(c: Character, m: THREE.Material, len = 0.75, katana = false): void {
  const pelvis = at(c, "Pelvis");
  const s = mesh(new THREE.BoxGeometry(0.035, len, 0.05), m);
  s.position.set(pelvis.x + 0.2, pelvis.y - (katana ? 0.02 : 0.25), pelvis.z + (katana ? 0.05 : -0.02));
  s.rotation.set(katana ? 1.2 : 0.25, 0, katana ? 0.2 : 0.1);
  c.attachTo("Pelvis", s);
}

// ---------- Headgear ----------

function galea(c: Character, crest: number | null, transverse = false): void {
  const h = helmet(c, iron(), { neck: true });
  const cheek = mesh(new THREE.BoxGeometry(0.01, 0.1, 0.07), brass());
  for (const x of [-0.12, 0.12]) {
    const k = cheek.clone();
    k.position.set(x, -0.08, 0.05);
    h.add(k);
  }
  if (crest !== null) {
    const cr = mesh(new THREE.BoxGeometry(0.03, 0.09, 0.24), cloth(crest));
    cr.position.y = 0.15;
    if (transverse) cr.rotation.y = Math.PI / 2;
    h.add(cr);
  }
}

function kabuto(c: Character, crest: number, big: boolean): void {
  const h = helmet(c, mat(0x1c1a18, 0.45, 0.6), { scaleY: 0.95 });
  const shikoro = mesh(new THREE.CylinderGeometry(0.15, 0.24, 0.12, 20, 1, true, Math.PI * 0.35, Math.PI * 1.3), mat(0x1c1a18, 0.5, 0.4, THREE.DoubleSide));
  shikoro.position.y = -0.05;
  h.add(shikoro);
  const w = big ? 0.26 : 0.14;
  const maedate = mesh(new THREE.BoxGeometry(w, big ? 0.16 : 0.1, 0.008), mat(crest, 0.3, 1));
  maedate.position.set(0, 0.1, 0.13);
  maedate.rotation.x = -0.3;
  h.add(maedate);
  if (big) {
    const fan = mesh(new THREE.CircleGeometry(0.17, 16, 0, Math.PI), mat(crest, 0.3, 1, THREE.DoubleSide));
    fan.position.set(0, 0.13, -0.02);
    h.add(fan);
  }
}

function shako(c: Character, plume: number): void {
  const head = at(c, "Head");
  const g = new THREE.Group();
  const body = mesh(new THREE.CylinderGeometry(0.12, 0.105, 0.21, 16), mat(0x111111, 0.5));
  body.position.y = 0.1;
  const peak = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.01, 16, 1, false, -Math.PI / 2, Math.PI), mat(0x111111, 0.3));
  peak.position.set(0, 0, 0.03);
  const plate = mesh(new THREE.CircleGeometry(0.04, 12), brass());
  plate.position.set(0, 0.12, 0.117);
  plate.rotation.x = -0.07;
  const pl = mesh(new THREE.SphereGeometry(0.03, 8, 6), mat(plume));
  pl.scale.y = 2.2;
  pl.position.set(0, 0.26, 0.09);
  g.add(body, peak, plate, pl);
  g.position.set(head.x, head.y + 0.08, head.z);
  c.attachTo("Head", g);
}

function bicorne(c: Character, sideways: boolean): void {
  const head = at(c, "Head");
  const shape = new THREE.Shape();
  shape.moveTo(-0.26, 0);
  shape.quadraticCurveTo(0, 0.34, 0.26, 0);
  shape.lineTo(-0.26, 0);
  const hat = mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.13, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.02, bevelSegments: 2 }), mat(0x0d0d0f, 0.6));
  const g = new THREE.Group();
  hat.position.set(0, 0, -0.065);
  const cockade = mesh(new THREE.CircleGeometry(0.03, 12), mat(0x2c49a8));
  cockade.position.set(-0.16, 0.06, 0.075);
  g.add(hat, cockade);
  if (!sideways) {
    // Line infantry wore it "en colonne", points front and back, with a red pompom.
    g.rotation.y = Math.PI / 2;
    const pom = mesh(new THREE.SphereGeometry(0.03, 8, 6), mat(0xb0201a));
    pom.position.set(0, 0.2, 0);
    g.add(pom);
    g.scale.setScalar(0.85);
  }
  g.position.set(head.x, head.y + 0.1, head.z);
  c.attachTo("Head", g);
}

function kettleHat(c: Character): void {
  helmet(c, iron(), { brim: 0.2, scaleY: 0.9 });
}

function sallet(c: Character, plume: number | null): void {
  const h = helmet(c, steel(), { neck: true, scaleY: 1.1 });
  const visor = mesh(new THREE.BoxGeometry(0.2, 0.012, 0.03), steel());
  visor.position.set(0, -0.02, 0.13);
  h.add(visor);
  if (plume !== null) {
    const p = mesh(new THREE.SphereGeometry(0.04, 8, 6), mat(plume));
    p.scale.set(1, 2.5, 1);
    p.position.set(0, 0.16, -0.05);
    h.add(p);
  }
}

function gaulHair(c: Character, color: number): void {
  const head = at(c, "Head");
  const m = mat(color, 1);
  const hair = mesh(new THREE.SphereGeometry(0.128, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), m);
  hair.scale.set(1, 1, 1.15);
  hair.position.set(head.x, head.y + 0.08, head.z - 0.02);
  const tail = mesh(new THREE.BoxGeometry(0.2, 0.16, 0.05), m);
  tail.position.set(head.x, head.y - 0.02, head.z - 0.12);
  const moustache = mesh(new THREE.BoxGeometry(0.1, 0.02, 0.02), m);
  moustache.position.set(head.x, head.y - 0.03, head.z + 0.115);
  for (const o of [hair, tail, moustache]) c.attachTo("Head", o);
  for (const side of [-1, 1]) {
    const end = mesh(new THREE.BoxGeometry(0.015, 0.06, 0.015), m);
    end.position.set(head.x + side * 0.055, head.y - 0.06, head.z + 0.11);
    c.attachTo("Head", end);
  }
}

function balteus(c: Character): void {
  const chest = at(c, "Spine2");
  const belt = mesh(new THREE.BoxGeometry(0.04, 0.55, 0.01), leather());
  belt.position.set(chest.x, chest.y - 0.12, chest.z + 0.16);
  belt.rotation.z = -0.6;
  c.attachTo("Spine2", belt);
}

function quiver(c: Character): void {
  const chest = at(c, "Spine2");
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.55, 8), leather()));
  const fletch = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 8), mat(0xe6e0d0));
  fletch.position.y = 0.3;
  g.add(fletch);
  g.position.set(chest.x - 0.08, chest.y - 0.05, chest.z - 0.16);
  g.rotation.z = 0.35;
  c.attachTo("Spine2", g);
}

let crossTex: THREE.CanvasTexture | null = null;
function surcoat(c: Character, color: number, emblem: "cross" | "fleur" | null): void {
  if (!emblem) return;
  const chest = at(c, "Spine2");
  let map: THREE.CanvasTexture | null = null;
  if (emblem === "cross") {
    if (!crossTex) {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 64;
      const g = cv.getContext("2d")!;
      g.fillStyle = "#e6e0d0";
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = "#b0201a";
      g.fillRect(26, 0, 12, 64);
      g.fillRect(0, 20, 64, 12);
      crossTex = new THREE.CanvasTexture(cv);
      crossTex.colorSpace = THREE.SRGBColorSpace;
    }
    map = crossTex;
  }
  const m = map ? new THREE.MeshStandardMaterial({ map, roughness: 0.95 }) : bannerCloth(color);
  for (const [dz, ry] of [[0.2, 0], [-0.2, Math.PI]] as const) {
    const p = mesh(new THREE.PlaneGeometry(0.34, 0.5), m);
    p.position.set(chest.x, chest.y - 0.12, chest.z + dz);
    p.rotation.y = ry;
    c.attachTo("Spine2", p);
  }
}

function sode(c: Character, plate: THREE.Material, lace: THREE.Material): void {
  for (const side of ["L", "R"] as const) {
    const s = at(c, `${side}_UpperArm`);
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const row = mesh(new THREE.BoxGeometry(0.03, 0.045, 0.2), i % 2 ? lace : plate);
      row.position.y = -i * 0.045;
      g.add(row);
    }
    g.position.set(s.x + (side === "L" ? 0.07 : -0.07), s.y + 0.02, s.z);
    g.rotation.z = side === "L" ? -0.35 : 0.35;
    c.attachTo(`${side}_UpperArm`, g);
  }
}

function jingasa(c: Character): void {
  const head = at(c, "Head");
  const hat = mesh(new THREE.ConeGeometry(0.26, 0.11, 20, 1, true), mat(0x1a1612, 0.35, 0.3, THREE.DoubleSide));
  hat.position.set(head.x, head.y + 0.15, head.z);
  const mon = mesh(new THREE.CircleGeometry(0.035, 12), mat(0xd4a93a, 0.3, 1));
  mon.position.set(head.x, head.y + 0.16, head.z + 0.14);
  mon.rotation.x = -1.1;
  c.attachTo("Head", hat);
  c.attachTo("Head", mon);
}

function havresac(c: Character, color: number): void {
  const chest = at(c, "Spine2");
  const pack = mesh(new THREE.BoxGeometry(0.3, 0.3, 0.1), mat(color, 0.9));
  pack.position.set(chest.x, chest.y - 0.08, chest.z - 0.19);
  const roll = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.34, 10), mat(0x3a4a6a, 0.95));
  roll.rotation.z = Math.PI / 2;
  roll.position.set(chest.x, chest.y + 0.1, chest.z - 0.19);
  const cartridge = mesh(new THREE.BoxGeometry(0.16, 0.1, 0.06), mat(0x111111, 0.4));
  const pelvis = at(c, "Pelvis");
  cartridge.position.set(pelvis.x - 0.1, pelvis.y + 0.05, pelvis.z - 0.16);
  c.attachTo("Spine2", pack);
  c.attachTo("Spine2", roll);
  c.attachTo("Pelvis", cartridge);
}

/** Napoleon's grey campaign redingote, open over the chasseur uniform, with riding boots. */
function redingote(c: Character): void {
  const grey = cloth(0x6f7470);
  const chest = at(c, "Spine2");
  const pelvis = at(c, "Pelvis");
  const len = chest.y - pelvis.y + 0.75;
  const geo = new THREE.CylinderGeometry(0.21, 0.29, len, 20, 1, true, Math.PI * 0.12, Math.PI * 1.76);
  const coat = mesh(geo, grey);
  coat.scale.z = 0.8;
  coat.position.set(chest.x, chest.y + 0.14 - len / 2, chest.z + 0.01);
  c.attachTo("Spine1", coat);
  sleeves(c, grey);
  for (const side of ["L", "R"] as const) {
    const k = at(c, `${side}_Calf`);
    const f = at(c, `${side}_Foot`);
    const boot = mesh(new THREE.CylinderGeometry(0.075, 0.06, k.distanceTo(f) + 0.08, 10), mat(0x0c0c0c, 0.35));
    boot.position.lerpVectors(k, f, 0.45);
    boot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), k.clone().sub(f).normalize());
    c.attachTo(`${side}_Calf`, boot);
  }
}

// ---------- Kits ----------

export interface KitOptions {
  weapon: Weapon;
  /** Team colour used for tunics, sashimono or coats when a kit supports variants. */
  team?: number;
}

export function dressKit(c: Character, outfit: OutfitId, o: KitOptions): void {
  const team = o.team ?? 0x8e1b16;
  switch (outfit) {
    case "achaean":
    case "trojan": {
      const greek = outfit === "achaean";
      torso(c, cloth(greek ? 0xcbb892 : 0x6a3a55), { length: 0.85, widen: 0.95 });
      skirt(c, cloth(greek ? 0xe6dcc4 : 0x2a3a6a), 0.22, 0.16, 16);
      cape(c, cloth(greek ? 0x8e1b16 : 0x1e3a6e), greek ? 1.05 : 0.9, 0.5);
      galea(c, greek ? 0x8e1b16 : null);
      holdLeft(c, shieldMesh(greek ? "aspis" : "oval", greek ? 0x8e1b16 : 0x1e3a6e));
      holdRight(c, o.weapon, greek ? 0xc4a060 : 0x9aa0a8);
      return;
    }
    case "legionary":
    case "caesar": {
      const leader = outfit === "caesar";
      torso(c, leader ? mat(0xb89a5a, 0.35, 1) : iron(), { bands: leader ? undefined : brass() });
      shoulders(c, leader ? brass() : iron(), 0.1);
      skirt(c, cloth(0x8e1b16), 0.2, 0.15, 14);
      skirt(c, leather(), 0.15, 0.05, 10, Math.PI * 0.8, -Math.PI * 0.4);
      if (leader) {
        cape(c, cloth(0x7a0f1a), 1.25, 0.62);
        const head = at(c, "Head");
        const laurel = mesh(new THREE.TorusGeometry(0.105, 0.015, 5, 20), mat(0x5d7a2a, 0.8));
        laurel.rotation.x = Math.PI / 2 + 0.2;
        laurel.position.set(head.x, head.y + 0.1, head.z);
        c.attachTo("Head", laurel);
      } else {
        galea(c, 0xb0201a);
        cape(c, cloth(0x6e1410), 0.9, 0.46);
        scabbard(c, leather(), 0.5);
        balteus(c);
        holdLeft(c, shieldMesh("scutum", team));
      }
      if (!leader || o.weapon !== "gladius") holdRight(c, o.weapon);
      return;
    }
    case "gaul": {
      cape(c, cloth(Math.random() < 0.5 ? 0x4a5a2c : 0x6e3a1e), 0.8, 0.5);
      gaulHair(c, [0xb07a3a, 0x7a4a22, 0xc89a5a][Math.floor(Math.random() * 3)]);
      if (Math.random() < 0.35) helmet(c, brass(), { scaleY: 0.9 });
      const neck = at(c, "Neck");
      const torc = mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 16, Math.PI * 1.7), mat(0xd4a93a, 0.25, 1));
      torc.rotation.x = Math.PI / 2;
      torc.position.set(neck.x, neck.y - 0.03, neck.z + 0.01);
      c.attachTo("Neck", torc);
      holdLeft(c, shieldMesh("oval", Math.random() < 0.5 ? 0x6e5a2a : 0x3c4e2a));
      holdRight(c, o.weapon);
      return;
    }
    case "french_1429":
    case "jeanne":
    case "english_1429": {
      const knight = outfit !== "english_1429";
      const plate = outfit === "jeanne" ? mat(0xdfe3e8, 0.2, 1) : steel();
      if (outfit === "english_1429" && o.weapon === "longbow") {
        kettleHat(c);
        quiver(c);
      } else {
        torso(c, plate, { widen: 1.02 });
        shoulders(c, plate, 0.11);
        sleeves(c, plate);
        trousers(c, plate);
        if (outfit === "french_1429") sallet(c, 0xe9e1cf);
        else if (outfit === "english_1429") kettleHat(c);
      }
      const tabard = knight ? (outfit === "jeanne" ? 0xe9e1cf : 0x243a8a) : 0xe6e0d0;
      if (o.weapon !== "longbow") {
        skirt(c, cloth(tabard), 0.28, 0.1, 12);
        surcoat(c, tabard, outfit === "english_1429" ? "cross" : outfit === "french_1429" ? "fleur" : null);
      }
      if (outfit === "jeanne") {
        const head = at(c, "Head");
        const hair = mesh(new THREE.SphereGeometry(0.125, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), mat(0x2a1a10, 1));
        hair.position.set(head.x, head.y + 0.085, head.z - 0.015);
        hair.scale.set(1, 1, 1.12);
        c.attachTo("Head", hair);
        holdRight(c, "banner", 0xffffff);
      } else {
        if (o.weapon !== "longbow" && o.weapon !== "crossbow") holdLeft(c, shieldMesh("heater", outfit === "english_1429" ? 0xb0201a : tabard));
        if (o.weapon === "longbow") holdLeft(c, weaponMesh("longbow", 0), 0.05);
        else holdRight(c, o.weapon);
        scabbard(c, leather());
      }
      return;
    }
    case "samurai_east":
    case "samurai_west":
    case "ieyasu": {
      const lacquer = outfit === "samurai_west" ? mat(0x3a1410, 0.4, 0.2) : mat(0x241c18, 0.4, 0.2);
      torso(c, lacquer, { bands: mat(team, 0.8) });
      sode(c, lacquer, mat(team, 0.8));
      skirt(c, lacquer, 0.26, 0.2, 7);
      const ashigaru = o.weapon === "arquebus";
      if (ashigaru) jingasa(c);
      else kabuto(c, 0xd4a93a, outfit === "ieyasu");
      if (outfit === "ieyasu") {
        cape(c, cloth(0xe8e2d0), 1.0, 0.6);
        const fan = mesh(new THREE.CircleGeometry(0.18, 12, 0, Math.PI * 0.9), mat(0xd4a93a, 0.3, 1, THREE.DoubleSide));
        const hand = at(c, "R_Hand");
        fan.position.set(hand.x, hand.y - 0.05, hand.z + 0.05);
        c.attachTo("R_Hand", fan);
        scabbard(c, mat(0x111111, 0.3), 0.75, true);
      } else {
        backBanner(c, team, outfit === "samurai_west" ? 0x111111 : 0xffffff);
        scabbard(c, mat(0x111111, 0.3), 0.75, true);
        holdRight(c, o.weapon);
      }
      return;
    }
    case "french_line":
    case "napoleon":
    case "russian_line": {
      if (outfit === "napoleon") {
        redingote(c);
        bicorne(c, true);
        return;
      }
      const french = outfit === "french_line";
      const coat = french ? 0x1f2f6b : 0x2f4a2a;
      coatTails(c, cloth(coat), 0.4);
      crossbelts(c, mat(0xf2efe6, 0.8));
      havresac(c, french ? 0x6b4a2a : 0x3a2c20);
      // French line infantry still wore the bicorne at Austerlitz; the Russians had the 1803 kiver.
      if (french) bicorne(c, false);
      else shako(c, 0x2a2a2a);
      holdRight(c, o.weapon);
      return;
    }
  }
}
