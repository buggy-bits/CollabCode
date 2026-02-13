import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import { ENV } from "../config/env";

export class CollaborationManager {
  private provider: WebsocketProvider | null = null;
  private doc: Y.Doc | null = null;
  private lastReconnectAttempt = 0;
  private needsSync = false;
  private currentRoom: string | null = null;
  private currentUsername: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectInterval: NodeJS.Timeout | null = null;

  get isConnected(): boolean {
    return this.provider?.wsconnected ?? false;
  }

  get document(): Y.Doc | null {
    return this.doc;
  }

  get websocketProvider(): WebsocketProvider | null {
    return this.provider;
  }

  initialize(
    roomId: string,
    username: string,
  ): { doc: Y.Doc; provider: WebsocketProvider } {
    this.disconnect();

    const WS_URL = ENV.WS_URL || "ws://localhost:3002";

    this.doc = new Y.Doc();
    this.currentRoom = roomId;
    this.currentUsername = username;

    this.provider = new WebsocketProvider(WS_URL, roomId, this.doc, {
      connect: true,
      WebSocketPolyfill: undefined,
      resyncInterval: 5000,
      maxBackoffTime: 10000,
    });

    if (this.provider.awareness) {
      this.provider.awareness.setLocalState({
        user: {
          name: username,
          color: this.generateUserColor(username),
        },
      });
    }

    this.setupEventHandlers();
    this.resetReconnectAttempts();

    return { doc: this.doc, provider: this.provider };
  }

  private setupEventHandlers() {
    if (!this.provider) return;

    this.provider.on("status", (event: { status: string }) => {
      if (event.status === "connected") {
        this.resetReconnectAttempts();
        if (this.needsSync) {
          this.requestSync();
          this.needsSync = false;
        }
      } else if (event.status === "disconnected") {
        this.needsSync = true;
        this.attemptReconnect();
      }
    });

    this.provider.on("sync", (isSynced: boolean) => {
      console.log("Document sync:", isSynced ? "synced" : "syncing");
    });

    this.provider.on("connection-close", () => {
      this.needsSync = true;
      this.attemptReconnect();
    });

    this.provider.on("connection-error", () => {
      this.needsSync = true;
      this.attemptReconnect();
    });
  }

  private attemptReconnect() {
    if (!this.provider || this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
    }

    const backoffDelay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      10000,
    );
    const timeSinceLastAttempt = Date.now() - this.lastReconnectAttempt;

    if (timeSinceLastAttempt >= backoffDelay) {
      this.lastReconnectAttempt = Date.now();
      this.reconnectAttempts++;

      this.reconnectInterval = setTimeout(() => {
        if (this.provider && !this.provider.wsconnected) {
          this.provider.connect();
        }
      }, backoffDelay);
    }
  }

  private resetReconnectAttempts() {
    this.reconnectAttempts = 0;
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }
  }

  private generateUserColor(username: string): string {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 50%)`;
  }

  requestSync() {
    if (!this.provider?.wsconnected) {
      this.needsSync = true;
      return;
    }
    if (this.doc) {
      this.doc.transact(() => {});
    }
  }

  getSharedText(key: string = "monaco"): Y.Text {
    if (!this.doc) throw new Error("Document not initialized");
    return this.doc.getText(key);
  }

  getSharedMap(key: string = "metadata"): Y.Map<any> {
    if (!this.doc) throw new Error("Document not initialized");
    return this.doc.getMap(key);
  }

  getAwareness() {
    return this.provider?.awareness ?? null;
  }

  updateAwareness(state: any) {
    if (this.provider?.awareness) {
      this.provider.awareness.setLocalState(state);
    }
  }

  joinRoom(roomId: string, username: string) {
    if (this.currentRoom === roomId && this.currentUsername === username) {
      return { doc: this.doc, provider: this.provider };
    }
    return this.initialize(roomId, username);
  }

  getCurrentRoom(): string | null {
    return this.currentRoom;
  }

  getCurrentUsername(): string | null {
    return this.currentUsername;
  }

  disconnect() {
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }
    if (this.provider) {
      this.provider.destroy();
      this.provider = null;
    }
    if (this.doc) {
      this.doc.destroy();
      this.doc = null;
    }
    this.currentRoom = null;
    this.currentUsername = null;
    this.needsSync = false;
    this.resetReconnectAttempts();
  }

  isReady(): boolean {
    return !!(this.provider?.wsconnected && this.doc);
  }
}

const socketManager = new CollaborationManager();

export const initializeSockets = (roomId: string, username: string) => {
  return socketManager.initialize(roomId, username);
};

export const joinRoom = (roomId: string, username: string) => {
  socketManager.joinRoom(roomId, username);
};

export const cleanupSockets = () => {
  socketManager.disconnect();
};
