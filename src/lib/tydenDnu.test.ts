// 📅 Dny týdne jako tlačítka — viz hlavička tydenDnu.ts.
import { describe, it, expect } from 'vitest';
import { dnyTydne, posunTyden } from './tydenDnu';

describe('dnyTydne', () => {
  it('vrátí sedm dnů od pondělí do neděle', () => {
    const dny = dnyTydne('2026-09-16'); // středa
    expect(dny.map((d) => d.zkratka)).toEqual(['po', 'út', 'st', 'čt', 'pá', 'so', 'ne']);
    expect(dny).toHaveLength(7);
  });

  it('týden začíná pondělím, i když se klikne uprostřed', () => {
    expect(dnyTydne('2026-09-16')[0].iso).toBe('2026-09-14'); // pondělí
    expect(dnyTydne('2026-09-16')[6].iso).toBe('2026-09-20'); // neděle
  });

  it('neděle patří k týdnu, který jí PŘEDCHÁZÍ — ne k dalšímu', () => {
    // Klasická past: getUTCDay() má neděli jako 0, takže bez posunu by
    // nedělní stáčení spadlo do týdne následujícího.
    expect(dnyTydne('2026-09-20')[0].iso).toBe('2026-09-14');
  });

  it('pondělí zůstane pondělím', () => {
    expect(dnyTydne('2026-09-14')[0].iso).toBe('2026-09-14');
  });

  it('přechod přes konec měsíce nerozbije čísla dnů', () => {
    const dny = dnyTydne('2026-10-01'); // čtvrtek
    expect(dny.map((d) => d.cislo)).toEqual([28, 29, 30, 1, 2, 3, 4]);
  });

  it('víkend je označený — v pivovaru se v něm stáčí málokdy', () => {
    expect(dnyTydne('2026-09-16').filter((d) => d.vikend).map((d) => d.zkratka))
      .toEqual(['so', 'ne']);
  });

  it('sobota a neděle se NEVYNECHÁVAJÍ — jinak by sobotní stáčení nešlo najít', () => {
    expect(dnyTydne('2026-09-16').map((d) => d.zkratka)).toContain('so');
  });

  it('počítá přes UTC — jinak by se celý týden posunul o den', () => {
    const puvodni = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      expect(dnyTydne('2026-09-16')[0].iso).toBe('2026-09-14');
    } finally {
      process.env.TZ = puvodni;
    }
  });

  it('nesmyslné datum nespadne', () => {
    expect(dnyTydne('nesmysl')).toEqual([]);
  });
});

describe('posunTyden', () => {
  it('listuje po celých týdnech a drží den v týdnu', () => {
    expect(posunTyden('2026-09-16', -1)).toBe('2026-09-09'); // taky středa
    expect(posunTyden('2026-09-16', 1)).toBe('2026-09-23');
  });

  it('nesmyslné datum vrátí beze změny', () => {
    expect(posunTyden('nesmysl', 1)).toBe('nesmysl');
  });
});
