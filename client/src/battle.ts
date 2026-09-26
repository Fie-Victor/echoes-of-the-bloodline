import * as THREE from "three";
import { CLIP_SPEED, type Character } from "./characters.ts";
import { CLIFF_EDGE_Z, terrainHeight } from "./environment.ts";
import type { ArmyConfig, Squad, Tactic, UnitRole } from "./eras.ts";
import { Bursts } from "./fx.ts";
import { playSfx } from "./sfx.ts";

export type Callout = "volley" | "charge" | "losing" | "winning" | "rout" | "cannon";
export type Missile = "arrow" | "bolt" | "javelin" | "ball";

interface Unit {
  c: Character | null;
  cannon: THREE.Group | null;
  team: 0 | 1;
  role: UnitRole;
  hp: number;
  maxHp: number;
  alive: boolean;
  fleeing: boolean;
  swing: number;
  reload: number;
  shots: number;
  fall: number;
  fallDir: number;
  slot: THREE.Vector3;
  speed: number;
  missile: Missile;
}

interface Projectile {
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  team: 0 | 1;
  kind: Missile;
  life: number;
  stuck: boolean;
  byPlayer?: boolean;
}

export interface BattleHooks {
  spawn(squad: Squad, team: number): Character;
  callout(kind: Callout): void;
  playerHit(damage: number, from: THREE.Vector3): void;
  shake(amount: number): void;
  finished(victory: boolean): void;
  onEnemyKilled?(killer: "player" | "ally", pos: THREE.Vector3): void;
  onPlayerStrikeHit?(pos: THREE.Vector3, damage: number): void;
}

const RANGE: Record<UnitRole, number> = { melee: 1.4, javelin: 16, archer: 42, musket: 38, cannon: 60 };
const RELOAD: Record<UnitRole, number> = { melee: 1.4, javelin: 5, archer: 4.5, musket: 9, cannon: 7 };
const MAX_SHOTS: Record<UnitRole, number> = { melee: 0, javelin: 2, archer: 6, musket: 3, cannon: Infinity };
const MELEE_REACH = 1.35;
const CHEST = 1.3;
const GRAVITY = 9.8;
const BOUNDS = { x: 30, zMin: CLIFF_EDGE_Z + 3, zMax: 30 };

const bloodMat = new THREE.MeshStandardMaterial({
  color: 0x3a0404, roughness: 0.25, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
});
const poolGeo = new THREE.CircleGeometry(0.5, 18).rotateX(-Math.PI / 2);

function makeMissile(kind: Missile): THREE.Object3D {
  const g = new THREE.Group();
  if (kind === "ball") {
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.8, roughness: 0.4 })));
    return g;
  }
  const len = kind === "javelin" ? 1.9 : kind === "bolt" ? 0.4 : 0.8;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 4), new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.8 }));
  shaft.rotation.x = Math.PI / 2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.1, 4), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 1, roughness: 0.4 }));
  tip.rotation.x = Math.PI / 2;
  tip.position.z = len / 2;
  g.add(shaft, tip);
  if (kind === "arrow") {
    const fletch = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.12), new THREE.MeshStandardMaterial({ color: 0xe8e2d0, side: THREE.DoubleSide }));
    fletch.rotation.x = Math.PI / 2;
    fletch.position.z = -len / 2 + 0.06;
    g.add(fletch);
  }
  return g;
}

function makeCannon(): THREE.Group {
  const g = new THREE.Group();
  const bronze = new THREE.MeshStandardMaterial({ color: 0x7a5a2a, metalness: 1, roughness: 0.4 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x3e5a3a, roughness: 0.8 });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.8, 14), bronze);
  barrel.rotation.x = Math.PI / 2 - 0.12;
  barrel.position.set(0, 0.85, 0.2);
  const trail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 2), wood);
  trail.position.set(0, 0.5, -0.6);
  trail.rotation.x = -0.25;
  g.add(barrel, trail);
  for (const x of [-0.45, 0.45]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 16), wood);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(x, 0.58, 0);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.95, 8), wood);
    hub.rotation.z = Math.PI / 2;
    hub.position.y = 0.58;
    g.add(wheel, hub);
  }
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** A pitched battle between two small armies: formations, missile volleys, melee, wounds, deaths and rout. */
export class Battle {
  readonly group = new THREE.Group();
  private units: Unit[] = [];
  private projectiles: Projectile[] = [];
  private pools: THREE.Mesh[] = [];
  private blood = new Bursts({ max: 600, colorStart: new THREE.Color(0.35, 0.01, 0.01), colorEnd: new THREE.Color(0.15, 0, 0), opacity: 0.95, additive: false, gravity: 9, drag: 1 });
  private smoke = new Bursts({ max: 500, colorStart: new THREE.Color(0.75, 0.74, 0.72), colorEnd: new THREE.Color(0.5, 0.5, 0.5), opacity: 0.5, additive: false, gravity: -0.3, drag: 2.5, grow: 3 });
  private flash = new Bursts({ max: 200, colorStart: new THREE.Color(4, 2.4, 0.8), colorEnd: new THREE.Color(1.5, 0.3, 0), opacity: 1, additive: true, gravity: 0, drag: 6, grow: -0.5 });
  private dirt = new Bursts({ max: 400, colorStart: new THREE.Color(0.25, 0.2, 0.15), colorEnd: new THREE.Color(0.2, 0.17, 0.13), opacity: 0.9, additive: false, gravity: 12, drag: 0.8, grow: 1 });
  private flashLight = new THREE.PointLight(0xffaa55, 0, 18, 1.5);
  private volleyTimer = [4, 6];
  private initial = [0, 0];
  private said = new Set<Callout>();
  private engaged = false;
  private done = false;
  private elapsed = 0;
  private dodging = false;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    allies: ArmyConfig,
    enemies: ArmyConfig,
    private tactic: Tactic,
    private hooks: BattleHooks,
  ) {
    this.group.add(this.blood.points, this.smoke.points, this.flash.points, this.dirt.points, this.flashLight);
    scene.add(this.group);
    this.deploy(allies, 0, 3);
    this.deploy(enemies, 1, 14);
  }

  private deploy(army: ArmyConfig, team: 0 | 1, z: number): void {
    const units = army.squads.flatMap((s) => Array.from({ length: s.count }, () => s));
    const ranged = units.filter((s) => s.role !== "melee" && s.role !== "cannon");
    const melee = units.filter((s) => s.role === "melee");
    const guns = units.filter((s) => s.role === "cannon");
    const dir = team === 0 ? -1 : 1;
    const rows: [Squad[], number][] = team === 0 ? [[melee, 0], [ranged, 1.8]] : [[ranged, 0], [melee, 2.2]];
    if (team === 0 && ranged.some((s) => s.role === "musket")) rows.reverse();
    for (const [row, depth] of rows) {
      row.forEach((s, i) => {
        const x = (i - (row.length - 1) / 2) * 1.5 + (Math.random() - 0.5) * 0.3;
        this.spawn(s, team, army.team, new THREE.Vector3(x, 0, z - dir * depth + (Math.random() - 0.5) * 0.4));
      });
    }
    guns.forEach((s, i) => this.spawn(s, team, army.team, new THREE.Vector3(-6 + i * 12, 0, z - dir * 6)));
    this.initial[team] = units.filter((s) => s.role !== "cannon").length;
  }

  private spawn(s: Squad, team: 0 | 1, color: number, at: THREE.Vector3): void {
    const facing = team === 0 ? 0 : Math.PI;
    let c: Character | null = null;
    let cannon: THREE.Group | null = null;
    if (s.role === "cannon") {
      cannon = makeCannon();
      cannon.position.set(at.x, terrainHeight(at.x, at.z), at.z);
      cannon.rotation.y = facing;
      this.group.add(cannon);
    } else {
      c = this.hooks.spawn(s, color);
      c.root.position.set(at.x, terrainHeight(at.x, at.z), at.z);
      c.root.rotation.y = facing;
      this.group.add(c.root);
    }
    const fierce = s.outfit === "gaul" ? 4.2 : s.role === "musket" ? 1.5 : 3.2;
    this.units.push({
      c, cannon, team, role: s.role, hp: s.hp, maxHp: s.hp, alive: true, fleeing: false, swing: Math.random() * 1.5,
      reload: 0, shots: 0, fall: 0, fallDir: Math.random() < 0.5 ? -1 : 1, slot: at.clone(), speed: fierce * (0.9 + Math.random() * 0.2),
      missile: s.role === "javelin" ? "javelin" : s.role === "cannon" ? "ball" : s.weapon === "crossbow" ? "bolt" : "arrow",
    });
  }

  alive(team: 0 | 1): number {
    return this.units.filter((u) => u.team === team && u.alive && !u.fleeing && u.role !== "cannon").length;
  }

  counts(): { allies: number; enemies: number; alliesMax: number; enemiesMax: number } {
    return { allies: this.alive(0), enemies: this.alive(1), alliesMax: this.initial[0], enemiesMax: this.initial[1] };
  }

  private pos(u: Unit): THREE.Vector3 {
    return (u.c?.root ?? u.cannon!).position;
  }

  private nearestFoe(u: Unit, player: THREE.Vector3 | null): { pos: THREE.Vector3; unit: Unit | null; d: number } | null {
    const p = this.pos(u);
    let best: { pos: THREE.Vector3; unit: Unit | null; d: number } | null = null;
    for (const o of this.units) {
      if (o.team === u.team || !o.alive || o.fleeing || !o.c) continue;
      const d = p.distanceTo(this.pos(o));
      if (!best || d < best.d) best = { pos: this.pos(o), unit: o, d };
    }
    if (u.team === 1 && player) {
      const d = p.distanceTo(player) * 0.85;
      if (!best || d < best.d) best = { pos: player, unit: null, d };
    }
    return best;
  }

  private damage(u: Unit, amount: number, from: THREE.Vector3, byPlayer = false): void {
    if (!u.alive) return;
    u.hp -= amount;
    const at = this.tmp.copy(this.pos(u)).setY(this.pos(u).y + CHEST);
    const away = this.tmp2.subVectors(this.pos(u), from).setY(0).normalize();
    this.blood.emit(at, 14 + Math.floor(amount / 3), away.multiplyScalar(2).setY(1.5), 1.4, [0.4, 0.9], [0.05, 0.12]);
    if (u.c) u.c.flinch = 0.3;
    if (u.hp <= 0) {
      if (u.team === 1) this.hooks.onEnemyKilled?.(byPlayer ? "player" : "ally", this.pos(u));
      this.kill(u, away);
    }
  }

  private kill(u: Unit, away: THREE.Vector3): void {
    u.alive = false;
    u.fall = 0.001;
    if (u.c) u.fallDir = Math.sign(away.dot(new THREE.Vector3(Math.sin(u.c.root.rotation.y), 0, Math.cos(u.c.root.rotation.y)))) || 1;
    playSfx("thud", 6);
    const p = this.pos(u);
    const pool = new THREE.Mesh(poolGeo, bloodMat);
    pool.position.set(p.x + away.x * 0.6, terrainHeight(p.x, p.z) + 0.03, p.z + away.z * 0.6);
    pool.scale.setScalar(0.05);
    this.group.add(pool);
    this.pools.push(pool);
  }

  private muzzle(from: THREE.Vector3, dir: THREE.Vector3, big: boolean): void {
    const at = this.tmp2.copy(from).addScaledVector(dir, big ? 1.2 : 0.8);
    this.flash.emit(at, big ? 30 : 10, dir.clone().multiplyScalar(big ? 8 : 5), big ? 2 : 1, [0.08, 0.2], [0.3, big ? 1.2 : 0.6]);
    this.smoke.emit(at, big ? 40 : 14, dir.clone().multiplyScalar(big ? 5 : 3).setY(0.4), big ? 1.5 : 0.8, [2.5, 5], [0.8, big ? 2.5 : 1.4]);
    this.flashLight.position.copy(at);
    this.flashLight.intensity = big ? 90 : 25;
  }

  private throwMissile(from: THREE.Vector3, target: THREE.Vector3, kind: Missile, team: 0 | 1, spread: number, byPlayer = false): void {
    const aim = this.tmp.copy(target).add(new THREE.Vector3((Math.random() - 0.5) * spread, 0, (Math.random() - 0.5) * spread));
    const dist = from.distanceTo(aim);
    const T = kind === "javelin" ? 0.5 + dist * 0.06 : kind === "ball" ? 0.8 + dist * 0.035 : 0.6 + dist * 0.045;
    const vel = new THREE.Vector3().subVectors(aim, from).divideScalar(T);
    vel.y += 0.5 * GRAVITY * T;
    const mesh = makeMissile(kind);
    mesh.position.copy(from);
    this.group.add(mesh);
    this.projectiles.push({ mesh, vel, team, kind, life: 30, stuck: false, byPlayer });
  }

  /** Musket/arquebus shot: instant, inaccurate, lethal. */
  private fire(from: THREE.Vector3, dir: THREE.Vector3, team: 0 | 1, accuracy: number, player: THREE.Vector3 | null, dodging: boolean): Unit | null {
    this.muzzle(from, dir, false);
    let hit: Unit | null = null;
    let best = Infinity;
    for (const o of this.units) {
      if (o.team === team || !o.alive || !o.c) continue;
      const to = this.tmp.copy(this.pos(o)).setY(this.pos(o).y + CHEST).sub(from);
      const along = to.dot(dir);
      if (along < 0 || along > 70) continue;
      const miss = to.addScaledVector(dir, -along).length();
      if (miss < 0.45 + along * 0.012 && along < best) {
        best = along;
        hit = o;
      }
    }
    if (hit) {
      if (Math.random() < accuracy * (1 - best / 90)) this.damage(hit, 55 + Math.random() * 45, from);
      else this.dirt.emit(this.pos(hit).clone().setY(this.pos(hit).y + 0.1), 6, new THREE.Vector3(0, 2, 0), 1, [0.3, 0.6], [0.1, 0.2]);
      return hit;
    }
    if (team === 1 && player && !dodging) {
      const to = this.tmp.copy(player).setY(player.y + CHEST).sub(from);
      const along = to.dot(dir);
      const miss = to.addScaledVector(dir, -along).length();
      if (along > 0 && miss < 0.8 && Math.random() < accuracy * 0.6) this.hooks.playerHit(22 + Math.random() * 18, from);
    }
    return null;
  }

  /** Player melee: a strike in front of the player hits the closest enemy in a 70° arc. */
  playerStrike(p: THREE.Vector3, yaw: number, power: number): boolean {
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    let target: Unit | null = null;
    let best = 2.1;
    for (const u of this.units) {
      if (u.team !== 1 || !u.alive || !u.c) continue;
      const to = this.tmp.subVectors(this.pos(u), p).setY(0);
      const d = to.length();
      if (d < best && to.normalize().dot(fwd) > 0.55) {
        best = d;
        target = u;
      }
    }
    if (!target) return false;
    const parried = Math.random() < (target.fleeing ? 0 : 0.2);
    playSfx(parried ? "clash" : "hit", 1);
    if (!parried) {
      this.damage(target, power * (0.8 + Math.random() * 0.4), p, true);
      this.hooks.onPlayerStrikeHit?.(this.pos(target), power);
    }
    this.engaged = true;
    return true;
  }

  /** Player ranged attack along the camera ray. */
  playerShoot(from: THREE.Vector3, dir: THREE.Vector3, kind: Missile | "musket"): void {
    if (kind === "musket") {
      playSfx("musket", 0);
      const hit = this.fire(from, dir, 0, 0.9, null, false);
      if (hit) this.hooks.onPlayerStrikeHit?.(this.pos(hit), 50);
      this.hooks.shake(0.15);
    } else {
      playSfx("bow", 0);
      const target = from.clone().addScaledVector(dir, kind === "javelin" ? 18 : 35);
      target.y = terrainHeight(target.x, target.z) + CHEST;
      this.throwMissile(from, target, kind, 0, 0, true);
    }
    this.engaged = true;
  }

  private volley(team: 0 | 1, player: THREE.Vector3 | null, dodging: boolean): void {
    let fired = 0;
    for (const u of this.units) {
      if (u.team !== team || !u.alive || u.fleeing || u.role === "melee" || u.role === "cannon") continue;
      if (u.shots >= MAX_SHOTS[u.role]) continue;
      const foe = this.nearestFoe(u, player);
      if (!foe || foe.d > RANGE[u.role] || foe.d < 5) continue;
      const p = this.pos(u);
      const from = this.tmp2.copy(p).setY(p.y + 1.5);
      u.shots++;
      fired++;
      if (u.role === "musket") {
        const dir = new THREE.Vector3().copy(foe.pos).setY(foe.pos.y + CHEST).sub(from).normalize();
        dir.x += (Math.random() - 0.5) * 0.06;
        dir.y += (Math.random() - 0.5) * 0.03;
        this.fire(from.clone(), dir.normalize(), team, 0.55, player, dodging);
        playSfx("musket", player ? player.distanceTo(p) : 20);
        if (u.shots >= MAX_SHOTS.musket) u.role = "melee";
      } else {
        const target = foe.pos.clone();
        target.y += CHEST;
        this.throwMissile(from.clone(), target, u.missile, team, u.role === "archer" ? 3 : 1.5);
        if (u.role === "javelin" && u.shots >= MAX_SHOTS.javelin) u.role = "melee";
      }
    }
    if (fired && player) {
      playSfx("bow", 10);
      if (team === 1 && (!this.said.has("volley") || Math.random() < 0.35)) {
        this.said.add("volley");
        this.hooks.callout("volley");
      }
    }
  }

  private fireCannons(player: THREE.Vector3 | null): void {
    for (const u of this.units) {
      if (u.role !== "cannon" || !u.alive) continue;
      const foes = this.units.filter((o) => o.team !== u.team && o.alive && !o.fleeing && o.c);
      if (!foes.length) continue;
      const target = this.pos(foes[Math.floor(Math.random() * foes.length)]).clone();
      const p = this.pos(u);
      const muzzleAt = p.clone().setY(p.y + 0.9);
      const dir = target.clone().sub(p).setY(0).normalize();
      muzzleAt.addScaledVector(dir, 1.1);
      this.muzzle(muzzleAt, dir, true);
      this.throwMissile(muzzleAt, target, "ball", u.team, 4);
      playSfx("cannon", player ? player.distanceTo(p) : 20);
      this.hooks.shake(player ? Math.max(0, 0.6 - player.distanceTo(p) * 0.02) : 0);
      if (!this.said.has("cannon")) {
        this.said.add("cannon");
        this.hooks.callout("cannon");
      }
    }
  }

  private explode(at: THREE.Vector3, team: 0 | 1, player: THREE.Vector3 | null): void {
    this.dirt.emit(at, 70, new THREE.Vector3(0, 7, 0), 4, [0.8, 1.6], [0.2, 0.6]);
    this.smoke.emit(at.clone().setY(at.y + 0.5), 30, new THREE.Vector3(0, 1.5, 0), 1.5, [3, 6], [1.5, 3]);
    this.flash.emit(at, 25, new THREE.Vector3(0, 3, 0), 4, [0.1, 0.25], [0.8, 1.6]);
    playSfx("explosion", player ? player.distanceTo(at) : 20);
    if (player) this.hooks.shake(Math.max(0, 1 - player.distanceTo(at) / 25));
    for (const o of this.units) {
      if (o.team === team || !o.alive || !o.c) continue;
      const d = this.pos(o).distanceTo(at);
      if (d < 3) this.damage(o, 120 * (1 - d / 3) + 20, at);
    }
    if (team === 1 && player && player.distanceTo(at) < 3) this.hooks.playerHit(40, at);
  }

  update(dt: number, player: THREE.Vector3 | null, dodging: boolean): void {
    if (this.done) return;
    this.elapsed += dt;
    this.dodging = dodging;
    this.flashLight.intensity *= Math.exp(-dt * 25);
    for (const team of [0, 1] as const) {
      this.volleyTimer[team] -= dt;
      if (this.volleyTimer[team] <= 0) {
        this.volleyTimer[team] = RELOAD.archer + Math.random() * 2;
        this.volley(team, player, dodging);
      }
    }
    if (Math.floor(this.elapsed / RELOAD.cannon) !== Math.floor((this.elapsed - dt) / RELOAD.cannon) && this.elapsed > 3) this.fireCannons(player);

    const enemyMarch = this.elapsed > 1.2;
    const allyMarch = this.tactic === "charge" ? this.elapsed > 2 : this.tactic === "flank" ? this.elapsed > 3 : false;
    for (const u of this.units) this.think(u, dt, player, u.team === 1 ? enemyMarch : allyMarch);
    this.separate();
    this.updateProjectiles(dt, player, dodging);
    for (const pool of this.pools) if (pool.scale.x < 1.4) pool.scale.setScalar(Math.min(1.4, pool.scale.x + dt * 0.25));
    this.blood.update(dt);
    this.smoke.update(dt, 0.6);
    this.flash.update(dt);
    this.dirt.update(dt);
    this.morale();
  }

  private think(u: Unit, dt: number, player: THREE.Vector3 | null, marching: boolean): void {
    if (!u.c) return;
    const c = u.c;
    const p = c.root.position;
    if (!u.alive) {
      if (u.fall > 0 && u.fall < 1) {
        u.fall = Math.min(1, u.fall + dt * 1.6);
        const k = u.fall * u.fall;
        c.root.rotation.x = u.fallDir * -k * (Math.PI / 2 - 0.05);
        p.y = terrainHeight(p.x, p.z) + 0.05 * k;
        c.update(dt * (1 - u.fall));
      }
      return;
    }
    if (u.fleeing) {
      const away = u.team === 1 ? 1 : -1;
      this.moveTo(u, this.tmp.set(p.x + (Math.random() - 0.5), 0, p.z + away * 10), dt, u.speed * 1.2);
      if (p.z > BOUNDS.zMax - 1 || p.z < BOUNDS.zMin + 1) {
        u.alive = false;
        c.root.visible = false;
      }
      c.update(dt);
      return;
    }
    const foe = this.nearestFoe(u, player);
    u.swing -= dt;
    if (!foe) {
      c.play("Idle");
      c.update(dt);
      return;
    }
    const face = Math.atan2(foe.pos.x - p.x, foe.pos.z - p.z);
    if (u.team === 0 && this.tactic === "hold") {
      this.moveTo(u, u.slot, dt, 1.2);
      if (p.distanceTo(u.slot) < 0.4) {
        this.turn(c.root, 0, dt, 3);
        c.play("Idle");
      }
      c.update(dt);
      return;
    }
    const ranged = u.role !== "melee";
    if (foe.d < MELEE_REACH + 0.2 || (!ranged && foe.d < 2.2)) {
      if (!this.said.has("charge") && u.team === 1) {
        this.said.add("charge");
        this.hooks.callout("charge");
      }
      this.engaged = true;
      this.turn(c.root, face, dt, 8);
      if (foe.d > MELEE_REACH) this.moveTo(u, foe.pos, dt, 1.6);
      else c.play("Idle");
      if (u.swing <= 0 && foe.d < MELEE_REACH + 0.25) {
        u.swing = RELOAD.melee * (0.8 + Math.random() * 0.6);
        c.attack = 0.35;
        const hit = Math.random() < 0.5;
        const from = p.clone();
        window.setTimeout(() => {
          if (!u.alive) return;
          if (foe.unit) {
            if (!foe.unit.alive) return;
            if (hit) {
              playSfx("hit", player ? player.distanceTo(from) : 10);
              this.damage(foe.unit, 18 + Math.random() * 20, from);
            } else playSfx("clash", player ? player.distanceTo(from) : 10);
          } else if (player && player.distanceTo(from) < MELEE_REACH + 0.6) {
            if (hit && !this.dodging) this.hooks.playerHit(5 + Math.random() * 4, from);
            else playSfx("clash", 1);
          }
        }, 170);
      }
    } else if (ranged && foe.d < RANGE[u.role] && u.shots < MAX_SHOTS[u.role]) {
      this.turn(c.root, face, dt, 4);
      c.play("Idle");
    } else if (marching || foe.d < 10) {
      const target = this.tmp.copy(foe.pos);
      if (u.team === 0 && this.tactic === "flank" && foe.d > 8) target.x = Math.min(BOUNDS.x - 4, foe.pos.x + 12);
      this.moveTo(u, target, dt, foe.d > 12 ? u.speed : Math.min(u.speed, 3));
    } else {
      this.moveTo(u, u.slot, dt, 1.4);
      if (p.distanceTo(u.slot) < 0.4) {
        this.turn(c.root, face, dt, 3);
        c.play("Idle");
      }
    }
    c.update(dt);
  }

  private turn(obj: THREE.Object3D, target: number, dt: number, rate: number): void {
    const diff = Math.atan2(Math.sin(target - obj.rotation.y), Math.cos(target - obj.rotation.y));
    obj.rotation.y += diff * Math.min(1, dt * rate);
  }

  private moveTo(u: Unit, target: THREE.Vector3, dt: number, speed: number): void {
    const c = u.c!;
    const p = c.root.position;
    const to = this.tmp2.subVectors(target, p).setY(0);
    const d = to.length();
    if (d < 0.05) return;
    to.divideScalar(d);
    const step = Math.min(d, speed * dt);
    p.addScaledVector(to, step);
    p.x = THREE.MathUtils.clamp(p.x, -BOUNDS.x, BOUNDS.x);
    p.z = THREE.MathUtils.clamp(p.z, BOUNDS.zMin, BOUNDS.zMax);
    p.y = terrainHeight(p.x, p.z);
    this.turn(c.root, Math.atan2(to.x, to.z), dt, 8);
    const clip = speed > 2.2 ? "Run" : "Walk";
    c.play(clip, Math.min(2, speed / CLIP_SPEED[clip]));
  }

  private separate(): void {
    const live = this.units.filter((u) => u.alive && u.c);
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = this.pos(live[i]);
        const b = this.pos(live[j]);
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        const min = 0.75;
        if (d2 > min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / 2 / d;
        a.x -= dx * push;
        a.z -= dz * push;
        b.x += dx * push;
        b.z += dz * push;
      }
    }
  }

  /** Blocks the player from walking through living soldiers. */
  collide(p: THREE.Vector3): void {
    for (const u of this.units) {
      if (!u.alive || !u.c) continue;
      const to = this.tmp.subVectors(p, this.pos(u)).setY(0);
      const d = to.length();
      if (d < 0.7 && d > 1e-4) p.addScaledVector(to.divideScalar(d), 0.7 - d);
    }
  }

  private updateProjectiles(dt: number, player: THREE.Vector3 | null, dodging: boolean): void {
    for (const pr of this.projectiles) {
      if (pr.stuck) {
        pr.life -= dt;
        continue;
      }
      pr.vel.y -= GRAVITY * dt;
      pr.mesh.position.addScaledVector(pr.vel, dt);
      pr.mesh.lookAt(this.tmp.copy(pr.mesh.position).add(pr.vel));
      const m = pr.mesh.position;
      const ground = terrainHeight(m.x, m.z);
      const lethal = pr.kind === "javelin" ? 45 : pr.kind === "ball" ? 0 : 35;
      if (pr.kind !== "ball") {
        for (const o of this.units) {
          if (o.team === pr.team || !o.alive || !o.c) continue;
          const q = this.pos(o);
          if (Math.abs(m.x - q.x) < 0.35 && Math.abs(m.z - q.z) < 0.35 && m.y > q.y + 0.3 && m.y < q.y + 1.8) {
            if (Math.random() < 0.7) {
              this.damage(o, lethal + Math.random() * 30, m.clone().sub(pr.vel), Boolean(pr.byPlayer));
              if (pr.byPlayer) this.hooks.onPlayerStrikeHit?.(q, lethal);
              pr.mesh.visible = false;
            } else playSfx("clash", player ? player.distanceTo(m) : 10);
            pr.stuck = true;
            pr.life = 0;
            break;
          }
        }
        if (!pr.stuck && pr.team === 1 && player && !dodging) {
          if (Math.abs(m.x - player.x) < 0.4 && Math.abs(m.z - player.z) < 0.4 && m.y > player.y + 0.3 && m.y < player.y + 1.8) {
            this.hooks.playerHit(pr.kind === "javelin" ? 28 : 18, m.clone().sub(pr.vel));
            pr.stuck = true;
            pr.life = 0;
            pr.mesh.visible = false;
          }
        }
      }
      if (!pr.stuck && m.y <= ground) {
        m.y = ground;
        pr.stuck = true;
        if (pr.kind === "ball") {
          this.explode(m.clone(), pr.team, player);
          pr.life = 0;
          pr.mesh.visible = false;
        } else {
          this.dirt.emit(m, 4, new THREE.Vector3(0, 1.5, 0), 0.6, [0.3, 0.6], [0.05, 0.12]);
          pr.mesh.position.addScaledVector(pr.vel.clone().normalize(), 0.15);
        }
      }
    }
    const keep: Projectile[] = [];
    for (const pr of this.projectiles) {
      if (pr.life > 0) keep.push(pr);
      else this.group.remove(pr.mesh);
    }
    this.projectiles = keep;
  }

  private morale(): void {
    const [a, e] = [this.alive(0), this.alive(1)];
    const [a0, e0] = this.initial;
    if (!this.said.has("winning") && e <= e0 * 0.5) {
      this.said.add("winning");
      this.hooks.callout("winning");
    }
    if (!this.said.has("losing") && a0 && a / a0 < 0.6 && a / a0 < e / e0) {
      this.said.add("losing");
      this.hooks.callout("losing");
    }
    if (e0 > 0 && e === 0) {
      if (!this.said.has("rout")) {
        this.said.add("rout");
        this.hooks.callout("rout");
      }
      this.finish(true);
    }
  }

  /** Ends the skirmish as soon as the player has done their part. */
  victory(): void {
    this.finish(true);
  }

  private finish(victory: boolean): void {
    if (this.done) return;
    this.done = true;
    this.hooks.finished(victory);
  }

  dispose(): void {
    this.done = true;
    this.scene.remove(this.group);
  }
}
