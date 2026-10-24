import { json, parseBody, parseQuery, route } from "@/lib/http";
import { requireAuthor } from "@/lib/auth/session";
import { authorTicketQuerySchema, createTicketSchema } from "@/lib/validation";
import { createTicket, listAuthorTickets } from "@/server/tickets";

export const GET = route(async (req: Request) => {
  const { authorId } = await requireAuthor();
  return json({ data: await listAuthorTickets(authorId, parseQuery(req, authorTicketQuerySchema)) });
});

export const POST = route(async (req: Request) => {
  // authorId comes from the session only; any authorId in the body is ignored by the schema.
  const { authorId } = await requireAuthor();
  const input = await parseBody(req, createTicketSchema);
  return json({ ticket: await createTicket(authorId, input) }, 201);
});
