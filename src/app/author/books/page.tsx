"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client/api";
import { usePoll } from "@/lib/client/use-poll";
import type { BooksResponse } from "@/lib/client/types";
import { formatDate, formatInr } from "@/lib/format";
import { Button, Card, EmptyState, ErrorState, Loading, PageHeader, cx, inputCls } from "@/components/ui";

export default function BooksPage() {
  const { data, error, loading, refresh } = usePoll("books", () => api<BooksResponse>("/api/v1/author/books"), 0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");

  const statuses = useMemo(() => [...new Set(data?.books.map((b) => b.status) ?? [])], [data]);
  const books = useMemo(
    () =>
      (data?.books ?? []).filter(
        (b) =>
          (status === "ALL" || b.status === status) &&
          (!q || b.title.toLowerCase().includes(q.toLowerCase()) || b.isbn.toLowerCase().includes(q.toLowerCase())),
      ),
    [data, q, status],
  );

  if (error) return <ErrorState error={error} onRetry={refresh} />;
  if (loading || !data) return <Loading label="Loading your books" />;

  return (
    <>
      <PageHeader title="My Books" subtitle="Sales and royalty figures from BookLeaf records." />
      <div className="mb-4 flex flex-wrap gap-3">
        <label className="sr-only" htmlFor="book-q">Search books</label>
        <input id="book-q" className={cx(inputCls, "max-w-xs")} placeholder="Search title or ISBN" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="sr-only" htmlFor="book-status">Filter by status</label>
        <select id="book-status" className={cx(inputCls, "max-w-xs")} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ALL">All statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {books.length === 0 ? (
        <Card><EmptyState title={data.books.length ? "No books match your filters" : "No books on your account yet"} /></Card>
      ) : (
        <div className="space-y-4">
          {books.map((b) => (
            <Card key={b.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-serif text-lg">{b.title}</h2>
                  <p className="mt-0.5 text-sm text-muted">{b.genre} · ISBN <span className="font-mono">{b.isbn}</span></p>
                </div>
                <span className={cx("rounded-full border px-2.5 py-0.5 text-xs", b.isPublished ? "border-leaf text-green-200" : "border-amber-700 text-amber-200")}>
                  {b.isPublished ? "● " : "◐ "}{b.status}
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
                <Item k="Published" v={formatDate(b.publicationDate, "Not yet published")} />
                <Item k="MRP" v={formatInr(b.mrp, "Not yet set")} />
                <Item k="Copies sold" v={b.totalCopiesSold.toLocaleString("en-IN")} />
                <Item k="Royalty earned" v={formatInr(b.totalRoyaltyEarned)} />
                <Item k="Royalty paid" v={formatInr(b.royaltyPaid)} />
                <Item k="Royalty pending" v={formatInr(b.royaltyPending)} strong={Number(b.royaltyPending) > 0} />
                <Item k="Last payout" v={formatDate(b.lastRoyaltyPayoutDate, b.isPublished ? "No payout yet" : "Not applicable")} />
                <Item k="Royalty / copy" v={formatInr(b.authorRoyaltyPerCopy, "Not yet set")} />
                <Item k="Print partner" v={b.printPartner ?? "Not yet assigned"} />
                <div className="col-span-2 sm:col-span-3">
                  <dt className="text-xs text-muted">Available on</dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {b.availableOn.length ? b.availableOn.map((p) => <span key={p} className="rounded bg-panel-2 px-1.5 py-0.5 text-xs">{p}</span>) : <span className="text-muted">Not listed yet</span>}
                  </dd>
                </div>
              </dl>
              {b.isPublished && Number(b.royaltyPending) > 0 && Number(b.royaltyPending) < 1000 && (
                <p className="mt-3 text-xs text-muted">Pending royalty is below the ₹1,000 payout threshold and rolls over to the next quarter.</p>
              )}
              <div className="mt-4">
                <Link href={`/author/tickets/new?bookId=${b.id}`}><Button>Ask about this book</Button></Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function Item({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{k}</dt>
      <dd className={cx("mt-0.5 tabular-nums", strong && "font-semibold text-leaf")}>{v}</dd>
    </div>
  );
}
