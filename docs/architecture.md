# Architecture

```
Browser (React client components, 5s polling)
   │  fetch /api/v1/*  (httpOnly cookie)
   ▼
src/proxy.ts ── optimistic page redirects only (JWT check, no DB)
   ▼
Route handlers  src/app/api/v1/**/route.ts
   │  route() wrapper: same-origin check + uniform error envelope
   │  requireAuthor()/requireAdmin(): DB-backed session → role + authorId
   │  Zod parse of params / query / body
   ▼
Services  src/server/tickets.ts   (all business rules, transactions, audit log)
   │            │
   ▼            ▼
Prisma/Postgres   AI layer src/lib/ai/*
                  llm.ts (interface) ← gemini.ts (adapter, server-only)
                  classify.ts · draft.ts · knowledge-base.ts · context.ts · fallback.ts
```

## Layers
- **Handlers** are thin. They authenticate, validate, call one service and serialize. The author id always comes from the session.
- **Services** own the rules: ownership-scoped queries (`where: { id, authorId }`, so a foreign record looks the same as a missing one), status transitions, optimistic concurrency (`updateMany … where updatedAt = seen`), and the audit trail.
- **Serializers** (`src/server/serializers.ts`) build explicit DTOs. Author DTOs have no notes, AI draft, score or assignee fields at all.
- **AI layer** depends on an `LlmClient` interface. Tests inject `FakeLlm`, so no tests touch the network.

## Data model
`User (role)` 1–1 `Author` 1–n `Book`. `Author` 1–n `Ticket` n–1 `Book?`. `Ticket` 1–n `TicketMessage` (public), `InternalNote` (admin-only, separate table) and `TicketAuditLog`. Money uses `Decimal(12,2)`. `Book.status` is free text so the sample values survive as given. External IDs (`AUTH001`, `BK001`) are unique and used as seed upsert keys. Indexes cover author+created, status+priorityScore (the default queue order), category, priority, created and assignee.

## Ticket and AI lifecycle
1. The author POSTs. The server validates and checks book ownership.
2. The ticket is **saved first** with keyword-fallback values (`source=FALLBACK`, `aiStatus=PENDING`).
3. One Gemini call returns structured JSON with category, score and reason. It's validated with Zod, and the label is derived from the score. On success, `source=AI`. On failure, `aiStatus=FAILED` with the reason shown to admins, who can retry or override.
4. When an admin opens the ticket, a draft is generated once and cached on the ticket. Regenerating is an explicit action. A reply or a new author message invalidates the cached draft.
5. The admin edits the draft and confirms. The reply is saved as a public message, and the author's poll picks it up within about 5 seconds.

## Real-time
`usePoll` runs one request at a time, uses sequence numbers to drop stale responses, pauses on `visibilitychange`, and cleans up on unmount. Ticket views poll every 5s; dashboards every 10s. Polling was chosen over SSE or WebSockets because it works on any host and with multiple instances, and needs no sticky connections.

## Security notes
bcrypt (12 rounds) with a constant-time path for unknown emails. Login is rate limited. The session cookie is httpOnly, SameSite=Lax and Secure in production. Origins are checked on mutations. Security headers are set (nosniff, frame DENY). The Gemini key is used only in `server-only` modules. Ticket text is wrapped in delimiters that have been neutralised, and the prompts mark it as untrusted.
