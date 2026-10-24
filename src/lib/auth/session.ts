import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { errors } from "@/lib/http";
import { SESSION_COOKIE, verifySession } from "./token";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: "AUTHOR" | "ADMIN";
  authorId: string | null;
};

/** Resolve the signed-in user from the session cookie, or null. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  env(); // fail fast on misconfiguration
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const claims = await verifySession(token);
  if (!claims) return null;
  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, email: true, name: true, role: true, author: { select: { id: true } } },
  });
  // Role in the DB wins over the token claim.
  if (!user) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role, authorId: user.author?.id ?? null };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw errors.unauthorized();
  return user;
}

/** Authors only. Returns the author id derived from the session, never from the client. */
export async function requireAuthor(): Promise<CurrentUser & { authorId: string }> {
  const user = await requireUser();
  if (user.role !== "AUTHOR" || !user.authorId) throw errors.forbidden();
  return user as CurrentUser & { authorId: string };
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw errors.forbidden();
  return user;
}
