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

const router = express.Router();

// GET /api/rooms - Get all rooms
router.get("/", getRooms);

// GET /api/rooms/:id - Get a single room
router.get("/:id", getRoomById);

// POST /api/rooms - Create a new room
router.post("/", auth, createRoomValidation, createRoom);

// PUT /api/rooms/:id - Update a room
router.put("/:id", auth, updateRoomValidation, updateRoom);

// DELETE /api/rooms/:id - Delete a room
router.delete("/:id", auth, deleteRoom);

// POST /api/rooms/:id/join - Join a room
router.post("/:id/join", joinRoomValidation, joinRoom);

// PATCH /api/rooms/:id/language - Update room language
router.patch("/:id/language", languageValidation, updateLanguage);

export default router;
