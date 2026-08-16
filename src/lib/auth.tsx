import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, Profile } from './supabase';
import { reportAppVersion } from './appVersionTracker';
import { isAdminEmail, getAdminName } from './config';

type AuthCtx = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  reloadProfile: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(user: User) {
    const isSpecialAdmin = isAdminEmail(user.email);
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    let prof = data as Profile | null;

    // Klient nesmí sám přidělovat admin roli. E-mailový seznam slouží pouze
    // jako UI fallback; autoritativní roli nastavuje server/admin funkce.
    if (isSpecialAdmin && !prof) {
      await supabase.from('profiles').upsert({ id: user.id, display_name: getAdminName(), role: 'user' });
      prof = { id: user.id, display_name: getAdminName(), role: 'user', created_at: new Date().toISOString() };
    }

    setProfile(prof);
  }

  async function reloadProfile() {
    if (session?.user) {
      await loadProfile(session.user);
    }
  }

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) loadProfile(data.session.user).finally(() => mounted && setLoading(false));
      else setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        loadProfile(s.user);
        // Odeslat verzi aplikace při (znovu)přihlášení
        setTimeout(() => reportAppVersion(), 500);
      } else {
        setProfile(null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [session?.user?.id]); // Dependency array matches sessions

  const signIn = async (email: string, password: string) => {
    const doSignIn = () => supabase.auth.signInWithPassword({ email, password });
    let res = await doSignIn();

    // Účet zatím nemusí existovat — zkusíme ho automaticky vytvořit
    // (pouze s výchozím heslem „zajic“) a pak se přihlásit znovu.
    if (res.error) {
      try {
        const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-auto-login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ email, password }),
        });
        const data = await r.json().catch(() => ({})) as { created?: boolean; error?: string };
        if (r.ok && data?.created) {
          res = await doSignIn();
        } else if (data?.error) {
          return { error: data.error };
        }
      } catch {
        // Ponecháme původní chybu přihlášení.
      }
    }

    return { error: res.error?.message ?? null };
  };

  const signOut = () => supabase.auth.signOut().then(() => { setProfile(null); });

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, profile, loading, signIn, signOut, reloadProfile }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
