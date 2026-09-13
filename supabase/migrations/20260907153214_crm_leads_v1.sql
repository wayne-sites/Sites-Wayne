create table public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'solucoes-corporativas' check (source in ('solucoes-corporativas','servicos','auditoria','builder','manual')),
  name text not null check (char_length(name) between 2 and 120),
  business text not null check (char_length(business) between 2 and 160),
  contact text not null check (char_length(contact) between 5 and 200),
  contact_kind text not null default 'other' check (contact_kind in ('email','whatsapp','other')),
  solution text check (solution is null or char_length(solution) <= 120),
  bottleneck text check (bottleneck is null or char_length(bottleneck) <= 2000),
  stage text not null default 'novo' check (stage in ('novo','qualificado','proposta','negociacao','ganho','perdido')),
  priority text not null default 'normal' check (priority in ('baixa','normal','alta')),
  estimated_value_cents integer check (estimated_value_cents is null or estimated_value_cents >= 0),
  utm_source text check (utm_source is null or char_length(utm_source) <= 120),
  utm_medium text check (utm_medium is null or char_length(utm_medium) <= 120),
  utm_campaign text check (utm_campaign is null or char_length(utm_campaign) <= 160),
  last_contacted_at timestamptz,
  next_followup_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 5000),
  metadata jsonb not null default '{}'::jsonb,
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_leads enable row level security;
revoke all on table public.crm_leads from anon, authenticated;
grant select, insert, update, delete on table public.crm_leads to service_role;

create index crm_leads_stage_created_idx on public.crm_leads (stage, created_at desc);
create index crm_leads_created_idx on public.crm_leads (created_at desc);
create index crm_leads_followup_idx on public.crm_leads (next_followup_at) where next_followup_at is not null;

comment on table public.crm_leads is 'Leads comerciais capturados pelo Nexus; acesso somente via rotas server-side autorizadas.';
