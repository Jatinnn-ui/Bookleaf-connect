"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, ClientApiError } from "@/lib/client/api";
import type { AuthorTicket, BooksResponse } from "@/lib/client/types";
import { Button, Card, Field, PageHeader, inputCls, useToast } from "@/components/ui";

function NewTicketForm() {
  const params = useSearchParams();
  const toast = useToast();
  const [books, setBooks] = useState<BooksResponse["books"] | null>(null);
  const [bookId, setBookId] = useState(params.get("bookId") ?? "");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<AuthorTicket | null>(null);

  useEffect(() => {
    api<BooksResponse>("/api/v1/author/books").then((r) => setBooks(r.books)).catch(() => setBooks([]));
  }, []);

  function validate() {
    const e: Record<string, string> = {};
    if (subject.trim().length < 5) e.subject = "Subject must be at least 5 characters.";
    if (description.trim().length < 20) e.description = "Please describe the issue in at least 20 characters.";
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setBusy(true);
    try {
      const { ticket } = await api<{ ticket: AuthorTicket }>("/api/v1/author/tickets", {
        method: "POST",
        json: { bookId: bookId || null, subject, description, attachmentName: file?.name ?? null },
      });
      setCreated(ticket);
      toast("success", `Ticket ${ticket.ticketNumber} submitted.`);
    } catch (err) {
      if (err instanceof ClientApiError && err.details) {
        setErrors(Object.fromEntries(err.details.map((d) => [d.path, d.message])));
      }
      toast("error", err instanceof Error ? err.message : "Could not submit your query.");
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted">Query submitted</p>
        <h2 className="mt-1 font-serif text-xl">Ticket {created.ticketNumber}</h2>
        <p className="mt-3 text-sm">Thanks for reaching out. Our support team has your query and you&apos;ll see their reply on the ticket page as soon as it&apos;s sent.</p>
        {created.attachmentName && (
          <p className="mt-2 text-xs text-amber-200">Note: your file &ldquo;{created.attachmentName}&rdquo; was not uploaded. Attachments are not stored yet; our team may ask you to share it by email.</p>
        )}
        <div className="mt-5 flex gap-2">
          <Link href={`/author/tickets/${created.id}`}><Button variant="primary">View ticket</Button></Link>
          <Button onClick={() => { setCreated(null); setSubject(""); setDescription(""); setFile(null); }}>Submit another</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Field label="Which book is this about?" htmlFor="book" error={errors.bookId}>
          <select id="book" className={inputCls} value={bookId} onChange={(e) => setBookId(e.target.value)} disabled={!books}>
            <option value="">General / Account Level</option>
            {books?.map((b) => <option key={b.id} value={b.id}>{b.title} ({b.status})</option>)}
          </select>
        </Field>
        <Field label="Subject" htmlFor="subject" error={errors.subject}>
          <input id="subject" className={inputCls} maxLength={150} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Royalty for last quarter not received" aria-invalid={!!errors.subject} />
        </Field>
        <Field label="Describe the issue" htmlFor="description" error={errors.description} hint="Include dates, platforms or order details where you can. It helps us respond faster.">
          <textarea id="description" rows={7} className={inputCls} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} aria-invalid={!!errors.description} />
        </Field>
        <Field label="Attachment (optional)" htmlFor="file" hint="File upload is not enabled yet. The file name is recorded but the file itself is not sent.">
          <input id="file" type="file" className="block text-sm text-muted file:mr-3 file:rounded file:border-0 file:bg-panel-2 file:px-3 file:py-1.5 file:text-paper" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={busy}>Submit query</Button>
        </div>
      </form>
    </Card>
  );
}

export default function NewTicketPage() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="Submit a support query" subtitle="Our team usually replies within one business day." />
      <Suspense>
        <NewTicketForm />
      </Suspense>
    </div>
  );
}
