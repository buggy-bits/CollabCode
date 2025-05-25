// import { io, Socket } from "socket.io-client";

// // Define types for better type safety
// export interface User {
//   id: string;
//   username: string;
//   color: string;
// }

// export interface CursorPosition {
//   lineNumber: number;
//   column: number;
// }

// export interface SelectionRange {
//   startLineNumber: number;
//   startColumn: number;
//   endLineNumber: number;
//   endColumn: number;
// }

// /**
//  * Interface for awareness state updates
//  * This is used to track users, cursors, selections, typing indicators, and scroll positions
//  */
// export interface AwarenessState {
//   user?: {
//     name: string;
//     color: string;
//   };
//   cursor?: CursorPosition;
//   selection?: SelectionRange;
//   isTyping?: boolean;
//   scrollPosition?: {
//     scrollTop: number;
//     scrollLeft: number;
//   };
//   clientId?: string;
//   username?: string;
//   color?: string;
//   timestamp: number;
// }

// export interface ChatMessage {
//   id: string;
//   sender: string;
//   content: string;
//   timestamp: string;
//   color: string;
// }

// export interface CodeOperation {
//   type: "update" | "content" | "language-change" | "sync";
//   update?: string;
//   content?: string;
// }

// // Connection state management

import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

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
    // Clean up existing connection if any
    this.disconnect();

    const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:3002";

    console.log("Initializing Y-WebSocket connection to:", WS_URL);
    console.log("Room ID:", roomId, "Username:", username);

    // Create new Yjs document
    this.doc = new Y.Doc();
    this.currentRoom = roomId;
    this.currentUsername = username;

    // Create WebSocket provider
    this.provider = new WebsocketProvider(WS_URL, roomId, this.doc, {
      connect: true,
      // WebSocket connection options
      WebSocketPolyfill: undefined, // Use native WebSocket
      resyncInterval: 5000, // Resync every 5 seconds if needed
      maxBackoffTime: 10000, // Maximum backoff time
    });

    // Set initial awareness state
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

    return {
      doc: this.doc,
      provider: this.provider,
    };
  }

  private setupEventHandlers() {
    if (!this.provider) return;

    // Connection established
    this.provider.on("status", (event: { status: string }) => {
      console.log("WebSocket status changed:", event.status);

      if (event.status === "connected") {
        console.log("Connected to collaborative server");
        this.resetReconnectAttempts();

        if (this.needsSync) {
          this.requestSync();
          this.needsSync = false;
        }
      } else if (event.status === "disconnected") {
        console.log("Disconnected from collaborative server");
        this.needsSync = true;
        this.attemptReconnect();
      }
    });

    // Sync status events
    this.provider.on("sync", (isSynced: boolean) => {
      console.log("Document sync status:", isSynced ? "synced" : "syncing");
    });
    // Connection lost
    this.provider.on("connection-close", (event: CloseEvent | null) => {
      if (event) {
        console.log("WebSocket connection closed:", event.code, event.reason);
      } else {
        console.log("WebSocket connection closed without event details");
      }
      this.needsSync = true;
      this.attemptReconnect();
    });

    // Connection error
    this.provider.on("connection-error", (event: Event) => {
      console.error("WebSocket connection error:", event);
      this.needsSync = true;
      this.attemptReconnect();
    });

    // Document updates
    this.doc?.on("update", (update: Uint8Array, origin: any) => {
      if (origin !== this.provider) {
        console.log("Document updated from remote");
      }
    });
  }

  private attemptReconnect() {
    if (!this.provider || this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max reconnection attempts reached");
      return;
    }

    // Clear existing reconnect interval
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
    }

    const now = Date.now();
    const backoffDelay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      10000,
    );
    const timeSinceLastAttempt = now - this.lastReconnectAttempt;

    if (timeSinceLastAttempt >= backoffDelay) {
      this.lastReconnectAttempt = now;
      this.reconnectAttempts++;

      console.log(`Attempting reconnection #${this.reconnectAttempts}...`);

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
    // Generate a consistent color based on username
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

    console.log("Requesting document sync...");
    // Y-websocket handles sync automatically, but we can force a sync
    if (this.doc) {
      // Emit a small update to trigger sync
      this.doc.transact(() => {
        // This will trigger sync without making actual changes
      });
    }
  }

  // Get shared types for collaborative editing
  getSharedText(key: string = "monaco"): Y.Text {
    if (!this.doc) {
      throw new Error("Document not initialized");
    }
    return this.doc.getText(key);
  }

  getSharedMap(key: string = "metadata"): Y.Map<any> {
    if (!this.doc) {
      throw new Error("Document not initialized");
    }
    return this.doc.getMap(key);
  }

  getSharedArray(key: string = "array"): Y.Array<any> {
    if (!this.doc) {
      throw new Error("Document not initialized");
    }
    return this.doc.getArray(key);
  }

  // Get awareness for user presence (cursors, selections, etc.)
  getAwareness() {
    return this.provider?.awareness ?? null;
  }

  // Update user awareness information
  updateAwareness(state: any) {
    if (this.provider?.awareness) {
      this.provider.awareness.setLocalState(state);
    }
  }

  joinRoom(roomId: string, username: string) {
    if (this.currentRoom === roomId && this.currentUsername === username) {
      console.log("Already in the requested room");
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
    console.log("Disconnecting from collaborative session...");

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

  // Utility method to check if room is ready for collaboration
  isReady(): boolean {
    return !!(this.provider?.wsconnected && this.doc);
  }
}

// // Create singleton instance
const socketManager = new CollaborationManager();

export const initializeSockets = (roomId: string, username: string) => {
  return socketManager.initialize(roomId, username);
};

// Join a room
export const joinRoom = (roomId: string, username: string) => {
  socketManager.joinRoom(roomId, username);
};

export const cleanupSockets = () => {
  socketManager.disconnect();
};

// // Socket state tracking
// const pendingSync = false;
// const MAX_RECONNECT_DELAY = 10000; // 10 seconds

// // Socket.io instance for room management
// const roomSocket: Socket | null = null;

// /**
//  * Request a full sync from the server
//  * This is used after reconnection to ensure we have the latest state
//  */
// export const requestSync = () => {
//   if (!roomSocket?.connected) return;
//   console.log("Requesting sync from server...");
//   roomSocket.emit("request-sync");
// };

// // Initialize sockets

// // Leave a room
// export const leaveRoom = (roomId: string) => {
//   const socket = socketManager.getSocket();
//   if (!socket) {
//     throw new Error("Socket not initialized");
//   }
//   console.log(`Leaving room ${roomId}`);
//   socket.emit("leave-room", roomId);
// };

// // Join editor in a room
// export const joinEditor = (roomId: string, language: string = "javascript") => {
//   const socket = socketManager.getSocket();
//   if (!socket) {
//     throw new Error("Socket not initialized");
//   }
//   console.log(`Joining editor in room ${roomId} with language ${language}`);
//   socket.emit("join-editor", roomId, language);
// };

// // Send text change operations
// export const sendCodeEdit = (
//   roomId: string,
//   language: string,
//   operation: CodeOperation,
// ) => {
//   const socket = socketManager.getSocket();
//   if (!socket) {
//     throw new Error("Socket not initialized");
//   }

//   console.log("Sending code edit:", {
//     roomId,
//     language,
//     operationType: operation.type,
//     hasUpdate: !!operation.update,
//     hasContent: !!operation.content,
//   });

//   try {
//     const operationWithTimestamp = {
//       ...operation,
//       timestamp: Date.now(),
//     };

//     socket.emit("code-edit", roomId, language, operationWithTimestamp);
//   } catch (error) {
//     console.error("Error sending code edit:", error);
//     reconnectSockets();
//   }
// };

// // Update awareness (cursor, selection)
// export const updateAwareness = (awarenessState: AwarenessState) => {
//   const socket = socketManager.getSocket();
//   if (!socket) {
//     throw new Error("Socket not initialized");
//   }

//   const awarenessUpdate = {
//     ...awarenessState,
//     clientId: awarenessState.clientId || socket.id,
//     timestamp: Date.now(),
//   };

//   console.log("Sending awareness update:", awarenessUpdate);
//   socket.emit("awareness", awarenessUpdate);
// };

// // Change room language
// export const changeLanguage = (roomId: string, language: string) => {
//   const socket = socketManager.getSocket();
//   if (!socket) {
//     throw new Error("Socket not initialized");
//   }

//   console.log("Changing language to:", language);
//   socket.emit("code-edit", roomId, language, { type: "language-change" });
// };

// // Update room language on server
// export const updateRoomLanguage = async (roomId: string, language: string) => {
//   const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

//   try {
//     const response = await fetch(`${API_URL}/api/rooms/${roomId}/language`, {
//       method: "PATCH",
//       headers: {
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify({ language }),
//     });

//     if (!response.ok) {
//       throw new Error("Failed to update room language");
//     }

//     return await response.json();
//   } catch (error) {
//     console.error("Error updating room language:", error);
//     throw error;
//   }
// };

// // Send chat message
// export const sendChatMessage = (roomId: string, message: ChatMessage) => {
//   const socket = socketManager.getSocket();
//   if (!socket) {
//     throw new Error("Socket not initialized");
//   }

//   socket.emit("chat-message", roomId, message);
// };

// // Listen for editor updates
// export const onUpdate = (callback: (update: Uint8Array) => void) => {
//   const socket = socketManager.getSocket();
//   if (!socket) {
//     throw new Error("Socket not initialized");
//   }

//   const handler = (update: string | Uint8Array) => {
//     console.log("Received update event");
//     const binaryUpdate =
//       typeof update === "string" ? Buffer.from(update, "base64") : update;
//     callback(binaryUpdate);
//   };

//   socket.on("update", handler);
//   return () => {
//     socket?.off("update", handler);
//   };
// };

// // Listen for document sync
// export const onSync = (callback: (syncState: Uint8Array) => void) => {
//   const socket = socketManager.getSocket();
//   if (!socket) {
//     throw new Error("Socket not initialized");
//   }

//   const handler = (syncState: string | Uint8Array) => {
//     console.log("Received sync event");
//     const binaryState =
//       typeof syncState === "string"
//         ? Buffer.from(syncState, "base64")
//         : syncState;
//     callback(binaryState);
//   };

//   socket.on("sync", handler);
//   return () => {
//     socket?.off("sync", handler);
//   };
// };

// // Event listeners for user presence
// export const setupPresenceListeners = (socket: Socket) => {
//   return {
//     onAwareness: (callback: (state: AwarenessState) => void) => {
//       socket.on("awareness", callback);
//       return () => socket.off("awareness", callback);
//     },
//     onUserJoined: (callback: (user: User) => void) => {
//       socket.on("user-joined", callback);
//       return () => socket.off("user-joined", callback);
//     },
//     onUserLeft: (callback: (user: User) => void) => {
//       socket.on("user-left", callback);
//       return () => socket.off("user-left", callback);
//     },
//     onUserListUpdated: (callback: (users: User[]) => void) => {
//       socket.on("user-list-updated", callback);
//       return () => socket.off("user-list-updated", callback);
//     },
//     onChatMessage: (callback: (message: ChatMessage) => void) => {
//       socket.on("chat-message", callback);
//       return () => socket.off("chat-message", callback);
//     },
//     onLanguageChanged: (callback: (data: { language: string }) => void) => {
//       socket.on("language-changed", callback);
//       return () => socket.off("language-changed", callback);
//     },
//   };
// };

// // Update getSocket to use the manager
// export const getSocket = () => socketManager.getSocket();

// // Reconnect sockets if needed
// export const reconnectSockets = () => {
//   const socket = socketManager.getSocket();
//   if (socket && !socket.connected) {
//     console.log("Manually reconnecting socket");
//     socket.connect();
//   } else if (!socket) {
//     console.log("Initializing socket on reconnect");
//     socketManager.initialize();
//   }
// };

// // Clean up sockets
// export const cleanupSockets = () => {
//   socketManager.disconnect();
// };

// // Verify an invite token
// export const verifyInviteToken = (
//   token: string,
// ): Promise<{ valid: boolean; roomId?: string }> => {
//   try {
//     // Token is simply a base64 encoded room ID
//     const roomId = atob(token);
//     console.log(`Verified invite token for room: ${roomId}`);
//     return Promise.resolve({ valid: true, roomId });
//   } catch (error) {
//     console.error("Error verifying token:", error);
//     return Promise.resolve({ valid: false });
//   }
// };
