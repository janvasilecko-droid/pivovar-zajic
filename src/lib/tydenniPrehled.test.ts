import { describe, it, expect } from 'vitest';
import { popisPolozek, objednavkaShoduje, zapisShoduje, type PrehledObjednavka, type PrehledZapis } from './tydenniPrehled';

describe('popisPolozek', () => {
  it('spojí položky do jedné věty', () => {
    expect(popisPolozek([
      { beer_name: '12° Světlá', package_label: 'KEG 30l', quantity: 2 },
      { beer_name: '11° Světlá', package_label: 'KEG 50l', quantity: 1 },
    ])).toBe('2× 12° Světlá KEG 30l, 1× 11° Světlá KEG 50l');
  });

  it('prázdné položky hlásí zvlášť', () => {
    expect(popisPolozek([])).toBe('(bez položek)');
  });
});

const OBJEDNAVKA: PrehledObjednavka = {
  id: 'o1',
  place_name: 'U Dubu',
  order_date: '2026-09-10',
  delivery_date: '2026-09-12',
  status: 'nova',
  polozky: [{ beer_name: '12° Světlá', package_label: 'KEG 30l', quantity: 2 }],
};

describe('objednavkaShoduje', () => {
  it('prázdný dotaz projde vždy', () => {
    expect(objednavkaShoduje(OBJEDNAVKA, '')).toBe(true);
  });
  it('najde podle odběratele', () => {
    expect(objednavkaShoduje(OBJEDNAVKA, 'dubu')).toBe(true);
  });
  it('najde podle piva v položce', () => {
    expect(objednavkaShoduje(OBJEDNAVKA, 'světlá')).toBe(true);
  });
  it('nenajde, co tam není', () => {
    expect(objednavkaShoduje(OBJEDNAVKA, 'tmavá')).toBe(false);
  });
});

const ZAPIS: PrehledZapis = {
  id: 'z1', entry_date: '2026-09-11', beer_name: '12° Tmavá', beer_color: '#3b2415', package_label: 'KEG 50l', quantity: 4, note: 'ranní směna',
};

describe('zapisShoduje', () => {
  it('najde podle piva, obalu i poznámky', () => {
    expect(zapisShoduje(ZAPIS, 'tmavá')).toBe(true);
    expect(zapisShoduje(ZAPIS, '50l')).toBe(true);
    expect(zapisShoduje(ZAPIS, 'ranní')).toBe(true);
  });
  it('nenajde cizí text', () => {
    expect(zapisShoduje(ZAPIS, 'kiwi')).toBe(false);
  });
});
