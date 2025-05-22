import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import WebSocket from "ws";

export class YjsWebSocketProvider {
  public awareness: Awareness;
  private ws: WebSocket | null = null;
  private roomId: string;
  private doc: Y.Doc;
  private status: "connected" | "connecting" | "disconnected" = "disconnected";
  private statusCallbacks: Array<(status: { status: string }) => void> = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly RECONNECT_INTERVAL = 2000;
  private readonly WS_URL: string;

  constructor(
    roomId: string,
    doc: Y.Doc,
    username: string,
    wsUrl: string = "ws://localhost:3000",
  ) {
    this.roomId = roomId;
    this.doc = doc;
    this.WS_URL = wsUrl;
    this.awareness = new Awareness(doc);

    // Set local user data
    this.awareness.setLocalStateField("user", {
      name: username,
      color: this.getRandomColor(),
    });

    // Initialize WebSocket connection
    this.connect();
  }

  private connect() {
    try {
      this.ws = new WebSocket(`${this.WS_URL}/yjs/${this.roomId}`);
      this.updateStatus("connecting");

      this.ws.onopen = () => {
        console.log("WebSocket connected");
        this.updateStatus("connected");
        this.requestSync();
      };

      this.ws.onclose = () => {
        console.log("WebSocket disconnected");
        this.updateStatus("disconnected");
        this.scheduleReconnect();
      };

      this.ws.onerror = (error: Error) => {
        console.error("WebSocket error:", error);
        this.updateStatus("disconnected");
      };

      this.ws.onmessage = (event: WebSocket.MessageEvent) => {
        try {
          const message = JSON.parse(event.data.toString());

          switch (message.type) {
            case "sync": {
              const update = Buffer.from(message.update, "base64");
              Y.applyUpdate(this.doc, update);
              break;
            }
            case "update": {
              const update = Buffer.from(message.update, "base64");
              Y.applyUpdate(this.doc, update);
              break;
            }
            case "awareness": {
              const awarenessUpdate = Buffer.from(message.awareness, "base64");
              // @ts-ignore - applyUpdate exists but TypeScript doesn't know about it
              this.awareness.applyUpdate(awarenessUpdate);
              break;
            }
          }
        } catch (err) {
          console.error("Error handling WebSocket message:", err);
        }
      };

      // Set up document update handler
      this.doc.on("update", (update: Uint8Array, origin: unknown) => {
        if (origin !== this && this.ws?.readyState === WebSocket.OPEN) {
          const base64Update = Buffer.from(update).toString("base64");
          this.ws.send(
            JSON.stringify({
              type: "update",
              update: base64Update,
            }),
          );
        }
      });

      // Set up awareness update handler
      this.awareness.on("update", () => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          const awarenessUpdate = this.awareness.encodeUpdate();
          const base64Awareness =
            Buffer.from(awarenessUpdate).toString("base64");
          this.ws.send(
            JSON.stringify({
              type: "awareness",
              awareness: base64Awareness,
            }),
          );
        }
      });
    } catch (err) {
      console.error("Error connecting to WebSocket:", err);
      this.updateStatus("disconnected");
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = setTimeout(() => {
      console.log("Attempting to reconnect...");
      this.connect();
    }, this.RECONNECT_INTERVAL);
  }

  private requestSync() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "sync-request" }));
    }
  }

  private getRandomColor(): string {
    const colors = [
      "#3498db",
      "#9b59b6",
      "#2ecc71",
      "#f1c40f",
      "#e74c3c",
      "#1abc9c",
      "#34495e",
      "#e67e22",
      "#16a085",
      "#d35400",
      "#27ae60",
      "#2980b9",
      "#8e44ad",
      "#f39c12",
      "#c0392b",
    ];
    return colors[Math.floor(Math.random() * colors.length)]!;
  }

  private updateStatus(status: "connected" | "connecting" | "disconnected") {
    this.status = status;
    this.statusCallbacks.forEach((cb) => cb({ status }));
  }

  public on(event: string, callback: (event: { status: string }) => void) {
    if (event === "status") {
      this.statusCallbacks.push(callback);
      callback({ status: this.status });
    }
  }

  public disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.awareness.destroy();
    this.updateStatus("disconnected");
  }
}
