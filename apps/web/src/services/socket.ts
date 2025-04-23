import { io, Socket } from "socket.io-client";

// Socket.io instance for room management
let roomSocket: Socket | null = null;

// Socket.io instance for editor collaboration
let editorSocket: Socket | null = null;

// Initialize sockets
export const initializeSockets = () => {
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

  // Initialize room socket
  if (!roomSocket) {
    roomSocket = io(`${API_URL}/rooms`, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      timeout: 10000,
    });

    roomSocket.on("connect", () => {
      console.log("Connected to room socket");
    });

    roomSocket.on("disconnect", () => {
      console.log("Disconnected from room socket");
    });

    roomSocket.on("connect_error", (error) => {
      console.error("Room socket connection error:", error);
    });
  }

  // Initialize editor socket
  if (!editorSocket) {
    editorSocket = io(`${API_URL}/editor`, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      timeout: 10000,
    });

    editorSocket.on("connect", () => {
      console.log("Connected to editor socket");
    });

    editorSocket.on("disconnect", () => {
      console.log("Disconnected from editor socket");
    });

    editorSocket.on("connect_error", (error) => {
      console.error("Editor socket connection error:", error);
    });
  }

  return { roomSocket, editorSocket };
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

// Sync document with the editor socket
export const syncDocument = (roomId: string) => {
  if (!editorSocket) {
    throw new Error("Editor socket not initialized");
  }

  editorSocket.emit("sync-document", roomId);
};

// Get room socket instance
export const getRoomSocket = () => roomSocket;

// Get editor socket instance
export const getEditorSocket = () => editorSocket;

// Clean up sockets
export const cleanupSockets = () => {
  if (roomSocket) {
    roomSocket.disconnect();
    roomSocket = null;
  }

  if (editorSocket) {
    editorSocket.disconnect();
    editorSocket = null;
  }
};
