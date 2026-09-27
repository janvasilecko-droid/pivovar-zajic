// 🛢️ Cyklus tanku ve Sklepě — co se ukazuje na kartě a co se zapíše při zavření.
// ---------------------------------------------------------------------------
// Zadání 27. 9. 2026: „zkontroluj ten sklep a případně ho předělej, ať je to
// přehledný, jednoduchý a ukazuje to správný údaje."
//
// Při kontrole se našly dvě místa, kde Sklep počítal jinak než skutečnost:
//
//  1) Ztráta při zavření tanku = počáteční objem − stočeno. Přečerpání
//     (přefuk ze Spilky do ležáku, dolití) se v tom nepočítalo — tank, ze
//     kterého se 2 000 l přefouklo jinam, zapsal do historie 2 000 l ztráty
//     a „Ztráty při stáčení" pak ukazovaly nesmysly.
//  2) Přečerpání do prázdného tanku nastavilo počáteční objem na kapacitu
//     tanku (7 500 l), ne na to, co do něj opravdu přiteklo. Obrazovka to
//     tak brala z načtení, kde se chybějící počáteční objem doplňoval
//     kapacitou. Tank s 3 000 l pak ukazoval 40 % a kontrola objemu hlásila
//     schodek 4 500 l.

import type { StaceniVstup, PrecerpaniVstup } from './tankKontrola';

/** Stavy, ve kterých tank právě drží pivo (cyklus běží). */
export const STAVY_S_PIVEM = ['filling', 'active', 'emptying'] as const;

export type TankProCyklus = {
  id: string;
  initial_volume_l: number | null;
  started_at: string | null;
  status?: string | null;
};

export type SouhrnCyklu = {
  /** Kolik se napustilo na začátku cyklu. */
  pocatekL: number;
  /** Přečerpání po začátku cyklu: + přiteklo, − odteklo (i se ztrátou cestou). */
  precerpanoL: number;
  /** Litry, které odešly do sudů (source_volume_l). */
  stocenoL: number;
  /** Počet stočených sudů. */
  sudu: number;
  /** Co se nikam nedostalo: počátek + přečerpání − stočeno. Nikdy záporné. */
  ztrataL: number;
  /** Ztráta v % z toho, co bylo v tanku k dispozici (počátek + přiteklo). */
  ztrataPct: number;
};

type StaceniSKusy = StaceniVstup & { quantity?: number | null };

/**
 * Souhrn aktuálního cyklu tanku — stejná pravidla jako kontrola objemu
 * (lib/tankKontrola.ts): stáčení od dne začátku cyklu, přečerpání až PO dni
 * začátku (to v den začátku je samo naplnění, už je v počátečním objemu).
 */
export function souhrnCyklu(
  tank: TankProCyklus,
  staceni: StaceniSKusy[],
  precerpani: PrecerpaniVstup[],
): SouhrnCyklu {
  const start = tank.started_at ? tank.started_at.slice(0, 10) : null;
  const pocatekL = Number(tank.initial_volume_l ?? 0);

  let stocenoL = 0;
  let sudu = 0;
  for (const s of staceni) {
    if (s.cellar_tank_id !== tank.id) continue;
    if (start && s.entry_date < start) continue;
    stocenoL += Number(s.source_volume_l || 0);
    sudu += Number(s.quantity || 0);
  }

  let precerpanoL = 0;
  let priteklo = 0;
  for (const p of precerpani) {
    if (start && p.transfer_date <= start) continue;
    if (p.from_tank_id === tank.id) precerpanoL -= Number(p.volume_l || 0) + Number(p.loss_l || 0);
    if (p.to_tank_id === tank.id) {
      precerpanoL += Number(p.volume_l || 0);
      priteklo += Number(p.volume_l || 0);
    }
  }

  const ztrataL = Math.max(0, Math.round((pocatekL + precerpanoL - stocenoL) * 10) / 10);
  const zaklad = pocatekL + priteklo;
  const ztrataPct = zaklad > 0 ? Math.round((ztrataL / zaklad) * 1000) / 10 : 0;

  return {
    pocatekL,
    precerpanoL: Math.round(precerpanoL * 10) / 10,
    stocenoL: Math.round(stocenoL * 10) / 10,
    sudu,
    ztrataL,
    ztrataPct,
  };
}

/**
 * Počáteční objem a začátek cyklu cílového tanku po přečerpání.
 *
 * Tank, ve kterém už pivo je (cyklus běží), si počátek nechá — přiteklé
 * pivo se počítá jako přečerpání. Prázdný nebo vymytý tank začíná NOVÝ
 * cyklus s tím, co do něj opravdu přiteklo — ne s kapacitou nádoby.
 */
export function cilPoPrecerpani(
  cil: TankProCyklus,
  pritekloL: number,
  ted: string,
): { initial_volume_l: number; started_at: string } {
  const bezi = !!cil.started_at && !!cil.status && (STAVY_S_PIVEM as readonly string[]).includes(cil.status)
    && cil.initial_volume_l != null && Number(cil.initial_volume_l) > 0;
  if (bezi) return { initial_volume_l: Number(cil.initial_volume_l), started_at: cil.started_at! };
  return { initial_volume_l: pritekloL, started_at: ted };
}

export type UlozenyCyklus = {
  tank_id: string | null;
  initial_volume_l: number | string | null;
  kegged_volume_l: number | string | null;
  loss_l: number | string | null;
  loss_pct: number | string | null;
  started_at: string | null;
  ended_at: string;
};

/**
 * Ztráta už uloženého cyklu přepočtená i s přečerpáním.
 *
 * Cykly zavřené před opravou z 27. 9. 2026 mají v `loss_l` uloženo
 * počátek − stočeno, takže přefuk do jiného tanku v nich vypadá jako
 * ztracené pivo. Přehled ztrát i „Poslední cykly" na kartě tanku proto
 * ztrátu dopočítají znovu ze zapsaných přečerpání (stejná pravidla jako
 * `souhrnCyklu`). U cyklů zavřených po opravě vyjde totéž, co je uložené.
 * Databáze se nemění — přepočet je jen pro zobrazení.
 */
export function cyklusSPrecerpanim<T extends UlozenyCyklus>(c: T, precerpani: PrecerpaniVstup[]): T {
  if (!c.tank_id || !c.started_at) return c;
  const start = c.started_at.slice(0, 10);
  const konec = c.ended_at.slice(0, 10);
  let precerpanoL = 0;
  let priteklo = 0;
  for (const p of precerpani) {
    if (p.transfer_date <= start || p.transfer_date > konec) continue;
    if (p.from_tank_id === c.tank_id) precerpanoL -= Number(p.volume_l || 0) + Number(p.loss_l || 0);
    if (p.to_tank_id === c.tank_id) {
      precerpanoL += Number(p.volume_l || 0);
      priteklo += Number(p.volume_l || 0);
    }
  }
  if (precerpanoL === 0) return c;
  const pocatek = Number(c.initial_volume_l || 0);
  const stoceno = Number(c.kegged_volume_l || 0);
  const ztrata = Math.max(0, Math.round((pocatek + precerpanoL - stoceno) * 10) / 10);
  const zaklad = pocatek + priteklo;
  return {
    ...c,
    loss_l: ztrata,
    loss_pct: zaklad > 0 ? Math.round((ztrata / zaklad) * 1000) / 10 : 0,
    initial_volume_l: zaklad,
  };
}
