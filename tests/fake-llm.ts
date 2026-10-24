import { AiError, type LlmClient, type LlmRequest, type LlmResponse } from "@/lib/ai/llm";

/** Scriptable LLM double: never touches the network. */
export class FakeLlm implements LlmClient {
  calls: LlmRequest[] = [];
  constructor(private responder: (req: LlmRequest) => string | Error) {}
  async generate(req: LlmRequest): Promise<LlmResponse> {
    this.calls.push(req);
    const out = this.responder(req);
    if (out instanceof Error) throw out;
    return { text: out, model: "fake" };
  }
}

export const failingLlm = (kind: AiError["kind"] = "unavailable") => new FakeLlm(() => new AiError(kind, "fake failure"));

export const classifyAs = (category: string, priorityScore: number, priority = "HIGH") =>
  new FakeLlm((req) =>
    req.purpose === "classify"
      ? JSON.stringify({ category, priority, priorityScore, reason: "Test reason." })
      : "Hi Priya,\n\nThank you for reaching out. I understand how frustrating this is. Our team will look into it and get back to you within 48 hours.\n\nWarm regards,\nThe BookLeaf Author Support Team",
  );
