create or replace function public.nexus_record_native_execution(
  p_owner_user_id uuid,
  p_project_id uuid,
  p_tool_id text,
  p_capability text,
  p_input jsonb,
  p_output jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_run public.nexus_tool_runs;
  v_artifact public.nexus_artifacts;
  v_kind text;
  v_mime_type text;
  v_content_text text;
begin
  if p_owner_user_id is null or p_project_id is null then
    raise exception 'invalid_execution_owner_or_project';
  end if;

  if p_tool_id is null or p_capability is null then
    raise exception 'invalid_execution_tool_or_capability';
  end if;

  if jsonb_typeof(coalesce(p_input, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_execution_input';
  end if;

  if jsonb_typeof(coalesce(p_output, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_execution_output';
  end if;

  select w.id
  into v_workspace_id
  from public.nexus_projects p
  join public.nexus_workspaces w on w.id = p.workspace_id
  where p.id = p_project_id
    and w.owner_user_id = p_owner_user_id
  limit 1;

  if v_workspace_id is null then
    raise exception 'nexus_project_not_owned';
  end if;

  if not exists (
    select 1
    from public.nexus_tools t
    join public.nexus_tool_capabilities c
      on c.tool_id = t.id and c.capability = p_capability
    join public.nexus_tool_security s
      on s.tool_id = t.id
    where t.id = p_tool_id
      and t.is_enabled = true
      and s.risk_level = 'low'
      and s.sandbox_required = false
      and s.review_status = 'approved'
  ) then
    raise exception 'native_tool_not_approved';
  end if;

  insert into public.nexus_tool_runs (
    project_id,
    tool_id,
    user_id,
    status,
    input,
    output,
    started_at,
    finished_at
  ) values (
    p_project_id,
    p_tool_id,
    p_owner_user_id,
    'succeeded',
    coalesce(p_input, '{}'::jsonb),
    coalesce(p_output, '{}'::jsonb),
    now(),
    now()
  )
  returning * into v_run;

  if p_capability like 'data.json.%' then
    v_kind := 'dataset';
    v_mime_type := 'application/json';
  elsif p_capability like 'document.markdown.%' then
    v_kind := 'document';
    v_mime_type := 'text/markdown';
  else
    v_kind := 'other';
    v_mime_type := 'application/json';
  end if;

  if p_output ? 'text' and jsonb_typeof(p_output->'text') = 'string' then
    v_content_text := p_output->>'text';
  else
    v_content_text := null;
  end if;

  insert into public.nexus_artifacts (
    project_id,
    kind,
    name,
    path,
    mime_type,
    content_text,
    content_json,
    metadata,
    created_by
  ) values (
    p_project_id,
    v_kind,
    left(p_capability || ' result', 180),
    'executions/' || v_run.id::text || '.json',
    v_mime_type,
    v_content_text,
    coalesce(p_output, '{}'::jsonb),
    jsonb_build_object(
      'capability', p_capability,
      'tool_id', p_tool_id,
      'tool_run_id', v_run.id,
      'runtime', 'native'
    ),
    p_owner_user_id
  )
  returning * into v_artifact;

  insert into public.nexus_audit_logs (
    workspace_id,
    project_id,
    user_id,
    action,
    tool_id,
    status,
    metadata
  ) values (
    v_workspace_id,
    p_project_id,
    p_owner_user_id,
    'tool.executed',
    p_tool_id,
    'succeeded',
    jsonb_build_object(
      'capability', p_capability,
      'tool_run_id', v_run.id,
      'artifact_id', v_artifact.id,
      'runtime', 'native'
    )
  );

  return jsonb_build_object(
    'tool_run_id', v_run.id,
    'artifact_id', v_artifact.id,
    'artifact_path', v_artifact.path,
    'artifact_kind', v_artifact.kind
  );
end;
$$;

revoke execute on function public.nexus_record_native_execution(uuid,uuid,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.nexus_record_native_execution(uuid,uuid,text,text,jsonb,jsonb) to service_role;

comment on function public.nexus_record_native_execution(uuid,uuid,text,text,jsonb,jsonb)
is 'Persiste lineage de uma capability Nexus Native aprovada: TOOL RUN + ARTIFACT + AUDIT LOG, atomicamente e apenas via service_role.';