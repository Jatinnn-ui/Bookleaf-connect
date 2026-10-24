import { priorityFromScore, type Category, type Priority } from "@/lib/domain";

/**
 * Deterministic keyword classifier used ONLY when the AI call fails. Results are
 * stored with classificationSource = FALLBACK so admins know to review them.
 */
const RULES: { category: Category; pattern: RegExp }[] = [
  { category: "ISBN_METADATA", pattern: /\bisbn\b|metadata|wrong (book|author|title)|imprint|barcode/i },
  { category: "PRINTING_QUALITY", pattern: /print(ing)? quality|misprint|blurr?y|binding|smudg|torn|pages? (missing|misaligned)|defect|colou?r (issue|inconsisten)|reprint|author cop(y|ies)/i },
  { category: "DISTRIBUTION_AVAILABILITY", pattern: /unavailable|out of stock|not (showing|listed|available)|amazon|flipkart|listing|distribution/i },
  { category: "ROYALTY_PAYMENTS", pattern: /royalt|payout|payment|paid|bank|earning|₹|rs\.?\s?\d|invoice|statement/i },
  { category: "BOOK_STATUS_PRODUCTION", pattern: /typesett|proofread|cover design|production|manuscript|when will .* (publish|live|ready)|status of my book|delay/i },
];

const URGENT = /\b(months?|urgent|immediately|legal|lawyer|fraud|never received|still (not|haven'?t)|duplicate|wrong isbn|terrible|unacceptable)\b/i;
const MINOR = /\b(bio|update (my|the) (description|profile|photo)|how (do|can) i|question|curious|wondering)\b/i;

const BASE_SCORE: Record<Category, number> = {
  ISBN_METADATA: 68,
  PRINTING_QUALITY: 62,
  ROYALTY_PAYMENTS: 55,
  DISTRIBUTION_AVAILABILITY: 55,
  BOOK_STATUS_PRODUCTION: 45,
  GENERAL_INQUIRY: 25,
};

export function fallbackClassify(subject: string, description: string): {
  category: Category;
  priority: Priority;
  priorityScore: number;
  reason: string;
} {
  const text = `${subject}\n${description}`;
  const category = RULES.find((r) => r.pattern.test(text))?.category ?? "GENERAL_INQUIRY";
  let score = BASE_SCORE[category];
  if (URGENT.test(text)) score += 15;
  if (MINOR.test(text)) score -= 15;
  score = Math.max(0, Math.min(100, score));
  return {
    category,
    priorityScore: score,
    priority: priorityFromScore(score),
    reason: "Keyword-based fallback (AI unavailable). Please review.",
  };
}
