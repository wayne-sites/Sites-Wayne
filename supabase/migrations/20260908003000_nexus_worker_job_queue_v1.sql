alter table public.nexus_jobs
  add column lease_id uuid,
  add column lease_expires_at timestamptz,
  add column claim_attempts integer not null default 0 check (claim_attempts between 0 and 100),
  add column max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  add constraint nexus_jobs_input_object check (jsonb_typeof(input) = 'object'),
  add constraint nexus_jobs_output_object check (output is null or jsonb_typeof(output) = 'object');

create index nexus_jobs_active_lease_idx
  on public.nexus_jobs (worker_id, lease_expires_at)
  where status = 'running' and lease_id is not null;

create or replace function public.nexus_enqueue_worker_job(
  p_owner_user_id uuid,
  p_project_id uuid,
  p_capability text,
  p_input jsonb,
  p_zero_cost_mode boolean default true
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_tool_id text;
  v_job public.nexus_jobs;
begin
  if p_owner_user_id is null then raise exception 'invalid_job_owner'; end if;
  if p_project_id is null then raise exception 'invalid_job_project'; end if;
  if p_capability is null or p_capability !~ '^[a-z0-9]+([._-][a-z0-9]+){1,7}$' or char_length(p_capability) > 120 then
    raise exception 'invalid_job_capability';
  end if;
  if jsonb_typeof(p_input) <> 'object' then raise exception 'invalid_job_input'; end if;
  if octet_length(p_input::text) > 250000 then raise exception 'job_input_too_large'; end if;
  if p_zero_cost_mode is not true then raise exception 'paid_execution_disabled'; end if;

  select p.workspace_id into v_workspace_id
  from public.nexus_projects p
  join public.nexus_workspaces w on w.id = p.workspace_id
  where p.id = p_project_id
    and p.status <> 'archived'
    and w.owner_user_id = p_owner_user_id
  limit 1;

  if v_workspace_id is null then raise exception 'job_project_not_owned'; end if;

  select tc.tool_id into v_tool_id
  from public.nexus_tool_capabilities tc
  join public.nexus_tools t on t.id = tc.tool_id and t.is_enabled = true
  join public.nexus_tool_security s on s.tool_id = tc.tool_id
  where tc.capability = p_capability
    and s.review_status = 'approved'
    and s.risk_level in ('low','medium')
    and s.sandbox_required = false
  order by case s.risk_level when 'low' then 0 else 1 end, tc.tool_id
  limit 1;

  if v_tool_id is null then raise exception 'worker_tool_not_approved'; end if;

  insert into public.nexus_jobs (
    workspace_id, project_id, requested_by, capability, tool_id,
    status, zero_cost_mode, requires_approval, approval_status, input
  ) values (
    v_workspace_id, p_project_id, p_owner_user_id, p_capability, v_tool_id,
    'queued', true, false, 'not_required', p_input
  ) returning * into v_job;

  insert into public.nexus_audit_logs (workspace_id, project_id, user_id, action, tool_id, status, metadata)
  values (
    v_workspace_id, p_project_id, p_owner_user_id,
    'worker.job.queued', v_tool_id, 'succeeded',
    jsonb_build_object('job_id', v_job.id, 'capability', p_capability, 'zero_cost_mode', true)
  );

  return jsonb_build_object(
    'job_id', v_job.id,
    'workspace_id', v_workspace_id,
    'project_id', p_project_id,
    'tool_id', v_tool_id,
    'capability', p_capability,
    'status', v_job.status,
    'queued_at', v_job.queued_at
  );
end;
$$;

create or replace function public.nexus_worker_claim_job(
  p_token_hash text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_credential public.nexus_worker_credentials;
  v_worker public.nexus_workers;
  v_job public.nexus_jobs;
  v_lease_id uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_expires timestamptz := now() + interval '5 minutes';
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_worker_token_hash'; end if;

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
  if v_worker.status <> 'online' then raise exception 'worker_not_online'; end if;
  if v_worker.last_seen_at is null or v_worker.last_seen_at < v_now - interval '2 minutes' then
    raise exception 'worker_not_fresh';
  end if;

  update public.nexus_jobs
  set
    status = 'failed',
    error = coalesce(error, 'worker_lease_exhausted'),
    finished_at = v_now,
    lease_id = null,
    lease_expires_at = null,
    updated_at = v_now
  where workspace_id = v_worker.workspace_id
    and status = 'running'
    and lease_expires_at is not null
    and lease_expires_at < v_now
    and claim_attempts >= max_attempts;

  update public.nexus_jobs
  set
    status = 'queued',
    worker_id = null,
    started_at = null,
    lease_id = null,
    lease_expires_at = null,
    updated_at = v_now
  where workspace_id = v_worker.workspace_id
    and status = 'running'
    and lease_expires_at is not null
    and lease_expires_at < v_now
    and claim_attempts < max_attempts;

  select j.* into v_job
  from public.nexus_jobs j
  where j.workspace_id = v_worker.workspace_id
    and j.status = 'queued'
    and j.zero_cost_mode = true
    and (j.requires_approval = false or j.approval_status = 'approved')
    and j.tool_id is not null
    and j.claim_attempts < j.max_attempts
    and coalesce(v_worker.capabilities->'tools', '[]'::jsonb) @> jsonb_build_array(j.tool_id)
    and coalesce(v_worker.capabilities->'capabilities', '[]'::jsonb) @> jsonb_build_array(j.capability)
  order by j.queued_at asc, j.id asc
  for update skip locked
  limit 1;

  if v_job.id is null then
    update public.nexus_worker_credentials set last_used_at = v_now where id = v_credential.id;
    return null;
  end if;

  update public.nexus_jobs
  set
    worker_id = v_worker.id,
    status = 'running',
    started_at = v_now,
    lease_id = v_lease_id,
    lease_expires_at = v_expires,
    claim_attempts = claim_attempts + 1,
    updated_at = v_now
  where id = v_job.id;

  update public.nexus_worker_credentials set last_used_at = v_now where id = v_credential.id;

  insert into public.nexus_audit_logs (workspace_id, project_id, user_id, action, tool_id, status, metadata)
  values (
    v_job.workspace_id, v_job.project_id, v_job.requested_by,
    'worker.job.claimed', v_job.tool_id, 'succeeded',
    jsonb_build_object('job_id', v_job.id, 'worker_id', v_worker.id, 'lease_id', v_lease_id, 'lease_expires_at', v_expires)
  );

  return jsonb_build_object(
    'job_id', v_job.id,
    'project_id', v_job.project_id,
    'tool_id', v_job.tool_id,
    'capability', v_job.capability,
    'input', v_job.input,
    'lease_id', v_lease_id,
    'lease_expires_at', v_expires,
    'attempt', v_job.claim_attempts + 1,
    'max_attempts', v_job.max_attempts
  );
end;
$$;

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
  v_now timestamptz := now();
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_worker_token_hash'; end if;
  if p_job_id is null or p_lease_id is null then raise exception 'invalid_job_lease'; end if;
  if p_status not in ('succeeded','failed') then raise exception 'invalid_job_finish_status'; end if;
  if p_output is not null and jsonb_typeof(p_output) <> 'object' then raise exception 'invalid_job_output'; end if;
  if p_output is not null and octet_length(p_output::text) > 500000 then raise exception 'job_output_too_large'; end if;
  if p_error is not null and char_length(p_error) > 5000 then raise exception 'job_error_too_large'; end if;
  if p_status = 'failed' and (p_error is null or char_length(trim(p_error)) = 0) then raise exception 'job_error_required'; end if;

  select * into v_credential
  from public.nexus_worker_credentials
  where token_hash = p_token_hash and revoked_at is null
  limit 1;
  if v_credential.id is null then raise exception 'worker_credential_invalid'; end if;

  select * into v_worker from public.nexus_workers where id = v_credential.worker_id limit 1;
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

  update public.nexus_jobs
  set
    status = p_status,
    output = p_output,
    error = case when p_status = 'failed' then trim(p_error) else null end,
    finished_at = v_now,
    lease_id = null,
    lease_expires_at = null,
    updated_at = v_now
  where id = v_job.id;

  update public.nexus_worker_credentials set last_used_at = v_now where id = v_credential.id;

  insert into public.nexus_audit_logs (workspace_id, project_id, user_id, action, tool_id, status, metadata)
  values (
    v_job.workspace_id, v_job.project_id, v_job.requested_by,
    'worker.job.finished', v_job.tool_id, p_status,
    jsonb_build_object('job_id', v_job.id, 'worker_id', v_worker.id, 'attempt', v_job.claim_attempts)
  );

  return jsonb_build_object(
    'job_id', v_job.id,
    'status', p_status,
    'finished_at', v_now
  );
end;
$$;

revoke execute on function public.nexus_enqueue_worker_job(uuid,uuid,text,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.nexus_enqueue_worker_job(uuid,uuid,text,jsonb,boolean) to service_role;
revoke execute on function public.nexus_worker_claim_job(text) from public, anon, authenticated;
grant execute on function public.nexus_worker_claim_job(text) to service_role;
revoke execute on function public.nexus_worker_finish_job(text,uuid,uuid,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.nexus_worker_finish_job(text,uuid,uuid,text,jsonb,text) to service_role;

comment on function public.nexus_worker_claim_job(text) is 'Entrega somente jobs capability-first para worker autenticado e compatível; não inclui shell ou command.';
comment on function public.nexus_worker_finish_job(text,uuid,uuid,text,jsonb,text) is 'Finaliza uma lease válida de worker com saída estruturada; não executa comandos.';