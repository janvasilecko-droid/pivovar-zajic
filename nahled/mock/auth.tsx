// Náhrada `src/lib/auth.tsx` pro náhled — přihlášený vymyšlený uživatel.
// Podstrčí se přes `vite.nahled.config.ts` stejně jako Supabase. Obrazovky
// z `useAuth` čtou jen jméno a e-mail (kdo zapsal); přihlašování tu není.
import type { ReactNode } from 'react';

const uzivatel = { id: 'u-nahled', email: 'nahled@pivovar.test' };
const profil = { id: 'u-nahled', display_name: 'Náhled', role: 'admin' };

const hodnota = {
  session: null,
  user: uzivatel,
  profile: profil,
  loading: false,
  signIn: async () => ({ error: 'V náhledu se nepřihlašuje.' }),
  signOut: async () => {},
  reloadProfile: async () => {},
  patchProfile: () => {},
};

export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export const useAuth = () => hodnota as any;
