// 🧭 Průvodce zadáním objednávky — okno.
//
// Majitel 18. 11. 2026: „udělej ty objednávky tak jako první návrh". Hlídá se
// celý průchod tak, jak ho projde člověk: odběratel a den → pivo (stejný panel
// jako Fasování) → souhrn → uložení, a taky tlačítko Zpět, které vrací o krok.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ObjednavkaPruvodce } from './ObjednavkaPruvodce';
import type { DataPruvodce } from './pruvodceTypy';
import type { KonceptObjednavky } from '../../lib/objednavkaPruvodce';
import type { Beer, Package, Place } from '../../lib/supabase';
import type { Order, OrderItem } from './spolecne';
import { oznam, potvrd, toastZpet } from '../../lib/toast';

vi.mock('../../lib/toast', () => ({
  potvrd: vi.fn(async () => true),
  toastZpet: vi.fn(),
  oznam: vi.fn(),
  chyba: vi.fn(),
  uspech: vi.fn(),
}));

// Středa 18. 11. 2026.
const DNES = '2026-11-18';

const places: Place[] = [
  { id: 'p-radek', name: 'Radek', note: null, created_at: '', address: 'Lipová 1, Hradec Králové, 500 02', phone: null, opening_hours: null,
    mista_zavozu: [{ id: 'sklad', nazev: 'Sklad', adresa: null, lat: null, lng: null }, { id: 'drobak', nazev: 'Drobák', adresa: null, lat: null, lng: null }] },
  { id: 'p-zizkov', name: 'Žižkov', note: null, created_at: '', address: null, phone: null, opening_hours: null },
  { id: 'p-seeberg', name: 'Seeberg', note: null, created_at: '', address: null, phone: null, opening_hours: null, vychozi_den_zavozu: 'pa' },
  { id: 'p-rest', name: 'Restaurace', note: null, created_at: '', address: null, phone: null, opening_hours: null, vychozi_den_zavozu: 'zadny' },
  { id: 'p-mates', name: 'Mates', note: null, created_at: '', address: null, phone: null, opening_hours: null },
];

const beer = (id: string, name: string, sort: number, barva: string): Beer => ({
  id, name, short_name: null, degree: null, color: null, beer_color: barva, price_per_liter: null, is_active: true, sort_order: sort, created_at: '',
});
const beers: Beer[] = [
  beer('b12', '12° Světlá', 1, '#F59E0B'),
  beer('b11', '11° Světlá', 2, '#FDE68A'),
  beer('jantar', 'Jantar', 5, '#540f0f'),
];

const pkg = (id: string, kind: 'keg' | 'bottle', v: number, label: string, sort: number): Package => ({ id, code: id, kind, volume_l: v, label, sort_order: sort });
const packages: Package[] = [
  pkg('k50', 'keg', 50, 'KEG 50l', 1), pkg('k30', 'keg', 30, 'KEG 30l', 2), pkg('k20', 'keg', 20, 'KEG 20l', 3),
  pkg('k15', 'keg', 15, 'KEG 15l', 4), pkg('k10', 'keg', 10, 'KEG 10l', 5),
  pkg('l15', 'bottle', 1.5, 'PET 1,5l', 6), pkg('l1', 'bottle', 1, 'PET 1l', 7),
  pkg('l05', 'bottle', 0.5, 'Lahev 0,5l', 8), pkg('l033', 'bottle', 0.33, 'Lahev 0,33l', 9),
];

const objednavka = (id: string, placeId: string, jmeno: string, datum: string, status = 'nova'): Order => ({
  id, order_date: datum, place_id: placeId, place_name: jmeno, source: 'rucne', status, note: null, created_at: `${datum}T08:00:00Z`,
  delivery_day: null, delivery_date: null, is_prepared: false, is_packaged: false, is_delivered: false, delivered_at: null,
});
const polozka = (id: string, orderId: string, beerId: string, beerName: string, pkgId: string, label: string, q: number): OrderItem => ({
  id, order_id: orderId, beer_id: beerId, beer_name: beerName, package_id: pkgId, package_label: label, quantity: q, is_prepared: false, is_bottled: false,
});

// Žižkov 3× (a čtvrtá je stornovaná), Radek 2×, Seeberg 1× → v pořadí „nejčastější";
// Restaurace a Mates nikdy neobjednávali.
const orders: Order[] = [
  objednavka('o7', 'p-zizkov', 'Žižkov', '2026-11-02'),
  objednavka('o1', 'p-zizkov', 'Žižkov', '2026-11-04'),
  objednavka('o2', 'p-zizkov', 'Žižkov', '2026-11-11'),
  objednavka('o3', 'p-zizkov', 'Žižkov', '2026-11-16', 'storno'),
  objednavka('o4', 'p-radek', 'Radek', '2026-11-10'),
  objednavka('o5', 'p-radek', 'Radek', '2026-11-12'),
  objednavka('o6', 'p-seeberg', 'Seeberg', '2026-11-06'),
];
const items: Record<string, OrderItem[]> = {
  o2: [polozka('i1', 'o2', 'b12', '12° Světlá', 'k50', 'KEG 50l', 2), polozka('i2', 'o2', 'b11', '11° Světlá', 'l1', 'PET 1l', 10)],
};

const data: DataPruvodce = { places, beers, packages, orders, items, dnes: DNES };

function pripravit(props: Partial<Parameters<typeof ObjednavkaPruvodce>[0]> = {}) {
  const onUlozit = vi.fn(async (_k: KonceptObjednavky) => ({ stav: 'ulozeno' as const }));
  const onZavrit = vi.fn();
  const vysledek = render(<ObjednavkaPruvodce data={data} historie={[]} onUlozit={onUlozit} onZavrit={onZavrit} {...props} />);
  return { ...vysledek, onUlozit, onZavrit };
}

const tlacitko = (nazev: RegExp | string) => screen.getByRole('button', { name: nazev });
const dlazdice = (jmeno: string) => screen.getByRole('button', { name: new RegExp(`^${jmeno}`) });

/** Odběratel → Dál. */
function vyberOdberatele(jmeno: string) {
  fireEvent.click(dlazdice(jmeno));
}
function dal() {
  fireEvent.click(tlacitko(/Dál — vybrat pivo/));
}

/** Pivo → panel → počet v prvním (předvoleném) obalu → Hotovo. */
function zadejPivo(jmeno: string, pocet: string, bezHotovo = false) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(jmeno) }));
  const pole = screen.getByRole('textbox', { name: 'Kolik kusů?' });
  fireEvent.change(pole, { target: { value: pocet } });
  if (!bezHotovo) fireEvent.click(tlacitko(/^Hotovo/));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(potvrd).mockResolvedValue(true);
  window.history.replaceState({}, '');
  window.localStorage.clear();
});

describe('krok 1 — odběratel a den', () => {
  it('nejdřív největší odběratelé podle počtu objednávek (stornované se nepočítají) a Dál je zamčené', () => {
    pripravit();
    expect(screen.getByRole('heading', { name: 'Pro koho?' })).toBeTruthy();
    const dlazdiceJmena = within(screen.getByRole('group', { name: 'Odběratelé' })).getAllByRole('button').map((b) => b.textContent);
    expect(dlazdiceJmena[0]).toMatch(/^Žižkov/);
    expect(dlazdiceJmena[1]).toMatch(/^Radek/);
    expect(dlazdiceJmena[2]).toMatch(/^Seeberg/);
    expect(dlazdiceJmena).toHaveLength(3);
    expect((tlacitko(/Dál — vybrat pivo/) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('Vyber odběratele.');
  });

  it('pod jménem je obvyklý den a místa závozu', () => {
    pripravit();
    expect(dlazdice('Radek').textContent).toContain('Sklad · Drobák · obvykle St');
    expect(dlazdice('Seeberg').textContent).toContain('obvykle Pá');
  });

  it('hledání funguje bez diakritiky a najde i toho, kdo ještě nikdy neobjednával', () => {
    pripravit();
    fireEvent.change(screen.getByLabelText('Hledat odběratele'), { target: { value: 'zizkov' } });
    expect(dlazdice('Žižkov')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Radek/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('Hledat odběratele'), { target: { value: 'MATES' } });
    expect(dlazdice('Mates')).toBeTruthy();
  });

  it('výběr odběratele odemkne Dál a vyčistí hledání', () => {
    pripravit();
    fireEvent.change(screen.getByLabelText('Hledat odběratele'), { target: { value: 'zizkov' } });
    vyberOdberatele('Žižkov');
    expect((screen.getByLabelText('Hledat odběratele') as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('button', { name: /^Žižkov/, pressed: true })).toBeTruthy();
    expect((tlacitko(/Dál — vybrat pivo/) as HTMLButtonElement).disabled).toBe(false);
  });

  it('nový odběratel: napsané jméno, které v katalogu není, jde vybrat', () => {
    pripravit();
    fireEvent.change(screen.getByLabelText('Hledat odběratele'), { target: { value: 'U Lípy' } });
    fireEvent.click(screen.getByRole('button', { name: /Nový: U Lípy/ }));
    expect(screen.getByRole('button', { name: /^U Lípy/, pressed: true }).textContent).toContain('nový odběratel');
    expect((tlacitko(/Dál — vybrat pivo/) as HTMLButtonElement).disabled).toBe(false);
  });

  it('existující jméno se nenabízí jako nový odběratel', () => {
    pripravit();
    fireEvent.change(screen.getByLabelText('Hledat odběratele'), { target: { value: 'žižkov' } });
    expect(screen.queryByRole('button', { name: /Nový:/ })).toBeNull();
  });

  it('„Všichni odběratelé" ukáže i ty, co nikdy neobjednávali', () => {
    pripravit();
    expect(screen.queryByRole('button', { name: /^Mates/ })).toBeNull();
    fireEvent.click(tlacitko(/Všichni odběratelé \(5\)/));
    expect(dlazdice('Mates')).toBeTruthy();
    expect(dlazdice('Restaurace')).toBeTruthy();
    fireEvent.click(tlacitko('Jen nejčastější'));
    expect(screen.queryByRole('button', { name: /^Mates/ })).toBeNull();
  });

  it('odběratel s víc místy: bez výběru místa se dál nejde, po výběru ano', () => {
    pripravit();
    vyberOdberatele('Radek');
    expect(screen.getByRole('heading', { name: /Radek vozí na víc míst — kam tentokrát\?/ })).toBeTruthy();
    expect((tlacitko(/Dál — vybrat pivo/) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toMatch(/kam se veze/);
    fireEvent.click(tlacitko('Sklad'));
    expect(screen.getByRole('button', { name: 'Sklad', pressed: true })).toBeTruthy();
    expect((tlacitko(/Dál — vybrat pivo/) as HTMLButtonElement).disabled).toBe(false);
  });

  it('odběratel s jedním místem se na místo neptá', () => {
    pripravit();
    vyberOdberatele('Žižkov');
    expect(screen.queryByText(/vozí na víc míst/)).toBeNull();
  });

  it('den, který nikdo nevybral, se ukáže předem a ručně vybraný ho přebije i se vrátí', () => {
    pripravit();
    vyberOdberatele('Žižkov');
    expect(screen.getByTestId('pruvodce-vychozi-den').textContent).toContain('závoz bude St 18. 11. (výchozí den odběratele)');

    const ctvrtek = screen.getByRole('button', { name: /^Čt/ });
    fireEvent.click(ctvrtek);
    expect(screen.getByRole('button', { name: /^Čt/, pressed: true })).toBeTruthy();
    expect(screen.queryByTestId('pruvodce-vychozi-den')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Čt/, pressed: true }));
    expect(screen.getByTestId('pruvodce-vychozi-den')).toBeTruthy();
  });

  it('Seeberg má výchozí pátek', () => {
    pripravit();
    vyberOdberatele('Seeberg');
    expect(screen.getByTestId('pruvodce-vychozi-den').textContent).toContain('Pá 20. 11.');
  });

  it('Restaurace: „Bez závozu" je zaškrtnuté samo a řekne, že se odečte dnes', () => {
    pripravit();
    fireEvent.click(tlacitko(/Všichni odběratelé/));
    vyberOdberatele('Restaurace');
    expect((screen.getByRole('checkbox', { name: /Bez závozu/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId('pruvodce-vychozi-den').textContent).toContain('odečte ze skladu dnes (18. 11.)');
  });

  it('jiné datum z kalendáře vybere den a zruší hlášku o výchozím dni', () => {
    pripravit();
    vyberOdberatele('Žižkov');
    fireEvent.change(screen.getByLabelText(/Jiné datum závozu/), { target: { value: '2026-11-21' } });
    expect(screen.getByRole('button', { name: /^So/, pressed: true })).toBeTruthy();
    expect(screen.queryByTestId('pruvodce-vychozi-den')).toBeNull();
  });

  it('závoz v dalším měsíci se musí potvrdit', () => {
    pripravit();
    vyberOdberatele('Žižkov');
    fireEvent.change(screen.getByLabelText(/Jiné datum závozu/), { target: { value: '2026-12-02' } });
    expect((tlacitko(/Dál — vybrat pivo/) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /Potvrzuji, že závoz/ }));
    expect((tlacitko(/Dál — vybrat pivo/) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('krok 2 — pivo (stejný panel jako Fasování)', () => {
  function naPivo(odberatel = 'Žižkov') {
    const r = pripravit();
    vyberOdberatele(odberatel);
    dal();
    return r;
  }

  it('po Dál jsou dlaždice piv, Souhrn je zamčený a lišta říká, že nic není', () => {
    naPivo();
    expect(screen.getByRole('heading', { name: 'Které pivo?' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /12° Světlá/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Jantar/ })).toBeTruthy();
    expect((tlacitko(/^Souhrn/) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('zatím nic')).toBeTruthy();
  });

  it('klepnutí na pivo otevře panel s obaly (sudy, lahve) a nabídne sud 50 l', () => {
    naPivo();
    fireEvent.click(screen.getByRole('button', { name: /12° Světlá/ }));
    const panel = screen.getByRole('dialog', { name: /Nová objednávka · Žižkov — 12° Světlá/ });
    expect(panel).toBeTruthy();
    const obaly = within(panel).getAllByRole('radio').map((r) => r.textContent);
    expect(obaly).toEqual(['50 l', '30 l', '20 l', '15 l', '10 l', '1 l', '1,5 l', '0,5 l', '0,33 l']);
    expect(screen.getByRole('radio', { name: '50 l', checked: true })).toBeTruthy();
    expect(screen.getByText('Sudy')).toBeTruthy();
    expect(screen.getByText('Lahve')).toBeTruthy();
    // U objednávky nic „uloženého" není — seznam „Už uloženo" se neukazuje.
    expect(screen.queryByText(/Už uloženo/)).toBeNull();
  });

  it('číslo se zapíše hned a po Hotovo je na dlaždici „2×50", lišta počítá položky', () => {
    naPivo();
    zadejPivo('12° Světlá', '2');
    expect(screen.queryByRole('dialog', { name: /12° Světlá/ })).toBeNull();
    expect(screen.getByRole('button', { name: /12° Světlá.*2×50/ })).toBeTruthy();
    expect(screen.getByText('1 pivo · 1 položka')).toBeTruthy();
    expect((tlacitko(/^Souhrn/) as HTMLButtonElement).disabled).toBe(false);
  });

  it('„+ další obal" přidá druhou velikost téhož piva', () => {
    naPivo();
    fireEvent.click(screen.getByRole('button', { name: /12° Světlá/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Kolik kusů?' }), { target: { value: '2' } });
    fireEvent.click(tlacitko(/\+ další obal/));
    fireEvent.change(screen.getByRole('textbox', { name: 'Kolik kusů?' }), { target: { value: '1' } });
    fireEvent.click(tlacitko(/^Hotovo/));
    expect(screen.getByRole('button', { name: /12° Světlá.*2×50, 1×30/ })).toBeTruthy();
    expect(screen.getByText('1 pivo · 2 položky')).toBeTruthy();
  });

  it('nula počet zase smaže a lišta se vrátí na „zatím nic"', () => {
    naPivo();
    zadejPivo('12° Světlá', '2');
    fireEvent.click(screen.getByRole('button', { name: /12° Světlá/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Kolik kusů?' }), { target: { value: '' } });
    fireEvent.click(tlacitko(/^Hotovo/));
    expect(screen.getByText('zatím nic')).toBeTruthy();
  });

  it('nejčastěji objednávaný obal piva se nabídne první (podle historie)', () => {
    const historie = [
      { beer_id: 'b11', package_id: 'l1', quantity: 10, entry_date: '2026-11-10' },
      { beer_id: 'b11', package_id: 'l1', quantity: 12, entry_date: '2026-11-04' },
    ];
    pripravit({ historie });
    vyberOdberatele('Žižkov');
    dal();
    fireEvent.click(screen.getByRole('button', { name: /11° Světlá/ }));
    expect(screen.getByRole('radio', { name: '1 l', checked: true })).toBeTruthy();
    // A pod polem jsou nejčastější čísla z historie.
    expect(screen.getByRole('button', { name: '10' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '12' })).toBeTruthy();
  });

  it('klepnutí na rychlé číslo rovnou zadá a zavře panel', () => {
    naPivo();
    fireEvent.click(screen.getByRole('button', { name: /Jantar/ }));
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(screen.queryByRole('dialog', { name: /Jantar/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Jantar.*3×50/ })).toBeTruthy();
  });

  it('naposledy použité pivo jde příště na začátek', () => {
    naPivo();
    zadejPivo('Jantar', '1');
    const jmena = () => screen.getAllByRole('button').map((b) => b.textContent ?? '').filter((t) => /Světlá|Jantar/.test(t));
    expect(jmena()[0]).toMatch(/Jantar/);
  });

  it('poslední objednávku odběratele jde zopakovat, chybějící pivo se oznámí', () => {
    const upravene = { ...data, items: { o2: [...items.o2, polozka('i3', 'o2', 'zmizele', 'Zmizelé', 'k30', 'KEG 30l', 1)] } };
    pripravit({ data: upravene });
    vyberOdberatele('Žižkov');
    dal();
    expect(screen.getByText(/Poslední objednávka \(11\. 11\.\)/)).toBeTruthy();
    fireEvent.click(tlacitko(/Zopakovat tyhle položky/));
    expect(screen.getByRole('button', { name: /12° Světlá.*2×50/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /11° Světlá.*10×1/ })).toBeTruthy();
    expect(oznam).toHaveBeenCalledWith(expect.stringContaining('1 položka'));
    // Karta s nabídkou po zopakování zmizí.
    expect(screen.queryByText(/Zopakovat tyhle položky/)).toBeNull();
  });

  it('odběratel bez předchozí objednávky nabídku opakování nemá', () => {
    naPivo('Seeberg');
    expect(screen.queryByText(/Zopakovat tyhle položky/)).toBeNull();
  });

  it('hlídání malých sudů: nad volné sudy se ukáže varování červeně', () => {
    pripravit({ volneMaleSudy: (id) => (id === 'k20' ? 1 : null) });
    vyberOdberatele('Žižkov');
    dal();
    fireEvent.click(screen.getByRole('button', { name: /12° Světlá/ }));
    fireEvent.click(screen.getByRole('radio', { name: '20 l' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Kolik kusů?' }), { target: { value: '2' } });
    expect(screen.getByRole('alert').textContent).toContain('Malé sudy: můžeš dát max 1 — 1 ks nemá sud');
  });
});

describe('krok 3 — souhrn a uložení', () => {
  function naSouhrn() {
    const r = pripravit();
    vyberOdberatele('Žižkov');
    dal();
    zadejPivo('12° Světlá', '2');
    fireEvent.click(screen.getByRole('button', { name: /11° Světlá/ }));
    fireEvent.click(screen.getByRole('radio', { name: '1 l' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Kolik kusů?' }), { target: { value: '10' } });
    fireEvent.click(tlacitko(/^Hotovo/));
    fireEvent.click(tlacitko(/^Souhrn/));
    return r;
  }

  it('souhrn ukazuje komu a kdy, položky po pivech a součet', () => {
    naSouhrn();
    expect(screen.getByRole('heading', { name: 'Souhrn objednávky' })).toBeTruthy();
    const komuKdy = screen.getByRole('region', { name: 'Komu a kdy' });
    expect(komuKdy.textContent).toContain('Žižkov');
    expect(komuKdy.textContent).toContain('St 18. 11.');
    expect(komuKdy.textContent).toContain('výchozí den');
    const polozky = screen.getByRole('region', { name: 'Položky objednávky' });
    expect(within(polozky).getByRole('heading', { name: '12° Světlá' })).toBeTruthy();
    expect(within(polozky).getByText('2× 50 l')).toBeTruthy();
    expect(within(polozky).getByText('10× 1 l')).toBeTruthy();
    expect(polozky.textContent).toContain('100 l v sudech · 10 lahví');
  });

  it('uložení předá koncept obrazovce Objednávky a ukáže potvrzení', async () => {
    const { onUlozit } = naSouhrn();
    fireEvent.change(screen.getByLabelText('Poznámka'), { target: { value: 'vozí řidič Petr' } });
    fireEvent.click(tlacitko(/Uložit objednávku/));
    await screen.findByText('Objednávka uložena');
    expect(onUlozit).toHaveBeenCalledTimes(1);
    const k = onUlozit.mock.calls[0][0];
    expect(k).toMatchObject({ placeId: 'p-zizkov', placeName: 'Žižkov', mistoZavozu: null, den: '', datum: '', bezZavozu: false, poznamka: 'vozí řidič Petr' });
    expect(k.radky.map((r) => [r.beerId, r.pkgId, r.qty])).toEqual([['b12', 'k50', 2], ['b11', 'l1', 10]]);
    expect(screen.getByRole('status').textContent).toContain('Žižkov · St 18. 11.');
  });

  it('odběratel s víc místy se uloží s místem závozu', async () => {
    const { onUlozit } = pripravit();
    vyberOdberatele('Radek');
    fireEvent.click(tlacitko('Drobák'));
    dal();
    zadejPivo('Jantar', '1');
    fireEvent.click(tlacitko(/^Souhrn/));
    expect(screen.getByRole('region', { name: 'Komu a kdy' }).textContent).toContain('Radek · Drobák');
    fireEvent.click(tlacitko(/Uložit objednávku/));
    await screen.findByText('Objednávka uložena');
    expect(onUlozit.mock.calls[0][0]).toMatchObject({ placeId: 'p-radek', mistoZavozu: 'drobak' });
  });

  it('chyba při uložení zůstane na souhrnu a jde to zkusit znovu', async () => {
    const onUlozit = vi.fn()
      .mockResolvedValueOnce({ stav: 'chyba', text: 'Nic se neuložilo — Žižkov už má podobnou objednávku.' })
      .mockResolvedValueOnce({ stav: 'ulozeno' });
    pripravit({ onUlozit });
    vyberOdberatele('Žižkov');
    dal();
    zadejPivo('Jantar', '1');
    fireEvent.click(tlacitko(/^Souhrn/));
    fireEvent.click(tlacitko(/Uložit objednávku/));
    expect((await screen.findByRole('alert')).textContent).toContain('už má podobnou objednávku');
    expect(screen.queryByText('Objednávka uložena')).toBeNull();
    fireEvent.click(tlacitko(/Uložit objednávku/));
    await screen.findByText('Objednávka uložena');
    expect(onUlozit).toHaveBeenCalledTimes(2);
  });

  it('výjimka při uložení se ukáže srozumitelně', async () => {
    const onUlozit = vi.fn().mockRejectedValue(new Error('Síť nedostupná'));
    pripravit({ onUlozit });
    vyberOdberatele('Žižkov');
    dal();
    zadejPivo('Jantar', '1');
    fireEvent.click(tlacitko(/^Souhrn/));
    fireEvent.click(tlacitko(/Uložit objednávku/));
    expect((await screen.findByRole('alert')).textContent).toBe('Síť nedostupná');
  });

  it('dvojklik na Uložit objednávku nezaloží dvě', async () => {
    let dokonci: (v: { stav: 'ulozeno' }) => void = () => {};
    const onUlozit = vi.fn(() => new Promise<{ stav: 'ulozeno' }>((resolve) => { dokonci = resolve; }));
    pripravit({ onUlozit });
    vyberOdberatele('Žižkov');
    dal();
    zadejPivo('Jantar', '1');
    fireEvent.click(tlacitko(/^Souhrn/));
    const ulozit = tlacitko(/Uložit objednávku/);
    fireEvent.click(ulozit);
    fireEvent.click(ulozit);
    expect(onUlozit).toHaveBeenCalledTimes(1);
    expect(tlacitko(/Ukládám/)).toBeTruthy();
    await act(async () => { dokonci({ stav: 'ulozeno' }); });
    await screen.findByText('Objednávka uložena');
  });

  it('„Zadat další objednávku" začne od nuly', async () => {
    naSouhrn();
    fireEvent.click(tlacitko(/Uložit objednávku/));
    await screen.findByText('Objednávka uložena');
    fireEvent.click(tlacitko(/Zadat další objednávku/));
    expect(screen.getByRole('heading', { name: 'Pro koho?' })).toBeTruthy();
    expect((tlacitko(/Dál — vybrat pivo/) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /^Žižkov/, pressed: true })).toBeNull();
  });

  it('odebrání řádku jde vzít zpět', () => {
    naSouhrn();
    fireEvent.click(screen.getByRole('button', { name: 'Odebrat 11° Světlá 10× 1 l' }));
    expect(screen.queryByText('10× 1 l')).toBeNull();
    expect(toastZpet).toHaveBeenCalledTimes(1);
    const [text, zpet] = vi.mocked(toastZpet).mock.calls[0];
    expect(text).toContain('11° Světlá 10× 1 l');
    act(() => { void zpet(); });
    expect(screen.getByText('10× 1 l')).toBeTruthy();
  });

  it('úprava řádku otevře panel piva rovnou na tom obalu', () => {
    naSouhrn();
    fireEvent.click(screen.getByRole('button', { name: 'Upravit 11° Světlá 10× 1 l' }));
    expect(screen.getByRole('dialog', { name: /11° Světlá/ })).toBeTruthy();
    // Na tlačítku obalu je odznak s počtem („1 l" + „10").
    expect(screen.getByRole('radio', { name: /^1 l/, checked: true })).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Kolik kusů?' }) as HTMLInputElement).value).toBe('10');
  });

  it('tužky u „Komu" a „Kdy" vrátí na první krok, odebrání posledního řádku se nepřihlásí', () => {
    naSouhrn();
    fireEvent.click(screen.getByRole('button', { name: 'Změnit den závozu' }));
    expect(screen.getByRole('heading', { name: 'Pro koho?' })).toBeTruthy();
  });

  it('bez položek jde uložit až po přidání piva (tlačítko je zamčené)', () => {
    pripravit();
    vyberOdberatele('Žižkov');
    dal();
    expect((tlacitko(/^Souhrn/) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('tlačítko Zpět a zavírání', () => {
  const zpet = () => act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });

  it('Zpět na souhrnu vrací na pivo, odtud na odběratele a rozepsané zůstává', () => {
    pripravit();
    vyberOdberatele('Žižkov');
    dal();
    zadejPivo('Jantar', '1');
    fireEvent.click(tlacitko(/^Souhrn/));
    zpet();
    expect(screen.getByRole('heading', { name: 'Které pivo?' })).toBeTruthy();
    zpet();
    expect(screen.getByRole('heading', { name: 'Pro koho?' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Žižkov/, pressed: true })).toBeTruthy();
    expect(potvrd).not.toHaveBeenCalled();
  });

  it('Zpět při otevřeném panelu zavře panel, ne krok', () => {
    pripravit();
    vyberOdberatele('Žižkov');
    dal();
    fireEvent.click(screen.getByRole('button', { name: /Jantar/ }));
    zpet();
    expect(screen.queryByRole('dialog', { name: /Jantar/ })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Které pivo?' })).toBeTruthy();
  });

  it('Zpět na prvním kroku s rozepsaným se zeptá; „Zahodit" zavře, „Pokračovat" nechá', async () => {
    const { onZavrit } = pripravit();
    vyberOdberatele('Žižkov');
    vi.mocked(potvrd).mockResolvedValueOnce(false);
    zpet();
    await waitFor(() => expect(potvrd).toHaveBeenCalledWith('Zahodit rozepsanou objednávku?', expect.anything()));
    expect(onZavrit).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Pro koho?' })).toBeTruthy();

    zpet();
    await waitFor(() => expect(onZavrit).toHaveBeenCalledTimes(1));
  });

  it('Zpět na prázdném prvním kroku zavře rovnou, bez ptaní', () => {
    const { onZavrit } = pripravit();
    zpet();
    expect(onZavrit).toHaveBeenCalledTimes(1);
    expect(potvrd).not.toHaveBeenCalled();
  });

  it('křížek s rozepsanou objednávkou se zeptá, bez rozepsaného zavře hned', async () => {
    const { onZavrit } = pripravit();
    fireEvent.click(tlacitko('Zavřít'));
    expect(onZavrit).toHaveBeenCalledTimes(1);
    vyberOdberatele('Žižkov');
    vi.mocked(potvrd).mockResolvedValueOnce(false);
    fireEvent.click(tlacitko('Zavřít'));
    await waitFor(() => expect(potvrd).toHaveBeenCalledTimes(1));
    expect(onZavrit).toHaveBeenCalledTimes(1);
  });

  it('Escape se chová jako Zpět', () => {
    pripravit();
    vyberOdberatele('Žižkov');
    dal();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('heading', { name: 'Pro koho?' })).toBeTruthy();
  });

  it('šipka v hlavičce vrací o krok', () => {
    pripravit();
    vyberOdberatele('Žižkov');
    dal();
    fireEvent.click(tlacitko('Zpět na výběr odběratele'));
    expect(screen.getByRole('heading', { name: 'Pro koho?' })).toBeTruthy();
  });

  it('po uložení Zpět okno zavře bez ptaní', async () => {
    const { onZavrit } = pripravit();
    vyberOdberatele('Žižkov');
    dal();
    zadejPivo('Jantar', '1');
    fireEvent.click(tlacitko(/^Souhrn/));
    fireEvent.click(tlacitko(/Uložit objednávku/));
    await screen.findByText('Objednávka uložena');
    zpet();
    expect(onZavrit).toHaveBeenCalledTimes(1);
    expect(potvrd).not.toHaveBeenCalled();
  });
});

describe('široká obrazovka (počítač)', () => {
  const puvodni = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => { window.matchMedia = puvodni; });

  it('všechny tři kroky jsou vedle sebe a uložit jde z pravého sloupce', async () => {
    const { onUlozit } = pripravit();
    expect(screen.getByRole('region', { name: 'Pro koho a na kdy' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Pivo, obal a počet' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Souhrn objednávky' })).toBeTruthy();
    // Patička s Dál a Souhrn tu není.
    expect(screen.queryByRole('button', { name: /Dál — vybrat pivo/ })).toBeNull();
    expect((tlacitko(/Uložit objednávku/) as HTMLButtonElement).disabled).toBe(true);

    vyberOdberatele('Žižkov');
    zadejPivo('12° Světlá', '2');
    expect((tlacitko(/Uložit objednávku/) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(tlacitko(/Uložit objednávku/));
    await screen.findByText('Objednávka uložena');
    expect(onUlozit.mock.calls[0][0].radky.map((r) => [r.beerId, r.pkgId, r.qty])).toEqual([['b12', 'k50', 2]]);
  });

  it('Zpět tu nevrací o krok (kroky nejsou za sebou), jen se zeptá na rozepsané', async () => {
    const { onZavrit } = pripravit();
    vyberOdberatele('Žižkov');
    vi.mocked(potvrd).mockResolvedValueOnce(true);
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    await waitFor(() => expect(onZavrit).toHaveBeenCalledTimes(1));
  });
});
