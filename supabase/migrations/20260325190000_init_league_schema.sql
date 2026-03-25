-- Tennis league MVP schema based on tg_tennis_league_bot
-- Adapted for Supabase Auth (magic link), invites and notifications.

create extension if not exists pgcrypto;

create table if not exists public.players (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  name text not null default 'Игрок',
  avatar_url text,
  rating numeric(10, 2) not null default 100.00,
  is_admin boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  month integer not null check (month between 1 and 12),
  name text not null,
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  unique (year, month)
);

create table if not exists public.divisions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  number integer not null,
  coef numeric(4, 2) not null check (coef > 0),
  created_at timestamptz not null default now(),
  unique (season_id, number)
);

create table if not exists public.division_players (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  position integer,
  total_points integer not null default 0,
  total_sets_won integer not null default 0,
  total_sets_lost integer not null default 0,
  rating_delta numeric(10, 2) not null default 0,
  unique (division_id, player_id)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete cascade,
  player1_id uuid not null references public.players(id),
  player2_id uuid not null references public.players(id),
  sets_player1 integer check (sets_player1 between 0 and 3),
  sets_player2 integer check (sets_player2 between 0 and 3),
  status text not null default 'pending' check (status in ('pending', 'played', 'not_played')),
  submitted_by uuid references public.players(id),
  played_at timestamptz,
  created_at timestamptz not null default now(),
  unique (division_id, player1_id, player2_id),
  check (player1_id <> player2_id)
);

create table if not exists public.rating_history (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id),
  match_id uuid not null references public.matches(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  rating_before numeric(10, 2) not null,
  rating_delta numeric(10, 2) not null,
  rating_after numeric(10, 2) not null,
  division_coef numeric(4, 2),
  score_ks numeric(4, 2),
  created_at timestamptz not null default now()
);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.players(id) on delete cascade,
  to_player_id uuid not null references public.players(id) on delete cascade,
  type text not null check (type in ('casual', 'league')),
  season_id uuid references public.seasons(id) on delete set null,
  division_id uuid references public.divisions(id) on delete set null,
  match_id uuid references public.matches(id) on delete set null,
  scheduled_at timestamptz,
  location text,
  status text not null default 'invited' check (status in ('invited', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (player_id, endpoint)
);

create index if not exists idx_players_rating on public.players (rating desc);
create index if not exists idx_divisions_season on public.divisions (season_id);
create index if not exists idx_division_players_division on public.division_players (division_id);
create index if not exists idx_matches_division on public.matches (division_id);
create index if not exists idx_rating_history_player on public.rating_history (player_id);
create index if not exists idx_invites_to_player on public.invites (to_player_id, status);
create index if not exists idx_notifications_player on public.notifications (player_id, created_at desc);

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.players (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1), 'Игрок')
  )
  on conflict (id) do update
  set email = excluded.email,
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_auth_user_created();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists players_touch_updated_at on public.players;
create trigger players_touch_updated_at
before update on public.players
for each row execute procedure public.touch_updated_at();

drop trigger if exists invites_touch_updated_at on public.invites;
create trigger invites_touch_updated_at
before update on public.invites
for each row execute procedure public.touch_updated_at();

alter table public.players enable row level security;
alter table public.seasons enable row level security;
alter table public.divisions enable row level security;
alter table public.division_players enable row level security;
alter table public.matches enable row level security;
alter table public.rating_history enable row level security;
alter table public.invites enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "players read by authenticated"
on public.players for select
to authenticated
using (true);

create policy "players update own profile"
on public.players for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid() and is_admin = false);

create policy "league tables read authenticated"
on public.seasons for select to authenticated using (true);
create policy "divisions read authenticated"
on public.divisions for select to authenticated using (true);
create policy "division_players read authenticated"
on public.division_players for select to authenticated using (true);
create policy "matches read authenticated"
on public.matches for select to authenticated using (true);
create policy "rating_history read authenticated"
on public.rating_history for select to authenticated using (true);

create policy "matches insert participants or admin"
on public.matches for insert
to authenticated
with check (
  auth.uid() = submitted_by
  and (auth.uid() = player1_id or auth.uid() = player2_id or exists (
    select 1 from public.players p where p.id = auth.uid() and p.is_admin
  ))
);

create policy "matches update submitter or admin"
on public.matches for update
to authenticated
using (
  auth.uid() = submitted_by
  or exists (select 1 from public.players p where p.id = auth.uid() and p.is_admin)
)
with check (
  auth.uid() = submitted_by
  or exists (select 1 from public.players p where p.id = auth.uid() and p.is_admin)
);

create policy "invites read own"
on public.invites for select
to authenticated
using (
  created_by = auth.uid()
  or to_player_id = auth.uid()
  or exists (select 1 from public.players p where p.id = auth.uid() and p.is_admin)
);

create policy "invites create own"
on public.invites for insert
to authenticated
with check (created_by = auth.uid());

create policy "invites update actor"
on public.invites for update
to authenticated
using (
  created_by = auth.uid()
  or to_player_id = auth.uid()
  or exists (select 1 from public.players p where p.id = auth.uid() and p.is_admin)
)
with check (
  created_by = auth.uid()
  or to_player_id = auth.uid()
  or exists (select 1 from public.players p where p.id = auth.uid() and p.is_admin)
);

create policy "notifications own"
on public.notifications for select
to authenticated
using (player_id = auth.uid());

create policy "notifications update own"
on public.notifications for update
to authenticated
using (player_id = auth.uid())
with check (player_id = auth.uid());

create policy "push subscriptions own read"
on public.push_subscriptions for select
to authenticated
using (player_id = auth.uid());

create policy "push subscriptions own write"
on public.push_subscriptions for insert
to authenticated
with check (player_id = auth.uid());

create policy "push subscriptions own update"
on public.push_subscriptions for update
to authenticated
using (player_id = auth.uid())
with check (player_id = auth.uid());

create policy "push subscriptions own delete"
on public.push_subscriptions for delete
to authenticated
using (player_id = auth.uid());
