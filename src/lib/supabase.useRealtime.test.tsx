// 💓 useRealtime — bezpečnostní síť pro TICHÝ pád kanálu.
//
// Z provozu 24. 9. 2026: „kdyz ted zadam na telefonu minus jedne keg
// v lahvich jaktze okamzite nevidim zmenu ve skladu na pocitaci... to se
// musi propisovat hned." Stejný scénář jako 16. 9. (reconnect na
// CHANNEL_ERROR/TIMED_OUT/CLOSED) — jenže kanál dovede zůstat ve stavu
// SUBSCRIBED, i když podkladový WebSocket už dávno mlčí (typicky NAT/
// router na slabší síti tiše zahodí nečinné spojení). Tenhle test hlídá,
// že se viditelná obrazovka i BEZ jediné postgres_changes události sama
// přenačte — kanál je tu falešný, který ŽÁDNOU takovou událost nikdy
// nepošle, takže jediné, co může trigger() zavolat, je buď počáteční
// SUBSCRIBED, nebo pojistka.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { useRealtime, supabase } from './supabase';

type StatusCallback = (status: string) => void;

/** Kanál, který se navenek chová jako supabase.channel(), ale nikdy sám nepošle postgres_changes. */
function fakniKanal() {
  let poslednStatus: StatusCallback = () => {};
  const kanal = {
    on: vi.fn(() => kanal),
    subscribe: vi.fn((cb: StatusCallback) => { poslednStatus = cb; return kanal; }),
    // supabase.removeChannel() (volané při odpojení obrazovky) interně
    // volá tohle dvojici — bez nich by na skutečném removeChannel spadl
    // odhlašovací úklid, ne kód pod testem.
    unsubscribe: vi.fn(() => Promise.resolve('ok')),
    teardown: vi.fn(),
    posliStatus: (s: string) => poslednStatus(s),
  };
  return kanal;
}

function nastavViditelnost(hodnota: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: hodnota, configurable: true });
}

function Testovaci({ onChange }: { onChange: () => void }) {
  useRealtime(['bottling'], onChange);
  return null;
}

describe('useRealtime — pojistka proti tichému pádu kanálu', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    nastavViditelnost('visible');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('po minutě beze změny v DB se viditelná obrazovka sama přenačte', async () => {
    const kanal = fakniKanal();
    vi.spyOn(supabase, 'channel').mockReturnValue(kanal as any);

    const onChange = vi.fn();
    render(<Testovaci onChange={onChange} />);

    // Počáteční připojení: SUBSCRIBED spustí trigger (debounce 400 ms).
    kanal.posliStatus('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(500);
    expect(onChange).toHaveBeenCalledTimes(1);

    // Ani jedna postgres_changes událost nikdy nepřijde (fakniKanal ji
    // neumí poslat) — přesto se appka po minutě sama přenačte.
    await vi.advanceTimersByTimeAsync(60_000 + 500);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('schovaná obrazovka pojistkou nepřenačítá — šetří data a baterku, dokud se na ni nikdo nedívá', async () => {
    const kanal = fakniKanal();
    vi.spyOn(supabase, 'channel').mockReturnValue(kanal as any);

    const onChange = vi.fn();
    render(<Testovaci onChange={onChange} />);
    kanal.posliStatus('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(500);
    expect(onChange).toHaveBeenCalledTimes(1);

    nastavViditelnost('hidden');
    await vi.advanceTimersByTimeAsync(60_000 + 500);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('odpojení obrazovky pojistku zastaví — žádné volání po unmountu', async () => {
    const kanal = fakniKanal();
    vi.spyOn(supabase, 'channel').mockReturnValue(kanal as any);

    const onChange = vi.fn();
    const { unmount } = render(<Testovaci onChange={onChange} />);
    kanal.posliStatus('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(500);
    unmount();

    await vi.advanceTimersByTimeAsync(120_000);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
