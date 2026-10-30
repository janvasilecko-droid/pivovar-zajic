// 📚 Klient Supabase pro Pivovarskou bibli — BEZ offline mezipaměti.
// ---------------------------------------------------------------------------
// Sdílený klient (lib/supabase.ts) ukládá každé čtení do IndexedDB telefonu
// a store tabulek nikdy neuklízí. Soukromé knihy, jejich texty a pasáže tam
// nepatří (rozhodnutí R4 v docs/pivovarska-bible/ROZHODNUTI.md). Tenhle
// klient má stejné přihlášení — token si při každém požadavku vezme
// z hlavního klienta (`accessToken`) — ale čte a zapisuje rovnou na server.
//
// Časový limit jen pro dotazy do databáze: nahrání knihy o desítkách MB
// po pomalé síti trvá déle a nesmí se uprostřed utnout.
import { createClient } from '@supabase/supabase-js';
import { fetchWithTimeout, supabase, VELKY_DOTAZ_TIMEOUT_MS } from './supabase';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function adresa(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export const bibleDb = createClient(url, anonKey, {
  accessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
  global: {
    fetch: (input, init) => (adresa(input).includes('/rest/v1/')
      ? fetchWithTimeout(input, init, VELKY_DOTAZ_TIMEOUT_MS)
      : fetch(input, init)),
  },
});
