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
  { id: 'b-jantar', name: 'Jantar', short_name: 'Jant', degree: '13°', color: 'tmavé', beer_color: null, price_per_liter: null, is_active: true, sort_order: 2, created_at: '' },
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
    expect(matchBeerFromHints('tmave', beers, aliases()).beer?.id).toBe('b-jantar');
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

  it('vrátí null pro neznámý obal', () => {
    expect(matchPackage('neznama vec', packages, aliases())).toBeNull();
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
});
