// Tytéž varianty jako supabase/functions/_shared/beer-match.test.ts, ale
// proti KLIENTSKÉMU parseru (čtení z fotky, ruční import, hlasové zadání).
//
// Smysl je držet obě větve v souladu: objednávka musí dopadnout stejně bez
// ohledu na to, jestli přišla WhatsAppem (server) nebo se načetla v appce
// (klient). Rozejít se můžou nenápadně — chyba z 28. 8. 2026 („všude Osma")
// byla v serverové větvi, klientská měla tutéž díru, jen si jí nikdo nevšiml.
//
// Varianty jsou obtažené podle skutečných zpráv ze skupiny „Objednávky
// pivovar", ne vymyšlené: jeden řádek i víc řádků, stupeň před i za objemem,
// „vše 11%" na konci, bedny, PET, vlastní jména piv, hovorové tvary.
import { describe, it, expect } from 'vitest';
import { parseGeminiItems, emptyAliasMap, type GeminiItem } from './orderParser';

// Katalog jako v produkci — VČETNĚ toho, že Osma má stupeň bez znaku °.
const beers: any[] = [
  { id: 'b-jantar', name: 'Jantar', degree: null, color: null, is_active: true },
  { id: 'b-tmava', name: '12° Tmavá', degree: '12°', color: 'tmavé', is_active: true },
  { id: 'b-11', name: '11° Světlá', degree: '11°', color: 'světlé', is_active: true },
  { id: 'b-10', name: '10° Desítka', degree: '10°', color: 'světlé', is_active: true },
  { id: 'b-summer', name: 'Summer Ale', degree: null, color: null, is_active: true },
  { id: 'b-osma', name: 'Osma', degree: '8', color: 'světlé', is_active: true },
  { id: 'b-12', name: '12° Světlá', degree: '12°', color: 'světlé', is_active: true },
];
const packages: any[] = [
  { id: 'p-keg50', label: 'KEG 50l', kind: 'keg', volume_l: 50 },
  { id: 'p-keg30', label: 'KEG 30l', kind: 'keg', volume_l: 30 },
  { id: 'p-keg20', label: 'KEG 20l', kind: 'keg', volume_l: 20 },
  { id: 'p-keg15', label: 'KEG 15l', kind: 'keg', volume_l: 15 },
  { id: 'p-pet15', label: 'PET 1.5l', kind: 'pet', volume_l: 1.5 },
  { id: 'p-pet1', label: 'PET 1l', kind: 'pet', volume_l: 1 },
  { id: 'p-lahev05', label: 'Lahve 0.5l', kind: 'bottle', volume_l: 0.5 },
  { id: 'p-lahev033', label: 'Lahve 0.33l', kind: 'bottle', volume_l: 0.33 },
];

/** Jedna položka tak, jak ji vrací AI. */
function polozka(p: Partial<GeminiItem>): GeminiItem {
  return {
    quantity: p.quantity ?? 1,
    degree: p.degree ?? null,
    beer_name: p.beer_name ?? null,
    package_label: p.package_label ?? null,
    raw_line: p.raw_line ?? '',
    place_name: p.place_name ?? null,
  };
}

const precti = (items: Partial<GeminiItem>[]) =>
  parseGeminiItems(items.map(polozka), beers, packages, emptyAliasMap());

const piva = (items: Partial<GeminiItem>[]) => precti(items).map((r) => r.beer_name ?? null);
const obaly = (items: Partial<GeminiItem>[]) => precti(items).map((r) => r.package_label ?? null);

describe('Jeden řádek, víc objednávek', () => {
  const RADEK = 'Restaurace 1x50 12, 1x50 10 a 1x50 tm, terasa 2x50 12 2x50 osma';

  it('„osma" na konci řádku nepřepíše piva ostatních položek', () => {
    const vysledek = piva([
      { degree: '12°', package_label: 'KEG 50l', raw_line: RADEK },
      { degree: '10°', package_label: 'KEG 50l', raw_line: RADEK },
      { degree: '12°', beer_name: '12° Tmavá', package_label: 'KEG 50l', raw_line: RADEK },
      { quantity: 2, degree: '12°', package_label: 'KEG 50l', raw_line: RADEK },
      { quantity: 2, degree: '8°', package_label: 'KEG 50l', raw_line: RADEK },
    ]);
    expect(vysledek).toEqual(['12° Světlá', '10° Desítka', '12° Tmavá', '12° Světlá', 'Osma']);
  });

  // „Malesice: SV 12 = 3x50l KEG + 24x1,5l PET + 20x0,5l lahev" — tři obaly
  // na jednom řádku. Obal se bere z položky, ne z nejdelšího nálezu v řádku.
  it('tři obaly na řádku dostane každá položka svůj', () => {
    const radek = 'SV 12 = 3x50l KEG + 24x1,5l PET (bez etikety) + 20x0,5l lahev';
    const vysledek = obaly([
      { quantity: 3, degree: '12°', package_label: 'KEG 50l', raw_line: radek },
      { quantity: 24, degree: '12°', package_label: 'PET 1.5l', raw_line: radek },
      { quantity: 20, degree: '12°', package_label: 'Lahve 0.5l', raw_line: radek },
    ]);
    expect(vysledek).toEqual(['KEG 50l', 'PET 1.5l', 'Lahve 0.5l']);
  });
});

describe('Jak lidi píšou stupeň', () => {
  const varianty: [string, string, string][] = [
    ['stupeň za objemem', '10x50l 12sv', '12° Světlá'],
    ['stupeň před objemem', '12sv 3x50l', '12° Světlá'],
    ['jedenáctka zkratkou', '2x50l 11sv', '11° Světlá'],
    ['jedenáctka s tečkou', 'na pátek prosím 2x50l 11sl.', '11° Světlá'],
    ['desítka slovem', '8sudu 30l na pátek, desítka', '10° Desítka'],
    ['desítka v množném čísle', '270l desitky, male soudky', '10° Desítka'],
    ['tmavá slovem', '10xpet 1,5l tmava', '12° Tmavá'],
    ['tmavá s číslem', '1x30l 12 tmava', '12° Tmavá'],
    ['dvanáctky hovorově', '5x30l 12cky', '12° Světlá'],
    ['stupeň se znakem °', '4x30 litru 12°', '12° Světlá'],
    ['vosma hovorově', '20l Vosma volny prodej', 'Osma'],
    ['cyklistická vosma', '6x cyklisticka vosma 1l', 'Osma'],
    ['vlastní jméno Jantar', '2x30l jantar', 'Jantar'],
    ['vlastní jméno Summer', 'nakonec summer 9x30', 'Summer Ale'],
    ['jméno i číslo — jméno vyhrává', 'Jantar 12 = 1x30l KEG', 'Jantar'],
  ];

  it.each(varianty)('%s', (_popis, radek, ocekavane) => {
    expect(piva([{ raw_line: radek }])[0]).toBe(ocekavane);
  });
});

describe('Jak lidi píšou obal', () => {
  const varianty: [string, string, string, string][] = [
    ['padesátka', 'KEG 50l', '10x50l 12sv', 'KEG 50l'],
    ['třicítka', 'KEG 30l', '4x30l desitka', 'KEG 30l'],
    ['dvacítka', 'KEG 20l', '2x 20l desitka', 'KEG 20l'],
    ['patnáctka', 'KEG 15l', '3x15l 11sv', 'KEG 15l'],
    ['PET jedenapůl', 'PET 1.5l', '10xpet 1,5l tmava', 'PET 1.5l'],
    ['PET litr', 'PET 1l', '10 petek 1,0l 12sv', 'PET 1l'],
    ['lahev půllitr', 'Lahve 0.5l', '20x0,5l lahev 12sv', 'Lahve 0.5l'],
    ['lahev třetinka', 'Lahve 0.33l', '4 bedny 0,33l 12sv', 'Lahve 0.33l'],
  ];

  it.each(varianty)('%s', (_popis, label, radek, ocekavany) => {
    expect(obaly([{ package_label: label, raw_line: radek, degree: null }])[0]).toBe(ocekavany);
  });
});

describe('Stupeň položky přebíjí, co se povaluje v řádku', () => {
  // „Vsechno 11%" na konci, ale v řádku je i „12%" z dovětku o vlastních sudech.
  const radek = 'Na utery Duck and Dog 5x20 15x30 13x50 Vsechno 11% Pak jeste 2x50 Nase sudy 12%';

  it('položka s 11° dostane jedenáctku, i když je v řádku i 12', () => {
    expect(piva([{ degree: '11°', package_label: 'KEG 30l', raw_line: radek }])[0]).toBe('11° Světlá');
  });

  it('položka s 12° dostane dvanáctku z téhož řádku', () => {
    expect(piva([{ degree: '12°', package_label: 'KEG 50l', raw_line: radek }])[0]).toBe('12° Světlá');
  });
});

describe('Holý stupeň se nelosuje', () => {
  it('neoznačený stupeň znamená světlé', () => {
    expect(piva([{ degree: '12°', package_label: 'KEG 50l', raw_line: '1x50 12' }])[0]).toBe('12° Světlá');
  });

  it('označené tmavé zůstane tmavé', () => {
    expect(piva([{ degree: '12°', package_label: 'KEG 30l', raw_line: '1x30l 12 tmava' }])[0]).toBe('12° Tmavá');
  });
});

describe('Víc řádků v jedné zprávě — každý řádek své pivo', () => {
  // „Sedláčková do Okrouhlé": pět řádků, pět různých piv, stejný obal.
  it('pět PETek, pět různých piv', () => {
    const vysledek = piva([
      { quantity: 10, package_label: 'PET 1.5l', raw_line: '10xpet 1,5l tmava' },
      { quantity: 10, package_label: 'PET 1.5l', raw_line: '10xpet 1,5l jantar' },
      { quantity: 5, package_label: 'PET 1.5l', raw_line: '5xpet 1,5l desitka' },
      { quantity: 5, package_label: 'PET 1.5l', raw_line: '5xpet 1,5l 11sv' },
      { quantity: 5, package_label: 'PET 1.5l', raw_line: '5xpet 1,5l 12sv' },
    ]);
    expect(vysledek).toEqual(['12° Tmavá', 'Jantar', '10° Desítka', '11° Světlá', '12° Světlá']);
  });

  // „Pivní Kvelb": stupeň, pomlčka, počet × objem.
  it('zápis „10° - 8 x 30l KEG"', () => {
    const vysledek = piva([
      { quantity: 8, package_label: 'KEG 30l', raw_line: '10° - 8 x 30l KEG' },
      { quantity: 1, package_label: 'KEG 30l', raw_line: '12° tmava - 1 x 30l KEG' },
      { quantity: 1, package_label: 'KEG 30l', raw_line: 'Summer ALE - 1 x 30l KEG' },
    ]);
    expect(vysledek).toEqual(['10° Desítka', '12° Tmavá', 'Summer Ale']);
  });
});
