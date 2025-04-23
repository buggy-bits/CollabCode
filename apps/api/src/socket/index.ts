import { Server as HttpServer } from "http";
import { Server } from "socket.io";
// Import Yjs dynamically to handle ESM/CommonJS interop
let Y: any;
import("yjs").then((module) => {
  Y = module;
});

// We'll recreate the setupWSConnection functionality
function setupWSConnection(socket: any, doc: any) {
  // Simple implementation to handle document updates
  socket.on("update", (update: Uint8Array) => {
    Y.applyUpdate(doc, update);
    // Broadcast to all other clients
    socket.to(socket.data.roomId).emit("update", update);
  });

  // Send current state to new client
  const state = Y.encodeStateAsUpdate(doc);
  socket.emit("sync", state);
}

// Room document store
const documents = new Map<string, any>();

// Get or create a document for a room
function getDocument(roomId: string): any {
  if (!documents.has(roomId)) {
    const doc = new Y.Doc();
    documents.set(roomId, doc);
    console.log(`Created new document for room: ${roomId}`);
  }
  return documents.get(roomId)!;
}

export function setupSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: "*", // In production, restrict to your app's domain
      methods: ["GET", "POST"],
    },
  });

  // Middleware for logging connections
  io.use((socket, next) => {
    console.log(`Socket connected: ${socket.id}`);
    next();
  });

  // Room namespace
  const roomNamespace = io.of("/rooms");

  roomNamespace.on("connection", (socket) => {
    console.log(`Room connection: ${socket.id}`);

    // Join a room
    socket.on("join-room", (roomId: string, username: string) => {
      socket.join(roomId);

      // Notify others in the room
      socket.to(roomId).emit("user-joined", {
        id: socket.id,
        username,
        timestamp: new Date().toISOString(),
      });

      console.log(`User ${username} (${socket.id}) joined room: ${roomId}`);

      // Get active users in the room
      const room = roomNamespace.adapter.rooms.get(roomId);
      const users = room ? Array.from(room) : [];

      socket.emit("room-users", users);
    });

    // Leave room
    socket.on("leave-room", (roomId: string) => {
      socket.leave(roomId);
      console.log(`User ${socket.id} left room: ${roomId}`);
      socket.to(roomId).emit("user-left", socket.id);
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log(`Room disconnection: ${socket.id}`);
    });
  });

  // Editor namespace with Yjs integration
  const editorNamespace = io.of("/editor");

  editorNamespace.on("connection", (socket) => {
    console.log(`Editor connection: ${socket.id}`);

    // Handle document sync with Yjs
    socket.on("sync-document", (roomId: string) => {
      const doc = getDocument(roomId);

      // Set up Yjs WebSocket connection
      socket.data.roomId = roomId;
      setupWSConnection(socket, doc);

      socket.join(roomId);
      console.log(`User ${socket.id} syncing document in room: ${roomId}`);
    });

    socket.on("disconnect", () => {
      console.log(`Editor disconnection: ${socket.id}`);
    });
  });

  return io;
}
