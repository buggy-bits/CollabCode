import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import HomePage from "./pages/HomePage";
import RoomPage from "./pages/RoomPage";
//import InvitePage from "./pages/InvitePage"; //TODO: We'll need to implement this
// import ChatTestPage from "./pages/ChatTestPage";

const darkTheme = createTheme({
  palette: {
    mode: "dark",
  },
});

function App() {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/room/:roomId" element={<RoomPage />} />
          {/* <Route path="/invite/:token" element={<InvitePage />} /> */}
          {/* <Route path="/chat-test" element={<ChatTestPage />} /> */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
