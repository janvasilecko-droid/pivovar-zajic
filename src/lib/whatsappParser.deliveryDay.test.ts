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

// „Na příští týden úterý" — zákazník myslí úterý NÁSLEDUJÍCÍHO týdne.
// Bez toho se objednávka napsaná v pondělí zavezla hned druhý den, tedy
// o týden dřív, a v týdenním přehledu seděla ve špatném týdnu.
describe('detectDeliveryDay — „příští týden"', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('napsáno v pondělí „na příští týden úterý" → úterý za osm dní, ne zítra', () => {
    setToday('2026-08-24'); // pondělí
    const { day, dateStr } = detectDeliveryDay('Pro pivovar Louka, na pristi tyden utery\n20x50l desitka');
    expect(day).toBe('ut');
    expect(dateStr).toBe('2026-09-01');
  });

  it('napsáno v pátek „na příští týden úterý" → úterý příštího týdne (nic se nepřidává)', () => {
    // Nejbližší úterý už samo padá do příštího týdne — přidat dalších sedm
    // dní by objednávku posunulo o týden dozadu, tedy zase vedle.
    setToday('2026-08-28'); // pátek
    const { dateStr } = detectDeliveryDay('Pro pivovar Louka, na pristi tyden utery po Norme');
    expect(dateStr).toBe('2026-09-01');
  });

  it('funguje i s diakritikou a se „za týden"', () => {
    setToday('2026-08-24'); // pondělí
    expect(detectDeliveryDay('příští týden ve středu 5x30').dateStr).toBe('2026-09-02');
    expect(detectDeliveryDay('za týden ve středu 5x30').dateStr).toBe('2026-09-02');
  });

  it('běžná objednávka bez „příštího týdne" se nezměnila', () => {
    setToday('2026-08-24'); // pondělí
    expect(detectDeliveryDay('na středu 5x30').dateStr).toBe('2026-08-26');
  });

  it('konkrétní datum má pořád přednost před „příštím týdnem"', () => {
    setToday('2026-08-24');
    const { dateStr } = detectDeliveryDay('příští týden, konkrétně 3.9. 5x30');
    expect(dateStr).toBe('2026-09-03');
  });

  // 14. 10. 2026: „na příští středu, to znamená příští středa, ne tenhle týden."
  it('„na příští středu" bez slova týden = středa příštího týdne', () => {
    setToday('2026-10-14'); // středa
    expect(detectDeliveryDay('Hladík Dobřichovice na příští středu 1x30l 12sv').dateStr).toBe('2026-10-21');
    setToday('2026-10-12'); // pondělí: i tady „příští středa" není ta zítřejší
    expect(detectDeliveryDay('na příští středu 1x30l').dateStr).toBe('2026-10-21');
  });

  it('Hladík z provozu: ve středu 14. 10. „na pristi tyden na stredu" = 21. 10.', () => {
    setToday('2026-10-14');
    const { day, dateStr } = detectDeliveryDay('Jakub Hladík z Dobřichovic, Podpultovky na pristi tyden na stredu prosim 1x30l 12sv, vcetne zalohy');
    expect(day).toBe('st');
    expect(dateStr).toBe('2026-10-21');
  });

  it('příští týden zmíněný jinde ve zprávě den neposouvá', () => {
    setToday('2026-10-14');
    expect(detectDeliveryDay('3x30l na středu. Fakturu pošlu příští týden.').dateStr).toBe('2026-10-14');
  });
});

