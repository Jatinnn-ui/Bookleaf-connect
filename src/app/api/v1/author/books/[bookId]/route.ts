import { json, route } from "@/lib/http";
import { requireAuthor } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation";
import { getAuthorBook } from "@/server/tickets";

type Ctx = { params: Promise<{ bookId: string }> };

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const { authorId } = await requireAuthor();
  const bookId = idSchema.parse((await params).bookId);
  return json({ book: await getAuthorBook(authorId, bookId) });
});
