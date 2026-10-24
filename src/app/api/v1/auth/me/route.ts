import { prisma } from "@/lib/db";
import { json, route } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";

export const GET = route(async () => {
  const user = await requireUser();
  const author = user.authorId
    ? await prisma.author.findUnique({
        where: { id: user.authorId },
        select: { externalAuthorId: true, city: true, phone: true, joinedDate: true },
      })
    : null;
  return json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      author: author && {
        id: user.authorId,
        externalAuthorId: author.externalAuthorId,
        city: author.city,
        phone: author.phone,
        joinedDate: author.joinedDate.toISOString().slice(0, 10),
      },
    },
  });
});
