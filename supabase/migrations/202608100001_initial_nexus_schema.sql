-- NEXUS BRASIL — schema inicial para Supabase/PostgreSQL
-- Execute no Supabase CLI ou pelo fluxo de migrations do projeto.
create extension if not exists pgcrypto;

create type public.user_role as enum ('user','creator','seller','moderator','admin');
create type public.content_status as enum ('draft','published','archived','removed');
create type public.order_status as enum ('pending','paid','processing','completed','cancelled','refunded');
create type public.report_status as enum ('open','reviewing','resolved','dismissed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) between 3 and 32),
  display_name text not null check (char_length(display_name) <= 80),
  bio text check (char_length(bio) <= 500), avatar_url text, links jsonb not null default '[]',
  role public.user_role not null default 'user', reputation integer not null default 0,
  is_suspended boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(), name text not null, slug text unique not null,
  kind text not null check (kind in ('post','video','product','news','course','community','game')), created_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.profiles(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null, body text not null check (char_length(body) <= 10000),
  media jsonb not null default '[]', hashtags text[] not null default '{}', status public.content_status not null default 'published',
  visibility text not null default 'public' check (visibility in ('public','followers','private')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index posts_author_created_idx on public.posts(author_id,created_at desc);
create index posts_hashtags_idx on public.posts using gin(hashtags);

create table public.comments (
  id uuid primary key default gen_random_uuid(), post_id uuid references public.posts(id) on delete cascade,
  video_id uuid, news_id uuid, parent_id uuid references public.comments(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade, body text not null check (char_length(body) <= 3000),
  status public.content_status not null default 'published', created_at timestamptz not null default now()
);
create index comments_post_created_idx on public.comments(post_id,created_at);

create table public.post_likes (post_id uuid references public.posts(id) on delete cascade, user_id uuid references public.profiles(id) on delete cascade, created_at timestamptz not null default now(), primary key(post_id,user_id));
create table public.post_saves (post_id uuid references public.posts(id) on delete cascade, user_id uuid references public.profiles(id) on delete cascade, created_at timestamptz not null default now(), primary key(post_id,user_id));
create table public.follows (follower_id uuid references public.profiles(id) on delete cascade, following_id uuid references public.profiles(id) on delete cascade, created_at timestamptz not null default now(), primary key(follower_id,following_id), check(follower_id<>following_id));
create table public.blocks (blocker_id uuid references public.profiles(id) on delete cascade, blocked_id uuid references public.profiles(id) on delete cascade, created_at timestamptz not null default now(), primary key(blocker_id,blocked_id), check(blocker_id<>blocked_id));

create table public.videos (
  id uuid primary key default gen_random_uuid(), creator_id uuid not null references public.profiles(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null, title text not null check (char_length(title)<=160), description text,
  source_url text, storage_path text, thumbnail_url text, duration_seconds integer check(duration_seconds>=0), views bigint not null default 0,
  status public.content_status not null default 'published', created_at timestamptz not null default now()
);
alter table public.comments add constraint comments_video_fk foreign key(video_id) references public.videos(id) on delete cascade;
create table public.video_likes (video_id uuid references public.videos(id) on delete cascade, user_id uuid references public.profiles(id) on delete cascade, created_at timestamptz not null default now(), primary key(video_id,user_id));
create table public.video_saves (video_id uuid references public.videos(id) on delete cascade, user_id uuid references public.profiles(id) on delete cascade, created_at timestamptz not null default now(), primary key(video_id,user_id));

create table public.products (
  id uuid primary key default gen_random_uuid(), seller_id uuid not null references public.profiles(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null, title text not null, slug text unique not null, description text not null,
  price_cents integer not null check(price_cents>=0), inventory integer check(inventory>=0), images jsonb not null default '[]',
  status public.content_status not null default 'published', is_sponsored boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index products_seller_status_idx on public.products(seller_id,status);
create table public.product_favorites (product_id uuid references public.products(id) on delete cascade, user_id uuid references public.profiles(id) on delete cascade, created_at timestamptz not null default now(), primary key(product_id,user_id));
create table public.coupons (id uuid primary key default gen_random_uuid(), seller_id uuid references public.profiles(id) on delete cascade, code text unique not null, discount_percent numeric(5,2) not null check(discount_percent between 0 and 100), starts_at timestamptz, ends_at timestamptz, max_uses integer, uses integer not null default 0);
create table public.orders (id uuid primary key default gen_random_uuid(), buyer_id uuid not null references public.profiles(id), status public.order_status not null default 'pending', subtotal_cents integer not null, fee_cents integer not null default 0, total_cents integer not null, payment_provider text, provider_reference text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.order_items (id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade, product_id uuid references public.products(id) on delete set null, seller_id uuid not null references public.profiles(id), title_snapshot text not null, unit_price_cents integer not null, quantity integer not null check(quantity>0));
create table public.reviews (id uuid primary key default gen_random_uuid(), order_item_id uuid unique not null references public.order_items(id) on delete cascade, author_id uuid not null references public.profiles(id), product_id uuid not null references public.products(id) on delete cascade, rating smallint not null check(rating between 1 and 5), body text, created_at timestamptz not null default now());

create table public.communities (id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id), name text not null, slug text unique not null, description text not null, avatar_url text, visibility text not null default 'public' check(visibility in ('public','private')), created_at timestamptz not null default now());
create table public.community_members (community_id uuid references public.communities(id) on delete cascade, user_id uuid references public.profiles(id) on delete cascade, role text not null default 'member' check(role in ('member','moderator','owner')), status text not null default 'active' check(status in ('pending','active','banned')), joined_at timestamptz not null default now(), primary key(community_id,user_id));
create table public.community_topics (id uuid primary key default gen_random_uuid(), community_id uuid not null references public.communities(id) on delete cascade, author_id uuid not null references public.profiles(id), title text not null, body text not null, is_pinned boolean not null default false, created_at timestamptz not null default now());

create table public.conversations (id uuid primary key default gen_random_uuid(), kind text not null default 'direct' check(kind in ('direct','group')), title text, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now());
create table public.conversation_members (conversation_id uuid references public.conversations(id) on delete cascade, user_id uuid references public.profiles(id) on delete cascade, last_read_at timestamptz, joined_at timestamptz not null default now(), primary key(conversation_id,user_id));
create table public.messages (id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade, sender_id uuid not null references public.profiles(id), body text check(char_length(body)<=5000), attachment_path text, created_at timestamptz not null default now(), deleted_at timestamptz);
create index messages_conversation_created_idx on public.messages(conversation_id,created_at desc);

create table public.news (id uuid primary key default gen_random_uuid(), author_id uuid references public.profiles(id), category_id uuid references public.categories(id), title text not null, slug text unique not null, summary text not null, body text, source_name text, source_url text, image_url text, status public.content_status not null default 'draft', published_at timestamptz, created_at timestamptz not null default now());
alter table public.comments add constraint comments_news_fk foreign key(news_id) references public.news(id) on delete cascade;
create table public.newsletter_subscribers (id uuid primary key default gen_random_uuid(), email text unique not null, consented_at timestamptz not null default now(), unsubscribed_at timestamptz);

create table public.courses (id uuid primary key default gen_random_uuid(), instructor_id uuid not null references public.profiles(id), category_id uuid references public.categories(id), title text not null, slug text unique not null, description text not null, cover_url text, price_cents integer not null default 0, status public.content_status not null default 'draft', created_at timestamptz not null default now());
create table public.lessons (id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade, title text not null, content text, video_url text, position integer not null, is_preview boolean not null default false, unique(course_id,position));
create table public.course_enrollments (course_id uuid references public.courses(id) on delete cascade, user_id uuid references public.profiles(id) on delete cascade, enrolled_at timestamptz not null default now(), completed_at timestamptz, primary key(course_id,user_id));
create table public.lesson_progress (lesson_id uuid references public.lessons(id) on delete cascade, user_id uuid references public.profiles(id) on delete cascade, progress_percent smallint not null default 0 check(progress_percent between 0 and 100), completed_at timestamptz, updated_at timestamptz not null default now(), primary key(lesson_id,user_id));
create table public.quizzes (id uuid primary key default gen_random_uuid(), course_id uuid references public.courses(id) on delete cascade, lesson_id uuid references public.lessons(id) on delete cascade, title text not null, questions jsonb not null default '[]');

create table public.games (id uuid primary key default gen_random_uuid(), title text not null, slug text unique not null, description text not null, status public.content_status not null default 'published', created_at timestamptz not null default now());
create table public.game_scores (id uuid primary key default gen_random_uuid(), game_id uuid not null references public.games(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade, score integer not null check(score>=0), metadata jsonb not null default '{}', played_at timestamptz not null default now());
create index game_scores_ranking_idx on public.game_scores(game_id,score desc);
create table public.achievements (id uuid primary key default gen_random_uuid(), code text unique not null, title text not null, description text not null, points integer not null default 0);
create table public.user_achievements (user_id uuid references public.profiles(id) on delete cascade, achievement_id uuid references public.achievements(id) on delete cascade, unlocked_at timestamptz not null default now(), primary key(user_id,achievement_id));

create table public.notifications (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, type text not null, title text not null, body text, href text, read_at timestamptz, created_at timestamptz not null default now());
create index notifications_user_unread_idx on public.notifications(user_id,read_at,created_at desc);
create table public.subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), plan text not null check(plan in ('free','pro','business')), status text not null, provider_customer_id text, provider_subscription_id text, current_period_end timestamptz, created_at timestamptz not null default now());
create table public.payments (id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id), order_id uuid references public.orders(id), subscription_id uuid references public.subscriptions(id), provider text not null, provider_reference text unique, amount_cents integer not null, status text not null, metadata jsonb not null default '{}', created_at timestamptz not null default now());
create table public.reports (id uuid primary key default gen_random_uuid(), reporter_id uuid not null references public.profiles(id), target_type text not null, target_id uuid not null, reason text not null, details text, status public.report_status not null default 'open', assigned_to uuid references public.profiles(id), resolved_at timestamptz, created_at timestamptz not null default now());
create table public.ads (id uuid primary key default gen_random_uuid(), owner_id uuid references public.profiles(id), title text not null, creative_url text, destination_url text not null, starts_at timestamptz, ends_at timestamptz, budget_cents integer not null default 0, status text not null default 'draft', impressions bigint not null default 0, clicks bigint not null default 0);
create table public.ai_usage (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, tool text not null, input_tokens integer not null default 0, output_tokens integer not null default 0, success boolean not null default true, created_at timestamptz not null default now());
create index ai_usage_user_day_idx on public.ai_usage(user_id,created_at desc);
create table public.referrals (id uuid primary key default gen_random_uuid(), referrer_id uuid not null references public.profiles(id), referred_id uuid unique references public.profiles(id), code text unique not null, rewarded_at timestamptz, created_at timestamptz not null default now());
create table public.admin_logs (id bigint generated always as identity primary key, admin_id uuid not null references public.profiles(id), action text not null, target_type text, target_id uuid, metadata jsonb not null default '{}', created_at timestamptz not null default now());

-- RLS: políticas públicas de leitura e propriedade privada.
alter table public.profiles enable row level security;
alter table public.posts enable row level security; alter table public.comments enable row level security;
alter table public.post_likes enable row level security; alter table public.post_saves enable row level security; alter table public.follows enable row level security; alter table public.blocks enable row level security;
alter table public.videos enable row level security; alter table public.video_likes enable row level security; alter table public.video_saves enable row level security;
alter table public.products enable row level security; alter table public.product_favorites enable row level security; alter table public.orders enable row level security; alter table public.order_items enable row level security; alter table public.reviews enable row level security;
alter table public.communities enable row level security; alter table public.community_members enable row level security; alter table public.community_topics enable row level security;
alter table public.conversations enable row level security; alter table public.conversation_members enable row level security; alter table public.messages enable row level security;
alter table public.notifications enable row level security; alter table public.subscriptions enable row level security; alter table public.payments enable row level security; alter table public.ai_usage enable row level security; alter table public.reports enable row level security; alter table public.admin_logs enable row level security;

create policy "profiles public read" on public.profiles for select using(not is_suspended);
create policy "profiles own update" on public.profiles for update using(auth.uid()=id) with check(auth.uid()=id);
create policy "published posts read" on public.posts for select using(status='published' and visibility='public' or author_id=auth.uid());
create policy "authors manage posts" on public.posts for all using(author_id=auth.uid()) with check(author_id=auth.uid());
create policy "published comments read" on public.comments for select using(status='published');
create policy "authors manage comments" on public.comments for all using(author_id=auth.uid()) with check(author_id=auth.uid());
create policy "users manage own post likes" on public.post_likes for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "users manage own saves" on public.post_saves for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "users manage own follows" on public.follows for all using(follower_id=auth.uid()) with check(follower_id=auth.uid());
create policy "users manage own blocks" on public.blocks for all using(blocker_id=auth.uid()) with check(blocker_id=auth.uid());
create policy "published videos read" on public.videos for select using(status='published' or creator_id=auth.uid());
create policy "creators manage videos" on public.videos for all using(creator_id=auth.uid()) with check(creator_id=auth.uid());
create policy "users manage video likes" on public.video_likes for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "users manage video saves" on public.video_saves for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "published products read" on public.products for select using(status='published' or seller_id=auth.uid());
create policy "sellers manage products" on public.products for all using(seller_id=auth.uid()) with check(seller_id=auth.uid());
create policy "users manage product favorites" on public.product_favorites for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "buyers read orders" on public.orders for select using(buyer_id=auth.uid());
create policy "buyers create orders" on public.orders for insert with check(buyer_id=auth.uid());
create policy "order parties read items" on public.order_items for select using(seller_id=auth.uid() or exists(select 1 from public.orders o where o.id=order_id and o.buyer_id=auth.uid()));
create policy "reviews public read" on public.reviews for select using(true);
create policy "verified buyers create reviews" on public.reviews for insert with check(author_id=auth.uid() and exists(select 1 from public.order_items oi join public.orders o on o.id=oi.order_id where oi.id=order_item_id and o.buyer_id=auth.uid() and o.status in('paid','completed')));
create policy "public communities read" on public.communities for select using(visibility='public' or owner_id=auth.uid());
create policy "owners manage communities" on public.communities for all using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy "memberships visible to members" on public.community_members for select using(user_id=auth.uid() or exists(select 1 from public.community_members cm where cm.community_id=community_id and cm.user_id=auth.uid() and cm.status='active'));
create policy "users join communities" on public.community_members for insert with check(user_id=auth.uid());
create policy "members read conversations" on public.conversations for select using(exists(select 1 from public.conversation_members cm where cm.conversation_id=id and cm.user_id=auth.uid()));
create policy "users read own memberships" on public.conversation_members for select using(user_id=auth.uid());
create policy "members read messages" on public.messages for select using(exists(select 1 from public.conversation_members cm where cm.conversation_id=conversation_id and cm.user_id=auth.uid()));
create policy "members send messages" on public.messages for insert with check(sender_id=auth.uid() and exists(select 1 from public.conversation_members cm where cm.conversation_id=conversation_id and cm.user_id=auth.uid()));
create policy "users read own notifications" on public.notifications for select using(user_id=auth.uid());
create policy "users update own notifications" on public.notifications for update using(user_id=auth.uid());
create policy "users read own subscriptions" on public.subscriptions for select using(user_id=auth.uid());
create policy "users read own payments" on public.payments for select using(user_id=auth.uid());
create policy "users read own ai usage" on public.ai_usage for select using(user_id=auth.uid());
create policy "users create own ai usage" on public.ai_usage for insert with check(user_id=auth.uid());
create policy "users create reports" on public.reports for insert with check(reporter_id=auth.uid());
create policy "users read own reports" on public.reports for select using(reporter_id=auth.uid());

-- Cria o perfil quando um usuário entra pelo Supabase Auth.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id,username,display_name)
  values(
    new.id,
    'user_' || rtrim(translate(encode(uuid_send(new.id),'base64'), '+/', '-_'), '='),
    coalesce(new.raw_user_meta_data->>'display_name','Novo membro')
  );
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
revoke all on function public.handle_new_user() from public, anon, authenticated;
