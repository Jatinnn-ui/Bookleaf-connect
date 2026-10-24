"use client";
import { use, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client/api";
import { usePoll } from "@/lib/client/use-poll";
import type { AuthorTicket, Message } from "@/lib/client/types";
import { CATEGORY_LABELS } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { Button, Card, ErrorState, Loading, PageHeader, StatusBadge, inputCls, useToast } from "@/components/ui";
import { Thread } from "@/components/thread";

export default function AuthorTicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = use(params);
  const toast = useToast();
  const { data, error, loading, refresh } = usePoll(`ticket:${ticketId}`, () =>
    api<{ ticket: AuthorTicket }>(`/api/v1/author/tickets/${ticketId}`).then((r) => r.ticket),
  );
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  if (error && !data) return <ErrorState error={error} onRetry={refresh} />;
  if (loading || !data) return <Loading label="Loading ticket" />;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await api<{ message: Message }>(`/api/v1/author/tickets/${ticketId}/messages`, { method: "POST", json: { body: reply } });
      setReply("");
      await refresh();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Link href="/author/tickets" className="text-sm text-muted hover:text-paper">← My tickets</Link>
      <div className="mt-3">
        <PageHeader title={data.subject} subtitle={`${data.ticketNumber} · opened ${formatDate(data.createdAt)}`} actions={<StatusBadge status={data.status} />} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
        <div className="space-y-4">
          <Thread selfRole="AUTHOR" original={{ name: "You", body: data.description, createdAt: data.createdAt }} messages={data.messages ?? []} />
          {!data.messages?.some((m) => m.sender.role === "ADMIN") && (
            <p className="text-sm text-muted">Our support team has your query. Replies will appear here automatically.</p>
          )}
          {data.status === "CLOSED" ? (
            <Card className="p-4 text-sm text-muted">This ticket is closed. <Link href="/author/tickets/new" className="text-leaf hover:underline">Raise a new query</Link> if you need more help.</Card>
          ) : (
            <form onSubmit={send} className="space-y-2">
              <label htmlFor="reply" className="text-sm font-medium">Add a follow-up</label>
              <textarea id="reply" rows={3} className={inputCls} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={5000} />
              <div className="flex items-center justify-between gap-2">
                {data.status === "RESOLVED" ? <span className="text-xs text-muted">Replying will reopen this ticket.</span> : <span />}
                <Button type="submit" variant="primary" loading={busy} disabled={!reply.trim()}>Send</Button>
              </div>
            </form>
          )}
        </div>
        <Card className="h-fit p-4 text-sm">
          <dl className="space-y-3">
            <div><dt className="text-xs text-muted">Book</dt><dd>{data.book ? data.book.title : "General / Account Level"}</dd></div>
            {data.book && <div><dt className="text-xs text-muted">Book status</dt><dd>{data.book.status}</dd></div>}
            <div><dt className="text-xs text-muted">Category</dt><dd>{CATEGORY_LABELS[data.category]}</dd></div>
            <div><dt className="text-xs text-muted">Last updated</dt><dd>{formatDate(data.updatedAt)}</dd></div>
            {data.attachmentName && <div><dt className="text-xs text-muted">Attachment</dt><dd>{data.attachmentName} <span className="text-xs text-muted">(name only, not uploaded)</span></dd></div>}
          </dl>
        </Card>
      </div>
    </>
  );
}
