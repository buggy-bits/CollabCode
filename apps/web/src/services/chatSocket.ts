import { io, Socket } from "socket.io-client";
import { ENV } from "../config/env";

// ─── Types ───

export interface ChatMessage {
  id: string;
  username: string;
  message: string;
  timestamp: number;
}

export interface TypingState {
  username: string;
  isTyping: boolean;
}

type MessageCallback = (msg: ChatMessage) => void;
type HistoryCallback = (messages: ChatMessage[]) => void;
type TypingCallback = (state: TypingState) => void;

// ─── Chat Socket Manager ───

let socket: Socket | null = null;

const messageListeners: Set<MessageCallback> = new Set();
const historyListeners: Set<HistoryCallback> = new Set();
const typingListeners: Set<TypingCallback> = new Set();

export function connectChat(roomId: string, username: string): Socket {
  // Don't create duplicate connections
  if (socket?.connected) {
    socket.emit("chat:join", { roomId, username });
    return socket;
  }

  const API_URL = ENV.API_URL || "http://localhost:3000";

  socket = io(`${API_URL}/chat`, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on("connect", () => {
    console.log("💬 Chat connected");
    socket!.emit("chat:join", { roomId, username });
  });

  socket.on("chat:receive", (msg: ChatMessage) => {
    messageListeners.forEach((cb) => cb(msg));
  });

  socket.on("chat:history", ({ messages }: { messages: ChatMessage[] }) => {
    historyListeners.forEach((cb) => cb(messages));
  });

  socket.on("chat:typing", (state: TypingState) => {
    typingListeners.forEach((cb) => cb(state));
  });

  socket.on("disconnect", () => {
    console.log("💬 Chat disconnected");
  });

  return socket;
}

export function sendMessage(roomId: string, message: string): void {
  socket?.emit("chat:send", { roomId, message });
}

export function sendTyping(
  roomId: string,
  username: string,
  isTyping: boolean,
): void {
  socket?.emit("chat:typing", { roomId, username, isTyping });
}

export function disconnectChat(roomId?: string): void {
  if (socket) {
    if (roomId) {
      socket.emit("chat:leave", { roomId });
    }
    socket.disconnect();
    socket = null;
  }
  messageListeners.clear();
  historyListeners.clear();
  typingListeners.clear();
}

// ─── Listener Registration ───

export function onMessage(cb: MessageCallback): () => void {
  messageListeners.add(cb);
  return () => messageListeners.delete(cb);
}

export function onHistory(cb: HistoryCallback): () => void {
  historyListeners.add(cb);
  return () => historyListeners.delete(cb);
}

export function onTyping(cb: TypingCallback): () => void {
  typingListeners.add(cb);
  return () => typingListeners.delete(cb);
}
