/**
 * The minimal, sanitised context the AI is allowed to see. Built explicitly
 * from whitelisted fields so passwords, emails, internal notes and other
 * authors' data can never leak into a prompt.
 */
export type BookFacts = {
  title: string;
  isbn: string;
  status: string;
  publicationDate: string | null;
  mrp: string | null;
  totalCopiesSold: number;
  totalRoyaltyEarned: string;
  royaltyPaid: string;
  royaltyPending: string;
  lastRoyaltyPayoutDate: string | null;
  printPartner: string | null;
  availableOn: string[];
};

export type TicketContext = {
  subject: string;
  description: string;
  authorFirstName: string;
  book: BookFacts | null;
  /** ISO date of "today" so the model can reason about elapsed time. */
  today: string;
};

export type ConversationTurn = { from: "author" | "bookleaf"; body: string };

const MAX_DESCRIPTION_CHARS = 3000;
const MAX_TURN_CHARS = 600;
export const MAX_TURNS = 4;

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}… [truncated]`;
}

/** Escape our delimiter tags so ticket text cannot close the untrusted block early. */
function neutralise(text: string): string {
  return text.replace(/<\/?(ticket|author_message|conversation|book_facts)[^>]*>/gi, "[tag removed]");
}

export function renderBookFacts(book: BookFacts | null): string {
  if (!book) return "No specific book selected (General / Account Level query).";
  const v = (x: string | null) => x ?? "not available";
  return [
    `Title: ${book.title}`,
    `ISBN: ${book.isbn}`,
    `Status: ${book.status}`,
    `Publication date: ${v(book.publicationDate)}`,
    `MRP: ${book.mrp ? `₹${book.mrp}` : "not set"}`,
    `Copies sold: ${book.totalCopiesSold}`,
    `Royalty earned: ₹${book.totalRoyaltyEarned} | paid: ₹${book.royaltyPaid} | pending: ₹${book.royaltyPending}`,
    `Last royalty payout: ${v(book.lastRoyaltyPayoutDate)}`,
    `Print partner: ${v(book.printPartner)}`,
    `Available on: ${book.availableOn.length ? book.availableOn.join(", ") : "not listed yet"}`,
  ].join("\n");
}

export function renderTicket(ctx: TicketContext): string {
  return [
    `<ticket>`,
    `Subject: ${neutralise(ctx.subject)}`,
    `Description:\n${neutralise(truncate(ctx.description, MAX_DESCRIPTION_CHARS))}`,
    `</ticket>`,
  ].join("\n");
}

export function renderConversation(turns: ConversationTurn[]): string {
  if (!turns.length) return "";
  const recent = turns.slice(-MAX_TURNS);
  return [
    "<conversation>",
    ...recent.map((t) => `[${t.from === "author" ? "Author" : "BookLeaf"}] ${neutralise(truncate(t.body, MAX_TURN_CHARS))}`),
    "</conversation>",
  ].join("\n");
}
