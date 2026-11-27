// 📅 Předem objednané — objednávky, které přišly s týdenním předstihem a vozí se (tedy stáčí) tento týden.
// ---------------------------------------------------------------------------
// 26. 11. 2026 (majitel ke zprávě „Na 18.12…“): „Je tam objednávka na určitý datum, aplikace to musí
// nastavit ten datum a upozornit v pondělí týden kdy to má být stočený."
//
// Plán stáčení (lib/keggingPlan.ts) takovou objednávku do správného týdne zařadí sám, jenže jako obyčejné
// číslo mezi ostatními — a objednávka z konce listopadu na 18. 12. je v tu chvíli tři týdny stará, nikdo
// už na ni nemyslí. Tohle je výslovné upozornění: od pondělí týdne, ve kterém se vozí, ukáže kdo, kdy a co.
// Bez vlastního zápisu do databáze — počítá se z objednávek, takže zrušená nebo přehozená objednávka
// z upozornění sama zmizí.
import { datumProDenVTydnu, dayKeyFromISO } from './keggingPlan';
import { DAYS } from './shared';
import { jeVyrizena } from './stavyObjednavek';
import { jePredemObjednana, PREDSTIH_DNI } from './predemDny';

// Pravidlo „předem“ (kolik dní) žije v lib/predemDny.ts — používá ho i hlídání malých sudů.
export { PREDSTIH_DNI };

export type PredemObjednana = {
  id: string;
  misto: string;
  /** YYYY-MM-DD */
  datum: string;
  /** po … ne */
  den: string;
  polozky: { beer_id: string | null; package_id: string | null; quantity: number }[];
};

type Objednavka = {
  id: string;
  order_date?: string | null;
  delivery_date?: string | null;
  place_name?: string | null;
  status?: string | null;
  is_delivered?: boolean | null;
};
type Polozka = { order_id: string; beer_id: string | null; package_id: string | null; quantity: number };

/**
 * Objednávky na tento týden (pondělí až neděle týdne, do kterého spadá `dnes`), které přišly nejméně
 * `PREDSTIH_DNI` dní před dnem závozu a ještě nejsou zavezené ani stornované. Podle data závozu, pak
 * podle jména místa.
 */
export function predemObjednane(
  objednavky: Objednavka[],
  polozky: Polozka[],
  dnes: string,
): PredemObjednana[] {
  const pondeli = datumProDenVTydnu('po', dnes);
  const nedele = datumProDenVTydnu('ne', dnes);
  if (!pondeli || !nedele) return [];
  const vysledek: PredemObjednana[] = [];
  for (const o of objednavky) {
    const datum = (o.delivery_date ?? '').slice(0, 10);
    if (datum < pondeli || datum > nedele) continue;
    if (!jePredemObjednana(o.order_date, datum)) continue;
    if (o.status === 'storno' || o.is_delivered || jeVyrizena(o.status)) continue;
    vysledek.push({
      id: o.id,
      misto: (o.place_name ?? '').trim() || 'Bez názvu',
      datum,
      den: dayKeyFromISO(datum),
      polozky: polozky
        .filter((p) => p.order_id === o.id)
        .map((p) => ({ beer_id: p.beer_id, package_id: p.package_id, quantity: Number(p.quantity) || 0 })),
    });
  }
  return vysledek.sort((a, b) => a.datum.localeCompare(b.datum) || a.misto.localeCompare(b.misto, 'cs'));
}

export type RadekUpozorneni = {
  id: string;
  misto: string;
  /** „pá 18. 12." */
  kdy: string;
  /** „1× 20l 12° Světlá, 2× 50l Jantar" */
  co: string;
};

/**
 * Řádky upozornění: kdo, kdy a co. Jména piva a obalu doplní volající (zná katalog), ať tady nevisí na
 * dotazech do databáze.
 */
export function radkyUpozorneni(
  objednavky: PredemObjednana[],
  pivo: (beerId: string | null) => string,
  obal: (packageId: string | null) => string,
): RadekUpozorneni[] {
  return objednavky.map((o) => {
    const [, mesic, den] = o.datum.split('-').map(Number);
    const zkratka = (DAYS.find((d) => d.v === o.den)?.label ?? o.den).toLowerCase();
    const co = o.polozky
      .filter((p) => p.quantity > 0)
      .map((p) => `${p.quantity}× ${obal(p.package_id)} ${pivo(p.beer_id)}`.replace(/\s+/g, ' ').trim())
      .join(', ');
    return { id: o.id, misto: o.misto, kdy: `${zkratka} ${den}. ${mesic}.`, co: co || 'bez položek' };
  });
}
