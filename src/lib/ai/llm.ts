/**
 * Provider-agnostic LLM interface. Business logic depends on this, not on the
 * Gemini SDK, so tests inject a fake and we can swap providers later.
 */
export type LlmRequest = {
  system: string;
  user: string;
  /** JSON schema for structured output; when set the provider must return JSON. */
  jsonSchema?: Record<string, unknown>;
  maxOutputTokens: number;
  temperature: number;
  purpose: "classify" | "draft";
};

export type LlmResponse = {
  text: string;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
};

export interface LlmClient {
  generate(req: LlmRequest): Promise<LlmResponse>;
}

export type AiErrorKind = "not_configured" | "rate_limited" | "timeout" | "unavailable" | "invalid_output" | "blocked";

export class AiError extends Error {
  constructor(
    public kind: AiErrorKind,
    message: string,
  ) {
    super(message);
  }
}

/** Human-readable reason shown to admins (never contains provider internals or keys). */
export function describeAiError(err: unknown): string {
  if (err instanceof AiError) {
    switch (err.kind) {
      case "not_configured":
        return "AI is not configured on this server (GEMINI_API_KEY missing).";
      case "rate_limited":
        return "AI provider rate limit reached. Try again shortly.";
      case "timeout":
        return "AI provider timed out.";
      case "invalid_output":
        return "AI returned an invalid response.";
      case "blocked":
        return "AI declined to respond to this content.";
      default:
        return "AI provider is unavailable.";
    }
  }
  return "AI provider is unavailable.";
}
