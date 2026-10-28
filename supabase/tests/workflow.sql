begin;
insert into auth.users(id,email,email_confirmed_at)values('11000000-0000-4000-8000-000000000001','worker-fixture@example.test',now());
create function pg_temp.ok(condition boolean,label text)returns void language plpgsql as $$begin if not coalesce(condition,false)then raise exception 'FAIL: %',label;end if;raise notice 'PASS: %',label;end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select public.create_workspace('Queue test','queue-fixture')as w \gset
select public.save_content(:'w',null,0,'Queue content','Test body','bn',true)as c \gset
select current_version_id as v from public.content_items where id=:'c' \gset
-- Sensitive review requires explicit notes.
do $$declare c public.content_items;begin select *into c from public.content_items limit 1;begin perform public.review_content(c.id,c.current_version_id,'approved','');raise exception 'FAIL: Sensitive review';exception when raise_exception then if sqlerrm like 'FAIL:%'then raise;end if;end;raise notice 'PASS: Sensitive review notes required';end$$;
reset role;
insert into public.assets(id,workspace_id,object_path,mime,size_bytes,checksum)values('21000000-0000-4000-8000-000000000001',:'w',:'w'||'/21000000-0000-4000-8000-000000000001','image/png',100,repeat('a',64));
insert into public.asset_licenses(workspace_id,asset_id,details)values(:'w','21000000-0000-4000-8000-000000000001','{"commercial":"unknown","modifications":"unknown","editorial_only":false,"license":"unknown","evidence_url":"pending"}');
set local role authenticated;
do $$declare c uuid;begin select id into c from public.content_items limit 1;begin perform public.create_render(c,'21000000-0000-4000-8000-000000000001',null,'','1:1',720,2);raise exception 'FAIL: Unlicensed rendering';exception when raise_exception then if sqlerrm like 'FAIL:%'then raise;end if;end;raise notice 'PASS: ASSET_GUARD blocks unlicensed media';end$$;
reset role;
update public.asset_licenses set decision='approved',details=details||'{"decision":"approved","commercial":"yes","modifications":"allowed","checksum":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'::jsonb where workspace_id=:'w';
set local role authenticated;
select public.create_render(:'c','21000000-0000-4000-8000-000000000001',null,'','1:1',720,2)as r \gset
reset role;
select count(*)as queued_before from pgmq.q_manager_jobs;
select manager_private.worker_claim('fixture-worker')as claimed \gset
select pg_temp.ok(:'claimed'::jsonb->'job'->>'id'=:'r','Worker claims durable render');
select (:'claimed'::jsonb->'run'->>'id')as run_id,(:'claimed'::jsonb->>'token')as lease,(:'claimed'::jsonb->>'msg_id')as msg \gset
select pgmq.send('manager_jobs',jsonb_build_object('run_id',:'run_id'));
select pg_temp.ok(manager_private.worker_claim('duplicate-worker')is null,'Duplicate delivery cannot claim running lease');
select pg_temp.ok(not manager_private.worker_renew(:'run_id',gen_random_uuid(),:'msg','heartbeat'),'Lease fencing rejects wrong token');
select pg_temp.ok(manager_private.worker_renew(:'run_id',:'lease',:'msg','rendering'),'Lease renewal succeeds');
select manager_private.worker_finish(:'run_id',:'lease',:'msg','{"path":"fixture-only","checksum":"test"}');
select pg_temp.ok((select status='succeeded'from public.render_jobs where id=:'r'),'Durable completion updates render');
-- Transactional outbox equivalent: enqueue rollback rolls state AND pgmq message back.
select count(*)as queue_count from pgmq.q_manager_jobs \gset
savepoint rollback_enqueue;
select manager_private.enqueue(:'w','site',:'w');
rollback to rollback_enqueue;
select pg_temp.ok((select count(*)from pgmq.q_manager_jobs)=:'queue_count'::integer,'Atomic enqueue rollback has no orphan message');
-- Recover crashed render after visibility & lease expiry.
select manager_private.enqueue(:'w','render',:'r')as recover \gset
select manager_private.worker_claim('crash-worker')as crash \gset
update public.workflow_runs set lease_until=now()-interval '1 second'where id=:'recover';
update pgmq.q_manager_jobs set vt=now()-interval '1 second'where message->>'run_id'=:'recover';
select manager_private.worker_claim('restart-worker')as restarted \gset
select pg_temp.ok(:'restarted'::jsonb->'run'->>'id'=:'recover','Worker restart recovers expired render');
select manager_private.worker_fail(:'recover',(:'restarted'::jsonb->>'token')::uuid,(:'restarted'::jsonb->>'msg_id')::bigint,'render_error','fixture failure');
update public.workflow_runs set attempts=3 where id=:'recover';update pgmq.q_manager_jobs set vt=now()-interval '1 second'where message->>'run_id'=:'recover';
select manager_private.worker_claim('cap-worker');
select pg_temp.ok((select status='dead_letter'from public.workflow_runs where id=:'recover'),'Retry cap dead-letters job');
-- Publication crash is unknown, not requeued.
insert into public.social_connections(id,workspace_id,provider,origin,account_name)values('31000000-0000-4000-8000-000000000001',:'w','mastodon','https://example.org','fixture');
set local role authenticated;
select public.review_content(:'c',:'v','approved','Explicit sensitive content evidence reviewed.');
select public.schedule_publication(:'c','31000000-0000-4000-8000-000000000001','caption',now()+interval '1 minute','41000000-0000-4000-8000-000000000001')as p \gset
select public.schedule_publication(:'c','31000000-0000-4000-8000-000000000001','caption',now()+interval '1 minute','41000000-0000-4000-8000-000000000001')as p2 \gset
select pg_temp.ok(:'p'=:'p2','Schedule idempotency prevents duplicates');
reset role;
insert into public.social_connection_secrets(connection_id,workspace_id,encrypted)values('31000000-0000-4000-8000-000000000001',:'w','{}');
select manager_private.enqueue(:'w','publish',:'p')as pubrun \gset
select manager_private.worker_claim('publisher-fixture')as pubclaim \gset
update public.workflow_runs set lease_until=now()-interval '1 second'where id=:'pubrun';
update pgmq.q_manager_jobs set vt=now()-interval '1 second'where message->>'run_id'=:'pubrun';
select manager_private.worker_claim('recovery-publisher');
select pg_temp.ok((select status='unknown'from public.scheduled_publications where id=:'p'),'Ambiguous publication is quarantined, not blindly retried');
-- Cancellation is observed by lease renewal.
select manager_private.enqueue(:'w','render',:'r')as cancelled \gset
select manager_private.worker_claim('cancel-fixture')as cancelclaim \gset
set local role authenticated;
select public.cancel_work(:'cancelled','job');
reset role;
select pg_temp.ok(not manager_private.worker_renew(:'cancelled',(:'cancelclaim'::jsonb->>'token')::uuid,(:'cancelclaim'::jsonb->>'msg_id')::bigint,'heartbeat'),'Cancellation fences worker');
rollback;
