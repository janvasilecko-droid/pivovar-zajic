// „Z čeho AI sládek čerpá": knihy v chatu (jen vymyšlené názvy — žádný text skutečných knih).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { BibleDokument, Nacteno } from '../../lib/bibleKnihovnaApi';

let nacteno: Nacteno;
vi.mock('../../lib/bibleKnihovnaApi', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/bibleKnihovnaApi')>()),
  nactiDokumenty: () => Promise.resolve(nacteno),
}));

import { BibleKnihyChatu } from './BibleKnihyChatu';

const dok = (id: string, nazev: string, stav: BibleDokument['stav'], extra: Partial<BibleDokument> = {}): BibleDokument => ({
  id, nazev, autor: null, vydani: null, rok: null, isbn: null, jazyk: null, druh: 'kniha', oblasti: [], zdroj: null, soubor_nazev: `${id}.pdf`,
  soubor_velikost: 1, soubor_mime: 'application/pdf', stav, stav_zprava: null, postup: {}, stran_celkem: null, kvalita_ocr: null, licence: null,
  nahral: null, nahral_jmeno: null, created_at: '2026-11-01T00:00:00Z', zpracovano_at: null, ...extra,
});

beforeEach(() => { nacteno = { stav: 'ok', dokumenty: [] }; });

describe('přehled knih v chatu', () => {
  it('ukáže souhrn a po rozbalení zpracované knihy s autorem, rokem a stranami', async () => {
    nacteno = {
      stav: 'ok',
      dokumenty: [
        dok('1', 'Technologie A', 'hotovo', { autor: 'Novák', rok: 2004, jazyk: 'de', stran_celkem: 412 }),
        dok('2', 'Technologie B', 'ke_kontrole', { autor: 'Svoboda', jazyk: 'cs', stran_celkem: 300 }),
      ],
    };
    render(<BibleKnihyChatu />);
    const blok = await screen.findByTestId('knihy-chatu');
    expect(blok.querySelector('summary')?.textContent).toBe('Z čeho AI sládek čerpá: 2 knihy');
    const seznam = screen.getByRole('list', { name: 'Zpracované knihy' });
    expect(Array.from(seznam.querySelectorAll('li')).map((li) => li.textContent)).toEqual([
      'Technologie ANovák · 2004 · němčina · 412 stran',
      'Technologie BSvoboda · čeština · 300 stran',
    ]);
    expect(screen.queryByRole('list', { name: 'Nezpracované knihy' })).toBeNull();
  });

  it('nezpracované knihy jsou zvlášť a výslovně bez odpovědí AI; chyba je vidět', async () => {
    nacteno = { stav: 'ok', dokumenty: [dok('1', 'Hotová', 'hotovo'), dok('2', 'Čekající', 'ceka'), dok('3', 'Rozbitá', 'chyba')] };
    render(<BibleKnihyChatu />);
    const blok = await screen.findByTestId('knihy-chatu');
    expect(blok.querySelector('summary')?.textContent).toBe('Z čeho AI sládek čerpá: 1 kniha · ještě nezpracováno: 2');
    expect(screen.getByText('Zatím nezpracováno — AI z nich ještě neodpovídá')).toBeTruthy();
    const ostatni = screen.getByRole('list', { name: 'Nezpracované knihy' });
    expect(Array.from(ostatni.querySelectorAll('li')).map((li) => li.textContent)).toEqual(['ČekajícíČeká na zpracování', 'RozbitáChyba zpracování']);
    expect(screen.getByText('Chyba zpracování').className).toContain('text-rose-300');
    // Nezpracovaná kniha není mezi těmi, ze kterých AI čerpá.
    const zpracovane = screen.getByRole('list', { name: 'Zpracované knihy' });
    expect(zpracovane.textContent).toBe('Hotová');
  });

  it('žádná zpracovaná kniha: řekne se to, nic se netvrdí', async () => {
    nacteno = { stav: 'ok', dokumenty: [dok('2', 'Čekající', 'zpracovava')] };
    render(<BibleKnihyChatu />);
    expect((await screen.findByTestId('knihy-chatu')).querySelector('summary')?.textContent)
      .toBe('Z čeho AI sládek čerpá: zatím žádná zpracovaná kniha · ještě nezpracováno: 1');
    expect(screen.queryByRole('list', { name: 'Zpracované knihy' })).toBeNull();
  });

  it('prázdná knihovna', async () => {
    render(<BibleKnihyChatu />);
    expect((await screen.findByTestId('knihy-chatu')).querySelector('summary')?.textContent).toBe('Z čeho AI sládek čerpá: knihovna je zatím prázdná');
  });

  it('„Přidat další knihu" jen když chat ví, kam vést (právo nahrávat), a otevře Knihovnu', async () => {
    const doKnihovny = vi.fn();
    const { unmount } = render(<BibleKnihyChatu />);
    await screen.findByTestId('knihy-chatu');
    expect(screen.queryByRole('button', { name: /Přidat další knihu/ })).toBeNull();
    unmount();
    render(<BibleKnihyChatu doKnihovny={doKnihovny} />);
    fireEvent.click(await screen.findByRole('button', { name: /Přidat další knihu/ }));
    expect(doKnihovny).toHaveBeenCalledTimes(1);
  });

  it.each<[string, Nacteno]>([
    ['bez migrace', { stav: 'bez_migrace' }],
    ['chyba načtení', { stav: 'chyba', zprava: 'Spojení nejde.' }],
  ])('%s: blok se tiše vynechá', async (_nazev, vysledek) => {
    nacteno = vysledek;
    const { container } = render(<BibleKnihyChatu />);
    await waitFor(() => expect(container.innerHTML).toBe(''));
    expect(screen.queryByTestId('knihy-chatu')).toBeNull();
  });

});
