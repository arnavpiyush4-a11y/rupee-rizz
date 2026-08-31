import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const EXISTING = 'rupeerizz.qa+1788187761214@gmail.com';
const EXISTING_PW = 'RupeeRizzQA!2025';

async function main() {
  console.log('URL:', URL);

  // A) Try login of the earlier QA user (is it confirmed yet?)
  console.log('\n[A] Login existing QA user (checks confirmation status):');
  const a = await supabase.auth.signInWithPassword({ email: EXISTING, password: EXISTING_PW });
  if (a.error) console.log('   ->', a.error.status, a.error.message);
  else console.log('   -> LOGIN SUCCESS. session token len:', a.data.session?.access_token?.length);

  // B) Fresh signup -> then immediate login (expect "Email not confirmed" if confirmation ON)
  const fresh = `rupeerizz.qa+${Date.now()}@gmail.com`;
  console.log('\n[B] Fresh signup:', fresh);
  const su = await supabase.auth.signUp({ email: fresh, password: EXISTING_PW, options: { data: { full_name: 'QA Flow' } } });
  console.log('   signup error:', su.error?.message || 'none', '| session returned:', !!su.data?.session);
  const b = await supabase.auth.signInWithPassword({ email: fresh, password: EXISTING_PW });
  if (b.error) console.log('   login-after-signup ->', b.error.status, b.error.message, '(expected "Email not confirmed" when confirm-email is ON)');
  else console.log('   login-after-signup -> SUCCESS (confirm-email is OFF). token len:', b.data.session?.access_token?.length);

  // C) Wrong password -> expect invalid credentials
  console.log('\n[C] Wrong password:');
  const c = await supabase.auth.signInWithPassword({ email: fresh, password: 'totally-wrong-xyz' });
  console.log('   ->', c.error ? `${c.error.status} ${c.error.message}` : 'UNEXPECTED SUCCESS');

  // D) Forgot-password recovery email request (should not error even for unknown email)
  console.log('\n[D] resetPasswordForEmail (recovery/OTP):');
  const d = await supabase.auth.resetPasswordForEmail(fresh);
  console.log('   ->', d.error ? `ERROR ${d.error.message}` : 'OK (recovery email requested)');

  console.log('\nDONE.');
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
