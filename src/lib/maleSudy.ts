// 🛢️ Malé sudy (KEG 20/15/10 l) — kolik jich máme a kolik chtějí objednávky.
// ---------------------------------------------------------------------------
// Z provozu 29. 9. 2026: „pro stáčení sudů připrav záložku malé sudy, tam
// naklikám počet malých sudů 20, 15, 10, a pak mi v objednávkách hlídej, aby
// když mám 3× 15, tak mi označ a hlídej, že můžu celkem použít jen 3× 15,
// ne třeba 6× 15."
//
// Počet zadává stáčeč na obrazovce KEG (záložka Malé sudy, tabulka
// male_sudy). Tady se jen porovná s OTEVŘENÝMI objednávkami (ne storno,
// nezavezené, nevyřízené): sudy se rozdělí po objednávkách od nejbližšího
// dovozu, a co se do počtu nevejde, se označí jako „nad počet". Obal, pro
// který nikdo počet nezadal, se nehlídá — appka by jinak hlásila nedostatek
// všude, kde se jen nic nevyplnilo.
import { jeVyrizena } from './stavyObjednavek';

export type ObalProSudy = { id: string; kind?: string | null; volume_l?: number | string | null; label?: string | null };

/** Malý sud = KEG pod 30 l (20, 15, 10 l). */
export function jeMalySud(obal: ObalProSudy | undefined): boolean {
  if (!obal) return false;
  const objem = Number(obal.volume_l ?? 0);
  return obal.kind === 'keg' && objem > 0 && objem < 30;
}

export type ObjednavkaProSudy = {
  id: string;
  status?: string | null;
  is_delivered?: boolean | null;
  delivery_date?: string | null;
  order_date?: string | null;
  created_at?: string | null;
};
export type PolozkaProSudy = { id: string; order_id: string; package_id: string | null; quantity: number | string; beer_id?: string | null };

/** Objednávka, na kterou se sudy teprve chystají. */
export function jeOtevrena(o: ObjednavkaProSudy): boolean {
  return o.status !== 'storno' && !o.is_delivered && !jeVyrizena(o.status);
}

/**
 * Chystá se na ni sud TEĎ — závoz dnes nebo později. Z provozu 29. 9. 2026:
 * „v malých sudech mi to píše, že chybí přes 100 sudů" — počítaly se i staré
 * objednávky z minulých týdnů, které nikdo neoznačil jako zavezené. Ty jsou
 * dávno pryč a sudy nedrží. Bez data závozu se bere týden od objednání.
 */
export function chystaSeOd(o: ObjednavkaProSudy, dnes: string): boolean {
  if (o.delivery_date) return o.delivery_date.slice(0, 10) >= dnes;
  const objednano = (o.order_date ?? o.created_at ?? '').slice(0, 10);
  if (!objednano) return false;
  const tydenZpet = new Date(dnes + 'T00:00:00Z');
  tydenZpet.setUTCDate(tydenZpet.getUTCDate() - 7);
  return objednano >= tydenZpet.toISOString().slice(0, 10);
}

export type SouhrnMalychSudu = { package_id: string; mame: number; objednano: number; nad: number };

export type VysledekMalychSudu = {
  /** Jen obaly s naklikaným počtem. */
  souhrn: SouhrnMalychSudu[];
  /** Kolik kusů položky je nad počet (id položky → kusy). Chybí = v pořádku. */
  nadPoPolozce: Map<string, number>;
  /** Každá hlídaná položka: kolik kusů má sud a kolik ne (zelená/oranžová/červená). */
  poPolozce: Map<string, { kryto: number; chybi: number }>;
};

/**
 * Rozdělí malé sudy po otevřených objednávkách od nejbližšího dovozu
 * (bez data na konec). Co se nevejde, je „nad počet".
 */
export function hlidejMaleSudy(
  zasoba: Record<string, number>,
  objednavky: ObjednavkaProSudy[],
  polozky: PolozkaProSudy[],
  /** Síla piva podle beer_id — v rámci objednávky dostane sud nejdřív nejsilnější. */
  silaPodleId?: Map<string, number>,
  /** Dnešek (YYYY-MM-DD) — starší objednávky se nepočítají (chystaSeOd). */
  dnes?: string,
): VysledekMalychSudu {
  const otevrene = objednavky.filter((o) => jeOtevrena(o) && (!dnes || chystaSeOd(o, dnes)));
  const poradi = new Map(
    [...otevrene]
      .sort((a, b) => {
        const da = a.delivery_date ?? '9999-12-31';
        const db = b.delivery_date ?? '9999-12-31';
        if (da !== db) return da < db ? -1 : 1;
        const ca = a.created_at ?? a.order_date ?? '';
        const cb = b.created_at ?? b.order_date ?? '';
        if (ca !== cb) return ca < cb ? -1 : 1;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      })
      .map((o, i) => [o.id, i]),
  );

  const hlidane = polozky
    .filter((p) => p.package_id && zasoba[p.package_id] != null && poradi.has(p.order_id) && Number(p.quantity) > 0)
    .sort((a, b) => poradi.get(a.order_id)! - poradi.get(b.order_id)!
      || silaZ(silaPodleId, b.beer_id) - silaZ(silaPodleId, a.beer_id)
      || (a.id < b.id ? -1 : 1));

  const zbyva: Record<string, number> = { ...zasoba };
  const objednano: Record<string, number> = {};
  const nadPoPolozce = new Map<string, number>();
  const poPolozce = new Map<string, { kryto: number; chybi: number }>();
  for (const p of hlidane) {
    const obal = p.package_id!;
    const kusu = Number(p.quantity);
    objednano[obal] = (objednano[obal] ?? 0) + kusu;
    const vejde = Math.max(0, Math.min(kusu, zbyva[obal]));
    zbyva[obal] -= vejde;
    if (kusu > vejde) nadPoPolozce.set(p.id, kusu - vejde);
    poPolozce.set(p.id, { kryto: vejde, chybi: kusu - vejde });
  }

  const souhrn = Object.entries(zasoba).map(([package_id, mame]) => {
    const obj = objednano[package_id] ?? 0;
    return { package_id, mame, objednano: obj, nad: Math.max(0, obj - mame) };
  });
  return { souhrn, nadPoPolozce, poPolozce };
}

/**
 * Kolik malých sudů daného obalu smí ještě dostat JEDNA objednávka — pro
 * formulář zadání a úpravy (29. 9. 2026: „v objednávce Maneo chci vidět, na
 * kolik sudů mě to pustí, na co není sud, udělej červeně").
 *
 * `uzVTetoObjednavce` = kolik kusů tohoto obalu už objednávka měla před
 * úpravou (ty jsou v `objednano` započítané a uvolní se). Vrací null, když
 * se obal nehlídá.
 */
export function volneProObjednavku(
  souhrn: SouhrnMalychSudu[],
  packageId: string | null | undefined,
  uzVTetoObjednavce = 0,
): number | null {
  if (!packageId) return null;
  const s = souhrn.find((x) => x.package_id === packageId);
  if (!s) return null;
  return s.mame - (s.objednano - uzVTetoObjednavce);
}

function silaZ(mapa: Map<string, number> | undefined, beerId: string | null | undefined): number {
  return (beerId && mapa?.get(beerId)) || 0;
}

/** Síla piva ve stupních — z `degree` („12", „12°", „11,5"), jinak z názvu („12 Světlý"). */
export function silaPiva(beer: { degree?: string | null; name?: string | null } | null | undefined): number {
  for (const zdroj of [beer?.degree, beer?.name]) {
    const m = String(zdroj ?? '').match(/(\d+(?:[.,]\d+)?)/);
    if (m) return Number(m[1].replace(',', '.'));
  }
  return 0;
}

export type RadekSudu = { klic: string; pkgId: string | null | undefined; qty: number; sila: number };
export type PrideleniRadku = { kryto: number; chybi: number };

/**
 * Rozdělí volné malé sudy po řádcích JEDNÉ objednávky (29. 9. 2026: „má to
 * vzít od nejsilnějších a přiřadit prázdné malé sudy — mám 1× 20 a 2× 15,
 * je tam 2× 20 12° → částečně, řádek oranžový a pod tím −1× 20; 2× 15
 * normálně; zbytek malých červeně, protože pro ně nejsou sudy; 30 l a PET
 * normálně").
 *
 * V každém obalu dostanou sudy řádky od nejsilnějšího piva. Řádky s
 * nehlídaným obalem (velké sudy, lahve) ve výsledku nejsou.
 */
export function rozdelMaleSudyVObjednavce(
  souhrn: SouhrnMalychSudu[],
  radky: RadekSudu[],
  uzVTetoObjednavce: (pkgId: string) => number = () => 0,
): Map<string, PrideleniRadku> {
  const vysledek = new Map<string, PrideleniRadku>();
  const zbyva = new Map<string, number>();
  const serazene = radky
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.sila - a.r.sila || a.i - b.i);
  for (const { r } of serazene) {
    if (!r.pkgId || !(r.qty > 0)) continue;
    if (!zbyva.has(r.pkgId)) {
      const volne = volneProObjednavku(souhrn, r.pkgId, uzVTetoObjednavce(r.pkgId));
      if (volne == null) continue;
      zbyva.set(r.pkgId, Math.max(0, volne));
    }
    const mam = zbyva.get(r.pkgId)!;
    const kryto = Math.min(mam, r.qty);
    zbyva.set(r.pkgId, mam - kryto);
    vysledek.set(r.klic, { kryto, chybi: r.qty - kryto });
  }
  return vysledek;
}
