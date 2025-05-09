# WebSocket Collaboration Setup

This document provides information about how the real-time collaboration system works and how to set it up properly.

## Architecture Overview

The real-time collaboration system is built using:

1. **Socket.IO** for WebSocket communication
2. **Yjs** for Conflict-free Replicated Data Types (CRDT)
3. **Redis** for document caching and session management
4. **MongoDB** for persistent storage

## Setup Instructions

### 1. Environment Variables

Create a `.env` file in the `apps/api` directory with the following settings:

```
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://admin:password@localhost:27017/collabcode
REDIS_URL=redis://localhost:6379
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
DOCUMENT_TTL=3600
```

Adjust the values as needed for your environment.

### 2. Running with Docker Compose

The easiest way to set up the development environment is using Docker Compose:

```bash
docker-compose up -d
```

This will start MongoDB and Redis instances with the configuration defined in `docker-compose.yml`.

### 3. Running the Application

Start the API server:

```bash
cd apps/api
npm run dev
```

Start the web client:

```bash
cd apps/web
npm run dev
```

## Collaboration Features

### Document Synchronization

- Documents are synchronized in real-time using Yjs CRDT
- Document state is cached in Redis with a 1-hour TTL
- Each room can have multiple language-specific documents

### Session Management

- Active users are tracked in Redis
- Session information is preserved for reconnection
- User presence (online status) is maintained in real-time

### Cursor and Selection Tracking

- Real-time cursor position updates
- Selection range tracking
- User-specific colorization

## Troubleshooting

### Connection Issues

If you're experiencing connection issues:

1. Check that Redis and MongoDB are running: `docker-compose ps`
2. Verify the connection settings in your `.env` file
3. Check the server logs for any connection errors

### Document Synchronization Problems

If documents aren't synchronizing correctly:

1. Ensure all clients are connecting to the same server
2. Check network connectivity between clients and server
3. Inspect browser console logs for WebSocket errors

## Best Practices

1. **Handling Large Documents**: For very large documents, consider implementing pagination or windowing
2. **Rate Limiting**: For production, implement rate limiting on WebSocket events
3. **Monitoring**: Monitor Redis memory usage as document cache grows

## Architecture Diagram

```
┌─────────────┐       ┌─────────────┐
│  Web Client │◄──────┤   Web Client│
└──────┬──────┘       └──────┬──────┘
       │                     │
       │                     │
       │ WebSocket          │ WebSocket
       │                     │
┌──────▼─────────────────────▼──────┐
│          API Server               │
│                                   │
│  ┌─────────────┐  ┌────────────┐  │
│  │   Socket.IO │  │     Yjs    │  │
│  └─────┬───────┘  └──────┬─────┘  │
└────────┼──────────────────┼───────┘
         │                  │
┌────────▼──────┐    ┌──────▼───────┐
│               │    │               │
│     Redis     │    │    MongoDB    │
│               │    │               │
└───────────────┘    └───────────────┘
```

## Further Improvements

1. Implement document versioning
2. Add conflict resolution UI for rare edge cases
3. Implement offline mode with local-first editing
4. Add end-to-end encryption for sensitive content
