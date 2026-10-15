// 🔁 Zdvojená objednávka nebo řádek (lib/duplicityObjednavek.ts).
// Z provozu 15. 10. 2026: „duplicitní objednávka nebo odečtení se nesmí
// opakovat" — případy níž jsou skutečné objednávky Restaurace z října.
import { describe, it, expect } from 'vitest';
import {
  datumKratce, denObjednavky, kdyZadano, najdiShody, najdiZdvojeneRadky, normJmeno, pondeliTydne,
  stejnyOdberatel, textDuplicity, textZdvojenychRadku,
  type Nazvy, type ObjednavkaKPorovnani, type PolozkaUlozena, type RadekNove,
} from './duplicityObjednavek';

const SVETLA = 'b-svetla';
const DESITKA = 'b-desitka';
const TMAVA = 'b-tmava';
const JANTAR = 'b-jantar';
const K50 = 'p-keg50';
const K30 = 'p-keg30';
const L15 = 'p-l15';
const L1 = 'p-l1';

const NAZVY: Nazvy = {
  pivo: (id) => ({ [SVETLA]: '12° Světlá', [DESITKA]: '10° Desítka', [TMAVA]: '12° Tmavá', [JANTAR]: 'Jantar' } as Record<string, string>)[id ?? ''] ?? '?',
  obal: (id) => ({ [K50]: '50 l', [K30]: '30 l', [L15]: '1,5 l', [L1]: '1 l' } as Record<string, string>)[id ?? ''] ?? '?',
};

const pol = (beer: string, pkg: string, qty: number): PolozkaUlozena => ({ beer_id: beer, package_id: pkg, quantity: qty });
const r = (beerId: string, pkgId: string, qty: number): RadekNove => ({ beerId, pkgId, qty });
const obj = (o: Partial<ObjednavkaKPorovnani> & { id: string }): ObjednavkaKPorovnani => ({
  place_id: 'pl-rest', place_name: 'Restaurace', order_date: '2026-10-11', delivery_date: '2026-10-11',
  status: 'nova', source: 'rucne', created_at: '2026-10-11T10:10:44+00:00', polozky: [], ...o,
});

// Skutečné objednávky: ručně zadaná 11. 10. a znovu zpětně 13. 10. (s řádkem navíc).
const PUVODNI_11_10 = obj({ id: 'd98efc65', polozky: [pol(SVETLA, K50, 1), pol(DESITKA, K30, 1)] });

describe('najdiShody — nová objednávka proti uloženým', () => {
  it('případ z 13. 10.: zpětně zadaná Restaurace na 11. 10. má řádek navíc, ale shoda je poznat', () => {
    const shody = najdiShody({
      placeId: 'pl-rest', placeName: 'Restaurace', orderDate: '2026-10-13', deliveryDate: '2026-10-11',
      radky: [r(SVETLA, K50, 1), r(TMAVA, K50, 1), r(DESITKA, K30, 1)],
    }, [PUVODNI_11_10]);
    expect(shody).toHaveLength(1);
    expect(shody[0].objednavka.id).toBe('d98efc65');
    expect(shody[0].stejnyDen).toBe(true);
    expect(shody[0].uplna).toBe(false); // Tmavá 50 l v původní není
    expect(shody[0].stejne.map((x) => x.beerId)).toEqual([SVETLA, DESITKA]);
    expect(shody[0].jinyPocet).toEqual([]);
  });

  it('přesná kopie téhož dne je úplná shoda', () => {
    const [s] = najdiShody({ placeName: 'Restaurace', deliveryDate: '2026-10-11', radky: [r(SVETLA, K50, 1), r(DESITKA, K30, 1)] }, [PUVODNI_11_10]);
    expect(s.uplna).toBe(true);
    expect(s.stejnyDen).toBe(true);
  });

  it('stejné pivo a obal téhož dne s jiným množstvím je taky shoda (druhý sud, nebo oprava překlepu)', () => {
    const [s] = najdiShody({ placeName: 'Restaurace', deliveryDate: '2026-10-11', radky: [r(SVETLA, K50, 2)] }, [PUVODNI_11_10]);
    expect(s.stejne).toEqual([]);
    expect(s.jinyPocet).toEqual([{ radek: r(SVETLA, K50, 2), ulozeno: 1 }]);
    expect(s.uplna).toBe(false);
  });

  it('jiné pivo nebo jiný obal téhož dne žádná shoda není', () => {
    expect(najdiShody({ placeName: 'Restaurace', deliveryDate: '2026-10-11', radky: [r(JANTAR, K50, 1), r(SVETLA, L1, 5)] }, [PUVODNI_11_10])).toEqual([]);
  });

  it('jiný den téhož týdne: částečný překryv se neřeší, úplná shoda ano', () => {
    const stred = { placeName: 'Restaurace', deliveryDate: '2026-10-08' };
    expect(najdiShody({ ...stred, radky: [r(SVETLA, K50, 1), r(TMAVA, K50, 1)] }, [PUVODNI_11_10])).toEqual([]);
    const [s] = najdiShody({ ...stred, radky: [r(SVETLA, K50, 1), r(DESITKA, K30, 1)] }, [PUVODNI_11_10]);
    expect(s.uplna).toBe(true);
    expect(s.stejnyDen).toBe(false);
  });

  it('týden se počítá od pondělí: neděle 11. 10. a pondělí 12. 10. jsou dva týdny', () => {
    // 12. 10. je už další týden → i úplně stejná objednávka je pravidelná týdenní, ne duplicita
    expect(najdiShody({ placeName: 'Restaurace', deliveryDate: '2026-10-12', radky: [r(SVETLA, K50, 1), r(DESITKA, K30, 1)] }, [PUVODNI_11_10])).toEqual([]);
  });

  it('pravidelná týdenní objednávka (stejné položky o týden později) není duplicita', () => {
    expect(najdiShody({ placeName: 'Restaurace', deliveryDate: '2026-10-18', radky: [r(SVETLA, K50, 1), r(DESITKA, K30, 1)] }, [PUVODNI_11_10])).toEqual([]);
  });

  it('jiný odběratel není shoda', () => {
    expect(najdiShody({ placeName: 'Terasa', placeId: 'pl-terasa', deliveryDate: '2026-10-11', radky: [r(SVETLA, K50, 1)] }, [PUVODNI_11_10])).toEqual([]);
  });

  it('odběratel se pozná podle názvu bez ohledu na velikost písmen, mezery a diakritiku', () => {
    const zizkov = obj({ id: 'z', place_id: null, place_name: 'Žižkov', polozky: [pol(SVETLA, K50, 1)] });
    for (const jmeno of ['zizkov', ' ŽIŽKOV ', 'Zizkov']) {
      expect(najdiShody({ placeName: jmeno, deliveryDate: '2026-10-11', radky: [r(SVETLA, K50, 1)] }, [zizkov]), jmeno).toHaveLength(1);
    }
  });

  it('stejné id odběratele stačí, i když je název napsaný jinak', () => {
    expect(najdiShody({ placeId: 'pl-rest', placeName: 'Hostinec U Restaurace', deliveryDate: '2026-10-11', radky: [r(SVETLA, K50, 1)] }, [PUVODNI_11_10])).toHaveLength(1);
  });

  it('odběratel bez id i bez názvu se s ničím nespáruje', () => {
    expect(najdiShody({ deliveryDate: '2026-10-11', radky: [r(SVETLA, K50, 1)] }, [PUVODNI_11_10])).toEqual([]);
  });

  it('stornovaná objednávka se nepočítá', () => {
    expect(najdiShody({ placeName: 'Restaurace', deliveryDate: '2026-10-11', radky: [r(SVETLA, K50, 1)] }, [{ ...PUVODNI_11_10, status: 'storno' }])).toEqual([]);
  });

  it('upravovaná objednávka se nesrovnává sama se sebou', () => {
    expect(najdiShody({ placeName: 'Restaurace', deliveryDate: '2026-10-11', radky: [r(SVETLA, K50, 1)], vynechatId: 'd98efc65' }, [PUVODNI_11_10])).toEqual([]);
  });

  it('prázdné řádky se ignorují a bez vyplněného řádku nebo bez dne se nehledá', () => {
    expect(najdiShody({ placeName: 'Restaurace', deliveryDate: '2026-10-11', radky: [] }, [PUVODNI_11_10])).toEqual([]);
    expect(najdiShody({ placeName: 'Restaurace', deliveryDate: '2026-10-11', radky: [{ beerId: '', pkgId: K50, qty: 1 }, { beerId: SVETLA, pkgId: K50, qty: 0 }] }, [PUVODNI_11_10])).toEqual([]);
    expect(najdiShody({ placeName: 'Restaurace', radky: [r(SVETLA, K50, 1)] }, [PUVODNI_11_10])).toEqual([]);
  });

  it('den dovozu má přednost před dnem zadání — u obou stran', () => {
    // nová: zadaná 13. 10., dovoz 11. 10.; uložená bez data dovozu, zadaná 11. 10.
    const bezDovozu = obj({ id: 'x', delivery_date: null, order_date: '2026-10-11', polozky: [pol(SVETLA, K50, 1)] });
    expect(najdiShody({ placeName: 'Restaurace', orderDate: '2026-10-13', deliveryDate: '2026-10-11', radky: [r(SVETLA, K50, 1)] }, [bezDovozu])).toHaveLength(1);
    // nová bez dovozu se bere podle data zadání
    expect(najdiShody({ placeName: 'Restaurace', orderDate: '2026-10-11', radky: [r(SVETLA, K50, 1)] }, [PUVODNI_11_10])).toHaveLength(1);
  });

  it('dva stejné nové řádky nejsou shodné s jednou uloženou položkou dvakrát', () => {
    const [s] = najdiShody({ placeName: 'Restaurace', deliveryDate: '2026-10-11', radky: [r(SVETLA, K50, 1), r(SVETLA, K50, 1)] }, [PUVODNI_11_10]);
    expect(s.stejne).toHaveLength(1);
    expect(s.uplna).toBe(false);
  });

  it('přesná shoda má přednost před jiným množstvím u téhož piva', () => {
    const ulozena = obj({ id: 'u', polozky: [pol(SVETLA, K50, 2), pol(SVETLA, K50, 5)] });
    const [s] = najdiShody({ placeName: 'Restaurace', deliveryDate: '2026-10-11', radky: [r(SVETLA, K50, 5), r(SVETLA, K50, 3)] }, [ulozena]);
    expect(s.stejne).toEqual([r(SVETLA, K50, 5)]);
    expect(s.jinyPocet).toEqual([{ radek: r(SVETLA, K50, 3), ulozeno: 2 }]);
  });

  it('nejpodobnější je první: úplná shoda před částečnou, stejný den před stejným týdnem', () => {
    const castecna = obj({ id: 'castecna', delivery_date: '2026-10-11', polozky: [pol(SVETLA, K50, 1), pol(TMAVA, K50, 3)] });
    const uplna = obj({ id: 'uplna', delivery_date: '2026-10-09', order_date: '2026-10-09', polozky: [pol(SVETLA, K50, 1), pol(DESITKA, K30, 1)] });
    const stejnyDen = obj({ id: 'stejny-den', delivery_date: '2026-10-11', polozky: [pol(SVETLA, K50, 1), pol(DESITKA, K30, 1), pol(JANTAR, K50, 1)] });
    const shody = najdiShody({ placeName: 'Restaurace', deliveryDate: '2026-10-11', radky: [r(SVETLA, K50, 1), r(DESITKA, K30, 1)] }, [castecna, uplna, stejnyDen]);
    expect(shody.map((s) => s.objednavka.id)).toEqual(['stejny-den', 'uplna', 'castecna']);
  });
});

describe('najdiZdvojeneRadky — řádky přidávané do už uložené objednávky', () => {
  // Objednávka Restaurace na 12. 10. (z fotky), do které se 15. 10. přidal Jantar podruhé.
  const ULOZENE: PolozkaUlozena[] = [
    pol(SVETLA, L15, 5), pol(TMAVA, L15, 3), pol(JANTAR, L15, 5), pol(DESITKA, L15, 6),
  ];

  it('případ z 15. 10.: Jantar 1,5 l × 5 už v objednávce je, Světlá 1 l ne', () => {
    const z = najdiZdvojeneRadky(ULOZENE, [r(SVETLA, L1, 5), r(JANTAR, L15, 5)]);
    expect(z).toEqual([{ radek: r(JANTAR, L15, 5), ulozeno: [5], stejnyPocet: true }]);
  });

  it('stejné pivo a obal s jiným množstvím se hlásí, ale není to „přesně takový řádek"', () => {
    const [z] = najdiZdvojeneRadky(ULOZENE, [r(JANTAR, L15, 8)]);
    expect(z.stejnyPocet).toBe(false);
    expect(z.ulozeno).toEqual([5]);
  });

  it('víc uložených řádků téhož piva: ukáže se všechna množství, shoda stačí s kterýmkoli', () => {
    const [z] = najdiZdvojeneRadky([pol(JANTAR, L15, 5), pol(JANTAR, L15, 2)], [r(JANTAR, L15, 2)]);
    expect(z.ulozeno).toEqual([5, 2]);
    expect(z.stejnyPocet).toBe(true);
  });

  it('nové pivo v objednávce nic nehlásí; prázdné řádky se ignorují', () => {
    expect(najdiZdvojeneRadky(ULOZENE, [r(JANTAR, K50, 1), { beerId: '', pkgId: L15, qty: 3 }, r(JANTAR, L15, 0)])).toEqual([]);
    expect(najdiZdvojeneRadky([], [r(JANTAR, L15, 5)])).toEqual([]);
  });

  it('množství jako text z databáze se počítá jako číslo', () => {
    const [z] = najdiZdvojeneRadky([{ beer_id: JANTAR, package_id: L15, quantity: '5' }], [r(JANTAR, L15, 5)]);
    expect(z.stejnyPocet).toBe(true);
  });
});

describe('pomocné funkce', () => {
  it('normJmeno: bez diakritiky, velkých písmen a nadbytečných znaků', () => {
    expect(normJmeno(' Lokálka  Říčany ')).toBe('lokalka ricany');
    expect(normJmeno('Duck & Dog')).toBe('duck dog');
    expect(normJmeno(null)).toBe('');
  });

  it('stejnyOdberatel: id nebo název, prázdný název nikdy', () => {
    expect(stejnyOdberatel({ placeId: 'a' }, { place_id: 'a', place_name: null })).toBe(true);
    expect(stejnyOdberatel({ placeId: 'a', placeName: 'X' }, { place_id: 'b', place_name: 'Y' })).toBe(false);
    expect(stejnyOdberatel({ placeName: 'Maneo' }, { place_name: 'MANEO' })).toBe(true);
    expect(stejnyOdberatel({ placeName: '' }, { place_name: '' })).toBe(false);
    expect(stejnyOdberatel({}, {})).toBe(false);
  });

  it('pondeliTydne: neděle patří do předchozího týdne, pondělí začíná nový, přes konec roku', () => {
    expect(pondeliTydne('2026-10-11')).toBe('2026-10-05'); // neděle
    expect(pondeliTydne('2026-10-12')).toBe('2026-10-12'); // pondělí
    expect(pondeliTydne('2026-10-18')).toBe('2026-10-12');
    expect(pondeliTydne('2027-01-01')).toBe('2026-12-28');
  });

  it('denObjednavky: dovoz, jinak zadání, jinak nic', () => {
    expect(denObjednavky({ delivery_date: '2026-10-11', order_date: '2026-10-13' })).toBe('2026-10-11');
    expect(denObjednavky({ delivery_date: null, order_date: '2026-10-13' })).toBe('2026-10-13');
    expect(denObjednavky({})).toBeNull();
  });

  it('datumKratce a kdyZadano (pražský čas, léto i zima)', () => {
    expect(datumKratce('2026-10-05')).toBe('5. 10.');
    expect(kdyZadano('2026-10-11T10:10:44+00:00')).toBe('11. 10. v 12:10'); // letní čas
    expect(kdyZadano('2026-12-01T10:05:00Z')).toBe('1. 12. v 11:05'); // zimní čas
    expect(kdyZadano('2026-10-11T23:30:00Z')).toBe('12. 10. v 01:30'); // přes půlnoc
    expect(kdyZadano(null)).toBeNull();
    expect(kdyZadano('nesmysl')).toBeNull();
  });
});

describe('texty dialogů', () => {
  const nova = { placeName: 'Restaurace', orderDate: '2026-10-13', deliveryDate: '2026-10-11' };

  it('částečná shoda: kde je uložená, odkdy, co se shoduje a proč na tom záleží', () => {
    const shody = najdiShody({ ...nova, radky: [r(SVETLA, K50, 1), r(TMAVA, K50, 1), r(DESITKA, K30, 1)] }, [PUVODNI_11_10]);
    const text = textDuplicity(shody, NAZVY);
    expect(text).toContain('Uložená objednávka: Restaurace, dodání 11. 10., zadaná ručně 11. 10. v 12:10.');
    expect(text).toContain('Stejné položky už v ní jsou: 12° Světlá 50 l ×1, 10° Desítka 30 l ×1.');
    expect(text).not.toContain('Všechny zadávané položky');
    expect(text).toContain('sklad odečetla podruhé');
  });

  it('úplná shoda to řekne', () => {
    const shody = najdiShody({ ...nova, radky: [r(SVETLA, K50, 1), r(DESITKA, K30, 1)] }, [PUVODNI_11_10]);
    expect(textDuplicity(shody, NAZVY)).toContain('Všechny zadávané položky už v ní jsou: 12° Světlá 50 l ×1, 10° Desítka 30 l ×1.');
  });

  it('jiné množství: napíše uložené i zadávané', () => {
    const shody = najdiShody({ ...nova, radky: [r(SVETLA, K50, 2)] }, [PUVODNI_11_10]);
    expect(textDuplicity(shody, NAZVY)).toContain('Totéž pivo a obal s jiným množstvím: 12° Světlá 50 l — uloženo ×1, zadáváš ×2.');
  });

  it('původ objednávky: z fotky, z WhatsAppu; neznámý zdroj se nevymýšlí', () => {
    for (const [source, slovo] of [['fotka', 'zadaná z fotky'], ['whatsapp', 'zadaná z WhatsAppu'], ['duplikat', 'zadaná kopií jiné objednávky']] as const) {
      const shody = najdiShody({ ...nova, radky: [r(SVETLA, K50, 1)] }, [{ ...PUVODNI_11_10, source }]);
      expect(textDuplicity(shody, NAZVY), source).toContain(slovo);
    }
    const bez = najdiShody({ ...nova, radky: [r(SVETLA, K50, 1)] }, [{ ...PUVODNI_11_10, source: 'neco', created_at: null }]);
    expect(textDuplicity(bez, NAZVY)).toContain('Restaurace, dodání 11. 10., zadaná.');
  });

  it('víc podobných: ukáže nejpodobnější a zbytek spočítá', () => {
    const dalsi = (id: string) => obj({ id, polozky: [pol(SVETLA, K50, 1)] });
    const shody = najdiShody({ ...nova, radky: [r(SVETLA, K50, 1), r(DESITKA, K30, 1)] }, [PUVODNI_11_10, dalsi('a'), dalsi('b')]);
    expect(textDuplicity(shody, NAZVY)).toContain('(A ještě 2 další podobné.)');
    expect(textDuplicity(shody.slice(0, 2), NAZVY)).toContain('(A ještě 1 další podobná.)');
    expect(textDuplicity([], NAZVY)).toBe('');
  });

  it('textZdvojenychRadku: přesný řádek a řádek s jiným množstvím', () => {
    const z = najdiZdvojeneRadky([pol(JANTAR, L15, 5), pol(SVETLA, L15, 4)], [r(JANTAR, L15, 5), r(SVETLA, L15, 8)]);
    const text = textZdvojenychRadku(z, NAZVY);
    expect(text).toContain('• Jantar 1,5 l ×5 — v objednávce už je přesně takový řádek');
    expect(text).toContain('• 12° Světlá 1,5 l ×8 — v objednávce už je ×4');
    expect(text).toContain('Druhý stejný řádek by sklad odečetl podruhé.');
  });
});
