"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/client/api";
import { usePoll } from "@/lib/client/use-poll";
import type { AdminTicketList } from "@/lib/client/types";
import { CATEGORIES, CATEGORY_LABELS, PRIORITIES, PRIORITY_LABELS, STATUSES, STATUS_LABELS } from "@/lib/domain";
import { timeAgo } from "@/lib/format";
import { Button, Card, CategoryBadge, EmptyState, ErrorState, Loading, PageHeader, PriorityBadge, StatusBadge, cx, inputCls } from "@/components/ui";

const KEYS = ["status", "category", "priority", "assignment", "from", "to", "q", "page"] as const;

function Queue() {
  const router = useRouter();
  const sp = useSearchParams();
  const get = (k: string) => sp.get(k) ?? "";
  // Default view: unresolved tickets, sorted by priority then age.
  const status = sp.has("status") ? get("status") : "UNRESOLVED";
  const [q, setQ] = useState(get("q"));
  const [now] = useState(() => Date.now());

  const params = new URLSearchParams();
  for (const k of KEYS) {
    const v = k === "status" ? status : get(k);
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  const { data, error, loading, refresh } = usePoll(`queue?${qs}`, () => api<AdminTicketList>(`/api/v1/admin/tickets?${qs}`));

  function set(k: string, v: string) {
    const next = new URLSearchParams(qs);
    if (k === "status") next.set("status", v); // keep explicit "" to mean "all"
    else if (v) next.set(k, v);
    else next.delete(k);
    if (k !== "page") next.delete("page");
    router.replace(`/admin/tickets?${next.toString()}`);
  }

  // Debounce free-text search.
  useEffect(() => {
    if (q === get("q")) return;
    const t = setTimeout(() => set("q", q), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const sel = (id: string, label: string, value: string, opts: [string, string][]) => (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs text-muted">{label}</label>
      <select id={id} className={inputCls} value={value} onChange={(e) => set(id, e.target.value)}>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );

  return (
    <>
      <PageHeader title="Ticket queue" subtitle="Sorted by status, then priority score (highest first), then oldest first. Refreshes every 5 seconds." />
      <Card className="mb-4 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          <div className="col-span-2 md:col-span-4 lg:col-span-2">
            <label htmlFor="q" className="mb-1 block text-xs text-muted">Search</label>
            <input id="q" className={inputCls} placeholder="Ticket #, subject or author" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {sel("status", "Status", status, [["UNRESOLVED", "Unresolved"], ["", "All"], ...STATUSES.map((s) => [s, STATUS_LABELS[s]] as [string, string])])}
          {sel("category", "Category", get("category"), [["", "All"], ...CATEGORIES.map((c) => [c, CATEGORY_LABELS[c]] as [string, string])])}
          {sel("priority", "Priority", get("priority"), [["", "All"], ...PRIORITIES.map((p) => [p, PRIORITY_LABELS[p]] as [string, string])])}
          {sel("assignment", "Assignment", get("assignment"), [["", "Anyone"], ["me", "Assigned to me"], ["unassigned", "Unassigned"], ["assigned", "Assigned"]])}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="from" className="mb-1 block text-xs text-muted">From</label>
              <input id="from" type="date" className={cx(inputCls, "px-1.5")} value={get("from")} onChange={(e) => set("from", e.target.value)} />
            </div>
            <div>
              <label htmlFor="to" className="mb-1 block text-xs text-muted">To</label>
              <input id="to" type="date" className={cx(inputCls, "px-1.5")} value={get("to")} onChange={(e) => set("to", e.target.value)} />
            </div>
          </div>
        </div>
      </Card>

      {error ? <ErrorState error={error} onRetry={refresh} /> : loading && !data ? <Loading label="Loading queue" /> : !data?.data.length ? (
        <Card><EmptyState title="No tickets match these filters" body={status === "UNRESOLVED" ? "Nothing is waiting. Switch status to All to see resolved tickets." : undefined} /></Card>
      ) : (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-normal">Ticket</th>
                  <th scope="col" className="px-3 py-2.5 font-normal">Author</th>
                  <th scope="col" className="px-3 py-2.5 font-normal">Category</th>
                  <th scope="col" className="px-3 py-2.5 font-normal">Priority</th>
                  <th scope="col" className="px-3 py-2.5 font-normal">Status</th>
                  <th scope="col" className="px-3 py-2.5 font-normal">Assignee</th>
                  <th scope="col" className="px-3 py-2.5 font-normal">Age</th>
                  <th scope="col" className="px-4 py-2.5 font-normal">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.data.map((t) => {
                  const stale = (t.status === "OPEN" || t.status === "IN_PROGRESS") && now - new Date(t.createdAt).getTime() > 2 * 86400_000;
                  return (
                    <tr key={t.id} className="hover:bg-panel-2">
                      <td className="max-w-xs px-4 py-3">
                        <Link href={`/admin/tickets/${t.id}`} className="block hover:text-leaf">
                          <span className="block truncate font-medium">{t.subject}</span>
                          <span className="text-xs text-muted">{t.ticketNumber}{t.book ? ` · ${t.book.title}` : " · General"}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-3">{t.author.name}</td>
                      <td className="px-3 py-3">
                        <CategoryBadge category={t.category} />
                        {t.classificationSource !== "AI" && <span className="ml-1 text-[10px] uppercase text-muted">{t.classificationSource === "MANUAL" ? "manual" : "fallback"}</span>}
                      </td>
                      <td className="px-3 py-3"><PriorityBadge priority={t.priority} score={t.priorityScore} /></td>
                      <td className="px-3 py-3"><StatusBadge status={t.status} /></td>
                      <td className="px-3 py-3 text-muted">{t.assignedAdmin?.name ?? "Unassigned"}</td>
                      <td className={cx("px-3 py-3 whitespace-nowrap", stale && "text-amber-200")}>{stale && <span aria-label="Waiting over 48 hours">⏱ </span>}{timeAgo(t.createdAt).replace(" ago", "")}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">{timeAgo(t.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <div className="mt-4 flex items-center justify-between text-sm text-muted">
            <span>{data.pagination.total} tickets · page {data.pagination.page} of {data.pagination.totalPages}</span>
            <div className="flex gap-2">
              <Button disabled={data.pagination.page <= 1} onClick={() => set("page", String(data.pagination.page - 1))}>Previous</Button>
              <Button disabled={data.pagination.page >= data.pagination.totalPages} onClick={() => set("page", String(data.pagination.page + 1))}>Next</Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default function QueuePage() {
  return <Suspense fallback={<Loading />}><Queue /></Suspense>;
}
