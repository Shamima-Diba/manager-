-- End-to-end SQL contract for the new ledger worker RPCs.
-- Run after every migration on a disposable PostgreSQL 17 / Supabase database.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/publication-worker.sql
begin;
insert into auth.users(id,email,email_confirmed_at)
values ('13000000-0000-4000-8000-000000000001','publication-worker@example.test',now());

set local role authenticated;
select set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000001',true);
select public.create_workspace('Worker fixture','worker-fixture') as w \gset
select public.save_content(:'w',null,0,'Worker fixture article','Approved fixture body','bn',true) as c \gset
select current_version_id as v from public.content_items where id=:'c' \gset
select public.review_content(:'c',:'v','approved','Disposable worker test approval evidence.');
reset role;

insert into public.social_connections(id,workspace_id,provider,origin,account_name,status)
values (
  '13000000-0000-4000-8000-000000000002',:'w','mastodon',
  'https://mastodon.example','fixture@example.test','connected'
);
insert into public.social_connection_secrets(connection_id,workspace_id,encrypted)
values (
  '13000000-0000-4000-8000-000000000002',:'w',
  '{"kid":"fixture-key","iv":"AA==","ciphertext":"AA==","tag":"AA=="}'::jsonb
);

set local role authenticated;
select public.register_publication_destination(
  :'w','social','mastodon','Fixture Mastodon','fixture:mastodon:account',null,
  '{"connection_id":"13000000-0000-4000-8000-000000000002"}'::jsonb
) as d \gset
select public.set_publication_destination_ownership(
  :'d','active','Isolated fixture only; no external provider request is made.'
);
select public.plan_publication_delivery(:'w',:'c',:'v',:'d',now()) as delivery \gset
reset role;

set local role manager_worker_api;
select manager_private.worker_claim_publication('fixture-worker') as claim \gset
reset role;

select (:'claim'::jsonb->'delivery'->>'id') as claimed_id,
       (:'claim'::jsonb->>'lease_token') as lease_token \gset
select (:'claim'::jsonb->'destination'->>'provider_key')='mastodon' as adapter,
       (:'claim'::jsonb->'secret'->>'kid')='fixture-key' as private_secret_loaded \gset
select case when :'adapter'='t' and :'private_secret_loaded'='t'
  then 1 else 1/0 end;
select (select status='dispatching' and worker_id='fixture-worker'
  from public.publication_deliveries where id=:'claimed_id'::uuid) as leased \gset
select case when :'leased'='t' then 1 else 1/0 end;

set local role manager_worker_api;
select manager_private.worker_finish_publication(
  :'claimed_id'::uuid,:'lease_token'::uuid,'fixture-remote-1',
  'https://mastodon.example/@fixture/1'
);
reset role;

select case when (select status='published'
  and remote_id='fixture-remote-1'
  and remote_url='https://mastodon.example/@fixture/1'
  and lease_token is null
  from public.publication_deliveries where id=:'claimed_id'::uuid)
  then 1 else 1/0 end;

rollback;
