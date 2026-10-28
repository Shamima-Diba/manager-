# Backup and restore — procedure NOT tested end to end

Database backups and media backups are separate. Supabase database snapshots/pg_dump do not copy Storage object bytes. Before any migration, back up schema/data, Auth records through supported Supabase tooling, encrypted secret rows, and key identifiers; keep encryption keys in a different approved secret backup system. Never place production dumps or keys in this source ZIP.

Use your Supabase plan's supported backup/PITR workflow. For self-managed/disposable environments, pg_dump with appropriate access can produce schema/data dumps; restoring managed auth/storage schemas across incompatible versions may require provider-specific steps. Review Supabase guidance rather than blindly replacing a production project.

Storage: inventory every bucket, copy objects through authenticated Storage APIs/backup tools to encrypted independent storage, retain bucket/path/checksum metadata, and verify byte counts plus hashes. Never turn private buckets public to simplify backup. Public generated HTML may be rebuilt from approved snapshots; source media cannot be recovered from database metadata alone.

Restore drill (UNTESTED here): provision a separate compatible Supabase project, install required extensions, restore DB through supported process, restore bucket bytes, reapply/inspect RLS and grants, reconcile Auth redirects, use new worker credentials, restore token decryption key securely or reconnect accounts. Set global publishing kill switch before starting any worker. Inspect queued/dispatching external publications: turn ambiguous dispatches into unknown, never replay them blindly. Run SQL isolation tests on synthetic tenants and doctor, then render a fixture. Export public site and inspect that no drafts appear. Only after editorial/operator signoff resume publishing. Record RPO/RTO actually measured by the drill; no values are invented here.

Queue archives, workflow steps, audit records, and usage rows are retained indefinitely until operator policy is established. Schedule partitioning/retention appropriate to your organization; automated deletion and backup jobs are not shipped.
