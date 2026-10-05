-- RupeeRizz — Supabase schema, RLS, triggers, and private Storage
-- Run this in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to re-run (idempotent-ish): uses IF NOT EXISTS and drops/recreates policies.

-- ============ TABLES ============
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text,
  user_type text check (user_type in ('student','micro_entrepreneur')),
  preferred_language text default 'en',
  state text,
  pathway text,
  business_type text,
  finance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null default 'core',
  status boolean not null default true,
  consented_at timestamptz not null default now(),
  withdrawn_at timestamptz
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant text,
  receipt_date date,
  currency text not null default 'INR',
  total numeric,
  category text,
  image_path text,
  overall_confidence numeric,
  user_verified boolean not null default false,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_name text not null,
  goal_amount numeric not null default 0,
  current_saved_amount numeric not null default 0,
  target_date date,
  priority integer default 1,
  recommended_monthly_saving numeric default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.savings_goals(id) on delete cascade,
  amount numeric not null default 0,
  contribution_date timestamptz not null default now(),
  note text
);

create table if not exists public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null default 'all_data',
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_receipts_user on public.receipts(user_id);
create index if not exists idx_goals_user on public.savings_goals(user_id);
create index if not exists idx_consents_user on public.consents(user_id);
create index if not exists idx_contrib_user on public.goal_contributions(user_id);

-- ============ ROW LEVEL SECURITY ============
alter table public.profiles enable row level security;
alter table public.consents enable row level security;
alter table public.receipts enable row level security;
alter table public.savings_goals enable row level security;
alter table public.goal_contributions enable row level security;
alter table public.deletion_requests enable row level security;

grant select, insert, update, delete on
  public.profiles, public.consents, public.receipts,
  public.savings_goals, public.goal_contributions, public.deletion_requests
  to authenticated;

-- Generic owner policies (user_id = auth.uid()) for each table.
do $$
declare tbl text;
begin
  foreach tbl in array array['profiles','consents','receipts','savings_goals','goal_contributions','deletion_requests']
  loop
    execute format('drop policy if exists %I_sel on public.%I', tbl, tbl);
    execute format('drop policy if exists %I_ins on public.%I', tbl, tbl);
    execute format('drop policy if exists %I_upd on public.%I', tbl, tbl);
    execute format('drop policy if exists %I_del on public.%I', tbl, tbl);
    execute format('create policy %I_sel on public.%I for select to authenticated using (user_id = (select auth.uid()))', tbl, tbl);
    execute format('create policy %I_ins on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', tbl, tbl);
    execute format('create policy %I_upd on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', tbl, tbl);
    execute format('create policy %I_del on public.%I for delete to authenticated using (user_id = (select auth.uid()))', tbl, tbl);
  end loop;
end $$;

-- ============ AUTO-CREATE PROFILE ON SIGNUP ============
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ PRIVATE STORAGE BUCKET: receipts ============
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do update set public = false;

drop policy if exists receipts_obj_sel on storage.objects;
drop policy if exists receipts_obj_ins on storage.objects;
drop policy if exists receipts_obj_upd on storage.objects;
drop policy if exists receipts_obj_del on storage.objects;

create policy receipts_obj_sel on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy receipts_obj_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy receipts_obj_upd on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid()::text))
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy receipts_obj_del on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid()::text));

-- Done. Verify in Table Editor + Storage -> Policies.
