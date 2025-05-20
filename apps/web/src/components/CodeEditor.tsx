import { useEffect, useRef, useState, useCallback } from "react";
import {
  Box,
  Paper,
  // Typography,
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
  // Divider,
  AvatarGroup,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
  Button,
  CircularProgress,
  Switch,
  FormControlLabel,
} from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ShareIcon from "@mui/icons-material/Share";
import SettingsIcon from "@mui/icons-material/Settings";
import Editor, { Monaco, OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { MonacoBinding } from "y-monaco";
import {
  RemoteCursorManager,
  // REMOVE: EditorContentManager,
} from "@convergencelabs/monaco-collab-ext";
import {
  joinEditor,
  changeLanguage,
  updateRoomLanguage,
  getSocket,
  sendCodeEdit,
  updateAwareness,
  onUpdate,
  onSync,
  AwarenessState,
  setupPresenceListeners,
} from "../services/socket";
import {
  validateJson,
  getJsonSchema,
  formatValidationErrors,
} from "../utils/jsonValidator";

// Define better types for Awareness to fix linter errors
declare module "yjs" {
  interface AwarenessStateMap {
    user?: {
      name: string;
      color: string;
    };
    cursor?: {
      lineNumber: number;
      column: number;
    };
    selection?: {
      startLineNumber: number;
      startColumn: number;
      endLineNumber: number;
      endColumn: number;
    };
    isTyping?: boolean;
    scrollPosition?: {
      scrollTop: number;
      scrollLeft: number;
    };
  }

  class Awareness {
    constructor(doc: Y.Doc);
    setLocalStateField(field: string, value: unknown): void;
    getStates(): Map<number, AwarenessStateMap>;
    getLocalState(): AwarenessStateMap;
    on(
      event: string,
      handler: (changes: {
        added: number[];
        updated: number[];
        removed: number[];
      }) => void,
    ): void;
    off(
      event: string,
      handler: (changes: {
        added: number[];
        updated: number[];
        removed: number[];
      }) => void,
    ): void;
    emit(
      event: string,
      data: { added: number[]; updated: number[]; removed: number[] },
    ): void;
    destroy(): void;
  }
}

interface TypingIndicator {
  userId: string;
  username: string;
  color: string;
  timestamp: number;
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

interface ValidationMarker {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
  severity: monaco.MarkerSeverity;
}

// Improved socket provider type
type SocketStatus = "disconnected" | "connecting" | "connected";

// Map to store cursor decorations by user ID
const cursorDecorations = new Map<string, string[]>();

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
  json: `{
  "name": "CollabCode",
  "version": "1.0.0",
  "description": "Collaborative code editor",
  "author": "Your Name",
  "features": [
    "Real-time collaboration",
    "Multi-language support",
    "User presence",
    "JSON validation"
  ],
  "settings": {
    "theme": "dark",
    "fontSize": 14,
    "tabSize": 2
  }
}
`,
};

const SUPPORTED_LANGUAGES = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "cpp", label: "C++" },
  { value: "json", label: "JSON" },
];

// Define a custom YjsProvider that works with our Socket.io implementation
class SocketIOProvider {
  public awareness: Awareness;
  public socket: ReturnType<typeof getSocket>;
  private roomId: string;
  private language: string;
  private doc: Y.Doc;
  private status: SocketStatus = "disconnected";
  private statusCallbacks: Array<(status: { status: string }) => void> = [];
  private typingTimeout: ReturnType<typeof setTimeout> | null = null;
  // REMOVE: private lastTypingUpdate = 0;
  private readonly TYPING_THROTTLE = 1000; // 1 second between typing updates
  private updateHandlers: Set<(update: Uint8Array, origin: unknown) => void>;
  // REMOVE: private yTextObserver: () => void | null = null;
  private pendingUpdates: Uint8Array[] = [];
  private pendingUpdateTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingUpdateInterval = 50; // 50ms between update batches
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(roomId: string, language: string, doc: Y.Doc, username: string) {
    this.roomId = roomId;
    this.language = language;
    this.doc = doc;
    this.socket = getSocket();
    this.updateHandlers = new Set();

    // Create awareness instance
    this.awareness = new Awareness(doc);

    // Set local user data
    this.awareness.setLocalStateField("user", {
      name: username,
      color: this.getRandomColor(),
    });

    // Initialize socket connection
    this.connect();

    // Set up periodic state sync to ensure consistency
    this.setupPeriodicSync();
  }

  private setupPeriodicSync() {
    // Periodically sync state with others to ensure consistency
    setInterval(() => {
      if (this.status === "connected") {
        const state = Y.encodeStateAsUpdate(this.doc);
        sendCodeEdit(this.roomId, this.language, {
          type: "sync",
          update: Buffer.from(state).toString("base64"),
        });
      }
    }, 30000); // Sync every 30 seconds
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
    this.socket.off("disconnect");
    this.socket.off("connect");

    // Handle reconnection
    this.socket.on("reconnect", () => {
      console.log("Socket reconnected, requesting sync");
      this.updateStatus("connecting");
      this.requestSync();
    });

    this.socket.on("disconnect", () => {
      console.log("Socket disconnected");
      this.updateStatus("disconnected");

      // Try to reconnect after a short delay
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
      }
      this.reconnectTimer = setTimeout(() => {
        console.log("Attempting to reconnect...");
        this.connect();
      }, 2000);
    });

    this.socket.on("connect", () => {
      console.log("Socket connected");
      this.updateStatus("connecting");

      // Re-join the room and request sync after connecting
      joinEditor(this.roomId, this.language);
      this.requestSync();
    });

    // Set up listeners
    const updateHandler = (update: Uint8Array) => {
      try {
        console.log("Received update from remote");
        Y.applyUpdate(this.doc, update, this);
        this.updateStatus("connected");
      } catch (err) {
        console.error("Error applying update:", err);
        // Request full sync on error
        this.requestSync();
      }
    };

    const syncHandler = (syncState: Uint8Array) => {
      try {
        console.log("Received sync state");
        Y.applyUpdate(this.doc, syncState, this);
        this.updateStatus("connected");
      } catch (err) {
        console.error("Error applying sync state:", err);
      }
    };

    // Listen for document updates
    onUpdate(updateHandler);
    onSync(syncHandler);
    this.socket.on("awareness", (awarenessState: AwarenessState) => {
      // Handle awareness state updates
      this.handleAwarenessUpdate(awarenessState);
    });

    // Listen for document changes in Yjs document
    const updateListener = (update: Uint8Array, origin: unknown) => {
      // Only send update if it originated locally (not from received updates)
      if (origin !== this) {
        try {
          console.log("Local update detected, sending to server");

          // Add to pending updates queue
          this.pendingUpdates.push(update);

          // Process the pending updates with throttling
          this.processPendingUpdates();

          // Update typing indicator
          this.updateTypingState(true);

          // Notify update handlers
          this.updateHandlers.forEach((handler) => handler(update, origin));
        } catch (err) {
          console.error("Error handling document update:", err);
        }
      }
    };

    // Remove any existing listener
    this.doc.off("update", updateListener);

    // Add new listener
    this.doc.on("update", updateListener);

    // Set up awareness
    const awarenessUpdateHandler = ({
      added,
      updated,
      removed,
    }: {
      added: number[];
      updated: number[];
      removed: number[];
    }) => {
      // Send local awareness state to server
      const localState = this.awareness.getLocalState();
      if (localState && this.socket) {
        // Convert to the expected format for the socket service
        const awarenessState: AwarenessState = {
          clientId: this.socket.id,
          user: localState.user,
          cursor: localState.cursor,
          selection: localState.selection,
          isTyping: localState.isTyping as boolean,
          scrollPosition: localState.scrollPosition,
          username: localState.user?.name,
          color: localState.user?.color,
          timestamp: Date.now(),
        };

        updateAwareness(awarenessState);
      }
    };

    this.awareness.on("update", awarenessUpdateHandler);

    // Request initial sync after joining the room
    this.requestSync();

    this.updateStatus("connected");
  }

  // Process pending updates with throttling
  private processPendingUpdates() {
    if (this.pendingUpdateTimer) {
      // Timer already running, updates will be processed in the next batch
      return;
    }

    this.pendingUpdateTimer = setTimeout(() => {
      if (this.pendingUpdates.length > 0) {
        // Merge all pending updates into a single update
        const mergedUpdate = Y.mergeUpdates(this.pendingUpdates);

        // Send the merged update
        const encodedUpdate = Buffer.from(mergedUpdate).toString("base64");
        sendCodeEdit(this.roomId, this.language, {
          type: "update",
          update: encodedUpdate,
        });

        // Clear pending updates
        this.pendingUpdates = [];
      }

      this.pendingUpdateTimer = null;
    }, this.pendingUpdateInterval);
  }

  private handleAwarenessUpdate = (awarenessState: AwarenessState) => {
    if (!awarenessState) return;

    try {
      // Update awareness states from other clients
      if (
        awarenessState.clientId &&
        awarenessState.clientId !== this.socket?.id
      ) {
        const states = this.awareness.getStates();
        const clientId = parseInt(awarenessState.clientId, 10) || 0;

        // Create a valid state object
        const state: Record<string, unknown> = {};

        // Copy user data
        if (awarenessState.user) {
          state.user = {
            name:
              awarenessState.user.name ||
              awarenessState.username ||
              "Anonymous",
            color:
              awarenessState.user.color || awarenessState.color || "#ffcc00",
          };
        } else if (awarenessState.username) {
          state.user = {
            name: awarenessState.username,
            color: awarenessState.color || "#ffcc00",
          };
        }

        // Copy cursor data if available
        if (awarenessState.cursor) {
          state.cursor = awarenessState.cursor;
        }

        // Copy selection data if available
        if (awarenessState.selection) {
          state.selection = awarenessState.selection;
        }

        // Copy typing state
        if (awarenessState.isTyping !== undefined) {
          state.isTyping = awarenessState.isTyping;
        }

        // Copy scroll position
        if (awarenessState.scrollPosition) {
          state.scrollPosition = awarenessState.scrollPosition;
        }

        // Update the state in the awareness instance
        states.set(clientId, state);

        // Emit the update event (should be an array of updated client IDs)
        this.awareness.emit("update", {
          added: [],
          updated: [clientId],
          removed: [],
        });
      }
    } catch (err) {
      console.error("Error handling awareness update:", err);
    }
  };

  // Register update handler
  public onUpdate(handler: (update: Uint8Array, origin: unknown) => void) {
    this.updateHandlers.add(handler);
    return () => {
      this.updateHandlers.delete(handler);
    };
  }

  // Request a full sync from other clients
  private requestSync() {
    if (this.socket && this.socket.connected) {
      console.log("Requesting full sync for room:", this.roomId);
      this.socket.emit("request-sync", this.roomId, this.language);
    }
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

  private updateStatus(status: SocketStatus) {
    this.status = status;
    this.statusCallbacks.forEach((cb) => cb({ status }));
  }

  // Add updateTypingState method to manage typing awareness
  public updateTypingState(isTyping: boolean) {
    this.awareness.setLocalStateField("isTyping", isTyping);

    // Optionally, clear typing state after a short delay
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    if (isTyping) {
      this.typingTimeout = setTimeout(() => {
        this.awareness.setLocalStateField("isTyping", false);
      }, this.TYPING_THROTTLE);
    }
  }

  public on(event: string, callback: (event: { status: string }) => void) {
    if (event === "status") {
      this.statusCallbacks.push(callback);
      // Immediately call with current status
      callback({ status: this.status });
    }
  }

  public disconnect() {
    // Clean up pending updates
    if (this.pendingUpdateTimer) {
      clearTimeout(this.pendingUpdateTimer);
      this.pendingUpdateTimer = null;
    }

    // Clean up reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      const cleanup = onUpdate(() => {});
      cleanup();

      const cleanupSync = onSync(() => {});
      cleanupSync();

      // Remove socket listeners
      this.socket.off("update");
      this.socket.off("sync");
      this.socket.off("awareness");
      this.socket.off("disconnect");
      this.socket.off("connect");
      this.socket.off("reconnect");
    }

    // Clear typing timeout
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }

    // Remove update listeners
    try {
      this.doc.off("update", (update: Uint8Array, origin: any) => {});
    } catch (err) {
      console.error("Error removing update listener:", err);
    }

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
  const [typingUsers, setTypingUsers] = useState<User[]>([]);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [isValidatingJson, setIsValidatingJson] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationMarker[]>(
    [],
  );
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [selectedJsonSchema, setSelectedJsonSchema] = useState<string | null>(
    null,
  );
  const [availableSchemas, setAvailableSchemas] = useState<string[]>([
    "user",
    "config",
  ]);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [autoValidateJson, setAutoValidateJson] = useState(true);
  const [toast, setToast] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "info" | "warning" | "error";
  }>({
    open: false,
    message: "",
    severity: "info",
  });
  // REMOVE: const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  // Refs to store Y.js document, provider, and Monaco binding
  const documentRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<SocketIOProvider | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const previousLanguageRef = useRef<string>(initialLanguage);
  const contentRef = useRef<Record<string, string>>({});
  const remoteCursorManagerRef = useRef<RemoteCursorManager | null>(null);
  const lastUpdateTimestampRef = useRef<number>(Date.now());

  // Show a small toast notification
  const showToast = useCallback(
    (
      message: string,
      severity: "success" | "info" | "warning" | "error" = "info",
    ) => {
      setToast({
        open: true,
        message,
        severity,
      });
    },
    [],
  );

  // Validate JSON content
  const validateJsonContent = useCallback(
    async (content: string) => {
      if (!selectedJsonSchema || language !== "json") return;

      setIsValidatingJson(true);
      try {
        // Parse JSON
        const jsonData = JSON.parse(content);

        // Get schema and validate
        const schema = await getJsonSchema(selectedJsonSchema);
        if (!schema) {
          showToast(`Schema ${selectedJsonSchema} not found`, "error");
          return;
        }

        const result = validateJson(schema, jsonData);

        if (!result.valid && result.errors) {
          // Format errors for Monaco editor markers
          const formattedErrors = formatValidationErrors(result.errors);

          // Convert to Monaco markers
          const markers: ValidationMarker[] = formattedErrors.map((error) => {
            // Find position in JSON string - a more robust implementation would use a JSON parser
            // For now we just create markers at the beginning of the file as an example
            return {
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: 1,
              endColumn: 2,
              message: error.message,
              severity: monaco.MarkerSeverity.Error,
            };
          });

          // Update validation errors
          setValidationErrors(markers);
          setShowValidationErrors(true);

          if (markers.length > 0) {
            showToast(`${markers.length} validation errors found`, "error");
          }
        } else {
          // Clear any existing errors
          setValidationErrors([]);
          setShowValidationErrors(false);
          showToast("JSON is valid", "success");
        }
      } catch (err) {
        console.error("JSON validation error:", err);
        showToast(
          `Invalid JSON: ${
            err instanceof Error ? err.message : "Unknown error"
          }`,
          "error",
        );
      } finally {
        setIsValidatingJson(false);
      }
    },
    [language, selectedJsonSchema, showToast],
  );

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

      // Set up JSON validation if needed
      if (newLanguage === "json" && autoValidateJson) {
        // Reset schema selection for new JSON content
        setSelectedJsonSchema("user");
      } else {
        // Clear validation state for non-JSON languages
        setValidationErrors([]);
        setShowValidationErrors(false);
        setSelectedJsonSchema(null);
      }

      showToast(
        `Language changed to ${
          SUPPORTED_LANGUAGES.find((l) => l.value === newLanguage)?.label ||
          newLanguage
        }`,
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

  // Toggle settings dialog
  const handleToggleSettings = () => {
    setShowSettingsDialog(!showSettingsDialog);
  };

  // Force update to server
  const forceSyncWithServer = useCallback(() => {
    console.log("Forcing sync with server");
    if (documentRef.current && providerRef.current) {
      const state = Y.encodeStateAsUpdate(documentRef.current);
      sendCodeEdit(roomId, language, {
        type: "sync",
        update: Buffer.from(state).toString("base64"),
      });
      lastUpdateTimestampRef.current = Date.now();
    }
  }, [roomId, language]);

  // Listen for user updates
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // User joined event handler
    const userJoinedHandler = (user: User) => {
      showToast(`${user.username} joined`, "info");
      // Force sync when a user joins
      forceSyncWithServer();
    };

    // User left event handler
    const userLeftHandler = (user: { id: string; username: string }) => {
      showToast(`${user.username} left`, "info");

      // Remove cursor decoration
      if (editorRef.current && cursorDecorations.has(user.id)) {
        editorRef.current.deltaDecorations(
          cursorDecorations.get(user.id) || [],
          [],
        );
        cursorDecorations.delete(user.id);
      }

      // Remove from typing users
      setTypingUsers((prev) => prev.filter((u) => u.id !== user.id));
    };

    // User list updated event handler
    const userListHandler = (users: User[]) => {
      setActiveUsers(users);
      // Force sync if there are new users
      if (users.length > activeUsers.length) {
        forceSyncWithServer();
      }
    };

    // Language changed handler
    const languageChangedHandler = (data: { language: string }) => {
      if (data.language !== language) {
        setLanguage(data.language);
        showToast(
          `Language changed to ${
            SUPPORTED_LANGUAGES.find((l) => l.value === data.language)?.label ||
            data.language
          }`,
          "info",
        );
      }
    };

    const { onUserLeft, onUserJoined, onUserListUpdated, onLanguageChanged } =
      setupPresenceListeners(socket);

    // Set up event listeners
    const userJoinedUnsubscribe = onUserJoined(userJoinedHandler);
    const userLeftUnsubscribe = onUserLeft(userLeftHandler);
    const userListUnsubscribe = onUserListUpdated(userListHandler);
    const languageChangedUnsubscribe = onLanguageChanged(
      languageChangedHandler,
    );

    return () => {
      // Clean up event listeners
      userJoinedUnsubscribe();
      userLeftUnsubscribe();
      userListUnsubscribe();
      // remoteCursorUnsubscribe();
      languageChangedUnsubscribe();
    };
  }, [activeUsers.length, forceSyncWithServer, language, showToast]);

  // Update typing users
  useEffect(() => {
    if (!documentRef.current || !providerRef.current) return;

    const awareness = providerRef.current.awareness;

    const handleAwarenessUpdate = () => {
      const states = awareness.getStates();
      const currentTypingUsers: User[] = [];

      // Get all users who are currently typing
      states.forEach((state, clientId) => {
        if (state.isTyping && state.user) {
          currentTypingUsers.push({
            id: clientId.toString(),
            username: state.user.name,
            color: state.user.color,
          });
        }
      });

      setTypingUsers(currentTypingUsers);
    };

    awareness.on("update", handleAwarenessUpdate);

    return () => {
      awareness.off("update", handleAwarenessUpdate);
    };
  }, []);

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
      if (remoteCursorManagerRef.current) {
        remoteCursorManagerRef.current = null;
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

  // Set up Monaco binding when editor is ready
  const handleEditorDidMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      if (documentRef.current && providerRef.current) {
        // Get the Y.Text shared type from the document
        const yText = documentRef.current.getText("monaco");
        const model = editor.getModel();

        // Only create binding if we have a valid model
        if (model) {
          // Set up remote cursor management
          try {
            // Initialize the RemoteCursorManager from monaco-collab-ext
            const remoteCursorManager = new RemoteCursorManager({
              editor: editor,
              tooltips: true,
              tooltipDuration: 2000,
            });
            remoteCursorManagerRef.current = remoteCursorManager;

            console.log("Remote cursor manager initialized");
          } catch (err) {
            console.error("Error initializing remote cursor manager:", err);
          }

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
            fontFamily: '"Fira Code", "Droid Sans Mono", monospace',
            fontSize: 14,
            fontLigatures: true,
            tabSize: 2,
            wordWrap: "on",
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
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
          } else if (contentRef.current[language]) {
            // If we have cached content for this language, use it
            editor.setValue(contentRef.current[language]);
          } else {
            // Store current content
            contentRef.current[language] = yText.toString();
          }

          // Track cursor position and selection
          editor.onDidChangeCursorPosition((e) => {
            try {
              const position = e.position;

              // Create cursor position compatible with our socket interface
              const cursorPosition = {
                lineNumber: position.lineNumber,
                column: position.column,
              };

              // Get selection if available
              const selectionObj = editor.getSelection();
              let selection;

              if (selectionObj) {
                selection = {
                  startLineNumber: selectionObj.startLineNumber,
                  startColumn: selectionObj.startColumn,
                  endLineNumber: selectionObj.endLineNumber,
                  endColumn: selectionObj.endColumn,
                };
              }

              // Console log for debugging
              console.log("Cursor position changed:", cursorPosition);

              // Send awareness update
              updateAwareness({
                cursor: cursorPosition,
                selection: selection,
                clientId: providerRef.current?.socket?.id,
                timestamp: Date.now(),
              });

              // Update typing indicator via provider's public method
              if (providerRef.current) {
                providerRef.current.updateTypingState(true);
              }
            } catch (err) {
              console.error("Error handling cursor position change:", err);
            }
          });

          // Validate JSON if needed
          if (language === "json" && autoValidateJson) {
            // Set default schema
            setSelectedJsonSchema("user");

            // Validate after a short delay to ensure content is loaded
            setTimeout(() => {
              validateJsonContent(editor.getValue());
            }, 500);

            // Set up validation on content changes
            editor.onDidChangeModelContent(() => {
              if (autoValidateJson) {
                const content = editor.getValue();
                validateJsonContent(content);
              }
            });
          }
        }
      }
    },
    [language, readOnly, roomId, validateJsonContent, autoValidateJson],
  );

  // Update model markers when validation errors change
  useEffect(() => {
    if (!monacoRef.current || !editorRef.current || !showValidationErrors)
      return;

    const model = editorRef.current.getModel();
    if (!model) return;

    // Set markers in Monaco
    monacoRef.current.editor.setModelMarkers(
      model,
      "jsonValidation",
      validationErrors,
    );

    return () => {
      // Clear markers when component unmounts or errors are hidden
      if (model && monacoRef.current) {
        monacoRef.current.editor.setModelMarkers(model, "jsonValidation", []);
      }
    };
  }, [validationErrors, showValidationErrors]);

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

          {language === "json" && (
            <FormControl variant="outlined" size="small" sx={{ minWidth: 150 }}>
              <InputLabel id="schema-select-label">JSON Schema</InputLabel>
              <Select
                labelId="schema-select-label"
                id="schema-select"
                value={selectedJsonSchema || ""}
                onChange={(e) => {
                  setSelectedJsonSchema(e.target.value);
                  if (editorRef.current && e.target.value) {
                    validateJsonContent(editorRef.current.getValue());
                  }
                }}
                label="JSON Schema"
                disabled={!isConnected}
              >
                {availableSchemas.map((schema) => (
                  <MenuItem key={schema} value={schema}>
                    {schema}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {typingUsers.length > 0 && (
            <Chip
              label={
                typingUsers.length === 1
                  ? `${typingUsers[0].username} is typing...`
                  : `${typingUsers.length} users are typing...`
              }
              color="secondary"
              variant="outlined"
              size="small"
            />
          )}
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

          <Tooltip title="Editor Settings">
            <IconButton size="small" onClick={handleToggleSettings}>
              <SettingsIcon />
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
          position: "relative",
        }}
      >
        {isValidatingJson && (
          <CircularProgress
            size={20}
            sx={{
              position: "absolute",
              right: "10px",
              top: "10px",
              zIndex: 1,
            }}
          />
        )}

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

      {/* Settings dialog */}
      <Dialog
        open={showSettingsDialog}
        onClose={() => setShowSettingsDialog(false)}
      >
        <DialogTitle>Editor Settings</DialogTitle>
        <DialogContent>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              minWidth: "300px",
              pt: 1,
            }}
          >
            {language === "json" && (
              <FormControlLabel
                control={
                  <Switch
                    checked={autoValidateJson}
                    onChange={(e) => setAutoValidateJson(e.target.checked)}
                  />
                }
                label="Auto-validate JSON"
              />
            )}

            <FormControlLabel
              control={
                <Switch
                  checked={showValidationErrors}
                  onChange={(e) => setShowValidationErrors(e.target.checked)}
                  disabled={validationErrors.length === 0}
                />
              }
              label="Show validation errors"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowSettingsDialog(false)}>Close</Button>
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
