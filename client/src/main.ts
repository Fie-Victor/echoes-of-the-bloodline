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
import { CLIP_SPEED, Character, dressAsHoplite, loadHumanSkin, makeAspis, makeSpear } from "./characters.ts";
import { Drone } from "./drone.ts";
import { CLIFF_EDGE_Z, buildWorld, terrainHeight } from "./environment.ts";
import { type ArmyConfig, type AstraBeat, ERAS, type Squad, type Tactic } from "./eras.ts";
import { GamificationManager } from "./gamification.ts";
import { GameSocket } from "./net.ts";
import { dressKit } from "./outfits.ts";
import { playSfx } from "./sfx.ts";
import { TouchControls } from "./touch-controls.ts";
import { Microphone, VoicePlayer, audioListener, resumeAudio, speakLocal } from "./voice.ts";

const THINKING_FALLBACK_MS = 2000;
const TALK_RANGE = 4.0;
const PLAYER_HP = 100;

const eraParam = new URLSearchParams(location.search).get("era");
const eraId: EraId = isEraId(eraParam) ? eraParam : "troy";
const era = ERAS[eraId];
const LEADER = era.leader.id;
const NPC_NAMES: Record<string, string> = { [LEADER]: era.leader.name, astra: "Astra" };

/** Ranged attack configuration per era (pilum, javelot, arquebuse, mousquet) */
const PLAYER_RANGED: Record<EraId, { kind: Missile | "musket"; reload: number; ammo: number; label: string }> = {
  troy: { kind: "javelin", reload: 1.6, ammo: 5, label: "Achaean javelin" },
  alesia: { kind: "javelin", reload: 1.5, ammo: 4, label: "Roman pilum" },
  orleans: { kind: "javelin", reload: 1.8, ammo: 4, label: "Throwing dagger" },
  sekigahara: { kind: "musket", reload: 4.2, ammo: 10, label: "Tanegashima arquebus" },
  austerlitz: { kind: "musket", reload: 3.8, ammo: 14, label: "Charleville musket" },
};

const STATE_LABELS: Record<NpcState, string> = { idle: "Neutral", friendly: "Friendly", suspicious: "Wary", angry: "Hostile" };
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

if (ui.title) ui.title.textContent = `ECHOES OF THE BLOODLINE — ${era.title}`;
document.title = `Echoes of the Bloodline — ${era.chapter}`;
if (ui.splashSub) ui.splashSub.textContent = era.chapter;
if (ui.prompt) ui.prompt.textContent = `[E] Speak to ${era.leader.name}`;
if (ui.objective) ui.objective.textContent = era.objectives.meet;

// Top era navigation links
if (ui.eras) {
  for (const id of ERA_ORDER) {
    const a = document.createElement("a");
    a.href = `?era=${id}`;
    a.textContent = ERAS[id].chapter.replace(/^Chronique [IVX]+ — /, "");
    a.classList.toggle("current", id === eraId);
    ui.eras.append(a);
  }
}

manager.onProgress = (_url, loaded, total) => {
  if (ui.loaderBar) ui.loaderBar.style.width = `${(loaded / total) * 100}%`;
};

// ---- Renderer & post-processing ----
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = era.palette.exposure ?? 1.05;
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
type Phase = "intro" | "meet" | "prebattle" | "battle" | "after";
const game = {
  era: eraId,
  inventory: ["sceau_temporel_omega"],
  trust: { [LEADER]: 45 } as Record<string, number>,
  leaderState: "idle" as NpcState,
  talkingTo: null as string | null,
  pendingTimer: undefined as number | undefined,
  thinking: false,
  phase: "intro" as Phase,
  exchanges: 0,
  playerKills: 0,
  tactic: "hold" as Tactic,
  hp: PLAYER_HP,
  ammo: PLAYER_RANGED[eraId].ammo,
  reload: 0,
  warnedHp: false,
};

function refreshStats(): void {
  if (ui.stats) {
    ui.stats.textContent = `${era.leader.name} — trust ${game.trust[LEADER]}/100 · ${STATE_LABELS[game.leaderState]}`;
  }
}
refreshStats();

async function init() {
  const troy = eraId === "troy";
  const [world, agentGltf, achillesGltf, agentSkin, achillesSkin, aspisFace] = await Promise.all([
    buildWorld(scene, renderer, eraId, era.palette),
    loadGltf("/assets/humans/agent.glb"),
    loadGltf("/assets/humans/achilles.glb"),
    loadHumanSkin("sm024", { body: "greek", head: "greek" }),
    loadHumanSkin("m021", { body: "hero" }),
    loadTexture("/assets/humans/aspis.jpg", true),
  ]);

  const player = new Character(agentGltf, agentSkin);
  if (troy) {
    dressAsHoplite(player);
    const hand = player.bone("R_Hand").getWorldPosition(new THREE.Vector3());
    const spear = makeSpear(0xc4a060, false);
    spear.position.set(hand.x, hand.y + 0.25, hand.z + 0.03);
    spear.rotation.x = 0.12;
    player.attachTo("R_Hand", spear);
    const fore = player.bone("L_Forearm").getWorldPosition(new THREE.Vector3());
    const lhand = player.bone("L_Hand").getWorldPosition(new THREE.Vector3());
    const shield = makeAspis(aspisFace);
    shield.position.lerpVectors(fore, lhand, 0.5).add(new THREE.Vector3(0.16, -0.05, 0.06));
    shield.rotation.set(0, 0.35, 0);
    player.attachTo("L_Forearm", shield);
  } else {
    dressKit(player, era.player.outfit, { weapon: era.player.weapon, team: era.allies?.team });
  }
  player.root.position.set(2, terrainHeight(2, 1), 1);
  player.root.rotation.y = Math.PI;
  scene.add(player.root);

  const achilles = new Character(achillesGltf, achillesSkin);
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
  } else {
    dressKit(achilles, era.leader.outfit, { weapon: era.leader.weapon, team: era.allies?.team });
  }

  // Uniform skins per team
  const armySkins = new Map<number, Record<"body" | "head", THREE.MeshStandardMaterial>[]>();
  const skinsFor = (team: number) => {
    let s = armySkins.get(team);
    if (!s) {
      const tint = new THREE.Color(team).lerp(new THREE.Color(0xffffff), 0.7);
      s = [agentSkin, achillesSkin].map((k) => ({ body: k.body.clone(), head: k.head }));
      for (const k of s) k.body.color.copy(tint);
      armySkins.set(team, s);
    }
    return s;
  };

  let spawned = 0;
  const spawnSoldier = (squad: Squad, team: number): Character => {
    const i = spawned++ % 2;
    const c = new Character(i ? achillesGltf : agentGltf, skinsFor(team)[i]);
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
  let portalLight: THREE.PointLight | null = null;

  // ---- Gamification Manager ----
  const nextTarget = nextEra(eraId);
  const gamification = new GamificationManager(
    () => {
      // Respawn callback
      game.hp = PLAYER_HP;
      player.root.position.set(0, terrainHeight(0, 7), 7);
      if (battle) startBattle();
    },
    () => {
      // Next era callback
      if (nextTarget) travel();
      else location.href = "index.html";
    }
  );

  if (nextTarget) {
    gamification.setNextEraCallback(travel, ERAS[nextTarget].chapter.replace(/^Chronique [IVX]+ — /, ""));
  }

  // ---- Networking & Voice ----
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
    else if (msg.type === "speech_end" && !msg.ok) speakLocal(msg.text, msg.npc_id === "astra" ? "astra" : "npc");
    else if (msg.type === "transcript") {
      if (!msg.final) subtitle(`🎙 ${msg.text}`, 0, true);
      else if (msg.text) {
        rememberLine(msg.text);
        logLine("player", `You: ${msg.text}`);
        subtitle(`You: ${msg.text}`, 2500);
      } else subtitle("🎙 I didn't catch that. Hold V and speak close to the mic.", 3200);
    }
    else if (msg.type === "hologram") showHologram(msg.html);
    else if (msg.type === "error") logLine("sys", `Error: ${msg.message}`);
  }

  function handleReply(npcId: string, res: NpcResponse, source: string): void {
    clearTimeout(game.pendingTimer);
    game.thinking = false;
    ui.bubble.classList.add("hidden");
    logLine("npc", `${NPC_NAMES[npcId]} : ${res.dialogue}`, source === "mock" ? "(mock)" : "");
    if (!game.talkingTo) subtitle(`${NPC_NAMES[npcId]} : ${res.dialogue}`, 4000 + res.dialogue.length * 60);

    if (npcId === LEADER) {
      const oldTrust = game.trust[LEADER];
      game.trust[LEADER] = res.new_trust;
      if (res.new_trust > oldTrust) {
        gamification.addTrust(res.new_trust - oldTrust);
      }
      game.leaderState = res.npc_state;
      (aura.material as THREE.MeshBasicMaterial).color.setHex(STATE_COLORS[res.npc_state]);
      refreshStats();
      game.exchanges++;
      if (game.phase === "meet") {
        closeChat();
        window.setTimeout(callToWar, 900);
      }
    }
  }

  const gameContext = (npcId: string) => ({
    era: game.era,
    player_inventory: game.inventory,
    npc_trust: game.trust[npcId] ?? 100,
  });

  const saidLines = new Set<string>();
  const normLine = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").trim();

  function forgetSaidHints(): void {
    for (const btn of [...ui.commsChoices.querySelectorAll("button")]) {
      const label = (btn.textContent ?? "").replace(/^\d+\.\s*/, "");
      if (saidLines.has(normLine(label))) btn.remove();
    }
  }

  function rememberLine(text: string): void {
    const key = normLine(text);
    if (!key || key === "continue" || key === "continuer") return;
    saidLines.add(key);
    forgetSaidHints();
  }

  function talk(npcId: string, text: string): void {
    interrupt();
    rememberLine(text);
    logLine("player", `You: ${text}`);
    socket.send({ type: "talk", request: { npc_id: npcId, player_input: text, game_context: gameContext(npcId) } });
    armThinking(npcId);
  }

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
      if (mode === "vad") subtitle(`🎙 ${NPC_NAMES[voiceTarget()]} is listening — speak freely`, 3000, true);
    } catch (e) {
      const reason = e instanceof Error ? `${e.name === "Error" ? "" : `${e.name} : `}${e.message}` : String(e);
      subtitle(`Microphone unavailable (${reason})`, 6000);
      logLine("sys", `Microphone unavailable: ${reason}`);
    }
  }

  function armThinking(npcId: string): void {
    clearTimeout(game.pendingTimer);
    game.pendingTimer = window.setTimeout(() => {
      game.thinking = npcId === LEADER;
      ui.bubble.textContent = npcId === "astra" ? "Calculating…" : "Hmm… let me think…";
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
  document.getElementById("chat-close")?.addEventListener("click", closeChat);

  // ---- Hologram (Devin UI Puzzle) ----
  function showHologram(html: string): void {
    ui.hologramFrame.srcdoc = html;
    ui.hologram.classList.remove("hidden");
    ui.objective.textContent = "Ouvrir le verrou temporel.";
  }

  document.getElementById("hologram-close")?.addEventListener("click", () => {
    ui.hologram.classList.add("hidden");
  });

  window.addEventListener("message", (e) => {
    if (e.source !== ui.hologramFrame.contentWindow) return;
    const data = e.data as { type?: string; puzzle_id?: string };
    if (data.type !== "puzzle_solved" || !data.puzzle_id) return;
    socket.send({ type: "puzzle_solved", puzzle_id: data.puzzle_id });
    ui.hologram.classList.add("hidden");
    gamification.registerPuzzleSolved();
    ui.objective.textContent = "Continuum stable — the temporal rift is open.";
    logLine("sys", "Astra: Lock open. The rift is stable. Step through the portal and continue the chronicle.");
    say("astra", "Lock open. The rift is stable. Step through the portal and continue the chronicle.");
    openPortal();
  });

  function openPortal(): void {
    if (portal) return;
    const p = world.interactables.portalSpot;
    portal = new THREE.Mesh(
      new THREE.TorusGeometry(1.6, 0.1, 16, 64),
      new THREE.MeshStandardMaterial({
        color: 0x66ffff,
        emissive: 0x33ffff,
        emissiveIntensity: 5.5,
        roughness: 0.1,
      }),
    );
    portal.position.set(p.x, terrainHeight(p.x, p.z) + 1.8, p.z);
    scene.add(portal);

    portalLight = new THREE.PointLight(0x66ffff, 3.5, 12);
    portalLight.position.copy(portal.position);
    scene.add(portalLight);

    // Floating prompt on screen
    const prompt = document.createElement("div");
    prompt.className = "portal-prompt";
    const next = nextEra(eraId);
    const nextName = next ? ERAS[next].chapter.replace(/^Chronicle [IVX]+ — /, "") : "Title screen";
    prompt.innerHTML = `
      <div class="portal-prompt-text">🌀 Temporal rift open!</div>
      <div class="portal-actions">
        <button id="prompt-jump" class="portal-btn portal-btn-jump">Jump to ${nextName}</button>
        <button id="prompt-timeline" class="portal-btn portal-btn-timeline">Home</button>
      </div>
    `;
    document.body.appendChild(prompt);
    prompt.querySelector("#prompt-jump")?.addEventListener("click", travel);
    prompt.querySelector("#prompt-timeline")?.addEventListener("click", () => (location.href = "index.html"));
  }

  function travel(): void {
    const next = nextEra(eraId);
    if (!next) {
      location.href = "index.html";
      return;
    }
    portal = null;
    ui.splash.classList.remove("fade");
    ui.loaderText.textContent = "Quantum jump across the continuum…";
    window.setTimeout(() => (location.search = `?era=${next}`), 900);
  }

  // ---- Astra comms: scripted exchanges with player choices ----
  let commsDone: (() => void) | null = null;
  let commsPick: ((i: number) => void) | null = null;

  function astraLine(text: string): void {
    logLine("sys", `Astra: ${text}`);
    subtitle(`Astra: ${text}`, 3500 + text.length * 55);
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
    const choices = (beat.choices ?? [{ label: "Continue", reply: "" }]).filter((c) => !saidLines.has(normLine(c.label)));
    if (!choices.length) {
      runBeats(rest, done, pick);
      return;
    }
    ui.comms.classList.remove("hidden");
    ui.commsText.textContent = beat.text;
    astraLine(beat.text);
    ui.commsChoices.replaceChildren();
    const choose = (i: number) => {
      const c = choices[i];
      if (!c) return;
      commsPick = null;
      rememberLine(c.label);
      logLine("player", `You: ${c.label}`);
      if (c.tactic && pick) pick(c.tactic);
      if (!c.reply) return runBeats(rest, done, pick);
      ui.commsText.textContent = c.reply;
      astraLine(c.reply);
      ui.commsChoices.replaceChildren();
      commsDone = () => runBeats(rest, done, pick);
      window.setTimeout(() => runBeats(rest, done, pick), Math.min(4200, 1600 + c.reply.length * 35));
    };
    choices.forEach((c, i) => ui.commsChoices.append(button(c.label, i + 1, () => choose(i))));
    commsPick = choose;
    commsDone = null;
  }

  function storyLines(beats: AstraBeat[]): string[] {
    const lines: string[] = [];
    for (const beat of beats) {
      lines.push(beat.text);
      for (const choice of beat.choices ?? []) {
        if (choice.reply && !lines.includes(choice.reply)) lines.push(choice.reply);
      }
    }
    return lines;
  }

  /** Astra tells the chapter. Lines already heard are skipped, and no reply stays on screen. */
  function narrate(lines: string[], done: () => void): void {
    const pending = lines.filter((line) => !saidLines.has(normLine(line)));
    const step = (i: number) => {
      const line = pending[i];
      if (!line) {
        ui.comms.classList.add("hidden");
        ui.commsChoices.replaceChildren();
        done();
        return;
      }
      rememberLine(line);
      ui.comms.classList.remove("hidden");
      ui.commsText.textContent = line;
      ui.commsChoices.replaceChildren();
      astraLine(line);
      window.setTimeout(() => step(i + 1), Math.min(6500, 1800 + line.length * 32));
    };
    step(0);
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

  // ---- Battle Engine ----
  let battle: Battle | null = null;
  let shake = 0;

  function callToWar(): void {
    if (game.phase !== "meet") return;
    game.phase = "prebattle";
    closeChat();
    ui.comms.classList.add("hidden");
    logLine("npc", `${era.leader.name} : ${era.warCall}`);
    subtitle(`${era.leader.name} : ${era.warCall}`, 2800);
    say(LEADER, era.warCall);
    playSfx(eraId === "sekigahara" ? "drum" : "horn", 30);
    window.setTimeout(() => {
      ui.objective.textContent = "Objective: cut down 3 enemies. Astra has your back.";
      astraLine("Three opponents ahead. I have you covered. Strike, dodge, and the rift will open.");
      startBattle();
    }, 1400);
  }

  const KILLS_TO_PASS = 3;

  function skirmishOf(army: ArmyConfig, count: number, hp: number): ArmyConfig {
    const base = army.squads.find((s) => s.role === "melee") ?? army.squads[0];
    return base ? { ...army, squads: [{ ...base, count, role: "melee", hp }] } : army;
  }

  function startBattle(): void {
    if (!era.allies || !era.enemies) return;
    game.phase = "battle";
    game.playerKills = 0;
    game.hp = PLAYER_HP;
    gamification.hp = PLAYER_HP;
    game.warnedHp = false;
    game.ammo = PLAYER_RANGED[eraId].ammo;
    battle?.dispose();
    const allies = skirmishOf(era.allies, 3, 140);
    const enemies = skirmishOf(era.enemies, KILLS_TO_PASS, 32);

    const p = player.root.position;
    p.set(0, 0, 7);
    p.y = terrainHeight(p.x, p.z);
    camYaw = 0;

    battle = new Battle(scene, allies, enemies, "hold", {
      spawn: spawnSoldier,
      callout: (kind: Callout) => {
        const line = era.callouts[kind];
        if (line) astraLine(line);
      },
      playerHit: onPlayerHit,
      shake: (a) => (shake = Math.max(shake, a)),
      onEnemyKilled: (killer) => {
        if (killer !== "player") {
          gamification.addPoints(40, "Enemy trooper down");
          return;
        }
        game.playerKills++;
        gamification.addPoints(150, "Enemy down!");
        gamification.registerAttackHit();
        const left = KILLS_TO_PASS - game.playerKills;
        if (left === 2) astraLine("One down. Two to go. I am right behind you.");
        else if (left === 1) astraLine("Good. One more, and I open the rift.");
        else if (left <= 0) {
          astraLine("Done. The rift is stabilizing.");
          battle?.victory();
        }
      },
      onPlayerStrikeHit: () => {
        gamification.registerAttackHit();
      },
      finished: (victory) => {
        if (!victory) return;
        game.phase = "after";
        ui.battleHud.classList.add("hidden");
        ui.objective.textContent = "Step into the rift, or go back home.";

        gamification.addPoints(1000, "Historical battle won!", { color: "gold" });
        gamification.addStability(35);

        narrate(
          storyLines(era.debrief),
          () => {
            openPortal();
            astraLine("The rift is open. Step through to the next age, or go back home.");
          },
        );
      },
    });

    ui.allyLabel.textContent = era.allies.name;
    ui.enemyLabel.textContent = era.enemies.name;
    ui.battleHud.classList.remove("hidden");

    if (eraId === "sekigahara") {
      for (let i = 0; i < 8; i++) window.setTimeout(() => playSfx("drum", 25), i * 450);
    } else {
      playSfx("horn", 25);
    }
  }

  function onPlayerHit(damage: number, from: THREE.Vector3): void {
    if (game.phase !== "battle") return;
    const k = dodgeTime > 0 ? 0.25 : 1;
    const actualDamage = damage * k;
    game.hp = Math.max(0, game.hp - actualDamage);
    gamification.takeDamage(Math.round(actualDamage));
    playSfx("hit", 0);
    shake = Math.max(shake, 0.25);
    ui.hurt.style.opacity = String(Math.min(0.9, 0.35 + actualDamage / 60));

    const dir = new THREE.Vector3().subVectors(player.root.position, from).setY(0).normalize();
    player.flinch = 0.3;
    player.root.position.addScaledVector(dir, 0.15);

    if (game.hp < 35 && !game.warnedHp) {
      game.warnedHp = true;
      astraLine(era.callouts.lowHp);
    }

    if (game.hp <= 0) {
      game.phase = "prebattle";
      astraLine("You fell in the fight. I am holding the continuum for a moment… Stay with your brothers in arms!");
      ui.splash.classList.remove("fade");
      ui.loaderText.textContent = "Rewinding time…";
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
    ui.ammo.textContent = r ? `${r.label}: ${game.ammo}${game.reload > 0 ? " (reloading…)" : ""}` : "";
  }

  function playerMelee(): void {
    if (player.attack > 0) return;
    player.attack = 0.35;
    if (battle && game.phase === "battle") {
      window.setTimeout(() => {
        battle?.playerStrike(player.root.position, player.root.rotation.y, eraId === "austerlitz" ? 50 : 40);
      }, 150);
    }
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

  function playerDodge(): void {
    if (dodgeTime > 0) return;
    dodgeTime = 0.38;
    gamification.registerDodge();
  }

  // ---- Mobile & Touch Controls ----
  const touch = new TouchControls({
    onAttack: () => playerMelee(),
    onDodge: () => playerDodge(),
    onTalk: (target) => {
      if (canTalkToLeader()) openChat(target);
      else openChat("astra");
    },
    onMicStart: () => void listen("ptt"),
    onMicEnd: () => void mic.stop(),
    onWarTrigger: () => {
      if (game.phase === "meet") callToWar();
      else if (game.phase === "prebattle") startBattle();
    },
    onJournalToggle: () => gamification.toggleJournal(),
    onCameraRotate: (deltaYaw, deltaPitch) => {
      camYaw -= deltaYaw;
      camPitch = THREE.MathUtils.clamp(camPitch + deltaPitch, -0.35, 0.9);
    },
  });

  // ---- Keyboard & Mouse Inputs ----
  const keys: Record<string, boolean> = {};
  let camYaw = Math.PI;
  let camPitch = 0.12;
  let dodgeTime = 0;

  const GAME_KEYS = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyB"]);
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
    } else if (e.code === "KeyE" && game.phase === "meet" && canTalkToLeader()) {
      e.preventDefault();
      talk(LEADER, "I stand with you. Let us fight.");
    } else if (e.code === "KeyT") {
      e.preventDefault();
      openChat("astra");
    } else if (e.code === "KeyB") {
      e.preventDefault();
      if (game.phase === "meet") callToWar();
      else if (game.phase === "prebattle") startBattle();
    } else if (e.code === "KeyV") {
      e.preventDefault();
      void listen("ptt");
    } else if (e.code === "Space") {
      e.preventDefault();
      playerDodge();
    }
  });

  addEventListener("keyup", (e) => {
    keys[e.code] = false;
    if (e.code === "KeyV" && mic.listening) void (game.talkingTo ? listen("vad") : mic.stop());
  });

  let mouseButtons = 0;
  const releasePointer = () => {
    mouseButtons = 0;
    if (document.pointerLockElement) document.exitPointerLock();
  };
  addEventListener("mouseup", (e) => {
    mouseButtons &= ~(1 << e.button);
  });
  addEventListener("blur", releasePointer);
  document.addEventListener("pointerlockchange", () => {
    if (!document.pointerLockElement) mouseButtons = 0;
  });
  renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
  renderer.domElement.addEventListener("mousedown", (e) => {
    if (game.talkingTo) return;
    mouseButtons |= 1 << e.button;
    if (e.button === 0) playerMelee();
    if (e.button === 2) playerRanged();
  });

  function canTalkToLeader(): boolean {
    return player.root.position.distanceTo(achilles.root.position) < TALK_RANGE && (troy || game.phase === "meet" || game.phase === "after");
  }

  addEventListener("mousemove", (e) => {
    if (mouseButtons === 0) return;
    camYaw -= e.movementX * 0.004;
    camPitch = THREE.MathUtils.clamp(camPitch + e.movementY * 0.003, -0.35, 0.9);
  });

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    syncFxaa();
  });

  // ---- Loop Vectors ----
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

    // Movement: keyboard + touch joystick
    const tMove = touch.getMoveInput();
    const forward = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + tMove.forward;
    const strafe = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + tMove.strafe;
    move.set(-strafe, 0, forward);
    const moving = move.lengthSq() > 0.01 || dodgeTime > 0;

    if (move.lengthSq() > 0.01) {
      move.normalize().applyAxisAngle(up, camYaw);
      const run = keys.ShiftLeft || keys.ShiftRight || tMove.run;
      const speed = (run ? 5.2 : 2.0) * (dodgeTime > 0 ? 2.8 : 1);
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
      portal.rotation.x = Math.sin(t * 0.8) * 0.2;
      if (nextTarget && p.distanceTo(portal.position) < 2.4 && Math.abs(p.z - portal.position.z) < 1.2) {
        travel();
      }
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

    gamification.update(dt);
    world.update(dt, t, camera, p);
  }

  camPos.set(player.root.position.x, player.root.position.y + 2, player.root.position.z - 4);

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __dbg: {
        player, achilles, voices, mic, game, callToWar, gamification,
        battle: () => battle,
        setView: (yaw: number, pitch: number) => ((camYaw = yaw), (camPitch = pitch)),
      },
    });
  }

  renderer.compile(scene, camera);
  update(0.016, 0);

  ui.loaderText.textContent = "Era synchronized.";
  ui.start.classList.remove("hidden");
  ui.start.addEventListener("click", () => {
    ui.splash.classList.add("fade");
    resumeAudio();
    ui.objective.textContent = "Listen to Astra. Then one line to the leader.";

    narrate(
      storyLines(era.intro),
      () => {
        game.phase = "meet";
        ui.objective.textContent = `Speak once to ${era.leader.name} (press E). The fight follows.`;
        astraLine(`Go to ${era.leader.name}. One sentence is enough, and we go to battle.`);
      },
    );
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
  ui.loaderText.textContent = `Load error: ${(err as Error).message}`;
});
