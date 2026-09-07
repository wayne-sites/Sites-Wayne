create table if not exists public.builder_agent_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','running','ci_passed','preview_ready','failed')),
  project_name text not null check (char_length(project_name) between 1 and 80),
  publish_slug text not null check (publish_slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  project jsonb not null,
  plan jsonb null,
  audit jsonb null,
  provider text null,
  model text null,
  generation_path text null,
  status_token_hash text not null check (char_length(status_token_hash) = 64),
  worker_id text null,
  attempts integer not null default 0 check (attempts between 0 and 3),
  branch_name text null,
  commit_sha text null,
  pr_number integer null,
  pr_url text null,
  preview_url text null,
  ci_url text null,
  error_code text null,
  error_message text null,
  claimed_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists builder_agent_jobs_queue_idx
  on public.builder_agent_jobs (status, created_at)
  where status in ('queued','running');

create index if not exists builder_agent_jobs_user_idx
  on public.builder_agent_jobs (user_id, created_at desc)
  where user_id is not null;

alter table public.builder_agent_jobs enable row level security;
revoke all on table public.builder_agent_jobs from anon, authenticated;

create or replace function public.claim_builder_agent_job(p_worker_id text)
returns setof public.builder_agent_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_worker_id is null or char_length(trim(p_worker_id)) < 3 then
    raise exception 'invalid_worker_id';
  end if;

  return query
  update public.builder_agent_jobs as jobs
  set
    status = 'running',
    worker_id = p_worker_id,
    attempts = jobs.attempts + 1,
    claimed_at = now(),
    updated_at = now(),
    error_code = null,
    error_message = null
  where jobs.id = (
    select candidate.id
    from public.builder_agent_jobs as candidate
    where
      candidate.attempts < 3
      and (
        candidate.status = 'queued'
        or (
          candidate.status = 'running'
          and candidate.claimed_at < now() - interval '10 minutes'
        )
      )
    order by candidate.created_at asc
    for update skip locked
    limit 1
  )
  returning jobs.*;
end;
$$;

revoke all on function public.claim_builder_agent_job(text) from public, anon, authenticated;
grant execute on function public.claim_builder_agent_job(text) to service_role;
