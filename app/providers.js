'use client';

// RupeeRizz global client context: REAL Supabase auth (email/password + OTP recovery reset),
// plus profile / consent / language. Sessions persist via the Supabase browser client.
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { api } from '@/lib/apiClient';
import { getBrowserSupabase } from '@/lib/supabase/browser';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
});

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export function Providers({ children }) {
  const supabase = getBrowserSupabase();
  const [lang, setLangState] = useState('en');
  const [uid, setUid] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [consent, setConsent] = useState({ active: false, history: [] });
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const d = await api('/me');
      setUser(d.user || null);
      setProfile(d.profile || null);
      setConsent(d.consent || { active: false, history: [] });
      if (d.profile?.preferred_language) setLangState(d.profile.preferred_language);
      return d;
    } catch (e) { return null; }
  }, []);

  useEffect(() => {
    const l = typeof window !== 'undefined' ? window.localStorage.getItem('rr_lang') : null;
    if (l) setLangState(l);

    let done = false;
    supabase.auth.getSession().then(({ data }) => {
      const s = data?.session;
      if (s) {
        setUid(s.user.id);
        setUser({ id: s.user.id, email: s.user.email, name: s.user.user_metadata?.full_name });
        refresh().finally(() => { if (!done) setReady(true); });
      } else {
        setReady(true);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUid(session.user.id);
        setUser({ id: session.user.id, email: session.user.email, name: session.user.user_metadata?.full_name });
        refresh();
      } else {
        setUid(null); setUser(null); setProfile(null); setConsent({ active: false, history: [] });
      }
    });
    return () => { done = true; sub?.subscription?.unsubscribe?.(); };
  }, [supabase, refresh]);

  const setLang = (l) => { setLangState(l); if (typeof window !== 'undefined') window.localStorage.setItem('rr_lang', l); };

  // ---- Auth methods (Supabase) ----
  const signUpEmail = async ({ name, email, password }) => {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name }, emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
    });
    if (error) throw error;
    return data; // data.session is null when email confirmation is required
  };
  const signInEmail = async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await refresh();
    return data;
  };
  const resetPassword = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    });
    if (error) throw error;
  };
  const verifyOtpAndSetPassword = async ({ email, token, password }) => {
    const { error: ve } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
    if (ve) throw ve;
    const { error: ue } = await supabase.auth.updateUser({ password });
    if (ue) throw ue;
    await refresh();
  };
  const signOut = async () => {
    await supabase.auth.signOut();
    setUid(null); setUser(null); setProfile(null); setConsent({ active: false, history: [] });
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AppCtx.Provider value={{
        lang, setLang, uid, user, profile, consent, ready, refresh, setProfile,
        signUpEmail, signInEmail, resetPassword, verifyOtpAndSetPassword,
        signOut, logout: signOut,
      }}>
        {children}
        <Toaster richColors position="top-center" />
      </AppCtx.Provider>
    </QueryClientProvider>
  );
}
