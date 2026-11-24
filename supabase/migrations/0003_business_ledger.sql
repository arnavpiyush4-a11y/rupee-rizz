-- One posting per transaction. A settlement changes payment details only.
create unique index if not exists receipts_owner_id on public.receipts(user_id,id);
create table public.business_entries (
 id uuid primary key, user_id uuid not null default auth.uid() references auth.users on delete cascade,
 created_at timestamptz not null default now(), day date not null,
 kind text not null check (kind in ('sale','purchase','expense')),
 amount bigint not null check (amount between 1 and 99999999999),
 method text not null check (method in ('cash','digital','udhaar')),
 paid_on date, paid_by text check (paid_by in ('cash','digital')),
 category text not null check (length(trim(category)) between 1 and 80),
 party text not null default '' check (length(party)<=100 and (method<>'udhaar' or length(trim(party))>0)),
 item text not null default '' check (length(item)<=80), units integer not null default 0,
 reorder integer not null default 0 check(reorder between 0 and 1000000),
 invoice text not null default '' check(length(invoice)<=80),
 gstin text not null default '' check(gstin='' or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$'),
 tax bigint not null default 0 check(tax between 0 and amount),
 receipt_id uuid, unique(user_id,receipt_id),
 foreign key(user_id,receipt_id) references public.receipts(user_id,id) on delete set null (receipt_id),
 check ((units=0 and item='') or (kind<>'expense' and units between 1 and 1000000 and length(trim(item))>0)),
 check ((paid_on is null and paid_by is null) or (method='udhaar' and paid_on>=day and paid_by is not null and paid_on is not null))
);
create index business_by_owner on public.business_entries(user_id,day,id);
alter table public.business_entries enable row level security;
revoke all on public.business_entries from public,anon,authenticated;
grant select,delete on public.business_entries to authenticated;
grant insert(id,day,kind,amount,method,category,party,item,units,reorder,invoice,gstin,tax,receipt_id) on public.business_entries to authenticated;
grant update(paid_on,paid_by) on public.business_entries to authenticated;
create policy business_owner on public.business_entries as restrictive for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy business_access on public.business_entries for all to authenticated using (
 exists(select 1 from public.consents where user_id=auth.uid() and status and withdrawn_at is null)
 and exists(select 1 from public.profiles where user_id=auth.uid() and user_type='micro_entrepreneur')
);
create policy business_erasure on public.business_entries for delete to authenticated using(user_id=auth.uid());
grant update(receipt_id) on public.business_entries to authenticated;

-- Allow account erasure even after consent withdrawal makes rows invisible.
create function public.erase_own_business_entries() returns void
language sql security definer set search_path='' as $$
 delete from public.business_entries where user_id=(select auth.uid())
$$;
revoke all on function public.erase_own_business_entries() from public,anon;
grant execute on function public.erase_own_business_entries() to authenticated;
-- Settlement is one-way, including when an authenticated client calls PostgREST directly.
create function public.check_business_settlement() returns trigger language plpgsql as $$
begin
 if old.paid_on is not null and (old.paid_on,old.paid_by) is distinct from (new.paid_on,new.paid_by) then
   raise exception 'Already settled';
 end if;
 if new.paid_on > (now() at time zone 'Asia/Kolkata')::date then raise exception 'Future settlement'; end if;
 return new;
end $$;
create trigger check_business_settlement before update of paid_on,paid_by on public.business_entries
for each row execute function public.check_business_settlement();
