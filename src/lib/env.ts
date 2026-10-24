import "server-only";
import { z } from "zod";

/**
 * Centralised server-side configuration. Validated lazily on first use so
 * `next build` does not require production secrets, but every request path that
 * needs a value fails with a clear message instead of an undefined crash.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.5-flash-lite"),
  // Optional: MINIMAL | LOW | MEDIUM | HIGH, or empty to let the model decide.
  GEMINI_THINKING_LEVEL: z.string().optional().default("MINIMAL"),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(12000),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

export class ConfigError extends Error {}

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new ConfigError(`Invalid server configuration: ${fields}`);
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.AUTH_SECRET.startsWith("dev-only")) {
    throw new ConfigError("AUTH_SECRET must be replaced with a strong random value in production");
  }
  cached = parsed.data;
  return cached;
}

export function aiConfigured(): boolean {
  return Boolean(env().GEMINI_API_KEY);
}
