// Přiřazování piv a obalů k položkám objednávky — VĚTEV, KTERÁ ZAKLÁDÁ
// OBJEDNÁVKY Z WHATSAPPU (whatsapp-auto-parse). Dokud matcher seděl uvnitř
// edge funkce, nešel z testů importovat a neměl ani jeden test — a právě v něm
// vznikla chyba z 28. 8. 2026, kdy se do všech pěti položek zprávy
// „Restaurace 1x50 12, 1x50 10 a 1x50 tm, terasa 2x50 12 2x50 osma" zapsala
// Osma.
//
// Varianty níž nejsou vymyšlené od stolu — jsou obtažené podle skutečných
// zpráv ze skupiny „Objednávky pivovar" (jeden řádek i víc řádků, stupeň před
// i za objemem, „vše 11%" na konci, bedny, PET, vlastní jména piv, hovorové
// tvary „vosma"/„desítka"/„dvanáctka", překlepy).
import { describe, it, expect } from 'vitest';
import { matchBeerId, matchPackageId } from './beer-match';

// Katalog přesně jako v produkci — VČETNĚ toho, že Osma má stupeň zapsaný
// bez znaku ° („8", ne „8°"). Na tom závisí porovnávání stupňů.
const BEERS = [
  { id: 'b-jantar', name: 'Jantar', degree: null },
  { id: 'b-grep', name: 'Grep ', degree: null },
  { id: 'b-tmava', name: '12° Tmavá', degree: '12°' },
  { id: 'b-11', name: '11° Světlá', degree: '11°' },
  { id: 'b-10', name: '10° Desítka', degree: '10°' },
  { id: 'b-summer', name: 'Summer Ale', degree: null },
  { id: 'b-hazy', name: 'Hazy Spring Day', degree: null },
  { id: 'b-osma', name: 'Osma', degree: '8' },
  { id: 'b-citron', name: 'Citron', degree: null },
  { id: 'b-12', name: '12° Světlá', degree: '12°' },
];

const PACKAGES = [
  { id: 'p-keg50', label: 'KEG 50l', volume_l: 50 },
  { id: 'p-keg30', label: 'KEG 30l', volume_l: 30 },
  { id: 'p-keg20', label: 'KEG 20l', volume_l: 20 },
  { id: 'p-keg15', label: 'KEG 15l', volume_l: 15 },
  { id: 'p-keg10', label: 'KEG 10l', volume_l: 10 },
  { id: 'p-pet15', label: 'PET 1.5l', volume_l: 1.5 },
  { id: 'p-pet1', label: 'PET 1l', volume_l: 1 },
  { id: 'p-lahev05', label: 'Lahve 0.5l', volume_l: 0.5 },
  { id: 'p-lahev033', label: 'Lahve 0.33l', volume_l: 0.33 },
];

const prazdneAliasy = () => ({ beer: new Map<string, string>(), package: new Map<string, string>() });
const jmeno = (id: string | null) => BEERS.find((b) => b.id === id)?.name ?? null;
const obal = (id: string | null) => PACKAGES.find((p) => p.id === id)?.label ?? null;

type Polozka = { quantity?: number | null; degree?: string | null; beer_name?: string | null; package_label?: string | null; raw_line?: string | null };
const pivo = (item: Polozka, aliasy = prazdneAliasy()) => jmeno(matchBeerId(item, BEERS, aliasy));
const balení = (item: Polozka, aliasy = prazdneAliasy()) => obal(matchPackageId(item, PACKAGES, aliasy));

describe('Pivo podle položky, ne podle celého řádku', () => {
  // Ta konkrétní zpráva z provozu. Všech pět položek dostane od AI stejný
  // raw_line (celý řádek), liší se jen stupněm — a jen jedna z nich je Osma.
  const RADEK = 'Restaurace 1x50 12, 1x50 10 a 1x50 tm, terasa 2x50 12 2x50 osma';

  it('„osma" na konci řádku nepřepíše piva ostatních položek', () => {
    expect(pivo({ degree: '12°', raw_line: RADEK })).toBe('12° Světlá');
    expect(pivo({ degree: '10°', raw_line: RADEK })).toBe('10° Desítka');
    expect(pivo({ degree: '8°', raw_line: RADEK })).toBe('Osma');
  });

  it('název piva od AI rozhodne mezi světlou a tmavou téhož stupně', () => {
    expect(pivo({ degree: '12°', beer_name: '12° Tmavá', raw_line: RADEK })).toBe('12° Tmavá');
    expect(pivo({ degree: '12°', beer_name: '12° Světlá', raw_line: RADEK })).toBe('12° Světlá');
  });

  // „Malesice: SV 12 = 3x50l KEG + 24x1,5l PET + 20x0,5l lahev" — na jednom
  // řádku jsou TŘI různé obaly. Obal se proto bere z package_label položky.
  it('víc obalů na řádku: rozhoduje obal položky, ne nejdelší nález v řádku', () => {
    const radek = 'SV 12 = 3x50l KEG + 24x1,5l PET (bez etikety) + 20x0,5l lahev';
    expect(balení({ package_label: 'KEG 50l', raw_line: radek })).toBe('KEG 50l');
    expect(balení({ package_label: 'PET 1.5l', raw_line: radek })).toBe('PET 1.5l');
    expect(balení({ package_label: 'Lahve 0.5l', raw_line: radek })).toBe('Lahve 0.5l');
  });
});

describe('Jak lidi píšou stupeň', () => {
  const varianty: [string, string, string][] = [
    // [popis, raw_line, očekávané pivo]
    ['stupeň za objemem', '10x50l 12sv', '12° Světlá'],
    ['stupeň před objemem', '12sv 3x50l', '12° Světlá'],
    ['jedenáctka zkratkou', '2x50l 11sv', '11° Světlá'],
    ['jedenáctka slovem', 'Pro mně na pátek prosím 2x50l a 1x30l. 11sl.', '11° Světlá'],
    ['desítka slovem', '8sudu 30l na pátek, desítka....Němci, díky', '10° Desítka'],
    ['desítka v 5. pádě', '270l desitky, male soudky plus tricitky', '10° Desítka'],
    ['tmavá slovem', '10xpet 1,5l tmava', '12° Tmavá'],
    ['tmavá zkratkou s číslem', '1x30l 12 tmava', '12° Tmavá'],
    ['dvanáctky hovorově', 'Žižkov na čtvrtek bude 5x30l 12cky', '12° Světlá'],
    ['stupeň se znakem °', 'Chmeloun 4*30 litrů 12° plus 10 petek 1,0l 12°', '12° Světlá'],
    ['osma hovorově', 'Na rozhlednu do Loun prosim na ctvrtek 20l Vosma', 'Osma'],
    ['cyklistická vosma', '6x cyklistická vosma 1l', 'Osma'],
    ['vlastní jméno Jantar', 'Seeberg 2x30l jantar', 'Jantar'],
    ['vlastní jméno Summer', 'Radek nakonec summer 9x30', 'Summer Ale'],
    ['jméno i stupeň — jméno vyhrává', 'Jantar 12 = 1x30l KEG', 'Jantar'],
    ['světlé slovem bez čísla', 'Seeberg 2x30l světle', '12° Světlá'],
  ];

  it.each(varianty)('%s', (_popis, radek, ocekavane) => {
    expect(pivo({ raw_line: radek })).toBe(ocekavane);
  });
});

describe('Jak lidi píšou obal', () => {
  const varianty: [string, string, string, string][] = [
    // [popis, package_label od AI, raw_line, očekávaný obal]
    ['padesátka', 'KEG 50l', '10x50l 12sv', 'KEG 50l'],
    ['třicítka', 'KEG 30l', '4x30l desitka', 'KEG 30l'],
    ['dvacítka', 'KEG 20l', '2x 20l desitka', 'KEG 20l'],
    ['patnáctka', 'KEG 15l', '3x15l 11sv', 'KEG 15l'],
    ['PET jedenapůl', 'PET 1.5l', '10xpet 1,5l tmava', 'PET 1.5l'],
    ['PET litr', 'PET 1l', '10 petek 1,0l 12°', 'PET 1l'],
    ['lahev půllitr', 'Lahve 0.5l', '20x0,5l lahev', 'Lahve 0.5l'],
    ['lahev třetinka', 'Lahve 0.33l', '4 bedny 0,3l', 'Lahve 0.33l'],
    ['obal jen v textu, AI ho nevrátila', '', '13x50l 11sv', 'KEG 50l'],
  ];

  it.each(varianty)('%s', (_popis, label, radek, ocekavany) => {
    expect(balení({ package_label: label, raw_line: radek })).toBe(ocekavany);
  });
});

describe('Stupeň položky přebíjí, co se povaluje v řádku', () => {
  // „Vsechno 11%" na konci — AI rozdá stupeň 11° všem položkám. V řádku ale
  // zůstane i „12%" z dovětku o vlastních sudech.
  const radek = 'Na utery Duck and Dog 5x20 15x30 13x50 Vsechno 11% Pak jeste 2x50 Nase sudy 12%';

  it('položka s 11° dostane jedenáctku, i když je v řádku i 12', () => {
    expect(pivo({ degree: '11°', raw_line: radek })).toBe('11° Světlá');
  });

  it('položka s 12° dostane dvanáctku z téhož řádku', () => {
    expect(pivo({ degree: '12°', raw_line: radek })).toBe('12° Světlá');
  });

  it('stupeň bez shody v katalogu nechá pivo nevyplněné, nedosadí cizí', () => {
    // 13° v katalogu není. Dřív by vyhrálo cokoli, co v řádku zaznělo.
    expect(pivo({ degree: '13°', raw_line: 'Restaurace 2x50 13, plus 1x50 osma' })).toBe(null);
  });
});

describe('Naučené zkratky nesmí přebít pivo napsané jménem', () => {
  it('zkratka „jantar → 12° Světlá" (skutečně se v produkci uložila) neplatí', () => {
    const aliasy = prazdneAliasy();
    aliasy.beer.set('jantar', 'b-12');
    expect(pivo({ raw_line: 'Seeberg 2x30l jantar' }, aliasy)).toBe('Jantar');
  });

  it('zkratka bez informace o pivu („2x10") se ignoruje', () => {
    const aliasy = prazdneAliasy();
    aliasy.beer.set('2x10', 'b-osma');
    expect(pivo({ degree: '11°', raw_line: '2x10 11sv' }, aliasy)).toBe('11° Světlá');
  });
});

describe('Holý stupeň se nelosuje', () => {
  // „12" sedí na 12° Světlou i 12° Tmavou. Dřív rozhodovalo pořadí piv
  // z databáze, takže se výsledek měnil zprávu od zprávy.
  it('neoznačený stupeň znamená světlé (tmavé se v objednávce vždy označí)', () => {
    expect(pivo({ degree: '12°', raw_line: '1x50 12' })).toBe('12° Světlá');
    expect(pivo({ degree: '12°', raw_line: '2x30 12' })).toBe('12° Světlá');
  });

  it('označené tmavé zůstane tmavé', () => {
    expect(pivo({ degree: '12°', raw_line: '1x30l 12 tmava' })).toBe('12° Tmavá');
  });
});
