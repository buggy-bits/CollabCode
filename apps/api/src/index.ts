import express from "express";
import { createServer } from "http";
import { Server as IOServer } from "socket.io";
import ioClient from "socket.io-client";
import corsMiddleware from "./config/cors.js";
import helmet from "helmet";
import morgan from "morgan";
import mongoose from "mongoose";
import { createClient } from "redis";
import { setupWebSocketServer } from "./websocket/index.js";
import { setupChatHandler } from "./socket/chatHandler.js";
import roomRoutes from "./routes/roomRoutes.js";
import { requestLogger } from "./middleware/requestLogger.js";
import {
  RedisPubSubService,
  RedisPresenceService,
} from "./services/redisService.js";
import {
  EXECUTION_SERVER_ORIGIN,
  MONGODB_URI,
  PORT,
  PROXY_EXECUTION_SERVER_PORT,
  REDIS_URL,
} from "./config/env.js";
import { v4 as uuidv4 } from "uuid";

// ─── Main API Server ───

const app = express();
const port = PORT || 3000;
const mainServer = createServer(app);

// Redis connection
export const redisClient = createClient({
  url: REDIS_URL,
});

// Create a separate Redis client for pub/sub subscriptions
export const redisPubSubClient = redisClient.duplicate();

redisClient.on("error", (err) => console.error("Redis Client Error", err));
redisClient.on("connect", () => console.log("Connected to Redis"));

redisPubSubClient.on("error", (err) =>
  console.error("Redis PubSub Client Error", err),
);
redisPubSubClient.on("connect", () =>
  console.log("PubSub client connected to Redis"),
);

// Connect to Redis
(async () => {
  try {
    await redisClient.connect();
    await redisPubSubClient.connect();
    console.log("Connected to Redis");

    // Initialize Redis services after connection
    await RedisPubSubService.init(redisClient as any);
    await RedisPresenceService.init(redisClient as any);
  } catch (err) {
    console.error("Redis connection error:", err);
  }
})();

const wss = setupWebSocketServer(mainServer);

// ─── Chat Server (Socket.IO on same :3000 port) ───

const chatIO = new IOServer(mainServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

setupChatHandler(chatIO);

// Middlewares
app.use(corsMiddleware);
app.use(helmet());
app.use(morgan("dev"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(requestLogger);

// MongoDB connection
mongoose
  .connect(
    MONGODB_URI ||
      "mongodb://admin:password@localhost:27017/collabcode?authSource=admin",
  )
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// API Routes
app.use("/api/rooms", roomRoutes);

// Health check routes
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/ping", (req, res) => {
  res.json({ message: "pong" });
});

// Welcome route
app.get("/", (req, res) => {
  res.send("CollabCode API Server");
});

// ─── Graceful Shutdown ───
// Close ALL resources in the correct order:
// 1. Socket.IO servers (disconnect all sockets with proper events)
// 2. HTTP servers (stop accepting new connections)
// 3. WebSocket server (close Yjs connections)
// 4. Data stores (Redis, MongoDB)
// 5. Force exit after timeout if anything hangs

let isShuttingDown = false;

const gracefulShutdown = async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log("\n🛑 Shutting down gracefully...");

  // Force exit after 10 seconds if shutdown hangs
  const forceExitTimer = setTimeout(() => {
    console.error("Shutdown timed out after 10s — forcing exit");
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref(); // Don't let this timer keep the process alive

  try {
    // 1. Close Socket.IO servers (sends disconnect to all connected sockets)
    await Promise.all([
      new Promise<void>((resolve) => {
        chatIO.close(() => {
          console.log("Chat Socket.IO server closed");
          resolve();
        });
      }),
      new Promise<void>((resolve) => {
        proxyIO.close(() => {
          console.log("Proxy Socket.IO server closed");
          resolve();
        });
      }),
    ]);

    // 2. Close HTTP servers (stops accepting new connections, waits for existing to finish)
    await Promise.all([
      new Promise<void>((resolve) => {
        mainServer.close(() => {
          console.log(`Main HTTP server closed (port ${port})`);
          resolve();
        });
      }),
      new Promise<void>((resolve) => {
        proxyServer.close(() => {
          console.log(`Proxy HTTP server closed (port ${PROXY_PORT})`);
          resolve();
        });
      }),
    ]);

    // 3. Close WebSocket server (Yjs connections)
    await new Promise<void>((resolve) => {
      wss.close(() => {
        console.log("Yjs WebSocket server closed");
        resolve();
      });
    });

    // 4. Close data stores
    if (redisClient.isOpen) {
      await redisClient.disconnect();
      console.log("Redis client closed");
    }
    if (redisPubSubClient.isOpen) {
      await redisPubSubClient.disconnect();
      console.log("Redis PubSub client closed");
    }
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log("MongoDB connection closed");
    }

    console.log("All resources closed. Exiting.");
    process.exit(0);
  } catch (err) {
    console.error("Error during shutdown:", err);
    process.exit(1);
  }
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  gracefulShutdown();
});

// ─── Code Execution Proxy Server ───

const PROXY_PORT = PROXY_EXECUTION_SERVER_PORT;

const proxyApp = express();
const proxyServer = createServer(proxyApp);

const proxyIO = new IOServer(proxyServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

proxyIO.on("connection", (clientSocket) => {
  const { language } = clientSocket.handshake.query;

  if (!language) {
    clientSocket.disconnect(true);
    return;
  }

  console.log("✅ Frontend connected to proxy");

  // Generate a unique session ID per connection
  const sessionId = uuidv4().slice(0, 10);

  const EXTERNAL_URL = `wss://${language}.${EXECUTION_SERVER_ORIGIN}`;
  const externalSocket = ioClient(EXTERNAL_URL, {
    transports: ["websocket"],
    query: { sessionId, lang: language },
    autoConnect: false,
  });

  externalSocket.connect();

  externalSocket.on("connect", () => {
    console.log("✅ Connected to external server");
  });

  externalSocket.on("output", (data) => {
    clientSocket.emit("output", data);
  });

  externalSocket.on("disconnect", (reason) => {
    console.log("⚠️ Disconnected from external server:", reason);
    clientSocket.disconnect();
  });

  externalSocket.on("error", (err) => {
    console.error("❌ External server error:", err);
    clientSocket.emit("error", "External server connection failed.");
  });

  clientSocket.on("run", (data) => {
    externalSocket.emit("run", data);
  });

  clientSocket.on("evaluate", (data) => {
    externalSocket.emit("evaluate", data);
  });

  clientSocket.on("disconnect", () => {
    console.log("⚠️ Client disconnected");
    externalSocket.disconnect();
  });
});

// Start servers
proxyServer.listen(PROXY_PORT, () => {
  console.log(`🚀 Proxy server running at http://localhost:${PROXY_PORT}`);
});

mainServer.listen(port, () => {
  console.log(`🚀 Main server running on port ${port}`);
  console.log(`   REST API:    http://localhost:${port}/api`);
  console.log(`   WebSocket:   ws://localhost:${port}`);
  console.log(`   Socket.IO:   http://localhost:${port}/chat`);
});
