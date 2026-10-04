-- Keep auth.uid() as an initplan instead of re-evaluating it for every row.
drop policy if exists nexus_workspaces_owner_read on public.nexus_workspaces;
create policy nexus_workspaces_owner_read on public.nexus_workspaces
  for select to authenticated
  using (owner_user_id = (select auth.uid()));

drop policy if exists nexus_projects_owner_read on public.nexus_projects;
create policy nexus_projects_owner_read on public.nexus_projects
  for select to authenticated
  using (exists (
    select 1 from public.nexus_workspaces w
    where w.id = workspace_id and w.owner_user_id = (select auth.uid())
  ));

drop policy if exists nexus_artifacts_owner_read on public.nexus_artifacts;
create policy nexus_artifacts_owner_read on public.nexus_artifacts
  for select to authenticated
  using (exists (
    select 1
    from public.nexus_projects p
    join public.nexus_workspaces w on w.id = p.workspace_id
    where p.id = project_id and w.owner_user_id = (select auth.uid())
  ));

drop policy if exists nexus_tool_runs_owner_read on public.nexus_tool_runs;
create policy nexus_tool_runs_owner_read on public.nexus_tool_runs
  for select to authenticated
  using (exists (
    select 1
    from public.nexus_projects p
    join public.nexus_workspaces w on w.id = p.workspace_id
    where p.id = project_id and w.owner_user_id = (select auth.uid())
  ));

drop policy if exists nexus_integrations_owner_read on public.nexus_integrations;
create policy nexus_integrations_owner_read on public.nexus_integrations
  for select to authenticated
  using (exists (
    select 1 from public.nexus_workspaces w
    where w.id = workspace_id and w.owner_user_id = (select auth.uid())
  ));

drop policy if exists nexus_deployments_owner_read on public.nexus_deployments;
create policy nexus_deployments_owner_read on public.nexus_deployments
  for select to authenticated
  using (exists (
    select 1
    from public.nexus_projects p
    join public.nexus_workspaces w on w.id = p.workspace_id
    where p.id = project_id and w.owner_user_id = (select auth.uid())
  ));

drop policy if exists nexus_audit_owner_read on public.nexus_audit_logs;
create policy nexus_audit_owner_read on public.nexus_audit_logs
  for select to authenticated
  using (exists (
    select 1 from public.nexus_workspaces w
    where w.id = workspace_id and w.owner_user_id = (select auth.uid())
  ));

drop policy if exists nexus_workers_owner_read on public.nexus_workers;
create policy nexus_workers_owner_read on public.nexus_workers
  for select to authenticated
  using (exists (
    select 1 from public.nexus_workspaces w
    where w.id = workspace_id and w.owner_user_id = (select auth.uid())
  ));

drop policy if exists nexus_tool_installations_owner_read on public.nexus_tool_installations;
create policy nexus_tool_installations_owner_read on public.nexus_tool_installations
  for select to authenticated
  using (exists (
    select 1 from public.nexus_workspaces w
    where w.id = workspace_id and w.owner_user_id = (select auth.uid())
  ));

drop policy if exists nexus_tool_health_owner_read on public.nexus_tool_health;
create policy nexus_tool_health_owner_read on public.nexus_tool_health
  for select to authenticated
  using (exists (
    select 1
    from public.nexus_tool_installations i
    join public.nexus_workspaces w on w.id = i.workspace_id
    where i.id = installation_id and w.owner_user_id = (select auth.uid())
  ));

drop policy if exists nexus_jobs_owner_read on public.nexus_jobs;
create policy nexus_jobs_owner_read on public.nexus_jobs
  for select to authenticated
  using (exists (
    select 1 from public.nexus_workspaces w
    where w.id = workspace_id and w.owner_user_id = (select auth.uid())
  ));

-- Cover foreign keys used by deletes, ownership checks and queue lookups.
create index if not exists nexus_artifacts_created_by_idx on public.nexus_artifacts (created_by);
create index if not exists nexus_audit_project_idx on public.nexus_audit_logs (project_id);
create index if not exists nexus_audit_tool_idx on public.nexus_audit_logs (tool_id);
create index if not exists nexus_audit_user_idx on public.nexus_audit_logs (user_id);
create index if not exists nexus_deployments_user_idx on public.nexus_deployments (user_id);
create index if not exists nexus_integrations_created_by_idx on public.nexus_integrations (created_by);
create index if not exists nexus_tool_runs_tool_idx on public.nexus_tool_runs (tool_id);
create index if not exists nexus_tool_runs_user_idx on public.nexus_tool_runs (user_id);
create index if not exists nexus_workers_created_by_idx on public.nexus_workers (created_by);
create index if not exists nexus_tool_installations_tool_idx on public.nexus_tool_installations (tool_id);
create index if not exists nexus_tool_installations_version_idx on public.nexus_tool_installations (tool_version_id);
create index if not exists nexus_tool_installations_worker_idx on public.nexus_tool_installations (worker_id);
create index if not exists nexus_tool_installations_installed_by_idx on public.nexus_tool_installations (installed_by);
create index if not exists nexus_jobs_project_idx on public.nexus_jobs (project_id);
create index if not exists nexus_jobs_requested_by_idx on public.nexus_jobs (requested_by);
create index if not exists nexus_jobs_tool_idx on public.nexus_jobs (tool_id);
create index if not exists nexus_jobs_installation_idx on public.nexus_jobs (installation_id);