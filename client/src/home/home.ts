import "./home.css";
import type { HomeClientMessage, HomeServerMessage } from "../../../shared/home-protocol.ts";
import { MicCapture, type MicError } from "./audio.ts";
import { ERAS, type Era } from "./eras.ts";
import { Sky } from "./sky.ts";
import { Speaker } from "./speaker.ts";
import { CommandParser, commandKeywords, echoWords, type VoiceCommand } from "./voice.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const INTRO = [
  "Bienvenue, voyageur. Je suis Astra, ton drone de lignée.",
  "Le temps s'est fracturé. À chaque époque, un conflit menace de réécrire l'histoire de tes ancêtres.",
  "Ta mission : traverser les siècles, parler aux grandes figures du passé, gagner leur confiance et apaiser ces conflits avant que ta lignée ne s'efface.",
  "Devant toi s'étend la frise du temps. Fais défiler les époques avec la molette, ou dis simplement : gauche, ou droite.",
  "Quand une époque t'appelle, clique sur sa carte, ou dis : entrer dans cette époque.",
];

const MIC_ERRORS: Record<MicError, string> = {
  denied: "Micro refusé — autorise-le dans la barre d'adresse",
  "no-device": "Aucun micro détecté",
  insecure: "Micro indisponible (page non sécurisée, utilise https)",
  unsupported: "Micro non pris en charge par ce navigateur",
  unknown: "Micro indisponible",
};

// ---------- connection ----------
let ws: WebSocket;
const outbox: HomeClientMessage[] = [];
const send = (m: HomeClientMessage) => {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  else if (m.type !== "listen_audio") outbox.push(m);
};

const subtitleEl = $<HTMLParagraphElement>("subtitle");
const speaker = new Speaker(send, (text) => {
  subtitleEl.textContent = text;
  subtitleEl.classList.toggle("show", Boolean(text));
});

const highScoreBanner = $("high-score-banner");
try {
  const savedScore = Number(localStorage.getItem("echoes_high_score") ?? 0);
  if (savedScore > 0 && highScoreBanner) {
    highScoreBanner.innerHTML = `✦ Record de Continuum : <strong>${savedScore.toLocaleString()} pts</strong>`;
    highScoreBanner.classList.remove("hidden");
  }
} catch {}

function connect(): void {
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/home`);
  ws.onopen = () => {
    for (const m of outbox.splice(0)) ws.send(JSON.stringify(m));
    if (mic.active) send({ type: "listen_start", language: "fr", keywords: commandKeywords(ERAS) });
  };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data as string) as HomeServerMessage;
    speaker.handle(m);
    if (m.type === "transcript") onTranscript(m.text);
    else if (m.type === "listening") mic.setReady(m.ready);
    else if (m.type === "error") mic.setStatus(m.message, "error");
  };
  ws.onclose = () => setTimeout(connect, 1000);
}

// ---------- cards & timeline ----------
const cardsEl = $("cards");
const nodesEl = $("nodes");
let index = Math.max(0, ERAS.findIndex((e) => e.url));
let entering = false;

let wasDragging = false;

const cardEls = ERAS.map((era, i) => {
  const el = document.createElement("article");
  el.className = "card";
  el.style.setProperty("--accent", era.accent);
  el.innerHTML = `
    <div class="art" style="background-image:url(eras/${era.id}.jpg)"></div>
    <div class="shade"></div>
    ${era.url ? "" : '<span class="badge">Faille instable</span>'}
    <div class="body">
      <span class="year">${era.year}</span>
      <h2>${era.place}</h2>
      <h3>${era.title}</h3>
      <p class="conflict">${era.conflict}</p>
      <span class="figure">Figure : ${era.figure}</span>
      <span class="cta">${era.url ? "Entrer dans cette époque" : "Bientôt accessible"}</span>
    </div>`;
  el.addEventListener("click", (e) => {
    if (wasDragging) return;
    if (i === index) enter();
    else focus(i);
  });
  const ctaBtn = el.querySelector(".cta");
  ctaBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (wasDragging) return;
    if (i !== index) focus(i);
    void enter();
  });
  cardsEl.appendChild(el);
  return el;
});

const minYear = Math.min(...ERAS.map((e) => e.yearValue));
const maxYear = Math.max(...ERAS.map((e) => e.yearValue));
// Compress the timeline so ancient eras are not squashed together: position ∝ sign·|y|^0.6 blended with rank.
const posOf = (i: number) => {
  const y = ERAS[i].yearValue;
  const lin = (y - minYear) / (maxYear - minYear);
  return 0.06 + 0.88 * (0.35 * lin + 0.65 * (i / (ERAS.length - 1)));
};

const nodeEls = ERAS.map((era, i) => {
  const b = document.createElement("button");
  b.className = "node";
  b.style.left = `${posOf(i) * 100}%`;
  b.innerHTML = `<span class="pin"></span><span class="lbl">${era.year}</span><span class="plc">${era.place}</span>`;
  b.addEventListener("click", () => focus(i));
  nodesEl.appendChild(b);
  return b;
});

function layout(): void {
  const w = Math.min(window.innerWidth, 1600);
  const spread = Math.max(210, w * 0.22);
  cardEls.forEach((el, i) => {
    const d = i - index;
    const a = Math.abs(d);
    el.style.transform = `translate(-50%, -50%) translateX(${d * spread}px) translateZ(${-a * 180}px) rotateY(${-Math.sign(d) * Math.min(a, 2) * 16}deg) scale(${a === 0 ? 1 : 0.86})`;
    el.style.opacity = a > 3 ? "0" : String(1 - Math.min(a, 3) * 0.26);
    el.style.filter = a === 0 ? "none" : `saturate(${0.45 - Math.min(a, 2) * 0.1}) brightness(${0.62 - Math.min(a, 2) * 0.1}) blur(${Math.min(a, 2) * 1.2}px)`;
    el.style.zIndex = String(100 - a);
    el.classList.toggle("focused", a === 0);
    el.setAttribute("aria-current", a === 0 ? "true" : "false");
  });
  nodeEls.forEach((n, i) => n.classList.toggle("active", i === index));
  $("railGlow").style.width = `${posOf(index) * 100}%`;
  document.body.style.setProperty("--era-accent", ERAS[index].accent);
  sky.setAccent(ERAS[index].accent);
}

let focusVoiceTimer = 0;
function focus(i: number, silent = false): void {
  const next = Math.max(0, Math.min(ERAS.length - 1, i));
  if (next === index || entering) return;
  index = next;
  layout();
  if (!started || silent) return;
  clearTimeout(focusVoiceTimer);
  focusVoiceTimer = window.setTimeout(() => {
    $("skip").hidden = true;
    void speaker.say([ERAS[index].voiceLine]);
  }, 380);
}

async function enter(): Promise<void> {
  if (entering || !started) return;
  const era: Era = ERAS[index];
  clearTimeout(focusVoiceTimer);
  const card = cardEls[index];
  if (!era.url) {
    card.classList.remove("shake");
    void card.offsetWidth;
    card.classList.add("shake");
    void speaker.say([`La faille vers ${era.place} est encore instable. Pour l'instant, seule Troie est accessible.`]);
    return;
  }
  entering = true;
  mic.stop();
  card.classList.add("chosen");
  $("warpTitle").innerHTML = `<small>${era.year}</small>${era.place}`;
  document.body.classList.add("warping");
  sky.warp();
  const spoken = speaker.say([`Ouverture de la faille temporelle. Destination : ${era.place}, ${era.year.replace("av. J.-C.", "avant notre ère")}.`]);
  await Promise.race([spoken, new Promise((r) => setTimeout(r, 7000))]);
  await new Promise((r) => setTimeout(r, 400));
  location.href = era.url;
}

// ---------- mouse / keyboard ----------
let wheelLock = 0;
window.addEventListener(
  "wheel",
  (e) => {
    if (!started) return;
    e.preventDefault();
    const now = performance.now();
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (now < wheelLock || Math.abs(delta) < 8) return;
    wheelLock = now + 420;
    focus(index + Math.sign(delta));
  },
  { passive: false },
);

let dragX: number | null = null;
let dragStartX = 0;

$("stage").addEventListener("pointerdown", (e) => {
  dragX = e.clientX;
  dragStartX = e.clientX;
  wasDragging = false;
});

window.addEventListener("pointermove", (e) => {
  if (dragX === null) return;
  if (Math.abs(e.clientX - dragStartX) > 12) {
    wasDragging = true;
  }
});

window.addEventListener("pointerup", (e) => {
  if (dragX === null) return;
  const dx = e.clientX - dragX;
  dragX = null;
  if (Math.abs(dx) > 50) {
    focus(index - Math.sign(dx));
  }
  setTimeout(() => (wasDragging = false), 60);
});

window.addEventListener("pointercancel", () => {
  dragX = null;
  setTimeout(() => (wasDragging = false), 60);
});

// Mobile touch gestures directly on stage
let touchStartX = 0;
let touchStartY = 0;
$("stage").addEventListener(
  "touchstart",
  (e) => {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      wasDragging = false;
    }
  },
  { passive: true },
);

$("stage").addEventListener(
  "touchmove",
  (e) => {
    if (e.touches.length === 1) {
      const dx = e.touches[0].clientX - touchStartX;
      const dy = e.touches[0].clientY - touchStartY;
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
        wasDragging = true;
      }
    }
  },
  { passive: true },
);

$("stage").addEventListener(
  "touchend",
  (e) => {
    if (e.changedTouches.length === 1) {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 50) {
        focus(index - Math.sign(dx));
      }
      setTimeout(() => (wasDragging = false), 60);
    }
  },
  { passive: true },
);

window.addEventListener("keydown", (e) => {
  if (!started) return;
  if (e.key === "ArrowLeft" || e.key === "q" || e.key === "a") focus(index - 1);
  else if (e.key === "ArrowRight" || e.key === "d") focus(index + 1);
  else if (e.key === "Enter") void enter();
  else if (e.key === "Escape") skipIntro();
  else return;
  e.preventDefault();
});
$("prev").addEventListener("click", () => focus(index - 1));
$("next").addEventListener("click", () => focus(index + 1));

// ---------- voice ----------
const parser = new CommandParser(ERAS);
const heardEl = $("heard");
let heardTimer = 0;

function onTranscript(text: string): void {
  heardEl.textContent = `« ${text} »`;
  heardEl.classList.add("show");
  clearTimeout(heardTimer);
  heardTimer = window.setTimeout(() => heardEl.classList.remove("show"), 2200);
  const echo = speaker.speaking ? echoWords(speaker.current) : new Set<string>();
  for (const c of parser.feed(text, echo)) run(c);
}

function run(c: VoiceCommand): void {
  if (c.kind === "prev") focus(index - 1);
  else if (c.kind === "next") focus(index + 1);
  else if (c.kind === "focus") focus(c.index);
  else if (c.kind === "enter") void enter();
  else if (c.kind === "skip") skipIntro();
  else if (c.kind === "repeat") void playIntro();
}

class MicController {
  private capture = new MicCapture();
  active = false;
  private el = $("mic");
  private label = $("micLabel");
  private toggle = $<HTMLButtonElement>("micToggle");

  constructor() {
    this.toggle.addEventListener("click", () => (this.active ? this.stop() : void this.start()));
  }

  setStatus(text: string, state: "off" | "pending" | "on" | "error"): void {
    this.label.textContent = text;
    this.el.className = `mic ${state}`;
    this.toggle.textContent = this.active ? "Couper" : "Activer";
  }

  setReady(ready: boolean): void {
    if (!this.active) return;
    if (ready) this.setStatus("À l'écoute — « gauche », « droite », « entrer »", "on");
    else this.setStatus("Reconnexion au micro…", "pending");
  }

  async start(): Promise<void> {
    this.setStatus("Autorisation du micro…", "pending");
    const err = await this.capture.start((b64) => send({ type: "listen_audio", audio: b64 }));
    if (err) {
      this.active = false;
      this.setStatus(MIC_ERRORS[err], "error");
      return;
    }
    this.active = true;
    this.setStatus("Connexion à Gradium…", "pending");
    send({ type: "listen_start", language: "fr", keywords: commandKeywords(ERAS) });
  }

  stop(): void {
    this.capture.stop();
    if (this.active) send({ type: "listen_stop" });
    this.active = false;
    this.setStatus("Micro inactif", "off");
  }

  get level(): number {
    return this.active ? this.capture.level : 0;
  }
}

// ---------- intro ----------
let started = false;
const mic = new MicController();
const sky = new Sky($<HTMLCanvasElement>("sky"));

async function playIntro(): Promise<void> {
  $("skip").hidden = false;
  await speaker.say(INTRO);
  $("skip").hidden = true;
}

function skipIntro(): void {
  $("skip").hidden = true;
  speaker.interrupt();
}
$("skip").addEventListener("click", skipIntro);

$("start").addEventListener("click", async () => {
  started = true;
  await speaker.player.resume();
  document.body.classList.add("started");
  void mic.start();
  void playIntro();
});

// Astra orb visualiser: speaker output + mic level.
const waveCanvas = $<HTMLCanvasElement>("astraWave");
const wave = waveCanvas.getContext("2d")!;
const freq = new Uint8Array(speaker.player.analyser.frequencyBinCount);
(function drawOrb() {
  speaker.player.analyser.getByteFrequencyData(freq);
  let e = 0;
  for (let i = 2; i < 40; i++) e += freq[i];
  const out = e / (38 * 255);
  const lvl = Math.max(out, mic.level * 3);
  $("astra").classList.toggle("speaking", out > 0.04);
  wave.clearRect(0, 0, 64, 64);
  for (let k = 0; k < 3; k++) {
    wave.beginPath();
    wave.arc(32, 32, 12 + k * 6 + lvl * 16 * (1 - k * 0.25), 0, Math.PI * 2);
    wave.strokeStyle = `rgba(140, 220, 255, ${0.8 - k * 0.25})`;
    wave.lineWidth = 2;
    wave.stroke();
  }
  requestAnimationFrame(drawOrb);
})();

window.addEventListener("resize", layout);
layout();
connect();
