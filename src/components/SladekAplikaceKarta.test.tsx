import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const uspech = vi.fn();
const chyba = vi.fn();
vi.mock('../lib/toast', () => ({ uspech: (...a: unknown[]) => uspech(...a), chyba: (...a: unknown[]) => chyba(...a) }));

import { SladekAplikaceKarta } from './SladekAplikaceKarta';

const adresa = () => `${window.location.origin}/sladek/`;
const schranka = (writeText: (t: string) => Promise<void>) => Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

beforeEach(() => { uspech.mockReset(); chyba.mockReset(); });
afterEach(() => { Reflect.deleteProperty(navigator, 'clipboard'); });

describe('odkaz na samostatnou aplikaci AI sládek', () => {
  it('plná karta (Nastavení): nadpis, postup instalace a odkaz na /sladek/ v nové záložce', () => {
    render(<SladekAplikaceKarta />);
    expect(screen.getByRole('heading', { name: /AI sládek — samostatná aplikace/ })).toBeTruthy();
    const odkaz = screen.getByRole('link', { name: 'Otevřít AI sládka' });
    expect(odkaz.getAttribute('href')).toBe(adresa());
    expect(odkaz.getAttribute('target')).toBe('_blank');
    expect(odkaz.getAttribute('rel')).toContain('noreferrer');
    expect(screen.getByText(/Přidat na plochu/)).toBeTruthy();
    expect(screen.getByText(/Přihlašuje se zvlášť/)).toBeTruthy();
  });

  it('kompaktní řádek (nad chatem): jen věta a dvě tlačítka, bez nadpisu a postupu', () => {
    render(<SladekAplikaceKarta kompaktni />);
    expect(screen.getByRole('region', { name: 'AI sládek jako samostatná aplikace' })).toBeTruthy();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByText(/Přidat na plochu/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Otevřít AI sládka' }).getAttribute('href')).toBe(adresa());
    expect(screen.getByRole('button', { name: 'Zkopírovat odkaz' })).toBeTruthy();
  });

  it('Zkopírovat odkaz zapíše adresu do schránky a ohlásí to', async () => {
    const zapis = vi.fn().mockResolvedValue(undefined);
    schranka(zapis);
    render(<SladekAplikaceKarta />);
    fireEvent.click(screen.getByRole('button', { name: 'Zkopírovat odkaz' }));
    await waitFor(() => expect(uspech).toHaveBeenCalledWith('Odkaz na AI sládka je zkopírovaný.'));
    expect(zapis).toHaveBeenCalledWith(adresa());
    expect(chyba).not.toHaveBeenCalled();
  });

  it('když schránka není k dispozici, napíše adresu, ať jde opsat', async () => {
    schranka(vi.fn().mockRejectedValue(new Error('zakázáno')));
    render(<SladekAplikaceKarta kompaktni />);
    fireEvent.click(screen.getByRole('button', { name: 'Zkopírovat odkaz' }));
    await waitFor(() => expect(chyba).toHaveBeenCalledWith(`Odkaz se nepodařilo zkopírovat — je to ${adresa()}`));
    expect(uspech).not.toHaveBeenCalled();
  });
});
