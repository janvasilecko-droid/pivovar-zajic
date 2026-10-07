// ✂️ Řezání — stáčení piva smíchaného ze DVOU tanků v daném poměru.
// ---------------------------------------------------------------------------
// Zadání 7. 10. 2026: „Přidej do stáčení záložku řezání, kde můžu vybrat
// tanky a pivo, poměr, když řežu pivo ze 2 tanků."
//
// Zapisuje se stejně jako Jantar (lib/jantar.ts), jen s vybranými tanky a
// poměrem místo pevných 80/20:
//   • řádek stáčení patří k tanku A a nese jeho podíl litrů (tank ho
//     započítá jako stočené — % vystočeno, ztráty),
//   • podíl tanku B se z něj odečte jako přetočení „do řezu"
//     (cellar_transfers bez cílového tanku; tank ho počítá jako odtok).
//     Přetočení nese značku `[rez:<id řádku>]`, podle které ho úprava
//     i smazání řádku stáčení najdou (lib/jantarZapis.ts).
// Sklad dostane sudy vybraného piva — jako u každého jiného stáčení.
//
// Tady jsou jen pravidla (testy bez databáze); zápis je v lib/jantarZapis.ts.

/** Značka v poznámce přetočení, která ho váže na řádek stáčení. */
export function znackaRezu(keggingId: string): string {
  return `[rez:${keggingId}]`;
}

export function jeZnackaRezu(note: string | null | undefined): boolean {
  return /\[rez:[^\]]+\]/.test(note ?? '');
}

const naDesetiny = (n: number) => Math.round(n * 10) / 10;

/**
 * Rozdělí litry na část z tanku A a z tanku B (podíl A v procentech).
 * Součet sedí přesně — B je dopočet, ne další zaokrouhlení.
 */
export function rozdelRez(litry: number, podilAProcent: number): { aL: number; bL: number } {
  const aL = naDesetiny(litry * podilAProcent / 100);
  return { aL, bL: naDesetiny(litry - aL) };
}

/** Tank tak, jak ho řezání potřebuje. */
export type TankKRezu = {
  id: string;
  label: string;
  status?: string | null;
  current_volume_l?: number | string | null;
  current_beer_id?: string | null;
  current_beer_name?: string | null;
};

/** Z jakých tanků jde řezat: v provozu a něco v nich je. */
export function tankyKRezu<T extends TankKRezu>(tanky: T[]): T[] {
  return tanky
    .filter((t) => (t.status === 'active' || t.status === 'emptying') && Number(t.current_volume_l ?? 0) > 0)
    .sort((a, b) => a.label.localeCompare(b.label, 'cs', { numeric: true }));
}

export type RadekRezu = { pocet: number; objemL: number };

/** Kolik litrů se celkem stáčí. */
export function litryRezu(radky: RadekRezu[]): number {
  return naDesetiny(radky.reduce((s, r) => s + (r.pocet > 0 ? r.pocet * r.objemL : 0), 0));
}

/**
 * Co brání uložení řezu. Prázdný seznam = jde uložit.
 * Přečerpaný tank se NEukládá bez tanku (jako běžné stáčení), ale vůbec —
 * u řezu by jinak jedna půlka z tanku odešla a druhá ne.
 */
export function problemyRezu(p: {
  pivoId: string;
  tankA?: TankKRezu;
  tankB?: TankKRezu;
  podilA: number;
  radky: RadekRezu[];
}): string[] {
  const chyby: string[] = [];
  if (!p.pivoId) chyby.push('Vyber pivo, které se stáčí.');
  if (!p.tankA || !p.tankB) chyby.push('Vyber oba tanky.');
  else if (p.tankA.id === p.tankB.id) chyby.push('Tank A a tank B musí být různé.');
  if (!(p.podilA >= 1 && p.podilA <= 99)) chyby.push('Poměr musí být mezi 1 a 99 %.');
  const litry = litryRezu(p.radky);
  if (!(litry > 0)) chyby.push('Zadej, kolik sudů se stočilo.');
  if (chyby.length) return chyby;
  const { aL, bL } = rozdelRez(litry, p.podilA);
  for (const [tank, chce] of [[p.tankA!, aL], [p.tankB!, bL]] as const) {
    const vTanku = Number(tank.current_volume_l ?? 0);
    // Tolerance 1 l jako u Jantaru (lib/jantarZapis.ts).
    if (chce > vTanku + 1) chyby.push(`${tank.label} by se přečerpal (v tanku ${Math.round(vTanku)} l, chce se ${chce} l).`);
  }
  return chyby;
}

/** Popis do poznámky řádku stáčení — je pak vidět i v přehledu. */
export function popisRezu(tankA: string, tankB: string, podilA: number): string {
  return `Řez: ${tankA} ${podilA} % + ${tankB} ${100 - podilA} %`;
}

/**
 * Úprava řádku řezu (jiné množství nebo obal): podíl tanku B zůstává,
 * jaký byl při zápisu — spočítá se z původního přetočení.
 * Vrací null, když se z původního řádku poměr zjistit nedá.
 */
export function prepocetRezu(p: {
  staryPocet: number;
  staryObjemL: number;
  prelitoBL: number;
  novyPocet: number;
  novyObjemL: number;
}): { aL: number; bL: number } | null {
  const stareLitry = p.staryPocet * p.staryObjemL;
  if (!(stareLitry > 0)) return null;
  const podilB = p.prelitoBL / stareLitry;
  const noveLitry = Math.max(0, p.novyPocet * p.novyObjemL);
  const bL = naDesetiny(noveLitry * podilB);
  return { aL: naDesetiny(noveLitry - bL), bL };
}
