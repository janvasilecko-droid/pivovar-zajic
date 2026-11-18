// 🧼 Fáze tanku bez piva (majitel 18. 11. 2026: „na hoře … ať se ukáže, že je
// tank uzavřený, prázdný, po oplachu, vysanitovaný").
import { describe, it, expect } from 'vitest';
import { fazeTanku, posledniSanitacePodleTanku, POPIS_FAZE } from './fazeTanku';

describe('fazeTanku', () => {
  it('postup po zavření tanku: uzavřený → po oplachu → po louhu', () => {
    expect(fazeTanku({ status: 'sanitizing' })).toBe('uzavreny');
    expect(fazeTanku({ status: 'rinsing' })).toBe('po_oplachu');
    expect(fazeTanku({ status: 'cleaning' })).toBe('po_louhu');
  });

  it('tank s pivem žádnou fázi nemá', () => {
    for (const status of ['active', 'filling', 'emptying']) expect(fazeTanku({ status })).toBeNull();
    expect(fazeTanku({ status: null })).toBeNull();
    expect(fazeTanku({})).toBeNull();
  });

  it('prázdný tank po kyselině je vysanitovaný', () => {
    const konecStaceni = '2026-11-03T13:20:00Z';
    expect(fazeTanku({ status: 'empty', kegging_ended_at: konecStaceni }, { method: 'kyselina_dusicna', created_at: '2026-11-09T08:21:00Z' })).toBe('vysanitovany');
    expect(fazeTanku({ status: 'empty' }, { method: 'persteril', created_at: '2026-11-09T08:21:00Z' })).toBe('vysanitovany');
    expect(fazeTanku({ status: 'empty' }, { method: 'kombinovana', created_at: '2026-11-09T08:21:00Z' })).toBe('vysanitovany');
  });

  it('prázdný tank bez zápisu, po jiném kroku nebo po sanitaci z dřívější várky je jen prázdný', () => {
    expect(fazeTanku({ status: 'empty' })).toBeNull();
    expect(fazeTanku({ status: 'empty' }, null)).toBeNull();
    // Louh ani oplach tank nedokončí.
    expect(fazeTanku({ status: 'empty' }, { method: 'louh', created_at: '2026-11-09T08:21:00Z' })).toBeNull();
    expect(fazeTanku({ status: 'empty' }, { method: 'oplach_vodou', created_at: '2026-11-09T08:21:00Z' })).toBeNull();
    // Sanitace je starší než poslední stáčení — patří dřívější várce.
    expect(fazeTanku({ status: 'empty', kegging_ended_at: '2026-11-10T10:00:00Z' }, { method: 'kyselina_dusicna', created_at: '2026-10-13T10:43:00Z' })).toBeNull();
  });

  it('každá fáze má text a nápovědu', () => {
    expect(POPIS_FAZE.uzavreny.text).toBe('uzavřený');
    expect(POPIS_FAZE.po_oplachu.text).toBe('po oplachu');
    expect(POPIS_FAZE.po_louhu.text).toBe('po louhu');
    expect(POPIS_FAZE.vysanitovany.text).toBe('vysanitovaný');
  });
});

describe('posledniSanitacePodleTanku', () => {
  it('u každého tanku nejnovější zápis; zápisy bez tanku, metody nebo data se přeskočí', () => {
    const m = posledniSanitacePodleTanku([
      { tank_id: 't7', method: 'oplach_vodou', created_at: '2026-11-09T08:21:00Z' },
      { tank_id: 't7', method: 'louh', created_at: '2026-11-09T08:22:00Z' },
      { tank_id: 't7', method: 'kyselina_dusicna', created_at: '2026-11-01T08:22:00Z' },
      { tank_id: 't8', method: 'kyselina_dusicna', created_at: '2026-10-13T10:43:00Z' },
      { tank_id: null, method: 'louh', created_at: '2026-11-09T08:22:00Z' },
      { tank_id: 't9', method: null, created_at: '2026-11-09T08:22:00Z' },
      { tank_id: 't9', method: 'louh', created_at: null },
    ]);
    expect(m.get('t7')).toEqual({ method: 'louh', created_at: '2026-11-09T08:22:00Z' });
    expect(m.get('t8')?.method).toBe('kyselina_dusicna');
    expect(m.has('t9')).toBe(false);
    expect(m.size).toBe(2);
  });
});
