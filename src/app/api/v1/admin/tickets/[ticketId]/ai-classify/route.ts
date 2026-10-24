import { json, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation";
import { getAdminTicket, runClassification } from "@/server/tickets";

type Ctx = { params: Promise<{ ticketId: string }> };

/** Retry AI classification. Overwrites manual overrides, so the UI asks for confirmation first. */
export const POST = route(async (_req: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const ticketId = idSchema.parse((await params).ticketId);
  const result = await runClassification(ticketId, undefined, admin.id);
  return json({ ok: result.ok, error: result.ok ? null : result.error, ticket: await getAdminTicket(ticketId) });
});
