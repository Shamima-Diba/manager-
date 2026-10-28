-- manager core schema. All time fields are timestamptz (UTC at API boundaries).
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgmq;
select pgmq.create('manager_jobs');
create schema manager_private;
revoke all on schema manager_private from public;
create type public.workspace_role as enum('owner','admin','editor','reviewer','publisher','viewer');
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade, display_name text not null default '', language text not null default 'bn' check(language in ('bn','en')));
create table public.workspaces(id uuid primary key default gen_random_uuid(),name text not null,slug text not null unique check(slug ~ '^[a-z0-9][a-z0-9-]{2,60}$'),publishing_paused boolean not null default false,created_at timestamptz not null default now());
create table public.workspace_members(workspace_id uuid references public.workspaces(id) on delete cascade,user_id uuid references auth.users(id) on delete restrict,role public.workspace_role not null,primary key(workspace_id,user_id));
create function public.has_role(w uuid,roles text[] default array['owner','admin','editor','reviewer','publisher','viewer']) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid() and role::text=any(roles)) $$;
create table manager_private.system_settings(singleton boolean primary key default true check(singleton),publishing_killed boolean not null default false,require_verified_email boolean not null default true);
insert into manager_private.system_settings(singleton) values(true);
create table public.workspace_invitations(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,email text not null,role public.workspace_role not null,token_hash text not null unique,expires_at timestamptz not null,accepted_at timestamptz,created_at timestamptz default now());
create table public.content_items(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,title text not null,body text not null default '',language text not null default 'bn' check(language in ('bn','en')),sensitive boolean not null default true,status text not null default 'draft' check(status in('draft','researching','script_ready','media_ready','ready_for_review','approved','archived')),version integer not null default 1,current_version_id uuid,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(workspace_id,id));
create table public.content_versions(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,content_id uuid not null,version integer not null,payload jsonb not null,sha256 text not null,created_at timestamptz not null default now(),foreign key(workspace_id,content_id) references public.content_items(workspace_id,id) on delete cascade,unique(content_id,version),unique(workspace_id,id));
alter table public.content_items add constraint content_current_version foreign key(workspace_id,current_version_id) references public.content_versions(workspace_id,id) deferrable initially deferred;
create table public.assets(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,bucket text not null default 'source-assets' check(bucket in('source-assets','generated-audio','subtitle-files')),object_path text not null unique,mime text not null,size_bytes bigint not null check(size_bytes>0 and size_bytes<=52428800),checksum text not null check(checksum ~ '^[a-f0-9]{64}$'),created_at timestamptz not null default now(),unique(workspace_id,id));
create table public.asset_licenses(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,asset_id uuid not null unique,details jsonb not null,decision text not null default 'pending' check(decision in('pending','approved','rejected')),reviewed_by uuid references auth.users(id),reviewed_at timestamptz,foreign key(workspace_id,asset_id) references public.assets(workspace_id,id) on delete cascade);
create table public.scripts(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,content_id uuid not null,version integer not null default 1,narration text not null default '',structured_output jsonb,created_at timestamptz not null default now(),foreign key(workspace_id,content_id) references public.content_items(workspace_id,id) on delete cascade,unique(workspace_id,id));
create table public.approvals(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,content_id uuid not null,version_id uuid not null,artifact_hash text,decision text not null check(decision in('approved','rejected','changes_requested')),comment text not null default '',reviewer_id uuid not null references auth.users(id),created_at timestamptz not null default now(),foreign key(workspace_id,content_id) references public.content_items(workspace_id,id) on delete cascade,foreign key(workspace_id,version_id) references public.content_versions(workspace_id,id),unique(content_id,version_id));
create table public.render_jobs(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,content_id uuid not null,version_id uuid not null,status text not null default 'queued' check(status in('queued','running','succeeded','failed','cancelled')),spec jsonb not null,artifact_path text,metadata jsonb,error text,created_at timestamptz not null default now(),foreign key(workspace_id,content_id) references public.content_items(workspace_id,id),foreign key(workspace_id,version_id) references public.content_versions(workspace_id,id),unique(workspace_id,id));
create table public.website_posts(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,content_id uuid not null unique,version_id uuid not null,slug text not null check(slug ~ '^[a-z0-9][a-z0-9-]{0,100}$'),title text not null,body text not null,description text not null,category text not null default 'news',correction_note text not null default '',published_at timestamptz not null default now(),foreign key(workspace_id,content_id) references public.content_items(workspace_id,id),foreign key(workspace_id,version_id) references public.content_versions(workspace_id,id),unique(workspace_id,slug));
create table public.social_connections(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,provider text not null check(provider='mastodon'),origin text not null,account_name text not null,status text not null default 'connected' check(status in('connected','disconnected','expired')),expires_at timestamptz,created_at timestamptz default now(),unique(workspace_id,id));
create table public.social_connection_secrets(connection_id uuid primary key references public.social_connections(id) on delete cascade,workspace_id uuid not null references public.workspaces(id) on delete cascade,encrypted jsonb not null,updated_at timestamptz default now());
create table public.scheduled_publications(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,content_id uuid not null,version_id uuid not null,connection_id uuid not null,caption text not null check(length(caption) between 1 and 500),scheduled_at timestamptz not null,status text not null default 'scheduled' check(status in('draft','awaiting_approval','scheduled','dispatching','published','rejected','failed','unknown','cancelled')),idempotency_key uuid not null unique,provider_id text,provider_url text,error text,created_at timestamptz not null default now(),foreign key(workspace_id,content_id) references public.content_items(workspace_id,id),foreign key(workspace_id,version_id) references public.content_versions(workspace_id,id),foreign key(workspace_id,connection_id) references public.social_connections(workspace_id,id),unique(workspace_id,id));
create table public.publication_attempts(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,publication_id uuid not null,category text not null,result jsonb,created_at timestamptz default now(),foreign key(workspace_id,publication_id) references public.scheduled_publications(workspace_id,id));
create table public.workflow_runs(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,kind text not null check(kind in('render','publish','site','script')),entity_id uuid,status text not null default 'queued' check(status in('queued','running','succeeded','failed','cancelled','unknown','dead_letter')),payload jsonb not null default '{}',result jsonb,attempts integer not null default 0,lease_token uuid,lease_until timestamptz,worker_id text,error text,created_at timestamptz not null default now(),unique(workspace_id,id));
create table public.workflow_steps(id bigint generated always as identity primary key,workspace_id uuid not null,run_id uuid not null,stage text not null,details jsonb not null default '{}',created_at timestamptz not null default now(),foreign key(workspace_id,run_id) references public.workflow_runs(workspace_id,id));
create table public.audit_logs(id bigint generated always as identity primary key,workspace_id uuid not null references public.workspaces(id) on delete cascade,actor_id uuid,action text not null,entity_id uuid,details jsonb not null default '{}',created_at timestamptz not null default now());
create table public.worker_heartbeats(id text primary key,last_seen timestamptz not null default now(),details jsonb not null default '{}');
create table public.site_rebuild_requests(workspace_id uuid primary key references public.workspaces(id) on delete cascade,requested_at timestamptz not null default now(),generation bigint not null default 1);
create table manager_private.oauth_states(state_hash text primary key,user_id uuid not null,workspace_id uuid not null references public.workspaces(id),verifier text not null,expires_at timestamptz not null);
create table public.brands(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,name text not null,primary_color text not null default '#2563eb',logo_asset_id uuid,created_at timestamptz not null default now(),unique(workspace_id,id));
create table public.news_sources(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,name text not null,url text not null,kind text not null check(kind in('rss','atom','url','manual')),allowed boolean not null default true,created_at timestamptz not null default now(),unique(workspace_id,id));
create table public.source_items(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,source_url text,source_name text not null default '',published_at timestamptz,retrieved_at timestamptz not null default now(),author text,excerpt text not null,user_notes text not null default '',fingerprint text not null,created_at timestamptz not null default now(),unique(workspace_id,id));
create table public.research_notes(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,content_id uuid not null,claim text not null,evidence_url text,classification text not null check(classification in('verified','allegation','commentary','uncertain','conflicting')),notes text not null default '',created_at timestamptz not null default now(),unique(workspace_id,id));
create table public.script_versions(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,script_id uuid not null,version integer not null,narration text not null,created_at timestamptz not null default now(),unique(workspace_id,id));
create table public.asset_usage(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,asset_id uuid not null,render_id uuid not null,created_at timestamptz not null default now(),unique(workspace_id,id));
create table public.voice_profiles(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,name text not null,provider text not null,voice_id text,consent_notes text not null default '',pronunciation_dictionary jsonb not null default '{}',created_at timestamptz not null default now(),unique(workspace_id,id));
create table public.narrations(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,content_id uuid not null,asset_id uuid not null,provenance jsonb not null default '{}',created_at timestamptz not null default now(),unique(workspace_id,id));
create table public.subtitle_tracks(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,content_id uuid not null,format text not null check(format in('srt','vtt')),body text not null,created_at timestamptz not null default now(),unique(workspace_id,id));
create table public.video_projects(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,content_id uuid not null,name text not null,settings jsonb not null default '{}',created_at timestamptz not null default now(),unique(workspace_id,id));
create table public.website_pages(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,slug text not null,title text not null,body text not null default '',created_at timestamptz not null default now(),unique(workspace_id,id));
create table public.website_categories(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,slug text not null,name text not null,created_at timestamptz not null default now(),unique(workspace_id,id));
create table public.website_settings(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,site_title text not null,description text not null default '',about_text text not null default '',contact_text text not null default '',created_at timestamptz not null default now(),unique(workspace_id,id));
create table public.publication_targets(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,connection_id uuid not null,name text not null,created_at timestamptz not null default now(),unique(workspace_id,id));
create table public.provider_events(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,provider text not null,event_key text not null,payload jsonb not null,received_at timestamptz not null default now(),created_at timestamptz not null default now(),unique(workspace_id,id));
create table public.analytics_snapshots(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,connection_id uuid,measured_at timestamptz not null,metrics jsonb not null,created_at timestamptz not null default now(),unique(workspace_id,id));
create table public.automation_rules(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,name text not null,enabled boolean not null default false,conditions jsonb not null,actions jsonb not null,created_at timestamptz not null default now(),unique(workspace_id,id));
create table public.integration_settings(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,provider text not null,enabled boolean not null default false,public_config jsonb not null default '{}',created_at timestamptz not null default now(),unique(workspace_id,id));
create table public.usage_events(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,kind text not null,quantity numeric not null,unit text not null,estimated boolean not null default false,created_at timestamptz not null default now(),unique(workspace_id,id));
alter table public.research_notes add foreign key(workspace_id,content_id) references public.content_items(workspace_id,id);
alter table public.script_versions add foreign key(workspace_id,script_id) references public.scripts(workspace_id,id);
alter table public.asset_usage add foreign key(workspace_id,asset_id) references public.assets(workspace_id,id);
alter table public.asset_usage add foreign key(workspace_id,render_id) references public.render_jobs(workspace_id,id);
alter table public.narrations add foreign key(workspace_id,content_id) references public.content_items(workspace_id,id);
alter table public.narrations add foreign key(workspace_id,asset_id) references public.assets(workspace_id,id);
alter table public.subtitle_tracks add foreign key(workspace_id,content_id) references public.content_items(workspace_id,id);
alter table public.video_projects add foreign key(workspace_id,content_id) references public.content_items(workspace_id,id);
alter table public.publication_targets add foreign key(workspace_id,connection_id) references public.social_connections(workspace_id,id);
alter table public.analytics_snapshots add foreign key(workspace_id,connection_id) references public.social_connections(workspace_id,id);
alter table public.brands add foreign key(workspace_id,logo_asset_id) references public.assets(workspace_id,id);
create unique index source_fingerprint on public.source_items(workspace_id,fingerprint);
create unique index provider_event_dedupe on public.provider_events(workspace_id,provider,event_key);
create index publications_due on public.scheduled_publications(scheduled_at) where status='scheduled';
create index active_workflows on public.workflow_runs(workspace_id,lease_until) where status='running';
create index workflow_timeline on public.workflow_steps(run_id,created_at);
create index content_history on public.content_versions(content_id,version desc);
-- All tenant tables: read membership, explicit write policies only below.
alter table public.workspace_invitations enable row level security;
create policy tenant_read on public.workspace_invitations for select to authenticated using(public.has_role(workspace_id));
create index if not exists workspace_invitations_workspace_idx on public.workspace_invitations(workspace_id);
alter table public.content_items enable row level security;
create policy tenant_read on public.content_items for select to authenticated using(public.has_role(workspace_id));
create index if not exists content_items_workspace_idx on public.content_items(workspace_id);
alter table public.content_versions enable row level security;
create policy tenant_read on public.content_versions for select to authenticated using(public.has_role(workspace_id));
create index if not exists content_versions_workspace_idx on public.content_versions(workspace_id);
alter table public.assets enable row level security;
create policy tenant_read on public.assets for select to authenticated using(public.has_role(workspace_id));
create index if not exists assets_workspace_idx on public.assets(workspace_id);
alter table public.asset_licenses enable row level security;
create policy tenant_read on public.asset_licenses for select to authenticated using(public.has_role(workspace_id));
create index if not exists asset_licenses_workspace_idx on public.asset_licenses(workspace_id);
alter table public.scripts enable row level security;
create policy tenant_read on public.scripts for select to authenticated using(public.has_role(workspace_id));
create index if not exists scripts_workspace_idx on public.scripts(workspace_id);
alter table public.approvals enable row level security;
create policy tenant_read on public.approvals for select to authenticated using(public.has_role(workspace_id));
create index if not exists approvals_workspace_idx on public.approvals(workspace_id);
alter table public.render_jobs enable row level security;
create policy tenant_read on public.render_jobs for select to authenticated using(public.has_role(workspace_id));
create index if not exists render_jobs_workspace_idx on public.render_jobs(workspace_id);
alter table public.website_posts enable row level security;
create policy tenant_read on public.website_posts for select to authenticated using(public.has_role(workspace_id));
create index if not exists website_posts_workspace_idx on public.website_posts(workspace_id);
alter table public.social_connections enable row level security;
create policy tenant_read on public.social_connections for select to authenticated using(public.has_role(workspace_id));
create index if not exists social_connections_workspace_idx on public.social_connections(workspace_id);
alter table public.scheduled_publications enable row level security;
create policy tenant_read on public.scheduled_publications for select to authenticated using(public.has_role(workspace_id));
create index if not exists scheduled_publications_workspace_idx on public.scheduled_publications(workspace_id);
alter table public.publication_attempts enable row level security;
create policy tenant_read on public.publication_attempts for select to authenticated using(public.has_role(workspace_id));
create index if not exists publication_attempts_workspace_idx on public.publication_attempts(workspace_id);
alter table public.workflow_runs enable row level security;
create policy tenant_read on public.workflow_runs for select to authenticated using(public.has_role(workspace_id));
create index if not exists workflow_runs_workspace_idx on public.workflow_runs(workspace_id);
alter table public.workflow_steps enable row level security;
create policy tenant_read on public.workflow_steps for select to authenticated using(public.has_role(workspace_id));
create index if not exists workflow_steps_workspace_idx on public.workflow_steps(workspace_id);
alter table public.audit_logs enable row level security;
create policy tenant_read on public.audit_logs for select to authenticated using(public.has_role(workspace_id));
create index if not exists audit_logs_workspace_idx on public.audit_logs(workspace_id);
alter table public.site_rebuild_requests enable row level security;
create policy tenant_read on public.site_rebuild_requests for select to authenticated using(public.has_role(workspace_id));
create index if not exists site_rebuild_requests_workspace_idx on public.site_rebuild_requests(workspace_id);
alter table public.brands enable row level security;
create policy tenant_read on public.brands for select to authenticated using(public.has_role(workspace_id));
create index if not exists brands_workspace_idx on public.brands(workspace_id);
alter table public.news_sources enable row level security;
create policy tenant_read on public.news_sources for select to authenticated using(public.has_role(workspace_id));
create index if not exists news_sources_workspace_idx on public.news_sources(workspace_id);
alter table public.source_items enable row level security;
create policy tenant_read on public.source_items for select to authenticated using(public.has_role(workspace_id));
create index if not exists source_items_workspace_idx on public.source_items(workspace_id);
alter table public.research_notes enable row level security;
create policy tenant_read on public.research_notes for select to authenticated using(public.has_role(workspace_id));
create index if not exists research_notes_workspace_idx on public.research_notes(workspace_id);
alter table public.script_versions enable row level security;
create policy tenant_read on public.script_versions for select to authenticated using(public.has_role(workspace_id));
create index if not exists script_versions_workspace_idx on public.script_versions(workspace_id);
alter table public.asset_usage enable row level security;
create policy tenant_read on public.asset_usage for select to authenticated using(public.has_role(workspace_id));
create index if not exists asset_usage_workspace_idx on public.asset_usage(workspace_id);
alter table public.voice_profiles enable row level security;
create policy tenant_read on public.voice_profiles for select to authenticated using(public.has_role(workspace_id));
create index if not exists voice_profiles_workspace_idx on public.voice_profiles(workspace_id);
alter table public.narrations enable row level security;
create policy tenant_read on public.narrations for select to authenticated using(public.has_role(workspace_id));
create index if not exists narrations_workspace_idx on public.narrations(workspace_id);
alter table public.subtitle_tracks enable row level security;
create policy tenant_read on public.subtitle_tracks for select to authenticated using(public.has_role(workspace_id));
create index if not exists subtitle_tracks_workspace_idx on public.subtitle_tracks(workspace_id);
alter table public.video_projects enable row level security;
create policy tenant_read on public.video_projects for select to authenticated using(public.has_role(workspace_id));
create index if not exists video_projects_workspace_idx on public.video_projects(workspace_id);
alter table public.website_pages enable row level security;
create policy tenant_read on public.website_pages for select to authenticated using(public.has_role(workspace_id));
create index if not exists website_pages_workspace_idx on public.website_pages(workspace_id);
alter table public.website_categories enable row level security;
create policy tenant_read on public.website_categories for select to authenticated using(public.has_role(workspace_id));
create index if not exists website_categories_workspace_idx on public.website_categories(workspace_id);
alter table public.website_settings enable row level security;
create policy tenant_read on public.website_settings for select to authenticated using(public.has_role(workspace_id));
create index if not exists website_settings_workspace_idx on public.website_settings(workspace_id);
alter table public.publication_targets enable row level security;
create policy tenant_read on public.publication_targets for select to authenticated using(public.has_role(workspace_id));
create index if not exists publication_targets_workspace_idx on public.publication_targets(workspace_id);
alter table public.provider_events enable row level security;
create policy tenant_read on public.provider_events for select to authenticated using(public.has_role(workspace_id));
create index if not exists provider_events_workspace_idx on public.provider_events(workspace_id);
alter table public.analytics_snapshots enable row level security;
create policy tenant_read on public.analytics_snapshots for select to authenticated using(public.has_role(workspace_id));
create index if not exists analytics_snapshots_workspace_idx on public.analytics_snapshots(workspace_id);
alter table public.automation_rules enable row level security;
create policy tenant_read on public.automation_rules for select to authenticated using(public.has_role(workspace_id));
create index if not exists automation_rules_workspace_idx on public.automation_rules(workspace_id);
alter table public.integration_settings enable row level security;
create policy tenant_read on public.integration_settings for select to authenticated using(public.has_role(workspace_id));
create index if not exists integration_settings_workspace_idx on public.integration_settings(workspace_id);
alter table public.usage_events enable row level security;
create policy tenant_read on public.usage_events for select to authenticated using(public.has_role(workspace_id));
create index if not exists usage_events_workspace_idx on public.usage_events(workspace_id);
create policy editorial_insert on public.news_sources for insert to authenticated with check(public.has_role(workspace_id,array['owner','admin','editor']));
create policy editorial_update on public.news_sources for update to authenticated using(public.has_role(workspace_id,array['owner','admin','editor'])) with check(public.has_role(workspace_id,array['owner','admin','editor']));
create policy editorial_insert on public.source_items for insert to authenticated with check(public.has_role(workspace_id,array['owner','admin','editor']));
create policy editorial_update on public.source_items for update to authenticated using(public.has_role(workspace_id,array['owner','admin','editor'])) with check(public.has_role(workspace_id,array['owner','admin','editor']));
create policy editorial_insert on public.research_notes for insert to authenticated with check(public.has_role(workspace_id,array['owner','admin','editor']));
create policy editorial_update on public.research_notes for update to authenticated using(public.has_role(workspace_id,array['owner','admin','editor'])) with check(public.has_role(workspace_id,array['owner','admin','editor']));
create policy editorial_insert on public.subtitle_tracks for insert to authenticated with check(public.has_role(workspace_id,array['owner','admin','editor']));
create policy editorial_update on public.subtitle_tracks for update to authenticated using(public.has_role(workspace_id,array['owner','admin','editor'])) with check(public.has_role(workspace_id,array['owner','admin','editor']));
create policy editorial_insert on public.voice_profiles for insert to authenticated with check(public.has_role(workspace_id,array['owner','admin','editor']));
create policy editorial_update on public.voice_profiles for update to authenticated using(public.has_role(workspace_id,array['owner','admin','editor'])) with check(public.has_role(workspace_id,array['owner','admin','editor']));
create policy editorial_insert on public.brands for insert to authenticated with check(public.has_role(workspace_id,array['owner','admin','editor']));
create policy editorial_update on public.brands for update to authenticated using(public.has_role(workspace_id,array['owner','admin','editor'])) with check(public.has_role(workspace_id,array['owner','admin','editor']));
create policy editorial_insert on public.website_pages for insert to authenticated with check(public.has_role(workspace_id,array['owner','admin','editor']));
create policy editorial_update on public.website_pages for update to authenticated using(public.has_role(workspace_id,array['owner','admin','editor'])) with check(public.has_role(workspace_id,array['owner','admin','editor']));
create policy editorial_insert on public.website_categories for insert to authenticated with check(public.has_role(workspace_id,array['owner','admin','editor']));
create policy editorial_update on public.website_categories for update to authenticated using(public.has_role(workspace_id,array['owner','admin','editor'])) with check(public.has_role(workspace_id,array['owner','admin','editor']));
create policy editorial_insert on public.website_settings for insert to authenticated with check(public.has_role(workspace_id,array['owner','admin','editor']));
create policy editorial_update on public.website_settings for update to authenticated using(public.has_role(workspace_id,array['owner','admin','editor'])) with check(public.has_role(workspace_id,array['owner','admin','editor']));
alter table public.profiles enable row level security;
create policy own_profile on public.profiles for all to authenticated using(id=auth.uid()) with check(id=auth.uid());
alter table public.workspaces enable row level security;
create policy workspace_read on public.workspaces for select to authenticated using(public.has_role(id));
alter table public.workspace_members enable row level security;
create policy member_read on public.workspace_members for select to authenticated using(public.has_role(workspace_id));
alter table public.social_connection_secrets enable row level security;
alter table public.worker_heartbeats enable row level security;
create policy heartbeat_read on public.worker_heartbeats for select to authenticated using(exists(select 1 from public.workspace_members where user_id=auth.uid() and role in('owner','admin')));
create function manager_private.audit(w uuid,a text,e uuid default null,d jsonb default '{}') returns void language sql security definer set search_path='' as $$ insert into public.audit_logs(workspace_id,actor_id,action,entity_id,details) values(w,auth.uid(),a,e,d) $$;
create function manager_private.require_role(w uuid,r text[]) returns void language plpgsql security definer set search_path='' as $$begin
 if not public.has_role(w,r) then raise exception 'Permission denied' using errcode='42501'; end if;
end$$;
create function manager_private.check_approved(c public.content_items) returns void language plpgsql security definer set search_path='' as $$ begin
 if not exists(select 1 from public.approvals where content_id=c.id and version_id=c.current_version_id and decision='approved') then raise exception 'Current immutable version requires explicit review'; end if;
end$$;
create function manager_private.snapshot(c public.content_items) returns uuid language plpgsql security definer set search_path='' as $$declare v uuid; p jsonb;begin
 p=jsonb_build_object('title',c.title,'body',c.body,'language',c.language,'sensitive',c.sensitive);
 insert into public.content_versions(workspace_id,content_id,version,payload,sha256) values(c.workspace_id,c.id,c.version,p,encode(extensions.digest(p::text,'sha256'),'hex')) returning id into v;
 update public.content_items set current_version_id=v,status='draft' where id=c.id;return v;
end$$;
create function public.create_workspace(p_name text,p_slug text) returns uuid language plpgsql security definer set search_path='' as $$declare w uuid;begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 if (select require_verified_email from manager_private.system_settings) and not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Verify your email first';end if;
 insert into public.workspaces(name,slug)values(left(p_name,120),p_slug)returning id into w;
 insert into public.workspace_members values(w,auth.uid(),'owner');
 insert into public.website_settings(workspace_id,site_title) values(w,p_name);
 perform manager_private.audit(w,'workspace.created',w);return w;
end$$;
create function public.save_content(p_workspace uuid,p_id uuid,p_version integer,p_title text,p_body text,p_language text default 'bn',p_sensitive boolean default true) returns uuid language plpgsql security definer set search_path='' as $$declare c public.content_items;begin
 perform manager_private.require_role(p_workspace,array['owner','admin','editor']);
 if length(p_title)<1 or length(p_title)>300 or length(p_body)>200000 then raise exception 'Content bounds';end if;
 if p_id is null then insert into public.content_items(workspace_id,title,body,language,sensitive,created_by)values(p_workspace,p_title,p_body,p_language,p_sensitive,auth.uid()) returning * into c;
 else update public.content_items set title=p_title,body=p_body,language=p_language,sensitive=p_sensitive,version=version+1,updated_at=now() where id=p_id and workspace_id=p_workspace and version=p_version returning * into c;
 if c.id is null then raise exception 'Version conflict or missing content';end if;
 update public.scheduled_publications set status='cancelled',error='Content edited; reapproval required' where content_id=c.id and status='scheduled';
 end if;perform manager_private.snapshot(c);perform manager_private.audit(p_workspace,'content.saved',c.id);return c.id;
end$$;
create function public.save_script(p_content uuid,p_version integer,p_narration text) returns uuid language plpgsql security definer set search_path='' as $$declare c public.content_items; s uuid;begin
 select * into c from public.content_items where id=p_content for update;perform manager_private.require_role(c.workspace_id,array['owner','admin','editor']);
 if c.version<>p_version then raise exception 'Version conflict';end if;
 insert into public.scripts(workspace_id,content_id,narration)values(c.workspace_id,c.id,left(p_narration,50000)) returning id into s;
 insert into public.script_versions(workspace_id,script_id,version,narration)values(c.workspace_id,s,1,left(p_narration,50000));
 return s;end$$;
create function public.review_content(p_content uuid,p_version uuid,p_decision text,p_comment text) returns void language plpgsql security definer set search_path='' as $$declare c public.content_items;begin
 select * into c from public.content_items where id=p_content for update;perform manager_private.require_role(c.workspace_id,array['owner','admin','reviewer']);
 if c.current_version_id<>p_version then raise exception 'Review version changed';end if;
 if c.sensitive and length(trim(p_comment))<10 then raise exception 'Sensitive content needs explicit review notes (10 characters minimum)';end if;
 insert into public.approvals(workspace_id,content_id,version_id,decision,comment,reviewer_id) values(c.workspace_id,c.id,p_version,p_decision,p_comment,auth.uid()) on conflict(content_id,version_id)do update set decision=excluded.decision,comment=excluded.comment,reviewer_id=excluded.reviewer_id,created_at=now();
 update public.content_items set status=case when p_decision='approved' then 'approved' else 'ready_for_review' end where id=c.id;
 if p_decision<>'approved' then update public.scheduled_publications set status='cancelled',error='Approval withdrawn' where content_id=c.id and status='scheduled';end if;
 perform manager_private.audit(c.workspace_id,'content.reviewed',c.id,jsonb_build_object('decision',p_decision,'version',p_version));end$$;
create function public.register_asset(p_workspace uuid,p_id uuid,p_path text,p_mime text,p_size bigint,p_checksum text,p_license jsonb) returns uuid language plpgsql security definer set search_path='' as $$begin
 perform manager_private.require_role(p_workspace,array['owner','admin','editor']);
 if p_path<>p_workspace::text||'/'||p_id::text then raise exception 'Asset path mismatch';end if;
 if p_mime not in('image/png','image/jpeg','image/webp','video/mp4','audio/mpeg','audio/wav','audio/x-wav') then raise exception 'Unsupported media type';end if;
 if not exists(select 1 from storage.objects where bucket_id='source-assets' and name=p_path) then raise exception 'Upload missing';end if;
 insert into public.assets(id,workspace_id,object_path,mime,size_bytes,checksum)values(p_id,p_workspace,p_path,p_mime,p_size,p_checksum);
 insert into public.asset_licenses(workspace_id,asset_id,details)values(p_workspace,p_id,p_license||jsonb_build_object('checksum',p_checksum,'decision','pending'));
 perform manager_private.audit(p_workspace,'asset.registered',p_id);return p_id;end$$;
create function public.review_asset(p_asset uuid,p_decision text) returns void language plpgsql security definer set search_path='' as $$declare a public.assets;l jsonb;begin
 select * into a from public.assets where id=p_asset;perform manager_private.require_role(a.workspace_id,array['owner','admin','reviewer']);select details into l from public.asset_licenses where asset_id=a.id;
 if p_decision='approved' and (l->>'commercial'<>'yes' or l->>'modifications'<>'allowed' or coalesce((l->>'editorial_only')::boolean,true) or coalesce(length(l->>'license'),0)=0 or coalesce(length(l->>'evidence_url'),0)=0) then raise exception 'ASSET_GUARD: incompatible or unknown rights';end if;
 update public.asset_licenses set decision=p_decision,details=jsonb_set(details,'{decision}',to_jsonb(p_decision)),reviewed_by=auth.uid(),reviewed_at=now() where asset_id=a.id;
 perform manager_private.audit(a.workspace_id,'asset.reviewed',a.id);end$$;
create function manager_private.enqueue(w uuid,k text,e uuid,p jsonb default '{}') returns uuid language plpgsql security definer set search_path='' as $$declare r uuid;begin
 if (select count(*) from public.workflow_runs where workspace_id=w and status in('queued','running'))>=100 then raise exception 'Workspace queue limit reached';end if;
 insert into public.workflow_runs(workspace_id,kind,entity_id,payload)values(w,k,e,p)returning id into r;
 perform pgmq.send('manager_jobs',jsonb_build_object('run_id',r));return r;
end$$;
create function public.create_render(p_content uuid,p_asset uuid,p_audio uuid,p_subtitles text,p_ratio text,p_resolution integer,p_seconds integer) returns uuid language plpgsql security definer set search_path='' as $$declare c public.content_items;r uuid;a public.assets;begin
 select * into c from public.content_items where id=p_content for update;perform manager_private.require_role(c.workspace_id,array['owner','admin','editor']);
 if p_ratio not in('9:16','16:9','1:1') or p_resolution not in(720,1080) or p_seconds not between 1 and 120 then raise exception 'Render bounds';end if;
 for a in select * from public.assets where id=p_asset or id=p_audio loop
 if a.workspace_id<>c.workspace_id or not exists(select 1 from public.asset_licenses where asset_id=a.id and decision='approved' and details->>'commercial'='yes' and details->>'modifications'='allowed' and details->>'editorial_only'='false') then raise exception 'ASSET_GUARD blocked';end if;end loop;
 if not exists(select 1 from public.assets where id=p_asset and workspace_id=c.workspace_id) or (p_audio is not null and not exists(select 1 from public.assets where id=p_audio and workspace_id=c.workspace_id)) then raise exception 'Asset missing';end if;
 insert into public.render_jobs(workspace_id,content_id,version_id,spec) values(c.workspace_id,c.id,c.current_version_id,jsonb_build_object('asset_id',p_asset,'audio_id',p_audio,'subtitles',left(p_subtitles,100000),'ratio',p_ratio,'resolution',p_resolution,'seconds',p_seconds))returning id into r;
 insert into public.asset_usage(workspace_id,asset_id,render_id)values(c.workspace_id,p_asset,r);
 if p_audio is not null then insert into public.asset_usage(workspace_id,asset_id,render_id)values(c.workspace_id,p_audio,r);end if;
 perform manager_private.enqueue(c.workspace_id,'render',r);perform manager_private.audit(c.workspace_id,'render.queued',r);return r;end$$;
create function public.publish_website(p_content uuid,p_slug text,p_description text,p_category text,p_correction text default '') returns void language plpgsql security definer set search_path='' as $$declare c public.content_items;begin
 select * into c from public.content_items where id=p_content for update;perform manager_private.require_role(c.workspace_id,array['owner','admin','publisher']);perform manager_private.check_approved(c);
 if (select publishing_killed from manager_private.system_settings) or (select publishing_paused from public.workspaces where id=c.workspace_id) then raise exception 'Publishing paused';end if;
 insert into public.website_posts(workspace_id,content_id,version_id,slug,title,body,description,category,correction_note)values(c.workspace_id,c.id,c.current_version_id,p_slug,c.title,c.body,left(p_description,300),p_category,p_correction)on conflict(content_id)do update set version_id=excluded.version_id,slug=excluded.slug,title=excluded.title,body=excluded.body,description=excluded.description,category=excluded.category,correction_note=excluded.correction_note,published_at=now();
 insert into public.site_rebuild_requests(workspace_id)values(c.workspace_id)on conflict(workspace_id)do update set requested_at=now(),generation=public.site_rebuild_requests.generation+1;
 perform manager_private.audit(c.workspace_id,'website.published_pending_build',c.id);end$$;
create function public.schedule_publication(p_content uuid,p_connection uuid,p_caption text,p_when timestamptz,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$declare c public.content_items;r uuid;begin
 select * into c from public.content_items where id=p_content for update;perform manager_private.require_role(c.workspace_id,array['owner','admin','publisher']);perform manager_private.check_approved(c);
 if p_when<now()-interval '1 minute' then raise exception 'Choose future time';end if;
 if not exists(select 1 from public.social_connections where id=p_connection and workspace_id=c.workspace_id and status='connected') then raise exception 'Not configured: connected social account required';end if;
 insert into public.scheduled_publications(workspace_id,content_id,version_id,connection_id,caption,scheduled_at,idempotency_key)values(c.workspace_id,c.id,c.current_version_id,p_connection,p_caption,p_when,p_key)on conflict(idempotency_key)do nothing returning id into r;
 if r is null then select id into r from public.scheduled_publications where idempotency_key=p_key and workspace_id=c.workspace_id and content_id=c.id and connection_id=p_connection; if r is null then raise exception 'Idempotency conflict';end if;end if;
 perform manager_private.audit(c.workspace_id,'publication.scheduled',r);return r;end$$;
create function public.cancel_work(p_id uuid,p_kind text) returns void language plpgsql security definer set search_path='' as $$declare w uuid;begin
 if p_kind='publication' then select workspace_id into w from public.scheduled_publications where id=p_id;perform manager_private.require_role(w,array['owner','admin','publisher']);update public.scheduled_publications set status='cancelled' where id=p_id and status in('scheduled','draft','awaiting_approval');
 else select workspace_id into w from public.workflow_runs where id=p_id;perform manager_private.require_role(w,array['owner','admin','editor']);update public.workflow_runs set status='cancelled' where id=p_id and status in('queued','running');update public.render_jobs set status='cancelled' where id=(select entity_id from public.workflow_runs where id=p_id) and status in('queued','running');end if;perform manager_private.audit(w,'work.cancelled',p_id);end$$;
create function public.pause_workspace(p_workspace uuid,p_paused boolean) returns void language plpgsql security definer set search_path='' as $$begin perform manager_private.require_role(p_workspace,array['owner','admin']);update public.workspaces set publishing_paused=p_paused where id=p_workspace;perform manager_private.audit(p_workspace,'workspace.pause',p_workspace,jsonb_build_object('paused',p_paused));end$$;
create function public.set_member_role(p_workspace uuid,p_user uuid,p_role public.workspace_role) returns void language plpgsql security definer set search_path='' as $$begin
 perform manager_private.require_role(p_workspace,array['owner']);perform 1 from public.workspaces where id=p_workspace for update;
 if exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=p_user and role='owner') and p_role<>'owner' and (select count(*)from public.workspace_members where workspace_id=p_workspace and role='owner')=1 then raise exception 'Final owner cannot be removed';end if;
 update public.workspace_members set role=p_role where workspace_id=p_workspace and user_id=p_user;perform manager_private.audit(p_workspace,'member.role',p_user);end$$;
create function public.invite_member(p_workspace uuid,p_email text,p_role public.workspace_role) returns text language plpgsql security definer set search_path='' as $$declare token text;begin
 perform manager_private.require_role(p_workspace,array['owner','admin']);if p_role in('owner','admin') and not public.has_role(p_workspace,array['owner'])then raise exception 'Owner required';end if;
 token=encode(extensions.gen_random_bytes(32),'hex');insert into public.workspace_invitations(workspace_id,email,role,token_hash,expires_at)values(p_workspace,lower(p_email),p_role,encode(extensions.digest(token,'sha256'),'hex'),now()+interval '48 hours');perform manager_private.audit(p_workspace,'invitation.created');return token;end$$;
create function public.accept_invitation(p_token text) returns uuid language plpgsql security definer set search_path='' as $$declare i public.workspace_invitations;begin
 select * into i from public.workspace_invitations where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and expires_at>now() and accepted_at is null for update;
 if i.id is null or not exists(select 1 from auth.users where id=auth.uid() and lower(email)=i.email and email_confirmed_at is not null)then raise exception 'Invalid invitation or unverified email';end if;
 insert into public.workspace_members values(i.workspace_id,auth.uid(),i.role)on conflict do nothing;update public.workspace_invitations set accepted_at=now()where id=i.id;return i.workspace_id;end$$;
-- Public export is allowlisted, never SELECT content_items. Site build uses this snapshot only.
create function public.public_site_data()returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('workspaces',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'slug',w.slug,'name',w.name,'settings',(select jsonb_build_object('description',s.description,'about',s.about_text,'contact',s.contact_text)from public.website_settings s where s.workspace_id=w.id limit 1)))from public.workspaces w where exists(select 1 from public.website_posts p where p.workspace_id=w.id)),'[]'::jsonb),'posts',coalesce((select jsonb_agg(jsonb_build_object('workspace_id',workspace_id,'slug',slug,'title',title,'body',body,'description',description,'category',category,'correction_note',correction_note,'published_at',published_at))from public.website_posts),'[]'::jsonb))$$;
-- Worker authority lives in a non-exposed schema; queue and state change in one transaction.
create function manager_private.worker_dispatch()returns void language plpgsql security definer set search_path='' as $$declare p public.scheduled_publications; b public.site_rebuild_requests;begin
 for p in select *from public.scheduled_publications where status='scheduled' and scheduled_at<=now()for update skip locked loop
 if not exists(select 1 from public.workflow_runs where kind='publish' and entity_id=p.id)then perform manager_private.enqueue(p.workspace_id,'publish',p.id);end if;end loop;
 for b in select *from public.site_rebuild_requests where requested_at<now()-interval '15 seconds' for update skip locked loop
 if not exists(select 1 from public.workflow_runs where workspace_id=b.workspace_id and kind='site' and status in('queued','running'))then perform manager_private.enqueue(b.workspace_id,'site',b.workspace_id,jsonb_build_object('generation',b.generation));end if;end loop;end$$;
create function manager_private.worker_claim(p_worker text)returns jsonb language plpgsql security definer set search_path='' as $$declare m record;r public.workflow_runs;j jsonb;token uuid;begin
 insert into public.worker_heartbeats(id)values(p_worker)on conflict(id)do update set last_seen=now();
 -- A crashed publisher may already have posted. Quarantine, never auto-repost.
 update public.scheduled_publications p set status='unknown',error='Publisher lease expired; human reconciliation required' from public.workflow_runs expired where expired.entity_id=p.id and expired.kind='publish' and expired.status='running' and expired.lease_until<now() and p.status='dispatching';
 update public.workflow_runs set status='unknown',error='Publisher lease expired'where kind='publish' and status='running'and lease_until<now();
 for m in select *from pgmq.read('manager_jobs',60,1)loop
 select *into r from public.workflow_runs where id=(m.message->>'run_id')::uuid for update;
 if r.id is null or r.status in('succeeded','failed','cancelled','unknown','dead_letter')then perform pgmq.archive('manager_jobs',m.msg_id);return null;end if;
 if r.status='running'and r.lease_until>now()then return null;end if;
 perform pg_advisory_xact_lock(hashtextextended(r.workspace_id::text,0));
 if r.kind='site' then perform pg_advisory_xact_lock(hashtextextended('manager-global-site-build',0));if exists(select 1 from public.workflow_runs where kind='site' and id<>r.id and status='running' and lease_until>now())then perform pgmq.set_vt('manager_jobs',m.msg_id,15);return null;end if;end if;
 if exists(select 1 from public.workflow_runs where workspace_id=r.workspace_id and id<>r.id and status='running'and lease_until>now())then perform pgmq.set_vt('manager_jobs',m.msg_id,10);return null;end if;
 if r.attempts>=3 then update public.workflow_runs set status='dead_letter',error='Retry cap'where id=r.id;update public.render_jobs set status='failed',error='Retry cap'where id=r.entity_id and r.kind='render';perform pgmq.archive('manager_jobs',m.msg_id);return null;end if;
 if r.kind='publish'then
 perform pg_advisory_xact_lock(hashtextextended('manager-provider-mastodon',0));
 if exists(select 1 from manager_private.provider_limits where provider='mastodon' and next_at>now())then perform pgmq.set_vt('manager_jobs',m.msg_id,60);return null;end if;
 update manager_private.provider_limits set next_at=now()+interval '2 seconds' where provider='mastodon';
 if (select publishing_killed from manager_private.system_settings)or(select publishing_paused from public.workspaces where id=r.workspace_id)then perform pgmq.set_vt('manager_jobs',m.msg_id,60);return null;end if;
 if not exists(select 1 from public.scheduled_publications p join public.content_items c on c.id=p.content_id join public.approvals a on a.version_id=p.version_id and a.content_id=p.content_id where p.id=r.entity_id and p.status='scheduled'and c.current_version_id=p.version_id and a.decision='approved')then update public.workflow_runs set status='cancelled'where id=r.id;perform pgmq.archive('manager_jobs',m.msg_id);return null;end if;
 update public.scheduled_publications set status='dispatching'where id=r.entity_id;
 end if;
 token=gen_random_uuid();update public.workflow_runs set status='running',attempts=attempts+1,lease_token=token,lease_until=now()+interval '60 seconds',worker_id=p_worker where id=r.id;
 update public.render_jobs set status='running'where id=r.entity_id and r.kind='render';
 insert into public.workflow_steps(workspace_id,run_id,stage)values(r.workspace_id,r.id,'claimed');
 if r.kind='render'then select to_jsonb(x)into j from public.render_jobs x where id=r.entity_id;
 elsif r.kind='publish'then select to_jsonb(x)||jsonb_build_object('connection',to_jsonb(c),'secret',s.encrypted)into j from public.scheduled_publications x join public.social_connections c on c.id=x.connection_id join public.social_connection_secrets s on s.connection_id=c.id where x.id=r.entity_id;
 else j=r.payload;end if;
 return jsonb_build_object('run',to_jsonb(r),'token',token,'msg_id',m.msg_id,'job',j);
 end loop;return null;end$$;
create function manager_private.worker_renew(p_run uuid,p_token uuid,p_msg bigint,p_stage text default 'heartbeat')returns boolean language plpgsql security definer set search_path='' as $$declare w uuid;begin
 update public.workflow_runs set lease_until=now()+interval '60 seconds'where id=p_run and lease_token=p_token and status='running'and lease_until>now()returning workspace_id into w;
 if w is null then return false;end if;
 perform pgmq.set_vt('manager_jobs',p_msg,60);update public.worker_heartbeats set last_seen=now()where id=(select worker_id from public.workflow_runs where id=p_run);
 if p_stage<>'heartbeat'then insert into public.workflow_steps(workspace_id,run_id,stage)values(w,p_run,p_stage);end if;return true;end$$;
create function manager_private.worker_asset(p_workspace uuid,p_asset uuid)returns jsonb language sql stable security definer set search_path='' as $$select to_jsonb(a)||jsonb_build_object('license',l.details)from public.assets a join public.asset_licenses l on l.asset_id=a.id where a.workspace_id=p_workspace and a.id=p_asset and l.decision='approved'$$;
create function manager_private.worker_finish(p_run uuid,p_token uuid,p_msg bigint,p_result jsonb)returns void language plpgsql security definer set search_path='' as $$declare r public.workflow_runs;begin
 select *into r from public.workflow_runs where id=p_run and lease_token=p_token and status='running'and lease_until>now()for update;if r.id is null then raise exception 'Lease lost';end if;
 update public.workflow_runs set status='succeeded',result=p_result,lease_until=null where id=r.id;
 if r.kind='render'then update public.render_jobs set status='succeeded',artifact_path=p_result->>'path',metadata=p_result where id=r.entity_id;
 elsif r.kind='publish'then update public.scheduled_publications set status='published',provider_id=p_result->>'id',provider_url=p_result->>'url'where id=r.entity_id;insert into public.publication_attempts(workspace_id,publication_id,category,result)values(r.workspace_id,r.entity_id,'confirmed',p_result);
 elsif r.kind='site'then delete from public.site_rebuild_requests where workspace_id=r.workspace_id and generation=(r.payload->>'generation')::bigint;
 end if;
 insert into public.workflow_steps(workspace_id,run_id,stage,details)values(r.workspace_id,r.id,'completed',p_result);perform manager_private.audit(r.workspace_id,r.kind||'.completed',r.entity_id);perform pgmq.archive('manager_jobs',p_msg);end$$;
create function manager_private.worker_fail(p_run uuid,p_token uuid,p_msg bigint,p_category text,p_error text,p_retry_after integer default 60)returns void language plpgsql security definer set search_path='' as $$declare r public.workflow_runs; terminal boolean;begin
 select *into r from public.workflow_runs where id=p_run and lease_token=p_token and status='running'for update;
 if r.id is null then return;end if;
 terminal=r.attempts>=3 or r.kind='publish' and p_category<>'rate_limit';
 update public.workflow_runs set status=case when r.kind='publish'and p_category='unknown'then 'unknown'when terminal then 'dead_letter'else 'queued'end,error=left(p_error,2000),lease_until=null where id=r.id;
 if r.kind='render'then update public.render_jobs set status=case when terminal then 'failed'else 'queued'end,error=left(p_error,2000)where id=r.entity_id;end if;
 if r.kind='publish'then update public.scheduled_publications set status=case when p_category='unknown'then 'unknown'when terminal then 'failed'else 'scheduled'end,error=left(p_error,2000)where id=r.entity_id;insert into public.publication_attempts(workspace_id,publication_id,category)values(r.workspace_id,r.entity_id,p_category);end if;
 insert into public.workflow_steps(workspace_id,run_id,stage,details)values(r.workspace_id,r.id,'error',jsonb_build_object('category',p_category,'error',left(p_error,2000)));
 if r.kind='publish' and p_category='rate_limit' then update manager_private.provider_limits set next_at=greatest(next_at,now()+make_interval(secs=>greatest(60,least(86400,p_retry_after)))) where provider='mastodon';end if;
 if terminal then perform pgmq.archive('manager_jobs',p_msg);else perform pgmq.set_vt('manager_jobs',p_msg,greatest(case when p_category='rate_limit' then greatest(60,least(86400,p_retry_after)) else 0 end,least(3600,(5*power(2,r.attempts))::integer)+floor(random()*10)::integer));end if;end$$;
-- Secret OAuth persistence: callable only by service role via Edge Functions.
create function public.oauth_begin(p_state text,p_user uuid,p_workspace uuid,p_verifier text)returns void language sql security definer set search_path=''as $$insert into manager_private.oauth_states values(p_state,p_user,p_workspace,p_verifier,now()+interval '10 minutes')$$;
create function public.oauth_consume(p_state text)returns jsonb language plpgsql security definer set search_path=''as $$declare s manager_private.oauth_states;begin delete from manager_private.oauth_states where state_hash=p_state and expires_at>now()returning *into s;return to_jsonb(s);end$$;
-- Least-privilege browser grants. Default Supabase grants are explicitly removed.
revoke all on all tables in schema public from anon,authenticated;
grant select on all tables in schema public to authenticated;
revoke all on public.social_connection_secrets from anon,authenticated;
grant select,insert,update,delete on public.profiles to authenticated;
grant insert,update on public.news_sources to authenticated;
grant insert,update on public.source_items to authenticated;
grant insert,update on public.research_notes to authenticated;
grant insert,update on public.subtitle_tracks to authenticated;
grant insert,update on public.voice_profiles to authenticated;
grant insert,update on public.brands to authenticated;
grant insert,update on public.website_pages to authenticated;
grant insert,update on public.website_categories to authenticated;
grant insert,update on public.website_settings to authenticated;
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.has_role(uuid,text[]) to authenticated;
do $$declare f record;begin for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname in('create_workspace','save_content','save_script','review_content','register_asset','review_asset','create_render','publish_website','schedule_publication','cancel_work','pause_workspace','set_member_role','invite_member','accept_invitation')loop execute format('grant execute on function %s to authenticated',f.signature);end loop;end$$;
grant execute on function public.public_site_data() to anon,authenticated,service_role;
grant execute on function public.oauth_begin(text,uuid,uuid,text),public.oauth_consume(text) to service_role;
revoke all on all functions in schema manager_private from public;
-- Worker login gets membership in this NOLOGIN role; never allow a browser user to assume it.
create role manager_worker_api nologin;
grant usage on schema manager_private to manager_worker_api;
grant execute on function manager_private.worker_dispatch(),manager_private.worker_claim(text),manager_private.worker_renew(uuid,uuid,bigint,text),manager_private.worker_asset(uuid,uuid),manager_private.worker_finish(uuid,uuid,bigint,jsonb),manager_private.worker_fail(uuid,uuid,bigint,text,text,integer) to manager_worker_api;
-- Private buckets. No public anonymous objects, even public-site-assets until promotion implemented.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)values('source-assets','source-assets',false,52428800,array['image/png','image/jpeg','image/webp','video/mp4','audio/mpeg','audio/wav','audio/x-wav']),('generated-audio','generated-audio',false,52428800,null),('subtitle-files','subtitle-files',false,1048576,null),('video-renders','video-renders',false,104857600,null),('thumbnails','thumbnails',false,5242880,null),('public-site-assets','public-site-assets',false,52428800,null);
-- Registration requires workspace UUID/object UUID; malformed UUID paths simply denied.
create function public.storage_workspace(name text)returns uuid language plpgsql immutable set search_path=''as $$begin if split_part(name,'/',1)~'^[a-f0-9-]{36}$'then return split_part(name,'/',1)::uuid;end if;return null;exception when others then return null;end$$;
grant execute on function public.storage_workspace(text)to authenticated;
create policy manager_storage_read on storage.objects for select to authenticated using(bucket_id in('source-assets','generated-audio','subtitle-files','video-renders','thumbnails')and public.has_role(public.storage_workspace(name)));
create policy manager_storage_upload on storage.objects for insert to authenticated with check(bucket_id='source-assets'and public.has_role(public.storage_workspace(name),array['owner','admin','editor'])and name~'^[a-f0-9-]{36}/[a-f0-9-]{36}$');
-- Uploads are immutable, no browser upsert/delete, preventing approved asset replacement.
-- Realtime carries RLS-filtered job rows; no private secret or OAuth state subscriptions.
do $$begin alter publication supabase_realtime add table public.render_jobs,public.workflow_runs,public.scheduled_publications,public.content_items;exception when duplicate_object then null;end$$;
