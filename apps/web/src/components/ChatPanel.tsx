import { useState, useEffect, useRef, useCallback } from "react";
import {
  Box,
  Typography,
  IconButton,
  TextField,
  InputAdornment,
  Drawer,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SendIcon from "@mui/icons-material/Send";
import {
  connectChat,
  disconnectChat,
  sendMessage,
  sendTyping,
  onMessage,
  onHistory,
  onTyping,
  type ChatMessage,
  type TypingState,
} from "../services/chatSocket";

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
  roomId: string;
  username: string;
  onNewMessage?: () => void;
}

// Simple emoji picker — common emojis without any external library
const QUICK_EMOJIS = [
  "😄",
  "😂",
  "🔥",
  "👍",
  "👎",
  "❤️",
  "🎉",
  "👀",
  "🤔",
  "✅",
  "❌",
  "🚀",
  "💯",
  "🐛",
  "⚡",
  "🙌",
];

function generateColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

const ChatPanel = ({
  open,
  onClose,
  roomId,
  username,
  onNewMessage,
}: ChatPanelProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [showEmojis, setShowEmojis] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);
  const onNewMessageRef = useRef(onNewMessage);

  // Keep the ref in sync with the latest callback
  useEffect(() => {
    onNewMessageRef.current = onNewMessage;
  }, [onNewMessage]);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    // Small delay to let the DOM update
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }, []);

  // Connect to chat on mount
  useEffect(() => {
    if (!open || !roomId || !username) return;

    connectChat(roomId, username);

    const unsubMessage = onMessage((msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
      scrollToBottom();
      // Notify parent if message is from someone else (for unread badge)
      if (msg.username !== username) {
        onNewMessageRef.current?.();
      }
    });

    const unsubHistory = onHistory((history: ChatMessage[]) => {
      setMessages(history);
      scrollToBottom();
    });

    const unsubTyping = onTyping((state: TypingState) => {
      setTypingUsers((prev) => {
        const next = new Set(prev);
        if (state.isTyping && state.username !== username) {
          next.add(state.username);
        } else {
          next.delete(state.username);
        }
        return next;
      });
    });

    return () => {
      unsubMessage();
      unsubHistory();
      unsubTyping();
      disconnectChat(roomId);
    };
  }, [open, roomId, username, scrollToBottom]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Handle typing indicator
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);

    // Send typing start
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      sendTyping(roomId, username, true);
    }

    // Reset typing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      sendTyping(roomId, username, false);
    }, 2000);
  };

  // Send message
  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    sendMessage(roomId, trimmed);
    setInputValue("");
    setShowEmojis(false);

    // Clear typing state
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    isTypingRef.current = false;
    sendTyping(roomId, username, false);

    // Focus back on input
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Insert emoji at cursor position
  const insertEmoji = (emoji: string) => {
    setInputValue((prev) => prev + emoji);
    inputRef.current?.focus();
  };

  // Build typing indicator text
  const typingText = (() => {
    const names = Array.from(typingUsers);
    if (names.length === 0) return null;
    if (names.length === 1) return `${names[0]} is typing...`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
    return `${names[0]} and ${names.length - 1} others are typing...`;
  })();

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: 340,
          display: "flex",
          flexDirection: "column",
          bgcolor: "#141414",
        },
      }}
    >
      {/* ─── Header ─── */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: "1px solid",
          borderColor: "divider",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          bgcolor: "#1C1C1E",
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          💬 Chat
        </Typography>
        <IconButton
          size="small"
          onClick={onClose}
          sx={{ color: "text.secondary" }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* ─── Messages Area ─── */}
      <Box
        sx={{
          flexGrow: 1,
          overflowY: "auto",
          px: 1.5,
          py: 1,
          display: "flex",
          flexDirection: "column",
          gap: 0.5,
          "&::-webkit-scrollbar": {
            width: 5,
          },
          "&::-webkit-scrollbar-thumb": {
            backgroundColor: "#3A3A3C",
            borderRadius: 3,
          },
          "&::-webkit-scrollbar-track": {
            backgroundColor: "transparent",
          },
        }}
      >
        {messages.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flexGrow: 1,
              gap: 1,
              opacity: 0.5,
            }}
          >
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              No messages yet
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: "text.secondary", textAlign: "center" }}
            >
              Start the conversation with your team
            </Typography>
          </Box>
        ) : (
          messages.map((msg, index) => {
            const isOwn = msg.username === username;
            const showAvatar =
              index === 0 || messages[index - 1]?.username !== msg.username;

            return (
              <Box
                key={msg.id}
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: isOwn ? "flex-end" : "flex-start",
                  mt: showAvatar ? 1 : 0,
                }}
              >
                {/* Username + time header */}
                {showAvatar && (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.75,
                      mb: 0.25,
                      px: 0.5,
                    }}
                  >
                    {!isOwn && (
                      <Box
                        sx={{
                          width: 18,
                          height: 18,
                          borderRadius: "50%",
                          bgcolor: generateColor(msg.username),
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "0.6rem",
                          fontWeight: 700,
                          color: "#fff",
                          flexShrink: 0,
                        }}
                      >
                        {msg.username.charAt(0).toUpperCase()}
                      </Box>
                    )}
                    <Typography
                      variant="caption"
                      sx={{
                        color: isOwn
                          ? "text.secondary"
                          : generateColor(msg.username),
                        fontWeight: 600,
                        fontSize: "0.7rem",
                      }}
                    >
                      {isOwn ? "You" : msg.username}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.secondary",
                        fontSize: "0.6rem",
                        opacity: 0.6,
                      }}
                    >
                      {formatTime(msg.timestamp)}
                    </Typography>
                  </Box>
                )}

                {/* Message bubble */}
                <Box
                  sx={{
                    maxWidth: "85%",
                    px: 1.5,
                    py: 0.75,
                    borderRadius: isOwn
                      ? "12px 12px 4px 12px"
                      : "12px 12px 12px 4px",
                    bgcolor: isOwn
                      ? "rgba(232, 168, 56, 0.15)"
                      : "rgba(255, 255, 255, 0.06)",
                    border: "1px solid",
                    borderColor: isOwn
                      ? "rgba(232, 168, 56, 0.2)"
                      : "rgba(255, 255, 255, 0.05)",
                    wordBreak: "break-word",
                    transition: "background 0.15s",
                    "&:hover": {
                      bgcolor: isOwn
                        ? "rgba(232, 168, 56, 0.2)"
                        : "rgba(255, 255, 255, 0.08)",
                    },
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: "0.8125rem",
                      lineHeight: 1.5,
                      color: "text.primary",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {msg.message}
                  </Typography>
                </Box>
              </Box>
            );
          })
        )}

        {/* Typing indicator */}
        {typingText && (
          <Box
            sx={{
              px: 1,
              py: 0.5,
              display: "flex",
              alignItems: "center",
              gap: 0.75,
            }}
          >
            <Box sx={{ display: "flex", gap: 0.3 }}>
              {[0, 1, 2].map((i) => (
                <Box
                  key={i}
                  sx={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    bgcolor: "text.secondary",
                    animation: "typingBounce 1.2s ease-in-out infinite",
                    animationDelay: `${i * 0.15}s`,
                    "@keyframes typingBounce": {
                      "0%, 60%, 100%": {
                        transform: "translateY(0)",
                        opacity: 0.4,
                      },
                      "30%": {
                        transform: "translateY(-4px)",
                        opacity: 1,
                      },
                    },
                  }}
                />
              ))}
            </Box>
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
                fontSize: "0.7rem",
                fontStyle: "italic",
              }}
            >
              {typingText}
            </Typography>
          </Box>
        )}

        <div ref={messagesEndRef} />
      </Box>

      {/* ─── Emoji Quick-Pick ─── */}
      {showEmojis && (
        <Box
          sx={{
            px: 1.5,
            py: 1,
            borderTop: "1px solid",
            borderColor: "divider",
            display: "flex",
            flexWrap: "wrap",
            gap: 0.25,
            bgcolor: "#1C1C1E",
          }}
        >
          {QUICK_EMOJIS.map((emoji) => (
            <Box
              key={emoji}
              onClick={() => insertEmoji(emoji)}
              sx={{
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                borderRadius: 1,
                fontSize: "1.1rem",
                transition: "all 0.15s",
                "&:hover": {
                  bgcolor: "rgba(255, 255, 255, 0.08)",
                  transform: "scale(1.2)",
                },
              }}
            >
              {emoji}
            </Box>
          ))}
        </Box>
      )}

      {/* ─── Input Area ─── */}
      <Box
        sx={{
          px: 1.5,
          py: 1.25,
          borderTop: "1px solid",
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          bgcolor: "#1C1C1E",
        }}
      >
        {/* Emoji toggle */}
        <IconButton
          size="small"
          onClick={() => setShowEmojis(!showEmojis)}
          sx={{
            color: showEmojis ? "primary.main" : "text.secondary",
            fontSize: "1.2rem",
            width: 32,
            height: 32,
            "&:hover": { color: "primary.main" },
          }}
        >
          😊
        </IconButton>

        <TextField
          inputRef={inputRef}
          fullWidth
          size="small"
          placeholder="Type a message..."
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={handleSend}
                    disabled={!inputValue.trim()}
                    sx={{
                      color: inputValue.trim()
                        ? "primary.main"
                        : "text.secondary",
                      transition: "all 0.15s",
                      "&:hover": {
                        bgcolor: "rgba(232, 168, 56, 0.1)",
                      },
                    }}
                  >
                    <SendIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </InputAdornment>
              ),
              sx: {
                fontSize: "0.8125rem",
                borderRadius: 2,
                bgcolor: "rgba(255, 255, 255, 0.04)",
                "& fieldset": {
                  borderColor: "rgba(255, 255, 255, 0.08)",
                },
                "&:hover fieldset": {
                  borderColor: "rgba(255, 255, 255, 0.15) !important",
                },
                "&.Mui-focused fieldset": {
                  borderColor: "primary.main !important",
                  borderWidth: "1px !important",
                },
              },
            },
          }}
        />
      </Box>
    </Drawer>
  );
};

export default ChatPanel;
