import { body } from "express-validator";

// List of supported languages
export const SUPPORTED_LANGUAGES = [
  "javascript",
  "typescript",
  "python",
  "java",
  "cpp",
];

export const createRoomValidation = [
  body("roomName")
    .trim()
    .notEmpty()
    .withMessage("Room name is required")
    .isLength({ min: 3, max: 50 })
    .withMessage("Room name must be between 3 and 50 characters"),

  body("language")
    .optional()
    .isString()
    .withMessage("Language must be a string")
    .isIn(SUPPORTED_LANGUAGES)
    .withMessage("Invalid language selected"),

  body("isPrivate")
    .optional()
    .isBoolean()
    .withMessage("isPrivate must be a boolean"),

  body("password")
    .if(body("isPrivate").equals("true"))
    .notEmpty()
    .withMessage("Password is required for private rooms")
    .isLength({ min: 4 })
    .withMessage("Password must be at least 4 characters long"),
];

export const updateRoomValidation = [
  body("name")
    .optional()
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage("Room name must be between 3 and 50 characters"),

  body("language")
    .optional()
    .isString()
    .withMessage("Language must be a string")
    .isIn(SUPPORTED_LANGUAGES)
    .withMessage("Invalid language selected"),

  body("isPrivate")
    .optional()
    .isBoolean()
    .withMessage("isPrivate must be a boolean"),

  body("password")
    .if(body("isPrivate").equals("true"))
    .notEmpty()
    .withMessage("Password is required for private rooms")
    .isLength({ min: 4 })
    .withMessage("Password must be at least 4 characters long"),
];

export const joinRoomValidation = [
  body("password")
    .if((req) => req.body.isPrivate)
    .notEmpty()
    .withMessage("Password is required for private rooms"),
];

export const languageValidation = [
  body("language")
    .notEmpty()
    .withMessage("Language is required")
    .isIn(SUPPORTED_LANGUAGES)
    .withMessage("Invalid language selected"),
];
