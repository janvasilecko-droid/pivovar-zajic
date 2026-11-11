// 🧑‍🔧 Zkušenosti sládků (etapa 3b) přes bible-api — bez offline mezipaměti.
// ---------------------------------------------------------------------------
// Každý záznam nese úroveň důvěryhodnosti 1–5 (architektura § 9). Úroveň 1–3
// (ověřené zdroje) smí nastavit jen správce, přispěvatel zapisuje 4 nebo 5 —
// hlídá to SQL a appka to jen předem nenabídne. Text zkušenosti zůstává jen
// v paměti stránky (R4: nic do localStorage ani IndexedDB).
import { volejBibli } from './bibleKlient';

export type DruhZkusenosti =
  | 'pripadova_studie' | 'diskuse' | 'rozhovor' | 'postup' | 'reseni_problemu' | 'doporuceni_vyrobce' | 'provozni_zkusenost';

export const DRUHY_ZKUSENOSTI: readonly { id: DruhZkusenosti; nazev: string }[] = [
  { id: 'provozni_zkusenost', nazev: 'Provozní zkušenost' },
  { id: 'reseni_problemu', nazev: 'Řešení problému' },
  { id: 'postup', nazev: 'Praktický postup' },
  { id: 'pripadova_studie', nazev: 'Případová studie' },
  { id: 'rozhovor', nazev: 'Rozhovor se sládkem' },
  { id: 'diskuse', nazev: 'Odborná diskuse' },
  { id: 'doporuceni_vyrobce', nazev: 'Doporučení výrobce' },
];

export const UROVNE_ZKUSENOSTI: readonly { uroven: number; nazev: string }[] = [
  { uroven: 1, nazev: 'Ověřená odborná publikace' },
  { uroven: 2, nazev: 'Výrobní dokumentace' },
  { uroven: 3, nazev: 'Opakovaně ověřená provozní zkušenost' },
  { uroven: 4, nazev: 'Zkušenost jednoho sládka' },
  { uroven: 5, nazev: 'Neověřená informace' },
];

export const nazevDruhu = (id: string): string => DRUHY_ZKUSENOSTI.find((d) => d.id === id)?.nazev ?? id;
export const nazevUrovne = (u: number): string => UROVNE_ZKUSENOSTI.find((x) => x.uroven === u)?.nazev ?? `Úroveň ${u}`;

export type Zkusenost = {
  id: string;
  typ: DruhZkusenosti;
  nazev: string;
  text: string;
  oblasti: string[];
  uroven: number;
  zdroj: string | null;
  zapsal: string | null;
  zapsalJmeno: string | null;
  vytvoreno: string | null;
  upraveno: string | null;
};

export type ZkusenostVstup = {
  typ: DruhZkusenosti;
  nazev: string;
  text: string;
  oblasti: string[];
  uroven: number;
  zdroj: string;
};

export type FiltrZkusenosti = { dotaz?: string; oblast?: string; nejhorsi?: number };

const txt = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const jeDruh = (v: unknown): v is DruhZkusenosti => DRUHY_ZKUSENOSTI.some((d) => d.id === v);

/** Stará bible-api akci ještě nezná (web se nasazuje dřív než funkce) — appka to řekne srozumitelně. */
const NENASAZENO = 'Zkušenosti se právě nasazují — zkus to za pár minut.';
const jeNenasazeno = (kod: string, zprava: string) => kod === 'nenasazeno' || (kod === 'neplatny_vstup' && zprava === 'Neznámá akce.');

/**
 * `volne` (Hledání v knihách): když přesné hledání nic nenajde, bible-api
 * hledá otázkou v běžné řeči jako u knih — `volne` ve výsledku to řekne.
 */
export async function nactiZkusenosti(
  filtr: FiltrZkusenosti = {},
  volby: { volne?: boolean } = {},
): Promise<{ stav: 'ok'; zkusenosti: Zkusenost[]; migrace: boolean; volne: boolean } | { stav: 'chyba' | 'nenasazeno'; zprava: string }> {
  const telo: Record<string, unknown> = { akce: 'zkusenosti' };
  if (filtr.dotaz?.trim()) telo.dotaz = filtr.dotaz.trim();
  if (filtr.oblast) telo.oblast = filtr.oblast;
  if (filtr.nejhorsi && filtr.nejhorsi < 5) telo.nejhorsi = filtr.nejhorsi;
  if (volby.volne) telo.volne = true;
  const r = await volejBibli<{ zkusenosti?: unknown; migrace?: unknown; volne?: unknown }>('bible-api', telo);
  if (!r.ok) {
    if (jeNenasazeno(r.chyba.kod, r.chyba.zprava)) return { stav: 'nenasazeno', zprava: NENASAZENO };
    return { stav: 'chyba', zprava: r.chyba.zprava };
  }
  const zkusenosti: Zkusenost[] = [];
  for (const v of Array.isArray(r.data?.zkusenosti) ? r.data.zkusenosti : []) {
    const o = (v ?? {}) as Record<string, unknown>;
    const id = txt(o.id);
    if (!id || typeof o.uroven !== 'number' || !jeDruh(o.typ)) continue;
    zkusenosti.push({
      id,
      typ: o.typ,
      nazev: txt(o.nazev) ?? 'Zkušenost',
      text: txt(o.text) ?? '',
      oblasti: Array.isArray(o.oblasti) ? o.oblasti.filter((x): x is string => typeof x === 'string') : [],
      uroven: o.uroven,
      zdroj: txt(o.zdroj),
      zapsal: txt(o.zapsal),
      zapsalJmeno: txt(o.zapsal_jmeno),
      vytvoreno: txt(o.created_at),
      upraveno: txt(o.upraveno_at),
    });
  }
  return { stav: 'ok', zkusenosti, migrace: r.data?.migrace !== false, volne: r.data?.volne === true };
}

type Vysledek = { stav: 'ok' } | { stav: 'chyba'; zprava: string };

async function zapis(telo: Record<string, unknown>): Promise<Vysledek> {
  const r = await volejBibli<unknown>('bible-api', telo);
  if (r.ok) return { stav: 'ok' };
  if (jeNenasazeno(r.chyba.kod, r.chyba.zprava)) return { stav: 'chyba', zprava: NENASAZENO };
  return { stav: 'chyba', zprava: r.chyba.zprava };
}

const prevedVstup = (z: ZkusenostVstup) => ({
  typ: z.typ,
  nazev: z.nazev.trim(),
  text: z.text.trim(),
  oblasti: z.oblasti,
  uroven: z.uroven,
  ...(z.zdroj.trim() ? { zdroj: z.zdroj.trim() } : {}),
});

export const zapisZkusenost = (z: ZkusenostVstup): Promise<Vysledek> => zapis({ akce: 'zkusenost_zapsat', zkusenost: prevedVstup(z) });
export const upravZkusenost = (id: string, z: ZkusenostVstup): Promise<Vysledek> => zapis({ akce: 'zkusenost_upravit', id, zkusenost: prevedVstup(z) });
export const smazZkusenost = (id: string): Promise<Vysledek> => zapis({ akce: 'zkusenost_smazat', id });
