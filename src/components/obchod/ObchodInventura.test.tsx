// Obchod → Inventura (13. 10. 2026): stejný vzhled jako Inventura pivovaru, jen piva a pálenka.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ObchodInventura } from './ObchodInventura';
import type { DataObchodu } from '../../lib/obchodData';

vi.mock('../../lib/businessDate', async (p) => ({ ...(await p<typeof import('../../lib/businessDate')>()), businessDateISO: () => '2026-10-13' }));

const piva = [{ id: 'b12s', name: '12° Světlá', degree: '12°', beer_color: '#FDE68A', sort_order: 1, is_active: true }];
const obaly = [{ id: 'p1', label: 'PET 1l', kind: 'bottle', volume_l: 1, sort_order: 11 }];
const zbozi = [
  { kod: '1', nazev: 'Pivo PET 1l 12° světlá', beer_id: 'b12s', package_id: 'p1', aktivni: true },
  { kod: '4', nazev: 'Saponát 1l', beer_id: null, package_id: null, aktivni: true },
  { kod: '5', nazev: 'Slivovice pálenka 0,5l', beer_id: null, package_id: null, aktivni: true },
];
const vstup = { zbozi, fasovani: [], prijmy: [], uzaverky: [], radky: [], inventury: [{ kod: '1', datum: '2026-10-01', napocitano: 10 }, { kod: '5', datum: '2026-10-01', napocitano: 6 }] };
const data = {
  zbozi, prijmy: [], uzaverky: [], radky: [], inventury: vstup.inventury, odpisy: [], zavreno: [], chybiOdpisAZavreno: false, fasovani: [],
  piva, obaly, vstup, nacitam: false, chyba: null, chybiTabulky: false, znovu: () => {},
} as unknown as DataObchodu;

describe('Obchod → Inventura', () => {
  it('piva a pálenka ano, ostatní zboží (saponát) se nepočítá', () => {
    render(<ObchodInventura data={data} zapsal="Honza" />);
    expect(screen.getByText('12° Světlá · PET 1l')).toBeTruthy();
    expect(screen.getByText('Slivovice pálenka 0,5l')).toBeTruthy();
    expect(screen.queryByText('Saponát 1l')).toBeNull();
    expect(screen.getByText('Sklad 10 ks')).toBeTruthy();
  });

  it('tlačítka − a + vycházejí ze stavu skladu a políčko se barví podle shody', () => {
    render(<ObchodInventura data={data} zapsal="Honza" />);
    const pole = screen.getByLabelText('Napočítáno — Pivo PET 1l 12° světlá') as HTMLInputElement;
    fireEvent.click(screen.getByLabelText('O jeden kus míň — Pivo PET 1l 12° světlá'));
    expect(pole.value).toBe('9');
    expect(pole.className).toContain('bg-rose-700'); // nesedí
    fireEvent.click(screen.getByLabelText('O jeden kus víc — Pivo PET 1l 12° světlá'));
    expect(pole.value).toBe('10');
    expect(pole.className).toContain('bg-emerald-700'); // sedí
  });
});
