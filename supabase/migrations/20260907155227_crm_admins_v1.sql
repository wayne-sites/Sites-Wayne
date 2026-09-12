create table if not exists public.crm_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('owner','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_admins enable row level security;
revoke all on table public.crm_admins from anon, authenticated;
grant select, insert, update, delete on table public.crm_admins to service_role;

create index if not exists crm_admins_role_idx on public.crm_admins(role);
