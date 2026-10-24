import { json, parseBody, route } from "@/lib/http";
import { requireAuthor } from "@/lib/auth/session";
import { idSchema, messageSchema } from "@/lib/validation";
import { addAuthorMessage } from "@/server/tickets";

type Ctx = { params: Promise<{ ticketId: string }> };

export const POST = route(async (req: Request, { params }: Ctx) => {
  const user = await requireAuthor();
  const ticketId = idSchema.parse((await params).ticketId);
  const { body } = await parseBody(req, messageSchema);
  return json({ message: await addAuthorMessage(user.authorId, user.id, ticketId, body) }, 201);
});
