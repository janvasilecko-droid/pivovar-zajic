import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { BibleDokument, Nacteno } from '../../lib/bibleKnihovnaApi';
import {
  OBNOVA_MIMO_BEH_MS, OBNOVA_PRI_CEKANI_MS, OBNOVA_PRI_ZPRACOVANI_MS, type StavDokumentu, type PostupZpracovani,
} from '../../lib/bibleKnihovna';

vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1', email: 'u@pivovar.cz' }, profile: { role: 'admin' } }) }));
const nactiDokumenty = vi.fn<() => Promise<Nacteno>>();
const smazDokument = vi.fn<(id: string) => Promise<string | null>>();
vi.mock('../../lib/bibleKnihovnaApi', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/bibleKnihovnaApi')>()),
  nactiDokumenty: () => nactiDokumenty(),
  smazDokument: (id: string) => smazDokument(id),
}));

import type { BibleRole } from '../../lib/bibleOpravneni';
import { BibleKnihovna } from './BibleKnihovna';

const dok = (stav: StavDokumentu, postup: PostupZpracovani = {}): BibleDokument => ({
  id: 'd1', nazev: 'Technologie piva', autor: null, vydani: null, rok: null, isbn: null, jazyk: 'de', druh: 'kniha',
  oblasti: [], zdroj: null, soubor_nazev: 'kunze.pdf', soubor_velikost: 1000, soubor_mime: 'application/pdf',
  stav, stav_zprava: null, postup, stran_celkem: null, kvalita_ocr: null, licence: null, nahral: 'u1',
  nahral_jmeno: 'Honza', created_at: '2026-10-31T10:00:00Z', zpracovano_at: null,
});
const ok = (...dokumenty: BibleDokument[]): Nacteno => ({ stav: 'ok', dokumenty });
const prepis = (hotovo: number) => ({ prubeh: { faze: 'prepis', hotovo, celkem: 100, ocr_hotovo: hotovo - 26, ocr_celkem: 74 } });

// Obnovovací časovač knihovny se zachytí a pustí ručně (každý má vlastní id,
// ať je vidět, který se zrušil); ostatní časovače (čekání testovací
// knihovny apod.) běží normálně.
type Obnova = { fn: () => void; ms: number; id: number; zrusena: boolean };
const MS_OBNOVY = [OBNOVA_PRI_ZPRACOVANI_MS, OBNOVA_PRI_CEKANI_MS, OBNOVA_MIMO_BEH_MS];
let obnovy: Obnova[] = [];
beforeEach(() => {
  obnovy = [];
  nactiDokumenty.mockReset();
  smazDokument.mockReset();
  // Jen Date: 31. 10. 2026 19:30 v Praze (18:30 UTC), 13 minut po
  // plánovaném běhu zpracování (cron 17 */3 * * * v UTC).
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-31T18:30:00Z'));
  const puvodniSet = globalThis.setInterval;
  const puvodniClear = globalThis.clearInterval;
  vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => void, ms?: number, ...a: unknown[]) => {
    if (ms !== undefined && MS_OBNOVY.includes(ms)) {
      const o: Obnova = { fn, ms, id: 987_000 + obnovy.length, zrusena: false };
      obnovy.push(o);
      return o.id as unknown as ReturnType<typeof setInterval>;
    }
    return puvodniSet(fn, ms, ...a);
  }) as typeof setInterval);
  vi.spyOn(globalThis, 'clearInterval').mockImplementation(((id?: Parameters<typeof clearInterval>[0]) => {
    const o = obnovy.find((x) => (x.id as unknown) === id);
    if (o) o.zrusena = true;
    else puvodniClear(id);
  }) as typeof clearInterval);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Jediná běžící obnova seznamu (zrušené časovače se nepočítají). */
function obnova(): Obnova {
  const bezi = obnovy.filter((o) => !o.zrusena);
  expect(bezi).toHaveLength(1);
  return bezi[0];
}
const tikni = () => act(async () => { obnova().fn(); });

/**
 * Vykreslí knihovnu a první načtení doručí uvnitř act — efekty (časovač
 * obnovy) tak proběhnou hned, ne až někdy během čekání findBy… (jinak by
 * kontrola časovače závisela na plánovači Reactu a občas selhala).
 */
async function vykresli(role: BibleRole) {
  await act(async () => { render(<BibleKnihovna role={role} />); });
}

describe('Knihovna — procenta zpracování', () => {
  it('ukáže procenta ve štítku, fázi a pruh; sama se obnoví a procenta přibudou; po dokončení obnovování skončí', async () => {
    nactiDokumenty.mockResolvedValueOnce(ok(dok('zpracovava', prepis(46))));
    await vykresli('spravuje');
    expect(screen.getByText('Zpracovává se · 46 %')).toBeTruthy();
    expect(screen.getByText('46 % · přepisuje skeny (20 z 74 stran)')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Zpracování knihy' }).getAttribute('aria-valuenow')).toBe('46');
    expect(obnova().ms).toBe(OBNOVA_PRI_ZPRACOVANI_MS);

    nactiDokumenty.mockResolvedValueOnce(ok(dok('zpracovava', prepis(80))));
    await tikni();
    expect(await screen.findByText('Zpracovává se · 80 %')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('80');

    nactiDokumenty.mockResolvedValueOnce(ok(dok('hotovo', { stran: 100, kapitol: 5, pasazi: 300 })));
    await tikni();
    expect(await screen.findByText('100 stran · 5 kapitol · 300 pasáží')).toBeTruthy();
    expect(within(screen.getByRole('listitem')).getByText('Zpracováno')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(obnovy.length).toBeGreaterThan(0);
    expect(obnovy.every((o) => o.zrusena)).toBe(true);
  });

  it('dokud procenta nejsou známá (stahování), pruh čtečce nehlásí 0 %, ale co se děje', async () => {
    nactiDokumenty.mockResolvedValueOnce(ok(dok('zpracovava', { prubeh: { faze: 'stahovani' } })));
    await vykresli('cte');
    const pruh = screen.getByRole('progressbar', { name: 'Zpracování knihy' });
    expect(pruh.hasAttribute('aria-valuenow')).toBe(false);
    expect(pruh.getAttribute('aria-valuetext')).toBe('stahuje soubor');
    expect(within(screen.getByRole('listitem')).getByText('Zpracovává se')).toBeTruthy();
  });

  it('chyba sítě při obnovení nechá poslední načtený stav (žádné „Načítám…" ani chybové okno)', async () => {
    nactiDokumenty.mockResolvedValueOnce(ok(dok('zpracovava', prepis(46))));
    await vykresli('spravuje');
    expect(screen.getByText('Zpracovává se · 46 %')).toBeTruthy();
    nactiDokumenty.mockResolvedValueOnce({ stav: 'chyba', zprava: 'Spojení se přerušilo.' });
    await tikni();
    expect(nactiDokumenty).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Zpracovává se · 46 %')).toBeTruthy();
    expect(screen.queryByText(/nepodařilo načíst/)).toBeNull();
    expect(screen.queryByText('Načítám knihovnu…')).toBeNull();
  });

  it('obnova, která odešla před smazáním a dorazí až po něm, smazanou knihu nevrátí', async () => {
    nactiDokumenty.mockResolvedValueOnce(ok(dok('zpracovava', prepis(46))));
    smazDokument.mockResolvedValue(null);
    await vykresli('spravuje');
    expect(screen.getByText('Zpracovává se · 46 %')).toBeTruthy();

    let dorucit!: (n: Nacteno) => void;
    nactiDokumenty.mockReturnValueOnce(new Promise<Nacteno>((r) => { dorucit = r; }));
    await tikni();
    fireEvent.click(screen.getByRole('button', { name: 'Smazat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ano, smazat' }));
    expect(await screen.findByText(/V knihovně zatím nic není/)).toBeTruthy();
    expect(smazDokument).toHaveBeenCalledWith('d1');

    await act(async () => { dorucit(ok(dok('zpracovava', prepis(50)))); });
    expect(screen.queryByText('Technologie piva')).toBeNull();
    expect(screen.getByText(/V knihovně zatím nic není/)).toBeTruthy();
  });

  it('při otevřeném nahrávání se seznam neobnovuje (právě nahrávaný soubor by vypadal jako přerušený)', async () => {
    nactiDokumenty.mockResolvedValue(ok(dok('zpracovava', prepis(46))));
    await vykresli('spravuje');
    expect(screen.getByText('Zpracovává se · 46 %')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Nahrát knihy' }));
    await tikni();
    expect(nactiDokumenty).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Zavřít' }));
    await tikni();
    expect(nactiDokumenty).toHaveBeenCalledTimes(2);
  });

  it('obnova, která už letí, se po otevření úpravy popisu nezapíše (rozepsaný text zůstane)', async () => {
    nactiDokumenty.mockResolvedValueOnce(ok(dok('zpracovava', prepis(46))));
    await vykresli('spravuje');
    let dorucit!: (n: Nacteno) => void;
    nactiDokumenty.mockReturnValueOnce(new Promise<Nacteno>((r) => { dorucit = r; }));
    await tikni();
    fireEvent.click(screen.getByRole('button', { name: 'Upravit popis' }));
    await act(async () => { dorucit(ok(dok('hotovo', { stran: 100 }))); });
    expect(screen.getByRole('button', { name: 'Uložit popis' })).toBeTruthy();
    expect(screen.getByText('Zpracovává se · 46 %')).toBeTruthy();
  });

  it('obnova, která už letí, se po otevření nahrávání nezapíše (nahrávaný soubor nevypadá jako přerušený)', async () => {
    nactiDokumenty.mockResolvedValueOnce(ok(dok('zpracovava', prepis(46))));
    await vykresli('spravuje');
    let dorucit!: (n: Nacteno) => void;
    nactiDokumenty.mockReturnValueOnce(new Promise<Nacteno>((r) => { dorucit = r; }));
    await tikni();
    fireEvent.click(screen.getByRole('button', { name: 'Nahrát knihy' }));
    await act(async () => { dorucit(ok(dok('zpracovava', prepis(46)), { ...dok('nahrava'), id: 'd9', nazev: 'Nová kniha' })); });
    expect(screen.queryByText('Nová kniha')).toBeNull();
    expect(screen.queryByText(/Soubor ještě nedorazil celý/)).toBeNull();
  });

  it('při rozepsaném popisu se seznam neobnovuje (s filtrem by se karta i s textem ztratila)', async () => {
    nactiDokumenty.mockResolvedValue(ok(dok('zpracovava', prepis(46))));
    await vykresli('spravuje');
    expect(screen.getByText('Zpracovává se · 46 %')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Upravit popis' }));
    await tikni();
    expect(nactiDokumenty).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Zrušit' }));
    await tikni();
    expect(nactiDokumenty).toHaveBeenCalledTimes(2);
  });

  it('na skryté záložce se nenačítá; po návratu na ni se seznam obnoví hned', async () => {
    nactiDokumenty.mockResolvedValue(ok(dok('zpracovava', prepis(46))));
    await vykresli('cte');
    expect(screen.getByText('Zpracovává se · 46 %')).toBeTruthy();
    let skryta = true;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => skryta });
    try {
      await tikni();
      expect(nactiDokumenty).toHaveBeenCalledTimes(1);

      skryta = false;
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
      expect(nactiDokumenty).toHaveBeenCalledTimes(2);
    } finally {
      Reflect.deleteProperty(document, 'hidden');
    }
  });

  it('čekající kniha těsně po plánovaném běhu čeká na něj (GitHub ho zdrží) a seznam se obnovuje po minutě', async () => {
    nactiDokumenty.mockResolvedValueOnce(ok(dok('ceka')));
    await vykresli('spravuje');
    expect(screen.getByText('Čeká na běh zpracování z 19:17 — GitHub ho občas o pár desítek minut zdrží.')).toBeTruthy();
    expect(obnova().ms).toBe(OBNOVA_PRI_CEKANI_MS);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('kniha nahraná až po plánovaném čase čeká na další běh (ten z 19:17 už nejspíš proběhl)', async () => {
    nactiDokumenty.mockResolvedValueOnce(ok({ ...dok('ceka'), created_at: '2026-10-31T18:25:00Z' }));
    await vykresli('spravuje');
    expect(screen.getByText('Čeká na další běh zpracování — asi v 22:17.')).toBeTruthy();
  });

  it('mimo okno běhu ukáže čas dalšího běhu a seznam se obnovuje jen po 10 minutách', async () => {
    vi.setSystemTime(new Date('2026-10-31T20:30:00Z'));
    nactiDokumenty.mockResolvedValueOnce(ok(dok('ceka')));
    await vykresli('spravuje');
    expect(screen.getByText('Čeká na další běh zpracování — asi v 22:17.')).toBeTruthy();
    expect(obnova().ms).toBe(OBNOVA_MIMO_BEH_MS);
  });

  it('když se jiná kniha právě zpracovává, čekající přijde na řadu ve stejném běhu', async () => {
    const jina = { ...dok('zpracovava', prepis(46)), id: 'd2', nazev: 'Sladovnictví' };
    nactiDokumenty.mockResolvedValueOnce(ok(jina, dok('ceka')));
    await vykresli('spravuje');
    expect(screen.getByText('Čeká ve frontě — přijde na řadu v tomhle běhu, až doběhne rozpracovaná kniha.')).toBeTruthy();
    expect(obnova().ms).toBe(OBNOVA_PRI_ZPRACOVANI_MS);
  });

  it('rozpracovaná čekající kniha (běh skončil dřív) řekne, kolik skenů je přepsaných', async () => {
    nactiDokumenty.mockResolvedValueOnce(ok(dok('ceka', prepis(30))));
    await vykresli('spravuje');
    expect(screen.getByText(/Už přepsáno 4 z 74 naskenovaných stran — znovu se neplatí\./)).toBeTruthy();
    expect(screen.queryByText(/v dalším běhu/)).toBeNull();   // kdy přijde na řadu, říká jen první věta
  });

  it('odložená kniha bez jediného přepsaného skenu nestraší procenty z minulého běhu', async () => {
    nactiDokumenty.mockResolvedValueOnce(ok(dok('ceka', { prubeh: { faze: 'prepis', hotovo: 325, celkem: 327, ocr_hotovo: 0, ocr_celkem: 2 } })));
    await vykresli('spravuje');
    expect(screen.getByText(/^Čeká na běh zpracování z 19:17/)).toBeTruthy();
    expect(screen.queryByText(/přepsáno|rozpracováno|\d+ %/)).toBeNull();
    expect(within(screen.getByRole('listitem')).getByText('Čeká na zpracování')).toBeTruthy();
  });

  it('když nic nečeká ani se nezpracovává, nic se samo nenačítá', async () => {
    nactiDokumenty.mockResolvedValueOnce(ok(dok('hotovo', { stran: 10 })));
    await vykresli('cte');
    expect(screen.getByText('10 stran')).toBeTruthy();
    expect(within(screen.getByRole('listitem')).getByText('Zpracováno')).toBeTruthy();
    expect(obnovy).toEqual([]);
  });
});
