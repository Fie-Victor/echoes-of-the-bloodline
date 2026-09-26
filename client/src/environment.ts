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
  const white = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.9, side: THREE.DoubleSide });
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

const WEATHER: Record<Palette["weather"], ConstructorParameters<typeof Particles>[0]> = {
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

export async function buildWorld(scene: THREE.Scene, renderer: THREE.WebGLRenderer, era: EraId, pal: Palette): Promise<World> {
  scene.background = new THREE.Color(pal.sky);
  scene.fog = new THREE.FogExp2(pal.haze, pal.fog);
  renderer.toneMappingExposure = pal.exposure;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const hdr = await loadHdr("/assets/hdri/qwantani_sunset_puresky.hdr");
  scene.environment = pmrem.fromEquirectangular(hdr).texture;
  scene.environmentIntensity = 0.55;
  hdr.dispose();

  const sun = new THREE.DirectionalLight(pal.sun, pal.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 200 });
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(pal.hemiSky, pal.hemiGround, 0.5));

  const [vista] = await Promise.all([buildVista(scene, pal, era === "troy"), buildTerrain(scene, pal)]);

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
  scene.add(dust.points, valleySmoke.points);

  const sunDir = new THREE.Vector3(-0.35, 0.28, -1).normalize();

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
    },
  };
}
