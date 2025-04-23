# CollabCode - Full Stack TypeScript Monorepo

A modern full-stack application built with TypeScript, React, Express, MongoDB, and Redis.

## Project Structure

```
.
├── apps/
│   ├── api/         # Express.js api service
│   └── web/            # React frontend application
├── packages/           # Shared packages
│   ├── eslint-config/  # ESLint configurations
│   ├── typescript-config/ # TypeScript configurations
│   └── ui/            # Shared UI components
├── docker-compose.yml  # Docker configuration for MongoDB and Redis
└── package.json       # Root package.json
```

## Prerequisites

- Node.js >= 18
- Docker and Docker Compose
- npm >= 10.9.2

## Getting Started

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/collabcode.git
   cd collabcode
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start MongoDB and Redis:

   ```bash
   docker-compose up -d
   ```

4. Start the development servers:
   ```bash
   npm run dev
   ```

This will start:

- api server on http://localhost:3000
- Frontend server on http://localhost:5173

## Development

### api

The api is an Express.js application with TypeScript. It includes:

- MongoDB integration
- Redis integration
- CORS enabled
- Helmet for security
- Morgan for logging

### Frontend

The frontend is a React application with Vite. It includes:

- TypeScript
- React Router
- React Query
- Axios for API calls
- ESLint and Prettier

## Git Hooks

The project uses Husky for Git hooks:

- pre-commit: Runs lint-staged (ESLint and Prettier)
- pre-push: Runs type checking

## Docker

The project uses Docker for local development:

- MongoDB on port 27017
- Redis on port 6379

See [DOCKER.md](DOCKER.md) for more details.

## Scripts

- `npm run dev`: Start development servers
- `npm run build`: Build all packages
- `npm run lint`: Run ESLint
- `npm run format`: Run Prettier
- `npm run check-types`: Run TypeScript type checking

## License

MIT

### My dev setup

I used a Hybrid setup where Mongo and Redis runs on docker and web, api runs locally.

Start Mongo + Redis with command

```bash
# from repo root
docker-compose up -d mongodb redis
```

Start backend service with

```bash
#apps/api
npm run dev
```

Start Vite with

```bash
#apps/web
npm run dev
```

### MongoDB

Connect to MongoDb Using the Shell

```bash
docker exec -it <container_name_or_id> mongosh
```

For my case, container name is `collabcode-mongodb-1`

```bash
docker exec -it collabcode-mongodb-1 mongosh
```

For a visual interface, use MongoDB Compass

- Open GUI application and connect to `mongodb://localhost:27017`

### Redis

Use the Redis command-line interface (redis-cli) inside the container to interact with the database.

Step 1: Enter the Redis CLI

```bash
docker exec -it <container_name_or_id> redis-cli
```

Use a GUI Tool (RedisInsight)
For a visual interface, use RedisInsight (free GUI by Redis):

```

## Test Change

This is a small change to test the pre-commit hook.
```
