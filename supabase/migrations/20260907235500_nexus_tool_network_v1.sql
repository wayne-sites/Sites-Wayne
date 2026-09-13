create table public.nexus_tool_versions (
  id uuid primary key default gen_random_uuid(),
  tool_id text not null references public.nexus_tools(id) on delete cascade,
  version text not null check (char_length(version) between 1 and 80),
  manifest jsonb not null default '{}'::jsonb check (jsonb_typeof(manifest) = 'object'),
  created_at timestamptz not null default now(),
  unique (tool_id, version)
);

create table public.nexus_tool_capabilities (
  tool_id text not null references public.nexus_tools(id) on delete cascade,
  capability text not null check (capability ~ '^[a-z0-9]+([._-][a-z0-9]+){1,7}$' and char_length(capability) <= 120),
  created_at timestamptz not null default now(),
  primary key (tool_id, capability)
);

create table public.nexus_tool_providers (
  id uuid primary key default gen_random_uuid(),
  tool_id text not null references public.nexus_tools(id) on delete cascade,
  provider_key text not null check (provider_key ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  execution_type text not null check (execution_type in ('native','cli','node','python','docker','http','mcp','worker','browser')),
  pricing_model text not null check (pricing_model in ('free','open-source','self-hosted','free-tier','paid')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tool_id, provider_key)
);

create table public.nexus_tool_licenses (
  tool_id text primary key references public.nexus_tools(id) on delete cascade,
  license_name text not null default 'unverified' check (char_length(license_name) between 1 and 160),
  distribution_policy text not null default 'unknown' check (distribution_policy in (
    'unknown','allowed_bundle','allowed_self_host','adapter_only','external_connector_only','commercial_restrictions'
  )),
  source_url text check (source_url is null or char_length(source_url) <= 1000),
  checked_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.nexus_tool_security (
  tool_id text primary key references public.nexus_tools(id) on delete cascade,
  risk_level text not null default 'medium' check (risk_level in ('low','medium','high','critical')),
  sandbox_required boolean not null default true,
  permissions jsonb not null default '[]'::jsonb check (jsonb_typeof(permissions) = 'array'),
  review_status text not null default 'unreviewed' check (review_status in ('unreviewed','needs_review','approved','blocked')),
  findings jsonb not null default '[]'::jsonb check (jsonb_typeof(findings) = 'array'),
  checked_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.nexus_workers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.nexus_workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  platform text not null check (platform in ('windows','linux','macos','docker','vm','other')),
  status text not null default 'offline' check (status in ('offline','online','disabled','error')),
  capabilities jsonb not null default '{}'::jsonb check (jsonb_typeof(capabilities) = 'object'),
  runtime_info jsonb not null default '{}'::jsonb check (jsonb_typeof(runtime_info) = 'object'),
  last_seen_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.nexus_tool_installations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.nexus_workspaces(id) on delete cascade,
  tool_id text not null references public.nexus_tools(id) on delete cascade,
  tool_version_id uuid references public.nexus_tool_versions(id) on delete set null,
  target_type text not null check (target_type in ('native','worker','connector')),
  worker_id uuid references public.nexus_workers(id) on delete cascade,
  status text not null default 'available' check (status in ('available','installing','installed','connected','offline','broken','blocked','uninstalled')),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  installed_by uuid references auth.users(id) on delete set null,
  installed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((target_type = 'worker' and worker_id is not null) or (target_type <> 'worker' and worker_id is null))
);

create table public.nexus_tool_health (
  id bigint generated always as identity primary key,
  installation_id uuid not null references public.nexus_tool_installations(id) on delete cascade,
  status text not null check (status in ('online','offline','broken','update_available','incompatible','unknown')),
  latency_ms integer check (latency_ms is null or latency_ms between 0 and 3600000),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  checked_at timestamptz not null default now()
);

create table public.nexus_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.nexus_workspaces(id) on delete cascade,
  project_id uuid references public.nexus_projects(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  capability text not null check (capability ~ '^[a-z0-9]+([._-][a-z0-9]+){1,7}$' and char_length(capability) <= 120),
  tool_id text references public.nexus_tools(id) on delete set null,
  installation_id uuid references public.nexus_tool_installations(id) on delete set null,
  worker_id uuid references public.nexus_workers(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','blocked','cancelled')),
  zero_cost_mode boolean not null default true,
  requires_approval boolean not null default false,
  approval_status text not null default 'not_required' check (approval_status in ('not_required','pending','approved','rejected')),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error text check (error is null or char_length(error) <= 5000),
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index nexus_tool_capabilities_capability_idx on public.nexus_tool_capabilities (capability, tool_id);
create index nexus_tool_providers_tool_idx on public.nexus_tool_providers (tool_id, is_enabled);
create index nexus_tool_installations_workspace_idx on public.nexus_tool_installations (workspace_id, tool_id, status);
create index nexus_tool_health_installation_idx on public.nexus_tool_health (installation_id, checked_at desc);
create index nexus_workers_workspace_status_idx on public.nexus_workers (workspace_id, status, last_seen_at desc);
create index nexus_jobs_workspace_status_idx on public.nexus_jobs (workspace_id, status, queued_at);
create index nexus_jobs_worker_status_idx on public.nexus_jobs (worker_id, status, queued_at) where worker_id is not null;

alter table public.nexus_tool_versions enable row level security;
alter table public.nexus_tool_capabilities enable row level security;
alter table public.nexus_tool_providers enable row level security;
alter table public.nexus_tool_licenses enable row level security;
alter table public.nexus_tool_security enable row level security;
alter table public.nexus_workers enable row level security;
alter table public.nexus_tool_installations enable row level security;
alter table public.nexus_tool_health enable row level security;
alter table public.nexus_jobs enable row level security;

revoke all on table public.nexus_tool_versions from anon, authenticated;
revoke all on table public.nexus_tool_capabilities from anon, authenticated;
revoke all on table public.nexus_tool_providers from anon, authenticated;
revoke all on table public.nexus_tool_licenses from anon, authenticated;
revoke all on table public.nexus_tool_security from anon, authenticated;
revoke all on table public.nexus_workers from anon, authenticated;
revoke all on table public.nexus_tool_installations from anon, authenticated;
revoke all on table public.nexus_tool_health from anon, authenticated;
revoke all on table public.nexus_jobs from anon, authenticated;

grant select on table public.nexus_tool_versions to authenticated;
grant select on table public.nexus_tool_capabilities to authenticated;
grant select on table public.nexus_tool_providers to authenticated;
grant select on table public.nexus_tool_licenses to authenticated;
grant select on table public.nexus_tool_security to authenticated;
grant select on table public.nexus_workers to authenticated;
grant select on table public.nexus_tool_installations to authenticated;
grant select on table public.nexus_tool_health to authenticated;
grant select on table public.nexus_jobs to authenticated;

grant select, insert, update, delete on table public.nexus_tool_versions to service_role;
grant select, insert, update, delete on table public.nexus_tool_capabilities to service_role;
grant select, insert, update, delete on table public.nexus_tool_providers to service_role;
grant select, insert, update, delete on table public.nexus_tool_licenses to service_role;
grant select, insert, update, delete on table public.nexus_tool_security to service_role;
grant select, insert, update, delete on table public.nexus_workers to service_role;
grant select, insert, update, delete on table public.nexus_tool_installations to service_role;
grant select, insert, update, delete on table public.nexus_tool_health to service_role;
grant select, insert, update, delete on table public.nexus_jobs to service_role;

create policy nexus_tool_versions_authenticated_read on public.nexus_tool_versions
  for select to authenticated using (true);
create policy nexus_tool_capabilities_authenticated_read on public.nexus_tool_capabilities
  for select to authenticated using (true);
create policy nexus_tool_providers_authenticated_read on public.nexus_tool_providers
  for select to authenticated using (is_enabled = true);
create policy nexus_tool_licenses_authenticated_read on public.nexus_tool_licenses
  for select to authenticated using (true);
create policy nexus_tool_security_authenticated_read on public.nexus_tool_security
  for select to authenticated using (true);

create policy nexus_workers_owner_read on public.nexus_workers
  for select to authenticated
  using (exists (
    select 1 from public.nexus_workspaces w
    where w.id = workspace_id and w.owner_user_id = auth.uid()
  ));

create policy nexus_tool_installations_owner_read on public.nexus_tool_installations
  for select to authenticated
  using (exists (
    select 1 from public.nexus_workspaces w
    where w.id = workspace_id and w.owner_user_id = auth.uid()
  ));

create policy nexus_tool_health_owner_read on public.nexus_tool_health
  for select to authenticated
  using (exists (
    select 1
    from public.nexus_tool_installations i
    join public.nexus_workspaces w on w.id = i.workspace_id
    where i.id = installation_id and w.owner_user_id = auth.uid()
  ));

create policy nexus_jobs_owner_read on public.nexus_jobs
  for select to authenticated
  using (exists (
    select 1 from public.nexus_workspaces w
    where w.id = workspace_id and w.owner_user_id = auth.uid()
  ));

insert into public.nexus_tools (id, name, category, description, permissions, input_schema, output_schema)
values
  ('nexus-json', 'Nexus JSON', 'data', 'Ferramenta nativa para JSON.', '{}', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb),
  ('nexus-markdown', 'Nexus Markdown', 'documents', 'Ferramenta nativa para Markdown.', '{}', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb),
  ('ffmpeg', 'FFmpeg', 'media', 'Adapter seed para processamento de vídeo e áudio.', array['artifact:read','artifact:write','process:spawn'], '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb),
  ('imagemagick', 'ImageMagick', 'images', 'Adapter seed para processamento de imagens.', array['artifact:read','artifact:write','process:spawn'], '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb),
  ('pandoc', 'Pandoc', 'documents', 'Adapter seed para conversão documental.', array['artifact:read','artifact:write','process:spawn'], '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb),
  ('tesseract', 'Tesseract', 'ocr', 'Adapter seed para OCR local.', array['artifact:read','artifact:write','process:spawn'], '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb),
  ('playwright', 'Playwright', 'browser', 'Adapter seed para browser automation controlada.', array['browser:navigate','network:outbound','artifact:write'], '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb),
  ('ollama', 'Ollama', 'ai', 'Adapter seed para modelos locais.', array['network:local','model:read'], '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb),
  ('blender', 'Blender', '3d', 'Adapter seed para renderização 3D.', array['artifact:read','artifact:write','process:spawn'], '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb),
  ('libreoffice', 'LibreOffice', 'documents', 'Adapter seed para documentos, planilhas e apresentações.', array['artifact:read','artifact:write','process:spawn'], '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb),
  ('sqlite', 'SQLite', 'database', 'Adapter seed para bancos SQLite.', array['artifact:read','artifact:write','filesystem:scoped'], '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb),
  ('git', 'Git', 'development', 'Adapter seed para Git em workspace isolado.', array['filesystem:workspace','process:spawn'], '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb),
  ('python', 'Python Runtime', 'development', 'Runtime compartilhado para adapters Python.', array['process:spawn','filesystem:sandbox'], '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb),
  ('nodejs', 'Node.js Runtime', 'development', 'Runtime compartilhado para adapters Node.js.', array['process:spawn','filesystem:sandbox'], '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb),
  ('docker', 'Docker', 'containers', 'Runtime opcional para adapters em containers.', array['container:run','filesystem:sandbox','network:controlled'], '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb)
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  permissions = excluded.permissions,
  input_schema = excluded.input_schema,
  output_schema = excluded.output_schema,
  is_enabled = true,
  updated_at = now();

insert into public.nexus_tool_capabilities (tool_id, capability)
values
  ('nexus-json','data.json.validate'),
  ('nexus-json','data.json.format'),
  ('nexus-markdown','document.markdown.normalize'),
  ('nexus-markdown','document.markdown.inspect'),
  ('ffmpeg','video.encode'),
  ('ffmpeg','video.cut'),
  ('ffmpeg','video.subtitle'),
  ('ffmpeg','audio.convert'),
  ('ffmpeg','media.probe'),
  ('imagemagick','image.convert'),
  ('imagemagick','image.resize'),
  ('imagemagick','image.compose'),
  ('pandoc','document.convert'),
  ('pandoc','document.export'),
  ('tesseract','ocr.extract_text'),
  ('playwright','browser.navigate'),
  ('playwright','browser.screenshot'),
  ('playwright','browser.test'),
  ('ollama','ai.chat'),
  ('ollama','ai.generate_text'),
  ('ollama','ai.local_model'),
  ('blender','3d.render'),
  ('blender','3d.convert'),
  ('libreoffice','document.office.convert'),
  ('libreoffice','spreadsheet.convert'),
  ('libreoffice','presentation.convert'),
  ('sqlite','database.sqlite.query'),
  ('sqlite','database.sqlite.export'),
  ('git','git.status'),
  ('git','git.diff'),
  ('git','git.commit'),
  ('python','runtime.python.execute'),
  ('nodejs','runtime.node.execute'),
  ('docker','container.run'),
  ('docker','container.inspect')
on conflict do nothing;

insert into public.nexus_tool_licenses (tool_id, license_name, distribution_policy)
select id, case when id in ('nexus-json','nexus-markdown') then 'Nexus native' else 'unverified' end,
       case when id in ('nexus-json','nexus-markdown') then 'allowed_bundle' else 'unknown' end
from public.nexus_tools
where id in ('nexus-json','nexus-markdown','ffmpeg','imagemagick','pandoc','tesseract','playwright','ollama','blender','libreoffice','sqlite','git','python','nodejs','docker')
on conflict (tool_id) do nothing;

insert into public.nexus_tool_security (tool_id, risk_level, sandbox_required, permissions, review_status)
select t.id,
  case
    when t.id in ('nexus-json','nexus-markdown') then 'low'
    when t.id in ('playwright','git','blender') then 'high'
    when t.id in ('python','nodejs','docker') then 'critical'
    else 'medium'
  end,
  (t.id not in ('nexus-json','nexus-markdown')),
  to_jsonb(t.permissions),
  case when t.id in ('nexus-json','nexus-markdown') then 'approved' else 'unreviewed' end
from public.nexus_tools t
where t.id in ('nexus-json','nexus-markdown','ffmpeg','imagemagick','pandoc','tesseract','playwright','ollama','blender','libreoffice','sqlite','git','python','nodejs','docker')
on conflict (tool_id) do nothing;

comment on table public.nexus_tool_capabilities is 'Capability-first registry: consumers request capabilities instead of provider-specific tool names.';
comment on table public.nexus_workers is 'Workers execute heavy tools outside the Vercel serverless runtime.';
comment on table public.nexus_jobs is 'Execution queue with zero-cost and human-approval gates; rows do not imply a command was executed.';
