-- Builder Agent RPC hardening.
-- The application calls these functions only from server-only code using service_role.
-- Apply this migration together with a deployment that contains the corresponding
-- lib/builder/job-store.ts change; applying it before that deployment would break
-- an older runtime that still authenticates these RPC calls with anon.

revoke all on function public.enqueue_builder_agent_job(uuid,text,text,jsonb,jsonb,jsonb,text,text,text,text) from public;
revoke all on function public.enqueue_builder_agent_job(uuid,text,text,jsonb,jsonb,jsonb,text,text,text,text) from anon, authenticated;
grant execute on function public.enqueue_builder_agent_job(uuid,text,text,jsonb,jsonb,jsonb,text,text,text,text) to service_role;

revoke all on function public.get_builder_agent_job_status(uuid,text) from public;
revoke all on function public.get_builder_agent_job_status(uuid,text) from anon, authenticated;
grant execute on function public.get_builder_agent_job_status(uuid,text) to service_role;
