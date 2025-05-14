import Ajv from "ajv";
import type { ErrorObject } from "ajv";

// Create Ajv instance with all required options
const ajv = new Ajv({
  allErrors: true,
  verbose: true,
  $data: true,
  code: {
    es5: true,
    lines: true,
  },
  useDefaults: true,
  coerceTypes: true,
  strict: false,
  removeAdditional: "all",
});

// Add keywords for custom validation
ajv.addFormat("date-time", {
  validate: (dateTimeString: string) => {
    const regex =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
    return regex.test(dateTimeString);
  },
});

ajv.addFormat("email", {
  validate: (email: string) => {
    const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return regex.test(email);
  },
});

ajv.addFormat("uri", {
  validate: (uri: string) => {
    try {
      new URL(uri);
      return true;
    } catch {
      return false;
    }
  },
});

/**
 * Validates JSON data against a schema
 * @param schema The JSON schema to validate against
 * @param data The data to validate
 * @returns An object containing the validation result and any errors
 */
export function validateJson(
  schema: Record<string, any>,
  data: unknown,
): {
  valid: boolean;
  errors: ErrorObject[] | null | undefined;
  validatedData?: unknown;
} {
  try {
    // Compile schema
    const validate = ajv.compile(schema);

    // Clone data to prevent modifying the original
    const jsonData = JSON.parse(JSON.stringify(data));

    // Validate data
    const valid = validate(jsonData);

    return {
      valid: !!valid,
      errors: validate.errors,
      validatedData: valid ? jsonData : undefined,
    };
  } catch (error) {
    console.error("JSON validation error:", error);
    return {
      valid: false,
      errors: [
        {
          keyword: "exception",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      ] as ErrorObject[],
    };
  }
}

/**
 * Format validation errors to display in the editor
 * @param errors Validation errors from Ajv
 * @returns Formatted error messages with line/column information when available
 */
export function formatValidationErrors(
  errors: ErrorObject[] | null | undefined,
): Array<{
  message: string;
  dataPath: string;
  line?: number;
  column?: number;
}> {
  if (!errors) return [];

  return errors.map((error) => {
    const { keyword, message, dataPath, params, schemaPath } = error;

    let formattedMessage = `${message || "Error"} at ${dataPath || "root"}`;
    if (keyword === "required") {
      formattedMessage = `Required property missing: ${(params as any).missingProperty}`;
    } else if (keyword === "type") {
      formattedMessage = `Expected type ${(params as any).type} at ${dataPath || "root"}`;
    }

    return {
      message: formattedMessage,
      dataPath: dataPath || "",
      // For line/column info, we need to use source maps or manually parse the JSON
      // This is a placeholder - actual implementation would require text parsing
    };
  });
}

/**
 * Retrieves a JSON schema from a schema registry or local storage
 * @param schemaId The ID of the schema to retrieve
 * @returns The JSON schema or null if not found
 */
export async function getJsonSchema(
  schemaId: string,
): Promise<Record<string, any> | null> {
  // In a real app, this might fetch from a server or schema registry
  // For now, we'll just return some built-in schemas

  const schemas: Record<string, Record<string, any>> = {
    user: {
      type: "object",
      required: ["id", "name", "email"],
      properties: {
        id: { type: "string" },
        name: { type: "string", minLength: 2 },
        email: { type: "string", format: "email" },
        age: { type: "number", minimum: 0 },
        roles: {
          type: "array",
          items: {
            type: "string",
            enum: ["admin", "user", "editor", "viewer"],
          },
        },
      },
    },
    config: {
      type: "object",
      required: ["apiUrl", "timeout"],
      properties: {
        apiUrl: { type: "string", format: "uri" },
        timeout: { type: "number", minimum: 100 },
        retries: { type: "integer", default: 3 },
        debug: { type: "boolean", default: false },
        headers: {
          type: "object",
          additionalProperties: { type: "string" },
        },
      },
    },
  };

  return schemas[schemaId] || null;
}

export default {
  validateJson,
  formatValidationErrors,
  getJsonSchema,
};
