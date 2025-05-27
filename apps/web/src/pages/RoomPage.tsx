import { useEffect, useState, useRef, useCallback } from "react";
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
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

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
  const [isOutputOpen, setIsOutputOpen] = useState(false);
  const [outputWidth, setOutputWidth] = useState(400);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef<number>(0);
  const dragStartWidth = useRef<number>(0);
  const [isRunning, setIsRunning] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const editorRef = useRef<CodeEditorRef>(null);
  const termRef = useRef<Terminal | null>(null);
  const [isWaitingForInput, setIsWaitingForInput] = useState(false);
  const [inputBuffer, setInputBuffer] = useState("");
  const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const IDLE_THRESHOLD = 1500;
  const terminalRef = useRef<HTMLDivElement | null>(null);

  // Initialize terminal when the output panel is open and DOM element exists
  useEffect(() => {
    // Only initialize when output panel is open AND DOM element exists AND terminal not already created
    if (!isOutputOpen || !terminalRef.current || termRef.current) return;

    console.log("Initializing terminal...");

    const term = new Terminal({
      theme: {
        background: "#1e1e1e",
        foreground: "#dcdcdc",
        cursor: "#ffffff",
      },
      cursorBlink: true,
      convertEol: true,
      fontFamily: "monospace",
      fontSize: 14,
      rows: 24,
      cols: 80,
    });

    try {
      term.open(terminalRef.current);
      term.write("Terminal ready...\r\n");
      termRef.current = term;
      console.log("Terminal initialized successfully");
    } catch (error) {
      console.error("Failed to initialize terminal:", error);
    }

    return () => {
      if (termRef.current) {
        console.log("Disposing terminal");
        termRef.current.dispose();
        termRef.current = null;
      }
    };
  }, [isOutputOpen]); // Initialize when output panel opens

  // Handle key input with useCallback to prevent stale closures
  const handleKey = useCallback(
    (key: string) => {
      if (!termRef.current) return;

      if (isWaitingForInput) {
        if (key === "\r") {
          // Submit input
          console.log("Enter pressed, submitting:", inputBuffer);
          socketRef.current?.emit("evaluate", { code: inputBuffer });
          termRef.current.write("\r\n");
          setIsWaitingForInput(false);
          setInputBuffer("");
        } else if (key === "\u007F" || key === "\b") {
          // Handle backspace
          if (inputBuffer.length > 0) {
            setInputBuffer((prev) => prev.slice(0, -1));
            termRef.current.write("\b \b");
          }
        } else if (key.length === 1 && key >= " ") {
          // Handle printable characters only
          setInputBuffer((prev) => prev + key);
          termRef.current.write(key);
        }
      }
    },
    [isWaitingForInput, inputBuffer],
  );

  // Set up terminal key handler
  useEffect(() => {
    if (!termRef.current) return;

    const disposable = termRef.current.onKey(({ key }) => {
      handleKey(key);
    });

    return () => {
      disposable.dispose();
    };
  }, [handleKey]);

  useEffect(() => {
    const joinRoom = async () => {
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

  const resetIdleTimer = useCallback(() => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
    }

    idleTimeoutRef.current = setTimeout(() => {
      enableInputMode();
    }, IDLE_THRESHOLD);
  }, []);

  const clearIdleTimer = useCallback(() => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
  }, []);

  const enableInputMode = useCallback(() => {
    if (!isWaitingForInput && termRef.current) {
      setIsWaitingForInput(true);
      termRef.current.focus();
      termRef.current.write("\r\n> "); // Show input prompt
    }
  }, [isWaitingForInput]);

  const handleRunCode = async () => {
    clearIdleTimer();

    try {
      setIsRunning(true);

      // Ensure output panel is open
      if (!isOutputOpen) {
        setIsOutputOpen(true);
        // Wait for the DOM to update and terminal to initialize
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      // Double check terminal is ready
      if (!termRef.current) {
        console.error("Terminal still not initialized after waiting");
        setIsRunning(false);
        return;
      }

      console.log("Terminal is ready, proceeding with code execution");

      // Clear terminal and show running message
      termRef.current.clear();
      termRef.current.write("Running code...\r\n");

      const userCode = editorRef.current?.getValue() || "";

      // Disconnect existing socket if any
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      // Create new socket connection
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
        resetIdleTimer();

        if (socketRef.current && termRef.current) {
          socketRef.current.emit("run", { code: userCode });
          termRef.current.write("Code execution started...\r\n");
        }
      });

      socketRef.current.on("output", (data) => {
        if (termRef.current && data.output) {
          termRef.current.write(data.output);
          resetIdleTimer();
        }
      });

      socketRef.current.on("disconnect", () => {
        if (termRef.current) {
          termRef.current.write("\r\nExecution completed.\r\n");
        }
        setIsRunning(false);
        console.log("Disconnected from execution server");
      });

      socketRef.current.on("error", (error) => {
        console.error("Socket error:", error);
        if (termRef.current) {
          termRef.current.write(
            `\r\nError: ${error.message || "Unknown error"}\r\n`,
          );
        }
        setIsRunning(false);
      });

      socketRef.current.on("execution_result", (result) => {
        console.log("Execution result:", result);
        if (termRef.current && result) {
          termRef.current.write(`\r\nResult: ${JSON.stringify(result)}\r\n`);
        }
      });
    } catch (error) {
      console.error("Error running code:", error);
      if (termRef.current) {
        termRef.current.write(
          `\r\nError: ${error instanceof Error ? error.message : "Unknown error"}\r\n`,
        );
      }
      setIsRunning(false);
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

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaX = dragStartX.current - e.clientX;
      const newWidth = Math.max(
        200,
        Math.min(800, dragStartWidth.current + deltaX),
      );
      setOutputWidth(newWidth);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      clearIdleTimer();
      if (termRef.current) {
        termRef.current.dispose();
      }
    };
  }, [clearIdleTimer]);

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
            <Box
              sx={{
                flexGrow: 1,
                bgcolor: "#1e1e1e",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                ref={terminalRef}
                style={{
                  height: "100%",
                  width: "100%",
                  minHeight: "200px",
                }}
              />
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
