create or replace function public.enqueue_builder_agent_job(
  p_user_id uuid,
  p_project_name text,
  p_publish_slug text,
  p_project jsonb,
  p_plan jsonb,
  p_audit jsonb,
  p_provider text,
  p_model text,
  p_generation_path text,
  p_status_token_hash text
)
returns table(id uuid, status text, publish_slug text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_project_name is null or char_length(trim(p_project_name)) not between 1 and 80 then
    raise exception 'invalid_project_name';
  end if;
  if p_publish_slug is null or p_publish_slug !~ '^[a-z0-9][a-z0-9-]{0,62}$' then
    raise exception 'invalid_publish_slug';
  end if;
  if p_status_token_hash is null or p_status_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_status_token_hash';
  end if;
  if p_project is null or jsonb_typeof(p_project) <> 'object' then
    raise exception 'invalid_project';
  end if;
  if p_project->>'kind' <> 'static-web' then
    raise exception 'invalid_project_kind';
  end if;
  if jsonb_typeof(p_project->'files') <> 'array' or jsonb_array_length(p_project->'files') not between 1 and 12 then
    raise exception 'invalid_project_files';
  end if;
  if octet_length(p_project::text) > 95000 then
    raise exception 'project_too_large';
  end if;
  if p_plan is not null and octet_length(p_plan::text) > 26000 then
    raise exception 'plan_too_large';
  end if;
  if p_audit is not null and octet_length(p_audit::text) > 10000 then
    raise exception 'audit_too_large';
  end if;

  -- Defense-in-depth: the application and worker both perform richer validation.
  if lower(p_project::text) ~ '(gsk_|sk-proj-|github_pat_|ghp_[a-z0-9]|-----begin[^\n]{0,20}private key)' then
    raise exception 'secret_like_project';
  end if;
  if lower(p_project::text) ~ '(https?://[^" ]+\.js|<iframe|<object|<embed|javascript:|\beval\s*\(|\bfetch\s*\(|xmlhttprequest|websocket\s*\(|eventsource\s*\(|sendbeacon\s*\(|serviceworker\.register)' then
    raise exception 'unsafe_project';
  end if;

  -- Global abuse bounds. Jobs are tiny and worker throughput is deliberately low.
  if (select count(*) from public.builder_agent_jobs where status in ('queued','running')) >= 20 then
    raise exception 'queue_full';
  end if;
  if (select count(*) from public.builder_agent_jobs where created_at > now() - interval '5 minutes') >= 5 then
    raise exception 'queue_rate_limited';
  end if;

  insert into public.builder_agent_jobs (
    user_id, status, project_name, publish_slug, project, plan, audit,
    provider, model, generation_path, status_token_hash
  ) values (
    p_user_id, 'queued', trim(p_project_name), p_publish_slug, p_project, p_plan, p_audit,
    left(p_provider, 80), left(p_model, 120), left(p_generation_path, 80), p_status_token_hash
  ) returning builder_agent_jobs.id into v_id;

  return query select v_id, 'queued'::text, p_publish_slug;
end;
$$;

create or replace function public.get_builder_agent_job_status(
  p_id uuid,
  p_status_token_hash text
)
returns table(
  id uuid,
  status text,
  project_name text,
  publish_slug text,
  attempts integer,
  branch_name text,
  commit_sha text,
  pr_number integer,
  pr_url text,
  preview_url text,
  ci_url text,
  error_code text,
  error_message text,
  created_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    jobs.id, jobs.status, jobs.project_name, jobs.publish_slug, jobs.attempts,
    jobs.branch_name, jobs.commit_sha, jobs.pr_number, jobs.pr_url,
    jobs.preview_url, jobs.ci_url, jobs.error_code, jobs.error_message,
    jobs.created_at, jobs.updated_at, jobs.completed_at
  from public.builder_agent_jobs as jobs
  where jobs.id = p_id and jobs.status_token_hash = p_status_token_hash
  limit 1;
$$;

revoke all on function public.enqueue_builder_agent_job(uuid,text,text,jsonb,jsonb,jsonb,text,text,text,text) from public;
revoke all on function public.get_builder_agent_job_status(uuid,text) from public;
grant execute on function public.enqueue_builder_agent_job(uuid,text,text,jsonb,jsonb,jsonb,text,text,text,text) to anon, authenticated;
grant execute on function public.get_builder_agent_job_status(uuid,text) to anon, authenticated;
