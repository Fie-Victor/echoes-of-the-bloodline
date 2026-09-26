import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import { VignetteShader } from "three/examples/jsm/shaders/VignetteShader.js";
import { ERA_ORDER, type EraId, isEraId, nextEra } from "../../shared/eras.ts";
import type { NpcResponse, NpcState, ServerMessage } from "../../shared/protocol.ts";
import { loadGltf, loadTexture, manager } from "./assets.ts";
import { Battle, type Callout, type Missile } from "./battle.ts";
import { CLIP_SPEED, Character, dressAsAgent, dressAsHoplite, loadHumanSkin, makeAspis, makeSpear } from "./characters.ts";
import { Drone } from "./drone.ts";
import { CLIFF_EDGE_Z, buildWorld, terrainHeight } from "./environment.ts";
import { type AstraBeat, ERAS, type Squad, type Tactic } from "./eras.ts";
import { GameSocket } from "./net.ts";
import { type OutfitId, dressKit } from "./outfits.ts";
import { hasUniform, paintUniform } from "./uniforms.ts";
import { playSfx } from "./sfx.ts";
import { Microphone, VoicePlayer, audioListener, resumeAudio, speakLocal } from "./voice.ts";

const THINKING_FALLBACK_MS = 2000;
const TALK_RANGE = 3.5;
const WAR_TRUST = 70;
const WAR_EXCHANGES = 6;
const PLAYER_HP = 100;

const eraParam = new URLSearchParams(location.search).get("era");
const eraId: EraId = isEraId(eraParam) ? eraParam : "troy";
const era = ERAS[eraId];
const LEADER = era.leader.id;
const NPC_NAMES: Record<string, string> = { [LEADER]: era.leader.name, astra: "Astra" };
/** Ranged attack on right click: kind, reload (s) and ammunition. */
const PLAYER_RANGED: Partial<Record<EraId, { kind: Missile | "musket"; reload: number; ammo: number; label: string }>> = {
  alesia: { kind: "javelin", reload: 1.5, ammo: 2, label: "pilum" },
  austerlitz: { kind: "musket", reload: 5, ammo: 12, label: "Charleville" },
};
const STATE_LABELS: Record<NpcState, string> = { idle: "Neutre", friendly: "Amical", suspicious: "Méfiant", angry: "Hostile" };
const STATE_COLORS: Record<NpcState, number> = { idle: 0xd9b36c, friendly: 0x4fdc7a, suspicious: 0xf0a020, angry: 0xff3322 };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ui = {
  splash: $("splash"),
  loaderBar: $("loader-bar"),
  loaderText: $("loader-text"),
  start: $<HTMLButtonElement>("start"),
  objective: $("objective"),
  stats: $("stats"),
  prompt: $("prompt"),
  bubble: $("bubble"),
  chat: $("chat"),
  chatTitle: $("chat-title"),
  chatLog: $("chat-log"),
  chatForm: $<HTMLFormElement>("chat-form"),
  chatInput: $<HTMLInputElement>("chat-input"),
  mic: $<HTMLButtonElement>("mic"),
  subtitle: $("subtitle"),
  hologram: $("hologram"),
  hologramFrame: $<HTMLIFrameElement>("hologram-frame"),
  title: $("title"),
  splashSub: $("splash-sub"),
  eras: $("eras"),
  comms: $("comms"),
  commsText: $("comms-text"),
  commsChoices: $("comms-choices"),
  battleHud: $("battle-hud"),
  allyBar: $("ally-bar"),
  enemyBar: $("enemy-bar"),
  allyLabel: $("ally-label"),
  enemyLabel: $("enemy-label"),
  hpBar: $("hp-bar"),
  ammo: $("ammo"),
  hurt: $("hurt"),
};

ui.title.textContent = `ÉCHOS DE LA LIGNÉE — ${era.title}`;
ui.splashSub.textContent = era.chapter;
ui.objective.textContent = era.objectives.meet;
for (const id of ERA_ORDER) {
  const a = document.createElement("a");
  a.href = `?era=${id}`;
  a.textContent = ERAS[id].chapter.replace(/^Chronique [IVX]+ — /, "");
  a.classList.toggle("current", id === eraId);
  ui.eras.append(a);
}

manager.onProgress = (_url, loaded, total) => {
  ui.loaderBar.style.width = `${(loaded / total) * 100}%`;
};

// ---- Renderer & post-processing ----
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1500);
camera.add(audioListener);
scene.add(camera);

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType }));
composer.setPixelRatio(renderer.getPixelRatio());
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.5, 0.9);
composer.addPass(bloom);
// Bright daylight scenes (snow, whitewashed walls) would otherwise bloom into a white haze.
if (eraId !== "troy") bloom.threshold = 1.15;
const vignette = new ShaderPass(VignetteShader);
vignette.uniforms.offset.value = 0.95;
vignette.uniforms.darkness.value = 1.25;
composer.addPass(vignette);
composer.addPass(new OutputPass());
const fxaa = new ShaderPass(FXAAShader);
composer.addPass(fxaa);
function syncFxaa(): void {
  const r = renderer.getPixelRatio();
  fxaa.material.uniforms.resolution.value.set(1 / (innerWidth * r), 1 / (innerHeight * r));
}
syncFxaa();

// ---- Game state ----
type Phase = "intro" | "meet" | "prebattle" | "battle" | "after";
const game = {
  era: eraId,
  inventory: ["lettre_secrete_1"],
  trust: { [LEADER]: 45 } as Record<string, number>,
  leaderState: "idle" as NpcState,
  talkingTo: null as string | null,
  pendingTimer: undefined as number | undefined,
  thinking: false,
  phase: "intro" as Phase,
  exchanges: 0,
  tactic: "hold" as Tactic,
  hp: PLAYER_HP,
  ammo: PLAYER_RANGED[eraId]?.ammo ?? 0,
  reload: 0,
  warnedHp: false,
};

function refreshStats(): void {
  ui.stats.textContent = `${era.leader.name} — confiance ${game.trust[LEADER]}/100 · ${STATE_LABELS[game.leaderState]}`;
}
refreshStats();

async function init() {
  const troy = eraId === "troy";
  const [world, agentGltf, achillesGltf, agentSkin, achillesSkin, aspisFace, camoSkin] = await Promise.all([
    buildWorld(scene, renderer, eraId, era.palette),
    loadGltf("/assets/humans/agent.glb"),
    loadGltf("/assets/humans/achilles.glb"),
    loadHumanSkin("sm024", { body: "greek", head: "greek" }),
    loadHumanSkin("m021", { body: "hero" }),
    loadTexture("/assets/humans/aspis.jpg", true),
    loadHumanSkin("sm024"),
  ]);

  // Period clothing is painted onto the sm024 body; head textures alternate for a bit of variety.
  const uniformSkins = new Map<string, Record<"body" | "head", THREE.MeshStandardMaterial>>();
  const uniformSkin = (outfit: OutfitId, team: number, variant: number) => {
    const key = `${outfit}:${team}:${variant}`;
    let s = uniformSkins.get(key);
    if (!s) {
      const map = hasUniform(outfit) ? paintUniform(outfit, team, camoSkin.body.map!, agentSkin.body.map!) : agentSkin.body.map;
      s = {
        body: new THREE.MeshStandardMaterial({ map, normalMap: camoSkin.body.normalMap, roughness: 0.85 }),
        head: variant ? camoSkin.head : agentSkin.head,
      };
      uniformSkins.set(key, s);
    }
    return s;
  };

  const player = new Character(agentGltf, troy ? agentSkin : uniformSkin(era.player.outfit, era.allies?.team ?? 0, 0));
  if (troy) {
    dressAsAgent(player, 0x33d6ff);
    const hand = player.bone("R_Hand").getWorldPosition(new THREE.Vector3());
    const spear = makeSpear(0x33d6ff, false);
    spear.position.set(hand.x, hand.y + 0.25, hand.z + 0.03);
    spear.rotation.x = 0.12;
    player.attachTo("R_Hand", spear);
  } else dressKit(player, era.player.outfit, { weapon: era.player.weapon, team: era.allies?.team });
  player.root.position.set(2, terrainHeight(2, 1), 1);
  player.root.rotation.y = Math.PI;
  scene.add(player.root);

  const achilles = troy ? new Character(achillesGltf, achillesSkin) : new Character(agentGltf, uniformSkin(era.leader.outfit, era.allies?.team ?? 0, 1));
  if (troy) {
    dressAsHoplite(achilles);
    const fore = achilles.bone("L_Forearm").getWorldPosition(new THREE.Vector3());
    const lhand = achilles.bone("L_Hand").getWorldPosition(new THREE.Vector3());
    const shield = makeAspis(aspisFace);
    shield.position.lerpVectors(fore, lhand, 0.5).add(new THREE.Vector3(0.16, -0.05, 0.06));
    shield.rotation.set(0, 0.35, 0);
    achilles.attachTo("L_Forearm", shield);
    const rhand = achilles.bone("R_Hand").getWorldPosition(new THREE.Vector3());
    const achillesSpear = makeSpear(0xffa040, false);
    achillesSpear.position.set(rhand.x, rhand.y + 0.25, rhand.z + 0.03);
    achillesSpear.rotation.x = 0.12;
    achilles.attachTo("R_Hand", achillesSpear);
  } else dressKit(achilles, era.leader.outfit, { weapon: era.leader.weapon, team: era.allies?.team });

  let spawned = 0;
  const spawnSoldier = (squad: Squad, team: number): Character => {
    const c = new Character(agentGltf, uniformSkin(squad.outfit, team, spawned++ % 2));
    dressKit(c, squad.outfit, { weapon: squad.weapon, team });
    return c;
  };
  const spot = world.interactables.achillesSpot;
  achilles.root.position.set(spot.x, terrainHeight(spot.x, spot.z), spot.z);
  scene.add(achilles.root);
  const aura = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 0.85, 48),
    new THREE.MeshBasicMaterial({ color: STATE_COLORS.idle, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.05;
  achilles.root.add(aura);

  const astra = new Drone();
  scene.add(astra.root);
  let portal: THREE.Mesh | null = null;

  // ---- Networking ----
  const socket = new GameSocket(onServerMessage);
  const voices = new VoicePlayer();
  voices.register(LEADER, achilles.root, 1.6);
  voices.register("astra", astra.root, 0);
  let subtitleTimer: number | undefined;

  function subtitle(text: string, ms = 0, live = false): void {
    clearTimeout(subtitleTimer);
    ui.subtitle.textContent = text;
    ui.subtitle.classList.toggle("listening", live);
    ui.subtitle.classList.toggle("hidden", !text);
    if (ms) subtitleTimer = window.setTimeout(() => ui.subtitle.classList.add("hidden"), ms);
  }

  function say(npcId: string, text: string): void {
    socket.send({ type: "say", npc_id: npcId, text });
  }

  function interrupt(): void {
    voices.stop();
    socket.send({ type: "stop_speech" });
  }

  function onServerMessage(msg: ServerMessage): void {
    if (msg.type === "npc_reply") handleReply(msg.npc_id, msg.response, msg.source);
    else if (msg.type === "speech_audio") voices.play(msg.npc_id, msg.audio, msg.sample_rate);
    else if (msg.type === "speech_end" && !msg.ok) speakLocal(msg.text, msg.npc_id === "astra" ? "astra" : msg.npc_id === "jeanne_01" ? "woman" : "npc");
    else if (msg.type === "transcript") {
      if (!msg.final) subtitle(`🎙 ${msg.text}`, 0, true);
      else if (msg.text) {
        logLine("player", `Toi : ${msg.text}`);
        subtitle(`Toi : ${msg.text}`, 2500);
      } else subtitle("🎙 (rien entendu)", 1500);
    }
    else if (msg.type === "hologram") showHologram(msg.html);
    else if (msg.type === "error") logLine("sys", `Erreur : ${msg.message}`);
  }

  function handleReply(npcId: string, res: NpcResponse, source: string): void {
    clearTimeout(game.pendingTimer);
    game.thinking = false;
    ui.bubble.classList.add("hidden");
    logLine("npc", `${NPC_NAMES[npcId]} : ${res.dialogue}`, source === "mock" ? "(mock)" : "");
    if (!game.talkingTo) subtitle(`${NPC_NAMES[npcId]} : ${res.dialogue}`, 4000 + res.dialogue.length * 60);
    if (npcId === LEADER) {
      game.trust[LEADER] = res.new_trust;
      game.leaderState = res.npc_state;
      (aura.material as THREE.MeshBasicMaterial).color.setHex(STATE_COLORS[res.npc_state]);
      refreshStats();
      game.exchanges++;
      if (!troy && game.phase === "meet" && (res.new_trust >= WAR_TRUST || game.exchanges >= WAR_EXCHANGES)) {
        window.setTimeout(callToWar, 3500 + res.dialogue.length * 40);
      }
    }
  }

  const gameContext = (npcId: string) => ({
    era: game.era,
    player_inventory: game.inventory,
    npc_trust: game.trust[npcId] ?? 100,
  });

  function talk(npcId: string, text: string): void {
    interrupt();
    logLine("player", `Toi : ${text}`);
    socket.send({ type: "talk", request: { npc_id: npcId, player_input: text, game_context: gameContext(npcId) } });
    armThinking(npcId);
  }

  // Hands-free voice: while a dialogue is open the mic listens and voice activity opens/closes utterances;
  // speaking over an NPC stops its speech (barge-in). V is a push-to-talk override usable anywhere.
  const voiceTarget = () =>
    game.talkingTo ?? (player.root.position.distanceTo(achilles.root.position) < TALK_RANGE * 2 ? LEADER : "astra");
  let voiceNpc = "astra";
  const mic = new Microphone({
    onChunk: (audio) => socket.send({ type: "voice_audio", audio }),
    onSpeechStart: () => {
      interrupt();
      voiceNpc = voiceTarget();
      ui.mic.classList.add("on");
      subtitle("🎙 …", 0, true);
      socket.send({ type: "voice_start", npc_id: voiceNpc, game_context: gameContext(voiceNpc) });
    },
    onSpeechEnd: () => {
      ui.mic.classList.remove("on");
      socket.send({ type: "voice_end" });
      armThinking(voiceNpc);
    },
  });

  async function listen(mode: "vad" | "ptt"): Promise<void> {
    try {
      await mic.listen(mode);
      if (mode === "vad") subtitle(`🎙 ${NPC_NAMES[voiceTarget()]} t'écoute — parle librement`, 3000, true);
    } catch (e) {
      const reason = e instanceof Error ? `${e.name === "Error" ? "" : `${e.name} : `}${e.message}` : String(e);
      subtitle(`Micro indisponible (${reason})`, 6000);
      logLine("sys", `Micro indisponible : ${reason}`);
    }
  }

  function armThinking(npcId: string): void {
    clearTimeout(game.pendingTimer);
    game.pendingTimer = window.setTimeout(() => {
      game.thinking = npcId === LEADER;
      ui.bubble.textContent = npcId === "astra" ? "Calcul en cours…" : "Hmm… laisse-moi réfléchir…";
      ui.bubble.classList.remove("hidden");
    }, THINKING_FALLBACK_MS);
  }

  // ---- Chat UI ----
  function logLine(cls: "player" | "npc" | "sys", text: string, suffix = ""): void {
    const el = document.createElement("div");
    el.className = cls;
    el.textContent = suffix ? `${text} ${suffix}` : text;
    ui.chatLog.append(el);
    ui.chatLog.scrollTop = ui.chatLog.scrollHeight;
  }

  function openChat(npcId: string): void {
    game.talkingTo = npcId;
    ui.chatTitle.textContent = NPC_NAMES[npcId];
    ui.chat.classList.remove("hidden");
    document.exitPointerLock();
    Object.keys(keys).forEach((k) => (keys[k] = false));
    setTimeout(() => ui.chatInput.focus(), 0);
    void listen("vad");
  }

  function closeChat(): void {
    if (!game.talkingTo) return;
    game.talkingTo = null;
    void mic.stop();
    ui.chat.classList.add("hidden");
    ui.chatInput.blur();
    renderer.domElement.requestPointerLock();
  }

  ui.chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = ui.chatInput.value.trim();
    if (!text || !game.talkingTo) return;
    ui.chatInput.value = "";
    talk(game.talkingTo, text);
  });
  ui.chatInput.addEventListener("input", () => voices.isSpeaking(game.talkingTo ?? "") && interrupt());
  ui.mic.addEventListener("click", () => void (mic.listening ? mic.stop() : listen("vad")));
  ui.chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeChat();
    e.stopPropagation();
  });

  // ---- Hologram (Devin UI) ----
  function showHologram(html: string): void {
    ui.hologramFrame.srcdoc = html;
    ui.hologram.classList.remove("hidden");
    ui.objective.textContent = "Ouvrir le verrou temporel.";
  }

  window.addEventListener("message", (e) => {
    if (e.source !== ui.hologramFrame.contentWindow) return;
    const data = e.data as { type?: string; puzzle_id?: string };
    if (data.type !== "puzzle_solved" || !data.puzzle_id) return;
    socket.send({ type: "puzzle_solved", puzzle_id: data.puzzle_id });
    ui.hologram.classList.add("hidden");
    ui.objective.textContent = "Continuum stabilisé — une brèche temporelle s'est ouverte près de la tente.";
    logLine("sys", "Astra : Verrou ouvert. Brèche temporelle détectée. Traverse-la : la prochaine époque nous attend.");
    say("astra", "Verrou ouvert. Brèche temporelle détectée. Traverse-la : la prochaine époque nous attend.");
    openPortal();
  });

  function openPortal(): void {
    if (portal) return;
    const p = world.interactables.portalSpot;
    portal = new THREE.Mesh(
      new THREE.TorusGeometry(1.4, 0.08, 16, 64),
      new THREE.MeshStandardMaterial({ color: 0x66ffff, emissive: 0x33ffff, emissiveIntensity: 6 }),
    );
    portal.position.set(p.x, terrainHeight(p.x, p.z) + 1.7, p.z);
    scene.add(portal);
  }

  function travel(): void {
    const next = nextEra(eraId);
    if (!next) return;
    portal = null;
    ui.splash.classList.remove("fade");
    ui.loaderText.textContent = "Saut temporel…";
    window.setTimeout(() => (location.search = `?era=${next}`), 900);
  }

  // ---- Astra comms: scripted exchanges with player choices ----
  let commsDone: (() => void) | null = null;
  let commsPick: ((i: number) => void) | null = null;

  function astraLine(text: string): void {
    logLine("sys", `Astra : ${text}`);
    subtitle(`Astra : ${text}`, 3000 + text.length * 55);
    say("astra", text);
  }

  function runBeats(beats: AstraBeat[], done: () => void, pick?: (tactic: Tactic) => void): void {
    const [beat, ...rest] = beats;
    if (!beat) {
      ui.comms.classList.add("hidden");
      commsPick = null;
      commsDone = null;
      done();
      return;
    }
    ui.comms.classList.remove("hidden");
    ui.commsText.textContent = beat.text;
    astraLine(beat.text);
    ui.commsChoices.replaceChildren();
    const choices = beat.choices ?? [{ label: "Continuer", reply: "" }];
    const choose = (i: number) => {
      const c = choices[i];
      if (!c) return;
      commsPick = null;
      logLine("player", `Toi : ${c.label}`);
      if (c.tactic && pick) pick(c.tactic);
      if (!c.reply) return runBeats(rest, done, pick);
      ui.commsText.textContent = c.reply;
      astraLine(c.reply);
      ui.commsChoices.replaceChildren(button("Continuer", 1, () => runBeats(rest, done, pick)));
      commsDone = () => runBeats(rest, done, pick);
    };
    choices.forEach((c, i) => ui.commsChoices.append(button(c.label, i + 1, () => choose(i))));
    commsPick = choose;
    commsDone = null;
  }

  function button(label: string, key: number, onClick: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.textContent = `${key}. ${label}`;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  function commsKey(n: number): boolean {
    if (ui.comms.classList.contains("hidden")) return false;
    if (commsPick) commsPick(n - 1);
    else if (commsDone && n === 1) commsDone();
    return true;
  }

  // ---- War ----
  let battle: Battle | null = null;
  let shake = 0;

  function callToWar(): void {
    if (game.phase !== "meet") return;
    game.phase = "prebattle";
    closeChat();
    logLine("npc", `${era.leader.name} : ${era.warCall}`);
    subtitle(`${era.leader.name} : ${era.warCall}`, 5000);
    say(LEADER, era.warCall);
    playSfx(eraId === "sekigahara" ? "drum" : "horn", 30);
    window.setTimeout(() => {
      ui.objective.textContent = era.objectives.battle;
      runBeats([era.briefing], startBattle, (t) => (game.tactic = t));
    }, 4500);
  }

  function startBattle(): void {
    if (!era.allies || !era.enemies) return;
    game.phase = "battle";
    game.hp = PLAYER_HP;
    game.warnedHp = false;
    game.ammo = PLAYER_RANGED[eraId]?.ammo ?? 0;
    battle?.dispose();
    const p = player.root.position;
    p.set(0, 0, 7);
    p.y = terrainHeight(p.x, p.z);
    camYaw = 0;
    battle = new Battle(scene, era.allies, era.enemies, game.tactic, {
      spawn: spawnSoldier,
      callout: (kind: Callout) => {
        const line = era.callouts[kind];
        if (line) astraLine(line);
      },
      playerHit: onPlayerHit,
      shake: (a) => (shake = Math.max(shake, a)),
      finished: (victory) => {
        if (!victory) return;
        game.phase = "after";
        ui.battleHud.classList.add("hidden");
        ui.objective.textContent = era.objectives.after;
        runBeats(era.debrief, () => {
          if (nextEra(eraId)) openPortal();
          else ui.objective.textContent = "Fin de la chronique. Rejoue une époque depuis l'écran titre.";
        });
      },
    });
    ui.allyLabel.textContent = era.allies.name;
    ui.enemyLabel.textContent = era.enemies.name;
    ui.battleHud.classList.remove("hidden");
    if (eraId === "sekigahara") for (let i = 0; i < 8; i++) window.setTimeout(() => playSfx("drum", 25), i * 450);
    else playSfx("horn", 25);
  }

  function onPlayerHit(damage: number, from: THREE.Vector3): void {
    if (game.phase !== "battle") return;
    const k = dodgeTime > 0 ? 0.3 : 1;
    game.hp = Math.max(0, game.hp - damage * k);
    playSfx("hit", 0);
    shake = Math.max(shake, 0.25);
    ui.hurt.style.opacity = String(Math.min(0.9, 0.35 + damage / 60));
    const dir = new THREE.Vector3().subVectors(player.root.position, from).setY(0).normalize();
    player.flinch = 0.3;
    player.root.position.addScaledVector(dir, 0.15);
    if (game.hp < 35 && !game.warnedHp) {
      game.warnedHp = true;
      astraLine(era.callouts.lowHp);
    }
    if (game.hp <= 0) {
      game.phase = "prebattle";
      astraLine("Tu es tombé. Je rembobine le continuum de quelques minutes… Cette fois, reste avec la ligne.");
      ui.splash.classList.remove("fade");
      ui.loaderText.textContent = "Rembobinage temporel…";
      window.setTimeout(() => {
        ui.splash.classList.add("fade");
        startBattle();
      }, 2500);
    }
  }

  function refreshBattleHud(): void {
    if (!battle) return;
    const c = battle.counts();
    ui.allyBar.style.width = `${(c.allies / Math.max(1, c.alliesMax)) * 100}%`;
    ui.enemyBar.style.width = `${(c.enemies / Math.max(1, c.enemiesMax)) * 100}%`;
    ui.hpBar.style.width = `${game.hp}%`;
    const r = PLAYER_RANGED[eraId];
    ui.ammo.textContent = r ? `${r.label} : ${game.ammo}${game.reload > 0 ? " (recharge…)" : ""}` : "";
  }

  function playerRanged(): void {
    const r = PLAYER_RANGED[eraId];
    if (!r || !battle || game.phase !== "battle" || game.reload > 0 || game.ammo <= 0) return;
    game.ammo--;
    game.reload = r.reload;
    const dir = camera.getWorldDirection(new THREE.Vector3());
    const from = player.root.position.clone().setY(player.root.position.y + 1.5).addScaledVector(dir, 0.6);
    player.root.rotation.y = Math.atan2(dir.x, dir.z);
    if (r.kind !== "musket") player.attack = 0.35;
    battle.playerShoot(from, dir, r.kind);
  }

  // ---- Input ----
  const keys: Record<string, boolean> = {};
  let camYaw = Math.PI;
  let camPitch = 0.12;
  let dodgeTime = 0;
  const locked = () => document.pointerLockElement === renderer.domElement;

  const GAME_KEYS = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
  const clearKeys = () => Object.keys(keys).forEach((k) => (keys[k] = false));
  addEventListener("blur", clearKeys);
  document.addEventListener("visibilitychange", clearKeys);
  addEventListener("keydown", (e) => {
    if (game.talkingTo || e.target instanceof HTMLInputElement) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    keys[e.code] = true;
    if (e.repeat) return;
    if (/^Digit[1-3]$/.test(e.code) && commsKey(Number(e.code.slice(5)))) {
      e.preventDefault();
    } else if (e.code === "Enter" && commsKey(1)) {
      e.preventDefault();
    } else if (e.code === "KeyE" && canTalkToLeader()) {
      e.preventDefault();
      openChat(LEADER);
    } else if (e.code === "KeyT") {
      e.preventDefault();
      openChat("astra");
    } else if (e.code === "KeyV") {
      e.preventDefault();
      void listen("ptt");
    } else if (e.code === "Space" && dodgeTime <= 0) {
      e.preventDefault();
      dodgeTime = 0.35;
    }
  });
  addEventListener("keyup", (e) => {
    keys[e.code] = false;
    if (e.code === "KeyV" && mic.listening) void (game.talkingTo ? listen("vad") : mic.stop());
  });
  let dragging = false;
  addEventListener("mouseup", () => (dragging = false));
  renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
  renderer.domElement.addEventListener("mousedown", (e) => {
    if (game.talkingTo) return;
    if (!locked()) {
      dragging = true;
      renderer.domElement.requestPointerLock();
    }
    if (e.button === 0 && player.attack <= 0) {
      player.attack = 0.35;
      if (battle && game.phase === "battle") {
        window.setTimeout(() => battle?.playerStrike(player.root.position, player.root.rotation.y, eraId === "austerlitz" ? 45 : 40), 150);
      }
    }
    if (e.button === 2) playerRanged();
  });

  function canTalkToLeader(): boolean {
    return player.root.position.distanceTo(achilles.root.position) < TALK_RANGE && (troy || game.phase === "meet" || game.phase === "after");
  }
  addEventListener("mousemove", (e) => {
    if (!locked() && !dragging) return;
    camYaw -= e.movementX * 0.0025;
    camPitch = THREE.MathUtils.clamp(camPitch + e.movementY * 0.002, -0.35, 0.9);
  });
  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    syncFxaa();
  });

  // ---- Loop ----
  const clock = new THREE.Clock();
  const up = new THREE.Vector3(0, 1, 0);
  const move = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  const headPos = new THREE.Vector3();
  const xAxis = new THREE.Vector3(1, 0, 0);
  const shoulder = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const STATE_ANIM = { idle: "Idle", angry: "Angry", suspicious: "Deny", friendly: "Friendly" } as const;
  const camTarget = new THREE.Vector3();
  const camPos = new THREE.Vector3();

  function faceTowards(obj: THREE.Object3D, target: number, rate: number, dt: number): void {
    const diff = Math.atan2(Math.sin(target - obj.rotation.y), Math.cos(target - obj.rotation.y));
    obj.rotation.y += diff * Math.min(1, dt * rate);
  }

  function update(dt: number, t: number): void {
    const p = player.root.position;
    const forward = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const strafe = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    move.set(-strafe, 0, forward);
    const moving = move.lengthSq() > 0 || dodgeTime > 0;
    if (move.lengthSq() > 0) {
      move.normalize().applyAxisAngle(up, camYaw);
      const run = keys.ShiftLeft || keys.ShiftRight;
      const speed = (run ? 5 : 1.8) * (dodgeTime > 0 ? 2.8 : 1);
      p.addScaledVector(move, speed * dt);
      faceTowards(player.root, Math.atan2(move.x, move.z), 10, dt);
      const clip = run || dodgeTime > 0 ? "Run" : "Walk";
      player.play(clip, Math.min(2, speed / CLIP_SPEED[clip]));
    } else if (dodgeTime > 0) {
      move.set(Math.sin(player.root.rotation.y), 0, Math.cos(player.root.rotation.y));
      p.addScaledVector(move, 12 * dt);
      player.play("Run", 1.6);
    } else {
      player.play("Idle");
    }
    if (!moving) player.play("Idle");
    dodgeTime = Math.max(0, dodgeTime - dt);
    p.x = THREE.MathUtils.clamp(p.x, -30, 30);
    p.z = THREE.MathUtils.clamp(p.z, CLIFF_EDGE_Z + 3, 30);
    battle?.collide(p);
    const toNpc = scratch.subVectors(p, achilles.root.position).setY(0);
    if (toNpc.length() < 1.0) p.addScaledVector(toNpc.normalize(), 1.0 - toNpc.length());
    p.y = terrainHeight(p.x, p.z);
    player.update(dt);

    const a = achilles.root;
    const toPlayer = Math.atan2(p.x - a.position.x, p.z - a.position.z);
    const near = p.distanceTo(a.position) < 8;
    faceTowards(a, near || game.leaderState !== "idle" ? toPlayer : 0.6 + Math.sin(t * 0.2) * 0.4, 3, dt);
    const achillesTalking = game.thinking || (voices.isSpeaking(LEADER) && game.leaderState !== "angry");
    achilles.play(achillesTalking ? "Talk" : STATE_ANIM[game.leaderState]);
    astra.speaking = voices.isSpeaking("astra");
    mic.strict = astra.speaking || voices.isSpeaking(LEADER);
    achilles.update(dt);
    if (game.thinking) achilles.bone("Neck").rotateY(Math.sin(t * 2) * 0.15);
    const auraMat = aura.material as THREE.MeshBasicMaterial;
    auraMat.opacity = 0.35 + Math.sin(t * 3) * 0.15;

    achilles.bone("Head").getWorldPosition(headPos);
    astra.update(dt, t, player.root, near ? headPos : camera.position);
    if (portal) {
      portal.rotation.z = t * 1.5;
      if (nextEra(eraId) && p.distanceTo(portal.position) < 2.2 && Math.abs(p.z - portal.position.z) < 1) travel();
    }

    battle?.update(dt, game.phase === "battle" ? p : null, dodgeTime > 0);
    game.reload = Math.max(0, game.reload - dt);
    refreshBattleHud();
    const hurt = Number(ui.hurt.style.opacity || 0);
    if (hurt > 0) ui.hurt.style.opacity = String(Math.max(0, hurt - dt * 0.8));

    ui.prompt.classList.toggle("hidden", !canTalkToLeader() || game.talkingTo !== null);

    shoulder.set(-0.55, 0, 0).applyAxisAngle(up, camYaw);
    camTarget.set(p.x, p.y + 1.55, p.z).add(shoulder);
    const dist = game.talkingTo ? 2.4 : 3.4;
    offset.set(0, 0, -dist).applyAxisAngle(xAxis, camPitch).applyAxisAngle(up, camYaw);
    desired.copy(camTarget).add(offset);
    desired.y = Math.max(desired.y, terrainHeight(desired.x, desired.z) + 0.4);
    camPos.lerp(desired, 1 - Math.exp(-dt * 12));
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
    if (shake > 0.001) {
      camera.position.add(scratch.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shake * 0.25));
      shake *= Math.exp(-dt * 6);
    }

    world.update(dt, t, camera, p);
  }

  camPos.set(p0().x, p0().y + 2, p0().z - 4);
  function p0() {
    return player.root.position;
  }

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __dbg: {
        player, achilles, voices, mic, game, callToWar,
        battle: () => battle,
        setView: (yaw: number, pitch: number) => ((camYaw = yaw), (camPitch = pitch)),
      },
    });
  }
  renderer.compile(scene, camera);
  update(0.016, 0);
  ui.loaderText.textContent = "Époque synchronisée.";
  ui.start.classList.remove("hidden");
  ui.start.addEventListener("click", () => {
    ui.start.blur();
    if (ui.start.disabled) return;
    ui.start.disabled = true;
    ui.splash.classList.add("fade");
    resumeAudio();
    renderer.domElement.requestPointerLock();
    if (troy) {
      game.phase = "meet";
      logLine("sys", "Astra : Agent, nous sommes en 1184 av. J.-C. Achille est près du feu. Évitez tout anachronisme.");
      say("astra", "Agent, nous sommes à Troie. Achille est près du feu. Évitez tout anachronisme. Maintenez V pour me parler.");
      return;
    }
    runBeats(era.intro, () => {
      game.phase = "meet";
      ui.objective.textContent = era.objectives.meet;
    });
  });

  const maxRatio = renderer.getPixelRatio();
  let ratio = maxRatio;
  let frameAvg = 1 / 60;
  let sinceScale = 0;
  function adaptResolution(raw: number): void {
    frameAvg += (raw - frameAvg) * 0.05;
    sinceScale += raw;
    if (sinceScale < 1) return;
    const next = frameAvg > 1 / 45 ? Math.max(0.5, ratio * 0.85) : frameAvg < 1 / 58 ? Math.min(maxRatio, ratio * 1.1) : ratio;
    if (Math.abs(next - ratio) > 0.01) {
      ratio = next;
      renderer.setPixelRatio(ratio);
      composer.setPixelRatio(ratio);
      syncFxaa();
      sinceScale = 0;
    }
  }

  renderer.setAnimationLoop(() => {
    const raw = clock.getDelta();
    const dt = Math.min(raw, 0.1);
    adaptResolution(raw);
    update(dt, clock.elapsedTime);
    composer.render();
  });
}

init().catch((err) => {
  console.error(err);
  ui.loaderText.textContent = `Erreur de chargement : ${(err as Error).message}`;
});
