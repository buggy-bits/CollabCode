import { io, Socket } from "socket.io-client";

// Define types for better type safety
export interface User {
  id: string;
  username: string;
  color: string;
}

export interface CursorPosition {
  line: number;
  column: number;
}

export interface AwarenessState {
  cursor?: CursorPosition;
  selection?: {
    start: CursorPosition;
    end: CursorPosition;
  };
  clientId?: string;
  username?: string;
  color?: string;
}

export interface ChatMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: string;
  color: string;
}

export interface CodeOperation {
  type: "update" | "content" | "language-change";
  update?: string;
  content?: string;
}

// Socket.io instance for room management
let roomSocket: Socket | null = null;

// Initialize sockets
export const initializeSockets = () => {
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

  // Initialize room socket if not already initialized
  if (!roomSocket) {
    roomSocket = io(`${API_URL}/rooms`, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    roomSocket.on("connect", () => {
      console.log("Connected to room socket");
    });

    roomSocket.on("disconnect", (reason) => {
      console.log("Disconnected from room socket:", reason);
      if (reason === "io server disconnect") {
        // the disconnection was initiated by the server, reconnect manually
        roomSocket?.connect();
      }
    });

    roomSocket.on("connect_error", (error) => {
      console.error("Room socket connection error:", error);
    });
  }

  return { roomSocket };
};

// Join a room
export const joinRoom = (roomId: string, username: string) => {
  if (!roomSocket) {
    throw new Error("Room socket not initialized");
  }

  roomSocket.emit("join-room", roomId, username);
};

// Leave a room
export const leaveRoom = (roomId: string) => {
  if (!roomSocket) {
    throw new Error("Room socket not initialized");
  }

  roomSocket.emit("leave-room", roomId);
};

// Join editor in a room
export const joinEditor = (roomId: string, language: string = "javascript") => {
  if (!roomSocket) {
    throw new Error("Socket not initialized");
  }

  roomSocket.emit("join-editor", roomId, language);
};

// Send text change operations
export const sendCodeEdit = (
  roomId: string,
  language: string,
  operation: CodeOperation,
) => {
  if (!roomSocket) {
    throw new Error("Socket not initialized");
  }

  roomSocket.emit("code-edit", roomId, language, operation);
};

// Send awareness updates (cursor, selection)
export const updateAwareness = (awarenessState: AwarenessState) => {
  if (!roomSocket) {
    throw new Error("Socket not initialized");
  }

  roomSocket.emit("awareness", awarenessState);
};

// Change room language
export const changeLanguage = (roomId: string, language: string) => {
  if (!roomSocket) {
    throw new Error("Socket not initialized");
  }

  // Use code-edit to send language change notification
  roomSocket.emit("code-edit", roomId, language, { type: "language-change" });
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
  if (!roomSocket) {
    throw new Error("Socket not initialized");
  }

  roomSocket.emit("chat-message", roomId, message);
};

// Listen for editor updates
export const onUpdate = (callback: (update: Uint8Array) => void) => {
  if (!roomSocket) {
    throw new Error("Socket not initialized");
  }

  roomSocket.on("update", callback);
  return () => roomSocket?.off("update", callback);
};

// Listen for document sync
export const onSync = (callback: (syncState: Uint8Array) => void) => {
  if (!roomSocket) {
    throw new Error("Socket not initialized");
  }

  roomSocket.on("sync", callback);
  return () => roomSocket?.off("sync", callback);
};

// Listen for awareness updates (cursor, selection)
export const onAwareness = (
  callback: (awarenessState: AwarenessState) => void,
) => {
  if (!roomSocket) {
    throw new Error("Socket not initialized");
  }

  roomSocket.on("awareness", callback);
  return () => roomSocket?.off("awareness", callback);
};

// Listen for remote cursor updates
export const onRemoteCursor = (
  callback: (cursor: {
    id: string;
    username: string;
    color: string;
    position: CursorPosition;
  }) => void,
) => {
  if (!roomSocket) {
    throw new Error("Socket not initialized");
  }

  roomSocket.on("remote-cursor", callback);
  return () => roomSocket?.off("remote-cursor", callback);
};

// Listen for user joined events
export const onUserJoined = (callback: (user: User) => void) => {
  if (!roomSocket) {
    throw new Error("Socket not initialized");
  }

  roomSocket.on("user-joined", callback);
  return () => roomSocket?.off("user-joined", callback);
};

// Listen for user left events
export const onUserLeft = (callback: (user: User) => void) => {
  if (!roomSocket) {
    throw new Error("Socket not initialized");
  }

  roomSocket.on("user-left", callback);
  return () => roomSocket?.off("user-left", callback);
};

// Listen for user list updates
export const onUserListUpdated = (callback: (users: User[]) => void) => {
  if (!roomSocket) {
    throw new Error("Socket not initialized");
  }

  roomSocket.on("user-list-updated", callback);
  return () => roomSocket?.off("user-list-updated", callback);
};

// Listen for chat messages
export const onChatMessage = (callback: (message: ChatMessage) => void) => {
  if (!roomSocket) {
    throw new Error("Socket not initialized");
  }

  roomSocket.on("chat-message", callback);
  return () => roomSocket?.off("chat-message", callback);
};

// Listen for language changes
export const onLanguageChanged = (
  callback: (data: { language: string }) => void,
) => {
  if (!roomSocket) {
    throw new Error("Socket not initialized");
  }

  roomSocket.on("language-changed", callback);
  return () => roomSocket?.off("language-changed", callback);
};

// Get the socket instance
export const getSocket = () => roomSocket;

// Reconnect sockets if needed
export const reconnectSockets = () => {
  if (roomSocket && !roomSocket.connected) {
    roomSocket.connect();
  }
};

// Clean up sockets
export const cleanupSockets = () => {
  if (roomSocket) {
    roomSocket.disconnect();
  }
};

// Verify an invite token
export const verifyInviteToken = (
  token: string,
): Promise<{ valid: boolean; roomId?: string }> => {
  try {
    // Token is simply a base64 encoded room ID
    const roomId = atob(token);
    return Promise.resolve({ valid: true, roomId });
  } catch (error) {
    console.error("Error verifying token:", error);
    return Promise.resolve({ valid: false });
  }
};
