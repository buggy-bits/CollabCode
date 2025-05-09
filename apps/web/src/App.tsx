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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
} from "@mui/material";
import CodeEditor from "./components/CodeEditor";
import RoomList from "./components/RoomList";
import RoomForm from "./components/RoomForm";
import {
  initializeSockets,
  joinRoom,
  cleanupSockets,
  verifyInviteToken,
} from "./services/socket";

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

  // Join via invite dialog
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [inviteRoomId, setInviteRoomId] = useState<string | null>(null);
  const [joinUsername, setJoinUsername] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [isPrivateRoom, setIsPrivateRoom] = useState(false);

  // Check for invite in URL
  useEffect(() => {
    const checkInviteLink = async () => {
      // Parse URL for invite token
      const path = window.location.pathname;
      if (path.startsWith("/invite/")) {
        const token = path.split("/invite/")[1];

        try {
          const result = await verifyInviteToken(token);
          if (result.valid && result.roomId) {
            setInviteRoomId(result.roomId);
            setShowJoinDialog(true);

            // Update URL to remove invite token
            window.history.replaceState({}, document.title, "/");
          }
        } catch (error) {
          console.error("Error verifying invite token:", error);
        }
      }
    };

    checkInviteLink();
  }, []);

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
          "X-Username": roomData.createdBy,
        },
        body: JSON.stringify(roomData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create room");
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
      alert(
        `Failed to create room: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Handle joining via invite dialog
  const handleJoinViaInvite = async () => {
    if (!inviteRoomId || !joinUsername) return;

    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

      // If private room with password
      if (isPrivateRoom && joinPassword) {
        const joinResponse = await fetch(
          `${API_URL}/api/rooms/${inviteRoomId}/join`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Username": joinUsername,
            },
            body: JSON.stringify({ password: joinPassword }),
          },
        );

        if (!joinResponse.ok) {
          const errorData = await joinResponse.json();
          throw new Error(errorData.message || "Failed to join room");
        }
      }

      // Get room info
      const response = await fetch(`${API_URL}/api/rooms/${inviteRoomId}`, {
        headers: {
          "X-Username": joinUsername,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to get room information");
      }

      const room = await response.json();

      // Set username
      setUsername(joinUsername);

      // Join room via socket
      joinRoom(inviteRoomId, joinUsername);

      // Set active room and switch to editor view
      setActiveRoom({
        id: inviteRoomId,
        language: room.language,
      });

      setShowJoinDialog(false);
      setView("editor");
    } catch (error) {
      console.error("Error joining room:", error);
      alert(
        `Failed to join room: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
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
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

      if (requiresPassword && password) {
        // Join with password verification
        const joinResponse = await fetch(
          `${API_URL}/api/rooms/${roomId}/join`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Username": name,
            },
            body: JSON.stringify({ password }),
          },
        );

        if (!joinResponse.ok) {
          const errorData = await joinResponse.json();
          throw new Error(errorData.message || "Failed to join room");
        }
      }

      // Get room info
      const response = await fetch(`${API_URL}/api/rooms/${roomId}`, {
        headers: {
          "X-Username": name,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to get room information");
      }

      const room = await response.json();

      // Set username
      setUsername(name);

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
      alert(
        `Failed to join room: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  // Check if room is private and set the state
  const handleCheckPrivateRoom = async (roomId: string) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const response = await fetch(`${API_URL}/api/rooms/${roomId}`);

      if (!response.ok) {
        throw new Error("Failed to get room information");
      }

      const room = await response.json();
      setIsPrivateRoom(room.isPrivate);
    } catch (error) {
      console.error("Error checking room privacy:", error);
      setIsPrivateRoom(false);
    }
  };

  // Effect to check if room is private when invite room ID changes
  useEffect(() => {
    if (inviteRoomId) {
      handleCheckPrivateRoom(inviteRoomId);
    }
  }, [inviteRoomId]);

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
            <CodeEditor
              roomId={activeRoom.id}
              initialLanguage={activeRoom.language}
              username={username}
            />
          )}
        </Container>

        {/* Join via invite dialog */}
        <Dialog open={showJoinDialog} onClose={() => setShowJoinDialog(false)}>
          <DialogTitle>Join Room</DialogTitle>
          <DialogContent>
            <DialogContentText>
              You have been invited to join a collaborative coding room.
              {isPrivateRoom &&
                " This is a private room that requires a password."}
            </DialogContentText>
            <Box
              sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 2 }}
            >
              <TextField
                label="Your Username"
                fullWidth
                value={joinUsername}
                onChange={(e) => setJoinUsername(e.target.value)}
                required
              />
              {isPrivateRoom && (
                <TextField
                  label="Room Password"
                  type="password"
                  fullWidth
                  value={joinPassword}
                  onChange={(e) => setJoinPassword(e.target.value)}
                  required
                />
              )}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShowJoinDialog(false)}>Cancel</Button>
            <Button
              onClick={handleJoinViaInvite}
              variant="contained"
              disabled={!joinUsername || (isPrivateRoom && !joinPassword)}
            >
              Join Room
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </ThemeProvider>
  );
}

export default App;
