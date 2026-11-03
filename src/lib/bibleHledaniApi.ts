// 🔎 Hledání v knihách bible (etapa 4) přes bible-api — bez offline mezipaměti.
// ---------------------------------------------------------------------------
// Hledá se v originálu (pasáže) i v českém překladu stran, jen ve zpracovaných
// knihách. Výsledek nese jen úryvek a místo v knize; text knihy zůstává jen
// v paměti (nic do localStorage, IndexedDB ani logů — R4, repo je veřejné).
import { volejBibli } from './bibleKlient';

export type VysledekHledani = {
  dokumentId: string;
  nazev: string;
  autor: string | null;
  rok: number | null;
  /** 'original' = text knihy, 'preklad' = český překlad strany. */
  zdroj: 'original' | 'preklad';
  pdfIndex: number;
  tistena: string | null;
  kapitola: string | null;
  druh: string;
  uryvek: string;
};

export type Hledani =
  | { stav: 'ok'; vysledky: VysledekHledani[] }
  | { stav: 'chyba' | 'nenasazeno'; zprava: string };

const text = (v: unknown): string | null => (typeof v === 'string' ? v : null);

export async function hledejVKnihach(dotaz: string, dokumentId?: string): Promise<Hledani> {
  const r = await volejBibli<{ vysledky?: unknown }>('bible-api', { akce: 'hledej', dotaz, ...(dokumentId ? { id: dokumentId } : {}) });
  if (!r.ok) {
    // Web se nasazuje dřív než funkce bible: stará bible-api hledání ještě nezná.
    if (r.chyba.kod === 'nenasazeno' || (r.chyba.kod === 'neplatny_vstup' && r.chyba.zprava === 'Neznámá akce.')) {
      return { stav: 'nenasazeno', zprava: 'Hledání se právě nasazuje — zkus to za pár minut.' };
    }
    return { stav: 'chyba', zprava: r.chyba.zprava };
  }
  const vysledky: VysledekHledani[] = [];
  for (const v of Array.isArray(r.data?.vysledky) ? r.data.vysledky : []) {
    const o = (v ?? {}) as Record<string, unknown>;
    const id = text(o.dokument_id);
    if (!id || typeof o.pdf_index !== 'number') continue;
    vysledky.push({
      dokumentId: id,
      nazev: text(o.nazev) ?? 'Kniha',
      autor: text(o.autor),
      rok: typeof o.rok === 'number' ? o.rok : null,
      zdroj: o.zdroj === 'preklad' ? 'preklad' : 'original',
      pdfIndex: o.pdf_index,
      tistena: text(o.tistena_strana),
      kapitola: text(o.kapitola),
      druh: text(o.druh) ?? 'text',
      uryvek: text(o.uryvek) ?? '',
    });
  }
  return { stav: 'ok', vysledky };
}
