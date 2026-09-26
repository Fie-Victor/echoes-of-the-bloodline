import type { ClientMessage, ServerMessage } from "../../shared/protocol.ts";

type Handler = (msg: ServerMessage) => void;

export class GameSocket {
  private ws: WebSocket | null = null;
  private queue: ClientMessage[] = [];

  constructor(private onMessage: Handler) {
    this.connect();
  }

  private connect(): void {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => {
      for (const m of this.queue.splice(0)) ws.send(JSON.stringify(m));
    };
    ws.onmessage = (e) => this.onMessage(JSON.parse(e.data as string) as ServerMessage);
    ws.onclose = () => setTimeout(() => this.connect(), 1000);
    this.ws = ws;
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    else this.queue.push(msg);
  }
}
