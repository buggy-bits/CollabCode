import { io, Socket } from "socket.io-client";

// Define types for better type safety
export interface User {
  id: string;
  username: string;
  color: string;
}

export interface CursorPosition {
  lineNumber: number;
  column: number;
}

export interface SelectionRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

/**
 * Interface for awareness state updates
 * This is used to track users, cursors, selections, typing indicators, and scroll positions
 */
export interface AwarenessState {
  user?: {
    name: string;
    color: string;
  };
  cursor?: CursorPosition;
  selection?: SelectionRange;
  isTyping?: boolean;
  scrollPosition?: {
    scrollTop: number;
    scrollLeft: number;
  };
  clientId?: string;
  username?: string;
  color?: string;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: string;
  color: string;
}

export interface CodeOperation {
  type: "update" | "content" | "language-change" | "sync";
  update?: string;
  content?: string;
}

// Connection state management
class SocketManager {
  private socket: Socket | null = null;
  private lastReconnectAttempt = 0;
  private needsSync = false;
  private currentRoom: string | null = null;
  private currentUsername: string | null = null;

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  initialize() {
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

    if (!this.socket) {
      console.log("Initializing socket connection to:", `${API_URL}/rooms`);

      this.socket = io(`${API_URL}/rooms`, {
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        transports: ["websocket", "polling"],
      });

      this.setupEventHandlers();
    }

    return this.socket;
  }

  private setupEventHandlers() {
    if (!this.socket) return;

    this.socket.on("connect", () => {
      console.log("Connected to socket with ID:", this.socket?.id);

      // If we were in a room before disconnecting, rejoin it
      if (this.currentRoom && this.currentUsername) {
        this.joinRoom(this.currentRoom, this.currentUsername);
      }

      if (this.needsSync) {
        this.requestSync();
        this.needsSync = false;
      }
    });

    this.socket.on("disconnect", (reason) => {
      console.log("Disconnected from socket:", reason);
      this.needsSync = true;

      if (reason === "io server disconnect" || reason === "transport close") {
        this.attemptReconnect();
      }
    });

    this.socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
      this.needsSync = true;
      this.attemptReconnect();
    });
  }

  private attemptReconnect() {
    if (!this.socket) return;

    const now = Date.now();
    const timeSinceLastAttempt = now - this.lastReconnectAttempt;
    const attempts =
      typeof this.socket.io?.reconnectionAttempts === "function"
        ? this.socket.io.reconnectionAttempts()
        : 0;
    const backoffDelay = Math.min(1000 * Math.pow(2, attempts), 10000);

    if (timeSinceLastAttempt >= backoffDelay) {
      this.lastReconnectAttempt = now;
      this.socket.connect();
    }
  }

  requestSync() {
    if (!this.socket?.connected) {
      this.needsSync = true;
      return;
    }

    console.log("Requesting sync from server...");
    this.socket.emit("request-sync");
  }

  joinRoom(roomId: string, username: string) {
    if (!this.socket?.connected) {
      throw new Error("Socket not connected");
    }

    this.currentRoom = roomId;
    this.currentUsername = username;
    this.socket.emit("join-room", roomId, username);
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  disconnect() {
    this.currentRoom = null;
    this.currentUsername = null;
    this.socket?.disconnect();
  }
}

// Create singleton instance
const socketManager = new SocketManager();

// Socket state tracking
const pendingSync = false;
const MAX_RECONNECT_DELAY = 10000; // 10 seconds

// Socket.io instance for room management
const roomSocket: Socket | null = null;

/**
 * Request a full sync from the server
 * This is used after reconnection to ensure we have the latest state
 */
export const requestSync = () => {
  if (!roomSocket?.connected) return;
  console.log("Requesting sync from server...");
  roomSocket.emit("request-sync");
};

// Initialize sockets
export const initializeSockets = () => {
  return socketManager.initialize();
};

// Join a room
export const joinRoom = (roomId: string, username: string) => {
  socketManager.joinRoom(roomId, username);
};

// Leave a room
export const leaveRoom = (roomId: string) => {
  const socket = socketManager.getSocket();
  if (!socket) {
    throw new Error("Socket not initialized");
  }
  console.log(`Leaving room ${roomId}`);
  socket.emit("leave-room", roomId);
};

// Join editor in a room
export const joinEditor = (roomId: string, language: string = "javascript") => {
  const socket = socketManager.getSocket();
  if (!socket) {
    throw new Error("Socket not initialized");
  }
  console.log(`Joining editor in room ${roomId} with language ${language}`);
  socket.emit("join-editor", roomId, language);
};

// Send text change operations
export const sendCodeEdit = (
  roomId: string,
  language: string,
  operation: CodeOperation,
) => {
  const socket = socketManager.getSocket();
  if (!socket) {
    throw new Error("Socket not initialized");
  }

  console.log("Sending code edit:", {
    roomId,
    language,
    operationType: operation.type,
    hasUpdate: !!operation.update,
    hasContent: !!operation.content,
  });

  try {
    const operationWithTimestamp = {
      ...operation,
      timestamp: Date.now(),
    };

    socket.emit("code-edit", roomId, language, operationWithTimestamp);
  } catch (error) {
    console.error("Error sending code edit:", error);
    reconnectSockets();
  }
};

// Update awareness (cursor, selection)
export const updateAwareness = (awarenessState: AwarenessState) => {
  const socket = socketManager.getSocket();
  if (!socket) {
    throw new Error("Socket not initialized");
  }

  const awarenessUpdate = {
    ...awarenessState,
    clientId: awarenessState.clientId || socket.id,
    timestamp: Date.now(),
  };

  console.log("Sending awareness update:", awarenessUpdate);
  socket.emit("awareness", awarenessUpdate);
};

// Change room language
export const changeLanguage = (roomId: string, language: string) => {
  const socket = socketManager.getSocket();
  if (!socket) {
    throw new Error("Socket not initialized");
  }

  console.log("Changing language to:", language);
  socket.emit("code-edit", roomId, language, { type: "language-change" });
};

// Update room language on server
export const updateRoomLanguage = async (roomId: string, language: string) => {
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

  try {
    const response = await fetch(`${API_URL}/api/rooms/${roomId}/language`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ language }),
    });

    if (!response.ok) {
      throw new Error("Failed to update room language");
    }

    return await response.json();
  } catch (error) {
    console.error("Error updating room language:", error);
    throw error;
  }
};

// Send chat message
export const sendChatMessage = (roomId: string, message: ChatMessage) => {
  const socket = socketManager.getSocket();
  if (!socket) {
    throw new Error("Socket not initialized");
  }

  socket.emit("chat-message", roomId, message);
};

// Listen for editor updates
export const onUpdate = (callback: (update: Uint8Array) => void) => {
  const socket = socketManager.getSocket();
  if (!socket) {
    throw new Error("Socket not initialized");
  }

  const handler = (update: string | Uint8Array) => {
    console.log("Received update event");
    const binaryUpdate =
      typeof update === "string" ? Buffer.from(update, "base64") : update;
    callback(binaryUpdate);
  };

  socket.on("update", handler);
  return () => {
    socket?.off("update", handler);
  };
};

// Listen for document sync
export const onSync = (callback: (syncState: Uint8Array) => void) => {
  const socket = socketManager.getSocket();
  if (!socket) {
    throw new Error("Socket not initialized");
  }

  const handler = (syncState: string | Uint8Array) => {
    console.log("Received sync event");
    const binaryState =
      typeof syncState === "string"
        ? Buffer.from(syncState, "base64")
        : syncState;
    callback(binaryState);
  };

  socket.on("sync", handler);
  return () => {
    socket?.off("sync", handler);
  };
};

// Event listeners for user presence
export const setupPresenceListeners = (socket: Socket) => {
  return {
    onAwareness: (callback: (state: AwarenessState) => void) => {
      socket.on("awareness", callback);
      return () => socket.off("awareness", callback);
    },
    onUserJoined: (callback: (user: User) => void) => {
      socket.on("user-joined", callback);
      return () => socket.off("user-joined", callback);
    },
    onUserLeft: (callback: (user: User) => void) => {
      socket.on("user-left", callback);
      return () => socket.off("user-left", callback);
    },
    onUserListUpdated: (callback: (users: User[]) => void) => {
      socket.on("user-list-updated", callback);
      return () => socket.off("user-list-updated", callback);
    },
    onChatMessage: (callback: (message: ChatMessage) => void) => {
      socket.on("chat-message", callback);
      return () => socket.off("chat-message", callback);
    },
    onLanguageChanged: (callback: (data: { language: string }) => void) => {
      socket.on("language-changed", callback);
      return () => socket.off("language-changed", callback);
    },
  };
};

// Update getSocket to use the manager
export const getSocket = () => socketManager.getSocket();

// Reconnect sockets if needed
export const reconnectSockets = () => {
  const socket = socketManager.getSocket();
  if (socket && !socket.connected) {
    console.log("Manually reconnecting socket");
    socket.connect();
  } else if (!socket) {
    console.log("Initializing socket on reconnect");
    socketManager.initialize();
  }
};

// Clean up sockets
export const cleanupSockets = () => {
  socketManager.disconnect();
};

// Verify an invite token
export const verifyInviteToken = (
  token: string,
): Promise<{ valid: boolean; roomId?: string }> => {
  try {
    // Token is simply a base64 encoded room ID
    const roomId = atob(token);
    console.log(`Verified invite token for room: ${roomId}`);
    return Promise.resolve({ valid: true, roomId });
  } catch (error) {
    console.error("Error verifying token:", error);
    return Promise.resolve({ valid: false });
  }
};
