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
export type PolozkaProSudy = { id: string; order_id: string; package_id: string | null; quantity: number | string };

/** Objednávka, na kterou se sudy teprve chystají. */
export function jeOtevrena(o: ObjednavkaProSudy): boolean {
  return o.status !== 'storno' && !o.is_delivered && !jeVyrizena(o.status);
}

export type SouhrnMalychSudu = { package_id: string; mame: number; objednano: number; nad: number };

export type VysledekMalychSudu = {
  /** Jen obaly s naklikaným počtem. */
  souhrn: SouhrnMalychSudu[];
  /** Kolik kusů položky je nad počet (id položky → kusy). Chybí = v pořádku. */
  nadPoPolozce: Map<string, number>;
};

/**
 * Rozdělí malé sudy po otevřených objednávkách od nejbližšího dovozu
 * (bez data na konec). Co se nevejde, je „nad počet".
 */
export function hlidejMaleSudy(
  zasoba: Record<string, number>,
  objednavky: ObjednavkaProSudy[],
  polozky: PolozkaProSudy[],
): VysledekMalychSudu {
  const otevrene = objednavky.filter(jeOtevrena);
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
    .sort((a, b) => poradi.get(a.order_id)! - poradi.get(b.order_id)! || (a.id < b.id ? -1 : 1));

  const zbyva: Record<string, number> = { ...zasoba };
  const objednano: Record<string, number> = {};
  const nadPoPolozce = new Map<string, number>();
  for (const p of hlidane) {
    const obal = p.package_id!;
    const kusu = Number(p.quantity);
    objednano[obal] = (objednano[obal] ?? 0) + kusu;
    const vejde = Math.max(0, Math.min(kusu, zbyva[obal]));
    zbyva[obal] -= vejde;
    if (kusu > vejde) nadPoPolozce.set(p.id, kusu - vejde);
  }

  const souhrn = Object.entries(zasoba).map(([package_id, mame]) => {
    const obj = objednano[package_id] ?? 0;
    return { package_id, mame, objednano: obj, nad: Math.max(0, obj - mame) };
  });
  return { souhrn, nadPoPolozce };
}
