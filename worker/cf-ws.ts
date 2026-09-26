/** Minimal socket matching the bits of the `ws` client this server uses, backed by a Workers outbound WebSocket. */

type Listener = (...args: unknown[]) => void;

export let lastSocketError = "";

export class CfSocket {
  readyState = 0;
  private listeners: Record<string, Listener[]> = {};
  private raw: WebSocket | null = null;
  private dropped = false;

  constructor(
    private url: string,
    private headers: Record<string, string>,
    private setup: object,
  ) {
    void this.connect();
  }

  on(event: "message" | "error" | "close" | "open", fn: Listener): void {
    (this.listeners[event] ??= []).push(fn);
  }

  send(data: string): void {
    if (this.raw && this.readyState === WebSocket.OPEN) this.raw.send(data);
  }

  close(): void {
    this.dropped = true;
    try {
      this.raw?.close();
    } catch {}
  }

  terminate(): void {
    this.close();
  }

  private emit(event: string, ...args: unknown[]): void {
    for (const fn of this.listeners[event] ?? []) fn(...args);
  }

  private async connect(): Promise<void> {
    try {
      const httpsUrl = this.url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
      const resp = await fetch(httpsUrl, { headers: { Upgrade: "websocket", ...this.headers } });
      const raw = (resp as Response & { webSocket?: WebSocket | null }).webSocket;
      if (!raw) {
        const body = await resp.text().catch(() => "");
        throw new Error(`Gradium handshake failed (${resp.status}) ${body.slice(0, 180)}`);
      }
      raw.accept();
      this.raw = raw;
      this.readyState = WebSocket.OPEN;
      raw.addEventListener("message", (event) => {
        const data = typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);
        this.emit("message", data);
      });
      raw.addEventListener("close", () => {
        this.readyState = WebSocket.CLOSED;
        this.emit("close");
      });
      raw.addEventListener("error", () => {
        this.emit("error", new Error("gradium socket error"));
      });
      if (this.dropped) {
        raw.close();
        return;
      }
      raw.send(JSON.stringify({ type: "setup", model_name: "default", ...this.setup }));
      this.emit("open");
    } catch (err) {
      this.readyState = WebSocket.CLOSED;
      const error = err instanceof Error ? err : new Error(String(err));
      lastSocketError = error.message;
      this.emit("error", error);
      this.emit("close");
    }
  }
}
