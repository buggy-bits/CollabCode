import { config } from "dotenv";

config({ path: `.env.${process.env.NODE_ENV || "development"}` });

export const {
  MONGODB_URI,
  PORT,
  NODE_ENV,
  EXECUTION_SERVER_ORIGIN,
  ALLOWED_ORIGINS,
  REDIS_URL,
} = process.env;
