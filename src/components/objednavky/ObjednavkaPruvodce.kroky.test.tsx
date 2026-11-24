// 🧭 Průvodce zadáním objednávky — PO KROCÍCH (výchozí způsob od 23. 11. 2026).
//
// Majitel 23. 11. 2026: „dám nová: otevře se strana s odběrateli, dlaždice jak jsou
// včetně A–Ž, nejčastějších 10; když vyberu odběratele, vyberu den závozu, datum,
// poznámku; další je záložka piva; pak můžu potvrdit nebo zahodit — vždyť jsme to
// tak měli nastavený a teď je to na jedný stránce … dej možnost kliknout po
// pořadě, stejně jako se dělá inventura položka po položce."
// Jedna stránka (testy v ObjednavkaPruvodce.test.tsx) zůstala jako volba v záhlaví.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ObjednavkaPruvodce } from './ObjednavkaPruvodce';
import type { DataPruvodce, VolbyUlozeni } from './pruvodceTypy';
import { KLIC_REZIMU_PRUVODCE, type KonceptObjednavky } from '../../lib/objednavkaPruvodce';
import type { Beer, Package, Place } from '../../lib/supabase';
import type { Order, OrderItem } from './spolecne';
import { potvrd } from '../../lib/toast';

vi.mock('../../lib/toast', () => ({
  potvrd: vi.fn(async () => true),
  toastZpet: vi.fn(),
  oznam: vi.fn(),
  chyba: vi.fn(),
  uspech: vi.fn(),
}));

// Středa 18. 11. 2026.
const DNES = '2026-11-18';

const misto = (id: string, nazev: string) => ({ id, nazev, adresa: null, lat: null, lng: null });
const odberatel = (id: string, name: string, extra: Partial<Place> = {}): Place => ({
  id, name, note: null, created_at: '', address: null, phone: null, opening_hours: null, ...extra,
});
// 12 odběratelů: 10 nejčastějších se ukáže hned, zbylí dva jsou jen v abecedě.
const JMENA = ['Žižkov', 'Seeberg', 'Lužec', 'Jona', 'Malešice', 'Adam', 'Bořek', 'Čeněk', 'Dadali', 'Emil', 'Filip', 'Gustav'];
const places: Place[] = [
  odberatel('p-radek', 'Radek', { address: 'Lipová 1, Hradec Králové', mista_zavozu: [misto('sklad', 'Sklad'), misto('drobak', 'Drobák')] }),
  odberatel('p-jitka', 'Jitka'),
  ...JMENA.map((j, i) => odberatel(`p-${i}`, j, j === 'Seeberg' || j === 'Lužec' ? { vychozi_den_zavozu: 'pa' } : {})),
];

const beer = (id: string, name: string, sort: number, barva: string): Beer => ({
  id, name, short_name: null, degree: null, color: null, beer_color: barva, price_per_liter: null, is_active: true, sort_order: sort, created_at: '',
});
const beers: Beer[] = [beer('b12', '12° Světlá', 1, '#F59E0B'), beer('b11', '11° Světlá', 2, '#FDE68A'), beer('jantar', 'Jantar', 5, '#540f0f')];
const pkg = (id: string, kind: 'keg' | 'bottle', v: number, label: string, sort: number): Package => ({ id, code: id, kind, volume_l: v, label, sort_order: sort });
const packages: Package[] = [
  pkg('k50', 'keg', 50, 'KEG 50l', 1), pkg('k30', 'keg', 30, 'KEG 30l', 2), pkg('k20', 'keg', 20, 'KEG 20l', 3),
  pkg('l1', 'bottle', 1, 'PET 1l', 7), pkg('l05', 'bottle', 0.5, 'Lahev 0,5l', 8),
];

// Každý odběratel má jednu objednávku; čím dřív v seznamu JMENA, tím víc objednávek navíc (Žižkov 12×, Gustav 1×, Radek a Jitka 0×).
const orders: Order[] = [];
JMENA.forEach((j, i) => {
  for (let n = 0; n < JMENA.length - i; n++) {
    orders.push({
      id: `o-${i}-${n}`, order_date: '2026-11-0' + (1 + (n % 9)), place_id: `p-${i}`, place_name: j, source: 'rucne', status: 'nova', note: null,
      created_at: `2026-11-0${1 + (n % 9)}T08:00:00Z`, delivery_day: null, delivery_date: null, is_prepared: false, is_packaged: false,
      is_delivered: false, delivered_at: null,
    });
  }
});
const items: Record<string, OrderItem[]> = {};
const data: DataPruvodce = { places, beers, packages, orders, items, dnes: DNES };

function pripravit(props: Partial<Parameters<typeof ObjednavkaPruvodce>[0]> = {}, d: DataPruvodce = data) {
  const onUlozit = vi.fn(async (_k: KonceptObjednavky, _v: VolbyUlozeni) => ({ stav: 'ulozeno' as const }));
  const onZavrit = vi.fn();
  render(<ObjednavkaPruvodce data={d} historie={[]} onUlozit={onUlozit} onZavrit={onZavrit} {...props} />);
  return { onUlozit, onZavrit };
}

const tl = (nazev: RegExp | string) => screen.getByRole('button', { name: nazev }) as HTMLButtonElement;
const dal = () => tl(/^Dál/);
const zpet = () => tl(/^Zpět/);
const nadpis = (n: string) => screen.queryByRole('heading', { name: n });
const dlazdice = (jmeno: string) => screen.getByRole('button', { name: new RegExp(`^${jmeno}`) });
const hlaseni = () => screen.getByTestId('pruvodce-hlaseni').textContent;
const krok = () => screen.getByRole('button', { current: 'step' }).getAttribute('aria-label');
const odberateleHned = () => within(screen.getByRole('group', { name: 'Odběratelé' })).getAllByRole('button').map((b) => b.textContent ?? '');

function zadejPivo(jmeno: string, pocet: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${jmeno}`) }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Kolik kusů?' }), { target: { value: pocet } });
  fireEvent.click(tl(/^Hotovo/));
}

/** Projde první dva kroky: odběratel (Žižkov) → kdy (nic nevybírá) → piva. */
function doPiv() {
  fireEvent.click(dlazdice('Žižkov'));
  fireEvent.click(dal());
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(potvrd).mockResolvedValue(true);
  window.history.replaceState({}, '');
  window.localStorage.clear();
});

describe('první krok: odběratel', () => {
  it('okno se otevře po krocích: jen odběratelé, žádné dny, piva ani souhrn; „Dál" čeká na výběr', () => {
    pripravit();
    expect(nadpis('Pro koho?')).toBeTruthy();
    expect(nadpis('Kdy se veze?')).toBeNull();
    expect(nadpis('Které pivo?')).toBeNull();
    expect(nadpis('Souhrn objednávky')).toBeNull();
    expect(krok()).toBe('Krok 1 ze 4: Odběratel');
    expect(dal().disabled).toBe(true);
    expect(hlaseni()).toBe('Vyber odběratele.');
    // Na prvním kroku místo „Zpět" je „Zrušit" (zavře okno; u rozepsaného se zeptá).
    expect(screen.queryByRole('button', { name: /^Zpět/ })).toBeNull();
    expect(tl(/^Zrušit/)).toBeTruthy();
  });

  it('nahoře je 10 nejčastějších odběratelů, ostatní jsou pod „Všichni odběratelé" a v liště A–Ž', () => {
    pripravit();
    const hned = odberateleHned();
    expect(hned).toHaveLength(10);
    expect(hned[0]).toMatch(/^Žižkov/);
    expect(hned[9]).toMatch(/^Emil/);
    expect(hned.some((t) => /^(Filip|Gustav)/.test(t))).toBe(false); // 11. a 12. nejčastější jsou až pod „Všichni"
    expect(tl(/Všichni odběratelé \(14\)/)).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Přeskočit na písmeno' })).toBeTruthy();
  });

  it('klepnutí na odběratele s jedním místem posune rovnou na „kdy"', () => {
    pripravit();
    fireEvent.click(dlazdice('Žižkov'));
    expect(nadpis('Kdy se veze?')).toBeTruthy();
    expect(nadpis('Pro koho?')).toBeNull();
    expect(krok()).toBe('Krok 2 ze 4: Kdy');
  });

  it('Radek najdený hledáním: „kam tentokrát?" drží na kroku, výběr místa jde dál', () => {
    pripravit();
    fireEvent.change(screen.getByLabelText('Hledat odběratele'), { target: { value: 'radek' } });
    fireEvent.click(dlazdice('Radek'));
    expect(nadpis('Pro koho?')).toBeTruthy();
    expect(screen.getByText(/Radek vozí na víc míst — kam tentokrát\?/)).toBeTruthy();
    expect(dal().disabled).toBe(true);
    expect(hlaseni()).toMatch(/kam se veze/);
    fireEvent.click(tl('Drobák'));
    expect(nadpis('Kdy se veze?')).toBeTruthy();
    expect(screen.getByTestId('pruvodce-kontext').textContent).toContain('Radek · Drobák');
  });

  it('hledání „sklad" najde Radka s předvybraným místem a rovnou ho pošle na „kdy"', () => {
    pripravit();
    fireEvent.change(screen.getByLabelText('Hledat odběratele'), { target: { value: 'sklad' } });
    fireEvent.click(dlazdice('Radek'));
    expect(nadpis('Kdy se veze?')).toBeTruthy();
    expect(screen.getByTestId('pruvodce-kontext').textContent).toContain('Radek · Sklad');
  });

  it('nový odběratel (napsané jméno) jde dál klepnutím na „Nový: …"', () => {
    pripravit();
    fireEvent.change(screen.getByLabelText('Hledat odběratele'), { target: { value: 'U Lípy' } });
    fireEvent.click(screen.getByRole('button', { name: /^Nový: U Lípy/ }));
    expect(nadpis('Kdy se veze?')).toBeTruthy();
    expect(screen.getByTestId('pruvodce-kontext').textContent).toContain('U Lípy');
  });

  it('tlačítko „Dál" jde i bez klepnutí na dlaždici, když je odběratel vybraný a člověk se vrátil', () => {
    pripravit();
    fireEvent.click(dlazdice('Žižkov'));
    fireEvent.click(zpet());
    expect(nadpis('Pro koho?')).toBeTruthy();
    // Vybraný odběratel zůstal označený a „Dál" je odemčené.
    expect(dlazdice('Žižkov').getAttribute('aria-pressed')).toBe('true');
    expect(dal().disabled).toBe(false);
    fireEvent.click(dal());
    expect(nadpis('Kdy se veze?')).toBeTruthy();
  });
});

describe('druhý krok: kdy (den, datum, poznámka)', () => {
  it('den závozu, jiné datum, „Bez závozu" i poznámka jsou na jednom místě; piva a souhrn tu nejsou', () => {
    pripravit();
    fireEvent.click(dlazdice('Žižkov'));
    expect(screen.getByRole('group', { name: 'Kdy se veze?' })).toBeTruthy();
    expect(screen.getByLabelText(/Jiné datum závozu/)).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Bez závozu/ })).toBeTruthy();
    expect(screen.getByLabelText('Poznámka')).toBeTruthy();
    expect(nadpis('Které pivo?')).toBeNull();
    expect(nadpis('Souhrn objednávky')).toBeNull();
    // Výchozí den je vidět předem (Žižkov: středa) a „Dál" jde bez výběru dne.
    expect(screen.getByTestId('pruvodce-vychozi-den').textContent).toContain('výchozí den odběratele');
    expect(dal().disabled).toBe(false);
  });

  it('„Bez závozu" je velké tlačítko s přeškrtnutým autem hned pod nadpisem, nad dny (24. 11.: „nevidím tam viditelně to tlačítko")', () => {
    pripravit();
    fireEvent.click(dlazdice('Žižkov'));
    const prepinac = screen.getByTestId('prepinac-bez-zavozu');
    const dny = screen.getByRole('group', { name: 'Kdy se veze?' });
    expect(prepinac.compareDocumentPosition(dny) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(prepinac.querySelector('svg mask')).toBeTruthy(); // přeškrtnuté auto
    expect(prepinac.className).toContain('bg-white');
    fireEvent.click(screen.getByRole('checkbox', { name: /Bez závozu/ }));
    expect(screen.getByTestId('prepinac-bez-zavozu').className).toContain('bg-neutral-900');
    expect(screen.getByTestId('pruvodce-kontext').textContent).toContain('bez závozu');
    // druhé klepnutí ho zase vypne
    fireEvent.click(screen.getByRole('checkbox', { name: /Bez závozu/ }));
    expect((screen.getByRole('checkbox', { name: /Bez závozu/ }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByTestId('prepinac-bez-zavozu').className).toContain('bg-white');
    expect(screen.getByTestId('pruvodce-kontext').textContent).not.toContain('bez závozu');
  });

  it('nad krokem je odběratel a den: „Žižkov · St 18. 11."; po vybrání pátku „Pá 20. 11."', () => {
    pripravit();
    fireEvent.click(dlazdice('Žižkov'));
    expect(screen.getByTestId('pruvodce-kontext').textContent).toBe('Žižkov · St 18. 11.');
    fireEvent.click(screen.getByRole('button', { name: /^Pá/ }));
    expect(screen.getByTestId('pruvodce-kontext').textContent).toBe('Žižkov · Pá 20. 11.');
  });

  it('Jitka je automaticky „Bez závozu" a kontext to říká', () => {
    pripravit();
    fireEvent.change(screen.getByLabelText('Hledat odběratele'), { target: { value: 'jitka' } });
    fireEvent.click(dlazdice('Jitka'));
    expect((screen.getByRole('checkbox', { name: /Bez závozu/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId('pruvodce-kontext').textContent).toBe('Jitka · St 18. 11. · bez závozu');
  });

  it('závoz v dalším měsíci: „Dál" čeká na potvrzení zaškrtnutím v tomhle kroku', () => {
    pripravit({}, { ...data, dnes: '2026-11-30' });
    fireEvent.click(dlazdice('Žižkov'));
    // Středa 2. 12. je v prosinci — první krok to neblokoval, tenhle ano.
    expect(nadpis('Kdy se veze?')).toBeTruthy();
    expect(dal().disabled).toBe(true);
    expect(hlaseni()).toMatch(/dalšího měsíce/);
    fireEvent.click(screen.getByRole('checkbox', { name: /Potvrzuji, že závoz/ }));
    expect(dal().disabled).toBe(false);
    fireEvent.click(dal());
    expect(nadpis('Které pivo?')).toBeTruthy();
  });

  it('poznámka se píše tady a drží se i po návratu', () => {
    pripravit();
    fireEvent.click(dlazdice('Žižkov'));
    fireEvent.change(screen.getByLabelText('Poznámka'), { target: { value: 'vozí řidič Petr' } });
    fireEvent.click(dal());
    fireEvent.click(zpet());
    expect((screen.getByLabelText('Poznámka') as HTMLInputElement).value).toBe('vozí řidič Petr');
  });

  it('poznámka má strop 500 znaků (jako ve starém formuláři)', () => {
    pripravit();
    fireEvent.click(dlazdice('Žižkov'));
    expect((screen.getByLabelText('Poznámka') as HTMLInputElement).maxLength).toBe(500);
  });
});

describe('třetí krok: piva', () => {
  it('jen dlaždice piv; „Dál" čeká na první pivo a ukazuje, co v objednávce je', () => {
    pripravit();
    doPiv();
    expect(nadpis('Které pivo?')).toBeTruthy();
    expect(nadpis('Kdy se veze?')).toBeNull();
    expect(krok()).toBe('Krok 3 ze 4: Piva');
    expect(dal().disabled).toBe(true);
    expect(hlaseni()).toBe('Přidej aspoň jedno pivo.');
    expect(screen.getByTestId('pruvodce-obsah-piv').textContent).toContain('zatím nic');
    zadejPivo('12° Světlá', '2');
    expect(dal().disabled).toBe(false);
    expect(screen.getByTestId('pruvodce-obsah-piv').textContent).toContain('1 pivo · 1 položka');
    // Dlaždice se rozbalila do „2×50".
    expect(screen.getByRole('button', { name: /^12° Světlá.*2×50/ })).toBeTruthy();
  });
});

describe('čtvrtý krok: souhrn — uložit, nebo zahodit', () => {
  function doSouhrnu() {
    const k = pripravit();
    doPiv();
    zadejPivo('12° Světlá', '2');
    fireEvent.click(dal());
    return k;
  }

  it('souhrn ukazuje komu, kdy a položky; dole je Uložit, Uložit a odeslat na WhatsApp, Zpět a Zahodit', () => {
    doSouhrnu();
    expect(nadpis('Souhrn objednávky')).toBeTruthy();
    expect(krok()).toBe('Krok 4 ze 4: Souhrn');
    const souhrn = screen.getByRole('region', { name: 'Komu a kdy' });
    expect(souhrn.textContent).toContain('Žižkov');
    expect(souhrn.textContent).toContain('St 18. 11.');
    expect(screen.getByText('2× 50 l')).toBeTruthy();
    expect(tl('Uložit objednávku').disabled).toBe(false);
    expect(tl('Uložit a odeslat na WhatsApp').disabled).toBe(false);
    expect(zpet()).toBeTruthy();
    expect(tl(/^Zahodit/)).toBeTruthy();
    // Dál tu už není.
    expect(screen.queryByRole('button', { name: /^Dál/ })).toBeNull();
    // Poznámka se tu nepíše (je v kroku „kdy"); bez poznámky tu o ní není ani řádek.
    expect(screen.queryByLabelText('Poznámka')).toBeNull();
    expect(screen.queryByTestId('souhrn-poznamka')).toBeNull();
  });

  it('poznámka z kroku „kdy" je v souhrnu jako řádek; tužka vrací na „kdy"', () => {
    pripravit();
    fireEvent.click(dlazdice('Žižkov'));
    fireEvent.change(screen.getByLabelText('Poznámka'), { target: { value: 'zvonit předem' } });
    fireEvent.click(dal());
    zadejPivo('Jantar', '1');
    fireEvent.click(dal());
    const radek = screen.getByTestId('souhrn-poznamka');
    expect(radek.textContent).toContain('zvonit předem');
    fireEvent.click(within(radek).getByRole('button', { name: 'Změnit poznámku' }));
    expect(nadpis('Kdy se veze?')).toBeTruthy();
    expect((screen.getByLabelText('Poznámka') as HTMLInputElement).value).toBe('zvonit předem');
  });

  it('„Uložit objednávku" pošle celý koncept a okno se zavře', async () => {
    const { onUlozit, onZavrit } = doSouhrnu();
    fireEvent.click(tl('Uložit objednávku'));
    await waitFor(() => expect(onZavrit).toHaveBeenCalledTimes(1));
    expect(onUlozit).toHaveBeenCalledTimes(1);
    const [koncept, volby] = onUlozit.mock.calls[0];
    expect(koncept).toMatchObject({ placeId: 'p-0', placeName: 'Žižkov', radky: [{ beerId: 'b12', pkgId: 'k50', qty: 2 }] });
    expect(volby).toEqual({ whatsapp: false });
  });

  it('„Uložit a odeslat na WhatsApp" pošle volbu whatsapp', async () => {
    const { onUlozit, onZavrit } = doSouhrnu();
    fireEvent.click(tl('Uložit a odeslat na WhatsApp'));
    await waitFor(() => expect(onZavrit).toHaveBeenCalledTimes(1));
    expect(onUlozit.mock.calls[0][1]).toEqual({ whatsapp: true });
  });

  it('„Zahodit" se zeptá; po potvrzení zavře okno a nic neuloží', async () => {
    const { onUlozit, onZavrit } = doSouhrnu();
    fireEvent.click(tl(/^Zahodit/));
    await waitFor(() => expect(onZavrit).toHaveBeenCalledTimes(1));
    expect(vi.mocked(potvrd)).toHaveBeenCalledWith('Zahodit rozepsanou objednávku?', expect.objectContaining({ potvrdit: 'Zahodit' }));
    expect(onUlozit).not.toHaveBeenCalled();
  });

  it('„Zahodit" a odpověď „Pokračovat v zadávání": okno zůstane i s rozepsaným', async () => {
    vi.mocked(potvrd).mockResolvedValue(false);
    const { onUlozit, onZavrit } = doSouhrnu();
    fireEvent.click(tl(/^Zahodit/));
    await waitFor(() => expect(vi.mocked(potvrd)).toHaveBeenCalledTimes(1));
    expect(onZavrit).not.toHaveBeenCalled();
    expect(onUlozit).not.toHaveBeenCalled();
    expect(nadpis('Souhrn objednávky')).toBeTruthy();
  });

  it('tužky v souhrnu vedou na správný krok: odběratel → 1, den → 2, pivo → panel s počtem', () => {
    doSouhrnu();
    fireEvent.click(tl('Změnit odběratele'));
    expect(nadpis('Pro koho?')).toBeTruthy();
    fireEvent.click(dal());
    fireEvent.click(dal());
    fireEvent.click(dal());
    expect(nadpis('Souhrn objednávky')).toBeTruthy();
    fireEvent.click(tl('Změnit den závozu'));
    expect(nadpis('Kdy se veze?')).toBeTruthy();
    fireEvent.click(dal());
    fireEvent.click(dal());
    fireEvent.click(tl(/^Upravit 12° Světlá/));
    expect(screen.getByRole('textbox', { name: 'Kolik kusů?' })).toBeTruthy();
  });
});

describe('lišta kroků', () => {
  it('na krok dopředu se přeskočit nedá, dokud nejsou hotové ty před ním', () => {
    pripravit();
    const lista = screen.getByRole('navigation', { name: 'Kroky objednávky' });
    const kroky = within(lista).getAllByRole('button') as HTMLButtonElement[];
    expect(kroky.map((b) => b.disabled)).toEqual([false, true, true, true]);
    fireEvent.click(dlazdice('Žižkov'));
    const po = within(screen.getByRole('navigation', { name: 'Kroky objednávky' })).getAllByRole('button') as HTMLButtonElement[];
    // Odběratel je vybraný: kroky „kdy" a „piva" jdou (z „kdy" se jde dál bez výběru dne), souhrn ne.
    expect(po.map((b) => b.disabled)).toEqual([false, false, false, true]);
  });

  it('hotový krok se dá otevřít klepnutím v liště; rozepsané zůstane', () => {
    pripravit();
    doPiv();
    zadejPivo('Jantar', '3');
    fireEvent.click(screen.getByRole('button', { name: /^Krok 1 ze 4/ }));
    expect(nadpis('Pro koho?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Krok 3 ze 4/ }));
    expect(screen.getByRole('button', { name: /^Jantar.*3×/ })).toBeTruthy();
  });

  it('kroky mají čitelný název pro čtečku a aktuální je označený', () => {
    pripravit();
    expect(screen.getByRole('button', { name: 'Krok 1 ze 4: Odběratel' }).getAttribute('aria-current')).toBe('step');
    expect(screen.getByRole('button', { name: 'Krok 2 ze 4: Kdy', hidden: true })).toBeTruthy();
    expect(screen.getByTestId('pruvodce-krok-oznameni').textContent).toBe('Krok 1 ze 4: Odběratel');
    fireEvent.click(dlazdice('Žižkov'));
    expect(screen.getByTestId('pruvodce-krok-oznameni').textContent).toBe('Krok 2 ze 4: Kdy');
    expect(screen.getByRole('button', { name: 'Krok 1 ze 4: Odběratel (hotovo)' })).toBeTruthy();
  });
});

describe('Zpět a Escape po krocích', () => {
  it('Escape vrací o krok; z prvního kroku s rozepsaným se zeptá, jestli zahodit', async () => {
    const { onZavrit } = pripravit();
    fireEvent.click(dlazdice('Žižkov'));
    fireEvent.click(dal());
    expect(nadpis('Které pivo?')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(nadpis('Kdy se veze?')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(nadpis('Pro koho?')).toBeTruthy();
    expect(onZavrit).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(onZavrit).toHaveBeenCalledTimes(1)); // potvrzení vrací true
    expect(vi.mocked(potvrd)).toHaveBeenCalledTimes(1);
  });

  it('Escape na prázdném prvním kroku zavře okno bez ptaní', () => {
    const { onZavrit } = pripravit();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onZavrit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(potvrd)).not.toHaveBeenCalled();
  });

  it('Zpět v prohlížeči (hardwarové tlačítko) vrací o krok a nezavře okno', () => {
    const { onZavrit } = pripravit();
    fireEvent.click(dlazdice('Žižkov'));
    expect(nadpis('Kdy se veze?')).toBeTruthy();
    fireEvent(window, new PopStateEvent('popstate'));
    expect(nadpis('Pro koho?')).toBeTruthy();
    expect(onZavrit).not.toHaveBeenCalled();
  });

  it('tlačítko „Zrušit" na prvním kroku se u rozepsaného zeptá', async () => {
    const { onZavrit } = pripravit();
    fireEvent.click(dlazdice('Žižkov'));
    fireEvent.click(zpet());
    fireEvent.click(tl(/^Zrušit/));
    await waitFor(() => expect(onZavrit).toHaveBeenCalledTimes(1));
    expect(vi.mocked(potvrd)).toHaveBeenCalledTimes(1);
  });
});

describe('přepínač „Jedna stránka" / „Po krocích"', () => {
  it('přepne na jednu stránku (všechny části pod sebou) a rozepsané se drží', () => {
    pripravit();
    fireEvent.click(dlazdice('Žižkov'));
    fireEvent.change(screen.getByLabelText('Poznámka'), { target: { value: 'pozor na schody' } });
    fireEvent.click(tl('Jedna stránka'));
    expect(nadpis('Pro koho?')).toBeTruthy();
    expect(nadpis('Kdy se veze?')).toBeTruthy();
    expect(nadpis('Které pivo?')).toBeTruthy();
    expect(nadpis('Souhrn objednávky')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Kroky objednávky' })).toBeNull();
    expect((screen.getByLabelText('Poznámka') as HTMLInputElement).value).toBe('pozor na schody');
    expect(dlazdice('Žižkov').getAttribute('aria-pressed')).toBe('true');
    // Uložit a WhatsApp jsou dole pořád; tlačítko přepnout zpět se jmenuje „Po krocích".
    expect(tl('Uložit objednávku')).toBeTruthy();
    expect(tl('Po krocích')).toBeTruthy();
  });

  it('volba se zapamatuje v zařízení: příště se okno otevře na jedné stránce', () => {
    const { unmount } = render(<ObjednavkaPruvodce data={data} historie={[]} onUlozit={vi.fn()} onZavrit={vi.fn()} />);
    fireEvent.click(tl('Jedna stránka'));
    expect(JSON.parse(window.localStorage.getItem(KLIC_REZIMU_PRUVODCE)!)).toBe('stranka');
    unmount();
    pripravit();
    expect(nadpis('Souhrn objednávky')).toBeTruthy();
    expect(nadpis('Pro koho?')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Kroky objednávky' })).toBeNull();
  });

  it('zpátky na kroky: otevře se tam, kde se má pokračovat (bez piv na krok „Piva")', () => {
    pripravit();
    fireEvent.click(tl('Jedna stránka'));
    fireEvent.click(dlazdice('Žižkov'));
    fireEvent.click(tl('Po krocích'));
    expect(nadpis('Které pivo?')).toBeTruthy();
    expect(krok()).toBe('Krok 3 ze 4: Piva');
    expect(JSON.parse(window.localStorage.getItem(KLIC_REZIMU_PRUVODCE)!)).toBe('kroky');
  });

  it('zpátky na kroky s hotovou objednávkou: rovnou souhrn', () => {
    pripravit();
    fireEvent.click(tl('Jedna stránka'));
    fireEvent.click(dlazdice('Žižkov'));
    zadejPivo('12° Světlá', '1');
    fireEvent.click(tl('Po krocích'));
    expect(krok()).toBe('Krok 4 ze 4: Souhrn');
    expect(nadpis('Souhrn objednávky')).toBeTruthy();
  });

  it('zpátky na kroky bez odběratele: první krok', () => {
    pripravit();
    fireEvent.click(tl('Jedna stránka'));
    fireEvent.click(tl('Po krocích'));
    expect(krok()).toBe('Krok 1 ze 4: Odběratel');
  });

  it('na jedné stránce u záhlaví zůstává odběratel a den; po krocích ho nese lišta pod záhlavím', () => {
    pripravit();
    fireEvent.click(dlazdice('Žižkov'));
    expect(screen.getByRole('banner').textContent).not.toContain('Žižkov');
    expect(screen.getByTestId('pruvodce-kontext').textContent).toContain('Žižkov');
    fireEvent.click(tl('Jedna stránka'));
    expect(screen.getByRole('banner').textContent).toContain('Žižkov · St 18. 11.');
    expect(screen.queryByTestId('pruvodce-kontext')).toBeNull();
  });
});

describe('výčep a malé sudy po krocích', () => {
  it('pole „Půjčení výčepu" je až v souhrnu (poslední krok)', () => {
    const vyberVycep = vi.fn(async () => null);
    pripravit({ vyberVycep });
    doPiv();
    expect(screen.queryByTestId('pruvodce-vycep')).toBeNull();
    zadejPivo('12° Světlá', '1');
    fireEvent.click(dal());
    expect(screen.getByTestId('pruvodce-vycep')).toBeTruthy();
  });
});

describe('nový krok začíná nahoře', () => {
  it('při každém přechodu mezi kroky se rolovací plocha vrátí na začátek', () => {
    // jsdom nezná Element.scrollTo; okno ho volá jen když existuje, takže si ho tu dodáme a sledujeme.
    const scrollTo = vi.fn();
    const puvodni = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
    Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, writable: true, value: scrollTo });
    try {
      pripravit();
      scrollTo.mockClear();
      fireEvent.click(dlazdice('Žižkov')); // 1 → 2
      expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
      scrollTo.mockClear();
      fireEvent.click(dal()); // 2 → 3
      expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
      scrollTo.mockClear();
      fireEvent.click(zpet()); // 3 → 2
      expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    } finally {
      if (puvodni) Object.defineProperty(Element.prototype, 'scrollTo', puvodni);
      else delete (Element.prototype as unknown as Record<string, unknown>).scrollTo;
    }
  });
});

describe('široká obrazovka (počítač) po krocích', () => {
  const puvodni = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({
      matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => { window.matchMedia = puvodni; });

  it('zůstává jeden sloupec po krocích a v souhrnu je jediná sada tlačítek uložení (v patičce)', () => {
    pripravit();
    // Na jedné stránce by na počítači stály tři sloupce vedle sebe — po krocích ne.
    expect(screen.queryByRole('region', { name: 'Pivo, obal a počet' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Souhrn objednávky' })).toBeNull();
    doPiv();
    zadejPivo('12° Světlá', '2');
    fireEvent.click(dal());
    expect(nadpis('Souhrn objednávky')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Uložit objednávku' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Uložit a odeslat na WhatsApp' })).toHaveLength(1);
  });
});
