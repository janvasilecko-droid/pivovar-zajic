// 🛢️ Ze kterého tanku se stáčí — a co když z žádného.
// ---------------------------------------------------------------------------
// Pravidlo bylo rozepsané na dvou místech v Kegging.tsx (dlaždice piv a
// ukládání) a znělo: „vezmi ručně vybraný tank, jinak největší tank s tímhle
// pivem, na kterém je ZAHÁJENÉ STÁČENÍ". Když žádný takový není, řádek se
// uložil TIŠE bez tanku a bez odečtu objemu ze sklepa.
//
// Tím se ztratilo číslo tanku u 82 ze 198 zápisů stáčení: červenec a začátek
// srpna 2026 se zapisovaly zpětně 2.–9. 8., tedy dřív, než sklep v appce vůbec
// existoval (všechny tanky vznikly 9. 8. v 16:13–16:16), a u dalších dnů
// nebylo na žádném tanku s daným pivem zahájené stáčení. Tytéž zápisy pak
// z tanku neodečetly objem — odtud i schodek 2 000 l na Spilce 1 a 5 400 l
// na Tanku 6.
//
// Pravidlo zůstává stejné, jen na jednom místě a s testem. Kdo ho chce
// obejít, musí to teď potvrdit.

export type TankKOdectu = {
  id: string;
  current_beer_id?: string | null;
  kegging_active?: boolean | null;
  status?: string | null;
  current_volume_l?: number | string | null;
};

/** Stáčí se jen z tanku, který se vyprazdňuje nebo je v provozu. */
function vProvozu(t: TankKOdectu): boolean {
  return t.status === 'active' || t.status === 'emptying';
}

/**
 * Tanky, ze kterých se u daného piva SMÍ odečítat: mají to pivo, jsou
 * v provozu a je na nich zahájené stáčení. „Zahájit stáčení" ve Sklepě pouští
 * na jedno pivo vždycky jen jeden, ale ve starších datech jich může být víc —
 * pak řádek nechá vybrat.
 */
export function tankyProPivo<T extends TankKOdectu>(tanky: T[], beerId: string): T[] {
  if (!beerId) return [];
  return tanky.filter((t) => vProvozu(t) && t.kegging_active === true && t.current_beer_id === beerId);
}

/** Největší objem — výchozí volba, když je tanků se stejným pivem víc. */
export function nejvetsiTank<T extends TankKOdectu>(tanky: T[]): T | undefined {
  if (tanky.length === 0) return undefined;
  return tanky.reduce((nej, t) => (Number(t.current_volume_l ?? 0) > Number(nej.current_volume_l ?? 0) ? t : nej));
}

/**
 * Ze kterého tanku půjde tenhle řádek. Přednost má ručně vybraný, ale jen
 * pokud z něj jde odečítat — ručně vybraný tank, na kterém se mezitím stáčení
 * ukončilo, by jinak propadl a řádek by se uložil bez odečtu.
 */
export function tankRadku<T extends TankKOdectu>(
  tanky: T[],
  beerId: string,
  rucneVybrany?: string | null,
): T | undefined {
  const moznosti = tankyProPivo(tanky, beerId);
  const rucni = rucneVybrany ? moznosti.find((t) => t.id === rucneVybrany) : undefined;
  return rucni ?? nejvetsiTank(moznosti);
}

/** Řádky, které by se uložily bez tanku — tedy i bez odečtu ze sklepa. */
export function radkyBezTanku<R extends { beerId: string; qty: string | number }, T extends TankKOdectu>(
  radky: R[],
  tanky: T[],
  tankRadkuId: (r: R) => string | null | undefined,
): R[] {
  return radky.filter((r) => Number(r.qty) > 0 && !tankRadku(tanky, r.beerId, tankRadkuId(r)));
}
