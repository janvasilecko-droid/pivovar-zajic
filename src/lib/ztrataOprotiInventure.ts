// 📉 Rozdíl oproti inventuře za měsíc — jen BOKEM, do výpočtu se nepočítá.
// ---------------------------------------------------------------------------
// Majitel 26. 11. 2026: „Každý týden když dám reálný stav skladu, tak ti musí počítat s tím … Jen pak napsat
// bokem na konci měsíce rozdíl oproti inventuře, ať je vidět ztráta, ale nepočítat je, počítá se jen co je
// reálně na skladě."
//
// Napočítaný stav je pravda: Sklad i Rozbor od něj počítají dál (lib/tydenniInventura.ts → tydenniJakoInventura,
// i když vyjde nula). Rozdíl, který počítání odhalilo (napočítáno − co appka čekala), se při uložení zapíše do
// týdenní kontroly (`tydenni_inventura.rozdil`). Tady se ty rozdíly za měsíc jen SEČTOU a ukážou — nic se z nich
// nezapisuje do skladu ani do pohybů, takže to nemá jak ovlivnit žádné číslo ve výpočtech.
//
// Týden patří do měsíce podle NEDĚLE (`tyden_do`): počítá se na konci týdne, ztráta vznikla do něj.
// Řádek, jehož rozdíl se vyřešil dopsáním stáčení ('staceni'), ztráta není — chybějící výroba byla zapsaná
// a rozdíl tím zmizel.

export type ZaznamKontroly = {
  tyden_od?: string | null;
  tyden_do?: string | null;
  beer_id?: string | null;
  package_id?: string | null;
  rozdil?: number | string | null;
  vyreseno?: string | null;
};

export type ZtrataPolozky = {
  key: string;
  beer_id: string;
  package_id: string;
  beer_name: string;
  package_label: string;
  /** Součet rozdílů za měsíc: záporné = ztráta, kladné = přebytek. */
  rozdil: number;
  /** Ve kolika týdnech se rozdíl objevil. */
  tydnu: number;
};

export type ZtrataMesice = {
  /** Jen položky s nenulovým součtem, největší ztráta první. */
  radky: ZtrataPolozky[];
  /** Součet ztrát (záporné číslo, nebo 0). */
  ztrata: number;
  /** Součet přebytků (kladné číslo, nebo 0). */
  prebytek: number;
  /** Kolik týdenních kontrol z měsíce se uložilo (i těch, kde všechno sedělo). */
  kontrol: number;
};

export function ztrataOprotiInventure(
  zaznamy: ZaznamKontroly[],
  mesic: string,
  piva: { id: string; name: string }[],
  obaly: { id: string; label: string }[],
): ZtrataMesice {
  const jmenoPiva = new Map(piva.map((b) => [b.id, b.name]));
  const jmenoObalu = new Map(obaly.map((o) => [o.id, o.label]));
  const souhrn = new Map<string, ZtrataPolozky>();
  let kontrol = 0;
  for (const z of zaznamy) {
    if (String(z.tyden_do ?? '').slice(0, 7) !== mesic || !z.beer_id || !z.package_id) continue;
    kontrol += 1;
    if (z.vyreseno === 'staceni') continue;
    const rozdil = Number(z.rozdil);
    if (!Number.isFinite(rozdil) || rozdil === 0) continue;
    const key = `${z.beer_id}__${z.package_id}`;
    const r = souhrn.get(key) ?? {
      key, beer_id: z.beer_id, package_id: z.package_id,
      beer_name: jmenoPiva.get(z.beer_id) ?? 'Neznámé pivo',
      package_label: jmenoObalu.get(z.package_id) ?? '',
      rozdil: 0, tydnu: 0,
    };
    r.rozdil += rozdil;
    r.tydnu += 1;
    souhrn.set(key, r);
  }
  const radky = [...souhrn.values()]
    .filter((r) => r.rozdil !== 0)
    .sort((a, b) => a.rozdil - b.rozdil || a.beer_name.localeCompare(b.beer_name, 'cs') || a.package_label.localeCompare(b.package_label, 'cs', { numeric: true }));
  return {
    radky,
    ztrata: radky.filter((r) => r.rozdil < 0).reduce((s, r) => s + r.rozdil, 0),
    prebytek: radky.filter((r) => r.rozdil > 0).reduce((s, r) => s + r.rozdil, 0),
    kontrol,
  };
}
