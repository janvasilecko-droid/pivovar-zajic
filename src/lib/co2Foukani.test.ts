import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  spustCo2, zastavCo2, prepniCo2, co2Bezi, co2Zbyva, najdiCo2,
  CO2_ID, CO2_DELKA_MS, CO2_POPIS,
} from './co2Foukani';
import type { CountdownTimer } from './stopwatchTimers';

const TED = 1_700_000_000_000;
const jinyOdpocet: CountdownTimer = {
  id: 'chmeleni', label: 'Chmelení', durationMs: 600_000,
  initialDurationMs: 600_000, targetAt: null, notifiedAt: null,
};

afterEach(() => vi.useRealTimers());

describe('spustCo2', () => {
  it('založí dvouminutový odpočet s pevným id a popisem', () => {
    const t = najdiCo2(spustCo2([], TED))!;
    expect(t.id).toBe(CO2_ID);
    expect(t.label).toBe(CO2_POPIS);
    expect(t.targetAt).toBe(TED + CO2_DELKA_MS);
    expect(t.initialDurationMs).toBe(CO2_DELKA_MS);
  });

  it('druhé spuštění nevyrobí druhé foukání, jen ho posune', () => {
    // Na ploše smí běžet jedno foukání. Dvě by znamenala dva alarmy
    // a nikdo by nevěděl, který sud se profukuje.
    const podvou = spustCo2(spustCo2([], TED), TED + 5000);
    expect(podvou.filter((t) => t.id === CO2_ID)).toHaveLength(1);
    expect(najdiCo2(podvou)!.targetAt).toBe(TED + 5000 + CO2_DELKA_MS);
  });

  it('nesahá na ostatní odpočty', () => {
    expect(spustCo2([jinyOdpocet], TED).find((t) => t.id === 'chmeleni')).toEqual(jinyOdpocet);
  });
});

describe('zastavCo2', () => {
  it('odpočet z plochy zmizí, ostatní zůstanou', () => {
    const list = spustCo2([jinyOdpocet], TED);
    const po = zastavCo2(list);
    expect(najdiCo2(po)).toBeNull();
    expect(po).toHaveLength(1);
  });
});

describe('prepniCo2', () => {
  it('klepnutí spustí, druhé zastaví', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(TED));
    const bezi = prepniCo2([], TED);
    expect(co2Bezi(bezi)).toBe(true);
    expect(co2Bezi(prepniCo2(bezi, TED + 1000))).toBe(false);
  });
});

describe('co2Zbyva', () => {
  it('bez běžícího foukání ukazuje plné dvě minuty', () => {
    expect(co2Zbyva([])).toBe(CO2_DELKA_MS);
  });

  it('za běhu odečítá čas', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(TED));
    const list = spustCo2([], TED);
    vi.setSystemTime(new Date(TED + 30_000));
    expect(co2Zbyva(list)).toBe(CO2_DELKA_MS - 30_000);
  });

  it('doběhnuté foukání zůstane „běžící", dokud ho někdo neodklepne', () => {
    // Dlaždice po doběhnutí ukazuje 0:00 a čeká na klepnutí — kdyby se
    // sama přepnula zpátky, zmizel by z plochy důvod, proč se ozval alarm.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(TED));
    const list = spustCo2([], TED);
    vi.setSystemTime(new Date(TED + CO2_DELKA_MS + 5000));
    expect(co2Zbyva(list)).toBe(0);
    expect(co2Bezi(list)).toBe(true);
  });
});
