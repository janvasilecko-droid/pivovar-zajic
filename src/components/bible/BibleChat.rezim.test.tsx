// AI sládek: přepínač režimu odpovědí „Sládek“ / „Jen z knih a dat“ (R37).
// Jen vymyšlené věty — žádný text skutečných knih (repo je veřejné).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Odpoved, StavChatu, UdalostChatu } from '../../lib/bibleChatApi';

const ZAPNUTO: Odpoved<StavChatu> = { stav: 'ok', data: { migrace: true, klic: true, dotazy: true, utracenoUsd: 1, chatUsd: 1, chatDotazu: 4, stropUsd: 20, model: 'claude-opus-5-5' } as StavChatu };
const zeptejSe = vi.fn<(p: unknown, na: (u: UdalostChatu) => void) => Promise<unknown>>();
vi.mock('../../lib/bibleChatApi', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/bibleChatApi')>()),
  nactiStavChatu: async () => ZAPNUTO,
  nactiKonverzace: async () => ({ stav: 'ok', data: [] }),
  zeptejSe: (p: never, na: never) => zeptejSe(p, na),
}));
vi.mock('../../lib/bibleProvozApi', () => ({ nactiProvoz: async () => ({ stav: 'prazdny' }) }));
vi.mock('../../lib/toast', () => ({ potvrd: async () => true, chyba: () => {} }));

import { BibleChat, KLIC_REZIM } from './BibleChat';
import { nactiJson, ulozJson } from '../../lib/uloziste';

const pole = () => screen.getByLabelText('Otázka pro AI sládka') as HTMLTextAreaElement;
const radio = (nazev: RegExp) => screen.getByRole('radio', { name: nazev }) as HTMLInputElement;
const internet = () => screen.getByRole('checkbox', { name: /Hledat i na internetu/ }) as HTMLInputElement;
const odkazClaude = () => decodeURIComponent((screen.getByRole('link', { name: /Zeptat se v Claude/ }) as HTMLAnchorElement).getAttribute('href') ?? '');

async function otevri() {
  render(<BibleChat otevri={() => {}} />);
  await screen.findByText(/Útrata za AI/);
}

beforeEach(() => {
  zeptejSe.mockReset();
  localStorage.clear();
});

describe('přepínač režimu odpovědí', () => {
  it('ve výchozím stavu je zvolený Sládek, přísná poznámka se neukazuje a internet jde zapnout', async () => {
    await otevri();
    expect(screen.getByRole('group', { name: 'Režim odpovědí' })).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(radio(/^Sládek/).checked).toBe(true);
    expect(radio(/^Jen z knih a dat/).checked).toBe(false);
    expect(screen.queryByText(/Přísný režim:/)).toBeNull();
    expect(internet().disabled).toBe(false);
  });

  it('Jen z knih a dat: poznámka, internet je vypnutý a nejde zapnout, volba se zapamatuje', async () => {
    await otevri();
    fireEvent.click(internet());
    expect(internet().checked).toBe(true);
    fireEvent.click(radio(/^Jen z knih a dat/));
    expect(radio(/^Jen z knih a dat/).checked).toBe(true);
    expect(radio(/^Sládek/).checked).toBe(false);
    expect(screen.getByRole('note').textContent).toMatch(/Přísný režim: AI sládek odpovídá jen z knih a dat appky/);
    expect(screen.getByRole('note').textContent).toMatch(/internet nehledá; když to v datech není, řekne to/);
    expect(internet().disabled).toBe(true);
    expect(internet().checked).toBe(false);
    expect(nactiJson(KLIC_REZIM, 'sladek')).toBe('knihy');
  });

  it('po návratu na Sládka se internet zase nabídne (a zůstane zaškrtnutý, jak byl)', async () => {
    await otevri();
    fireEvent.click(internet());
    fireEvent.click(radio(/^Jen z knih a dat/));
    fireEvent.click(radio(/^Sládek/));
    expect(screen.queryByText(/Přísný režim:/)).toBeNull();
    expect(internet().disabled).toBe(false);
    expect(internet().checked).toBe(true);
    expect(nactiJson(KLIC_REZIM, 'x')).toBe('sladek');
  });

  it('zapamatovaný přísný režim platí hned po otevření; poškozená nebo cizí hodnota = výchozí Sládek', async () => {
    ulozJson(KLIC_REZIM, 'knihy');
    const { unmount } = render(<BibleChat otevri={() => {}} />);
    await screen.findByText(/Útrata za AI/);
    expect(radio(/^Jen z knih a dat/).checked).toBe(true);
    expect(internet().disabled).toBe(true);
    unmount();
    for (const spatna of ['prisny', 1, null, ['knihy']]) {
      ulozJson(KLIC_REZIM, spatna);
      const r = render(<BibleChat otevri={() => {}} />);
      await screen.findByText(/Útrata za AI/);
      expect(radio(/^Sládek/).checked, JSON.stringify(spatna)).toBe(true);
      r.unmount();
    }
  });
});

describe('režim v otázce', () => {
  it('přísný režim jde do API s internetem vypnutým, i když byl před přepnutím zapnutý', async () => {
    zeptejSe.mockResolvedValue({ ok: true });
    await otevri();
    fireEvent.click(internet());
    fireEvent.click(radio(/^Jen z knih a dat/));
    fireEvent.change(pole(), { target: { value: 'Jak dlouho trvá hlavní kvašení?' } });
    fireEvent.click(screen.getByRole('button', { name: /Odpovědět tady/ }));
    await waitFor(() => expect(zeptejSe).toHaveBeenCalledTimes(1));
    expect(zeptejSe.mock.calls[0][0]).toMatchObject({ otazka: 'Jak dlouho trvá hlavní kvašení?', web: false, rezim: 'knihy' });
  });

  it('výchozí režim jde do API jako „sladek“ a internet podle zaškrtnutí', async () => {
    zeptejSe.mockResolvedValue({ ok: true });
    await otevri();
    fireEvent.click(internet());
    fireEvent.change(pole(), { target: { value: 'Jak dlouho trvá hlavní kvašení?' } });
    fireEvent.click(screen.getByRole('button', { name: /Odpovědět tady/ }));
    await waitFor(() => expect(zeptejSe).toHaveBeenCalledTimes(1));
    expect(zeptejSe.mock.calls[0][0]).toMatchObject({ web: true, rezim: 'sladek' });
  });

  it('odkaz do aplikace Claude nese zadání podle režimu', async () => {
    await otevri();
    fireEvent.change(pole(), { target: { value: 'Jak dlouho trvá hlavní kvašení?' } });
    expect(odkazClaude()).toContain('normální chatbot');
    expect(odkazClaude()).toContain('hledej i na internetu');
    expect(odkazClaude()).not.toContain('REŽIM ODPOVĚDÍ: JEN Z KNIH A DAT');
    fireEvent.click(radio(/^Jen z knih a dat/));
    expect(odkazClaude()).toContain('REŽIM ODPOVĚDÍ: JEN Z KNIH A DAT');
    expect(odkazClaude()).not.toContain('hledej i na internetu');
    expect(odkazClaude()).not.toContain('normální chatbot');
    expect(odkazClaude().endsWith('Otázka: Jak dlouho trvá hlavní kvašení?')).toBe(true);
  });
});
