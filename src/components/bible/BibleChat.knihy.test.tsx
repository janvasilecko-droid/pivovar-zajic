// AI sládek: přehled knih je součástí chatu (jen vymyšlené názvy — žádný text skutečných knih).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Odpoved, StavChatu } from '../../lib/bibleChatApi';
import type { BibleDokument, Nacteno } from '../../lib/bibleKnihovnaApi';

const ZAPNUTO: Odpoved<StavChatu> = { stav: 'ok', data: { migrace: true, klic: true, dotazy: true, utracenoUsd: 1, chatUsd: 1, chatDotazu: 4, stropUsd: 20, model: 'claude-opus-5-5' } as StavChatu };
vi.mock('../../lib/bibleChatApi', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/bibleChatApi')>()),
  nactiStavChatu: async () => ZAPNUTO,
  nactiKonverzace: async () => ({ stav: 'ok', data: [] }),
}));
vi.mock('../../lib/bibleProvozApi', () => ({ nactiProvoz: async () => ({ stav: 'prazdny' }) }));
vi.mock('../../lib/toast', () => ({ potvrd: async () => true, chyba: () => {} }));
let nacteno: Nacteno;
vi.mock('../../lib/bibleKnihovnaApi', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/bibleKnihovnaApi')>()),
  nactiDokumenty: () => Promise.resolve(nacteno),
}));

import { BibleChat } from './BibleChat';

const dok = (id: string, nazev: string, stav: BibleDokument['stav']): BibleDokument => ({
  id, nazev, autor: null, vydani: null, rok: null, isbn: null, jazyk: null, druh: 'kniha', oblasti: [], zdroj: null, soubor_nazev: `${id}.pdf`,
  soubor_velikost: 1, soubor_mime: 'application/pdf', stav, stav_zprava: null, postup: {}, stran_celkem: null, kvalita_ocr: null, licence: null,
  nahral: null, nahral_jmeno: null, created_at: '2026-11-01T00:00:00Z', zpracovano_at: null,
});

beforeEach(() => { nacteno = { stav: 'ok', dokumenty: [dok('1', 'Kniha A', 'hotovo'), dok('2', 'Kniha B', 'hotovo'), dok('3', 'Kniha C', 'ceka')] }; });

describe('AI sládek: z čeho čerpá', () => {
  it('chat ukazuje přehled knih nad otázkou a odkaz na přidání další knihy', async () => {
    const doKnihovny = vi.fn();
    render(<BibleChat otevri={() => {}} doKnihovny={doKnihovny} />);
    const blok = await screen.findByTestId('knihy-chatu');
    expect(blok.querySelector('summary')?.textContent).toBe('Z čeho AI sládek čerpá: 2 knihy · ještě nezpracováno: 1');
    // Přehled je nad otázkou, ne pod ní.
    const otazka = screen.getByLabelText('Otázka pro AI sládka');
    expect(blok.compareDocumentPosition(otazka) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Přidat další knihu/ }));
    expect(doKnihovny).toHaveBeenCalledTimes(1);
  });

  it('čtenář (chat bez odkazu do knihovny) knihy vidí, ale přidávat je nemůže', async () => {
    render(<BibleChat otevri={() => {}} role="cte" />);
    await screen.findByTestId('knihy-chatu');
    expect(screen.queryByRole('button', { name: /Přidat další knihu/ })).toBeNull();
  });

  it('knihovna se nenačte: chat funguje bez přehledu', async () => {
    nacteno = { stav: 'chyba', zprava: 'Spojení nejde.' };
    render(<BibleChat otevri={() => {}} />);
    await screen.findByLabelText('Otázka pro AI sládka');
    expect(screen.queryByTestId('knihy-chatu')).toBeNull();
  });
});
