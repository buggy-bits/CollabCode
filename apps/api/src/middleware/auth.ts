import { Request, Response, NextFunction } from "express";

/**
 * A simplified auth middleware that attaches a user object to the request
 * This is a placeholder and should be replaced with actual authentication
 * For now, it uses the username from the request header or body
 */
export const auth = (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log("Auth middleware processing request");

    // Get user information from request
    // In a real app, this would verify a token or session
    let username = req.headers["x-username"] as string;

    // Try to get username from various places
    if (!username) {
      username = req.body.username || req.body.createdBy;
      console.log(`No X-Username header, trying body: ${username}`);
    }

    // If still no username, return auth error
    if (!username) {
      console.log("Authentication failed: No username found in request");
      return res.status(401).json({
        message: "Authentication required",
        details:
          "Please provide a username via X-Username header or in the request body",
      });
    }

    console.log(`Authenticated user: ${username}`);

    // Attach user to request
    req.user = {
      id: username, // Using username as ID for simplicity
      username,
    };

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(401).json({ message: "Authentication failed" });
  }
};
