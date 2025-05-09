import { redisClient, redisPubSubClient } from "../index.js";

// TTL for different types of data (in seconds)
const METADATA_TTL = 86400; // 24 hours
const PRESENCE_TTL = 3600; // 1 hour

/**
 * Redis Pub/Sub service for real-time broadcasting
 */
export class RedisPubSubService {
  // Generate Redis channel name for a room
  static getRoomChannel(roomId: string): string {
    return `collabcode:room:${roomId}`;
  }

  // Publish a message to a room channel
  static async publish(
    roomId: string,
    eventType: string,
    payload: any,
    excludeSocketId?: string,
  ): Promise<void> {
    try {
      const channel = this.getRoomChannel(roomId);
      const message = JSON.stringify({
        eventType,
        payload,
        timestamp: Date.now(),
        excludeSocketId,
      });

      await redisClient.publish(channel, message);
    } catch (error) {
      console.error(`Redis publish error for room ${roomId}:`, error);
    }
  }

  // Subscribe to a room channel
  static async subscribe(
    roomId: string,
    callback: (message: any) => void,
  ): Promise<void> {
    try {
      const channel = this.getRoomChannel(roomId);

      await redisPubSubClient.subscribe(channel, (message) => {
        try {
          const parsedMessage = JSON.parse(message);
          callback(parsedMessage);
        } catch (error) {
          console.error("Error parsing Redis message:", error);
        }
      });

      console.log(`Subscribed to channel: ${channel}`);
    } catch (error) {
      console.error(`Redis subscribe error for room ${roomId}:`, error);
    }
  }

  // Unsubscribe from a room channel
  static async unsubscribe(roomId: string): Promise<void> {
    try {
      const channel = this.getRoomChannel(roomId);

      if (redisPubSubClient.isOpen) {
        await redisPubSubClient.unsubscribe(channel);
        console.log(`Unsubscribed from channel: ${channel}`);
      }
    } catch (error) {
      console.error(`Redis unsubscribe error for room ${roomId}:`, error);
    }
  }
}

/**
 * Redis Presence Management service
 */
export class RedisPresenceService {
  // Get Redis key for room users
  static getUsersKey(roomId: string): string {
    return `collabcode:room:${roomId}:users`;
  }

  // Add a user to a room
  static async addUser(
    roomId: string,
    socketId: string,
    userData: any,
  ): Promise<void> {
    try {
      const usersKey = this.getUsersKey(roomId);
      await redisClient.hSet(usersKey, socketId, JSON.stringify(userData));
      await redisClient.expire(usersKey, PRESENCE_TTL);

      // Also track this socket in a separate set for quick lookups
      await redisClient.sAdd(`socket:${socketId}:rooms`, roomId);
    } catch (error) {
      console.error(`Error adding user to room ${roomId}:`, error);
    }
  }

  // Remove a user from a room
  static async removeUser(roomId: string, socketId: string): Promise<boolean> {
    try {
      const usersKey = this.getUsersKey(roomId);
      await redisClient.hDel(usersKey, socketId);
      await redisClient.sRem(`socket:${socketId}:rooms`, roomId);

      // Check if room is now empty
      const remainingUsers = await redisClient.hLen(usersKey);
      return remainingUsers === 0;
    } catch (error) {
      console.error(`Error removing user from room ${roomId}:`, error);
      return false;
    }
  }

  // Get all users in a room
  static async getUsers(roomId: string): Promise<any[]> {
    try {
      const usersKey = this.getUsersKey(roomId);
      const usersData = await redisClient.hGetAll(usersKey);

      return Object.entries(usersData).map(([socketId, userData]) => {
        const user = JSON.parse(userData);
        return {
          id: socketId,
          ...user,
        };
      });
    } catch (error) {
      console.error(`Error getting users in room ${roomId}:`, error);
      return [];
    }
  }

  // Get all rooms a socket is in
  static async getUserRooms(socketId: string): Promise<string[]> {
    try {
      return await redisClient.sMembers(`socket:${socketId}:rooms`);
    } catch (error) {
      console.error(`Error getting rooms for socket ${socketId}:`, error);
      return [];
    }
  }

  // Clean up when a socket disconnects
  static async handleDisconnect(socketId: string): Promise<string[]> {
    try {
      // Get all rooms this socket was in
      const rooms = await this.getUserRooms(socketId);

      // Remove user from each room
      const emptyRooms = [];
      for (const roomId of rooms) {
        const isEmpty = await this.removeUser(roomId, socketId);
        if (isEmpty) {
          emptyRooms.push(roomId);
        }
      }

      // Clean up the socket:rooms set
      await redisClient.del(`socket:${socketId}:rooms`);

      return emptyRooms;
    } catch (error) {
      console.error(`Error handling disconnect for socket ${socketId}:`, error);
      return [];
    }
  }
}

/**
 * Redis Room Metadata Caching service
 */
export class RedisMetadataService {
  // Get Redis key for room metadata
  static getMetadataKey(roomId: string): string {
    return `collabcode:room:${roomId}:metadata`;
  }

  // Cache room metadata
  static async cacheMetadata(roomId: string, metadata: any): Promise<void> {
    try {
      const metadataKey = this.getMetadataKey(roomId);
      await redisClient.hSet(metadataKey, metadata);
      await redisClient.expire(metadataKey, METADATA_TTL);
    } catch (error) {
      console.error(`Error caching metadata for room ${roomId}:`, error);
    }
  }

  // Get cached room metadata
  static async getMetadata(roomId: string): Promise<any | null> {
    try {
      const metadataKey = this.getMetadataKey(roomId);
      const metadata = await redisClient.hGetAll(metadataKey);

      // If empty object is returned, metadata doesn't exist
      return Object.keys(metadata).length > 0 ? metadata : null;
    } catch (error) {
      console.error(`Error getting metadata for room ${roomId}:`, error);
      return null;
    }
  }

  // Delete cached room metadata
  static async deleteMetadata(roomId: string): Promise<void> {
    try {
      const metadataKey = this.getMetadataKey(roomId);
      await redisClient.del(metadataKey);
    } catch (error) {
      console.error(`Error deleting metadata for room ${roomId}:`, error);
    }
  }

  // Update a specific field in room metadata
  static async updateMetadataField(
    roomId: string,
    field: string,
    value: any,
  ): Promise<void> {
    try {
      const metadataKey = this.getMetadataKey(roomId);
      await redisClient.hSet(metadataKey, field, value.toString());
      await redisClient.expire(metadataKey, METADATA_TTL);
    } catch (error) {
      console.error(`Error updating metadata field for room ${roomId}:`, error);
    }
  }
}
