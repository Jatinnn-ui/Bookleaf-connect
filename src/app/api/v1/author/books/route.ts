import { json, route } from "@/lib/http";
import { requireAuthor } from "@/lib/auth/session";
import { listAuthorBooks } from "@/server/tickets";

export const GET = route(async () => {
  const { authorId } = await requireAuthor();
  return json(await listAuthorBooks(authorId));
});
