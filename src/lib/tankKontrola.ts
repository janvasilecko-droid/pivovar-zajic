// 🛢️ Kontrola objemu tanku — sedí evidovaný stav s tím, co se zapsalo?
// ---------------------------------------------------------------------------
// Tanky nejsou součástí skladové knihy (ta počítá kusy, tanky litry). Objem
// se z tanku odečítá zvlášť, RPC voláním `adjust_tank_volume`, a to AŽ POTOM,
// co se uloží řádek stáčení. Když ten druhý krok selže, Kegging.tsx to sice
// pozná a napíše na obrazovku „Stáčení uloženo, ale objem tanku se nepodařilo
// snížit“ — jenže tím to končí. Stáčení je uložené, tank zůstal plný a od té
// chvíle je mimo, aniž by se to kdy znovu připomnělo.
//
// Tenhle modul dopočítá, kolik v tanku MÁ být podle zapsaných pohybů, a
// porovná to s evidovanou hodnotou. Rozdíl se pak dá ukázat ve Sklepě stejně,
// jako Sklad ukazuje „nesedí evidence“ — chyba se přihlásí sama místo aby
// čekala na někoho, kdo si všimne.

/** Kolik litrů se v tanku smí lišit, než to začneme hlásit. */
export const TOLERANCE_L = 1;

export type TankVstup = {
  id: string;
  label: string;
  /** Objem, se kterým cyklus začal. */
  initial_volume_l: number | null;
  /** Evidovaný stav, který udržuje adjust_tank_volume. */
  current_volume_l: number;
  /** Začátek cyklu (YYYY-MM-DD…) — starší pohyby patří předchozímu cyklu. */
  started_at: string | null;
  /** Stav tanku — kontroluje se jen tank s živým cyklem, viz JE_ZIVY_CYKLUS. */
  status?: string | null;
};

/**
 * Stavy, ve kterých má smysl objem kontrolovat.
 *
 * Po ukončení cyklu (`empty`, `cleaning`, `sanitizing`, `rinsing`) se zbytek
 * piva odepíše a `current_volume_l` spadne na nulu, zatímco `initial_volume_l`
 * drží pořád hodnotu toho skončeného cyklu. Porovnávat tyhle dvě čísla by u
 * každého vymytého tanku hlásilo obrovský schodek — a upozornění, které svítí
 * pořád, si za týden nikdo nevšimne.
 */
export const ZIVE_STAVY = ['active', 'emptying'];

export type StaceniVstup = {
  cellar_tank_id: string | null;
  entry_date: string;
  /** Litry vzaté z tanku = počet sudů × objem sudu. */
  source_volume_l: number | null;
  /** Ztráta zapsaná u stáčení (zbytek v hadicích, propláchnutí…). */
  loss_l?: number | null;
};

export type PrecerpaniVstup = {
  transfer_date: string;
  from_tank_id: string | null;
  to_tank_id: string | null;
  volume_l: number;
  loss_l?: number | null;
};

export type TankRozdil = {
  id: string;
  label: string;
  /** Co je zapsané v tanku. */
  evidovanoL: number;
  /** Co v něm podle zapsaných pohybů má být. */
  dopocitanoL: number;
  /** evidováno − dopočítáno. Kladné = v tanku je „navíc“, záporné = chybí. */
  rozdilL: number;
  /** Přesahuje rozdíl toleranci? */
  nesedi: boolean;
  /** Litry, které z tanku odešly stáčením (včetně ztrát). */
  vystocenoL: number;
  /** Litry z přečerpávání: kladné přiteklo, záporné odteklo. */
  precerpanoL: number;
};

/** Patří pohyb do právě probíhajícího cyklu tanku? */
function vCyklu(datum: string, startCyklu: string | null): boolean {
  if (!startCyklu) return true;
  return datum >= startCyklu.slice(0, 10);
}

/**
 * Přečerpání, kterým se tank naplnil, se do výpočtu NEPOČÍTÁ.
 *
 * Naplnění se zapisuje dvakrát: jednou jako `initial_volume_l` na tanku a
 * jednou jako přečerpání do tanku k témuž dni. Kdyby se počítalo obojí, vyšel
 * by dvojnásobek — přesně to se stalo při prvním měření na ostrých datech,
 * kde Tank 8 vycházel na 15 000 l místo 7 500.
 *
 * Cena za to: přečerpání VEN provedené v den zahájení cyklu se přehlédne.
 * To je vzácné a lepší než hlásit schodek u každého právě naplněného tanku.
 */
function poZacatkuCyklu(datum: string, startCyklu: string | null): boolean {
  if (!startCyklu) return true;
  return datum > startCyklu.slice(0, 10);
}

/**
 * Dopočítá objem každého tanku ze zapsaných pohybů a porovná s evidencí.
 *
 * Tanky bez zadaného počátečního objemu se přeskakují — u nich není od čeho
 * počítat a hlásit u nich rozdíl by znamenalo hlásit ho pořád.
 */
export function zkontrolujTanky(
  tanky: TankVstup[],
  staceni: StaceniVstup[],
  precerpani: PrecerpaniVstup[] = [],
  toleranceL: number = TOLERANCE_L,
): TankRozdil[] {
  return tanky
    .filter((t) => t.initial_volume_l != null && Number(t.initial_volume_l) > 0)
    .filter((t) => t.status == null || ZIVE_STAVY.includes(t.status))
    .map((t) => {
      const start = t.started_at;

      let vystocenoL = 0;
      for (const s of staceni) {
        if (s.cellar_tank_id !== t.id) continue;
        if (!vCyklu(s.entry_date, start)) continue;
        vystocenoL += Number(s.source_volume_l || 0) + Number(s.loss_l || 0);
      }

      let precerpanoL = 0;
      for (const p of precerpani) {
        if (!poZacatkuCyklu(p.transfer_date, start)) continue;
        // Z tanku odchází objem i ztráta při přečerpání; do tanku přiteče
        // jen čistý objem — ztráta se cestou nikam nedostane.
        if (p.from_tank_id === t.id) precerpanoL -= Number(p.volume_l || 0) + Number(p.loss_l || 0);
        if (p.to_tank_id === t.id) precerpanoL += Number(p.volume_l || 0);
      }

      const dopocitanoL = Math.round((Number(t.initial_volume_l) - vystocenoL + precerpanoL) * 10) / 10;
      const evidovanoL = Math.round(Number(t.current_volume_l || 0) * 10) / 10;
      const rozdilL = Math.round((evidovanoL - dopocitanoL) * 10) / 10;

      return {
        id: t.id,
        label: t.label,
        evidovanoL,
        dopocitanoL,
        rozdilL,
        nesedi: Math.abs(rozdilL) > toleranceL,
        vystocenoL: Math.round(vystocenoL * 10) / 10,
        precerpanoL: Math.round(precerpanoL * 10) / 10,
      };
    });
}

/** Jen tanky, které nesedí — pro upozornění nad seznamem. */
export function nesedici(rozdily: TankRozdil[]): TankRozdil[] {
  return rozdily.filter((r) => r.nesedi);
}
