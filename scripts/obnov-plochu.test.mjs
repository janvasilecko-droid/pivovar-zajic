// Obnova plochy ze zálohy vrací vzhled, ne obsah (7. 10. 2026).
import { describe, it, expect } from 'vitest';
import { obnovenaPlocha } from './obnov-plochu.mjs';

describe('obnovenaPlocha', () => {
  const zaloha = {
    pages: [['orders', 'notes'], ['cellar']],
    overrides: { orders: { color: 'coral' }, notes: { color: 'citrus' } },
    dock: ['home', 'orders', 'orders_entry'],
    hidden: ['depozitar'],
    notes: [{ text: 'stará poznámka' }],
    countdowns: [],
  };
  const ted = {
    pages: [['orders', 'depozitar']],
    overrides: { orders: { color: 'sky' } },
    dock: ['orders', 'kegging', 'bottling', 'notes', 'home'],
    hidden: [],
    notes: [{ text: 'dnešní poznámka' }],
    countdowns: [{ id: 'a' }],
    ciselnikyNaPlose: true,
  };

  it('vrátí rozložení, barvy, schované dlaždice a lištu ze zálohy', () => {
    const v = obnovenaPlocha(zaloha, ted);
    expect(v.pages).toEqual(zaloha.pages);
    expect(v.overrides).toEqual(zaloha.overrides);
    expect(v.dock).toEqual(zaloha.dock);
    expect(v.hidden).toEqual(zaloha.hidden);
    expect('ciselnikyNaPlose' in v).toBe(false);
  });

  it('poznámky a odpočty nechá aktuální', () => {
    const v = obnovenaPlocha(zaloha, ted);
    expect(v.notes).toEqual(ted.notes);
    expect(v.countdowns).toEqual(ted.countdowns);
  });

  it('bez aktuálních poznámek nechá ty ze zálohy', () => {
    expect(obnovenaPlocha(zaloha, null).notes).toEqual(zaloha.notes);
  });
});
