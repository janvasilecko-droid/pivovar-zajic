// 🧭 Průvodce zadáním objednávky — okno.
//
// Majitel 18. 11. 2026: „udělej ty objednávky tak jako první návrh". 19. 11.:
// „tady ať je vše na jedné stránce vidět" a „ať je uložit a pod tím uložit
// a odeslat na WhatsApp". Hlídá se celý průchod tak, jak ho projde člověk:
// odběratel a den, pivo (stejný panel jako Fasování) a souhrn leží pod sebou
// na jedné stránce, dole jsou dvě tlačítka uložení; tlačítko Zpět nezahodí
// rozepsané bez zeptání.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ObjednavkaPruvodce } from './ObjednavkaPruvodce';
import type { DataPruvodce, VolbyUlozeni } from './pruvodceTypy';
import { KLIC_REZIMU_PRUVODCE, type KonceptObjednavky } from '../../lib/objednavkaPruvodce';
import type { Beer, Package, Place } from '../../lib/supabase';
import type { Order, OrderItem } from './spolecne';
import { chyba, oznam, potvrd, toastZpet, uspech } from '../../lib/toast';

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

/** Poslední `onZavrit` z `pripravit()` — po uložení se okno samo zavře, žádná potvrzovací stránka. */
let posledniZavrit = vi.fn();
/** Počká, až se po uložení okno zavře (a jen jednou). */
const cekejNaUlozeni = () => waitFor(() => expect(posledniZavrit).toHaveBeenCalledTimes(1));

function pripravit(props: Partial<Parameters<typeof ObjednavkaPruvodce>[0]> = {}) {
  const onUlozit = vi.fn(async (_k: KonceptObjednavky, _v: VolbyUlozeni) => ({ stav: 'ulozeno' as const }));
  const onZavrit = vi.fn();
  posledniZavrit = onZavrit;
  const vysledek = render(<ObjednavkaPruvodce data={data} historie={[]} onUlozit={onUlozit} onZavrit={onZavrit} {...props} />);
  return { ...vysledek, onUlozit, onZavrit };
}

const tlacitko = (nazev: RegExp | string) => screen.getByRole('button', { name: nazev });
const ulozitTl = () => tlacitko('Uložit objednávku') as HTMLButtonElement;
const whatsappTl = () => tlacitko('Uložit a odeslat na WhatsApp') as HTMLButtonElement;
/** Hláška nad tlačítky uložení: co ještě chybí, nebo chyba uložení. */
const hlaseni = () => screen.getByTestId('pruvodce-hlaseni').textContent;
const dlazdice = (jmeno: string) => screen.getByRole('button', { name: new RegExp(`^${jmeno}`) });

/** Odběratel: klepnutí na dlaždici. */
function vyberOdberatele(jmeno: string) {
  fireEvent.click(dlazdice(jmeno));
}

/** Pivo → panel → počet v prvním (předvoleném) obalu → Hotovo. */
function zadejPivo(jmeno: string, pocet: string, bezHotovo = false) {
  // Od začátku názvu: tužka a koš u řádku v souhrnu („Upravit 12° Světlá …") leží teď na stejné stránce.
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${jmeno}`) }));
  const pole = screen.getByRole('textbox', { name: 'Kolik kusů?' });
  fireEvent.change(pole, { target: { value: pocet } });
  if (!bezHotovo) fireEvent.click(tlacitko(/^Hotovo/));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(potvrd).mockResolvedValue(true);
  window.history.replaceState({}, '');
  window.localStorage.clear();
  // Tenhle soubor zkouší JEDNU STRÁNKU (všechny části pod sebou, na počítači vedle sebe). Od 23. 11. 2026 se okno
  // bez zapamatované volby otevírá po krocích — ty zkouší ObjednavkaPruvodce.kroky.test.tsx.
  window.localStorage.setItem(KLIC_REZIMU_PRUVODCE, JSON.stringify('stranka'));
});

describe('odběratel a den (nahoře na stránce)', () => {
  it('nejdřív největší odběratelé podle počtu objednávek (stornované se nepočítají) a uložení je zamčené', () => {
    pripravit();
    expect(screen.getByRole('heading', { name: 'Pro koho?' })).toBeTruthy();
    const dlazdiceJmena = within(screen.getByRole('group', { name: 'Odběratelé' })).getAllByRole('button').map((b) => b.textContent);
    expect(dlazdiceJmena[0]).toMatch(/^Žižkov/);
    expect(dlazdiceJmena[1]).toMatch(/^Radek/);
    expect(dlazdiceJmena[2]).toMatch(/^Seeberg/);
    expect(dlazdiceJmena).toHaveLength(3);
    expect(ulozitTl().disabled).toBe(true);
    expect(whatsappTl().disabled).toBe(true);
    expect(hlaseni()).toBe('Vyber odběratele.');
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

  it('výběr odběratele vyčistí hledání a hláška se posune k pivu', () => {
    pripravit();
    fireEvent.change(screen.getByLabelText('Hledat odběratele'), { target: { value: 'zizkov' } });
    vyberOdberatele('Žižkov');
    expect((screen.getByLabelText('Hledat odběratele') as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('button', { name: /^Žižkov/, pressed: true })).toBeTruthy();
    expect(hlaseni()).toBe('Přidej aspoň jedno pivo.');
    expect(ulozitTl().disabled).toBe(true);
  });

  it('nový odběratel: napsané jméno, které v katalogu není, jde vybrat', () => {
    pripravit();
    fireEvent.change(screen.getByLabelText('Hledat odběratele'), { target: { value: 'U Lípy' } });
    fireEvent.click(screen.getByRole('button', { name: /Nový: U Lípy/ }));
    expect(screen.getByRole('button', { name: /^U Lípy/, pressed: true }).textContent).toContain('nový odběratel');
    expect(hlaseni()).toBe('Přidej aspoň jedno pivo.');
  });

  it('existující jméno se nenabízí jako nový odběratel', () => {
    pripravit();
    fireEvent.change(screen.getByLabelText('Hledat odběratele'), { target: { value: 'žižkov' } });
    expect(screen.queryByRole('button', { name: /Nový:/ })).toBeNull();
  });

  it('„Všichni odběratelé" ukáže pod nejčastějšími i ty, co nikdy neobjednávali', () => {
    pripravit();
    expect(screen.queryByRole('button', { name: /^Mates/ })).toBeNull();
    fireEvent.click(tlacitko(/Všichni odběratelé \(5\)/));
    expect(dlazdice('Mates')).toBeTruthy();
    expect(dlazdice('Restaurace')).toBeTruthy();
    // Nejčastější zůstávají nahoře (majitel 18. 11.: „ať je nahoře primárně 6 nejčastějších").
    expect(within(screen.getByRole('group', { name: 'Odběratelé' })).getAllByRole('button')).toHaveLength(3);
    fireEvent.click(tlacitko('Skrýt abecední seznam'));
    expect(screen.queryByRole('button', { name: /^Mates/ })).toBeNull();
  });

  it('odběratel s víc místy: bez výběru místa se uložit nedá, po výběru ano', () => {
    pripravit();
    vyberOdberatele('Radek');
    expect(screen.getByRole('heading', { name: /Radek vozí na víc míst — kam tentokrát\?/ })).toBeTruthy();
    zadejPivo('Jantar', '1');
    expect(ulozitTl().disabled).toBe(true);
    expect(whatsappTl().disabled).toBe(true);
    expect(hlaseni()).toBe('Vyber, kam se veze (Radek má víc míst).');
    fireEvent.click(tlacitko('Sklad'));
    expect(screen.getByRole('button', { name: 'Sklad', pressed: true })).toBeTruthy();
    expect(ulozitTl().disabled).toBe(false);
    expect(hlaseni()).toBe('');
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

  it('závoz v dalším měsíci se musí potvrdit, jinak se uložit nedá', () => {
    pripravit();
    vyberOdberatele('Žižkov');
    zadejPivo('Jantar', '1');
    fireEvent.change(screen.getByLabelText(/Jiné datum závozu/), { target: { value: '2026-12-02' } });
    expect(ulozitTl().disabled).toBe(true);
    expect(hlaseni()).toBe('Závoz spadá do dalšího měsíce — potvrď to zaškrtnutím.');
    fireEvent.click(screen.getByRole('checkbox', { name: /Potvrzuji, že závoz/ }));
    expect(ulozitTl().disabled).toBe(false);
    expect(hlaseni()).toBe('');
  });
});

describe('Sklad a Drobák patří pod Radka', () => {
  const starySklad: Place = { id: 'p-sklad-stary', name: 'Sklad', note: null, created_at: '', address: null, phone: null, opening_hours: null };
  const sPrezdivkou = { ...data, places: [...places, starySklad] };

  it('starý odběratel „Sklad", který nic neobjednává, se nenabízí ani mezi všemi', () => {
    pripravit({ data: sPrezdivkou });
    fireEvent.click(tlacitko(/Všichni odběratelé \(5\)/));
    expect(screen.queryByRole('button', { name: /^Sklad/ })).toBeNull();
    // Radek je mezi nejčastějšími nahoře i v abecedním seznamu pod nimi.
    expect(screen.getAllByRole('button', { name: /^Radek/ })).toHaveLength(2);
  });

  it('„sklad" najde Radka s místem Sklad a rovnou ho předvybere', () => {
    pripravit({ data: sPrezdivkou });
    fireEvent.change(screen.getByLabelText('Hledat odběratele'), { target: { value: 'sklad' } });
    const dlazdiceRadek = dlazdice('Radek');
    expect(dlazdiceRadek.textContent).toContain('místo: Sklad');
    expect(screen.queryByRole('button', { name: /^Sklad/ })).toBeNull();
    // Nový odběratel „sklad" se nenabízí — je to místo Radka.
    expect(screen.queryByRole('button', { name: /Nový:/ })).toBeNull();

    fireEvent.click(dlazdiceRadek);
    expect(screen.getByRole('button', { name: /^Radek/, pressed: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sklad', pressed: true })).toBeTruthy();
    // Místo je předvybrané, na místo se už nikdo neptá.
    expect(hlaseni()).toBe('Přidej aspoň jedno pivo.');
  });

  it('„drobák" (s diakritikou) předvybere Drobák', () => {
    pripravit({ data: sPrezdivkou });
    fireEvent.change(screen.getByLabelText('Hledat odběratele'), { target: { value: 'drobák' } });
    fireEvent.click(dlazdice('Radek'));
    expect(screen.getByRole('button', { name: 'Drobák', pressed: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sklad', pressed: false })).toBeTruthy();
  });

  it('výběr Radka přes jeho jméno místo nepředvybere', () => {
    pripravit({ data: sPrezdivkou });
    fireEvent.change(screen.getByLabelText('Hledat odběratele'), { target: { value: 'radek' } });
    fireEvent.click(dlazdice('Radek'));
    expect(screen.getByRole('button', { name: 'Sklad', pressed: false })).toBeTruthy();
    expect(hlaseni()).toBe('Vyber, kam se veze (Radek má víc míst).');
  });

  it('starý „Sklad" s objednávkou zůstane vidět (nic se neschová, co se používá)', () => {
    const sObjednavkou = { ...sPrezdivkou, orders: [...orders, objednavka('o-sklad', 'p-sklad-stary', 'Sklad', '2026-11-10')] };
    pripravit({ data: sObjednavkou });
    fireEvent.change(screen.getByLabelText('Hledat odběratele'), { target: { value: 'sklad' } });
    expect(screen.getByRole('button', { name: /^Sklad/ })).toBeTruthy();
    expect(dlazdice('Radek')).toBeTruthy();
  });

  it('uloží se Radek s místem Sklad, když se napsalo „sklad"', async () => {
    const { onUlozit } = pripravit({ data: sPrezdivkou });
    fireEvent.change(screen.getByLabelText('Hledat odběratele'), { target: { value: 'sklad' } });
    fireEvent.click(dlazdice('Radek'));
    zadejPivo('Jantar', '1');
    expect(screen.getByRole('region', { name: 'Komu a kdy' }).textContent).toContain('Radek · Sklad');
    fireEvent.click(tlacitko(/Uložit objednávku/));
    await cekejNaUlozeni();
    expect(onUlozit.mock.calls[0][0]).toMatchObject({ placeId: 'p-radek', placeName: 'Radek', mistoZavozu: 'sklad' });
  });
});

describe('lišta písmen A–Ž pod dlaždicemi (18. 11. 2026: „ať je pod těma písmena A až Z")', () => {
  // 13 odběratelů (od 12 se lišta ukazuje). V české abecedě: # A B Č D E CH M R S Š Ž.
  const dalsi: Place[] = ['7 stupňů Karlín', 'Adam', 'Bořek', 'Čeněk', 'Chlapy z Toužimi', 'Dadali', 'Eigl', 'Šárka']
    .map((name, i) => ({ id: `p-x${i}`, name, note: null, created_at: '', address: null, phone: null, opening_hours: null }));
  const dlouha: DataPruvodce = { ...data, places: [...places, ...dalsi] };
  const PISMENA = ['#', 'A', 'B', 'Č', 'D', 'E', 'CH', 'M', 'R', 'S', 'Š', 'Ž'];

  const lista = () => screen.getByRole('navigation', { name: 'Přeskočit na písmeno' });
  const pismeno = (p: string) => within(lista()).getByRole('button', { name: p });
  const nadpis = (p: string) => screen.getByRole('heading', { name: p });

  const puvodniSkok = window.HTMLElement.prototype.scrollIntoView;
  let skok: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    skok = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = skok as unknown as typeof window.HTMLElement.prototype.scrollIntoView;
  });
  afterEach(() => { window.HTMLElement.prototype.scrollIntoView = puvodniSkok; });
  /** Prvky, na které se skočilo (this volání). */
  const skokNa = () => skok.mock.contexts as HTMLElement[];

  it('u krátkého seznamu (5 odběratelů) lišta není — stačí rolovat', () => {
    pripravit();
    expect(screen.queryByRole('navigation', { name: 'Přeskočit na písmeno' })).toBeNull();
  });

  it('od 12 odběratelů je lišta pod dlaždicemi nejčastějších (a pod „Všichni odběratelé"), s českou abecedou', () => {
    pripravit({ data: dlouha });
    expect(within(lista()).getAllByRole('button').map((b) => b.textContent)).toEqual(PISMENA);
    const dlazdice = screen.getByRole('group', { name: 'Odběratelé' });
    const vsichni = tlacitko(/Všichni odběratelé \(13\)/);
    expect(dlazdice.compareDocumentPosition(vsichni) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(vsichni.compareDocumentPosition(lista()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Sbalený seznam zůstává krátký: jen nejčastější, žádné nadpisy písmen.
    expect(within(dlazdice).getAllByRole('button')).toHaveLength(3);
    expect(screen.queryByRole('heading', { name: 'CH' })).toBeNull();
  });

  it('každé písmeno je trefitelné prstem (výška 44 px) a lišta se dá posouvat do stran', () => {
    pripravit({ data: dlouha });
    for (const b of within(lista()).getAllByRole('button')) expect(b.className).toContain('h-11');
    expect(lista().className).toContain('overflow-x-auto');
  });

  it('klepnutí na písmeno rozbalí seznam po písmenech a skočí na nadpis toho písmena', async () => {
    pripravit({ data: dlouha });
    fireEvent.click(pismeno('CH'));
    expect(nadpis('CH')).toBeTruthy();
    expect(within(nadpis('CH').parentElement!).getByRole('button', { name: /^Chlapy z Toužimi/ })).toBeTruthy();
    await waitFor(() => expect(skokNa()).toContain(nadpis('CH')));
    expect(skok).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    // Rozbalené: tlačítko se mění na „Skrýt abecední seznam" a lišta zůstává.
    expect(tlacitko('Skrýt abecední seznam')).toBeTruthy();
    expect(lista()).toBeTruthy();
  });

  it('nejčastější odběratelé zůstávají nahoře i při rozbalené abecedě (nad lištou a seznamem)', () => {
    pripravit({ data: dlouha });
    fireEvent.click(pismeno('R'));
    const dlazdice = screen.getByRole('group', { name: 'Odběratelé' });
    expect(within(dlazdice).getAllByRole('button').map((b) => b.textContent?.replace(/\s*(obvykle|bez|Sklad).*$/, '').trim())).toEqual(['Žižkov', 'Radek', 'Seeberg']);
    expect(dlazdice.compareDocumentPosition(lista()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dlazdice.compareDocumentPosition(nadpis('R')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('vybraný odběratel, který není mezi nejčastějšími, je navrchu a při rozbalené abecedě', () => {
    pripravit({ data: dlouha });
    fireEvent.click(pismeno('D'));
    fireEvent.click(within(nadpis('D').parentElement!).getByRole('button', { name: /^Dadali/ }));
    fireEvent.click(pismeno('M'));
    const dlazdice = within(screen.getByRole('group', { name: 'Odběratelé' })).getAllByRole('button');
    expect(dlazdice[0].textContent).toContain('Dadali');
    expect(dlazdice[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('rozbalený seznam má nadpis pro každé písmeno z lišty a odběratele pod správným písmenem', () => {
    pripravit({ data: dlouha });
    fireEvent.click(tlacitko(/Všichni odběratelé \(13\)/));
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(PISMENA);
    const pod = (p: string) => within(nadpis(p).parentElement!).getAllByRole('button').map((b) => b.textContent?.replace(/\s*(obvykle|bez|Sklad).*$/, '').trim());
    expect(pod('R')).toEqual(['Radek', 'Restaurace']);
    expect(pod('Ž')).toEqual(['Žižkov']);
    expect(pod('#')).toEqual(['7 stupňů Karlín']);
    expect(pod('Č')).toEqual(['Čeněk']);
  });

  it('je-li seznam rozbalený, další písmeno jen přeskočí (nic se nesbaluje)', async () => {
    pripravit({ data: dlouha });
    fireEvent.click(tlacitko(/Všichni odběratelé \(13\)/));
    skok.mockClear();
    fireEvent.click(pismeno('M'));
    expect(skok).toHaveBeenCalledTimes(1);
    expect(skokNa()[0]).toBe(nadpis('M'));
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(PISMENA.length);
  });

  it('výběr z rozbaleného seznamu seznam sbalí, vybraný je nahoře a obsah se vrátí na začátek', async () => {
    pripravit({ data: dlouha });
    fireEvent.click(pismeno('M'));
    expect(within(screen.getByRole('group', { name: 'Odběratelé' })).getAllByRole('button')).toHaveLength(3);
    fireEvent.click(within(nadpis('M').parentElement!).getByRole('button', { name: /^Mates/ }));
    // Seznam je zase krátký: vybraný odběratel navrch, pak nejčastější.
    expect(screen.queryByRole('heading', { name: 'M' })).toBeNull();
    const dlazdice = within(screen.getByRole('group', { name: 'Odběratelé' })).getAllByRole('button');
    expect(dlazdice).toHaveLength(4);
    expect(dlazdice[0].textContent).toContain('Mates');
    expect(dlazdice[0].getAttribute('aria-pressed')).toBe('true');
    expect(tlacitko(/Všichni odběratelé \(13\)/)).toBeTruthy();
    await waitFor(() => expect(skokNa()).toContain(screen.getByTestId('pruvodce-odberatel')));
    // Odběratel je vybraný, zbývá pivo.
    expect(hlaseni()).toBe('Přidej aspoň jedno pivo.');
  });

  it('výběr dlaždice ze sbaleného seznamu nic neposouvá', () => {
    pripravit({ data: dlouha });
    fireEvent.click(dlazdice('Žižkov'));
    expect(skok).not.toHaveBeenCalled();
  });

  it('psaní do hledání schová lištu i nadpisy písmen a ukáže jen nalezené', () => {
    pripravit({ data: dlouha });
    fireEvent.click(tlacitko(/Všichni odběratelé \(13\)/));
    fireEvent.change(screen.getByLabelText('Hledat odběratele'), { target: { value: 'dadali' } });
    expect(screen.queryByRole('navigation', { name: 'Přeskočit na písmeno' })).toBeNull();
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull();
    expect(within(screen.getByRole('group', { name: 'Odběratelé' })).getAllByRole('button').map((b) => b.textContent)).toEqual([expect.stringContaining('Dadali')]);
    // Po smazání hledání je seznam zase rozbalený, jak byl.
    fireEvent.change(screen.getByLabelText('Hledat odběratele'), { target: { value: '' } });
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(PISMENA.length);
  });

  it('„Skrýt abecední seznam" sbalí seznam bez výběru', () => {
    pripravit({ data: dlouha });
    fireEvent.click(pismeno('S'));
    fireEvent.click(tlacitko('Skrýt abecední seznam'));
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull();
    expect(within(screen.getByRole('group', { name: 'Odběratelé' })).getAllByRole('button')).toHaveLength(3);
  });

  it('nový odběratel, který je vybraný, zůstává vidět i v rozbaleném seznamu', () => {
    pripravit({ data: dlouha });
    fireEvent.change(screen.getByLabelText('Hledat odběratele'), { target: { value: 'Zbrusu nový' } });
    fireEvent.click(tlacitko(/^Nový: Zbrusu nový/));
    fireEvent.click(pismeno('A'));
    expect(screen.getByRole('button', { name: /^Zbrusu nový/, pressed: true })).toBeTruthy();
    expect(nadpis('A')).toBeTruthy();
  });

  it('lupa je součástí řádku s polem, ne položená přes něj (na telefonu ležela přes „Hledat")', () => {
    pripravit();
    const pole = screen.getByLabelText('Hledat odběratele');
    const radek = pole.parentElement!;
    expect(radek.className).toContain('flex');
    const lupa = radek.querySelector('svg')!;
    expect(lupa).toBeTruthy();
    expect(lupa.getAttribute('class')).not.toContain('absolute');
    expect(radek.className).not.toContain('relative');
  });
});

describe('pivo (stejný panel jako Fasování)', () => {
  function naPivo(odberatel = 'Žižkov') {
    const r = pripravit();
    vyberOdberatele(odberatel);
    return r;
  }

  it('dlaždice piv jsou na stránce rovnou pod odběratelem, souhrn říká, že nic není, a uložit nejde', () => {
    naPivo();
    expect(screen.getByRole('heading', { name: 'Které pivo?' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /12° Světlá/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Jantar/ })).toBeTruthy();
    expect(screen.getByText('Zatím žádné pivo — vyber ho výše.')).toBeTruthy();
    expect(ulozitTl().disabled).toBe(true);
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

  it('číslo se zapíše hned a po Hotovo je na dlaždici „2×50", v souhrnu pod tím je řádek a uložit už jde', () => {
    naPivo();
    zadejPivo('12° Světlá', '2');
    expect(screen.queryByRole('dialog', { name: /12° Světlá/ })).toBeNull();
    expect(screen.getByRole('button', { name: /12° Světlá.*2×50/ })).toBeTruthy();
    const polozky = screen.getByRole('region', { name: 'Položky objednávky' });
    expect(within(polozky).getByText('2× 50 l')).toBeTruthy();
    expect(polozky.textContent).toContain('Celkem: 100 l v sudech');
    expect(ulozitTl().disabled).toBe(false);
  });

  it('„+ další obal" přidá druhou velikost téhož piva', () => {
    naPivo();
    fireEvent.click(screen.getByRole('button', { name: /12° Světlá/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Kolik kusů?' }), { target: { value: '2' } });
    fireEvent.click(tlacitko(/\+ další obal/));
    fireEvent.change(screen.getByRole('textbox', { name: 'Kolik kusů?' }), { target: { value: '1' } });
    fireEvent.click(tlacitko(/^Hotovo/));
    expect(screen.getByRole('button', { name: /12° Světlá.*2×50, 1×30/ })).toBeTruthy();
    const polozky = screen.getByRole('region', { name: 'Položky objednávky' });
    expect(within(polozky).getByText('2× 50 l')).toBeTruthy();
    expect(within(polozky).getByText('1× 30 l')).toBeTruthy();
  });

  it('nula počet zase smaže a souhrn se vrátí na „zatím žádné pivo"', () => {
    naPivo();
    zadejPivo('12° Světlá', '2');
    fireEvent.click(screen.getByRole('button', { name: /^12° Světlá/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Kolik kusů?' }), { target: { value: '' } });
    fireEvent.click(tlacitko(/^Hotovo/));
    expect(screen.getByText('Zatím žádné pivo — vyber ho výše.')).toBeTruthy();
    expect(ulozitTl().disabled).toBe(true);
  });

  it('nejčastěji objednávaný obal piva se nabídne první (podle historie)', () => {
    const historie = [
      { beer_id: 'b11', package_id: 'l1', quantity: 10, entry_date: '2026-11-10' },
      { beer_id: 'b11', package_id: 'l1', quantity: 12, entry_date: '2026-11-04' },
    ];
    pripravit({ historie });
    vyberOdberatele('Žižkov');
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
    fireEvent.click(screen.getByRole('button', { name: /12° Světlá/ }));
    fireEvent.click(screen.getByRole('radio', { name: '20 l' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Kolik kusů?' }), { target: { value: '2' } });
    expect(screen.getByRole('alert').textContent).toContain('Malé sudy: můžeš dát max 1 — 1 ks nemá sud');
  });
});

describe('souhrn a uložení (pod pivem na stejné stránce)', () => {
  function vyplnena() {
    const r = pripravit();
    vyberOdberatele('Žižkov');
    zadejPivo('12° Světlá', '2');
    fireEvent.click(screen.getByRole('button', { name: /11° Světlá/ }));
    fireEvent.click(screen.getByRole('radio', { name: '1 l' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Kolik kusů?' }), { target: { value: '10' } });
    fireEvent.click(tlacitko(/^Hotovo/));
    return r;
  }

  it('souhrn ukazuje komu a kdy, položky po pivech a součet', () => {
    vyplnena();
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

  it('uložení předá koncept obrazovce Objednávky, okno se zavře a naskočí krátké potvrzení', async () => {
    const { onUlozit } = vyplnena();
    fireEvent.change(screen.getByLabelText('Poznámka'), { target: { value: 'vozí řidič Petr' } });
    fireEvent.click(tlacitko(/Uložit objednávku/));
    await cekejNaUlozeni();
    expect(onUlozit).toHaveBeenCalledTimes(1);
    const k = onUlozit.mock.calls[0][0];
    expect(k).toMatchObject({ placeId: 'p-zizkov', placeName: 'Žižkov', mistoZavozu: null, den: '', datum: '', bezZavozu: false, poznamka: 'vozí řidič Petr' });
    expect(k.radky.map((r) => [r.beerId, r.pkgId, r.qty])).toEqual([['b12', 'k50', 2], ['b11', 'l1', 10]]);
    // Obyčejné uložení: bez odeslání na WhatsApp.
    expect(onUlozit.mock.calls[0][1]).toEqual({ whatsapp: false });
    expect(uspech).toHaveBeenCalledWith('Objednávka uložena: Žižkov · St 18. 11.');
    // Žádná potvrzovací stránka s tlačítky „Zadat další objednávku“ a „Hotovo“.
    expect(screen.queryByText('Objednávka uložena')).toBeNull();
    expect(screen.queryByRole('button', { name: /Zadat další objednávku/ })).toBeNull();
  });

  it('odběratel s víc místy se uloží s místem závozu', async () => {
    const { onUlozit } = pripravit();
    vyberOdberatele('Radek');
    fireEvent.click(tlacitko('Drobák'));
    zadejPivo('Jantar', '1');
    expect(screen.getByRole('region', { name: 'Komu a kdy' }).textContent).toContain('Radek · Drobák');
    fireEvent.click(tlacitko(/Uložit objednávku/));
    await cekejNaUlozeni();
    expect(onUlozit.mock.calls[0][0]).toMatchObject({ placeId: 'p-radek', mistoZavozu: 'drobak' });
  });

  it('chyba při uložení zůstane na stránce nad tlačítky a jde to zkusit znovu', async () => {
    const onUlozit = vi.fn()
      .mockResolvedValueOnce({ stav: 'chyba', text: 'Nic se neuložilo — Žižkov už má podobnou objednávku.' })
      .mockResolvedValueOnce({ stav: 'ulozeno' });
    pripravit({ onUlozit });
    vyberOdberatele('Žižkov');
    zadejPivo('Jantar', '1');
    fireEvent.click(tlacitko(/Uložit objednávku/));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('už má podobnou objednávku');
    // Chyba je v hlášce přímo nad tlačítky, ať ji člověk neminul.
    expect(screen.getByTestId('pruvodce-hlaseni').contains(alert)).toBe(true);
    // Při chybě okno zůstává otevřené a nic se nepotvrzuje.
    expect(posledniZavrit).not.toHaveBeenCalled();
    expect(uspech).not.toHaveBeenCalled();
    // Obě tlačítka jsou zase k dispozici.
    expect(ulozitTl().disabled).toBe(false);
    expect(whatsappTl().disabled).toBe(false);
    fireEvent.click(tlacitko(/Uložit objednávku/));
    await cekejNaUlozeni();
    expect(onUlozit).toHaveBeenCalledTimes(2);
  });

  it('výjimka při uložení se ukáže srozumitelně', async () => {
    const onUlozit = vi.fn().mockRejectedValue(new Error('Síť nedostupná'));
    pripravit({ onUlozit });
    vyberOdberatele('Žižkov');
    zadejPivo('Jantar', '1');
    fireEvent.click(tlacitko(/Uložit objednávku/));
    expect((await screen.findByRole('alert')).textContent).toBe('Síť nedostupná');
  });

  it('dvojklik na Uložit objednávku nezaloží dvě', async () => {
    let dokonci: (v: { stav: 'ulozeno' }) => void = () => {};
    const onUlozit = vi.fn(() => new Promise<{ stav: 'ulozeno' }>((resolve) => { dokonci = resolve; }));
    pripravit({ onUlozit });
    vyberOdberatele('Žižkov');
    zadejPivo('Jantar', '1');
    const ulozit = tlacitko(/Uložit objednávku/);
    fireEvent.click(ulozit);
    fireEvent.click(ulozit);
    expect(onUlozit).toHaveBeenCalledTimes(1);
    expect(tlacitko(/Ukládám/)).toBeTruthy();
    // Druhé tlačítko je během ukládání zamčené — objednávka se nezaloží dvakrát ani přes WhatsApp.
    expect(whatsappTl().disabled).toBe(true);
    fireEvent.click(whatsappTl());
    expect(onUlozit).toHaveBeenCalledTimes(1);
    await act(async () => { dokonci({ stav: 'ulozeno' }); });
    await cekejNaUlozeni();
  });

  it('dvojklik na Uložit a odeslat na WhatsApp nezaloží dvě a „Ukládám…" je jen na tom stisknutém', async () => {
    let dokonci: (v: { stav: 'ulozeno' }) => void = () => {};
    const onUlozit = vi.fn((_k: KonceptObjednavky, _v: VolbyUlozeni) => new Promise<{ stav: 'ulozeno' }>((resolve) => { dokonci = resolve; }));
    pripravit({ onUlozit });
    vyberOdberatele('Žižkov');
    zadejPivo('Jantar', '1');
    const whatsapp = whatsappTl();
    fireEvent.click(whatsapp);
    fireEvent.click(whatsapp);
    fireEvent.click(ulozitTl());
    expect(onUlozit).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('button', { name: /Ukládám/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Ukládám/ }).className).toContain('btn-emerald');
    expect(ulozitTl().textContent).toContain('Uložit objednávku');
    await act(async () => { dokonci({ stav: 'ulozeno' }); });
    await cekejNaUlozeni();
  });

  it('dvě tlačítka: nahoře Uložit objednávku, pod ním Uložit a odeslat na WhatsApp (19. 11.)', () => {
    vyplnena();
    const patka = screen.getByTestId('pruvodce-hlaseni').parentElement!;
    const tlacitka = within(patka).getAllByRole('button').map((b) => b.textContent?.trim());
    expect(tlacitka).toEqual(['Uložit objednávku', 'Uložit a odeslat na WhatsApp']);
    expect(ulozitTl().disabled).toBe(false);
    expect(whatsappTl().disabled).toBe(false);
  });

  it('Uložit a odeslat na WhatsApp předá uložení příznak whatsapp a okno se stejně zavře s potvrzením', async () => {
    const { onUlozit } = vyplnena();
    fireEvent.click(whatsappTl());
    await cekejNaUlozeni();
    expect(onUlozit).toHaveBeenCalledTimes(1);
    expect(onUlozit.mock.calls[0][1]).toEqual({ whatsapp: true });
    expect(onUlozit.mock.calls[0][0]).toMatchObject({ placeId: 'p-zizkov', placeName: 'Žižkov' });
    expect(uspech).toHaveBeenCalledWith('Objednávka uložena: Žižkov · St 18. 11.');
  });

  it('Uložit a odeslat na WhatsApp při chybě uložení nic nepotvrdí; zkusit jde obojím tlačítkem', async () => {
    const onUlozit = vi.fn()
      .mockResolvedValueOnce({ stav: 'chyba', text: 'Nic se neuložilo.' })
      .mockResolvedValueOnce({ stav: 'ulozeno' });
    pripravit({ onUlozit });
    vyberOdberatele('Žižkov');
    zadejPivo('Jantar', '1');
    fireEvent.click(whatsappTl());
    expect((await screen.findByRole('alert')).textContent).toBe('Nic se neuložilo.');
    expect(posledniZavrit).not.toHaveBeenCalled();
    expect(uspech).not.toHaveBeenCalled();
    fireEvent.click(ulozitTl());
    await cekejNaUlozeni();
    expect(onUlozit.mock.calls.map((c) => c[1])).toEqual([{ whatsapp: true }, { whatsapp: false }]);
  });

  it('výjimka při Uložit a odeslat na WhatsApp se ukáže srozumitelně', async () => {
    const onUlozit = vi.fn().mockRejectedValue(new Error('Síť nedostupná'));
    pripravit({ onUlozit });
    vyberOdberatele('Žižkov');
    zadejPivo('Jantar', '1');
    fireEvent.click(whatsappTl());
    expect((await screen.findByRole('alert')).textContent).toBe('Síť nedostupná');
    expect(whatsappTl().textContent).toContain('Uložit a odeslat na WhatsApp');
  });

  it('bez dokončené objednávky se nedá uložit ani odeslat (nic nevolá uložení)', () => {
    const { onUlozit } = pripravit();
    fireEvent.click(ulozitTl());
    fireEvent.click(whatsappTl());
    vyberOdberatele('Žižkov');
    fireEvent.click(ulozitTl());
    fireEvent.click(whatsappTl());
    expect(onUlozit).not.toHaveBeenCalled();
  });

  it('po uložení se okno samo zavře a žádná potvrzovací stránka se neukáže (19. 11.: „tohle se nemusí zobrazovat")', async () => {
    const { onZavrit } = vyplnena();
    fireEvent.click(ulozitTl());
    await cekejNaUlozeni();
    expect(onZavrit).toHaveBeenCalledTimes(1);
    // Jen krátké potvrzení (toast): kdo, kdy.
    expect(uspech).toHaveBeenCalledTimes(1);
    expect(uspech).toHaveBeenCalledWith('Objednávka uložena: Žižkov · St 18. 11.');
    expect(screen.queryByText('Objednávka uložena')).toBeNull();
    expect(screen.queryByRole('button', { name: /Zadat další objednávku/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hotovo' })).toBeNull();
    // Stránka s odběratelem, pivem a souhrnem zůstala, jak byla — o zavření se stará obrazovka Objednávky.
    expect(screen.getByRole('heading', { name: 'Souhrn objednávky' })).toBeTruthy();
  });

  it('potvrzení nese i místo závozu', async () => {
    pripravit();
    vyberOdberatele('Radek');
    fireEvent.click(tlacitko('Drobák'));
    zadejPivo('Jantar', '1');
    fireEvent.click(ulozitTl());
    await cekejNaUlozeni();
    expect(uspech).toHaveBeenCalledWith('Objednávka uložena: Radek · Drobák · St 18. 11.');
  });

  it('odebrání řádku jde vzít zpět', () => {
    vyplnena();
    fireEvent.click(screen.getByRole('button', { name: 'Odebrat 11° Světlá 10× 1 l' }));
    expect(screen.queryByText('10× 1 l')).toBeNull();
    expect(toastZpet).toHaveBeenCalledTimes(1);
    const [text, zpet] = vi.mocked(toastZpet).mock.calls[0];
    expect(text).toContain('11° Světlá 10× 1 l');
    act(() => { void zpet(); });
    expect(screen.getByText('10× 1 l')).toBeTruthy();
  });

  it('úprava řádku otevře panel piva rovnou na tom obalu', () => {
    vyplnena();
    fireEvent.click(screen.getByRole('button', { name: 'Upravit 11° Světlá 10× 1 l' }));
    expect(screen.getByRole('dialog', { name: /11° Světlá/ })).toBeTruthy();
    // Na tlačítku obalu je odznak s počtem („1 l" + „10").
    expect(screen.getByRole('radio', { name: /^1 l/, checked: true })).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Kolik kusů?' }) as HTMLInputElement).value).toBe('10');
  });

  it('tužky u „Komu" a „Kdy" přerolují stránku k odběrateli a ke dnům závozu (nic se nepřepíná)', () => {
    const puvodniSkok = window.HTMLElement.prototype.scrollIntoView;
    const skok = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = skok as unknown as typeof window.HTMLElement.prototype.scrollIntoView;
    try {
      vyplnena();
      fireEvent.click(screen.getByRole('button', { name: 'Změnit den závozu' }));
      expect(skok).toHaveBeenCalledTimes(1);
      expect(skok.mock.contexts[0]).toBe(document.getElementById('pruvodce-kdy'));
      expect(skok).toHaveBeenLastCalledWith({ behavior: 'smooth', block: 'start' });

      fireEvent.click(screen.getByRole('button', { name: 'Změnit odběratele' }));
      expect(skok).toHaveBeenCalledTimes(2);
      expect(skok.mock.contexts[1]).toBe(screen.getByLabelText('Hledat odběratele'));
    } finally {
      window.HTMLElement.prototype.scrollIntoView = puvodniSkok;
    }
    // Nic se nezavřelo, nic se nezahodilo.
    expect(screen.getByRole('button', { name: /^Žižkov/, pressed: true })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Souhrn objednávky' })).toBeTruthy();
  });

  it('bez položek jde uložit až po přidání piva (obě tlačítka jsou do té doby zamčená)', () => {
    pripravit();
    vyberOdberatele('Žižkov');
    expect(ulozitTl().disabled).toBe(true);
    expect(whatsappTl().disabled).toBe(true);
    expect(hlaseni()).toBe('Přidej aspoň jedno pivo.');
    zadejPivo('Jantar', '1');
    expect(ulozitTl().disabled).toBe(false);
    expect(whatsappTl().disabled).toBe(false);
  });
});

describe('jedna stránka místo tří kroků (19. 11. 2026)', () => {
  it('odběratel, pivo a souhrn jsou na stránce najednou a pod sebou v tomto pořadí', () => {
    pripravit();
    const pro = screen.getByRole('heading', { name: 'Pro koho?' });
    const kdy = screen.getByRole('heading', { name: 'Kdy se veze?' });
    const pivo = screen.getByRole('heading', { name: 'Které pivo?' });
    const souhrn = screen.getByRole('heading', { name: 'Souhrn objednávky' });
    const jeZa = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(jeZa(pro, kdy)).toBe(true);
    expect(jeZa(kdy, pivo)).toBe(true);
    expect(jeZa(pivo, souhrn)).toBe(true);
    // Tlačítka uložení jsou až za celou stránkou (v patičce okna).
    expect(jeZa(souhrn, ulozitTl())).toBe(true);
    expect(jeZa(ulozitTl(), whatsappTl())).toBe(true);
  });

  it('žádné kroky: ani Dál, ani Souhrn, ani šipka Zpět o krok, ani „1 ze 3", ani „Přidat další pivo"', () => {
    pripravit();
    vyberOdberatele('Žižkov');
    zadejPivo('Jantar', '1');
    expect(screen.queryByRole('button', { name: /^Dál/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Souhrn/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Zpět na výběr odběratele' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Přidat další pivo/ })).toBeNull();
    expect(screen.queryByText(/\d ze 3/)).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('v hlavičce je křížek, název a přepínač způsobu; vybraný odběratel s dnem je vidět vpravo', () => {
    pripravit();
    const hlavicka = screen.getByRole('banner');
    // Od 23. 11. 2026 je u křížku i přepínač „Po krocích" (jedna stránka je volba, ne jediný způsob).
    expect(within(hlavicka).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Zavřít', 'Po krocích']);
    expect(within(hlavicka).getByRole('heading', { name: 'Nová objednávka' })).toBeTruthy();
    vyberOdberatele('Žižkov');
    expect(hlavicka.textContent).toContain('Žižkov · St 18. 11.');
  });

  it('tlačítka uložení jsou pořád k dispozici — i s otevřeným dlouhým seznamem odběratelů', () => {
    pripravit();
    fireEvent.click(tlacitko(/Všichni odběratelé \(5\)/));
    expect(ulozitTl()).toBeTruthy();
    expect(whatsappTl()).toBeTruthy();
    // Patička s tlačítky leží mimo rolovací plochu, takže nikdy nescrolluje pryč.
    const patka = ulozitTl().closest('footer')!;
    expect(patka).toBeTruthy();
    expect(screen.getByRole('main').contains(patka)).toBe(false);
  });
});

describe('tlačítko Zpět a zavírání', () => {
  const zpet = () => act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });

  it('Zpět s odběratelem a pivem nevrací po krocích — rovnou se zeptá a „Pokračovat" nechá všechno, jak bylo', async () => {
    const { onZavrit } = pripravit();
    vyberOdberatele('Žižkov');
    zadejPivo('Jantar', '1');
    vi.mocked(potvrd).mockResolvedValueOnce(false);
    zpet();
    await waitFor(() => expect(potvrd).toHaveBeenCalledTimes(1));
    expect(onZavrit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^Žižkov/, pressed: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Jantar.*1×50/ })).toBeTruthy();
  });

  it('Zpět při otevřeném panelu zavře jen panel — okno ani rozepsané se nezeptá', () => {
    pripravit();
    vyberOdberatele('Žižkov');
    fireEvent.click(screen.getByRole('button', { name: /Jantar/ }));
    zpet();
    expect(screen.queryByRole('dialog', { name: /Jantar/ })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Které pivo?' })).toBeTruthy();
    expect(potvrd).not.toHaveBeenCalled();
  });

  it('Zpět s rozepsaným se zeptá; „Zahodit" zavře, „Pokračovat" nechá', async () => {
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

  it('Zpět na prázdné stránce zavře rovnou, bez ptaní', () => {
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

  it('Escape se chová jako Zpět: s rozepsaným se zeptá, na prázdné stránce zavře', async () => {
    const { onZavrit } = pripravit();
    vyberOdberatele('Žižkov');
    vi.mocked(potvrd).mockResolvedValueOnce(false);
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(potvrd).toHaveBeenCalledTimes(1));
    expect(onZavrit).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Pro koho?' })).toBeTruthy();
  });

  it('Escape na prázdné stránce zavře okno bez ptaní', () => {
    const { onZavrit } = pripravit();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onZavrit).toHaveBeenCalledTimes(1);
    expect(potvrd).not.toHaveBeenCalled();
  });

  it('během ukládání Zpět ani Escape okno nezavřou (čeká se na výsledek)', async () => {
    let dokonci: (v: { stav: 'ulozeno' }) => void = () => {};
    const onUlozit = vi.fn(() => new Promise<{ stav: 'ulozeno' }>((resolve) => { dokonci = resolve; }));
    const { onZavrit } = pripravit({ onUlozit });
    vyberOdberatele('Žižkov');
    zadejPivo('Jantar', '1');
    fireEvent.click(ulozitTl());
    zpet();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onZavrit).not.toHaveBeenCalled();
    expect(potvrd).not.toHaveBeenCalled();
    await act(async () => { dokonci({ stav: 'ulozeno' }); });
    await cekejNaUlozeni();
    expect(potvrd).not.toHaveBeenCalled();
  });
});

describe('půjčení výčepu — nenápadné pole v souhrnu', () => {
  const zpet = () => act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
  const REZERVACE = { id: 'rez-1', popis: 'Výčep 2 · 20.–22. 11.' };

  function vyplnenaVycep(props: Partial<Parameters<typeof ObjednavkaPruvodce>[0]> = {}) {
    const vyberVycep = vi.fn(async () => REZERVACE as { id: string; popis: string } | null);
    const zrusVycep = vi.fn(async (_id: string) => null as string | null);
    const r = pripravit({ vyberVycep, zrusVycep, ...props });
    vyberOdberatele('Žižkov');
    zadejPivo('Jantar', '1');
    return { ...r, vyberVycep, zrusVycep };
  }
  const pole = () => screen.getByRole('checkbox', { name: 'Půjčení výčepu' }) as HTMLInputElement;
  const stav = () => screen.getByTestId('pruvodce-vycep').textContent;

  it('bez okna rezervace se pole vůbec nenabízí', () => {
    pripravit();
    vyberOdberatele('Žižkov');
    zadejPivo('Jantar', '1');
    expect(screen.queryByRole('checkbox', { name: 'Půjčení výčepu' })).toBeNull();
    expect(screen.queryByTestId('pruvodce-vycep')).toBeNull();
  });

  it('pole je odškrtnuté a nic o výčepu nehlásí', () => {
    vyplnenaVycep();
    expect(pole().checked).toBe(false);
    expect(stav()).toBe('Půjčení výčepu');
  });

  it('zaškrtnutí otevře okno rezervace s odběratelem, dnem závozu a poznámkou', async () => {
    const { vyberVycep } = vyplnenaVycep();
    fireEvent.change(screen.getByLabelText('Poznámka'), { target: { value: 'jednokohout na sobotu' } });
    fireEvent.click(pole());
    await waitFor(() => expect(vyberVycep).toHaveBeenCalledTimes(1));
    expect(vyberVycep).toHaveBeenCalledWith({ zakaznik: 'Žižkov', datum: DNES, poznamka: 'jednokohout na sobotu' });
    expect(await screen.findByText('Rezervováno: Výčep 2 · 20.–22. 11.')).toBeTruthy();
    expect(pole().checked).toBe(true);
  });

  it('se zvoleným dnem závozu se rezervace navrhuje na ten den', async () => {
    const vyberVycep = vi.fn(async () => null);
    pripravit({ vyberVycep, zrusVycep: vi.fn(async () => null) });
    vyberOdberatele('Žižkov');
    fireEvent.change(screen.getByLabelText(/Jiné datum závozu/), { target: { value: '2026-11-21' } });
    zadejPivo('Jantar', '1');
    fireEvent.click(pole());
    await waitFor(() => expect(vyberVycep).toHaveBeenCalledWith(expect.objectContaining({ datum: '2026-11-21' })));
  });

  it('potvrzená rezervace se uloží s konceptem, ať se naváže na objednávku', async () => {
    const { onUlozit } = vyplnenaVycep();
    fireEvent.click(pole());
    await screen.findByText('Rezervováno: Výčep 2 · 20.–22. 11.');
    fireEvent.click(tlacitko(/Uložit objednávku/));
    await cekejNaUlozeni();
    expect(onUlozit.mock.calls[0][0]).toMatchObject({ vycep: true, vycepRezervace: REZERVACE });
  });

  it('okno zavřené bez rezervace nechá pole zaškrtnuté a řekne, že se otevře po uložení', async () => {
    const { onUlozit } = vyplnenaVycep({ vyberVycep: vi.fn(async () => null) });
    fireEvent.click(pole());
    await screen.findByText('Okno rezervace se otevře po uložení objednávky');
    expect(pole().checked).toBe(true);
    fireEvent.click(tlacitko(/Uložit objednávku/));
    await cekejNaUlozeni();
    expect(onUlozit.mock.calls[0][0]).toMatchObject({ vycep: true, vycepRezervace: null });
  });

  it('bez zaškrtnutí se uloží bez výčepu', async () => {
    const { onUlozit, vyberVycep } = vyplnenaVycep();
    fireEvent.click(tlacitko(/Uložit objednávku/));
    await cekejNaUlozeni();
    expect(vyberVycep).not.toHaveBeenCalled();
    expect(onUlozit.mock.calls[0][0]).toMatchObject({ vycep: false, vycepRezervace: null });
  });

  it('odškrtnutí zruší rezervaci, která už je v databázi', async () => {
    const { zrusVycep, onUlozit } = vyplnenaVycep();
    fireEvent.click(pole());
    await screen.findByText('Rezervováno: Výčep 2 · 20.–22. 11.');
    fireEvent.click(pole());
    await waitFor(() => expect(zrusVycep).toHaveBeenCalledWith('rez-1'));
    expect(pole().checked).toBe(false);
    expect(stav()).toBe('Půjčení výčepu');
    fireEvent.click(tlacitko(/Uložit objednávku/));
    await cekejNaUlozeni();
    expect(onUlozit.mock.calls[0][0]).toMatchObject({ vycep: false, vycepRezervace: null });
  });

  it('odškrtnutí zaškrtnutého pole bez rezervace nic nemaže', async () => {
    const { zrusVycep } = vyplnenaVycep({ vyberVycep: vi.fn(async () => null) });
    fireEvent.click(pole());
    await screen.findByText('Okno rezervace se otevře po uložení objednávky');
    fireEvent.click(pole());
    await waitFor(() => expect(pole().checked).toBe(false));
    expect(zrusVycep).not.toHaveBeenCalled();
  });

  it('když se rezervaci nepodaří zrušit, ohlásí se to (pole se odškrtne tak jako tak)', async () => {
    vyplnenaVycep({ zrusVycep: vi.fn(async () => 'Síť nedostupná') });
    fireEvent.click(pole());
    await screen.findByText('Rezervováno: Výčep 2 · 20.–22. 11.');
    fireEvent.click(pole());
    await waitFor(() => expect(chyba).toHaveBeenCalledWith('Rezervaci výčepu se nepodařilo zrušit: Síť nedostupná'));
    expect(pole().checked).toBe(false);
  });

  it('selhání okna rezervace se ohlásí a pole zůstane zaškrtnuté bez rezervace', async () => {
    vyplnenaVycep({ vyberVycep: vi.fn(async () => { throw new Error('Výčepy se nenačetly'); }) });
    fireEvent.click(pole());
    await waitFor(() => expect(chyba).toHaveBeenCalledTimes(1));
    expect(pole().checked).toBe(true);
    expect(stav()).toContain('Okno rezervace se otevře po uložení objednávky');
  });

  it('zahození rozepsané objednávky zruší i rezervaci výčepu', async () => {
    const { zrusVycep, onZavrit } = vyplnenaVycep();
    fireEvent.click(pole());
    await screen.findByText('Rezervováno: Výčep 2 · 20.–22. 11.');
    vi.mocked(potvrd).mockResolvedValueOnce(true);
    zpet(); // zeptá se na zahození
    await waitFor(() => expect(onZavrit).toHaveBeenCalledTimes(1));
    expect(zrusVycep).toHaveBeenCalledWith('rez-1');
  });

  it('„Pokračovat v zadávání" rezervaci nechá', async () => {
    const { zrusVycep, onZavrit } = vyplnenaVycep();
    fireEvent.click(pole());
    await screen.findByText('Rezervováno: Výčep 2 · 20.–22. 11.');
    vi.mocked(potvrd).mockResolvedValueOnce(false);
    zpet();
    await waitFor(() => expect(potvrd).toHaveBeenCalled());
    expect(onZavrit).not.toHaveBeenCalled();
    expect(zrusVycep).not.toHaveBeenCalled();
  });

  it('po uložení se rezervace při zavření okna nemaže — patří objednávce', async () => {
    const { zrusVycep, onZavrit } = vyplnenaVycep();
    fireEvent.click(pole());
    await screen.findByText('Rezervováno: Výčep 2 · 20.–22. 11.');
    fireEvent.click(tlacitko(/Uložit objednávku/));
    await cekejNaUlozeni();
    expect(onZavrit).toHaveBeenCalledTimes(1);
    // Okno se zavřelo po uložení, ne zahozením — rezervace patří objednávce a zůstává.
    expect(zrusVycep).not.toHaveBeenCalled();
  });

  it('Zpět a Escape při otevřeném okně rezervace průvodcem nehýbou (okno leží nad ním)', async () => {
    let potvrdOkno: (r: { id: string; popis: string } | null) => void = () => {};
    const vyberVycep = vi.fn(() => new Promise<{ id: string; popis: string } | null>((resolve) => { potvrdOkno = resolve; }));
    vyplnenaVycep({ vyberVycep });
    fireEvent.click(pole());
    await waitFor(() => expect(vyberVycep).toHaveBeenCalledTimes(1));
    zpet();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('heading', { name: 'Souhrn objednávky' })).toBeTruthy();
    expect(potvrd).not.toHaveBeenCalled();
    await act(async () => { potvrdOkno(REZERVACE); });
    expect(await screen.findByText('Rezervováno: Výčep 2 · 20.–22. 11.')).toBeTruthy();
    // Po zavření okna Zpět zase funguje: rozepsaná objednávka se zeptá na zahození.
    vi.mocked(potvrd).mockResolvedValueOnce(false);
    zpet();
    await waitFor(() => expect(potvrd).toHaveBeenCalledTimes(1));
  });

  it('během ukládání se pole nedá přepnout', async () => {
    let dokonci: (v: { stav: 'ulozeno' }) => void = () => {};
    const onUlozit = vi.fn(() => new Promise<{ stav: 'ulozeno' }>((resolve) => { dokonci = resolve; }));
    const { vyberVycep } = vyplnenaVycep({ onUlozit });
    fireEvent.click(tlacitko(/Uložit objednávku/));
    expect(tlacitko(/Ukládám/)).toBeTruthy();
    fireEvent.click(pole());
    expect(vyberVycep).not.toHaveBeenCalled();
    expect(pole().checked).toBe(false);
    await act(async () => { dokonci({ stav: 'ulozeno' }); });
  });
});

describe('široká obrazovka (počítač)', () => {
  const puvodni = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => { window.matchMedia = puvodni; });

  it('všechny tři části jsou vedle sebe a oba způsoby uložení jsou v pravém sloupci', async () => {
    const { onUlozit } = pripravit();
    expect(screen.getByRole('region', { name: 'Pro koho a na kdy' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Pivo, obal a počet' })).toBeTruthy();
    const souhrn = screen.getByRole('region', { name: 'Souhrn objednávky' });
    // Na počítači je tlačítek uložení v souhrnu, ne v patičce okna.
    expect(within(souhrn).getByRole('button', { name: 'Uložit objednávku' })).toBeTruthy();
    expect(within(souhrn).getByRole('button', { name: 'Uložit a odeslat na WhatsApp' })).toBeTruthy();
    expect(ulozitTl().closest('footer')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Dál/ })).toBeNull();
    expect((tlacitko(/Uložit objednávku/) as HTMLButtonElement).disabled).toBe(true);

    vyberOdberatele('Žižkov');
    zadejPivo('12° Světlá', '2');
    expect((tlacitko(/Uložit objednávku/) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(tlacitko(/Uložit objednávku/));
    await cekejNaUlozeni();
    expect(onUlozit.mock.calls[0][0].radky.map((r) => [r.beerId, r.pkgId, r.qty])).toEqual([['b12', 'k50', 2]]);
    expect(onUlozit.mock.calls[0][1]).toEqual({ whatsapp: false });
  });

  it('i z pravého sloupce jde „Uložit a odeslat na WhatsApp"', async () => {
    const { onUlozit } = pripravit();
    expect(whatsappTl().disabled).toBe(true);
    vyberOdberatele('Žižkov');
    zadejPivo('12° Světlá', '2');
    expect(whatsappTl().disabled).toBe(false);
    fireEvent.click(whatsappTl());
    await cekejNaUlozeni();
    expect(onUlozit.mock.calls[0][1]).toEqual({ whatsapp: true });
  });

  it('Zpět se tu jen zeptá na rozepsané', async () => {
    const { onZavrit } = pripravit();
    vyberOdberatele('Žižkov');
    vi.mocked(potvrd).mockResolvedValueOnce(true);
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    await waitFor(() => expect(onZavrit).toHaveBeenCalledTimes(1));
  });
});
