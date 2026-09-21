// 🐛 Nalezeno 21. 9. 2026 v poledne, ve sklepě: „nevidel sem data a nemohl
// sem je zadavat." `navigator.onLine` u slabého signálu hlásí `true`, ale
// požadavek na server nikdy nedostane odpověď ani chybu — obyčejný `fetch()`
// bez limitu na něj čeká donekonečna, takže se offline fallback (cache pro
// čtení, fronta pro zápis) v handleGet/handleWrite nikdy nespustí. Appka pak
// vypadá stejně jako u bugů z 10./13. 9. (sliceByRange/finalizeOfflineRows),
// ale příčina je jiná: tam offline fallback běžel a špatně ořezával, tady se
// k němu appka vůbec nedostane.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithTimeout, OFFLINE_FETCH_TIMEOUT_MS } from './supabase';

// Mock, který se chová jako skutečný fetch: nikdy sám neodpoví, ale při
// abortu signálu zahodí promise chybou AbortError — přesně tak, jak to dělá
// prohlížeč, když fetchWithTimeout po timeoutu zavolá controller.abort().
function nikdyNeodpovidajiciFetch() {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const err = new Error('The operation was aborted.');
        err.name = 'AbortError';
        reject(err);
      });
    });
  });
}

describe('fetchWithTimeout', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('požadavek, který nikdy neodpoví, po OFFLINE_FETCH_TIMEOUT_MS zahodí chybou (ne donekonečna)', async () => {
    vi.stubGlobal('fetch', nikdyNeodpovidajiciFetch());

    const vysledek = fetchWithTimeout('https://example.test/rest/v1/orders');
    const assertion = expect(vysledek).rejects.toThrow(/abort/i);

    await vi.advanceTimersByTimeAsync(OFFLINE_FETCH_TIMEOUT_MS + 100);
    await assertion;
  });

  it('rychlá odpověď projde beze změny, i než timeout uplyne', async () => {
    const rychlaOdpoved = new Response(JSON.stringify([{ id: 1 }]), { status: 200 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rychlaOdpoved));

    const res = await fetchWithTimeout('https://example.test/rest/v1/orders');
    expect(res.status).toBe(200);
  });

  it('respektuje i signál, který si volající poslal sám (zruší se, když je abortnutý zvenčí)', async () => {
    vi.stubGlobal('fetch', nikdyNeodpovidajiciFetch());

    const vnejsiController = new AbortController();
    const vysledek = fetchWithTimeout('https://example.test/rest/v1/orders', { signal: vnejsiController.signal });
    const assertion = expect(vysledek).rejects.toThrow(/abort/i);

    vnejsiController.abort();
    await assertion;
  });
});
