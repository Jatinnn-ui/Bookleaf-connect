import "server-only";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError, type ZodType } from "zod";
import { ConfigError } from "./env";

/**
 * Consistent JSON error envelope for every API route:
 *   { "error": { "code": "NOT_FOUND", "message": "...", "details"?: [...] } }
 */
export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "AI_UNAVAILABLE"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  AI_UNAVAILABLE: 503,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const errors = {
  unauthorized: () => new ApiError("UNAUTHORIZED", "Please sign in to continue."),
  forbidden: () => new ApiError("FORBIDDEN", "You do not have access to this resource."),
  notFound: (what = "Resource") => new ApiError("NOT_FOUND", `${what} not found.`),
  conflict: (msg: string) => new ApiError("CONFLICT", msg),
  validation: (msg: string, details?: unknown) => new ApiError("VALIDATION_ERROR", msg, details),
};

const NO_STORE = { "Cache-Control": "private, no-store" };

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

export function errorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } },
      { status: STATUS[err.code], headers: NO_STORE },
    );
  }
  if (err instanceof ZodError) {
    return errorResponse(
      errors.validation(
        "Request validation failed.",
        err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      ),
    );
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") return errorResponse(errors.notFound());
    if (err.code === "P2002") return errorResponse(errors.conflict("A record with these values already exists."));
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    console.error("[db] connection failure", err.message);
    return errorResponse(new ApiError("SERVICE_UNAVAILABLE", "Database is temporarily unavailable."));
  }
  if (err instanceof ConfigError) {
    console.error("[config]", err.message);
    return errorResponse(new ApiError("SERVICE_UNAVAILABLE", "Server is misconfigured. Contact an administrator."));
  }
  console.error("[api] unhandled error", err);
  return errorResponse(new ApiError("INTERNAL_ERROR", "Something went wrong. Please try again."));
}

/** Parse a JSON body against a schema; malformed JSON becomes a 422. */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw errors.validation("Request body must be valid JSON.");
  }
  return schema.parse(raw);
}

export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  return schema.parse(params);
}

/**
 * Basic CSRF defence for cookie-authenticated mutations: if the browser sends an
 * Origin header it must match the host we are serving.
 */
export function assertSameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw errors.forbidden();
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw errors.forbidden();
  }
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wrap a route handler with origin checks and uniform error handling. */
export function route<C>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
