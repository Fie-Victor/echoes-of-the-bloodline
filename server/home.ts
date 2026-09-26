import type { WebSocket } from "ws";
import type { HomeClientMessage, HomeServerMessage } from "../shared/home-protocol.ts";
import { CommandListener, SAMPLE_RATE, VOICES, gradiumEnabled, synthesize } from "./gradium.ts";

/** Home page socket: Astra's narration (TTS) and continuous voice commands (STT). */
export function handleHomeSocket(socket: WebSocket): void {
  const send = (m: HomeServerMessage) => socket.readyState === socket.OPEN && socket.send(JSON.stringify(m));
  const speeches = new Map<number, () => void>();
  let listener: CommandListener | null = null;

  const stopSpeech = () => {
    for (const cancel of speeches.values()) cancel();
    speeches.clear();
  };

  send({ type: "hello", tts: gradiumEnabled(), stt: gradiumEnabled() });

  socket.on("message", (raw) => {
    let msg: HomeClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as HomeClientMessage;
    } catch {
      return;
    }
    switch (msg.type) {
      case "say": {
        const { id } = msg;
        if (!gradiumEnabled()) {
          send({ type: "speech_end", id, ok: false });
          break;
        }
        const job = synthesize(msg.text, msg.voice ?? VOICES.astra, (audio) => send({ type: "speech_audio", id, audio, sample_rate: SAMPLE_RATE }));
        speeches.set(id, job.cancel);
        void job.done.then((ok) => {
          if (speeches.delete(id)) send({ type: "speech_end", id, ok });
        });
        break;
      }
      case "stop_speech":
        stopSpeech();
        break;
      case "listen_start":
        listener?.close();
        if (!gradiumEnabled()) {
          send({ type: "error", message: "Speech recognition unavailable (Gradium key missing)." });
          break;
        }
        listener = new CommandListener(
          msg.language,
          msg.keywords,
          (text) => send({ type: "transcript", text }),
          (ready) => send({ type: "listening", ready }),
        );
        break;
      case "listen_audio":
        listener?.push(msg.audio);
        break;
      case "listen_stop":
        listener?.close();
        listener = null;
        break;
    }
  });

  socket.on("close", () => {
    stopSpeech();
    listener?.close();
  });
}
