import { useEffect, useRef, useState } from "react";
import { Box, Paper, Typography, Badge, Chip } from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import Editor, { Monaco } from "@monaco-editor/react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { MonacoBinding } from "y-monaco";
import { syncDocument } from "../services/socket";

interface CodeEditorProps {
  roomId: string;
  language?: string;
  theme?: string;
  readOnly?: boolean;
}

const CodeEditor = ({
  roomId,
  language = "javascript",
  theme = "vs-dark",
  readOnly = false,
}: CodeEditorProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [activeUsers, setActiveUsers] = useState<number>(1);

  // Refs to store Y.js document, provider, and Monaco binding
  const documentRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<any>(null);

  // Initialize Y.js and Monaco
  useEffect(() => {
    if (!roomId) return;

    // Clean up function to be called on unmount
    const cleanup = () => {
      if (providerRef.current) {
        providerRef.current.disconnect();
        providerRef.current = null;
      }
      if (documentRef.current) {
        documentRef.current.destroy();
        documentRef.current = null;
      }
      if (bindingRef.current) {
        bindingRef.current = null;
      }
      setIsConnected(false);
    };

    // Create Y.js document
    documentRef.current = new Y.Doc();

    // Sync with server using Socket.io connection
    syncDocument(roomId);

    // Connect to WebSocket
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
    const wsUrl = API_URL.replace(/^http/, "ws");

    // Create Y.js WebSocket provider
    providerRef.current = new WebsocketProvider(
      wsUrl,
      roomId,
      documentRef.current,
    );

    providerRef.current.on("status", (event: { status: string }) => {
      setIsConnected(event.status === "connected");
    });

    // Listen for awareness update (user presence)
    providerRef.current.awareness.on("update", () => {
      const count = providerRef.current?.awareness.getStates().size || 0;
      setActiveUsers(count);
    });

    return cleanup;
  }, [roomId]);

  // Set up Monaco binding when editor is ready
  const handleEditorDidMount = (editor: any, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    if (documentRef.current && providerRef.current) {
      // Get the Y.Text shared type from the document
      const yText = documentRef.current.getText("monaco");

      // Create Monaco binding
      bindingRef.current = new MonacoBinding(
        yText,
        editorRef.current.getModel(),
        new Set([editorRef.current]),
        providerRef.current.awareness,
      );

      // Set editor options
      editor.updateOptions({
        readOnly,
        automaticLayout: true,
      });
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 132px)",
      }}
    >
      <Paper
        elevation={1}
        sx={{
          p: 1,
          mb: 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Chip
            icon={isConnected ? <CheckCircleIcon /> : <ErrorIcon />}
            label={isConnected ? "Connected" : "Connecting..."}
            color={isConnected ? "success" : "warning"}
            variant="outlined"
          />
        </Box>
        <Badge
          badgeContent={activeUsers}
          color="primary"
          showZero
          max={999}
          sx={{ "& .MuiBadge-badge": { fontSize: "0.8rem" } }}
        >
          <Typography
            variant="body2"
            sx={{ display: "flex", alignItems: "center" }}
          >
            <PersonIcon sx={{ mr: 0.5 }} fontSize="small" />
            Users
          </Typography>
        </Badge>
      </Paper>

      <Paper
        elevation={3}
        sx={{
          flexGrow: 1,
          overflow: "hidden",
          "& .monaco-editor": {
            paddingTop: 1,
          },
        }}
      >
        <Editor
          height="100%"
          defaultLanguage={language}
          theme={theme}
          options={{
            minimap: { enabled: true },
            lineNumbers: "on",
            roundedSelection: true,
            cursorStyle: "line",
            automaticLayout: true,
            tabSize: 2,
          }}
          onMount={handleEditorDidMount}
        />
      </Paper>
    </Box>
  );
};

export default CodeEditor;
