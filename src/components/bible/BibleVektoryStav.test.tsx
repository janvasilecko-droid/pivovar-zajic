// Správa znalostí: stav hledání podle významu (R38). Jen vymyšlená čísla.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { StavVektoru } from '../../lib/bibleKnihovnaApi';

type Vysledek = { stav: StavVektoru } | { chyba: string; bezMigrace: boolean };
let vysledek: Vysledek;
const nacti = vi.fn(async () => vysledek);
vi.mock('../../lib/bibleKnihovnaApi', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/bibleKnihovnaApi')>()),
  nactiStavVektoru: () => nacti(),
}));

import { BibleVektoryStav } from './BibleVektoryStav';

const stav = (pasazi: number, sVektorem: number, klic = true): Vysledek => ({ stav: { pasazi, sVektorem, klic, model: 'text-embedding-3-large' } });

beforeEach(() => { nacti.mockClear(); });

describe('stav hledání podle významu ve Správě znalostí', () => {
  it('při doplňování ukáže počty a odkaz na ruční spuštění zpracování knih', async () => {
    vysledek = stav(40000, 1200);
    render(<BibleVektoryStav />);
    expect(screen.getByText('Načítám stav hledání podle významu…')).toBeTruthy();
    expect(await screen.findByText('Vektory se doplňují: 1 200 z 40 000 pasáží (3 %).')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Hledání podle významu' })).toBeTruthy();
    const odkaz = screen.getByRole('link', { name: /zpracování knih → Run workflow/ });
    expect(odkaz.getAttribute('href')).toBe('https://github.com/janvasilecko-droid/pivovar-zajic/actions/workflows/bible-zpracovani.yml');
    expect(odkaz.getAttribute('target')).toBe('_blank');
    expect(odkaz.getAttribute('rel')).toBe('noopener noreferrer');
    expect(nacti).toHaveBeenCalledTimes(1);
  });

  it('hotovo: zapnuté, bez odkazu na spuštění', async () => {
    vysledek = stav(500, 500);
    render(<BibleVektoryStav />);
    const text = await screen.findByText('Hledání podle významu je zapnuté: všech 500 pasáží má vektor.');
    expect(text.className).toContain('text-emerald-300');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('bez migrace řekne, kterou pustit; bez klíče řekne, co chybí', async () => {
    vysledek = { chyba: 'x', bezMigrace: true };
    const { unmount } = render(<BibleVektoryStav />);
    expect(await screen.findByText(/čeká na migraci 20261124000000_bible_vektory/)).toBeTruthy();
    unmount();
    vysledek = stav(40000, 0, false);
    render(<BibleVektoryStav />);
    expect(await screen.findByText(/chybí klíč OpenAI \(řádek OPENAI_API_KEY v app_secrets hlavní appky\)/)).toBeTruthy();
    expect(screen.queryByRole('link')).not.toBeNull(); // pasáže čekají, takže ruční spuštění dává smysl
  });
});
