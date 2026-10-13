// Obchod → Sklad (13. 10. 2026): piva jako ve Skladu (karta, Sudy/Lahve, Naskladněno + Prodáno),
// pálenka se skladem, ostatní zboží jen s prodejem za měsíc.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ObchodPrehled } from './ObchodPrehled';
import { stavySkladu } from '../../lib/obchodSklad';
import type { DataObchodu } from '../../lib/obchodData';

vi.mock('../../lib/businessDate', async (p) => ({ ...(await p<typeof import('../../lib/businessDate')>()), businessDateISO: () => '2026-10-13' }));

const piva = [
  { id: 'b12s', name: '12° Světlá', degree: '12°', beer_color: '#FDE68A', sort_order: 1, is_active: true },
  { id: 'b12t', name: '12° Tmavá', degree: '12°', beer_color: '#7F1D1D', sort_order: 2, is_active: true },
];
const obaly = [
  { id: 'k30', label: 'KEG 30l', kind: 'keg', volume_l: 30, sort_order: 2 },
  { id: 'p15', label: 'PET 1.5l', kind: 'bottle', volume_l: 1.5, sort_order: 10 },
  { id: 'p1', label: 'PET 1l', kind: 'bottle', volume_l: 1, sort_order: 11 },
];
const zbozi = [
  { kod: '1', nazev: 'Pivo PET 1l 12° světlá', beer_id: 'b12s', package_id: 'p1', aktivni: true },
  { kod: '2', nazev: 'Pivo PET 1,5l 12° světlá', beer_id: 'b12s', package_id: 'p15', aktivni: true },
  { kod: '3', nazev: 'Pivo sud 30l 12° tmavá', beer_id: 'b12t', package_id: 'k30', aktivni: true },
  { kod: '4', nazev: 'Saponát 1l', beer_id: null, package_id: null, aktivni: true },
  { kod: '5', nazev: 'Slivovice pálenka 0,5l', beer_id: null, package_id: null, aktivni: true },
];
const vstup = {
  zbozi, fasovani: [], prijmy: [],
  uzaverky: [{ id: 'u1', datum_od: '2026-10-05', datum_do: '2026-10-05' }],
  radky: [
    { uzaverka_id: 'u1', kod: '1', mnozstvi: 3 }, { uzaverka_id: 'u1', kod: '4', mnozstvi: 7 }, { uzaverka_id: 'u1', kod: '5', mnozstvi: 2 },
  ],
  inventury: [
    { kod: '1', datum: '2026-10-01', napocitano: 10 }, { kod: '2', datum: '2026-10-01', napocitano: 4 },
    { kod: '3', datum: '2026-10-01', napocitano: 2 }, { kod: '5', datum: '2026-10-01', napocitano: 6 },
  ],
};
const data = {
  zbozi, prijmy: [], uzaverky: vstup.uzaverky, radky: vstup.radky, inventury: vstup.inventury, odpisy: [], zavreno: [],
  chybiOdpisAZavreno: false, fasovani: [], piva, obaly, vstup, nacitam: false, chyba: null, chybiTabulky: false, znovu: () => {},
} as unknown as DataObchodu;

describe('Obchod → Sklad', () => {
  it('piva mají kartu s tabulkami Sudy a Lahve, stav a prodej od začátku měsíce', () => {
    render(<ObchodPrehled data={data} zapsal="Honza" jdiNa={() => {}} />);
    const svetla = screen.getByRole('heading', { name: /12° Světlá/ }).closest('.card') as HTMLElement;
    const radek = within(svetla).getByText('PET 1l').closest('tr') as HTMLElement;
    expect(within(radek).getByText('7')).toBeTruthy(); // 10 − 3 prodané po inventuře
    expect(radek.textContent).toMatch(/7.*3$/); // Naskladněno 7, Prodáno 3
    expect(within(svetla).getByText('PET 1.5l')).toBeTruthy();
    const tmava = screen.getByRole('heading', { name: /12° Tmavá/ }).closest('.card') as HTMLElement;
    expect(within(tmava).getByText('Sudy')).toBeTruthy();
    expect(within(tmava).getByText('KEG 30l')).toBeTruthy();
  });

  it('pálenka má stav i prodej, ostatní zboží jen prodej', () => {
    render(<ObchodPrehled data={data} zapsal="Honza" jdiNa={() => {}} />);
    const palenka = screen.getByRole('region', { name: 'Pálenka' });
    expect(within(palenka).getByText('Naskladněno')).toBeTruthy();
    const ostatni = screen.getByRole('region', { name: 'Ostatní zboží' });
    expect(within(ostatni).queryByText('Naskladněno')).toBeNull();
    expect(within(ostatni).getByText('Saponát 1l')).toBeTruthy();
    expect(ostatni.textContent).toContain('7 ks');
  });

  it('klepnutí na stav otevře rozpis, u ostatního zboží bez minima a příjmu', () => {
    render(<ObchodPrehled data={data} zapsal="Honza" jdiNa={() => {}} />);
    fireEvent.click(within(screen.getByRole('region', { name: 'Ostatní zboží' })).getByText('Saponát 1l'));
    expect(screen.queryByText(/Minimum \(ks\)/)).toBeNull();
    expect(screen.getByText(/Prodáno tento měsíc/)).toBeTruthy();
    expect(stavySkladu(vstup as any, '2026-10-13').length).toBe(5);
  });
});
