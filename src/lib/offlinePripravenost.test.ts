import { describe, it, expect } from 'vitest';
import { pripravenostBezSignalu } from './offlinePripravenost';

const TED = new Date(2026, 10, 28, 12, 0).getTime();
const DNES_1108 = new Date(2026, 10, 28, 11, 8).getTime();
const kopie = (k: Partial<{ uplneT: number | null; posledniT: number | null; tabulek: number; nestazene: string[] }> = {}) =>
  ({ uplneT: null, posledniT: null, tabulek: 0, nestazene: [], ...k });

describe('pripravenostBezSignalu', () => {
  it('data i obrazovky celé → připraveno, s časem a počty', () => {
    const p = pripravenostBezSignalu(kopie({ uplneT: DNES_1108, posledniT: DNES_1108, tabulek: 47 }), { ulozeno: 128, celkem: 128, t: TED }, TED);
    expect(p.pripraveno).toBe(true);
    expect(p.nadpis).toMatch(/je připravený/);
    expect(p.data).toBe('Data: v telefonu, stažená dnes 11:08 (47 tabulek).');
    expect(p.obrazovky).toBe('Obrazovky: všechny v telefonu (128).');
  });

  it('nová verze ještě neběžela se signálem → nic nemá a řekne to', () => {
    const p = pripravenostBezSignalu(kopie(), null, TED);
    expect(p.pripraveno).toBe(false);
    expect(p.nadpis).toMatch(/ještě není úplně připravený/);
    expect(p.data).toBe('Data: v telefonu zatím nejsou.');
    expect(p.obrazovky).toMatch(/zatím nezjištěno/);
  });

  it('data jsou, obrazovky se ještě stahují → nepřipraveno, kolik chybí', () => {
    const p = pripravenostBezSignalu(kopie({ uplneT: DNES_1108, tabulek: 47 }), { ulozeno: 97, celkem: 128, t: TED }, TED);
    expect(p.pripraveno).toBe(false);
    expect(p.obrazovky).toBe('Obrazovky: 97 ze 128 — zbytek se stáhne, až bude signál.');
  });

  it('obrazovky jsou, data jen zčásti → nepřipraveno, řekne kolik tabulek se nestáhlo', () => {
    const p = pripravenostBezSignalu(kopie({ posledniT: DNES_1108, tabulek: 45, nestazene: ['orders', 'order_items'] }), { ulozeno: 128, celkem: 128, t: TED }, TED);
    expect(p.pripraveno).toBe(false);
    expect(p.data).toBe('Data: zatím jen část (45 tabulek, stažená dnes 11:08) — nestáhlo se 2.');
  });

  it('service worker bez seznamu obrazovek (0 z 0) se nepočítá jako „všechny"', () => {
    const p = pripravenostBezSignalu(kopie({ uplneT: DNES_1108, tabulek: 47 }), { ulozeno: 0, celkem: 0, t: TED }, TED);
    expect(p.pripraveno).toBe(false);
  });
});
