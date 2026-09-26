import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";

export const manager = new THREE.LoadingManager();
const gltfLoader = new GLTFLoader(manager);
const textureLoader = new THREE.TextureLoader(manager);
const hdrLoader = new HDRLoader(manager);

export function loadGltf(url: string): Promise<GLTF> {
  return gltfLoader.loadAsync(url);
}

export async function loadModel(name: string): Promise<THREE.Group> {
  const gltf = await loadGltf(`/assets/models/${name}/${name}.gltf`);
  gltf.scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return gltf.scene;
}

export function loadTexture(url: string, srgb = false): Promise<THREE.Texture> {
  return textureLoader.loadAsync(url).then((t) => {
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  });
}

export async function loadPbr(name: string, repeat: number): Promise<THREE.MeshStandardMaterial> {
  const base = `/assets/textures/${name}`;
  const [map, normalMap, arm] = await Promise.all([
    loadTexture(`${base}/diff.jpg`, true),
    loadTexture(`${base}/nor.jpg`),
    loadTexture(`${base}/arm.jpg`),
  ]);
  for (const t of [map, normalMap, arm]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
  }
  return new THREE.MeshStandardMaterial({ map, normalMap, aoMap: arm, roughnessMap: arm, metalnessMap: arm, metalness: 1 });
}

export function loadHdr(url: string): Promise<THREE.DataTexture> {
  return hdrLoader.loadAsync(url);
}

let softTexture: THREE.Texture | null = null;
export function getSoftParticleTexture(): THREE.Texture {
  if (softTexture) return softTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.5)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  softTexture = new THREE.CanvasTexture(c);
  return softTexture;
}
