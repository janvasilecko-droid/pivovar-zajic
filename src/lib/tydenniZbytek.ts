// 📦 „Chybí skladem" u objednávky — kolik zbývá ke konci týdne závozu.
// ---------------------------------------------------------------------------
// Odznak na kartě objednávky, který varuje, že na ni nemusí být dost piva.
//
// Dřív to Orders.tsx počítal vlastní cestou: poslední inventura z měsíce před
// aktuálním + stočené TENTO týden − objednané − výdeje. Mělo to tři vady:
//
//  1. Byl to SEDMÝ nezávislý výpočet skladu a jediný, který nešel přes
//     skladovou knihu. Chyběly mu přefuk, sudy spotřebované na lahve i
//     dorovnání inventury — a jednou už se opravoval kvůli chybějícímu
//     fasování/prodejně/akcím. Přesně proto skladová kniha vznikla.
//  2. Míchal období: základ z inventury starý klidně měsíce, ale výrobu jen za
//     jeden týden. Co se stočilo mezitím, se ztratilo.
//  3. Sčítal VŠECHNY obaly jednoho piva do jednoho čísla. Pět sudů a sto
//     lahví dalo „105" — a objednávka na deset sudů pak vypadala krytá.
//
// Teď se ptáme skladové knihy na stav ke konci týdne závozu, po pivu A OBALU.
import { buildMovements, stockAsOf, stockKey, type StockSources } from './stockLedger';
import { bezSuduOdberatele, doSuduOdberatele } from './vlastniSudy';

/** Stav skladu ke konci daného týdne, klíč `beer_id__package_id`. */
export function zbytekKeKonciTydne(
  zdroje: StockSources,
  konecTydneISO: string,
): Map<string, number> {
  const stavy = stockAsOf(buildMovements(zdroje), konecTydneISO);
  const out = new Map<string, number>();
  stavy.forEach((line, key) => { out.set(key, line.qty); });
  return out;
}

/**
 * Kolik kusů z každé POLOŽKY objednávky už fyzicky odjelo (zavoz_deductions).
 *
 * Klíč je `order_items.id`. Slouží k jedinému účelu, ale zásadnímu: skladová
 * kniha má zavezené kusy odečtené sama, takže kdo je chce odečíst ještě jednou
 * jako „poptávku", odečte je DVAKRÁT. Přesně tuhle chybu už jednou měl fond
 * v keggingPlan.ts („Plán stáčení dvakrát odečítal sudy z fondu") a řeší ji
 * i `zbytekPodleObjednavek` níž — proto je ta znalost tady, na jednom místě,
 * a ne potřetí opsaná jinde.
 */
export function odecteneKusyPolozek(
  zavozDeductionRows: { order_item_id?: string | null; quantity?: number | null }[] | undefined,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of zavozDeductionRows ?? []) {
    const id = r?.order_item_id;
    if (!id) continue;
    out.set(id, (out.get(id) ?? 0) + Number(r.quantity || 0));
  }
  return out;
}

export type Schodek = {
  beer_id: string;
  package_id: string;
  beer_name: string;
  /** Kolik kusů chybí (kladné číslo). */
  chybi: number;
};

export type PolozkaObjednavky = {
  beer_id: string | null;
  package_id: string | null;
  beer_name?: string | null;
};

/**
 * Které položky objednávky nejsou ke konci týdne kryté.
 *
 * Rozhoduje kombinace PIVO + OBAL, ne jen pivo: chybějící sudy nevykryjí
 * lahve, i když je v nich totéž pivo.
 *
 * Stejné pivo+obal se ve výsledku objeví jednou, i když je objednávka nese
 * na víc řádcích — odznak má říct „tohohle je málo", ne to opakovat.
 */
export function schodkyObjednavky(
  polozky: PolozkaObjednavky[],
  zbytek: Map<string, number>,
): Schodek[] {
  const videno = new Set<string>();
  const out: Schodek[] = [];
  for (const p of polozky) {
    if (!p.beer_id || !p.package_id) continue;
    const key = stockKey(p.beer_id, p.package_id);
    if (videno.has(key)) continue;
    const zbyva = zbytek.get(key) ?? 0;
    if (zbyva >= 0) continue;
    videno.add(key);
    out.push({
      beer_id: p.beer_id,
      package_id: p.package_id,
      beer_name: p.beer_name ?? '?',
      chybi: -zbyva,
    });
  }
  return out;
}

export type PolozkaKPrioritě = PolozkaObjednavky & {
  /** `order_items.id` — pro spárování s `jizOdectenoOrderItemIds`. */
  order_item_id: string;
  quantity: number;
};

export type ObjednavkaKPrioritě = {
  order_id: string;
  /** Den dovozu (delivery_date, jinak order_date) — dřívější má přednost. */
  poradiDatum: string;
  polozky: PolozkaKPrioritě[];
};

/**
 * Zbytek skladu PRO KAŽDOU objednávku zvlášť, s ohledem na to, co si už
 * „vzaly" jiné, PŘEDNOSTNĚJŠÍ (dřívější den dovozu) objednávky stejného
 * týdne na stejné pivo+obal.
 *
 * Nález z auditu 15. 9. 2026: `schodkyObjednavky` kontrolovalo každou
 * objednávku zvlášť proti STEJNÉMU `zbytekKeKonciTydne` — dvě objednávky na
 * stejné pivo+obal tak mohly OBĚ vyjít "v pořádku", i když dohromady sklad
 * nestačil. Rozhodnutí uživatele 15. 9. 2026: priorita podle dne dovozu —
 * kdo se veze dřív, dostane zbytek dřív (stejný princip jako fond v
 * keggingPlan.ts). Objednávky se STEJNÝM dnem dovozu mají stejnou prioritu
 * a nesoutěží mezi sebou (stejná granularita jako denní plán stáčení) —
 * jen s objednávkami z dřívějších dnů.
 *
 * Poptávka položky, jejíž odpočet ze skladu (zavoz_deductions) UŽ existuje,
 * se neodečítá znovu — `zbytek` (skladová kniha) ji má odečtenou už sama;
 * odečíst by ji podruhé byla stejná chyba, jakou měl fond v keggingPlan.ts
 * (viz commit „Plán stáčení dvakrát odečítal sudy z fondu").
 */
export function zbytekPodleObjednavek(
  objednavky: ObjednavkaKPrioritě[],
  zbytek: Map<string, number>,
  jizOdectenoOrderItemIds: Set<string>,
): Map<string, Map<string, number>> {
  const razene = [...objednavky].sort((a, z) =>
    a.poradiDatum < z.poradiDatum ? -1 : a.poradiDatum > z.poradiDatum ? 1 : 0
  );

  const poptavkaObjednavky = (o: ObjednavkaKPrioritě): Map<string, number> => {
    const m = new Map<string, number>();
    for (const p of o.polozky) {
      if (!p.beer_id || !p.package_id) continue;
      if (jizOdectenoOrderItemIds.has(p.order_item_id)) continue;
      const k = stockKey(p.beer_id, p.package_id);
      m.set(k, (m.get(k) ?? 0) + Number(p.quantity || 0));
    }
    return m;
  };

  // `bezici` = zbytek PO všech PŘÍSNĚ dřívějších dnech (aktualizuje se mezi
  // dávkami). V rámci jedné dávky (stejný den) VŠECHNY objednávky vidí
  // STEJNÝ výsledek: zbytek po odečtení SPOLEČNÉ poptávky CELÉ dávky —
  // stejná granularita jako denní plán stáčení (keggingPlan.ts), který taky
  // nejdřív sečte poptávku celého dne do jednoho čísla a teprve to porovná
  // se skladem, ne objednávku po objednávce.
  //
  // Oprava z provozu 17. 9. 2026: první verze tu každé objednávce dávky
  // odečítala jen JEJÍ VLASTNÍ poptávku od nedotčeného zbytku — takže tři
  // objednávky na stejný den, každá po 2ks, se STEJNÝM skladem 4ks, vyšly
  // VŠECHNY jako "v pořádku" (4 ≥ 2), i když dohromady scházely 2ks. Přesně
  // ten souběh, který měl Nález č. 3 opravit — jen přesunutý na úroveň dne
  // místo týdne, protože "nesoutěží mezi sebou" se implementovalo jako
  // "o sobě navzájem neví", ne jako "dělí se o stejný výsledek".
  const bezici = new Map(zbytek);
  const vysledek = new Map<string, Map<string, number>>();
  let i = 0;
  while (i < razene.length) {
    let j = i;
    while (j < razene.length && razene[j].poradiDatum === razene[i].poradiDatum) j++;
    const davka = razene.slice(i, j);
    const davkovaPoptavka = new Map<string, number>();
    davka.forEach((o) => {
      poptavkaObjednavky(o).forEach((qty, k) => davkovaPoptavka.set(k, (davkovaPoptavka.get(k) ?? 0) + qty));
    });
    const poDavce = new Map(bezici);
    davkovaPoptavka.forEach((qty, k) => poDavce.set(k, (poDavce.get(k) ?? 0) - qty));
    davka.forEach((o) => vysledek.set(o.order_id, poDavce));
    // Pro DALŠÍ (pozdější) dny se odečte poptávka CELÉ dávky najednou.
    davkovaPoptavka.forEach((qty, k) => bezici.set(k, (bezici.get(k) ?? 0) - qty));
    i = j;
  }
  return vysledek;
}

/**
 * ⚖️ „Chybí skladem" pro všechny objednávky jednoho týdne — JEDEN výpočet
 * pro Objednávky i Závoz.
 *
 * Audit 9. 10. 2026 našel dvě místa, která si to počítala jinak:
 *  1. Závoz porovnával každou objednávku s celým zbytkem zvlášť — ostatní
 *     objednávky týdne nevěděly o sobě, takže „chybí" skoro nikdy nesvítilo,
 *     zatímco Objednávky (zbytekPodleObjednavek) u téže objednávky ano.
 *  2. Objednávky ani Závoz nevyřazovaly sudy odběratelů s vlastními sudy
 *     (Duck and Dog, Michal Fojtovice, Martin u malých — lib/vlastniSudy.ts):
 *     jejich naplněné sudy v chlaďáku „kryly" ostatní objednávky a jejich
 *     objednávky si zásobu pivovaru ubíraly. Plán stáčení (keggingPlan.ts)
 *     je vyřazoval odjakživa.
 *
 * Teď: zásoba ke konci týdne MÍNUS naplněné sudy odběratelů, které ještě
 * neodjely (stáčení s vazbou na jejich položku, bez odpočtu závozu), a
 * poptávka BEZ jejich položek, rozdělená podle dne závozu.
 */
export function chybiSklademTydne(p: {
  zdroje: StockSources;
  konecTydneISO: string;
  /** Nestornované objednávky TOHOTO týdne. */
  objednavky: { id: string; place_name?: string | null; delivery_date?: string | null; order_date: string }[];
  polozky: (orderId: string) => { id: string; beer_id: string | null; package_id: string | null; beer_name?: string | null; quantity: number | string }[];
  /** Všechny objednávky a položky, které obrazovka zná — kvůli sudům odběratelů z jiných týdnů. */
  vsechnyObjednavky: { id: string; place_name?: string | null }[];
  vsechnyPolozky: { id: string; order_id: string; beer_id: string | null; package_id: string | null }[];
  obaly: { id: string; kind?: string | null; volume_l?: number | string | null }[];
}): Map<string, Map<string, number>> {
  const zbytek = zbytekKeKonciTydne(p.zdroje, p.konecTydneISO);
  const obal = new Map(p.obaly.map((o) => [o.id, o]));
  const mistoObjednavky = new Map(p.vsechnyObjednavky.map((o) => [o.id, o.place_name ?? null]));
  const polozkaPodleId = new Map(p.vsechnyPolozky.map((it) => [it.id, it]));
  const odepsane = new Set((p.zdroje.zavozDeductionRows ?? []).map((r: any) => r.order_item_id).filter(Boolean));
  // Naplněné sudy odběratele, které ještě neodjely: sklad je má (+ ze
  // stáčení), ostatním objednávkám ale nepatří.
  for (const r of (p.zdroje.keggingRows ?? []) as any[]) {
    const it = r.order_item_id ? polozkaPodleId.get(r.order_item_id) : undefined;
    if (!it || odepsane.has(it.id) || !it.beer_id || !it.package_id) continue;
    if (!doSuduOdberatele(mistoObjednavky.get(it.order_id), obal.get(it.package_id))) continue;
    const k = stockKey(it.beer_id, it.package_id);
    if (zbytek.has(k)) zbytek.set(k, (zbytek.get(k) ?? 0) - Number(r.quantity || 0));
  }
  const objednavky: ObjednavkaKPrioritě[] = p.objednavky.map((o) => ({
    order_id: o.id,
    poradiDatum: o.delivery_date || o.order_date,
    polozky: bezSuduOdberatele(o.place_name, p.polozky(o.id), p.obaly).map((it) => ({
      order_item_id: it.id,
      beer_id: it.beer_id,
      package_id: it.package_id,
      beer_name: it.beer_name,
      quantity: Number(it.quantity),
    })),
  }));
  return zbytekPodleObjednavek(objednavky, zbytek, odepsane as Set<string>);
}
