// 🍺 Samostatný AI sládek (R39) sdílí s hlavní aplikací úložiště prohlížeče (poznámky, odpočty, lišta), ale může
// být přihlášený jiným účtem. Proto z profilu nic nepřebírá a nestahuje — jinak by poznámky jednoho účtu
// přepsaly poznámky druhého. Přihlášení a načtení profilu (role v bibli) fungují jako jindy.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./profilAplikace', async (puvodni) => ({ ...(await puvodni<typeof import('./profilAplikace')>()), JE_SLADEK: true }));

import { AuthProvider, useAuth } from './auth';
import { poznamkyUlozene } from './homeNotes';
import { getCountdowns } from './stopwatchTimers';
import { zapomenOchranu } from './profileSync';

const h = vi.hoisted(() => ({ profil: {} as Record<string, unknown>, stazeni: 0 }));

vi.mock('./supabase', () => {
  const channel: Record<string, unknown> = {};
  channel.on = () => channel;
  channel.subscribe = () => channel;
  const profiles = () => {
    const q: Record<string, unknown> = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => { h.stazeni += 1; return { data: h.profil, error: null }; },
      update: () => ({ eq: async () => ({ error: null }) }),
      upsert: async () => ({ error: null }),
    };
    return q;
  };
  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'jan@example.cz' } } } }),
        getUser: async () => ({ data: { user: { id: 'u1' } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(async () => ({})),
      },
      from: () => profiles(),
      channel: () => channel,
      removeChannel: async () => {},
    },
  };
});
vi.mock('./appVersionTracker', () => ({ reportAppVersion: vi.fn() }));

function Sonda() {
  const { profile } = useAuth();
  return <div>{profile ? `${profile.display_name}:${profile.role}` : 'nikdo'}</div>;
}

const pockej = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

describe('AuthProvider v samostatné aplikaci AI sládek', () => {
  beforeEach(() => {
    localStorage.clear();
    zapomenOchranu();
    h.stazeni = 0;
    h.profil = {
      id: 'u1', display_name: 'Jan', role: 'sladek', created_at: '2026-01-01T00:00:00Z',
      home_layout: {
        notes: [{ id: 'n-a', text: 'Poznámka jiného účtu', completed: false, createdAt: '2026-11-18T08:00:00.000Z' }],
        countdowns: [{ id: 'o1', label: 'Odpočet', durationMs: 900_000, initialDurationMs: 900_000, targetAt: null, notifiedAt: null }],
      },
    };
  });
  afterEach(() => { localStorage.clear(); });

  it('profil (role) se načte, ale poznámky ani odpočty z něj se nepřevezmou do úložiště hlavní aplikace', async () => {
    render(<AuthProvider><Sonda /></AuthProvider>);
    expect(await screen.findByText('Jan:sladek')).toBeTruthy();
    await pockej(30);
    expect(poznamkyUlozene()).toBeNull();
    expect(getCountdowns()).toEqual([]);
    expect(localStorage.length).toBe(0);
  });

  it('po návratu do aplikace, zaostření ani obnovení sítě se profil nestahuje znovu (žádné převzetí ani doposílání)', async () => {
    render(<AuthProvider><Sonda /></AuthProvider>);
    await screen.findByText('Jan:sladek');
    await pockej(30); // dokončí se start (profil se při nastavení přihlášení načte dvakrát)
    const predtim = h.stazeni;
    expect(predtim).toBeGreaterThan(0);
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    await pockej(50);
    expect(h.stazeni).toBe(predtim);
    expect(poznamkyUlozene()).toBeNull();
  });
});
