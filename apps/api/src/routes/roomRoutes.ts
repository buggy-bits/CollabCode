import express from "express";
import {
  getRooms,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
} from "../controllers/roomController.js";

const router = express.Router();

// GET /api/rooms - Get all rooms
router.get("/", getRooms);

// GET /api/rooms/:id - Get a single room
router.get("/:id", getRoomById);

// POST /api/rooms - Create a new room
router.post("/", createRoom);

// PUT /api/rooms/:id - Update a room
router.put("/:id", updateRoom);

// DELETE /api/rooms/:id - Delete a room
router.delete("/:id", deleteRoom);

export default router;
