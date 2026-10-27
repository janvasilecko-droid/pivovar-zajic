// 🛢️ Odběratelé s VLASTNÍMI sudy — ZRUŠENO 27. 10. 2026.
// ---------------------------------------------------------------------------
// Od 6. 10. 2026 se některým odběratelům (Duck and Dog, Michal Fojtovice, Martin
// u malých sudů, a podle poznámky „do jejich sudu" kdokoli) stáčelo do jejich
// sudů: sklad pivovaru je nekryl a plán stáčení je vedl zvlášť. Majitel
// 27. 10. 2026: „ať se vymaže do vlastních sudů, prostě vše do sudů stejných."
//
// Funkce tu zůstávají, ať se nemusí přepisovat každé místo, které se ptá
// (plán stáčení, malé sudy, chybí skladem, karty objednávek) — odpověď je ale
// vždy „sudy pivovaru", takže se všude chovají jako u každého jiného odběratele.

export type VlastniSudy = 'vse' | 'male';
/** Obal tak, jak ho mají plán stáčení i malé sudy. */
export type ObalSudu = { kind?: string | null; volume_l?: number | string | null };

/** Jaké sudy si odběratel vozí sám — od 27. 10. 2026 vždy žádné (null). */
export function vlastniSudyOdberatele(_placeName: string | null | undefined, _poznamka?: string | null): VlastniSudy | null {
  // ❌ Vlastní sudy odběratelů jsou ZRUŠENÉ. Majitel 27. 10. 2026: „ať se vymaže do vlastních
  // sudů, prostě vše do sudů stejných." Žádný odběratel ani poznámka „do jejich sudu" už
  // objednávku nedělá zvláštní — plán stáčení, sklad, malé sudy i „chybí skladem" ji berou
  // jako každou jinou (EGON „do jejich sudu" pak „Co stočit" vedlo jako nestočený, i když
  // byl stočený ve Stáčení KEG). Dřív tu byl seznam (Michal Fojtovice, Martin u malých,
  // do 20. 10. i Duck and Dog) a poznámka objednávky.
  return null;
}

/** Stáčí se tahle položka do sudu odběratele (ne do sudu pivovaru)? */
export function doSuduOdberatele(placeName: string | null | undefined, obal: ObalSudu | undefined, poznamka?: string | null): boolean {
  const vlastni = vlastniSudyOdberatele(placeName, poznamka);
  if (!vlastni || !obal || obal.kind !== 'keg') return false;
  // Malý sud = KEG pod 30 l, stejně jako jeMalySud v lib/maleSudy.ts (ten
  // se sem neimportuje — maleSudy.ts importuje tenhle soubor).
  const objem = Number(obal.volume_l ?? 0);
  return vlastni === 'vse' || (objem > 0 && objem < 30);
}

/**
 * Položky objednávky BEZ těch, co se stáčí do sudů odběratele.
 *
 * Odznak „chybí skladem" porovnává objednávku se zásobou pivovaru. Sudy
 * odběratele (Duck and Dog…) ale zásobou pivovaru nikdy nebyly — stáčí se do
 * jejich vlastních sudů a řeší se zvlášť (8. 10. 2026: „DaD se nemá počítat
 * do počítání"; u jejich objednávky svítilo „chybí 50 l 4 ks, 20 l 8 ks", což
 * byl jen automatický odpočet závozu proti skladu).
 */
export function bezSuduOdberatele<T extends { package_id: string | null }>(
  placeName: string | null | undefined,
  polozky: T[],
  obaly: { id: string; kind?: string | null; volume_l?: number | string | null }[],
  poznamka?: string | null,
): T[] {
  return polozky.filter((p) => !doSuduOdberatele(placeName, obaly.find((o) => o.id === p.package_id), poznamka));
}

/**
 * Položky objednávky, které se stáčí do sudů odběratele (Duck and Dog…). Pivo se
 * do nich musí stočit a zapsat ve Stáčení — sklad pivovaru je neobsahuje, takže
 * „Vše skladem“ u nich neplatí (majitel 19. 10. 2026: „vše není skladem, jen je
 * to z jeho sudů, musím stejně zadat stáčení“).
 */
export function doSuduOdberatelePolozky<T extends { package_id: string | null }>(
  placeName: string | null | undefined,
  polozky: T[],
  obaly: { id: string; kind?: string | null; volume_l?: number | string | null }[],
  poznamka?: string | null,
): T[] {
  return polozky.filter((p) => doSuduOdberatele(placeName, obaly.find((o) => o.id === p.package_id), poznamka));
}
