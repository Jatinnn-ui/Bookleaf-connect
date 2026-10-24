# BookLeaf Connect

**Author Support & Communication Portal** for BookLeaf Publishing. It has two portals on one backend: authors check their books and royalties and raise support tickets, and the ops team works a prioritised queue with AI classification and AI-drafted replies grounded in BookLeaf's policies.

- Architecture: [docs/architecture.md](docs/architecture.md)
- API reference: [docs/api.md](docs/api.md)
- One-page write-up: [docs/approach-writeup.md](docs/approach-writeup.md)

## Stack
Next.js 16 (App Router, Route Handlers as the REST API) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL 16 · Prisma 6 · Zod 4 · `jose` JWT cookie sessions + bcrypt · Google Gemini via `@google/genai` · Vitest · Docker.

Two deviations from the brief I was given:
- **Auth:** I used a small JWT-cookie session instead of Auth.js (see the write-up for why).
- **UI components:** I used hand-built Tailwind primitives (`src/components/ui.tsx`) instead of shadcn/ui, to keep dependencies minimal.

## Features
**Author portal:**
- Dashboard with royalty totals.
- My Books, with search and status filter. It shows "Not yet published" / "Not available" for in-production books and keeps real ₹0 values distinct from missing ones.
- Submit a query, about a specific book or General / Account Level. The attachment field records the file name only, and the UI says so.
- My Tickets, and a ticket thread that updates live (5s polling). Authors can send follow-ups, which reopen resolved tickets.

**Admin portal:**
- Live dashboard: open, in-progress, critical, high, unassigned and AI-failed counts, plus the oldest unresolved tickets.
- Server-side filtered and paginated queue (status, category, priority, assignment, date range, search). Tickets waiting over 48h are flagged.
- Ticket workspace:
  - The AI draft generates automatically on first open, is cached, and can be regenerated. It is edited and then sent only after you confirm.
  - Assign to me, status changes, and category/priority overrides.
  - Re-run AI classification.
  - Internal notes, which authors never see.
  - Author and book context panels, and an audit log.

## Quick start (local)
Prerequisites: Node 24, Docker (for Postgres).
```bash
docker run -d --name bookleaf-db -p 5433:5432 -e POSTGRES_USER=bookleaf -e POSTGRES_PASSWORD=bookleaf -e POSTGRES_DB=bookleaf -v bookleaf_pg:/var/lib/postgresql/data postgres:16-alpine
cp .env.example .env      # fill DATABASE_URL, AUTH_SECRET (openssl rand -hex 32), GEMINI_API_KEY, seed vars
npm install
npm run db:deploy         # apply migrations (use db:migrate when changing the schema)
npm run db:seed           # idempotent: 10 authors, 18 books, 1 admin
npm run dev               # http://localhost:3000
```

### Demo logins
Seeding creates:
- **Authors:** every email in `bookleaf_sample_data.json` (e.g. `priya.sharma@email.com`, or `sneha.kulkarni@email.com`, who has a book in production), all with the password in `SEED_DEMO_PASSWORD`.
- **Admin:** `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

No passwords are committed. For the hosted demo, the credentials are shared with the submission rather than stored in this repo.

To reset passwords after changing the env vars, run `SEED_RESET_PASSWORDS=true npm run db:seed`.

## Seeding
`prisma/seed-lib.ts` reads the supplied JSON and validates it with Zod. It then upserts everything in one transaction, keyed by email, `author_id` and `book_id`, and finally checks that every expected author and book exists. Royalty totals are copied verbatim, never recomputed. Nulls (dates, MRP, royalty per copy, print partner) and empty platform lists are preserved. Re-running it never creates duplicates. No tickets are seeded, so the dashboards show real empty states until authors submit queries.

## AI integration
- **Model:** set with `GEMINI_MODEL` (default `gemini-3.5-flash-lite`). The Flash-Lite tier is the cheapest and fastest Gemini option, supports JSON-schema structured output, and the free tier covers development — a good fit for two short, high-volume tasks (classification and a bounded draft). The heavier `gemini-3.8-flash` also works but is prone to transient `503 "high demand"` responses under load, which is exactly what graceful degradation is for. Because business logic depends on the `LlmClient` interface, swapping models (or providers) is a one-line config/adapter change. Thinking is set to `MINIMAL` (`GEMINI_THINKING_LEVEL`) for these short tasks. Requests time out after `GEMINI_TIMEOUT_MS`.
- **Key security:** `GEMINI_API_KEY` is read only in the `server-only` module `src/lib/ai/gemini.ts`. Nothing uses a `NEXT_PUBLIC_` variable, and the browser never calls Gemini.
- **Classification** (`src/lib/ai/classify.ts`): one call returns `{category, priority, priorityScore, reason}` against a JSON schema at temperature 0. The prompt defines the six categories and the score bands (Critical 80–100, High 60–79, Medium 35–59, Low 0–34), and explicitly says an upset tone is not, by itself, a reason for Critical. The book facts (last payout date, status) let the model judge how long a problem has lasted. Output is validated with Zod, and the priority label is derived from the score.
- **Drafts** (`src/lib/ai/draft.ts`):
  - Context is the system prompt, the tone guidelines, **only the knowledge-base sections for the ticket's category** (`knowledge-base.ts`), a whitelist of facts about the one related book, and at most 4 recent public messages, each truncated.
  - Internal notes, emails, passwords and other authors' data are never sent.
  - The prompts forbid claiming actions that haven't happened and forbid inventing timelines.
  - Ticket text is wrapped in delimiters that have been neutralised and is marked as untrusted, which guards against prompt injection.
- **Graceful degradation:**
  - The ticket is saved *before* the AI call.
  - If classification fails (not configured, 429, timeout, or invalid JSON), the ticket keeps a deterministic keyword classification labelled **FALLBACK** and is counted under "AI needs review". Admins can override it or retry.
  - If a draft fails, the UI shows the reason and the admin writes the reply manually. The app runs fully with no `GEMINI_API_KEY` set.
- **Cost:**
  - One combined call for category and priority, with no knowledge base sent.
  - Selective knowledge-base sections and bounded history for drafts.
  - Drafts are cached on the ticket, so reloads and polling never re-bill.
  - Output-token caps, and a limit of 20 regenerations per 10 minutes per admin.

## API
See [docs/api.md](docs/api.md) for every endpoint, role, parameter and error code. `GET /api/health` checks the database and is used for container health checks.

## Real-time updates
Polling, with no WebSocket infrastructure. Ticket views and lists poll every 5s, and dashboards every 10s. The hook (`src/lib/client/use-poll.ts`):
- never overlaps requests,
- discards stale responses,
- pauses while the tab is hidden,
- and cleans up when the component unmounts.

API responses are sent with `Cache-Control: private, no-store`.

## Tests
```bash
npm run lint && npm run typecheck
npm test                                    # unit: AI parsing/validation, KB selection, fallback, priority bands, schemas (35 tests)
TEST_DATABASE_URL=postgresql://.../bookleaf_test npm run test:integration   # resets that DB, then:
                                            # seed counts/idempotency/nulls, ownership, fallback on AI failure,
                                            # full lifecycle with mocked Gemini, draft caching, note privacy, conflicts (8 tests)
npm run build
```
All tests use a fake LLM, so they spend no API credits. On PowerShell, set the variable first with `$env:TEST_DATABASE_URL="..."`.

## Docker
```bash
cp .env.example .env   # set POSTGRES_PASSWORD, AUTH_SECRET, GEMINI_API_KEY, seed vars
docker compose up -d --build
docker compose exec app npx tsx prisma/seed.ts   # once; safe to re-run
curl http://localhost:3000/api/health
```
- **Image:** multi-stage `node:24-alpine` build producing Next.js standalone output. It runs as a non-root user and has a `HEALTHCHECK`.
- **Startup:** the entrypoint runs `prisma migrate deploy` (disable with `RUN_MIGRATIONS=false`) and never seeds automatically.
- **Database:** Postgres uses a named volume and is **not** published outside the Compose network.
- **Local HTTP:** for plain-HTTP testing, set `COOKIE_SECURE=false`. Otherwise the browser drops the Secure cookie.

## Deploying to DeployLane
I don't have access to your DeployLane account, so these are the steps to configure there:
1. Provision a managed PostgreSQL 16 database and copy its connection string.
2. Create a service from this repo using the `Dockerfile`, with container port **3000** and health check path `/api/health`.
3. Set these secrets: `DATABASE_URL`, `AUTH_SECRET` (32+ random chars), `GEMINI_API_KEY`, `GEMINI_MODEL`, `SEED_DEMO_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`. Serve over HTTPS and leave `COOKIE_SECURE` unset.
4. Deploy. Migrations apply on start. If you run several replicas, set `RUN_MIGRATIONS=false` and run `npx prisma migrate deploy` once as a release step.
5. Seed once from a one-off command or shell: `npx tsx prisma/seed.ts`.
6. Verify: `/api/health` returns `{"status":"ok","database":"up"}`, then sign in as an author and as the admin.

**Troubleshooting:**
- **Health returns `database: down`:** check the host, port and SSL in `DATABASE_URL`. Managed databases often need `?sslmode=require`.
- **Migration error P3009:** a migration failed earlier. Inspect it with `npx prisma migrate status`.
- **"AI is not configured":** `GEMINI_API_KEY` is missing. The app still works, using the fallback classification and manual replies.
- **Login succeeds but you're bounced back to the login page:** you're on HTTP without `COOKIE_SECURE=false`.
- **503 "Server is misconfigured":** `AUTH_SECRET` is missing or too short.

## Environment variables
| Var | Required | Purpose |
|---|---|---|
| DATABASE_URL | yes | Postgres connection |
| AUTH_SECRET | yes | Session signing secret (32+ chars). The dev placeholder is rejected in production |
| GEMINI_API_KEY | no | Enables AI. Without it the app uses the fallback and manual replies |
| GEMINI_MODEL / GEMINI_THINKING_LEVEL / GEMINI_TIMEOUT_MS | no | Model tuning |
| COOKIE_SECURE | no | `false` only for local HTTP |
| SEED_DEMO_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, SEED_RESET_PASSWORDS | seed | Seed accounts |
| SEED_DATA_PATH | no | Alternative path to the sample JSON |
| TEST_DATABASE_URL | tests | Disposable database for integration tests |
| POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB / APP_PORT | compose | Local Compose |
| RUN_MIGRATIONS | no | `false` skips migrations on container start |

## Known limitations / next steps
- AI classification runs inline when a ticket is created; it's bounded by the timeout. A job queue would be better.
- The rate limiter is in memory, so it only works per instance.
- Sessions can't be revoked before they expire, which is 8 hours.
- Attachments are UI-only.
- No email notifications.
- Drafts are based on the policy and the book's snapshot figures; there's no per-payout ledger.
- Accessibility follows semantic HTML, labels, focus styles, and badges that don't rely on colour alone. Full WCAG conformance would need testing with assistive technology.

See the [write-up](docs/approach-writeup.md) for how I'd evolve this into a production system.

## Repository visibility
Per the assignment brief, this is a **private** repository; add the evaluator's email as a collaborator to grant access. The confidential assignment PDF and TXT are git-ignored and never committed.
