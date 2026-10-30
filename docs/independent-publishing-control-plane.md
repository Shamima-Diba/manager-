# Independent publishing control plane (migration 004)

This additive migration introduces tenant-scoped publication destinations and a durable delivery-intent ledger without modifying the legacy website or Mastodon publishing tables.

## Destination ownership

Each workspace can register website or social destinations. Public configuration is deliberately separate from credentials; credential-like top-level keys are rejected and no token fields exist in the destination table. Provider keys identify supported destination categories, not a claim that every adapter is implemented.

New destinations start in **shadow** mode. Shadow mode is for inventory and delivery planning only. Activating a physical target requires a stable, non-secret `target_key` and operator evidence. A global partial unique index prevents two active Manager destination records from claiming the same physical target. Use `paused` to suspend dispatch ownership without deleting history.

## Delivery ledger

`publication_deliveries` records one delivery intent for each workspace + immutable content version + destination. It stores an idempotency key and remote receipt fields, and constrains cross-tenant references with composite foreign keys. Repeated planning for the same version and destination returns the existing record.

The planning RPC checks workspace publisher permissions and current-version approval. A shadow destination receives status `planned`; an active destination receives `scheduled`.

## Important implementation boundary

**This migration does not activate a new publisher.** The existing worker still consumes legacy `scheduled_publications` and supports Mastodon only. It does not yet dispatch `publication_deliveries`. Website connectors, Facebook/X/Instagram/LinkedIn/Telegram/YouTube adapters, delivery reconciliation UI, OAuth credential storage for new providers, and cutover automation remain subsequent work.

Do not activate a destination or apply this migration to production as part of this source change. Validate it on a disposable PostgreSQL 17 / Supabase environment first. Keep BanglarVoice's existing publishing path untouched until shadow comparison, destination-specific tests, and an explicitly approved cutover are complete.
