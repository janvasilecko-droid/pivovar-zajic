import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let session: { access_token: string } | null = { access_token: 'token-uzivatele' };
let chybaSession: { name: string; message: string } | null = null;
vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session }, error: chybaSession }) } },
  VELKY_DOTAZ_TIMEOUT_MS: 25_000,
  fetchWithTimeout: (vstup: RequestInfo | URL, init?: RequestInit) => fetch(vstup, init),
}));

import { BIBLE_URL, odkazDoUloziste, volejBibli } from './bibleKlient';

let fetchMock: ReturnType<typeof vi.fn>;
const odpoved = (status: number, telo: unknown) => new Response(telo === undefined ? 'nic' : JSON.stringify(telo), { status });

beforeEach(() => {
  session = { access_token: 'token-uzivatele' };
  chybaSession = null;
  fetchMock = vi.fn(async () => odpoved(200, { ok: true, data: [1, 2] }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('volejBibli', () => {
  it('volá funkci PROJEKTU BIBLE s tokenem přihlášení z hlavní appky (žádný klíč)', async () => {
    expect(await volejBibli('bible-api', { akce: 'dokumenty' })).toEqual({ ok: true, data: [1, 2] });
    const [adresa, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(adresa).toBe('https://cegrelgvkygcatupqwrx.supabase.co/functions/v1/bible-api');
    expect(BIBLE_URL).not.toContain('sasqexjadvlqyticxwja');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: 'Bearer token-uzivatele', 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({ akce: 'dokumenty' });
  });

  it('bez přihlášení nic neposílá', async () => {
    session = null;
    expect(await volejBibli('bible-api', { akce: 'dokumenty' })).toMatchObject({ ok: false, chyba: { kod: 'neprihlasen', status: 401 } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prošlý token bez signálu: „spojení se přerušilo", ne „přihlas se znovu"', async () => {
    session = null;
    chybaSession = { name: 'AuthRetryableFetchError', message: 'Failed to fetch' };
    expect(await volejBibli('bible-api', { akce: 'dokumenty' })).toMatchObject({ ok: false, chyba: { kod: 'sit' } });
    chybaSession = null;
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValueOnce(false);
    expect(await volejBibli('bible-api', { akce: 'dokumenty' })).toMatchObject({ ok: false, chyba: { kod: 'sit' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('chybu z brány předá i s českou zprávou', async () => {
    fetchMock.mockResolvedValueOnce(odpoved(403, { ok: false, kod: 'zakazano', zprava: 'Tohle smí jen správce knihovny.' }));
    expect(await volejBibli('bible-api', { akce: 'kapacita' })).toEqual({
      ok: false, chyba: { kod: 'zakazano', zprava: 'Tohle smí jen správce knihovny.', status: 403 },
    });
  });

  it('nenasazená funkce, uspaný projekt, jiná chyba', async () => {
    fetchMock.mockResolvedValueOnce(odpoved(404, { message: 'Requested function was not found' }));
    expect(await volejBibli('bible-migrace', { akce: 'seznam' })).toMatchObject({ ok: false, chyba: { kod: 'nenasazeno' } });
    fetchMock.mockResolvedValueOnce(odpoved(503, undefined));
    expect(await volejBibli('bible-api', { akce: 'dokumenty' })).toMatchObject({ ok: false, chyba: { kod: 'nedostupna' } });
    fetchMock.mockResolvedValueOnce(odpoved(500, { error: 'x' }));
    expect(await volejBibli('bible-api', { akce: 'dokumenty' })).toMatchObject({ ok: false, chyba: { kod: 'chyba', status: 500 } });
    // „ok" bez ok: true v těle se za úspěch nebere
    fetchMock.mockResolvedValueOnce(odpoved(200, { data: [1] }));
    expect(await volejBibli('bible-api', { akce: 'dokumenty' })).toMatchObject({ ok: false });
  });

  it('spadlá síť: offline = signál, online = služba neodpovídá', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValueOnce(false);
    expect(await volejBibli('bible-api', { akce: 'dokumenty' })).toMatchObject({ ok: false, chyba: { kod: 'sit' } });
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await volejBibli('bible-api', { akce: 'dokumenty' })).toMatchObject({ ok: false, chyba: { kod: 'nedostupna' } });
  });
});

describe('odkazDoUloziste', () => {
  it('jen podepsaná cesta do bucketu knihovna projektu bible', () => {
    expect(odkazDoUloziste('http://kong:8000/storage/v1/object/sign/knihovna/a/b.pdf?token=t')).toBe(`${BIBLE_URL}/storage/v1/object/sign/knihovna/a/b.pdf?token=t`);
    expect(odkazDoUloziste('/storage/v1/object/sign/knihovna/a/b.pdf?token=t')).toBe(`${BIBLE_URL}/storage/v1/object/sign/knihovna/a/b.pdf?token=t`);
    expect(odkazDoUloziste('https://x/storage/v1/object/sign/jiny/a.pdf?token=t')).toBeNull();
    expect(odkazDoUloziste('https://x/storage/v1/object/public/knihovna/a.pdf?token=t')).toBeNull();
    expect(odkazDoUloziste('https://x/storage/v1/object/sign/knihovna/a.pdf')).toBeNull();
    expect(odkazDoUloziste('javascript:alert(1)')).toBeNull();
    expect(odkazDoUloziste(5)).toBeNull();
  });
});
