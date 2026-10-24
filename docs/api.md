# BookLeaf Connect REST API (v1)

Base path: `/api/v1`. All bodies are JSON. Authentication is an httpOnly session cookie (`bl_session`, HS256 JWT, 8h) set by `POST /auth/login`. Every handler re-loads the user from the database and enforces role and ownership on the server.

Mutating requests with an `Origin` header from another host get `403`. All responses send `Cache-Control: private, no-store`.

## Error envelope

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed.", "details": [{ "path": "subject", "message": "..." }] } }
```

| Code | HTTP | Meaning |
|---|---|---|
| UNAUTHORIZED | 401 | No or invalid session, or wrong credentials |
| FORBIDDEN | 403 | Wrong role or cross-origin request |
| NOT_FOUND | 404 | Missing, **or owned by another author** (no existence leak) |
| VALIDATION_ERROR | 422 | Bad body, query, id, or status transition |
| CONFLICT | 409 | Stale `expectedUpdatedAt`, or ticket closed |
| RATE_LIMITED | 429 | Login attempts, draft regenerations, or provider rate limit |
| AI_UNAVAILABLE | 503 | AI failed or isn't configured (write the reply manually) |
| SERVICE_UNAVAILABLE | 503 | Database down or server misconfigured |
| INTERNAL_ERROR | 500 | Unexpected; details are logged on the server only |

Enums: status `OPEN | IN_PROGRESS | RESOLVED | CLOSED`. category `ROYALTY_PAYMENTS | ISBN_METADATA | PRINTING_QUALITY | DISTRIBUTION_AVAILABILITY | BOOK_STATUS_PRODUCTION | GENERAL_INQUIRY`. priority `CRITICAL | HIGH | MEDIUM | LOW`. Money is a decimal string (`"3570.00"`), and `null` means not available.

## Health
`GET /api/health` (public). Returns `200 {"status":"ok","database":"up"}` or `503` with `"database":"down"`.

## Auth
| Method | Path | Role | Body / Response |
|---|---|---|---|
| POST | `/auth/login` | public | `{email, password}` → `{user:{id,name,email,role}}` plus the cookie. Limit: 10 attempts per 15 min per IP+email |
| POST | `/auth/logout` | any | clears the cookie → `{ok:true}` |
| GET | `/auth/me` | any signed-in user | `{user:{id,name,email,role,author:{externalAuthorId,city,phone,joinedDate}|null}}` |

## Author (role AUTHOR, scoped to the session's author)
| Method | Path | Notes |
|---|---|---|
| GET | `/author/books` | `{books:[Book], totals:{books,published,inProduction,totalCopiesSold,totalRoyaltyEarned,royaltyPaid,royaltyPending}}` |
| GET | `/author/books/:bookId` | `{book}`. Another author's book returns 404 |
| GET | `/author/tickets?status=&q=` | `{data:[Ticket + latestReply]}` |
| POST | `/author/tickets` | `{bookId?: uuid|null, subject (5-150), description (20-5000), attachmentName?}` → `201 {ticket}`. Any `authorId` in the body is ignored. `bookId` must belong to the caller (422 otherwise). AI classification runs after the ticket is saved; if it fails, the ticket keeps the keyword fallback |
| GET | `/author/tickets/:id` | `{ticket}` with the public `messages`. No notes, AI draft, score or assignee |
| POST | `/author/tickets/:id/messages` | `{body}` → `201 {message}`. Reopens a RESOLVED ticket. 409 if CLOSED |

## Admin (role ADMIN)
| Method | Path | Notes |
|---|---|---|
| GET | `/admin/dashboard` | counts (open, inProgress, critical, high, unassigned, aiFailed), byCategory, byStatus, oldestUnresolved, recentlyUpdated |
| GET | `/admin/tickets` | Query: `status` (a status, or `UNRESOLVED`; empty means all), `category`, `priority`, `assignment` (`me` / `unassigned` / `assigned`), `from`, `to` (YYYY-MM-DD, on created date), `q` (ticket #, subject, author name/email), `page`, `pageSize` (≤100). Sort: status, then priorityScore desc, then createdAt asc. Returns `{data, pagination:{page,pageSize,total,totalPages}}` |
| GET | `/admin/tickets/:id` | Full ticket: author profile, book details, messages, aiDraft, classification reason/source, audit log |
| PATCH | `/admin/tickets/:id` | Any of `{status, category, priority, priorityScore (0-100), assignee: "me"|null, expectedUpdatedAt}`. A category or priority change sets the source to MANUAL. Every change is audited. Returns 409 on a stale `expectedUpdatedAt`. `CLOSED` can only move to `OPEN` |
| GET / POST | `/admin/tickets/:id/notes` | Internal notes. POST `{body}` → `201 {note}` |
| POST | `/admin/tickets/:id/replies` | `{body, status?}` → `201 {message}`. Moves OPEN to IN_PROGRESS by default, auto-assigns if unassigned, and clears the cached draft |
| POST | `/admin/tickets/:id/ai-draft` | `{regenerate?: boolean}` → `{draft, generatedAt, cached}`. Cached on the ticket. Regenerations are limited to 20 per 10 min. Never sends anything to the author |
| POST | `/admin/tickets/:id/ai-classify` | Re-runs AI classification → `{ok, error, ticket}`. Overwrites manual overrides |
