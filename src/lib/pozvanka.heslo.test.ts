import { describe, it, expect } from 'vitest';
import { textSHeslem } from './pozvanka';
import { srozumitelnaChybaPrihlaseni } from './auth';

describe('zpráva s dočasným heslem', () => {
  it('nese odkaz, e-mail, heslo a co dál', () => {
    const t = textSHeslem('a@b.cz', 'Abc123xyz9', 'https://priklad.cz/');
    expect(t).toContain('https://priklad.cz/');
    expect(t).toContain('E-mail: a@b.cz');
    expect(t).toContain('Dočasné heslo: Abc123xyz9');
    expect(t).toContain('Založte si své heslo');
  });
});

describe('chyba přihlášení', () => {
  it('špatné údaje vysvětlí česky a řekne, co dělat', () => {
    expect(srozumitelnaChybaPrihlaseni('Invalid login credentials')).toContain('Nové dočasné heslo');
  });
  it('neznámou chybu nechá být', () => {
    expect(srozumitelnaChybaPrihlaseni('Něco jiného')).toBe('Něco jiného');
  });
});
