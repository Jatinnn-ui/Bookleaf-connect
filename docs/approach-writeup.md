# Approach write-up

**What I prioritised.** The core loop: author raises a ticket → it's triaged → an admin replies with an AI-assisted draft → the author sees it. Every step of that loop works without the AI. Tickets are saved before any model call, a keyword fallback keeps the queue sorted when Gemini is down, and admins can always write a reply manually. After that came authorization (session-derived identity, ownership baked into every query, explicit DTOs so internal notes can't leak) and data fidelity (the sample JSON seeded verbatim, Decimal money, nulls shown as "Not available" rather than ₹0).

**AI design.** Classification and priority come from a single structured-output call at temperature 0. The model returns a 0–100 score with documented bands, and the label is *derived* from the score so the two can't disagree. The output is validated strictly, and anything off-schema counts as a failure. Drafts are grounded in only the knowledge-base sections relevant to the ticket's category, the facts for the one related book, and the last 4 public messages (truncated). The prompts forbid claiming actions that haven't happened ("payment sent", "re-sync done") and forbid inventing timelines. Cost control comes from that selective context, one draft per ticket cached in the database (polling never re-bills), an output-token cap, minimal thinking level, and a cap on regenerations. Gemini Flash suits this workload because it's cheap, fast, supports JSON-schema output, and has a free tier for development. The provider sits behind an `LlmClient` interface, so swapping it is a single adapter.

**Trade-offs.**
- I used polling instead of SSE. It's simpler and works on any host or number of instances, at the cost of up to about 5s of latency.
- I chose a small hand-rolled JWT cookie session over Auth.js. Auth.js's credentials flow is awkward with the current Next.js release, and this way every line is easy to explain. The token carries only identity, and the role is re-read from the database on each request.
- AI classification runs inline during ticket creation, which adds about 1–2s and is bounded by a timeout. A queue would be better at scale.
- Rate limiting is in memory, which is fine for one container.
- Attachments are UI-only, and the UI says so honestly.

**Path to production.**
- Move classification and drafting to a job queue with retries and exponential backoff.
- Push updates over SSE backed by Postgres LISTEN/NOTIFY.
- Use Redis for rate limits and sessions, with session revocation.
- Store files in S3 with virus scanning.
- Send email notifications to authors.
- Log AI evaluations: record every model output alongside the admin's final edit and any overrides, and use that as a labelled dataset to measure classification accuracy and tune prompts.
- Add per-ticket token and cost telemetry.
- Add SLA timers and auto-escalation for Critical tickets.
- Add a royalty-ledger table so drafts can cite real payout dates instead of policy-derived ones.
