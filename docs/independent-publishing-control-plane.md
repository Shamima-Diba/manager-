# Independent publishing control plane (migrations 004–005)

These additive migrations introduce tenant-scoped publication destinations and a durable delivery-intent ledger without changing the legacy website or Mastodon scheduling tables.

## Destination ownership

Each workspace can register website or social destinations. Public configuration is deliberately separate from credentials; credential-like top-level keys are rejected and no token fields exist in the destination table. Provider keys identify destination categories, not a claim that every adapter is implemented.

New destinations start in **shadow** mode. Shadow mode is for inventory and delivery planning only. Activating a physical target requires a stable, non-secret `target_key` and operator evidence. A global partial unique index prevents two active Manager destination records from claiming the same physical target. Use `paused` to suspend dispatch ownership without deleting history.

## Delivery ledger and worker

`publication_deliveries` records one delivery intent for each workspace + immutable content version + destination. It stores an idempotency key, attempt count, remote receipt and worker lease. Repeated planning for the same version and destination returns the existing record.

The planning RPC checks workspace publisher permissions and current-version approval. A shadow destination receives status `planned`; an active destination receives `scheduled`.

Migration 005 connects this ledger to the existing continuous worker, but adds a separate global `publication_dispatch_enabled` opt-in that defaults to **false**. Activating a destination alone cannot start new-ledger dispatch. Claims are row-locked and leased; an expired lease becomes `needs_reconciliation`, never an automatic repost. Successful Mastodon delivery requires a provider read-back before the receipt is marked published. Rate limits are rescheduled; rejected/auth failures are terminal until an operator resolves them; uncertain network outcomes require reconciliation.

## First adapter: Mastodon

The first delivery adapter intentionally reuses an existing, connected Mastodon OAuth account belonging to the same workspace. Register a Mastodon destination with public config containing only the non-secret `connection_id` of that workspace's existing Mastodon connection, for example:

```json
{"connection_id":"<existing-workspace-mastodon-connection-uuid>"}
```

The encrypted token remains in the existing private `social_connection_secrets` table and is fetched only inside a SECURITY DEFINER worker RPC for the dedicated worker role. Never paste tokens into public config or commit them.

## Not yet implemented

WordPress, custom HTTP, Facebook, Instagram, LinkedIn, X, Telegram and YouTube are catalogued as destination types but do not yet have production dispatch adapters or credential lifecycle support. They are rejected by the worker rather than falsely marked as published. Built-in Manager static-site destination dispatch, provider-specific OAuth onboarding, reconciliation UI, and shadow comparison tooling also remain subsequent work.

Do not activate a destination or apply these migrations to production as part of this source change. Validate migrations and worker behavior on a disposable PostgreSQL 17 / Supabase environment first. Keep BanglarVoice's existing publishing path untouched until shadow comparison, destination-specific tests, and an explicitly approved cutover are complete.
