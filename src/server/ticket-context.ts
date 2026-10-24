import "server-only";
import type { Book } from "@prisma/client";
import type { ConversationTurn, TicketContext } from "@/lib/ai/context";
import { bookFacts } from "./serializers";

export function buildTicketContext(t: {
  subject: string;
  description: string;
  book: Book | null;
  author: { user: { name: string } };
}): TicketContext {
  return {
    subject: t.subject,
    description: t.description,
    authorFirstName: t.author.user.name.split(" ")[0] ?? t.author.user.name,
    book: t.book ? bookFacts(t.book) : null,
    today: new Date().toISOString().slice(0, 10),
  };
}

export function toConversation(messages: { body: string; sender: { role: "AUTHOR" | "ADMIN" } }[]): ConversationTurn[] {
  return messages.map((m) => ({ from: m.sender.role === "AUTHOR" ? "author" : "bookleaf", body: m.body }));
}
