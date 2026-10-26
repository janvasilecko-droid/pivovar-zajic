import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
let dnes = '2026-10-26';

vi.mock('./businessDate', () => ({
  businessDateISO: () => dnes,
  businessHour: () => 12,
}));

vi.mock('./supabase', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a) },
}));

import { computeDeliveryDateISO, deliveryDayToISO, runZavozDeductionForDate } from './zavozDeduction';

describe('datum závozu', () => {
  it('pátek u objednávky z pondělí je pátek téhož týdne', () => {
    expect(deliveryDayToISO('2026-10-26', 'pa')).toBe('2026-10-30');
  });

  it('vyplněné datum závozu má přednost před dnem v týdnu', () => {
    expect(computeDeliveryDateISO('2026-10-26', 'po', '2026-11-02T15:00:00')).toBe('2026-11-02');
  });

  it('neznámý den spadne na pátek', () => {
    expect(deliveryDayToISO('2026-10-26', 'xx')).toBe('2026-10-30');
    expect(deliveryDayToISO('2026-10-26', null)).toBe('2026-10-30');
  });
});

describe('spuštění odpočtu z aplikace', () => {
  beforeEach(() => {
    dnes = '2026-10-26';
    rpc.mockReset();
  });

  it('jiný den než dnešek se nespustí a do databáze se nesáhne', async () => {
    await expect(runZavozDeductionForDate('2026-10-25')).rejects.toThrow(/pouze odpočet dnešního závozu/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('dnešek zavolá odpočet a vrátí počet položek', async () => {
    rpc.mockResolvedValue({ data: 3, error: null });
    await expect(runZavozDeductionForDate('2026-10-26')).resolves.toBe(3);
    expect(rpc).toHaveBeenCalledWith('run_today_zavoz_deductions');
  });
});
