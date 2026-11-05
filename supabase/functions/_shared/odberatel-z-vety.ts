// 🗣️ Odběratel z věty „Na Patejdovku:" — záchrana, když AI jméno nevrátí.
// ---------------------------------------------------------------------------
// Z provozu 5. 11. 2026: zpráva
//     Na pristi tyden na Patejdovku:
//     30x30l 11sv
//     15x30l limo citron
// skončila jako „Neznámý odběratel". Majitel: „pro Patejdlovku — to znamená,
// že odběratel je Patejdlovka… tohle musí aplikace umět přečíst."
//
// Odběratele normálně čte AI (parse-order-text) a server i appka ho pak srovnají
// s katalogem (place-match.ts). Zdarma dostupné modely ho ale u věty se 4. pádem
// („na Patejdovku") a s termínem před jménem („na příští týden") občas nevrátí —
// a pak už není z čeho jméno složit: celý text se s katalogem páruje jen po
// slovech a NOVÝ odběratel v katalogu není. Tohle pravidlo na modelu nezávisí:
// „na / pro + jméno" v záhlaví zprávy je odběratel.
//
// Používá se jen jako ZÁLOHA — jméno od AI a shoda s katalogem mají přednost
// (viz `resolvePlace` v place-match.ts). Záměrně úzké: raději žádný odběratel
// než špatný, protože objednávka u cizího zákazníka je horší než neznámá.
//
// Úzké je to proto, že první verze (každé „na / pro / do + slovo") se při
// ověření na 437 skutečných zprávách ze skupiny pivovaru trefovala špatně:
// zákazník z „do práce", z „na rampu", z „na degustace", jen půlka objednávky
// se dvěma zákazníky („pro X a Y") a místo dodání místo zákazníka („Nováková
// do Plzně"). Proto teď platí:
//  - jen zpráva, která vypadá jako objednávka (je v ní množství),
//  - jen „na" a „pro" — „do" je skoro vždy místo dodání, ne zákazník,
//  - víc různých jmen v záhlaví nebo „X a Y" = nejasné = nic,
//  - víceslovné jméno jen ve tvaru, který je opravdu jméno (viz `jmenoZaPredlozkou`).
//
// Soubor je záměrně bez závislostí: běží v Deno (edge funkce), v prohlížeči
// i ve vitestu.

export type OdberatelZVety = {
  /** Jméno přesně tak, jak je ve zprávě („Patejdovku") — pro porovnání s tím, co přečetla AI. */
  zapsano: string;
  /** Jméno v 1. pádu („Patejdovka") — to se nabízí jako odběratel. */
  nominativ: string;
};

/** Kolik neprázdných řádků od začátku zprávy se prohledává (záhlaví). */
const RADKU_ZAHLAVI = 3;
/** Nejvíc slov jména („pivovar Brána", „U Dubu", „Lokálka Říčany"). */
const NEJVIC_SLOV = 3;
/** Za druhem provozovny smí jméno pokračovat předložkou („Restauraci Na Růžku"). */
const NEJVIC_SLOV_S_PREDLOZKOU = 4;
const NEJVIC_ZNAKU = 40;

const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const mnozina = (...slova: string[]) => new Set(slova);

/** Termíny a dny — „na příští týden", „na zítra", „na středu", „do pátku", „na Vánoce". */
const TERMIN = mnozina(
  'pristi', 'pristim', 'pristiho', 'priste', 'tento', 'tenhle', 'tohle', 'tuhle', 'dalsi', 'dalsim',
  'nasledujici', 'nadchazejici', 'minuly', 'minuleho', 'zitra', 'zitrek', 'dnes', 'dneska', 'dnesni',
  'vcera', 'pozitri', 'tyden', 'tydne', 'tydnu', 'tydny', 'mesic', 'mesice', 'konec', 'konce', 'konci',
  'zacatek', 'zacatku', 'rano', 'dopoledne', 'odpoledne', 'vecer', 'noc', 'vikend', 'vikendu',
  'svatek', 'svatku', 'prazdniny', 'vanoce', 'vanoc', 'vanocni', 'velikonoce', 'velikonoc', 'velikonocni',
  'pondeli', 'utery', 'streda', 'stredu', 'stredy', 'ctvrtek', 'ctvrtka', 'ctvrtku', 'patek', 'patka', 'patku',
  'sobota', 'sobotu', 'soboty', 'nedele', 'nedeli',
  'po', 'ut', 'st', 'ct', 'pa', 'so', 'ne',
  'leden', 'ledna', 'unor', 'unora', 'brezen', 'brezna', 'duben', 'dubna', 'kveten', 'kvetna',
  'cerven', 'cervna', 'cervenec', 'cervence', 'srpen', 'srpna', 'zari', 'rijen', 'rijna',
  'listopad', 'listopadu', 'prosinec', 'prosince',
);

/** „Pro mě", „pro nás", „pro všechny" — nejmenují odběratele (a „pro mě" řeší place-match jinde). */
const ZAJMENO = mnozina(
  'me', 'mne', 'mi', 'sebe', 'nas', 'nam', 'vas', 'vam', 'tebe', 'tobe', 'ni', 'nej', 'nich', 'nic',
  'vse', 'vsechny', 'vsechno', 'zbytek', 'ostatni', 'toho', 'tu', 'to', 'ten', 'ta', 'tyto',
  'jejich', 'jeho', 'jeji', 'jejim', 'nase', 'nasi', 'vase', 'vasi', 'moje', 'moji', 'svuj', 'sve',
  'tech', 'teho', 'tom', 'tomu', 'tamten', 'tamto',
);

/** Obecná slova objednávky, která nejsou jméno. */
const OBECNE = mnozina(
  'akci', 'akce', 'objednavku', 'objednavka', 'objednavky', 'fakturu', 'faktura', 'zavoz', 'zavozu',
  'rozvoz', 'rozvozu', 'vyzvednuti', 'vyzvednout', 'dodani', 'dodavku', 'dodavka', 'cenu', 'cena',
  'kc', 'korun', 'litr', 'litru', 'litry', 'zalohu', 'zalohy', 'zalohou',
  // místa uvnitř pivovaru a běžná „kam to hodit" — zákazník to není
  'rampu', 'rampy', 'rampa', 'vydejku', 'vydejka', 'vydejky', 'stranu', 'komisi', 'balicek', 'mail',
  'mailu', 'sklep', 'sklepa', 'obed', 'obeda', 'vodu', 'voda', 'vzduch', 'vzduchu', 'otocku', 'varku',
  'varka', 'laborator', 'laboratore',
  // vzorky a ochutnávky — „na degustace" je účel, ne zákazník
  'degustace', 'degustaci', 'degustacni', 'vzorky', 'vzorek', 'ochutnavku', 'ochutnavka',
);

/** Pivo, obaly a množství — „pro 2x30", „na keg", „pro svetle". */
const OBAL_A_PIVO = mnozina(
  'keg', 'kegy', 'kegu', 'sud', 'sudy', 'sudu', 'sudech', 'pet', 'petky', 'petka', 'lahev', 'lahve',
  'lahvi', 'lahvich', 'bedna', 'bedny', 'beden', 'bednu', 'paleta', 'palety', 'paletu',
  'svetle', 'svetly', 'svetlou', 'svetleho', 'tmave', 'tmavy', 'tmavou', 'tmaveho',
  'pivo', 'piva', 'pivko', 'piv', 'limo', 'limonady', 'limonadu', 'kusu', 'kusy', 'ks',
  'cca', 'asi', 'priblizne', 'pouze', 'jen', 'tak', 'tedy', 'pak', 'jeste', 'take', 'taky', 'plus', 'jako',
);

/** Zdvořilosti a slovesa — jméno jimi končí („pro Pohodu prosím 3x30"). */
const SLOVA_VETY = mnozina(
  'prosim', 'prosime', 'dekuji', 'dekujeme', 'diky', 'dik', 'ahoj', 'cau', 'zdravim', 'pozdravem',
  'hezky', 'dobry', 'den', 'prijedu', 'prijede', 'prijedeme', 'vyzvedne', 'vyzvedneme', 'pojedu',
  'pojede', 'poslat', 'poslete', 'posli', 'privezu', 'privezeme', 'privezte', 'chci', 'chceme',
  'potrebuji', 'potrebujeme', 'objednavam', 'objednavame', 'bude', 'budou', 'bylo', 'je', 'jsou',
  'jsme', 'mame', 'mam', 'mate', 'mas', 'si',
);

/** Předložky a spojky: jméno jimi začít nemůže a (až na výjimku níž) jimi končí. */
const SPOJKY = mnozina('na', 'pro', 'do', 'od', 'z', 'ze', 'k', 'ke', 'v', 've', 's', 'se', 'a', 'i', 'nebo', 'ale', 'pri', 'pod', 'nad', 'za', 'mezi', 'bez');

/** Druh provozovny — za ním smí jméno pokračovat předložkou („Restauraci Na Růžku"). */
const DRUH_PROVOZOVNY = mnozina(
  'restaurace', 'restauraci', 'restaurant', 'hospoda', 'hospodu', 'hospody', 'hostinec', 'hostinci',
  'pivnice', 'pivnici', 'bar', 'baru', 'vinarna', 'vinarnu', 'kavarna', 'kavarnu', 'penzion', 'penzionu',
  'hotel', 'hotelu', 'pub', 'klub', 'klubu', 'bistro', 'cukrarna', 'cukrarnu', 'pivovar', 'pivovaru',
);
const PREDLOZKY_VE_JMENE = mnozina('na', 'u', 'v', 've', 'pod', 'nad', 'za');

const jeSlovo = (t: string): boolean => /^\p{L}[\p{L}\p{N}.'’-]*$/u.test(t);

/** Slovo, kterým jméno odběratele nezačíná (termín, zájmeno, obal, pivo, zdvořilost, spojka…). */
function neniZacatekJmena(slovo: string): boolean {
  const n = norm(slovo).replace(/\.+$/, '');
  return TERMIN.has(n) || ZAJMENO.has(n) || OBECNE.has(n) || OBAL_A_PIVO.has(n) || SLOVA_VETY.has(n) || SPOJKY.has(n);
}

const velkePismeno = (s: string): string => (/^\p{Ll}/u.test(s) ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Jméno ze 4. pádu zpátky do 1. pádu — jen tam, kde je to bezpečné.
 *
 *   „Patejdovku" → „Patejdovka"   (ženský rod na -a: „na / pro Patejdovku")
 *   „Pohodu"     → „Pohoda"
 *
 * Víceslovná jména se naslepo neskloňují („Lokálka Říčany", „U Dubu" — to je
 * celé jméno a „U Duba" by bylo špatně). Mužský rod v 6. pádu („na Seebergu")
 * by se pokazil na „Seeberga", jenže nejdřív se zkouší katalog (i s původním
 * tvarem) a tohle se použije jen pro NOVÉHO odběratele — a ten se obsluze
 * stejně nabídne k potvrzení.
 */
export function nominativ(zapsano: string): string {
  const jmeno = zapsano.trim();
  if (!jmeno || /\s/.test(jmeno)) return jmeno;
  if (/^\p{L}{3,}(?![aeiouyáéíóúůýě])\p{L}u$/iu.test(jmeno)) {
    return jmeno.slice(0, -1) + (jmeno.endsWith('U') ? 'A' : 'a');
  }
  return jmeno;
}

const NEJASNE = 'nejasne' as const;

const jeVelke = (t: string): boolean => /^\p{Lu}/u.test(t);

/** Spojky, kterými se přidává DRUHÉ jméno („pro Pohodu a Anicku"). */
const PRIDAVA_JMENO = mnozina('a', 'i', 'nebo', 'plus');

/**
 * Jméno za předložkou na řádku (od pozice `od`). `null` = tam jméno není,
 * `NEJASNE` = jmen je víc („pro Pohodu a Anicku") — nehádá se.
 *
 * Víceslovné jméno jen tam, kde to opravdu bývá jméno:
 *  - za druhem provozovny („Restauraci Na Růžku", „pivovar brana"),
 *  - za „U" („U Dubu"),
 *  - samá velká písmena („Karla Dvoraka", „Josefa Novotneho").
 * Jinak je jméno jedno slovo — „Honzu az se zitra bude vyzvedavat" je „Honzu".
 */
function jmenoZaPredlozkou(radek: string, od: number): { text: string; konec: number } | typeof NEJASNE | null {
  // Jméno končí dvojtečkou, čárkou, závorkou… (víceslovná jména s čárkou — „Vildstejn,
  // Skalná" — se tu ořežou na první část; ta se pak najde v katalogu po slovech).
  const zbytek = radek.slice(od).split(/[:;,()!?]/)[0];
  const slova = [...zbytek.matchAll(/\S+/g)];
  const tokeny = slova.map((m) => m[0]);
  if (tokeny.length === 0 || !jeSlovo(tokeny[0]) || neniZacatekJmena(tokeny[0])) return null;

  const prvni = tokeny[0];
  const druh = DRUH_PROVOZOVNY.has(norm(prvni));
  const jeU = norm(prvni) === 'u';
  const nejvic = druh ? NEJVIC_SLOV_S_PREDLOZKOU : NEJVIC_SLOV;
  const jmeno: string[] = [prvni.replace(/\.+$/, '')];
  let zbyva = tokeny.slice(1);
  while (zbyva.length > 0 && jmeno.length < nejvic) {
    const t = zbyva[0];
    const n = norm(t);
    if (!jeSlovo(t)) break; // „30x30l", „11sv" — už je to množství
    const predlozkaVeJmene = (druh || jeU) && PREDLOZKY_VE_JMENE.has(n);
    if (neniZacatekJmena(t) && !predlozkaVeJmene) break;
    const patriDoJmena = predlozkaVeJmene || druh || jeU || (jeVelke(prvni) && jeVelke(t));
    if (!patriDoJmena) break;
    jmeno.push(t.replace(/\.+$/, ''));
    zbyva = zbyva.slice(1);
  }
  // Předložka na konci („Restauraci Na") už k jménu nepatří.
  while (jmeno.length > 1 && PREDLOZKY_VE_JMENE.has(norm(jmeno[jmeno.length - 1]))) {
    jmeno.pop();
    zbyva = [];
  }
  // „Pro Pohodu a Anicku" — druhé jméno, nevíme, které je odběratel.
  const dalsi = zbyva[0] ? norm(zbyva[0]) : '';
  if (PRIDAVA_JMENO.has(dalsi) && zbyva[1] && jeSlovo(zbyva[1])) return NEJASNE;

  const text = jmeno.join(' ').trim();
  if (text.length < 3 || text.length > NEJVIC_ZNAKU) return null;
  // Kam jméno sahá — předložky UVNITŘ jména („Restauraci Na Růžku") se pak nehledají znovu.
  const posledni = slova[jmeno.length - 1];
  return { text, konec: od + (posledni.index ?? 0) + posledni[0].length };
}

/** Je v textu množství („30x30l", „2x50", „20l", „5 ks", „3 kegy")? Bez něj to není objednávka. */
function maMnozstvi(text: string): boolean {
  return /\d\s*[x×*]\s*\d|\d\s*(?:l|ks|kg)(?![a-z])|\d+\s*(?:kegu?|kegy|sudu?|sudy|beden|bedny|bedn|lahvi|lahve|kusu)(?![a-z])/i.test(norm(text));
}

/**
 * Najde v záhlaví zprávy odběratele za „na / pro": „Na pristi tyden na
 * Patejdovku:", „pro Pohodu 3x30 12sv", „Objednávka pro Zdenku". Termíny („na příští
 * týden", „na středu"), „pro mě", obaly a pivo odběratel nejsou.
 *
 * `null` když tam jméno není, když zpráva není objednávka (chybí množství),
 * nebo když je jmen víc a nedá se poznat, které je odběratel — nic se nehádá.
 */
export function odberatelZVety(text: string | null | undefined): OdberatelZVety | null {
  if (!text || !maMnozstvi(text)) return null;
  const radky = text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean).slice(0, RADKU_ZAHLAVI);
  const nalezena = new Map<string, OdberatelZVety>();
  for (const radek of radky) {
    const predlozka = /(?:^|[^\p{L}\p{N}])(na|pro)\s+/giu;
    let m: RegExpExecArray | null;
    while ((m = predlozka.exec(radek)) !== null) {
      const nalez = jmenoZaPredlozkou(radek, m.index + m[0].length);
      if (nalez === NEJASNE) return null;
      if (!nalez) continue;
      predlozka.lastIndex = nalez.konec;
      const nom = velkePismeno(nominativ(nalez.text));
      nalezena.set(norm(nom), { zapsano: nalez.text, nominativ: nom });
    }
  }
  return nalezena.size === 1 ? [...nalezena.values()][0] : null;
}
