import { useEffect, useState } from "react";
import {
  Typography,
  Button,
  Card,
  CardContent,
  CardActions,
  Grid,
  Box,
  CircularProgress,
  Chip,
  Paper,
  Stack,
  Divider,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import LockIcon from "@mui/icons-material/Lock";

interface Room {
  _id: string;
  name: string;
  createdBy: string;
  language: string;
  isPrivate: boolean;
  createdAt: string;
}

interface RoomListProps {
  onJoinRoom: (roomId: string, requiresPassword: boolean) => void;
  onCreateRoom: () => void;
}

const RoomList = ({ onJoinRoom, onCreateRoom }: RoomListProps) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRooms = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
        const response = await fetch(`${API_URL}/api/rooms`);

        if (!response.ok) {
          throw new Error("Failed to fetch rooms");
        }

        const data = await response.json();
        setRooms(data);
      } catch (err) {
        console.error("Error fetching rooms:", err);
        setError("Failed to load rooms. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchRooms();

    // Poll for rooms every 10 seconds
    const interval = setInterval(fetchRooms, 10000);

    return () => clearInterval(interval);
  }, []);

  const handleJoinRoom = (roomId: string, isPrivate: boolean) => {
    onJoinRoom(roomId, isPrivate);
  };

  if (isLoading && rooms.length === 0) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error && rooms.length === 0) {
    return (
      <Box sx={{ textAlign: "center", mt: 8 }}>
        <Typography color="error" variant="body1" gutterBottom>
          {error}
        </Typography>
        <Button
          variant="contained"
          onClick={onCreateRoom}
          startIcon={<AddIcon />}
          sx={{ mt: 2 }}
        >
          Create a Room
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 4,
        }}
      >
        <Typography variant="h4" component="h1">
          Available Rooms
        </Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={onCreateRoom}
        >
          Create Room
        </Button>
      </Box>

      {rooms.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <Typography variant="body1" gutterBottom>
            No rooms available. Create one to get started!
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {rooms.map((room) => (
            <Grid
              sx={{ gridColumn: { xs: "span 12", sm: "span 6", md: "span 4" } }}
              key={room._id}
            >
              <Card
                variant="outlined"
                sx={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}
                  >
                    <Typography variant="h6" component="h2">
                      {room.name}
                    </Typography>
                    {room.isPrivate && (
                      <Chip
                        icon={<LockIcon />}
                        label="Private"
                        size="small"
                        color="warning"
                      />
                    )}
                  </Box>
                  <Divider sx={{ my: 1.5 }} />
                  <Stack spacing={1} sx={{ mt: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Created by: {room.createdBy}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Language: {room.language}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Created: {new Date(room.createdAt).toLocaleString()}
                    </Typography>
                  </Stack>
                </CardContent>
                <CardActions>
                  <Button
                    variant="contained"
                    fullWidth
                    onClick={() => handleJoinRoom(room._id, room.isPrivate)}
                  >
                    Join Room
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
};

export default RoomList;
