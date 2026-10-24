/**
 * Domain constants shared by server and client. Kept free of Prisma imports so
 * client bundles stay small; values mirror the Prisma enums exactly.
 */

export const CATEGORIES = [
  "ROYALTY_PAYMENTS",
  "ISBN_METADATA",
  "PRINTING_QUALITY",
  "DISTRIBUTION_AVAILABILITY",
  "BOOK_STATUS_PRODUCTION",
  "GENERAL_INQUIRY",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Exact category labels from the assignment brief. */
export const CATEGORY_LABELS: Record<Category, string> = {
  ROYALTY_PAYMENTS: "Royalty & Payments",
  ISBN_METADATA: "ISBN & Metadata Issues",
  PRINTING_QUALITY: "Printing & Quality",
  DISTRIBUTION_AVAILABILITY: "Distribution & Availability",
  BOOK_STATUS_PRODUCTION: "Book Status & Production Updates",
  GENERAL_INQUIRY: "General Inquiry",
};

export const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: Record<Priority, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

export const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABELS: Record<Status, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

/**
 * Priority score bands (0-100). The score is the source of truth; the label is
 * always derived from it so the two can never disagree.
 *   80-100 Critical: money withheld for a long time, data errors on live books, legal risk
 *   60-79  High:     ISBN errors, confirmed defects, overdue payouts, unavailable live books
 *   35-59  Medium:   production delays, royalty clarification, listing questions
 *   0-34   Low:      informational requests, profile/bio/description updates
 */
export const PRIORITY_BANDS: { min: number; priority: Priority }[] = [
  { min: 80, priority: "CRITICAL" },
  { min: 60, priority: "HIGH" },
  { min: 35, priority: "MEDIUM" },
  { min: 0, priority: "LOW" },
];

export function priorityFromScore(score: number): Priority {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return PRIORITY_BANDS.find((b) => clamped >= b.min)!.priority;
}

/** Default score used when an admin overrides only the priority label. */
export const PRIORITY_DEFAULT_SCORE: Record<Priority, number> = {
  CRITICAL: 90,
  HIGH: 70,
  MEDIUM: 50,
  LOW: 20,
};

export const UNRESOLVED_STATUSES: Status[] = ["OPEN", "IN_PROGRESS"];

/**
 * Allowed status transitions. Closed tickets can only be reopened; everything
 * else may move freely so ops can correct mistakes.
 */
export function canTransition(from: Status, to: Status): boolean {
  if (from === to) return false;
  if (from === "CLOSED") return to === "OPEN";
  return true;
}
