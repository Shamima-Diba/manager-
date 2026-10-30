-- Dispatch the new publication ledger through the existing isolated worker.
-- Global opt-in remains false until an operator completes a separately approved cutover.
alter table manager_private.system_settings
  add column publication_dispatch_enabled boolean not null default false;
-- The first adapter intentionally reuses a workspace's existing Mastodon OAuth connection.
-- Other provider keys remain non-dispatchable until their own OAuth/receipt adapters exist.
alter table public.publication_deliveries
  add column worker_id text,
  add column lease_token uuid,
  add column lease_until timestamptz,
  add column last_attempt_at timestamptz;

alter table public.publication_deliveries
  add constraint publication_delivery_lease_state
  check (
    (status = 'dispatching' and lease_token is not null and lease_until is not null and worker_id is not null)
    or
    (status <> 'dispatching' and lease_token is null and lease_until is null and worker_id is null)
  );

create index publication_deliveries_claim_idx
  on public.publication_deliveries(scheduled_at, created_at)
  where status = 'scheduled';

create function manager_private.worker_claim_publication(p_worker text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  d public.publication_deliveries;
  dest public.publication_destinations;
  c public.content_items;
  conn public.social_connections;
  encrypted jsonb;
  token uuid;
begin
  -- A crashed worker may have completed the remote side effect. Never blindly retry it.
  update public.publication_deliveries
    set status='needs_reconciliation',
        last_error='Worker lease expired; remote outcome must be reconciled before retry',
        worker_id=null, lease_token=null, lease_until=null, updated_at=now()
    where status='dispatching' and lease_until < now();

  select pd.* into d
  from public.publication_deliveries pd
  join public.publication_destinations x
    on x.workspace_id=pd.workspace_id and x.id=pd.destination_id
  join public.workspaces w on w.id=pd.workspace_id
  join public.content_items ci
    on ci.workspace_id=pd.workspace_id and ci.id=pd.content_id
    and ci.current_version_id=pd.version_id
  join public.approvals a
    on a.workspace_id=pd.workspace_id and a.content_id=pd.content_id
    and a.version_id=pd.version_id and a.decision='approved'
  cross join manager_private.system_settings ss
  where pd.status='scheduled'
    and pd.scheduled_at<=now()
    and x.enabled and x.ownership_mode='active'
    and not w.publishing_paused
    and not ss.publishing_killed
    and ss.publication_dispatch_enabled
  order by pd.scheduled_at,pd.created_at
  limit 1
  for update of pd skip locked;

  if d.id is null then return null; end if;

  select * into dest from public.publication_destinations
    where workspace_id=d.workspace_id and id=d.destination_id;
  select * into c from public.content_items
    where workspace_id=d.workspace_id and id=d.content_id;
  token := gen_random_uuid();

  if dest.provider_key='mastodon' then
    select sc, s.encrypted into conn, encrypted
    from public.social_connections sc
    join public.social_connection_secrets s
      on s.workspace_id=sc.workspace_id and s.connection_id=sc.id
    where sc.workspace_id=d.workspace_id
      and sc.provider='mastodon'
      and sc.status='connected'
      and sc.id::text=dest.public_config->>'connection_id'
    limit 1;
  end if;

  update public.publication_deliveries
    set status='dispatching', attempts=attempts+1, last_attempt_at=now(),
        worker_id=p_worker, lease_token=token, lease_until=now()+interval '90 seconds',
        last_error=null, updated_at=now()
    where id=d.id;

  return jsonb_build_object(
    'delivery',jsonb_build_object(
      'id',d.id,'workspace_id',d.workspace_id,'content_id',d.content_id,
      'version_id',d.version_id,'idempotency_key',d.idempotency_key
    ),
    'content',jsonb_build_object('title',c.title,'body',c.body,'language',c.language),
    'destination',jsonb_build_object(
      'id',dest.id,'provider_key',dest.provider_key,'display_name',dest.display_name,
      'public_config',dest.public_config
    ),
    'connection',case when conn.id is null then null else
      jsonb_build_object('id',conn.id,'origin',conn.origin,'status',conn.status,'account_name',conn.account_name) end,
    'secret',encrypted,
    'lease_token',token
  );
end
$$;

create function manager_private.worker_finish_publication(
  p_delivery uuid,p_token uuid,p_remote_id text,p_remote_url text
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare d public.publication_deliveries;
begin
  select * into d from public.publication_deliveries
    where id=p_delivery and status='dispatching' and lease_token=p_token
      and lease_until>now()
    for update;
  if d.id is null then raise exception 'Publication lease lost'; end if;
  if p_remote_id is null or length(trim(p_remote_id))=0
     or p_remote_url is null or p_remote_url !~ '^https://' then
    raise exception 'Provider receipt is incomplete';
  end if;
  update public.publication_deliveries
    set status='published',remote_id=p_remote_id,remote_url=p_remote_url,
        worker_id=null,lease_token=null,lease_until=null,updated_at=now()
    where id=d.id;
  perform manager_private.audit(d.workspace_id,'publication.delivery_confirmed',d.id,
    jsonb_build_object('destination_id',d.destination_id,'remote_id',p_remote_id,'remote_url',p_remote_url));
end
$$;

create function manager_private.worker_fail_publication(
  p_delivery uuid,p_token uuid,p_category text,p_error text,p_retry_after integer default 60
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare d public.publication_deliveries; next_status text; next_time timestamptz;
begin
  select * into d from public.publication_deliveries
    where id=p_delivery and status='dispatching' and lease_token=p_token
    for update;
  if d.id is null then return; end if;
  if p_category='rate_limit' then
    next_status:='scheduled';
    next_time:=now()+make_interval(secs=>greatest(60,least(86400,coalesce(p_retry_after,60))));
  elsif p_category='unknown' then
    next_status:='needs_reconciliation';
    next_time:=d.scheduled_at;
  else
    next_status:='failed';
    next_time:=d.scheduled_at;
  end if;
  update public.publication_deliveries
    set status=next_status,scheduled_at=next_time,last_error=left(coalesce(p_error,'Delivery failed'),2000),
        worker_id=null,lease_token=null,lease_until=null,updated_at=now()
    where id=d.id;
  perform manager_private.audit(d.workspace_id,'publication.delivery_attempt_failed',d.id,
    jsonb_build_object('category',p_category,'status',next_status,'error',left(coalesce(p_error,''),500)));
end
$$;

revoke all on function manager_private.worker_claim_publication(text) from public,anon,authenticated;
revoke all on function manager_private.worker_finish_publication(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function manager_private.worker_fail_publication(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function manager_private.worker_claim_publication(text) to manager_worker_api;
grant execute on function manager_private.worker_finish_publication(uuid,uuid,text,text) to manager_worker_api;
grant execute on function manager_private.worker_fail_publication(uuid,uuid,text,text,integer) to manager_worker_api;
