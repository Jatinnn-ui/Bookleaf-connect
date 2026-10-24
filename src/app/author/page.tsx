"use client";
import Link from "next/link";
import { api } from "@/lib/client/api";
import { usePoll } from "@/lib/client/use-poll";
import type { AuthorTicketListItem, BooksResponse } from "@/lib/client/types";
import { formatDate, formatInr, timeAgo } from "@/lib/format";
import { Button, Card, EmptyState, ErrorState, Loading, PageHeader, Stat, StatusBadge } from "@/components/ui";

export default function AuthorDashboard() {
  const books = usePoll("books", () => api<BooksResponse>("/api/v1/author/books"), 0);
  const tickets = usePoll("tickets", () => api<{ data: AuthorTicketListItem[] }>("/api/v1/author/tickets"), 10000);

  if (books.error) return <ErrorState error={books.error} onRetry={books.refresh} />;
  if (books.loading || !books.data) return <Loading label="Loading your dashboard" />;
  const t = books.data.totals;
  const active = tickets.data?.data.filter((x) => x.status === "OPEN" || x.status === "IN_PROGRESS").length ?? 0;

  return (
    <>
      <PageHeader title="Welcome back" subtitle="Your books, royalties and support requests at a glance." actions={<Link href="/author/tickets/new"><Button variant="primary">Submit a query</Button></Link>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Books" value={t.books} hint={`${t.published} published · ${t.inProduction} in production`} />
        <Stat label="Royalty earned" value={formatInr(t.totalRoyaltyEarned)} hint={`${t.totalCopiesSold.toLocaleString("en-IN")} copies sold`} />
        <Stat label="Royalty paid" value={formatInr(t.royaltyPaid)} />
        <Stat label="Royalty pending" value={formatInr(t.royaltyPending)} hint="Paid quarterly, min. ₹1,000 payout" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-medium">Your books</h2>
            <Link href="/author/books" className="text-sm text-leaf hover:underline">View all</Link>
          </div>
          {books.data.books.length === 0 ? (
            <EmptyState title="No books yet" body="Books will appear here once your manuscript is received." />
          ) : (
            <ul className="divide-y divide-line">
              {books.data.books.slice(0, 5).map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{b.title}</p>
                    <p className="text-xs text-muted">{b.status}</p>
                  </div>
                  <p className="shrink-0 text-right text-sm tabular-nums">
                    {b.isPublished ? formatInr(b.royaltyPending) : <span className="text-muted">Not yet published</span>}
                    {b.isPublished && <span className="block text-xs text-muted">pending</span>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-medium">Support tickets <span className="text-sm text-muted">· {active} active</span></h2>
            <Link href="/author/tickets" className="text-sm text-leaf hover:underline">View all</Link>
          </div>
          {tickets.loading && !tickets.data ? (
            <Loading />
          ) : !tickets.data?.data.length ? (
            <EmptyState title="No tickets yet" body="Have a question about royalties, ISBNs, printing or your book's status? We're here to help." />
          ) : (
            <ul className="divide-y divide-line">
              {tickets.data.data.slice(0, 5).map((x) => (
                <li key={x.id}>
                  <Link href={`/author/tickets/${x.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-panel-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{x.subject}</p>
                      <p className="text-xs text-muted">{x.ticketNumber} · updated {timeAgo(x.updatedAt)}</p>
                    </div>
                    <StatusBadge status={x.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <p className="mt-6 text-xs text-muted">Last royalty figures reflect BookLeaf records as of {formatDate(new Date().toISOString())}.</p>
    </>
  );
}
