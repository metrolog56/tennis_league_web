-- Ensure only the second participant can confirm (pending -> played)
-- and that the confirmer cannot change the submitted score.

-- 1) Submitter policy: allow updates while pending (and optional not_played),
-- but forbid setting status='played' for non-admin users.
drop policy if exists "matches update submitter or admin" on public.matches;
create policy "matches update submitter or admin"
on public.matches for update
to authenticated
using (
  auth.uid() = submitted_by
  or exists (select 1 from public.players p where p.id = auth.uid() and p.is_admin)
)
with check (
  (
    auth.uid() = submitted_by
    and status in ('pending', 'not_played')
  )
  or
  exists (select 1 from public.players p where p.id = auth.uid() and p.is_admin)
);

-- 2) Trigger: when status moves to 'played', lock in score and identities.
create or replace function public.matches_confirm_invariant()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'pending' and new.status = 'played' then
    if new.player1_id <> old.player1_id
      or new.player2_id <> old.player2_id
      or new.submitted_by <> old.submitted_by then
      raise exception 'Invalid match confirmation: players/submitted_by cannot change';
    end if;

    if new.sets_player1 <> old.sets_player1 or new.sets_player2 <> old.sets_player2 then
      raise exception 'Invalid match confirmation: score cannot change';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists matches_confirm_invariant on public.matches;
create trigger matches_confirm_invariant
before update on public.matches
for each row
execute procedure public.matches_confirm_invariant();

