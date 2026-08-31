import { describe, expect, it } from 'vitest';
import { nalahvovaneLitry, navrhSudu, zdrojoveLitry, VYTEZNOST_LAHVOVANI } from './bottlingYield';

describe('nalahvovaneLitry', () => {
  it('sečte objem všech obalů v zápisu', () => {
    expect(nalahvovaneLitry([{ volumeL: 1, qty: 45 }])).toBe(45);
    expect(nalahvovaneLitry([{ volumeL: 0.5, qty: 100 }, { volumeL: 0.33, qty: 100 }])).toBeCloseTo(83, 5);
  });

  it('prázdné a nesmyslné řádky ignoruje', () => {
    expect(nalahvovaneLitry([])).toBe(0);
    expect(nalahvovaneLitry([{ volumeL: 0, qty: 10 }, { volumeL: 1, qty: 0 }])).toBe(0);
  });
});

describe('zdrojoveLitry', () => {
  it('připočte 10% ztrátu', () => {
    expect(zdrojoveLitry(45)).toBe(50);
    expect(zdrojoveLitry(90)).toBe(100);
  });

  it('nula a nesmysly nespadnou', () => {
    expect(zdrojoveLitry(0)).toBe(0);
    expect(zdrojoveLitry(-5)).toBe(0);
  });

  it('jde nastavit jinou výtěžnost', () => {
    expect(zdrojoveLitry(80, 0.8)).toBe(100);
    expect(VYTEZNOST_LAHVOVANI).toBe(0.9);
  });
});

describe('navrhSudu', () => {
  // Pravidlo od uživatele: 45 × 1l PET je z jednoho 50l sudu.
  it('45 × 1l PET vyjde přesně na jeden 50l sud', () => {
    const n = navrhSudu([{ volumeL: 1, qty: 45 }], 50);
    expect(n?.nalahvovanoL).toBe(45);
    expect(n?.zdrojL).toBe(50);
    expect(n?.sudy).toBe(1);
    expect(n?.sudyPresne).toBe(1);
  });

  it('90 × 1l PET vyjde na dva 50l sudy', () => {
    expect(navrhSudu([{ volumeL: 1, qty: 90 }], 50)?.sudy).toBe(2);
  });

  it('načatý sud se počítá celý', () => {
    // 50 × 1l = 50 l → 55,6 l ze sudů → 1,11 sudu → načaly se dva.
    const n = navrhSudu([{ volumeL: 1, qty: 50 }], 50);
    expect(n?.zdrojL).toBe(55.6);
    expect(n?.sudy).toBe(2);
    expect(n?.sudyPresne).toBe(1.11);
  });

  it('poskládá víc druhů lahví dohromady', () => {
    // 100 × 0,5 l + 100 × 0,33 l = 83 l → 92,2 l → z 50l sudů 1,84 → 2 sudy
    const n = navrhSudu([{ volumeL: 0.5, qty: 100 }, { volumeL: 0.33, qty: 100 }], 50);
    expect(n?.nalahvovanoL).toBe(83);
    expect(n?.zdrojL).toBe(92.2);
    expect(n?.sudy).toBe(2);
  });

  it('počítá i z menších sudů', () => {
    // 45 × 1l = 50 l ze zdroje → z 30l sudů 1,67 → 2 sudy
    expect(navrhSudu([{ volumeL: 1, qty: 45 }], 30)?.sudy).toBe(2);
  });

  it('bez lahví nebo bez velikosti sudu nic nenavrhne', () => {
    expect(navrhSudu([], 50)).toBeNull();
    expect(navrhSudu([{ volumeL: 1, qty: 45 }], 0)).toBeNull();
  });
});
