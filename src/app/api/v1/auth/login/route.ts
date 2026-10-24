import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { ApiError, json, parseBody, route } from "@/lib/http";
import { dummyHash, verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/auth/token";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";

export const POST = route(async (req: Request) => {
  env();
  const { email, password } = await parseBody(req, loginSchema);

  const limit = rateLimit(`login:${clientIp(req)}:${email}`, 10, 15 * 60 * 1000);
  if (!limit.ok) throw new ApiError("RATE_LIMITED", `Too many sign-in attempts. Try again in ${limit.retryAfterSec}s.`);

  const user = await prisma.user.findUnique({ where: { email } });
  // Always run a bcrypt compare so response time does not reveal whether the email exists.
  const valid = await verifyPassword(password, user?.passwordHash ?? dummyHash());
  if (!user || !valid) throw new ApiError("UNAUTHORIZED", "Incorrect email or password.");

  const token = await signSession({ sub: user.id, role: user.role });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions());
  return json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});
