"use client";
import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, ClientApiError } from "@/lib/client/api";
import { usePoll } from "@/lib/client/use-poll";
import type { AdminTicket, Note } from "@/lib/client/types";
import {
  CATEGORIES, CATEGORY_LABELS, PRIORITIES, PRIORITY_BANDS, PRIORITY_LABELS, STATUSES, STATUS_LABELS, canTransition,
  type Category, type Priority, type Status,
} from "@/lib/domain";
import { formatDate, formatDateTime, formatInr } from "@/lib/format";
import { Button, Card, ConfirmButton, ErrorState, Loading, PriorityBadge, Spinner, StatusBadge, cx, inputCls, useToast } from "@/components/ui";
import { Thread } from "@/components/thread";

export default function AdminTicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = use(params);
  const toast = useToast();
  const base = `/api/v1/admin/tickets/${ticketId}`;
  const ticket = usePoll(`admin-ticket:${ticketId}`, () => api<{ ticket: AdminTicket }>(base).then((r) => r.ticket));
  const notes = usePoll(`notes:${ticketId}`, () => api<{ data: Note[] }>(`${base}/notes`).then((r) => r.data), 10000);
  const t = ticket.data;

  async function patch(body: Record<string, unknown>, ok: string) {
    try {
      const r = await api<{ ticket: AdminTicket }>(base, { method: "PATCH", json: { ...body, expectedUpdatedAt: t?.updatedAt } });
      ticket.setData(r.ticket);
      toast("success", ok);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Update failed.");
      if (e instanceof ClientApiError && e.status === 409) ticket.refresh();
    }
  }

  if (ticket.error && !t) return <ErrorState error={ticket.error} onRetry={ticket.refresh} />;
  if (!t) return <Loading label="Loading ticket" />;

  return (
    <>
      <Link href="/admin/tickets" className="text-sm text-muted hover:text-paper">← Ticket queue</Link>
      <div className="mb-6 mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl">{t.subject}</h1>
          <p className="mt-1 text-sm text-muted">{t.ticketNumber} · opened {formatDateTime(t.createdAt)} by {t.author.name}</p>
        </div>
        <div className="flex items-center gap-2"><PriorityBadge priority={t.priority} score={t.priorityScore} /><StatusBadge status={t.status} /></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <Thread selfRole="ADMIN" original={{ name: t.author.name, body: t.description, createdAt: t.createdAt }} messages={t.messages} />
          {t.attachmentName && <p className="text-xs text-muted">Author selected an attachment &ldquo;{t.attachmentName}&rdquo; (not uploaded; request by email if needed).</p>}
          <ReplyComposer key={t.id} ticket={t} base={base} onSent={ticket.refresh} />
          <NotesPanel base={base} notes={notes.data} loading={notes.loading} error={notes.error} onAdded={notes.refresh} />
        </div>

        <aside className="space-y-4">
          <Card className="space-y-4 p-4">
            <h2 className="text-sm font-medium">Manage</h2>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Assignee</span>
              <span>{t.assignedAdmin?.name ?? "Unassigned"}</span>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => patch({ assignee: "me" }, "Assigned to you.")}>Assign to me</Button>
              {t.assignedAdmin && <Button variant="ghost" onClick={() => patch({ assignee: null }, "Unassigned.")}>Unassign</Button>}
            </div>
            <SelectRow id="status" label="Status" value={t.status}
              options={STATUSES.map((s) => [s, STATUS_LABELS[s], s !== t.status && !canTransition(t.status, s)])}
              onChange={(v) => patch({ status: v as Status }, `Status set to ${STATUS_LABELS[v as Status]}.`)} />
          </Card>

          <ClassificationCard t={t} base={base} onPatch={patch} onUpdated={(nt) => ticket.setData(nt)} />

          <Card className="p-4 text-sm">
            <h2 className="mb-3 font-medium">Author</h2>
            <dl className="space-y-1.5">
              <Row k="Name" v={t.author.name} />
              <Row k="Email" v={t.author.email} />
              <Row k="ID" v={t.author.externalAuthorId} />
              <Row k="City" v={t.author.city ?? "Not available"} />
              <Row k="Joined" v={formatDate(t.author.joinedDate)} />
              <Row k="Books / tickets" v={`${t.author.bookCount} / ${t.author.ticketCount}`} />
            </dl>
          </Card>

          <Card className="p-4 text-sm">
            <h2 className="mb-3 font-medium">Book</h2>
            {t.bookDetails ? (
              <dl className="space-y-1.5">
                <Row k="Title" v={t.bookDetails.title} />
                <Row k="ISBN" v={t.bookDetails.isbn} mono />
                <Row k="Status" v={t.bookDetails.status} />
                <Row k="Published" v={formatDate(t.bookDetails.publicationDate, "Not yet")} />
                <Row k="MRP" v={formatInr(t.bookDetails.mrp, "Not set")} />
                <Row k="Copies sold" v={String(t.bookDetails.totalCopiesSold)} />
                <Row k="Earned" v={formatInr(t.bookDetails.totalRoyaltyEarned)} />
                <Row k="Paid" v={formatInr(t.bookDetails.royaltyPaid)} />
                <Row k="Pending" v={formatInr(t.bookDetails.royaltyPending)} />
                <Row k="Last payout" v={formatDate(t.bookDetails.lastRoyaltyPayoutDate, "None")} />
                <Row k="Print partner" v={t.bookDetails.printPartner ?? "Not assigned"} />
                <Row k="Platforms" v={t.bookDetails.availableOn.join(", ") || "Not listed"} />
              </dl>
            ) : <p className="text-muted">General / Account Level query</p>}
          </Card>

          <Card className="p-4 text-sm">
            <h2 className="mb-3 font-medium">Activity</h2>
            {t.auditLog.length === 0 ? <p className="text-muted">No changes yet.</p> : (
              <ol className="space-y-2 text-xs">
                {t.auditLog.map((a) => (
                  <li key={a.id}>
                    <span className="text-muted">{formatDateTime(a.createdAt)} · {a.actor}</span>
                    <p>{a.action.replaceAll("_", " ").toLowerCase()}{a.toValue ? `: ${a.fromValue ?? "-"} → ${a.toValue}` : ""}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return <div className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className={cx("text-right", mono && "font-mono text-xs")}>{v}</dd></div>;
}

function SelectRow({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: [string, string, boolean?][]; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs text-muted">{label}</label>
      <select id={id} className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l, disabled]) => <option key={v} value={v} disabled={disabled}>{l}</option>)}
      </select>
    </div>
  );
}

function ClassificationCard({ t, base, onPatch, onUpdated }: { t: AdminTicket; base: string; onPatch: (b: Record<string, unknown>, ok: string) => Promise<void>; onUpdated: (t: AdminTicket) => void }) {
  const toast = useToast();
  const sourceLabel = { AI: "AI classified", FALLBACK: "Keyword fallback (AI unavailable)", MANUAL: "Manually set by admin" }[t.classificationSource];
  async function retry() {
    try {
      const r = await api<{ ok: boolean; error: string | null; ticket: AdminTicket }>(`${base}/ai-classify`, { method: "POST" });
      onUpdated(r.ticket);
      toast(r.ok ? "success" : "error", r.ok ? "Reclassified by AI." : (r.error ?? "AI unavailable."));
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed.");
    }
  }
  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="text-sm font-medium">Classification</h2>
        <p className={cx("mt-1 text-xs", t.classificationSource === "AI" ? "text-green-200" : "text-amber-200")}>{sourceLabel}</p>
        {t.aiClassificationReason && <p className="mt-2 text-xs text-muted">{t.aiClassificationReason}</p>}
      </div>
      <SelectRow id="category" label="Category" value={t.category}
        options={CATEGORIES.map((c) => [c, CATEGORY_LABELS[c]])}
        onChange={(v) => onPatch({ category: v as Category }, "Category overridden.")} />
      <SelectRow id="priority" label={`Priority (score ${t.priorityScore})`} value={t.priority}
        options={PRIORITIES.map((p) => [p, `${PRIORITY_LABELS[p]} (${PRIORITY_BANDS.find((b) => b.priority === p)!.min}+)`])}
        onChange={(v) => onPatch({ priority: v as Priority }, "Priority overridden.")} />
      <ConfirmButton label="Re-run AI classification" title="Re-run AI classification?" body="This replaces the current category and priority, including any manual overrides." confirmLabel="Re-run" onConfirm={retry} />
    </Card>
  );
}

function ReplyComposer({ ticket, base, onSent }: { ticket: AdminTicket; base: string; onSent: () => Promise<void> }) {
  const toast = useToast();
  const closed = ticket.status === "CLOSED";
  // Seed the editor once from the cached draft; polling never overwrites admin edits.
  const [body, setBody] = useState(ticket.aiDraft ?? "");
  const [fromAi, setFromAi] = useState(Boolean(ticket.aiDraft));
  const [drafting, setDrafting] = useState(!ticket.aiDraft && !closed);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState<"" | Status>("");
  const [sending, setSending] = useState(false);
  const requested = useRef(false);

  async function loadDraft(regenerate: boolean) {
    setDrafting(true);
    setDraftError(null);
    await fetchDraft(regenerate);
  }

  async function fetchDraft(regenerate: boolean) {
    try {
      const r = await api<{ draft: string }>(`${base}/ai-draft`, { method: "POST", json: { regenerate } });
      setBody(r.draft);
      setFromAi(true);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : "AI draft unavailable. Write the reply manually.");
    } finally {
      setDrafting(false);
    }
  }

  // Generate the draft once when the ticket is opened without one (server caches it).
  useEffect(() => {
    if (requested.current || closed || ticket.aiDraft) return;
    requested.current = true;
    fetchDraft(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send() {
    setSending(true);
    try {
      await api(`${base}/replies`, { method: "POST", json: { body, ...(nextStatus ? { status: nextStatus } : {}) } });
      toast("success", "Reply sent to the author.");
      setBody("");
      setFromAi(false);
      setNextStatus("");
      await onSent();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Could not send.");
    } finally {
      setSending(false);
    }
  }

  if (closed) return <Card className="p-4 text-sm text-muted">This ticket is closed. Reopen it to reply.</Card>;

  return (
    <Card className="p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="reply" className="font-medium">Reply to author</label>
        <div className="flex items-center gap-2 text-xs text-muted">
          {drafting && <><Spinner /> Drafting with AI…</>}
          {!drafting && fromAi && <span className="rounded bg-panel-2 px-1.5 py-0.5">AI draft · review before sending</span>}
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => loadDraft(true)} disabled={drafting}>
            {fromAi || ticket.aiDraft ? "Regenerate draft" : "Generate AI draft"}
          </Button>
        </div>
      </div>
      {draftError && <p role="alert" className="mb-2 text-xs text-amber-200">{draftError}</p>}
      <textarea
        id="reply"
        rows={10}
        className={inputCls}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={drafting ? "" : "Write your reply…"}
        maxLength={5000}
        aria-describedby="reply-help"
      />
      <p id="reply-help" className="mt-1 text-xs text-muted">The author sees this reply on their ticket. Drafts are never sent automatically.</p>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <label htmlFor="next-status" className="text-xs text-muted">After sending</label>
        <select id="next-status" className={cx(inputCls, "w-auto")} value={nextStatus} onChange={(e) => setNextStatus(e.target.value as Status | "")}>
          <option value="">{ticket.status === "OPEN" ? "Mark In Progress" : "Keep status"}</option>
          <option value="RESOLVED">Mark Resolved</option>
          {ticket.status !== "IN_PROGRESS" && <option value="IN_PROGRESS">Mark In Progress</option>}
        </select>
        <ConfirmButton
          variant="primary"
          label="Send reply"
          title="Send this reply to the author?"
          body={`${ticket.author.name} will see this message immediately on their ticket.`}
          confirmLabel={sending ? "Sending…" : "Send"}
          disabled={!body.trim() || sending}
          onConfirm={send}
        />
      </div>
    </Card>
  );
}

function NotesPanel({ base, notes, loading, error, onAdded }: { base: string; notes: Note[] | null; loading: boolean; error: Error | null; onAdded: () => Promise<void> }) {
  const toast = useToast();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`${base}/notes`, { method: "POST", json: { body } });
      setBody("");
      await onAdded();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not save note.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="border-dashed p-4">
      <h2 className="font-medium">Internal notes <span className="text-xs font-normal text-muted">· visible to BookLeaf staff only</span></h2>
      <div className="mt-3 space-y-3">
        {error && !notes ? <p className="text-sm text-red-300">{error.message}</p> : loading && !notes ? <Loading /> : !notes?.length ? (
          <p className="text-sm text-muted">No internal notes yet.</p>
        ) : notes.map((n) => (
          <div key={n.id} className="rounded-md bg-panel-2 p-3 text-sm">
            <p className="mb-1 text-xs text-muted">{n.admin.name} · {formatDateTime(n.createdAt)}</p>
            <p className="whitespace-pre-wrap">{n.body}</p>
          </div>
        ))}
      </div>
      <form onSubmit={add} className="mt-3 space-y-2">
        <label htmlFor="note" className="sr-only">New internal note</label>
        <textarea id="note" rows={2} className={inputCls} placeholder="Add a note for the team…" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} />
        <div className="flex justify-end"><Button type="submit" loading={busy} disabled={!body.trim()}>Add note</Button></div>
      </form>
    </Card>
  );
}
