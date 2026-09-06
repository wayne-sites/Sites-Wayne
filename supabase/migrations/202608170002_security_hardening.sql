-- P0 hardening: impede elevação de privilégio e escrita financeira pelo cliente.
-- Aplicar após 202608100001_initial_nexus_schema.sql.

-- Data API: privilégios explícitos e mínimos para projetos com exposição opt-in.
grant usage on schema public to anon, authenticated, service_role;
revoke create on schema public from public, anon, authenticated;
revoke all privileges on all tables in schema public from anon, authenticated;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  grant all privileges on tables to service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  grant all privileges on sequences to service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

revoke update on table public.profiles from anon, authenticated;
grant update (username, display_name, bio, avatar_url, links) on table public.profiles to authenticated;

revoke insert, update, delete on table public.orders from anon, authenticated;
revoke insert, update, delete on table public.order_items from anon, authenticated;
revoke insert, update, delete on table public.payments from anon, authenticated;
revoke insert, update, delete on table public.subscriptions from anon, authenticated;
revoke insert, update, delete on table public.coupons from anon, authenticated;
revoke insert, update, delete on table public.products from anon, authenticated;
revoke insert, update, delete on table public.ads from anon, authenticated;

revoke update on table public.notifications from anon, authenticated;
grant update (read_at) on table public.notifications to authenticated;

revoke insert on table public.ai_usage from anon, authenticated;

-- Tabelas que ainda não possuíam RLS ficam fechadas por padrão.
alter table public.categories enable row level security;
alter table public.coupons enable row level security;
alter table public.news enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.courses enable row level security;
alter table public.lessons enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.quizzes enable row level security;
alter table public.games enable row level security;
alter table public.game_scores enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
alter table public.ads enable row level security;
alter table public.referrals enable row level security;

create policy "categories public read" on public.categories for select using(true);
create policy "published news public read" on public.news for select using(status='published');
create policy "published courses public read" on public.courses for select using(status='published');
create policy "course previews public read" on public.lessons for select using(
  is_preview and exists(select 1 from public.courses c where c.id=course_id and c.status='published')
);
create policy "users read own enrollments" on public.course_enrollments for select using(user_id=auth.uid());
create policy "users read own lesson progress" on public.lesson_progress for select using(user_id=auth.uid());
create policy "published games public read" on public.games for select using(status='published');
create policy "achievements public read" on public.achievements for select using(true);
create policy "users read own achievements" on public.user_achievements for select using(user_id=auth.uid());

drop policy if exists "buyers create orders" on public.orders;
drop policy if exists "sellers manage products" on public.products;
drop policy if exists "users join communities" on public.community_members;
create policy "users join communities safely" on public.community_members for insert
  with check(user_id=auth.uid() and role='member' and status in ('pending','active'));

drop policy if exists "memberships visible to members" on public.community_members;
create policy "users read own memberships" on public.community_members for select
  using(user_id=auth.uid());

-- Leitura pública limitada por RLS.
grant select on table
  public.profiles,
  public.categories,
  public.posts,
  public.comments,
  public.videos,
  public.products,
  public.reviews,
  public.communities,
  public.news,
  public.courses,
  public.lessons,
  public.games,
  public.achievements
to anon, authenticated;

-- Escritas do usuário autenticado continuam limitadas pelas políticas de propriedade.
grant insert, update, delete on table
  public.posts,
  public.comments,
  public.videos,
  public.communities
to authenticated;

grant select, insert, update, delete on table
  public.post_likes,
  public.post_saves,
  public.follows,
  public.blocks,
  public.video_likes,
  public.video_saves,
  public.product_favorites
to authenticated;

grant select on table
  public.orders,
  public.order_items,
  public.community_members,
  public.conversations,
  public.conversation_members,
  public.messages,
  public.notifications,
  public.subscriptions,
  public.payments,
  public.ai_usage,
  public.reports,
  public.course_enrollments,
  public.lesson_progress,
  public.user_achievements
to authenticated;

grant insert on table
  public.reviews,
  public.community_members,
  public.messages,
  public.reports
to authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;

comment on table public.orders is 'Escrita restrita ao backend; totais e status nunca são aceitos diretamente do navegador.';
comment on column public.profiles.role is 'Campo administrativo; não pode ser alterado por usuários autenticados.';
