import { describe, it, expect } from 'vitest';
import { parseGeminiItems, matchPlaceFromText, detectOrderDupWarnings, placesMatch, type GeminiItem, type ParsedLine, type ImportedOrder } from './orderParser';
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
