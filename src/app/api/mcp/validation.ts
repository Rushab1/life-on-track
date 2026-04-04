import { z } from "zod";

/** YYYY-MM-DD date string. */
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

/** UUID string. */
export const uuidSchema = z.string().uuid("Must be a valid UUID");

/** Sanitize a database error for client-facing responses. Logs the real error server-side. */
export function safeErrorMessage(error: { message: string; code?: string }): string {
  console.error("[MCP tool error]", error.code, error.message);
  return "A database error occurred. Please try again.";
}
