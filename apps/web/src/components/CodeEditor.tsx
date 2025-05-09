import { useEffect, useRef, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  Badge,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  SelectChangeEvent,
  Snackbar,
  Alert,
  IconButton,
  Tooltip,
  Divider,
  AvatarGroup,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
  Button,
} from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ShareIcon from "@mui/icons-material/Share";
import Editor, { Monaco, OnMount } from "@monaco-editor/react";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { MonacoBinding } from "y-monaco";
import {
  joinEditor,
  changeLanguage,
  updateRoomLanguage,
  getSocket,
  sendCodeEdit,
  updateAwareness,
  onUpdate,
  onSync,
  onAwareness,
  onRemoteCursor,
  onUserJoined,
  onUserLeft,
  onUserListUpdated,
} from "../services/socket";

// Add Awareness to the Yjs types
// This is a workaround for the missing type in the Yjs typings
declare module "yjs" {
  class Awareness {
    constructor(doc: Y.Doc);
    setLocalStateField(field: string, value: any): void;
    getStates(): Map<any, any>;
    on(event: string, handler: Function): void;
    destroy(): void;
  }
}

interface CodeEditorProps {
  roomId: string;
  initialLanguage?: string;
  theme?: string;
  readOnly?: boolean;
  username?: string;
}

interface User {
  id: string;
  username: string;
  color: string;
}

// Boilerplate code templates for different languages
const LANGUAGE_BOILERPLATES: Record<string, string> = {
  javascript: `// JavaScript Collaborative Code Editor
console.log("Hello, world!");

function exampleFunction() {
  return "Welcome to CollabCode!";
}
`,
  typescript: `// TypeScript Collaborative Code Editor
interface User {
  id: string;
  name: string;
}

function greetUser(user: User): string {
  return \`Hello, \${user.name}!\`;
}

const currentUser: User = {
  id: "1",
  name: "Collaborator"
};

console.log(greetUser(currentUser));
`,
  python: `# Python Collaborative Code Editor
def greet(name):
    return f"Hello, {name}!"

print(greet("Collaborator"))

# Example class
class User:
    def __init__(self, name, user_id):
        self.name = name
        self.id = user_id
    
    def display(self):
        print(f"User: {self.name} (ID: {self.id})")
`,
  java: `// Java Collaborative Code Editor
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, world!");
        User user = new User("Collaborator", 1);
        user.display();
    }
}

class User {
    private String name;
    private int id;
    
    public User(String name, int id) {
        this.name = name;
        this.id = id;
    }
    
    public void display() {
        System.out.println("User: " + name + " (ID: " + id + ")");
    }
}
`,
  cpp: `// C++ Collaborative Code Editor
#include <iostream>
#include <string>

class User {
private:
    std::string name;
    int id;
    
public:
    User(std::string n, int i) : name(n), id(i) {}
    
    void display() {
        std::cout << "User: " << name << " (ID: " << id << ")" << std::endl;
    }
};

int main() {
    std::cout << "Hello, world!" << std::endl;
    User user("Collaborator", 1);
    user.display();
    return 0;
}
`,
};

const SUPPORTED_LANGUAGES = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "cpp", label: "C++" },
];

// Map to store cursor decorations by user ID
const cursorDecorations = new Map<string, string[]>();

// Define a custom YjsProvider that works with our Socket.io implementation
class SocketIOProvider {
  public awareness: Awareness;
  private roomId: string;
  private language: string;
  private doc: Y.Doc;
  private socket: any;
  private status: "disconnected" | "connecting" | "connected" = "disconnected";
  private statusCallbacks: Array<(status: { status: string }) => void> = [];

  constructor(roomId: string, language: string, doc: Y.Doc, username: string) {
    this.roomId = roomId;
    this.language = language;
    this.doc = doc;
    this.socket = getSocket();

    // Create awareness instance
    this.awareness = new Awareness(doc);

    // Set local user data
    this.awareness.setLocalState({
      user: {
        name: username,
        color: this.getRandomColor(),
      },
    });

    // Initialize socket connection
    this.connect();
  }

  private getRandomColor(): string {
    const colors = [
      "#3498db",
      "#9b59b6",
      "#2ecc71",
      "#f1c40f",
      "#e74c3c",
      "#1abc9c",
      "#34495e",
      "#e67e22",
      "#16a085",
      "#d35400",
      "#27ae60",
      "#2980b9",
      "#8e44ad",
      "#f39c12",
      "#c0392b",
    ];
    return colors[Math.floor(Math.random() * colors.length)]!;
  }

  private connect() {
    if (!this.socket) {
      console.error("Socket not initialized");
      return;
    }

    this.updateStatus("connecting");

    // Connect to editor in this room
    joinEditor(this.roomId, this.language);

    // Clean up existing listeners
    this.socket.off("update");
    this.socket.off("sync");
    this.socket.off("awareness");

    // Set up listeners
    const updateHandler = (update: Uint8Array) => {
      try {
        Y.applyUpdate(this.doc, update);
        this.updateStatus("connected");
      } catch (err) {
        console.error("Error applying update:", err);
      }
    };

    const syncHandler = (syncState: Uint8Array) => {
      try {
        Y.applyUpdate(this.doc, syncState);
        this.updateStatus("connected");
      } catch (err) {
        console.error("Error applying sync state:", err);
      }
    };

    const awarenessHandler = (awarenessState: any) => {
      if (!awarenessState) return;

      try {
        // Update awareness states from other clients
        if (
          awarenessState.clientId &&
          awarenessState.clientId !== this.socket.id
        ) {
          const states = this.awareness.getStates();
          states.set(awarenessState.clientId, {
            user: {
              name: awarenessState.username || "Anonymous",
              color: awarenessState.color || "#ffcc00",
            },
            cursor: awarenessState.cursor,
            selection: awarenessState.selection,
          });
          this.awareness.emit("update", {
            added: [],
            updated: [awarenessState.clientId],
            removed: [],
          });
        }
      } catch (err) {
        console.error("Error handling awareness update:", err);
      }
    };

    // Listen for document updates
    onUpdate(updateHandler);
    onSync(syncHandler);
    onAwareness(awarenessHandler);

    // Listen for document changes in Yjs document
    this.doc.on("update", (update: Uint8Array, origin: any) => {
      // Only send update if it originated locally (not from received updates)
      if (origin !== this) {
        const encodedUpdate = Buffer.from(update).toString("base64");
        sendCodeEdit(this.roomId, this.language, {
          type: "update",
          update: encodedUpdate,
        });
      }
    });

    // Set up awareness
    this.awareness.on("update", ({ added, updated, removed }) => {
      // Send local awareness state to server
      const localState = this.awareness.getLocalState();
      if (localState) {
        updateAwareness({
          clientId: this.socket.id,
          username: localState.user?.name,
          color: localState.user?.color,
          cursor: localState.cursor,
          selection: localState.selection,
        });
      }
    });

    this.updateStatus("connected");
  }

  private updateStatus(status: "disconnected" | "connecting" | "connected") {
    this.status = status;
    this.statusCallbacks.forEach((cb) => cb({ status }));
  }

  public on(event: string, callback: (event: { status: string }) => void) {
    if (event === "status") {
      this.statusCallbacks.push(callback);
      // Immediately call with current status
      callback({ status: this.status });
    }
  }

  public disconnect() {
    if (this.socket) {
      const cleanup = onUpdate(() => {});
      cleanup();

      const cleanupSync = onSync(() => {});
      cleanupSync();

      const cleanupAwareness = onAwareness(() => {});
      cleanupAwareness();
    }

    this.doc.off("update");
    this.awareness.destroy();
    this.updateStatus("disconnected");
  }
}

const CodeEditor = ({
  roomId,
  initialLanguage = "javascript",
  theme = "vs-dark",
  readOnly = false,
  username = "Anonymous",
}: CodeEditorProps) => {
  const [language, setLanguage] = useState(initialLanguage);
  const [isConnected, setIsConnected] = useState(false);
  const [activeUsers, setActiveUsers] = useState<User[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [toast, setToast] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "info" | "warning" | "error";
  }>({
    open: false,
    message: "",
    severity: "info",
  });

  // Refs to store Y.js document, provider, and Monaco binding
  const documentRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<SocketIOProvider | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<any>(null);
  const previousLanguageRef = useRef<string>(initialLanguage);
  const contentRef = useRef<Record<string, string>>({});

  // Show a small toast notification
  const showToast = (
    message: string,
    severity: "success" | "info" | "warning" | "error" = "info",
  ) => {
    setToast({
      open: true,
      message,
      severity,
    });
  };

  // Handle language change
  const handleLanguageChange = async (event: SelectChangeEvent) => {
    const newLanguage = event.target.value;
    const oldLanguage = language;

    try {
      // Save current content before changing language
      if (editorRef.current) {
        const currentContent = editorRef.current.getValue();
        contentRef.current[oldLanguage] = currentContent;
      }

      // Update the language in the room on the server
      await updateRoomLanguage(roomId, newLanguage);

      // Update local state
      setLanguage(newLanguage);

      // Clean up old document and provider
      if (providerRef.current) {
        providerRef.current.disconnect();
      }

      // Notify other users in the room via socket
      changeLanguage(roomId, newLanguage);

      previousLanguageRef.current = newLanguage;

      // Reset the editor with boilerplate if needed
      if (!contentRef.current[newLanguage]) {
        const boilerplate = LANGUAGE_BOILERPLATES[newLanguage] || "";
        contentRef.current[newLanguage] = boilerplate;

        // Notify others about new content via code-edit
        sendCodeEdit(roomId, newLanguage, {
          type: "content",
          content: boilerplate,
        });
      }

      showToast(
        `Language changed to ${SUPPORTED_LANGUAGES.find((l) => l.value === newLanguage)?.label || newLanguage}`,
        "success",
      );
    } catch (error) {
      console.error("Error changing language:", error);
      showToast("Failed to change language. Please try again.", "error");
    }
  };

  // Generate invite link
  const handleGenerateInvite = async () => {
    try {
      // Generate a simple token from room ID
      const token = btoa(roomId);
      const url = `${window.location.origin}/invite/${token}`;
      setInviteLink(url);
      setShowInviteDialog(true);
    } catch (error) {
      console.error("Error generating invite link:", error);
      showToast("Failed to generate invite link", "error");
    }
  };

  // Copy invite link to clipboard
  const handleCopyInvite = () => {
    navigator.clipboard.writeText(inviteLink).then(() => {
      showToast("Invite link copied to clipboard", "success");
    });
  };

  // Listen for user updates
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // User joined event handler
    const userJoinedHandler = (user: User) => {
      showToast(`${user.username} joined`, "info");
    };

    // User left event handler
    const userLeftHandler = (user: { id: string; username: string }) => {
      showToast(`${user.username} left`, "info");

      // Remove cursor decoration
      if (editorRef.current && cursorDecorations.has(user.id)) {
        editorRef.current.deltaDecorations(cursorDecorations.get(user.id), []);
        cursorDecorations.delete(user.id);
      }
    };

    // User list updated event handler
    const userListHandler = (users: User[]) => {
      setActiveUsers(users);
    };

    // Remote cursor event handler
    const remoteCursorHandler = (cursorData: {
      id: string;
      username: string;
      color: string;
      position: any;
    }) => {
      if (!editorRef.current || !monacoRef.current) return;

      const { id, username, color, position } = cursorData;
      const monaco = monacoRef.current;

      // Only handle if we have position data
      if (!position || !position.lineNumber) return;

      // Remove old decorations
      if (cursorDecorations.has(id)) {
        editorRef.current.deltaDecorations(cursorDecorations.get(id), []);
      }

      // Add new decoration
      const newDecorations = editorRef.current.deltaDecorations(
        [],
        [
          {
            range: new monaco.Range(
              position.lineNumber,
              position.column,
              position.lineNumber,
              position.column + 1,
            ),
            options: {
              className: `remote-cursor-${id}`,
              hoverMessage: { value: username },
              beforeContentClassName: `remote-cursor-${id}-before`,
              afterContentClassName: `remote-cursor-${id}-after`,
            },
          },
        ],
      );

      cursorDecorations.set(id, newDecorations);

      // Add CSS for this cursor if it doesn't exist
      const styleId = `cursor-style-${id}`;
      if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.innerHTML = `
          .remote-cursor-${id}-before {
            position: absolute;
            border-left: 2px solid ${color};
            height: 18px;
            z-index: 1;
          }
          .remote-cursor-${id}-after {
            position: absolute;
            content: '';
            background: ${color};
            color: white;
            font-size: 10px;
            padding: 2px 4px;
            border-radius: 4px;
            content: "${username}";
            white-space: nowrap;
            top: -18px;
            left: 0;
            z-index: 1;
          }
        `;
        document.head.appendChild(style);
      }
    };

    // Set up event listeners
    const userJoinedUnsubscribe = onUserJoined(userJoinedHandler);
    const userLeftUnsubscribe = onUserLeft(userLeftHandler);
    const userListUnsubscribe = onUserListUpdated(userListHandler);
    const remoteCursorUnsubscribe = onRemoteCursor(remoteCursorHandler);

    return () => {
      // Clean up event listeners
      userJoinedUnsubscribe();
      userLeftUnsubscribe();
      userListUnsubscribe();
      remoteCursorUnsubscribe();

      // Remove all cursor styles
      cursorDecorations.forEach((_, id) => {
        const styleElement = document.getElementById(`cursor-style-${id}`);
        if (styleElement) {
          styleElement.remove();
        }
      });
    };
  }, [roomId]);

  // Initialize Y.js and Monaco
  useEffect(() => {
    if (!roomId) return;

    // Clean up function to be called on unmount or when language changes
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

    // Create our custom provider that works with Socket.io
    providerRef.current = new SocketIOProvider(
      roomId,
      language,
      documentRef.current,
      username,
    );

    providerRef.current.on("status", (event: { status: string }) => {
      setIsConnected(event.status === "connected");
    });

    return cleanup;
  }, [roomId, language, username]);

  // Track cursor position
  const setupCursorTracking = (editor: any) => {
    if (!editor) return;

    editor.onDidChangeCursorPosition((e: any) => {
      // Get cursor position and selection
      const position = e.position;
      const selection = editor.getSelection();

      // Send to other clients
      updateAwareness({
        cursor: position,
        selection: selection,
      });
    });
  };

  // Set up Monaco binding when editor is ready
  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    if (documentRef.current && providerRef.current) {
      // Get the Y.Text shared type from the document
      const yText = documentRef.current.getText("monaco");
      const model = editor.getModel();

      // Only create binding if we have a valid model
      if (model) {
        // Create Monaco binding
        bindingRef.current = new MonacoBinding(
          yText,
          model,
          new Set([editor]),
          providerRef.current.awareness,
        );

        // Set editor options
        editor.updateOptions({
          readOnly,
          automaticLayout: true,
        });

        // Set initial boilerplate if document is empty
        if (yText.toString().trim() === "") {
          const boilerplate = LANGUAGE_BOILERPLATES[language] || "";
          editor.setValue(boilerplate);
          contentRef.current[language] = boilerplate;

          // Send initial content to others
          sendCodeEdit(roomId, language, {
            type: "content",
            content: boilerplate,
          });

          setIsInitialized(true);
        } else if (contentRef.current[language]) {
          // If we have cached content for this language, use it
          editor.setValue(contentRef.current[language]);
          setIsInitialized(true);
        } else {
          // Store current content
          contentRef.current[language] = yText.toString();
          setIsInitialized(true);
        }

        // Set up cursor tracking
        setupCursorTracking(editor);

        // Monitor changes and ensure they're sent
        editor.onDidChangeModelContent((event) => {
          if (event.changes.length > 0) {
            // The changes will be automatically handled by Yjs
            // We don't need to manually send them as the doc.on('update') handler
            // in the provider will take care of that
          }
        });
      }
    }
  };

  // Handle notification close
  const handleCloseToast = () => {
    setToast({
      ...toast,
      open: false,
    });
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Chip
            icon={isConnected ? <CheckCircleIcon /> : <ErrorIcon />}
            label={isConnected ? "Connected" : "Connecting..."}
            color={isConnected ? "success" : "warning"}
            variant="outlined"
            size="small"
          />

          <FormControl variant="outlined" size="small" sx={{ minWidth: 150 }}>
            <InputLabel id="language-select-label">Language</InputLabel>
            <Select
              labelId="language-select-label"
              id="language-select"
              value={language}
              onChange={handleLanguageChange}
              label="Language"
              disabled={readOnly}
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <MenuItem key={lang.value} value={lang.value}>
                  {lang.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <AvatarGroup
            max={5}
            sx={{
              "& .MuiAvatar-root": {
                width: 30,
                height: 30,
                fontSize: "0.875rem",
              },
            }}
          >
            {activeUsers.map((user) => (
              <Tooltip key={user.id} title={user.username} arrow>
                <Avatar
                  sx={{
                    bgcolor: user.color || "#ccc",
                    border:
                      user.id === getSocket()?.id
                        ? "2px solid white"
                        : undefined,
                  }}
                >
                  {user.username.charAt(0).toUpperCase()}
                </Avatar>
              </Tooltip>
            ))}
          </AvatarGroup>

          <Badge badgeContent={activeUsers.length} color="primary">
            <Tooltip title="Online Users">
              <PersonIcon />
            </Tooltip>
          </Badge>

          <Tooltip title="Share Room">
            <IconButton size="small" onClick={handleGenerateInvite}>
              <ShareIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Paper>

      <Paper
        elevation={3}
        sx={{
          flexGrow: 1,
          borderRadius: 1,
          overflow: "hidden",
          height: "100%",
        }}
      >
        <Editor
          height="100%"
          width="100%"
          theme={theme}
          language={language}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            fontFamily: '"Fira Code", "Droid Sans Mono", monospace',
            fontSize: 14,
            fontLigatures: true,
            tabSize: 2,
            wordWrap: "on",
            readOnly,
          }}
        />
      </Paper>

      {/* Invite dialog */}
      <Dialog
        open={showInviteDialog}
        onClose={() => setShowInviteDialog(false)}
      >
        <DialogTitle>Share this room</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Share this link with others to invite them to this collaboration
            room:
          </DialogContentText>
          <Box sx={{ display: "flex", alignItems: "center", mt: 2 }}>
            <TextField
              fullWidth
              variant="outlined"
              value={inviteLink}
              InputProps={{
                readOnly: true,
              }}
            />
            <IconButton color="primary" onClick={handleCopyInvite}>
              <ContentCopyIcon />
            </IconButton>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowInviteDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Notifications */}
      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={handleCloseToast}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={handleCloseToast}
          severity={toast.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default CodeEditor;
