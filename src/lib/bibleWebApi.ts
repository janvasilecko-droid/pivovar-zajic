// 🌐 Rešerše z internetu (etapa 9) přes bible-api — bez offline mezipaměti.
// ---------------------------------------------------------------------------
// Zdroje ukládá hlavně Claude přes konektor (vždy jako neověřené); člověk je
// tady ověří, zamítne nebo zapíše ručně. Web je vždy odděleně od literatury.
import { volejBibli } from './bibleKlient';
import { prehledWebu, type StavWebu, type WebZdroj } from '../../bible/supabase/functions/_shared/web-popisy.ts';

const NENASAZENO = 'Rešerše z internetu se právě nasazuje — zkus to za pár minut.';
const jeNenasazeno = (kod: string, zprava: string) => kod === 'nenasazeno' || (kod === 'neplatny_vstup' && zprava === 'Neznámá akce.');

export async function nactiWebZdroje(): Promise<{ stav: 'ok'; zdroje: WebZdroj[]; migrace: boolean } | { stav: 'chyba' | 'nenasazeno'; zprava: string }> {
  const r = await volejBibli<Record<string, unknown>>('bible-api', { akce: 'web_zdroje' });
  if (!r.ok) {
    if (jeNenasazeno(r.chyba.kod, r.chyba.zprava)) return { stav: 'nenasazeno', zprava: NENASAZENO };
    return { stav: 'chyba', zprava: r.chyba.zprava };
  }
  return { stav: 'ok', zdroje: prehledWebu(r.data?.zdroje), migrace: r.data?.migrace !== false };
}

type Vysledek<T = undefined> = { stav: 'ok'; data: T } | { stav: 'chyba'; zprava: string };

async function zapis<T>(telo: Record<string, unknown>, vyber: (d: Record<string, unknown>) => T): Promise<Vysledek<T>> {
  const r = await volejBibli<Record<string, unknown>>('bible-api', telo);
  if (r.ok) return { stav: 'ok', data: vyber(r.data ?? {}) };
  if (jeNenasazeno(r.chyba.kod, r.chyba.zprava)) return { stav: 'chyba', zprava: NENASAZENO };
  return { stav: 'chyba', zprava: r.chyba.zprava };
}

export type WebZdrojVstup = { url: string; titulek: string; vydavatel: string; datumPublikace: string; shrnuti: string; oblasti: string[]; duvera: number };

/** Kontrola formuláře (stejná pravidla hlídá bible-api i SQL). */
export function chybaWebZdroje(z: WebZdrojVstup): string | null {
  const url = z.url.trim();
  if (!/^https?:\/\/[^\s]+$/i.test(url)) return 'Adresa musí začínat http:// nebo https:// a nesmí mít mezery.';
  if (!z.titulek.trim()) return 'Doplň titulek.';
  if (!z.shrnuti.trim()) return 'Doplň shrnutí (vlastními slovy).';
  if (z.datumPublikace && !/^\d{4}-\d{2}-\d{2}$/.test(z.datumPublikace)) return 'Datum publikace není platné.';
  return null;
}

export const ulozWebZdroj = (id: string | null, z: WebZdrojVstup): Promise<Vysledek<{ novy: boolean; stav: string | null }>> => zapis({
  akce: 'web_zdroj_ulozit',
  zdroj: {
    ...(id ? { id } : {}),
    url: z.url.trim(),
    titulek: z.titulek.trim(),
    ...(z.vydavatel.trim() ? { vydavatel: z.vydavatel.trim() } : {}),
    ...(z.datumPublikace ? { datum_publikace: z.datumPublikace } : {}),
    shrnuti: z.shrnuti.trim(),
    oblasti: z.oblasti,
    duvera: z.duvera,
  },
}, (d) => ({ novy: d.novy === true, stav: typeof d.stav === 'string' ? d.stav : null }));

export const overWebZdroj = (id: string, stav: StavWebu, poznamka: string): Promise<Vysledek> =>
  zapis({ akce: 'web_zdroj_overit', id, stav, ...(poznamka.trim() ? { poznamka: poznamka.trim() } : {}) }, () => undefined);

export const smazWebZdroj = (id: string): Promise<Vysledek> => zapis({ akce: 'web_zdroj_smazat', id }, () => undefined);
