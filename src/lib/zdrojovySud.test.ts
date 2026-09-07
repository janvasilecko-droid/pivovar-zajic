import { describe, it, expect } from 'vitest';
import { vychoziZdrojovySud } from './zdrojovySud';

const sud = (id: string, volume_l: number | null) => ({ id, volume_l });

describe('vychoziZdrojovySud', () => {
  it('předvolí padesátku, i když v seznamu není první', () => {
    expect(vychoziZdrojovySud([sud('a', 30), sud('b', 50), sud('c', 20)])).toBe('b');
  });

  it('bez padesátky vezme největší sud', () => {
    expect(vychoziZdrojovySud([sud('a', 20), sud('b', 30), sud('c', 15)])).toBe('b');
  });

  it('prázdný katalog nevybere nic (políčko zůstane na „— žádný —")', () => {
    expect(vychoziZdrojovySud([])).toBe('');
  });

  it('sud bez zadaného objemu nevyhraje nad skutečným sudem', () => {
    expect(vychoziZdrojovySud([sud('bez', null), sud('tricitka', 30)])).toBe('tricitka');
  });

  it('objem jako text z databáze se pozná taky', () => {
    // volume_l chodí ze Supabase jako numeric, tedy občas jako řetězec.
    expect(vychoziZdrojovySud([{ id: 'a', volume_l: '30' as any }, { id: 'b', volume_l: '50' as any }])).toBe('b');
  });
});
