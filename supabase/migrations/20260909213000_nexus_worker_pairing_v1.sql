create table public.nexus_worker_pairings (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  name text not null check (char_length(trim(name)) between 2 and 120),
  platform text not null check (platform in ('windows','linux','macos','docker','vm','other')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index nexus_worker_pairings_owner_expires_idx
  on public.nexus_worker_pairings (owner_user_id, expires_at desc);

alter table public.nexus_worker_pairings enable row level security;
revoke all on table public.nexus_worker_pairings from public, anon, authenticated;
grant select, insert, update, delete on table public.nexus_worker_pairings to service_role;

create or replace function public.nexus_create_worker_pairing(
  p_owner_user_id uuid,
  p_name text,
  p_platform text,
  p_code_hash text,
  p_ttl_seconds integer default 600
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pairing public.nexus_worker_pairings;
begin
  if p_owner_user_id is null then raise exception 'invalid_worker_owner'; end if;
  if p_name is null or char_length(trim(p_name)) < 2 or char_length(trim(p_name)) > 120 then raise exception 'invalid_worker_name'; end if;
  if p_platform not in ('windows','linux','macos','docker','vm','other') then raise exception 'invalid_worker_platform'; end if;
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_worker_pairing_hash'; end if;
  if p_ttl_seconds is null or p_ttl_seconds < 60 or p_ttl_seconds > 600 then raise exception 'invalid_worker_pairing_ttl'; end if;

  delete from public.nexus_worker_pairings
  where owner_user_id = p_owner_user_id
    and expires_at < now() - interval '1 hour';

  insert into public.nexus_worker_pairings (
    owner_user_id, code_hash, name, platform, expires_at
  ) values (
    p_owner_user_id,
    p_code_hash,
    trim(p_name),
    p_platform,
    now() + make_interval(secs => p_ttl_seconds)
  ) returning * into v_pairing;

  return jsonb_build_object(
    'pairing_id', v_pairing.id,
    'expires_at', v_pairing.expires_at
  );
end;
$$;

create or replace function public.nexus_redeem_worker_pairing(
  p_code_hash text,
  p_token_hash text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pairing public.nexus_worker_pairings;
  v_worker jsonb;
begin
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then raise exception 'worker_pairing_invalid'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_worker_token_hash'; end if;

  select * into v_pairing
  from public.nexus_worker_pairings
  where code_hash = p_code_hash
  for update;

  if v_pairing.id is null or v_pairing.consumed_at is not null or v_pairing.expires_at <= now() then
    raise exception 'worker_pairing_invalid';
  end if;

  v_worker := public.nexus_enroll_worker(
    v_pairing.owner_user_id,
    v_pairing.name,
    v_pairing.platform,
    p_token_hash
  );

  update public.nexus_worker_pairings
  set consumed_at = now()
  where id = v_pairing.id and consumed_at is null;

  return v_worker || jsonb_build_object('pairing_id', v_pairing.id);
end;
$$;

revoke execute on function public.nexus_create_worker_pairing(uuid,text,text,text,integer) from public, anon, authenticated;
grant execute on function public.nexus_create_worker_pairing(uuid,text,text,text,integer) to service_role;
revoke execute on function public.nexus_redeem_worker_pairing(text,text) from public, anon, authenticated;
grant execute on function public.nexus_redeem_worker_pairing(text,text) to service_role;

comment on table public.nexus_worker_pairings is 'Códigos de pareamento de uso único; somente SHA-256 é persistido e a validade máxima é 10 minutos.';
comment on function public.nexus_redeem_worker_pairing(text,text) is 'Troca atomicamente um código temporário válido por uma credencial de worker cujo token bruto nunca é persistido.';
