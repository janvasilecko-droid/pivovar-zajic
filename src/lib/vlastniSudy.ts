// 🛢️ Odběratelé s VLASTNÍMI sudy — stáčí se jim do jejich sudů.
// ---------------------------------------------------------------------------
// Z provozu 6. 10. 2026: „Duck and Dog a Michal Fojtovice počítej zvlášť,
// mimo zásoby skladu, stáčí se do jejich sudů, to samý Martin malý sudy."
//
// Plné sudy pivovaru skladem jejich objednávku nepokryjí (do jejich sudů se
// musí stočit zvlášť) a jejich naplněné sudy zase nepokryjí objednávky
// ostatních (lib/keggingPlan.ts). Martinovy malé sudy navíc neberou
// z naklikaných prázdných malých sudů pivovaru (lib/maleSudy.ts).
//
// Seznam je v kódu schválně: jsou to tři odběratelé a pravidlo platí hned
// po nasazení, bez úpravy databáze.
//
// Druhé pravidlo — podle TEXTU objednávky (14. 10. 2026, Egon: „v objednávce
// je napsáno do jejich sudu, v tom případě logicky nemusíš psát, že není
// malý sud — to se děje u některých zákazníků, že si donesou vlastní sud,
// je to v objednávce napsané“). Když zpráva nebo poznámka objednávky říká
// „do jejich / vlastního / svého sudu“, je objednávka stejně vlastní jako
// u odběratelů ze seznamu: nehlídají se pro ni malé sudy pivovaru, sklad ji
// nepokryje a plán stáčení ji vede zvlášť. Poznámka se při schválení zprávy
// k objednávce připíše (POZNAMKA_VLASTNI_SUD), takže ji pozná každá obrazovka.

export type VlastniSudy = 'vse' | 'male';
/** Obal tak, jak ho mají plán stáčení i malé sudy. */
export type ObalSudu = { kind?: string | null; volume_l?: number | string | null };

const norm = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

/** Co se k objednávce připíše do poznámky, když zpráva říká „do jejich sudu“. */
export const POZNAMKA_VLASTNI_SUD = 'do vlastního sudu';

const SUD = '(?:sud\\w*|keg\\w*)';
const SVUJ = '(?:jejich|jeho|jeji|sveho|svuj|svou|svoje|svoji|svych|vlastn\\w*)';
/** Obraty, kterými se říká, že se stáčí do sudu odběratele (text je bez diakritiky, malými). */
const OBRATY_VLASTNIHO_SUDU = [
  // „do jejich sudu", „do jejich vlastního sudu", „do vlastních sudů", „do svého 20l sudu"
  new RegExp(`\\bdo\\s+${SVUJ}\\s+(?:\\w+\\s+)?${SUD}`, 'g'),
  // „vlastní sud", „vlastního 20l sudu"
  new RegExp(`\\bvlastn\\w*\\s+(?:\\w+\\s+)?${SUD}`, 'g'),
  // „svůj sud", „svého sudu"
  new RegExp(`\\b(?:sveho|svuj|svou|svoje|svoji|svych)\\s+(?:\\w+\\s+)?${SUD}`, 'g'),
  // „sud zákazníka", „do sudu odběratele"
  new RegExp(`\\b${SUD}\\s+(?:zakaznik|odberatel)\\w*`, 'g'),
];
/** Slova, po kterých obrat neplatí: „nemají vlastní sud", „bez vlastního sudu". */
const ZAPOR = new Set(['ne', 'nema', 'nemaji', 'nemame', 'nebude', 'nebudou', 'bez', 'nikoli', 'nikoliv', 'nelze']);

/**
 * Říká text (zpráva od odběratele, poznámka objednávky), že se stáčí do
 * VLASTNÍHO sudu odběratele? „Egon od důchodců prosím 20l 12sv do jejich sudu."
 *
 * Záměrně úzké: obyčejné „do sudu“ nebo „sud 20l“ nestačí, musí tam být čí
 * sud to je („jejich“, „vlastní“, „svého“). Když si text protiřečí
 * („nemají vlastní sud“), neplatí. Lepší jedno zbytečné varování navíc než
 * objednávka, která tiše vypadne z hlídání sudů.
 */
export function textRikaVlastniSud(text: string | null | undefined): boolean {
  // Nové řádky a tečky oddělují věty — „nemají sudy.\nDo jejich sudu" záporka nezasáhne.
  const n = norm((text ?? '').replace(/\n+/g, ' . '));
  if (!n) return false;
  return OBRATY_VLASTNIHO_SUDU.some((re) => {
    for (const m of n.matchAll(re)) {
      const veta = n.slice(0, m.index ?? 0).split(/[.!?;,]/).pop() ?? '';
      const predchozi = veta.split(' ').filter(Boolean).slice(-3);
      if (!predchozi.some((w) => ZAPOR.has(w))) return true;
    }
    return false;
  });
}

/**
 * Poznámka objednávky doplněná o „do vlastního sudu“, když to zpráva říká
 * a poznámka to ještě neříká. Nic jiného z poznámky nemění.
 */
export function poznamkaSVlastnimSudem(poznamka: string | null | undefined, zprava: string | null | undefined): string | null {
  const stara = (poznamka ?? '').trim();
  if (!textRikaVlastniSud(zprava) || textRikaVlastniSud(stara)) return stara || null;
  return stara ? `${stara}; ${POZNAMKA_VLASTNI_SUD}` : POZNAMKA_VLASTNI_SUD;
}

/**
 * Jaké sudy si odběratel vozí sám: všechny ('vse'), jen malé ('male'), nebo žádné (null).
 * `poznamka` = poznámka objednávky: když říká „do jejich sudu“, jsou všechny sudy
 * té objednávky odběratelovy, i když ho seznam nezná.
 */
export function vlastniSudyOdberatele(placeName: string | null | undefined, poznamka?: string | null): VlastniSudy | null {
  const n = norm(placeName);
  // Duck and Dog už NENÍ v seznamu (20. 10. 2026: „DaD neřeš, udělej z něj normálního zákazníka
  // s našimi sudy, když to dělá takový bordel"). Jejich objednávka se plánuje a odečítá jako
  // každá jiná; do jejich sudů se pozná jen podle poznámky „do jejich sudu".
  // „Michal fojtovice" (tak je v objednávkách) i „vojtovice" (tak se to vyslovuje).
  if (n.includes('fojtovic') || n.includes('vojtovic')) return 'vse';
  // Přesně „Martin" — ne „Martinice" ani jiný odběratel, co Martina má v názvu.
  if (n === 'martin') return 'male';
  return textRikaVlastniSud(poznamka) ? 'vse' : null;
}

/**
 * Odběratelé, jejichž sudy NEJSOU obaly pivovaru: pivovar jim jen plní pivo do jejich sudů, takže se
 * jejich kusy nepočítají jako naše obaly (nebere se z prázdných malých sudů, nepočítají se do počtu sudů
 * ve statistice), ale OBJEM piva se počítá normálně. Jména jsou bez diakritiky, malými písmeny.
 *
 * Majitel 27. 11. 2026: „DaD nepočítat do malých sudů, má svoje sudy, ani do počtu stočených sudů, myšleno
 * jako počet obalů, jen se počítá objem, ale ne obaly.“ Je to ÚZKÉ pravidlo: DaD zůstává normálním zákazníkem
 * ve skladu a v plánu stáčení (rozhodnutí 20. 10. 2026) — jeho pivo se z tanku bere, jeho sudy ne.
 */
const MAJI_VLASTNI_OBALY = ['duck and dog'];

/** Patří odběratel do seznamu těch, jejichž sudy nejsou obaly pivovaru (zatím Duck and Dog)? */
export function jeMimoNaseObaly(placeName: string | null | undefined): boolean {
  // „Duck & Dog“ = „Duck and Dog“; jen celá slova („Duck and Dogs“ a podobné ne).
  const n = ` ${norm(placeName).replace(/&/g, ' and ').replace(/\s+/g, ' ').trim()} `;
  return MAJI_VLASTNI_OBALY.some((j) => n.includes(` ${j} `));
}

/**
 * Nebere odběratel naše obaly? Platí pro odběratele se SEZNAMU vlastních sudů (Michal Fojtovice, Martin u malých),
 * pro objednávku s poznámkou „do jejich sudu“ i pro ty, jejichž sudy nejsou naše obaly (Duck and Dog).
 * Používá se tam, kde se počítají OBALY — hlídání malých sudů (prázdné sudy pivovaru) —
 * ne tam, kde se počítá sklad nebo plán stáčení (ty řídí `vlastniSudyOdberatele`).
 */
export function maVlastniObaly(placeName: string | null | undefined, poznamka?: string | null): boolean {
  return !!vlastniSudyOdberatele(placeName, poznamka) || jeMimoNaseObaly(placeName);
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
