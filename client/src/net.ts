import type { ClientMessage, NpcRequest, NpcResponse, NpcState, ServerMessage } from "../../shared/protocol.ts";

type Handler = (msg: ServerMessage) => void;

const PUZZLE_LOCK_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { margin:0; background:transparent; color:#7ff; font-family:monospace; text-align:center; user-select:none; }
  h2 { margin:8px 0 4px; font-size:16px; letter-spacing:2px; color:#6ff; }
  p { margin:0 0 6px; font-size:12px; opacity:.85; }
  canvas { cursor:pointer; touch-action:none; }
</style></head><body>
<h2>VERROU TEMPOREL</h2>
<p>Touche les anneaux pour aligner les trois brèches vers le haut.</p>
<canvas id="c" width="260" height="260"></canvas>
<script>
  window.gameAPI = window.gameAPI || {
    onPuzzleSolved: (id) => parent.postMessage({ type: "puzzle_solved", puzzle_id: id }, "*"),
  };
  const c = document.getElementById("c"), g = c.getContext("2d");
  const STEP = Math.PI / 4, radii = [40, 70, 100];
  const rings = radii.map(() => (1 + Math.floor(Math.random() * 7)) * STEP);
  let solved = false;
  function draw() {
    g.clearRect(0, 0, 260, 260);
    radii.forEach((r, i) => {
      const gap = 0.5, start = rings[i] - Math.PI / 2 + gap / 2;
      g.beginPath(); g.lineWidth = 14;
      g.strokeStyle = solved ? "#6f6" : "rgba(120,255,255,.85)";
      g.arc(130, 130, r, start, start + Math.PI * 2 - gap); g.stroke();
    });
    g.fillStyle = "#ff6"; g.beginPath(); g.moveTo(130, 8); g.lineTo(124, 0); g.lineTo(136, 0); g.fill();
  }
  function handleInteract(clientX, clientY) {
    if (solved) return;
    const b = c.getBoundingClientRect();
    const d = Math.hypot(clientX - b.left - 130, clientY - b.top - 130);
    const i = radii.findIndex((r) => Math.abs(d - r) < 16);
    if (i < 0) return;
    rings[i] = (rings[i] + STEP) % (Math.PI * 2);
    if (rings.every((a) => a < 1e-6 || Math.abs(a - Math.PI * 2) < 1e-6)) {
      solved = true; draw();
      setTimeout(() => window.gameAPI.onPuzzleSolved("puzzle_lock"), 600);
    }
    draw();
  }
  c.addEventListener("click", (e) => handleInteract(e.clientX, e.clientY));
  c.addEventListener("touchstart", (e) => {
    if (e.touches.length > 0) {
      e.preventDefault();
      handleInteract(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: false });
  draw();
</script></body></html>`;

export class GameSocket {
  private ws: WebSocket | null = null;
  private queue: ClientMessage[] = [];
  private isOffline = false;
  private trustLevels: Record<string, number> = { achilles_01: 45, astra: 100 };
  private achillesState: NpcState = "idle";
  private offlineSpeechRec: any = null;
  private speechTargetNpc = "astra";
  private serverUrl: string;

  constructor(private onMessage: Handler) {
    const params = new URLSearchParams(window.location.search);
    const customServer = params.get("server") || params.get("ws");
    if (customServer) {
      this.serverUrl = customServer;
    } else {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      this.serverUrl = `${proto}://${location.host}/ws`;
    }
    this.connect();
  }

  private connect(): void {
    // If not local host and no custom server explicitly given, don't stall forever on itch.io CDN
    const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    const hasCustomServer = new URLSearchParams(window.location.search).has("server");

    try {
      const ws = new WebSocket(this.serverUrl);
      const connTimeout = window.setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          this.activateOfflineMode();
        }
      }, isLocal || hasCustomServer ? 2500 : 1200);

      ws.onopen = () => {
        clearTimeout(connTimeout);
        this.isOffline = false;
        console.log("[net] Connected to backend server at", this.serverUrl);
        for (const m of this.queue.splice(0)) ws.send(JSON.stringify(m));
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as ServerMessage;
          this.onMessage(msg);
        } catch {}
      };

      ws.onerror = () => {
        clearTimeout(connTimeout);
        this.activateOfflineMode();
      };

      ws.onclose = () => {
        clearTimeout(connTimeout);
        this.activateOfflineMode();
        // Retry connection less aggressively
        setTimeout(() => this.connect(), 8000);
      };

      this.ws = ws;
    } catch {
      this.activateOfflineMode();
    }
  }

  private activateOfflineMode(): void {
    if (!this.isOffline) {
      this.isOffline = true;
      console.log("[net] Standalone / itch.io offline simulation active.");
    }
    // Process any queued messages locally
    while (this.queue.length > 0) {
      const msg = this.queue.shift();
      if (msg) this.handleOfflineMessage(msg);
    }
  }

  send(msg: ClientMessage): void {
    if (!this.isOffline && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else if (this.isOffline) {
      this.handleOfflineMessage(msg);
    } else {
      this.queue.push(msg);
    }
  }

  private handleOfflineMessage(msg: ClientMessage): void {
    if (msg.type === "talk") {
      this.handleOfflineTalk(msg.request);
    } else if (msg.type === "say") {
      // Local speech playback fallback
      this.onMessage({ type: "speech_end", npc_id: msg.npc_id, ok: false, text: msg.text });
    } else if (msg.type === "stop_speech") {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try { speechSynthesis.cancel(); } catch {}
      }
    } else if (msg.type === "voice_start") {
      this.handleOfflineVoiceStart(msg.npc_id);
    } else if (msg.type === "voice_end") {
      this.handleOfflineVoiceEnd();
    } else if (msg.type === "puzzle_solved") {
      console.log("[net] Local offline puzzle solved:", msg.puzzle_id);
    }
  }

  private handleOfflineTalk(req: NpcRequest): void {
    const npcId = req.npc_id;
    const input = req.player_input.trim();
    const lower = input.toLowerCase();

    let response: NpcResponse;

    if (npcId === "astra") {
      if (/(combat|guerre|bataille|achille|aide|stratégie|plan)/i.test(lower)) {
        response = {
          dialogue: "Achille est un colosse fier et blessé dans son honneur. Propose-lui de charger ensemble pour sauver les vaisseaux : sa soif de gloire immortelle fera le reste !",
          npc_state: "friendly",
          new_trust: 100,
          trigger_devin_ui: null,
          trigger_war: false,
        };
      } else if (/(faille|époque|anachronisme|temps|mission|continuum)/i.test(lower)) {
        response = {
          dialogue: "Agent, nous sommes en 1184 av. J.-C. devant Troie. Les navires achéens risquent de brûler. Empêche la chronologie de sombrer !",
          npc_state: "friendly",
          new_trust: 100,
          trigger_devin_ui: null,
          trigger_war: false,
        };
      } else if (/(verrou|tente|sceau|relique)/i.test(lower)) {
        response = {
          dialogue: "Le verrou temporel de la tente d'Achille résonne avec notre drone. Gagne sa confiance pour l'examiner de près.",
          npc_state: "friendly",
          new_trust: 100,
          trigger_devin_ui: null,
          trigger_war: false,
        };
      } else {
        response = {
          dialogue: "Agent, je surveille les mouvements ennemis. Achille hésite encore près du feu : parle-lui de bravoure et propose ton aide !",
          npc_state: "friendly",
          new_trust: 100,
          trigger_devin_ui: null,
          trigger_war: false,
        };
      }
    } else {
      // Achilles dialogue simulation
      const curTrust = this.trustLevels.achilles_01 ?? 45;

      if (
        /(combat|guerre|bataille|charge|lance|arme|navire|vaisseau|troyen|gloire|aide|allons|mort|ennemi)/i.test(lower) ||
        curTrust >= 75
      ) {
        this.achillesState = "friendly";
        this.trustLevels.achilles_01 = Math.min(100, curTrust + 20);
        response = {
          dialogue: "Par les dieux ! Ta voix porte le feu du courage ! Les Troyens ne brûleront pas nos nefs ! Prends ta lance, étranger : SUIS-MOI AU COMBAT !",
          npc_state: "friendly",
          new_trust: this.trustLevels.achilles_01,
          trigger_devin_ui: null,
          trigger_war: true,
        };
      } else if (/(agamemnon|briséis|briseis)/i.test(lower)) {
        this.achillesState = "suspicious";
        this.trustLevels.achilles_01 = Math.min(100, curTrust + 10);
        response = {
          dialogue: "Ce roi sans honneur a bafoué mon nom. Mais si les vaisseaux brûlent, tous nos hommes périront. Tu as du cran d'évoquer cette querelle.",
          npc_state: "suspicious",
          new_trust: this.trustLevels.achilles_01,
          trigger_devin_ui: null,
          trigger_war: false,
        };
      } else if (/(respect|honneur|héros|vaillance|force|légende|bravoure)/i.test(lower)) {
        this.achillesState = "friendly";
        this.trustLevels.achilles_01 = Math.min(100, curTrust + 15);
        response = {
          dialogue: "Tu parles en homme de valeur. Mon bras démange d'écraser les insolents qui menacent notre camp.",
          npc_state: "friendly",
          new_trust: this.trustLevels.achilles_01,
          trigger_devin_ui: null,
          trigger_war: false,
        };
      } else if (/(sceau|tente|verrou|mystère|relique|artefact)/i.test(lower) && curTrust >= 55) {
        this.achillesState = "friendly";
        this.trustLevels.achilles_01 = Math.min(100, curTrust + 5);
        response = {
          dialogue: "Un étrange artefact de bronze luit dans ma tente. Si tu combats à mes côtés, je te laisserai l'examiner.",
          npc_state: "friendly",
          new_trust: this.trustLevels.achilles_01,
          trigger_devin_ui: "generate_puzzle_lock",
          trigger_war: false,
        };
      } else if (/(lâche|peur|faible|traître|idiot|fuis)/i.test(lower)) {
        this.achillesState = "angry";
        this.trustLevels.achilles_01 = Math.max(10, curTrust - 25);
        response = {
          dialogue: "Ose répéter cela et ma javeline transpercera ta gorge avant que le soleil ne décline !",
          npc_state: "angry",
          new_trust: this.trustLevels.achilles_01,
          trigger_devin_ui: null,
          trigger_war: false,
        };
      } else {
        this.achillesState = "idle";
        response = {
          dialogue: "Je suis Achille. Si tu cherches un lâche, va voir Agamemnon. Si tu cherches la gloire et l'acier, parle franchement.",
          npc_state: "idle",
          new_trust: curTrust,
          trigger_devin_ui: null,
          trigger_war: false,
        };
      }
    }

    // Small delay to simulate thinking realism
    setTimeout(() => {
      this.onMessage({
        type: "npc_reply",
        npc_id: npcId,
        response,
        source: "mock",
      });
      this.onMessage({
        type: "speech_end",
        npc_id: npcId,
        ok: false,
        text: response.dialogue,
      });

      if (response.trigger_devin_ui === "generate_puzzle_lock") {
        this.onMessage({
          type: "hologram",
          puzzle_id: "puzzle_lock",
          html: PUZZLE_LOCK_HTML,
        });
      }
    }, 280);
  }

  private handleOfflineVoiceStart(npcId: string): void {
    this.speechTargetNpc = npcId;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      this.onMessage({
        type: "transcript",
        text: "(Reconnaissance vocale non supportée sur ce navigateur, utilisez le clavier ou les choix rapides)",
        final: true,
      });
      return;
    }

    try {
      this.offlineSpeechRec?.abort();
      const rec = new SpeechRecognition();
      rec.lang = "fr-FR";
      rec.continuous = false;
      rec.interimResults = true;

      rec.onstart = () => {
        this.onMessage({ type: "transcript", text: "…", final: false });
      };

      rec.onresult = (e: any) => {
        const result = e.results[0];
        const text = result[0]?.transcript || "";
        const isFinal = result.isFinal;
        this.onMessage({ type: "transcript", text, final: isFinal });
        if (isFinal && text) {
          this.handleOfflineTalk({
            npc_id: this.speechTargetNpc,
            player_input: text,
            game_context: { era: "troy", player_inventory: [], npc_trust: this.trustLevels[this.speechTargetNpc] ?? 50 },
          });
        }
      };

      rec.onerror = () => {
        this.onMessage({ type: "transcript", text: "(Micro inaudible)", final: true });
      };

      this.offlineSpeechRec = rec;
      rec.start();
    } catch {
      this.onMessage({ type: "transcript", text: "(Accès micro indisponible)", final: true });
    }
  }

  private handleOfflineVoiceEnd(): void {
    try {
      this.offlineSpeechRec?.stop();
    } catch {}
  }
}
