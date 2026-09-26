import type { ClientMessage, NpcRequest, NpcResponse, NpcState, ServerMessage } from "../../shared/protocol.ts";

type Handler = (msg: ServerMessage) => void;

const PUZZLE_LOCK_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { margin:0; background:transparent; color:#7ff; font-family:monospace; text-align:center; user-select:none; }
  h2 { margin:8px 0 4px; font-size:16px; letter-spacing:2px; color:#6ff; }
  p { margin:0 0 6px; font-size:12px; opacity:.85; }
  canvas { cursor:pointer; touch-action:none; }
</style></head><body>
<h2>TEMPORAL LOCK</h2>
<p>Touch the rings to line the three gaps up.</p>
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
    // VITE_WS_BASE n'est défini que pour les builds hébergés sans backend (itch.io).
    const base = import.meta.env.VITE_WS_BASE as string | undefined;
    if (customServer) {
      this.serverUrl = customServer;
    } else if (base) {
      this.serverUrl = `${base.replace(/\/$/, "")}/ws`;
    } else {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      this.serverUrl = `${proto}://${location.host}/ws`;
    }
    this.connect();
  }

  private connect(): void {
    try {
      const ws = new WebSocket(this.serverUrl);
      // Au-delà du délai (démarrage à froid du backend inclus), on bascule en simulation locale.
      const connTimeout = window.setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) this.activateOfflineMode();
      }, 8000);

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
      if (/(fight|battle|war|achilles|help|plan)/i.test(lower)) {
        response = {
          dialogue: "Achilles is a proud giant, wounded in his honor. Offer to charge with him and save the ships. His hunger for immortal glory will do the rest.",
          npc_state: "friendly",
          new_trust: 100,
          trigger_devin_ui: null,
          trigger_war: false,
        };
      } else if (/(rift|era|anachronism|time|mission|continuum)/i.test(lower)) {
        response = {
          dialogue: "Agent, it is 1184 BCE, before Troy. The Achaean ships may burn. Do not let the timeline collapse.",
          npc_state: "friendly",
          new_trust: 100,
          trigger_devin_ui: null,
          trigger_war: false,
        };
      } else if (/(lock|tent|seal|relic)/i.test(lower)) {
        response = {
          dialogue: "The temporal lock in Achilles' tent resonates with our drone. Earn his trust so we can examine it.",
          npc_state: "friendly",
          new_trust: 100,
          trigger_devin_ui: null,
          trigger_war: false,
        };
      } else {
        response = {
          dialogue: "Agent, I am watching the enemy. Achilles is still hesitating by the fire. Speak to him of courage, and offer your help.",
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
        /(fight|battle|war|charge|spear|weapon|ship|trojan|glory|help|enemy|stand with you)/i.test(lower) ||
        curTrust >= 75
      ) {
        this.achillesState = "friendly";
        this.trustLevels.achilles_01 = Math.min(100, curTrust + 20);
        response = {
          dialogue: "By the gods! Your voice carries the fire of courage! The Trojans will not burn our ships! Take your spear, stranger: FOLLOW ME TO BATTLE!",
          npc_state: "friendly",
          new_trust: this.trustLevels.achilles_01,
          trigger_devin_ui: null,
          trigger_war: true,
        };
      } else if (/(agamemnon|briséis|briseis)/i.test(lower)) {
        this.achillesState = "suspicious";
        this.trustLevels.achilles_01 = Math.min(100, curTrust + 10);
        response = {
          dialogue: "That king without honor spat on my name. But if the ships burn, every man of ours dies. You have nerve, to raise that quarrel.",
          npc_state: "suspicious",
          new_trust: this.trustLevels.achilles_01,
          trigger_devin_ui: null,
          trigger_war: false,
        };
      } else if (/(respect|honor|honour|hero|valor|strength|legend|courage)/i.test(lower)) {
        this.achillesState = "friendly";
        this.trustLevels.achilles_01 = Math.min(100, curTrust + 15);
        response = {
          dialogue: "You speak like a man of worth. My arm itches to crush the insolent men threatening our camp.",
          npc_state: "friendly",
          new_trust: this.trustLevels.achilles_01,
          trigger_devin_ui: null,
          trigger_war: false,
        };
      } else if (/(seal|tent|lock|mystery|relic|artifact)/i.test(lower) && curTrust >= 55) {
        this.achillesState = "friendly";
        this.trustLevels.achilles_01 = Math.min(100, curTrust + 5);
        response = {
          dialogue: "A strange bronze artifact glows in my tent. Fight beside me, and I will let you examine it.",
          npc_state: "friendly",
          new_trust: this.trustLevels.achilles_01,
          trigger_devin_ui: "generate_puzzle_lock",
          trigger_war: false,
        };
      } else if (/(coward|afraid|weak|traitor|fool|flee)/i.test(lower)) {
        this.achillesState = "angry";
        this.trustLevels.achilles_01 = Math.max(10, curTrust - 25);
        response = {
          dialogue: "Say that again and my javelin will pierce your throat before the sun goes down!",
          npc_state: "angry",
          new_trust: this.trustLevels.achilles_01,
          trigger_devin_ui: null,
          trigger_war: false,
        };
      } else {
        this.achillesState = "idle";
        response = {
          dialogue: "I am Achilles. If you want a coward, go to Agamemnon. If you want glory and steel, speak plainly.",
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
        text: "(Speech recognition is not supported in this browser. Use the keyboard.)",
        final: true,
      });
      return;
    }

    try {
      this.offlineSpeechRec?.abort();
      const rec = new SpeechRecognition();
      rec.lang = "en-US";
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
        this.onMessage({ type: "transcript", text: "(Microphone inaudible)", final: true });
      };

      this.offlineSpeechRec = rec;
      rec.start();
    } catch {
      this.onMessage({ type: "transcript", text: "(Microphone unavailable)", final: true });
    }
  }

  private handleOfflineVoiceEnd(): void {
    try {
      this.offlineSpeechRec?.stop();
    } catch {}
  }
}
