create table public.crm_proposals (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  status text not null default 'ready' check (status in ('ready','approved','payment_pending','paid','expired','rejected','canceled','refunded')),
  currency text not null default 'BRL' check (currency = 'BRL'),
  subtotal_cents integer not null check (subtotal_cents > 0 and subtotal_cents <= 1000000000),
  total_cents integer not null check (total_cents > 0 and total_cents <= 1000000000),
  valid_until timestamptz not null,
  notes text check (notes is null or char_length(notes) <= 5000),
  approved_at timestamptz,
  approved_by_name text check (approved_by_name is null or char_length(approved_by_name) between 2 and 120),
  rejected_at timestamptz,
  canceled_at timestamptz,
  paid_at timestamptz,
  refunded_at timestamptz,
  payment_provider text check (payment_provider is null or payment_provider = 'mercado_pago'),
  payment_status text not null default 'not_started' check (payment_status in ('not_started','preference_pending','preference_created','pending','approved','rejected','cancelled','refunded','charged_back','error')),
  provider_preference_id text,
  provider_payment_id text,
  checkout_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crm_proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.crm_proposals(id) on delete cascade,
  position integer not null check (position between 1 and 20),
  title text not null check (char_length(title) between 2 and 160),
  description text check (description is null or char_length(description) <= 1200),
  quantity integer not null check (quantity between 1 and 1000),
  unit_price_cents integer not null check (unit_price_cents >= 0 and unit_price_cents <= 1000000000),
  created_at timestamptz not null default now(),
  unique (proposal_id, position)
);

alter table public.crm_proposals enable row level security;
alter table public.crm_proposal_items enable row level security;
revoke all on table public.crm_proposals from anon, authenticated;
revoke all on table public.crm_proposal_items from anon, authenticated;
grant select, insert, update, delete on table public.crm_proposals to service_role;
grant select, insert, update, delete on table public.crm_proposal_items to service_role;

create index crm_proposals_lead_created_idx on public.crm_proposals (lead_id, created_at desc);
create index crm_proposals_status_valid_idx on public.crm_proposals (status, valid_until);
create index crm_proposal_items_proposal_idx on public.crm_proposal_items (proposal_id, position);

create or replace function public.crm_create_proposal(
  p_lead_id uuid,
  p_valid_until timestamptz,
  p_notes text,
  p_created_by uuid,
  p_items jsonb
) returns public.crm_proposals
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lead_stage text;
  v_subtotal bigint;
  v_proposal public.crm_proposals;
begin
  select stage into v_lead_stage from public.crm_leads where id = p_lead_id for update;
  if v_lead_stage is null then raise exception 'lead_not_found'; end if;
  if v_lead_stage not in ('qualificado','proposta','negociacao') then raise exception 'lead_not_qualified'; end if;
  if p_valid_until <= now() or p_valid_until > now() + interval '180 days' then raise exception 'invalid_valid_until'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then raise exception 'invalid_items'; end if;

  select sum(((item->>'quantity')::integer) * ((item->>'unit_price_cents')::integer))
    into v_subtotal
  from jsonb_array_elements(p_items) item;
  if v_subtotal is null or v_subtotal <= 0 or v_subtotal > 1000000000 then raise exception 'invalid_total'; end if;

  insert into public.crm_proposals (lead_id, subtotal_cents, total_cents, valid_until, notes, created_by)
  values (p_lead_id, v_subtotal::integer, v_subtotal::integer, p_valid_until, nullif(trim(p_notes), ''), p_created_by)
  returning * into v_proposal;

  insert into public.crm_proposal_items (proposal_id, position, title, description, quantity, unit_price_cents)
  select v_proposal.id,
         ordinality::integer,
         trim(item->>'title'),
         nullif(trim(item->>'description'), ''),
         (item->>'quantity')::integer,
         (item->>'unit_price_cents')::integer
  from jsonb_array_elements(p_items) with ordinality as x(item, ordinality);

  update public.crm_leads
     set stage = case when stage = 'qualificado' then 'proposta' else stage end,
         estimated_value_cents = coalesce(estimated_value_cents, v_subtotal::integer),
         updated_at = now()
   where id = p_lead_id;

  return v_proposal;
end;
$$;

create or replace function public.crm_approve_proposal(p_public_id uuid, p_approved_by_name text)
returns public.crm_proposals
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_proposal public.crm_proposals;
begin
  if char_length(trim(p_approved_by_name)) < 2 or char_length(trim(p_approved_by_name)) > 120 then raise exception 'invalid_approver'; end if;
  select * into v_proposal from public.crm_proposals where public_id = p_public_id for update;
  if v_proposal.id is null then raise exception 'proposal_not_found'; end if;
  if v_proposal.valid_until < now() and v_proposal.status = 'ready' then
    update public.crm_proposals set status='expired', updated_at=now() where id=v_proposal.id returning * into v_proposal;
    return v_proposal;
  end if;
  if v_proposal.status = 'ready' then
    update public.crm_proposals
       set status='approved', approved_at=now(), approved_by_name=trim(p_approved_by_name), payment_status='preference_pending', updated_at=now()
     where id=v_proposal.id returning * into v_proposal;
  end if;
  return v_proposal;
end;
$$;

create or replace function public.crm_record_proposal_payment(
  p_proposal_id uuid,
  p_payment_id text,
  p_payment_status text,
  p_paid_cents integer,
  p_currency text
) returns public.crm_proposals
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_proposal public.crm_proposals;
begin
  select * into v_proposal from public.crm_proposals where id=p_proposal_id for update;
  if v_proposal.id is null then raise exception 'proposal_not_found'; end if;
  if p_paid_cents <> v_proposal.total_cents or p_currency <> v_proposal.currency then raise exception 'payment_mismatch'; end if;

  if p_payment_status = 'approved' then
    update public.crm_proposals set status='paid', payment_status='approved', provider_payment_id=p_payment_id, paid_at=coalesce(paid_at, now()), updated_at=now() where id=v_proposal.id returning * into v_proposal;
    update public.crm_leads set stage='ganho', estimated_value_cents=v_proposal.total_cents, updated_at=now() where id=v_proposal.lead_id;
  elsif p_payment_status in ('refunded','charged_back') then
    update public.crm_proposals set status='refunded', payment_status=p_payment_status, provider_payment_id=p_payment_id, refunded_at=coalesce(refunded_at, now()), updated_at=now() where id=v_proposal.id returning * into v_proposal;
    update public.crm_leads set stage='negociacao', updated_at=now() where id=v_proposal.lead_id and stage='ganho';
  elsif p_payment_status in ('rejected','cancelled') then
    update public.crm_proposals set status='approved', payment_status=p_payment_status, provider_payment_id=p_payment_id, updated_at=now() where id=v_proposal.id returning * into v_proposal;
  else
    update public.crm_proposals set status=case when status='approved' then 'payment_pending' else status end, payment_status='pending', provider_payment_id=p_payment_id, updated_at=now() where id=v_proposal.id returning * into v_proposal;
  end if;
  return v_proposal;
end;
$$;

revoke execute on function public.crm_create_proposal(uuid,timestamptz,text,uuid,jsonb) from public, anon, authenticated;
revoke execute on function public.crm_approve_proposal(uuid,text) from public, anon, authenticated;
revoke execute on function public.crm_record_proposal_payment(uuid,text,text,integer,text) from public, anon, authenticated;
grant execute on function public.crm_create_proposal(uuid,timestamptz,text,uuid,jsonb) to service_role;
grant execute on function public.crm_approve_proposal(uuid,text) to service_role;
grant execute on function public.crm_record_proposal_payment(uuid,text,text,integer,text) to service_role;

comment on table public.crm_proposals is 'Propostas comerciais privadas do Nexus; revisão pública somente por public_id opaco via rota server-side.';
comment on table public.crm_proposal_items is 'Itens versionados por proposta comercial; acesso somente server-side.';
