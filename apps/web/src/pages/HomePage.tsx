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
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Divider,
  Alert,
  IconButton,
} from "@mui/material";
import CodeIcon from "@mui/icons-material/Code";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import LockIcon from "@mui/icons-material/Lock";
import PublicIcon from "@mui/icons-material/Public";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import VisibilityIcon from "@mui/icons-material/Visibility";

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`tabpanel-${index}`}
      aria-labelledby={`tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const SUPPORTED_LANGUAGES = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "cpp", label: "C++" },
  { value: "json", label: "JSON" },
];

const HomePage = () => {
  const navigate = useNavigate();
  const [tabValue, setTabValue] = useState(0);
  const [joinRoomId, setJoinRoomId] = useState("");
  const [joinUsername, setJoinUsername] = useState(
    localStorage.getItem("username")?.trim
      ? localStorage.getItem("username")
      : "",
  );
  const [createRoomName, setCreateRoomName] = useState("");
  const [createUsername, setCreateUsername] = useState(
    localStorage.getItem("username")?.trim
      ? localStorage.getItem("username")
      : "",
  );
  const [language, setLanguage] = useState("javascript");
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomPassword, setRoomPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setError(null);
  };

  const handleJoinRoom = async () => {
    if (!joinRoomId.trim()) {
      setError("Please enter a room ID");
      return;
    }

    if (!joinUsername.trim()) {
      setError("Please enter a username");
      return;
    }

    try {
      // TODO : make an api call to server for requesting to join, with a Good response the user then navigated
      // Store username in session/local storage
      localStorage.setItem("username", joinUsername);

      // Navigate to the room
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

    if (!createUsername.trim()) {
      setError("Please enter a username");
      return;
    }

    try {
      // API call to create a new room
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/rooms`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-username": createUsername,
          },
          body: JSON.stringify({
            roomName: createRoomName,
            language,
            isPrivate,
            password: isPrivate ? roomPassword : "",
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to create room");
      }

      const data = await response.json();

      // Store username in session/local storage
      localStorage.setItem("username", data.username);
      localStorage.setItem("language", data.language);

      // Navigate to the new room
      navigate(`/room/${data.roomId}`);
    } catch (err) {
      console.error("Error creating room:", err);
      setError("Failed to create room. Please try again.");
    }
  };

  return (
    <Container maxWidth="md">
      <Box
        sx={{
          mt: 8,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            mb: 4,
          }}
        >
          <CodeIcon fontSize="large" color="primary" />
          <Typography variant="h3" component="h1" gutterBottom>
            CollabCode
          </Typography>
        </Box>

        <Typography
          variant="h5"
          align="center"
          color="text.secondary"
          paragraph
        >
          Real-time collaborative code editor for teams
        </Typography>

        <Paper elevation={3} sx={{ width: "100%", mt: 4 }}>
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            variant="fullWidth"
            textColor="primary"
            indicatorColor="primary"
          >
            <Tab label="Join Room" />
            <Tab label="Create Room" />
          </Tabs>

          {error && (
            <Alert severity="error" sx={{ mx: 3, mt: 3 }}>
              {error}
            </Alert>
          )}

          <TabPanel value={tabValue} index={0}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Room ID"
                  variant="outlined"
                  value={joinRoomId}
                  onChange={(e) => setJoinRoomId(e.target.value)}
                  placeholder="Enter the room ID to join"
                  required
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Your Username"
                  variant="outlined"
                  value={joinUsername}
                  onChange={(e) => setJoinUsername(e.target.value)}
                  placeholder="Enter your display name"
                  required
                />
              </Grid>
              <Grid item xs={12}>
                <Button
                  fullWidth
                  variant="contained"
                  color="primary"
                  size="large"
                  onClick={handleJoinRoom}
                  endIcon={<ArrowForwardIcon />}
                >
                  Join Room
                </Button>
              </Grid>
            </Grid>
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Room Name"
                  variant="outlined"
                  value={createRoomName}
                  onChange={(e) => setCreateRoomName(e.target.value)}
                  placeholder="Enter a name for your room"
                  required
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Your Username"
                  variant="outlined"
                  value={createUsername}
                  onChange={(e) => setCreateUsername(e.target.value)}
                  placeholder="Enter your display name"
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth variant="outlined">
                  <InputLabel id="language-select-label">Language</InputLabel>
                  <Select
                    labelId="language-select-label"
                    id="language-select"
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
              <Grid item xs={12} sm={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={isPrivate}
                      onChange={(e) => setIsPrivate(e.target.checked)}
                      color="primary"
                    />
                  }
                  label={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      {isPrivate ? (
                        <LockIcon fontSize="small" />
                      ) : (
                        <PublicIcon fontSize="small" />
                      )}
                      <Typography>
                        {isPrivate ? "Private Room" : "Public Room"}
                      </Typography>
                    </Box>
                  }
                />
              </Grid>
              <Grid item xs={12}>
                {isPrivate && (
                  <TextField
                    fullWidth
                    label="Room Password"
                    variant="outlined"
                    type={showPassword ? "text" : "password"}
                    value={roomPassword}
                    onChange={(e) => setRoomPassword(e.target.value)}
                    placeholder="Enter a password for the private room"
                    required
                    InputProps={{
                      endAdornment: (
                        <IconButton
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                        >
                          {showPassword ? (
                            <VisibilityOffIcon />
                          ) : (
                            <VisibilityIcon />
                          )}
                        </IconButton>
                      ),
                    }}
                  />
                )}
              </Grid>
              <Grid item xs={12}>
                <Button
                  fullWidth
                  variant="contained"
                  color="primary"
                  size="large"
                  onClick={handleCreateRoom}
                  endIcon={<ArrowForwardIcon />}
                >
                  Create Room
                </Button>
              </Grid>
            </Grid>
          </TabPanel>
        </Paper>

        <Box sx={{ mt: 4, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            Collaborate in real-time with your team, share code, and work
            together on projects.
          </Typography>
        </Box>
      </Box>
    </Container>
  );
};

export default HomePage;
