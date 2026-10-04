create table public.nexus_site_reviews (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  engine_version text not null check (length(engine_version) between 1 and 30),
  consent_version text not null check (consent_version in ('internal-review-v1','owner-project-v1')),
  consent_at timestamptz not null default now(),
  review jsonb not null check (jsonb_typeof(review) = 'object' and octet_length(review::text) <= 400000),
  created_at timestamptz not null default now(),
  unique(creator_user_id, source_hash, engine_version)
);
alter table public.nexus_site_reviews enable row level security;
revoke all on public.nexus_site_reviews from public, anon, authenticated;
grant select, insert, delete on public.nexus_site_reviews to service_role;
create index nexus_site_reviews_created_idx on public.nexus_site_reviews(created_at desc);
create index nexus_site_reviews_creator_idx on public.nexus_site_reviews(creator_user_id, created_at desc);

create function public.nexus_capture_site_review(
  p_creator uuid, p_consent boolean, p_consent_version text,
  p_hash text, p_engine text, p_name text, p_review jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid; v_owner boolean;
begin
  if not exists (select 1 from public.crm_admins where role='owner') then
    raise exception 'site_lab_owner_missing';
  end if;
  select exists(select 1 from public.crm_admins where user_id=p_creator and role='owner') into v_owner;
  if not v_owner and (p_consent is distinct from true or p_consent_version is distinct from 'internal-review-v1') then
    raise exception 'site_lab_consent_required';
  end if;
  if jsonb_typeof(p_review->'original') is distinct from 'object'
    or jsonb_typeof(p_review->'revised') is distinct from 'object'
    or jsonb_typeof(p_review->'changes') is distinct from 'array'
    or jsonb_typeof(p_review->'before') is distinct from 'array'
    or jsonb_typeof(p_review->'after') is distinct from 'array' then
    raise exception 'site_lab_review_invalid';
  end if;
  insert into public.nexus_site_reviews(creator_user_id,name,source_hash,engine_version,consent_version,review)
  values(p_creator,p_name,p_hash,p_engine,case when v_owner and p_consent is distinct from true then 'owner-project-v1' else 'internal-review-v1' end,p_review)
  on conflict(creator_user_id,source_hash,engine_version) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.nexus_site_reviews where creator_user_id=p_creator and source_hash=p_hash and engine_version=p_engine;
  end if;
  return v_id;
end $$;
revoke all on function public.nexus_capture_site_review(uuid,boolean,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.nexus_capture_site_review(uuid,boolean,text,text,text,text,jsonb) to service_role;
