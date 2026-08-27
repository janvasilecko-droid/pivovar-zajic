import { describe, it, expect } from 'vitest';
import {
  normalize,
  emptyAliasMap,
  matchBeerFromHints,
  matchPackage,
  parseOrderText,
  parseFreeTextEntries,
  detectOrderNotes,
  parseGeminiItems,
  isUsefulBeerAlias,
  canLearnBeerAlias,
  matchPlaceFromText,
  detectOrderDupWarnings,
  placesMatch,
  type GeminiItem,
  type ParsedLine,
  type ImportedOrder,
  type ParserAliasMap,
} from './orderParser';
import type { Beer, Package, Place } from './supabase';

const beers: Beer[] = [
  { id: 'b-desitka', name: 'Desítka', short_name: null, degree: '10°', color: 'světlé', beer_color: null, price_per_liter: null, is_active: true, sort_order: 1, created_at: '' },
  { id: 'b-12sv', name: '12° Světlá', short_name: '12sv', degree: '12°', color: 'světlé', beer_color: null, price_per_liter: null, is_active: true, sort_order: 2, created_at: '' },
  { id: 'b-12tm', name: '12° Tmavá', short_name: '12tm', degree: '12°', color: 'tmavé', beer_color: null, price_per_liter: null, is_active: true, sort_order: 3, created_at: '' },
  { id: 'b-cyklo8', name: '8° Cykloosma', short_name: 'cyklo', degree: '8°', color: 'světlé', beer_color: null, price_per_liter: null, is_active: true, sort_order: 4, created_at: '' },
  { id: 'b-jantar', name: 'Jantar', short_name: 'Jant', degree: '13°', color: 'tmavé', beer_color: null, price_per_liter: null, is_active: true, sort_order: 5, created_at: '' },
  { id: 'b-11sv', name: '11° Světlá', short_name: null, degree: '11°', color: 'světlé', beer_color: null, price_per_liter: null, is_active: true, sort_order: 2, created_at: '' },
];

const packages: Package[] = [
  { id: 'keg50', code: 'K50', kind: 'keg', volume_l: 50, label: 'KEG 50l', sort_order: 1 },
  { id: 'keg30', code: 'K30', kind: 'keg', volume_l: 30, label: 'KEG 30l', sort_order: 2 },
  { id: 'keg20', code: 'K20', kind: 'keg', volume_l: 20, label: 'KEG 20l', sort_order: 3 },
  { id: 'keg15', code: 'K15', kind: 'keg', volume_l: 15, label: 'KEG 15l', sort_order: 4 },
  { id: 'keg10', code: 'K10', kind: 'keg', volume_l: 10, label: 'KEG 10l', sort_order: 5 },
  { id: 'pet15', code: 'P15', kind: 'bottle', volume_l: 1.5, label: 'PET 1.5l', sort_order: 6 },
  { id: 'pet1', code: 'P1', kind: 'bottle', volume_l: 1, label: 'PET 1l', sort_order: 7 },
  { id: 'lahve05', code: 'L05', kind: 'bottle', volume_l: 0.5, label: 'Lahve 0.5l', sort_order: 8 },
  { id: 'lahve033', code: 'L033', kind: 'bottle', volume_l: 0.33, label: 'Lahve 0.33l', sort_order: 9 },
];

const places: Place[] = [
  { id: 'p-malenovice', name: 'Malenovice', note: null, created_at: '', address: null, phone: null, opening_hours: null },
  { id: 'p-malesice', name: 'Malešice', note: null, created_at: '', address: null, phone: null, opening_hours: null },
  { id: 'p-seeberg', name: 'Seeberg', note: null, created_at: '', address: null, phone: null, opening_hours: null },
  { id: 'p-zajice', name: 'U Zajíce', note: null, created_at: '', address: null, phone: null, opening_hours: null },
];

describe('matchPlaceFromText — Malenovice vs Malešice', () => {
  it('přiřadí "malenovice" skutečné obci Malenovice (ne Malešicím), pokud je v katalogu', () => {
    const r = matchPlaceFromText('malenovice 7x30 2x10 1x20 vse 10', places);
    expect(r.placeId).toBe('p-malenovice');
    expect(r.placeName).toBe('Malenovice');
  });

  it('přiřadí "malesice" obci Malešice', () => {
    const r = matchPlaceFromText('malesice 7x30 vse 10', places);
    expect(r.placeId).toBe('p-malesice');
  });

  it('OCR substituce malenovice→malesice zůstane zachována, když Malenovice není v katalogu', () => {
    const catalogWithoutMalenovice = places.filter((p) => p.id !== 'p-malenovice');
    const r = matchPlaceFromText('malenovice', catalogWithoutMalenovice);
    // Bez Malenovice v katalogu jde pravděpodobně o špatné čtení "Malešice" → Malešice.
    expect(r.placeId).toBe('p-malesice');
  });

  it('neurčuje místo, pokud se nic neshoduje', () => {
    const r = matchPlaceFromText('neexistujici hospoda', places);
    expect(r.placeId).toBeNull();
  });
});

describe('parseGeminiItems — víc objemů na řádku "7x30 2x10 1x20"', () => {
  it('přiřadí každé položce objem podle jejího množství (30/10/20), i když AI vrátila "KEG 30l" všude', () => {
    const items: GeminiItem[] = [
      { raw_line: 'malenovice 7x30 2x10 1x20 vse 10', quantity: 7, degree: null, beer_name: null, package_label: 'KEG 30l', place_name: 'malenovice' },
      { raw_line: 'malenovice 7x30 2x10 1x20 vse 10', quantity: 2, degree: null, beer_name: null, package_label: 'KEG 30l', place_name: 'malenovice' },
      { raw_line: 'malenovice 7x30 2x10 1x20 vse 10', quantity: 1, degree: null, beer_name: null, package_label: 'KEG 30l', place_name: 'malenovice' },
    ];
    const result = parseGeminiItems(items, beers, packages, undefined, 0, places);

    expect(result.map((r) => r.package_id)).toEqual(['keg30', 'keg10', 'keg20']);
    expect(result.map((r) => r.quantity)).toEqual([7, 2, 1]);
    expect(result.map((r) => r.place_name)).toEqual(['Malenovice', 'Malenovice', 'Malenovice']);
  });

  it('opraví i holý label "30l" (bez slova KEG), který se páruje podle množství', () => {
    const items: GeminiItem[] = [
      { raw_line: '7x30 2x10 1x20 vse 10', quantity: 2, degree: null, beer_name: null, package_label: '30l', place_name: null },
    ];
    const result = parseGeminiItems(items, beers, packages);
    expect(result[0].package_id).toBe('keg10');
  });

  it('nepokazí správně přiřazený obal (2x10 + "KEG 10l" zůstane 10l)', () => {
    const items: GeminiItem[] = [
      { raw_line: '7x30 2x10 1x20 vse 10', quantity: 2, degree: null, beer_name: null, package_label: 'KEG 10l', place_name: null },
    ];
    const result = parseGeminiItems(items, beers, packages);
    expect(result[0].package_id).toBe('keg10');
  });

  it('doplní chybějící množství podle objemu z obalu AI ("KEG 10l" + "7x30 2x10 1x20" → 2 ks)', () => {
    const items: GeminiItem[] = [
      { raw_line: '7x30 2x10 1x20 vse 10', quantity: null, degree: null, beer_name: null, package_label: 'KEG 10l', place_name: null },
    ];
    const result = parseGeminiItems(items, beers, packages);
    expect(result[0].package_id).toBe('keg10');
    expect(result[0].quantity).toBe(2);
  });

  it('nepřepíše PET lahev na stejném řádku (bez objemu KEG v labelu)', () => {
    const items: GeminiItem[] = [
      { raw_line: '3x50l KEG + 24x1,5l PET', quantity: 24, degree: null, beer_name: null, package_label: 'PET 1.5l', place_name: null },
    ];
    const result = parseGeminiItems(items, beers, packages);
    expect(result[0].package_id).toBe('pet15');
  });
});

describe('detectOrderDupWarnings — duplicitní odběratel napříč fotkami', () => {
  function makeLine(over: Partial<ParsedLine> & { raw: string; duplicate?: boolean }): { line: ParsedLine; duplicate: boolean } {
    return {
      line: {
        raw: over.raw,
        originalLine: over.originalLine ?? over.raw,
        quantity: over.quantity ?? null,
        beer_id: over.beer_id ?? null,
        beer_name: over.beer_name ?? null,
        package_id: over.package_id ?? null,
        package_label: over.package_label ?? null,
        confidence: over.confidence ?? 'unknown',
        issues: over.issues ?? [],
        place_name: over.place_name ?? null,
        date: over.date ?? null,
        _removed: over._removed ?? false,
      },
      duplicate: over.duplicate ?? false,
    };
  }

  const prevOrder: ImportedOrder = {
    place: 'Kiosek',
    date: '2026-08-07',
    items: [{ beer_id: 'b-desitka', package_id: 'keg30', quantity: 5 }],
  };

  it('upozorní, když se na aktuální fotce objeví stejný odběratel (byť s jiným množstvím)', () => {
    const lines = [makeLine({ raw: 'kiosek 4x30 10sv', place_name: 'Kiosek', beer_id: 'b-desitka', package_id: 'keg30', quantity: 4 })];
    const warnings = detectOrderDupWarnings(lines, [prevOrder], '');
    expect(warnings.map((w) => w.place)).toEqual(['Kiosek']);
    expect(warnings[0].prev.items).toEqual(prevOrder.items);
    expect(warnings[0].curr.items[0].quantity).toBe(4);
  });

  it('neupozorní, pokud odběratel dosud importován nebyl', () => {
    const lines = [makeLine({ raw: 'Seeberg 2x50', place_name: 'Seeberg', beer_id: 'b-jantar', package_id: 'keg50', quantity: 2 })];
    expect(detectOrderDupWarnings(lines, [prevOrder], '')).toEqual([]);
  });

  it('rozpozná překlep / OCR šum v názvu odběratele', () => {
    expect(placesMatch('Kiosek', 'kiosek')).toBe(true);
    expect(placesMatch('Kiosk', 'Kiosek')).toBe(true);
    expect(placesMatch('Seberg', 'Seeberg')).toBe(true);
    expect(placesMatch('Seeberg', 'Malešice')).toBe(false);
  });

  it('neupozorní, když jsou VŠECHNY položky už označené jako per-řádkový duplikát', () => {
    const lines = [makeLine({ raw: 'kiosek 5x30', place_name: 'Kiosek', beer_id: 'b-desitka', package_id: 'keg30', quantity: 5, duplicate: true })];
    expect(detectOrderDupWarnings(lines, [prevOrder], '')).toEqual([]);
  });

  it('ignoruje odstraňované řádky', () => {
    const lines = [makeLine({ raw: 'kiosek 4x30', place_name: 'Kiosek', beer_id: 'b-desitka', package_id: 'keg30', quantity: 4, _removed: true })];
    expect(detectOrderDupWarnings(lines, [prevOrder], '')).toEqual([]);
  });

  it('použije globálního odběratele jako fallback, když řádek nemá vlastního', () => {
    const lines = [makeLine({ raw: '4x30 10sv', beer_id: 'b-desitka', package_id: 'keg30', quantity: 4 })];
    const warnings = detectOrderDupWarnings(lines, [prevOrder], 'Kiosek');
    expect(warnings.map((w) => w.place)).toEqual(['Kiosek']);
  });
});
describe('normalize', () => {
  it('převede na malá písmena a odstraní diakritiku', () => {
    expect(normalize('Maléšice 12sv')).toBe('malesice 12sv');
    expect(normalize('Výčepní Jantar 13°')).toBe('vycepni jantar 13°');
  });

  it('sjednotí více mezer a zbaví se nadbytečné interpunkce', () => {
    expect(normalize('  2x50  KEG  12sv ')).toBe('2x50 keg 12sv');
    expect(normalize('Desítka, 2x50!')).toBe('desitka, 2x50');
  });

  it('zachová číslo, čárku, tečku a stupeň potřebné pro objemy', () => {
    expect(normalize('3x1,5l PET')).toBe('3x1,5l pet');
    expect(normalize('0.33 lahve')).toBe('0.33 lahve');
  });
});

describe('matchBeerFromHints', () => {
  const aliases = (): ParserAliasMap => emptyAliasMap();

  it('najde pivo podle přesného názvu i short_name', () => {
    expect(matchBeerFromHints('desitka 3x30', beers, aliases()).beer?.id).toBe('b-desitka');
    expect(matchBeerFromHints('jant 2x50', beers, aliases()).beer?.id).toBe('b-jantar');
  });

  it('najde pivo podle stupně a barvy', () => {
    expect(matchBeerFromHints('10sv 3x30', beers, aliases()).beer?.id).toBe('b-desitka');
    expect(matchBeerFromHints('13 3x30', beers, aliases()).beer?.id).toBe('b-jantar');
    expect(matchBeerFromHints('13 tmave', beers, aliases()).beer?.id).toBe('b-jantar');
    expect(matchBeerFromHints('12 tmave', beers, aliases()).beer?.id).toBe('b-12tm');
  });

  it('rozpozná načtený alias (učený z předchozích importů)', () => {
    const a = aliases();
    a.beer.set('fialova dvanactka', 'b-jantar');
    expect(matchBeerFromHints('fialova dvanactka 2x30', beers, a).beer?.id).toBe('b-jantar');
    expect(matchBeerFromHints('fialova dvanactka 2x30', beers, a).alias).toBe('fialova dvanactka');
  });

  it('přibližně spáruje překlep v názvu piva', () => {
    const r = matchBeerFromHints('desitko 3x30', beers, aliases());
    expect(r.beer?.id).toBe('b-desitka');
  });

  it('vrátí null, když text neodpovídá žádnému pivu', () => {
    expect(matchBeerFromHints('neznama vec', beers, aliases()).beer).toBeNull();
  });

  it('rozpozná sl zkratku (11sl, sl 11 → 11° Světlá)', () => {
    expect(matchBeerFromHints('11sl', beers, aliases()).beer?.id).toBe('b-11sv');
    expect(matchBeerFromHints('sl 11', beers, aliases()).beer?.id).toBe('b-11sv');
    expect(matchBeerFromHints('12sl', beers, aliases()).beer?.id).toBe('b-12sv');
    expect(matchBeerFromHints('sl 12', beers, aliases()).beer?.id).toBe('b-12sv');
  });

  it('rozpozná color-first zkratku (sv 12, sv12, tm 12)', () => {
    expect(matchBeerFromHints('sv 12', beers, aliases()).beer?.id).toBe('b-12sv');
    expect(matchBeerFromHints('sv12', beers, aliases()).beer?.id).toBe('b-12sv');
    expect(matchBeerFromHints('tm 12', beers, aliases()).beer?.id).toBe('b-12tm');
    expect(matchBeerFromHints('sv 11', beers, aliases()).beer?.id).toBe('b-11sv');
  });

  it('bare sl defaults to 12° Světlá', () => {
    expect(matchBeerFromHints('sl', beers, aliases()).beer?.id).toBe('b-12sv');
  });
});

describe('matchPackage', () => {
  const aliases = (): ParserAliasMap => emptyAliasMap();

  it('najde KEG podle objemu a slov „keg“ / „sud“', () => {
    expect(matchPackage('keg 50l', packages, aliases())?.id).toBe('keg50');
    expect(matchPackage('sud 30', packages, aliases())?.id).toBe('keg30');
    expect(matchPackage('sud 20', packages, aliases())?.id).toBe('keg20');
  });

  it('najde PET a lahve podle objemu', () => {
    expect(matchPackage('pet 1,5', packages, aliases())?.id).toBe('pet15');
    expect(matchPackage('1l pet', packages, aliases())?.id).toBe('pet1');
    expect(matchPackage('lahve 0.5', packages, aliases())?.id).toBe('lahve05');
    expect(matchPackage('0,33 tretinka', packages, aliases())?.id).toBe('lahve033');
  });

  it('najde obal podle načteného aliasu', () => {
    const a = aliases();
    a.package.set('velka flasa', 'pet15');
    expect(matchPackage('velka flasa 2x', packages, a)?.id).toBe('pet15');
  });

  it('nikdy nezamění 10% za 10l sud', () => {
    expect(matchPackage('1x 10%', packages, aliases())).toBeNull();
    expect(matchPackage('10ka', packages, aliases())).toBeNull();
    expect(matchPackage('10sv', packages, aliases())).toBeNull();
    expect(matchPackage('10l', packages, aliases())?.id).toBe('keg10');
  });

  it('vrátí null pro neznámý obal', () => {
    expect(matchPackage('neznama vec', packages, aliases())).toBeNull();
  });

  it('u PET nikdy nezamění "1,5" (ztracenou čárkou vzniklé "15") za KEG 15l', () => {
    expect(matchPackage('pet 15', packages, aliases())?.id).toBe('pet15');
    expect(matchPackage('petka 15', packages, aliases())?.id).toBe('pet15');
    expect(matchPackage('pet 1.5l', packages, aliases())?.id).toBe('pet15');
    expect(matchPackage('petr 1,5', packages, aliases())?.id).toBe('pet15');
    // se slovem "keg"/"sud" v textu se pojistka nepoužije — bere se jako sud
    expect(matchPackage('keg 15', packages, aliases())?.id).toBe('keg15');
    expect(matchPackage('sud 15', packages, aliases())?.id).toBe('keg15');
  });
});

describe('parseGeminiItems — BAR a TERASA výchozí KEG 50l a 10% desítka', () => {
  it('správně nastaví KEG 50l pro BAR a TERASU u 10% i 12%', () => {
    const items: GeminiItem[] = [
      { raw_line: '1x 50 TM', quantity: 1, degree: '12°', beer_name: '12° Tmavá', package_label: 'KEG 50l', place_name: 'BAR' },
      { raw_line: '1x 10 %', quantity: 1, degree: '10°', beer_name: '10° Desítka', package_label: 'KEG 50l', place_name: 'BAR' },
      { raw_line: '2x 12 %', quantity: 2, degree: '12°', beer_name: '12° Světlá', package_label: 'KEG 50l', place_name: 'BAR' },
      { raw_line: '2x 12 %', quantity: 2, degree: '12°', beer_name: '12° Světlá', package_label: 'KEG 50l', place_name: 'TERASA' },
      { raw_line: '2x Cykl. vosma', quantity: 2, degree: '8°', beer_name: '8° Cykloosma', package_label: 'KEG 50l', place_name: 'TERASA' },
    ];
    const results = parseGeminiItems(items, beers, packages);
    expect(results).toHaveLength(5);
    expect(results[0].package_id).toBe('keg50');
    expect(results[0].beer_id).toBe('b-12tm');
    expect(results[1].package_id).toBe('keg50');
    expect(results[1].beer_id).toBe('b-desitka');
    expect(results[2].package_id).toBe('keg50');
    expect(results[2].beer_id).toBe('b-12sv');
    expect(results[2].quantity).toBe(2);
    expect(results[3].package_id).toBe('keg50');
    expect(results[3].beer_id).toBe('b-12sv');
    expect(results[3].quantity).toBe(2);
    expect(results[4].package_id).toBe('keg50');
    expect(results[4].beer_id).toBe('b-cyklo8');
  });
});


describe('parseGeminiItems — stupeň napsaný barvou PŘED číslem ("sl 11", "sv 12")', () => {
  // Reálný případ: zákazník napíše "sl 11" (světlý jedenáctka). Číslo u barvy
  // určuje stupeň bez ohledu na pořadí — dřív se chytlo jen pořadí "11sl",
  // takže "sl 11" propadlo a stupeň se převzal z AI (typicky výchozích 12°).
  it('"sl 11" opraví špatný stupeň od AI na 11°, ne 12°', () => {
    const items: GeminiItem[] = [
      { raw_line: '2x50 sl 11', quantity: 2, degree: '12°', beer_name: '12° Světlá', package_label: 'KEG 50l', place_name: null },
    ];
    const results = parseGeminiItems(items, beers, packages);
    expect(results[0].beer_id).toBe('b-11sv');
  });

  it('"sv 12" zůstane 12° (číslo u barvy vyhraje i opačným směrem)', () => {
    const items: GeminiItem[] = [
      { raw_line: '3x30 sv 12', quantity: 3, degree: '11°', beer_name: '11° Světlá', package_label: 'KEG 30l', place_name: null },
    ];
    const results = parseGeminiItems(items, beers, packages);
    expect(results[0].beer_id).toBe('b-12sv');
  });

  it('opačné pořadí "11sl" funguje dál stejně', () => {
    const items: GeminiItem[] = [
      { raw_line: '1x50 11sl', quantity: 1, degree: '12°', beer_name: '12° Světlá', package_label: 'KEG 50l', place_name: null },
    ];
    const results = parseGeminiItems(items, beers, packages);
    expect(results[0].beer_id).toBe('b-11sv');
  });

  it('objem se nesmí splést se stupněm — "2x50" bez barvy zůstane na stupni od AI', () => {
    const items: GeminiItem[] = [
      { raw_line: '2x50', quantity: 2, degree: '12°', beer_name: '12° Světlá', package_label: 'KEG 50l', place_name: null },
    ];
    const results = parseGeminiItems(items, beers, packages);
    expect(results[0].beer_id).toBe('b-12sv');
  });
});

describe('parseFreeTextEntries', () => {
  it('rozparsuje „3x30 desitka“ na jednu položku s vysokou jistotou', () => {
    const [line] = parseFreeTextEntries('3x30 desitka', beers, packages);
    expect(line.quantity).toBe(3);
    expect(line.beer_id).toBe('b-desitka');
    expect(line.package_id).toBe('keg30');
    expect(line.confidence).toBe('high');
  });

  it('spáruje stupeň a barvu piva s objemem sudu', () => {
    const [line] = parseFreeTextEntries('2x50 10sv', beers, packages);
    expect(line.quantity).toBe(2);
    expect(line.beer_id).toBe('b-desitka');
    expect(line.package_id).toBe('keg50');
  });

  it('oddělí položky na „ a “ mezi množstvími', () => {
    const lines = parseFreeTextEntries('2x50 10sv a 3x30 13', beers, packages);
    expect(lines).toHaveLength(2);
    expect(lines[0].beer_id).toBe('b-desitka');
    expect(lines[1].beer_id).toBe('b-jantar');
    expect(lines[1].package_id).toBe('keg30');
  });

  it('slovně zapsané množství „pet desitek“ = 5 ks Desítky', () => {
    const [line] = parseFreeTextEntries('pet desitek', beers, packages);
    expect(line.quantity).toBe(5);
    expect(line.beer_id).toBe('b-desitka');
  });

  it('bedny lahví přepočítá na kusy (1 bedna = 20 ks 0.33l)', () => {
    const [line] = parseFreeTextEntries('2 bedny lahvi', beers, packages);
    expect(line.quantity).toBe(40);
    expect(line.package_id).toBe('lahve033');
  });

  it('PET bez objemu výchozí na 1 l', () => {
    const [line] = parseFreeTextEntries('3x pet', beers, packages);
    expect(line.package_id).toBe('pet1');
    expect(line.quantity).toBe(3);
  });

  it('položka bez piva má jistotu low a issue pivo', () => {
    const [line] = parseFreeTextEntries('5x1.5 pet', beers, packages);
    expect(line.quantity).toBe(5);
    expect(line.package_id).toBe('pet15');
    expect(line.confidence).toBe('low');
    expect(line.issues).toContain('pivo');
  });
});

describe('parseOrderText', () => {
  it('„vse 10“ na konci objednávky přiřadí stupeň všem položkám', () => {
    const lines = parseOrderText('malenovice\n7x30 2x10 1x20\nvse 10', beers, packages);
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.quantity)).toEqual([7, 2, 1]);
    expect(lines.map((l) => l.package_id)).toEqual(['keg30', 'keg10', 'keg20']);
    expect(lines.every((l) => l.beer_id === 'b-desitka')).toBe(true);
    expect(lines.every((l) => l.confidence === 'high')).toBe(true);
  });

  it('stupeň na začátku řádku platí pro všechny položky na řádku', () => {
    const lines = parseOrderText('10sv 3x30 2x20', beers, packages);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.beer_id)).toEqual(['b-desitka', 'b-desitka']);
    expect(lines.map((l) => l.package_id)).toEqual(['keg30', 'keg20']);
  });

  it('nededuplikuje stejné položky na jednom řádku („3x30 3x30“)', () => {
    const lines = parseOrderText('3x30 3x30', beers, packages);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.quantity)).toEqual([3, 3]);
    expect(lines.map((l) => l.package_id)).toEqual(['keg30', 'keg30']);
  });

  it('řádek bez čísel (pouze název odběratele) nevyrobí položku', () => {
    const lines = parseOrderText('Malenovice\n', beers, packages);
    expect(lines).toHaveLength(0);
  });

  it('řádek bez "x"/"ks" ale s náznakem balení ("12 piv 0.5l") nezmizí beze stopy', () => {
    const lines = parseOrderText('12 piv 0.5l', beers, packages);
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(12);
  });

  it('řádek "2 kegy 30L" bez "x"/"ks" se také zachytí', () => {
    const lines = parseOrderText('2 kegy 30L', beers, packages);
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(2);
  });

  it('"vse 10" zůstává řídicí frází a nevyrobí vlastní položku (i když obsahuje číslo)', () => {
    const lines = parseOrderText('7x30\nvse 10', beers, packages);
    expect(lines).toHaveLength(1);
  });
});

describe('detectOrderNotes', () => {
  it('rozpozná požadavek na závozy', () => {
    expect(detectOrderNotes('2x50 desitka, zavoz v patek')).toBe('zavoz v patek');
    expect(detectOrderNotes('prosim zavoz v sobotu')).toBe('zavoz v sobotu');
  });

  it('rozpozná „bez etiket“, sklo a zaplaceno', () => {
    expect(detectOrderNotes('prosim bez etiket')).toBe('bez etikety');
    expect(detectOrderNotes('potrebuji jeste sklo')).toBe('sklo');
    expect(detectOrderNotes('platba predem, zaplaceno')).toBe('zaplaceno');
  });

  it('rozpozná „sklo“/„podtácky“ i s diakritikou („ještě“)', () => {
    expect(detectOrderNotes('ještě sklo')).toBe('sklo');
    expect(detectOrderNotes('jestě podtácky')).toBe('podtácky');
  });

  it('spojí více poznámek čárkou', () => {
    expect(detectOrderNotes('2x50 10sv, zavoz v utery, faktura')).toBe('zavoz v utery, faktura');
  });

  it('vrátí prázdný řetězec, když žádná poznámka není', () => {
    expect(detectOrderNotes('2x50 12sv desitka')).toBe('');
  });

  it('pozná požadavek na vyzvednutí prázdných sudů', () => {
    // Přesně takhle to přišlo ve skupině 27. 8. 2026.
    expect(detectOrderNotes('ještě vyzvednout sudy v ASI')).toBe('vyzvednout prázdné sudy');
    expect(detectOrderNotes('odvezt prazdne sudy')).toBe('vyzvednout prázdné sudy');
    expect(detectOrderNotes('sebrat 3 kegy')).toBe('vyzvednout prázdné sudy');
    // Objednávka sudů piva požadavkem na vyzvednutí není.
    expect(detectOrderNotes('2x50 12sv')).toBe('');
  });
});

describe('parseGeminiItems — raw_line degree overrides AI beer_name', () => {
  it('raw_line 11sl overrides AI beer_name 12° Světlá', () => {
    const items: GeminiItem[] = [
      { raw_line: '3x30 11sl', quantity: 3, degree: '12°', beer_name: '12° Světlá', package_label: 'KEG 30l' },
    ];
    const results = parseGeminiItems(items, beers, packages);
    expect(results).toHaveLength(1);
    expect(results[0].beer_id).toBe('b-11sv');
  });

  it('raw_line sv 12 overrides AI beer_name 11° Světlá', () => {
    const items: GeminiItem[] = [
      { raw_line: '3x30 sv 12', quantity: 3, degree: '11°', beer_name: '11° Světlá', package_label: 'KEG 30l' },
    ];
    const results = parseGeminiItems(items, beers, packages);
    expect(results).toHaveLength(1);
    expect(results[0].beer_id).toBe('b-12sv');
  });
});

// Všechny texty níže jsou skutečné záznamy z produkční tabulky parser_aliases
// (stav 26. 8. 2026). Ty odmítnuté se tam dostaly tím, že se při opravě piva
// v kontrole WhatsApp objednávky uložil celý řádek — a protože se zkratky
// hledají jako podřetězec, "2x10" pak sedělo na kdejakou budoucí zprávu.
describe('isUsefulBeerAlias — co se smí naučit jako zkratka piva', () => {
  it('odmítne počet × objem, v nichž o pivu není nic', () => {
    for (const junk of ['2x10', '7x30', '6x15', '1x30', '2x30', '7x50', '4x50l', '10x30 11', '5x 10°l', '11 8° 6x', '1x50 8,', '1x50 10,', '12 4x', '5x 10° 0']) {
      expect(isUsefulBeerAlias(junk), junk).toBe(false);
    }
  });

  it('pustí dál zkratky, které pivo skutečně pojmenovávají', () => {
    for (const ok of ['osma', 'jantar', 'summer ale', 'deset 6x', '5x sum 1', '12° tmava', '4xtmava']) {
      expect(isUsefulBeerAlias(ok), ok).toBe(true);
    }
  });

  it('pustí dál stupeň s barvou', () => {
    for (const ok of ['4x11sv', '5x 12° sv', '11sv', '12 tm', '5x 11° 0 sv']) {
      expect(isUsefulBeerAlias(ok), ok).toBe(true);
    }
  });

  it('samotný stupeň bez barvy nestačí', () => {
    expect(isUsefulBeerAlias('11')).toBe(false);
    expect(isUsefulBeerAlias('30 11')).toBe(false);
  });
});

describe('matchBeerFromHints — zkratky nesmí přebít název piva', () => {
  const beers = [
    { id: 'b-10', name: '10° Desítka', degree: '10°', color: 'světlé', short_name: null },
    { id: 'b-11', name: '11° Světlá', degree: '11°', color: 'světlé', short_name: null },
    { id: 'b-12', name: '12° Světlá', degree: '12°', color: 'světlé', short_name: null },
    { id: 'b-jan', name: 'Jantar', degree: '13°', color: 'polotmavé', short_name: null },
  ] as unknown as Beer[];

  function mapa(pairs: [string, string][]): ParserAliasMap {
    const m = emptyAliasMap();
    pairs.forEach(([a, id]) => m.beer.set(a, id));
    return m;
  }

  // V produkci se omylem uložilo "jantar" → 12° Světlá. Nesmí to přebít
  // pivo, které je v textu napsané celým jménem.
  it('název piva v textu vyhraje nad špatně naučenou zkratkou', () => {
    const { beer } = matchBeerFromHints(normalize('1x30l jantar'), beers, mapa([['jantar', 'b-12']]));
    expect(beer?.id).toBe('b-jan');
  });

  it('zapamatované počty × objem už pivo nepřiřazují', () => {
    const { beer } = matchBeerFromHints(normalize('plus 3x10 11sv'), beers, mapa([['2x10', 'b-10'], ['3x10', 'b-10']]));
    expect(beer?.id).toBe('b-11');
  });

  it('z použitelných zkratek vyhraje nejdelší, ne náhodná', () => {
    const m = mapa([['sum', 'b-10'], ['summer ale', 'b-12']]);
    const { beer } = matchBeerFromHints(normalize('2x50 summer ale'), beers, m);
    expect(beer?.id).toBe('b-12');
  });
});

// Každé pravidlo níže se v produkci skutečně uložilo a kazilo čtení dalších
// zpráv: jedna oprava jedné objednávky se stala trvalým globálním pravidlem.
describe('canLearnBeerAlias — z čeho se smí stát trvalé pravidlo', () => {
  const katalog = [
    { id: 'b-10', name: '10° Desítka', short_name: null, degree: '10°' },
    { id: 'b-11', name: '11° Světlá', short_name: null, degree: '11°' },
    { id: 'b-12', name: '12° Světlá', short_name: '12sv', degree: '12°' },
    { id: 'b-tm', name: '12° Tmavá', short_name: '12tm', degree: '12°' },
    { id: 'b-jan', name: 'Jantar', short_name: 'Jant', degree: '13°' },
    { id: 'b-osma', name: 'Osma', short_name: null, degree: '8°' },
    { id: 'b-sum', name: 'Summer Ale', short_name: null, degree: null },
  ];

  it('odmítne přepsat název piva na jiné pivo', () => {
    expect(canLearnBeerAlias('10° desitka', 'b-11', katalog)).toBe(false);
    expect(canLearnBeerAlias('11° svetla', 'b-12', katalog)).toBe(false);
    expect(canLearnBeerAlias('jantar', 'b-12', katalog)).toBe(false);
    expect(canLearnBeerAlias('20x 0,5l 12° jantar', 'b-12', katalog)).toBe(false);
    expect(canLearnBeerAlias('1x 15l 12° summer', 'b-10', katalog)).toBe(false);
  });

  it('odmítne text s cizím stupněm', () => {
    expect(canLearnBeerAlias('1x50l 11sv', 'b-12', katalog)).toBe(false);
    expect(canLearnBeerAlias('5x 10l 11° sv', 'b-osma', katalog)).toBe(false);
    expect(canLearnBeerAlias('duck and dog na zitra do jeho sudu 11sv.', 'b-12', katalog)).toBe(false);
  });

  it('odmítne počty a objemy bez informace o pivu', () => {
    expect(canLearnBeerAlias('7x50', 'b-11', katalog)).toBe(false);
    expect(canLearnBeerAlias('2x10', 'b-10', katalog)).toBe(false);
  });

  it('pustí dál skutečnou přezdívku piva', () => {
    expect(canLearnBeerAlias('vosma', 'b-osma', katalog)).toBe(true);
    expect(canLearnBeerAlias('jantarek', 'b-jan', katalog)).toBe(true);
    expect(canLearnBeerAlias('sumr', 'b-sum', katalog)).toBe(true);
  });

  it('pustí dál text se stupněm, který pivu odpovídá', () => {
    expect(canLearnBeerAlias('2x50l 12sv', 'b-12', katalog)).toBe(true);
    expect(canLearnBeerAlias('4x11sv', 'b-11', katalog)).toBe(true);
  });
});
