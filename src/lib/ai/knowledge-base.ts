import type { Category } from "@/lib/domain";

/**
 * BookLeaf Knowledge Base: the single source of policy text sent to the model.
 * Sections are small and independent so we can send only what a ticket needs.
 * Content is taken verbatim in substance from the assignment brief; do not add
 * policies here that BookLeaf has not stated.
 */
export const KB_VERSION = "2026-10-21.1";

export type KbSectionId =
  | "company"
  | "royalty"
  | "isbn"
  | "printing"
  | "distribution"
  | "production"
  | "metadataUpdates";

export const KB_SECTIONS: Record<KbSectionId, { title: string; body: string }> = {
  company: {
    title: "Company overview",
    body: [
      "- BookLeaf Publishing is a self-publishing company operating in India and the US.",
      "- Packages: Standard Free (no upfront cost) and Bestseller Breakthrough (premium, paid, with marketing and distribution add-ons).",
      "- BookLeaf handles cover design, typesetting, ISBN assignment, printing, distribution and royalty management.",
      "- In-house printing facility and warehouse in Delhi. Print partners: Repro India and Epitome Books.",
    ].join("\n"),
  },
  royalty: {
    title: "Royalty policy",
    body: [
      "- Split: 80% of net profit per book to the author, 20% to BookLeaf.",
      "- Net profit = MRP minus printing cost, platform commission (Amazon/Flipkart) and shipping charges.",
      "- Royalties are calculated quarterly and paid within 45 days of the quarter ending.",
      "- Minimum payout threshold is ₹1,000. Accumulated royalties below this roll over to the next quarter.",
      "- Payouts go by bank transfer to the account linked in the author's dashboard.",
      "- Authors can view a detailed royalty breakdown in their dashboard with sales per platform; the team can also share a line-by-line breakdown.",
      "- If a payment is genuinely overdue, escalate and commit to a 48-hour resolution timeline.",
    ].join("\n"),
  },
  isbn: {
    title: "ISBN policy",
    body: [
      "- Every book published through BookLeaf receives a unique ISBN assigned by BookLeaf, registered under BookLeaf's publisher imprint.",
      "- Authors wanting an ISBN under their own imprint must obtain it independently.",
      "- Reported ISBN errors (duplicate, wrong book linked, mismatch between platform and physical copy) are high priority and escalated to the production team, with a 48-hour resolution timeline.",
    ].join("\n"),
  },
  printing: {
    title: "Printing & quality",
    body: [
      "- In-house printing handles most orders; overflow or specific formats go to Repro India or Epitome Books.",
      "- Standard print turnaround: 5-7 business days from order confirmation.",
      "- For quality issues (misprints, binding defects, colour inconsistency) BookLeaf arranges a free reprint after verification. The author may need to share photos of the defective copy. Reprint timeline: 5-7 business days.",
    ].join("\n"),
  },
  distribution: {
    title: "Distribution & availability",
    body: [
      "- Books are listed on Amazon India, Flipkart, Amazon US, Amazon UK and the BookLeaf Store.",
      "- New listings typically go live within 7-10 business days after publication is complete.",
      "- A book showing as unavailable usually indicates a stock sync issue; the team can trigger a re-sync, which takes 24-48 hours to reflect.",
    ].join("\n"),
  },
  production: {
    title: "Production stages",
    body: [
      "- Stages: Manuscript Received -> Editing (if opted) -> Cover Design -> Typesetting -> Proofreading -> ISBN Assignment -> Printing -> Distribution Setup -> Published & Live.",
      "- Authors are updated at each stage via email.",
      "- Delays typically happen at Cover Design (waiting for author approval) and Proofreading (revision rounds). Frame delays collaboratively; never blame the author.",
    ].join("\n"),
  },
  metadataUpdates: {
    title: "Metadata updates",
    body: [
      "- Book descriptions and other metadata can be updated after a book is live, through the dashboard or by emailing the BookLeaf team.",
      "- Changes typically reflect on platforms within 3-5 business days.",
    ].join("\n"),
  },
};

export const TONE_GUIDELINES = [
  "- Empathetic and professional. Authors are partners, not customers to be managed.",
  "- Acknowledge the author's concern before moving to solutions.",
  "- Be specific: use the actual numbers, dates and statuses provided in BOOK FACTS rather than vague reassurance.",
  "- If something is BookLeaf's fault (delayed royalties, ISBN error), own it directly. No corporate deflection.",
  "- If escalation or investigation is needed, give a clear timeline from the policy rather than open-ended promises.",
  "- Always end with a clear next step for the author and/or the BookLeaf team.",
].join("\n");

/** Which sections each category needs. Company overview is cheap and gives grounding. */
const CATEGORY_SECTIONS: Record<Category, KbSectionId[]> = {
  ROYALTY_PAYMENTS: ["royalty"],
  ISBN_METADATA: ["isbn", "metadataUpdates"],
  PRINTING_QUALITY: ["printing"],
  DISTRIBUTION_AVAILABILITY: ["distribution"],
  BOOK_STATUS_PRODUCTION: ["production", "distribution"],
  GENERAL_INQUIRY: ["company", "metadataUpdates"],
};

export function selectKnowledge(category: Category): KbSectionId[] {
  return CATEGORY_SECTIONS[category];
}

export function renderKnowledge(ids: KbSectionId[]): string {
  return ids.map((id) => `### ${KB_SECTIONS[id].title}\n${KB_SECTIONS[id].body}`).join("\n\n");
}
