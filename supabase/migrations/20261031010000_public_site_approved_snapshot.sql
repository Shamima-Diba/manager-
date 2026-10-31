-- Public export is a strict, read-only projection of approved, current website snapshots.
-- The CMS remains private; anonymous callers receive only explicitly published text fields.
create or replace function public.public_site_data()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'workspaces',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', w.id,
          'slug', w.slug,
          'name', w.name,
          'settings', (
            select jsonb_build_object(
              'description', s.description,
              'about', s.about_text,
              'contact', s.contact_text
            )
            from public.website_settings s
            where s.workspace_id = w.id
            limit 1
          )
        ) order by w.created_at
      )
      from public.workspaces w
      where exists (
        select 1
        from public.website_posts p
        join public.content_items c
          on c.workspace_id = p.workspace_id
         and c.id = p.content_id
        join public.approvals a
          on a.workspace_id = p.workspace_id
         and a.content_id = p.content_id
         and a.version_id = p.version_id
         and a.decision = 'approved'
        where p.workspace_id = w.id
          and c.status = 'approved'
          and c.sensitive = false
          and c.current_version_id = p.version_id
      )
    ), '[]'::jsonb),
    'posts',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'workspace_id', p.workspace_id,
          'slug', p.slug,
          'title', p.title,
          'body', p.body,
          'description', p.description,
          'category', p.category,
          'correction_note', p.correction_note,
          'published_at', p.published_at
        ) order by p.published_at desc
      )
      from public.website_posts p
      join public.content_items c
        on c.workspace_id = p.workspace_id
       and c.id = p.content_id
      join public.approvals a
        on a.workspace_id = p.workspace_id
       and a.content_id = p.content_id
       and a.version_id = p.version_id
       and a.decision = 'approved'
      where c.status = 'approved'
        and c.sensitive = false
        and c.current_version_id = p.version_id
    ), '[]'::jsonb)
  );
$function$;

comment on function public.public_site_data() is
  'Anonymous read-only export. Includes only website snapshots whose content item is currently approved, non-sensitive, version-matched, and has a matching approval record. Never returns drafts, editorial metadata, secrets, or private assets.';

revoke all on function public.public_site_data() from public;
grant execute on function public.public_site_data() to anon, authenticated, service_role;
