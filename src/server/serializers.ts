import "server-only";
import type { Book, Prisma, Ticket } from "@prisma/client";
import type { BookFacts } from "@/lib/ai/context";

/**
 * Explicit DTOs. Nothing is returned to a client by spreading a Prisma row,
 * which makes it impossible to leak a new column (or internal notes) by accident.
 */
const money = (d: Prisma.Decimal | null) => (d === null ? null : d.toFixed(2));
const date = (d: Date | null) => (d === null ? null : d.toISOString().slice(0, 10));

export function serializeBook(b: Book) {
  return {
    id: b.id,
    externalBookId: b.externalBookId,
    title: b.title,
    isbn: b.isbn,
    genre: b.genre,
    publicationDate: date(b.publicationDate),
    status: b.status,
    isPublished: b.status === "Published & Live",
    mrp: money(b.mrp),
    authorRoyaltyPerCopy: money(b.authorRoyaltyPerCopy),
    totalCopiesSold: b.totalCopiesSold,
    totalRoyaltyEarned: money(b.totalRoyaltyEarned)!,
    royaltyPaid: money(b.royaltyPaid)!,
    royaltyPending: money(b.royaltyPending)!,
    lastRoyaltyPayoutDate: date(b.lastRoyaltyPayoutDate),
    printPartner: b.printPartner,
    availableOn: b.availableOn,
  };
}
export type BookDto = ReturnType<typeof serializeBook>;

export function bookFacts(b: Book): BookFacts {
  const s = serializeBook(b);
  return {
    title: s.title,
    isbn: s.isbn,
    status: s.status,
    publicationDate: s.publicationDate,
    mrp: s.mrp,
    totalCopiesSold: s.totalCopiesSold,
    totalRoyaltyEarned: s.totalRoyaltyEarned,
    royaltyPaid: s.royaltyPaid,
    royaltyPending: s.royaltyPending,
    lastRoyaltyPayoutDate: s.lastRoyaltyPayoutDate,
    printPartner: s.printPartner,
    availableOn: s.availableOn,
  };
}

type MessageRow = { id: string; body: string; createdAt: Date; sender: { id: string; name: string; role: "AUTHOR" | "ADMIN" } };

export function serializeMessage(m: MessageRow) {
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    sender: { id: m.sender.id, name: m.sender.role === "ADMIN" ? `${m.sender.name} (BookLeaf Support)` : m.sender.name, role: m.sender.role },
  };
}

type BookRef = { id: string; title: string; isbn: string; status: string } | null;

/** Author-facing ticket: no AI internals, no notes, no assignee details. */
export function serializeAuthorTicket(t: Ticket & { book: BookRef; messages?: MessageRow[]; _count?: { messages: number } }) {
  return {
    id: t.id,
    ticketNumber: t.ticketNumber,
    subject: t.subject,
    description: t.description,
    status: t.status,
    category: t.category,
    priority: t.priority,
    attachmentName: t.attachmentName,
    book: t.book ? { id: t.book.id, title: t.book.title, isbn: t.book.isbn, status: t.book.status } : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
    closedAt: t.closedAt?.toISOString() ?? null,
    messages: t.messages?.map(serializeMessage),
  };
}

type AdminTicketRow = Ticket & {
  book: BookRef;
  author: { id: string; externalAuthorId: string; user: { name: string; email: string } };
  assignedAdmin: { id: string; name: string } | null;
  _count?: { messages: number };
};

export function serializeAdminTicketSummary(t: AdminTicketRow) {
  return {
    id: t.id,
    ticketNumber: t.ticketNumber,
    subject: t.subject,
    status: t.status,
    category: t.category,
    priority: t.priority,
    priorityScore: t.priorityScore,
    classificationSource: t.classificationSource,
    aiClassificationStatus: t.aiClassificationStatus,
    author: { id: t.author.id, externalAuthorId: t.author.externalAuthorId, name: t.author.user.name, email: t.author.user.email },
    book: t.book ? { id: t.book.id, title: t.book.title, isbn: t.book.isbn, status: t.book.status } : null,
    assignedAdmin: t.assignedAdmin,
    messageCount: t._count?.messages ?? 0,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
