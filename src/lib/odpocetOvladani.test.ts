import { describe, it, expect } from 'vitest';
import {
  spustOdpocet, pozastavOdpocet, zastavOdpocet, resetujOdpocet, bezici, puvodniDelka,
  type CountdownTimer,
} from './stopwatchTimers';

const TED = 1_700_000_000_000;
const odpocet = (zmeny: Partial<CountdownTimer> = {}): CountdownTimer => ({
  id: 't1', label: 'Chmelení', durationMs: 600_000, initialDurationMs: 600_000,
  targetAt: null, notifiedAt: null, ...zmeny,
});

describe('start', () => {
  it('spustí od zbývajícího času, ne od původního', () => {
    // Pauza po třech minutách z deseti — start musí pokračovat od sedmi,
    // jinak by pauza tiše přidávala čas.
    const t = spustOdpocet(odpocet({ durationMs: 420_000 }), TED);
    expect(t.targetAt).toBe(TED + 420_000);
  });

  it('doběhnutý odpočet spustí znovu od začátku', () => {
    const dobehl = odpocet({ targetAt: TED - 1000, durationMs: 0 });
    const t = spustOdpocet(dobehl, TED);
    expect(t.targetAt).toBe(TED + 600_000);
    expect(t.notifiedAt).toBeNull();
  });
});

describe('pauza', () => {
  it('zastaví a nechá zbývající čas', () => {
    const bezi = odpocet({ targetAt: TED + 120_000 });
    const t = pozastavOdpocet(bezi, TED);
    expect(t.targetAt).toBeNull();
    expect(t.durationMs).toBe(120_000);
  });

  it('z nespuštěného odpočtu nedělá nic', () => {
    const stoji = odpocet({ durationMs: 300_000 });
    expect(pozastavOdpocet(stoji)).toEqual(stoji);
  });
});

describe('stop', () => {
  it('zastaví A vrátí na původní čas', () => {
    const t = zastavOdpocet(odpocet({ targetAt: TED + 60_000, durationMs: 60_000 }));
    expect(t.targetAt).toBeNull();
    expect(t.durationMs).toBe(600_000);
  });
});

describe('reset', () => {
  it('u běžícího odpočtu spustí znovu od začátku', () => {
    const t = resetujOdpocet(odpocet({ targetAt: TED + 60_000, durationMs: 60_000 }), TED);
    expect(t.targetAt).toBe(TED + 600_000);
  });

  it('u zastaveného jen vrátí čas, nespouští ho', () => {
    const t = resetujOdpocet(odpocet({ durationMs: 60_000 }), TED);
    expect(t.targetAt).toBeNull();
    expect(t.durationMs).toBe(600_000);
  });
});

describe('puvodniDelka', () => {
  it('starý záznam bez initialDurationMs použije aktuální délku', () => {
    expect(puvodniDelka({ ...odpocet(), initialDurationMs: undefined, durationMs: 90_000 })).toBe(90_000);
  });
});

describe('bezici', () => {
  it('vrátí jen ty, které opravdu běží — podle nich se ukáže upozornění na ploše', () => {
    const list = [odpocet({ id: 'a', targetAt: TED + 1000 }), odpocet({ id: 'b' })];
    expect(bezici(list).map((t) => t.id)).toEqual(['a']);
  });
});
