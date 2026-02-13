import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Container,
  Typography,
  Paper,
  Button,
  TextField,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Alert,
  IconButton,
  Chip,
} from "@mui/material";
import CodeIcon from "@mui/icons-material/Code";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import LockIcon from "@mui/icons-material/Lock";
import PublicIcon from "@mui/icons-material/Public";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import VisibilityIcon from "@mui/icons-material/Visibility";
import BoltIcon from "@mui/icons-material/Bolt";
import GroupsIcon from "@mui/icons-material/Groups";
import ShieldIcon from "@mui/icons-material/Shield";
import TerminalIcon from "@mui/icons-material/Terminal";
import data from "../assets/availabelLanguages.json";
import { ENV } from "../config/env";

const SUPPORTED_LANGUAGES = data.languages;

const FEATURES = [
  {
    icon: BoltIcon,
    title: "Instant Sync",
    description:
      "CRDT-powered editing with Redis caching ensures zero-conflict collaboration at any scale.",
  },
  {
    icon: GroupsIcon,
    title: "Multi-User",
    description:
      "Real-time cursors, presence indicators, and live editing with unlimited collaborators.",
  },
  {
    icon: TerminalIcon,
    title: "10+ Languages",
    description:
      "JavaScript, Python, Java, C++, Go, Rust, and more — with syntax highlighting and execution.",
  },
  {
    icon: ShieldIcon,
    title: "Private Rooms",
    description:
      "Password-protected rooms keep your code secure and accessible only to your team.",
  },
];

const HomePage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(0);
  const [joinRoomId, setJoinRoomId] = useState("");
  const [joinUsername, setJoinUsername] = useState(
    localStorage.getItem("username")?.trim()
      ? localStorage.getItem("username")
      : "",
  );
  const [createRoomName, setCreateRoomName] = useState("");
  const [createUsername, setCreateUsername] = useState(
    localStorage.getItem("username")?.trim()
      ? localStorage.getItem("username")
      : "",
  );
  const [language, setLanguage] = useState("javascript");
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomPassword, setRoomPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleJoinRoom = async () => {
    if (!joinRoomId.trim()) {
      setError("Please enter a room ID");
      return;
    }
    if (!joinUsername?.trim()) {
      setError("Please enter a username");
      return;
    }
    try {
      localStorage.setItem("username", joinUsername!);
      navigate(`/room/${joinRoomId}`);
    } catch (err) {
      console.error("Error joining room:", err);
      setError("Failed to join room. Please try again.");
    }
  };

  const handleCreateRoom = async () => {
    if (!createRoomName.trim()) {
      setError("Please enter a room name");
      return;
    }
    if (!createUsername?.trim()) {
      setError("Please enter a username");
      return;
    }
    try {
      const response = await fetch(`${ENV.API_URL}/api/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-username": createUsername || "",
        },
        body: JSON.stringify({
          roomName: createRoomName,
          language,
          isPrivate,
          password: isPrivate ? roomPassword : "",
        }),
      });
      if (!response.ok) throw new Error("Failed to create room");
      const roomData = await response.json();
      localStorage.setItem("username", roomData.username);
      localStorage.setItem("language", roomData.language);
      navigate(`/room/${roomData.roomId}`);
    } catch (err) {
      console.error("Error creating room:", err);
      setError("Failed to create room. Please try again.");
    }
  };

  return (
    <Box
      sx={{
        background: "#141414",
        minHeight: "100vh",
        overflowX: "hidden",
        overflowY: "auto",
      }}
    >
      <Container maxWidth="lg">
        {/* ─── Header / Nav ─── */}
        <Box
          component="nav"
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            py: 3,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <CodeIcon sx={{ fontSize: 28, color: "primary.main" }} />
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                color: "text.primary",
                letterSpacing: "-0.01em",
              }}
            >
              CollabCode
            </Typography>
          </Box>
          <Chip
            label="v1.0"
            size="small"
            variant="outlined"
            sx={{
              borderColor: "divider",
              color: "text.secondary",
              fontSize: "0.75rem",
            }}
          />
        </Box>

        {/* ─── Hero Section ─── */}
        <Box sx={{ pt: { xs: 6, md: 10 }, pb: 8, textAlign: "center" }}>
          <Typography
            variant="h2"
            sx={{
              color: "text.primary",
              mb: 2,
              fontSize: { xs: "2.25rem", sm: "3rem", md: "3.5rem" },
              lineHeight: 1.1,
            }}
          >
            Code together,
            <br />
            <Box
              component="span"
              sx={{
                color: "primary.main",
                display: "inline",
              }}
            >
              ship faster.
            </Box>
          </Typography>

          <Typography
            variant="body1"
            sx={{
              color: "text.secondary",
              mb: 5,
              fontSize: { xs: "1rem", md: "1.125rem" },
              maxWidth: 520,
              mx: "auto",
            }}
          >
            Real-time collaborative editor for teams. Multiple languages, zero
            conflicts, instant sync. No sign-up required.
          </Typography>

          <Box
            sx={{
              display: "flex",
              gap: 1.5,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Button
              variant="contained"
              size="large"
              onClick={() => setActiveTab(1)}
              sx={{ px: 4, py: 1.5, fontSize: "0.95rem" }}
            >
              Create a Room
            </Button>
            <Button
              variant="outlined"
              size="large"
              onClick={() => setActiveTab(0)}
              sx={{ px: 4, py: 1.5, fontSize: "0.95rem" }}
            >
              Join a Room
            </Button>
          </Box>
        </Box>

        {/* ─── Form Section ─── */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
            gap: { xs: 4, lg: 8 },
            mb: 12,
            alignItems: "start",
          }}
        >
          {/* Left: Feature highlights */}
          <Box sx={{ pt: { lg: 2 } }}>
            <Typography
              variant="h4"
              sx={{
                color: "text.primary",
                mb: 3,
                fontSize: { xs: "1.5rem", md: "1.75rem" },
              }}
            >
              Built for{" "}
              <Box component="span" sx={{ color: "primary.main" }}>
                real collaboration
              </Box>
            </Typography>

            <Typography
              variant="body1"
              sx={{ color: "text.secondary", mb: 4, maxWidth: 480 }}
            >
              Whether you're pair programming, running interviews, or
              prototyping with your team — CollabCode gives you a shared editor
              that just works.
            </Typography>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <Box
                  key={title}
                  sx={{
                    display: "flex",
                    gap: 2,
                    p: 2,
                    borderRadius: 2,
                    transition: "background 0.2s",
                    "&:hover": {
                      bgcolor: "action.hover",
                    },
                  }}
                >
                  <Icon
                    sx={{
                      fontSize: 22,
                      color: "primary.main",
                      mt: 0.25,
                      flexShrink: 0,
                    }}
                  />
                  <Box>
                    <Typography
                      variant="subtitle1"
                      sx={{ color: "text.primary", mb: 0.25 }}
                    >
                      {title}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ color: "text.secondary" }}
                    >
                      {description}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>

          {/* Right: Form */}
          <Paper
            elevation={0}
            sx={{
              bgcolor: "background.paper",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 3,
              p: { xs: 3, md: 4 },
            }}
          >
            {/* Tab Switcher */}
            <Box
              sx={{
                display: "flex",
                gap: 1,
                mb: 3,
                bgcolor: "#141414",
                borderRadius: 2,
                p: 0.5,
              }}
            >
              {["Join Room", "Create Room"].map((label, idx) => (
                <Button
                  key={label}
                  onClick={() => {
                    setActiveTab(idx);
                    setError(null);
                  }}
                  sx={{
                    flex: 1,
                    py: 1.25,
                    borderRadius: 1.5,
                    fontSize: "0.875rem",
                    color:
                      activeTab === idx ? "text.primary" : "text.secondary",
                    bgcolor:
                      activeTab === idx ? "background.paper" : "transparent",
                    border:
                      activeTab === idx ? "1px solid" : "1px solid transparent",
                    borderColor: activeTab === idx ? "divider" : "transparent",
                    "&:hover": {
                      bgcolor:
                        activeTab === idx ? "background.paper" : "action.hover",
                    },
                  }}
                >
                  {label}
                </Button>
              ))}
            </Box>

            {error && (
              <Alert
                severity="error"
                onClose={() => setError(null)}
                sx={{ mb: 3 }}
              >
                {error}
              </Alert>
            )}

            {/* Join Room Form */}
            {activeTab === 0 && (
              <Box>
                <TextField
                  fullWidth
                  label="Room ID"
                  value={joinRoomId}
                  onChange={(e) => setJoinRoomId(e.target.value)}
                  placeholder="Paste the room ID here"
                  sx={{ mb: 2.5 }}
                />
                <TextField
                  fullWidth
                  label="Your Username"
                  value={joinUsername}
                  onChange={(e) => setJoinUsername(e.target.value)}
                  placeholder="Enter your display name"
                  sx={{ mb: 3 }}
                />
                <Button
                  fullWidth
                  variant="contained"
                  size="large"
                  onClick={handleJoinRoom}
                  endIcon={<ArrowForwardIcon />}
                  sx={{ py: 1.5 }}
                >
                  Join Room
                </Button>
              </Box>
            )}

            {/* Create Room Form */}
            {activeTab === 1 && (
              <Box>
                <TextField
                  fullWidth
                  label="Room Name"
                  value={createRoomName}
                  onChange={(e) => setCreateRoomName(e.target.value)}
                  placeholder="e.g. Frontend Sprint, Interview #42"
                  sx={{ mb: 2.5 }}
                />
                <TextField
                  fullWidth
                  label="Your Username"
                  value={createUsername}
                  onChange={(e) => setCreateUsername(e.target.value)}
                  placeholder="Enter your display name"
                  sx={{ mb: 2.5 }}
                />

                <Grid container spacing={2} sx={{ mb: 2.5 }}>
                  <Grid size={{ xs: 12, sm: 7 }}>
                    <FormControl fullWidth>
                      <InputLabel>Language</InputLabel>
                      <Select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        label="Language"
                      >
                        {SUPPORTED_LANGUAGES.map((lang) => (
                          <MenuItem key={lang.value} value={lang.value}>
                            {lang.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 5 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={isPrivate}
                          onChange={(e) => setIsPrivate(e.target.checked)}
                        />
                      }
                      label={
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.75,
                          }}
                        >
                          {isPrivate ? (
                            <LockIcon
                              fontSize="small"
                              sx={{ color: "primary.main" }}
                            />
                          ) : (
                            <PublicIcon
                              fontSize="small"
                              sx={{ color: "text.secondary" }}
                            />
                          )}
                          <Typography
                            variant="body2"
                            sx={{ color: "text.primary" }}
                          >
                            {isPrivate ? "Private" : "Public"}
                          </Typography>
                        </Box>
                      }
                      sx={{ mt: { xs: 0, sm: 1 } }}
                    />
                  </Grid>
                </Grid>

                {isPrivate && (
                  <TextField
                    fullWidth
                    label="Room Password"
                    type={showPassword ? "text" : "password"}
                    value={roomPassword}
                    onChange={(e) => setRoomPassword(e.target.value)}
                    placeholder="Set a password for this room"
                    sx={{ mb: 2.5 }}
                    slotProps={{
                      input: {
                        endAdornment: (
                          <IconButton
                            onClick={() => setShowPassword(!showPassword)}
                            edge="end"
                            sx={{ color: "text.secondary" }}
                          >
                            {showPassword ? (
                              <VisibilityOffIcon />
                            ) : (
                              <VisibilityIcon />
                            )}
                          </IconButton>
                        ),
                      },
                    }}
                  />
                )}

                <Button
                  fullWidth
                  variant="contained"
                  size="large"
                  onClick={handleCreateRoom}
                  endIcon={<ArrowForwardIcon />}
                  sx={{ py: 1.5 }}
                >
                  Create Room
                </Button>
              </Box>
            )}
          </Paper>
        </Box>

        {/* ─── Footer CTA ─── */}
        <Box
          sx={{
            textAlign: "center",
            pb: 10,
            borderTop: "1px solid",
            borderColor: "divider",
            pt: 6,
          }}
        >
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Open source collaborative editor — no account needed.
          </Typography>
        </Box>
      </Container>
    </Box>
  );
};

export default HomePage;
