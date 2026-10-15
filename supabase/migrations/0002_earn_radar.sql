-- Earn Radar: per-user saved public opportunities and manual progress tracking.
-- Run in Supabase Dashboard -> SQL Editor after 0001_rupeerizz_supabase.sql.

create table if not exists public.earn_radar_saved (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  source_url text not null,
  source text,
  status text not null default 'saved'
    check (status in ('saved','interested','applied','interview','accepted','rejected','completed')),
  opportunity jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_url)
);

create index if not exists idx_earn_radar_saved_user_updated
  on public.earn_radar_saved(user_id, updated_at desc);
create index if not exists idx_earn_radar_saved_user_status
  on public.earn_radar_saved(user_id, status);

alter table public.earn_radar_saved enable row level security;
revoke all on table public.earn_radar_saved from anon, PUBLIC;
grant select, insert, update, delete on table public.earn_radar_saved to authenticated;

drop policy if exists earn_radar_saved_sel on public.earn_radar_saved;
drop policy if exists earn_radar_saved_ins on public.earn_radar_saved;
drop policy if exists earn_radar_saved_upd on public.earn_radar_saved;
drop policy if exists earn_radar_saved_del on public.earn_radar_saved;

create policy earn_radar_saved_sel on public.earn_radar_saved
  for select to authenticated using (user_id = (select auth.uid()));
create policy earn_radar_saved_ins on public.earn_radar_saved
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy earn_radar_saved_upd on public.earn_radar_saved
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy earn_radar_saved_del on public.earn_radar_saved
  for delete to authenticated using (user_id = (select auth.uid()));
