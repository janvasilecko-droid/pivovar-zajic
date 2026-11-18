// 🔄 Poznámky a odpočty z jiného zařízení se objeví po návratu do appky.
//
// Majitel 18. 11. 2026: „aby se propisovaly poznámky na stejný účet na jiném
// zařízení." Realtime odběr `profiles` nechodí (tabulka není v realtime
// publikaci), takže poznámka z telefonu se na počítači ukázala až po obnovení
// stránky. AuthProvider proto profil stahuje při návratu do appky, po obnovení
// sítě a pravidelně — a převezme z něj jen to, co tohle zařízení nemá
// rozepsané nebo neodeslané.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './auth';
import { HOME_NOTES_CHANGED_EVENT, poznamkyUlozene, saveHomeNotes } from './homeNotes';
import { getCountdowns } from './stopwatchTimers';
import { zapomenOchranu } from './profileSync';
import { getNastaveniRychlychOdpoctu, saveNastaveniRychlychOdpoctu, RYCHLE_ODPOCTY_NASTAVENI_EVENT } from './rychleOdpoctyNastaveni';
import { BEZ_NASTAVENI } from './rychleOdpocty';
import { pridejVlastni } from './rychleOdpoctyUpravy';

type Zaznam = Record<string, unknown>;
const h = vi.hoisted(() => ({
  profil: {} as Record<string, unknown>,
  zapisy: [] as Zaznam[],
  stazeni: 0,
  selhani: false,
}));

vi.mock('./supabase', () => {
  const channel: Record<string, unknown> = {};
  channel.on = () => channel;
  channel.subscribe = () => channel;
  const profiles = () => {
    const q: Record<string, unknown> = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => {
        h.stazeni += 1;
        if (h.selhani) throw new Error('Failed to fetch');
        return { data: h.profil, error: null };
      },
      update: (v: Zaznam) => ({
        eq: async () => {
          h.zapisy.push(v);
          h.profil = { ...h.profil, ...v };
          return { error: null };
        },
      }),
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

const poznamka = (id: string, text: string) => ({ id, text, completed: false, createdAt: '2026-11-18T08:00:00.000Z' });
const A = poznamka('n-a', 'Víčka');
const B = poznamka('n-b', 'Zavolat dodavateli');
const C = poznamka('n-c', 'Napsáno právě teď');

const odpocet = (id: string, label: string) => ({ id, label, durationMs: 900_000, initialDurationMs: 900_000, targetAt: null, notifiedAt: null });

function Sonda() {
  const { profile } = useAuth();
  return <div>{profile?.display_name ?? 'nikdo'}</div>;
}

async function spustAppku(homeLayout: Record<string, unknown>) {
  h.profil = { id: 'u1', display_name: 'Jan', role: 'user', created_at: '2026-01-01T00:00:00Z', home_layout: homeLayout };
  render(<AuthProvider><Sonda /></AuthProvider>);
  await screen.findByText('Jan');
}

/** Počká, až doběhne jedno stažení profilu navíc. */
async function pockejNaStazeni(predtim: number) {
  await waitFor(() => expect(h.stazeni).toBeGreaterThan(predtim));
  // Převzetí z cloudu se dělá hned po odpovědi — nechat doběhnout mikroúlohy.
  await new Promise((ok) => setTimeout(ok, 0));
}

describe('AuthProvider — stahování poznámek a odpočtů z jiného zařízení', () => {
  beforeEach(() => {
    localStorage.clear();
    zapomenOchranu();
    h.zapisy.length = 0;
    h.stazeni = 0;
    h.selhani = false;
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('poznámka z jiného zařízení se po návratu do appky objeví bez obnovení stránky', async () => {
    await spustAppku({ notes: [A] });
    await waitFor(() => expect(poznamkyUlozene()).toEqual([A]));

    // Na druhém zařízení přibyla poznámka B.
    h.profil = { ...h.profil, home_layout: { notes: [B, A] } };
    const predtim = h.stazeni;
    document.dispatchEvent(new Event('visibilitychange'));
    await pockejNaStazeni(predtim);

    expect(poznamkyUlozene()).toEqual([B, A]);
    // Převzatá změna se neposílá zpátky do cloudu.
    expect(h.zapisy).toHaveLength(0);
  });

  it('zaostření okna stahuje taky', async () => {
    await spustAppku({ notes: [A] });
    h.profil = { ...h.profil, home_layout: { notes: [B, A] } };
    const predtim = h.stazeni;
    // Dvě sekundy odstupu od prvního převzetí při startu se do plánovače nepočítají
    // (ten ještě nic nestáhl), takže stačí událost.
    window.dispatchEvent(new Event('focus'));
    await pockejNaStazeni(predtim);
    expect(poznamkyUlozene()).toEqual([B, A]);
  });

  it('totožná data (jen jinak seřazené klíče z jsonb) se nepřepisují a nerozesílá se událost', async () => {
    await spustAppku({ notes: [A] });
    await waitFor(() => expect(poznamkyUlozene()).toEqual([A]));

    const zmena = vi.fn();
    window.addEventListener(HOME_NOTES_CHANGED_EVENT, zmena);
    try {
      // Cloud vrací klíče v jiném pořadí, obsah je stejný.
      h.profil = { ...h.profil, home_layout: { notes: [{ createdAt: A.createdAt, completed: false, text: A.text, id: A.id }] } };
      const predtim = h.stazeni;
      document.dispatchEvent(new Event('visibilitychange'));
      await pockejNaStazeni(predtim);
      expect(zmena).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(HOME_NOTES_CHANGED_EVENT, zmena);
    }
  });

  it('čerstvě napsaná poznámka se starším zněním z cloudu nepřepíše', async () => {
    await spustAppku({ notes: [A] });
    await waitFor(() => expect(poznamkyUlozene()).toEqual([A]));

    // Právě jsem napsal poznámku C — cloud o ní ještě neví.
    saveHomeNotes([C, A]);
    const predtim = h.stazeni;
    document.dispatchEvent(new Event('visibilitychange'));
    await pockejNaStazeni(predtim);

    expect(poznamkyUlozene()).toEqual([C, A]);
  });

  it('odpočty z jiného zařízení se převezmou a neposílají zpátky', async () => {
    await spustAppku({ countdowns: [odpocet('c1', 'Chmelení')] });
    await waitFor(() => expect(getCountdowns().map((c) => c.id)).toEqual(['c1']));

    h.profil = { ...h.profil, home_layout: { countdowns: [odpocet('c1', 'Chmelení'), odpocet('c2', 'Máčení kvasnic')] } };
    const predtim = h.stazeni;
    document.dispatchEvent(new Event('visibilitychange'));
    await pockejNaStazeni(predtim);

    expect(getCountdowns().map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(h.zapisy).toHaveLength(0);
  });

  it('starší odpočet bez „initialDurationMs" se pořád nepřepisuje (porovnává se po doplnění)', async () => {
    const stary = { id: 'c1', label: 'Chmelení', durationMs: 900_000, targetAt: null, notifiedAt: null };
    await spustAppku({ countdowns: [stary] });
    await waitFor(() => expect(getCountdowns()).toHaveLength(1));

    const zmena = vi.fn();
    window.addEventListener('timers_countdown_changed', zmena);
    try {
      const predtim = h.stazeni;
      document.dispatchEvent(new Event('visibilitychange'));
      await pockejNaStazeni(predtim);
      expect(zmena).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('timers_countdown_changed', zmena);
    }
  });

  it('nastavení rychlých odpočtů v liště se z jiného zařízení převezme a neposílá zpátky', async () => {
    await spustAppku({});
    const nastaveni = pridejVlastni(BEZ_NASTAVENI, 'Chmel', 900_000, 1).nastaveni;
    h.profil = { ...h.profil, home_layout: { rychleOdpocty: nastaveni } };
    const predtim = h.stazeni;
    document.dispatchEvent(new Event('visibilitychange'));
    await pockejNaStazeni(predtim);

    expect(getNastaveniRychlychOdpoctu().vlastni.map((v) => v.popis)).toEqual(['Chmel']);
    expect(h.zapisy).toHaveLength(0);
  });

  it('nastavení lišty, které se nezměnilo, se nepřepisuje a nerozesílá událost', async () => {
    const puvodni = pridejVlastni(BEZ_NASTAVENI, 'Chmel', 900_000, 1).nastaveni;
    await spustAppku({ rychleOdpocty: puvodni });
    await waitFor(() => expect(getNastaveniRychlychOdpoctu().vlastni).toHaveLength(1));

    const zmena = vi.fn();
    window.addEventListener(RYCHLE_ODPOCTY_NASTAVENI_EVENT, zmena);
    try {
      const predtim = h.stazeni;
      document.dispatchEvent(new Event('visibilitychange'));
      await pockejNaStazeni(predtim);
      expect(zmena).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(RYCHLE_ODPOCTY_NASTAVENI_EVENT, zmena);
    }
  });

  it('čerstvě upravená lišta se starším zněním z cloudu nepřepíše', async () => {
    const puvodni = pridejVlastni(BEZ_NASTAVENI, 'Chmel', 900_000, 1).nastaveni;
    await spustAppku({ rychleOdpocty: puvodni });
    await waitFor(() => expect(getNastaveniRychlychOdpoctu().vlastni).toHaveLength(1));

    // Právě jsem na tomhle zařízení přidal další odpočet — cloud o něm ještě neví.
    const upravene = pridejVlastni(puvodni, 'Mladina', 2_700_000, 2).nastaveni;
    saveNastaveniRychlychOdpoctu(upravene);
    h.profil = { ...h.profil, home_layout: { rychleOdpocty: puvodni } };

    const predtim = h.stazeni;
    document.dispatchEvent(new Event('visibilitychange'));
    await pockejNaStazeni(predtim);
    expect(getNastaveniRychlychOdpoctu().vlastni.map((v) => v.popis)).toEqual(['Chmel', 'Mladina']);
  });

  it('chyba při stahování (slabý signál) nic nerozbije a místní poznámky zůstanou', async () => {
    await spustAppku({ notes: [A] });
    await waitFor(() => expect(poznamkyUlozene()).toEqual([A]));

    h.selhani = true;
    const predtim = h.stazeni;
    document.dispatchEvent(new Event('visibilitychange'));
    await pockejNaStazeni(predtim);

    expect(poznamkyUlozene()).toEqual([A]);
    expect(screen.getByText('Jan')).toBeTruthy();
  });
});
