import { Request, Response, NextFunction } from "express";

/**
 * Middleware to log all incoming requests
 */
export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);

  // Log headers and body for debugging
  console.log("Headers:", JSON.stringify(req.headers, null, 2));

  if (req.body && Object.keys(req.body).length) {
    console.log("Body:", JSON.stringify(req.body, null, 2));
  }

  next();
};
