import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  CircularProgress,
  Typography,
  Alert,
  Button,
  Container,
  Paper,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CodeEditor from "../components/CodeEditor";
import {
  initializeSockets,
  joinRoom,
  cleanupSockets,
} from "../services/socket";

interface RoomData {
  roomId: string;
  roomName: string;
  language: string;
  isPrivate: boolean;
  password?: string;
  createdAt: string;
  createdBy: string;
}

const RoomPage = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomData | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [username, setUsername] = useState<string>("Anonymous");

  useEffect(() => {
    // Get username from localStorage
    const storedUsername = localStorage.getItem("username");
    if (storedUsername) {
      setUsername(storedUsername);
    }

    const loadRoom = async () => {
      if (!roomId) {
        setError("Room ID is required");
        setIsLoading(false);
        return;
      }

      try {
        // Fetch room details from API
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/api/rooms/${roomId}`,
        );

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("Room not found");
          }
          throw new Error("Failed to load room");
        }

        const roomData = await response.json();
        setRoom(roomData);

        const roomSocket = initializeSockets();
        // Initialize sockets
        if (roomSocket) {
          // Setup connection status listener
          roomSocket.on("connect", () => {
            console.log("Socket connected");
            setSocketConnected(true);

            // Join the room with the username
            joinRoom(roomId, username);
          });

          roomSocket.on("connect_error", (error) => {
            console.error("Socket connection error:", error);
            setError("Failed to connect to room server");
          });

          roomSocket.on("disconnect", () => {
            console.log("Socket disconnected");
            setSocketConnected(false);
          });

          // If socket is already connected, join the room immediately
          if (roomSocket.connected) {
            setSocketConnected(true);
            joinRoom(roomId, username);
          }
        }

        setIsLoading(false);
      } catch (err) {
        console.error("Error loading room:", err);
        setError(
          err instanceof Error ? err.message : "An unknown error occurred",
        );
        setIsLoading(false);
      }
    };

    loadRoom();

    // Cleanup sockets when unmounting
    return () => {
      cleanupSockets();
    };
  }, [roomId, username]);

  const handleBackToHome = () => {
    navigate("/");
  };

  if (isLoading) {
    return (
      <Container>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
          }}
        >
          <CircularProgress />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading room...
          </Typography>
        </Box>
      </Container>
    );
  }

  if (error || !room) {
    return (
      <Container>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
          }}
        >
          <Paper elevation={3} sx={{ p: 4, maxWidth: 500, width: "100%" }}>
            <Alert severity="error" sx={{ mb: 3 }}>
              {error || "Failed to load room"}
            </Alert>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<ArrowBackIcon />}
              onClick={handleBackToHome}
            >
              Back to Home
            </Button>
          </Paper>
        </Box>
      </Container>
    );
  }

  return (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <Box
        component="header"
        sx={{
          p: 2,
          borderBottom: "1px solid",
          borderColor: "divider",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<ArrowBackIcon />}
            onClick={handleBackToHome}
          >
            Home
          </Button>
          <Typography variant="h6">{room.roomName}</Typography>
          {!socketConnected && (
            <Alert severity="warning" sx={{ ml: 2 }}>
              Connecting...
            </Alert>
          )}
        </Box>
        <Box>
          <Typography variant="body2">
            Joined as: <strong>{username}</strong>
          </Typography>
        </Box>
      </Box>

      <Box sx={{ flexGrow: 1, overflow: "hidden" }}>
        {socketConnected ? (
          <CodeEditor
            roomId={roomId || ""}
            initialLanguage={room.language}
            username={username}
          />
        ) : (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
            }}
          >
            <CircularProgress />
            <Typography variant="h6" sx={{ mt: 2 }}>
              Connecting to room...
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default RoomPage;
