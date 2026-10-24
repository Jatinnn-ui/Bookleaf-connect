"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client/api";
import { usePoll } from "@/lib/client/use-poll";
import type { AuthorTicketListItem } from "@/lib/client/types";
import { STATUSES, STATUS_LABELS } from "@/lib/domain";
import { formatDate, timeAgo } from "@/lib/format";
import { Button, Card, CategoryBadge, EmptyState, ErrorState, Loading, PageHeader, StatusBadge, cx, inputCls } from "@/components/ui";

export default function MyTicketsPage() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const qs = new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}) }).toString();
  const { data, error, loading, refresh } = usePoll(`tickets?${qs}`, () => api<{ data: AuthorTicketListItem[] }>(`/api/v1/author/tickets?${qs}`));

  return (
    <>
      <PageHeader title="My Tickets" subtitle="Updates appear here automatically." actions={<Link href="/author/tickets/new"><Button variant="primary">New query</Button></Link>} />
      <div className="mb-4 flex flex-wrap gap-3">
        <label htmlFor="tq" className="sr-only">Search</label>
        <input id="tq" className={cx(inputCls, "max-w-xs")} placeholder="Search subject or ticket number" value={q} onChange={(e) => setQ(e.target.value)} />
        <label htmlFor="ts" className="sr-only">Status</label>
        <select id="ts" className={cx(inputCls, "max-w-[12rem]")} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </div>
      {error ? (
        <ErrorState error={error} onRetry={refresh} />
      ) : loading && !data ? (
        <Loading label="Loading tickets" />
      ) : !data?.data.length ? (
        <Card>
          <EmptyState
            title={status || q ? "No tickets match" : "You haven't raised any tickets"}
            body={status || q ? undefined : "When you submit a query, you can follow its progress here."}
            action={!status && !q ? <Link href="/author/tickets/new"><Button variant="primary">Submit a query</Button></Link> : undefined}
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {data.data.map((t) => (
            <li key={t.id}>
              <Link href={`/author/tickets/${t.id}`} className="block rounded-lg border border-line bg-panel p-4 transition-colors hover:border-muted">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{t.subject}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {t.ticketNumber} · {t.book ? t.book.title : "General / Account Level"} · opened {formatDate(t.createdAt)} · updated {timeAgo(t.updatedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2"><CategoryBadge category={t.category} /><StatusBadge status={t.status} /></div>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-muted">{t.description}</p>
                {t.latestReply && (
                  <div className="mt-3 border-l-2 border-leaf pl-3 text-sm">
                    <span className="text-xs text-muted">Latest reply from BookLeaf · {timeAgo(t.latestReply.createdAt)}</span>
                    <p className="line-clamp-2">{t.latestReply.body}</p>
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
