-- WAYNE Manager persistence. Existing Nexus Core project/artifact/audit tables are reused.
create table public.nexus_wayne_state (
 user_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null default 0 check(revision >= 0),
 state jsonb not null check(jsonb_typeof(state)='object' and jsonb_typeof(state->'games')='array' and jsonb_array_length(state->'games')=7 and octet_length(state::text)<=2000000),
 updated_at timestamptz not null default now()
);
create table public.nexus_wayne_vault (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 entry jsonb not null check(jsonb_typeof(entry)='object' and entry->>'tipo' in ('crudo','medio','pedido','salida','metrica','plan') and char_length(entry->>'conteudo') between 1 and 200000),
 created_at timestamptz not null default now()
);
create index nexus_wayne_vault_owner_created_idx on public.nexus_wayne_vault(user_id,created_at desc,id desc);
alter table public.nexus_wayne_state enable row level security;
alter table public.nexus_wayne_vault enable row level security;
revoke all on public.nexus_wayne_state,public.nexus_wayne_vault from public,anon,authenticated;
grant select on public.nexus_wayne_state,public.nexus_wayne_vault to authenticated;
grant select,insert,update,delete on public.nexus_wayne_state,public.nexus_wayne_vault to service_role;
create policy wayne_state_owner_read on public.nexus_wayne_state for select to authenticated using(user_id=(select auth.uid()));
create policy wayne_vault_owner_read on public.nexus_wayne_vault for select to authenticated using(user_id=(select auth.uid()));
insert into public.nexus_tools(id,name,category,description,permissions,input_schema,output_schema)
values('wayne-roblox','WAYNE Roblox Generator','development','Gera templates Luau por gênero e persiste Wayne Tree e Vault no Nexus.',array['project:read','artifact:write'],'{"type":"object","required":["genre"]}','{"type":"object","required":["files"]}')
on conflict(id) do nothing;

create function public.nexus_wayne_commit(p_owner_user_id uuid,p_expected_revision bigint,p_state jsonb,p_entries jsonb,p_generation jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_revision bigint; v_previous jsonb; v_project public.nexus_projects;
 v_game jsonb; v_index integer; v_genre text; v_project_id uuid;
 v_file jsonb; v_entry jsonb; v_version integer; v_run_id uuid;
begin
 if p_owner_user_id is null or p_expected_revision is null or p_expected_revision<0 then raise exception 'wayne_invalid_owner_or_revision'; end if;
 if p_state is null or jsonb_typeof(p_state)<>'object' or jsonb_typeof(p_state->'games') is distinct from 'array' then raise exception 'wayne_invalid_state'; end if;
 if p_entries is null or jsonb_typeof(p_entries)<>'array' or jsonb_array_length(p_entries) not between 1 and 3 then raise exception 'wayne_invalid_entries'; end if;
 insert into public.nexus_wayne_state(user_id,state) values(p_owner_user_id,p_state) on conflict(user_id) do nothing;
 select revision,state into v_revision,v_previous from public.nexus_wayne_state where user_id=p_owner_user_id for update;
 if v_revision<>p_expected_revision then raise exception 'wayne_revision_conflict'; end if;
 if p_generation is not null then
  v_genre:=p_generation->>'genre';
  if v_genre is null or v_genre not in ('RNG_Brainrot','Simulator','Tycoon','Horror_Doors','Obby','Shooter_BedWars','Roleplay_Brookhaven') then raise exception 'wayne_invalid_genre'; end if;
  if jsonb_typeof(p_generation->'files') is distinct from 'array' or jsonb_array_length(p_generation->'files') not between 1 and 40 then raise exception 'wayne_invalid_files'; end if;
  select value,(ordinality-1)::integer into v_game,v_index from jsonb_array_elements(p_state->'games') with ordinality where value->>'genre'=v_genre;
  if v_game is null then raise exception 'wayne_game_missing'; end if;
  select nullif(value->>'nexusProjectId','')::uuid into v_project_id from jsonb_array_elements(v_previous->'games') where value->>'genre'=v_genre;
  if v_project_id is null then
   v_project:=public.nexus_create_project(p_owner_user_id,v_game->>'name','Protótipo Roblox criado no WAYNE Manager. Validação Studio necessária.','game','["Roblox","Luau"]'::jsonb,jsonb_build_object('source','wayne-manager','genre',v_genre),'[]'::jsonb);
   v_project_id:=v_project.id;
  else
   select p.* into v_project from public.nexus_projects p join public.nexus_workspaces w on w.id=p.workspace_id where p.id=v_project_id and w.owner_user_id=p_owner_user_id and p.project_type='game' and p.metadata->>'genre'=v_genre;
   if v_project.id is null then raise exception 'wayne_project_not_owned'; end if;
  end if;
  p_state:=jsonb_set(p_state,array['games',v_index::text,'nexusProjectId'],to_jsonb(v_project_id::text));
  select coalesce(max(version),0)+1 into v_version from public.nexus_artifacts where project_id=v_project_id;
  for v_file in select value from jsonb_array_elements(p_generation->'files') loop
   if char_length(v_file->>'codigoLuau')>200000 or left(v_file->>'codigoLuau',9)<>'--!strict' or (v_file->>'arquivo') ~ '(^/|\.\.|\\)' then raise exception 'wayne_invalid_source'; end if;
   insert into public.nexus_artifacts(project_id,kind,name,path,mime_type,content_text,version,metadata,created_by)
   values(v_project_id,'code',right(v_file->>'arquivo',180),v_file->>'arquivo','text/x-lua',v_file->>'codigoLuau',v_version,jsonb_build_object('source','wayne-manager','genre',v_genre),p_owner_user_id);
  end loop;
  insert into public.nexus_tool_runs(project_id,tool_id,user_id,status,input,output,started_at,finished_at)
  values(v_project_id,'wayne-roblox',p_owner_user_id,'succeeded',jsonb_build_object('genre',v_genre),jsonb_build_object('files',jsonb_array_length(p_generation->'files'),'artifactVersion',v_version,'robloxStudioValidated',false),now(),now()) returning id into v_run_id;
  update public.nexus_projects set updated_at=now() where id=v_project_id;
  insert into public.nexus_audit_logs(workspace_id,project_id,user_id,action,tool_id,status,metadata)
  values(v_project.workspace_id,v_project_id,p_owner_user_id,'wayne.generated','wayne-roblox','succeeded',jsonb_build_object('toolRunId',v_run_id,'version',v_version,'genre',v_genre));
 end if;
 for v_entry in select value from jsonb_array_elements(p_entries) loop
  insert into public.nexus_wayne_vault(id,user_id,entry) values((v_entry->>'id')::uuid,p_owner_user_id,v_entry);
  if v_project_id is not null then
   insert into public.nexus_artifacts(project_id,kind,name,path,mime_type,content_text,version,metadata,created_by)
   values(v_project_id,'document',v_entry->>'titulo',v_entry->>'file_path','text/markdown',v_entry->>'conteudo',v_version,jsonb_build_object('vaultId',v_entry->>'id'),p_owner_user_id);
  end if;
 end loop;
 update public.nexus_wayne_state set state=p_state,revision=v_revision+1,updated_at=now() where user_id=p_owner_user_id;
 return jsonb_build_object('revision',v_revision+1,'projectId',v_project_id);
end;
$$;
revoke all on function public.nexus_wayne_commit(uuid,bigint,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.nexus_wayne_commit(uuid,bigint,jsonb,jsonb,jsonb) to service_role;
comment on function public.nexus_wayne_commit(uuid,bigint,jsonb,jsonb,jsonb) is 'Atomic server-only commit. Owner is derived from verified Nexus session; no browser RPC access.';
