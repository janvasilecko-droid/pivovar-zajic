import { describe, it, expect } from 'vitest';
import {
  cestaFotky, chybaFotky, jeMocVelka, jePodporovanyTyp,
  MAX_BAJTU_FOTKY, TYPY_ZAZNAMU,
} from './fotkyZaznamu';

describe('jePodporovanyTyp', () => {
  it('bere JPG, PNG a WEBP', () => {
    expect(jePodporovanyTyp('image/jpeg')).toBe(true);
    expect(jePodporovanyTyp('image/png')).toBe(true);
    expect(jePodporovanyTyp('IMAGE/WEBP')).toBe(true);
  });

  it('PDF ani prázdný typ neprojdou', () => {
    expect(jePodporovanyTyp('application/pdf')).toBe(false);
    expect(jePodporovanyTyp('')).toBe(false);
    expect(jePodporovanyTyp(null)).toBe(false);
  });
});

describe('jeMocVelka', () => {
  it('zmenšená fotka projde, nezmenšená ne', () => {
    expect(jeMocVelka(200_000)).toBe(false);
    expect(jeMocVelka(MAX_BAJTU_FOTKY + 1)).toBe(true);
  });
});

describe('cestaFotky', () => {
  const KDY = new Date('2026-09-04T08:30:00.000Z');

  it('skládá cestu z typu, záznamu a času', () => {
    const c = cestaFotky('odpis', 'abc-123', 'image/jpeg', KDY, 'xxxxxx');
    expect(c).toBe('odpis/abc-123/2026-09-04T08-30-00-000Z-xxxxxx.jpg');
  });

  it('dvě fotky ve stejnou vteřinu se nepřepíšou', () => {
    // Série z telefonu: bez náhodné části by druhá fotka tiše smazala první.
    const a = cestaFotky('odpis', 'abc', 'image/jpeg', KDY, 'aaaaaa');
    const b = cestaFotky('odpis', 'abc', 'image/jpeg', KDY, 'bbbbbb');
    expect(a).not.toBe(b);
  });

  it('z názvu záznamu vyhodí lomítka a diakritiku', () => {
    // Storage by z lomítek udělal podadresáře.
    const c = cestaFotky('sud', '../../tajne/id čj', 'image/png', KDY, 'zzzzzz');
    expect(c).toBe('sud/tajneidj/2026-09-04T08-30-00-000Z-zzzzzz.png');
  });

  it('prázdné id nedá cestu končící lomítkem', () => {
    expect(cestaFotky('zavoz', '', 'image/webp', KDY, 'qqqqqq'))
      .toBe('zavoz/bez-zaznamu/2026-09-04T08-30-00-000Z-qqqqqq.webp');
  });

  it('neznámý typ dostane příponu jpg, ne prázdnou', () => {
    expect(cestaFotky('odpis', 'a', 'image/heic', KDY, 'wwwwww').endsWith('.jpg')).toBe(true);
  });
});

describe('chybaFotky', () => {
  it('dobrá fotka nemá chybu', () => {
    expect(chybaFotky('image/jpeg', 180_000)).toBeNull();
  });

  it('řekne DŮVOD, ne jen „nepodařilo se"', () => {
    // Bez důvodu to člověk zkusí pětkrát se stejnou fotkou.
    expect(chybaFotky('application/pdf', 1000)).toMatch(/JPG/);
    expect(chybaFotky('image/jpeg', MAX_BAJTU_FOTKY + 1)).toMatch(/velká/);
  });
});

describe('TYPY_ZAZNAMU', () => {
  it('má český popis ke každému klíči', () => {
    for (const [klic, popis] of Object.entries(TYPY_ZAZNAMU)) {
      expect(popis.length).toBeGreaterThan(2);
      expect(klic).toMatch(/^[a-z]+$/);
    }
  });
});
