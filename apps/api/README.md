# CollabCode API

Express.js backend powering the CollabCode collaborative editor. Handles room management, real-time document sync, and code execution proxying.

## Tech Stack

| Component  | Technology                               |
| ---------- | ---------------------------------------- |
| Framework  | Express.js 4                             |
| Language   | TypeScript 5                             |
| Database   | MongoDB 8 (Mongoose ODM)                 |
| Cache      | Redis (pub/sub, presence, doc snapshots) |
| Real-time  | y-websocket (Yjs CRDT sync)              |
| Validation | Zod + express-validator                  |
| Security   | Helmet, CORS                             |
| Execution  | Socket.IO proxy to sandboxed runtimes    |

## API Reference

### Rooms

| Method   | Endpoint                  | Auth | Description           |
| -------- | ------------------------- | ---- | --------------------- |
| `GET`    | `/api/rooms`              | No   | List all public rooms |
| `GET`    | `/api/rooms/:id`          | No   | Get room by ID        |
| `POST`   | `/api/rooms`              | Yes  | Create a new room     |
| `PUT`    | `/api/rooms/:id`          | Yes  | Update room details   |
| `DELETE` | `/api/rooms/:id`          | Yes  | Delete a room         |
| `POST`   | `/api/rooms/:id/join`     | No   | Join an existing room |
| `PATCH`  | `/api/rooms/:id/language` | No   | Change room language  |

**Auth**: Set the `x-username` header. The `auth` middleware extracts it as the user identity.

### Create Room

```bash
curl -X POST http://localhost:3000/api/rooms \
  -H "Content-Type: application/json" \
  -H "x-username: alice" \
  -d '{
    "roomName": "Sprint Planning",
    "language": "typescript",
    "isPrivate": false
  }'
```

**Response:**

```json
{
  "roomId": "a1b2c3d4-e5f6-...",
  "name": "Sprint Planning",
  "language": "typescript",
  "username": "alice",
  "availableLanguages": ["javascript", "typescript", "python", ...]
}
```

### Supported Languages

`javascript` · `typescript` · `python` · `java` · `cpp` · `csharp` · `php` · `ruby` · `go` · `rust`

Defined in `src/config/languages.ts` and shared with the validation layer.

## Environment Variables

Create `.env.development` from the example:

```bash
cp .env.example .env.development
```

| Variable                  | Default                                                                | Description                            |
| ------------------------- | ---------------------------------------------------------------------- | -------------------------------------- |
| `PORT`                    | `3000`                                                                 | API server port                        |
| `MONGODB_URI`             | `mongodb://admin:password@localhost:27017/collabcode?authSource=admin` | MongoDB connection                     |
| `REDIS_URL`               | `redis://localhost:6379`                                               | Redis connection                       |
| `NODE_ENV`                | `development`                                                          | Environment                            |
| `EXECUTION_SERVER_ORIGIN` | —                                                                      | External execution runtime domain      |
| `ALLOWED_ORIGINS`         | —                                                                      | CORS allowed origins (comma-separated) |

## Running

```bash
# From repo root (starts both API + web via Turborepo)
npm run dev

# Or from this directory only
npm run dev
```

The API starts on `http://localhost:3000`. A code execution proxy also starts on `ws://localhost:1234`.

## Scripts

| Command               | Description                                 |
| --------------------- | ------------------------------------------- |
| `npm run dev`         | Start with nodemon (auto-reload on changes) |
| `npm run build`       | Compile TypeScript to `dist/`               |
| `npm start`           | Run compiled production build               |
| `npm run lint`        | ESLint check                                |
| `npm run check-types` | TypeScript type check                       |
