import { json, parseBody, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/session";
import { idSchema, noteSchema } from "@/lib/validation";
import { addNote, listNotes } from "@/server/tickets";

type Ctx = { params: Promise<{ ticketId: string }> };

export const GET = route(async (_req: Request, { params }: Ctx) => {
  await requireAdmin();
  const ticketId = idSchema.parse((await params).ticketId);
  return json({ data: await listNotes(ticketId) });
});

export const POST = route(async (req: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const ticketId = idSchema.parse((await params).ticketId);
  const { body } = await parseBody(req, noteSchema);
  return json({ note: await addNote(admin.id, ticketId, body) }, 201);
});
