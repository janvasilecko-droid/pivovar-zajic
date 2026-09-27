// Zadání 27. 9. 2026: „zkontroluj ten sklep… ať ukazuje správný údaje."
import { describe, it, expect } from 'vitest';
import { souhrnCyklu, cilPoPrecerpani, cyklusSPrecerpanim } from './tankCyklus';

const tank = { id: 't1', initial_volume_l: 7500, started_at: '2026-09-01T08:00:00Z', status: 'active' };

describe('souhrnCyklu', () => {
  it('ztráta = počátek − stočeno, bez přečerpání', () => {
    const s = souhrnCyklu(
      tank,
      [{ cellar_tank_id: 't1', entry_date: '2026-09-05', source_volume_l: 7300, quantity: 146 }],
      [],
    );
    expect(s.stocenoL).toBe(7300);
    expect(s.sudu).toBe(146);
    expect(s.ztrataL).toBe(200);
    expect(s.ztrataPct).toBe(2.7);
  });

  it('přefuk jinam NENÍ ztráta — dřív se zapsal jako ztracené pivo', () => {
    const s = souhrnCyklu(
      tank,
      [{ cellar_tank_id: 't1', entry_date: '2026-09-05', source_volume_l: 5400, quantity: 108 }],
      [{ transfer_date: '2026-09-03', from_tank_id: 't1', to_tank_id: 't2', volume_l: 2000, loss_l: 0 }],
    );
    expect(s.precerpanoL).toBe(-2000);
    expect(s.ztrataL).toBe(100); // 7500 − 2000 − 5400
  });

  it('dolití do tanku se k dostupnému pivu přičte', () => {
    const s = souhrnCyklu(
      tank,
      [{ cellar_tank_id: 't1', entry_date: '2026-09-05', source_volume_l: 9000, quantity: 180 }],
      [{ transfer_date: '2026-09-04', from_tank_id: 't3', to_tank_id: 't1', volume_l: 1600, loss_l: 0 }],
    );
    expect(s.ztrataL).toBe(100); // 7500 + 1600 − 9000
    expect(s.ztrataPct).toBe(1.1);
  });

  it('stáčení a přečerpání z předchozího cyklu se nepočítá; naplnění v den začátku taky ne', () => {
    const s = souhrnCyklu(
      tank,
      [{ cellar_tank_id: 't1', entry_date: '2026-08-20', source_volume_l: 7000, quantity: 140 }],
      [{ transfer_date: '2026-09-01', from_tank_id: null, to_tank_id: 't1', volume_l: 7500, loss_l: 0 }],
    );
    expect(s.stocenoL).toBe(0);
    expect(s.precerpanoL).toBe(0);
  });
});

describe('cilPoPrecerpani', () => {
  it('prázdný tank začíná cyklus s přiteklým objemem, ne s kapacitou', () => {
    const r = cilPoPrecerpani({ id: 't2', initial_volume_l: 7500, started_at: null, status: 'empty' }, 3000, '2026-09-10T10:00:00Z');
    expect(r).toEqual({ initial_volume_l: 3000, started_at: '2026-09-10T10:00:00Z' });
  });

  it('tank s běžícím cyklem si počátek nechá', () => {
    const r = cilPoPrecerpani({ id: 't2', initial_volume_l: 4000, started_at: '2026-09-02T08:00:00Z', status: 'active' }, 1000, '2026-09-10T10:00:00Z');
    expect(r).toEqual({ initial_volume_l: 4000, started_at: '2026-09-02T08:00:00Z' });
  });

  it('vymytý tank se starým počátkem začíná nový cyklus', () => {
    const r = cilPoPrecerpani({ id: 't2', initial_volume_l: 7500, started_at: '2026-08-01T08:00:00Z', status: 'sanitizing' }, 2500, '2026-09-10T10:00:00Z');
    expect(r.initial_volume_l).toBe(2500);
  });
});

describe('cyklusSPrecerpanim', () => {
  const stary = {
    tank_id: 't1', initial_volume_l: 7500, kegged_volume_l: 5400,
    loss_l: 2100, loss_pct: 28, // uloženo před opravou: přefuk 2000 l jako ztráta
    started_at: '2026-09-01T08:00:00Z', ended_at: '2026-09-20T15:00:00Z',
  };

  it('přefuk jinam se z uložené ztráty starého cyklu odečte', () => {
    const r = cyklusSPrecerpanim(stary, [
      { transfer_date: '2026-09-03', from_tank_id: 't1', to_tank_id: 't2', volume_l: 2000, loss_l: 0 },
    ]);
    expect(r.loss_l).toBe(100);
    expect(r.loss_pct).toBe(1.3);
  });

  it('přečerpání mimo dobu cyklu se nepočítá — cyklus zůstane beze změny', () => {
    const r = cyklusSPrecerpanim(stary, [
      { transfer_date: '2026-09-25', from_tank_id: 't1', to_tank_id: 't2', volume_l: 2000, loss_l: 0 },
    ]);
    expect(r).toBe(stary);
  });
});
