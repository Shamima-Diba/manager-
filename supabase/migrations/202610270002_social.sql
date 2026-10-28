create function public.store_social_connection(p_id uuid,p_workspace uuid,p_origin text,p_name text,p_encrypted jsonb)returns void language plpgsql security definer set search_path=''as $$begin
 insert into public.social_connections(id,workspace_id,provider,origin,account_name)values(p_id,p_workspace,'mastodon',p_origin,p_name);
 insert into public.social_connection_secrets(connection_id,workspace_id,encrypted)values(p_id,p_workspace,p_encrypted);
 perform manager_private.audit(p_workspace,'social.connected',p_id);
end$$;
create function public.disconnect_social_connection(p_id uuid)returns void language plpgsql security definer set search_path=''as $$declare w uuid;begin
 update public.social_connections set status='disconnected'where id=p_id returning workspace_id into w;
 delete from public.social_connection_secrets where connection_id=p_id;
 update public.scheduled_publications set status='cancelled',error='Account disconnected'where connection_id=p_id and status='scheduled';
 perform manager_private.audit(w,'social.disconnected',p_id);end$$;
revoke all on function public.store_social_connection(uuid,uuid,text,text,jsonb),public.disconnect_social_connection(uuid)from public,anon,authenticated;
grant execute on function public.store_social_connection(uuid,uuid,text,text,jsonb),public.disconnect_social_connection(uuid)to service_role;
grant select on public.workspace_members,public.social_connections,public.social_connection_secrets to service_role;
