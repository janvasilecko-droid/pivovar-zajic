// Zadání 27. 9. 2026: „udělej knihu jízd nejlíp, jak to jde, ať je to
// reálný." Generátor vedl jeden tachometr pro obě auta — km Kachny se
// přičítaly Velkému autu. Každé auto má vlastní tachometr.
import { describe, it, expect } from 'vitest';
import { posledniTachometrPred, rozepisTachometr } from './knihaJizd';

describe('rozepisTachometr', () => {
  it('Velké auto a Kachna mají každé svou řadu — km se nemíchají', () => {
    const r = rozepisTachometr(
      [
        { date: '2026-09-01', isKachna: false, km: 40 },
        { date: '2026-09-01', isKachna: true, km: 12 },
        { date: '2026-09-02', isKachna: false, km: 30 },
      ],
      { velke: 120000, kachna: 85000 },
    );
    expect(r[0]).toEqual({ km_start: 120000, km_end: 120040, km_driven: 40 });
    expect(r[1]).toEqual({ km_start: 85000, km_end: 85012, km_driven: 12 });
    // Druhý den Velkého auta navazuje na jeho vlastní 120040, ne na Kachnu.
    expect(r[2]).toEqual({ km_start: 120040, km_end: 120070, km_driven: 30 });
  });

  it('řadí se podle data, ne podle pořadí v náhledu', () => {
    const r = rozepisTachometr(
      [
        { date: '2026-09-03', isKachna: false, km: 10 },
        { date: '2026-09-01', isKachna: false, km: 20 },
      ],
      { velke: 1000, kachna: 0 },
    );
    expect(r[1]).toEqual({ km_start: 1000, km_end: 1020, km_driven: 20 });
    expect(r[0]).toEqual({ km_start: 1020, km_end: 1030, km_driven: 10 });
  });

  it('záporné nebo prázdné km se berou jako 0', () => {
    const r = rozepisTachometr([{ date: '2026-09-01', isKachna: false, km: -5 }], { velke: 500, kachna: 0 });
    expect(r[0]).toEqual({ km_start: 500, km_end: 500, km_driven: 0 });
  });
});

describe('posledniTachometrPred', () => {
  const jizdy = [
    { date: '2026-09-15', vehicle_name: 'Velké auto', km_end: 121500 },
    { date: '2026-08-31', vehicle_name: 'Velké auto', km_end: 120800 },
    { date: '2026-08-28', vehicle_name: 'Kachna', km_end: 85300 },
    { date: '2026-08-20', vehicle_name: 'Velké auto', km_end: 120500 },
  ];

  it('bere poslední jízdu auta PŘED měsícem — generovaný měsíc nenavazuje sám na sebe', () => {
    expect(posledniTachometrPred(jizdy, 'Velké auto', '2026-09-01')).toBe(120800);
  });

  it('každé auto zvlášť', () => {
    expect(posledniTachometrPred(jizdy, 'Kachna', '2026-09-01')).toBe(85300);
  });

  it('auto bez jízd → null (nechá se ruční číslo)', () => {
    expect(posledniTachometrPred(jizdy, 'Neznámé', '2026-09-01')).toBeNull();
  });
});
