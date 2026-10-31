import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import type { BibleDokument, Nacteno } from '../../lib/bibleKnihovnaApi';
import { OBNOVA_PRI_CEKANI_MS, OBNOVA_PRI_ZPRACOVANI_MS, type StavDokumentu, type PostupZpracovani } from '../../lib/bibleKnihovna';

vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1', email: 'u@pivovar.cz' }, profile: { role: 'admin' } }) }));
const nactiDokumenty = vi.fn<() => Promise<Nacteno>>();
vi.mock('../../lib/bibleKnihovnaApi', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/bibleKnihovnaApi')>()),
  nactiDokumenty: () => nactiDokumenty(),
}));

import { BibleKnihovna } from './BibleKnihovna';

const dok = (stav: StavDokumentu, postup: PostupZpracovani = {}): BibleDokument => ({
  id: 'd1', nazev: 'Technologie piva', autor: null, vydani: null, rok: null, isbn: null, jazyk: 'de', druh: 'kniha',
  oblasti: [], zdroj: null, soubor_nazev: 'kunze.pdf', soubor_velikost: 1000, soubor_mime: 'application/pdf',
  stav, stav_zprava: null, postup, stran_celkem: null, kvalita_ocr: null, licence: null, nahral: 'u1',
  nahral_jmeno: 'Honza', created_at: '2026-10-31T10:00:00Z', zpracovano_at: null,
});
const ok = (...dokumenty: BibleDokument[]): Nacteno => ({ stav: 'ok', dokumenty });
const prepis = (hotovo: number) => ({ prubeh: { faze: 'prepis', hotovo, celkem: 100, ocr_hotovo: hotovo - 26, ocr_celkem: 74 } });

// Obnovovací časovač knihovny se zachytí a pustí ručně; ostatní (čekání
// testovací knihovny apod.) běží normálně.
const OBNOVA_ID = 987_654;
let obnovy: Array<{ fn: () => void; ms: number }> = [];
let zrusene: unknown[] = [];
beforeEach(() => {
  obnovy = [];
  zrusene = [];
  nactiDokumenty.mockReset();
  const puvodniSet = globalThis.setInterval;
  const puvodniClear = globalThis.clearInterval;
  vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => void, ms?: number, ...a: unknown[]) => {
    if (ms === OBNOVA_PRI_ZPRACOVANI_MS || ms === OBNOVA_PRI_CEKANI_MS) {
      obnovy.push({ fn, ms });
      return OBNOVA_ID as unknown as ReturnType<typeof setInterval>;
    }
    return puvodniSet(fn, ms, ...a);
  }) as typeof setInterval);
  vi.spyOn(globalThis, 'clearInterval').mockImplementation(((id?: Parameters<typeof clearInterval>[0]) => {
    if ((id as unknown) === OBNOVA_ID) zrusene.push(id);
    else puvodniClear(id);
  }) as typeof clearInterval);
});
afterEach(() => vi.restoreAllMocks());

describe('Knihovna — procenta zpracování', () => {
  it('ukáže procenta ve štítku, fázi a pruh; sama se obnoví a procenta přibudou; po dokončení obnovování skončí', async () => {
    nactiDokumenty.mockResolvedValueOnce(ok(dok('zpracovava', prepis(46))));
    render(<BibleKnihovna role="spravuje" />);
    expect(await screen.findByText('Zpracovává se · 46 %')).toBeTruthy();
    expect(screen.getByText('46 % · přepisuje skeny (20 z 74 stran)')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('46');

    const obnova = obnovy.find((o) => o.ms === OBNOVA_PRI_ZPRACOVANI_MS);
    expect(obnova).toBeTruthy();
    nactiDokumenty.mockResolvedValueOnce(ok(dok('zpracovava', prepis(80))));
    await act(async () => { obnova!.fn(); });
    expect(await screen.findByText('Zpracovává se · 80 %')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('80');

    nactiDokumenty.mockResolvedValueOnce(ok(dok('hotovo', { stran: 100, kapitol: 5, pasazi: 300 })));
    await act(async () => { obnova!.fn(); });
    expect(await screen.findByText('100 stran · 5 kapitol · 300 pasáží')).toBeTruthy();
    expect(within(screen.getByRole('listitem')).getByText('Zpracováno')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(zrusene).toEqual([OBNOVA_ID]);
  });

  it('chyba sítě při obnovení nechá poslední načtený stav (žádné „Načítám…" ani chybové okno)', async () => {
    nactiDokumenty.mockResolvedValueOnce(ok(dok('zpracovava', prepis(46))));
    render(<BibleKnihovna role="spravuje" />);
    expect(await screen.findByText('Zpracovává se · 46 %')).toBeTruthy();
    nactiDokumenty.mockResolvedValueOnce({ stav: 'chyba', zprava: 'Spojení se přerušilo.' });
    await act(async () => { obnovy[0].fn(); });
    expect(screen.getByText('Zpracovává se · 46 %')).toBeTruthy();
    expect(screen.queryByText(/nepodařilo načíst/)).toBeNull();
  });

  it('čekající kniha řekne, kdy poběží další zpracování, a seznam se obnovuje pomaleji', async () => {
    nactiDokumenty.mockResolvedValueOnce(ok(dok('ceka')));
    render(<BibleKnihovna role="spravuje" />);
    expect(await screen.findByText(/Čeká na další běh zpracování — asi v \d{1,2}:17\./)).toBeTruthy();
    expect(obnovy.map((o) => o.ms)).toEqual([OBNOVA_PRI_CEKANI_MS]);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('rozpracovaná čekající kniha (běh skončil dřív) řekne, kolik je hotovo', async () => {
    nactiDokumenty.mockResolvedValueOnce(ok(dok('ceka', prepis(30))));
    render(<BibleKnihovna role="spravuje" />);
    expect(await screen.findByText(/rozpracováno na 30 % — pokračuje v dalším běhu/)).toBeTruthy();
  });

  it('když nic nečeká ani se nezpracovává, nic se samo nenačítá', async () => {
    nactiDokumenty.mockResolvedValueOnce(ok(dok('hotovo', { stran: 10 })));
    render(<BibleKnihovna role="cte" />);
    expect(await screen.findByText('10 stran')).toBeTruthy();
    expect(within(screen.getByRole('listitem')).getByText('Zpracováno')).toBeTruthy();
    expect(obnovy).toEqual([]);
  });
});
