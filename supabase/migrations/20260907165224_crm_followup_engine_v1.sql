create table public.crm_followup_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','done','cancelled')),
  kind text not null default 'contact' check (kind in ('contact')),
  due_at timestamptz not null,
  title text not null default 'Realizar follow-up' check (char_length(title) between 2 and 160),
  notes text check (notes is null or char_length(notes) <= 2000),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_followup_tasks enable row level security;
revoke all on table public.crm_followup_tasks from anon, authenticated;
grant select, insert, update, delete on table public.crm_followup_tasks to service_role;

create unique index crm_followup_one_pending_per_lead_idx
  on public.crm_followup_tasks (lead_id)
  where status = 'pending';
create index crm_followup_due_idx
  on public.crm_followup_tasks (due_at)
  where status = 'pending';

create or replace function public.sync_crm_followup_task()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.stage in ('ganho','perdido') or new.next_followup_at is null then
    update public.crm_followup_tasks
       set status = 'cancelled', updated_at = now()
     where lead_id = new.id and status = 'pending';
    return new;
  end if;

  insert into public.crm_followup_tasks (lead_id, due_at, title)
  values (new.id, new.next_followup_at, 'Follow-up com ' || new.business)
  on conflict (lead_id) where status = 'pending'
  do update set due_at = excluded.due_at, title = excluded.title, updated_at = now();

  return new;
end;
$$;

create trigger crm_leads_sync_followup_task
  after insert or update of next_followup_at, stage on public.crm_leads
  for each row execute function public.sync_crm_followup_task();

insert into public.crm_followup_tasks (lead_id, due_at, title)
select id, next_followup_at, 'Follow-up com ' || business
from public.crm_leads
where next_followup_at is not null
  and stage not in ('ganho','perdido')
on conflict (lead_id) where status = 'pending' do nothing;

comment on table public.crm_followup_tasks is 'Tarefas internas de follow-up do CRM. Nenhuma mensagem externa e enviada por esta tabela.';
