// ⏱️ Lišta nahoře na ploše: rychlé odpočty podle nastavení majitele.
//
// Majitel 18. 11. 2026: „jak jsou nahoře odpočty sudů, ať je tam volba různých
// libovolných odpočtů." Lišta ukazuje výchozí odpočty (kotel, malý a velký sud)
// podle nastavení — schované zmizí, vlastní přibudou — a tlačítkem s budíkem
// a plusem se otevře okno, kde se to nastavuje.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import HomeScreen from './HomeScreen';
import { getCountdowns } from '../lib/stopwatchTimers';
import { saveNastaveniRychlychOdpoctu } from '../lib/rychleOdpoctyNastaveni';
import { BEZ_NASTAVENI } from '../lib/rychleOdpocty';
import { nastavDelku, nastavViditelnost, pridejVlastni } from '../lib/rychleOdpoctyUpravy';

// Všechna ostatní data plochy (objednávky, sklad, tanky…) jsou pro tenhle test
// prázdná — Supabase odpovídá „nic tu není" na cokoli.
vi.mock('../lib/supabase', () => {
  const prazdny = (): unknown => {
    const dotaz: Record<string | symbol, unknown> = {};
    const proxy: unknown = new Proxy(dotaz, {
      get(_c, prop) {
        if (prop === 'then') return (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
        if (prop === 'maybeSingle' || prop === 'single') return () => Promise.resolve({ data: null, error: null });
        return () => proxy;
      },
    });
    return proxy;
  };
  const kanal: Record<string, unknown> = {};
  kanal.on = () => kanal;
  kanal.subscribe = () => kanal;
  const supabase = {
    from: () => prazdny(),
    rpc: () => prazdny(),
    channel: () => kanal,
    removeChannel: () => Promise.resolve(),
    auth: {
      getUser: async () => ({ data: { user: { id: 'u1' } } }),
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }), list: async () => ({ data: [], error: null }) }) },
  };
  const funkce = () => undefined;
  // HomeScreen si načítá velké tabulky přes fetchAllRows(...).gte(...) — musí vrátit
  // řetězitelný dotaz jako supabase.from().
  const fetchAllRows = () => prazdny();
  return new Proxy({ supabase, fetchAllRows }, {
    has: () => true,
    get(cil, prop) {
      if (prop in cil) return (cil as Record<string | symbol, unknown>)[prop];
      if (prop === '__esModule') return true;
      if (prop === 'then') return undefined;
      return funkce;
    },
  });
});

// Profil se musí vracet vždy ten samý objekt: HomeScreen se při změně
// `profile.home_layout` překresluje, takže nový objekt při každém volání by
// spustil nekonečné překreslování.
vi.mock('../lib/auth', () => {
  const stav = {
    profile: { id: 'u1', role: 'admin', display_name: 'Jan', home_layout: {} },
    user: { id: 'u1', email: 'jan@example.cz' },
    patchProfile: () => undefined,
    signOut: () => undefined,
  };
  return { useAuth: () => stav };
});

vi.mock('../lib/odpoctyPush', () => ({ zajistiUpozorneniOdpoctu: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../lib/haptika', () => ({ zavibruj: vi.fn() }));

const MIN = 60_000;
const spustHome = () => render(<HomeScreen setPage={vi.fn()} />);

describe('HomeScreen — rychlé odpočty v liště', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    // Klepnutí odemyká zvuk upozornění (lib/notifications.ts) — jsdom přehrávání nemá.
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  it('bez nastavení ukazuje kotel, malý a velký sud (CO2 je vypnuté)', async () => {
    spustHome();
    expect(await screen.findByRole('button', { name: /Kotel: spustit 2 min/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sud malý: spustit 8 min/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sud velký: spustit 10 min/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Foukání CO2/ })).toBeNull();
  });

  it('schovaný odpočet z lišty zmizí a upravená délka se projeví', async () => {
    saveNastaveniRychlychOdpoctu(nastavDelku(nastavViditelnost(BEZ_NASTAVENI, 'rychly-kotel', false), 'rychly-sud-velky', 12 * MIN).nastaveni);
    spustHome();
    expect(await screen.findByRole('button', { name: /Sud velký: spustit 12 min/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Kotel:/ })).toBeNull();
  });

  it('vlastní odpočet je v liště a klepnutím se spustí (a dalším zastaví)', async () => {
    saveNastaveniRychlychOdpoctu(pridejVlastni(BEZ_NASTAVENI, 'Chmel', 15 * MIN, 1).nastaveni);
    spustHome();
    const tlacitko = await screen.findByRole('button', { name: /Chmel: spustit 15 min/ });
    expect(tlacitko.textContent).toBe('15′');

    fireEvent.click(tlacitko);
    const bezici = await screen.findByRole('button', { name: /Chmel: zbývá 1[45]:\d\d, zastavit/ });
    expect(bezici.textContent).toMatch(/^1[45]:\d\d$/);
    expect(getCountdowns().map((c) => c.label)).toContain('Chmel');

    fireEvent.click(bezici);
    await screen.findByRole('button', { name: /Chmel: spustit 15 min/ });
    expect(getCountdowns().map((c) => c.label)).not.toContain('Chmel');
  });

  it('tlačítko s budíkem a plusem otevře okno a změna se hned promítne do lišty', async () => {
    spustHome();
    fireEvent.click(await screen.findByRole('button', { name: 'Rychlé odpočty: přidat nebo upravit' }));
    const okno = (await screen.findByRole('heading', { name: 'Rychlé odpočty' })).closest('.card') as HTMLElement;

    fireEvent.change(within(okno).getByLabelText('Název nového odpočtu'), { target: { value: 'Mladina' } });
    fireEvent.change(within(okno).getByLabelText('Délka nového odpočtu'), { target: { value: '45' } });
    fireEvent.click(within(okno).getByRole('button', { name: /Přidat do lišty/ }));

    // Okno je otevřené nad lištou — tlačítko v liště je pořád v dokumentu.
    expect(await screen.findAllByRole('button', { name: /Mladina: spustit 45 min/ })).toHaveLength(1);
    fireEvent.click(within(okno).getByLabelText('V liště: Kotel'));
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Kotel: spustit/ })).toBeNull());
  });

  it('jednorázový odpočet z okna se rozběhne a okno se zavře', async () => {
    spustHome();
    fireEvent.click(await screen.findByRole('button', { name: 'Rychlé odpočty: přidat nebo upravit' }));
    const okno = (await screen.findByRole('heading', { name: 'Rychlé odpočty' })).closest('.card') as HTMLElement;

    fireEvent.change(within(okno).getByLabelText('Jednorázový odpočet: název'), { target: { value: 'Vaření' } });
    fireEvent.change(within(okno).getByLabelText('Jednorázový odpočet: délka'), { target: { value: '25' } });
    await act(async () => { fireEvent.click(within(okno).getByRole('button', { name: /Spustit/ })); });

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Rychlé odpočty' })).toBeNull());
    const odpocty = getCountdowns();
    expect(odpocty).toHaveLength(1);
    expect(odpocty[0]).toMatchObject({ label: 'Vaření', durationMs: 25 * MIN });
    expect(odpocty[0].targetAt).not.toBeNull();
  });
});
