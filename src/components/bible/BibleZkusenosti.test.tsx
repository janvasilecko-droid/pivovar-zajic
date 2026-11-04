import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Zkusenost, ZkusenostVstup } from '../../lib/bibleZkusenostiApi';

// Jen vymyšlené věty — žádný text skutečných knih (repo je veřejné).
const nactiZkusenosti = vi.fn();
const zapisZkusenost = vi.fn<(z: ZkusenostVstup) => Promise<{ stav: 'ok' } | { stav: 'chyba'; zprava: string }>>();
const upravZkusenost = vi.fn<(id: string, z: ZkusenostVstup) => Promise<{ stav: 'ok' }>>();
const smazZkusenost = vi.fn<(id: string) => Promise<{ stav: 'ok' }>>();
vi.mock('../../lib/bibleZkusenostiApi', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/bibleZkusenostiApi')>()),
  nactiZkusenosti: (f: unknown) => nactiZkusenosti(f),
  zapisZkusenost: (z: ZkusenostVstup) => zapisZkusenost(z),
  upravZkusenost: (id: string, z: ZkusenostVstup) => upravZkusenost(id, z),
  smazZkusenost: (id: string) => smazZkusenost(id),
}));
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ profile: { id: 'ja' } }) }));
vi.mock('../../lib/toast', () => ({ oznam: vi.fn(), potvrd: vi.fn(async () => true) }));

import { BibleZkusenosti } from './BibleZkusenosti';

const zk = (navic: Partial<Zkusenost> = {}): Zkusenost => ({
  id: 'z1', typ: 'reseni_problemu', nazev: 'Přepěnění varu', text: 'Pomohlo snížit výkon.', oblasti: ['F'], uroven: 4,
  zdroj: 'vlastní provoz', zapsal: 'ja', zapsalJmeno: 'Honza', vytvoreno: '2026-11-03T10:00:00Z', upraveno: null, ...navic,
});

beforeEach(() => {
  nactiZkusenosti.mockReset().mockResolvedValue({ stav: 'ok', zkusenosti: [zk(), zk({ id: 'z2', nazev: 'Cizí postup', uroven: 3, zapsal: 'jiny', typ: 'postup' })], migrace: true });
  zapisZkusenost.mockReset().mockResolvedValue({ stav: 'ok' });
  upravZkusenost.mockReset().mockResolvedValue({ stav: 'ok' });
  smazZkusenost.mockReset().mockResolvedValue({ stav: 'ok' });
});

describe('zkušenosti sládků', () => {
  it('ukáže zkušenosti s úrovní důvěryhodnosti', async () => {
    render(<BibleZkusenosti role="cte" />);
    await waitFor(() => expect(screen.getByText('Přepěnění varu')).toBeTruthy());
    expect(screen.getByText(/Úroveň 4 · Zkušenost jednoho sládka/)).toBeTruthy();
    expect(screen.getByText(/Úroveň 3 · Opakovaně ověřená provozní zkušenost/)).toBeTruthy();
    expect(screen.getByText('Řešení problému')).toBeTruthy();
  });

  it('čtenář nemůže psát, upravovat ani mazat', async () => {
    render(<BibleZkusenosti role="cte" />);
    await waitFor(() => expect(screen.getByText('Přepěnění varu')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Zapsat zkušenost/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Upravit/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Smazat/ })).toBeNull();
  });

  it('přispěvatel upraví a smaže jen svoje, ověřené cizí ne', async () => {
    render(<BibleZkusenosti role="prispiva" />);
    await waitFor(() => expect(screen.getByText('Přepěnění varu')).toBeTruthy());
    expect(screen.getAllByRole('button', { name: /Upravit/ })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /Smazat/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Smazat/ }));
    await waitFor(() => expect(smazZkusenost).toHaveBeenCalledWith('z1'));
  });

  it('správce smí všechno a nastaví i ověřenou úroveň 1–3', async () => {
    render(<BibleZkusenosti role="spravuje" />);
    await waitFor(() => expect(screen.getByText('Přepěnění varu')).toBeTruthy());
    expect(screen.getAllByRole('button', { name: /Smazat/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /Zapsat zkušenost/ }));
    const formular = screen.getByRole('form', { name: 'Zápis zkušenosti' });
    expect(within(formular).getAllByRole('option', { name: /^[1-5] ·/ })).toHaveLength(5);
  });

  it('přispěvatel v formuláři nabídne jen úroveň 4 a 5 a zapíše novou zkušenost', async () => {
    render(<BibleZkusenosti role="prispiva" />);
    await waitFor(() => expect(screen.getByText('Přepěnění varu')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Zapsat zkušenost/ }));
    const formular = screen.getByRole('form', { name: 'Zápis zkušenosti' });
    expect(within(formular).getAllByRole('option', { name: /^[1-5] ·/ })).toHaveLength(2);
    const ulozit = within(formular).getByRole('button', { name: 'Uložit zkušenost' }) as HTMLButtonElement;
    expect(ulozit.disabled).toBe(true);
    fireEvent.change(within(formular).getByLabelText(/Název/), { target: { value: 'Nový postup' } });
    fireEvent.change(within(formular).getByLabelText(/Co se stalo/), { target: { value: 'Funguje to.' } });
    fireEvent.click(within(formular).getByRole('button', { name: 'D' }));
    expect(ulozit.disabled).toBe(false);
    fireEvent.click(ulozit);
    await waitFor(() => expect(zapisZkusenost).toHaveBeenCalledWith({
      typ: 'provozni_zkusenost', nazev: 'Nový postup', text: 'Funguje to.', oblasti: ['D'], uroven: 4, zdroj: '',
    }));
  });

  it('hledání a filtry pošlou dotaz, oblast i důvěryhodnost', async () => {
    render(<BibleZkusenosti role="cte" />);
    await waitFor(() => expect(nactiZkusenosti).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Hledat ve zkušenostech'), { target: { value: 'pěnění' } });
    fireEvent.change(screen.getByLabelText('Oblast'), { target: { value: 'F' } });
    fireEvent.change(screen.getByLabelText('Důvěryhodnost'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Hledat/ }));
    await waitFor(() => expect(nactiZkusenosti).toHaveBeenLastCalledWith({ dotaz: 'pěnění', oblast: 'F', nejhorsi: 3 }));
  });

  it('bez migrace a při chybě řekne, co dál', async () => {
    nactiZkusenosti.mockResolvedValue({ stav: 'ok', zkusenosti: [], migrace: false });
    const { unmount } = render(<BibleZkusenosti role="cte" />);
    await waitFor(() => expect(screen.getByText(/čekají na migraci databáze bible 20261104000000_bible_zkusenosti/)).toBeTruthy());
    unmount();
    nactiZkusenosti.mockResolvedValue({ stav: 'nenasazeno', zprava: 'Zkušenosti se právě nasazují — zkus to za pár minut.' });
    render(<BibleZkusenosti role="cte" />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('právě nasazují'));
  });
});
