# Operations runbook

Start with ./scripts/doctor, JSON worker logs, Job Monitor timeline, worker_heartbeats.last_seen, workflow_runs status/attempts/error, and publication_attempts. Queue health is returned by manager_private.worker_health(). These functions require worker/operator credentials, never anonymous HTTP. Realtime is helpful but polling/SQL are the source of truth. Central log collection, dashboards, alert rules and automatic budget enforcement are not provisioned.

## Worker crash / expired lease

Check heartbeat and host memory/disk. Restart the container after identifying root cause. Render jobs become eligible after lease/visibility expiry; token fencing rejects old completion. Publishing jobs with expired running leases become unknown, not queued. Do not reset unknown to scheduled. Stale/orphaned uploaded artifacts can remain if upload succeeded but completion failed; retain for investigation then clean through controlled storage tooling.

## Queue backlog

Inspect queue_length/oldest_msg_age_sec and queued workflows. Publishing dispatch on a single worker waits behind rendering; add another worker, not an extra orchestrator. Per-workspace concurrency remains one. Check publishing pause/global kill switch, provider cooldown, failing jobs and resource pressure. Limit of 100 queued/running workflows per workspace protects enqueue paths; no automatic tenant budget feature exists.

## Expired/revoked OAuth token

401 becomes auth failure. Reconnect through administrator OAuth; record the failed publication, confirm it was not accepted, and create a distinct approved schedule intentionally. Do not auto-retry uncertain transport outcomes. Revocation/disconnect cancels still-scheduled rows. NULL expires_at is unknown/unsupplied, not an expiry guarantee.

## Ambiguous publication

Pause workspace. Inspect provider account, submitted-ID JSON logs and timestamp/caption manually. If found, verify identity/content at provider and document URL. `resolve_unknown_publication(...,p_cancel=>true)` closes uncertainty with evidence without reposting or falsely labeling Published. Automatic reconcile and remote-search UI are not implemented. A new post is a new editorial action, not a generic retry. Never rely on Mastodon's one-hour idempotency retention after a long outage.

## Storage exhaustion

Pause render intake. Inspect Supabase storage usage and host /tmp/disk. Object bytes and DB rows are separate. Delete only known orphaned/superseded objects after backup and a retention decision; no automatic garbage collector exists. Browser clients cannot overwrite/delete approved source objects. Upload success followed by registration failure may leave an orphan; use service-side inventory.

## Failed render

Read render_jobs.error and workflow_steps; check ASSET_GUARD, checksum, MIME/probe format, dimensions <=4096, media duration <=600 sec and requested render <=120 sec. CPU/font/FFmpeg prerequisites must be available. The renderer uses no shell and removes local temp directories. It deliberately fails when video is too short for the requested duration. Dead letters need operator root-cause review; no one-click destructive retry is supplied. Create a new render once corrected.

## Compromised credential

Enable workspace/global pause, stop affected workers/functions, revoke provider tokens at the provider, rotate Supabase/worker credentials and encryption key if exposed, inspect audit/provider histories and restore from trusted backup as necessary. Backend service-role can bypass all RLS: treat compromise as project-wide. Redaction is best effort, not a reason to log raw secrets. Do not paste incident secrets into chat.

## Database restore

Follow backup-restore.md. Keep publishing killed before attaching workers. Reconcile external side effects that happened after backup timestamp. A database rollback cannot roll back social posts. Do not reuse queued messages blindly after restore.

## Stuck website rebuild / takedown

Inspect site_rebuild_requests, latest site workflow, permissions on /site, disk and configured public origin. After a dead-letter build, the request remains and dispatcher may create a new build; repeated hard errors must be corrected or the worker stopped. Fix configuration and verify resulting HTML, sitemap and RSS. Build-hook accepted is not a deployment confirmation.

Emergency takedown: pause publishing, have a trusted administrator remove the target website_posts snapshot (content draft/history stays private), upsert site_rebuild_requests with increased generation, rebuild, and invalidate the static host/CDN cache. Remove a social post using official provider tooling; this release has no provider deletion API. Record takedown action/evidence in audit_logs through trusted administrative process. There is no destructive takedown UI. Existing live HTML is not removed merely by pausing.
