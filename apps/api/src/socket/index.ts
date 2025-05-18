import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { RedisClientType } from "redis";
import { redisClient } from "../index.js";
import {
  RedisPubSubService,
  RedisPresenceService,
} from "../services/redisService.js";
import * as Y from "yjs";

// Types and Interfaces
interface YDoc extends Y.Doc {
  getText(name: string): Y.Text;
}

interface UserData {
  username: string;
  color: string;
  active?: boolean;
  joinedAt?: string;
}

interface AwarenessUpdate {
  clientId?: string;
  username?: string;
  color?: string;
  cursor?: {
    lineNumber: number;
    column: number;
  };
  selection?: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  isTyping?: boolean;
  scrollPosition?: {
    scrollTop: number;
    scrollLeft: number;
  };
  timestamp?: number;
}

interface CodeOperation {
  type: "update" | "content" | "language-change";
  update?: string;
  content?: string;
}

interface ChatMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: string;
  color: string;
}

// Document TTL in seconds (1 hour)
const DOCUMENT_TTL = 3600;

// Document store types
type DocumentStore = Map<string, YDoc>;
type SubscriptionStore = Map<string, boolean>;

// Room document store - key is roomId:language
const documentsInMemory: DocumentStore = new Map();

// Store for room channel subscriptions - key is roomId
const channelSubscriptions: SubscriptionStore = new Map();

// Cache document state in Redis
async function cacheDocumentState(
  docKey: string,
  stateAsUpdate: Uint8Array,
): Promise<void> {
  try {
    const base64State = Buffer.from(stateAsUpdate).toString("base64");
    await redisClient.set(`doc:${docKey}`, base64State, { EX: DOCUMENT_TTL });
    console.log(`Cached document state for ${docKey}`);
  } catch (err) {
    console.error("Failed to cache document:", err);
  }
}

// Get active user data from Redis
async function getActiveUserData(
  roomId: string,
  socketId: string,
): Promise<UserData | null> {
  try {
    const users = await RedisPresenceService.getUsers(roomId);
    const user = users.find((user) => user.id === socketId);
    return user ? { username: user.username, color: user.color } : null;
  } catch (err) {
    console.error("Failed to get user data:", err);
    return null;
  }
}

// Retrieve document state from Redis
async function getDocumentFromCache(
  docKey: string,
): Promise<Uint8Array | null> {
  try {
    const cachedState = await redisClient.get(`doc:${docKey}`);
    if (cachedState) {
      console.log(`Retrieved cached document state for ${docKey}`);
      return Buffer.from(cachedState, "base64");
    }
    return null;
  } catch (err) {
    console.error("Failed to retrieve document from cache:", err);
    return null;
  }
}

// Add a user to a room with Redis-based tracking
async function addUserToRoom(
  roomId: string,
  socketId: string,
  username: string,
): Promise<UserData> {
  // Create user data
  const userData: UserData = {
    username,
    color: getRandomColor(),
    active: true,
    joinedAt: new Date().toISOString(),
  };

  // Track in Redis using our presence service
  await RedisPresenceService.addUser(roomId, socketId, userData);

  return userData;
}

// Utility functions
function getRandomColor(): string {
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

// Document state management
class DocumentManager {
  private static documents = new Map<string, YDoc>();
  private static subscriptions = new Map<string, boolean>();
  private static cleanupTimers = new Map<string, NodeJS.Timeout>();
  private static readonly CLEANUP_DELAY = 1000 * 60 * 60; // 1 hour

  static async getDocument(roomId: string, language: string): Promise<YDoc> {
    const docKey = `${roomId}:${language}`;

    // If already in memory, return that instance
    if (this.documents.has(docKey)) {
      return this.documents.get(docKey)!;
    }

    // Create a new doc
    const doc = new Y.Doc() as YDoc;

    // Try to load from Redis cache
    const cachedState = await getDocumentFromCache(docKey);
    if (cachedState) {
      Y.applyUpdate(doc, cachedState);
      console.log(`Loaded document for ${docKey} from cache`);
    } else {
      console.log(`Created new document for ${docKey}`);
    }

    // Store in memory
    this.documents.set(docKey, doc);
    return doc;
  }

  static async saveDocument(docKey: string, doc: YDoc): Promise<void> {
    try {
      const stateAsUpdate = Y.encodeStateAsUpdate(doc);
      await cacheDocumentState(docKey, stateAsUpdate);
    } catch (err) {
      console.error(`Failed to save document ${docKey}:`, err);
    }
  }

  static scheduleCleanup(docKey: string): void {
    // Clear any existing cleanup timer
    const existingTimer = this.cleanupTimers.get(docKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule new cleanup
    const timer = setTimeout(async () => {
      const doc = this.documents.get(docKey);
      if (doc) {
        await this.saveDocument(docKey, doc);
        this.documents.delete(docKey);
        this.cleanupTimers.delete(docKey);
        console.log(`Cleaned up document ${docKey}`);
      }
    }, this.CLEANUP_DELAY);

    this.cleanupTimers.set(docKey, timer);
  }

  static async setupRoomSubscription(
    roomId: string,
    namespace: Server | Socket,
  ) {
    // Check if we're already subscribed
    if (this.subscriptions.has(roomId)) {
      return;
    }

    await RedisPubSubService.subscribe(roomId, (message) => {
      const { eventType, payload, excludeSocketId } = message;

      try {
        const target = namespace instanceof Server ? namespace : namespace.nsp;

        switch (eventType) {
          case "update": {
            if (payload.update) {
              const binaryUpdate = Buffer.from(payload.update, "base64");
              if (excludeSocketId) {
                target
                  .to(roomId)
                  .except(excludeSocketId)
                  .emit("update", binaryUpdate);
              }
            }
            break;
          }

          case "awareness":
            if (excludeSocketId) {
              target
                .to(roomId)
                .except(excludeSocketId)
                .emit("awareness", payload);
            }
            break;

          case "user_joined":
          case "user_left":
          case "chat-message":
            target.to(roomId).emit(eventType.replace("_", "-"), payload);
            break;

          default:
            if (excludeSocketId) {
              target
                .to(roomId)
                .except(excludeSocketId)
                .emit(eventType, payload);
            } else {
              target.to(roomId).emit(eventType, payload);
            }
        }
      } catch (err) {
        console.error(`Error handling ${eventType} event:`, err);
      }
    });

    this.subscriptions.set(roomId, true);
    console.log(`Room subscription setup for ${roomId}`);
  }
}

// Simple implementation to handle document updates
function setupWSConnection(socket: Socket, doc: YDoc) {
  // Listen for document updates
  socket.on("update", (update: string | Uint8Array) => {
    try {
      // Convert update to Uint8Array if it's a base64 string
      const binaryUpdate =
        typeof update === "string" ? Buffer.from(update, "base64") : update;

      // Apply update to the document
      Y.applyUpdate(doc, binaryUpdate);

      // Convert update back to base64 for Redis storage
      const base64Update = Buffer.from(binaryUpdate).toString("base64");

      // Publish to Redis for broadcasting to all clients (except sender)
      RedisPubSubService.publish(
        socket.data.roomId,
        "update",
        {
          update: base64Update,
        },
        socket.id,
      );

      // Cache document state in Redis
      const stateAsUpdate = Y.encodeStateAsUpdate(doc);
      cacheDocumentState(socket.data.roomId, stateAsUpdate);
    } catch (err) {
      console.error("Error applying update:", err);
      // Send error back to client
      socket.emit("error", {
        type: "update_error",
        message: "Failed to apply update",
      });
    }
  });

  // Request for full sync
  socket.on("request-sync", async () => {
    try {
      // Get latest state
      const state = Y.encodeStateAsUpdate(doc);
      // Convert to base64 for transmission
      const base64State = Buffer.from(state).toString("base64");
      // Send sync state to requesting client
      socket.emit("sync", base64State);
    } catch (err) {
      console.error("Error handling sync request:", err);
      socket.emit("error", {
        type: "sync_error",
        message: "Failed to sync document state",
      });
    }
  });

  // Initial sync when client connects
  try {
    const state = Y.encodeStateAsUpdate(doc);
    const base64State = Buffer.from(state).toString("base64");
    socket.emit("sync", base64State);
  } catch (err) {
    console.error("Error sending initial sync:", err);
  }

  // Listen for awareness updates (cursor movements)
  socket.on("awareness", async (awarenessState: AwarenessUpdate) => {
    if (!socket.data.roomId) return;

    try {
      // Add the username and color to the awareness state from user data in Redis
      const userData = await getActiveUserData(socket.data.roomId, socket.id);

      // Enrich awareness data with user info
      const enrichedState: AwarenessUpdate = {
        ...awarenessState,
        clientId: socket.id,
        username: awarenessState.username || userData?.username || "Anonymous",
        color: awarenessState.color || userData?.color || "#ffcc00",
        timestamp: Date.now(),
      };

      // Log for debugging
      console.log(`Awareness update from ${socket.id}:`, enrichedState);

      // Publish awareness update to Redis for all other users
      RedisPubSubService.publish(
        socket.data.roomId,
        "awareness",
        enrichedState,
        socket.id,
      );
    } catch (err) {
      console.error("Error handling awareness update:", err);
    }
  });
}

// Socket server setup
export function setupSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: "*", // TODO: Restrict in production
      methods: ["GET", "POST"],
    },
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: true,
    },
  });

  // Middleware for logging connections
  io.use((socket, next) => {
    console.log(`Socket connected: ${socket.id}`);
    next();
  });

  // Room namespace.
  const roomNamespace = io.of("/rooms");

  // Setup room handlers
  roomNamespace.on("connection", async (socket) => {
    console.log(`Room connection: ${socket.id}`);
    let currentDoc: YDoc | null = null;

    // Join room handler
    socket.on("join-room", async (roomId: string, username: string) => {
      try {
        socket.join(roomId);
        socket.data.roomId = roomId;

        // Add user to room tracking
        const userData = await addUserToRoom(roomId, socket.id, username);

        // Setup subscriptions for this room
        await RedisPubSubService.subscribe(roomId, (message) => {
          const { eventType, payload, excludeSocketId } = message;

          try {
            switch (eventType) {
              case "update": {
                if (payload.update && excludeSocketId !== socket.id) {
                  const binaryUpdate = Buffer.from(payload.update, "base64");
                  socket.emit("update", binaryUpdate);
                }
                break;
              }

              case "awareness":
                if (excludeSocketId !== socket.id) {
                  socket.emit("awareness", payload);
                }
                break;

              case "user_joined":
              case "user_left":
              case "chat-message":
                socket.emit(eventType.replace("_", "-"), payload);
                break;

              default:
                if (excludeSocketId !== socket.id) {
                  socket.emit(eventType, payload);
                }
            }
          } catch (err) {
            console.error(`Error handling ${eventType} event:`, err);
          }
        });

        // Notify others of join
        await RedisPubSubService.publish(roomId, "user_joined", {
          id: socket.id,
          username: userData.username,
          color: userData.color,
        });
      } catch (err) {
        console.error("Error joining room:", err);
        socket.emit("error", {
          type: "join_error",
          message: "Failed to join room",
        });
      }
    });

    // Document update handler
    socket.on("update", async (update: string | Uint8Array) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;

      try {
        // Get or create document
        currentDoc = await DocumentManager.getDocument(
          roomId,
          socket.data.language || "javascript",
        );

        // Apply update
        const binaryUpdate =
          typeof update === "string" ? Buffer.from(update, "base64") : update;

        Y.applyUpdate(currentDoc, binaryUpdate);

        // Broadcast to others
        const base64Update = Buffer.from(binaryUpdate).toString("base64");
        await RedisPubSubService.publish(
          roomId,
          "update",
          {
            update: base64Update,
          },
          socket.id,
        );

        // Cache state
        await DocumentManager.saveDocument(
          `${roomId}:${socket.data.language}`,
          currentDoc,
        );
      } catch (err) {
        console.error("Error handling update:", err);
        socket.emit("error", {
          type: "update_error",
          message: "Failed to apply update",
        });
      }
    });

    // Sync request handler
    socket.on("request-sync", async () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;

      try {
        currentDoc = await DocumentManager.getDocument(
          roomId,
          socket.data.language || "javascript",
        );
        const state = Y.encodeStateAsUpdate(currentDoc);
        const base64State = Buffer.from(state).toString("base64");
        socket.emit("sync", base64State);
      } catch (err) {
        console.error("Error handling sync request:", err);
        socket.emit("error", {
          type: "sync_error",
          message: "Failed to sync document state",
        });
      }
    });

    // Awareness update handler
    socket.on("awareness", async (awarenessState: AwarenessUpdate) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;

      try {
        const userData = await getActiveUserData(roomId, socket.id);
        if (!userData) return;

        const enrichedState: AwarenessUpdate = {
          ...awarenessState,
          clientId: socket.id,
          username: awarenessState.username || userData.username,
          color: awarenessState.color || userData.color,
          timestamp: Date.now(),
        };

        await RedisPubSubService.publish(
          roomId,
          "awareness",
          enrichedState,
          socket.id,
        );
      } catch (err) {
        console.error("Error handling awareness update:", err);
      }
    });

    // Disconnection handler
    socket.on("disconnecting", async () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;

      try {
        // Save current document state if needed
        if (currentDoc) {
          await DocumentManager.saveDocument(
            `${roomId}:${socket.data.language}`,
            currentDoc,
          );
        }

        const userData = await getActiveUserData(roomId, socket.id);
        if (userData) {
          await RedisPubSubService.publish(roomId, "user_left", {
            id: socket.id,
            username: userData.username,
            color: userData.color,
          });
        }
      } catch (err) {
        console.error("Error handling disconnection:", err);
      }
    });
  });

  return io;
}
