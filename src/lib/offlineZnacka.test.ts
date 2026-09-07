// Offline zápis se tváří jako povedený (viz synthesizeWrite v supabase.ts),
// takže obrazovka ukáže zelené „Uloženo" úplně stejné jako při odeslání.
// Ve sklepě s kolísavým signálem se kvůli tomu zapisovalo stáčení s tím, že
// je hotovo. Tenhle test hlídá značku, podle které oznámení pozná, že zápis
// zatím leží ve frontě v telefonu.
import { describe, it, expect, beforeEach } from 'vitest';
import { enqueue, clearQueue, zapisSelDoFronty, zapomenZapisDoFronty } from './offline';

describe('značka „zápis šel do fronty"', () => {
  beforeEach(() => {
    clearQueue();
    zapomenZapisDoFronty();
  });

  it('bez zápisu do fronty se nic nehlásí', () => {
    expect(zapisSelDoFronty()).toBe(false);
  });

  it('hned po zápisu do fronty je značka čerstvá', () => {
    enqueue({ table: 'kegging', op: 'insert', row: { id: 'a' } });
    expect(zapisSelDoFronty()).toBe(true);
  });

  it('po chvíli značka vyprší, ať ji nedostane nesouvisející oznámení', () => {
    enqueue({ table: 'kegging', op: 'insert', row: { id: 'a' } });
    const zaDeset = Date.now() + 10_000;
    expect(zapisSelDoFronty(4000, zaDeset)).toBe(false);
  });

  it('okno se dá roztáhnout — na hranici ještě platí', () => {
    enqueue({ table: 'kegging', op: 'insert', row: { id: 'a' } });
    expect(zapisSelDoFronty(10_000, Date.now() + 9_000)).toBe(true);
  });
});
