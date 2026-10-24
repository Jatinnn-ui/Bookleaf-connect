import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/session";
import { STATUSES } from "@/lib/domain";
import { idSchema, messageSchema } from "@/lib/validation";
import { addAdminReply } from "@/server/tickets";

type Ctx = { params: Promise<{ ticketId: string }> };

const replySchema = messageSchema.extend({ status: z.enum(STATUSES).optional() });

export const POST = route(async (req: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const ticketId = idSchema.parse((await params).ticketId);
  const { body, status } = await parseBody(req, replySchema);
  return json({ message: await addAdminReply(admin.id, ticketId, body, status) }, 201);
});
