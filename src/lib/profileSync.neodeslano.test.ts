// 🛟 Změna, kterou se nepodařilo odeslat, se cloudem nepřepíše.
//
// Pravidelné stahování profilu (lib/obnovaZCloudu.ts) by jinak poznámku
// napsanou za špatného signálu smazalo: ochranné okno po zápisu trvá deset
// sekund, a jakmile signál naskočí, přišlo by ze serveru starší znění
// a přepsalo to, co se na serveru nikdy neobjevilo. `supabase.update` při
// síťové chybě nevyhodí výjimku, vrátí `{ error }` — dřív se na ni vůbec
// nekoukalo a zápis se tiše považoval za hotový.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloudSmiPrepsat, queueHomeLayoutPatch, zapomenOchranu, zkusOdeslatZnovu } from './profileSync';

const h = vi.hoisted(() => ({
  chybaZapisu: null as null | { message: string },
  zapisy: [] as Record<string, unknown>[],
  cloud: {} as Record<string, unknown>,
}));

vi.mock('./supabase', () => {
  const profiles = () => {
    const q: Record<string, unknown> = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data: { home_layout: h.cloud }, error: null }),
      update: (v: { home_layout: Record<string, unknown> }) => ({
        eq: async () => {
          if (h.chybaZapisu) return { error: h.chybaZapisu };
          h.zapisy.push(v.home_layout);
          h.cloud = v.home_layout;
          return { error: null };
        },
      }),
    };
    return q;
  };
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: () => profiles(),
    },
  };
});

const A = [{ id: 'n-a', text: 'Víčka' }];
const B = [{ id: 'n-b', text: 'Zavolat dodavateli' }, ...A];

describe('profileSync — zápis, který selhal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    zapomenOchranu();
    h.chybaZapisu = null;
    h.zapisy.length = 0;
    h.cloud = {};
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('povedený zápis: pole je chvíli chráněné před ozvěnou a pak se uvolní', async () => {
    queueHomeLayoutPatch({ notes: A });
    await vi.advanceTimersByTimeAsync(300);
    expect(h.zapisy).toHaveLength(1);
    expect(cloudSmiPrepsat('notes')).toBe(false);
    await vi.advanceTimersByTimeAsync(11_000);
    expect(cloudSmiPrepsat('notes')).toBe(true);
  });

  it('zápis selhal (špatný signál): cloud poznámky nesmí přepsat ani po uplynutí ochranného okna', async () => {
    h.chybaZapisu = { message: 'Failed to fetch' };
    queueHomeLayoutPatch({ notes: A });
    await vi.advanceTimersByTimeAsync(300);
    expect(h.zapisy).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(60_000);
    // Server tuhle změnu nemá — jeho znění je starší než naše.
    expect(cloudSmiPrepsat('notes')).toBe(false);
    // Ostatní pole se neblokují.
    expect(cloudSmiPrepsat('countdowns')).toBe(true);
  });

  it('po obnovení signálu se změna odešle a cloud smí zase přepisovat', async () => {
    h.chybaZapisu = { message: 'Failed to fetch' };
    queueHomeLayoutPatch({ notes: A });
    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(60_000);

    h.chybaZapisu = null;
    zkusOdeslatZnovu();
    await vi.advanceTimersByTimeAsync(300);
    expect(h.zapisy).toHaveLength(1);
    expect(h.zapisy[0].notes).toEqual(A);

    await vi.advanceTimersByTimeAsync(11_000);
    expect(cloudSmiPrepsat('notes')).toBe(true);
  });

  it('do té doby se opakuje: druhý pokus taky selže → pole zůstává chráněné', async () => {
    h.chybaZapisu = { message: 'Failed to fetch' };
    queueHomeLayoutPatch({ notes: A });
    await vi.advanceTimersByTimeAsync(300);
    zkusOdeslatZnovu();
    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.zapisy).toHaveLength(0);
    expect(cloudSmiPrepsat('notes')).toBe(false);
  });

  it('novější znění téhož pole přebije to, které neodešlo — opakuje se jen to nové', async () => {
    h.chybaZapisu = { message: 'Failed to fetch' };
    queueHomeLayoutPatch({ notes: A });
    await vi.advanceTimersByTimeAsync(300);

    h.chybaZapisu = null;
    queueHomeLayoutPatch({ notes: B });
    await vi.advanceTimersByTimeAsync(300);
    expect(h.zapisy).toHaveLength(1);
    expect(h.zapisy[0].notes).toEqual(B);

    // Nic k opakování nezbylo.
    zkusOdeslatZnovu();
    await vi.advanceTimersByTimeAsync(300);
    expect(h.zapisy).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(11_000);
    expect(cloudSmiPrepsat('notes')).toBe(true);
  });

  it('bez čeho opakovat, nic se neposílá', async () => {
    zkusOdeslatZnovu();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(h.zapisy).toHaveLength(0);
  });

  it('opakování zachová, co v cloudu mezitím přibylo v jiných polích', async () => {
    h.chybaZapisu = { message: 'Failed to fetch' };
    queueHomeLayoutPatch({ notes: A });
    await vi.advanceTimersByTimeAsync(300);
    // Jiné zařízení mezitím změnilo plochu.
    h.cloud = { dock: ['orders'] };
    h.chybaZapisu = null;
    zkusOdeslatZnovu();
    await vi.advanceTimersByTimeAsync(300);
    expect(h.zapisy[0]).toEqual({ dock: ['orders'], notes: A });
  });
});
