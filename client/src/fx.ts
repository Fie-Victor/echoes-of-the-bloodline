import * as THREE from "three";
import { getSoftParticleTexture } from "./assets.ts";

interface ParticleOptions {
  count: number;
  origin: THREE.Vector3;
  spread: THREE.Vector3;
  velocity: THREE.Vector3;
  velocityJitter: THREE.Vector3;
  life: [number, number];
  size: [number, number];
  colorStart: THREE.Color;
  colorEnd: THREE.Color;
  opacity: number;
  additive: boolean;
  grow?: number;
}

const VERT = /* glsl */ `
attribute float aAge;
attribute float aSize;
uniform float uGrow;
varying float vAge;
void main() {
  vAge = aAge;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (1.0 + uGrow * aAge) * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColorStart;
uniform vec3 uColorEnd;
uniform float uOpacity;
varying float vAge;
void main() {
  if (vAge >= 1.0) discard;
  float a = texture2D(uMap, gl_PointCoord).a;
  float fade = smoothstep(0.0, 0.1, vAge) * (1.0 - smoothstep(0.6, 1.0, vAge));
  gl_FragColor = vec4(mix(uColorStart, uColorEnd, vAge), a * fade * uOpacity);
}`;

export class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private age: Float32Array;
  private life: Float32Array;

  constructor(private o: ParticleOptions) {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(o.count * 3);
    this.vel = new Float32Array(o.count * 3);
    this.age = new Float32Array(o.count);
    this.life = new Float32Array(o.count);
    const size = new Float32Array(o.count);
    for (let i = 0; i < o.count; i++) {
      this.respawn(i);
      this.age[i] = Math.random();
      size[i] = THREE.MathUtils.lerp(o.size[0], o.size[1], Math.random());
    }
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("aAge", new THREE.BufferAttribute(this.age, 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        uMap: { value: getSoftParticleTexture() },
        uColorStart: { value: o.colorStart },
        uColorEnd: { value: o.colorEnd },
        uOpacity: { value: o.opacity },
        uGrow: { value: o.grow ?? 0 },
      },
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  private respawn(i: number): void {
    const { origin, spread, velocity, velocityJitter, life } = this.o;
    const r = () => Math.random() * 2 - 1;
    this.pos[i * 3] = origin.x + r() * spread.x;
    this.pos[i * 3 + 1] = origin.y + r() * spread.y;
    this.pos[i * 3 + 2] = origin.z + r() * spread.z;
    this.vel[i * 3] = velocity.x + r() * velocityJitter.x;
    this.vel[i * 3 + 1] = velocity.y + r() * velocityJitter.y;
    this.vel[i * 3 + 2] = velocity.z + r() * velocityJitter.z;
    this.life[i] = THREE.MathUtils.lerp(life[0], life[1], Math.random());
    this.age[i] = 0;
  }

  update(dt: number, wind = 0): void {
    for (let i = 0; i < this.o.count; i++) {
      this.age[i] += dt / this.life[i];
      if (this.age[i] >= 1) this.respawn(i);
      this.pos[i * 3] += (this.vel[i * 3] + wind * this.age[i]) * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aAge.needsUpdate = true;
  }
}

export class Campfire {
  readonly group = new THREE.Group();
  private light: THREE.PointLight;
  private systems: Particles[];

  constructor(position: THREE.Vector3, scale = 1) {
    this.group.position.copy(position);
    const o = new THREE.Vector3(0, 0.25 * scale, 0);
    const flames = new Particles({
      count: 90, origin: o, spread: new THREE.Vector3(0.25, 0.05, 0.25).multiplyScalar(scale),
      velocity: new THREE.Vector3(0, 1.4 * scale, 0), velocityJitter: new THREE.Vector3(0.15, 0.4, 0.15),
      life: [0.5, 1.0], size: [0.9 * scale, 1.6 * scale],
      colorStart: new THREE.Color(3.0, 1.6, 0.5), colorEnd: new THREE.Color(1.2, 0.15, 0.02), opacity: 0.9, additive: true, grow: -0.6,
    });
    const smoke = new Particles({
      count: 40, origin: o.clone().setY(1.2 * scale), spread: new THREE.Vector3(0.2, 0.1, 0.2),
      velocity: new THREE.Vector3(0.2, 1.0, 0), velocityJitter: new THREE.Vector3(0.2, 0.3, 0.2),
      life: [3, 5], size: [1.5 * scale, 2.5 * scale],
      colorStart: new THREE.Color(0.18, 0.15, 0.13), colorEnd: new THREE.Color(0.08, 0.07, 0.07), opacity: 0.35, additive: false, grow: 2.5,
    });
    const embers = new Particles({
      count: 40, origin: o, spread: new THREE.Vector3(0.3, 0.1, 0.3),
      velocity: new THREE.Vector3(0, 2.0, 0), velocityJitter: new THREE.Vector3(0.6, 0.8, 0.6),
      life: [1.5, 3], size: [0.06, 0.12],
      colorStart: new THREE.Color(4, 2, 0.6), colorEnd: new THREE.Color(2, 0.3, 0), opacity: 1, additive: true,
    });
    this.systems = [smoke, flames, embers];
    for (const s of this.systems) this.group.add(s.points);
    this.light = new THREE.PointLight(0xff8a3a, 25 * scale, 14 * scale, 1.6);
    this.light.position.y = 0.9 * scale;
    this.group.add(this.light);
  }

  update(dt: number, t: number): void {
    for (const s of this.systems) s.update(dt, 0.4);
    this.light.intensity = 22 + Math.sin(t * 13) * 3 + Math.sin(t * 7.3) * 4 + Math.random() * 2;
  }
}

interface BurstOptions {
  max: number;
  colorStart: THREE.Color;
  colorEnd: THREE.Color;
  opacity: number;
  additive: boolean;
  gravity: number;
  drag: number;
  grow?: number;
}

/** Pooled one-shot particles (blood spray, powder smoke, muzzle flashes, dirt): `emit` recycles the oldest slots. */
export class Bursts {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private size: Float32Array;
  private next = 0;

  constructor(private o: BurstOptions) {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(o.max * 3);
    this.vel = new Float32Array(o.max * 3);
    this.age = new Float32Array(o.max).fill(1);
    this.life = new Float32Array(o.max).fill(1);
    this.size = new Float32Array(o.max);
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("aAge", new THREE.BufferAttribute(this.age, 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1));
    this.points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: {
          uMap: { value: getSoftParticleTexture() },
          uColorStart: { value: o.colorStart },
          uColorEnd: { value: o.colorEnd },
          uOpacity: { value: o.opacity },
          uGrow: { value: o.grow ?? 0 },
        },
      }),
    );
    this.points.frustumCulled = false;
  }

  emit(at: THREE.Vector3, count: number, dir: THREE.Vector3, jitter: number, life: [number, number], size: [number, number]): void {
    const r = () => Math.random() * 2 - 1;
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.o.max;
      this.pos.set([at.x + r() * 0.05, at.y + r() * 0.05, at.z + r() * 0.05], i * 3);
      this.vel.set([dir.x + r() * jitter, dir.y + r() * jitter, dir.z + r() * jitter], i * 3);
      this.age[i] = 0;
      this.life[i] = THREE.MathUtils.lerp(life[0], life[1], Math.random());
      this.size[i] = THREE.MathUtils.lerp(size[0], size[1], Math.random());
    }
    this.points.geometry.attributes.aSize.needsUpdate = true;
  }

  update(dt: number, wind = 0): void {
    const damp = Math.exp(-this.o.drag * dt);
    for (let i = 0; i < this.o.max; i++) {
      if (this.age[i] >= 1) continue;
      this.age[i] = Math.min(1, this.age[i] + dt / this.life[i]);
      this.vel[i * 3] = this.vel[i * 3] * damp + wind * dt;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * damp - this.o.gravity * dt;
      this.vel[i * 3 + 2] *= damp;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aAge.needsUpdate = true;
  }
}
