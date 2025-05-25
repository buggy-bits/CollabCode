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
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

interface RoomData {
  id: string;
  name: string;
  language: string;
  availableLanguages: string[];
}

const RoomPage = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState<string>("Anonymous");
  const [roomData, setRoomData] = useState<RoomData | null>(null);

  useEffect(() => {
    const joinRoom = async () => {
      // Get username from localStorage
      const storedUsername = localStorage.getItem("username");
      if (storedUsername) {
        setUsername(storedUsername);
      }

      if (!roomId) {
        setError("Room ID is required");
        setIsLoading(false);
        return;
      }

      try {
        // Join the room
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/api/rooms/${roomId}/join`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              username: storedUsername || "Anonymous",
            }),
          },
        );

        if (!response.ok) {
          throw new Error("Failed to join room");
        }

        const data = await response.json();
        setRoomData(data.room);
      } catch (err) {
        console.error("Error joining room:", err);
        setError("Failed to join room. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    joinRoom();
  }, [roomId]);

  const handleBackToHome = () => {
    navigate("/");
  };

  const handleLanguageChange = (newLanguage: string) => {
    if (roomData) {
      setRoomData({
        ...roomData,
        language: newLanguage,
      });
    }
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

  if (error || !roomId || !roomData) {
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
      <ToastContainer />
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
          <Typography variant="h6">Room: {roomData.name}</Typography>
        </Box>
        <Box>
          <Typography variant="body2">
            Joined as: <strong>{username}</strong>
          </Typography>
        </Box>
      </Box>

      <Box sx={{ flexGrow: 1, overflow: "hidden" }}>
        <CodeEditor
          roomId={roomId}
          username={username}
          initialLanguage={roomData.language}
          availableLanguages={roomData.availableLanguages}
          onLanguageChange={handleLanguageChange}
        />
      </Box>
    </Box>
  );
};

export default RoomPage;
