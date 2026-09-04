import { describe, it, expect } from 'vitest';
import {
  druhZavirky, kamPatriNakup, obvykleStaceni, zustatkyZavirek,
  KORUNKY, UZAVERY_PET, ZAVIRKY_NEURCENE,
  type ObalStaceni, type NakupMaterialu,
} from './materialSklad';

describe('druhZavirky', () => {
  it('podle objemu: 1 a 1,5 l je PET, 0,33 a 0,5 sklo', () => {
    expect(druhZavirky({ volume_l: 1.5 })).toBe(UZAVERY_PET);
    expect(druhZavirky({ volume_l: 1 })).toBe(UZAVERY_PET);
    expect(druhZavirky({ volume_l: 0.5 })).toBe(KORUNKY);
    expect(druhZavirky({ volume_l: 0.33 })).toBe(KORUNKY);
  });

  it('název má přednost před objemem', () => {
    expect(druhZavirky({ package_label: 'PET 0,5 l', volume_l: 0.5 })).toBe(UZAVERY_PET);
    expect(druhZavirky({ package_label: 'Sklo 1 l', volume_l: 1 })).toBe(KORUNKY);
  });

  it('sud závěrku nemá', () => {
    expect(druhZavirky({ package_label: 'KEG 30 l', volume_l: 30 })).toBeNull();
    expect(druhZavirky({ package_label: 'KEG 50 l', volume_l: 50 })).toBeNull();
  });

  it('bez objemu a bez názvu se nic nevymýšlí', () => {
    expect(druhZavirky({})).toBeNull();
    expect(druhZavirky({ volume_l: null, package_label: null })).toBeNull();
  });
});

describe('kamPatriNakup', () => {
  it('rozezná korunky a PET víčka', () => {
    expect(kamPatriNakup('Korunky 26 mm')).toBe(KORUNKY);
    expect(kamPatriNakup('Kapsle')).toBe(KORUNKY);
    expect(kamPatriNakup('Víčka PET 28 mm')).toBe(UZAVERY_PET);
    expect(kamPatriNakup('uzávěry PET')).toBe(UZAVERY_PET);
  });

  it('samotná „Víčka" zůstanou nerozlišená, nedosadí se hrnec', () => {
    // Dosadit korunky nebo PET by dalo zůstatek, který nic neznamená.
    expect(kamPatriNakup('Víčka')).toBe(ZAVIRKY_NEURCENE);
    expect(kamPatriNakup('vicka')).toBe(ZAVIRKY_NEURCENE);
  });

  it('prázdné lahve nejsou závěrka', () => {
    expect(kamPatriNakup('1.5L')).toBeNull();
    expect(kamPatriNakup('0.33L')).toBeNull();
    expect(kamPatriNakup('')).toBeNull();
    expect(kamPatriNakup(null)).toBeNull();
  });
});

describe('obvykleStaceni', () => {
  it('bere medián, ne průměr', () => {
    // Jeden festivalový den nesmí zvednout hranici tak, aby přehled
    // hlásil „málo" každý týden.
    expect(obvykleStaceni([300, 320, 5000])).toBe(320);
  });

  it('dny bez stáčení se nepočítají', () => {
    expect(obvykleStaceni([0, 0, 400, 0])).toBe(400);
  });

  it('bez dat se nic nehádá', () => {
    expect(obvykleStaceni([])).toBeNull();
    expect(obvykleStaceni([0, 0])).toBeNull();
  });

  it('sudý počet dnů dá průměr dvou prostředních, zaokrouhlený', () => {
    expect(obvykleStaceni([100, 200, 300, 400])).toBe(250);
  });
});

const NAKUPY: NakupMaterialu[] = [
  { package_label: 'Korunky 26 mm', quantity: 5000 },
  { package_label: 'Víčka PET', quantity: 2000 },
  { package_label: '0.5L', quantity: 1200 }, // prázdné lahve — nejsou závěrka
];

const STACENI: ObalStaceni[] = [
  { entry_date: '2026-08-03', package_label: 'Sklo 0,5 l', volume_l: 0.5, quantity: 600 },
  { entry_date: '2026-08-10', package_label: 'Sklo 0,5 l', volume_l: 0.5, quantity: 600 },
  { entry_date: '2026-08-17', package_label: 'Sklo 0,33 l', volume_l: 0.33, quantity: 400 },
  { entry_date: '2026-08-03', package_label: 'PET 1,5 l', volume_l: 1.5, quantity: 300 },
  { entry_date: '2026-08-20', package_label: 'KEG 50 l', volume_l: 50, quantity: 40 },
];

describe('zustatkyZavirek', () => {
  it('SPOTŘEBU závěrek konečně odečítá', () => {
    // Tohle je ta původní chyba: spotřeba se hledala mezi stočenými obaly
    // podle názvu „Víčka" a žádný se tak nejmenuje, takže vycházela nula.
    const z = zustatkyZavirek(NAKUPY, STACENI);
    const korunky = z.find((x) => x.nazev === KORUNKY)!;
    expect(korunky.spotrebovano).toBe(1600); // 600 + 600 + 400
    expect(korunky.zustatek).toBe(3400);
  });

  it('korunky a PET jsou dva hrnce, ne jeden', () => {
    const z = zustatkyZavirek(NAKUPY, STACENI);
    const pet = z.find((x) => x.nazev === UZAVERY_PET)!;
    expect(pet.spotrebovano).toBe(300);
    expect(pet.zustatek).toBe(1700);
  });

  it('sudy do spotřeby závěrek nespadnou', () => {
    const z = zustatkyZavirek(NAKUPY, STACENI);
    const soucet = z.reduce((s, x) => s + x.spotrebovano, 0);
    expect(soucet).toBe(1900); // bez 40 sudů
  });

  it('prázdné lahve se nepočítají jako nákup závěrek', () => {
    const z = zustatkyZavirek(NAKUPY, STACENI);
    expect(z.reduce((s, x) => s + x.nakoupeno, 0)).toBe(7000);
  });

  it('„málo" se pozná podle obvyklého stáčení, ne podle pevného čísla', () => {
    // Obvyklé stáčení korunek = medián z 600/600/400 = 600.
    const z = zustatkyZavirek([{ package_label: 'Korunky', quantity: 2100 }], STACENI);
    const k = z.find((x) => x.nazev === KORUNKY)!;
    expect(k.naJednoStaceni).toBe(600);
    expect(k.zustatek).toBe(500);
    expect(k.malo).toBe(true);
  });

  it('zásoba na víc než jedno stáčení nehlásí nic', () => {
    const z = zustatkyZavirek([{ package_label: 'Korunky', quantity: 5000 }], STACENI);
    expect(z.find((x) => x.nazev === KORUNKY)!.malo).toBe(false);
  });

  it('mínus je platná odpověď a hlásí se', () => {
    const z = zustatkyZavirek([{ package_label: 'Korunky', quantity: 1000 }], STACENI);
    const k = z.find((x) => x.nazev === KORUNKY)!;
    expect(k.zustatek).toBe(-600);
    expect(k.malo).toBe(true);
  });

  it('bez zapsaného nákupu se nehlásí „málo", ale „chybí evidence"', () => {
    // Chybějící evidence není chybějící materiál — a hlásit ji jako
    // prázdný sklad by z upozornění udělalo šum.
    const z = zustatkyZavirek([], STACENI);
    const k = z.find((x) => x.nazev === KORUNKY)!;
    expect(k.malo).toBe(false);
    expect(k.bezEvidence).toBe(true);
    expect(k.zustatek).toBe(-1600);
  });

  it('nerozlišená „Víčka" se zobrazí, ale spotřeba se jim nepřiřadí', () => {
    const z = zustatkyZavirek([{ package_label: 'Víčka', quantity: 800 }], STACENI);
    const n = z.find((x) => x.nazev === ZAVIRKY_NEURCENE)!;
    expect(n.nakoupeno).toBe(800);
    expect(n.spotrebovano).toBe(0);
    expect(n.naJednoStaceni).toBeNull();
    expect(n.malo).toBe(false);
  });

  it('řadí korunky, PET, pak nerozlišené', () => {
    const z = zustatkyZavirek([...NAKUPY, { package_label: 'Víčka', quantity: 10 }], STACENI);
    expect(z.map((x) => x.nazev)).toEqual([KORUNKY, UZAVERY_PET, ZAVIRKY_NEURCENE]);
  });

  it('nečitelné množství nerozhodí součet', () => {
    const z = zustatkyZavirek(
      [{ package_label: 'Korunky', quantity: '3000' }, { package_label: 'Korunky', quantity: null }],
      [{ entry_date: '2026-08-03', volume_l: 0.5, quantity: 'nesmysl' }],
    );
    const k = z.find((x) => x.nazev === KORUNKY)!;
    expect(k.nakoupeno).toBe(3000);
    expect(k.spotrebovano).toBe(0);
    expect(Number.isNaN(k.zustatek)).toBe(false);
  });

  it('bez nákupů a bez stáčení nevrací nic, ne nuly', () => {
    expect(zustatkyZavirek([], [])).toEqual([]);
  });
});
