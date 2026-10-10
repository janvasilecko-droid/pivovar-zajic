// Okno „Zadat uzávěrku z fotky" (10. 10. 2026): z provozu „nešlo tam vložit data z fotky — nic".
//
// Simulace ukázala, jak k tomu dojde: uložení je šedé, dokud se nesplní víc věcí,
// a důvod byl jen drobný text pod seznamem 26 řádků; u řádku bez návrhu pivo+obal
// bylo tlačítko dokonce aktivní a chyba se vypsala až dole. Tyhle testy hlídají,
// že důvod je vždy vidět hned nad tlačítkem a že se nic nezapíše „potichu".
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { UzaverkaImport } from './UzaverkaImport';
import type { DataObchodu } from '../../lib/obchodData';

vi.mock('../../lib/functionAuth', () => ({
  authenticatedFunctionHeaders: vi.fn().mockResolvedValue({ 'Content-Type': 'application/json' }),
}));
vi.mock('../../lib/obrazek', () => ({
  zmensenyDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,eA=='),
  typObrazku: vi.fn().mockReturnValue('image/png'),
}));
vi.mock('../PhotoReviewPane', () => ({ PhotoReviewPane: () => <div data-testid="foto" /> }));
const zapisUzaverku = vi.fn().mockResolvedValue(null);
vi.mock('../../lib/obchodData', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/obchodData')>()),
  zapisUzaverku: (...a: unknown[]) => zapisUzaverku(...a),
}));

// Katalog bez PET lahve 1 l — řádek „PET 1l" proto nedostane návrh obalu.
const piva = [{ id: 'b12', name: '12° Světlá', degree: '12°' }];
const obaly = [{ id: 'l05', label: 'Lahve 0.5l', kind: 'bottle', volume_l: 0.5 }];

const data = (p: Partial<DataObchodu> = {}): DataObchodu => ({
  zbozi: [], prijmy: [], uzaverky: [], radky: [], inventury: [], odpisy: [], zavreno: [], chybiOdpisAZavreno: false, fasovani: [],
  piva, obaly,
  vstup: { zbozi: [], fasovani: [], prijmy: [], odpisy: [], uzaverky: [], radky: [], inventury: [] },
  nacitam: false, chyba: null, chybiTabulky: false, znovu: () => {},
  ...p,
} as DataObchodu);

const UCTENKA = {
  cislo: '2/2873', stredisko: '2', vytisteno: '2026-11-01T21:00', celkem: 4 * 48 + 2 * 84 + 25,
  radky: [
    { kod: '11001', nazev: 'Pivo sklo 12° světlá 0,5l', mnozstvi: 4, cena: 48, celkem: 192 }, // má návrh (pivo + obal)
    { kod: '11141', nazev: 'Pivo PET 1l 12° světlá', mnozstvi: 2, cena: 84, celkem: 168 }, // obal v katalogu není → bez návrhu
    { kod: '1106', nazev: 'Saponát 1l', mnozstvi: 1, cena: 25, celkem: 25 }, // ostatní zboží
  ],
};

async function otevriSFotkou(d: DataObchodu) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...UCTENKA, problemy: [], poskytovatel: 'test' }), { status: 200 })));
  render(<UzaverkaImport data={d} zapsal="Honza" vychoziTyp="tydenni" onClose={vi.fn()} onUlozeno={vi.fn()} />);
  const vstupy = document.querySelectorAll('input[type="file"]');
  fireEvent.change(vstupy[0], { target: { files: [new File(['x'], 'uctenka.png', { type: 'image/png' })] } });
  await screen.findAllByLabelText('Kód zboží');
}

const ulozit = () => screen.getByRole('button', { name: /Uložit uzávěrku/ });
const seznam = () => screen.queryByRole('status', { name: /Co ještě chybí/ });
const radekPodleNazvu = (n: string) => {
  const input = screen.getAllByLabelText('Název zboží').find((i) => (i as HTMLInputElement).value === n)!;
  return within(input.closest('li') as HTMLElement);
};

describe('okno s uzávěrkou z fotky', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('řádek bez návrhu pivo+obal: uložit je zablokované a důvod je vidět hned nad tlačítkem', async () => {
    await otevriSFotkou(data());
    expect(ulozit()).toBeDisabled();
    const s = seznam()!;
    expect(s).toBeTruthy();
    expect(s.textContent).toContain('U 1 řádku vyber pivo a obal');
    expect(s.textContent).toContain('Potvrď navržené zboží (1 řádek)');
    expect(s.textContent).toContain('Zkontroloval jsem řádky podle fotky');
  });

  it('po vyřešení všeho (ostatní, potvrdit navržené, kontrola) jde uložit a zapíše se nové zboží', async () => {
    await otevriSFotkou(data());
    fireEvent.click(radekPodleNazvu('Pivo PET 1l 12° světlá').getByLabelText('ostatní'));
    fireEvent.click(screen.getByRole('button', { name: 'Potvrdit navržené' }));
    fireEvent.click(screen.getByLabelText(/Zkontroloval jsem/));
    expect(seznam()).toBeNull(); // nic dalšího nechybí
    expect(ulozit()).toBeEnabled();
    fireEvent.click(ulozit());
    await waitFor(() => expect(zapisUzaverku).toHaveBeenCalledTimes(1));
    const zapis = zapisUzaverku.mock.calls[0][0];
    expect(zapis.radky).toHaveLength(3);
    expect(zapis.noveZbozi.map((n: { kod: string }) => n.kod).sort()).toEqual(['11001', '1106', '11141']);
    expect(zapis.noveZbozi.find((n: { kod: string }) => n.kod === '11001')).toMatchObject({ beer_id: 'b12', package_id: 'l05' });
  });

  it('nevyřešený řádek se nedá obejít: bez výběru zboží se uzávěrka nezapíše', async () => {
    await otevriSFotkou(data());
    fireEvent.click(screen.getByRole('button', { name: 'Potvrdit navržené' }));
    fireEvent.click(screen.getByLabelText(/Zkontroloval jsem/));
    expect(ulozit()).toBeDisabled();
    fireEvent.click(ulozit());
    expect(zapisUzaverku).not.toHaveBeenCalled();
  });

  it('uzávěrka přes inventuru: ukáže varování a uložit až po výslovném souhlasu', async () => {
    // týdenní 26. 10.–1. 11. a inventura 31. 10. uprostřed
    await otevriSFotkou(data({ inventury: [{ id: 'i1', kod: '11001', datum: '2026-10-31', napocitano: 10, poznamka: null, zapsal: null }] }));
    expect(screen.getByText('Tahle uzávěrka přetíná inventuru')).toBeTruthy();
    fireEvent.click(radekPodleNazvu('Pivo PET 1l 12° světlá').getByLabelText('ostatní'));
    fireEvent.click(screen.getByRole('button', { name: 'Potvrdit navržené' }));
    fireEvent.click(screen.getByLabelText(/Zkontroloval jsem/));
    expect(ulozit()).toBeDisabled();
    expect(seznam()!.textContent).toContain('Uzávěrka přetíná inventuru');
    fireEvent.click(screen.getByLabelText(/Přesto uložit/));
    expect(ulozit()).toBeEnabled();
  });

  it('bez přetnutí inventury se žádné varování neukazuje', async () => {
    await otevriSFotkou(data({ inventury: [{ id: 'i1', kod: '11001', datum: '2026-10-20', napocitano: 10, poznamka: null, zapsal: null }] }));
    expect(screen.queryByText('Tahle uzávěrka přetíná inventuru')).toBeNull();
  });
});
