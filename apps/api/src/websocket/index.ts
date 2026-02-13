import { Server as HttpServer, IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import * as Y from "yjs";
import { RedisClientType } from "redis";
import { redisClient } from "../index.js";
import { RedisPubSubService } from "../services/redisService.js";
import { Duplex } from "stream";

import { setupWSConnection } from "y-websocket/bin/utils";

// Document TTL in seconds (1 hour)
const DOCUMENT_TTL = 3600;

// Document store types
type DocumentStore = Map<string, Y.Doc>;

// Room document store - key is roomId
const documentsInMemory: DocumentStore = new Map();

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

// Get document from cache
async function getDocumentFromCache(
  docKey: string,
): Promise<Uint8Array | null> {
  try {
    const cachedState = await redisClient.get(`doc:${docKey}`);
    if (cachedState) {
      return Buffer.from(cachedState, "base64");
    }
    return null;
  } catch (err) {
    console.error("Failed to get document from cache:", err);
    return null;
  }
}

// Document state management
class DocumentManager {
  private static documents = new Map<string, Y.Doc>();
  private static cleanupTimers = new Map<string, NodeJS.Timeout>();
  private static readonly CLEANUP_DELAY = 1000 * 60 * 60; // 1 hour

  static async getDocument(roomId: string): Promise<Y.Doc> {
    // If already in memory, return that instance
    if (this.documents.has(roomId)) {
      return this.documents.get(roomId)!;
    }

    // Create a new doc
    const doc = new Y.Doc();

    // Try to load from Redis cache
    const cachedState = await getDocumentFromCache(roomId);
    if (cachedState) {
      Y.applyUpdate(doc, cachedState);
      console.log(`Loaded document for ${roomId} from cache`);
    } else {
      console.log(`Created new document for ${roomId}`);
    }

    // Store in memory
    this.documents.set(roomId, doc);

    // Set up document update handler
    doc.on("update", async (update: Uint8Array, origin: any) => {
      if (origin !== "redis") {
        await this.saveDocument(roomId, doc);
      }
    });

    return doc;
  }

  static async saveDocument(roomId: string, doc: Y.Doc): Promise<void> {
    try {
      const stateAsUpdate = Y.encodeStateAsUpdate(doc);
      await cacheDocumentState(roomId, stateAsUpdate);
    } catch (err) {
      console.error(`Failed to save document ${roomId}:`, err);
    }
  }
}

// ─── WebSocket Server Setup ───
// Uses noServer: true so we can manually route upgrade requests.
// This prevents conflicts with Socket.IO which also needs the upgrade event.

export function setupWebSocketServer(httpServer: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", async (ws: WebSocket, request: IncomingMessage) => {
    console.log("WebSocket client connected");

    // Extract room ID from URL
    const url = new URL(request.url!, `http://${request.headers.host}`);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const roomId = pathParts[pathParts.length - 1];

    if (!roomId) {
      console.error("No room ID found in URL:", url.pathname);
      ws.close(1008, "Room ID required");
      return;
    }

    console.log(`Client connecting to room: ${roomId}`);

    let currentDoc: Y.Doc | null = null;

    try {
      // Get or create document for this room
      currentDoc = await DocumentManager.getDocument(roomId);
      setupWSConnection(ws, request, { docName: roomId });
      // Send initial sync
      const state = Y.encodeStateAsUpdate(currentDoc);
      const base64State = Buffer.from(state).toString("base64");
      ws.send(
        JSON.stringify({
          type: "sync",
          update: base64State,
        }),
      );

      // Handle disconnection
      ws.on("close", async () => {
        console.log(`Client disconnected from room: ${roomId}`);
        if (currentDoc) {
          await DocumentManager.saveDocument(roomId, currentDoc);
        }
      });
    } catch (err) {
      console.error("Error setting up WebSocket connection:", err);
      ws.close(1011, "Internal server error");
    }
  });

  // ─── Manual Upgrade Routing ───
  // Only handle upgrade requests that are NOT for Socket.IO.
  // Socket.IO uses the /socket.io/ path by default — those go to Socket.IO.
  // Everything else (Yjs collaboration) goes to our raw WebSocket server.

  httpServer.on(
    "upgrade",
    (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      const pathname = new URL(request.url!, `http://${request.headers.host}`)
        .pathname;

      // Let Socket.IO handle its own upgrade requests
      if (pathname.startsWith("/socket.io")) {
        return;
      }

      // Route everything else to the Yjs WebSocket server
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    },
  );

  return wss;
}
