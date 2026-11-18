// 🔎 Hledání bez diakritiky (majitel 18. 11. 2026: „vyhledávání odběratelů ať
// jde i bez diakritiky").
import { describe, it, expect } from 'vitest';
import { proHledani, shodaHledani } from './hledani';

describe('proHledani', () => {
  it('malá písmena, bez diakritiky, jednotné mezery', () => {
    expect(proHledani('  Lužec  ')).toBe('luzec');
    expect(proHledani('Žižkov — Cimburkova')).toBe('zizkov — cimburkova');
    expect(proHledani('Hospoda  U\tLípy')).toBe('hospoda u lipy');
    expect(proHledani('ŘÍČANY')).toBe('ricany');
    expect(proHledani(null)).toBe('');
    expect(proHledani(undefined)).toBe('');
  });
});

describe('shodaHledani', () => {
  it('„luzec" najde „Lužec" a naopak', () => {
    expect(shodaHledani('Lužec', 'luzec')).toBe(true);
    expect(shodaHledani('Luzec', 'LUŽEC')).toBe(true);
    expect(shodaHledani('Žižkov', 'zizkov')).toBe(true);
    expect(shodaHledani('Lokálka Říčany', 'ricany')).toBe(true);
  });

  it('prázdný dotaz odpovídá všemu, i prázdnému poli', () => {
    expect(shodaHledani('Lužec', '')).toBe(true);
    expect(shodaHledani('Lužec', '   ')).toBe(true);
    expect(shodaHledani(null, '')).toBe(true);
    expect(shodaHledani(null, undefined)).toBe(true);
  });

  it('nic neodpovídá, když v poli není', () => {
    expect(shodaHledani('Lužec', 'seeberg')).toBe(false);
    expect(shodaHledani(null, 'luzec')).toBe(false);
    expect(shodaHledani([], 'luzec')).toBe(false);
  });

  it('víc slov: musí sedět všechna, v libovolném pořadí', () => {
    expect(shodaHledani('Hospoda U Lípy', 'lipy hospoda')).toBe(true);
    expect(shodaHledani('Hospoda U Lípy', 'hospoda lipa')).toBe(false);
    expect(shodaHledani('Radek Sklad', 'sklad radek')).toBe(true);
  });

  it('víc polí: slova se mohou dělit mezi pole', () => {
    expect(shodaHledani(['Lužec', '12° Světlá', null], 'luzec 12')).toBe(true);
    expect(shodaHledani(['Lužec', '12° Světlá'], 'luzec tmava')).toBe(false);
  });

  it('adresa a kontakt: najde se i bez diakritiky', () => {
    expect(shodaHledani(['Zizkov', 'Cimburkova, Žižkov, Praha 3', null], 'zizkov praha')).toBe(true);
    expect(shodaHledani(['Dadali', null, 'Jiří Černý'], 'cerny')).toBe(true);
  });
});
