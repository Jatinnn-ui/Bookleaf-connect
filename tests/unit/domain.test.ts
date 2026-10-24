import { describe, expect, it } from "vitest";
import { canTransition, priorityFromScore } from "@/lib/domain";
import { adminTicketPatchSchema, adminTicketQuerySchema, createTicketSchema } from "@/lib/validation";
import { formatInr } from "@/lib/format";

describe("priority bands", () => {
  it.each([
    [100, "CRITICAL"], [80, "CRITICAL"], [79, "HIGH"], [60, "HIGH"], [59, "MEDIUM"], [35, "MEDIUM"], [34, "LOW"], [0, "LOW"],
  ])("score %i -> %s", (score, p) => expect(priorityFromScore(score)).toBe(p));
});

describe("status transitions", () => {
  it("closed tickets can only be reopened", () => {
    expect(canTransition("CLOSED", "OPEN")).toBe(true);
    expect(canTransition("CLOSED", "RESOLVED")).toBe(false);
    expect(canTransition("OPEN", "OPEN")).toBe(false);
    expect(canTransition("RESOLVED", "IN_PROGRESS")).toBe(true);
  });
});

describe("validation", () => {
  it("strips unknown fields such as authorId from ticket creation", () => {
    const v = createTicketSchema.parse({ subject: "Hello world", description: "x".repeat(25), authorId: "someone-else" });
    expect(v).not.toHaveProperty("authorId");
  });
  it("rejects short descriptions", () => {
    expect(createTicketSchema.safeParse({ subject: "Hello world", description: "short" }).success).toBe(false);
  });
  it("only allows self-assignment", () => {
    expect(adminTicketPatchSchema.safeParse({ assignee: "another-admin-id" }).success).toBe(false);
    expect(adminTicketPatchSchema.safeParse({ assignee: "me" }).success).toBe(true);
    expect(adminTicketPatchSchema.safeParse({}).success).toBe(false);
  });
  it("validates query params", () => {
    expect(adminTicketQuerySchema.safeParse({ pageSize: "500" }).success).toBe(false);
    expect(adminTicketQuerySchema.safeParse({ from: "2026-02-01", to: "2026-01-01" }).success).toBe(false);
    expect(adminTicketQuerySchema.parse({ status: "", category: "ALL" })).toMatchObject({ page: 1, pageSize: 20 });
  });
});

describe("currency formatting", () => {
  it("distinguishes real zero from missing", () => {
    expect(formatInr("0.00")).toBe("₹0");
    expect(formatInr(null)).toBe("Not available");
    expect(formatInr("11970.00")).toBe("₹11,970");
  });
});
