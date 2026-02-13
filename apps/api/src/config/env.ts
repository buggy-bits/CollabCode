import { config } from "dotenv";
// eslint-disable-next-line turbo/no-undeclared-env-vars
config({ path: `.env.${process.env.NODE_ENV || "development"}` });

// eslint-disable-next-line turbo/no-undeclared-env-vars
export const {
  MONGODB_URI,
  REDIS_URL,
  PORT,
  NODE_ENV,
  EXECUTION_SERVER_ORIGIN,
  ALLOWED_ORIGINS,
} = process.env;
