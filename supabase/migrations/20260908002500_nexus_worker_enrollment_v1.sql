create table public.nexus_worker_credentials (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null unique references public.nexus_workers(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users(id) on delete set null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index nexus_worker_credentials_created_by_idx on public.nexus_worker_credentials (created_by);

alter table public.nexus_worker_credentials enable row level security;
revoke all on table public.nexus_worker_credentials from anon, authenticated;
grant select, insert, update, delete on table public.nexus_worker_credentials to service_role;

create or replace function public.nexus_enroll_worker(
  p_owner_user_id uuid,
  p_name text,
  p_platform text,
  p_token_hash text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace public.nexus_workspaces;
  v_worker public.nexus_workers;
begin
  if p_owner_user_id is null then raise exception 'invalid_worker_owner'; end if;
  if p_name is null or char_length(trim(p_name)) < 2 or char_length(trim(p_name)) > 120 then raise exception 'invalid_worker_name'; end if;
  if p_platform not in ('windows','linux','macos','docker','vm','other') then raise exception 'invalid_worker_platform'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_worker_token_hash'; end if;

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

  insert into public.nexus_workers (
    workspace_id, name, platform, status, capabilities, runtime_info, created_by
  ) values (
    v_workspace.id,
    trim(p_name),
    p_platform,
    'offline',
    '{}'::jsonb,
    jsonb_build_object('protocol_version', '1'),
    p_owner_user_id
  ) returning * into v_worker;

  insert into public.nexus_worker_credentials (worker_id, token_hash, created_by)
  values (v_worker.id, p_token_hash, p_owner_user_id);

  insert into public.nexus_audit_logs (workspace_id, user_id, action, status, metadata)
  values (
    v_workspace.id,
    p_owner_user_id,
    'worker.enrolled',
    'succeeded',
    jsonb_build_object('worker_id', v_worker.id, 'platform', p_platform)
  );

  return jsonb_build_object(
    'worker_id', v_worker.id,
    'workspace_id', v_workspace.id,
    'status', v_worker.status
  );
end;
$$;

create or replace function public.nexus_worker_heartbeat(
  p_token_hash text,
  p_announcement jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_credential public.nexus_worker_credentials;
  v_worker public.nexus_workers;
  v_now timestamptz := now();
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_worker_token_hash'; end if;
  if jsonb_typeof(p_announcement) <> 'object' then raise exception 'invalid_worker_announcement'; end if;
  if p_announcement->>'protocolVersion' <> '1' then raise exception 'worker_protocol_unsupported'; end if;
  if jsonb_typeof(p_announcement->'tools') <> 'array' then raise exception 'invalid_worker_tools'; end if;
  if jsonb_typeof(p_announcement->'capabilities') <> 'array' then raise exception 'invalid_worker_capabilities'; end if;
  if jsonb_typeof(p_announcement->'resources') <> 'object' then raise exception 'invalid_worker_resources'; end if;

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
  if p_announcement->>'platform' <> v_worker.platform then raise exception 'worker_platform_mismatch'; end if;

  update public.nexus_workers
  set
    status = 'online',
    capabilities = jsonb_build_object(
      'tools', p_announcement->'tools',
      'capabilities', p_announcement->'capabilities',
      'resources', p_announcement->'resources'
    ),
    runtime_info = jsonb_build_object(
      'protocol_version', p_announcement->>'protocolVersion',
      'reported_name', p_announcement->>'name'
    ),
    last_seen_at = v_now,
    updated_at = v_now
  where id = v_worker.id;

  update public.nexus_worker_credentials
  set last_used_at = v_now
  where id = v_credential.id;

  return jsonb_build_object(
    'worker_id', v_worker.id,
    'status', 'online',
    'last_seen_at', v_now
  );
end;
$$;

revoke execute on function public.nexus_enroll_worker(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.nexus_enroll_worker(uuid,text,text,text) to service_role;
revoke execute on function public.nexus_worker_heartbeat(text,jsonb) from public, anon, authenticated;
grant execute on function public.nexus_worker_heartbeat(text,jsonb) to service_role;

comment on table public.nexus_worker_credentials is 'Credenciais de workers; apenas hash SHA-256 é persistido, nunca o token em claro.';
comment on function public.nexus_worker_heartbeat(text,jsonb) is 'Atualiza saúde/capabilities de worker autenticado; não entrega nem executa jobs.';