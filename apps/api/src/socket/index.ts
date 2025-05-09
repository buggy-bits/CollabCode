import { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { redisClient } from "../index.js";
import {
  RedisPubSubService,
  RedisPresenceService,
} from "../services/redisService.js";
// Import Yjs dynamically to handle ESM/CommonJS interop
let Y: any;
import("yjs").then((module) => {
  Y = module;
});

// Document TTL in seconds (1 hour)
const DOCUMENT_TTL = 3600;

// Simple implementation to handle document updates
function setupWSConnection(socket: any, doc: any) {
  // Listen for document updates
  socket.on("update", (update: Uint8Array) => {
    try {
      // Apply update to the document
      Y.applyUpdate(doc, update);

      // Publish to Redis for broadcasting to all clients (except sender)
      RedisPubSubService.publish(
        socket.data.roomId,
        "update",
        {
          update: Buffer.from(update).toString("base64"),
        },
        socket.id,
      );

      // Cache document state in Redis
      const stateAsUpdate = Y.encodeStateAsUpdate(doc);
      cacheDocumentState(socket.data.roomId, stateAsUpdate);
    } catch (err) {
      console.error("Error applying update:", err);
    }
  });

  // Send current state to new client
  const state = Y.encodeStateAsUpdate(doc);
  socket.emit("sync", state);

  // Listen for awareness updates (cursor movements)
  socket.on("awareness", (awarenessState: any) => {
    if (!socket.data.roomId) return;

    // Add the username and color to the awareness state from user data in Redis
    getActiveUserData(socket.data.roomId, socket.id).then((userData) => {
      // Enrich awareness data with user info
      const enrichedState = {
        ...awarenessState,
        clientId: socket.id,
        username: userData?.username || "Anonymous",
        color: userData?.color || "#ffcc00",
      };

      // Publish cursor movement to Redis for all other users
      RedisPubSubService.publish(
        socket.data.roomId,
        "awareness",
        enrichedState,
        socket.id,
      );
    });
  });
}

// Get active user data from Redis
async function getActiveUserData(
  roomId: string,
  socketId: string,
): Promise<any> {
  try {
    const users = await RedisPresenceService.getUsers(roomId);
    return users.find((user) => user.id === socketId);
  } catch (err) {
    console.error("Failed to get user data:", err);
    return null;
  }
}

// Cache document state in Redis
async function cacheDocumentState(docKey: string, stateAsUpdate: Uint8Array) {
  try {
    // Convert binary update to base64 for storage
    const base64State = Buffer.from(stateAsUpdate).toString("base64");
    await redisClient.set(`doc:${docKey}`, base64State, { EX: DOCUMENT_TTL });
    console.log(`Cached document state for ${docKey}`);
  } catch (err) {
    console.error("Failed to cache document:", err);
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

// Track active session in Redis
async function trackActiveSession(
  roomId: string,
  socketId: string,
  userData: any,
) {
  try {
    // Store user data for this session
    await redisClient.hSet(
      `room:${roomId}:users`,
      socketId,
      JSON.stringify(userData),
    );
    // Set expiration for user data
    await redisClient.expire(`room:${roomId}:users`, DOCUMENT_TTL);

    // Also maintain a set of active rooms for cleanup
    await redisClient.sAdd("active_rooms", roomId);
  } catch (err) {
    console.error("Failed to track active session:", err);
  }
}

// Remove active session from Redis
async function removeActiveSession(roomId: string, socketId: string) {
  try {
    await redisClient.hDel(`room:${roomId}:users`, socketId);

    // Check if room is empty and remove from active rooms if it is
    const usersLeft = await redisClient.hLen(`room:${roomId}:users`);
    if (usersLeft === 0) {
      await redisClient.sRem("active_rooms", roomId);
      // Don't delete the document immediately to allow for rejoining
    }
  } catch (err) {
    console.error("Failed to remove active session:", err);
  }
}

// Get all active users in a room from Redis
async function getActiveUsersInRoom(roomId: string): Promise<any[]> {
  try {
    const usersData = await redisClient.hGetAll(`room:${roomId}:users`);
    const users = [];

    for (const [socketId, userData] of Object.entries(usersData)) {
      const parsedData = JSON.parse(userData);
      users.push({
        id: socketId,
        username: parsedData.username,
        color: parsedData.color,
      });
    }

    return users;
  } catch (err) {
    console.error("Failed to get active users:", err);
    return [];
  }
}

// Room document store - key is roomId:language
const documentsInMemory = new Map<string, any>();

// Generate a random color for a user
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

// Add a user to a room with Redis-based tracking
async function addUserToRoom(
  roomId: string,
  socketId: string,
  username: string,
): Promise<any> {
  // Create user data
  const userData = {
    username,
    color: getRandomColor(),
    active: true,
    joinedAt: new Date().toISOString(),
  };

  // Track in Redis using our presence service
  await RedisPresenceService.addUser(roomId, socketId, userData);

  return userData;
}

// Get or create a document for a room with specific language
async function getDocument(roomId: string, language: string): Promise<any> {
  const docKey = `${roomId}:${language}`;

  // If already in memory, return that instance
  if (documentsInMemory.has(docKey)) {
    return documentsInMemory.get(docKey)!;
  }

  // Create a new Yjs document
  const doc = new Y.Doc();

  // Try to load from Redis cache
  const cachedState = await getDocumentFromCache(docKey);
  if (cachedState) {
    Y.applyUpdate(doc, cachedState);
    console.log(`Loaded document for ${docKey} from cache`);
  } else {
    console.log(
      `Created new document for room: ${roomId} with language: ${language}`,
    );
  }

  // Store in memory
  documentsInMemory.set(docKey, doc);

  return doc;
}

// Store for room channel subscriptions - key is roomId
const channelSubscriptions = new Map<string, any>();

export function setupSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: "*", // In production, restrict to your app's domain
      methods: ["GET", "POST"],
    },
    // Add Socket.IO settings to improve connection stability
    connectionStateRecovery: {
      // the backup duration of the sessions and the packets
      maxDisconnectionDuration: 2 * 60 * 1000,
      // whether to skip middlewares upon successful recovery
      skipMiddlewares: true,
    },
  });

  // Middleware for logging connections
  io.use((socket, next) => {
    console.log(`Socket connected: ${socket.id}`);
    next();
  });

  // Room namespace
  const roomNamespace = io.of("/rooms");

  // Setup Redis pub/sub listener for broadcasting messages
  const setupRoomSubscription = async (roomId: string) => {
    // Check if we're already subscribed to this room
    if (channelSubscriptions.has(roomId)) {
      return;
    }

    // Create new subscription for this room
    await RedisPubSubService.subscribe(roomId, (message) => {
      const { eventType, payload, excludeSocketId } = message;

      // Determine how to handle different event types
      switch (eventType) {
        case "update":
          // Handle code updates
          if (payload.update) {
            try {
              const binaryUpdate = Buffer.from(payload.update, "base64");
              // Broadcast to all clients in room except the sender
              if (excludeSocketId) {
                roomNamespace
                  .to(roomId)
                  .except(excludeSocketId)
                  .emit("update", binaryUpdate);
              }
            } catch (err) {
              console.error("Error handling update:", err);
            }
          }
          break;

        case "awareness":
          // Handle cursor movements/awareness
          if (excludeSocketId) {
            // Send awareness updates to all clients except sender
            roomNamespace
              .to(roomId)
              .except(excludeSocketId)
              .emit("awareness", payload);

            // Also send as remote-cursor event for backward compatibility
            if (payload.cursor) {
              roomNamespace
                .to(roomId)
                .except(excludeSocketId)
                .emit("remote-cursor", {
                  id: payload.clientId,
                  username: payload.username,
                  color: payload.color,
                  position: payload.cursor,
                });
            }
          }
          break;

        case "user_joined":
          // Handle user joined notification
          roomNamespace.to(roomId).emit("user-joined", payload);
          break;

        case "user_left":
          // Handle user left notification
          roomNamespace.to(roomId).emit("user-left", payload);
          break;

        case "chat-message":
          // Handle chat messages
          roomNamespace.to(roomId).emit("chat-message", payload);
          break;

        default:
          // Forward any other events as-is
          if (excludeSocketId) {
            roomNamespace
              .to(roomId)
              .except(excludeSocketId)
              .emit(eventType, payload);
          } else {
            roomNamespace.to(roomId).emit(eventType, payload);
          }
      }
    });

    channelSubscriptions.set(roomId, true);
    console.log(`Room subscription setup for ${roomId}`);
  };

  roomNamespace.on("connection", (socket) => {
    console.log(`Room connection: ${socket.id}`);

    // Track which room this socket is in
    let currentRoomId: string | null = null;

    // Join a room
    socket.on("join-room", async (roomId: string, username: string) => {
      socket.join(roomId);
      currentRoomId = roomId;
      socket.data.roomId = roomId;

      // Ensure we have a Redis subscription for this room
      await setupRoomSubscription(roomId);

      // Add user to room tracking using Redis
      const userData = await addUserToRoom(roomId, socket.id, username);

      // Notify others in the room via Redis pub/sub
      await RedisPubSubService.publish(roomId, "user_joined", {
        id: socket.id,
        username,
        color: userData.color,
        timestamp: new Date().toISOString(),
      });

      console.log(`User ${username} (${socket.id}) joined room: ${roomId}`);

      // Send the list of users to the new user from Redis
      const users = await RedisPresenceService.getUsers(roomId);
      socket.emit("room-users", users);

      // Also broadcast updated user list to all clients in the room
      roomNamespace.to(roomId).emit("user-list-updated", users);
    });

    // Leave room
    socket.on("leave-room", (roomId: string) => {
      handleLeaveRoom(socket, roomId);
    });

    // Function to handle leaving a room
    const handleLeaveRoom = async (socket: any, roomId: string) => {
      if (!roomId) return;

      // Get user info before removing
      const users = await RedisPresenceService.getUsers(roomId);
      const user = users.find((u) => u.id === socket.id);

      if (user) {
        // Remove from Redis
        const isEmpty = await RedisPresenceService.removeUser(
          roomId,
          socket.id,
        );

        // Notify other users via Redis
        await RedisPubSubService.publish(roomId, "user_left", {
          id: socket.id,
          username: user.username,
          timestamp: new Date().toISOString(),
        });

        // If room is now empty, unsubscribe from Redis channel
        if (isEmpty && channelSubscriptions.has(roomId)) {
          await RedisPubSubService.unsubscribe(roomId);
          channelSubscriptions.delete(roomId);
        }
      }

      // Leave the Socket.IO room
      socket.leave(roomId);

      if (socket.data.roomId === roomId) {
        socket.data.roomId = null;
        currentRoomId = null;
      }

      console.log(`User ${socket.id} left room: ${roomId}`);
    };

    // Handle code editing
    socket.on(
      "code-edit",
      async (roomId: string, language: string, operation: any) => {
        // Validate input
        if (!roomId || !language) return;

        // Handle different types of operations
        if (operation.type === "update" && operation.update) {
          try {
            // Get current document
            const doc = await getDocument(roomId, language);

            // Apply the update to the document
            const binaryUpdate = Buffer.from(operation.update, "base64");
            Y.applyUpdate(doc, binaryUpdate);

            // Broadcast to other clients via Redis
            RedisPubSubService.publish(
              roomId,
              "update",
              {
                update: operation.update,
              },
              socket.id,
            );

            // Cache document state
            const stateAsUpdate = Y.encodeStateAsUpdate(doc);
            await cacheDocumentState(`${roomId}:${language}`, stateAsUpdate);
          } catch (err) {
            console.error("Error handling code update:", err);
          }
        } else if (operation.type === "content" && operation.content) {
          try {
            // Get document
            const doc = await getDocument(roomId, language);

            // Set content in the document
            const yText = doc.getText("monaco");
            yText.delete(0, yText.length);
            yText.insert(0, operation.content);

            // Cache and broadcast
            const stateAsUpdate = Y.encodeStateAsUpdate(doc);
            await cacheDocumentState(`${roomId}:${language}`, stateAsUpdate);

            // Broadcast update
            RedisPubSubService.publish(
              roomId,
              "update",
              {
                update: Buffer.from(stateAsUpdate).toString("base64"),
              },
              socket.id,
            );
          } catch (err) {
            console.error("Error handling content change:", err);
          }
        } else if (operation.type === "language-change") {
          // Notify others about language change
          RedisPubSubService.publish(
            roomId,
            "language-changed",
            {
              language,
            },
            socket.id,
          );
        }
      },
    );

    // Create or join a code editor session
    socket.on("join-editor", async (roomId: string, language: string) => {
      if (!roomId || !language) return;

      socket.data.roomId = roomId;
      socket.data.language = language;

      // Get document for this room/language
      const doc = await getDocument(roomId, language);

      // Set up WebSocket connection for Yjs
      setupWSConnection(socket, doc);

      console.log(
        `User ${socket.id} joined editor in room ${roomId} with language ${language}`,
      );
    });

    // Chat message
    socket.on("chat-message", (roomId: string, message: any) => {
      if (!roomId || !message) return;

      // Publish chat message through Redis
      RedisPubSubService.publish(roomId, "chat-message", message);
    });

    // Disconnect handler
    socket.on("disconnect", async () => {
      console.log(`Socket disconnected: ${socket.id}`);

      // Use Redis presence service to handle disconnection
      const emptyRooms = await RedisPresenceService.handleDisconnect(socket.id);

      // Cleanup Redis channel subscriptions for empty rooms
      for (const roomId of emptyRooms) {
        if (channelSubscriptions.has(roomId)) {
          await RedisPubSubService.unsubscribe(roomId);
          channelSubscriptions.delete(roomId);
        }
      }

      // If socket was in a room, handle leaving
      if (currentRoomId) {
        await handleLeaveRoom(socket, currentRoomId);
      }
    });
  });

  return io;
}
