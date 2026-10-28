# Architecture and implemented boundaries

```text
Vercel / Netlify static admin SPA
  ├─ Supabase Auth (email, reset, magic link)
  ├─ PostgREST RPC → PostgreSQL RLS + immutable versions + approvals
  ├─ Storage (private workspace paths, no browser overwrite)
  └─ Realtime (RLS-filtered job changes, plus 30s polling)
Supabase Edge OAuth mediation → fixed administrator Mastodon instance
PostgreSQL transaction → workflow_runs + pgmq.send
Container worker → leased jobs → FFmpeg / Mastodon official API
  ├─ signed Storage downloads → private MP4/thumbnail uploads
  └─ approved public snapshot → static site files → Nginx / static hosting
```

Postgres is authoritative. No Redis, Temporal, n8n, or persistent frontend function is required. Supabase Cron is an optional short SQL dispatcher only. The worker also dispatches due records every loop, so the system continues without Cron. With one worker, dispatch is delayed while a long render runs; add a second worker for scheduling responsiveness. Workspace concurrency is one active workflow. A global site-build lease prevents competing full-site file swaps. Queue pending limit is 100 jobs per workspace. Mastodon rate dispatch has a conservative shared two-second guard; 429 responses persist cooldown and bounded backoff.

## Atomic jobs and recovery

`manager_private.enqueue` inserts workflow state and pgmq message in the same transaction. Commit or rollback affects both: no separate unreliable enqueue HTTP call. Claims use row locking, advisory workspace lock, lease token and 60-second queue visibility. A worker renews every 15 seconds. Completion is fenced by token, running state and unexpired lease; state and queue acknowledgement commit together. Outcome failures retain visibility/backoff. Three attempts maximum; terminal failures are retained as dead letters in workflow state while queue messages are archived.

Abandoned rendering can retry. An expired publishing lease is **unknown**, because a remote side effect may have happened. Transport loss, malformed success, 5xx, or failed readback also become unknown. The system never promises exactly-once external posting. Mastodon Idempotency-Key retention is only up to one hour; manager does not depend on it to justify blind retry. Only definite 429 non-acceptance is automatically retried. Known rejection/expired token is terminal. Human reconciliation has an audited cancellation RPC; automatic lookup/search of unknown remote posts is not implemented.

## Editorial safety

Articles are plain text (not user HTML). Every save inserts a new immutable content version/hash, invalidates current approval, and cancels still-scheduled publications. Approvals require owner/admin/reviewer; publishing requires owner/admin/publisher. The worker rechecks the version approval when claiming a publication. Review notes are mandatory for sensitive articles; sensitive defaults true. Fully semantic detection/classification of all sensitive topics is not implemented; staff remain responsible. Concurrent external requests cannot be recalled by editing or pausing; this in-flight limitation is explicit.

Rendered artifact approval binding, structured scene editing, public approved media embeds, deep research automation, and analytics ingestion remain outside this implemented slice. Schema availability is not evidence of a complete feature implementation.

## Tenant isolation and deletion

All exposed tenant tables carry workspace_id and RLS. Composite tenant foreign keys stop cross-workspace references. Sensitive tables have SELECT-only member access and mutation RPCs. Social secret rows have RLS with no browser policies and explicit revoked grants. Private worker functions are in a schema not exposed through PostgREST.

Workspace deletion cascades tenant bookkeeping but may be blocked by restrictive content/render foreign keys. There is deliberately no destructive workspace-delete UI. Storage objects are not transactionally deleted by Postgres. Backups, retention and media garbage collection require operator procedures; no automated destructive retention job ships.

Sources: https://supabase.com/docs/guides/queues/pgmq ; https://docs.joinmastodon.org/methods/statuses/ ; https://docs.joinmastodon.org/methods/oauth/
