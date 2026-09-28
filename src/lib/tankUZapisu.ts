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

/** Tank, ze kterého by stáčení vzalo víc, než v něm je. */
export type PrecerpanyTank = { tankId: string; label: string; vTankuL: number; chceL: number };

/**
 * Přečerpaný tank: stáčení by z něj vzalo víc piva, než v tanku je.
 *
 * Zadání 28. 9. 2026: „pokud se přečerpá tank, jen na to upozorni a stáčení
 * neodečítej z žádného tanku, dej k tankům záložku, kam se to bude psát,
 * a pak můžu ručně přidat to stáčení k nějakému tanku."
 *
 * Dřív se odečet provedl stejně — databáze stav tanku zastavila na nule
 * (adjust_tank_volume: GREATEST(…, 0)), ale řádek stáčení nesl celé litry,
 * takže kontrola hned hlásila „nesedí objem". Teď se řádky z takového tanku
 * uloží BEZ tanku a bez odečtu; najdou se ve Sklepě na záložce „Stáčení bez
 * tanku", kde se dají přiřadit ručně.
 *
 * Řádky jednoho uložení se sčítají po tancích (dva řádky po 40 sudech
 * z tanku s 3 000 l ho přečerpají, i když každý zvlášť by se vešel).
 */
export function odpojPrecerpane<
  R extends { cellar_tank_id: string | null; source_volume_l: number | null },
  T extends TankKOdectu & { label?: string },
>(radky: R[], tanky: T[], toleranceL = 1): { radky: R[]; precerpane: PrecerpanyTank[] } {
  const chce = new Map<string, number>();
  for (const r of radky) {
    if (r.cellar_tank_id && r.source_volume_l) {
      chce.set(r.cellar_tank_id, (chce.get(r.cellar_tank_id) ?? 0) + Number(r.source_volume_l));
    }
  }
  const precerpane: PrecerpanyTank[] = [];
  for (const [tankId, chceL] of chce) {
    const t = tanky.find((x) => x.id === tankId);
    const vTankuL = Number(t?.current_volume_l ?? 0);
    if (chceL > vTankuL + toleranceL) precerpane.push({ tankId, label: t?.label ?? 'tank', vTankuL, chceL });
  }
  if (precerpane.length === 0) return { radky, precerpane };
  const odpojit = new Set(precerpane.map((p) => p.tankId));
  return {
    radky: radky.map((r) => (r.cellar_tank_id && odpojit.has(r.cellar_tank_id)
      ? { ...r, cellar_tank_id: null, source_volume_l: null }
      : r)),
    precerpane,
  };
}
