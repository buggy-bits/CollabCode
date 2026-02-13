import { Server as IOServer, Socket } from "socket.io";
import { v4 as uuidv4 } from "uuid";

// ─── Types ───

interface ChatMessage {
  id: string;
  username: string;
  message: string;
  timestamp: number;
}

interface TypingState {
  username: string;
  isTyping: boolean;
}

// In-memory message buffer per room (ephemeral — cleared when server restarts)
// Keeps the last N messages so users who join mid-session can see recent history
const MAX_HISTORY = 100;
const roomMessages = new Map<string, ChatMessage[]>();

function getHistory(roomId: string): ChatMessage[] {
  return roomMessages.get(roomId) || [];
}

function pushMessage(roomId: string, msg: ChatMessage): void {
  if (!roomMessages.has(roomId)) {
    roomMessages.set(roomId, []);
  }
  const messages = roomMessages.get(roomId)!;
  messages.push(msg);

  // Trim to keep only the last MAX_HISTORY messages
  if (messages.length > MAX_HISTORY) {
    messages.splice(0, messages.length - MAX_HISTORY);
  }
}

// Track typing timers so we can auto-clear typing state
const typingTimers = new Map<string, NodeJS.Timeout>();

function getTypingKey(roomId: string, username: string): string {
  return `${roomId}::${username}`;
}

// ─── Handler Setup ───

export function setupChatHandler(io: IOServer): void {
  const chatNs = io.of("/chat");

  chatNs.on("connection", (socket: Socket) => {
    let currentRoom: string | null = null;
    let currentUsername: string | null = null;

    // ── Join a room ──
    socket.on(
      "chat:join",
      ({ roomId, username }: { roomId: string; username: string }) => {
        if (!roomId || !username) return;

        currentRoom = roomId;
        currentUsername = username;
        socket.join(roomId);

        console.log(`💬 ${username} joined chat in room ${roomId}`);

        // Send chat history to the joining user
        const history = getHistory(roomId);
        if (history.length > 0) {
          socket.emit("chat:history", { messages: history });
        }
      },
    );

    // ── Send a message ──
    socket.on(
      "chat:send",
      ({ roomId, message }: { roomId: string; message: string }) => {
        if (!roomId || !message || !currentUsername) return;

        // Basic sanitization — strip HTML tags, limit length
        const sanitized = message
          .replace(/<[^>]*>/g, "")
          .trim()
          .slice(0, 2000);
        if (!sanitized) return;

        const payload: ChatMessage = {
          id: uuidv4(),
          username: currentUsername,
          message: sanitized,
          timestamp: Date.now(),
        };

        // Store in memory
        pushMessage(roomId, payload);

        // Broadcast to everyone in the room (including sender for confirmation)
        chatNs.to(roomId).emit("chat:receive", payload);

        // Clear typing state for this user since they just sent a message
        const typingKey = getTypingKey(roomId, currentUsername);
        if (typingTimers.has(typingKey)) {
          clearTimeout(typingTimers.get(typingKey)!);
          typingTimers.delete(typingKey);
        }
        chatNs.to(roomId).emit("chat:typing", {
          username: currentUsername,
          isTyping: false,
        });
      },
    );

    // ── Typing indicator ──
    socket.on(
      "chat:typing",
      ({
        roomId,
        username,
        isTyping,
      }: {
        roomId: string;
        username: string;
        isTyping: boolean;
      }) => {
        if (!roomId || !username) return;

        const typingKey = getTypingKey(roomId, username);

        // Clear any existing timer for this user
        if (typingTimers.has(typingKey)) {
          clearTimeout(typingTimers.get(typingKey)!);
          typingTimers.delete(typingKey);
        }

        // Broadcast typing state to everyone else in the room
        socket.to(roomId).emit("chat:typing", { username, isTyping });

        // Auto-clear typing after 3 seconds of no new typing events
        if (isTyping) {
          const timer = setTimeout(() => {
            socket
              .to(roomId)
              .emit("chat:typing", { username, isTyping: false });
            typingTimers.delete(typingKey);
          }, 3000);
          typingTimers.set(typingKey, timer);
        }
      },
    );

    // ── Leave room ──
    socket.on("chat:leave", ({ roomId }: { roomId: string }) => {
      if (!roomId) return;
      socket.leave(roomId);

      if (currentUsername) {
        // Clear typing state
        const typingKey = getTypingKey(roomId, currentUsername);
        if (typingTimers.has(typingKey)) {
          clearTimeout(typingTimers.get(typingKey)!);
          typingTimers.delete(typingKey);
        }
        socket
          .to(roomId)
          .emit("chat:typing", { username: currentUsername, isTyping: false });
      }

      currentRoom = null;
      currentUsername = null;
    });

    // ── Disconnect cleanup ──
    socket.on("disconnect", () => {
      if (currentRoom && currentUsername) {
        // Clear typing state on disconnect
        const typingKey = getTypingKey(currentRoom, currentUsername);
        if (typingTimers.has(typingKey)) {
          clearTimeout(typingTimers.get(typingKey)!);
          typingTimers.delete(typingKey);
        }
        socket.to(currentRoom).emit("chat:typing", {
          username: currentUsername,
          isTyping: false,
        });

        console.log(
          `💬 ${currentUsername} left chat in room ${currentRoom} (disconnect)`,
        );
      }
    });
  });

  console.log("💬 Chat handler initialized on /chat namespace");
}
