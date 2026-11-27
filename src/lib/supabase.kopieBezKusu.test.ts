// Vyhodnocení dotazů nad kopií je samostatný kus aplikace (lib/offlineDotaz.ts). Když se nenačte — telefon je
// bez signálu a kus v něm zrovna chybí — nesmí nic spadnout: platí starý postup (uložená odpověď, jinak prázdno
// s pruhem „data nejsou ze serveru").
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./offlineDotaz', () => { throw new Error('kus aplikace se nenačetl'); });
vi.mock('./offlineCache', () => ({
  cacheGetResponse: vi.fn().mockResolvedValue(undefined),
  upsertTableRows: vi.fn().mockResolvedValue(undefined),
  getTableRows: vi.fn(async () => null),
  getCachedResponse: vi.fn(async () => null),
}));

import { supabase, nactiVyhodnoceniDotazu, odpovedZKopie } from './supabase';
import { nastavUzivateleKopie, ulozKopii, zapomenKopiiProTesty } from './offlineKopieSklad';
import { vynulujJisticProTesty } from './jisticSpojeni';

beforeEach(async () => {
  localStorage.clear();
  zapomenKopiiProTesty();
  vynulujJisticProTesty();
  nastavUzivateleKopie('u1');
  await ulozKopii('orders', { rows: [{ id: 'o1' }], t: 1, uzivatel: 'u1' });
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('kus s vyhodnocením dotazů se nenačetl', () => {
  it('odpověď z kopie se nekoná, čtení skončí jako dřív — bez chyby', async () => {
    expect(await nactiVyhodnoceniDotazu()).toBeNull();
    expect(await odpovedZKopie('orders', new URLSearchParams('select=id'))).toBeNull();
    const { data, error } = await supabase.from('orders').select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
    // Počet (odznak) bez kopie zůstane chybou sítě, ne výjimkou v aplikaci.
    const pocet = await supabase.from('orders').select('id', { count: 'exact', head: true }).retry(false);
    expect(pocet.count).toBeNull();
    expect(pocet.error).not.toBeNull();
  });
});
