"use client";
import Link from "next/link";
import { api } from "@/lib/client/api";
import { usePoll } from "@/lib/client/use-poll";
import type { AdminTicketSummary, Dashboard } from "@/lib/client/types";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/domain";
import { timeAgo } from "@/lib/format";
import { Card, EmptyState, ErrorState, Loading, PageHeader, PriorityBadge, Stat, StatusBadge } from "@/components/ui";

export default function AdminDashboard() {
  const { data, error, loading, refresh } = usePoll("dashboard", () => api<Dashboard>("/api/v1/admin/dashboard"), 10000);
  if (error && !data) return <ErrorState error={error} onRetry={refresh} />;
  if (loading || !data) return <Loading label="Loading dashboard" />;
  const c = data.counts;
  const link = (qs: string, v: React.ReactNode) => <Link href={`/admin/tickets?${qs}`} className="hover:text-leaf">{v}</Link>;

  return (
    <>
      <PageHeader title="Operations dashboard" subtitle="Live counts from the support queue. Refreshes every 10 seconds." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Open" value={link("status=OPEN", c.open)} />
        <Stat label="In progress" value={link("status=IN_PROGRESS", c.inProgress)} />
        <Stat label="Critical" value={link("status=UNRESOLVED&priority=CRITICAL", c.critical)} hint="unresolved" />
        <Stat label="High" value={link("status=UNRESOLVED&priority=HIGH", c.high)} hint="unresolved" />
        <Stat label="Unassigned" value={link("status=UNRESOLVED&assignment=unassigned", c.unassigned)} hint="unresolved" />
        <Stat label="AI needs review" value={c.aiFailed} hint="classification failed" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <TicketList title="Oldest unresolved" tickets={data.oldestUnresolved} empty="No unresolved tickets. The queue is clear." showAge />
        <TicketList title="Recently updated" tickets={data.recentlyUpdated} empty="No tickets yet. New author queries will appear here." />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 font-medium">Unresolved by category</h2>
          {data.byCategory.length === 0 ? <p className="text-sm text-muted">Nothing outstanding.</p> : (
            <ul className="space-y-2 text-sm">
              {data.byCategory.sort((a, b) => b.count - a.count).map((r) => (
                <li key={r.category} className="flex justify-between">
                  {link(`status=UNRESOLVED&category=${r.category}`, CATEGORY_LABELS[r.category])}<span className="tabular-nums">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 font-medium">All tickets by status</h2>
          {data.byStatus.length === 0 ? <p className="text-sm text-muted">No tickets yet.</p> : (
            <ul className="space-y-2 text-sm">
              {data.byStatus.map((r) => (
                <li key={r.status} className="flex justify-between">{link(`status=${r.status}`, STATUS_LABELS[r.status])}<span className="tabular-nums">{r.count}</span></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function TicketList({ title, tickets, empty, showAge }: { title: string; tickets: AdminTicketSummary[]; empty: string; showAge?: boolean }) {
  return (
    <Card>
      <h2 className="border-b border-line px-4 py-3 font-medium">{title}</h2>
      {tickets.length === 0 ? <EmptyState title={empty} /> : (
        <ul className="divide-y divide-line">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link href={`/admin/tickets/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-panel-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">{t.subject}</p>
                  <p className="text-xs text-muted">{t.ticketNumber} · {t.author.name} · {showAge ? `waiting ${timeAgo(t.createdAt).replace(" ago", "")}` : `updated ${timeAgo(t.updatedAt)}`}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2"><PriorityBadge priority={t.priority} /><StatusBadge status={t.status} /></div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
