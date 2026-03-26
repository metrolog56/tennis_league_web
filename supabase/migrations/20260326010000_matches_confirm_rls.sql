-- Allow second participant to confirm match (pending -> played)
-- This is required for the "input result + thumbs-up confirmation" UX.

alter table public.matches enable row level security;

drop policy if exists "matches confirm pending other participant" on public.matches;
create policy "matches confirm pending other participant"
on public.matches for update
to authenticated
using (
  status = 'pending'
  and submitted_by <> auth.uid()
  and (
    auth.uid() = player1_id
    or auth.uid() = player2_id
  )
)
with check (
  status = 'played'
);

