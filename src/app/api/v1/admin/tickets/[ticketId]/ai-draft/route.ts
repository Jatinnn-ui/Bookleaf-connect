import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { ApiError } from "@/lib/http";
import { generateDraft } from "@/server/tickets";

type Ctx = { params: Promise<{ ticketId: string }> };
const bodySchema = z.object({ regenerate: z.boolean().default(false) });

/** Returns the cached draft, or generates one. `regenerate: true` forces a new draft. */
export const POST = route(async (req: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const ticketId = idSchema.parse((await params).ticketId);
  const { regenerate } = await parseBody(req, bodySchema);
  if (regenerate) {
    // Cost guard: cap forced regenerations per admin.
    const limit = rateLimit(`draft:${admin.id}:${clientIp(req)}`, 20, 10 * 60 * 1000);
    if (!limit.ok) throw new ApiError("RATE_LIMITED", "Too many regenerations. Please wait a few minutes.");
  }
  return json(await generateDraft(ticketId, regenerate));
});
