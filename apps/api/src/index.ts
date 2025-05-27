import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import mongoose from "mongoose";
import { createClient } from "redis";
import dotenv from "dotenv";
import http from "http";
// import { setupSocketServer } from "./socket/index.js";
import { setupWebSocketServer } from "./websocket/index.js";
import roomRoutes from "./routes/roomRoutes.js";
import { requestLogger } from "./middleware/requestLogger.js";
import {
  RedisPubSubService,
  RedisPresenceService,
} from "./services/redisService.js";

// Load environment variables
// dotenv.config();
// dotenv.config({ path: '.env.development' }); // or simply dotenv.config();
dotenv.config({ path: `.env.${process.env.NODE_ENV || "development"}` });

const app = express();
const port = process.env.PORT || 3000;
const server = http.createServer(app);

// Redis connection
export const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
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

    // Initialize Redis services after connection with type casting to avoid type errors
    await RedisPubSubService.init(redisClient as any);
    await RedisPresenceService.init(redisClient as any);
  } catch (err) {
    console.error("Redis connection error:", err);
  }
})();

// Setup Socket.IO server for chat
// const io = setupSocketServer(server);

// Setup WebSocket server for Yjs
const wss = setupWebSocketServer(server);

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(helmet()); // Security middleware
app.use(morgan("dev")); // Logging middleware
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(express.json()); // Parse JSON bodies
app.use(requestLogger); // Request debug logger

// MongoDB connection
mongoose
  .connect(
    process.env.MONGODB_URI ||
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

  // Close HTTP server (stops accepting new connections)
  server.close(() => console.log("HTTP server closed"));

  // Close Socket.IO connections
  // io.close(() => console.log("Socket.IO server closed"));

  // Close WebSocket connections
  wss.close(() => console.log("WebSocket server closed"));

  // Disconnect from Redis
  if (redisClient.isOpen) {
    await redisClient.disconnect();
    console.log("Redis client connection closed");
  }

  // Disconnect from Redis PubSub client
  if (redisPubSubClient.isOpen) {
    await redisPubSubClient.disconnect();
    console.log("Redis PubSub client connection closed");
  }

  // Disconnect from MongoDB
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
    console.log("MongoDB connection closed");
  }

  process.exit(0);
};

// Listen for termination signals
process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  gracefulShutdown();
});

import { createServer } from "http";
import { Server as IOServer } from "socket.io";
import ioClient from "socket.io-client"; // External Socket.IO client (v2.x)

// Config
const PROXY_PORT = 1234;
let executionLanguage = "javascript";
// const EXTERNAL_URL = `wss://${executionLanguage}.${process.env.EXECUTION_SERVER_ORIGIN}`;
// const EXTERNAL_URL = `wss://python.repl-web.programiz.com`;
const sessionId = "YDIgjJnoc2"; // Replace this with dynamic value if needed
// console.log(process.env.EXECUTION_SERVER_ORIGIN);
// console.log(`wss://${executionLanguage}.${process.env.EXECUTION_SERVER_ORIGIN}`);
const proxyApp = express();
const httpServer = createServer(proxyApp);

// Socket.IO server for clients (React app, Node test app)
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

  const EXTERNAL_URL = `wss://${language}.${process.env.EXECUTION_SERVER_ORIGIN}`;
  // Connect to external Socket.IO server (v2.x)
  const externalSocket = ioClient(EXTERNAL_URL, {
    transports: ["websocket"],
    query: {
      sessionId,
      lang: language,
    },
    autoConnect: false,
  });
  externalSocket.connect();
  externalSocket.on("connect", () => {
    console.log("✅ Connected to external server");
  });

  // Forward specific events from external → client (manually handle each event)
  externalSocket.on("output", (data) => {
    console.log("⬅️ External → Client: output", data);
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

  // Forward messages from client → external (manually handle each event)
  clientSocket.on("set-language", (data) => {
    console.log("set-lang set to:", data.language);
    executionLanguage = data.language;
  });

  clientSocket.on("run", (data) => {
    console.log("➡️ Client → External: run", data);
    externalSocket.emit("run", data);
  });

  clientSocket.on("evaluate", (data) => {
    console.log("➡️ Client → External: evaluate", data);
    externalSocket.emit("evaluate", data);
  });

  clientSocket.on("disconnect", () => {
    console.log("⚠️ Client disconnected");
    externalSocket.disconnect();
  });
});

// Start server
httpServer.listen(PROXY_PORT, () => {
  console.log(`🚀 Proxy server running at http://localhost:${PROXY_PORT}`);
});

// Start server
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`WebSocket server available at ws://localhost:${port}`);
});
