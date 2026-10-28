-- Runnable with psql -v ON_ERROR_STOP=1; rollback leaves no fixtures.
begin;
insert into auth.users(id,email,email_confirmed_at)values('10000000-0000-4000-8000-000000000001','owner-a@example.test',now()),('10000000-0000-4000-8000-000000000002','owner-b@example.test',now()),('10000000-0000-4000-8000-000000000003','viewer@example.test',now());
create function pg_temp.ok(condition boolean,label text)returns void language plpgsql as $$begin if not coalesce(condition,false)then raise exception 'FAIL: %',label;end if;raise notice 'PASS: %',label;end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.create_workspace('Tenant A','tenant-alpha')as wa \gset
select public.save_content(:'wa',null,0,'প্রথম সংবাদ','Evidence-backed Bengali article','bn',true)as ca \gset
select public.create_workspace('Tenant B','tenant-beta')as wb \gset
reset role;
update public.workspace_members set user_id='10000000-0000-4000-8000-000000000002'where workspace_id=:'wb';
insert into public.workspace_members values(:'wa','10000000-0000-4000-8000-000000000003','viewer');
set local role authenticated;
select pg_temp.ok((select count(*)=1 from public.workspaces),'Tenant read isolation');
select pg_temp.ok((select count(*)=0 from public.workspace_members where workspace_id=:'wb'),'Membership isolation');
-- Catch expected security exceptions, fail if action succeeds.
do $$declare w uuid;c uuid;begin
 select id into w from public.workspaces limit 1;select id into c from public.content_items limit 1;
 begin perform public.publish_website(c,'article','description','news');raise exception 'FAIL: Approval bypass';exception when raise_exception then if sqlerrm like 'FAIL:%'then raise;end if;end;
 begin perform public.set_member_role(w,auth.uid(),'editor');raise exception 'FAIL: Final owner';exception when raise_exception then if sqlerrm like 'FAIL:%'then raise;end if;end;
 raise notice 'PASS: Unapproved publishing blocked; final owner preserved';end$$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $$declare w uuid;c uuid;begin select id into w from public.workspaces limit 1;select id into c from public.content_items limit 1;
 begin perform public.save_content(w,null,0,'blocked','body');raise exception 'FAIL: Viewer write';exception when insufficient_privilege then null;end;
 begin perform public.invite_member(w,'evil@example.test','owner');raise exception 'FAIL: Invitation restriction';exception when insufficient_privilege then null;end;
 begin update public.workspace_members set role='owner'where user_id=auth.uid();raise exception 'FAIL: Role escalation';exception when insufficient_privilege then null;end;
 begin perform public.publish_website(c,'evil','evil','news');raise exception 'FAIL: Unauthorized publication';exception when insufficient_privilege then null;end;
 raise notice 'PASS: Viewer write, invitation, role escalation and publishing denied';end$$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
-- Workspace UUID storage prefix plus membership and immutable upload policy.
insert into storage.objects(bucket_id,name)values('source-assets',:'wa'||'/20000000-0000-4000-8000-000000000001');
select pg_temp.ok((select count(*)=0 from storage.objects where name like :'wb'||'/%'),'Storage tenant isolation');
select set_config('test.other_workspace',:'wb',true);
do $$begin
 begin insert into storage.objects(bucket_id,name)values('source-assets',current_setting('test.other_workspace')||'/20000000-0000-4000-8000-000000000002');raise exception 'FAIL: Cross tenant upload';exception when insufficient_privilege then null;end;
 raise notice 'PASS: Cross tenant storage upload denied';end$$;
-- Explicit review binds to immutable version. Editing invalidates it.
select current_version_id as cv from public.content_items where id=:'ca' \gset
select public.review_content(:'ca',:'cv','approved','Evidence checked against source documents.');
select public.publish_website(:'ca','approved-article','Public excerpt','news');
select public.save_content(:'wa',:'ca',1,'Edited title','PRIVATE_DRAFT_SHOULD_NOT_EXPORT','bn',true);
select pg_temp.ok((select status='draft'from public.content_items where id=:'ca'),'Edit invalidates current approval');
select pg_temp.ok(not public.public_site_data()::text like '%PRIVATE_DRAFT_SHOULD_NOT_EXPORT%','Public export excludes private edited draft');
do $$declare c uuid;begin select id into c from public.content_items limit 1;begin perform public.publish_website(c,'bypass','x','news');raise exception 'FAIL: Reapproval required';exception when raise_exception then if sqlerrm like 'FAIL:%'then raise;end if;end;raise notice 'PASS: Approval cannot be reused after edit';end$$;
-- Optimistic concurrency rejects stale saves.
select set_config('test.workspace',:'wa',true);select set_config('test.content',:'ca',true);
do $$begin begin perform public.save_content(current_setting('test.workspace')::uuid,current_setting('test.content')::uuid,1,'stale','x');raise exception 'FAIL: Optimistic concurrency';exception when raise_exception then if sqlerrm like 'FAIL:%'then raise;end if;end;raise notice 'PASS: Stale content save blocked';end$$;
rollback;
