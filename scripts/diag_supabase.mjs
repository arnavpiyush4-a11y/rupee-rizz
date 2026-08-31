import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('URL:', URL);
console.log('KEY prefix:', (KEY || '').slice(0, 12), 'len:', (KEY || '').length);

const supabase = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const stamp = Date.now();
const email = `rupeerizz.qa+${stamp}@gmail.com`;
const password = 'RupeeRizzQA!2025';

async function main() {
  // 1) SIGN UP
  console.log('\n=== SIGN UP ===', email);
  const su = await supabase.auth.signUp({ email, password, options: { data: { full_name: 'QA Tester' } } });
  if (su.error) {
    console.log('SIGNUP ERROR:', su.error.status, su.error.message);
  } else {
    console.log('SIGNUP OK. user.id:', su.data?.user?.id);
    console.log('  session returned?', !!su.data?.session, '(null session => email confirmation likely required)');
    console.log('  email_confirmed_at:', su.data?.user?.email_confirmed_at);
    console.log('  identities len:', su.data?.user?.identities?.length);
  }

  // 2) SIGN IN with password
  console.log('\n=== SIGN IN (password) ===');
  const si = await supabase.auth.signInWithPassword({ email, password });
  if (si.error) {
    console.log('SIGNIN ERROR:', si.error.status, si.error.message);
  } else {
    console.log('SIGNIN OK. access_token len:', si.data?.session?.access_token?.length);
  }

  const token = si.data?.session?.access_token;

  // 3) TABLE EXISTENCE CHECK (use a token-scoped client so RLS applies)
  console.log('\n=== TABLE CHECKS (RLS as user) ===');
  const client = token
    ? createClient(URL, KEY, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
    : supabase;
  for (const t of ['profiles', 'consents', 'receipts', 'savings_goals', 'goal_contributions', 'deletion_requests']) {
    const { data, error } = await client.from(t).select('*').limit(1);
    if (error) console.log(`  ${t}: ERROR code=${error.code} msg=${error.message}`);
    else console.log(`  ${t}: OK (rows visible: ${data.length})`);
  }

  // 4) STORAGE bucket check
  console.log('\n=== STORAGE ===');
  const { data: buckets, error: be } = await client.storage.listBuckets();
  if (be) console.log('  listBuckets error:', be.message);
  else console.log('  buckets:', (buckets || []).map(b => `${b.name}(public=${b.public})`).join(', ') || '(none visible)');

  console.log('\nTEST_USER_EMAIL=', email);
  console.log('TEST_USER_PASSWORD=', password);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
