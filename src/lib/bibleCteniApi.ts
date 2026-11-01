// 📖 Čtení zpracované knihy přes bible-api (etapa 3a) — BEZ offline mezipaměti.
// ---------------------------------------------------------------------------
// Číst jde jen zpracovanou knihu (hotovo / ke_kontrole); jinak bible-api vrátí
// 'nezpracovano' se stavem. Text knihy zůstává jen v paměti čtečky — nic do
// localStorage, IndexedDB ani logů (rozhodnutí R4, repo je veřejné).
import { volejBibli, type ChybaBible } from './bibleKlient';
import type { BibleDokument } from './bibleKnihovnaApi';
import { listyZRejstriku, type KapitolaKnihy, type ListKnihy } from './bibleCteni';
import type { ZdrojTextu } from './bibleText';

export type Kniha = { dokument: BibleDokument; kapitoly: KapitolaKnihy[]; listy: ListKnihy[] };

export type TextListu = {
  pdf_index: number;
  tistena_strana: string | null;
  tistena_zdroj: string | null;
  zdroj_textu: ZdrojTextu;
  text: string;
  ke_kontrole: boolean;
  kontrola_duvod: string | null;
  kapitola_id: string | null;
};

export type DruhObjektu = 'tabulka' | 'vzorec' | 'popisek';

export type ObjektKnihy = {
  poradi: number;
  druh: DruhObjektu;
  strana_od: number;
  strana_do: number;
  kapitola_id: string | null;
  nahled: string;
};

export type Cteni<T> =
  | { stav: 'ok'; data: T }
  | { stav: 'nezpracovano' | 'nenalezeno' | 'nenasazeno' | 'chyba'; zprava: string };

/** Kolik listů si čtečka vezme naráz (aktuální + další dopředu). */
export const LISTU_NARAZ = 2;

function chybaCteni(ch: ChybaBible): Exclude<Cteni<never>, { stav: 'ok' }> {
  if (ch.kod === 'nezpracovano') return { stav: 'nezpracovano', zprava: ch.zprava };
  if (ch.kod === 'nenalezeno') return { stav: 'nenalezeno', zprava: ch.zprava };
  // Web se nasazuje dřív než funkce bible: stará bible-api čtení ještě nezná.
  if (ch.kod === 'nenasazeno' || (ch.kod === 'neplatny_vstup' && ch.zprava === 'Neznámá akce.')) {
    return { stav: 'nenasazeno', zprava: 'Čtení knih se právě nasazuje — zkus to za pár minut.' };
  }
  return { stav: 'chyba', zprava: ch.zprava };
}

const jeText = (v: unknown): v is string => typeof v === 'string';
const textNeboNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const cisloNeboNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function kapitolaZOdpovedi(v: unknown): KapitolaKnihy | null {
  if (!v || typeof v !== 'object') return null;
  const k = v as Record<string, unknown>;
  if (!jeText(k.id) || !jeText(k.nazev) || typeof k.poradi !== 'number') return null;
  return {
    id: k.id, rodic_id: textNeboNull(k.rodic_id), poradi: k.poradi, uroven: typeof k.uroven === 'number' ? k.uroven : 1,
    cislo: textNeboNull(k.cislo), nazev: k.nazev, strana_od: cisloNeboNull(k.strana_od), strana_do: cisloNeboNull(k.strana_do),
  };
}

export async function nactiKnihu(id: string): Promise<Cteni<Kniha>> {
  const r = await volejBibli<{ dokument?: unknown; kapitoly?: unknown; listy?: unknown }>('bible-api', { akce: 'kniha', id });
  if (!r.ok) return chybaCteni(r.chyba);
  const d = r.data ?? {};
  if (!d.dokument || typeof d.dokument !== 'object') return { stav: 'chyba', zprava: 'Bible vrátila neúplnou knihu.' };
  const kapitoly = (Array.isArray(d.kapitoly) ? d.kapitoly : []).map(kapitolaZOdpovedi).filter((k): k is KapitolaKnihy => k !== null);
  return { stav: 'ok', data: { dokument: d.dokument as BibleDokument, kapitoly, listy: listyZRejstriku(d.listy) } };
}

const ZDROJE: readonly ZdrojTextu[] = ['vrstva', 'ocr', 'soubor'];

function listZOdpovedi(v: unknown): TextListu | null {
  if (!v || typeof v !== 'object') return null;
  const l = v as Record<string, unknown>;
  if (typeof l.pdf_index !== 'number') return null;
  return {
    pdf_index: l.pdf_index,
    tistena_strana: textNeboNull(l.tistena_strana),
    tistena_zdroj: textNeboNull(l.tistena_zdroj),
    zdroj_textu: ZDROJE.includes(l.zdroj_textu as ZdrojTextu) ? (l.zdroj_textu as ZdrojTextu) : 'vrstva',
    text: jeText(l.text) ? l.text : '',
    ke_kontrole: l.ke_kontrole === true,
    kontrola_duvod: textNeboNull(l.kontrola_duvod),
    kapitola_id: textNeboNull(l.kapitola_id),
  };
}

/** Text listů od `od` (nejvýš `pocet`, u hustých listů míň — zbytek si čtečka vyžádá). */
export async function nactiListy(id: string, od: number, pocet: number = LISTU_NARAZ): Promise<Cteni<TextListu[]>> {
  const r = await volejBibli<{ listy?: unknown }>('bible-api', { akce: 'listy', id, od, pocet });
  if (!r.ok) return chybaCteni(r.chyba);
  const listy = (Array.isArray(r.data?.listy) ? r.data.listy : []).map(listZOdpovedi).filter((l): l is TextListu => l !== null);
  return { stav: 'ok', data: listy };
}

const DRUHY: readonly DruhObjektu[] = ['tabulka', 'vzorec', 'popisek'];

/** Tabulky, vzorce a popisky knihy po stovkách (`po` = pořadí posledního načteného). */
export async function nactiObjekty(id: string, po = 0): Promise<Cteni<{ objekty: ObjektKnihy[]; dalsi: number | null }>> {
  const r = await volejBibli<{ objekty?: unknown; dalsi?: unknown }>('bible-api', { akce: 'objekty', id, po });
  if (!r.ok) return chybaCteni(r.chyba);
  const objekty: ObjektKnihy[] = [];
  for (const v of Array.isArray(r.data?.objekty) ? r.data.objekty : []) {
    const o = (v ?? {}) as Record<string, unknown>;
    if (typeof o.poradi !== 'number' || typeof o.strana_od !== 'number' || !DRUHY.includes(o.druh as DruhObjektu)) continue;
    objekty.push({
      poradi: o.poradi, druh: o.druh as DruhObjektu, strana_od: o.strana_od,
      strana_do: typeof o.strana_do === 'number' ? o.strana_do : o.strana_od,
      kapitola_id: textNeboNull(o.kapitola_id), nahled: jeText(o.nahled) ? o.nahled : '',
    });
  }
  return { stav: 'ok', data: { objekty, dalsi: cisloNeboNull(r.data?.dalsi) } };
}
