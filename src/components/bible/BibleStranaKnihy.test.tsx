import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

// pdf.js v jsdom neběží (žádné plátno) — otevření originálu je tu falešné.
const otevriPdf = vi.fn();
vi.mock('../../lib/biblePdf', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/biblePdf')>()),
  otevriPdf: (...a: unknown[]) => otevriPdf(...a),
}));
vi.mock('../../lib/bibleKnihovnaApi', () => ({ odkazNaSoubor: vi.fn(async () => ({ url: 'https://x/storage/v1/object/sign/knihovna/k.pdf?token=t' })) }));

import { ChybaStrany, type ZdrojRozsahu } from '../../lib/biblePdf';
import { odkazNaSoubor } from '../../lib/bibleKnihovnaApi';
import { BibleStranaKnihy } from './BibleStranaKnihy';

function falesnePdf(stran = 3) {
  const render = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }));
  const getPage = vi.fn(async () => ({
    getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
    render,
  }));
  const destroy = vi.fn(async () => {});
  return { pdf: { numPages: stran, getPage }, getPage, render, destroy };
}

beforeEach(() => {
  otevriPdf.mockReset();
});

async function vykresli(pdfIndex = 2) {
  let vysledek: ReturnType<typeof render> | undefined;
  await act(async () => {
    vysledek = render(<BibleStranaKnihy id="kniha-1" pdfIndex={pdfIndex} velikost={1000} oznaceni="s. 1" />);
  });
  return vysledek!;
}

describe('Strana z knihy', () => {
  it('pdf.js si s dodatkem neporadí: kniha se hned otevře znovu bez něj', async () => {
    const puvodni = vi.mocked(odkazNaSoubor).getMockImplementation();
    vi.mocked(odkazNaSoubor).mockImplementation(async (_id: string, sDodatkem?: boolean) => ({
      url: 'https://x/storage/v1/object/sign/knihovna/k.pdf?token=t',
      ...(sDodatkem ? { dodatek: { delkaOriginalu: 1000, data: Uint8Array.of(10) } } : {}),
    }));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, headers: new Headers({ 'content-length': '1000' }) })));
    const f = falesnePdf();
    const sDodatkem: boolean[] = [];
    otevriPdf.mockImplementation(async (zdroj: ZdrojRozsahu) => {
      await zdroj.delka();
      sDodatkem.push(zdroj.sDodatkem());
      return zdroj.sDodatkem()
        ? { promise: Promise.reject(new Error('Invalid PDF structure.')), destroy: vi.fn(async () => {}) }
        : { promise: Promise.resolve(f.pdf), destroy: f.destroy };
    });
    try {
      await act(async () => {
        render(<BibleStranaKnihy id="kniha-s-dodatkem" pdfIndex={2} velikost={1000} oznaceni="s. 2" />);
      });
      expect(sDodatkem).toEqual([true, false]);
      expect(vi.mocked(odkazNaSoubor).mock.calls.filter((c) => c[0] === 'kniha-s-dodatkem').map((c) => c[1])).toEqual([true, false]);
      expect(screen.getByRole('img', { name: 'Strana z knihy: s. 2' })).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
      vi.mocked(odkazNaSoubor).mockImplementation(puvodni!);
    }
  });

  it('vykreslí požadovanou stranu originálu jako obrázek s popisem', async () => {
    const f = falesnePdf();
    otevriPdf.mockResolvedValue({ promise: Promise.resolve(f.pdf), destroy: f.destroy });
    await vykresli(2);
    expect(f.getPage).toHaveBeenCalledWith(2);
    expect(f.render).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('img', { name: 'Strana z knihy: s. 1' })).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('listování nepřeotevírá knihu — jen vykreslí další stranu', async () => {
    const f = falesnePdf();
    otevriPdf.mockResolvedValue({ promise: Promise.resolve(f.pdf), destroy: f.destroy });
    const { rerender } = await vykresli(1);
    await act(async () => { rerender(<BibleStranaKnihy id="kniha-1" pdfIndex={3} velikost={1000} oznaceni="s. 3" />); });
    expect(otevriPdf).toHaveBeenCalledTimes(1);
    expect(f.getPage).toHaveBeenLastCalledWith(3);
  });

  it('strana, která v originále není: hláška místo cizí strany', async () => {
    const f = falesnePdf(2);
    otevriPdf.mockResolvedValue({ promise: Promise.resolve(f.pdf), destroy: f.destroy });
    await vykresli(5);
    expect(screen.getByRole('alert').textContent).toContain('Originál má jen 2 stran');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('chyba stahování: hláška a „Zkusit znovu" otevře knihu znovu', async () => {
    otevriPdf.mockRejectedValueOnce(new ChybaStrany('Stranu se nepodařilo stáhnout — zkontroluj připojení.'));
    await vykresli(1);
    expect(screen.getByRole('alert').textContent).toContain('zkontroluj připojení');
    const f = falesnePdf();
    otevriPdf.mockResolvedValue({ promise: Promise.resolve(f.pdf), destroy: f.destroy });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Zkusit znovu' })); });
    expect(otevriPdf).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('img')).toBeTruthy();
  });

  it('chyba přenosu během čtení: kniha se zavře a ukáže se hláška přenosu', async () => {
    const f = falesnePdf();
    otevriPdf.mockImplementation(async (_zdroj: unknown, _velikost: unknown, priChybe: (e: Error) => void) => ({
      promise: new Promise((_, reject) => {
        // pdf.js po zavření odmítne s vlastní (anglickou) chybou — ukázat se má ta naše.
        priChybe(new ChybaStrany('Úložiště knihu nevydalo (HTTP 416).'));
        reject(new Error('Worker was destroyed'));
      }),
      destroy: f.destroy,
    }));
    await vykresli(1);
    expect(screen.getByRole('alert').textContent).toContain('HTTP 416');
  });

  it('zvětšení vykreslí stranu znovu ve větším měřítku', async () => {
    const f = falesnePdf();
    otevriPdf.mockResolvedValue({ promise: Promise.resolve(f.pdf), destroy: f.destroy });
    await vykresli(1);
    expect(screen.getByRole('button', { name: 'Zmenšit stranu' })).toHaveProperty('disabled', true);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Zvětšit stranu' })); });
    expect(f.render).toHaveBeenCalledTimes(2);
    expect(screen.getByText('150 %')).toBeTruthy();
    const [prvni, druhy] = f.render.mock.calls as unknown as [{ viewport: { width: number } }][];
    expect(druhy[0].viewport.width).toBeGreaterThan(prvni[0].viewport.width);
  });

  it('odchod ze čtečky zavře originál (pracovní vlákno pdf.js)', async () => {
    const f = falesnePdf();
    otevriPdf.mockResolvedValue({ promise: Promise.resolve(f.pdf), destroy: f.destroy });
    const { unmount } = await vykresli(1);
    unmount();
    expect(f.destroy).toHaveBeenCalled();
  });
});
