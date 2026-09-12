alter table public.nexus_jobs
  add column tool_run_id uuid references public.nexus_tool_runs(id) on delete set null,
  add column artifact_id uuid references public.nexus_artifacts(id) on delete set null;

create index nexus_jobs_tool_run_idx on public.nexus_jobs (tool_run_id) where tool_run_id is not null;
create index nexus_jobs_artifact_idx on public.nexus_jobs (artifact_id) where artifact_id is not null;

create or replace function public.nexus_worker_finish_job(
  p_token_hash text,
  p_job_id uuid,
  p_lease_id uuid,
  p_status text,
  p_output jsonb default null,
  p_error text default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_credential public.nexus_worker_credentials;
  v_worker public.nexus_workers;
  v_job public.nexus_jobs;
  v_run public.nexus_tool_runs;
  v_artifact public.nexus_artifacts;
  v_now timestamptz := now();
  v_kind text;
  v_mime_type text;
  v_content_text text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_worker_token_hash'; end if;
  if p_job_id is null or p_lease_id is null then raise exception 'invalid_job_lease'; end if;
  if p_status not in ('succeeded','failed') then raise exception 'invalid_job_finish_status'; end if;
  if p_output is not null and jsonb_typeof(p_output) <> 'object' then raise exception 'invalid_job_output'; end if;
  if p_output is not null and octet_length(p_output::text) > 500000 then raise exception 'job_output_too_large'; end if;
  if p_error is not null and char_length(p_error) > 5000 then raise exception 'job_error_too_large'; end if;
  if p_status = 'failed' and (p_error is null or char_length(trim(p_error)) = 0) then raise exception 'job_error_required'; end if;
  if p_status = 'succeeded' and p_output is null then raise exception 'job_output_required'; end if;

  select * into v_credential
  from public.nexus_worker_credentials
  where token_hash = p_token_hash and revoked_at is null
  limit 1;
  if v_credential.id is null then raise exception 'worker_credential_invalid'; end if;

  select * into v_worker
  from public.nexus_workers
  where id = v_credential.worker_id
  limit 1;
  if v_worker.id is null then raise exception 'worker_not_found'; end if;
  if v_worker.status = 'disabled' then raise exception 'worker_disabled'; end if;

  select * into v_job
  from public.nexus_jobs
  where id = p_job_id
    and worker_id = v_worker.id
    and status = 'running'
    and lease_id = p_lease_id
  for update;

  if v_job.id is null then raise exception 'job_lease_invalid'; end if;
  if v_job.lease_expires_at is null or v_job.lease_expires_at < v_now then raise exception 'job_lease_expired'; end if;
  if v_job.project_id is null or v_job.requested_by is null or v_job.tool_id is null then raise exception 'job_lineage_context_missing'; end if;

  if p_status = 'succeeded' then
    if not exists (
      select 1
      from public.nexus_tool_capabilities tc
      join public.nexus_tools t on t.id = tc.tool_id and t.is_enabled = true
      join public.nexus_tool_security s on s.tool_id = tc.tool_id
      where tc.tool_id = v_job.tool_id
        and tc.capability = v_job.capability
        and s.review_status = 'approved'
        and s.risk_level in ('low','medium')
        and s.sandbox_required = false
    ) then
      raise exception 'worker_tool_not_approved';
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
      v_job.project_id,
      v_job.tool_id,
      v_job.requested_by,
      'succeeded',
      v_job.input,
      p_output,
      coalesce(v_job.started_at, v_job.queued_at, v_now),
      v_now
    ) returning * into v_run;

    if v_job.capability like 'data.json.%' then
      v_kind := 'dataset';
      v_mime_type := 'application/json';
    elsif v_job.capability like 'document.markdown.%' then
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
      v_job.project_id,
      v_kind,
      left(v_job.capability || ' worker result', 180),
      'worker-executions/' || v_run.id::text || '.json',
      v_mime_type,
      v_content_text,
      p_output,
      jsonb_build_object(
        'capability', v_job.capability,
        'tool_id', v_job.tool_id,
        'tool_run_id', v_run.id,
        'runtime', 'worker',
        'worker_id', v_worker.id,
        'job_id', v_job.id,
        'claim_attempt', v_job.claim_attempts
      ),
      v_job.requested_by
    ) returning * into v_artifact;
  end if;

  update public.nexus_jobs
  set
    status = p_status,
    output = p_output,
    error = case when p_status = 'failed' then trim(p_error) else null end,
    finished_at = v_now,
    lease_id = null,
    lease_expires_at = null,
    tool_run_id = case when p_status = 'succeeded' then v_run.id else null end,
    artifact_id = case when p_status = 'succeeded' then v_artifact.id else null end,
    updated_at = v_now
  where id = v_job.id;

  update public.nexus_worker_credentials
  set last_used_at = v_now
  where id = v_credential.id;

  insert into public.nexus_audit_logs (workspace_id, project_id, user_id, action, tool_id, status, metadata)
  values (
    v_job.workspace_id,
    v_job.project_id,
    v_job.requested_by,
    'worker.job.finished',
    v_job.tool_id,
    p_status,
    jsonb_strip_nulls(jsonb_build_object(
      'job_id', v_job.id,
      'worker_id', v_worker.id,
      'attempt', v_job.claim_attempts,
      'runtime', 'worker',
      'capability', v_job.capability,
      'tool_run_id', v_run.id,
      'artifact_id', v_artifact.id
    ))
  );

  return jsonb_strip_nulls(jsonb_build_object(
    'job_id', v_job.id,
    'status', p_status,
    'finished_at', v_now,
    'tool_run_id', v_run.id,
    'artifact_id', v_artifact.id,
    'artifact_path', v_artifact.path,
    'artifact_kind', v_artifact.kind
  ));
end;
$$;

revoke execute on function public.nexus_worker_finish_job(text,uuid,uuid,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.nexus_worker_finish_job(text,uuid,uuid,text,jsonb,text) to service_role;

comment on function public.nexus_worker_finish_job(text,uuid,uuid,text,jsonb,text)
is 'Finaliza lease de worker e, em sucesso, persiste TOOL RUN + ARTIFACT + AUDIT LOG atomicamente para capability aprovada sem sandbox obrigatório.';