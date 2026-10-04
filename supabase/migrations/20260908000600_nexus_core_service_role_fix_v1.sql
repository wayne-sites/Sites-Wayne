create or replace function public.nexus_create_project(
  p_owner_user_id uuid,
  p_name text,
  p_description text,
  p_project_type text,
  p_stack jsonb,
  p_metadata jsonb,
  p_artifacts jsonb
) returns public.nexus_projects
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace public.nexus_workspaces;
  v_project public.nexus_projects;
  v_artifact jsonb;
  v_slug text;
begin
  if p_owner_user_id is null then
    raise exception 'invalid_owner';
  end if;
  if jsonb_typeof(coalesce(p_stack, '[]'::jsonb)) <> 'array' then raise exception 'invalid_stack'; end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then raise exception 'invalid_metadata'; end if;
  if jsonb_typeof(coalesce(p_artifacts, '[]'::jsonb)) <> 'array' then raise exception 'invalid_artifacts'; end if;
  if jsonb_array_length(coalesce(p_artifacts, '[]'::jsonb)) > 64 then raise exception 'too_many_artifacts'; end if;

  select * into v_workspace
  from public.nexus_workspaces
  where owner_user_id = p_owner_user_id and slug = 'default'
  limit 1;

  if v_workspace.id is null then
    insert into public.nexus_workspaces (owner_user_id, name, slug)
    values (p_owner_user_id, 'Meu Workspace', 'default')
    on conflict (owner_user_id, slug) do update set updated_at = now()
    returning * into v_workspace;
  end if;

  v_slug := trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then v_slug := 'nexus-project'; end if;

  insert into public.nexus_projects (workspace_id, name, slug, description, project_type, stack, metadata)
  values (
    v_workspace.id,
    trim(p_name),
    left(v_slug, 100),
    nullif(trim(coalesce(p_description, '')), ''),
    p_project_type,
    coalesce(p_stack, '[]'::jsonb),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_project;

  for v_artifact in select value from jsonb_array_elements(coalesce(p_artifacts, '[]'::jsonb))
  loop
    insert into public.nexus_artifacts (
      project_id, kind, name, path, mime_type, content_text, content_json, metadata, created_by
    ) values (
      v_project.id,
      coalesce(v_artifact->>'kind', 'other'),
      coalesce(nullif(trim(v_artifact->>'name'), ''), 'artifact'),
      v_artifact->>'path',
      nullif(trim(coalesce(v_artifact->>'mime_type', '')), ''),
      v_artifact->>'content_text',
      v_artifact->'content_json',
      coalesce(v_artifact->'metadata', '{}'::jsonb),
      p_owner_user_id
    );
  end loop;

  insert into public.nexus_audit_logs (workspace_id, project_id, user_id, action, status, metadata)
  values (v_workspace.id, v_project.id, p_owner_user_id, 'project.created', 'succeeded', jsonb_build_object('project_type', p_project_type));

  return v_project;
end;
$$;

revoke execute on function public.nexus_create_project(uuid,text,text,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.nexus_create_project(uuid,text,text,text,jsonb,jsonb,jsonb) to service_role;