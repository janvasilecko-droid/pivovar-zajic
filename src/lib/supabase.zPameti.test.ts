// Odpověď z paměti telefonu se pozná — i když telefon hlásí, že je online.
// 15. 10. 2026: „občas se nechce načíst sklad". Na slabém signálu telefon
// tvrdí `navigator.onLine === true`, dotaz ale vyprší a appka odpoví z paměti.
// Dřív se to signalizovalo jen při `!navigator.onLine`, takže Sklad ukázal
// poslední známá čísla (Jantar „na začátku 3" místo 2) bez jediného varování.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let staraMezipamet: any[] | null = null;
vi.mock('./offlineCache', () => ({
  cacheGetResponse: vi.fn().mockResolvedValue(undefined),
  upsertTableRows: vi.fn().mockResolvedValue(undefined),
  getTableRows: vi.fn(async () => null),
  getCachedResponse: vi.fn(async () => (staraMezipamet ? { rows: JSON.parse(JSON.stringify(staraMezipamet)), contentRange: null } : null)),
}));

import { supabase } from './supabase';
import { dataZPametiOd, vycistiZPameti } from './zPameti';

describe('odpověď z paměti telefonu', () => {
  beforeEach(() => {
    localStorage.clear();
    vycistiZPameti();
    staraMezipamet = [{ id: 'i1' }, { id: 'i2' }];
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  // Jeden test na obojí: upozornění pro banner má 3 s pojistku proti spamu
  // (signalOfflineStale), druhý test by ho už nedostal.
  it('čtení, které na síti selže při navigator.onLine === true, se poznačí a vyvolá upozornění', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(navigator.onLine).toBe(true);
    const udalost = vi.fn();
    window.addEventListener('pivovar:offline-stale', udalost);
    try {
      const zacatek = Date.now();
      const { data } = await supabase.from('order_items').select('*');
      expect(data).toHaveLength(2);
      expect(dataZPametiOd(zacatek)).toBe(true);
      expect(udalost).toHaveBeenCalled();
    } finally {
      window.removeEventListener('pivovar:offline-stale', udalost);
    }
  });

  it('čerstvá odpověď serveru nic nepoznačí', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ id: 'x' }]), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })));
    const zacatek = Date.now();
    const { data } = await supabase.from('order_items').select('*');
    expect(data).toEqual([{ id: 'x' }]);
    expect(dataZPametiOd(zacatek)).toBe(false);
  });
});
