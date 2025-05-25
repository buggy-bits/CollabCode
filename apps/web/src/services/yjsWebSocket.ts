import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

export class YjsWebSocketProvider extends WebsocketProvider {
  constructor(roomId: string, doc: Y.Doc, username: string) {
    const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:3000";
    super(`${WS_URL}/rooms/${roomId}`, roomId, doc, {
      connect: true,
      WebSocketPolyfill: undefined,
      resyncInterval: 5000,
      maxBackoffTime: 10000,
    });

    // Set initial awareness state
    if (this.awareness) {
      this.awareness.setLocalState({
        user: {
          name: username,
          color: this.generateUserColor(username),
        },
      });
    }

    // Set up connection status handlers
    this.on("status", (event: { status: string }) => {
      console.log("WebSocket status:", event.status);
    });

    this.on("sync", (isSynced: boolean) => {
      console.log("Document sync status:", isSynced ? "synced" : "syncing");
    });
  }

  private generateUserColor(username: string): string {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 50%)`;
  }
}
