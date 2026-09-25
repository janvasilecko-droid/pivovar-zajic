// 📅 Dny týdne jako tlačítka — viz hlavička tydenDnu.ts.
import { describe, it, expect } from 'vitest';
import { dnyProVyber, dnyTydne, posunTyden } from './tydenDnu';

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

  it('celý týden má vždycky sedm dnů — výběr se řeší jinde', () => {
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

// ── Co se nabídne k výběru ────────────────────────────────────────────────
// Zadání z 19. 9. 2026: „so, ne nemusíš." V pivovaru se o víkendu nestáčí.
describe('dnyProVyber', () => {
  it('nabídne pondělí až pátek', () => {
    expect(dnyProVyber('2026-09-16').map((d) => d.zkratka))
      .toEqual(['po', 'út', 'st', 'čt', 'pá']);
  });

  it('když je zvolená SOBOTA, zůstane v řadě — jinak by nesvítilo nic', () => {
    // Stane se to samo: přehled se otevírá na dnešku, a ten může být sobota.
    const dny = dnyProVyber('2026-09-19'); // sobota
    expect(dny.map((d) => d.zkratka)).toEqual(['po', 'út', 'st', 'čt', 'pá', 'so']);
    expect(dny.some((d) => d.iso === '2026-09-19'), 'zvolený den zmizel z výběru').toBe(true);
  });

  it('zvolená neděle zůstane taky, a nepřitáhne s sebou sobotu', () => {
    const dny = dnyProVyber('2026-09-20'); // neděle
    expect(dny.map((d) => d.zkratka)).toEqual(['po', 'út', 'st', 'čt', 'pá', 'ne']);
  });

  it('všední den žádný víkend nepřidá', () => {
    expect(dnyProVyber('2026-09-14')).toHaveLength(5);
  });
});
