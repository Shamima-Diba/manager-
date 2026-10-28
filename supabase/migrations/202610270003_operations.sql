create table manager_private.provider_limits(provider text primary key,next_at timestamptz not null);
insert into manager_private.provider_limits values('mastodon',now());
create function manager_private.worker_health()returns jsonb language sql stable security definer set search_path=''as $$select jsonb_build_object('schema_version','202610270003','queue',to_jsonb(q),'buckets',(select jsonb_agg(id)from storage.buckets),'active_jobs',(select count(*)from public.workflow_runs where status='running'),'dead_letters',(select count(*)from public.workflow_runs where status='dead_letter'),'unknown_publications',(select count(*)from public.scheduled_publications where status='unknown'))from pgmq.metrics('manager_jobs')q$$;
revoke all on function manager_private.worker_health()from public;
grant execute on function manager_private.worker_health()to manager_worker_api;
-- Operator resolution: never retries. Evidence is written to immutable audit history.
create function public.resolve_unknown_publication(p_id uuid,p_provider_id text,p_url text,p_evidence text,p_cancel boolean default false)returns void language plpgsql security definer set search_path=''as $$declare p public.scheduled_publications;begin
 select *into p from public.scheduled_publications where id=p_id for update;perform manager_private.require_role(p.workspace_id,array['owner','admin','publisher']);
 if p.status<>'unknown'then raise exception 'Only unknown publications require resolution';end if;
 if length(trim(p_evidence))<20 then raise exception 'Document reconciliation evidence, minimum 20 characters';end if;
 -- This is manual operator resolution, not automatic provider confirmation. Do not allow marking published here.
 if not p_cancel then raise exception 'Automatic confirmation unavailable: inspect provider, then record cancellation without reposting';end if;
 update public.scheduled_publications set status='cancelled',error='Human resolved unknown outcome; see audit'where id=p.id;
 perform manager_private.audit(p.workspace_id,'publication.unknown_resolved_manual',p.id,jsonb_build_object('provider_id',p_provider_id,'url',p_url,'evidence',p_evidence));
end$$;
revoke all on function public.resolve_unknown_publication(uuid,text,text,text,boolean)from public;
grant execute on function public.resolve_unknown_publication(uuid,text,text,text,boolean)to authenticated;
-- Optional Supabase Cron uses only short database dispatch, never long compute.
-- Install pg_cron separately if available, then: select cron.schedule('manager-dispatch','* * * * *','select manager_private.worker_dispatch()');
-- The worker also dispatches, so cron is NOT required and dispatch is idempotent.
