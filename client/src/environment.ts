import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { loadHdr, loadModel, loadPbr, loadTexture } from "./assets.ts";
import type { EraId } from "../../shared/eras.ts";
import type { Palette } from "./eras.ts";
import { Campfire, Particles } from "./fx.ts";

export const CLIFF_EDGE_Z = -32;

const smooth = THREE.MathUtils.smoothstep;

export function terrainHeight(x: number, z: number): number {
  const n = 0.5 * Math.sin(x * 0.12) * Math.cos(z * 0.1) + 0.25 * Math.sin(x * 0.37 + z * 0.29) + 0.1 * Math.sin(x * 1.3 - z * 1.1);
  const ridge = smooth(Math.abs(x), 28, 55) * 14 + smooth(z, 20, 60) * 10;
  const drop = smooth(-z, -CLIFF_EDGE_Z, -CLIFF_EDGE_Z + 10) * 90;
  return n + ridge - drop;
}

export interface World {
  update(dt: number, t: number, camera: THREE.Camera, focus: THREE.Vector3): void;
  sun: THREE.DirectionalLight;
  interactables: { achillesSpot: THREE.Vector3; portalSpot: THREE.Vector3 };
}

function skyGradient(pal: Palette): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
  grad.addColorStop(0, hex(pal.sky));
  grad.addColorStop(0.45, hex(pal.vistaTint));
  grad.addColorStop(0.55, hex(pal.haze));
  grad.addColorStop(1, hex(pal.hemiGround));
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

async function buildVista(scene: THREE.Scene, pal: Palette, painted: boolean): Promise<THREE.Mesh> {
  const tex = painted ? await loadTexture("/art/vista.jpg", true) : skyGradient(pal);
  tex.wrapS = THREE.MirroredRepeatWrapping;
  tex.repeat.x = 2;
  tex.offset.x = -0.5;
  const img = tex.image as HTMLImageElement;
  const radius = 600;
  const height = (Math.PI * radius) / (painted ? img.width / img.height : 4);
  const geo = new THREE.CylinderGeometry(radius, radius, height, 96, 1, true);
  const vista = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, color: painted ? pal.vistaTint : 0xffffff, side: THREE.BackSide, fog: false, depthWrite: false }));
  vista.userData.horizonOffset = height * (0.5 - 0.47);
  vista.renderOrder = -1;
  const cap = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), new THREE.MeshBasicMaterial({ color: pal.sky, fog: false, depthWrite: false }));
  cap.rotation.x = Math.PI / 2;
  cap.position.y = height / 2 - 1;
  vista.add(cap);
  scene.add(vista);
  return vista;
}

async function buildTerrain(scene: THREE.Scene, pal: Palette): Promise<void> {
  const size = 180;
  const geo = new THREE.PlaneGeometry(size, size, 220, 220);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, terrainHeight(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();
  geo.setAttribute("uv1", geo.attributes.uv);
  const mat = await loadPbr("aerial_grass_rock", 36);
  mat.color.set(pal.ground);
  const ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true;
  scene.add(ground);
}

function place(obj: THREE.Object3D, x: number, z: number, opts: { s?: number; ry?: number; dy?: number } = {}): THREE.Object3D {
  obj.position.set(x, terrainHeight(x, z) + (opts.dy ?? 0), z);
  obj.rotation.y = opts.ry ?? Math.random() * Math.PI * 2;
  obj.scale.setScalar(opts.s ?? 1);
  return obj;
}

function scatterInstanced(scene: THREE.Scene, source: THREE.Object3D, count: number, area: (i: number) => [number, number] | null, scale: [number, number]): void {
  source.updateMatrixWorld(true);
  const matrices: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const xz = area(i);
    if (!xz) continue;
    place(dummy, xz[0], xz[1], { s: THREE.MathUtils.lerp(scale[0], scale[1], Math.random()) });
    dummy.updateMatrix();
    matrices.push(dummy.matrix.clone());
  }
  source.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const inst = new THREE.InstancedMesh(o.geometry, o.material, matrices.length);
    const m = new THREE.Matrix4();
    matrices.forEach((mat, i) => inst.setMatrixAt(i, m.multiplyMatrices(mat, o.matrixWorld)));
    inst.receiveShadow = true;
    scene.add(inst);
  });
}

/** Low-cost grass: three crossed alpha-tested quads with a painted blade texture. */
function makeGrassTuft(): THREE.Object3D {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d")!;
  for (let i = 0; i < 38; i++) {
    const x = 10 + Math.random() * 108;
    const h = 50 + Math.random() * 75;
    const lean = (Math.random() - 0.5) * 40;
    const shade = 70 + Math.random() * 60;
    g.strokeStyle = `rgb(${shade + 40},${shade + 30},${shade * 0.45})`;
    g.lineWidth = 1.5 + Math.random() * 2;
    g.beginPath();
    g.moveTo(x, 128);
    g.quadraticCurveTo(x + lean * 0.3, 128 - h * 0.6, x + lean, 128 - h);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const q = new THREE.PlaneGeometry(0.7, 0.45);
    q.translate(0, 0.22, 0);
    q.rotateY((i * Math.PI) / 3);
    parts.push(q);
  }
  const geo = mergeGeometries(parts);
  const n = geo.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return new THREE.Mesh(geo, mat);
}

function makeTent(radius: number, wall: number, roof: number): THREE.Group {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#cdb892";
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(${60 + Math.random() * 60},${40 + Math.random() * 40},20,${Math.random() * 0.08})`;
    g.fillRect(Math.random() * 512, Math.random() * 256, 2 + Math.random() * 20, 1 + Math.random() * 3);
  }
  g.fillStyle = "rgba(90,60,35,0.35)";
  for (let x = 0; x < 512; x += 43) g.fillRect(x, 0, 2, 256);
  g.fillStyle = "#6b2a1c";
  g.fillRect(0, 226, 512, 14);
  const g2 = g.createLinearGradient(0, 0, 0, 256);
  g2.addColorStop(0, "rgba(0,0,0,0)");
  g2.addColorStop(1, "rgba(40,25,10,0.55)");
  g.fillStyle = g2;
  g.fillRect(0, 0, 512, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  const cloth = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide });

  const tent = new THREE.Group();
  const wallGeo = new THREE.CylinderGeometry(radius, radius * 1.04, wall, 24, 4, true);
  const roofGeo = new THREE.ConeGeometry(radius * 1.15, roof, 24, 6, true);
  for (const geo of [wallGeo, roofGeo]) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const sag = 1 - 0.035 * Math.abs(Math.sin(a * 6));
      p.setX(i, p.getX(i) * sag);
      p.setZ(i, p.getZ(i) * sag);
    }
    geo.computeVertexNormals();
  }
  const wallMesh = new THREE.Mesh(wallGeo, cloth);
  wallMesh.position.y = wall / 2;
  const roofMesh = new THREE.Mesh(roofGeo, cloth);
  roofMesh.position.y = wall + roof / 2 - 0.05;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, wall + roof + 1.2), new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.9 }));
  pole.position.y = (wall + roof + 1.2) / 2;
  for (const m of [wallMesh, roofMesh, pole]) {
    m.castShadow = true;
    m.receiveShadow = true;
    tent.add(m);
  }
  return tent;
}

class Banner {
  readonly mesh: THREE.Mesh;
  private base: Float32Array;

  constructor(color: number) {
    const geo = new THREE.PlaneGeometry(1.4, 0.7, 16, 6);
    geo.translate(0.7, 0, 0);
    this.base = Float32Array.from(geo.attributes.position.array as Float32Array);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide }));
    this.mesh.castShadow = true;
  }

  update(t: number): void {
    const p = this.mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = this.base[i * 3];
      p.setZ(i, Math.sin(x * 3 - t * 5) * 0.12 * x + Math.sin(x * 7 - t * 9) * 0.03 * x);
      p.setY(i, this.base[i * 3 + 1] - x * x * 0.06);
    }
    p.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }
}

function stakes(scene: THREE.Scene, z: number, from: number, to: number): void {
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4430, roughness: 0.95 });
  const geo = new THREE.CylinderGeometry(0.09, 0.11, 2.6, 6);
  geo.translate(0, 1.1, 0);
  const tip = new THREE.ConeGeometry(0.1, 0.35, 6);
  tip.translate(0, 2.55, 0);
  const merged = mergeGeometries([geo, tip]);
  const count = Math.floor((to - from) / 0.24);
  const inst = new THREE.InstancedMesh(merged, wood, count);
  const d = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const x = from + i * 0.24;
    d.position.set(x, terrainHeight(x, z) - 0.2, z + Math.sin(i * 1.7) * 0.05);
    d.rotation.set((Math.random() - 0.5) * 0.08, Math.random() * 3, (Math.random() - 0.5) * 0.08);
    d.scale.setScalar(0.85 + Math.random() * 0.3);
    d.updateMatrix();
    inst.setMatrixAt(i, d.matrix);
  }
  inst.castShadow = inst.receiveShadow = true;
  scene.add(inst);
}

function tower(scene: THREE.Scene, x: number, z: number, h: number, stone: boolean): void {
  const mat = new THREE.MeshStandardMaterial({ color: stone ? 0x8a8478 : 0x5a4430, roughness: 0.95 });
  const g = new THREE.Group();
  const body = new THREE.Mesh(stone ? new THREE.CylinderGeometry(2.4, 2.8, h, 16) : new THREE.BoxGeometry(2.4, h, 2.4), mat);
  body.position.y = h / 2;
  g.add(body);
  for (let i = 0; i < (stone ? 10 : 4); i++) {
    const a = (i / (stone ? 10 : 4)) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.5), mat);
    m.position.set(Math.sin(a) * (stone ? 2.35 : 1.3), h + 0.35, Math.cos(a) * (stone ? 2.35 : 1.3));
    m.rotation.y = a;
    g.add(m);
  }
  g.traverse((o) => ((o.castShadow = true), (o.receiveShadow = true)));
  scene.add(place(g, x, z, { ry: 0, dy: -0.5 }));
}

function wall(scene: THREE.Scene, z: number, from: number, to: number, h: number): void {
  const mat = new THREE.MeshStandardMaterial({ color: 0x847e72, roughness: 0.95 });
  for (let x = from; x < to; x += 3) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(3.05, h, 1.4), mat);
    seg.position.set(x + 1.5, terrainHeight(x + 1.5, z) + h / 2 - 0.4, z);
    const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 1.4), mat);
    merlon.position.set(x + 1.5, seg.position.y + h / 2 + 0.3, z);
    for (const m of [seg, merlon]) {
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
    }
  }
}

/** Japanese field camp: a maku curtain wall with the Tokugawa mon and tall nobori banners. */
function maku(scene: THREE.Scene, cx: number, cz: number): void {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#efe9da";
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = "#1a1a1a";
  g.fillRect(0, 30, 512, 14);
  g.fillRect(0, 84, 512, 14);
  g.beginPath();
  g.arc(256, 64, 44, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#efe9da";
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
    g.ellipse(256 + Math.cos(a) * 17, 64 + Math.sin(a) * 17, 13, 18, a, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const cloth = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide });
  for (const [dx, dz, ry] of [[0, -4, 0], [-4, 0, Math.PI / 2], [4, 0, Math.PI / 2]] as const) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.6, 12, 1), cloth);
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 2.2) * 0.08);
    m.geometry.computeVertexNormals();
    m.position.set(cx + dx, terrainHeight(cx + dx, cz + dz) + 1.1, cz + dz);
    m.rotation.y = ry;
    m.castShadow = true;
    scene.add(m);
  }
  const white = new THREE.MeshStandardMaterial({ color: 0xcfc8b8, roughness: 0.9, side: THREE.DoubleSide });
  const pole = new THREE.MeshStandardMaterial({ color: 0x2a1c10 });
  for (const [x, z] of [[-9, -2], [-12, 4], [10, -3], [13, 5], [-6, -16], [6, -17]] as const) {
    const h = 5;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, h), pole);
    stick.position.set(x, terrainHeight(x, z) + h / 2, z);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 3), white);
    flag.position.set(x + 0.37, terrainHeight(x, z) + h - 1.7, z);
    scene.add(stick, flag);
  }
}

function cannonPark(scene: THREE.Scene): void {
  const ice = new THREE.Mesh(
    new THREE.CircleGeometry(9, 40),
    new THREE.MeshStandardMaterial({ color: 0xaac4d8, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.9 }),
  );
  ice.rotation.x = -Math.PI / 2;
  ice.scale.set(1.6, 1, 1);
  ice.position.set(-22, terrainHeight(-22, 12) + 0.25, 12);
  scene.add(ice);
  const wood = new THREE.MeshStandardMaterial({ color: 0x3e5a3a, roughness: 0.8 });
  for (const [x, z] of [[-14, -14], [-17, -12]] as const) {
    const cart = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 2.4), wood);
    cart.position.set(x, terrainHeight(x, z) + 0.8, z);
    cart.castShadow = true;
    scene.add(cart);
  }
}

// ---------- Landmarks: recognisable silhouettes on the horizon for each era ----------

const matCache = new Map<number, THREE.MeshStandardMaterial>();
function m(color: number): THREE.MeshStandardMaterial {
  let r = matCache.get(color);
  if (!r) matCache.set(color, (r = new THREE.MeshStandardMaterial({ color, roughness: 0.9 })));
  return r;
}

function add(scene: THREE.Scene, geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, ry = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m(color));
  o.position.set(x, y, z);
  o.rotation.y = ry;
  o.castShadow = o.receiveShadow = true;
  scene.add(o);
  return o;
}

/** A gabled house: walls plus a triangular-prism roof. */
function house(scene: THREE.Scene, x: number, z: number, w: number, d: number, h: number, wall: number, roof: number, ry = 0, pitch = 0.8): void {
  const y = terrainHeight(x, z) - 0.3;
  add(scene, new THREE.BoxGeometry(w, h, d), wall, x, y + h / 2, z, ry);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - 0.3, 0);
  shape.lineTo(0, w * pitch * 0.6);
  shape.lineTo(w / 2 + 0.3, 0);
  shape.lineTo(-w / 2 - 0.3, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d + 0.6, bevelEnabled: false });
  geo.translate(0, 0, -(d + 0.6) / 2);
  add(scene, geo, roof, x, y + h, z, ry);
}

function roundHut(scene: THREE.Scene, x: number, z: number, r: number): void {
  const y = terrainHeight(x, z) - 0.2;
  add(scene, new THREE.CylinderGeometry(r, r, 2, 14), 0x8a7050, x, y + 1, z);
  add(scene, new THREE.ConeGeometry(r * 1.25, r * 1.6, 14), 0xb09a5a, x, y + 2 + r * 0.8, z);
}

function oppidum(scene: THREE.Scene, cx: number, cz: number): void {
  // Mont Auxois: a flat-topped hill ringed by a murus gallicus (stone face over a timber lattice).
  const base = terrainHeight(cx, cz);
  // Skirt reaches well below the lowest surrounding ground so no underside shows where the terrain dips.
  let low = base;
  for (let a = 0; a < 16; a++) low = Math.min(low, terrainHeight(cx + Math.sin(a * 0.39) * 34, cz + Math.cos(a * 0.39) * 34));
  const h = base + 10 - (low - 4);
  add(scene, new THREE.CylinderGeometry(22, 40, h, 40), 0x7a8458, cx, base + 10 - h / 2, cz);
  const top = base + 10;
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2;
    const seg = add(scene, new THREE.BoxGeometry(3.3, 2.4, 1.2), i % 2 ? 0x9a9080 : 0x8a806e, cx + Math.sin(a) * 21, top + 1.2, cz + Math.cos(a) * 21, a);
    seg.rotation.y = a;
  }
  for (let i = 0; i < 16; i++) {
    const a = i * 2.4;
    const r = 4 + (i % 4) * 4;
    roundHutAt(scene, cx + Math.sin(a) * r, top, cz + Math.cos(a) * r, 1.6 + (i % 3) * 0.3);
  }
}

function roundHutAt(scene: THREE.Scene, x: number, y: number, z: number, r: number): void {
  add(scene, new THREE.CylinderGeometry(r, r, 2, 14), 0x8a7050, x, y + 1, z);
  add(scene, new THREE.ConeGeometry(r * 1.25, r * 1.6, 14), 0xb09a5a, x, y + 2 + r * 0.8, z);
}

function aquila(scene: THREE.Scene, x: number, z: number): void {
  const y = terrainHeight(x, z);
  add(scene, new THREE.CylinderGeometry(0.04, 0.05, 3.2, 8), 0x5a3a22, x, y + 1.6, z);
  const gold = 0xd4a93a;
  add(scene, new THREE.BoxGeometry(0.9, 0.08, 0.2), gold, x, y + 3.2, z);
  add(scene, new THREE.SphereGeometry(0.14, 10, 8), gold, x, y + 3.35, z);
  add(scene, new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16), gold, x, y + 2.6, z).rotation.x = Math.PI / 2;
  const vex = add(scene, new THREE.PlaneGeometry(0.8, 0.9), 0x8e1b16, x, y + 2.1, z + 0.06);
  (vex.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
}

function cathedral(scene: THREE.Scene, x: number, z: number): void {
  const y = terrainHeight(x, z) - 0.5;
  const stone = 0xc8bfa8;
  add(scene, new THREE.BoxGeometry(9, 14, 26), stone, x, y + 7, z + 6);
  const roof = new THREE.Shape();
  roof.moveTo(-5, 0);
  roof.lineTo(0, 7);
  roof.lineTo(5, 0);
  roof.lineTo(-5, 0);
  const rg = new THREE.ExtrudeGeometry(roof, { depth: 26, bevelEnabled: false });
  rg.translate(0, 0, -13);
  add(scene, rg, 0x4a4e58, x, y + 14, z + 6);
  add(scene, new THREE.BoxGeometry(18, 11, 6), stone, x, y + 5.5, z + 10);
  for (const dx of [-3.8, 3.8]) {
    add(scene, new THREE.BoxGeometry(4.5, 26, 4.5), stone, x + dx, y + 13, z - 8.5);
    for (const [px, pz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]] as const) {
      add(scene, new THREE.ConeGeometry(0.35, 3, 6), stone, x + dx + px, y + 27.5, z - 8.5 + pz);
    }
  }
  add(scene, new THREE.ConeGeometry(1.2, 14, 8), 0x5a5e68, x, y + 28, z + 10);
  const rose = add(scene, new THREE.CircleGeometry(1.8, 20), 0x2a3a6a, x, y + 16, z - 10.8);
  rose.rotation.y = Math.PI;
}

function tenshu(scene: THREE.Scene, x: number, z: number): void {
  // Castle keep: battered stone base, stacked white storeys with dark hipped roofs and golden shachihoko.
  const y = terrainHeight(x, z) - 0.5;
  add(scene, new THREE.CylinderGeometry(9, 12, 7, 4, 1), 0x8a8478, x, y + 3.5, z, Math.PI / 4);
  let top = y + 7;
  for (let i = 0; i < 4; i++) {
    const w = 11 - i * 2.4;
    const h = 3.2;
    add(scene, new THREE.BoxGeometry(w, h, w * 0.85), 0xb8b0a0, x, top + h / 2, z);
    const roof = add(scene, new THREE.ConeGeometry(w * 0.85, 2.2, 4, 1, true), 0x2e343c, x, top + h + 0.7, z, Math.PI / 4);
    roof.scale.set(1, 1, 0.85);
    top += h + 1.2;
  }
  for (const dx of [-1.2, 1.2]) add(scene, new THREE.ConeGeometry(0.25, 1, 5), 0xd4a93a, x + dx, top + 0.6, z);
}

function pagoda(scene: THREE.Scene, x: number, z: number): void {
  const y = terrainHeight(x, z) - 0.3;
  let top = y;
  for (let i = 0; i < 5; i++) {
    const w = 5 - i * 0.6;
    add(scene, new THREE.BoxGeometry(w * 0.6, 2, w * 0.6), 0x8a2a1a, x, top + 1, z);
    add(scene, new THREE.ConeGeometry(w * 0.85, 0.9, 4, 1, true), 0x2e343c, x, top + 2.3, z, Math.PI / 4);
    top += 2.6;
  }
  add(scene, new THREE.CylinderGeometry(0.1, 0.12, 4, 6), 0xb08a3c, x, top + 2, z);
}

function torii(scene: THREE.Scene, x: number, z: number, ry: number): void {
  const y = terrainHeight(x, z);
  const red = 0xc0321e;
  const g = new THREE.Group();
  for (const dx of [-1.6, 1.6]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 4, 10), m(red));
    post.position.set(dx, 2, 0);
    g.add(post);
  }
  const kasagi = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.32, 0.45), m(0x1a1a1a));
  kasagi.position.y = 4.1;
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(4, 0.22, 0.25), m(red));
  nuki.position.y = 3.4;
  g.add(kasagi, nuki);
  g.traverse((o) => (o.castShadow = true));
  g.position.set(x, y, z);
  g.rotation.y = ry;
  scene.add(g);
}

function onionChurch(scene: THREE.Scene, x: number, z: number): void {
  const y = terrainHeight(x, z) - 0.4;
  add(scene, new THREE.BoxGeometry(7, 8, 14), 0xbab09a, x, y + 4, z);
  const roof = new THREE.Shape();
  roof.moveTo(-4, 0);
  roof.lineTo(0, 3.5);
  roof.lineTo(4, 0);
  roof.lineTo(-4, 0);
  const rg = new THREE.ExtrudeGeometry(roof, { depth: 14, bevelEnabled: false });
  rg.translate(0, 0, -7);
  add(scene, rg, 0x8a3a24, x, y + 8, z);
  add(scene, new THREE.BoxGeometry(3.6, 16, 3.6), 0xbab09a, x, y + 8, z - 8.5);
  const dome = add(scene, new THREE.SphereGeometry(1.9, 16, 12), 0x3a5a48, x, y + 17.4, z - 8.5);
  dome.scale.set(1, 1.1, 1);
  add(scene, new THREE.ConeGeometry(1.1, 2.4, 16), 0x3a5a48, x, y + 19.8, z - 8.5);
  add(scene, new THREE.BoxGeometry(0.12, 1.4, 0.12), 0xd4a93a, x, y + 21.6, z - 8.5);
  add(scene, new THREE.BoxGeometry(0.7, 0.12, 0.12), 0xd4a93a, x, y + 21.8, z - 8.5);
}

function windmill(scene: THREE.Scene, x: number, z: number): THREE.Object3D {
  const y = terrainHeight(x, z) - 0.3;
  add(scene, new THREE.CylinderGeometry(1.8, 2.6, 8, 12), 0xb8ae9a, x, y + 4, z);
  add(scene, new THREE.ConeGeometry(2.2, 2.4, 12), 0x5a4030, x, y + 9.2, z);
  const sails = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 6, 0.08), m(0xc4baa6));
    arm.position.y = 3.2;
    const holder = new THREE.Group();
    holder.rotation.z = (i * Math.PI) / 2;
    holder.add(arm);
    sails.add(holder);
  }
  sails.position.set(x, y + 8, z - 2.4);
  sails.traverse((o) => (o.castShadow = true));
  scene.add(sails);
  return sails;
}

function chapel(scene: THREE.Scene, x: number, z: number): void {
  const y = terrainHeight(x, z) - 0.3;
  add(scene, new THREE.BoxGeometry(3, 4, 5), 0xbcb4a2, x, y + 2, z);
  add(scene, new THREE.ConeGeometry(2.4, 2.6, 4), 0x8a3a24, x, y + 5.3, z, Math.PI / 4);
  add(scene, new THREE.CylinderGeometry(0.8, 0.8, 3, 10), 0xbcb4a2, x, y + 5.5, z - 2);
  add(scene, new THREE.SphereGeometry(0.9, 12, 10), 0x3a5a48, x, y + 7.5, z - 2);
}

function buildMonuments(scene: THREE.Scene, era: EraId): THREE.Object3D[] {
  const spin: THREE.Object3D[] = [];
  if (era === "alesia") {
    oppidum(scene, 0, 68);
    aquila(scene, 3.5, -3);
    for (let i = 0; i < 6; i++) roundHut(scene, -48 + i * 5, 48 + (i % 2) * 4, 1.8);
  } else if (era === "orleans") {
    cathedral(scene, -6, 58);
    const rng = (i: number) => Math.sin(i * 12.9898) * 0.5 + 0.5;
    for (let i = 0; i < 26; i++) {
      const x = -34 + (i % 13) * 5.4 + rng(i) * 1.5;
      const z = 42 + Math.floor(i / 13) * 8 + rng(i + 7) * 2;
      if (Math.abs(x + 6) < 10 && z > 48) continue;
      house(scene, x, z, 3.6, 4.4, 4 + rng(i + 3) * 3, [0xc4b89c, 0xb4a686, 0xa89878][i % 3], [0x6a3a2a, 0x4a4e58][i % 2], 0, 1.3);
    }
    tower(scene, 30, 44, 12, true);
  } else if (era === "sekigahara") {
    tenshu(scene, 26, 66);
    pagoda(scene, -38, 58);
    torii(scene, -14, -1, 0.4);
    for (let i = 0; i < 5; i++) house(scene, -26 + i * 6, 46 + (i % 2) * 5, 5, 4, 2.6, 0x9a8a6a, 0x5a5040, 0.1, 0.5);
  } else if (era === "austerlitz") {
    onionChurch(scene, -22, 58);
    for (let i = 0; i < 9; i++) house(scene, -40 + i * 5.5, 46 + (i % 3) * 3, 4, 5, 3, 0xbcb09a, 0x9a3a24, 0.05 * i, 0.9);
    spin.push(windmill(scene, 28, 50));
    chapel(scene, 44, 30);
  }
  return spin;
}

const WEATHER: Record<Palette["weather"], ConstructorParameters<typeof Particles>[0]> = {
  clear: {
    count: 120, origin: new THREE.Vector3(0, 2.5, -5), spread: new THREE.Vector3(35, 2, 30),
    velocity: new THREE.Vector3(0.4, 0.05, 0), velocityJitter: new THREE.Vector3(0.3, 0.1, 0.3),
    life: [6, 12], size: [0.03, 0.06],
    colorStart: new THREE.Color(1.4, 1.35, 1.1), colorEnd: new THREE.Color(1, 1, 0.9), opacity: 0.5, additive: false,
  },
  dust: {
    count: 300, origin: new THREE.Vector3(0, 3, -5), spread: new THREE.Vector3(35, 3, 30),
    velocity: new THREE.Vector3(0.6, 0.05, 0), velocityJitter: new THREE.Vector3(0.3, 0.1, 0.3),
    life: [6, 12], size: [0.05, 0.1],
    colorStart: new THREE.Color(2.5, 1.2, 0.5), colorEnd: new THREE.Color(1.5, 0.5, 0.2), opacity: 0.8, additive: true,
  },
  embers: {
    count: 200, origin: new THREE.Vector3(0, 3, -5), spread: new THREE.Vector3(35, 3, 30),
    velocity: new THREE.Vector3(0.3, 0.4, 0), velocityJitter: new THREE.Vector3(0.3, 0.3, 0.3),
    life: [6, 12], size: [0.05, 0.1],
    colorStart: new THREE.Color(3, 1.2, 0.3), colorEnd: new THREE.Color(1.5, 0.3, 0.1), opacity: 0.8, additive: true,
  },
  rain: {
    count: 1800, origin: new THREE.Vector3(0, 10, 0), spread: new THREE.Vector3(30, 10, 30),
    velocity: new THREE.Vector3(-1.2, -16, 0), velocityJitter: new THREE.Vector3(0.2, 2, 0.2),
    life: [1.2, 1.4], size: [0.03, 0.05],
    colorStart: new THREE.Color(0.7, 0.75, 0.85), colorEnd: new THREE.Color(0.6, 0.65, 0.75), opacity: 0.55, additive: false,
  },
  snow: {
    count: 1500, origin: new THREE.Vector3(0, 9, 0), spread: new THREE.Vector3(30, 9, 30),
    velocity: new THREE.Vector3(0.6, -1.1, 0), velocityJitter: new THREE.Vector3(0.4, 0.3, 0.4),
    life: [8, 14], size: [0.06, 0.12],
    colorStart: new THREE.Color(1.3, 1.3, 1.35), colorEnd: new THREE.Color(1.1, 1.1, 1.2), opacity: 0.9, additive: false,
  },
  mist: {
    count: 90, origin: new THREE.Vector3(0, 1.2, 5), spread: new THREE.Vector3(35, 1, 30),
    velocity: new THREE.Vector3(0.4, 0.05, 0), velocityJitter: new THREE.Vector3(0.2, 0.05, 0.2),
    life: [12, 20], size: [8, 14],
    colorStart: new THREE.Color(0.8, 0.82, 0.84), colorEnd: new THREE.Color(0.7, 0.72, 0.74), opacity: 0.12, additive: false, grow: 0.8,
  },
};

function drop(mesh: THREE.Object3D, x: number, z: number, lift: number): void {
  mesh.position.set(x, terrainHeight(x, z) + lift, z);
  mesh.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
}

/** A few readable silhouettes so each battlefield is a place, not the same camp at night. */
function placeLandmarks(scene: THREE.Scene, era: EraId): void {
  const stone = new THREE.MeshStandardMaterial({ color: 0xd2c4a8, roughness: 0.92 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4630, roughness: 0.86 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a322c, roughness: 0.8 });
  if (era === "troy") {
    for (const x of [-18, -11, 10, 17]) {
      const ship = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 5.5), wood);
      hull.position.y = 0.45;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.4), wood);
      mast.position.y = 2.3;
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.6), new THREE.MeshStandardMaterial({ color: 0xe6d7b8, side: THREE.DoubleSide, roughness: 0.9 }));
      sail.position.set(0, 2.2, 0);
      ship.add(hull, mast, sail);
      drop(ship, x, -24, 0);
      scene.add(ship);
    }
    const wall = new THREE.Mesh(new THREE.BoxGeometry(26, 5.5, 1.6), stone);
    drop(wall, 0, 36, 2.6);
    scene.add(wall);
    const horse = new THREE.Group();
    horse.add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.5, 4.2), wood));
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.5, 0.8), wood);
    neck.position.set(0, 1.2, 1.8);
    horse.add(neck);
    drop(horse, 18, 22, 1.5);
    scene.add(horse);
  } else if (era === "alesia") {
    const mound = new THREE.Mesh(new THREE.CylinderGeometry(7, 9, 3.2, 8), new THREE.MeshStandardMaterial({ color: 0x8a8a62, roughness: 1 }));
    drop(mound, 0, 36, 1.2);
    scene.add(mound);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.4), wood);
      drop(post, Math.sin(a) * 6.2, 36 + Math.cos(a) * 6.2, 2.4);
      scene.add(post);
    }
  } else if (era === "orleans") {
    const cathedral = new THREE.Group();
    const nave = new THREE.Mesh(new THREE.BoxGeometry(6, 7, 14), stone);
    nave.position.y = 3.5;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(1.1, 8, 6), dark);
    spire.position.set(0, 11, -5);
    cathedral.add(nave, spire);
    drop(cathedral, -20, 26, 0);
    scene.add(cathedral);
  } else if (era === "sekigahara") {
    const torii = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: 0x9c1c16, roughness: 0.55 });
    for (const x of [-1.6, 1.6]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 4.2), red);
      pillar.position.set(x, 2.1, 0);
      torii.add(pillar);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.28, 0.35), red);
    lintel.position.y = 4;
    const kasagi = new THREE.Mesh(new THREE.BoxGeometry(5, 0.18, 0.5), red);
    kasagi.position.y = 4.35;
    torii.add(lintel, kasagi);
    drop(torii, 0, 24, 0);
    scene.add(torii);
  } else if (era === "austerlitz") {
    const church = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.5, 5, 8), new THREE.MeshStandardMaterial({ color: 0xe7e2d6, roughness: 0.85 }));
    body.position.y = 2.5;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 3, 4), dark);
    roof.position.y = 6.2;
    roof.rotation.y = Math.PI / 4;
    church.add(body, roof);
    drop(church, 20, 24, 0);
    scene.add(church);
    const pond = new THREE.Mesh(
      new THREE.CircleGeometry(6, 20),
      new THREE.MeshStandardMaterial({ color: 0xd5e4ee, roughness: 0.15, metalness: 0.05 }),
    );
    pond.rotation.x = -Math.PI / 2;
    drop(pond, -16, 16, 0.05);
    scene.add(pond);
  }
}

export async function buildWorld(scene: THREE.Scene, renderer: THREE.WebGLRenderer, era: EraId, pal: Palette): Promise<World> {
  scene.background = new THREE.Color(pal.sky);
  scene.fog = new THREE.FogExp2(pal.haze, pal.fog);
  renderer.toneMappingExposure = pal.exposure;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const hdr = await loadHdr("/assets/hdri/qwantani_sunset_puresky.hdr");
  scene.environment = pmrem.fromEquirectangular(hdr).texture;
  scene.environmentIntensity = 0.22;
  hdr.dispose();

  const sun = new THREE.DirectionalLight(pal.sun, pal.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 200 });
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(pal.hemiSky, pal.hemiGround, 0.85));

  const [vista] = await Promise.all([buildVista(scene, pal, false), buildTerrain(scene, pal)]);

  const [cliff, boulder, mossRocks, firePit, barrels, crate, shield, lantern, deadTree, fern] = await Promise.all([
    "namaqualand_cliff_01", "namaqualand_boulder_02", "rock_moss_set_01", "stone_fire_pit", "wooden_barrels_01",
    "wooden_crate_01", "kite_shield", "wooden_lantern_01", "dead_tree_trunk", "fern_02",
  ].map(loadModel));

  for (let i = 0; i < 9; i++) {
    const x = -48 + i * 12 + (Math.random() - 0.5) * 4;
    if (Math.abs(x) < 16) continue;
    scene.add(place(cliff.clone(), x, CLIFF_EDGE_Z + 1.5, { s: 1.6 + Math.random() * 0.8, dy: -3 }));
  }
  for (const [x, z, s] of [[-30, 5, 3], [32, -8, 3.5], [26, 14, 2.5], [-22, -24, 2], [18, -26, 1.6], [-36, -12, 4]] as const) {
    scene.add(place(boulder.clone(), x, z, { s, dy: -0.3 }));
  }
  for (const [x, z] of [[-12, 8], [14, 2], [8, -24], [-26, -18]] as const) scene.add(place(mossRocks.clone(), x, z, { s: 1.5 }));
  scene.add(place(deadTree, -15, -20, { s: 1.4 }));

  const achillesSpot = new THREE.Vector3(3, 0, -9);
  const fireSpot = new THREE.Vector3(0, 0, -6);
  scene.add(place(firePit, fireSpot.x, fireSpot.z, { s: 1.1 }));
  const fire = new Campfire(new THREE.Vector3(fireSpot.x, terrainHeight(fireSpot.x, fireSpot.z), fireSpot.z));
  scene.add(fire.group);

  const tentSpot = new THREE.Vector3(-7, 0, -13);
  const tent = place(makeTent(3.2, 1.9, 2.6), tentSpot.x, tentSpot.z, { ry: 0.3 });
  scene.add(tent);
  scene.add(place(barrels, -2.5, -15, { s: 1 }));
  scene.add(place(crate, -11.5, -9.5, { s: 1.1, ry: 0.4 }));
  scene.add(place(crate.clone(), -11.2, -8.2, { s: 0.8, ry: 1.1 }));
  const standingShield = place(shield, -10.2, -8.6, { s: 1, ry: 0.9 });
  standingShield.rotation.x = -0.25;
  standingShield.position.y += 0.05;
  scene.add(standingShield);
  scene.add(place(lantern, -4.2, -10.3, { s: 1 }));
  const lanternLight = new THREE.PointLight(0xffa050, 4, 6);
  lanternLight.position.set(-4.2, terrainHeight(-4.2, -10.3) + 0.4, -10.3);
  scene.add(lanternLight);

  const banners: Banner[] = [];
  for (const [x, z, h] of [[-7, -13, 6.2], [12, -28, 5], [-20, -29, 5], [4, -30, 5]] as const) {
    const b = new Banner(pal.banner);
    b.mesh.position.set(x, terrainHeight(x, z) + h, z);
    if (x !== -7 || z !== -13) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, h + 0.4), new THREE.MeshStandardMaterial({ color: 0x3b2a1c }));
      pole.position.set(x, terrainHeight(x, z) + (h + 0.4) / 2 - 0.3, z);
      pole.castShadow = true;
      scene.add(pole);
    }
    scene.add(b.mesh);
    banners.push(b);
  }

  const inPlateau = (): [number, number] | null => {
    const x = (Math.random() - 0.5) * 90;
    const z = -30 + Math.random() * 70;
    const clear = Math.hypot(x - fireSpot.x, z - fireSpot.z) > 3 && Math.hypot(x - tentSpot.x, z - tentSpot.z) > 4;
    return clear ? [x, z] : null;
  };
  scatterInstanced(scene, makeGrassTuft(), 1400, inPlateau, [0.7, 1.3]);
  scatterInstanced(scene, fern, 30, inPlateau, [0.6, 1.1]);

  if (era === "alesia") {
    stakes(scene, 22, -30, 30);
    stakes(scene, -24, -30, -8);
    stakes(scene, -24, 8, 30);
    tower(scene, -14, 22.5, 6, false);
    tower(scene, 14, 22.5, 6, false);
  } else if (era === "orleans") {
    wall(scene, 34, -30, 30, 5);
    tower(scene, -12, 33, 9, true);
    tower(scene, 12, 33, 9, true);
  } else if (era === "sekigahara") {
    maku(scene, 3, -9);
  } else if (era === "austerlitz") {
    cannonPark(scene);
  }

  const weather = WEATHER[pal.weather];
  const dust = new Particles({ ...weather, origin: weather.origin.clone() });
  const valleySmoke = new Particles({
    count: 60, origin: new THREE.Vector3(0, -6, CLIFF_EDGE_Z - 12), spread: new THREE.Vector3(70, 2, 8),
    velocity: new THREE.Vector3(0.8, 1.2, 0), velocityJitter: new THREE.Vector3(0.3, 0.4, 0.3),
    life: [10, 16], size: [25, 40],
    colorStart: new THREE.Color(0.35, 0.25, 0.2), colorEnd: new THREE.Color(0.2, 0.16, 0.14), opacity: 0.22, additive: false, grow: 1.5,
  });
  scene.add(dust.points);
  if (era === "troy") scene.add(valleySmoke.points);
  const spinners = buildMonuments(scene, era);

  placeLandmarks(scene, era);
  const sunDir = new THREE.Vector3(...pal.sunDir).normalize();

  return {
    sun,
    interactables: { achillesSpot, portalSpot: new THREE.Vector3(-7, 0, -8.5) },
    update(dt, t, camera, focus) {
      vista.position.set(camera.position.x, camera.position.y - vista.userData.horizonOffset, camera.position.z);
      sun.position.copy(focus).addScaledVector(sunDir, 80);
      sun.target.position.copy(focus);
      fire.update(dt, t);
      if (pal.weather === "rain" || pal.weather === "snow") dust.points.position.set(focus.x, 0, focus.z);
      dust.update(dt);
      valleySmoke.update(dt);
      for (const b of banners) b.update(t);
      for (const s of spinners) s.rotation.z += dt * 0.6;
    },
  };
}
