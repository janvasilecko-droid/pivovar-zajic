// 🔄 Poznámky z jiného zařízení se stahují při návratu do appky a pravidelně.
//
// Majitel 18. 11. 2026: „aby se propisovaly poznámky na stejný účet na jiném
// zařízení." Realtime odběr `profiles` nechodí (tabulka není v publikaci),
// takže poznámka z telefonu se na počítači ukázala až po obnovení stránky.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OBNOVA_PROFILU_MS, spustObnovuZCloudu, stejnyObsah } from './obnovaZCloudu';

describe('stejnyObsah', () => {
  it('pořadí klíčů nehraje roli (jsonb klíče přeskládá)', () => {
    expect(stejnyObsah(
      [{ id: 'n1', text: 'Víčka', completed: false, createdAt: '2026-11-18T08:00:00Z' }],
      [{ createdAt: '2026-11-18T08:00:00Z', id: 'n1', completed: false, text: 'Víčka' }],
    )).toBe(true);
  });

  it('rozdíl v textu, ve stavu nebo v počtu se pozná', () => {
    const a = [{ id: 'n1', text: 'Víčka', completed: false }];
    expect(stejnyObsah(a, [{ id: 'n1', text: 'Víčka 2×', completed: false }])).toBe(false);
    expect(stejnyObsah(a, [{ id: 'n1', text: 'Víčka', completed: true }])).toBe(false);
    expect(stejnyObsah(a, [])).toBe(false);
    expect(stejnyObsah(a, [...a, { id: 'n2', text: 'x', completed: false }])).toBe(false);
  });

  it('pořadí poznámek v seznamu rozhoduje (nová je nahoře)', () => {
    const a = { id: 'a' }; const b = { id: 'b' };
    expect(stejnyObsah([a, b], [b, a])).toBe(false);
  });

  it('klíč s hodnotou undefined je totéž co chybějící (JSON ho zahodí)', () => {
    expect(stejnyObsah({ id: 'n1', completedAt: undefined }, { id: 'n1' })).toBe(true);
    expect(stejnyObsah({ id: 'n1', completedAt: null }, { id: 'n1' })).toBe(false);
  });

  it('prázdné a různé typy', () => {
    expect(stejnyObsah([], [])).toBe(true);
    expect(stejnyObsah({}, {})).toBe(true);
    expect(stejnyObsah([], {})).toBe(false);
    expect(stejnyObsah(null, {})).toBe(false);
    expect(stejnyObsah(null, null)).toBe(true);
    expect(stejnyObsah('1', 1)).toBe(false);
    expect(stejnyObsah(0, 0)).toBe(true);
  });
});

describe('spustObnovuZCloudu', () => {
  let viditelna = true;
  let uklid: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    viditelna = true;
  });
  afterEach(() => {
    uklid?.();
    uklid = null;
    vi.useRealTimers();
  });

  const spust = (stahni = vi.fn().mockResolvedValue(undefined)) => {
    uklid = spustObnovuZCloudu({ stahni, jeViditelna: () => viditelna });
    return stahni;
  };

  it('pravidelně stahuje, dokud je appka vidět', async () => {
    const stahni = spust();
    expect(stahni).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(OBNOVA_PROFILU_MS);
    expect(stahni).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(OBNOVA_PROFILU_MS);
    expect(stahni).toHaveBeenCalledTimes(2);
  });

  it('skrytá záložka se nestahuje', async () => {
    const stahni = spust();
    viditelna = false;
    await vi.advanceTimersByTimeAsync(OBNOVA_PROFILU_MS * 3);
    expect(stahni).not.toHaveBeenCalled();
    viditelna = true;
    await vi.advanceTimersByTimeAsync(OBNOVA_PROFILU_MS);
    expect(stahni).toHaveBeenCalledTimes(1);
  });

  it('návrat do appky (visibilitychange) stáhne hned, ne až za dvacet sekund', async () => {
    const stahni = spust();
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(stahni).toHaveBeenCalledTimes(1);
  });

  it('zaostření okna a obnovení sítě stáhnou taky', async () => {
    const stahni = spust();
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(stahni).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000);
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(stahni).toHaveBeenCalledTimes(2);
  });

  it('návrat do appky vyvolá víc událostí naráz — stáhne se jednou', async () => {
    const stahni = spust();
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(stahni).toHaveBeenCalledTimes(1);
    // Dvě sekundy po sobě ještě ne, pak zase ano.
    await vi.advanceTimersByTimeAsync(500);
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(stahni).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(stahni).toHaveBeenCalledTimes(2);
  });

  it('dvě stažení se nepřekrývají', async () => {
    let dokonci: () => void = () => {};
    const stahni = vi.fn(() => new Promise<void>((ok) => { dokonci = ok; }));
    spust(stahni);
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(stahni).toHaveBeenCalledTimes(1);
    // Čtení ještě běží, a už tiká časovač.
    await vi.advanceTimersByTimeAsync(OBNOVA_PROFILU_MS);
    expect(stahni).toHaveBeenCalledTimes(1);
    dokonci();
    await vi.advanceTimersByTimeAsync(OBNOVA_PROFILU_MS);
    expect(stahni).toHaveBeenCalledTimes(2);
  });

  it('chyba stažení (slabý signál) nezastaví další pokusy', async () => {
    const stahni = vi.fn()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValue(undefined);
    spust(stahni);
    await vi.advanceTimersByTimeAsync(OBNOVA_PROFILU_MS);
    await vi.advanceTimersByTimeAsync(OBNOVA_PROFILU_MS);
    expect(stahni).toHaveBeenCalledTimes(2);
  });

  it('po úklidu se nestahuje nic — ani časovačem, ani událostmi', async () => {
    const stahni = spust();
    uklid?.();
    uklid = null;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(OBNOVA_PROFILU_MS * 3);
    expect(stahni).not.toHaveBeenCalled();
  });
});
