import { json, route } from "@/lib/http";
import { requireAuthor } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation";
import { getAuthorTicket } from "@/server/tickets";

type Ctx = { params: Promise<{ ticketId: string }> };

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const { authorId } = await requireAuthor();
  const ticketId = idSchema.parse((await params).ticketId);
  return json({ ticket: await getAuthorTicket(authorId, ticketId) });
});
