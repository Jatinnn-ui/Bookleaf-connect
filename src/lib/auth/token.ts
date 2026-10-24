import { SignJWT, jwtVerify } from "jose";

/**
 * Session token = HS256 JWT in an httpOnly cookie. Kept dependency-free of
 * Prisma/server-only so the proxy (route guard) can verify it too.
 * The token only carries identity + role; every API request re-loads the user
 * from the database, so deleted users or role changes take effect immediately.
 */
export const SESSION_COOKIE = "bl_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8; // one working day

export type SessionClaims = { sub: string; role: "AUTHOR" | "ADMIN" };

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");
  return new TextEncoder().encode(secret);
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer("bookleaf-connect")
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: "bookleaf-connect", algorithms: ["HS256"] });
    const role = payload.role;
    if (typeof payload.sub !== "string" || (role !== "AUTHOR" && role !== "ADMIN")) return null;
    return { sub: payload.sub, role };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
