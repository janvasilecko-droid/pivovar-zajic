// detectDeliveryDay — název dne bez konkrétního data (např. "na úterý") musí
// najít NEJBLIŽŠÍ nadcházející výskyt toho dne, ne jen vrátit den bez data.
// Napsáno v pondělí "na úterý" = zítra (tento týden). Napsáno ve středu
// "na úterý" = úterý už bylo, takže úterý PŘÍŠTÍHO týdne.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { detectDeliveryDay } from './whatsappParser';

function setToday(iso: string) {
  vi.setSystemTime(new Date(iso + 'T10:00:00Z'));
}

describe('detectDeliveryDay — nejbližší výskyt zmíněného dne', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('napsáno v pondělí "na úterý" → zítra (tento týden)', () => {
    setToday('2026-08-24'); // pondělí
    const { day, dateStr } = detectDeliveryDay('Ahoj, na úterý 2x KEG 50l');
    expect(day).toBe('ut');
    expect(dateStr).toBe('2026-08-25'); // úterý ten samý týden
  });

  it('napsáno ve středu "na úterý" → úterý PŘÍŠTÍHO týdne (ne minulé)', () => {
    setToday('2026-08-26'); // středa
    const { day, dateStr } = detectDeliveryDay('Ahoj, na úterý 2x KEG 50l');
    expect(day).toBe('ut');
    expect(dateStr).toBe('2026-09-01'); // úterý příštího týdne, ne 2026-08-25 (minulost)
  });

  it('napsáno v úterý "na úterý" → dnešek', () => {
    setToday('2026-08-25'); // úterý
    const { day, dateStr } = detectDeliveryDay('Ahoj, na úterý 2x KEG 50l');
    expect(day).toBe('ut');
    expect(dateStr).toBe('2026-08-25');
  });

  it('napsáno v pátek "na pondělí" → pondělí příštího týdne', () => {
    setToday('2026-08-28'); // pátek
    const { day, dateStr } = detectDeliveryDay('Ahoj, na pondělí 2x KEG 50l');
    expect(day).toBe('po');
    expect(dateStr).toBe('2026-08-31');
  });
});
