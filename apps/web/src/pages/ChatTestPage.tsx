import { useState } from "react";
import { Box, TextField, Button, Paper, Typography } from "@mui/material";
import ChatTest from "../components/ChatTest";

const ChatTestPage = () => {
  const [username, setUsername] = useState("");
  const [roomId, setRoomId] = useState("");
  const [isJoined, setIsJoined] = useState(false);

  const handleJoin = () => {
    if (!username.trim() || !roomId.trim()) return;
    setIsJoined(true);
  };

  const handleLeave = () => {
    setIsJoined(false);
    setUsername("");
    setRoomId("");
  };

  if (isJoined) {
    return (
      <Box
        sx={{ height: "100vh", p: 2, display: "flex", flexDirection: "column" }}
      >
        <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6">
            Room: {roomId} | User: {username}
          </Typography>
          <Button
            variant="outlined"
            color="secondary"
            onClick={handleLeave}
            sx={{ mt: 1 }}
          >
            Leave Room
          </Button>
        </Paper>
        <Box sx={{ flexGrow: 1 }}>
          <ChatTest roomId={roomId} username={username} />
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
      }}
    >
      <Paper elevation={3} sx={{ p: 4, maxWidth: 400, width: "100%" }}>
        <Typography variant="h5" gutterBottom>
          Join Chat Room
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            fullWidth
            required
          />
          <TextField
            label="Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            fullWidth
            required
          />
          <Button
            variant="contained"
            onClick={handleJoin}
            disabled={!username.trim() || !roomId.trim()}
          >
            Join Room
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default ChatTestPage;
