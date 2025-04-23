# Docker Setup for Local Development

This project uses Docker to run MongoDB and Redis for local development.

## Prerequisites

- Docker
- Docker Compose

## Getting Started

1. Start the containers:
   ```bash
   docker-compose up -d
   ```

2. This will start:
   - MongoDB on port 27017 (credentials: admin/password)
   - Redis on port 6379

3. Stop the containers:
   ```bash
   docker-compose down
   ```

## MongoDB Connection String

```
mongodb://admin:password@localhost:27017
```

## Redis Connection String

```
redis://localhost:6379
```

## Data Persistence

The data for both MongoDB and Redis is persisted in Docker volumes:
- `mongodb_data` for MongoDB
- `redis_data` for Redis 