// Párování položky objednávky s katalogem piv a obalů — vytažené z
// whatsapp-auto-parse/index.ts, aby šlo testovat.
//
// Tohle je matcher, který SKUTEČNĚ zakládá objednávky z WhatsAppu. Dokud
// seděl uvnitř edge funkce (nahoře `Deno.serve`), nešel z testů vůbec
// importovat — a přesně v něm vznikla chyba z 28. 8. 2026, kdy zpráva
// „Restaurace 1x50 12, 1x50 10 a 1x50 tm, terasa 2x50 12 2x50 osma"
// přiřadila Osmu všem pěti položkám. Klientský parser
// (src/lib/orderParser.ts) je jiná implementace téhož a testy měl; tahle
// větev ne. Proto je matcher tady, jako obyčejný modul bez Deno API.
//
// ⚠️ Pravidla drž shodná s src/lib/orderParser.ts — obě větve musí
// přiřazovat stejně, jinak se výsledek liší podle toho, kudy zpráva přišla.
export function normText(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[ěščřžýáíéóúůťďň]/g, (c) =>
      ({ ě: "e", š: "s", č: "c", ř: "r", ž: "z", ý: "y", á: "a", í: "i", é: "e", ó: "o", ú: "u", ů: "u", ť: "t", ď: "d", ň: "n" }[c] ?? c))
    .replace(/[^a-z0-9°.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  let prev = new Array(bl + 1);
  let cur = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    cur[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= bl; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[bl];
}

export function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// Nejlepší podobnost needle v oknech slov haystacku (toleruje chybějící slova).
export function bestFuzzyScoreInText(needle: string, haystack: string): number {
  if (!needle || !haystack) return 0;
  const words = haystack.split(/\s+/).filter(Boolean);
  const needleWordCount = needle.split(/\s+/).filter(Boolean).length || 1;
  let best = 0;
  for (let span = Math.max(1, needleWordCount - 1); span <= needleWordCount + 1 && span <= words.length; span++) {
    for (let i = 0; i + span <= words.length; i++) {
      const chunk = words.slice(i, i + span).join(" ");
      const s = similarity(needle, chunk);
      if (s > best) best = s;
    }
  }
  return best;
}

type Barva = 'svetle' | 'tmave';

/**
 * Barva napsaná v krátkém kusu textu. Zná i zkratky, které se v objednávkách
 * píšou nejčastěji: „tm", „12tm", „tm12", „TM:" (tmavá) a „sv", „sl", „12sv"
 * (světlá). Hranice je „ne písmeno", ne \b — v „12tm" před „tm" stojí číslice.
 */
export function barvaVTextu(text: string): Barva | null {
  const t = normText(text);
  // „polotmavé" není tmavé (je to Jantar) — „tmav" uvnitř „polotmav" se nepočítá.
  if (/(?:^|[^a-z])tm(?:a|av[aeyu]?|ave|avy)?(?![a-z])|(?<!polo)tmav|(?:^|[^a-z])cern[aey](?![a-z])|\bdark\b/.test(t)) return 'tmave';
  if (/(?:^|[^a-z])(?:sv|sl|svet|svetl[aeyu]?|svetly|svetle)(?![a-z])|\blight\b/.test(t)) return 'svetle';
  return null;
}

/**
 * Barva z úseku zprávy, který patří TÉHLE položce.
 *
 * 13. 9. 2026 z provozu: „Tm: 2x30l" (Lužec) i „5 beden 12tm" (lahve) se
 * zapsaly jako 12° Světlá. Serverový matcher zkratku „tm" neznal a AI k nim
 * přidala stupeň 12°, takže poslední záchrana („neoznačený stupeň = světlé")
 * vybrala světlou. Barva se ale nesmí brát z celého raw_line — ten může patřit
 * víc položkám („1x50 12, 1x50 10 a 1x50 tm"). Proto se raw_line rozdělí na
 * úseky (čárka, středník, lomítko, plus, „a", nový řádek) a barva platí, jen
 * když ji úseky patřící položce (podle množství) říkají jednoznačně. Když má
 * raw_line jediný úsek, patří celý položce.
 */
export function barvaPolozky(item: any): Barva | null {
  const useky = usekyPolozky(item);
  if (!useky.length) return null;
  const barvy = new Set(useky.map((u) => barvaVTextu(u)));
  return barvy.size === 1 ? [...barvy][0] : null;
}

// Odrážky, kterými se v objednávkách začínají řádky („• SV 12 = …"). Když AI
// zprávu přepíše na jeden řádek, konec řádku zmizí a odrážka je to jediné,
// podle čeho se řádky ještě dají od sebe poznat.
const ODRAZKY = "•◦▪●■‣⁃∙";
const RADKY_RE = new RegExp(`[\\n\\r${ODRAZKY}]+`);
// Čárka mezi číslicemi je desetinná („1,5l"), ne oddělovač — viz usekyPolozky.
const USEKY_RE = new RegExp(`(?<![0-9]),|,(?![0-9])|[;/+\\n\\r${ODRAZKY}]|\\s+a\\s+`, "i");
// WhatsApp kolem odrážek vkládá neviditelné znaky (U+2060), které trim() nechá.
const ocisti = (t: string) => t.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").trim();

/** Řádky textu: dělí je konec řádku nebo odrážka. */
function radkyTextu(raw: string): string[] {
  return raw.split(RADKY_RE).map(ocisti).filter(Boolean);
}

/**
 * Kusy textu, z nichž každý mluví nejvýš o jedné položce: úseky (jako
 * usekyPolozky) a v nich kusy, které začínají množstvím — „10x50l 12sv 2x30l
 * Winter" jsou dva kusy, i když mezi nimi žádný oddělovač není.
 */
function kusyTextu(raw: string): string[] {
  return raw
    .split(USEKY_RE)
    .flatMap((u) => u.split(/(?=(?:^|[^0-9.,])\d{1,4}\s*(?:x|×|\*)\s*\d)/i))
    .map(ocisti)
    .filter(Boolean);
}

/**
 * Úseky raw_line, které patří TÉHLE položce. Raw_line s jediným úsekem patří
 * celý položce; jinak se berou úseky s jejím množstvím („4x30", „6x", „5 beden").
 * Prázdné pole = nedá se určit (bez množství, nebo žádný úsek nesedí).
 *
 * 13. 9. 2026: kontrola všech objednávek našla „2x30l světle, 1x30l jantar"
 * (Seeberg) — jméno „jantar" kdekoli v řádku by vyhrálo i u položky 2×30l
 * světlé. Proto se pivo hledá napřed v úseku položky (viz matchBeerId).
 * Úseky dělí čárka, středník, lomítko, plus, „a", nový řádek a odrážka.
 */
export function usekyPolozky(item: any): string[] {
  const raw = String(item?.raw_line || '');
  if (!raw.trim()) return [];
  // Čárka mezi číslicemi je desetinná („1,5l", „0,5l"), ne oddělovač — jinak
  // by se „10xpet 1,5l tmava" rozpadlo na „10xpet 1" a „5l tmava" a položka by
  // barvu ztratila (nalezeno kontrolou objednávek 13. 9. 2026: Sedláčková, Kebab).
  const useky = raw.split(USEKY_RE).map(ocisti).filter(Boolean);
  if (useky.length === 1) return useky;
  const ks = Number(item?.quantity ?? item?.qty);
  if (!Number.isFinite(ks) || ks <= 0) return [];
  const ksRe = new RegExp(`(?:^|[^0-9.,])${ks}\\s*(?:x|\\*|ks|kus|bed)|(?:x|\\*)\\s*${ks}(?![0-9.,])`, 'i');
  return useky.filter((u) => ksRe.test(u));
}

const stupenPiva = (b: { degree?: string | null } | undefined) => (b?.degree || '').replace('°', '').trim();

export function matchBeerId(
  item: any,
  beers: { id: string; name: string; degree?: string | null; short_name?: string | null }[],
  aliasMap: { beer: Map<string, string>; package: Map<string, string> }
): string | null {
  // ↩️ Řádek VÝSLEDNÉHO STAVU upravované objednávky, ke kterému AI přiložila
  // text z CITOVANÉ (původní) zprávy — značku z_citace dává volající, viz
  // radekJeZCitace v citace-polozky.ts. AI dostala současný obsah objednávky
  // s přesnými názvy piv a vrátila, jak má vypadat po zapracování odpovědi;
  // text původní zprávy už pro položku neplatí doslova (odpověď mohla změnit
  // pivo, obal i počet) a často je to celá zpráva s víc pivy. Platí proto
  // pivo, které určila AI; z textu se čte, jen když její název nic neurčí.
  if (item?.z_citace === true) {
    const odAI = pivoOdAI(item, beers, aliasMap);
    if (odAI) return odAI;
  }
  // Když raw_line obsahuje víc řádků objednávky (AI k položce přiložila celou
  // zprávu), platí pro položku jen JEJÍ řádek — viz vlastniRadekPolozky.
  const radek = vlastniRadekPolozky(item, beers, aliasMap);
  const polozka = radek ? { ...item, raw_line: radek } : item;
  // Barva z vlastního úseku položky má poslední slovo mezi světlou a tmavou
  // téhož stupně (viz barvaPolozky) — AI i shoda podle stupně se v tom pletly.
  const barva = barvaPolozky(polozka);
  const opravBarvu = (beerId: string | null): string | null => {
    if (!beerId || !barva) return beerId;
    const b = beers.find((x) => x.id === beerId);
    const stupen = stupenPiva(b);
    if (!b || !stupen) return beerId;
    const jeTmave = /tmav|dark/.test(normText(b.name));
    if (barva === 'tmave' && !jeTmave) {
      return beers.find((x) => stupenPiva(x) === stupen && /tmav|dark/.test(normText(x.name)))?.id ?? beerId;
    }
    if (barva === 'svetle' && jeTmave) {
      return beers.find((x) => stupenPiva(x) === stupen && /svetl|light/.test(normText(x.name)))?.id ?? beerId;
    }
    return beerId;
  };
  return opravBarvu(matchBeerIdBezBarvy(polozka, beers, aliasMap));
}

/**
 * Pivo, které k položce určila AI (beer_name). Název musí pivo určit sám
 * (jménem, stupněm s barvou…), ne až přes stupeň položky, a stupeň položky mu
 * nesmí odporovat. null = název od AI nic neurčí.
 */
function pivoOdAI(
  item: any,
  beers: { id: string; name: string; degree?: string | null; short_name?: string | null }[],
  aliasMap: { beer: Map<string, string>; package: Map<string, string> },
): string | null {
  const aiName = normText(item?.beer_name || "");
  const odAI = aiName ? matchBeerInText(aiName, beers, aliasMap, null) : null;
  if (!odAI) return null;
  const stupen = String(item?.degree || "").replace("°", "").trim();
  const stupenOdAI = stupenPiva(beers.find((b) => b.id === odAI));
  return stupen && stupenOdAI && stupen !== stupenOdAI ? null : odAI;
}

/**
 * Pivo od AI — jen když raw_line jmenuje víc piv a tohle je jedno z nich.
 * Jinak null: název od AI bez opory v textu nerozhoduje, a u řádku s jediným
 * pivem není co rozhodovat.
 */
function pivoOdAIMeziJmenovanymi(
  item: any,
  beers: { id: string; name: string; degree?: string | null; short_name?: string | null }[],
  aliasMap: { beer: Map<string, string>; package: Map<string, string> },
): string | null {
  const odAI = pivoOdAI(item, beers, aliasMap);
  if (!odAI) return null;
  const jmenovana = pivaJmenovanaVTextu(item?.raw_line, beers, aliasMap);
  return jmenovana.length > 1 && jmenovana.includes(odAI) ? odAI : null;
}

function matchBeerIdBezBarvy(
  item: any,
  beers: { id: string; name: string; degree?: string | null; short_name?: string | null }[],
  aliasMap: { beer: Map<string, string>; package: Map<string, string> }
): string | null {
  // Přednost má PŮVODNÍ text objednávky (raw_line) — to je to, co zákazník
  // skutečně napsal. Název od AI (beer_name) může být špatně rozpoznaný,
  // proto ho zkoušíme až jako záložní zdroj.
  //
  // ⚠️ raw_line ale může patřit VÍC položkám najednou — u zprávy psané na
  // jeden řádek ("Restaurace 1x50 12, 1x50 10 a 1x50 tm, terasa 2x50 12 2x50
  // osma") vrátí AI pět položek se stejným raw_line, celým řádkem. Shoda
  // podle názvu piva kdekoli v tom řádku pak vyhraje u VŠECH položek — 28. 8.
  // 2026 se takhle slovo „osma" na konci propsalo i do položek se stupněm 12°
  // a 10°. Proto nález z raw_line neplatí, když odporuje stupni, který AI
  // přiřadila téhle konkrétní položce. (Stejnou pojistku má matchPackageId
  // níž — jen řešenou tím, že raw_line bere až jako zálohu.)
  const ownDegree = (item.degree || "").replace("°", "").trim();
  const neodporuje = (beerId: string | null): string | null => {
    if (!beerId || !ownDegree) return beerId;
    const b = beers.find((x) => x.id === beerId);
    const beerDegree = (b?.degree || "").replace("°", "").trim();
    if (beerDegree && beerDegree !== ownDegree) return null;
    return beerId;
  };

  // Nejdřív úsek řádku, který patří téhle položce — jen když je jediný a řádek
  // má víc úseků (jinak je to totéž co celý raw_line níž). V úseku se hledá
  // JEN podle toho, co v něm doopravdy stojí, BEZ stupně od AI: úsek
  // „10x0,5l lahev" pivo neurčuje, a se stupněm 12° by vyšla 12° Světlá dřív,
  // než by se došlo k „Jantar" na začátku řádku (Malešice, 26. 8. 2026).
  const useky = usekyPolozky(item);
  const celyRadek = String(item.raw_line || '');
  if (useky.length === 1 && normText(useky[0]) !== normText(celyRadek)) {
    const hit = neodporuje(matchBeerInText(normText(useky[0]), beers, aliasMap, null));
    if (hit) return hit;
  }

  // Řádek jmenuje VÍC PIV a z textu se nepoznalo, které patří téhle položce
  // (žádný vlastní úsek). Jméno jednoho z nich pak nesmí vyhrát u všech
  // položek, které ten řádek sdílejí: rozhodne pivo, které k položce určila
  // AI — ale jen když je mezi těmi, která řádek opravdu jmenuje. Název od AI,
  // který v textu oporu nemá, jméno z řádku dál nepřebije.
  //
  // 17. 11. 2026 (Malešice): odpověď „Bude bez pet 1,5l. 12cky" — AI vrátila
  // výsledný stav objednávky správně, ale ke každé položce přiložila celou
  // citovanou zprávu („• SV 12 = 2x50l KEG + 2x30l KEG + … • Jantar 12 =
  // 2x30l KEG + …"). Slovo „Jantar" vyhrálo u všech čtyř položek a v objednávce
  // přibylo 2× 50 l Jantar. Stejně 19. 10. 2026 (Lokálka Říčany): „10x50l 12sv
  // 2x30l Winter Hazy 12" udělalo Winter i z 10× 50 l dvanáctky.
  const odAI = pivoOdAIMeziJmenovanymi(item, beers, aliasMap);
  if (odAI) return odAI;
  const aiName = normText(item.beer_name || "");

  const rawText = normText([item.raw_line, item.degree].filter(Boolean).join(" "));
  if (rawText) {
    const hit = neodporuje(matchBeerInText(rawText, beers, aliasMap, item.degree));
    if (hit) return hit;
  }
  if (aiName) {
    const hit = neodporuje(matchBeerInText(aiName, beers, aliasMap, item.degree));
    if (hit) return hit;
  }
  // Poslední záchrana: podle stupně samotné položky. Barvu (světlá/tmavá)
  // NEbereme ze sdíleného raw_line — „tm" u jedné objednávky na řádku nesmí
  // ztmavit i ostatní; neoznačený stupeň znamená v pivovaru světlé.
  if (ownDegree) {
    const candidates = beers.filter((b) => (b.degree || "").replace("°", "").trim() === ownDegree);
    if (candidates.length === 1) return candidates[0].id;
    if (candidates.length > 1) {
      const light = candidates.find((b) => /svetl|svet|light/.test(normText(b.name)));
      if (light) return light.id;
    }
  }
  return null;
}

/**
 * Všechna piva, která text VÝSLOVNĚ jmenuje — ne jen první nález. Počítá se
 * jméno („Jantar", „winter"), naučená zkratka, stupeň s barvou („12sv",
 * „SV 12", „11° sv"), slovo („desítka", „dvanáctky") i samotná barva („tm",
 * „světle"). Holý stupeň („12°", „12 st") další pivo není: „Jantar 12" je
 * jedno pivo, ne Jantar a dvanáctka. Pořadí podle prvního výskytu.
 */
export function pivaJmenovanaVTextu(
  raw: string | null | undefined,
  beers: { id: string; name: string; degree?: string | null; short_name?: string | null }[],
  aliasMap: { beer: Map<string, string>; package: Map<string, string> },
): string[] {
  const nalezena: string[] = [];
  for (const kus of kusyTextu(String(raw || ""))) {
    const text = normText(kus);
    const id = text ? matchBeerInText(text, beers, aliasMap, null) : null;
    if (!id || nalezena.includes(id)) continue;
    // Nález, který stojí jen na holém stupni, se nepočítá.
    const bezStupne = text.replace(/(?:^|[^0-9.,])(?:8|9|1[0-6])\s*(?:°|st(?![a-z]))/g, " ").replace(/\s+/g, " ").trim();
    if (bezStupne !== text && !matchBeerInText(bezStupne, beers, aliasMap, null)) continue;
    nalezena.push(id);
  }
  return nalezena;
}

/** Objem obalu položky v litrech („KEG 50l", „PET 1,5l", „0.33l"); null = neznámý. */
function objemPolozky(item: any): number | null {
  const label = String(item?.package_label ?? "");
  const m = label.match(/(\d+(?:[.,]\d+)?)\s*l(?![a-z])/i) ?? label.match(/(\d+(?:[.,]\d+)?)/);
  const objem = m ? Number(m[1].replace(",", ".")) : Number.NaN;
  return Number.isFinite(objem) && objem > 0 ? objem : null;
}

/**
 * Řádek raw_line, který patří TÉHLE položce — když má raw_line víc řádků
 * (konec řádku, odrážka) a „množství × objem" položky („2x50", „12x1,5") stojí
 * právě na jednom z nich. Vrací ho, jen když ten řádek sám nějaké pivo jmenuje;
 * řádek s holým počtem pod nadpisem („Jantar:" a pod ním „2x30l") pivo neurčí.
 * null = nedá se určit (jeden řádek, shoda na víc řádcích nebo na žádném).
 *
 * K čemu: AI u odpovědi na objednávku vrací výsledný stav celé objednávky
 * a k položkám občas přiloží CELOU citovanou zprávu. Položka, která v ní
 * doslova stojí na jednom řádku, pak má brát pivo z něj, ne ze jména
 * napsaného na jiném řádku (17. 11. 2026, Malešice — viz matchBeerIdBezBarvy).
 */
export function vlastniRadekPolozky(
  item: any,
  beers: { id: string; name: string; degree?: string | null; short_name?: string | null }[],
  aliasMap: { beer: Map<string, string>; package: Map<string, string> },
): string | null {
  const radky = radkyTextu(String(item?.raw_line || ""));
  if (radky.length < 2) return null;
  const ks = Number(item?.quantity ?? item?.qty);
  if (!Number.isInteger(ks) || ks <= 0) return null;
  const objem = objemPolozky(item);
  // „2x50" nesmí sednout na „12x50" ani „2x500"; „12x1" ne na „12x1,5".
  let cislo = "";
  if (objem !== null) {
    const [cele, des = ""] = String(objem).split(".");
    // „0,33" se píše i „0,3".
    cislo = (des ? `${cele}[.,]${des}${des === "33" ? "?" : ""}` : `${cele}(?:[.,]0+)?`) + "(?![0-9]|[.,][0-9])";
  }
  const vzor = new RegExp(`(?:^|[^0-9.,])${ks}\\s*(?:x|×|\\*)\\s*${cislo}`, "i");
  const sedi = radky.filter((r) => vzor.test(r));
  if (sedi.length !== 1) return null;
  return pivaJmenovanaVTextu(sedi[0], beers, aliasMap).length ? sedi[0] : null;
}

// Jak se stupeň a barva píšou v objednávkách slovy, ne číslem: „desítka",
// „dvanáctky", „jedenáctka", „vosma", „ležák", „výčepní", „tmavá", „světlé".
// Zrcadlí BEER_ALIASES v src/lib/orderParser.ts — klient těmhle tvarům rozuměl
// dávno, tahle (serverová) větev ne, takže z „8sudu 30l na pátek, desítka"
// nepoznala pivo vůbec a spolehla se jen na to, co dodala AI.
const SLOVNIK_STUPNU: { pattern: RegExp; degree?: string; color?: 'svetle' | 'tmave' }[] = [
  { pattern: /\bcykl\.?\s*vosm|\bcykloosm|\bcyklo\s*osm|\bvosm(a|u|e|y|icka)?\b|\bosm(a|u|e|y|icka)?\b|\b8\s*st\b/, degree: '8', color: 'svetle' },
  { pattern: /\bdesitk(a|u|e|y|am|ach)?\b|\bdesit\b|\bvycepni\b|\bvycep\b|\bsvetle\s*vycepni\b|\b10\s*(st|sv|cky|ky)\b/, degree: '10', color: 'svetle' },
  { pattern: /\bjedenact(k)?(a|u|e|y)?\b|\b11\s*(st|sv|sl|cky|ky)\b/, degree: '11', color: 'svetle' },
  { pattern: /\bdvanactk(a|u|e|y)?\b|\b12\s*(st|cky|ky)\b|\blezak\b|\bsvetly\s*lezak\b/, degree: '12', color: 'svetle' },
  { pattern: /\btmav(a|y|e|ou|em)?\b|\btmavy\s*lezak\b|\bcern(a|e|y)\b/, color: 'tmave' },
  { pattern: /\bsvetl(a|y|e|ou|em)?\b|\bsvetly\s*lezak\b/, color: 'svetle' },
];

/** Stupeň a barva vyčtené ze slov (ne z číslic). Obojí může vyjít null. */
export function hintyZeSlov(text: string): { degree: string | null; color: 'svetle' | 'tmave' | null } {
  let degree: string | null = null;
  let color: 'svetle' | 'tmave' | null = null;
  for (const s of SLOVNIK_STUPNU) {
    if (!s.pattern.test(text)) continue;
    if (s.degree && !degree) degree = s.degree;
    // Barva: „tmavá" napsaná výslovně přebije obecné „světlé" z jiného pravidla.
    if (s.color === 'tmave') color = 'tmave';
    else if (s.color && !color) color = s.color;
  }
  return { degree, color };
}

// 🧠 Extract degree from text — mirrors client extractDegreeFromRaw.
// Number-first: "11sv", "12tm", "10sv" → returns "11", "12", "10"
// Color-first: "sv 12", "tm 11", "sl 12" → returns "12", "11"
export function extractDegreeFromText(text: string): string | null {
  if (!text) return null;
  // Number-first: "11sv", "11 sl", "12tm"
  const m = text.match(
    /(?:^|[^0-9.])(8|9|10|11|12|13|14|15|16)\s*(?:°|st|sv|svet|svetl|svetly|svetle|sl|tm|tma|tmav|tmavy|tmave|dark)/i
  );
  if (m) return m[1];
  // Color-first: "sv 12", "tm 11", "sl 12", "svetly 12"
  const mf = text.match(
    /(?:^|[^0-9.])(sv|svet|svetl|svetly|svetle|sl|tm|tmav|tmavy|tmave)\s*(8|9|10|11|12|13|14|15|16)(?![0-9.])/i
  );
  if (mf) return mf[2];
  return null;
}

// 🚧 Nese tenhle text vůbec informaci o pivu? Zrcadlí isUsefulBeerAlias
// v src/lib/orderParser.ts — obě strany musí filtrovat stejně, jinak by
// server použil zkratku, kterou si klient odmítl zapamatovat.
export function isUsefulBeerAlias(aliasText: string): boolean {
  const norm = normText(aliasText);
  if (!norm) return false;
  const stripped = norm
    .replace(/\d+\s*[x*]\s*/g, " ")
    .replace(/\d+[.,]?\d*\s*l\b/g, " ")
    .replace(/\b(ks|sud|sudy|sudu|keg|kegy|pet|petka|petky|lahev|lahve|litr|litru|litry)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const letters = stripped.replace(/[^a-z]/g, "");
  if (letters.length >= 3) return true;
  const hasDegree = /(?:^|[^0-9])(8|9|1[0-6])(?![0-9])/.test(stripped);
  const hasColor = /sv|sl\b|tm|svet|tmav|light|dark/.test(stripped);
  return hasDegree && hasColor;
}

// Obecná slova v názvech piv — nejsou vlastní jméno, nesmí samotná piva rozlišovat.
const OBECNA_SLOVA_PIV = new Set([
  "svetla", "svetly", "svetle", "tmava", "tmavy", "tmave", "lezak", "lezaky", "pivo", "nefiltrovane",
  "filtrovane", "vycepni", "special", "light", "dark", "lager", "plzen", "pilsner", "keg", "pet",
  "polotmava", "polotmavy", "sezonni", "cerne", "cerna", "pale",
]);

/**
 * Vlastní jména piv přímo z katalogu (Jantar, Summer, Winter… cokoli, co majitel
 * přidá) — slovo z názvu, které není stupeň ani obecné „světlá/ležák". Kdo ho
 * napíše, myslí právě to pivo. Slovo sdílené víc pivy se nebere (nerozlišuje).
 */
export function vlastniJmenaPiv(beers: { id: string; name: string; short_name?: string | null }[]): Map<string, string> {
  const poSlovech = new Map<string, Set<string>>();
  for (const b of beers) {
    for (const zdroj of [b.name, b.short_name]) {
      for (const w of normText(zdroj || "").split(" ")) {
        if (w.length < 4 || /[0-9°]/.test(w) || OBECNA_SLOVA_PIV.has(w)) continue;
        if (!poSlovech.has(w)) poSlovech.set(w, new Set());
        poSlovech.get(w)!.add(b.id);
      }
    }
  }
  const vysledek = new Map<string, string>();
  for (const [w, ids] of poSlovech) if (ids.size === 1) vysledek.set(w, [...ids][0]);
  return vysledek;
}

// Jak se vlastní jména piv píšou v objednávkách: [vzor v textu, slovo v názvu piva
// z katalogu]. „Polotmavé" (ve všech tvarech) je Jantar — ne tmavá: 13. 10. 2026
// se „3x polotmave 1,5l" četlo jako 12° Tmavá, protože se hledal jen holý tvar
// „polotmav" a „tmav" uvnitř slova pak vybralo tmavou.
const JMENA_PIV_V_TEXTU: [RegExp, string][] = [
  [/\bjantar\b|\bjant\b|\bjantarek\b|\bpolotmav[a-z]*\b/, "jantar"],
  [/\bsummer\b|\bsumr\b/, "summer"],
  [/\bhazy\b|\bipa\b|\bneipa\b/, "hazy"],
  [/\bbunny\b|\bbuni\b/, "bunny"],
];

// Pivo pojmenované vlastním jménem (Jantar, Summer, Hazy, Bunny) — tyhle
// názvy jsou jednoznačné a nesmí je přebít naučená zkratka ani stupeň.
export function matchDistinctiveName(
  text: string,
  beers: { id: string; name: string }[]
): string | null {
  for (const [pattern, token] of JMENA_PIV_V_TEXTU) {
    if (pattern.test(text)) {
      const hit = beers.find((b) => normText(b.name).includes(token));
      if (hit) return hit.id;
    }
  }
  // Cokoli dalšího, co je v katalogu (nové pivo, např. Winter): celé slovo,
  // nebo slovo s příponou („winterka", „winteru").
  const slova = text.split(" ");
  for (const [jmeno, id] of vlastniJmenaPiv(beers)) {
    if (slova.some((w) => w === jmeno || (jmeno.length >= 5 && w.startsWith(jmeno) && w.length <= jmeno.length + 3))) return id;
  }
  return null;
}

/**
 * Naučená zkratka nesmí přebít to, co řádek říká VÝSLOVNĚ. Z provozu 20. 10. 2026:
 * zapamatovaná zkratka „5x 30l 11° sv" → Citron (omylem uložená při opravě
 * posunutého řádku) udělala z „5x 30l 11° Sv" na fotce limonádu. Proto se
 * zkratka zahodí, když
 *   • řádek říká stupeň + sv/tm (11° sv, 12sv, 10 tm) a pivo ze zkratky je limonáda
 *     bez stupně, nebo má jiný stupeň;
 *   • řádek říká „limo" a pivo ze zkratky má stupeň (11° Světlá z „limo citr").
 */
export function aliasOdporujeTextu(
  text: string,
  beerId: string,
  beers: { id: string; name: string; degree?: string | null }[],
): boolean {
  const b = beers.find((x) => x.id === beerId);
  if (!b) return false;
  const stupenPiva = (b.degree || "").replace("°", "").trim();
  const vyslovny = text.match(/(?:^|[^0-9])(8|10|11|12)\s*°?\s*(?:sv|sl|svet\w*|tm|tmav\w*)\b/);
  if (vyslovny && (!stupenPiva || stupenPiva !== vyslovny[1])) return true;
  if (/\blimo\w*\b/.test(text) && stupenPiva) return true;
  return false;
}

export function matchBeerInText(
  text: string,
  beers: { id: string; name: string; degree?: string | null; short_name?: string | null }[],
  aliasMap: { beer: Map<string, string>; package: Map<string, string> },
  rawDegree?: string | null
): string | null {
  if (!text) return null;

  // 1) Přesná shoda s názvem / short_name z katalogu (nejdelší shoda vyhrává)
  let best: string | null = null;
  let bestLen = 0;
  for (const b of beers) {
    for (const name of [b.name, b.short_name]) {
      const n = normText(name || "");
      if (n.length >= 3 && text.includes(n) && n.length > bestLen) {
        best = b.id;
        bestLen = n.length;
      }
    }
  }
  if (best) return best;

  // 1b) Vlastní jméno piva má přednost před naučenými zkratkami.
  // Bez tohohle mohla zapamatovaná zkratka (v produkci se omylem uložilo
  // "jantar" → 12° Světlá) přebít pivo, které je v textu napsané celým jménem.
  // Klientská matchBeerFromHints tuhle pojistku měla, serverová větev ne —
  // a právě ta zakládá objednávky z WhatsAppu.
  const nameGuard = matchDistinctiveName(text, beers);
  if (nameGuard) return nameGuard;

  // 2) Naučené aliasy — od nejdelší k nejkratší, jen ty, které vůbec nesou
  // informaci o pivu. Dřív vyhrála první zkratka v pořadí, v jakém přišla
  // z databáze (tedy náhodně), a zkratky jako "2x10" nebo "7x50" (počet ×
  // objem, o pivu nic) seděly jako podřetězec na spoustu budoucích zpráv.
  // Tohle je příčina toho, že se položky přiřazovaly špatně jen občas.
  const sortedAliases = [...aliasMap.beer.entries()]
    .map(([alias, beerId]) => [normText(alias), beerId] as const)
    .filter(([na]) => na.length >= 2 && isUsefulBeerAlias(na))
    .sort((a, z) => z[0].length - a[0].length);
  for (const [na, beerId] of sortedAliases) {
    if ((text === na || text.includes(na)) && !aliasOdporujeTextu(text, beerId, beers)) return beerId;
  }

  // 2b) OCR opravy názvů piv (seeger/zeeburg → seeberg)
  const ocrText = text
    .replace(/\bse[eé]berg\b/g, "seeberg")
    .replace(/\bzeeburg\b/g, "seeberg");
  if (ocrText !== text) {
    for (const b of beers) {
      const n = normText(b.name);
      if (n.length >= 3 && ocrText.includes(n)) return b.id;
    }
  }

  // 2c) Fuzzy shoda s názvy z katalogu aplikace (překlepy, OCR šum).
  //     Primárně párujeme s databází, ne s tím, co si vymyslela AI.
  let fuzzyBest: string | null = null;
  let fuzzyScore = 0;
  for (const b of beers) {
    const n = normText(b.name);
    if (n.length < 4) continue;
    const s = bestFuzzyScoreInText(n, ocrText);
    if (s > fuzzyScore) { fuzzyScore = s; fuzzyBest = b.id; }
  }
  if (fuzzyBest && fuzzyScore >= 0.72) return fuzzyBest;

  // 2d) Rozlišující slovo přímo ze jména piva (vlastní jméno jako
  // Jantar/Summer/Hazy/Bunny, ne obecné "světlé/tmavé") — má přednost
  // před shodou podle stupně. Bez tohohle by sezonní pivo bez vlastního
  // stupně v katalogu (např. "Summer Ale") přebilo jiné pivo se stejným
  // stupněm, protože OCR text má jen "summer", ne celé "summer ale"
  // (na to fuzzy shoda výše nestačí — chybí celé slovo "ale").
  for (const [pattern, token] of JMENA_PIV_V_TEXTU) {
    if (pattern.test(text)) {
      const hit = beers.find((b) => normText(b.name).includes(token));
      if (hit) return hit.id;
    }
  }

  // 3) Podle stupně (rozlišení světlá/tmavá, 12° má 2 piva v katalogu).
  //    Stupeň se bere z číslic, ze slov („desítka", „dvanáctky"), a teprve
  //    nakonec z toho, co k položce přiložila AI.
  const slovy = hintyZeSlov(text);
  const degree = (extractDegreeFromText(text) || slovy.degree || rawDegree || "").replace("°", "").trim();
  if (degree) {
    const candidates = beers.filter((b) => (b.degree || "").replace("°", "").trim() === degree);
    if (candidates.length === 1) return candidates[0].id;
    if (candidates.length > 1) {
      if (/(?<!polo)tmav|dark|tl\b|cerne|cerna/.test(text) || slovy.color === 'tmave') {
        const dark = candidates.find((b) => /tmav|dark/.test(normText(b.name)));
        if (dark) return dark.id;
      }
      // Neoznačený stupeň znamená světlé — tmavé se v objednávce vždycky
      // napíše. Dřív se při nerozhodném stavu nevrátilo nic (u „1x50 12"),
      // nebo rozhodlo pořadí piv z databáze.
      const light = candidates.find((b) => /svetl|svet|light/.test(normText(b.name)));
      if (light) return light.id;
    }
  }
  // 4) Barva bez stupně („2x30l světle", „5xbasa tm.", „Tm: 2x30l") — v katalogu je jen
  //    jedno tmavé pivo, u světlých bere přednost 12° ležák (výchozí pivo
  //    pivovaru), pokud text neříká jinak.
  const barvaTextu = slovy.color ?? barvaVTextu(text);
  if (!degree && barvaTextu) {
    if (barvaTextu === 'tmave') {
      const dark = beers.find((b) => /tmav|dark/.test(normText(b.name)));
      if (dark) return dark.id;
    } else {
      const svetla12 = beers.find((b) => (b.degree || "").replace("°", "").trim() === '12' && /svetl/.test(normText(b.name)));
      if (svetla12) return svetla12.id;
    }
  }
  return null;
}

/**
 * Ručně psané „1l" AI často přečte jako „11": „10x 1l 11°sv." → „10x 11 11°sv.".
 * Číslo hned za „Nx" následované dalším stupněm (11°, 12sv…) je objem 1 l (PET),
 * ne stupeň — a už vůbec ne výchozí sud 30 l.
 */
export function jeLitrPsanyJakoJedenact(raw: string): boolean {
  const t = normText(raw);
  return /(?:^|\s)\d{1,3}\s*x\s+(?:11|1l)\s+\d{1,2}\s*(?:°|sv|tm)/.test(t);
}

// Před číslem objemu nesmí stát číslice ani desetinná čárka („150l" není 50 l,
// „10,5" není 0,5); za „l" nesmí pokračovat slovo („10 lahví", „1 limo" objem nejsou).
const PRED_CISLEM = "(?:^|[^0-9.,])";
const LITR = "\\s*l(?:itr[a-z]*)?(?![a-z0-9])";
const SUDY_L = [50, 30, 20, 15, 10];

/**
 * Objemy obalů, které text říká VÝSLOVNĚ: číslem s jednotkou („30l", „50 litrů",
 * „1,0l"), desetinným číslem lahve („0,33", „0,5", „1,5"), slovem („třetinky",
 * „půllitr") nebo u sudu („keg 30", „sud 50").
 *
 * Holé číslo sem NEPATŘÍ: „4x10" pod nadpisem „petky 1,5l:" je čtyřikrát
 * desítka, ne sud 10 l, a „sud 10" může být sud desítky. Co tahle funkce vrátí,
 * to v řádku opravdu stojí — proto to smí přebít i obal od AI (viz
 * obalVyslovneVRadku). „1.5" s tečkou bez „l" se bere jen u petek („na 1.5."
 * je datum).
 */
export function objemyVyslovneVTextu(raw: string | null | undefined): number[] {
  const t = normText(String(raw || ""));
  if (!t) return [];
  const nalezene: number[] = [];
  const pridej = (v: number) => { if (!nalezene.includes(v)) nalezene.push(v); };
  const ma = (vzor: string) => new RegExp(vzor).test(t);
  for (const v of SUDY_L) {
    if (ma(`${PRED_CISLEM}${v}${LITR}`) || (v !== 10 && ma(`\\b(?:sud[a-z]*|soud[a-z]*|keg[a-z]*)\\s*${v}(?![0-9.,°])(?!\\s*(?:ks|kus|x(?![a-z])))`))) pridej(v);
  }
  if (ma(`${PRED_CISLEM}1,50?(?![0-9])`) || ma(`${PRED_CISLEM}1\\.50?${LITR}`) || (/\bpet/.test(t) && ma(`${PRED_CISLEM}1\\.50?(?![0-9.])`))) pridej(1.5);
  if (ma(`${PRED_CISLEM}1(?:[.,]0)?${LITR}`)) pridej(1);
  if (ma(`${PRED_CISLEM}0[.,]50?(?![0-9])`) || ma(`${PRED_CISLEM}05${LITR}`) || ma(`${PRED_CISLEM}500\\s*ml(?![a-z])`) || /(?:^|[^a-z])pul\s?litr/.test(t)) pridej(0.5);
  if (ma(`${PRED_CISLEM}0[.,]33?(?![0-9])`) || ma(`${PRED_CISLEM}033${LITR}`) || ma(`${PRED_CISLEM}330\\s*ml(?![a-z])`) || /(?:^|[^a-z])tretin/.test(t)) pridej(0.33);
  return nalezene;
}

/**
 * Kusy raw_line, které patří TÉHLE položce — jako usekyPolozky, ale dělí se
 * i tam, kde na řádku začíná další „množství × …" bez oddělovače („2x50 12sv
 * 1x30l jantar" jsou dva kusy). Řádek o jediném kusu patří položce celý;
 * jinak se berou kusy s jejím množstvím. Prázdné pole = nedá se určit.
 */
function kusyPolozky(item: any): string[] {
  const kusy = kusyTextu(String(item?.raw_line || ""));
  if (kusy.length <= 1) return kusy;
  const ks = Number(item?.quantity ?? item?.qty);
  if (!Number.isFinite(ks) || ks <= 0) return [];
  const ksRe = new RegExp(`(?:^|[^0-9.,])${ks}\\s*(?:x|×|\\*|ks|kus|bed)|(?:x|×|\\*)\\s*${ks}(?![0-9.,])`, "i");
  return kusy.filter((u) => ksRe.test(u));
}

/**
 * Mluví řádek jen o JEDNÉ položce? „3x 15l desítka" ano; „12sv: 3x50l + 4x30l"
 * nebo „2x50 12sv 1x30l jantar" ne — takový řádek sdílí víc položek a nejde
 * poznat, které z nich patří (naučená oprava by platila všem).
 */
export function jeRadekJednePolozky(raw: string | null | undefined): boolean {
  const useky = String(raw || "").split(USEKY_RE).map(ocisti).filter(Boolean);
  if (useky.length !== 1) return false;
  // Nejvýš jedno „množství × …": „Tm: 2x30l" je jedna položka s nadpisem před počtem.
  return (useky[0].match(/(?:^|[^0-9.,])\d{1,4}\s*(?:x|×|\*)\s*\d/gi) ?? []).length <= 1;
}

/**
 * Obal, který řádek položky říká VÝSLOVNĚ — a který proto platí, ať AI vrátila
 * cokoli. null = řádek sám obal jednoznačně neurčuje (rozhodne zbytek
 * matchPackageId).
 *
 * Proč: 6. 10. 2026 (Maneo) se „3x 15l 10° Desítka" zapsalo jako 20 l, „2x 10l"
 * jako 15 l a „12x 1l" jako 1,5 l, 9. 11. 2026 (Lužec) se „Sklo 0,33l" četlo
 * jako 0,5 l. AI tehdy dostávala „naučené zkratky" typu „15l → 20l" (uložené
 * potichu z ručních úprav objednávek) a řídila se jimi; obal od AI měl přednost
 * před tím, co v řádku stojí. Zadání majitele 23. 11. 2026: „0,33 musí přiřadit
 * 0,33 a ne 0,5 nikdy".
 *
 * Platí jen to, co je jednoznačné: všechny kusy řádku, které položce patří
 * (podle jejího množství), musí říkat tentýž jediný objem. „12x30l + 12xpet
 * 1,0l" (dvě položky se stejným počtem) ani řádek bez objemu neurčí nic.
 * U výsledného stavu upravované objednávky s textem CITOVANÉ zprávy (z_citace)
 * se z textu nečte — odpověď mohla obal změnit (viz matchBeerId).
 */
export function obalVyslovneVRadku(
  item: any,
  packages: { id: string; label: string; volume_l?: number | null }[],
): string | null {
  if (item?.z_citace === true) return null;
  const kusy = kusyPolozky(item);
  if (!kusy.length) return null;
  let objem: number | null = null;
  for (const kus of kusy) {
    const objemy = objemyVyslovneVTextu(kus);
    if (objemy.length !== 1) return null;
    if (objem !== null && objem !== objemy[0]) return null;
    objem = objemy[0];
  }
  if (objem === null) return null;
  return packages.find((p) => Number(p.volume_l) === objem)?.id ?? null;
}

/** Slova, kterými se v objednávkách píšou lahve a bedny („2 basy sklo", „5 beden světlého"). */
const SKLO_RE = /\b(sklo|skla|lahve?|lahev|lahvi|basy?|basa|basu|bedn[aeyu]|beden|prepravk[aeyu]|prepravek|flas\w*)\b/;

/** Řádek mluví o lahvích nebo bednách a velikost lahve (0,33 / 0,5) v něm nestojí. */
export function jeLahevBezObjemu(rawLine: string | null | undefined): boolean {
  const t = normText(String(rawLine || ""));
  return SKLO_RE.test(t) && !objemyVyslovneVTextu(t).some((v) => v === 0.33 || v === 0.5);
}

/**
 * Smí naučená zkratka (parser_aliases) určit obal? Jen když je to opravdu
 * POJMENOVÁNÍ obalu slovem („malý soudek", „petka", „basa") a sama žádný objem
 * neříká. Zkratky se do 23. 11. 2026 ukládaly potichu z každé ruční změny
 * a většina z nich pravidlem není:
 *   • „30l" → 1 l, „keg 15l" → 20 l, „lahve 0.5l" → 0,33 l — text sám říká jiný
 *     objem; je-li stejný, je zkratka zbytečná (objem z textu se čte i bez ní);
 *   • „2x10" → 30 l, „12° svetla" → 0,5 l — počet nebo jméno piva, o obalu nic.
 */
export function zkratkaObaluPlati(aliasText: string | null | undefined): boolean {
  const t = normText(String(aliasText || ""));
  if (!t || objemyVyslovneVTextu(t).length) return false;
  return /\b(sud[a-z]{0,2}|soud[a-z]{2,3}|keg[a-z]{0,2}|pet|pet[a-z]{2,3}|lahev|lahv[a-z]{1,3}|flas[a-z]{0,3}|skl[oa]|bas[a-z]?|bedn[a-z]{1,2}|beden|plech[a-z]{0,4}|karton[a-z]{0,2}|mal[a-z]{1,2}|velk[a-z]{1,2})\b/.test(t);
}

export type VolbyObalu = {
  /**
   * Velikost lahve (0,33 nebo 0,5 l), kterou odběratel bere — z jeho posledních
   * objednávek (viz _shared/zvyk-lahve.ts). Použije se JEN u položky, jejíž
   * řádek velikost lahve neudává; bez ní platí 0,5 l.
   */
  lahevOdberatele?: number | null;
};

/**
 * Velikost skleněné lahve pro položku, jejíž řádek ji neudává. null = nechat,
 * co k položce přiřadila AI.
 *
 *   • odběratel bere třetinky → 0,33 l. I u řádku, kde slovo „bedna" není:
 *     „5 beden světlého a 3 tmavého" AI rozdělí a druhá položka má jen „3 tmavého";
 *   • jinak řádek o lahvích/bednách („2 basy sklo") → 0,5 l, i když AI vrátila
 *     0,33 (2. 11. 2026: „A ještě prosím dvě basy sklo 12sv" vyšlo jako 0,33 l);
 *   • řádek bez slova o lahvích a bez zvyku → nic (velikost mohla AI vzít
 *     z nadpisu zprávy, který v řádku položky není).
 */
export function lahevBezUdaneVelikosti(rawLine: string | null | undefined, lahevOdberatele?: number | null): 0.33 | 0.5 | null {
  const t = normText(String(rawLine || ""));
  if (objemyVyslovneVTextu(t).some((v) => v === 0.33 || v === 0.5)) return null;
  if (lahevOdberatele === 0.33) return 0.33;
  return SKLO_RE.test(t) ? 0.5 : null;
}

export function matchPackageId(
  item: any,
  packages: { id: string; label: string; volume_l?: number | null }[],
  aliasMap: { beer: Map<string, string>; package: Map<string, string> },
  volby: VolbyObalu = {},
): string | null {
  // 0) Co v řádku položky stojí výslovně („15l", „0,33", „třetinky"), platí vždy.
  const vyslovne = obalVyslovneVRadku(item, packages);
  if (vyslovne) return vyslovne;

  // Primárně párujeme z package_label od AI — to je obal KONKRÉTNÍ položky.
  // ⚠️ raw_line může obsahovat VÍCE obalů najednou (např. "SV 12 = 3x50l KEG +
  // 24x1,5l PET + 20x0,5l lahev") — párovat proti celému raw_line by přiřadilo
  // všem položkám řádku jeden (nejdelší) obal. raw_line použij JEN jako zálohu,
  // když AI obal nevrátila.
  // Desetinná čárka jako tečka („0,5l" = obal „0.5l"), jinak by přesná shoda
  // s názvem obalu níž „0,5l" nepoznala (12. 10. 2026: „20x 0,5l 10°" → 10l).
  const tecka = (t: string) => t.replace(/(\d),(\d)/g, "$1.$2");
  const rawText = tecka(normText(item.raw_line || ""));
  // „2 basy sklo" / „5 beden světlého" bez udané velikosti lahve: rozhoduje, co
  // odběratel bere (volby.lahevOdberatele), jinak lahev 0,5 l. AI velikost
  // neurčuje — z provozu 2. 11. 2026 jí „A ještě prosím dvě basy sklo 12sv"
  // vyšlo jako 0,33 l, a naopak Lužci, který bere jen třetinky, se 9. 11. 2026
  // „5 beden světlého a 3 tmavého" zapsalo jako 0,5 l. Velikost napsanou
  // v řádku („0,33", „třetinky") řeší krok 0 výš.
  const lahev = volby.lahevOdberatele === 0.33 ? 0.33 : 0.5;
  let labelText = tecka(normText(item.package_label || ""));
  if (/(?:^|[^0-9.])0\.(?:33|5)(?![0-9])/.test(labelText)) {
    const velikost = lahevBezUdaneVelikosti(item.raw_line, volby.lahevOdberatele);
    if (velikost) labelText = `${velikost}l`;
  }
  const text = labelText || rawText;
  if (!text) return null;

  // Ručně psané „1l" přečtené jako „11" → PET/lahev 1 l (AI k tomu dává výchozí KEG 30l).
  if (jeLitrPsanyJakoJedenact(item.raw_line || "") && !/\b(keg|sud)\s*(50|20|15|10)/.test(labelText)) {
    const hit = packages.find((p) => Number(p.volume_l) === 1) ?? packages.find((p) => /(^|\D)1\s*l/i.test(p.label));
    if (hit) return hit.id;
  }

  // 1) Přesná shoda s názvem obalu (např. "50l")
  let best: string | null = null;
  let bestLen = 0;
  for (const p of packages) {
    const n = normText(p.label);
    if (n.length >= 2 && text.includes(n) && n.length > bestLen) {
      best = p.id;
      bestLen = n.length;
    }
  }
  if (best) return best;

  // 2) Konkrétní objemy z textu (stejná pravidla jako při čtení z fotky /
  //    ručním zadání) — primárně párujeme s obaly v databázi aplikace.
  // Je v textu tenhle objem? Hranice slova (\b) tu nestačila: v zápisech
  // „13x50l", „4x30" ani „2x20l" před číslem žádná hranice NENÍ — „x" i „l"
  // jsou znaky slova — takže `\b50\s*l?\b` nesedlo právě na nejběžnější tvar
  // a obal se z textu nepoznal. Číslo proto ohraničujeme tím, že před ním ani
  // za ním nesmí stát další číslice (ať „150" není „50" a „1,5" není „1").
  // Číslo je objem, když za ním stojí „l" (50l), nebo když za ním nestojí „x"
  // — to by z něj dělalo množství: v „20x0,5l" je objem 0,5, ne 20.
  const maObjem = (v: number): boolean => {
    const cislo = String(v).replace('.', '[.,]');
    // Za číslem nesmí být „°" — „10°" je stupeň, ne sud 10 l.
    return new RegExp(`(?:^|[^0-9.,])${cislo}(?:\\s*l\\b|(?![0-9.,x°]))`, 'i').test(text);
  };

  const pickVol = (v: number): string | null => {
    const byVol = packages.find((p) => Number(p.volume_l) === v);
    if (byVol) return byVol.id;
    return null;
  };

  // 1b) POJISTKA: holé číslo "15" (BEZ desetinné čárky) vedle slova
  // "pet"/"petka"/"petr" je skoro jistě "1,5" se ztracenou čárkou (AI/OCR
  // chyba: "PET 1,5" → "PET 15"), NE sud 15l — bez tohohle by ho o pár
  // řádků níž chytil regex pro sud/KEG 15l. Úzce cílené: nezasahuje do
  // jiných případů (např. objednávka od odběratele se jménem "Petr"),
  // protože se aktivuje JEN když je v textu doslova holé "15" a NENÍ tam
  // slovo "keg"/"sud". Skutečné "1,5"/"1.5" (s čárkou/tečkou) už správně
  // řeší pravidlo níže samo o sobě.
  if (
    /\bpet\b|\bpetka\b|\bpetky\b|\bpetr\b/i.test(text) &&
    !/\bkeg\b|\bsud\b/i.test(text) &&
    /\b15\b/.test(text) &&
    !/\b1[,.]5\b/.test(text)
  ) {
    const hit = pickVol(1.5) ?? packages.find((p) => /1[,.]5/i.test(p.label))?.id ?? null;
    if (hit) return hit;
  }

  if (maObjem(50) || /\bsud50\b|\bkeg50\b|\bvelky\s*sud\b|\bsud\s*50\b|\bkeg\s*50\b/i.test(text)) {
    const hit = pickVol(50) ?? packages.find((p) => /50/i.test(p.label))?.id ?? null;
    if (hit) return hit;
  }
  if (maObjem(30) || /\bsud30\b|\bkeg30\b|\bmaly\s*sud\b|\bsud\s*30\b|\bkeg\s*30\b/i.test(text)) {
    const hit = pickVol(30) ?? packages.find((p) => /30/i.test(p.label))?.id ?? null;
    if (hit) return hit;
  }
  if (maObjem(20) || /\bsud20\b|\bkeg20\b|\bsud\s*20\b|\bkeg\s*20\b/i.test(text)) {
    const hit = pickVol(20) ?? packages.find((p) => /20/i.test(p.label))?.id ?? null;
    if (hit) return hit;
  }
  if (maObjem(15) || /\bsud15\b|\bkeg15\b|\bsud\s*15\b|\bkeg\s*15\b/i.test(text)) {
    const hit = pickVol(15) ?? packages.find((p) => /15/i.test(p.label))?.id ?? null;
    if (hit) return hit;
  }
  if (maObjem(10) || /\bsud10\b|\bkeg10\b|\bsud\s*10\b|\bkeg\s*10\b/i.test(text)) {
    const hit = pickVol(10) ?? packages.find((p) => /10/i.test(p.label))?.id ?? null;
    if (hit) return hit;
  }
  if (maObjem(1.5) || /\bpetka\b/i.test(text)) {
    const hit = pickVol(1.5) ?? packages.find((p) => /1[,.]5/i.test(p.label))?.id ?? null;
    if (hit) return hit;
  }
  if (/(?<!\d)\b1\s*l\b(?!\s*[,.]?\s*5)/i.test(text)) {
    const hit = pickVol(1) ?? packages.find((p) => /1\s*l/i.test(p.label))?.id ?? null;
    if (hit) return hit;
  }
  if (maObjem(0.33) || /\btretinka\b|\btřetinka\b/i.test(text)) {
    const hit = pickVol(0.33) ?? packages.find((p) => /0[,.]33/i.test(p.label))?.id ?? null;
    if (hit) return hit;
  }
  if (maObjem(0.5) || /\bpullitr\b|\bpůllitr\b/i.test(text)) {
    const hit = pickVol(0.5) ?? packages.find((p) => /0[,.]5|lahv/i.test(p.label))?.id ?? null;
    if (hit) return hit;
  }
  if (/\blahve?\b|\bsklo\b|\bflas\b/i.test(text)) {
    const hit = (lahev === 0.33 ? pickVol(0.33) : null)
      ?? packages.find((p) => Number(p.volume_l) === 0.5 || /0[,.]5|lahv/i.test(p.label))?.id ?? null;
    if (hit) return hit;
  }
  if (/\bkeg\b|\bsud\b/i.test(text)) {
    const hit = pickVol(30);
    if (hit) return hit;
  }

  // 3) Naučené aliasy — jen ty, které obal opravdu pojmenovávají (zkratkaObaluPlati).
  for (const [alias, pkgId] of aliasMap.package) {
    const na = normText(alias);
    if (na.length >= 2 && zkratkaObaluPlati(na) && (text === na || text.includes(na))) return pkgId;
  }

  // 4) Fuzzy shoda s názvy obalů z katalogu aplikace
  let fuzzyBest: string | null = null;
  let fuzzyScore = 0;
  for (const p of packages) {
    const n = normText(p.label);
    if (n.length < 3) continue;
    const s = bestFuzzyScoreInText(n, text);
    if (s > fuzzyScore) { fuzzyScore = s; fuzzyBest = p.id; }
  }
  if (fuzzyBest && fuzzyScore >= 0.72) return fuzzyBest;

  return null;
}
