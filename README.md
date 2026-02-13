<div align="center">

  <a href="https://github.com/buggy-bits/CollabCode">
    <picture>
      <img src="./apps/web/public/collabCode_logo.svg" alt="CollabCode logo" width="260" >
    </picture>
  </a>

<h3 align="center">CollabCode</h3>

**Real-time collaborative code editor for teams.**

Write code together — multiple languages, zero conflicts, instant sync. No account required.

[![License: MIT](https://img.shields.io/badge/License-MIT-E8A838?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![MongoDB](https://img.shields.io/badge/MongoDB-8-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://mongodb.com)
[![Redis](https://img.shields.io/badge/Redis-Alpine-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io)

</div>

---

## What is CollabCode?

CollabCode is a browser-based code editor where teams can write, edit, and run code together in real time. Think Google Docs, but for code.

- **Instant sync** — edits appear on every screen in milliseconds, powered by CRDTs (Yjs)
- **10+ languages** — JavaScript, TypeScript, Python, Java, C++, Go, Rust, and more
- **Code execution** — run code directly from the editor with live terminal output
- **Private rooms** — password-protect your sessions
- **No sign-up** — just create a room, share the link, and start coding

---

### System overview

```mermaid
graph TB
    subgraph Clients["Clients (Browser)"]
        direction TB
        U1["User A"]
        U2["User B"]
        U3["User N..."]
    end

    subgraph Frontend["Frontend — React + Vite"]
        direction TB
        Monaco["Monaco Editor"]
        YjsBinding["Yjs CRDT Binding"]
        Awareness["Cursor & Presence Tracking"]
        Terminal["xterm.js Terminal"]
        ChatUI["Chat Panel"]
        MUI["Material UI Shell"]
    end

    subgraph API["API Server — Express.js :3000"]
        direction TB
        REST["REST API\n/api/rooms/*"]
        Middleware["Middleware Stack\nCORS · Helmet · Morgan · Validator"]
        WSServer["WebSocket Server\ny-websocket"]
        DocManager["Document Manager\nYjs Y.Doc per room"]
        ChatHandler["Chat Handler\nSocket.IO /chat"]
        ExecHandler["Execution Handler\nSocket.IO /execution"]
    end

    subgraph Data["Data Layer"]
        direction TB
        Mongo[("MongoDB\nRoom metadata\nChat history")]
        Redis[("Redis\nDoc cache · Presence\nPub/Sub · Chat broadcast")]
    end

    subgraph External["External"]
        Runtime["Sandboxed Runtime\nwss://lang.exec-server"]
    end

    %% Client — Frontend
    U1 & U2 & U3 --- MUI

    %% Frontend internal
    MUI --- Monaco
    MUI --- Terminal
    MUI --- ChatUI
    Monaco --- YjsBinding
    YjsBinding --- Awareness

    %% Frontend — API
    YjsBinding -- "WebSocket\nYjs sync + awareness" --- WSServer
    MUI -- "HTTP\ncreate / join / list rooms" --- REST
    ChatUI -- "Socket.IO\nchat:send · chat:receive" --- ChatHandler
    REST --- Middleware

    %% Frontend — Execution
    Terminal -- "Socket.IO\nrun · output" --- ExecHandler

    %% API internals
    WSServer --- DocManager
    Middleware --- REST

    %% API — Data
    DocManager -- "Cache snapshots\nTTL: 1h" --- Redis
    REST -- "CRUD rooms" --- Mongo
    ChatHandler -- "Pub/Sub broadcast\nper-room channels" --- Redis
    ChatHandler -. "Persist messages\n(optional)" .-> Mongo

    %% Execution — External
    ExecHandler -- "WSS\nper-session" --- Runtime
```

## Quick Start

### Prerequisites

- **Node.js** ≥ 18 and **npm** ≥ 10
- **Docker** and **Docker Compose** (for MongoDB + Redis)

### 1. Clone and install

```bash
git clone https://github.com/buggy-bits/CollabCode.git

cd CollabCode

npm install
```

### 2. Start infrastructure

```bash
docker-compose up -d
```

This starts:

- **MongoDB** on `localhost:27017` (user: `admin`, password: `password`)
- **Redis** on `localhost:6379`

### 3. Configure environment

Copy the example env files and adjust if needed:

```bash
# Backend
cp apps/api/.env.example apps/api/.env.development

# Frontend
cp apps/web/.env.example apps/web/.env.development
```

Default values work out of the box for local development.

### 4. Run

```bash
npm run dev
```

This starts both servers via Turborepo:

| Service             | URL                           |
| ------------------- | ----------------------------- |
| Frontend            | http://localhost:5173         |
| API + WebSocket     | http://localhost:3000         |
| Chat namespace      | ws://localhost:3000/chat      |
| Execution namespace | ws://localhost:3000/execution |

Open the frontend, create a room, and share the link.

---

## Backend Architecture

> See [`apps/api/README.md`](apps/api/README.md) for the full backend reference.

### Middleware stack

```
Request → CORS → Helmet → Morgan → express.json → Request Logger → Route Handler
```

- **CORS** — configured origins from `ALLOWED_ORIGINS` env var
- **Helmet** — sets security headers (CSP, HSTS, etc.)
- **Morgan** — HTTP request logging in `dev` format
- **Request Logger** — custom middleware for structured logging
- **express-validator** — input validation on room create/join/update

### Real-time collaboration

The WebSocket layer uses **y-websocket** to serve as a Yjs awareness + sync provider:

1. Client connects with a `roomId`
2. Server creates/loads a `Y.Doc` for that room
3. All edits are synced as Yjs updates — CRDT ensures conflict-free merges
4. Redis caches document snapshots for fast reconnection
5. MongoDB stores room metadata (name, language, privacy)

### Code execution

The `/execution` Socket.IO namespace on port 3000 bridges the browser to external sandboxed runtimes:

```
Browser → Socket.IO /execution → WSS → External Runtime
```

Each connection gets a unique session ID. The handler forwards `run` and `evaluate` events and streams `output` back to the terminal.

---

## Frontend

> See [`apps/web/README.md`](apps/web/README.md) for the full frontend reference.

Built with React 19, Vite, Material UI, and Monaco Editor. Key features:

- **Monaco Editor** with Yjs binding for collaborative editing
- **Real-time cursor tracking** via Yjs awareness protocol
- **Language sync** — changing the language in one tab updates all connected clients
- **Copy room link** — one-click sharing with clipboard feedback
- **Inline terminal** — xterm.js-powered output panel with resize handle

## Docker

The `docker-compose.yml` provides MongoDB and Redis for local development:

```bash
# Start everything
docker-compose up -d

# Start only the databases (run API/web locally)
docker-compose up -d mongodb redis

# Stop
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

### Connecting to databases manually

**MongoDB** (via shell):

```bash
docker exec -it collabcode-mongodb-1 mongosh -u admin -p password --authenticationDatabase admin
```

Or use [MongoDB Compass](https://www.mongodb.com/products/compass) → connect to `mongodb://admin:password@localhost:27017/?authSource=admin`

**Redis** (via CLI):

```bash
docker exec -it collabcode-redis-1 redis-cli
```

Or use [RedisInsight](https://redis.com/redis-enterprise/redis-insight/) → connect to `localhost:6379`

---

## Contributing

Contributions are welcome. If you're interested in contributing:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes
4. Push to your fork and open a Pull Request

---

## License

MIT
