create table public.nexus_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  slug text not null check (char_length(slug) between 2 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, slug)
);

create table public.nexus_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.nexus_workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 160),
  slug text not null check (char_length(slug) between 2 and 100),
  description text check (description is null or char_length(description) <= 5000),
  project_type text not null check (project_type in (
    'website','app','software','ai','agent','automation','image','video','audio',
    'presentation','document','spreadsheet','game','database','api','business','other'
  )),
  status text not null default 'draft' check (status in ('draft','active','archived')),
  stack jsonb not null default '[]'::jsonb check (jsonb_typeof(stack) = 'array'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.nexus_artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.nexus_projects(id) on delete cascade,
  kind text not null check (kind in ('code','document','image','video','audio','dataset','workflow','agent','design','config','other')),
  name text not null check (char_length(name) between 1 and 180),
  path text not null check (char_length(path) between 1 and 300),
  mime_type text check (mime_type is null or char_length(mime_type) <= 160),
  content_text text,
  content_json jsonb,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  version integer not null default 1 check (version >= 1),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, path, version)
);

create table public.nexus_tools (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9._-]{2,79}$'),
  name text not null check (char_length(name) between 2 and 120),
  category text not null check (char_length(category) between 2 and 80),
  description text not null check (char_length(description) between 2 and 1000),
  permissions text[] not null default '{}'::text[],
  input_schema jsonb not null default '{}'::jsonb check (jsonb_typeof(input_schema) = 'object'),
  output_schema jsonb not null default '{}'::jsonb check (jsonb_typeof(output_schema) = 'object'),
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.nexus_tool_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.nexus_projects(id) on delete cascade,
  tool_id text not null references public.nexus_tools(id),
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled','blocked')),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error text check (error is null or char_length(error) <= 5000),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.nexus_integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.nexus_workspaces(id) on delete cascade,
  provider text not null check (char_length(provider) between 2 and 80),
  status text not null default 'disconnected' check (status in ('disconnected','connected','error')),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider)
);

create table public.nexus_deployments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.nexus_projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  provider text not null check (char_length(provider) between 2 and 80),
  environment text not null check (environment in ('development','preview','production')),
  status text not null default 'planned' check (status in ('planned','building','ready','error','cancelled','blocked')),
  url text check (url is null or char_length(url) <= 1000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.nexus_audit_logs (
  id bigint generated always as identity primary key,
  workspace_id uuid references public.nexus_workspaces(id) on delete cascade,
  project_id uuid references public.nexus_projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 2 and 160),
  tool_id text references public.nexus_tools(id) on delete set null,
  status text not null check (status in ('started','succeeded','failed','blocked')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index nexus_projects_workspace_created_idx on public.nexus_projects (workspace_id, created_at desc);
create index nexus_artifacts_project_created_idx on public.nexus_artifacts (project_id, created_at desc);
create index nexus_tool_runs_project_created_idx on public.nexus_tool_runs (project_id, created_at desc);
create index nexus_deployments_project_created_idx on public.nexus_deployments (project_id, created_at desc);
create index nexus_audit_workspace_created_idx on public.nexus_audit_logs (workspace_id, created_at desc);

alter table public.nexus_workspaces enable row level security;
alter table public.nexus_projects enable row level security;
alter table public.nexus_artifacts enable row level security;
alter table public.nexus_tools enable row level security;
alter table public.nexus_tool_runs enable row level security;
alter table public.nexus_integrations enable row level security;
alter table public.nexus_deployments enable row level security;
alter table public.nexus_audit_logs enable row level security;

revoke all on table public.nexus_workspaces from anon, authenticated;
revoke all on table public.nexus_projects from anon, authenticated;
revoke all on table public.nexus_artifacts from anon, authenticated;
revoke all on table public.nexus_tools from anon, authenticated;
revoke all on table public.nexus_tool_runs from anon, authenticated;
revoke all on table public.nexus_integrations from anon, authenticated;
revoke all on table public.nexus_deployments from anon, authenticated;
revoke all on table public.nexus_audit_logs from anon, authenticated;

grant select on table public.nexus_workspaces to authenticated;
grant select on table public.nexus_projects to authenticated;
grant select on table public.nexus_artifacts to authenticated;
grant select on table public.nexus_tools to authenticated;
grant select on table public.nexus_tool_runs to authenticated;
grant select on table public.nexus_integrations to authenticated;
grant select on table public.nexus_deployments to authenticated;
grant select on table public.nexus_audit_logs to authenticated;

grant select, insert, update, delete on table public.nexus_workspaces to service_role;
grant select, insert, update, delete on table public.nexus_projects to service_role;
grant select, insert, update, delete on table public.nexus_artifacts to service_role;
grant select, insert, update, delete on table public.nexus_tools to service_role;
grant select, insert, update, delete on table public.nexus_tool_runs to service_role;
grant select, insert, update, delete on table public.nexus_integrations to service_role;
grant select, insert, update, delete on table public.nexus_deployments to service_role;
grant select, insert, update, delete on table public.nexus_audit_logs to service_role;

create policy nexus_workspaces_owner_read on public.nexus_workspaces
  for select to authenticated
  using (owner_user_id = auth.uid());

create policy nexus_projects_owner_read on public.nexus_projects
  for select to authenticated
  using (exists (
    select 1 from public.nexus_workspaces w
    where w.id = workspace_id and w.owner_user_id = auth.uid()
  ));

create policy nexus_artifacts_owner_read on public.nexus_artifacts
  for select to authenticated
  using (exists (
    select 1
    from public.nexus_projects p
    join public.nexus_workspaces w on w.id = p.workspace_id
    where p.id = project_id and w.owner_user_id = auth.uid()
  ));

create policy nexus_tools_authenticated_read on public.nexus_tools
  for select to authenticated
  using (is_enabled = true);

create policy nexus_tool_runs_owner_read on public.nexus_tool_runs
  for select to authenticated
  using (exists (
    select 1
    from public.nexus_projects p
    join public.nexus_workspaces w on w.id = p.workspace_id
    where p.id = project_id and w.owner_user_id = auth.uid()
  ));

create policy nexus_integrations_owner_read on public.nexus_integrations
  for select to authenticated
  using (exists (
    select 1 from public.nexus_workspaces w
    where w.id = workspace_id and w.owner_user_id = auth.uid()
  ));

create policy nexus_deployments_owner_read on public.nexus_deployments
  for select to authenticated
  using (exists (
    select 1
    from public.nexus_projects p
    join public.nexus_workspaces w on w.id = p.workspace_id
    where p.id = project_id and w.owner_user_id = auth.uid()
  ));

create policy nexus_audit_owner_read on public.nexus_audit_logs
  for select to authenticated
  using (exists (
    select 1 from public.nexus_workspaces w
    where w.id = workspace_id and w.owner_user_id = auth.uid()
  ));

insert into public.nexus_tools (id, name, category, description, permissions, input_schema, output_schema)
values
  ('site-builder', 'Site Builder', 'development', 'Gera projetos web estruturados e auditáveis.', array['project:read','artifact:write'], '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb),
  ('ai-builder', 'AI Builder', 'ai', 'Orquestra recursos de IA para projetos Nexus.', array['project:read','artifact:write'], '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb),
  ('automation-builder', 'Automation Builder', 'automation', 'Modela automações em trigger, conditions, actions e output.', array['project:read','artifact:write'], '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb),
  ('agent-builder', 'Agent Builder', 'agents', 'Define agentes com objetivo, ferramentas, memória e permissões.', array['project:read','artifact:write'], '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb),
  ('document-creator', 'Document Creator', 'documents', 'Cria artefatos documentais persistentes.', array['project:read','artifact:write'], '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb),
  ('image-studio', 'Image Studio', 'images', 'Cria e edita artefatos visuais.', array['project:read','artifact:write'], '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb),
  ('spreadsheet-builder', 'Spreadsheet Builder', 'spreadsheets', 'Cria planilhas, modelos e análises tabulares.', array['project:read','artifact:write'], '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb),
  ('presentation-builder', 'Presentation Builder', 'presentations', 'Cria apresentações e narrativas estruturadas.', array['project:read','artifact:write'], '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb),
  ('research-engine', 'Research Engine', 'research', 'Organiza pesquisa com fontes, evidências e síntese.', array['project:read','artifact:write'], '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb),
  ('deployment-engine', 'Deployment Engine', 'deployment', 'Coordena build, testes, preview, aprovação e deploy.', array['project:read','deployment:write'], '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb)
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  permissions = excluded.permissions,
  input_schema = excluded.input_schema,
  output_schema = excluded.output_schema,
  is_enabled = true,
  updated_at = now();

create or replace function public.nexus_create_project(
  p_owner_user_id uuid,
  p_name text,
  p_description text,
  p_project_type text,
  p_stack jsonb,
  p_metadata jsonb,
  p_artifacts jsonb
) returns public.nexus_projects
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace public.nexus_workspaces;
  v_project public.nexus_projects;
  v_artifact jsonb;
  v_slug text;
begin
  if p_owner_user_id is null or not exists (select 1 from auth.users where id = p_owner_user_id) then
    raise exception 'invalid_owner';
  end if;
  if jsonb_typeof(coalesce(p_stack, '[]'::jsonb)) <> 'array' then raise exception 'invalid_stack'; end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then raise exception 'invalid_metadata'; end if;
  if jsonb_typeof(coalesce(p_artifacts, '[]'::jsonb)) <> 'array' then raise exception 'invalid_artifacts'; end if;
  if jsonb_array_length(coalesce(p_artifacts, '[]'::jsonb)) > 64 then raise exception 'too_many_artifacts'; end if;

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

  v_slug := trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then v_slug := 'nexus-project'; end if;

  insert into public.nexus_projects (workspace_id, name, slug, description, project_type, stack, metadata)
  values (
    v_workspace.id,
    trim(p_name),
    left(v_slug, 100),
    nullif(trim(coalesce(p_description, '')), ''),
    p_project_type,
    coalesce(p_stack, '[]'::jsonb),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_project;

  for v_artifact in select value from jsonb_array_elements(coalesce(p_artifacts, '[]'::jsonb))
  loop
    insert into public.nexus_artifacts (
      project_id, kind, name, path, mime_type, content_text, content_json, metadata, created_by
    ) values (
      v_project.id,
      coalesce(v_artifact->>'kind', 'other'),
      coalesce(nullif(trim(v_artifact->>'name'), ''), 'artifact'),
      v_artifact->>'path',
      nullif(trim(coalesce(v_artifact->>'mime_type', '')), ''),
      v_artifact->>'content_text',
      v_artifact->'content_json',
      coalesce(v_artifact->'metadata', '{}'::jsonb),
      p_owner_user_id
    );
  end loop;

  insert into public.nexus_audit_logs (workspace_id, project_id, user_id, action, status, metadata)
  values (v_workspace.id, v_project.id, p_owner_user_id, 'project.created', 'succeeded', jsonb_build_object('project_type', p_project_type));

  return v_project;
end;
$$;

revoke execute on function public.nexus_create_project(uuid,text,text,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.nexus_create_project(uuid,text,text,text,jsonb,jsonb,jsonb) to service_role;

comment on table public.nexus_workspaces is 'Workspace persistente do Nexus Core.';
comment on table public.nexus_projects is 'Primitive PROJECT compartilhada por todos os motores de criação.';
comment on table public.nexus_artifacts is 'Primitive ARTIFACT para código, documentos, mídia, agentes, workflows e outros outputs.';
comment on table public.nexus_tools is 'Universal Tool Registry do Nexus.';
comment on table public.nexus_tool_runs is 'Execuções verificáveis das ferramentas Nexus.';
comment on table public.nexus_integrations is 'Metadados não secretos de integrações do workspace.';
comment on table public.nexus_deployments is 'Histórico de deploys por projeto e ambiente.';
comment on table public.nexus_audit_logs is 'Audit log de ações do Nexus Core.';
