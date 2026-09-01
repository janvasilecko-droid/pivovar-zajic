import { describe, expect, it } from 'vitest';
import { kauceVenku, vycepyVenku } from './vycepyVenku';
import type { TapReservation } from '../screens/VycepyScreen';

const DNES = '2026-09-01';

const r = (over: Partial<TapReservation>): TapReservation => ({
  id: 'x', tap_id: 't1', tap_name: 'Výčep 1',
  date_from: '2026-08-20', date_to: '2026-08-25',
  customer_name: 'Hospoda', ...over,
});

describe('vycepyVenku', () => {
  it('nahlásí výčep, který měl být dávno zpátky', () => {
    const v = vycepyVenku([r({ date_to: '2026-08-25' })], DNES);
    expect(v).toHaveLength(1);
    expect(v[0].dniPoTerminu).toBe(7);
  });

  it('vrácený výčep nehlásí, i kdyby byl po termínu', () => {
    expect(vycepyVenku([r({ date_to: '2026-08-01', is_returned: true })], DNES)).toEqual([]);
  });

  it('běžící rezervaci nehlásí — výčep tam MÁ být', () => {
    expect(vycepyVenku([r({ date_from: '2026-08-30', date_to: '2026-09-05' })], DNES)).toEqual([]);
  });

  it('den po termínu ještě mlčí — vrací se obvykle druhý den', () => {
    expect(vycepyVenku([r({ date_to: '2026-08-31' })], DNES)).toEqual([]);
    // O den později už se ozve.
    expect(vycepyVenku([r({ date_to: '2026-08-30' })], DNES)).toHaveLength(1);
  });

  it('jednodenní rezervace bez „do" se posuzuje podle „od"', () => {
    const v = vycepyVenku([r({ date_from: '2026-08-20', date_to: '' })], DNES);
    expect(v).toHaveLength(1);
    expect(v[0].dniPoTerminu).toBe(12);
  });

  it('řadí od nejdéle chybějícího', () => {
    const v = vycepyVenku([
      r({ id: 'a', date_to: '2026-08-28' }),
      r({ id: 'b', date_to: '2026-08-10' }),
      r({ id: 'c', date_to: '2026-08-20' }),
    ], DNES);
    expect(v.map((x) => x.rezervace.id)).toEqual(['b', 'c', 'a']);
  });

  it('poškozené datum nespadne ani nevyrobí planý poplach', () => {
    expect(vycepyVenku([r({ date_from: '', date_to: '' })], DNES)).toEqual([]);
    expect(vycepyVenku([r({ date_to: 'nesmysl' })], DNES)).toEqual([]);
  });
});

describe('kauceVenku', () => {
  it('sečte kauce, co leží u zákazníků', () => {
    const v = vycepyVenku([
      r({ id: 'a', date_to: '2026-08-10', deposit_czk: 2000 }),
      r({ id: 'b', date_to: '2026-08-12', deposit_czk: 1500 }),
    ], DNES);
    expect(kauceVenku(v)).toBe(3500);
  });

  it('rezervace bez kauce se počítá jako nula, ne jako NaN', () => {
    const v = vycepyVenku([r({ date_to: '2026-08-10' })], DNES);
    expect(kauceVenku(v)).toBe(0);
  });
});
