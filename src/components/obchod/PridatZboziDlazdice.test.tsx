// Přidat zboží jako ve Fasování (10. 10. 2026): barevné dlaždice piv → panel s velikostmi → „Přidat vybrané".
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { PridatZboziDlazdice } from './PridatZboziDlazdice';
import type { DataObchodu } from '../../lib/obchodData';

const pridejZboziZDlazdic = vi.fn().mockResolvedValue(null);
vi.mock('../../lib/obchodData', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/obchodData')>()),
  pridejZboziZDlazdic: (...a: unknown[]) => pridejZboziZDlazdic(...a),
}));

const piva = [
  { id: 'b12s', name: '12° Světlá', degree: '12°', beer_color: '#F59E0B', is_active: true },
  { id: 'b10', name: '10° Desítka', degree: '10°', beer_color: '#FDE68A', is_active: true },
  { id: 'b12t', name: '12° Tmavá', degree: '12°', beer_color: '#44403B', is_active: true },
  { id: 'bstare', name: 'Zrušené pivo', degree: null, beer_color: '#EF4444', is_active: false },
];
const obaly = [
  { id: 'l05', label: 'Lahve 0.5l', kind: 'bottle', volume_l: 0.5 },
  { id: 'l033', label: 'Lahve 0.33l', kind: 'bottle', volume_l: 0.33 },
  { id: 'k30', label: 'KEG 30l', kind: 'keg', volume_l: 30 },
  { id: 'k100', label: 'KEG 100l', kind: 'keg', volume_l: 100 }, // prodejna ho neprodává → ve Fasování ani tady není
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
const dlazdicePiva = (jmeno: string) => screen.getByRole('button', { name: new RegExp(jmeno) });
const radekVelikosti = (klic: string) => document.querySelector(`[data-velikost="${klic}"]`) as HTMLElement;
/** Zavře panel s velikostmi tlačítkem „Hotovo" v jeho dolní části. */
const hotovo = () => fireEvent.click(screen.getAllByRole('button', { name: /Hotovo/ })[0]);

describe('Přidat zboží jako ve Fasování', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('piva jsou dlaždice v barvě piva (jen aktivní), ostatní zboží jsou skupiny; nic není zvolené', () => {
    vykresli();
    for (const n of ['12° Světlá', '10° Desítka', '12° Tmavá']) expect(dlazdicePiva(n)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Zrušené pivo/ })).toBeNull();
    // barva je ta z katalogu piv, ne jedna pro všechny
    expect(dlazdicePiva('12° Světlá').style.backgroundColor).toBe('rgb(245, 158, 11)');
    expect(dlazdicePiva('12° Tmavá').style.backgroundColor).toBe('rgb(68, 64, 59)');
    for (const n of ['Půllitry', 'Kosmetika', 'Ostatní']) expect(screen.getByRole('button', { name: new RegExp(n) })).toBeTruthy();
    expect(pridat()).toBeDisabled();
  });

  it('klepnutí na pivo otevře panel s jeho velikostmi (lahve, pak sudy; jen obaly prodejny) v barvě piva', () => {
    vykresli();
    fireEvent.click(dlazdicePiva('12° Světlá'));
    expect(radekVelikosti('b12s|l05')).toBeTruthy();
    expect(radekVelikosti('b12s|k30')).toBeTruthy();
    expect(radekVelikosti('b12s|k100')).toBeNull();
    const poradi = [...document.querySelectorAll('[data-velikost]')].map((e) => e.getAttribute('data-velikost'));
    expect(poradi).toEqual(['b12s|l05', 'b12s|l033', 'b12s|k30']);
    // hlavička panelu má barvu piva
    const hlavicka = screen.getAllByText('12° Světlá').map((e) => e.closest('div[style]') as HTMLElement | null).find((e) => e?.style.backgroundColor);
    expect(hlavicka?.style.backgroundColor).toBe('rgb(245, 158, 11)');
    // velikost z účtenky ukazuje kód a cenu
    expect(radekVelikosti('b12s|l05').textContent).toContain('kód 11001 · 48 Kč');
  });

  it('přidám velikost v panelu, dlaždice piva se vyplní a „Přidat vybrané" ji zapíše', async () => {
    vykresli();
    fireEvent.click(dlazdicePiva('12° Světlá'));
    fireEvent.click(within(radekVelikosti('b12s|l05')).getByRole('button', { name: /Přidat/ }));
    expect(within(radekVelikosti('b12s|l05')).getByRole('button', { name: /Přidá se/ })).toHaveAttribute('aria-pressed', 'true');
    hotovo();
    expect(dlazdicePiva('12° Světlá').textContent).toContain('Lahve 0.5 L'); // souhrn na dlaždici, jako ve Fasování
    expect(pridat().textContent).toContain('(1)');
    fireEvent.click(pridat());
    await waitFor(() => expect(pridejZboziZDlazdic).toHaveBeenCalledTimes(1));
    const [zapis, zapsal] = pridejZboziZDlazdic.mock.calls[0];
    expect(zapsal).toBe('Honza');
    expect(zapis).toEqual({
      nove: [{ kod: '11001', nazev: 'Pivo sklo 12° světlá 0,5l', beer_id: 'b12s', package_id: 'l05', cena: 48 }],
      zapnout: [],
    });
    expect(onUlozeno).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('několik velikostí u více piv i ostatní zboží se přidá jedním klepnutím', async () => {
    vykresli();
    fireEvent.click(dlazdicePiva('12° Světlá'));
    fireEvent.click(within(radekVelikosti('b12s|l05')).getByRole('button', { name: /Přidat/ }));
    fireEvent.click(within(radekVelikosti('b12s|k30')).getByRole('button', { name: /Přidat/ }));
    hotovo();
    fireEvent.click(dlazdicePiva('10° Desítka'));
    fireEvent.click(within(radekVelikosti('b10|k30')).getByRole('button', { name: /Přidat/ }));
    hotovo();
    fireEvent.click(screen.getByRole('button', { name: /Půllitry/ }));
    fireEvent.click(screen.getByRole('button', { name: /Půllitr Mannheim/ }));
    fireEvent.click(screen.getByRole('button', { name: /Zpět na piva/ }));
    expect(pridat().textContent).toContain('(4)');
    fireEvent.click(pridat());
    await waitFor(() => expect(pridejZboziZDlazdic).toHaveBeenCalledTimes(1));
    expect(pridejZboziZDlazdic.mock.calls[0][0].nove.map((n: { kod: string }) => n.kod).sort()).toEqual(['10241', '10242', '11001', '393']);
  });

  it('velikost, která na účtence nebyla, chce kód z pokladny — bez něj se nedá přidat', async () => {
    vykresli();
    fireEvent.click(dlazdicePiva('12° Tmavá')); // 12° tmavá v sudu 30 l na účtence není
    const radek = radekVelikosti('b12t|k30');
    const tlacitko = within(radek).getByRole('button', { name: /Přidat/ });
    expect(tlacitko).toBeDisabled();
    expect(radek.textContent).toContain('na účtence z pokladny nebyla');
    fireEvent.change(within(radek).getByLabelText(/Kód z pokladny/), { target: { value: '55555' } });
    fireEvent.change(within(radek).getByLabelText(/Cena v pokladně/), { target: { value: '1 500,5'.replace(' ', '') } });
    expect(tlacitko).toBeEnabled();
    fireEvent.click(tlacitko);
    hotovo();
    fireEvent.click(pridat());
    await waitFor(() => expect(pridejZboziZDlazdic).toHaveBeenCalledTimes(1));
    expect(pridejZboziZDlazdic.mock.calls[0][0].nove).toEqual([
      { kod: '55555', nazev: 'Pivo KEG 30l 12° Tmavá', beer_id: 'b12t', package_id: 'k30', cena: 1500.5 },
    ]);
  });

  it('kód, který už má jiné zboží, se nepustí: ukáže důvod a „Přidat vybrané" je zablokované', () => {
    vykresli(data({ zbozi: [{ kod: '11001', nazev: 'Pivo sklo 12° světlá 0,5l', beer_id: 'b12s', package_id: 'l05', aktivni: true } as never] }));
    fireEvent.click(dlazdicePiva('12° Tmavá'));
    const radek = radekVelikosti('b12t|k30');
    fireEvent.change(within(radek).getByLabelText(/Kód z pokladny/), { target: { value: '11001' } });
    fireEvent.click(within(radek).getByRole('button', { name: /Přidat/ }));
    expect(radek.textContent).toContain('Kód 11001 už má zboží „Pivo sklo 12° světlá 0,5l“');
    expect(pridat()).toBeDisabled();
    // oprava kódu to odblokuje
    fireEvent.change(within(radek).getByLabelText(/Kód z pokladny/), { target: { value: '55555' } });
    expect(pridat()).toBeEnabled();
  });

  it('dvě velikosti se stejným ručním kódem se nepustí obě', () => {
    vykresli();
    fireEvent.click(dlazdicePiva('12° Tmavá'));
    fireEvent.change(within(radekVelikosti('b12t|k30')).getByLabelText(/Kód z pokladny/), { target: { value: '777' } });
    fireEvent.click(within(radekVelikosti('b12t|k30')).getByRole('button', { name: /Přidat/ }));
    hotovo();
    expect(pridat()).toBeEnabled();
    fireEvent.click(dlazdicePiva('10° Desítka')); // 10° v lahvi 0,33 l na účtence není → taky ruční kód
    const druhy = radekVelikosti('b10|l033');
    fireEvent.change(within(druhy).getByLabelText(/Kód z pokladny/), { target: { value: '777' } });
    fireEvent.click(within(druhy).getByRole('button', { name: /Přidat/ }));
    expect(druhy.textContent).toContain('Kód 777 je zvolený u jiného zboží');
    expect(pridat()).toBeDisabled();
    fireEvent.change(within(druhy).getByLabelText(/Kód z pokladny/), { target: { value: '778' } });
    expect(pridat()).toBeEnabled();
  });

  it('jedna špatná velikost zablokuje přidání i toho, co je v pořádku', () => {
    vykresli();
    fireEvent.click(dlazdicePiva('12° Světlá'));
    fireEvent.click(within(radekVelikosti('b12s|l05')).getByRole('button', { name: /Přidat/ }));
    hotovo();
    expect(pridat()).toBeEnabled(); // jedna hotová velikost
    fireEvent.click(dlazdicePiva('12° Tmavá'));
    const radek = radekVelikosti('b12t|k30');
    fireEvent.change(within(radek).getByLabelText(/Kód z pokladny/), { target: { value: '55555' } });
    fireEvent.click(within(radek).getByRole('button', { name: /Přidat/ }));
    fireEvent.change(within(radek).getByLabelText(/Kód z pokladny/), { target: { value: '' } }); // zvolená, ale bez kódu
    expect(radek.textContent).toContain('Doplň kód z pokladny');
    expect(pridat().textContent).toContain('(2)');
    expect(pridat()).toBeDisabled();
    expect(pridejZboziZDlazdic).not.toHaveBeenCalled();
  });

  it('neplatná cena zablokuje přidání', () => {
    vykresli();
    fireEvent.click(dlazdicePiva('12° Tmavá'));
    const radek = radekVelikosti('b12t|k30');
    fireEvent.change(within(radek).getByLabelText(/Kód z pokladny/), { target: { value: '55555' } });
    fireEvent.change(within(radek).getByLabelText(/Cena v pokladně/), { target: { value: 'abc' } });
    fireEvent.click(within(radek).getByRole('button', { name: /Přidat/ }));
    expect(radek.textContent).toContain('Cena má být číslo');
    expect(pridat()).toBeDisabled();
  });

  it('velikost, která už v obchodě je, se nedá přidat znovu a ukáže kód', () => {
    vykresli(data({ zbozi: [{ kod: '11001', nazev: 'Pivo sklo 12° světlá 0,5l', beer_id: 'b12s', package_id: 'l05', aktivni: true } as never] }));
    fireEvent.click(dlazdicePiva('12° Světlá'));
    const radek = radekVelikosti('b12s|l05');
    expect(radek.textContent).toContain('✓ už v obchodě · kód 11001');
    expect(within(radek).queryByRole('button')).toBeNull();
  });

  it('vypnuté zboží se zase zapne a jeho kód zůstane', async () => {
    vykresli(data({ zbozi: [{ kod: '777', nazev: 'Moje světlá lahev', beer_id: 'b12s', package_id: 'l05', aktivni: false } as never] }));
    fireEvent.click(dlazdicePiva('12° Světlá'));
    const radek = radekVelikosti('b12s|l05');
    expect(radek.textContent).toContain('vypnuté (kód 777)');
    fireEvent.click(within(radek).getByRole('button', { name: 'Zapnout' }));
    hotovo();
    fireEvent.click(pridat());
    await waitFor(() => expect(pridejZboziZDlazdic).toHaveBeenCalledTimes(1));
    expect(pridejZboziZDlazdic.mock.calls[0][0]).toEqual({ nove: [], zapnout: ['777'] });
  });

  it('klepnutím na „Přidá se" se velikost zase odebere z výběru', () => {
    vykresli();
    fireEvent.click(dlazdicePiva('12° Světlá'));
    const radek = radekVelikosti('b12s|l05');
    fireEvent.click(within(radek).getByRole('button', { name: /Přidat/ }));
    fireEvent.click(within(radek).getByRole('button', { name: /Přidá se/ }));
    hotovo();
    expect(pridat()).toBeDisabled();
  });

  it('zboží z účtenky, které nejde spárovat s katalogem, se nezamlčí', () => {
    vykresli(); // v katalogu je jen 0,5l láhev a KEG 30l → PET a 0,33l se spárovat nedají
    expect(screen.getByText(/Z účtenky nejde spárovat s katalogem/).textContent).toContain('Pivo PET 1,5l 12° světlá');
  });

  it('ostatní zboží: „Vybrat všechno nové" zvolí vše ve skupině, „Zrušit výběr" zase nic', () => {
    vykresli();
    fireEvent.click(screen.getByRole('button', { name: /Ostatní/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Vybrat všechno nové' }));
    const zvolene = screen.getAllByRole('button', { pressed: true }).length;
    expect(zvolene).toBe(4); // limo sklo, limo PET, saponát, kartonek
    expect(pridat().textContent).toContain('(4)');
    fireEvent.click(screen.getByRole('button', { name: 'Zrušit výběr' }));
    expect(pridat()).toBeDisabled();
  });

  it('„Jiné zboží — zadat ručně" otevře ruční zadání', () => {
    vykresli();
    fireEvent.click(screen.getByRole('button', { name: /Jiné zboží/ }));
    expect(onRucne).toHaveBeenCalled();
  });

  it('bez aktivních piv se řekne proč, ne prázdná plocha', () => {
    vykresli(data({ piva: [] }));
    expect(screen.getByText(/nejsou žádná aktivní piva/)).toBeTruthy();
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
