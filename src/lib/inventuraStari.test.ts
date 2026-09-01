import { describe, expect, it } from 'vitest';
import { stariInventury } from './inventuraStari';

const fyz = (entry_date: string) => ({ entry_date, note: 'Fyzická inventura' });
const schv = (entry_date: string) => ({ entry_date, note: 'Schválená inventura' });

describe('stariInventury', () => {
  it('uprostřed měsíce mlčí — běžící měsíc se ještě spočítat nedá', () => {
    // Inventura za červenec, je 15. 8. Srpen běží, nikdo ho zatím uzavřít nemůže.
    const s = stariInventury([schv('2026-07-01')], '2026-08-15');
    expect(s.chybejiciMesice).toEqual([]);
    expect(s.pripomenout).toBe(false);
  });

  it('inventura za červenec se v den zadání netváří jako měsíc stará', () => {
    // Jádro opravy: inventura ZA červenec je uložená na 2026-07-01, ale
    // napočítá se až začátkem srpna. Počítání ve dnech od entry_date z ní
    // udělalo „31 dní" hned v okamžiku, kdy ji někdo zadal.
    const s = stariInventury([schv('2026-07-01')], '2026-08-05');
    expect(s.pripomenout).toBe(false);
  });

  it('první den dalšího měsíce se ozve — minulý měsíc nikdo neuzavřel', () => {
    const s = stariInventury([schv('2026-07-01')], '2026-09-01');
    expect(s.chybejiciMesice).toEqual(['2026-08']);
    expect(s.pripomenout).toBe(true);
    expect(s.naléhavé).toBe(false);
  });

  it('dva neuzavřené měsíce už jsou naléhavé', () => {
    const s = stariInventury([schv('2026-07-01')], '2026-10-10');
    expect(s.chybejiciMesice).toEqual(['2026-08', '2026-09']);
    expect(s.naléhavé).toBe(true);
  });

  it('POČÁTEČNÍ STAV se nepočítá — je to kopie minulého měsíce', () => {
    // Přesně tahle data jsou v ostrém provozu: „Počáteční stav" na 1. 8. má
    // stejných 19 řádků a 321 kusů jako červencová inventura. Kdyby se
    // počítal, tvrdil by, že srpen je uzavřený, aniž by kdokoli něco spočítal.
    const s = stariInventury([
      schv('2026-07-01'),
      { entry_date: '2026-08-01', note: 'Počáteční stav' },
      { entry_date: '2026-07-01', note: 'Počáteční stav (převod z inventury)' },
    ], '2026-09-01');
    expect(s.posledniMesic).toBe('2026-07');
    expect(s.chybejiciMesice).toEqual(['2026-08']);
  });

  it('bere nejnovější měsíc, ne první nalezený', () => {
    const s = stariInventury([fyz('2026-06-01'), schv('2026-08-01'), fyz('2026-07-01')], '2026-09-01');
    expect(s.posledniMesic).toBe('2026-08');
    expect(s.pripomenout).toBe(false);
  });

  it('přes konec roku počítá správně', () => {
    const s = stariInventury([schv('2025-11-01')], '2026-02-01');
    expect(s.chybejiciMesice).toEqual(['2025-12', '2026-01']);
  });

  it('řádek bez poznámky se nepočítá', () => {
    expect(stariInventury([{ entry_date: '2026-08-01', note: null }], '2026-09-01').posledniMesic).toBeNull();
  });

  it('žádná inventura — připomene se, ale ne jako naléhavé', () => {
    const s = stariInventury([], '2026-09-01');
    expect(s.posledniMesic).toBeNull();
    expect(s.pripomenout).toBe(true);
    expect(s.naléhavé).toBe(false);
  });

  it('poškozené datum nespadne ani neumlčí ostatní', () => {
    const s = stariInventury([fyz('nesmysl'), schv('2026-07-01')], '2026-09-01');
    expect(s.posledniMesic).toBe('2026-07');
  });

  it('inventura z budoucnosti nevyrobí záporný výčet', () => {
    const s = stariInventury([schv('2026-12-01')], '2026-09-01');
    expect(s.chybejiciMesice).toEqual([]);
    expect(s.pripomenout).toBe(false);
  });
});
