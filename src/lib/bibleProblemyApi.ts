// 🩺 Analýza problémů (etapa 10) přes bible-api — bez offline mezipaměti.
// ---------------------------------------------------------------------------
// Problém má dotčené várky a zjištění jednoho ze šesti typů (fakt se zdrojem,
// výpočet, zkušenost, doporučení, hypotéza, chybí). Zjištění zapisuje člověk
// tady nebo Claude přes konektor; hypotézu potvrdí nebo vyvrátí člověk.
import { volejBibli } from './bibleKlient';
import {
  prehledProblemu, TYPY_ZJISTENI, type Problem, type StavProblemu, type StavZjisteni, type TypZjisteni,
} from '../../bible/supabase/functions/_shared/problemy-popisy.ts';

const NENASAZENO = 'Analýza problémů se právě nasazuje — zkus to za pár minut.';
const jeNenasazeno = (kod: string, zprava: string) => kod === 'nenasazeno' || (kod === 'neplatny_vstup' && zprava === 'Neznámá akce.');

export async function nactiProblemy(): Promise<{ stav: 'ok'; problemy: Problem[]; migrace: boolean } | { stav: 'chyba' | 'nenasazeno'; zprava: string }> {
  const r = await volejBibli<Record<string, unknown>>('bible-api', { akce: 'problemy' });
  if (!r.ok) {
    if (jeNenasazeno(r.chyba.kod, r.chyba.zprava)) return { stav: 'nenasazeno', zprava: NENASAZENO };
    return { stav: 'chyba', zprava: r.chyba.zprava };
  }
  return { stav: 'ok', problemy: prehledProblemu(r.data?.problemy), migrace: r.data?.migrace !== false };
}

type Vysledek<T = undefined> = { stav: 'ok'; data: T } | { stav: 'chyba'; zprava: string };

async function zapis<T>(telo: Record<string, unknown>, vyber: (d: Record<string, unknown>) => T): Promise<Vysledek<T>> {
  const r = await volejBibli<Record<string, unknown>>('bible-api', telo);
  if (r.ok) return { stav: 'ok', data: vyber(r.data ?? {}) };
  if (jeNenasazeno(r.chyba.kod, r.chyba.zprava)) return { stav: 'chyba', zprava: NENASAZENO };
  return { stav: 'chyba', zprava: r.chyba.zprava };
}

const idZOdpovedi = (d: Record<string, unknown>): string | null => (typeof d.id === 'string' ? d.id : null);

export type ProblemVstup = { nazev: string; popis: string; pivo: string; varky: string[]; oblasti: string[]; stav: StavProblemu; reseni: string };

export const ulozProblem = (id: string | null, p: ProblemVstup): Promise<Vysledek<string | null>> => zapis({
  akce: 'problem_ulozit',
  problem: {
    ...(id ? { id } : {}),
    nazev: p.nazev.trim(),
    ...(p.popis.trim() ? { popis: p.popis.trim() } : {}),
    ...(p.pivo.trim() ? { pivo: p.pivo.trim() } : {}),
    varky: p.varky,
    oblasti: p.oblasti,
    stav: p.stav,
    ...(p.reseni.trim() ? { reseni: p.reseni.trim() } : {}),
  },
}, idZOdpovedi);

export const smazProblem = (id: string): Promise<Vysledek> => zapis({ akce: 'problem_smazat', id }, () => undefined);

export type ZjisteniVstup = { typ: TypZjisteni; text: string; zdroj: string };

/** Kontrola zjištění: text vždy, zdroj u faktu a výpočtu (hlídá i bible-api a SQL). */
export function chybaZjisteni(z: ZjisteniVstup): string | null {
  if (!z.text.trim()) return 'Doplň zjištění.';
  const t = TYPY_ZJISTENI.find((x) => x.id === z.typ);
  if (t?.zdrojPovinny && !z.zdroj.trim()) return `${t.nazev} potřebuje zdroj (kniha a strana, várka, výpočet…).`;
  return null;
}

export const zapisZjisteni = (problemId: string, z: ZjisteniVstup): Promise<Vysledek<string | null>> => zapis({
  akce: 'zjisteni_ulozit',
  zjisteni: { problem_id: problemId, typ: z.typ, text: z.text.trim(), ...(z.zdroj.trim() ? { zdroj: z.zdroj.trim() } : {}) },
}, idZOdpovedi);

export const nastavStavZjisteni = (id: string, stav: StavZjisteni): Promise<Vysledek> => zapis({ akce: 'zjisteni_stav', id, stav }, () => undefined);
export const smazZjisteni = (id: string): Promise<Vysledek> => zapis({ akce: 'zjisteni_smazat', id }, () => undefined);
