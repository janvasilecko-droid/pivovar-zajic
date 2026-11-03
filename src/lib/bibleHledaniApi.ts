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

// --- Přehledy témat (Claude porovná knihy a napíše to nejlepší s odkazy) -------

export type PolozkaPrehledu = { klic: string; nazev: string; oblast: string | null; kontrola: string | null; vytvoreno: string | null };

export type ZdrojPrehledu = {
  n: number;
  dokumentId: string;
  nazev: string;
  pdfIndex: number;
  tistena: string | null;
  kapitola: string | null;
  zdroj: 'original' | 'preklad';
};

export type PrehledTematu = {
  klic: string;
  nazev: string;
  text: string;
  zdroje: ZdrojPrehledu[];
  kontrola: string | null;
  vytvoreno: string | null;
};

export async function nactiPrehledy(): Promise<{ stav: 'ok'; prehledy: PolozkaPrehledu[]; migrace: boolean } | { stav: 'chyba'; zprava: string }> {
  const r = await volejBibli<{ prehledy?: unknown; migrace?: unknown }>('bible-api', { akce: 'prehledy' });
  if (!r.ok) return { stav: 'chyba', zprava: r.chyba.zprava };
  const prehledy: PolozkaPrehledu[] = [];
  for (const v of Array.isArray(r.data?.prehledy) ? r.data.prehledy : []) {
    const o = (v ?? {}) as Record<string, unknown>;
    const klic = text(o.klic);
    if (!klic) continue;
    prehledy.push({ klic, nazev: text(o.nazev) ?? klic, oblast: text(o.oblast), kontrola: text(o.kontrola), vytvoreno: text(o.vytvoreno) });
  }
  return { stav: 'ok', prehledy, migrace: r.data?.migrace !== false };
}

export async function nactiPrehled(klic: string): Promise<{ stav: 'ok'; prehled: PrehledTematu } | { stav: 'chyba'; zprava: string }> {
  const r = await volejBibli<Record<string, unknown>>('bible-api', { akce: 'prehled', klic });
  if (!r.ok) return { stav: 'chyba', zprava: r.chyba.zprava };
  const o = r.data ?? {};
  const zdroje: ZdrojPrehledu[] = [];
  for (const v of Array.isArray(o.zdroje) ? o.zdroje : []) {
    const z = (v ?? {}) as Record<string, unknown>;
    const id = text(z.dokument_id);
    if (!id || typeof z.n !== 'number' || typeof z.pdf_index !== 'number') continue;
    zdroje.push({
      n: z.n, dokumentId: id, nazev: text(z.nazev) ?? 'Kniha', pdfIndex: z.pdf_index,
      tistena: text(z.tistena_strana), kapitola: text(z.kapitola), zdroj: z.zdroj === 'preklad' ? 'preklad' : 'original',
    });
  }
  return {
    stav: 'ok',
    prehled: {
      klic: text(o.klic) ?? klic, nazev: text(o.nazev) ?? klic, text: text(o.text) ?? '', zdroje,
      kontrola: text(o.kontrola), vytvoreno: text(o.vytvoreno),
    },
  };
}
