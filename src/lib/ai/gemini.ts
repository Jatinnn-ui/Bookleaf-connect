import "server-only";
import { ApiError as GeminiApiError, GoogleGenAI, ThinkingLevel, type GenerateContentConfig } from "@google/genai";
import { env } from "@/lib/env";
import { AiError, type LlmClient, type LlmRequest, type LlmResponse } from "./llm";

/**
 * Gemini adapter. The API key is read from server env only; this module is
 * marked server-only so it can never end up in a client bundle.
 */
class GeminiClient implements LlmClient {
  private sdk: GoogleGenAI | null = null;

  private client(): GoogleGenAI {
    const { GEMINI_API_KEY } = env();
    if (!GEMINI_API_KEY) throw new AiError("not_configured", "GEMINI_API_KEY is not set");
    this.sdk ??= new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    return this.sdk;
  }

  async generate(req: LlmRequest): Promise<LlmResponse> {
    const { GEMINI_MODEL, GEMINI_TIMEOUT_MS, GEMINI_THINKING_LEVEL } = env();
    const sdk = this.client();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    const config: GenerateContentConfig = {
      systemInstruction: req.system,
      temperature: req.temperature,
      maxOutputTokens: req.maxOutputTokens,
      abortSignal: controller.signal,
    };
    if (req.jsonSchema) {
      config.responseMimeType = "application/json";
      config.responseJsonSchema = req.jsonSchema;
    }
    const level = GEMINI_THINKING_LEVEL?.toUpperCase();
    if (level && level in ThinkingLevel) {
      // Thinking tokens count against maxOutputTokens; keep it minimal for these short tasks.
      config.thinkingConfig = { thinkingLevel: ThinkingLevel[level as keyof typeof ThinkingLevel] };
    }

    try {
      const res = await sdk.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: "user", parts: [{ text: req.user }] }],
        config,
      });
      const text = res.text?.trim();
      if (!text) {
        const reason = res.promptFeedback?.blockReason ?? res.candidates?.[0]?.finishReason;
        throw new AiError(reason === "SAFETY" || res.promptFeedback?.blockReason ? "blocked" : "invalid_output", `Empty response (${reason ?? "unknown"})`);
      }
      return {
        text,
        model: GEMINI_MODEL,
        usage: {
          inputTokens: res.usageMetadata?.promptTokenCount,
          outputTokens: res.usageMetadata?.candidatesTokenCount,
        },
      };
    } catch (err) {
      throw toAiError(err, controller.signal.aborted);
    } finally {
      clearTimeout(timer);
    }
  }
}

function toAiError(err: unknown, aborted: boolean): AiError {
  if (err instanceof AiError) return err;
  if (aborted) return new AiError("timeout", "Gemini request timed out");
  if (err instanceof GeminiApiError) {
    if (err.status === 429) return new AiError("rate_limited", "Gemini rate limit");
    if (err.status === 408 || err.status === 504) return new AiError("timeout", "Gemini timeout");
    return new AiError("unavailable", `Gemini error ${err.status}`);
  }
  return new AiError("unavailable", "Gemini request failed");
}

let instance: LlmClient | null = null;
export function getLlm(): LlmClient {
  instance ??= new GeminiClient();
  return instance;
}

/** Test hook. */
export function setLlmForTesting(client: LlmClient | null) {
  instance = client;
}
