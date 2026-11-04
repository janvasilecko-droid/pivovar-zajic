import { describe, it, expect, vi } from 'vitest';
import { ChybaStrany, MAX_PIXELU_PLATNA, OBNOVIT_ODKAZ_PO_MS, meritkoStrany, umiObrazekStrany, zdrojRozsahu, type Odkaz } from './biblePdf';

function odpoved(status: number, telo: Uint8Array = new Uint8Array(), hlavicky: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(hlavicky),
    arrayBuffer: async () => telo.buffer.slice(telo.byteOffset, telo.byteOffset + telo.byteLength),
  } as unknown as Response;
}

const SOUBOR = Uint8Array.from({ length: 100 }, (_, i) => i);

/** Úložiště jako Supabase: HEAD s Content-Length, Range → 206, prošlý podpis → 400. */
function uloziste(volby: { prosleTokeny?: Set<string>; bezRozsahu?: boolean; bezDelky?: boolean } = {}) {
  return vi.fn(async (vstup: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(vstup));
    if (volby.prosleTokeny?.has(url.searchParams.get('token') ?? '')) return odpoved(400);
    if (init?.method === 'HEAD') return odpoved(200, new Uint8Array(), volby.bezDelky ? {} : { 'content-length': String(SOUBOR.length) });
    const rozsah = /^bytes=(\d+)-(\d+)$/.exec(String((init?.headers as Record<string, string> | undefined)?.Range ?? ''));
    if (rozsah && !volby.bezRozsahu) return odpoved(206, SOUBOR.slice(Number(rozsah[1]), Number(rozsah[2]) + 1));
    return odpoved(200, SOUBOR);
  });
}

function odkazy(...tokeny: string[]) {
  let i = 0;
  return vi.fn(async (): Promise<Odkaz> => ({ url: `https://bible.test/storage/v1/object/sign/knihovna/k.pdf?token=${tokeny[Math.min(i++, tokeny.length - 1)]}` }));
}

describe('zdrojRozsahu — originál knihy po kouscích', () => {
  it('velikost bere z HEAD, kousek přes hlavičku Range (konec bez posledního bajtu, jak žádá pdf.js)', async () => {
    const fetch = uloziste();
    const z = zdrojRozsahu(odkazy('a'), { fetch });
    expect(await z.delka()).toBe(100);
    expect(Array.from(await z.cti(10, 15))).toEqual([10, 11, 12, 13, 14]);
    expect(fetch.mock.calls[1][1]).toEqual({ headers: { Range: 'bytes=10-14' } });
  });

  it('jeden odkaz pro souběžné dotazy (ne podpis na každý kousek)', async () => {
    const ziskej = odkazy('a');
    const z = zdrojRozsahu(ziskej, { fetch: uloziste() });
    await Promise.all([z.cti(0, 5), z.cti(5, 10), z.delka()]);
    expect(ziskej).toHaveBeenCalledTimes(1);
  });

  it('úložiště bez délky: záloha z knihovny, jinak srozumitelná chyba', async () => {
    const z = zdrojRozsahu(odkazy('a'), { fetch: uloziste({ bezDelky: true }) });
    expect(await z.delka(1234)).toBe(1234);
    await expect(z.delka(null)).rejects.toThrow('Úložiště neřeklo velikost souboru.');
  });

  it('úložiště rozsah nevezme (200 s celým souborem): vrátí jen požadovaný kus', async () => {
    const z = zdrojRozsahu(odkazy('a'), { fetch: uloziste({ bezRozsahu: true }) });
    expect(Array.from(await z.cti(97, 100))).toEqual([97, 98, 99]);
  });

  it('kus jiné délky, než se žádal, se nepoužije', async () => {
    const fetch = vi.fn(async () => odpoved(206, new Uint8Array(3)));
    const z = zdrojRozsahu(odkazy('a'), { fetch });
    await expect(z.cti(0, 10)).rejects.toThrow('jiný kus souboru');
  });

  it('prošlý podpis (400): jednou nový odkaz a znovu', async () => {
    const ziskej = odkazy('stary', 'novy');
    const fetch = uloziste({ prosleTokeny: new Set(['stary']) });
    const z = zdrojRozsahu(ziskej, { fetch });
    expect(Array.from(await z.cti(0, 2))).toEqual([0, 1]);
    expect(ziskej).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[1][0])).toContain('token=novy');
  });

  it('odmítnutí i s novým odkazem = chyba (žádné nekonečné zkoušení)', async () => {
    const ziskej = odkazy('x');
    const z = zdrojRozsahu(ziskej, { fetch: uloziste({ prosleTokeny: new Set(['x']) }) });
    await expect(z.cti(0, 2)).rejects.toThrow('Úložiště knihu nevydalo (HTTP 400).');
    expect(ziskej).toHaveBeenCalledTimes(2);
  });

  it('jiná chyba úložiště (500) se nezkouší s novým odkazem', async () => {
    const ziskej = odkazy('a');
    const z = zdrojRozsahu(ziskej, { fetch: vi.fn(async () => odpoved(500)) });
    await expect(z.cti(0, 2)).rejects.toBeInstanceOf(ChybaStrany);
    expect(ziskej).toHaveBeenCalledTimes(1);
  });

  it('starý odkaz (přes 9 minut) se obnoví předem, ne až po odmítnutí', async () => {
    let ted = 0;
    const ziskej = odkazy('prvni', 'druhy');
    const fetch = uloziste();
    const z = zdrojRozsahu(ziskej, { fetch, ted: () => ted });
    await z.cti(0, 1);
    ted = OBNOVIT_ODKAZ_PO_MS - 1;
    await z.cti(1, 2);
    expect(ziskej).toHaveBeenCalledTimes(1);
    ted = OBNOVIT_ODKAZ_PO_MS + 1;
    await z.cti(2, 3);
    expect(ziskej).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[2][0])).toContain('token=druhy');
  });

  it('odkaz nejde vydat: hláška z bible-api; další pokus si řekne znovu', async () => {
    const ziskej = vi.fn<() => Promise<Odkaz>>()
      .mockResolvedValueOnce({ chyba: 'Dokument už v knihovně není.' })
      .mockResolvedValueOnce({ url: 'https://bible.test/storage/v1/object/sign/knihovna/k.pdf?token=a' });
    const z = zdrojRozsahu(ziskej, { fetch: uloziste() });
    await expect(z.delka()).rejects.toThrow('Dokument už v knihovně není.');
    expect(await z.delka()).toBe(100);
  });

  it('bez spojení: srozumitelná hláška', async () => {
    const z = zdrojRozsahu(odkazy('a'), { fetch: vi.fn(async () => { throw new TypeError('Failed to fetch'); }) });
    await expect(z.cti(0, 1)).rejects.toThrow('zkontroluj připojení');
  });
});

describe('meritkoStrany', () => {
  it('šířka v CSS pixelech × hustota displeje', () => {
    expect(meritkoStrany(600, 800, 300, 1)).toBeCloseTo(0.5);
    expect(meritkoStrany(600, 800, 300, 2)).toBeCloseTo(1);
  });
  it('hustota nad 2 se nepočítá (oko to nepozná, paměť ano)', () => {
    expect(meritkoStrany(600, 800, 300, 3)).toBeCloseTo(1);
  });
  it('strop pixelů plátna', () => {
    const m = meritkoStrany(600, 800, 6000, 2);
    expect(600 * m * 800 * m).toBeLessThanOrEqual(MAX_PIXELU_PLATNA + 1);
  });
  it('nesmysly → 1', () => {
    expect(meritkoStrany(0, 800, 300, 1)).toBe(1);
    expect(meritkoStrany(600, 800, 0, 1)).toBe(1);
  });
});

describe('umiObrazekStrany', () => {
  it('jen PDF', () => {
    expect(umiObrazekStrany('application/pdf')).toBe(true);
    expect(umiObrazekStrany('image/vnd.djvu', 'kniha.djvu')).toBe(false);
    expect(umiObrazekStrany('application/epub+zip')).toBe(false);
    expect(umiObrazekStrany(null, 'Kniha.PDF')).toBe(true);
    expect(umiObrazekStrany(null, 'kniha.docx')).toBe(false);
  });
});
