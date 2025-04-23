import { Request, Response } from "express";
import Room, { IRoom } from "../models/Room.js";

// Get all rooms
export const getRooms = async (req: Request, res: Response) => {
  try {
    const rooms = await Room.find({ isPrivate: false });
    res.status(200).json(rooms);
  } catch (error) {
    console.error("Error fetching rooms:", error);
    res.status(500).json({ message: "Error fetching rooms" });
  }
};

// Get a single room by ID
export const getRoomById = async (req: Request, res: Response) => {
  try {
    const room = await Room.findById(req.params.id);

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    res.status(200).json(room);
  } catch (error) {
    console.error(`Error fetching room ${req.params.id}:`, error);
    res.status(500).json({ message: "Error fetching room" });
  }
};

// Create a new room
export const createRoom = async (req: Request, res: Response) => {
  try {
    const { name, createdBy, language, isPrivate, password } = req.body;

    if (!name || !createdBy) {
      return res
        .status(400)
        .json({ message: "Room name and creator are required" });
    }

    const newRoom = new Room({
      name,
      createdBy,
      language: language || "javascript",
      isPrivate: isPrivate || false,
      password: password || undefined,
    });

    const savedRoom = await newRoom.save();
    res.status(201).json(savedRoom);
  } catch (error) {
    console.error("Error creating room:", error);
    res.status(500).json({ message: "Error creating room" });
  }
};

// Update a room
export const updateRoom = async (req: Request, res: Response) => {
  try {
    const { name, language, isPrivate, password } = req.body;

    const room = await Room.findById(req.params.id);

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const updatedRoom = await Room.findByIdAndUpdate(
      req.params.id,
      {
        name: name || room.name,
        language: language || room.language,
        isPrivate: isPrivate !== undefined ? isPrivate : room.isPrivate,
        password: password || room.password,
      },
      { new: true },
    );

    res.status(200).json(updatedRoom);
  } catch (error) {
    console.error(`Error updating room ${req.params.id}:`, error);
    res.status(500).json({ message: "Error updating room" });
  }
};

// Delete a room
export const deleteRoom = async (req: Request, res: Response) => {
  try {
    const room = await Room.findById(req.params.id);

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    await Room.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Room deleted successfully" });
  } catch (error) {
    console.error(`Error deleting room ${req.params.id}:`, error);
    res.status(500).json({ message: "Error deleting room" });
  }
};
