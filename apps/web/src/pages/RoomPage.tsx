import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  CircularProgress,
  Typography,
  Alert,
  Button,
  Container,
  Paper,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PeopleIcon from "@mui/icons-material/People";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import CodeEditor, { CodeEditorRef } from "../components/CodeEditor";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { io, Socket } from "socket.io-client";

interface RoomData {
  id: string;
  name: string;
  language: string;
  availableLanguages: string[];
}

interface User {
  id: string;
  username: string;
  avatar?: string;
}

const RoomPage = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState<string>("Anonymous");
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isUsersDrawerOpen, setIsUsersDrawerOpen] = useState(false);
  const [isOutputOpen, setIsOutputOpen] = useState(true);
  const [outputWidth, setOutputWidth] = useState(400); // Default width in pixels
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef<number>(0);
  const dragStartWidth = useRef<number>(0);
  const [isRunning, setIsRunning] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const editorRef = useRef<CodeEditorRef>(null);

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

  const handleRunCode = async () => {
    try {
      setIsRunning(true);
      setIsOutputOpen(true);

      // Get the code from the editor
      const userCode = editorRef.current?.getValue() || "";
      console.log(socketRef.current);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      // Initialize socket connection if not already connected
      if (!socketRef.current) {
        socketRef.current = io(
          import.meta.env.VITE_CODE_EXECUTION_SOCKET_URL ||
            "http://localhost:1234",
          {
            transports: ["websocket"],
            autoConnect: true,
          },
        );

        // Set up socket event listeners
        socketRef.current.on("connect", () => {
          console.log("Connected to execution server");
          // Emit "run" event to execute Python code
          if (socketRef.current) {
            socketRef.current.emit("run", {
              code: userCode,
            });
            console.log(userCode);
            // socketRef.current.emit('language', { execution_language:  roomData?.language || 'javascript'});
          }
        });

        socketRef.current.on("output", (data) => {
          console.log(data.output);
        });
        socketRef.current.on("disconnect", () => {
          setIsRunning(false);
          console.log("running set to false");
          console.log("Disconnected from execution server");
        });

        socketRef.current.on("error", (error) => {
          console.error("Socket error:", error);
          // TODO: Show error in output area
        });

        socketRef.current.on("execution_result", (result) => {
          console.log("Execution result:", result);
          // TODO: Display result in output area
        });
      }
    } catch (error) {
      console.error("Error running code:", error);
      // TODO: Show error in output area
    } finally {
      setIsRunning(false);
      // socketRef.current = null;
      console.log("running set to false");
    }
  };

  const toggleUsersDrawer = () => {
    setIsUsersDrawerOpen(!isUsersDrawerOpen);
  };

  const toggleOutput = () => {
    setIsOutputOpen(!isOutputOpen);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = outputWidth;
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;

    const deltaX = dragStartX.current - e.clientX;
    const newWidth = Math.max(
      200,
      Math.min(800, dragStartWidth.current + deltaX),
    );
    setOutputWidth(newWidth);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // Cleanup socket connection on component unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        console.log("disconnected::");
      }
    };
  }, []);

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
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<PlayArrowIcon />}
            onClick={handleRunCode}
            disabled={isRunning}
          >
            {isRunning ? "Running..." : "Run Code"}
          </Button>
          <IconButton onClick={toggleUsersDrawer} color="primary">
            <PeopleIcon />
          </IconButton>

          <Typography variant="body2">
            Joined as: <strong>{username}</strong>
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          flexGrow: 1,
          overflow: "hidden",
          display: "flex",
          position: "relative",
        }}
      >
        <Box sx={{ flexGrow: 1, overflow: "hidden" }}>
          <CodeEditor
            ref={editorRef}
            roomId={roomId}
            username={username}
            initialLanguage={roomData.language}
            availableLanguages={roomData.availableLanguages}
            onLanguageChange={handleLanguageChange}
          />
        </Box>

        {isOutputOpen && (
          <Box
            sx={{
              width: outputWidth,
              borderLeft: "1px solid",
              borderColor: "divider",
              display: "flex",
              flexDirection: "column",
              position: "relative",
            }}
          >
            <Box
              sx={{
                p: 1,
                borderBottom: "1px solid",
                borderColor: "divider",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                bgcolor: "background.paper",
              }}
            >
              <Typography variant="subtitle2">Output</Typography>
              <IconButton size="small" onClick={toggleOutput}>
                <ChevronRightIcon />
              </IconButton>
            </Box>
            <Box sx={{ flexGrow: 1, p: 2, bgcolor: "background.default" }}>
              {/* Output content will go here */}
            </Box>
            <Box
              sx={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: "4px",
                cursor: "col-resize",
                "&:hover": {
                  bgcolor: "primary.main",
                },
                ...(isDragging && {
                  bgcolor: "primary.main",
                }),
              }}
              onMouseDown={handleMouseDown}
            />
          </Box>
        )}

        {!isOutputOpen && (
          <IconButton
            onClick={toggleOutput}
            sx={{
              position: "absolute",
              right: 16,
              top: 8,
              zIndex: 100,
              bgcolor: "background.paper",
              border: "1px solid",
              borderColor: "divider",
              boxShadow: 2,
              "&:hover": {
                bgcolor: "action.hover",
              },
              transition: "all 0.2s",
            }}
          >
            <ChevronLeftIcon />
          </IconButton>
        )}
      </Box>

      <Drawer
        anchor="right"
        open={isUsersDrawerOpen}
        onClose={toggleUsersDrawer}
        PaperProps={{
          sx: { width: 300 },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Users in Room
          </Typography>
          <List>
            {users.map((user) => (
              <ListItem key={user.id}>
                <ListItemAvatar>
                  <Avatar src={user.avatar}>
                    {user.username.charAt(0).toUpperCase()}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={user.username}
                  secondary={user.id === "current-user" ? "You" : ""}
                />
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>
    </Box>
  );
};

export default RoomPage;
