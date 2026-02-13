import express from "express";
import {
  getRooms,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
  joinRoom,
  updateLanguage,
} from "../controllers/roomController.js";
import {
  createRoomValidation,
  updateRoomValidation,
  joinRoomValidation,
  languageValidation,
} from "../middleware/roomValidation.js";
import { auth } from "../middleware/auth.js";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { redisClient } from "../index.js";
import { validateBody } from "../middleware/validateBody.js";

const router = express.Router();

// Validation schema for room creation
const createRoomSchema = z.object({
  roomName: z.string().min(1, "Room name is required"),
  language: z.string().default("javascript"),
  isPrivate: z.boolean().default(false),
  password: z.string().optional(),
});

// Validation schema for updating room language
const updateLanguageSchema = z.object({
  language: z.string().min(1, "Language is required"),
});

// GET /api/rooms - Get all rooms
router.get("/", getRooms);

// GET /api/rooms/:id - Get a single room
router.get("/:id", getRoomById);

// POST /api/rooms - Create a new room
router.post("/", auth, validateBody(createRoomSchema), createRoom);

// PUT /api/rooms/:id - Update a room
router.put("/:id", auth, updateRoomValidation, updateRoom);

// DELETE /api/rooms/:id - Delete a room
router.delete("/:id", auth, deleteRoom);

// POST /api/rooms/:id/join - Join a room
router.post("/:id/join", joinRoomValidation, joinRoom);

// PATCH /api/rooms/:id/language - Update room language
router.patch(
  "/:id/language",
  languageValidation,
  async (req: any, res: any) => {
    try {
      const roomId = req.params.id;

      // Validate request body
      const validation = updateLanguageSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          error: "Invalid input",
          details: validation.error.format(),
        });
      }

      const { language } = validation.data;

      // Check if room exists
      const exists = await redisClient.exists(`room:${roomId}:info`);

      if (!exists) {
        return res.status(404).json({ error: "Room not found" });
      }

      // Update room language
      await redisClient.hSet(`room:${roomId}:info`, {
        language,
        updatedAt: new Date().toISOString(),
      });

      console.log(`Room language updated: ${roomId} -> ${language}`);

      return res.json({
        id: roomId,
        language,
      });
    } catch (error) {
      console.error("Error updating room language:", error);
      return res.status(500).json({ error: "Failed to update room language" });
    }
  },
);

// health route
router.get("/health", (req, res) => {
  res.status(200).send("Room routes are healthy");
});

export default router;
