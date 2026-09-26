import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { loadTexture } from "./assets.ts";

export type Anim = "Idle" | "Walk" | "Run" | "Angry" | "Talk" | "Deny" | "Friendly";

/** Natural root speed (m/s) of the locomotion clips, used to sync feet with movement. */
export const CLIP_SPEED = { Walk: 1.0, Run: 2.9 };

/** `outfit` selects alternate albedos (e.g. body "greek"); their layout differs from the stock normal map, so none is used. */
export async function loadHumanSkin(
  prefix: string,
  outfit: { body?: string; head?: string } = {},
): Promise<Record<"body" | "head", THREE.MeshStandardMaterial>> {
  const base = `/assets/humans/${prefix}`;
  const [bodyMap, bodyNor, headMap, headNor] = await Promise.all([
    loadTexture(outfit.body ? `${base}_body_color_${outfit.body}.jpg` : `${base}_body_color.jpg`, true),
    outfit.body ? Promise.resolve(null) : loadTexture(`${base}_body_normal.jpg`),
    loadTexture(outfit.head ? `${base}_head_color_${outfit.head}.jpg` : `${base}_head_color.jpg`, true),
    loadTexture(`${base}_head_normal.jpg`),
  ]);
  return {
    body: new THREE.MeshStandardMaterial({ map: bodyMap, normalMap: bodyNor, roughness: 0.7, metalness: 0 }),
    head: new THREE.MeshStandardMaterial({ map: headMap, normalMap: headNor, roughness: 0.6, metalness: 0 }),
  };
}

export class Character {
  readonly root = new THREE.Group();
  readonly model: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private actions: Record<string, THREE.AnimationAction> = {};
  private current: Anim = "Idle";
  private bones: Record<string, THREE.Bone> = {};
  attack = 0;

  constructor(gltf: GLTF, skin: Record<"body" | "head", THREE.Material>) {
    this.model = SkeletonUtils.clone(gltf.scene);
    this.model.scale.setScalar(0.01);
    this.model.traverse((o) => {
      if (o instanceof THREE.Bone) this.bones[o.name.replace(/^Bip01_?/, "") || "Root"] = o;
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const mapped = mats.map((m: THREE.Material) => (m.name.endsWith("head") ? skin.head : skin.body));
        o.material = mapped.length === 1 ? mapped[0] : mapped;
      }
    });
    this.root.add(this.model);
    this.root.updateMatrixWorld(true);
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.actions.Idle.play();
    this.mixer.update(0);
    this.root.updateMatrixWorld(true);
  }

  bone(name: string): THREE.Bone {
    return this.bones[name];
  }

  /** Attach an object to a bone, given its placement in character space in the idle pose (metres, +z forward). */
  attachTo(boneName: string, obj: THREE.Object3D): void {
    this.root.add(obj);
    this.root.updateMatrixWorld(true);
    this.bones[boneName].attach(obj);
  }

  play(name: Anim, timeScale = 1): void {
    this.actions[name].timeScale = timeScale;
    if (name === this.current) return;
    const next = this.actions[name];
    next.reset().play();
    this.actions[this.current].crossFadeTo(next, 0.3, false);
    this.current = name;
  }

  update(dt: number): void {
    this.mixer.update(dt);
    if (this.attack > 0) {
      const k = Math.sin((1 - this.attack / 0.35) * Math.PI);
      this.bones.Spine1.rotateY(-k * 0.6);
      this.bones.R_UpperArm.rotateZ(k * 1.1);
      this.bones.R_Forearm.rotateZ(k * 0.6);
      this.attack = Math.max(0, this.attack - dt);
    }
  }
}

export function makeSpear(glow: number, futuristic: boolean): THREE.Group {
  const spear = new THREE.Group();
  const metal = futuristic
    ? new THREE.MeshStandardMaterial({ color: 0x2a2f36, metalness: 0.9, roughness: 0.35 })
    : new THREE.MeshStandardMaterial({ color: 0xb08040, metalness: 1, roughness: 0.3 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.8 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 2.2, 8), futuristic ? metal : wood);
  const blade = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 4), metal);
  blade.position.y = 1.28;
  blade.scale.z = 0.35;
  spear.add(shaft, blade);
  if (futuristic) {
    const energy = new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 3 });
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.4, 6), energy);
    line.scale.set(0.5, 1, 1.15);
    const edge = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.36, 4), energy);
    edge.position.y = 1.3;
    edge.scale.z = 0.5;
    spear.add(line, edge);
  }
  shaft.castShadow = blade.castShadow = true;
  return spear;
}

const bronze = () => new THREE.MeshStandardMaterial({ color: 0x9c6c34, metalness: 1, roughness: 0.45 });

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Round hoplite aspis: a shallow bronze dome with a painted face, embossed rim and wooden back. */
export function makeAspis(face: THREE.Texture): THREE.Group {
  const r = 0.45;
  const g = new THREE.Group();
  const domeGeo = new THREE.SphereGeometry(r * 2.2, 40, 8, 0, Math.PI * 2, 0, Math.asin(1 / 2.2));
  domeGeo.translate(0, -r * 2.2 * Math.cos(Math.asin(1 / 2.2)), 0);
  domeGeo.scale(1, 1.6, 1);
  const pos = domeGeo.attributes.position;
  const uv = domeGeo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (2 * r) + 0.5, 0.5 - pos.getZ(i) / (2 * r));
  const front = mesh(domeGeo, new THREE.MeshStandardMaterial({ map: face, metalness: 0.75, roughness: 0.42 }));
  const rim = mesh(new THREE.TorusGeometry(r, 0.03, 8, 48), bronze());
  rim.rotation.x = Math.PI / 2;
  const back = mesh(
    new THREE.CircleGeometry(r, 40),
    new THREE.MeshStandardMaterial({ color: 0x4a3120, roughness: 0.9, side: THREE.DoubleSide }),
  );
  back.rotation.x = Math.PI / 2;
  g.add(front, rim, back);
  g.rotation.x = Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(g);
  return holder;
}

/** Achilles' kit fitted to a Rocketbox male in bind pose: the linothorax, chiton and greaves are painted on the skin;
 * geometry adds the Corinthian helmet with horsehair crest, linen shoulder guards, pteruges and cloak. */
export function dressAsHoplite(c: Character): void {
  const b = bronze();
  const leather = new THREE.MeshStandardMaterial({ color: 0x3e2616, roughness: 0.8 });
  const linen = new THREE.MeshStandardMaterial({ color: 0xa8926c, roughness: 0.95 });
  const red = new THREE.MeshStandardMaterial({ color: 0x6e1410, roughness: 0.95, side: THREE.DoubleSide });
  const hair = new THREE.MeshStandardMaterial({ color: 0x5a0d0a, roughness: 1, side: THREE.DoubleSide });
  const w = (bone: string) => c.bone(bone).getWorldPosition(new THREE.Vector3());

  const head = w("Head");
  const helmet = new THREE.Group();
  const dome = mesh(new THREE.SphereGeometry(0.128, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.62), b);
  dome.scale.set(0.95, 1.12, 1.12);
  const guard = mesh(new THREE.CylinderGeometry(0.122, 0.1, 0.15, 28, 1, true, Math.PI * 0.18, Math.PI * 1.64), b);
  guard.scale.set(0.95, 1, 1.1);
  guard.position.y = -0.1;
  const brow = mesh(new THREE.TorusGeometry(0.123, 0.012, 6, 28, Math.PI), b);
  brow.rotation.set(Math.PI / 2, 0, Math.PI);
  brow.scale.set(0.95, 1.12, 1);
  brow.position.set(0, -0.015, 0);
  const nasal = mesh(new THREE.BoxGeometry(0.022, 0.08, 0.012), b);
  nasal.position.set(0, -0.05, 0.132);
  const stem = mesh(new THREE.BoxGeometry(0.02, 0.05, 0.18), b);
  stem.position.y = 0.155;
  const crestShape = new THREE.Shape();
  crestShape.moveTo(-0.14, 0);
  crestShape.quadraticCurveTo(-0.2, 0.2, 0.02, 0.2);
  crestShape.quadraticCurveTo(0.24, 0.18, 0.34, -0.08);
  crestShape.quadraticCurveTo(0.2, 0.02, 0.1, 0);
  const crest = mesh(new THREE.ExtrudeGeometry(crestShape, { depth: 0.035, bevelEnabled: false }), hair);
  crest.rotation.y = Math.PI / 2;
  crest.position.set(0.0175, 0.17, 0.12);
  helmet.add(dome, guard, brow, nasal, stem, crest);
  helmet.position.set(head.x, head.y + 0.1, head.z - 0.005);
  c.attachTo("Head", helmet);

  for (const side of [-1, 1]) {
    const shoulder = w(side < 0 ? "R_UpperArm" : "L_UpperArm");
    const guardGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.16, 12, 1, true, 0, Math.PI);
    const epomis = mesh(guardGeo, linen);
    epomis.rotation.set(0, Math.PI / 2, Math.PI / 2);
    epomis.scale.set(1, 1, 0.8);
    epomis.position.set(shoulder.x - side * 0.02, shoulder.y + 0.02, shoulder.z);
    c.attachTo("Spine2", epomis);
  }

  const pelvis = w("Pelvis");
  const skirt = new THREE.Group();
  for (const [layer, len, mat] of [[0, 0.2, linen], [1, 0.14, leather]] as const) {
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const strip = mesh(new THREE.BoxGeometry(0.048, len, 0.01), mat);
      const rr = 0.175 + layer * 0.012;
      strip.position.set(Math.sin(a) * rr, -0.02 - len / 2 + layer * 0.02, Math.cos(a) * rr * 0.8);
      strip.rotation.y = a;
      strip.rotation.x = 0.1;
      skirt.add(strip);
    }
  }
  const girdle = mesh(new THREE.TorusGeometry(0.17, 0.018, 6, 30), leather);
  girdle.rotation.x = Math.PI / 2;
  girdle.scale.set(1, 0.8, 1);
  girdle.position.y = 0.02;
  skirt.add(girdle);
  skirt.position.set(pelvis.x, pelvis.y + 0.08, pelvis.z);
  c.attachTo("Pelvis", skirt);

  const neck = w("Neck");
  const capeGeo = new THREE.PlaneGeometry(0.56, 1.15, 8, 12);
  capeGeo.translate(0, -0.575, 0);
  const p = capeGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = -p.getY(i);
    p.setZ(i, -Math.pow(Math.abs(x) * 2, 2) * 0.07 - y * 0.07 + Math.sin(x * 22) * 0.012 * y);
  }
  capeGeo.computeVertexNormals();
  const cape = mesh(capeGeo, red);
  cape.position.set(neck.x, neck.y - 0.04, neck.z - 0.13);
  c.attachTo("Spine2", cape);
}

/** Agent disguised as a Greek traveller: leather belt, pinned wool chlamys and a leather bracer hiding a faint holo-strip. */
export function dressAsAgent(c: Character, glow: number): void {
  const w = (bone: string) => c.bone(bone).getWorldPosition(new THREE.Vector3());
  const leather = new THREE.MeshStandardMaterial({ color: 0x5a3820, roughness: 0.85 });
  const wool = new THREE.MeshStandardMaterial({ color: 0x6b2a1c, roughness: 1, side: THREE.DoubleSide });
  const energy = new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 0.8 });

  const pelvis = w("Pelvis");
  const belt = mesh(new THREE.TorusGeometry(0.16, 0.02, 6, 28), leather);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1, 0.8, 1);
  belt.position.set(pelvis.x, pelvis.y + 0.1, pelvis.z);
  c.attachTo("Pelvis", belt);

  const neck = w("Neck");
  const capeGeo = new THREE.PlaneGeometry(0.52, 0.95, 6, 8);
  capeGeo.translate(0, -0.475, 0);
  const p = capeGeo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, -Math.pow(Math.abs(p.getX(i)) * 2, 2) * 0.06 - -p.getY(i) * 0.1);
  capeGeo.computeVertexNormals();
  const cape = mesh(capeGeo, wool);
  cape.position.set(neck.x, neck.y - 0.04, neck.z - 0.12);
  c.attachTo("Spine2", cape);
  const fibula = mesh(new THREE.SphereGeometry(0.022, 10, 8), bronze());
  fibula.position.set(neck.x + 0.13, neck.y - 0.06, neck.z + 0.06);
  c.attachTo("Spine2", fibula);

  const fore = w("L_Forearm");
  const hand = w("L_Hand");
  const bracer = new THREE.Group();
  const wrap = mesh(new THREE.CylinderGeometry(0.043, 0.04, 0.13, 14), leather);
  wrap.rotation.z = Math.PI / 2;
  const strip = mesh(new THREE.BoxGeometry(0.09, 0.006, 0.012), energy);
  strip.position.set(0, 0.043, 0);
  bracer.add(wrap, strip);
  bracer.position.lerpVectors(fore, hand, 0.6);
  c.attachTo("L_Forearm", bracer);
}
