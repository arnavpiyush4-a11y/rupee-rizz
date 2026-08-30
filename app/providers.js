'use client';

// RupeeRizz global client context: demo-safe session, profile, consent, language.
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { api, getToken, setToken, clearToken } from '@/lib/apiClient';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
});

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export function Providers({ children }) {
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
      if (d.user) { setUid(d.user.id); if (d.profile?.preferred_language) setLangState(d.profile.preferred_language); }
      return d;
    } catch (e) {
      if (e.status === 401) { clearToken(); setUid(null); setUser(null); setProfile(null); setConsent({ active: false, history: [] }); }
      return null;
    }
  }, []);

  useEffect(() => {
    const l = typeof window !== 'undefined' ? window.localStorage.getItem('rr_lang') : null;
    if (l) setLangState(l);
    const token = getToken();
    if (token) { setUid(token); refresh().finally(() => setReady(true)); }
    else setReady(true);
  }, [refresh]);

  const setLang = (l) => { setLangState(l); if (typeof window !== 'undefined') window.localStorage.setItem('rr_lang', l); };

  const login = async (payload) => {
    const d = await api('/auth/session', { method: 'POST', body: payload });
    setToken(d.user.id);
    setUid(d.user.id);
    await refresh();
    return d;
  };

  const logout = () => {
    clearToken();
    setUid(null); setUser(null); setProfile(null); setConsent({ active: false, history: [] });
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AppCtx.Provider value={{ lang, setLang, uid, user, profile, consent, ready, refresh, login, logout, setProfile }}>
        {children}
        <Toaster richColors position="top-center" />
      </AppCtx.Provider>
    </QueryClientProvider>
  );
}
