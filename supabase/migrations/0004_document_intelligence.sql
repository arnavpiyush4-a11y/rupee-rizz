alter table public.receipts add column source_sha256 text check(source_sha256 ~ '^[0-9a-f]{64}$'),
 add column ocr_origin jsonb, add column reviewed_business jsonb;
create unique index receipts_same_image on public.receipts(user_id,source_sha256) where source_sha256 is not null;
create unique index receipts_same_invoice on public.receipts(user_id,lower(trim(merchant)),upper(trim(reviewed_business->>'invoice')))
 where nullif(trim(reviewed_business->>'invoice'),'') is not null and nullif(trim(merchant),'') is not null;

-- All lines belong to one immutable posting, including on retries.
alter table public.business_entries add column stock_lines jsonb not null default '[]'::jsonb;
grant insert(stock_lines) on public.business_entries to authenticated;
create function public.validate_business_lines() returns trigger language plpgsql as $$
declare line jsonb; sum_paise bigint:=0;
begin
 if jsonb_typeof(new.stock_lines)<>'array' or jsonb_array_length(new.stock_lines)>300 then raise exception 'Invalid line list'; end if;
 if new.stock_lines='[]'::jsonb then return new; end if;
 if new.kind='expense' or new.item<>'' then raise exception 'Choose a single stock representation'; end if;
 for line in select * from jsonb_array_elements(new.stock_lines) loop
   if coalesce(length(trim(line->>'item')),0) not between 1 and 80
    or coalesce(line->>'units','') !~ '^[1-9][0-9]{0,5}$'
    or coalesce(line->>'net','') !~ '^[0-9]{1,11}$' then raise exception 'Invalid stock line'; end if;
   sum_paise:=sum_paise+(line->>'net')::bigint;
 end loop;
 if sum_paise<>new.amount-new.tax then raise exception 'Line totals must reconcile'; end if;
 return new;
end $$;
create trigger validate_business_lines before insert or update of stock_lines,amount,tax on public.business_entries for each row execute function public.validate_business_lines();

alter table public.receipts add column review_revision integer not null default 1;
-- Owner explicitly confirms updates to a previously posted receipt. Any failed
-- ledger constraint rolls the receipt revision and all stock movements back.
create function public.correct_document(p_id uuid,p_revision integer,p_doc jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare
 owner_id uuid:=auth.uid(); doc public.receipts; posting public.business_entries;
 reviewed jsonb:=p_doc->'reviewed_business'; updated_lines jsonb;
begin
 if owner_id is null or not exists(select 1 from public.consents where user_id=owner_id and status and withdrawn_at is null) then raise exception 'Consent required'; end if;
 select * into strict doc from public.receipts where id=p_id and user_id=owner_id for update;
 if doc.ocr_origin is null or doc.review_revision<>p_revision then raise exception 'Reload the current review'; end if;
 if coalesce((p_doc->>'total')::numeric,0)<=0 or length(trim(coalesce(p_doc->>'merchant','')))=0 or (p_doc->>'receipt_date')::date is null then raise exception 'Missing reviewed values'; end if;
 select * into posting from public.business_entries where user_id=owner_id and receipt_id=p_id for update;
 if found then
   if reviewed->>'method' is not null and reviewed->>'method'<>posting.method then raise exception 'Payment correction conflicts with posted payment history'; end if;
   updated_lines:=posting.stock_lines;
   if jsonb_array_length(updated_lines)>0 then
     select jsonb_agg(jsonb_build_object('item',l->>'item_name','units',l->'quantity','net',round((l->>'price')::numeric*100)::bigint)) into updated_lines from jsonb_array_elements(p_doc->'items') l;
     if updated_lines is null then raise exception 'Posted inventory needs item lines'; end if;
   end if;
   update public.business_entries set day=(p_doc->>'receipt_date')::date,amount=round((p_doc->>'total')::numeric*100)::bigint,
    party=p_doc->>'merchant',invoice=coalesce(reviewed->>'invoice',''),gstin=coalesce(reviewed->>'gstin',''),category=p_doc->>'category',
    tax=coalesce(round((reviewed->>'tax')::numeric*100)::bigint,posting.tax),stock_lines=updated_lines
   where id=posting.id and user_id=owner_id;
 end if;
 update public.receipts set merchant=p_doc->>'merchant',receipt_date=(p_doc->>'receipt_date')::date,total=(p_doc->>'total')::numeric,category=p_doc->>'category',
   items=p_doc->'items',reviewed_business=reviewed,review_revision=review_revision+1,user_verified=true where id=doc.id and user_id=owner_id;
 return p_revision+1;
end $$;
revoke all on function public.correct_document(uuid,integer,jsonb) from public,anon;
grant execute on function public.correct_document(uuid,integer,jsonb) to authenticated;
