import { cookies } from "next/headers";
import { json, route } from "@/lib/http";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/token";

export const POST = route(async () => {
  (await cookies()).set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return json({ ok: true });
});
