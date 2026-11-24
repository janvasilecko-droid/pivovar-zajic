// AI sládek: chat a hledání v knihách na dvou kartách (sdílí Pivovarská bible i samostatná aplikace /sladek/, R39).
// Chat a hledání mají vlastní testy; tady se hlídá jen to, co přidává tahle skládačka: karty, předání otázky
// a to, komu se nabídne správa knihovny.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

type ChatProps = {
  otevri: (id: string, list: number) => void;
  problem?: { id: string; nazev: string } | null;
  otazkaZvenku?: { text: string; klic: number } | null;
  role?: string | null;
  doKnihovny?: () => void;
};
type HledaniProps = { otevri: (id: string, list: number) => void; pocatecniDotaz?: string; zeptatSe: (q: string) => void };

vi.mock('./BibleChat', () => ({
  BibleChat: (p: ChatProps) => (
    <div data-testid="chat" data-role={String(p.role)} data-problem={p.problem?.id ?? ''} data-otazka={p.otazkaZvenku?.text ?? ''} data-klic={String(p.otazkaZvenku?.klic ?? '')}
      data-knihovna={String(Boolean(p.doKnihovny))} />
  ),
}));
vi.mock('./BibleHledani', () => ({
  BibleHledani: (p: HledaniProps) => (
    <div data-testid="hledani" data-dotaz={p.pocatecniDotaz ?? ''}>
      <button type="button" onClick={() => p.zeptatSe('Co je to rmutování?')}>Zeptat se AI sládka</button>
      <button type="button" onClick={() => p.otevri('11111111-2222-3333-4444-555555555555', 7)}>Otevřít stranu</button>
    </div>
  ),
}));

import { BibleAiSladek, OTAZKA_PROBLEMU } from './BibleAiSladek';

const panelChatu = () => screen.getByTestId('chat').parentElement as HTMLElement;
const panelHledani = () => screen.getByTestId('hledani').parentElement as HTMLElement;
const zalozka = (nazev: string) => screen.getByRole('tab', { name: nazev });

describe('AI sládek: karty Zeptat se a Hledání v knihách', () => {
  it('začíná chatem; druhá karta ukáže hledání a chat zůstane načtený (jen skrytý)', () => {
    render(<BibleAiSladek otevri={vi.fn()} role="spravuje" />);
    expect(zalozka('Zeptat se').getAttribute('aria-selected')).toBe('true');
    expect(zalozka('Hledání v knihách').getAttribute('aria-selected')).toBe('false');
    expect(panelChatu().hidden).toBe(false);
    expect(panelHledani().hidden).toBe(true);
    fireEvent.click(zalozka('Hledání v knihách'));
    expect(zalozka('Hledání v knihách').getAttribute('aria-selected')).toBe('true');
    expect(zalozka('Zeptat se').getAttribute('aria-selected')).toBe('false');
    expect(panelChatu().hidden).toBe(true);
    expect(panelHledani().hidden).toBe(false);
    expect(screen.getByTestId('chat')).toBeTruthy();
  });

  it('s předaným dotazem začne hledáním a předvyplní ho', () => {
    render(<BibleAiSladek otevri={vi.fn()} role="cte" dotazHledani="chmelovar odpar" />);
    expect(zalozka('Hledání v knihách').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('hledani').getAttribute('data-dotaz')).toBe('chmelovar odpar');
    expect(panelChatu().hidden).toBe(true);
  });

  it('bez dotazu hledání nic nepředvyplňuje', () => {
    render(<BibleAiSladek otevri={vi.fn()} role="cte" />);
    expect(screen.getByTestId('hledani').getAttribute('data-dotaz')).toBe('');
  });

  it('analýza problému: chat dostane problém a první otázku, kterou pošle sám', () => {
    render(<BibleAiSladek otevri={vi.fn()} role="spravuje" problem={{ id: 'p1', nazev: 'Pivo málo pění' }} />);
    const chat = screen.getByTestId('chat');
    expect(chat.getAttribute('data-problem')).toBe('p1');
    expect(chat.getAttribute('data-otazka')).toBe(OTAZKA_PROBLEMU);
    expect(chat.getAttribute('data-klic')).toBe('1');
    expect(OTAZKA_PROBLEMU).toMatch(/Najdi možné příčiny tohoto problému/);
  });

  it('bez problému chat žádnou otázku předem nedostane', () => {
    render(<BibleAiSladek otevri={vi.fn()} role="spravuje" />);
    expect(screen.getByTestId('chat').getAttribute('data-otazka')).toBe('');
    expect(screen.getByTestId('chat').getAttribute('data-problem')).toBe('');
  });

  it('„Zeptat se AI sládka“ z hledání přepne na chat a pošle mu otázku; každá další má nový klíč', () => {
    render(<BibleAiSladek otevri={vi.fn()} role="spravuje" dotazHledani="rmutování" />);
    fireEvent.click(screen.getByRole('button', { name: 'Zeptat se AI sládka' }));
    expect(zalozka('Zeptat se').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('chat').getAttribute('data-otazka')).toBe('Co je to rmutování?');
    expect(screen.getByTestId('chat').getAttribute('data-klic')).toBe('1');
    fireEvent.click(zalozka('Hledání v knihách'));
    fireEvent.click(screen.getByRole('button', { name: 'Zeptat se AI sládka' }));
    expect(screen.getByTestId('chat').getAttribute('data-klic')).toBe('2');
  });

  it('klepnutí na stranu v hledání i citaci v chatu otevře knihu přes předanou funkci', () => {
    const otevri = vi.fn();
    render(<BibleAiSladek otevri={otevri} role="spravuje" dotazHledani="x" />);
    fireEvent.click(screen.getByRole('button', { name: 'Otevřít stranu' }));
    expect(otevri).toHaveBeenCalledWith('11111111-2222-3333-4444-555555555555', 7);
  });

  it('správa knihovny („Přidat další knihu“) se nabídne jen přispěvateli a správci, a jen když je kam vést', () => {
    const doKnihovny = vi.fn();
    for (const [role, ocekavano] of [['cte', 'false'], ['prispiva', 'true'], ['spravuje', 'true'], [null, 'false']] as const) {
      const v = render(<BibleAiSladek otevri={vi.fn()} role={role} doKnihovny={doKnihovny} />);
      expect(screen.getByTestId('chat').getAttribute('data-knihovna'), String(role)).toBe(ocekavano);
      v.unmount();
    }
    render(<BibleAiSladek otevri={vi.fn()} role="spravuje" />);
    expect(screen.getByTestId('chat').getAttribute('data-knihovna')).toBe('false');
  });
});
