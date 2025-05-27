import { useState, FormEvent } from "react";
import {
  TextField,
  Button,
  FormControl,
  FormControlLabel,
  FormGroup,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Switch,
  Typography,
  Paper,
  Box,
  CircularProgress,
} from "@mui/material";
import data from "../assets/availabelLanguages.json";
// Languages supported by Monaco Editor
const LANGUAGES = data.languages;

interface RoomFormProps {
  onSubmit: (roomData: {
    name: string;
    language: string;
    createdBy: string;
    isPrivate: boolean;
    password?: string;
  }) => void;
  isLoading?: boolean;
}

const RoomForm = ({ onSubmit, isLoading = false }: RoomFormProps) => {
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [username, setUsername] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (!name || !username) return;

    onSubmit({
      name,
      language,
      createdBy: username,
      isPrivate,
      password: isPrivate ? password : undefined,
    });
  };

  const handleLanguageChange = (event: SelectChangeEvent) => {
    setLanguage(event.target.value);
  };

  return (
    <Paper
      component="form"
      onSubmit={handleSubmit}
      elevation={3}
      sx={{
        maxWidth: 500,
        mx: "auto",
        p: 4,
      }}
    >
      <Typography variant="h4" component="h2" align="center" gutterBottom>
        Create New Room
      </Typography>

      <Box sx={{ mb: 3 }}>
        <TextField
          id="name"
          label="Room Name"
          variant="outlined"
          fullWidth
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          margin="normal"
        />
      </Box>

      <Box sx={{ mb: 3 }}>
        <TextField
          id="username"
          label="Your Name"
          variant="outlined"
          fullWidth
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          margin="normal"
        />
      </Box>

      <Box sx={{ mb: 3 }}>
        <FormControl fullWidth margin="normal">
          <InputLabel id="language-label">Language</InputLabel>
          <Select
            labelId="language-label"
            id="language"
            value={language}
            label="Language"
            onChange={handleLanguageChange}
          >
            {LANGUAGES.map((lang) => (
              <MenuItem key={lang.value} value={lang.value}>
                {lang.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Box sx={{ mb: 3 }}>
        <FormGroup>
          <FormControlLabel
            control={
              <Switch
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                name="isPrivate"
                color="primary"
              />
            }
            label="Private Room"
          />
        </FormGroup>
      </Box>

      {isPrivate && (
        <Box sx={{ mb: 3 }}>
          <TextField
            id="password"
            label="Room Password"
            type="password"
            variant="outlined"
            fullWidth
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={isPrivate}
            margin="normal"
          />
        </Box>
      )}

      <Button
        type="submit"
        variant="contained"
        color="primary"
        fullWidth
        size="large"
        disabled={isLoading}
        sx={{ mt: 2 }}
      >
        {isLoading ? (
          <CircularProgress size={24} color="inherit" />
        ) : (
          "Create Room"
        )}
      </Button>
    </Paper>
  );
};

export default RoomForm;
