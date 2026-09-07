create or replace function public.complete_crm_followup_task(
  p_lead_id uuid,
  p_contacted_at timestamptz default now()
)
returns setof public.crm_leads
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.crm_followup_tasks
     set status = 'done', completed_at = p_contacted_at, updated_at = now()
   where lead_id = p_lead_id and status = 'pending';

  return query
  update public.crm_leads
     set last_contacted_at = p_contacted_at,
         next_followup_at = null,
         updated_at = now()
   where id = p_lead_id
   returning *;
end;
$$;

revoke all on function public.complete_crm_followup_task(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.complete_crm_followup_task(uuid, timestamptz) to service_role;

comment on function public.complete_crm_followup_task(uuid, timestamptz) is 'Conclui o follow-up interno e registra o contato. Nao envia mensagem externa.';
