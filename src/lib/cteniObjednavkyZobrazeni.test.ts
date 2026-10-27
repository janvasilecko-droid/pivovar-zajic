import { describe, it, expect } from 'vitest';
import {
  unikatniHlaseni,
  srozumitelnaChybaCteni,
  popisPrectenychPolozek,
  popisMistaADne,
} from './cteniObjednavkyZobrazeni';

describe('unikatniHlaseni', () => {
  it('stejný text nechá jen jednou, i s jinými mezerami a velikostí písmen', () => {
    expect(unikatniHlaseni([
      'Položka 2×30 l se v originálu nenašla',
      '  položka 2×30 l se v originálu nenašla  ',
      'Jiná chyba',
      '',
      null,
    ])).toEqual([
      'Položka 2×30 l se v originálu nenašla',
      'Jiná chyba',
    ]);
  });
});

describe('srozumitelnaChybaCteni', () => {
  it('timeout a dump nepřekládá do okna jako technický text', () => {
    expect(srozumitelnaChybaCteni('AI request timed out')).toBe('Čtení trvalo moc dlouho. Zkuste znovu.');
    expect(srozumitelnaChybaCteni('TypeError: Cannot read properties of null\n    at parse (index.js:12)'))
      .toBe('Čtení se nepovedlo. Zkuste znovu.');
    expect(srozumitelnaChybaCteni('  ')).toBeNull();
  });

  it('krátkou srozumitelnou hlášku nechá', () => {
    expect(srozumitelnaChybaCteni('Fotka nedorazila.')).toBe('Fotka nedorazila.');
  });
});

describe('popisPrectenychPolozek a popisMistaADne', () => {
  it('složí místo, den a položky pro náhled v seznamu', () => {
    const nahled = popisMistaADne({
      parsed_place_name: 'Seeberg',
      parsed_delivery_day: 'čtvrtek',
      parsed_delivery_date: '2026-10-29',
    });
    expect(nahled.misto).toBe('Seeberg');
    expect(nahled.den).toMatch(/^čtvrtek · 29\. ?10\. ?2026$/);
    expect(popisPrectenychPolozek([
      { qty: 4, beer_name: '12° Světlá', package_label: '30 l' },
      { qty: 2, beer_name: '11°', package_label: '50 l' },
    ])).toBe('4× 12° Světlá 30 l, 2× 11° 50 l');
  });
});
