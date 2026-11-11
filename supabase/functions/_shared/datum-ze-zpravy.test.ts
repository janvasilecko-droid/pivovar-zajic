// 6. 11. 2026: „Na 13 .11.30l 12sv, děkuji" — „aplikace tohle musí umět přečíst
// a přiřadit na daný den, může tam být taky třeba na příští středu, příští týden".
import { describe, it, expect } from 'vitest';
import { datumZeZpravy, bezData, relativniDen } from './datum-ze-zpravy.ts';

const DNES = '2026-11-06'; // pátek
const datum = (t: string, dnes = DNES) => datumZeZpravy(t, dnes)?.datum ?? null;

describe('konkrétní datum ve zprávě', () => {
  it('zpráva z provozu: „Na 13 .11.30l 12sv" = pátek 13. 11., 30 l zůstane objem', () => {
    const d = datumZeZpravy('Na 13 .11.30l 12sv, děkuji', DNES)!;
    expect(d).toMatchObject({ datum: '2026-11-13', den: 'pa', zobrazeni: '13.11.', nalezeno: '13 .11.' });
    expect('Na 13 .11.30l 12sv, děkuji'.slice(d.od, d.do)).toBe('13 .11.');
    expect(bezData('Na 13 .11.30l 12sv, děkuji', DNES)).toBe('Na        30l 12sv, děkuji');
  });

  it('běžné zápisy s tečkou, s mezerami i s množstvím hned za datem', () => {
    expect(datum('na 13.11. 2x30l')).toBe('2026-11-13');
    expect(datum('na 13. 11. prosím 1x50')).toBe('2026-11-13');
    expect(datum('13 . 11 . 1x30')).toBe('2026-11-13');
    expect(datum('Na 13.11.2x30l 11sv')).toBe('2026-11-13');
    expect(datum('na 9.11.')).toBe('2026-11-09');
    expect(datum('na 13.11., 2x30')).toBe('2026-11-13');
    expect(datum('závoz 13.11.2026, 2x30')).toBe('2026-11-13');
  });

  it('s rokem (čtyřmístným i dvoumístným)', () => {
    expect(datum('závoz 13.11.2026')).toBe('2026-11-13');
    expect(datum('závoz 13. 11. 2026, 2x30')).toBe('2026-11-13');
    expect(datum('na 13.11.26 2x30l')).toBe('2026-11-13');
    expect(datum('na 5.1.27')).toBe('2027-01-05');
  });

  it('názvem měsíce a lomítkem', () => {
    expect(datum('na 13. listopadu 2x30')).toBe('2026-11-13');
    expect(datum('na 13 listopadu')).toBe('2026-11-13');
    expect(datum('na 2. prosince')).toBe('2026-12-02');
    expect(datum('na 20. prosinec')).toBe('2026-12-20');
    expect(datum('na 13. lis. 2x30')).toBe('2026-11-13');
    expect(datum('na 13/11 2x30l')).toBe('2026-11-13');
    expect(datum('na 13/11/2026')).toBe('2026-11-13');
  });

  it('bez tečky na konci jen za předložkou nebo dnem', () => {
    expect(datum('na 13.11 2x30l')).toBe('2026-11-13');
    expect(datum('pátek 13.11, 3x30')).toBe('2026-11-13');
    expect(datum('Jantar 1.5 6ks')).toBeNull();
    expect(datum('objednávka 13.11 2x30')).toBeNull();
  });

  it('objem, stupeň, čas, množství a půlka sudu datum nejsou', () => {
    expect(datum('na 1.5l 6ks')).toBeNull();
    expect(datum('na 12.5° 2x30')).toBeNull();
    expect(datum('2x 1.5 l Jantar')).toBeNull();
    expect(datum('přivezte v 10.30 3x30')).toBeNull();
    expect(datum('kolem 10.11 3x30')).toBeNull();
    expect(datum('1/2 sudu 12sv')).toBeNull();
    expect(datum('2 pro Radka, 3 pro mě')).toBeNull();
    expect(datum('na 31.11.')).toBeNull(); // neexistuje
    expect(datum('3x30l 12sv')).toBeNull();
  });

  it('rok: pár dní zpátky letos, víc než dva měsíce zpátky příští rok, v lednu prosinec loni', () => {
    expect(datum('na 5.11.')).toBe('2026-11-05'); // včerejšek — v okně je vidět, že je v minulosti
    expect(datum('na 5.1.', '2026-12-20')).toBe('2027-01-05');
    expect(datum('na 30.12.', '2027-01-02')).toBe('2026-12-30');
    expect(datum('na 13.11.', '2026-11-06')).toBe('2026-11-13');
  });

  it('víc dat: platí první, bezData vymaže všechna', () => {
    expect(datum('na 13.11. a 20.11. 2x30')).toBe('2026-11-13');
    expect(bezData('na 13.11. a 20.11. 2x30', DNES)).toBe('na        a        2x30');
  });
});

describe('zítra, pozítří, dnes podle dne zprávy', () => {
  it('od pátku 6. 11.', () => {
    expect(relativniDen('na zítra 2x30', DNES)).toMatchObject({ datum: '2026-11-07', den: 'so' });
    expect(relativniDen('Zitra 2x30', DNES)?.datum).toBe('2026-11-07');
    expect(relativniDen('na pozítří prosím', DNES)).toMatchObject({ datum: '2026-11-08', den: 'ne' });
    expect(relativniDen('pozitri 1x50', DNES)?.datum).toBe('2026-11-08');
    expect(relativniDen('dnes odpoledne 1x30', DNES)).toMatchObject({ datum: '2026-11-06', den: 'pa' });
  });

  it('jiná slova se nepletou', () => {
    expect(relativniDen('na středu 2x30', DNES)).toBeNull();
    expect(relativniDen('dnešní objednávka', DNES)).toBeNull();
    expect(relativniDen('zítřejší', DNES)).toBeNull();
  });

  it('přes konec měsíce a roku', () => {
    expect(relativniDen('zítra', '2026-11-30')?.datum).toBe('2026-12-01');
    expect(relativniDen('pozítří', '2026-12-31')?.datum).toBe('2027-01-02');
  });
});
