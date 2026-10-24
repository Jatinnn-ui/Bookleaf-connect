import { json, parseQuery, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/session";
import { adminTicketQuerySchema } from "@/lib/validation";
import { listAdminTickets } from "@/server/tickets";

export const GET = route(async (req: Request) => {
  const admin = await requireAdmin();
  return json(await listAdminTickets(admin.id, parseQuery(req, adminTicketQuerySchema)));
});
