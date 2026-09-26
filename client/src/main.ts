import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import { VignetteShader } from "three/examples/jsm/shaders/VignetteShader.js";
import type { NpcResponse, NpcState, ServerMessage } from "../../shared/protocol.ts";
import { loadGltf, loadTexture, manager } from "./assets.ts";
import { CLIP_SPEED, Character, dressAsAgent, dressAsHoplite, loadHumanSkin, makeAspis, makeSpear } from "./characters.ts";
import { Drone } from "./drone.ts";
import { CLIFF_EDGE_Z, buildWorld, terrainHeight } from "./environment.ts";
import { TroyBattleManager, playClashSound, playDodgeSound, playWarHorn } from "./eras/index.ts";
import { GamificationManager } from "./gamification.ts";
import { GameSocket } from "./net.ts";
import { Microphone, VoicePlayer, audioListener, resumeAudio, speakLocal } from "./voice.ts";

const THINKING_FALLBACK_MS = 2000;
const TALK_RANGE = 3.5;
const NPC_NAMES: Record<string, string> = { achilles_01: "Achille", astra: "Astra" };
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
  combatBanner: $("combat-banner"),
  combatAlert: $("combat-alert"),
  chat: $("chat"),
  chatTitle: $("chat-title"),
  chatLog: $("chat-log"),
  chatForm: $<HTMLFormElement>("chat-form"),
  chatInput: $<HTMLInputElement>("chat-input"),
  mic: $<HTMLButtonElement>("mic"),
  subtitle: $("subtitle"),
  hologram: $("hologram"),
  hologramFrame: $<HTMLIFrameElement>("hologram-frame"),
};

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
const game = {
  era: "troy",
  inventory: ["lettre_secrete_1"],
  trust: { achilles_01: 45 } as Record<string, number>,
  achillesState: "idle" as NpcState,
  talkingTo: null as string | null,
  pendingTimer: undefined as number | undefined,
  thinking: false,
  warActive: false,
};

function refreshStats(): void {
  ui.stats.textContent = `Achille — confiance ${game.trust.achilles_01}/100 · ${STATE_LABELS[game.achillesState]}`;
}
refreshStats();

async function init() {
  const [world, agentGltf, achillesGltf, agentSkin, achillesSkin, aspisFace] = await Promise.all([
    buildWorld(scene, renderer),
    loadGltf("/assets/humans/agent.glb"),
    loadGltf("/assets/humans/achilles.glb"),
    loadHumanSkin("sm024", { body: "greek", head: "greek" }),
    loadHumanSkin("m021", { body: "hero" }),
    loadTexture("/assets/humans/aspis.jpg", true),
  ]);

  const player = new Character(agentGltf, agentSkin);
  dressAsAgent(player, 0x33d6ff);
  const hand = player.bone("R_Hand").getWorldPosition(new THREE.Vector3());
  const spear = makeSpear(0x33d6ff, false);
  spear.position.set(hand.x, hand.y + 0.25, hand.z + 0.03);
  spear.rotation.x = 0.12;
  player.attachTo("R_Hand", spear);
  player.root.position.set(2, terrainHeight(2, 1), 1);
  player.root.rotation.y = Math.PI;
  scene.add(player.root);

  const achilles = new Character(achillesGltf, achillesSkin);
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

  // Battle manager
  const battleManager = new TroyBattleManager(scene, agentGltf, agentSkin, aspisFace);

  // Gamification Manager
  const gamification = new GamificationManager(() => {
    // Respawn callback: reset player position and reset battle if needed
    player.root.position.set(2, terrainHeight(2, 1), 1);
    player.root.rotation.y = Math.PI;
    if (game.warActive) {
      battleManager.resetBattle();
      game.warActive = false;
      ui.objective.textContent = "Objectif : gagner la confiance d'Achille.";
    }
  });

  // ---- Networking ----
  const socket = new GameSocket(onServerMessage);
  const voices = new VoicePlayer();
  voices.register("achilles_01", achilles.root, 1.6);
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

  let alertTimer: number | undefined;
  function triggerCombatGuidance(text: string, urgent: boolean, soundLine?: string): void {
    clearTimeout(alertTimer);
    ui.combatAlert.textContent = text;
    ui.combatAlert.classList.remove("hidden");
    alertTimer = window.setTimeout(() => ui.combatAlert.classList.add("hidden"), 3200);

    logLine("sys", `Astra : ${text}`);
    if (urgent || !voices.isSpeaking("astra")) {
      const line = soundLine ?? text.replace(/[⚠️✨⚔️🏆\[\]]/g, "").trim();
      say("astra", line);
    }
  }

  function triggerWarMode(): void {
    if (game.warActive) return;
    game.warActive = true;
    ui.objective.textContent = "⚔️ GUERRE DE TROIE : Suivez Achille et repoussez l'assaut troyen !";
    ui.combatBanner.textContent = "⚔️ LA GUERRE DE TROIE ÉCLATE ! SUIVEZ ACHILLE ! ⚔️";
    ui.combatBanner.classList.remove("hidden");
    setTimeout(() => ui.combatBanner.classList.add("hidden"), 8000);

    closeChat();
    battleManager.startBattle(achilles.root.position, triggerCombatGuidance, gamification);
  }

  function onServerMessage(msg: ServerMessage): void {
    if (msg.type === "npc_reply") handleReply(msg.npc_id, msg.response, msg.source);
    else if (msg.type === "speech_audio") voices.play(msg.npc_id, msg.audio, msg.sample_rate);
    else if (msg.type === "speech_end" && !msg.ok) speakLocal(msg.text, msg.npc_id === "astra" ? "astra" : "npc");
    else if (msg.type === "transcript") {
      if (!msg.final) subtitle(`🎙 ${msg.text}`, 0, true);
      else if (msg.text) {
        logLine("player", `Toi : ${msg.text}`);
        subtitle(`Toi : ${msg.text}`, 2500);
      } else subtitle("🎙 (rien entendu)", 1500);
    }
    else if (msg.type === "hologram") showHologram(msg.html);
    else if (msg.type === "combat_callout") triggerCombatGuidance(msg.text, msg.urgent);
    else if (msg.type === "error") logLine("sys", `Erreur : ${msg.message}`);
  }

  function handleReply(npcId: string, res: NpcResponse, source: string): void {
    clearTimeout(game.pendingTimer);
    game.thinking = false;
    ui.bubble.classList.add("hidden");
    logLine("npc", `${NPC_NAMES[npcId]} : ${res.dialogue}`, source === "mock" ? "(mock)" : "");
    if (!game.talkingTo) subtitle(`${NPC_NAMES[npcId]} : ${res.dialogue}`, 4500 + res.dialogue.length * 60);
    if (npcId === "achilles_01") {
      const oldTrust = game.trust.achilles_01 ?? 45;
      const trustDiff = res.new_trust - oldTrust;
      game.trust.achilles_01 = res.new_trust;
      game.achillesState = res.npc_state;
      (aura.material as THREE.MeshBasicMaterial).color.setHex(STATE_COLORS[res.npc_state]);
      refreshStats();

      if (trustDiff > 0) {
        gamification.registerTrustGain(trustDiff);
      }

      // Check if Achilles accepts to go to war!
      if (res.trigger_war) {
        setTimeout(() => triggerWarMode(), 2500);
      }
    }
  }

  const gameContext = (npcId: string) => ({
    era: game.era,
    player_inventory: game.inventory,
    npc_trust: game.trust[npcId] ?? 100,
  });

  function talk(npcId: string, text: string): void {
    // If player speaks about combat, Achilles gets ready
    if (/(combat|guerre|bataille|arme|lance|allons|gloire|navire|aider|troyen)/i.test(text)) {
      setTimeout(() => triggerWarMode(), 3000);
    }
    interrupt();
    logLine("player", `Toi : ${text}`);
    socket.send({ type: "talk", request: { npc_id: npcId, player_input: text, game_context: gameContext(npcId) } });
    armThinking(npcId);
  }

  const voiceTarget = () =>
    game.talkingTo ?? (player.root.position.distanceTo(achilles.root.position) < TALK_RANGE * 2 ? "achilles_01" : "astra");
  let voiceNpc = "astra";
  const mic = new Microphone({
    onChunk: (audio) => socket.send({ type: "voice_audio", audio }),
    onSpeechStart: () => {
      // Do not interrupt Achilles if he is speaking unless the user is in dialogue chat or presses V deliberately
      if (game.talkingTo || !voices.isSpeaking("achilles_01")) {
        interrupt();
      }
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
      game.thinking = npcId === "achilles_01";
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
    logLine("sys", "Astra : Verrou ouvert. Brèche temporelle détectée.");
    say("astra", "Verrou ouvert. Brèche temporelle détectée.");
    gamification.registerPuzzleSolved();
    if (!portal) {
      const p = world.interactables.portalSpot;
      portal = new THREE.Mesh(
        new THREE.TorusGeometry(1.4, 0.08, 16, 64),
        new THREE.MeshStandardMaterial({ color: 0x66ffff, emissive: 0x33ffff, emissiveIntensity: 6 }),
      );
      portal.position.set(p.x, terrainHeight(p.x, p.z) + 1.7, p.z);
      scene.add(portal);
    }
  });

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
    if (e.code === "KeyE" && player.root.position.distanceTo(achilles.root.position) < TALK_RANGE) {
      e.preventDefault();
      openChat("achilles_01");
    } else if (e.code === "KeyT") {
      e.preventDefault();
      openChat("astra");
    } else if (e.code === "KeyV") {
      e.preventDefault();
      void listen("ptt");
    } else if (e.code === "Space" && dodgeTime <= 0) {
      e.preventDefault();
      dodgeTime = 0.35;
      playDodgeSound();
    } else if (e.code === "KeyB" && !game.warActive) {
      e.preventDefault();
      logLine("sys", "Achille : Aux armes ! Les Troyens chargent nos lignes !");
      triggerWarMode();
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
      playClashSound();
    }
  });
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

  // ---- Proactive Companion Manager ----
  let idleTime = 0;
  let proactiveIndex = 0;
  const PROACTIVE_LINES = [
    "Agent, regarde Achille près du feu. L'affront d'Agamemnon le ronge, mais son instinct de guerrier ne demande qu'à s'embraser.",
    "Rappelle-lui sa soif de gloire immortelle ! C'est le point sensible de tout héros achéen.",
    "Les vigies annoncent du mouvement vers les murailles. Si les Troyens brûlent les navires, le continuum s'effondrera !",
    "N'hésite pas à lui proposer d'aller au combat à ses côtés. Il respecte la vaillance par-dessus tout.",
    "Garde ta lance bien en main. Tu peux frapper avec le clic gauche et esquiver avec Espace.",
    "Attention à ne pas faire d'anachronismes. Pour Achille, je suis un présage ailé envoyé par Athéna.",
    "Tu explores la zone ? Approche-toi d'Achille et appuie sur E pour lui parler franchement.",
  ];

  let cliffWarned = false;
  let fireWarned = false;

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
    const toNpc = scratch.subVectors(p, achilles.root.position).setY(0);
    if (toNpc.length() < 1.0) p.addScaledVector(toNpc.normalize(), 1.0 - toNpc.length());
    p.y = terrainHeight(p.x, p.z);
    player.update(dt);

    const a = achilles.root;
    const toPlayer = Math.atan2(p.x - a.position.x, p.z - a.position.z);
    const near = p.distanceTo(a.position) < 8;

    if (!game.warActive) {
      faceTowards(a, near || game.achillesState !== "idle" ? toPlayer : 0.6 + Math.sin(t * 0.2) * 0.4, 3, dt);
      const achillesTalking = game.thinking || (voices.isSpeaking("achilles_01") && game.achillesState !== "angry");
      achilles.play(achillesTalking ? "Talk" : STATE_ANIM[game.achillesState]);
    }

    // Battle update
    if (game.warActive) {
      battleManager.update(dt, p, player.attack > 0.15, dodgeTime > 0, achilles, triggerCombatGuidance, gamification);
    }

    gamification.update(dt);
    if (gamification.invulnerableTimer > 0) {
      player.root.visible = Math.floor(t * 16) % 2 === 0;
    } else {
      player.root.visible = true;
    }

    astra.speaking = voices.isSpeaking("astra");
    mic.strict = astra.speaking || voices.isSpeaking("achilles_01");
    achilles.update(dt);
    if (game.thinking) achilles.bone("Neck").rotateY(Math.sin(t * 2) * 0.15);
    const auraMat = aura.material as THREE.MeshBasicMaterial;
    auraMat.opacity = 0.35 + Math.sin(t * 3) * 0.15;

    achilles.bone("Head").getWorldPosition(headPos);
    astra.update(dt, t, player.root, near ? headPos : camera.position);
    if (portal) portal.rotation.z = t * 1.5;

    ui.prompt.classList.toggle("hidden", p.distanceTo(a.position) >= TALK_RANGE || game.talkingTo !== null || game.warActive);

    // Companion proactive conversation when idle
    if (!game.warActive && !game.talkingTo && !voices.isSpeaking()) {
      idleTime += dt;
      if (idleTime > 13) {
        idleTime = 0;
        const line = PROACTIVE_LINES[proactiveIndex % PROACTIVE_LINES.length];
        proactiveIndex++;
        logLine("sys", `Astra : ${line}`);
        subtitle(`Astra : ${line}`, 6000);
        say("astra", line);
      }

      // Proactive location triggers
      if (!cliffWarned && p.z < CLIFF_EDGE_Z + 5) {
        cliffWarned = true;
        gamification.addPoints(50, "Falaise Découverte", { color: "cyan" });
        const warn = "Attention au bord de la falaise ! Les vagues s'écrasent violemment en contrebas.";
        logLine("sys", `Astra : ${warn}`);
        subtitle(`Astra : ${warn}`, 5000);
        say("astra", warn);
      }
      if (!fireWarned && p.distanceTo(world.interactables.achillesSpot) < 5) {
        fireWarned = true;
        gamification.addPoints(50, "Foyer d'Achille Découvert", { color: "cyan" });
        const warn = "Achille est là. Parle-lui de gloire, de combat et propose ton aide pour les navires !";
        logLine("sys", `Astra : ${warn}`);
        subtitle(`Astra : ${warn}`, 5000);
        say("astra", warn);
      }
    } else {
      idleTime = 0;
    }

    shoulder.set(-0.55, 0, 0).applyAxisAngle(up, camYaw);
    camTarget.set(p.x, p.y + 1.55, p.z).add(shoulder);
    const dist = game.talkingTo ? 2.4 : 3.4;
    offset.set(0, 0, -dist).applyAxisAngle(xAxis, camPitch).applyAxisAngle(up, camYaw);
    desired.copy(camTarget).add(offset);
    desired.y = Math.max(desired.y, terrainHeight(desired.x, desired.z) + 0.4);
    camPos.lerp(desired, 1 - Math.exp(-dt * 12));
    camera.position.copy(camPos);
    camera.lookAt(camTarget);

    world.update(dt, t, camera, p);
  }

  camPos.set(p0().x, p0().y + 2, p0().z - 4);
  function p0() {
    return player.root.position;
  }

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __dbg: { player, achilles, voices, mic, battleManager, gamification, triggerWarMode, setView: (yaw: number, pitch: number) => ((camYaw = yaw), (camPitch = pitch)) },
    });
  }
  renderer.compile(scene, camera);
  update(0.016, 0);
  ui.loaderText.textContent = "Époque synchronisée.";
  ui.start.classList.remove("hidden");
  ui.start.addEventListener("click", () => {
    ui.splash.classList.add("fade");
    resumeAudio();
    renderer.domElement.requestPointerLock();
    gamification.addPoints(100, "Synchronisation Troie (-1184)", { color: "gold" });
    logLine("sys", "Astra : Agent, nous sommes en 1184 av. J.-C. Achille est près du feu. Évitez tout anachronisme.");
    say("astra", "Agent, nous sommes à Troie. Achille est près du feu. Évitez tout anachronisme. Maintenez V pour me parler.");
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
