-- Run after all migrations against the disposable PostgreSQL/Supabase test schema.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/publication-destinations.sql
begin;
insert into auth.users(id,email,email_confirmed_at)
values ('12000000-0000-4000-8000-000000000001','destination-owner@example.test',now());
create function pg_temp.ok(condition boolean,label text)
returns void language plpgsql as $$
begin
  if not coalesce(condition,false) then raise exception 'FAIL: %',label; end if;
  raise notice 'PASS: %',label;
end
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000001',true);
select public.create_workspace('Destination fixture','destination-fixture') as w \gset
select public.save_content(:'w',null,0,'Approved fixture article','Fixture body','bn',true) as c \gset
select current_version_id as v from public.content_items where id=:'c' \gset
select public.review_content(:'c',:'v','approved','Sensitive fixture reviewed with explicit evidence.');
select public.register_publication_destination(
  :'w','website','manager_static','Built-in publication site','fixture:site:primary',null,'{"site_slug":"destination-fixture"}'
) as d \gset
select pg_temp.ok(
  (select ownership_mode='shadow' and not enabled from public.publication_destinations where id=:'d'),
  'New destination starts in non-dispatching shadow mode'
);
select public.set_publication_destination_ownership(
  :'d','active','Cutover reviewed: this fixture owns the isolated test target only.'
);
select pg_temp.ok(
  (select ownership_mode='active' and enabled from public.publication_destinations where id=:'d'),
  'Explicit ownership activation enables the destination'
);
select public.plan_publication_delivery(:'w',:'c',:'v',:'d',now()+interval '5 minutes') as delivery \gset
select pg_temp.ok(
  (select status='scheduled' and version_id=:'v'::uuid from public.publication_deliveries where id=:'delivery'),
  'Delivery plan is bound to the approved immutable version'
);
select public.plan_publication_delivery(:'w',:'c',:'v',:'d',now()+interval '5 minutes') as duplicate \gset
select pg_temp.ok(:'delivery'=:'duplicate','Repeated planning returns the same delivery record');
select pg_temp.ok(
  (select count(*)=1 from public.publication_deliveries where workspace_id=:'w' and version_id=:'v' and destination_id=:'d'),
  'Unique version/destination constraint prevents duplicate delivery intents'
);
do $$
begin
  begin
    perform public.register_publication_destination(
      current_setting('test.workspace_id',true)::uuid,
      'social','mastodon','Secret must be rejected','fixture:social:secret',null,'{"access_token":"not-allowed"}'
    );
    raise exception 'FAIL: secret-like public config accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  raise notice 'PASS: credential-like public config rejected';
end
$$;
reset role;
rollback;
