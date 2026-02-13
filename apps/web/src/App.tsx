import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import HomePage from "./pages/HomePage";
import RoomPage from "./pages/RoomPage";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#E8A838",
      light: "#F0C060",
      dark: "#D4922E",
      contrastText: "#141414",
    },
    secondary: {
      main: "#A1A1A6",
      light: "#C7C7CC",
      dark: "#636366",
    },
    background: {
      default: "#141414",
      paper: "#1C1C1E",
    },
    text: {
      primary: "#F5F5F7",
      secondary: "#A1A1A6",
    },
    divider: "#3A3A3C",
    error: {
      main: "#FF453A",
    },
    success: {
      main: "#34C759",
    },
    warning: {
      main: "#E8A838",
    },
    action: {
      hover: "rgba(255, 255, 255, 0.06)",
      selected: "rgba(232, 168, 56, 0.12)",
    },
  },
  typography: {
    fontFamily:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    h1: { fontWeight: 800, letterSpacing: "-0.02em" },
    h2: { fontWeight: 700, letterSpacing: "-0.02em" },
    h3: { fontWeight: 700, letterSpacing: "-0.01em" },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    subtitle1: { fontWeight: 500 },
    subtitle2: { fontWeight: 500, fontSize: "0.8125rem" },
    body1: { lineHeight: 1.7 },
    body2: { lineHeight: 1.6 },
    button: { fontWeight: 600, textTransform: "none" as const },
  },
  shape: {
    borderRadius: 10,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          textTransform: "none",
          fontWeight: 600,
          padding: "8px 20px",
        },
        contained: {
          boxShadow: "none",
          "&:hover": {
            boxShadow: "0 4px 16px rgba(232, 168, 56, 0.3)",
          },
        },
        outlined: {
          borderColor: "#3A3A3C",
          color: "#F5F5F7",
          "&:hover": {
            borderColor: "#E8A838",
            color: "#E8A838",
            backgroundColor: "rgba(232, 168, 56, 0.06)",
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            "& fieldset": {
              borderColor: "#3A3A3C",
            },
            "&:hover fieldset": {
              borderColor: "#545456",
            },
            "&.Mui-focused fieldset": {
              borderColor: "#E8A838",
            },
          },
          "& .MuiInputLabel-root": {
            color: "#A1A1A6",
            "&.Mui-focused": {
              color: "#E8A838",
            },
          },
          "& .MuiOutlinedInput-input::placeholder": {
            color: "#636366",
            opacity: 1,
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "#3A3A3C",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "#545456",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "#E8A838",
          },
          "& .MuiSvgIcon-root": {
            color: "#A1A1A6",
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          "&.Mui-checked": {
            color: "#E8A838",
          },
          "&.Mui-checked + .MuiSwitch-track": {
            backgroundColor: "#E8A838",
          },
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: "#1C1C1E",
          borderLeft: "1px solid #3A3A3C",
        },
      },
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/room/:roomId" element={<RoomPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
