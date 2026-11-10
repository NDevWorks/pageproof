import "server-only";
import { ConfigError } from "./env";

export type PublicError = { message: string; code: "not_configured" | "ai_unavailable" | "unknown"; status: number };

// Log the real error for the developer and return a message that is safe and useful
// for a visitor. Never leak keys, stack traces, or setup instructions to the browser.
export function publicError(err: unknown, context: string): PublicError {
  console.error(`[${context}]`, err);

  if (err instanceof ConfigError) {
    return {
      code: "not_configured",
      status: 503,
      message: "The site owner is still connecting it. Check back soon.",
    };
  }

  const status = (err as { status?: number })?.status;
  const name = (err as { name?: string })?.name ?? "";
  if (status === 401 || status === 403 || status === 429 || /APIError|RateLimit|Authentication/.test(name)) {
    return {
      code: "ai_unavailable",
      status: 503,
      message: "The AI service is unavailable right now. Try again in a minute.",
    };
  }

  return { code: "unknown", status: 500, message: "Something went wrong on our side. Try again." };
}
