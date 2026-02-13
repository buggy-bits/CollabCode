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
  Badge,
  Tooltip,
  Chip,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PeopleIcon from "@mui/icons-material/People";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import CodeIcon from "@mui/icons-material/Code";
import ChatIcon from "@mui/icons-material/Chat";
import CodeEditor, { CodeEditorRef } from "../components/CodeEditor";
import ChatPanel from "../components/ChatPanel";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { io, Socket } from "socket.io-client";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { ENV } from "../config/env";

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
  const previousUsersRef = useRef<Set<string>>(new Set());
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
  const [linkCopied, setLinkCopied] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Copy room link to clipboard
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      toast.success("Room link copied to clipboard!", {
        position: "top-right",
        autoClose: 2000,
        hideProgressBar: true,
      });
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = window.location.href;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setLinkCopied(true);
      toast.success("Room link copied!", {
        position: "top-right",
        autoClose: 2000,
        hideProgressBar: true,
      });
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  // Initialize terminal when the output panel is open
  useEffect(() => {
    if (!isOutputOpen || !terminalRef.current || termRef.current) return;

    const term = new Terminal({
      theme: {
        background: "#141414",
        foreground: "#F5F5F7",
        cursor: "#E8A838",
        selectionBackground: "rgba(232, 168, 56, 0.25)",
      },
      cursorBlink: true,
      convertEol: true,
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 13,
      rows: 24,
      cols: 80,
    });

    try {
      term.open(terminalRef.current);
      term.write("Terminal ready...\r\n");
      termRef.current = term;
    } catch (error) {
      console.error("Failed to initialize terminal:", error);
    }

    return () => {
      if (termRef.current) {
        termRef.current.dispose();
        termRef.current = null;
      }
    };
  }, [isOutputOpen]);

  // Handle key input
  const handleKey = useCallback(
    (key: string) => {
      if (!termRef.current) return;

      if (isWaitingForInput) {
        if (key === "\r") {
          socketRef.current?.emit("evaluate", { code: inputBuffer });
          setInputBuffer("");
          setIsWaitingForInput(false);
        } else if (key === "\u007F" || key === "\b") {
          if (inputBuffer.length > 0) {
            setInputBuffer((prev) => prev.slice(0, -1));
            termRef.current.write("\b \b");
          }
        } else if (key.length === 1 && key >= " ") {
          setInputBuffer((prev) => prev + key);
          termRef.current.write(key);
        }
      }
    },
    [isWaitingForInput, inputBuffer],
  );

  // Terminal key handler
  useEffect(() => {
    if (!termRef.current) return;
    const disposable = termRef.current.onKey(({ key }) => handleKey(key));
    return () => disposable.dispose();
  }, [handleKey]);

  // Join room on mount
  useEffect(() => {
    const joinRoom = async () => {
      const storedUsername = localStorage.getItem("username");
      if (storedUsername) setUsername(storedUsername);

      if (!roomId) {
        setError("Room ID is required");
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `${ENV.API_URL}/api/rooms/${roomId}/join`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username: storedUsername || "Anonymous",
            }),
          },
        );

        if (!response.ok) throw new Error("Failed to join room");
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

  // Track users via Yjs awareness
  useEffect(() => {
    previousUsersRef.current = new Set();
    setUsers([]);

    let awareness: any = null;
    let cleanup: (() => void) | null = null;

    const timeoutId = setTimeout(() => {
      if (!editorRef.current) return;

      awareness = editorRef.current.getAwareness();
      if (!awareness) return;

      const updateUsers = () => {
        const states = awareness.getStates();
        const currentUsers: User[] = [];
        const currentUserIds = new Set<string>();

        states.forEach((state: any, clientId: number) => {
          if (state.user && state.user.name) {
            const userId = `client-${clientId}`;
            currentUserIds.add(userId);
            currentUsers.push({
              id: userId,
              username: state.user.name,
              avatar: undefined,
            });
          }
        });

        setUsers((prevUsers) => {
          const previousUserIds = previousUsersRef.current;
          const previousUsersMap = new Map(
            prevUsers.map((u) => [u.id, u.username]),
          );

          currentUserIds.forEach((userId) => {
            if (!previousUserIds.has(userId)) {
              const user = currentUsers.find((u) => u.id === userId);
              if (user && user.username !== username) {
                toast.info(`${user.username} joined the room`, {
                  position: "top-right",
                  autoClose: 3000,
                  hideProgressBar: true,
                });
              }
            }
          });

          previousUserIds.forEach((userId) => {
            if (!currentUserIds.has(userId)) {
              const previousUsername = previousUsersMap.get(userId);
              if (previousUsername && previousUsername !== username) {
                toast.info(`${previousUsername} left the room`, {
                  position: "top-right",
                  autoClose: 3000,
                  hideProgressBar: true,
                });
              }
            }
          });

          previousUsersRef.current = currentUserIds;
          return currentUsers;
        });
      };

      updateUsers();
      awareness.on("change", updateUsers);
      cleanup = () => awareness?.off("change", updateUsers);
    }, 500);

    return () => {
      clearTimeout(timeoutId);
      cleanup?.();
    };
  }, [username, roomId]);

  const handleBackToHome = () => navigate("/");

  const handleLanguageChange = (newLanguage: string) => {
    if (roomData) {
      setRoomData({ ...roomData, language: newLanguage });
    }
  };

  const resetIdleTimer = useCallback(() => {
    if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    idleTimeoutRef.current = setTimeout(
      () => enableInputMode(),
      IDLE_THRESHOLD,
    );
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
      termRef.current.options.cursorBlink = true;
      termRef.current.write("");
    }
  }, [isWaitingForInput]);

  const handleRunCode = async () => {
    clearIdleTimer();

    try {
      setIsRunning(true);

      if (!isOutputOpen) {
        setIsOutputOpen(true);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      if (!termRef.current) {
        console.error("Terminal not initialized after waiting");
        setIsRunning(false);
        return;
      }

      termRef.current.clear();
      const userCode = editorRef.current?.getValue() || "";

      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      socketRef.current = io(`${ENV.API_URL}/execution`, {
        transports: ["websocket"],
        autoConnect: true,
        query: { language: roomData?.language || "javascript" },
      });

      socketRef.current.on("connect", () => {
        resetIdleTimer();
        if (socketRef.current && termRef.current) {
          socketRef.current.emit("run", { code: userCode });
          termRef.current.write("\r\n");
        }
      });

      socketRef.current.on("output", (data) => {
        if (termRef.current && data.output) {
          termRef.current.write(data.output);
          resetIdleTimer();
        }
      });

      socketRef.current.on("disconnect", () => {
        if (termRef.current) termRef.current.write("\r\n");
        setIsRunning(false);
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
    } catch (error) {
      console.error("Error running code:", error);
      if (termRef.current) {
        termRef.current.write(
          `\r\nError: ${
            error instanceof Error ? error.message : "Unknown error"
          }\r\n`,
        );
      }
      setIsRunning(false);
    }
  };

  const toggleUsersDrawer = () => setIsUsersDrawerOpen(!isUsersDrawerOpen);
  const toggleOutput = () => setIsOutputOpen(!isOutputOpen);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = outputWidth;
  };

  const handleMouseUp = () => setIsDragging(false);

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
      if (socketRef.current) socketRef.current.disconnect();
      clearIdleTimer();
      if (termRef.current) termRef.current.dispose();
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
            gap: 2,
          }}
        >
          <CircularProgress sx={{ color: "primary.main" }} />
          <Typography variant="body1" sx={{ color: "text.secondary" }}>
            Joining room...
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
          <Paper
            elevation={0}
            sx={{
              p: 4,
              maxWidth: 440,
              width: "100%",
              border: "1px solid",
              borderColor: "divider",
            }}
          >
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
      <ToastContainer
        theme="dark"
        toastStyle={{
          backgroundColor: "#1C1C1E",
          border: "1px solid #3A3A3C",
          color: "#F5F5F7",
        }}
      />

      {/* ─── Header Bar ─── */}
      <Box
        component="header"
        sx={{
          px: 2,
          py: 1.25,
          borderBottom: "1px solid",
          borderColor: "divider",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          bgcolor: "background.paper",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <IconButton
            size="small"
            onClick={handleBackToHome}
            sx={{
              color: "text.secondary",
              "&:hover": { color: "text.primary" },
            }}
          >
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Box
            sx={{
              width: "1px",
              height: 20,
              bgcolor: "divider",
            }}
          />
          <CodeIcon sx={{ fontSize: 20, color: "primary.main" }} />
          <Typography
            variant="subtitle1"
            sx={{ color: "text.primary", fontWeight: 600 }}
          >
            {roomData.name}
          </Typography>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {/* Copy Link Button */}
          <Tooltip title={linkCopied ? "Copied!" : "Copy room link"}>
            <Button
              variant="outlined"
              size="small"
              startIcon={
                linkCopied ? (
                  <CheckIcon sx={{ fontSize: 16 }} />
                ) : (
                  <ContentCopyIcon sx={{ fontSize: 16 }} />
                )
              }
              onClick={handleCopyLink}
              sx={{
                fontSize: "0.8125rem",
                px: 1.5,
                py: 0.5,
                minWidth: "auto",
                borderColor: linkCopied ? "success.main" : "divider",
                color: linkCopied ? "success.main" : "text.secondary",
                "&:hover": {
                  borderColor: linkCopied ? "success.main" : "primary.main",
                  color: linkCopied ? "success.main" : "primary.main",
                },
                transition: "all 0.2s",
              }}
            >
              {linkCopied ? "Copied" : "Copy Link"}
            </Button>
          </Tooltip>

          {/* Run Code Button */}
          <Button
            variant="contained"
            size="small"
            startIcon={<PlayArrowIcon />}
            onClick={handleRunCode}
            disabled={isRunning}
            sx={{ fontSize: "0.8125rem", px: 2 }}
          >
            {isRunning ? "Running..." : "Run"}
          </Button>

          {/* Chat Button */}
          <Tooltip title="Room chat">
            <IconButton
              onClick={() => {
                setIsChatOpen(true);
                setUnreadCount(0);
              }}
              sx={{ color: "text.secondary" }}
            >
              <Badge
                badgeContent={unreadCount}
                sx={{
                  "& .MuiBadge-badge": {
                    bgcolor: "#FF453A",
                    color: "#fff",
                    fontSize: "0.65rem",
                    height: 18,
                    minWidth: 18,
                  },
                }}
              >
                <ChatIcon fontSize="small" />
              </Badge>
            </IconButton>
          </Tooltip>

          {/* Users Button */}
          <Tooltip title="Users in room">
            <IconButton
              onClick={toggleUsersDrawer}
              sx={{ color: "text.secondary" }}
            >
              <Badge
                badgeContent={users.length}
                sx={{
                  "& .MuiBadge-badge": {
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    fontSize: "0.65rem",
                    height: 18,
                    minWidth: 18,
                  },
                }}
              >
                <PeopleIcon fontSize="small" />
              </Badge>
            </IconButton>
          </Tooltip>

          <Box sx={{ width: "1px", height: 20, bgcolor: "divider", mx: 0.5 }} />

          <Chip
            size="small"
            label={username}
            variant="outlined"
            sx={{
              borderColor: "divider",
              color: "text.secondary",
              fontSize: "0.75rem",
              height: 26,
            }}
          />
        </Box>
      </Box>

      {/* ─── Main Content ─── */}
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
            onRemoteLanguageChange={handleLanguageChange}
          />
        </Box>

        {/* ─── Output Panel ─── */}
        {isOutputOpen && (
          <Box
            sx={{
              width: outputWidth,
              borderLeft: "1px solid",
              borderColor: "divider",
              display: "flex",
              flexDirection: "column",
              position: "relative",
              bgcolor: "background.default",
            }}
          >
            <Box
              sx={{
                px: 1.5,
                py: 1,
                borderBottom: "1px solid",
                borderColor: "divider",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                bgcolor: "background.paper",
              }}
            >
              <Typography variant="subtitle2" sx={{ color: "text.secondary" }}>
                Output
              </Typography>
              <IconButton
                size="small"
                onClick={toggleOutput}
                sx={{ color: "text.secondary" }}
              >
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </Box>
            <Box
              sx={{
                flexGrow: 1,
                bgcolor: "#141414",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                ref={terminalRef}
                style={{ height: "100%", width: "100%", minHeight: "200px" }}
              />
            </Box>
            {/* Drag handle */}
            <Box
              sx={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: "3px",
                cursor: "col-resize",
                transition: "background 0.15s",
                "&:hover": { bgcolor: "primary.main" },
                ...(isDragging && { bgcolor: "primary.main" }),
              }}
              onMouseDown={handleMouseDown}
            />
          </Box>
        )}

        {!isOutputOpen && (
          <Tooltip title="Show output" placement="left">
            <IconButton
              onClick={toggleOutput}
              sx={{
                position: "absolute",
                right: 12,
                top: 8,
                zIndex: 100,
                bgcolor: "background.paper",
                border: "1px solid",
                borderColor: "divider",
                boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                color: "text.secondary",
                "&:hover": {
                  bgcolor: "action.hover",
                  color: "text.primary",
                },
              }}
              size="small"
            >
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* ─── Users Drawer ─── */}
      <Drawer
        anchor="right"
        open={isUsersDrawerOpen}
        onClose={toggleUsersDrawer}
        PaperProps={{ sx: { width: 280 } }}
      >
        <Box sx={{ p: 2.5 }}>
          <Typography variant="h6" sx={{ mb: 2, fontSize: "1rem" }}>
            Users in Room
          </Typography>
          <List disablePadding>
            {users.length === 0 ? (
              <ListItem disablePadding sx={{ py: 1 }}>
                <ListItemText
                  primary="No users connected"
                  primaryTypographyProps={{
                    color: "text.secondary",
                    fontSize: "0.875rem",
                  }}
                />
              </ListItem>
            ) : (
              users.map((user) => (
                <ListItem
                  key={user.id}
                  disablePadding
                  sx={{
                    py: 1,
                    px: 1,
                    borderRadius: 1.5,
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <ListItemAvatar sx={{ minWidth: 40 }}>
                    <Avatar
                      sx={{
                        width: 30,
                        height: 30,
                        bgcolor: "primary.main",
                        color: "primary.contrastText",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                      }}
                    >
                      {user.username.charAt(0).toUpperCase()}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={user.username}
                    secondary={user.username === username ? "You" : null}
                    primaryTypographyProps={{ fontSize: "0.875rem" }}
                    secondaryTypographyProps={{
                      fontSize: "0.75rem",
                      color: "primary.main",
                    }}
                  />
                </ListItem>
              ))
            )}
          </List>
        </Box>
      </Drawer>

      {/* ─── Chat Panel ─── */}
      <ChatPanel
        open={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        roomId={roomId}
        username={username}
        onNewMessage={() => {
          if (!isChatOpen) {
            setUnreadCount((prev) => prev + 1);
          }
        }}
      />
    </Box>
  );
};

export default RoomPage;
