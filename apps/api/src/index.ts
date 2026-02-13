import express from "express";
import { createServer } from "http";
import { Server as IOServer } from "socket.io";
import ioClient from "socket.io-client";
import corsMiddleware from "./config/cors.js";
import helmet from "helmet";
import morgan from "morgan";
import mongoose from "mongoose";
import { createClient } from "redis";
import http from "http";
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
  REDIS_URL,
} from "./config/env.js";
import { v4 as uuidv4 } from "uuid";

// ─── Main API Server ───

const app = express();
const port = PORT || 3000;
const server = http.createServer(app);

// Redis connection
export const redisClient = createClient({
  url: REDIS_URL || "redis://localhost:6379",
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

const wss = setupWebSocketServer(server);

// ─── Chat Server (Socket.IO on same :3000 port) ───

const chatIO = new IOServer(server, {
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

// Handle graceful shutdown
const gracefulShutdown = async () => {
  console.log("Shutting down server gracefully...");

  server.close(() => console.log("HTTP server closed"));
  wss.close(() => console.log("WebSocket server closed"));

  if (redisClient.isOpen) {
    await redisClient.disconnect();
    console.log("Redis client connection closed");
  }
  if (redisPubSubClient.isOpen) {
    await redisPubSubClient.disconnect();
    console.log("Redis PubSub client connection closed");
  }
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
    console.log("MongoDB connection closed");
  }

  process.exit(0);
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  gracefulShutdown();
});

// ─── Code Execution Proxy Server ───

const PROXY_PORT = 1234;

const proxyApp = express();
const httpServer = createServer(proxyApp);

const io = new IOServer(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (clientSocket) => {
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
httpServer.listen(PROXY_PORT, () => {
  console.log(`🚀 Proxy server running at http://localhost:${PROXY_PORT}`);
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`WebSocket server available at ws://localhost:${port}`);
});
