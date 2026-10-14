// Okno „Zadat uzávěrku z fotky" (10. 10. 2026): z provozu „nešlo tam vložit data z fotky — nic".
//
// Simulace ukázala, jak k tomu dojde: uložení je šedé, dokud se nesplní víc věcí,
// a důvod byl jen drobný text pod seznamem 26 řádků; u řádku bez návrhu pivo+obal
// bylo tlačítko dokonce aktivní a chyba se vypsala až dole. Tyhle testy hlídají,
// že důvod je vždy vidět hned nad tlačítkem a že se nic nezapíše „potichu".
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { UzaverkaImport } from './UzaverkaImport';
import { zmensenyDataUrl } from '../../lib/obrazek';
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

async function otevriSFotkou(d: DataObchodu, odpoved: object = UCTENKA) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...odpoved, problemy: [], poskytovatel: 'test' }), { status: 200 })));
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

// 14. 10. 2026, majitel: účtenka z pokladny se tiskne jako dlouhý pásek a je potřeba ji
// vyfotit CELOU NAJEDNOU. Okno to říká předem, fotku nezmenšuje na 1600 px (číslice by
// pak byly nečitelné) a když na fotce začátek nebo konec chybí, hlásí to.
describe('celá účtenka na jedné fotce', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('před fotkou je napsáno, že se má vyfotit celá najednou', () => {
    render(<UzaverkaImport data={data()} zapsal="Honza" vychoziTyp="denni" onClose={vi.fn()} onUlozeno={vi.fn()} />);
    expect(screen.getByText(/celou najednou/)).toBeTruthy();
    expect(screen.getByText(/Sumář prodeje/)).toBeTruthy();
  });

  it('fotka účtenky se zmenšuje na 3200 px ve vyšší kvalitě, ne na 1600 px', async () => {
    await otevriSFotkou(data());
    expect(zmensenyDataUrl).toHaveBeenCalledWith(expect.any(File), expect.objectContaining({ maxStrana: 3200, kvalita: 0.88 }));
    // …a hlídá se velikost, aby šla odeslat.
    const volby = (zmensenyDataUrl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(volby.maxZnaku).toBeLessThanOrEqual(5_000_000);
  });

  it('úplná účtenka (číslo i Celkem) žádné varování nemá', async () => {
    await otevriSFotkou(data());
    expect(screen.queryByRole('status', { name: 'Fotka není úplná' })).toBeNull();
  });

  it('chybí začátek i konec: okno to řekne a nabídne vyfotit znovu', async () => {
    await otevriSFotkou(data(), { ...UCTENKA, cislo: null, stredisko: null, vytisteno: null, celkem: null });
    const b = screen.getByRole('status', { name: 'Fotka není úplná' });
    expect(b.textContent).toContain('Na fotce není celá účtenka');
    expect(b.textContent).toContain('Chybí začátek účtenky (číslo uzávěrky');
    expect(b.textContent).toContain('Chybí konec účtenky (řádek „Celkem“)');
    expect(b.textContent).toContain('celou najednou');
    expect(within(b).getByRole('button', { name: /Vyfotit znovu/ })).toBeTruthy();
  });

  it('chybí jen Celkem: hlásí jen konec; po ručním doplnění varování zmizí', async () => {
    await otevriSFotkou(data(), { ...UCTENKA, celkem: null });
    const b = screen.getByRole('status', { name: 'Fotka není úplná' });
    expect(b.textContent).not.toContain('Chybí začátek účtenky');
    expect(b.textContent).toContain('Chybí konec účtenky');
    fireEvent.change(screen.getByLabelText('Celkem z účtenky'), { target: { value: '385' } });
    expect(screen.queryByRole('status', { name: 'Fotka není úplná' })).toBeNull();
  });

  it('chybí jen začátek: číslo uzávěrky opsané z papíru varování zruší', async () => {
    await otevriSFotkou(data(), { ...UCTENKA, cislo: null, stredisko: null, vytisteno: null });
    expect(screen.getByRole('status', { name: 'Fotka není úplná' }).textContent).toContain('Chybí začátek účtenky');
    fireEvent.change(screen.getByLabelText('Číslo uzávěrky'), { target: { value: '2/2873' } });
    expect(screen.queryByRole('status', { name: 'Fotka není úplná' })).toBeNull();
  });
});

// 14. 10. 2026, majitel: účtenka se může vyfotit na víckrát a „stejná data se nesmí sčítat ani
// odečítat víckrát". Další fotka se k načtené přidává podle KÓDU zboží: řádek, který je na obou
// fotkách se stejnými čísly, se podruhé nepřidá. Tatáž účtenka už ZAPSANÁ se nezapíše znovu.
describe('účtenka na víc fotek, bez zdvojení', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // Účtenka o čtyřech řádcích rozdělená na dvě fotky, které se překrývají v řádku 11141.
  const R = {
    sapo: { kod: '1106', nazev: 'Saponát 1l', mnozstvi: 1, cena: 25, celkem: 25 },
    sklo: { kod: '11001', nazev: 'Pivo sklo 12° světlá 0,5l', mnozstvi: 4, cena: 48, celkem: 192 },
    pet: { kod: '11141', nazev: 'Pivo PET 1l 12° světlá', mnozstvi: 2, cena: 84, celkem: 168 },
    pet15: { kod: '11190', nazev: 'Pivo PET 1,5l 11° světlý ležák', mnozstvi: 1, cena: 115, celkem: 115 },
  };
  const HORNI = { cislo: '2/2873', stredisko: '2', vytisteno: '2026-11-01T21:00', celkem: null, radky: [R.sapo, R.sklo, R.pet] };
  const DOLNI = { cislo: null, stredisko: null, vytisteno: null, celkem: 500, radky: [R.pet, R.pet15] };

  /** Odpovědi funkce za sebou (každé volání dostane další; poslední se opakuje). Vrací počet volání. */
  function odpovedi(...cteni: object[]) {
    let i = 0;
    const f = vi.fn(async () => new Response(JSON.stringify({ ...cteni[Math.min(i++, cteni.length - 1)], problemy: [], poskytovatel: 'test' }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    return f;
  }
  const soubor = (n = 'uctenka.png') => new File(['x'], n, { type: 'image/png' });
  const vstupy = () => document.querySelectorAll('input[type="file"]');
  /** Okno s první fotkou načtenou (galerie = vstup 0). */
  async function otevri(d: DataObchodu, ...cteni: object[]) {
    const f = odpovedi(...cteni);
    render(<UzaverkaImport data={d} zapsal="Honza" vychoziTyp="denni" onClose={vi.fn()} onUlozeno={vi.fn()} />);
    fireEvent.change(vstupy()[0], { target: { files: [soubor()] } });
    await screen.findAllByLabelText('Kód zboží');
    return f;
  }
  /** Další fotka (vstup „z galerie" u Přidat další fotku). */
  async function pridej(pocetRadkuPo: number) {
    fireEvent.change(vstupy()[2], { target: { files: [soubor('cast2.png')] } });
    await waitFor(() => expect(screen.getAllByLabelText('Kód zboží')).toHaveLength(pocetRadkuPo));
  }
  const kody = () => screen.getAllByLabelText('Kód zboží').map((i) => (i as HTMLInputElement).value);

  it('další fotka: řádek z překryvu se nezdvojí, přibyde jen nový, doplní se Celkem a uložení jde', async () => {
    const f = await otevri(data(), HORNI, DOLNI);
    expect(kody()).toEqual(['1106', '11001', '11141']);
    expect(screen.getByRole('status', { name: 'Fotka není úplná' }).textContent).toContain('Chybí konec účtenky');

    await pridej(4);
    expect(f).toHaveBeenCalledTimes(2);
    expect(kody()).toEqual(['1106', '11001', '11141', '11190']);          // 11141 jen jednou, seřazeno podle kódu
    const zprava = screen.getByRole('status', { name: 'Další fotka přidána' }).textContent!;
    expect(zprava).toContain('Přidáno 1 nový řádek');
    expect(zprava).toContain('1 řádek byl už načtených z předchozí fotky (podruhé se nepřičetly)');
    expect((screen.getByLabelText('Celkem z účtenky') as HTMLInputElement).value).toBe('500');
    expect(screen.queryByRole('status', { name: 'Fotka není úplná' })).toBeNull();   // konec už je vidět
    expect(screen.getByText(/Čísla na účtence sedí/)).toBeTruthy();                   // součet 500 = Celkem

    // Uložení: zboží vyřešit a potvrdit.
    for (const nazev of ['Pivo PET 1l 12° světlá', 'Pivo PET 1,5l 11° světlý ležák']) fireEvent.click(radekPodleNazvu(nazev).getByLabelText('ostatní'));
    fireEvent.click(screen.getByRole('button', { name: 'Potvrdit navržené' }));
    fireEvent.click(screen.getByLabelText(/Zkontroloval jsem/));
    expect(ulozit()).toBeEnabled();
    fireEvent.click(ulozit());
    await waitFor(() => expect(zapisUzaverku).toHaveBeenCalledTimes(1));
    const zapis = zapisUzaverku.mock.calls[0][0];
    expect(zapis.radky.map((r: { kod: string }) => r.kod)).toEqual(['1106', '11001', '11141', '11190']);
    expect(zapis.trzba).toBe(500);
    expect(zapis.cislo).toBe('2/2873');
  });

  it('tatáž fotka podruhé: nic se nepřidá, nic se nezdvojí', async () => {
    await otevri(data(), HORNI, HORNI);
    fireEvent.change(vstupy()[2], { target: { files: [soubor('znovu.png')] } });
    await screen.findByRole('status', { name: 'Další fotka přidána' });
    expect(kody()).toEqual(['1106', '11001', '11141']);
    expect(screen.getByRole('status', { name: 'Další fotka přidána' }).textContent).toContain('3 řádky byly už načtených');
    expect(screen.getByRole('status', { name: 'Další fotka přidána' }).textContent).not.toContain('Přidáno');
  });

  it('fotka jiné účtenky (jiné číslo uzávěrky) se nepřidá', async () => {
    await otevri(data(), HORNI, { ...DOLNI, cislo: '2/2999' });
    fireEvent.change(vstupy()[2], { target: { files: [soubor('jina.png')] } });
    const chyba = await screen.findByText(/jiná uzávěrka \(č\. 2\/2999\)/);
    expect(chyba.textContent).toContain('načtená je č. 2/2873');
    expect(chyba.textContent).toContain('Fotka se nepřidala');
    expect(kody()).toEqual(['1106', '11001', '11141']);   // nic se nezměnilo
  });

  it('stejný kód s jinými čísly: oba řádky zůstanou a uložení je zablokované, dokud jeden nezmizí', async () => {
    await otevri(data(), HORNI, { ...DOLNI, radky: [{ ...R.pet, mnozstvi: 3, celkem: 252 }, R.pet15] });
    await pridej(5);
    expect(kody().filter((k) => k === '11141')).toHaveLength(2);
    expect(screen.getByRole('status', { name: 'Další fotka přidána' }).textContent).toContain('Kód 11141 je na fotkách s RŮZNÝMI čísly');
    expect(ulozit()).toBeDisabled();
    expect(screen.getAllByText(/je na účtence dvakrát/).length).toBeGreaterThan(0);
  });

  it('řádek utržený na kraji první fotky se doplní z druhé, ne zdvojí', async () => {
    const utrzena = { ...HORNI, radky: [R.sapo, R.sklo, { ...R.pet, mnozstvi: null, cena: null, celkem: null }] };
    await otevri(data(), utrzena, DOLNI);
    await pridej(4);
    expect(kody().filter((k) => k === '11141')).toHaveLength(1);
    const inputs = within(radekPodleNazvu('Pivo PET 1l 12° světlá').getByLabelText('Ks').closest('li') as HTMLElement);
    expect((inputs.getByLabelText('Ks') as HTMLInputElement).value).toBe('2');
    expect(screen.getByRole('status', { name: 'Další fotka přidána' }).textContent).toContain('utržený řádek se doplnil');
  });

  it('víc souborů vybraných najednou z galerie se přečte a sloučí za sebou', async () => {
    const f = odpovedi(HORNI, DOLNI);
    render(<UzaverkaImport data={data()} zapsal="Honza" vychoziTyp="denni" onClose={vi.fn()} onUlozeno={vi.fn()} />);
    fireEvent.change(vstupy()[0], { target: { files: [soubor('a.png'), soubor('b.png')] } });
    await waitFor(() => expect(kody()).toEqual(['1106', '11001', '11141', '11190']));
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('nová fotka z „Vyfotit uzávěrku" nahradí všechno načtené (nepřidává)', async () => {
    await otevri(data(), HORNI, { ...DOLNI, cislo: '2/2999', radky: [R.pet15] });
    fireEvent.change(vstupy()[1], { target: { files: [soubor('nova.png')] } });
    await waitFor(() => expect(kody()).toEqual(['11190']));
  });
});

describe('totéž podruhé: účtenka, která už je zapsaná', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const zapsanaUzaverka = (p: Record<string, unknown> = {}) => ({
    id: 'u1', cislo: '2/2000', stredisko: '2', typ: 'denni', datum_od: '2026-11-01', datum_do: '2026-11-01',
    vytisteno: '2026-11-01T21:00:00', trzba: 385, poznamka: null, zapsal: null, created_at: '2026-11-01T22:00:00Z', ...p,
  });
  const vyresit = () => {
    fireEvent.click(radekPodleNazvu('Pivo PET 1l 12° světlá').getByLabelText('ostatní'));
    fireEvent.click(screen.getByRole('button', { name: 'Potvrdit navržené' }));
    fireEvent.click(screen.getByLabelText(/Zkontroloval jsem/));
  };

  it('stejný čas tisku a stejné Celkem jako zapsaná uzávěrka: uložit nejde a okno řekne proč', async () => {
    await otevriSFotkou(data({ uzaverky: [zapsanaUzaverka()] as DataObchodu['uzaverky'] }));
    const okno = screen.getByRole('alert', { name: 'Účtenka už je zapsaná' });
    expect(okno.textContent).toContain('Tahle účtenka už je zapsaná');
    expect(okno.textContent).toContain('č. 2/2000');
    expect(okno.textContent).toContain('dej všechny fotky do JEDNOHO okna');
    vyresit();
    expect(ulozit()).toBeDisabled();
    expect(seznam()!.textContent).toContain('Tahle účtenka už je zapsaná');
    fireEvent.click(ulozit());
    expect(zapisUzaverku).not.toHaveBeenCalled();
  });

  it('podobná uzávěrka (stejné řádky, jiné středisko, překrývající se den): uložit až po potvrzení', async () => {
    const d = data({
      uzaverky: [zapsanaUzaverka({ stredisko: '1', cislo: '1/700', vytisteno: null, trzba: 999 })] as DataObchodu['uzaverky'],
      radky: UCTENKA.radky.map((r) => ({ uzaverka_id: 'u1', kod: r.kod, mnozstvi: r.mnozstvi, cena: r.cena })) as DataObchodu['radky'],
    });
    await otevriSFotkou(d);
    expect(screen.getByRole('alert', { name: 'Podobná uzávěrka už je zapsaná' }).textContent).toContain('3 z 3 řádků úplně stejných');
    vyresit();
    expect(ulozit()).toBeDisabled();
    expect(seznam()!.textContent).toContain('Je to jiná účtenka');
    fireEvent.click(screen.getByLabelText(/Je to jiná účtenka/));
    expect(ulozit()).toBeEnabled();
    fireEvent.click(ulozit());
    await waitFor(() => expect(zapisUzaverku).toHaveBeenCalledTimes(1));
  });

  it('jiná účtenka za jiný den bez překryvu žádné varování nemá', async () => {
    await otevriSFotkou(data({ uzaverky: [zapsanaUzaverka({ datum_od: '2026-10-01', datum_do: '2026-10-01', vytisteno: '2026-10-01T20:00:00', trzba: 100, cislo: '2/1000' })] as DataObchodu['uzaverky'] }));
    expect(screen.queryByRole('alert', { name: 'Účtenka už je zapsaná' })).toBeNull();
    expect(screen.queryByRole('alert', { name: 'Podobná uzávěrka už je zapsaná' })).toBeNull();
  });

  it('bez čísla uzávěrky (fotka jen části účtenky) nejde uložit, dokud se číslo neopíše nebo nepotvrdí, že ho účtenka nemá', async () => {
    await otevriSFotkou(data(), { ...UCTENKA, cislo: null, stredisko: null, vytisteno: null });
    vyresit();
    expect(ulozit()).toBeDisabled();
    expect(seznam()!.textContent).toContain('Doplň číslo uzávěrky');
    // a) opsané číslo
    fireEvent.change(screen.getByLabelText('Číslo uzávěrky'), { target: { value: '2/2873' } });
    expect(ulozit()).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Číslo uzávěrky'), { target: { value: '' } });
    expect(ulozit()).toBeDisabled();
    // b) potvrzení, že číslo není
    fireEvent.click(screen.getByLabelText(/Chybí číslo uzávěrky/));
    expect(ulozit()).toBeEnabled();
  });

  it('stejné číslo uzávěrky jako zapsaná: hlásí se při uložení (jako dřív)', async () => {
    await otevriSFotkou(data({ uzaverky: [zapsanaUzaverka({ cislo: '2/2873', datum_od: '2026-09-01', datum_do: '2026-09-01', vytisteno: null, trzba: 5 })] as DataObchodu['uzaverky'] }));
    vyresit();
    fireEvent.click(ulozit());
    expect((await screen.findAllByText(/Uzávěrka č\. 2\/2873 už je zapsaná/)).length).toBeGreaterThan(0);
    expect(zapisUzaverku).not.toHaveBeenCalled();
  });
});

