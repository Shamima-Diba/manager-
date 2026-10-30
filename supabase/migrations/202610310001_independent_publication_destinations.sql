-- Independent, tenant-scoped publication destinations and delivery ledger.
-- Additive only: legacy website_posts / scheduled_publications remain untouched.
-- No provider credentials are stored in public tables. No worker dispatch is enabled here.

create table public.publication_destinations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  destination_type text not null check (destination_type in ('website','social')),
  provider_key text not null check (provider_key in (
    'manager_static','custom_http','wordpress',
    'mastodon','facebook','instagram','linkedin','x','telegram','youtube'
  )),
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  target_key text,
  endpoint_url text,
  public_config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(public_config) = 'object')
    check (not (public_config ?| array[
      'token','access_token','refresh_token','client_secret','secret','password','api_key'
    ])),
  enabled boolean not null default false,
  ownership_mode text not null default 'shadow'
    check (ownership_mode in ('shadow','active','paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id,id),
  check (
    (destination_type = 'website' and provider_key in ('manager_static','custom_http','wordpress'))
    or
    (destination_type = 'social' and provider_key in ('mastodon','facebook','instagram','linkedin','x','telegram','youtube'))
  ),
  check (endpoint_url is null or endpoint_url ~ '^https://')
);

comment on table public.publication_destinations is
  'Tenant-owned publication endpoints. public_config must never contain credentials; secrets belong in private server-side storage.';
comment on column public.publication_destinations.target_key is
  'Stable non-secret canonical identifier for the physical website/channel; globally unique while ownership_mode=active.';
comment on column public.publication_destinations.ownership_mode is
  'shadow observes/plans without dispatch; active is the single authorized publisher; paused blocks dispatch.';

-- A physical destination may be actively controlled by only one workspace/manager endpoint.
create unique index publication_destinations_single_active_owner
  on public.publication_destinations(target_key)
  where ownership_mode = 'active' and target_key is not null;
create index publication_destinations_workspace_idx
  on public.publication_destinations(workspace_id, created_at desc);

create table public.publication_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  content_id uuid not null,
  version_id uuid not null,
  destination_id uuid not null,
  idempotency_key uuid not null default gen_random_uuid() unique,
  scheduled_at timestamptz not null default now(),
  status text not null default 'planned'
    check (status in (
      'planned','scheduled','queued','dispatching','published',
      'failed','unknown','needs_reconciliation','cancelled'
    )),
  remote_id text,
  remote_url text,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id,content_id)
    references public.content_items(workspace_id,id) on delete cascade,
  foreign key (workspace_id,version_id)
    references public.content_versions(workspace_id,id) on delete restrict,
  foreign key (workspace_id,destination_id)
    references public.publication_destinations(workspace_id,id) on delete restrict,
  unique (workspace_id,id),
  unique (workspace_id,version_id,destination_id),
  check (remote_url is null or remote_url ~ '^https://')
);

comment on table public.publication_deliveries is
  'One durable delivery intent per immutable content version and destination. This ledger is not dispatched by the current worker yet.';
create index publication_deliveries_due_idx
  on public.publication_deliveries(scheduled_at)
  where status = 'scheduled';
create index publication_deliveries_workspace_idx
  on public.publication_deliveries(workspace_id,created_at desc);

alter table public.publication_destinations enable row level security;
create policy publication_destinations_tenant_read
  on public.publication_destinations for select to authenticated
  using (public.has_role(workspace_id));
alter table public.publication_deliveries enable row level security;
create policy publication_deliveries_tenant_read
  on public.publication_deliveries for select to authenticated
  using (public.has_role(workspace_id));

revoke all on public.publication_destinations, public.publication_deliveries from anon, authenticated;
grant select on public.publication_destinations, public.publication_deliveries to authenticated;

create function public.register_publication_destination(
  p_workspace uuid,
  p_destination_type text,
  p_provider_key text,
  p_display_name text,
  p_target_key text default null,
  p_endpoint_url text default null,
  p_public_config jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  perform manager_private.require_role(p_workspace,array['owner','admin']);
  if jsonb_typeof(coalesce(p_public_config,'{}'::jsonb)) <> 'object'
     or (coalesce(p_public_config,'{}'::jsonb) ?| array[
       'token','access_token','refresh_token','client_secret','secret','password','api_key'
     ]) then
    raise exception 'Public destination config cannot contain credentials';
  end if;
  if p_endpoint_url is not null and p_endpoint_url !~ '^https://' then
    raise exception 'Destination endpoint must use HTTPS';
  end if;
  insert into public.publication_destinations(
    workspace_id,destination_type,provider_key,display_name,target_key,
    endpoint_url,public_config
  ) values (
    p_workspace,p_destination_type,p_provider_key,left(trim(p_display_name),120),
    nullif(trim(p_target_key),''),p_endpoint_url,coalesce(p_public_config,'{}'::jsonb)
  ) returning id into v_id;
  perform manager_private.audit(p_workspace,'publication.destination_registered',v_id,
    jsonb_build_object('type',p_destination_type,'provider',p_provider_key,'ownership_mode','shadow'));
  return v_id;
end
$$;

create function public.set_publication_destination_ownership(
  p_destination uuid,
  p_mode text,
  p_evidence text default ''
) returns void
language plpgsql security definer set search_path=''
as $$
declare d public.publication_destinations;
begin
  select * into d from public.publication_destinations where id=p_destination for update;
  if d.id is null then raise exception 'Destination not found'; end if;
  perform manager_private.require_role(d.workspace_id,array['owner','admin']);
  if p_mode not in ('shadow','active','paused') then raise exception 'Invalid ownership mode'; end if;
  if p_mode='active' and (d.target_key is null or length(trim(coalesce(p_evidence,'')))<20) then
    raise exception 'Activating a destination requires a stable target key and at least 20 characters of cutover evidence';
  end if;
  update public.publication_destinations
    set ownership_mode=p_mode,updated_at=now()
    where id=d.id;
  perform manager_private.audit(d.workspace_id,'publication.destination_ownership_changed',d.id,
    jsonb_build_object('from',d.ownership_mode,'to',p_mode,'evidence',left(coalesce(p_evidence,''),1000)));
end
$$;

create function public.plan_publication_delivery(
  p_workspace uuid,
  p_content uuid,
  p_version uuid,
  p_destination uuid,
  p_scheduled_at timestamptz default now(),
  p_idempotency_key uuid default gen_random_uuid()
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare c public.content_items; d public.publication_destinations; v_id uuid; v_status text;
begin
  perform manager_private.require_role(p_workspace,array['owner','admin','publisher']);
  select * into c from public.content_items
    where id=p_content and workspace_id=p_workspace for share;
  if c.id is null or c.current_version_id is distinct from p_version then
    raise exception 'Delivery must reference the current immutable content version';
  end if;
  perform manager_private.check_approved(c);
  select * into d from public.publication_destinations
    where id=p_destination and workspace_id=p_workspace for share;
  if d.id is null or not d.enabled then raise exception 'Destination is missing or disabled'; end if;
  -- Shadow destinations create plans only; the current worker cannot dispatch this ledger.
  v_status := case when d.ownership_mode='active' then 'scheduled' else 'planned' end;
  insert into public.publication_deliveries(
    workspace_id,content_id,version_id,destination_id,idempotency_key,scheduled_at,status,created_by
  ) values (
    p_workspace,p_content,p_version,p_destination,p_idempotency_key,
    coalesce(p_scheduled_at,now()),v_status,auth.uid()
  )
  on conflict (workspace_id,version_id,destination_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.publication_deliveries
      where workspace_id=p_workspace and version_id=p_version and destination_id=p_destination;
  end if;
  perform manager_private.audit(p_workspace,'publication.delivery_planned',v_id,
    jsonb_build_object('destination_id',p_destination,'status',v_status,'scheduled_at',coalesce(p_scheduled_at,now())));
  return v_id;
end
$$;

revoke all on function public.register_publication_destination(uuid,text,text,text,text,text,jsonb) from public,anon;
revoke all on function public.set_publication_destination_ownership(uuid,text,text) from public,anon;
revoke all on function public.plan_publication_delivery(uuid,uuid,uuid,uuid,timestamptz,uuid) from public,anon;
grant execute on function public.register_publication_destination(uuid,text,text,text,text,text,jsonb) to authenticated;
grant execute on function public.set_publication_destination_ownership(uuid,text,text) to authenticated;
grant execute on function public.plan_publication_delivery(uuid,uuid,uuid,uuid,timestamptz,uuid) to authenticated;
