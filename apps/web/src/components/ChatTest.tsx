import { useState, useEffect } from "react";
import {
  Box,
  Paper,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  Typography,
} from "@mui/material";
import {
  getSocket,
  connectSocket,
  joinRoom,
  leaveRoom,
  sendMessage,
  onMessage,
  onUserJoined,
  onUserLeft,
  onUserList,
  type ChatMessage,
  type User,
} from "../services/socket";

interface ChatTestProps {
  roomId: string;
  username: string;
}

const ChatTest = ({ roomId, username }: ChatTestProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [activeUsers, setActiveUsers] = useState<User[]>([]);

  useEffect(() => {
    // Connect to socket and join room
    const socket = connectSocket();
    joinRoom(roomId, username);

    // Handle incoming messages
    const messageHandler = (message: ChatMessage) => {
      setMessages((prev) => [...prev, message]);
    };

    // Handle user joined
    const userJoinedHandler = (user: User) => {
      setActiveUsers((prev) => [...prev, user]);
    };

    // Handle user left
    const userLeftHandler = (user: User) => {
      setActiveUsers((prev) => prev.filter((u) => u.id !== user.id));
    };

    // Handle user list
    const userListHandler = (users: User[]) => {
      setActiveUsers(users);
    };

    // Set up event listeners
    const unsubscribeMessage = onMessage(messageHandler);
    const unsubscribeUserJoined = onUserJoined(userJoinedHandler);
    const unsubscribeUserLeft = onUserLeft(userLeftHandler);
    const unsubscribeUserList = onUserList(userListHandler);

    // Clean up
    return () => {
      unsubscribeMessage();
      unsubscribeUserJoined();
      unsubscribeUserLeft();
      unsubscribeUserList();
      leaveRoom(roomId);
    };
  }, [roomId, username]);

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;

    sendMessage(roomId, newMessage);
    setNewMessage("");
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Active Users ({activeUsers.length})
        </Typography>
        <List dense>
          {activeUsers.map((user) => (
            <ListItem key={user.id}>
              <ListItemText
                primary={user.username}
                sx={{
                  "& .MuiListItemText-primary": {
                    color: user.color,
                  },
                }}
              />
            </ListItem>
          ))}
        </List>
      </Paper>

      <Paper
        elevation={3}
        sx={{
          flexGrow: 1,
          mb: 2,
          overflow: "auto",
          p: 2,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <List>
          {messages.map((msg) => (
            <ListItem key={msg.id} alignItems="flex-start">
              <ListItemText
                primary={
                  <Typography
                    component="span"
                    variant="subtitle2"
                    sx={{
                      color: activeUsers.find(
                        (u) => u.username === msg.username,
                      )?.color,
                    }}
                  >
                    {msg.username}
                  </Typography>
                }
                secondary={
                  <Typography component="span" variant="body1">
                    {msg.message}
                  </Typography>
                }
              />
            </ListItem>
          ))}
        </List>
      </Paper>

      <Paper elevation={3} sx={{ p: 2 }}>
        <Box sx={{ display: "flex", gap: 1 }}>
          <TextField
            fullWidth
            multiline
            maxRows={4}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            variant="outlined"
            size="small"
          />
          <Button
            variant="contained"
            onClick={handleSendMessage}
            disabled={!newMessage.trim()}
          >
            Send
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default ChatTest;
