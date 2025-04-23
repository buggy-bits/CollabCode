import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import mongoose from "mongoose";
import { createClient } from "redis";
import dotenv from "dotenv";
import http from "http";
import { setupSocketServer } from "./socket/index.js";
import roomRoutes from "./routes/roomRoutes.js";

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const server = http.createServer(app);

// Set up Socket.io
setupSocketServer(server);

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(helmet()); // Security middleware
app.use(morgan("dev")); // Logging middleware
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(express.json()); // Parse JSON bodies

// MongoDB connection
mongoose
  .connect(
    process.env.MONGODB_URI ||
      "mongodb://admin:password@localhost:27017/collabcode?authSource=admin",
  )
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Redis connection
const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

redisClient.on("error", (err) => console.error("Redis Client Error", err));
redisClient.on("connect", () => console.log("Connected to Redis"));
// Add this line to actually connect to Redis
redisClient
  .connect()
  .catch((err) => console.error("Redis connection error:", err));

// API Routes
app.use("/api/rooms", roomRoutes);

// Health check routes
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/ping", (req, res) => {
  res.json({ message: "pong" });
});

// Start server
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`WebSocket server available at ws://localhost:${port}`);
});
