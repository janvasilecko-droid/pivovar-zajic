/**
 * Úkoly k závozu — co kromě piva naložit nebo přivézt zpátky.
 *
 * Požadavky typu „ještě vyzvednout sudy", „přivézt podtácky" nebo „půjčit
 * výčep" chodí ve WhatsApp zprávě jako věta mezi objednávkou. Skončí
 * v poznámce objednávky, kde jsou sice vidět, ale jako kus kurzívy pod
 * názvem odběratele — při nakládání auta se to přehlédne.
 *
 * Tenhle soubor z poznámky vytáhne konkrétní úkoly, aby je Závoz mohl
 * ukázat jako štítky u odběratele a shrnout za celý den („nezapomeň
 * naložit"). Poznámka zůstává, jak byla — nic se nepřepisuje.
 *
 * Rozpoznává se to z volného textu, takže platí obojí: raději úkol
 * nepoznat, než ho vymyslet. Falešné „vyzvednout sudy" u odběratele, kde
 * žádné nejsou, je horší než žádný štítek — jednou dvakrát se ukáže
 * zbytečně a člověk štítky přestane číst.
 */

export type UkolKlic =
  | 'sudy'      // vyzvednout prázdné sudy
  | 'lahve'     // vrátit / vyzvednout lahve a přepravky
  | 'sklo'      // sklenice
  | 'podtacky'
  | 'vycep'     // výčep, pipa, naražeč, chlazení
  | 'spotak'
  | 'faktura';

export type ZavozUkol = {
  klic: UkolKlic;
  /** Text na štítku — vždy sloveso, ať je jasné, co se s tím má udělat. */
  popis: string;
};

type Vzor = { klic: UkolKlic; popis: string; re: RegExp };

/**
 * Poznámky píše člověk i parser, takže se diakritika střídá („prázdné"
 * i „prazdne"). Písmena s háčky a čárkami se proto vždycky uvádějí jako
 * třída obou variant.
 */
const VZORY: Vzor[] = [
  // ── Prázdné sudy ────────────────────────────────────────────────────
  // Pokrývá „vyzvednout sudy", „ještě sebrat 3 kegy", „odvézt prázdné"
  // i samotné „prázdné sudy". Mezi slovesem a sudem se toleruje pár slov
  // (počet, odběratel), ale ne celá věta — jinak by se sloveso spojilo
  // se sudem z úplně jiné části poznámky.
  {
    klic: 'sudy',
    popis: 'Vyzvednout prázdné sudy',
    re: /\b(vyzvedn|nabra|sebra|stahn|odvez|odv[eé]z|svez|sv[eé]z|nalo[zž]|vz[ií]t|vem|vemte|vrat|vr[aá]t)\w*\b(?:\W+\w+){0,3}?\W+(sud|kegy?|keg[uů]|kegy|pr[aá]zdn)/i,
  },
  {
    klic: 'sudy',
    popis: 'Vyzvednout prázdné sudy',
    re: /\bpr[aá]zdn\w*\W+(sud|keg)/i,
  },
  {
    klic: 'sudy',
    popis: 'Vyzvednout prázdné sudy',
    re: /\b(sud|keg)\w*\W+(zp[eě]t|zp[aá]tky|k\W+vyzvednut|na\W+vr[aá]cen)/i,
  },

  // ── Lahve a přepravky ───────────────────────────────────────────────
  {
    klic: 'lahve',
    popis: 'Vyzvednout vratné lahve',
    re: /\bvr[aá]cen[ií]\W*lahv|\bvratn[eéyý]\w*\W*lahv|\bvratn[eé]\b|\b(vyzvedn|sebra|odvez|odv[eé]z|nabra)\w*\b(?:\W+\w+){0,3}?\W+(lahv|p[rř]epravk|bedn)/i,
  },

  // ── Drobnosti k naložení ────────────────────────────────────────────
  // Tady se čte POZNÁMKA objednávky, ne původní zpráva — do poznámky se
  // slovo nedostane samo. Buď ho napsal parser, protože ve zprávě byl
  // požadavek, nebo ho napsal člověk ručně. Vágní „sklo?" z fotky se
  // odfiltruje o krok dřív, v detectOrderNotes.
  {
    klic: 'sklo',
    popis: 'Naložit sklenice',
    re: /\bsklenic|(?:^|[,;]\s*|\bp[rř]idat\s+|\bje[sšt][t][ieěí]?\s+|\ba\s+|\bi\s+)sklo\b/i,
  },
  {
    klic: 'podtacky',
    popis: 'Naložit podtácky',
    re: /\bpodt[aá]c/i,
  },
  {
    klic: 'vycep',
    popis: 'Naložit výčep',
    re: /\bv[yý][cč]ep|\bna[rř]a[zž]e|\b(jedno|dvoj|troj|[cč]ty[rř]|[sš]esti)?(pipa|pipy|pipu|kohout)|\bchlad[ií]?[ck]|\bchlazen/i,
  },
  {
    klic: 'spotak',
    popis: 'Naložit spoták',
    re: /\bspot[aá]k/i,
  },
  {
    klic: 'faktura',
    popis: 'Vzít fakturu',
    re: /\bfaktur/i,
  },
];

/** Pořadí štítků — nejdřív to, co se snadno zapomene v pivovaru. */
const PORADI: UkolKlic[] = ['sudy', 'lahve', 'vycep', 'sklo', 'podtacky', 'spotak', 'faktura'];

/**
 * Vytáhne z poznámky objednávky úkoly k závozu.
 * Stejný úkol se nikdy nevrátí dvakrát, i když ho poznámka zmíní víckrát.
 */
export function ukolyZPoznamky(poznamka: string | null | undefined): ZavozUkol[] {
  if (!poznamka || !poznamka.trim()) return [];
  const text = poznamka.replace(/\s+/g, ' ');

  const nalezene = new Map<UkolKlic, ZavozUkol>();
  for (const vzor of VZORY) {
    if (nalezene.has(vzor.klic)) continue;
    if (vzor.re.test(text)) nalezene.set(vzor.klic, { klic: vzor.klic, popis: vzor.popis });
  }

  return PORADI.filter((k) => nalezene.has(k)).map((k) => nalezene.get(k)!);
}

export type SouhrnUkolu = {
  klic: UkolKlic;
  popis: string;
  /** Odběratelé, u kterých se úkol objevil — kvůli tomu se souhrn dělá. */
  odberatele: string[];
};

/**
 * Souhrn za celý den: „u koho co". Bez něj by se štítky musely hledat
 * proklikáním všech objednávek dne, což je přesně to, co se při nakládání
 * neděje.
 */
export function souhrnUkolu(
  objednavky: {
    poznamka: string | null | undefined;
    odberatel: string | null | undefined;
    /** Úkoly, které už jsou odškrtnuté — do souhrnu „co zbývá" nepatří. */
    vynechat?: UkolKlic[];
  }[],
): SouhrnUkolu[] {
  const podle = new Map<UkolKlic, SouhrnUkolu>();

  for (const o of objednavky) {
    const jmeno = (o.odberatel || '').trim() || 'Neznámý odběratel';
    for (const ukol of ukolyZPoznamky(o.poznamka)) {
      if (o.vynechat?.includes(ukol.klic)) continue;
      const zaznam = podle.get(ukol.klic) ?? { klic: ukol.klic, popis: ukol.popis, odberatele: [] };
      if (!zaznam.odberatele.includes(jmeno)) zaznam.odberatele.push(jmeno);
      podle.set(ukol.klic, zaznam);
    }
  }

  return PORADI.filter((k) => podle.has(k)).map((k) => podle.get(k)!);
}
