import { useState, useEffect } from "react";
import {
  CssBaseline,
  ThemeProvider,
  createTheme,
  AppBar,
  Toolbar,
  Typography,
  Button,
  Container,
  Box,
} from "@mui/material";
import CodeEditor from "./components/CodeEditor";
import RoomList from "./components/RoomList";
import RoomForm from "./components/RoomForm";
import { initializeSockets, joinRoom, cleanupSockets } from "./services/socket";

// Create a dark theme
const darkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#646cff",
    },
    secondary: {
      main: "#f44336",
    },
    background: {
      default: "#242424",
      paper: "#1a1a1a",
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
        },
      },
    },
  },
});

function App() {
  const [view, setView] = useState<"list" | "create" | "editor">("list");
  const [activeRoom, setActiveRoom] = useState<{
    id: string;
    language: string;
  } | null>(null);
  const [username, setUsername] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  // Initialize sockets
  useEffect(() => {
    initializeSockets();

    return () => {
      cleanupSockets();
    };
  }, []);

  // Handle room creation
  const handleCreateRoom = async (roomData: {
    name: string;
    language: string;
    createdBy: string;
    isPrivate: boolean;
    password?: string;
  }) => {
    setIsLoading(true);

    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const response = await fetch(`${API_URL}/api/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(roomData),
      });

      if (!response.ok) {
        throw new Error("Failed to create room");
      }

      const room = await response.json();

      // Set username
      setUsername(roomData.createdBy);

      // Join room
      joinRoom(room._id, roomData.createdBy);

      // Set active room and switch to editor view
      setActiveRoom({
        id: room._id,
        language: room.language,
      });

      setView("editor");
    } catch (error) {
      console.error("Error creating room:", error);
      alert("Failed to create room. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle joining a room
  const handleJoinRoom = async (roomId: string, requiresPassword: boolean) => {
    // For simplicity, prompt for username and password if needed
    const name = prompt("Enter your username:");

    if (!name) return;

    let password: string | null = null;

    if (requiresPassword) {
      password = prompt("Enter room password:");
      if (!password) return;
    }

    try {
      if (requiresPassword && password) {
        // You could add an API call to verify the password here
        // For simplicity, we're skipping this step
      }

      // Set username
      setUsername(name);

      // Get room info
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const response = await fetch(`${API_URL}/api/rooms/${roomId}`);

      if (!response.ok) {
        throw new Error("Failed to get room information");
      }

      const room = await response.json();

      // Join room via socket
      joinRoom(roomId, name);

      // Set active room and switch to editor view
      setActiveRoom({
        id: roomId,
        language: room.language,
      });

      setView("editor");
    } catch (error) {
      console.error("Error joining room:", error);
      alert("Failed to join room. Please try again.");
    }
  };

  // Handle leaving a room
  const handleLeaveRoom = () => {
    setActiveRoom(null);
    setView("list");
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box
        sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
      >
        <AppBar position="static">
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              CollabCode
            </Typography>
            {activeRoom && (
              <Button
                color="secondary"
                variant="contained"
                onClick={handleLeaveRoom}
              >
                Leave Room
              </Button>
            )}
          </Toolbar>
        </AppBar>

        <Container
          component="main"
          sx={{
            flexGrow: 1,
            p: 2,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {view === "list" && (
            <RoomList
              onJoinRoom={handleJoinRoom}
              onCreateRoom={() => setView("create")}
            />
          )}

          {view === "create" && (
            <RoomForm onSubmit={handleCreateRoom} isLoading={isLoading} />
          )}

          {view === "editor" && activeRoom && (
            <CodeEditor roomId={activeRoom.id} language={activeRoom.language} />
          )}
        </Container>
      </Box>
    </ThemeProvider>
  );
}

export default App;
