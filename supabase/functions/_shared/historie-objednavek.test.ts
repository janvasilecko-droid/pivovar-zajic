// Historie objednávek jako kontext pro čtení zprávy — viz hlavička
// historie-objednavek.ts. Testy hlídají hlavně tu hranici, kterou historie
// nesmí překročit: rozhoduje mezi výklady, položky nedoplňuje.
import { describe, it, expect } from 'vitest';
import { odberateleOdesilatele, obvykleBere, blokHistorie } from './historie-objednavek';

describe('odberateleOdesilatele', () => {
  it('spočítá, pro koho odesílatel objednával, a seřadí od nejčastějšího', () => {
    const vysledek = odberateleOdesilatele([
      { place_name: 'Lužec' },
      { place_name: 'Duck and Dog' },
      { place_name: 'Lužec' },
      { place_name: 'Lužec' },
    ]);
    expect(vysledek).toEqual([
      { jmeno: 'Lužec', pocet: 3 },
      { jmeno: 'Duck and Dog', pocet: 1 },
    ]);
  });

  it('objednávky bez odběratele se nepočítají', () => {
    expect(odberateleOdesilatele([{ place_name: null }, { place_name: '   ' }])).toEqual([]);
  });
});

describe('obvykleBere', () => {
  it('množství je MEDIÁN, ne součet — jinak by z pěti objednávek vyšel obří závoz', () => {
    const polozky = [2, 4, 4, 4, 30].map((quantity) => ({
      place_name: 'Lužec', beer_name: '12° Světlá', package_label: 'KEG 50l', quantity,
    }));
    expect(obvykleBere(polozky)).toEqual(['4× KEG 50l 12° Světlá']);
  });

  it('nejdřív to, co odběratel bere nejčastěji', () => {
    const polozky = [
      { place_name: 'Lužec', beer_name: '11° Světlá', package_label: 'KEG 30l', quantity: 1 },
      { place_name: 'Lužec', beer_name: '12° Světlá', package_label: 'KEG 50l', quantity: 4 },
      { place_name: 'Lužec', beer_name: '12° Světlá', package_label: 'KEG 50l', quantity: 4 },
    ];
    expect(obvykleBere(polozky)[0]).toBe('4× KEG 50l 12° Světlá');
  });

  it('položky bez piva, bez obalu nebo s nulovým množstvím se ignorují', () => {
    expect(obvykleBere([
      { place_name: 'Lužec', beer_name: null, package_label: 'KEG 50l', quantity: 4 },
      { place_name: 'Lužec', beer_name: '12° Světlá', package_label: null, quantity: 4 },
      { place_name: 'Lužec', beer_name: '12° Světlá', package_label: 'KEG 50l', quantity: 0 },
    ])).toEqual([]);
  });

  it('vypíše nejvýš šest druhů, ať prompt nenaroste o celý sklad', () => {
    const polozky = Array.from({ length: 12 }, (_, i) => ({
      place_name: 'Lužec', beer_name: `pivo ${i}`, package_label: 'KEG 50l', quantity: 1,
    }));
    expect(obvykleBere(polozky).length).toBe(6);
  });
});

describe('blokHistorie', () => {
  const jeden = {
    odesilatel: 'Bednář',
    objednavkyOdesilatele: [{ place_name: 'Lužec' }, { place_name: 'Lužec' }],
    polozkyPodleOdberatele: {},
  };

  it('prázdný řetězec, když není co říct — prázdný nadpis jen ubírá pozornost', () => {
    expect(blokHistorie({ odesilatel: 'Bednář', objednavkyOdesilatele: [], polozkyPodleOdberatele: {} })).toBe('');
    expect(blokHistorie({ odesilatel: null, objednavkyOdesilatele: [{ place_name: 'Lužec' }], polozkyPodleOdberatele: {} })).toBe('');
  });

  it('vyjmenuje odběratele odesílatele i s počty', () => {
    const blok = blokHistorie(jeden);
    expect(blok).toContain('Bednář');
    expect(blok).toContain('Lužec (2×)');
  });

  it('když posílal vždy jen pro jednoho, řekne to — ale pořád nabádá k dotazu', () => {
    const blok = blokHistorie(jeden);
    expect(blok).toContain('skoro jistě on');
    expect(blok).toContain('zeptej se');
  });

  it('u víc odběratelů se „skoro jistě on" neobjeví', () => {
    const blok = blokHistorie({
      ...jeden,
      objednavkyOdesilatele: [{ place_name: 'Lužec' }, { place_name: 'Duck and Dog' }],
    });
    expect(blok).not.toContain('skoro jistě on');
  });

  it('vždycky nese zákaz doplňovat položky z historie', () => {
    const blok = blokHistorie(jeden);
    expect(blok).toContain('NENÍ k doplňování položek');
    expect(blok).toContain('Co je napsané ve zprávě, má vždycky přednost');
  });

  it('vypíše, co odběratelé berou obvykle', () => {
    const blok = blokHistorie({
      ...jeden,
      polozkyPodleOdberatele: {
        'Lužec': [{ place_name: 'Lužec', beer_name: '12° Světlá', package_label: 'KEG 50l', quantity: 4 }],
      },
    });
    expect(blok).toContain('Lužec: 4× KEG 50l 12° Světlá');
  });
});
