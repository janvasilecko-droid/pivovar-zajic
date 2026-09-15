import { describe, it, expect } from 'vitest';
import { uhodniDruhehoOdberatele } from './druhyOdberatel';

describe('uhodniDruhehoOdberatele', () => {
  it('najde druhého odběratele v bloku odděleném prázdným řádkem', () => {
    const text = 'Chmeloun\n4x30l 12sv\n\nSluhy\n10x30l desitka';
    expect(uhodniDruhehoOdberatele(text, 'Chmeloun')).toBe('Sluhy');
  });

  it('vynechá blok, který vypadá jako položka (obsahuje číslo)', () => {
    const text = 'Radek\n2x50l 12sv\n\n3x30l desitka';
    expect(uhodniDruhehoOdberatele(text, 'Radek')).toBeNull();
  });

  it('bez druhého bloku nic nenavrhne', () => {
    expect(uhodniDruhehoOdberatele('Chmeloun\n4x30l 12sv', 'Chmeloun')).toBeNull();
  });

  it('prázdný nebo chybějící text je bezpečně "nic"', () => {
    expect(uhodniDruhehoOdberatele(null, 'Chmeloun')).toBeNull();
    expect(uhodniDruhehoOdberatele('', 'Chmeloun')).toBeNull();
  });

  it('nenavrhne stejného odběratele, i s jinou diakritikou/velikostí písmen', () => {
    const text = 'Žižkov\n2x30l\n\nzizkov\n1x50l';
    expect(uhodniDruhehoOdberatele(text, 'Žižkov')).toBeNull();
  });

  it('přeskočí příliš dlouhý první řádek (spíš popis položky než jméno)', () => {
    const text = 'Chmeloun\n4x30l\n\nTohle je moc dlouhý řádek na to, aby to bylo jméno odběratele a ne položka\nněco';
    expect(uhodniDruhehoOdberatele(text, 'Chmeloun')).toBeNull();
  });
});
