import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  CircularProgress,
  Typography,
  TextField,
  Button,
  Container,
  Paper,
  Alert,
} from "@mui/material";
import { verifyInviteToken } from "../services/socket";

const InvitePage = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [roomId, setRoomId] = useState<string | null>(null);

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setError("Invalid invite link");
        setIsLoading(false);
        return;
      }

      try {
        // Verify the token
        const result = await verifyInviteToken(token);

        if (result.valid && result.roomId) {
          setRoomId(result.roomId);
        } else {
          setError("Invalid or expired invite link");
        }
      } catch (err) {
        console.error("Error verifying invite token:", err);
        setError("Failed to verify invite. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleJoinRoom = () => {
    if (!roomId || !username.trim()) {
      setError("Please enter a username");
      return;
    }

    // Store username in localStorage
    localStorage.setItem("username", username);

    // Navigate to the room
    navigate(`/room/${roomId}`);
  };

  if (isLoading) {
    return (
      <Container maxWidth="sm">
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
            Verifying invite...
          </Typography>
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="sm">
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
          }}
        >
          <Paper elevation={3} sx={{ p: 4, width: "100%" }}>
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
            <Button fullWidth variant="contained" onClick={() => navigate("/")}>
              Go to Home
            </Button>
          </Paper>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
        }}
      >
        <Paper elevation={3} sx={{ p: 4, width: "100%" }}>
          <Typography variant="h5" align="center" gutterBottom>
            Join Collaboration Room
          </Typography>

          <Typography variant="body1" paragraph>
            You've been invited to join a collaborative coding session. Enter
            your name to continue.
          </Typography>

          <TextField
            fullWidth
            label="Your Name"
            variant="outlined"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            margin="normal"
            required
            autoFocus
          />

          <Button
            fullWidth
            variant="contained"
            color="primary"
            size="large"
            onClick={handleJoinRoom}
            disabled={!username.trim()}
            sx={{ mt: 2 }}
          >
            Join Room
          </Button>
        </Paper>
      </Box>
    </Container>
  );
};

export default InvitePage;
