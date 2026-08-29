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

export function matchBeerId(
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

  const rawText = normText([item.raw_line, item.degree].filter(Boolean).join(" "));
  if (rawText) {
    const hit = neodporuje(matchBeerInText(rawText, beers, aliasMap, item.degree));
    if (hit) return hit;
  }
  const aiName = normText(item.beer_name || "");
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

// Pivo pojmenované vlastním jménem (Jantar, Summer, Hazy, Bunny) — tyhle
// názvy jsou jednoznačné a nesmí je přebít naučená zkratka ani stupeň.
export function matchDistinctiveName(
  text: string,
  beers: { id: string; name: string }[]
): string | null {
  const hints: [RegExp, string][] = [
    [/\bjantar\b|\bjant\b|\bjantarek\b|\bpolotmav\b/, "jantar"],
    [/\bsummer\b|\bsumr\b/, "summer"],
    [/\bhazy\b|\bipa\b|\bneipa\b/, "hazy"],
    [/\bbunny\b|\bbuni\b/, "bunny"],
  ];
  for (const [pattern, token] of hints) {
    if (pattern.test(text)) {
      const hit = beers.find((b) => normText(b.name).includes(token));
      if (hit) return hit.id;
    }
  }
  return null;
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
    if (text === na || text.includes(na)) return beerId;
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
  const DISTINCTIVE_NAME_HINTS: [RegExp, string][] = [
    [/\bjantar\b|\bjant\b|\bjantarek\b|\bpolotmav\b/, "jantar"],
    [/\bsummer\b|\bsumr\b/, "summer"],
    [/\bhazy\b|\bipa\b|\bneipa\b/, "hazy"],
    [/\bbunny\b|\bbuni\b/, "bunny"],
  ];
  for (const [pattern, token] of DISTINCTIVE_NAME_HINTS) {
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
      if (/tmav|dark|tl\b|cerne|cerna/.test(text) || slovy.color === 'tmave') {
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
  // 4) Barva bez stupně („2x30l světle", „5xbasa tm.") — v katalogu je jen
  //    jedno tmavé pivo, u světlých bere přednost 12° ležák (výchozí pivo
  //    pivovaru), pokud text neříká jinak.
  if (!degree && slovy.color) {
    if (slovy.color === 'tmave') {
      const dark = beers.find((b) => /tmav|dark/.test(normText(b.name)));
      if (dark) return dark.id;
    } else {
      const svetla12 = beers.find((b) => (b.degree || "").replace("°", "").trim() === '12' && /svetl/.test(normText(b.name)));
      if (svetla12) return svetla12.id;
    }
  }
  return null;
}

export function matchPackageId(
  item: any,
  packages: { id: string; label: string; volume_l?: number | null }[],
  aliasMap: { beer: Map<string, string>; package: Map<string, string> }
): string | null {
  // Primárně párujeme z package_label od AI — to je obal KONKRÉTNÍ položky.
  // ⚠️ raw_line může obsahovat VÍCE obalů najednou (např. "SV 12 = 3x50l KEG +
  // 24x1,5l PET + 20x0,5l lahev") — párovat proti celému raw_line by přiřadilo
  // všem položkám řádku jeden (nejdelší) obal. raw_line použij JEN jako zálohu,
  // když AI obal nevrátila.
  const labelText = normText(item.package_label || "");
  const rawText = normText(item.raw_line || "");
  const text = labelText || rawText;
  if (!text) return null;

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
    return new RegExp(`(?:^|[^0-9.,])${cislo}(?:\\s*l\\b|(?![0-9.,x]))`, 'i').test(text);
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
    const hit = packages.find((p) => Number(p.volume_l) === 0.5 || /0[,.]5|lahv/i.test(p.label))?.id ?? null;
    if (hit) return hit;
  }
  if (/\bkeg\b|\bsud\b/i.test(text)) {
    const hit = pickVol(30);
    if (hit) return hit;
  }

  // 3) Naučené aliasy
  for (const [alias, pkgId] of aliasMap.package) {
    const na = normText(alias);
    if (na.length >= 2 && (text === na || text.includes(na))) return pkgId;
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
