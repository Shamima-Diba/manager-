-- Shadow-only inbound integration for existing newsroom applications.
-- This migration does not alter publication tables, workers, or legacy publishing paths.

create table public.workspace_integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  source_system text not null check (source_system ~ '^[a-z][a-z0-9_-]{1,39}$'),
  credential_hash text not null check (credential_hash ~ '^[0-9a-f]{64}$'),
  enabled boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  unique (workspace_id, id),
  unique (workspace_id, source_system, name)
);
comment on table public.workspace_integrations is
  'Inbound service integrations. Only a SHA-256 credential hash is stored; plaintext keys are returned once at creation.';
alter table public.workspace_integrations enable row level security;
create policy workspace_integrations_tenant_read on public.workspace_integrations
  for select to authenticated using (public.has_role(workspace_id));
revoke all on public.workspace_integrations from anon, authenticated;
grant select on public.workspace_integrations to authenticated;

create table public.integration_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  integration_id uuid not null,
  external_event_id text not null check (length(external_event_id) between 1 and 160),
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_.-]{2,79}$'),
  occurred_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  received_at timestamptz not null default now(),
  unique (workspace_id, integration_id, external_event_id),
  foreign key (workspace_id, integration_id)
    references public.workspace_integrations(workspace_id, id) on delete cascade
);
comment on table public.integration_events is
  'Immutable inbound event inbox. Events are shadow observations only and never enqueue publication jobs.';
create index integration_events_workspace_recent_idx
  on public.integration_events(workspace_id, received_at desc);
create index integration_events_integration_recent_idx
  on public.integration_events(integration_id, received_at desc);
alter table public.integration_events enable row level security;
create policy integration_events_tenant_read on public.integration_events
  for select to authenticated using (public.has_role(workspace_id));
revoke all on public.integration_events from anon, authenticated;
grant select on public.integration_events to authenticated;

-- No browser INSERT/UPDATE/DELETE grants. Edge Functions use the service role after
-- validating workspace membership or the integration's HMAC credential.
