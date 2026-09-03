/**
 * 🎨 Barva upozornění nesmí být barvou, kterou si někdo vybere na dlaždici.
 *
 * `hs-tile-alert` má podklad #c1121f a to byla zároveň volitelná barva
 * `crimson` — takže dlaždice přebarvená uživatelem vypadala jako „výčep
 * u zákazníka po termínu". Obráceně to platí stejně: když červená může
 * znamenat cokoliv, přestane znamenat něco.
 *
 * Test hlídá i BUDOUCÍ přidání barvy do palety: nová barva blízká červené
 * nebo hnědooranžové upozornění by tichou kolizi vrátila.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  TILE_COLORS, COLOR_HEX, BARVY_UPOZORNENI, HEX_UPOZORNENI, HEX_VAROVANI,
} from './homeLayout';

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Vzdálenost barev v RGB. Hrubé, ale na „splývá / nesplývá" to stačí. */
function vzdalenost(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/** Pod touhle vzdáleností se barvy na telefonu za světla nerozeznají. */
const MIN_VZDALENOST = 60;

describe('barvy vyhrazené pro upozornění', () => {
  it('vyhrazené barvy se nedají vybrat na dlaždici', () => {
    for (const barva of BARVY_UPOZORNENI) {
      expect(TILE_COLORS).not.toContain(barva);
    }
  });

  it('ale ZŮSTÁVAJÍ v COLOR_HEX — komu je má uložené, nesmí zčernat dlaždice', () => {
    for (const barva of BARVY_UPOZORNENI) {
      expect(COLOR_HEX[barva]).toBeTruthy();
    }
  });

  it('žádná vybíratelná barva nesplývá s barvou upozornění ani varování', () => {
    const kolize = TILE_COLORS
      .map((b) => ({
        barva: b,
        kUpozorneni: vzdalenost(COLOR_HEX[b], HEX_UPOZORNENI),
        kVarovani: vzdalenost(COLOR_HEX[b], HEX_VAROVANI),
      }))
      .filter((x) => x.kUpozorneni < MIN_VZDALENOST || x.kVarovani < MIN_VZDALENOST)
      .map((x) => `${x.barva} (${COLOR_HEX[x.barva]}): ${Math.round(x.kUpozorneni)} od upozornění, ${Math.round(x.kVarovani)} od varování`);
    expect(kolize).toEqual([]);
  });

  it('hexy v testu odpovídají tomu, co je opravdu v CSS', () => {
    // Kdyby někdo přebarvil upozornění v CSS a zapomněl na tuhle konstantu,
    // celý test by hlídal barvu, která už v appce není.
    const css = readFileSync('src/screens/HomeScreen.css', 'utf8');
    expect(css).toContain('rgba(193,18,31,0.82)'); // = HEX_UPOZORNENI
    expect(css).toContain('rgba(180,83,9,0.80)'); // = HEX_VAROVANI
    expect(HEX_UPOZORNENI.toLowerCase()).toBe('#c1121f');
    expect(HEX_VAROVANI.toLowerCase()).toBe('#b45309');
  });
});
