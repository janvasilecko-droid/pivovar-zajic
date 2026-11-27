// 🔑 Bez signálu se appka nesmí sama odhlásit. Přihlašovací token platí hodinu; když ho telefon ve sklepě
// nemůže obnovit, knihovna umí ohlásit „bez relace", i když přihlášení v telefonu pořád je. Dřív z toho byla
// přihlašovací obrazovka — a na té se bez signálu přihlásit nedá (majitel 27. 11. 2026: „furt to nefunguje
// offline"). Kopie dat pro práci bez signálu navíc patří přihlášenému účtu a po odhlášení se maže.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { AuthProvider, useAuth } from './auth';
import { nactiKopii, ulozKopii, uzivatelKopieTed, zapomenKopiiProTesty } from './offlineKopieSklad';

const KLIC = 'sb-zkouska-auth-token';
const RELACE = { access_token: 'a.b.c', refresh_token: 'r', expires_at: 1, user: { id: 'u1', email: 'sladek@example.invalid' } };

const h = vi.hoisted(() => ({
  /** Co vrátí odhlášení (bez signálu ho knihovna neprovede a vrátí chybu). */
  odhlaseni: {} as { error?: unknown },
  relace: null as unknown,
  udalost: null as ((e: string, s: unknown) => void) | null,
  /** Každý vykreslený stav — „odhlášen" nesmí ani probliknout. */
  stavy: [] as string[],
}));

vi.mock('./supabase', () => {
  const channel: Record<string, unknown> = {};
  channel.on = () => channel;
  channel.subscribe = () => channel;
  const q: Record<string, unknown> = {
    select: () => q, eq: () => q,
    maybeSingle: async () => ({ data: { id: 'u1', display_name: 'Sládek', role: 'user', created_at: '2026-01-01T00:00:00Z', home_layout: {} }, error: null }),
    update: () => ({ eq: async () => ({ error: null }) }),
    upsert: async () => ({ error: null }),
  };
  return {
    supabase: {
      auth: {
        storageKey: 'sb-zkouska-auth-token',
        getSession: async () => ({ data: { session: h.relace } }),
        getUser: async () => ({ data: { user: { id: 'u1' } } }),
        onAuthStateChange: (cb: (e: string, s: unknown) => void) => { h.udalost = cb; return { data: { subscription: { unsubscribe() {} } } }; },
        signInWithPassword: vi.fn(),
        signOut: vi.fn(async () => h.odhlaseni),
      },
      from: () => q,
      channel: () => channel,
      removeChannel: async () => {},
    },
  };
});
vi.mock('./appVersionTracker', () => ({ reportAppVersion: vi.fn() }));

function Sonda() {
  const { session, profile, signOut } = useAuth();
  h.stavy.push(session ? 'přihlášen' : 'odhlášen');
  return (
    <div>
      <span data-testid="stav">{session ? `přihlášen: ${profile?.display_name ?? '…'}` : 'odhlášen'}</span>
      <button onClick={() => void signOut()}>Odhlásit</button>
    </div>
  );
}

async function spust() {
  render(<AuthProvider><Sonda /></AuthProvider>);
  await screen.findByText('přihlášen: Sládek');
}
const stav = () => screen.getByTestId('stav').textContent;

beforeEach(() => {
  localStorage.clear();
  zapomenKopiiProTesty();
  h.stavy.length = 0;
  h.odhlaseni = {};
  h.relace = RELACE;
  h.udalost = null;
  localStorage.setItem(KLIC, JSON.stringify(RELACE));
});
afterEach(() => { vi.useRealTimers(); });

describe('přihlášení bez signálu', () => {
  it('„bez relace" od knihovny appku neodhlásí, dokud přihlášení v telefonu je', async () => {
    await spust();
    h.stavy.length = 0;
    for (const udalost of ['TOKEN_REFRESHED', 'INITIAL_SESSION', 'USER_UPDATED']) {
      await act(async () => { h.udalost!(udalost, null); });
      expect(stav(), udalost).toBe('přihlášen: Sládek');
    }
    // Ani na okamžik: přihlašovací obrazovka by člověku zahodila rozdělanou práci.
    expect(h.stavy).not.toContain('odhlášen');
  });

  it('skutečné odhlášení odhlásí — i kdyby záznam v telefonu ještě ležel', async () => {
    await spust();
    h.relace = null;
    await act(async () => { h.udalost!('SIGNED_OUT', null); });
    expect(stav()).toBe('odhlášen');
  });

  it('skutečné odhlášení odhlásí', async () => {
    await spust();
    h.relace = null;
    localStorage.removeItem(KLIC);
    await act(async () => { h.udalost!('SIGNED_OUT', null); });
    expect(stav()).toBe('odhlášen');
  });

  it('když přihlášení v telefonu není (knihovna ho zrušila), platí „bez relace"', async () => {
    await spust();
    h.relace = null;
    localStorage.removeItem(KLIC);
    await act(async () => { h.udalost!('TOKEN_REFRESHED', null); });
    expect(stav()).toBe('odhlášen');
  });
});

describe('kopie dat pro práci bez signálu patří přihlášenému', () => {
  it('po spuštění se nastaví účet, kterému kopie patří — jiný ji nedostane', async () => {
    await ulozKopii('beers', { rows: [{ id: 'b1' }], t: 1, uzivatel: 'u1' });
    await ulozKopii('orders', { rows: [{ id: 'o1' }], t: 1, uzivatel: 'nekdo-jiny' });
    await spust();
    expect(uzivatelKopieTed()).toBe('u1');
    expect((await nactiKopii('beers'))?.rows).toEqual([{ id: 'b1' }]);
    expect(await nactiKopii('orders')).toBeNull();
  });

  it('přihlášení jiného účtu kopii přepne', async () => {
    await spust();
    h.relace = { ...RELACE, user: { id: 'u2', email: 'druhy@example.invalid' } };
    await act(async () => { h.udalost!('SIGNED_IN', h.relace); });
    expect(uzivatelKopieTed()).toBe('u2');
  });

  it('odhlášení kopii z telefonu smaže', async () => {
    await ulozKopii('beers', { rows: [{ id: 'b1' }], t: 1, uzivatel: 'u1' });
    await spust();
    await act(async () => { screen.getByRole('button', { name: 'Odhlásit' }).click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(await nactiKopii('beers')).toBeNull();
  });

  it('odhlášení, které se bez signálu neprovedlo, kopii nechá — je to jediné, z čeho appka umí odpovídat', async () => {
    await ulozKopii('beers', { rows: [{ id: 'b1' }], t: 1, uzivatel: 'u1' });
    await spust();
    h.odhlaseni = { error: { name: 'AuthRetryableFetchError' } };
    await act(async () => { screen.getByRole('button', { name: 'Odhlásit' }).click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect((await nactiKopii('beers'))?.rows).toEqual([{ id: 'b1' }]);
  });
});
