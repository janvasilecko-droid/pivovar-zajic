// Přidat zboží dlaždicemi (10. 10. 2026): skupiny → dlaždice zboží → „Přidat vybrané".
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PridatZboziDlazdice } from './PridatZboziDlazdice';
import type { DataObchodu } from '../../lib/obchodData';

const pridejZboziZDlazdic = vi.fn().mockResolvedValue(null);
vi.mock('../../lib/obchodData', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/obchodData')>()),
  pridejZboziZDlazdic: (...a: unknown[]) => pridejZboziZDlazdic(...a),
}));

const piva = [
  { id: 'b12s', name: '12° Světlá', degree: '12°' }, { id: 'b10', name: '10° Desítka', degree: '10°' },
  { id: 'b12t', name: '12° Tmavá', degree: '12°' },
];
const obaly = [
  { id: 'l05', label: 'Lahve 0.5l', kind: 'bottle', volume_l: 0.5 },
  { id: 'k30', label: 'KEG 30l', kind: 'keg', volume_l: 30 },
];
const data = (p: Partial<DataObchodu> = {}): DataObchodu => ({
  zbozi: [], prijmy: [], uzaverky: [], radky: [], inventury: [], odpisy: [], zavreno: [], chybiOdpisAZavreno: false, fasovani: [],
  piva, obaly,
  vstup: { zbozi: [], fasovani: [], prijmy: [], odpisy: [], uzaverky: [], radky: [], inventury: [] },
  nacitam: false, chyba: null, chybiTabulky: false, znovu: () => {}, ...p,
} as DataObchodu);

const onClose = vi.fn();
const onUlozeno = vi.fn();
const onRucne = vi.fn();
const vykresli = (d = data()) => render(<PridatZboziDlazdice data={d} zapsal="Honza" onClose={onClose} onUlozeno={onUlozeno} onRucne={onRucne} />);
const pridat = () => screen.getByRole('button', { name: /^Přidat vybrané/ });

describe('Přidat zboží dlaždicemi', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('nejdřív čtyři skupiny: piva, půllitry, kosmetika, ostatní; nic není zvolené', () => {
    vykresli();
    for (const n of ['Piva', 'Půllitry', 'Kosmetika', 'Ostatní']) expect(screen.getByRole('button', { name: new RegExp(n) })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Piva/ }).textContent).toContain('k přidání');
    expect(pridat()).toBeDisabled();
  });

  it('zvolím pivo, půllitr a kosmetiku v různých skupinách a přidám je jedním klepnutím', async () => {
    vykresli();
    fireEvent.click(screen.getByRole('button', { name: /Piva/ }));
    fireEvent.click(screen.getByRole('button', { name: /12° Světlá.*Lahve 0\.5l/s }));
    fireEvent.click(screen.getByRole('button', { name: /Skupiny/ }));
    fireEvent.click(screen.getByRole('button', { name: /Půllitry/ }));
    fireEvent.click(screen.getByRole('button', { name: /Půllitr Mannheim/ }));
    fireEvent.click(screen.getByRole('button', { name: /Skupiny/ }));
    fireEvent.click(screen.getByRole('button', { name: /Kosmetika/ }));
    fireEvent.click(screen.getByRole('button', { name: /sprchový gel/ }));
    fireEvent.click(screen.getByRole('button', { name: /Skupiny/ }));
    expect(pridat().textContent).toContain('(3)');
    fireEvent.click(pridat());
    await waitFor(() => expect(pridejZboziZDlazdic).toHaveBeenCalledTimes(1));
    const [zapis, zapsal] = pridejZboziZDlazdic.mock.calls[0];
    expect(zapsal).toBe('Honza');
    expect(zapis.zapnout).toEqual([]);
    expect(zapis.nove).toEqual([
      { kod: '11001', nazev: 'Pivo sklo 12° světlá 0,5l', beer_id: 'b12s', package_id: 'l05', cena: 48 },
      { kod: '393', nazev: 'Půllitr Mannheim 0,5l', beer_id: null, package_id: null, cena: 140 },
      { kod: '62019', nazev: 'Kyn-Pivní sprchový gel 300ml', beer_id: null, package_id: null, cena: 149 },
    ]);
    expect(onUlozeno).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('„Vybrat všechno nové" zvolí jen to, co se dá přidat (piva bez obalu v katalogu ne)', () => {
    vykresli(); // v katalogu je jen 0,5l láhev a KEG 30l → PET a 0,33l se spárovat nedají
    fireEvent.click(screen.getByRole('button', { name: /Piva/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Vybrat všechno nové' }));
    const volitelnych = screen.getAllByRole('button', { pressed: true }).length;
    expect(volitelnych).toBeGreaterThan(0);
    expect(volitelnych).toBeLessThan(20);
    // dlaždice, kterou nejde spárovat, je zablokovaná a vysvětluje proč
    const pet = screen.getByRole('button', { name: /Pivo PET 1,5l 12° světlá/ });
    expect(pet).toBeDisabled();
    expect(pet.textContent).toContain('V katalogu chybí pivo nebo obal');
    fireEvent.click(pridat());
    return waitFor(() => expect(pridejZboziZDlazdic.mock.calls[0][0].nove.length).toBe(volitelnych));
  });

  it('zboží, které už v obchodě je, je vidět jako „už v obchodě" a nedá se zvolit', () => {
    vykresli(data({ zbozi: [{ kod: '11001', nazev: 'Pivo sklo 12° světlá 0,5l', beer_id: 'b12s', package_id: 'l05', aktivni: true } as never] }));
    fireEvent.click(screen.getByRole('button', { name: /Piva/ }));
    const uz = screen.getByRole('button', { name: /Pivo sklo 12° světlá 0,5l/ });
    expect(uz).toBeDisabled();
    expect(uz.textContent).toContain('✓ už v obchodě');
  });

  it('„Jiné zboží — zadat ručně" otevře ruční zadání', () => {
    vykresli();
    fireEvent.click(screen.getByRole('button', { name: /Jiné zboží/ }));
    expect(onRucne).toHaveBeenCalled();
  });

  it('chyba při zápisu se ukáže a okno zůstane otevřené', async () => {
    pridejZboziZDlazdic.mockResolvedValueOnce('Některé zboží už v obchodě je.');
    vykresli();
    fireEvent.click(screen.getByRole('button', { name: /Půllitry/ }));
    fireEvent.click(screen.getByRole('button', { name: /Půllitr Mannheim/ }));
    fireEvent.click(pridat());
    await screen.findByText('Některé zboží už v obchodě je.');
    expect(onClose).not.toHaveBeenCalled();
    expect(onUlozeno).not.toHaveBeenCalled();
  });
});
