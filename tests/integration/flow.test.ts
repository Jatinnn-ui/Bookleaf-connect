import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { loadSampleData, seed } from "../../prisma/seed-lib";
import {
  addAdminReply, addAuthorMessage, addNote, createTicket, generateDraft, getAuthorBook,
  getAuthorTicket, listAdminTickets, listAuthorBooks, updateAdminTicket,
} from "@/server/tickets";
import { classifyAs, failingLlm } from "../fake-llm";

const prisma = new PrismaClient();
const opts = { demoPassword: "Author@123", admin: { email: "admin@test.local", password: "Admin@123", name: "Test Admin" } };
let priya: string, sneha: string, adminId: string, priyaUser: string;

beforeAll(async () => {
  await seed(prisma, loadSampleData(), opts);
  const a = await prisma.author.findMany({ where: { externalAuthorId: { in: ["AUTH001", "AUTH007"] } } });
  priya = a.find((x) => x.externalAuthorId === "AUTH001")!.id;
  priyaUser = a.find((x) => x.externalAuthorId === "AUTH001")!.userId;
  sneha = a.find((x) => x.externalAuthorId === "AUTH007")!.id;
  adminId = (await prisma.user.findUniqueOrThrow({ where: { email: "admin@test.local" } })).id;
});
afterAll(() => prisma.$disconnect());

describe("seeding", () => {
  it("imports exactly 10 authors and 18 books and is idempotent", async () => {
    await seed(prisma, loadSampleData(), opts);
    expect(await prisma.author.count()).toBe(10);
    expect(await prisma.book.count()).toBe(18);
    expect(await prisma.user.count()).toBe(11);
  });
  it("preserves nulls, zeros and source royalty values", async () => {
    const bk13 = await prisma.book.findUniqueOrThrow({ where: { externalBookId: "BK013" } });
    expect(bk13).toMatchObject({ publicationDate: null, mrp: null, printPartner: null, availableOn: [], totalCopiesSold: 0 });
    const bk005 = await prisma.book.findUniqueOrThrow({ where: { externalBookId: "BK005" } });
    expect(bk005.royaltyPaid.toFixed(2)).toBe("0.00");
    expect(bk005.royaltyPending.toFixed(2)).toBe("2546.00");
    expect(await prisma.book.count({ where: { status: { startsWith: "In Production" } } })).toBe(2);
  });
});

describe("author scoping", () => {
  it("lists only own books and hides others", async () => {
    const own = await listAuthorBooks(priya);
    expect(own.books).toHaveLength(2);
    const snehaBook = (await listAuthorBooks(sneha)).books[0];
    await expect(getAuthorBook(priya, snehaBook.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("rejects tickets about another author's book", async () => {
    const snehaBook = (await listAuthorBooks(sneha)).books[0];
    await expect(createTicket(priya, { bookId: snehaBook.id, subject: "Hello there", description: "x".repeat(30) }, failingLlm()))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("ticket lifecycle", () => {
  it("creates a ticket even when the AI is down, marked FALLBACK", async () => {
    const t = await createTicket(priya, { subject: "Bio update", description: "Can I update my author bio please?" }, failingLlm("rate_limited"));
    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(row).toMatchObject({ classificationSource: "FALLBACK", aiClassificationStatus: "FAILED", bookId: null });
  });

  it("runs the full flow with AI classification, draft, override, notes and replies", async () => {
    const book = (await listAuthorBooks(priya)).books[0];
    const llm = classifyAs("ROYALTY_PAYMENTS", 82);
    const t = await createTicket(priya, { bookId: book.id, subject: "No royalty in 6 months", description: "I have not been paid any royalty for six months." }, llm);
    let row = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(row).toMatchObject({ classificationSource: "AI", category: "ROYALTY_PAYMENTS", priority: "CRITICAL", priorityScore: 82 });

    // Draft is cached: second call does not hit the model, and nothing is sent to the author.
    const d1 = await generateDraft(t.id, false, llm);
    const d2 = await generateDraft(t.id, false, llm);
    expect(d2.cached).toBe(true);
    expect(llm.calls.filter((c) => c.purpose === "draft")).toHaveLength(1);
    expect((await getAuthorTicket(priya, t.id)).messages).toHaveLength(0);

    await updateAdminTicket(adminId, t.id, { priority: "HIGH", category: "GENERAL_INQUIRY", assignee: "me" });
    row = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(row).toMatchObject({ classificationSource: "MANUAL", priority: "HIGH", priorityScore: 70, assignedAdminId: adminId });

    await addNote(adminId, t.id, "INTERNAL-ONLY check bank");
    await addAdminReply(adminId, t.id, `${d1.draft}\n(edited)`);
    const view = await getAuthorTicket(priya, t.id);
    expect(view.status).toBe("IN_PROGRESS");
    expect(view.messages?.[0].body).toContain("(edited)");
    expect(JSON.stringify(view)).not.toContain("INTERNAL-ONLY");
    await expect(getAuthorTicket(sneha, t.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await updateAdminTicket(adminId, t.id, { status: "RESOLVED" });
    await addAuthorMessage(priya, priyaUser, t.id, "Still not received.");
    expect((await getAuthorTicket(priya, t.id)).status).toBe("OPEN"); // follow-up reopens

    const q = await listAdminTickets(adminId, { status: "UNRESOLVED", assignment: "me", page: 1, pageSize: 20 });
    expect(q.data.map((x) => x.id)).toContain(t.id);
  });

  it("surfaces draft failure as AI_UNAVAILABLE without losing the ticket", async () => {
    const t = await createTicket(priya, { subject: "Printing issue", description: "My author copies have blurry images." }, failingLlm());
    await expect(generateDraft(t.id, false, failingLlm())).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(await prisma.ticket.count({ where: { id: t.id } })).toBe(1);
  });

  it("detects concurrent edits", async () => {
    const t = await createTicket(priya, { subject: "Listing missing", description: "My book shows unavailable on Amazon." }, failingLlm());
    await expect(updateAdminTicket(adminId, t.id, { status: "IN_PROGRESS", expectedUpdatedAt: "2020-01-01T00:00:00.000Z" }))
      .rejects.toMatchObject({ code: "CONFLICT" });
  });
});
