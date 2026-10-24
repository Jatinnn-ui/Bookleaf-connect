import { json, parseBody, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/session";
import { adminTicketPatchSchema, idSchema } from "@/lib/validation";
import { getAdminTicket, updateAdminTicket } from "@/server/tickets";

type Ctx = { params: Promise<{ ticketId: string }> };

export const GET = route(async (_req: Request, { params }: Ctx) => {
  await requireAdmin();
  const ticketId = idSchema.parse((await params).ticketId);
  return json({ ticket: await getAdminTicket(ticketId) });
});

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const ticketId = idSchema.parse((await params).ticketId);
  const patch = await parseBody(req, adminTicketPatchSchema);
  return json({ ticket: await updateAdminTicket(admin.id, ticketId, patch) });
});
