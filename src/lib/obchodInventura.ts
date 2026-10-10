// 📋 Inventura obchodu na konci měsíce — kdy se má udělat a co se z ní spočítá.
// ---------------------------------------------------------------------------
// Zadání 10. 10. 2026: „inventura na konci měsíce". Inventura za měsíc je
// hotová, když je zapsaná v posledních dnech měsíce nebo v prvních dnech
// následujícího. Připomíná se od pátého dne před koncem měsíce a v prvních
// dnech dalšího měsíce se z ní stává naléhavé upozornění.
import type { InventuraRadek, StavZbozi } from './obchodSklad';

export const DNU_PRED_KONCEM = 4;
export const DNU_PO_KONCI = 5;

const posledniDenMesice = (mesic: string): string => {
  const [r, m] = mesic.split('-').map(Number);
  return new Date(Date.UTC(r, m, 0)).toISOString().slice(0, 10);
};
const pridejDny = (iso: string, d: number) => new Date(Date.parse(iso + 'T00:00:00Z') + d * 86_400_000).toISOString().slice(0, 10);
const predchoziMesic = (mesic: string): string => {
  const [r, m] = mesic.split('-').map(Number);
  return m === 1 ? `${r - 1}-12` : `${r}-${String(m - 1).padStart(2, '0')}`;
};

/** Okno, ve kterém se inventura „za měsíc" počítá: posledních pár dní měsíce a první dny dalšího. */
export function oknoInventury(mesic: string): { od: string; do: string } {
  const posledni = posledniDenMesice(mesic);
  return { od: pridejDny(posledni, -DNU_PRED_KONCEM), do: pridejDny(posledni, DNU_PO_KONCI) };
}

export type UpozorneniInventury = {
  /** Za který měsíc inventura chybí (YYYY-MM). */
  mesic: string;
  /** Měsíc už skončil — upozornění je naléhavé. */
  naleha: boolean;
};

/**
 * Chybí inventura za právě končící nebo právě skončený měsíc? Nic se
 * nepřipomíná, dokud obchod nemá žádnou inventuru — to je počáteční stav
 * a řeší se zvlášť.
 */
export function inventuraObchoduChybi(inventury: Pick<InventuraRadek, 'datum'>[], dnes: string): UpozorneniInventury | null {
  if (inventury.length === 0) return null;
  const tentoMesic = dnes.slice(0, 7);
  for (const mesic of [predchoziMesic(tentoMesic), tentoMesic]) {
    const okno = oknoInventury(mesic);
    if (dnes < okno.od || dnes > okno.do) continue;
    const hotovo = inventury.some((i) => i.datum >= okno.od && i.datum <= okno.do);
    if (!hotovo) return { mesic, naleha: dnes > posledniDenMesice(mesic) };
  }
  return null;
}

/** Poslední den měsíce — výchozí datum inventury „na konci měsíce". */
export const konecMesice = (dnes: string): string => posledniDenMesice(dnes.slice(0, 7));

export type RozdilInventury = {
  kod: string;
  nazev: string;
  ocekavano: number | null;
  napocitano: number;
  /** napočítáno − očekáváno; null, když nebylo s čím porovnat (první inventura). */
  rozdil: number | null;
};

/** Rozdíly proti očekávanému stavu — jen tam, kde se něco liší, největší první. */
export function rozdilyInventury(radky: { kod: string; nazev: string; ocekavano: number | null; napocitano: number }[]): RozdilInventury[] {
  return radky
    .map((r) => ({ ...r, rozdil: r.ocekavano == null ? null : Math.round((r.napocitano - r.ocekavano) * 100) / 100 }))
    .filter((r) => r.rozdil == null || r.rozdil !== 0)
    .sort((a, b) => Math.abs(b.rozdil ?? 0) - Math.abs(a.rozdil ?? 0));
}

/** Očekávané stavy ke dni inventury jako mapa kód → číslo (null = zboží ještě nikdo nepočítal). */
export const ocekavaneStavy = (stavy: StavZbozi[]): Map<string, number | null> => new Map(stavy.map((s) => [s.kod, s.stav]));
