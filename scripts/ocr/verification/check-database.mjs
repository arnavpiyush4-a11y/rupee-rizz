import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite(),
  a = '11111111-1111-4111-8111-111111111111',
  b = '22222222-2222-4222-8222-222222222222';
await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select current_setting('app.uid')::uuid$$;
create table consents(user_id uuid,status boolean,withdrawn_at timestamptz);create table profiles(user_id uuid,user_type text);create table receipts(id uuid primary key,user_id uuid,merchant text,receipt_date date,total numeric,category text,user_verified boolean,items jsonb);
grant usage on schema auth to authenticated;grant select on consents,profiles to authenticated;
insert into auth.users values('${a}'),('${b}');insert into profiles select id,'micro_entrepreneur' from auth.users;insert into consents select id,true,null from auth.users;`);
for (const n of ['0003_business_ledger', '0004_document_intelligence'])
  await db.exec(fs.readFileSync('supabase/migrations/' + n + '.sql', 'utf8'));
const insert = (id) =>
  `insert into receipts(id,user_id,merchant,source_sha256,ocr_origin,total) values('${id}','${a}','Shop',repeat('a',64),'{}',44)`;
await db.query(insert(a));
await assert.rejects(db.query(insert(b)));
await db.exec(
  `set role authenticated;set app.uid='${a}';insert into business_entries(id,day,kind,amount,tax,method,category,party,receipt_id,stock_lines) values('${a}','2026-01-02','purchase',4400,400,'udhaar','Stock','Shop','${a}','[{"item":"Rice","units":2,"net":4000}]')`,
);
const doc = {
  merchant: 'Shop',
  receipt_date: '2026-01-02',
  total: 66,
  category: 'Stock',
  items: [{ item_name: 'Rice', quantity: 3, price: 60 }],
  reviewed_business: { method: 'udhaar', tax: 6 },
};
const fix = (rev, d) =>
  db.query('select correct_document($1,$2,$3)', [a, rev, JSON.stringify(d)]);
await assert.rejects(fix(1, { ...doc, total: 88 }));
assert.equal(
  (await db.query('select amount from business_entries')).rows[0].amount,
  4400,
);
await fix(1, doc);
assert.equal(
  (await db.query('select amount from business_entries')).rows[0].amount,
  6600,
);
await assert.rejects(fix(1, doc));
await db.exec(
  `update business_entries set paid_on=current_date,paid_by='digital';set app.uid='${b}'`,
);
assert.equal((await db.query('select * from business_entries')).rows.length, 0);
await assert.rejects(fix(2, doc));
await db.exec(
  `set app.uid='${a}';reset role;update consents set status=false;set role authenticated;`,
);
await assert.rejects(fix(2, doc));
await db.exec('select erase_own_business_entries();reset role');
assert.equal((await db.query('select * from business_entries')).rows.length, 0);
console.log(
  'PostgreSQL migrations, duplicate rejection, atomic correction/rollback, stale revision, settlement, isolation, consent and erasure passed.',
);
