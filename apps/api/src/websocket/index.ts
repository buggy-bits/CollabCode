import { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import * as Y from "yjs";
import { RedisClientType } from "redis";
import { redisClient } from "../index.js";
import { RedisPubSubService } from "../services/redisService.js";

// Document TTL in seconds (1 hour)
const DOCUMENT_TTL = 3600;

// Document store types
type DocumentStore = Map<string, Y.Doc>;

// Room document store - key is roomId:language
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

  static async getDocument(roomId: string, language: string): Promise<Y.Doc> {
    const docKey = `${roomId}:${language}`;

    // If already in memory, return that instance
    if (this.documents.has(docKey)) {
      return this.documents.get(docKey)!;
    }

    // Create a new doc
    const doc = new Y.Doc();

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

  static async saveDocument(docKey: string, doc: Y.Doc): Promise<void> {
    try {
      const stateAsUpdate = Y.encodeStateAsUpdate(doc);
      await cacheDocumentState(docKey, stateAsUpdate);
    } catch (err) {
      console.error(`Failed to save document ${docKey}:`, err);
    }
  }
}

export function setupWebSocketServer(httpServer: HttpServer) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/yjs",
  });

  wss.on("connection", async (ws: WebSocket, request) => {
    console.log("WebSocket client connected");

    // Extract room ID from URL
    const url = new URL(request.url!, `http://${request.headers.host}`);
    const roomId = url.pathname.split("/").pop();
    if (!roomId) {
      ws.close(1008, "Room ID required");
      return;
    }

    let currentDoc: Y.Doc | null = null;

    // Handle messages
    ws.on("message", async (message: string) => {
      try {
        const data = JSON.parse(message.toString());

        switch (data.type) {
          case "sync-request": {
            // Get or create document
            currentDoc = await DocumentManager.getDocument(
              roomId,
              "javascript",
            );
            const state = Y.encodeStateAsUpdate(currentDoc);
            const base64State = Buffer.from(state).toString("base64");

            ws.send(
              JSON.stringify({
                type: "sync",
                update: base64State,
              }),
            );
            break;
          }

          case "update": {
            if (!currentDoc) {
              currentDoc = await DocumentManager.getDocument(
                roomId,
                "javascript",
              );
            }

            const update = Buffer.from(data.update, "base64");
            Y.applyUpdate(currentDoc, update);

            // Broadcast to other clients
            wss.clients.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(
                  JSON.stringify({
                    type: "update",
                    update: data.update,
                  }),
                );
              }
            });

            // Cache state
            await DocumentManager.saveDocument(
              `${roomId}:javascript`,
              currentDoc,
            );
            break;
          }

          case "awareness": {
            // Broadcast awareness updates to other clients
            wss.clients.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(
                  JSON.stringify({
                    type: "awareness",
                    awareness: data.awareness,
                  }),
                );
              }
            });
            break;
          }
        }
      } catch (err) {
        console.error("Error handling WebSocket message:", err);
      }
    });

    // Handle disconnection
    ws.on("close", async () => {
      console.log("WebSocket client disconnected");
      if (currentDoc) {
        await DocumentManager.saveDocument(`${roomId}:javascript`, currentDoc);
      }
    });
  });

  return wss;
}
