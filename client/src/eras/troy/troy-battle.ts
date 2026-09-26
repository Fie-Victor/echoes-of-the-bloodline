import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Character, dressAsHoplite, makeAspis, makeSpear } from "../../characters.ts";
import { terrainHeight } from "../../environment.ts";
import type { GamificationManager } from "../../gamification.ts";
import { playClashSound, playDodgeSound, playHitSound, playWarDrum, playWarHorn } from "./troy-audio.ts";

export interface TrojanEnemy {
  character: Character;
  hp: number;
  maxHp: number;
  alive: boolean;
  state: "march" | "attack" | "cooldown" | "hurt" | "dead";
  stateTimer: number;
  attackTelegraph: THREE.Mesh;
  targetPos: THREE.Vector3;
}

export interface BattleState {
  active: boolean;
  wave: number;
  totalKilled: number;
  enemies: TrojanEnemy[];
  achillesObjective: THREE.Vector3;
  drumTimer: number;
}

export class TroyBattleManager {
  state: BattleState = {
    active: false,
    wave: 1,
    totalKilled: 0,
    enemies: [],
    achillesObjective: new THREE.Vector3(10, 0, 18),
    drumTimer: 0,
  };

  private battleSparks: THREE.Points;
  private sparkPositions: Float32Array;
  private sparkVelocities: Float32Array;
  private sparkLifetimes: Float32Array;
  private activeSparks = 0;

  constructor(
    private scene: THREE.Scene,
    private soldierGltf: GLTF,
    private soldierSkin: Record<"body" | "head", THREE.MeshStandardMaterial>,
    private aspisTexture: THREE.Texture,
  ) {
    // Battle hit sparks particle system
    const MAX_SPARKS = 200;
    const geo = new THREE.BufferGeometry();
    this.sparkPositions = new Float32Array(MAX_SPARKS * 3);
    this.sparkVelocities = new Float32Array(MAX_SPARKS * 3);
    this.sparkLifetimes = new Float32Array(MAX_SPARKS);
    geo.setAttribute("position", new THREE.BufferAttribute(this.sparkPositions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffaa33,
      size: 0.15,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.battleSparks = new THREE.Points(geo, mat);
    this.scene.add(this.battleSparks);
  }

  startBattle(
    achillesPos: THREE.Vector3,
    onGuidance: (text: string, urgent: boolean, soundLine?: string) => void,
    gamification?: GamificationManager,
  ): void {
    if (this.state.active) return;
    this.state.active = true;
    this.state.wave = 1;
    this.state.totalKilled = 0;
    this.state.achillesObjective.set(8, terrainHeight(8, 16), 16);

    playWarHorn();
    playWarDrum(0.6);

    gamification?.registerWarTriggered();

    // Initial alert
    onGuidance(
      "⚔️ GUERRE DE TROIE ! Suis Achille au combat et couvre ses arrières !",
      true,
      "Agent ! Les Troyens chargent ! Suis Achille et sors ta lance !",
    );

    // Spawn first wave of Trojan warriors advancing from the plain
    this.spawnWave(3);
  }

  spawnWave(count: number): void {
    for (let i = 0; i < count; i++) {
      const char = new Character(this.soldierGltf, this.soldierSkin);
      dressAsHoplite(char);

      // Give Trojan shield and spear
      const fore = char.bone("L_Forearm").getWorldPosition(new THREE.Vector3());
      const lhand = char.bone("L_Hand").getWorldPosition(new THREE.Vector3());
      const shield = makeAspis(this.aspisTexture);
      shield.position.lerpVectors(fore, lhand, 0.5).add(new THREE.Vector3(0.16, -0.05, 0.06));
      shield.rotation.set(0, 0.35, 0);
      char.attachTo("L_Forearm", shield);

      const rhand = char.bone("R_Hand").getWorldPosition(new THREE.Vector3());
      const spear = makeSpear(0xd43828, false);
      spear.position.set(rhand.x, rhand.y + 0.25, rhand.z + 0.03);
      spear.rotation.x = 0.12;
      char.attachTo("R_Hand", spear);

      // Spawn position on the plain
      const spawnX = -6 + i * 7 + (Math.random() - 0.5) * 4;
      const spawnZ = 20 + Math.random() * 5;
      const spawnY = terrainHeight(spawnX, spawnZ);
      char.root.position.set(spawnX, spawnY, spawnZ);
      this.scene.add(char.root);

      // Attack telegraph ring
      const ringGeo = new THREE.RingGeometry(0.7, 0.85, 32);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xff2211,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const telegraph = new THREE.Mesh(ringGeo, ringMat);
      telegraph.position.y = 0.05;
      char.root.add(telegraph);

      this.state.enemies.push({
        character: char,
        hp: 3,
        maxHp: 3,
        alive: true,
        state: "march",
        stateTimer: Math.random() * 2,
        attackTelegraph: telegraph,
        targetPos: new THREE.Vector3(),
      });
    }
  }

  triggerSpark(pos: THREE.Vector3): void {
    const idx = (this.activeSparks % 50) * 4;
    for (let i = 0; i < 4; i++) {
      const p = (idx + i) * 3;
      this.sparkPositions[p] = pos.x;
      this.sparkPositions[p + 1] = pos.y + 1.2;
      this.sparkPositions[p + 2] = pos.z;
      this.sparkVelocities[p] = (Math.random() - 0.5) * 6;
      this.sparkVelocities[p + 1] = Math.random() * 5 + 2;
      this.sparkVelocities[p + 2] = (Math.random() - 0.5) * 6;
      this.sparkLifetimes[idx + i] = 0.45;
    }
    this.activeSparks += 4;
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    playerAttacking: boolean,
    playerDodging: boolean,
    achilles: Character,
    onGuidance: (text: string, urgent: boolean, soundLine?: string) => void,
    gamification?: GamificationManager,
  ): void {
    if (!this.state.active) return;

    // Atmospheric war drum loop
    this.state.drumTimer += dt;
    if (this.state.drumTimer > 2.2) {
      this.state.drumTimer = 0;
      playWarDrum(0.35);
    }

    // Achilles behavior in battle:
    // Move towards frontline objective or nearest living Trojan
    const ach = achilles.root;
    let nearestEnemy: TrojanEnemy | null = null;
    let nearestDist = 999;
    for (const e of this.state.enemies) {
      if (!e.alive) continue;
      const d = ach.position.distanceTo(e.character.root.position);
      if (d < nearestDist) {
        nearestDist = d;
        nearestEnemy = e;
      }
    }

    if (nearestEnemy && nearestDist < 25) {
      // Move towards enemy and attack
      const target = nearestEnemy.character.root.position;
      const dir = new THREE.Vector3().subVectors(target, ach.position).setY(0);
      if (dir.length() > 2.0) {
        dir.normalize();
        ach.position.addScaledVector(dir, 4.5 * dt);
        ach.position.y = terrainHeight(ach.position.x, ach.position.z);
        ach.rotation.y = Math.atan2(dir.x, dir.z);
        achilles.play("Run", 1.4);
      } else {
        // In range, Achilles attacks!
        ach.rotation.y = Math.atan2(dir.x, dir.z);
        if (achilles.attack <= 0) {
          achilles.attack = 0.4;
          playClashSound();
          this.triggerSpark(nearestEnemy.character.root.position);
          nearestEnemy.hp--;
          if (nearestEnemy.hp <= 0) {
            this.killEnemy(nearestEnemy, onGuidance);
          }
        }
      }
    } else {
      // March to defensive waypoint
      const toObj = new THREE.Vector3().subVectors(this.state.achillesObjective, ach.position).setY(0);
      if (toObj.length() > 1.0) {
        toObj.normalize();
        ach.position.addScaledVector(toObj, 3.5 * dt);
        ach.position.y = terrainHeight(ach.position.x, ach.position.z);
        ach.rotation.y = Math.atan2(toObj.x, toObj.z);
        achilles.play("Run", 1.2);
      } else {
        achilles.play("Idle");
      }
    }

    // Update each enemy
    let pendingWarning = false;
    for (const enemy of this.state.enemies) {
      if (!enemy.alive) continue;

      const eChar = enemy.character;
      const ePos = eChar.root.position;

      // Target: whichever is closer, player or Achilles
      const dPlayer = ePos.distanceTo(playerPos);
      const dAchilles = ePos.distanceTo(ach.position);
      const targetPos = dPlayer < dAchilles + 2 ? playerPos : ach.position;
      const targetDist = Math.min(dPlayer, dAchilles);

      // Facing
      const toTgt = new THREE.Vector3().subVectors(targetPos, ePos).setY(0);
      if (toTgt.lengthSq() > 0.01) {
        eChar.root.rotation.y = THREE.MathUtils.lerp(eChar.root.rotation.y, Math.atan2(toTgt.x, toTgt.z), dt * 6);
      }

      // Check player attack hit on enemy
      if (playerAttacking && dPlayer < 2.8) {
        enemy.hp--;
        playHitSound();
        playClashSound();
        this.triggerSpark(ePos);
        enemy.state = "hurt";
        enemy.stateTimer = 0.4;
        gamification?.registerAttackHit();
        if (enemy.hp <= 0) {
          this.killEnemy(enemy, onGuidance, gamification);
          continue;
        }
      }

      // Enemy state machine
      enemy.stateTimer += dt;
      const ringMat = enemy.attackTelegraph.material as THREE.MeshBasicMaterial;

      if (enemy.state === "march") {
        ringMat.opacity = 0;
        if (targetDist > 2.2) {
          const m = toTgt.clone().normalize();
          ePos.addScaledVector(m, 2.8 * dt);
          ePos.y = terrainHeight(ePos.x, ePos.z);
          eChar.play("Walk", 1.3);
        } else {
          // Wind up attack
          enemy.state = "attack";
          enemy.stateTimer = 0;
        }
      } else if (enemy.state === "attack") {
        // Telegraph attack!
        const chargeRatio = Math.min(1, enemy.stateTimer / 0.8);
        ringMat.opacity = chargeRatio * 0.9;
        eChar.play("Angry");

        // Astra dynamic warnings if targeting player!
        if (targetPos === playerPos && !pendingWarning) {
          pendingWarning = true;
          // Check if behind player
          const playerFwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), achilles.root.rotation.y);
          const toEnemy = new THREE.Vector3().subVectors(ePos, playerPos).normalize();
          const behind = playerFwd.dot(toEnemy) < -0.2;

          if (behind) {
            onGuidance("⚠️ ATTENTION : ENNEMI DANS TON DOS ! ESQUIVE [ESPACE] !", true);
          } else {
            onGuidance("⚠️ ATTENTION : LANCE IMMINENTE ! ESQUIVE [ESPACE] !", true);
          }
        }

        if (enemy.stateTimer >= 0.8) {
          // Strike!
          eChar.attack = 0.35;
          ringMat.opacity = 0;
          if (targetPos === playerPos) {
            if (playerDodging) {
              playDodgeSound();
              onGuidance("✨ BELLE ESQUIVE ! Contre-attaque maintenant !", false);
              gamification?.registerDodge();
            } else if (dPlayer < 2.5) {
              playHitSound();
              gamification?.takeDamage(25, "Coup de lance troyen");
              // Screen impact flash
              document.body.style.filter = "invert(0.2) drop-shadow(0 0 10px red)";
              setTimeout(() => (document.body.style.filter = ""), 150);
            }
          }
          enemy.state = "cooldown";
          enemy.stateTimer = 0;
        }
      } else if (enemy.state === "cooldown") {
        ringMat.opacity = 0;
        eChar.play("Idle");
        if (enemy.stateTimer > 0.9) {
          enemy.state = "march";
          enemy.stateTimer = 0;
        }
      } else if (enemy.state === "hurt") {
        ringMat.opacity = 0;
        eChar.play("Deny");
        if (enemy.stateTimer > 0.4) {
          enemy.state = "march";
          enemy.stateTimer = 0;
        }
      }

      eChar.update(dt);
    }

    // Update sparks
    const posAttr = this.battleSparks.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < 200; i++) {
      if (this.sparkLifetimes[i] > 0) {
        this.sparkLifetimes[i] -= dt;
        const p = i * 3;
        this.sparkPositions[p] += this.sparkVelocities[p] * dt;
        this.sparkPositions[p + 1] += this.sparkVelocities[p + 1] * dt;
        this.sparkPositions[p + 2] += this.sparkVelocities[p + 2] * dt;
        this.sparkVelocities[p + 1] -= 9.8 * dt; // gravity
      }
    }
    posAttr.needsUpdate = true;

    // Check if wave cleared
    const living = this.state.enemies.filter((e) => e.alive).length;
    if (living === 0 && this.state.wave === 1) {
      this.state.wave = 2;
      gamification?.addPoints(400, "1ère Vague Repoussée !", { color: "gold" });
      gamification?.addStability(15);
      onGuidance("⚔️ Deuxième vague en approche ! Tiens la ligne avec Achille !", true);
      playWarHorn();
      this.spawnWave(4);
    } else if (living === 0 && this.state.wave === 2) {
      this.state.wave = 3;
      this.state.active = false;
      gamification?.addPoints(800, "Victoire de Troie !", { color: "gold" });
      gamification?.addStability(30);
      onGuidance(
        "🏆 VICTOIRE ! Les Troyens battent en retraite ! Achille te salue en héros !",
        true,
        "Les Troyens reculent ! Agent, tu as sauvé les navires grecs !",
      );
      achilles.play("Friendly");
    }
  }

  resetBattle(): void {
    for (const enemy of this.state.enemies) {
      this.scene.remove(enemy.character.root);
    }
    this.state.enemies = [];
    this.state.active = false;
    this.state.wave = 1;
    this.state.totalKilled = 0;
  }

  private killEnemy(
    e: TrojanEnemy,
    onGuidance: (text: string, urgent: boolean, soundLine?: string) => void,
    gamification?: GamificationManager,
  ): void {
    e.alive = false;
    e.state = "dead";
    e.attackTelegraph.visible = false;
    e.character.play("Deny");
    this.state.totalKilled++;
    gamification?.registerKill("Guerrier troyen");

    // Knockdown animation
    const rot = e.character.root.rotation;
    rot.x = -Math.PI / 2.3;
    e.character.root.position.y -= 0.6;

    if (Math.random() < 0.5) {
      onGuidance("Ennemi terrassé ! Continue l'offensive !", false);
    }
  }
}
