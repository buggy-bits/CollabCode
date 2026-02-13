# CollabCode Web

React frontend for the CollabCode collaborative code editor. Built with Vite, Material UI, and Monaco Editor.

## Tech Stack

| Component     | Technology                                 |
| ------------- | ------------------------------------------ |
| Framework     | React 19                                   |
| Bundler       | Vite 6                                     |
| UI Library    | Material UI 7                              |
| Editor        | Monaco Editor (VSCode engine)              |
| Real-time     | Yjs + y-monaco + custom WebSocket provider |
| Terminal      | xterm.js                                   |
| Routing       | React Router 7                             |
| Notifications | react-toastify                             |

## Key Components

### CodeEditor

The core collaborative editing component:

- **Monaco Editor** with VSCode-grade syntax highlighting and IntelliSense
- **Yjs binding** via `y-monaco` for real-time conflict-free editing
- **Language sync** — uses `Y.Map("metadata")` to broadcast language changes to all clients
- **Awareness protocol** — shows remote cursors with user colors
- **JetBrains Mono** font for code rendering

### RoomPage

The room interface featuring:

- **Header bar** with room name, copy link button, run code, and user count
- **Copy Room Link** — clipboard API with toast feedback and checkmark animation
- **Output panel** — resizable xterm.js terminal for code execution output
- **Users drawer** — slide-out panel showing connected collaborators

## Environment Variables

Create `.env.development` from the example:

```bash
cp .env.example .env.development
```

| Variable                         | Default                 | Description          |
| -------------------------------- | ----------------------- | -------------------- |
| `VITE_API_BASE_URL`              | `http://localhost:3000` | Backend API URL      |
| `VITE_WS_URL`                    | `ws://localhost:3000`   | Yjs WebSocket URL    |
| `VITE_CODE_EXECUTION_SOCKET_URL` | `http://localhost:1234` | Code execution proxy |

## Running

```bash
# From repo root (starts both API + web via Turborepo)
npm run dev

# Or from this directory only
npm run dev
```

Opens at `http://localhost:5173` with hot module replacement.
