import { describe, it, expect } from 'vitest';
import { najdiVicka, poKlepnuti, type Tecka } from './pocitaniVicek';

/** Zkušební fotka: plátno jedné barvy, do kterého se kreslí kruhy a obdélníky. */
function platno(sirka: number, vyska: number, barva: [number, number, number]) {
  const data = new Uint8ClampedArray(sirka * vyska * 4);
  const bod = (x: number, y: number, b: [number, number, number]) => {
    if (x < 0 || y < 0 || x >= sirka || y >= vyska) return;
    const i = (y * sirka + x) * 4;
    data[i] = b[0]; data[i + 1] = b[1]; data[i + 2] = b[2]; data[i + 3] = 255;
  };
  for (let y = 0; y < vyska; y++) for (let x = 0; x < sirka; x++) bod(x, y, barva);
  return {
    data, sirka, vyska,
    kruh(cx: number, cy: number, r: number, b: [number, number, number]) {
      for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) bod(x, y, b);
      }
    },
    obdelnik(x0: number, y0: number, x1: number, y1: number, b: [number, number, number]) {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) bod(x, y, b);
    },
  };
}

const LAHEV: [number, number, number] = [8, 6, 4];
const VICKO: [number, number, number] = [200, 190, 140];
const DREVO: [number, number, number] = [170, 135, 75];
const ZED: [number, number, number] = [210, 205, 195];

describe('najdiVicka', () => {
  it('najde každé víčko na tmavých lahvích právě jednou', () => {
    const p = platno(300, 200, LAHEV);
    const stredy: [number, number][] = [];
    for (let radek = 0; radek < 4; radek++) for (let sloupec = 0; sloupec < 6; sloupec++) {
      stredy.push([30 + sloupec * 45, 30 + radek * 45]);
    }
    stredy.forEach(([x, y]) => p.kruh(x, y, 8, VICKO));

    const vicka = najdiVicka(p.data, p.sirka, p.vyska);

    expect(vicka).toHaveLength(24);
    stredy.forEach(([x, y]) => {
      const shoda = vicka.filter((v) => Math.abs(v.x * p.sirka - x) < 3 && Math.abs(v.y * p.vyska - y) < 3);
      expect(shoda).toHaveLength(1);
    });
  });

  it('dřevo ohrádky, zeď ani drobný odlesk za lahev nepočítá', () => {
    const p = platno(300, 240, LAHEV);
    p.obdelnik(0, 0, 300, 40, ZED);       // zeď za paletou
    p.obdelnik(0, 200, 300, 240, DREVO);  // přední prkno ohrádky
    p.kruh(150, 170, 8, DREVO);           // suk velikosti víčka uprostřed lahví
    for (let i = 0; i < 5; i++) p.kruh(40 + i * 50, 100, 9, VICKO);
    p.obdelnik(60, 140, 63, 143, [255, 255, 255]); // odlesk 3 × 3 px

    expect(najdiVicka(p.data, p.sirka, p.vyska)).toHaveLength(5);
  });

  it('najde i víčko focené ze strany, které má lahev jen pod sebou a kolem dřevo', () => {
    const p = platno(200, 200, DREVO);
    for (let i = 0; i < 4; i++) {
      p.obdelnik(20 + i * 45, 60, 50 + i * 45, 200, LAHEV);
      p.kruh(35 + i * 45, 52, 8, VICKO);
    }
    expect(najdiVicka(p.data, p.sirka, p.vyska)).toHaveLength(4);
  });

  it('prázdná nebo jednobarevná fotka nevrátí nic', () => {
    expect(najdiVicka(new Uint8ClampedArray(0), 0, 0)).toEqual([]);
    const p = platno(50, 50, LAHEV);
    expect(najdiVicka(p.data, p.sirka, p.vyska)).toEqual([]);
  });
});

describe('poKlepnuti', () => {
  const tecky: Tecka[] = [
    { id: 1, x: 0.2, y: 0.2, rucni: false },
    { id: 2, x: 0.5, y: 0.5, rucni: false },
  ];

  it('ťuknutí mimo tečky přidá ruční tečku s novým číslem', () => {
    const po = poKlepnuti(tecky, 0.8, 0.8, 0.03, 0.03);
    expect(po).toHaveLength(3);
    expect(po[2]).toEqual({ id: 3, x: 0.8, y: 0.8, rucni: true });
  });

  it('ťuknutí na tečku ji odebere a ostatní nechá', () => {
    expect(poKlepnuti(tecky, 0.51, 0.49, 0.03, 0.03)).toEqual([tecky[0]]);
  });

  it('ze dvou teček v dosahu odebere tu bližší', () => {
    const blizko: Tecka[] = [...tecky, { id: 3, x: 0.52, y: 0.5, rucni: true }];
    expect(poKlepnuti(blizko, 0.525, 0.5, 0.03, 0.03).map((t) => t.id)).toEqual([1, 2]);
  });

  it('dosah se bere pro každou osu zvlášť', () => {
    // Vodorovně 0,04 daleko: do dosahu 0,05 se vejde, do 0,03 ne.
    expect(poKlepnuti(tecky, 0.24, 0.2, 0.05, 0.03)).toHaveLength(1);
    expect(poKlepnuti(tecky, 0.2, 0.24, 0.05, 0.03)).toHaveLength(3);
  });
});
