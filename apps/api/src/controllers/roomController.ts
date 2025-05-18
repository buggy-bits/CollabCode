import { Request, Response } from "express";
import Room, { IRoom } from "../models/Room.js";
import { validationResult } from "express-validator";
import { RedisMetadataService } from "../services/redisService.js";
import mongoose from "mongoose";
import { redisClient } from "index.js";
import { v4 as uuidv4 } from "uuid";
// Get all rooms
export const getRooms = async (req: Request, res: Response) => {
  try {
    const rooms = await Room.find().select("-password").sort({ createdAt: -1 });
    res.json(rooms);
  } catch (error) {
    console.error("Error fetching rooms:", error);
    res.status(500).json({ message: "Error fetching rooms" });
  }
};

// Get a single room by ID
export const getRoomById = async (req: Request, res: Response) => {
  try {
    const roomId = req.params.id;

    if (!roomId) {
      return res.status(400).json({ message: "Room ID is required" });
    }

    // // Try to get room metadata from Redis cache first
    // const cachedMetadata = await RedisMetadataService.getMetadata(roomId);

    // if (cachedMetadata) {
    //   console.log(`Retrieved room metadata from cache for ${roomId}`);
    //   return res.json(cachedMetadata);
    // }

    // If not in cache, get from MongoDB
    const room = await Room.find({ roomId: roomId }).select(
      "-password -_id -__v",
    );
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    // Cache the room metadata for future requests
    // const metadata = {
    //   roomId: room.id.toString(),
    //   roomName: room.roomName,
    //   language: room.language,
    //   isPrivate: room.isPrivate,
    //   createdBy: room.createdBy,
    //   createdAt: room.createdAt.toISOString(),
    //   updatedAt: room.updatedAt.toISOString(),
    // };

    // await RedisMetadataService.cacheMetadata(roomId, metadata);

    res.json(room[0]);
  } catch (error) {
    console.error("Error fetching room:", error);
    res.status(500).json({ message: "Error fetching room" });
  }
};

// Create a new room
export const createRoom = async (req: any, res: any) => {
  try {
    const { roomName, language, isPrivate, password } = req.body;

    // Generate a unique ID for the room
    const roomId = uuidv4();
    const timestamp = new Date().toISOString();

    const room = new Room({
      roomId,
      roomName,
      createdBy: req.user.id,
      language,
      isPrivate,
      password: password || null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await room.save();
    // Create room data object
    const redisKey = `room:${roomId}:info`;

    const redisRoomData = {
      roomId,
      roomName: room.roomName,
      language: room.language,
      isPrivate: String(room.isPrivate),
      password: room.password ?? "", // Ensures null becomes empty string
      createdAt: String(room.createdAt),
      updatedAt: String(room.updatedAt),
    };

    await redisClient.hSet(redisKey, redisRoomData);

    // Set expiration for room data (1 day)
    await redisClient.expire(`room:${roomId}:info`, 86400);

    // Add to list of rooms
    await redisClient.zAdd("rooms", {
      score: Date.now(),
      value: roomId,
    });

    console.log(`Room created: ${roomId} (${roomName})`);

    // Return room info (excluding password)
    return res.status(201).json({
      roomId,
      roomName,
      username: req.user.username,
      createdBy: room.createdBy,
      language,
      isPrivate,
      createdAt: room.createdAt,
    });
  } catch (error) {
    console.error("Error creating room:", error);
    return res.status(500).json({ error: "Failed to create room" });
  }
};

// Update a room
export const updateRoom = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const roomId = req.params.id;

    if (!roomId) {
      return res.status(400).json({ message: "Room ID is required" });
    }

    const { roomName, language, isPrivate, password } = req.body;
    const room = await Room.findById(roomId);

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    if (room.createdBy.toString() !== req.user?.id) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this room" });
    }

    room.roomName = roomName || room.roomName;
    room.language = language || room.language;
    room.isPrivate = isPrivate !== undefined ? isPrivate : room.isPrivate;
    if (isPrivate && password) {
      room.password = password;
    }

    await room.save();

    // Update the metadata in Redis cache
    const metadata = {
      _id: room._id.toString(),
      name: room.roomName,
      language: room.language,
      isPrivate: room.isPrivate,
      createdBy: room.createdBy,
      createdAt: room.createdAt.toISOString(),
      updatedAt: room.updatedAt.toISOString(),
    };

    await RedisMetadataService.cacheMetadata(roomId, metadata);

    res.json(room);
  } catch (error) {
    console.error("Error updating room:", error);
    res.status(500).json({ message: "Error updating room" });
  }
};

// Delete a room
export const deleteRoom = async (req: Request, res: Response) => {
  try {
    const roomId = req.params.id;

    if (!roomId) {
      return res.status(400).json({ message: "Room ID is required" });
    }

    const room = await Room.findById(roomId);

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    if (room.createdBy.toString() !== req.user?.id) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this room" });
    }

    await room.deleteOne();

    // Delete room metadata from Redis cache
    await RedisMetadataService.deleteMetadata(roomId);

    res.json({ message: "Room deleted successfully" });
  } catch (error) {
    console.error("Error deleting room:", error);
    res.status(500).json({ message: "Error deleting room" });
  }
};

// Join a room
export const joinRoom = async (req: Request, res: Response) => {
  try {
    const roomId = req.params.id;

    if (!roomId) {
      return res.status(400).json({ message: "Room ID is required" });
    }

    const { password } = req.body;

    // Try to get room from Redis cache first
    let roomData: any;
    const cachedMetadata = await RedisMetadataService.getMetadata(roomId);

    if (cachedMetadata) {
      console.log(`Using cached room metadata for join request ${roomId}`);
      roomData = cachedMetadata;

      // If room is private, we still need to check password against DB
      if (cachedMetadata.isPrivate) {
        const room = await Room.findById(roomId);

        if (!room) {
          return res.status(404).json({ message: "Room not found" });
        }

        if (room.password !== password) {
          return res.status(401).json({ message: "Invalid password" });
        }
      }
    } else {
      // Not in cache, get from MongoDB
      const room = await Room.findById(roomId);

      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      if (room.isPrivate && room.password !== password) {
        return res.status(401).json({ message: "Invalid password" });
      }

      roomData = {
        id: room._id.toString(),
        name: room.name,
        language: room.language,
      };

      // Cache the room metadata for future requests
      const metadata = {
        _id: room._id.toString(),
        name: room.roomName,
        language: room.language,
        isPrivate: room.isPrivate,
        createdBy: room.createdBy,
        createdAt: room.createdAt.toISOString(),
        updatedAt: room.updatedAt.toISOString(),
      };

      await RedisMetadataService.cacheMetadata(roomId, metadata);
    }

    res.json({
      message: "Successfully joined room",
      room: {
        id: roomData._id || roomData.id,
        name: roomData.name,
        language: roomData.language,
      },
    });
  } catch (error) {
    console.error("Error joining room:", error);
    res.status(500).json({ message: "Error joining room" });
  }
};

// Update room language
export const updateLanguage = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const roomId = req.params.id;

    if (!roomId) {
      return res.status(400).json({ message: "Room ID is required" });
    }

    const { language } = req.body;
    const room = await Room.findById(roomId);

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    room.language = language;
    await room.save();

    // Update just the language field in Redis cache
    await RedisMetadataService.updateMetadataField(
      roomId,
      "language",
      language,
    );

    res.json({
      message: "Room language updated successfully",
      language: room.language,
    });
  } catch (error) {
    console.error("Error updating room language:", error);
    res.status(500).json({ message: "Error updating room language" });
  }
};
