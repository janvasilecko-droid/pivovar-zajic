// 🍺 Kolik piva z tanku je potřeba stočit na objednávky vybraného týdne.
// ---------------------------------------------------------------------------
// Zadání 27. 9. 2026: „jak to, že je tam na tento týden objednáno a ještě
// zbývá — vše je stočeno, sklad sedí, inventura je před uzavřením."
//
// Dřív se počítalo objednáno − stočeno TENTO TÝDEN. Jenže objednávky se
// vozí i ze sudů stočených minulý týden (ze skladu) — ty se do „stočeno
// tento týden" nepočítaly, a karta tanku tak hlásila „zbývá stočit", i když
// bylo všechno dávno připravené.
//
// Teď se počítá jako všude jinde v appce (Sklad, Potřeby stáčení):
//   • objednáno   – všechny objednávky týdne (bez storna), pro přehled
//   • čeká        – položky, které ještě neodjely (nemají odpočet závozu;
//                   odpočet se zapisuje v den závozu, lib/stockLedger)
//   • zbývá stočit – pro každé pivo × obal: max(0, čeká − volně skladem),
//                   kde volně skladem = sklad teď − neodjeté objednávky
//                   dřívějších týdnů (ty dostanou sudy ze skladu první)
// Sklad teď už zavezené položky odečtené má, takže se nic nepočítá dvakrát.

export type ObjednavkaTydne = { id: string; order_date: string; delivery_date: string | null; status: string };
export type PolozkaObjednavky = { id?: string; order_id: string; beer_id: string | null; package_id: string | null; quantity: number };
export type ObalProVypocet = { id: string; kind: string; volume_l: number | null };
export type PivoProVypocet = { id: string; name: string };

export type ObjednavkyPiva = {
  /** Všechny objednávky týdne v hl. */
  objednanoHl: number;
  /** Co ještě neodjelo, v hl. */
  cekaHl: number;
  /** Co z toho nepokryje sklad — tohle se musí stočit z tanku, v hl. */
  zbyvaHl: number;
};

/** Lahve se stáčejí z tanku navíc s rezervou 50 l (zadání sládka). */
const REZERVA_LAHVE_L = 50;

export function objednavkyZTanku(vstup: {
  objednavky: ObjednavkaTydne[];
  polozky: PolozkaObjednavky[];
  obaly: ObalProVypocet[];
  piva: PivoProVypocet[];
  /** Klíč týdne `RRRR-TT` (isoWeekKey). */
  tyden: string;
  /** Dnešní týden — neodjeté objednávky starších týdnů se jako rezervace
   *  skladu neberou (odpočet závozu je u nich už zapsaný, nebo jde o
   *  zapomenutou objednávku, která sudy fyzicky nepotřebuje). */
  tydenDnes: string;
  tydenKlic: (datum: string) => string;
  /** ID položek, které už mají odpočet závozu (odjely). */
  odjeleIds: Set<string>;
  /** Stav skladu teď: `${beer_id}__${package_id}` → kusy. */
  sklad: Map<string, number>;
}): Map<string, ObjednavkyPiva> {
  const { objednavky, polozky, obaly, piva, tyden, tydenDnes, tydenKlic, odjeleIds, sklad } = vstup;

  // Týden každé objednávky (bez storna). Klíče `RRRR-TT` jdou řadit jako text.
  const tydenObjednavky = new Map<string, string>();
  for (const o of objednavky) {
    const d = o.delivery_date || o.order_date;
    if (o.status !== 'storno' && d) tydenObjednavky.set(o.id, tydenKlic(d));
  }

  // Kusy po pivu × obalu.
  const objednanoKs = new Map<string, number>();
  const cekaKs = new Map<string, number>();
  // Neodjeté objednávky dřívějších týdnů si sklad zabírají jako první —
  // u výhledu na příští týden je sklad o ně menší.
  const drivKs = new Map<string, number>();
  for (const p of polozky) {
    const tydenPolozky = tydenObjednavky.get(p.order_id);
    if (!p.beer_id || !p.package_id || !tydenPolozky) continue;
    const ks = Number(p.quantity) || 0;
    if (ks <= 0) continue;
    const k = `${p.beer_id}__${p.package_id}`;
    if (tydenPolozky < tyden) {
      if (tydenPolozky >= tydenDnes && (!p.id || !odjeleIds.has(p.id))) drivKs.set(k, (drivKs.get(k) ?? 0) + ks);
      continue;
    }
    if (tydenPolozky !== tyden) continue;
    objednanoKs.set(k, (objednanoKs.get(k) ?? 0) + ks);
    if (!p.id || !odjeleIds.has(p.id)) cekaKs.set(k, (cekaKs.get(k) ?? 0) + ks);
  }

  const obalPodleId = new Map(obaly.map((o) => [o.id, o]));
  const litry = { objednano: new Map<string, number>(), ceka: new Map<string, number>(), zbyva: new Map<string, number>() };
  const pricti = (m: Map<string, number>, pivo: string, l: number) => m.set(pivo, (m.get(pivo) ?? 0) + l);
  const lahveChybi = new Set<string>();

  for (const [k, ks] of objednanoKs) {
    const [pivo, obalId] = k.split('__');
    const obal = obalPodleId.get(obalId);
    if (!obal) continue;
    const objem = Number(obal.volume_l) || 0;
    pricti(litry.objednano, pivo, ks * objem);
    const ceka = cekaKs.get(k) ?? 0;
    pricti(litry.ceka, pivo, ceka * objem);
    const volneKs = Math.max(0, (sklad.get(k) ?? 0) - (drivKs.get(k) ?? 0));
    const chybiKs = Math.max(0, ceka - volneKs);
    pricti(litry.zbyva, pivo, chybiKs * objem);
    if (chybiKs > 0 && obal.kind === 'bottle') lahveChybi.add(pivo);
  }
  lahveChybi.forEach((pivo) => pricti(litry.zbyva, pivo, REZERVA_LAHVE_L));

  // Jantar se ze sklepa nestáčí — míchá se z 80 % 12° Světlé a 20 % tmavého.
  const jantar = piva.find((b) => b.name.toLowerCase().includes('jantar'));
  const svetla = piva.find((b) => b.name.toLowerCase().includes('12° svět') || b.name.toLowerCase().includes('12sv'));
  const tmave = piva.find((b) => b.name.toLowerCase().includes('tmav'));
  if (jantar) {
    for (const m of [litry.objednano, litry.ceka, litry.zbyva]) {
      const l = m.get(jantar.id) ?? 0;
      if (l <= 0) continue;
      if (svetla) pricti(m, svetla.id, l * 0.8);
      if (tmave) pricti(m, tmave.id, l * 0.2);
      m.set(jantar.id, 0);
    }
  }

  const vysledek = new Map<string, ObjednavkyPiva>();
  const hl = (l: number) => Math.round(l) / 100;
  for (const pivo of new Set([...litry.objednano.keys(), ...litry.zbyva.keys()])) {
    vysledek.set(pivo, {
      objednanoHl: hl(litry.objednano.get(pivo) ?? 0),
      cekaHl: hl(litry.ceka.get(pivo) ?? 0),
      zbyvaHl: hl(litry.zbyva.get(pivo) ?? 0),
    });
  }
  return vysledek;
}
