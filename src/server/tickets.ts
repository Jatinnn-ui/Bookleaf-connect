import "server-only";
import { randomInt } from "node:crypto";
import { Prisma, type Ticket } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError, errors } from "@/lib/http";
import {
  canTransition,
  PRIORITY_DEFAULT_SCORE,
  priorityFromScore,
  type Status,
} from "@/lib/domain";
import type { AdminTicketPatch, AdminTicketQuery, CreateTicketInput } from "@/lib/validation";
import { classifyTicket } from "@/lib/ai/classify";
import { draftReply } from "@/lib/ai/draft";
import { fallbackClassify } from "@/lib/ai/fallback";
import { getLlm } from "@/lib/ai/gemini";
import { AiError, describeAiError, type LlmClient } from "@/lib/ai/llm";
import { buildTicketContext, toConversation } from "./ticket-context";
import { serializeAdminTicketSummary, serializeAuthorTicket, serializeBook, serializeMessage } from "./serializers";

const bookRef = { select: { id: true, title: true, isbn: true, status: true } } as const;
const senderRef = { select: { id: true, name: true, role: true } } as const;
const adminSummaryInclude = {
  book: bookRef,
  author: { select: { id: true, externalAuthorId: true, user: { select: { name: true, email: true } } } },
  assignedAdmin: { select: { id: true, name: true } },
  _count: { select: { messages: true } },
} satisfies Prisma.TicketInclude;

// Unambiguous characters for human-readable ticket numbers (no 0/O/1/I).
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function newTicketNumber() {
  let s = "";
  for (let i = 0; i < 6; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `BL-${s}`;
}

/* ------------------------------------------------------------------ */
/* Classification                                                      */
/* ------------------------------------------------------------------ */

/**
 * Run AI classification for a saved ticket. Never throws: on any AI failure the
 * ticket keeps its FALLBACK values and is marked FAILED so admins can retry.
 */
export async function runClassification(ticketId: string, llm: LlmClient = getLlm(), actorId?: string) {
  const t = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { book: true, author: { select: { user: { select: { name: true } } } } },
  });
  if (!t) throw errors.notFound("Ticket");
  try {
    const result = await classifyTicket(llm, buildTicketContext(t));
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.ticket.update({
        where: { id: ticketId },
        data: {
          category: result.category,
          priority: result.priority,
          priorityScore: result.priorityScore,
          aiClassificationReason: result.reason,
          classificationSource: "AI",
          aiClassificationStatus: "SUCCEEDED",
        },
      });
      await tx.ticketAuditLog.create({
        data: {
          ticketId,
          actorId: actorId ?? null,
          action: "AI_CLASSIFIED",
          fromValue: `${t.category}/${t.priority}`,
          toValue: `${result.category}/${result.priority} (${result.priorityScore})`,
        },
      });
      return { ok: true as const, ticket: updated };
    });
  } catch (err) {
    if (!(err instanceof AiError)) console.error("[ai] classification crashed", err);
    else console.warn(`[ai] classification failed (${err.kind}) for ${t.ticketNumber}`);
    const updated = await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        aiClassificationStatus: "FAILED",
        // Keep any manual values; otherwise explain the fallback.
        aiClassificationReason:
          t.classificationSource === "MANUAL" ? t.aiClassificationReason : `${describeAiError(err)} Using keyword fallback.`,
      },
    });
    return { ok: false as const, ticket: updated, error: describeAiError(err) };
  }
}

/* ------------------------------------------------------------------ */
/* Author operations (always scoped by the session's authorId)        */
/* ------------------------------------------------------------------ */

export async function listAuthorBooks(authorId: string) {
  const [books, totals] = await Promise.all([
    prisma.book.findMany({ where: { authorId }, orderBy: [{ publicationDate: { sort: "desc", nulls: "first" } }, { title: "asc" }] }),
    prisma.book.aggregate({
      where: { authorId },
      _sum: { totalRoyaltyEarned: true, royaltyPaid: true, royaltyPending: true, totalCopiesSold: true },
    }),
  ]);
  return {
    books: books.map(serializeBook),
    totals: {
      books: books.length,
      published: books.filter((b) => b.status === "Published & Live").length,
      inProduction: books.filter((b) => b.status !== "Published & Live").length,
      totalCopiesSold: totals._sum.totalCopiesSold ?? 0,
      totalRoyaltyEarned: (totals._sum.totalRoyaltyEarned ?? new Prisma.Decimal(0)).toFixed(2),
      royaltyPaid: (totals._sum.royaltyPaid ?? new Prisma.Decimal(0)).toFixed(2),
      royaltyPending: (totals._sum.royaltyPending ?? new Prisma.Decimal(0)).toFixed(2),
    },
  };
}

export async function getAuthorBook(authorId: string, bookId: string) {
  // Ownership is part of the query: another author's book is indistinguishable from a missing one.
  const book = await prisma.book.findFirst({ where: { id: bookId, authorId } });
  if (!book) throw errors.notFound("Book");
  return serializeBook(book);
}

export async function createTicket(authorId: string, input: CreateTicketInput, llm: LlmClient = getLlm()) {
  if (input.bookId) {
    const owned = await prisma.book.findFirst({ where: { id: input.bookId, authorId }, select: { id: true } });
    if (!owned) throw errors.validation("Selected book was not found on your account.", [{ path: "bookId", message: "Unknown book" }]);
  }

  // Provisional values so the ticket is valid even if the AI never answers.
  const provisional = fallbackClassify(input.subject, input.description);

  let ticket: Ticket | null = null;
  for (let attempt = 0; attempt < 5 && !ticket; attempt++) {
    try {
      ticket = await prisma.ticket.create({
        data: {
          ticketNumber: newTicketNumber(),
          authorId,
          bookId: input.bookId ?? null,
          subject: input.subject,
          description: input.description,
          attachmentName: input.attachmentName ?? null,
          category: provisional.category,
          priority: provisional.priority,
          priorityScore: provisional.priorityScore,
          classificationSource: "FALLBACK",
          aiClassificationStatus: "PENDING",
          aiClassificationReason: provisional.reason,
        },
      });
    } catch (e) {
      // Retry only on a ticket-number collision.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }
  if (!ticket) throw errors.conflict("Could not allocate a ticket number. Please retry.");

  // The ticket is already persisted; classification failure cannot lose it.
  await runClassification(ticket.id, llm);
  return getAuthorTicket(authorId, ticket.id);
}

export async function listAuthorTickets(authorId: string, query: { status?: Status; q?: string }) {
  const where: Prisma.TicketWhereInput = {
    authorId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.q
      ? {
          OR: [
            { subject: { contains: query.q, mode: "insensitive" } },
            { ticketNumber: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const tickets = await prisma.ticket.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      book: bookRef,
      // Only the latest public BookLeaf reply, for the list preview.
      messages: { where: { sender: { role: "ADMIN" } }, orderBy: { createdAt: "desc" }, take: 1, include: { sender: senderRef } },
    },
  });
  return tickets.map((t) => {
    const { messages, ...rest } = serializeAuthorTicket(t);
    return { ...rest, latestReply: messages?.[0] ?? null };
  });
}

export async function getAuthorTicket(authorId: string, ticketId: string) {
  const t = await prisma.ticket.findFirst({
    where: { id: ticketId, authorId },
    include: { book: bookRef, messages: { orderBy: { createdAt: "asc" }, include: { sender: senderRef } } },
  });
  if (!t) throw errors.notFound("Ticket");
  return serializeAuthorTicket(t);
}

export async function addAuthorMessage(authorId: string, userId: string, ticketId: string, body: string) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.ticket.findFirst({ where: { id: ticketId, authorId }, select: { id: true, status: true } });
    if (!t) throw errors.notFound("Ticket");
    if (t.status === "CLOSED") throw errors.conflict("This ticket is closed. Please raise a new ticket.");
    const msg = await tx.ticketMessage.create({ data: { ticketId, senderId: userId, body }, include: { sender: senderRef } });
    // A follow-up on a resolved ticket reopens it. Any cached draft is now stale.
    await tx.ticket.update({
      where: { id: ticketId },
      data: { aiDraft: null, aiDraftGeneratedAt: null, ...(t.status === "RESOLVED" ? { status: "OPEN", resolvedAt: null } : {}) },
    });
    if (t.status === "RESOLVED") {
      await tx.ticketAuditLog.create({ data: { ticketId, actorId: userId, action: "STATUS_CHANGED", fromValue: "RESOLVED", toValue: "OPEN" } });
    }
    return serializeMessage(msg);
  });
}

/* ------------------------------------------------------------------ */
/* Admin operations                                                    */
/* ------------------------------------------------------------------ */

/**
 * Default ordering surfaces what needs attention first:
 *   1. status (OPEN, IN_PROGRESS, RESOLVED, CLOSED - unresolved first)
 *   2. priorityScore descending (Critical first)
 *   3. createdAt ascending (oldest waiting first)
 */
export async function listAdminTickets(adminId: string, q: AdminTicketQuery) {
  const and: Prisma.TicketWhereInput[] = [];
  if (q.status === "UNRESOLVED") and.push({ status: { in: ["OPEN", "IN_PROGRESS"] } });
  else if (q.status) and.push({ status: q.status });
  if (q.category) and.push({ category: q.category });
  if (q.priority) and.push({ priority: q.priority });
  if (q.assignment === "me") and.push({ assignedAdminId: adminId });
  if (q.assignment === "unassigned") and.push({ assignedAdminId: null });
  if (q.assignment === "assigned") and.push({ assignedAdminId: { not: null } });
  if (q.from) and.push({ createdAt: { gte: new Date(`${q.from}T00:00:00.000Z`) } });
  if (q.to) and.push({ createdAt: { lte: new Date(`${q.to}T23:59:59.999Z`) } });
  if (q.q) {
    and.push({
      OR: [
        { ticketNumber: { contains: q.q, mode: "insensitive" } },
        { subject: { contains: q.q, mode: "insensitive" } },
        { author: { user: { name: { contains: q.q, mode: "insensitive" } } } },
        { author: { user: { email: { contains: q.q, mode: "insensitive" } } } },
      ],
    });
  }
  const where: Prisma.TicketWhereInput = and.length ? { AND: and } : {};
  const [total, rows] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      orderBy: [{ status: "asc" }, { priorityScore: "desc" }, { createdAt: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: adminSummaryInclude,
    }),
  ]);
  return {
    data: rows.map(serializeAdminTicketSummary),
    pagination: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) },
  };
}

export async function getAdminTicket(ticketId: string) {
  const t = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      ...adminSummaryInclude,
      book: true,
      author: {
        select: {
          id: true,
          externalAuthorId: true,
          city: true,
          joinedDate: true,
          user: { select: { name: true, email: true } },
          _count: { select: { books: true, tickets: true } },
        },
      },
      messages: { orderBy: { createdAt: "asc" }, include: { sender: senderRef } },
      auditLogs: { orderBy: { createdAt: "desc" }, take: 30, include: { actor: { select: { name: true } } } },
    },
  });
  if (!t) throw errors.notFound("Ticket");
  return {
    ...serializeAdminTicketSummary({ ...t, book: t.book }),
    description: t.description,
    attachmentName: t.attachmentName,
    aiClassificationReason: t.aiClassificationReason,
    aiDraft: t.aiDraft,
    aiDraftGeneratedAt: t.aiDraftGeneratedAt?.toISOString() ?? null,
    aiDraftError: t.aiDraftError,
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
    closedAt: t.closedAt?.toISOString() ?? null,
    author: {
      id: t.author.id,
      externalAuthorId: t.author.externalAuthorId,
      name: t.author.user.name,
      email: t.author.user.email,
      city: t.author.city,
      joinedDate: t.author.joinedDate.toISOString().slice(0, 10),
      bookCount: t.author._count.books,
      ticketCount: t.author._count.tickets,
    },
    bookDetails: t.book ? serializeBook(t.book) : null,
    messages: t.messages.map(serializeMessage),
    auditLog: t.auditLogs.map((a) => ({
      id: a.id,
      action: a.action,
      fromValue: a.fromValue,
      toValue: a.toValue,
      actor: a.actor?.name ?? "System",
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

function statusTimestamps(to: Status): Prisma.TicketUncheckedUpdateManyInput {
  const now = new Date();
  if (to === "RESOLVED") return { resolvedAt: now, closedAt: null };
  if (to === "CLOSED") return { closedAt: now };
  return { resolvedAt: null, closedAt: null };
}

export async function updateAdminTicket(adminId: string, ticketId: string, patch: AdminTicketPatch) {
  await prisma.$transaction(async (tx) => {
    const t = await tx.ticket.findUnique({ where: { id: ticketId } });
    if (!t) throw errors.notFound("Ticket");
    if (patch.expectedUpdatedAt && new Date(patch.expectedUpdatedAt).getTime() !== t.updatedAt.getTime()) {
      throw errors.conflict("This ticket was updated by someone else. Reload to see the latest version.");
    }

    const data: Prisma.TicketUncheckedUpdateManyInput = {};
    const audit: { action: string; fromValue: string | null; toValue: string | null }[] = [];

    if (patch.status && patch.status !== t.status) {
      if (!canTransition(t.status, patch.status)) {
        throw errors.validation(`Cannot change status from ${t.status} to ${patch.status}.`);
      }
      Object.assign(data, { status: patch.status }, statusTimestamps(patch.status));
      audit.push({ action: "STATUS_CHANGED", fromValue: t.status, toValue: patch.status });
    }
    if (patch.category && patch.category !== t.category) {
      data.category = patch.category;
      data.classificationSource = "MANUAL";
      audit.push({ action: "CATEGORY_OVERRIDDEN", fromValue: t.category, toValue: patch.category });
    }
    if (patch.priority || patch.priorityScore !== undefined) {
      const score =
        patch.priorityScore ?? (patch.priority && patch.priority !== t.priority ? PRIORITY_DEFAULT_SCORE[patch.priority] : t.priorityScore);
      const priority = patch.priorityScore !== undefined ? priorityFromScore(score) : (patch.priority ?? t.priority);
      if (patch.priority && patch.priorityScore !== undefined && priorityFromScore(patch.priorityScore) !== patch.priority) {
        throw errors.validation("priorityScore does not fall in the band for the given priority.");
      }
      if (priority !== t.priority || score !== t.priorityScore) {
        data.priority = priority;
        data.priorityScore = score;
        data.classificationSource = "MANUAL";
        audit.push({ action: "PRIORITY_OVERRIDDEN", fromValue: `${t.priority} (${t.priorityScore})`, toValue: `${priority} (${score})` });
      }
    }
    if (patch.assignee !== undefined) {
      const next = patch.assignee === "me" ? adminId : null;
      if (next !== t.assignedAdminId) {
        data.assignedAdminId = next;
        audit.push({ action: next ? "ASSIGNED" : "UNASSIGNED", fromValue: t.assignedAdminId, toValue: next });
      }
    }
    if (!audit.length) return;

    // updateMany with updatedAt in the filter guards against a concurrent write between read and update.
    const res = await tx.ticket.updateMany({ where: { id: ticketId, updatedAt: t.updatedAt }, data });
    if (res.count === 0) throw errors.conflict("This ticket was updated by someone else. Reload and try again.");
    await tx.ticketAuditLog.createMany({ data: audit.map((a) => ({ ...a, ticketId, actorId: adminId })) });
  });
  return getAdminTicket(ticketId);
}

export async function addAdminReply(adminId: string, ticketId: string, body: string, status?: Status) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.ticket.findUnique({ where: { id: ticketId }, select: { id: true, status: true, assignedAdminId: true } });
    if (!t) throw errors.notFound("Ticket");
    if (t.status === "CLOSED") throw errors.conflict("Reopen this ticket before replying.");
    // Replying moves a fresh ticket into progress by default; admins may resolve in the same step.
    const nextStatus: Status = status ?? (t.status === "OPEN" ? "IN_PROGRESS" : t.status);
    if (nextStatus !== t.status && !canTransition(t.status, nextStatus)) {
      throw errors.validation(`Cannot change status from ${t.status} to ${nextStatus}.`);
    }
    const msg = await tx.ticketMessage.create({ data: { ticketId, senderId: adminId, body }, include: { sender: senderRef } });
    await tx.ticket.update({
      where: { id: ticketId },
      data: {
        aiDraft: null,
        aiDraftGeneratedAt: null,
        aiDraftError: null,
        ...(t.assignedAdminId ? {} : { assignedAdminId: adminId }),
        ...(nextStatus !== t.status ? { status: nextStatus, ...statusTimestamps(nextStatus) } : {}),
      } as Prisma.TicketUncheckedUpdateInput,
    });
    if (nextStatus !== t.status) {
      await tx.ticketAuditLog.create({ data: { ticketId, actorId: adminId, action: "STATUS_CHANGED", fromValue: t.status, toValue: nextStatus } });
    }
    return serializeMessage(msg);
  });
}

export async function listNotes(ticketId: string) {
  const exists = await prisma.ticket.count({ where: { id: ticketId } });
  if (!exists) throw errors.notFound("Ticket");
  const notes = await prisma.internalNote.findMany({
    where: { ticketId },
    orderBy: { createdAt: "asc" },
    include: { admin: { select: { id: true, name: true } } },
  });
  return notes.map((n) => ({ id: n.id, body: n.body, admin: n.admin, createdAt: n.createdAt.toISOString() }));
}

export async function addNote(adminId: string, ticketId: string, body: string) {
  const exists = await prisma.ticket.count({ where: { id: ticketId } });
  if (!exists) throw errors.notFound("Ticket");
  const n = await prisma.internalNote.create({ data: { ticketId, adminId, body }, include: { admin: { select: { id: true, name: true } } } });
  return { id: n.id, body: n.body, admin: n.admin, createdAt: n.createdAt.toISOString() };
}

/**
 * Return the cached draft, or generate one. `force` regenerates. Drafts are
 * cached on the ticket so page reloads and polling never re-bill the model.
 */
export async function generateDraft(ticketId: string, force: boolean, llm: LlmClient = getLlm()) {
  const t = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      book: true,
      author: { select: { user: { select: { name: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 4, include: { sender: { select: { role: true } } } },
    },
  });
  if (!t) throw errors.notFound("Ticket");
  if (t.aiDraft && !force) {
    return { draft: t.aiDraft, generatedAt: t.aiDraftGeneratedAt!.toISOString(), cached: true };
  }
  try {
    const draft = await draftReply(llm, buildTicketContext(t), t.category, toConversation([...t.messages].reverse()));
    const saved = await prisma.ticket.update({
      where: { id: ticketId },
      data: { aiDraft: draft, aiDraftGeneratedAt: new Date(), aiDraftError: null },
    });
    return { draft, generatedAt: saved.aiDraftGeneratedAt!.toISOString(), cached: false };
  } catch (err) {
    if (!(err instanceof AiError)) console.error("[ai] draft crashed", err);
    const message = describeAiError(err);
    await prisma.ticket.update({ where: { id: ticketId }, data: { aiDraftError: message } });
    throw new ApiError(
      err instanceof AiError && err.kind === "rate_limited" ? "RATE_LIMITED" : "AI_UNAVAILABLE",
      `${message} You can write the reply manually.`,
    );
  }
}

export async function adminDashboard() {
  const unresolved = { status: { in: ["OPEN", "IN_PROGRESS"] as Status[] } };
  const [open, inProgress, critical, high, unassigned, byCategory, byStatus, oldest, recent, aiFailed] = await Promise.all([
    prisma.ticket.count({ where: { status: "OPEN" } }),
    prisma.ticket.count({ where: { status: "IN_PROGRESS" } }),
    prisma.ticket.count({ where: { ...unresolved, priority: "CRITICAL" } }),
    prisma.ticket.count({ where: { ...unresolved, priority: "HIGH" } }),
    prisma.ticket.count({ where: { ...unresolved, assignedAdminId: null } }),
    prisma.ticket.groupBy({ by: ["category"], where: unresolved, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.ticket.findMany({ where: unresolved, orderBy: { createdAt: "asc" }, take: 5, include: adminSummaryInclude }),
    prisma.ticket.findMany({ orderBy: { updatedAt: "desc" }, take: 5, include: adminSummaryInclude }),
    prisma.ticket.count({ where: { ...unresolved, aiClassificationStatus: "FAILED" } }),
  ]);
  return {
    counts: { open, inProgress, critical, high, unassigned, aiFailed },
    byCategory: byCategory.map((c) => ({ category: c.category, count: c._count._all })),
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
    oldestUnresolved: oldest.map(serializeAdminTicketSummary),
    recentlyUpdated: recent.map(serializeAdminTicketSummary),
  };
}
