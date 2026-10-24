// Response types inferred from the server services (type-only imports are erased at build time).
import type {
  adminDashboard,
  getAdminTicket,
  getAuthorTicket,
  listAdminTickets,
  listAuthorBooks,
  listAuthorTickets,
  listNotes,
} from "@/server/tickets";

export type BooksResponse = Awaited<ReturnType<typeof listAuthorBooks>>;
export type Book = BooksResponse["books"][number];
export type AuthorTicketListItem = Awaited<ReturnType<typeof listAuthorTickets>>[number];
export type AuthorTicket = Awaited<ReturnType<typeof getAuthorTicket>>;
export type Message = NonNullable<AuthorTicket["messages"]>[number];
export type AdminTicketList = Awaited<ReturnType<typeof listAdminTickets>>;
export type AdminTicketSummary = AdminTicketList["data"][number];
export type AdminTicket = Awaited<ReturnType<typeof getAdminTicket>>;
export type Note = Awaited<ReturnType<typeof listNotes>>[number];
export type Dashboard = Awaited<ReturnType<typeof adminDashboard>>;
