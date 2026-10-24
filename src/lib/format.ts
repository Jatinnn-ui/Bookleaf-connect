const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** null means "not available"; "0.00" is a real zero and renders as ₹0. */
export function formatInr(v: string | null | undefined, missing = "Not available"): string {
  if (v === null || v === undefined) return missing;
  return inr.format(Number(v));
}

export function formatDate(v: string | null | undefined, missing = "Not available"): string {
  if (!v) return missing;
  const d = new Date(v.length === 10 ? `${v}T00:00:00Z` : v);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: v.length === 10 ? "UTC" : undefined });
}

export function formatDateTime(v: string): string {
  return new Date(v).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function timeAgo(v: string): string {
  const s = Math.max(0, (Date.now() - new Date(v).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
