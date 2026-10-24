import { z } from "zod";
import { CATEGORIES, PRIORITIES, STATUSES } from "./domain";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address")),
  password: z.string().min(1, "Password is required").max(200),
});

export const idSchema = z.uuid("Invalid identifier");

const text = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

export const createTicketSchema = z.object({
  // null / omitted = General / Account Level
  bookId: idSchema.nullable().optional(),
  subject: text(5, 150, "Subject"),
  description: text(20, 5000, "Description"),
  // UI-only attachment: we record the file name the author picked, never the file.
  attachmentName: z.string().trim().max(255).nullable().optional(),
});

export const messageSchema = z.object({ body: text(1, 5000, "Message") });
export const noteSchema = z.object({ body: text(1, 5000, "Note") });

export const adminTicketPatchSchema = z
  .object({
    status: z.enum(STATUSES).optional(),
    category: z.enum(CATEGORIES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    priorityScore: z.number().int().min(0).max(100).optional(),
    // "me" assigns to the caller; null unassigns. Arbitrary ids are not accepted.
    assignee: z.union([z.literal("me"), z.null()]).optional(),
    // Optimistic concurrency: the updatedAt the admin last saw.
    expectedUpdatedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== "expectedUpdatedAt"), "Provide at least one field to update");

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => (v === "" || v === "ALL" ? undefined : v), z.enum(values).optional());

export const adminTicketQuerySchema = z
  .object({
    status: z.preprocess(
      (v) => (v === "" || v === "ALL" ? undefined : v),
      z.enum([...STATUSES, "UNRESOLVED"] as const).optional(),
    ),
    category: optionalEnum(CATEGORIES),
    priority: optionalEnum(PRIORITIES),
    assignment: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["me", "unassigned", "assigned"]).optional()),
    from: z.preprocess((v) => (v === "" ? undefined : v), z.iso.date().optional()),
    to: z.preprocess((v) => (v === "" ? undefined : v), z.iso.date().optional()),
    q: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: "'from' must be on or before 'to'", path: ["from"] });

export const authorTicketQuerySchema = z.object({
  status: optionalEnum(STATUSES),
  q: z.string().trim().max(100).optional(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type AdminTicketPatch = z.infer<typeof adminTicketPatchSchema>;
export type AdminTicketQuery = z.infer<typeof adminTicketQuerySchema>;
