-- Open game requests for "Ищу игру" on Home screen
--
-- NOTE: In our Supabase project, `public.game_requests` already exists
-- with columns like `requester_id`, `accepted_by_id`, `type=open_casual/open_league`.
-- This migration only ensures RLS + policies + realtime publication.

alter table public.game_requests enable row level security;

drop policy if exists "game_requests read authenticated" on public.game_requests;
create policy "game_requests read authenticated"
on public.game_requests for select
to authenticated
using (true);

drop policy if exists "game_requests create own" on public.game_requests;
create policy "game_requests create own"
on public.game_requests for insert
to authenticated
with check (requester_id = auth.uid());

drop policy if exists "game_requests update cancel or accept" on public.game_requests;
create policy "game_requests update cancel or accept"
on public.game_requests for update
to authenticated
using (
  requester_id = auth.uid()
  or (
    status = 'pending'
    and accepted_by_id is null
    and requester_id <> auth.uid()
  )
)
with check (
  -- cancel by author
  (requester_id = auth.uid() and status in ('pending', 'cancelled'))
  or
  -- accept by non-author
  (
    requester_id <> auth.uid()
    and status = 'accepted'
    and accepted_by_id = auth.uid()
  )
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.game_requests;
  end if;
exception
  when duplicate_object then null;
end;
$$;

