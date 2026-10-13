// 🔗 Sloučení několika objednávek téhož odběratele do jedné.
// ---------------------------------------------------------------------------
// Z provozu 13. 10. 2026: lístek „Restaurace" se načetl do tří objednávek
// (4 položky + 1 + 1) a majitel chtěl „sluč mi 3× lahve z restaurace do jedné
// objednávky". Tady je čistá logika (bez databáze): co se sloučí, kam, a kdy
// se sloučit NEMÁ — radši odmítnout než něco potichu ztratit.
//
// Sloučí se do NEJSTARŠÍ z vybraných; stejné pivo + obal se sečte, ostatní
// objednávky se pak smažou (smazObjednavky).
import { normPlaceName } from '../../supabase/functions/_shared/place-match';

export type SlucHlavicka = {
  id: string;
  place_id: string | null;
  place_name: string | null;
  order_date: string;
  delivery_day: string | null;
  delivery_date: string | null;
  note: string | null;
  status: string;
  is_prepared?: boolean | null;
  is_packaged?: boolean | null;
  is_delivered?: boolean | null;
  created_at: string;
};
export type SlucPolozka = {
  beer_id: string | null;
  beer_name: string | null;
  package_id: string | null;
  package_label: string | null;
  quantity: number;
  is_prepared?: boolean | null;
  is_bottled?: boolean | null;
};

export type NavrhSlouceni =
  | {
    ok: true;
    cilId: string;
    /** Hlavička cílové objednávky (pro replace_order_with_items). */
    hlavicka: { order_date: string; place_id: string | null; place_name: string | null; delivery_day: string | null; delivery_date: string | null; note: string | null };
    polozky: { beer_id: string | null; beer_name: string | null; package_id: string | null; package_label: string | null; quantity: number; is_prepared: false }[];
    kSmazani: string[];
    /** Věta do potvrzení: kolik objednávek, jakého odběratele, kolik položek a kusů. */
    popis: string;
  }
  | { ok: false; duvod: string };

const stejnyOdberatel = (a: SlucHlavicka, b: SlucHlavicka): boolean => {
  if (a.place_id && b.place_id) return a.place_id === b.place_id;
  return normPlaceName(a.place_name) !== '' && normPlaceName(a.place_name) === normPlaceName(b.place_name);
};

export function navrhSlouceni(objednavky: SlucHlavicka[], polozky: Record<string, SlucPolozka[]>): NavrhSlouceni {
  if (objednavky.length < 2) return { ok: false, duvod: 'Vyber aspoň dvě objednávky.' };
  const serazene = [...objednavky].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const cil = serazene[0];

  if (serazene.some((o) => !stejnyOdberatel(cil, o))) {
    return { ok: false, duvod: 'Sloučit jdou jen objednávky jednoho odběratele.' };
  }
  const rozpracovana = serazene.find((o) =>
    o.status !== 'nova' || o.is_prepared || o.is_packaged || o.is_delivered
    || (polozky[o.id] ?? []).some((p) => p.is_prepared || p.is_bottled));
  if (rozpracovana) {
    return { ok: false, duvod: 'Sloučit jdou jen nové objednávky bez označení „připraveno", „stočeno" nebo „zavezeno" — jinak by se ta označení ztratila.' };
  }
  const dny = new Set(serazene.map((o) => o.delivery_date).filter(Boolean));
  const denyVTydnu = new Set(serazene.map((o) => o.delivery_day).filter(Boolean));
  if (dny.size > 1 || denyVTydnu.size > 1) {
    return { ok: false, duvod: 'Objednávky mají různý den závozu — nejdřív nastav stejný, ať se nesloučí na špatný den.' };
  }

  const klic = (p: SlucPolozka) => p.beer_id && p.package_id
    ? `${p.beer_id}__${p.package_id}`
    : `?${normPlaceName(p.beer_name)}__${normPlaceName(p.package_label)}`;
  const sloucene = new Map<string, SlucPolozka>();
  for (const o of serazene) {
    for (const p of polozky[o.id] ?? []) {
      const k = klic(p);
      const mam = sloucene.get(k);
      if (mam) sloucene.set(k, { ...mam, quantity: Number(mam.quantity) + Number(p.quantity) });
      else sloucene.set(k, { ...p, quantity: Number(p.quantity) });
    }
  }
  const radky = [...sloucene.values()].map((p) => ({
    beer_id: p.beer_id, beer_name: p.beer_name, package_id: p.package_id, package_label: p.package_label,
    quantity: p.quantity, is_prepared: false as const,
  }));
  if (radky.length === 0) return { ok: false, duvod: 'Vybrané objednávky nemají žádné položky.' };

  const poznamky = [...new Set(serazene.map((o) => (o.note ?? '').trim()).filter(Boolean))];
  const kusu = radky.reduce((s, p) => s + p.quantity, 0);
  return {
    ok: true,
    cilId: cil.id,
    hlavicka: {
      order_date: cil.order_date,
      place_id: cil.place_id,
      place_name: cil.place_name,
      delivery_day: [...denyVTydnu][0] ?? null,
      delivery_date: [...dny][0] ?? null,
      note: poznamky.length ? poznamky.join('; ') : null,
    },
    polozky: radky,
    kSmazani: serazene.slice(1).map((o) => o.id),
    popis: `${serazene.length} objednávky ${cil.place_name ?? ''} → jedna (${radky.length} položek, ${kusu} ks)`.replace('  ', ' '),
  };
}
