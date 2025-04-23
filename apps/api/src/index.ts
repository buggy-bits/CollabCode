import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { createClient } from 'redis';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(helmet());  // Security middleware
app.use(morgan('dev')); // Logging middleware
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(express.json()); // Parse JSON bodies

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27017')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Redis connection
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', err => console.error('Redis Client Error', err));
redisClient.on('connect', () => console.log('Connected to Redis'));
// Add this line to actually connect to Redis
redisClient.connect().catch(err => console.error('Redis connection error:', err));
// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok good' });
});

app.get('/ping', (req, res) => {
  res.json({ message: 'pong' }); 
});

app.get('/hi', (req, res) => {
  res.json({ message: 'meow' });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 