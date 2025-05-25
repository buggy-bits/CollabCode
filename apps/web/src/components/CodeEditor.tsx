import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  Box,
  Paper,
  Chip,
  FormControl,
  Select,
  MenuItem,
  SelectChangeEvent,
} from "@mui/material";
import Editor, { Monaco, OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import * as Y from "yjs";
import { MonacoBinding } from "y-monaco";
import { YjsWebSocketProvider } from "../services/yjsWebSocket";
import { toast } from "react-toastify";

export interface CodeEditorRef {
  getValue: () => string;
}

interface CodeEditorProps {
  roomId: string;
  username: string;
  initialLanguage: string;
  availableLanguages: string[];
  onLanguageChange?: (language: string) => void;
}

const CodeEditor = forwardRef<CodeEditorRef, CodeEditorProps>(
  (
    { roomId, username, initialLanguage, availableLanguages, onLanguageChange },
    ref,
  ) => {
    const [isConnected, setIsConnected] = useState(false);
    const [currentLanguage, setCurrentLanguage] = useState(initialLanguage);
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<Monaco | null>(null);
    const docRef = useRef<Y.Doc | null>(null);
    const providerRef = useRef<YjsWebSocketProvider | null>(null);
    const bindingRef = useRef<MonacoBinding | null>(null);

    useEffect(() => {
      // Create Yjs document
      docRef.current = new Y.Doc();

      // Create WebSocket provider
      providerRef.current = new YjsWebSocketProvider(
        roomId,
        docRef.current,
        username,
      );

      // Set up connection status handler
      providerRef.current.on("status", (event: { status: string }) => {
        setIsConnected(event.status === "connected");
      });

      return () => {
        // Cleanup
        bindingRef.current?.destroy();
        providerRef.current?.destroy();
        docRef.current?.destroy();
      };
    }, [roomId, username]);

    const handleEditorDidMount: OnMount = (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      if (!docRef.current || !providerRef.current) return;

      // Get the shared text
      const ytext = docRef.current.getText("monaco");

      // Create Monaco binding
      bindingRef.current = new MonacoBinding(
        ytext,
        editor.getModel()!,
        new Set([editor]),
        providerRef.current.awareness,
      );
    };

    const handleLanguageChange = async (event: SelectChangeEvent) => {
      const newLanguage = event.target.value;
      try {
        // Update language in the editor
        if (editorRef.current && monacoRef.current) {
          const model = editorRef.current.getModel();
          if (model) {
            monacoRef.current.editor.setModelLanguage(model, newLanguage);
          }
        }

        // Update language in the backend
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/api/rooms/${roomId}/language`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ language: newLanguage }),
          },
        );

        if (!response.ok) {
          throw new Error("Failed to update language");
        }

        setCurrentLanguage(newLanguage);
        onLanguageChange?.(newLanguage);

        // Show notification
        toast.success(`Language changed to ${newLanguage}`, {
          position: "top-right",
          autoClose: 3000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
        });
      } catch (error) {
        console.error("Error changing language:", error);
        toast.error("Failed to change language", {
          position: "top-right",
          autoClose: 3000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
        });
      }
    };

    useImperativeHandle(ref, () => ({
      getValue: () => editorRef.current?.getValue() || "",
    }));

    return (
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
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
          <Chip
            label={isConnected ? "Connected" : "Connecting..."}
            color={isConnected ? "success" : "warning"}
            size="small"
          />
          <FormControl size="small" sx={{ minWidth: 120, right: 60 }}>
            <Select
              value={currentLanguage}
              onChange={handleLanguageChange}
              displayEmpty
              size="small"
            >
              {availableLanguages.map((lang) => (
                <MenuItem key={lang} value={lang}>
                  {lang.charAt(0).toUpperCase() + lang.slice(1)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Paper>

        <Paper
          elevation={3}
          sx={{ flexGrow: 1, borderRadius: 1, overflow: "hidden" }}
        >
          <Editor
            height="100%"
            defaultLanguage={initialLanguage}
            theme="vs-dark"
            onMount={handleEditorDidMount}
            options={{
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              fontSize: 14,
              tabSize: 2,
              wordWrap: "on",
            }}
          />
        </Paper>
      </Box>
    );
  },
);

export default CodeEditor;
