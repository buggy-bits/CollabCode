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
import { ENV } from "../config/env";

export interface CodeEditorRef {
  getValue: () => string;
  getAwareness: () => any | null;
}

interface CodeEditorProps {
  roomId: string;
  username: string;
  initialLanguage: string;
  availableLanguages: string[];
  onLanguageChange?: (language: string) => void;
  onRemoteLanguageChange?: (language: string) => void;
}

const CodeEditor = forwardRef<CodeEditorRef, CodeEditorProps>(
  (
    {
      roomId,
      username,
      initialLanguage,
      availableLanguages,
      onLanguageChange,
      onRemoteLanguageChange,
    },
    ref,
  ) => {
    const [isConnected, setIsConnected] = useState(false);
    const [currentLanguage, setCurrentLanguage] = useState(initialLanguage);
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<Monaco | null>(null);
    const docRef = useRef<Y.Doc | null>(null);
    const providerRef = useRef<YjsWebSocketProvider | null>(null);
    const bindingRef = useRef<MonacoBinding | null>(null);
    const metadataMapRef = useRef<Y.Map<string> | null>(null);
    const isLocalChangeRef = useRef(false);

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

      // Set up shared metadata map for real-time language sync
      const metadataMap = docRef.current.getMap<string>("metadata");
      metadataMapRef.current = metadataMap;

      // Observe remote language changes
      metadataMap.observe((event) => {
        if (isLocalChangeRef.current) return;

        event.changes.keys.forEach((change, key) => {
          if (
            key === "language" &&
            (change.action === "add" || change.action === "update")
          ) {
            const newLang = metadataMap.get("language");
            if (newLang && newLang !== currentLanguage) {
              setCurrentLanguage(newLang);

              // Update Monaco editor language
              if (editorRef.current && monacoRef.current) {
                const model = editorRef.current.getModel();
                if (model) {
                  monacoRef.current.editor.setModelLanguage(model, newLang);
                }
              }

              // Notify parent component
              onRemoteLanguageChange?.(newLang);

              toast.info(
                `Language changed to ${newLang.charAt(0).toUpperCase() + newLang.slice(1)}`,
                {
                  position: "top-right",
                  autoClose: 2500,
                  hideProgressBar: true,
                },
              );
            }
          }
        });
      });

      return () => {
        bindingRef.current?.destroy();
        providerRef.current?.destroy();
        docRef.current?.destroy();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomId, username]);

    const handleEditorDidMount: OnMount = (editor, monacoInstance) => {
      editorRef.current = editor;
      monacoRef.current = monacoInstance;

      if (!docRef.current || !providerRef.current) return;

      const ytext = docRef.current.getText("monaco");

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
        // Update Monaco editor
        if (editorRef.current && monacoRef.current) {
          const model = editorRef.current.getModel();
          if (model) {
            monacoRef.current.editor.setModelLanguage(model, newLanguage);
          }
        }

        // Broadcast via Yjs shared map (real-time sync to all clients)
        if (metadataMapRef.current) {
          isLocalChangeRef.current = true;
          metadataMapRef.current.set("language", newLanguage);
          isLocalChangeRef.current = false;
        }

        // Persist to backend
        const response = await fetch(
          `${ENV.API_URL}/api/rooms/${roomId}/language`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ language: newLanguage }),
          },
        );

        if (!response.ok) {
          throw new Error("Failed to update language");
        }

        setCurrentLanguage(newLanguage);
        onLanguageChange?.(newLanguage);

        toast.success(
          `Language changed to ${newLanguage.charAt(0).toUpperCase() + newLanguage.slice(1)}`,
          {
            position: "top-right",
            autoClose: 2500,
            hideProgressBar: true,
          },
        );
      } catch (error) {
        console.error("Error changing language:", error);
        toast.error("Failed to change language", {
          position: "top-right",
          autoClose: 3000,
        });
      }
    };

    useImperativeHandle(ref, () => ({
      getValue: () => editorRef.current?.getValue() || "",
      getAwareness: () => providerRef.current?.awareness || null,
    }));

    return (
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <Paper
          elevation={0}
          sx={{
            p: 1,
            mb: 0,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid",
            borderColor: "divider",
            borderRadius: 0,
            bgcolor: "background.paper",
          }}
        >
          <Chip
            label={isConnected ? "Connected" : "Connecting..."}
            color={isConnected ? "success" : "warning"}
            size="small"
            variant="outlined"
            sx={{ fontFamily: "'Inter', sans-serif" }}
          />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <Select
              value={currentLanguage}
              onChange={handleLanguageChange}
              displayEmpty
              size="small"
              sx={{ fontSize: "0.8125rem" }}
            >
              {availableLanguages.map((lang) => (
                <MenuItem key={lang} value={lang}>
                  {lang.charAt(0).toUpperCase() + lang.slice(1)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Paper>

        <Box sx={{ flexGrow: 1, overflow: "hidden" }}>
          <Editor
            height="100%"
            defaultLanguage={initialLanguage}
            theme="vs-dark"
            onMount={handleEditorDidMount}
            options={{
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              fontSize: 14,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontLigatures: true,
              tabSize: 2,
              wordWrap: "on",
              padding: { top: 12 },
              renderLineHighlight: "line",
              smoothScrolling: true,
              cursorBlinking: "smooth",
              cursorSmoothCaretAnimation: "on",
            }}
          />
        </Box>
      </Box>
    );
  },
);

export default CodeEditor;
