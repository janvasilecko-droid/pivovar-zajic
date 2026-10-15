// 📋 Přehled stáčení lahví po dnech — tabulka jako v Excelu.
// Zadání z 15. 10. 2026: „udělej ten přehled ve stylu skladu, ale ať je vidět,
// kolik se stočilo z kolika sudů, výtrata, a šlo to editovat" — „je to stejná
// tabulka jako export lahví do Excelu."
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import type { Beer, EntryRow, Package } from '../lib/supabase';
import { davkyStaceni } from '../lib/prehledStaceni';
import { chyba } from '../lib/toast';
import PrehledStaceniLahvi, { PolicekCisla, type PrehledStaceniLahviProps } from './PrehledStaceniLahvi';

vi.mock('../lib/businessDate', async (orig) => ({
  ...(await orig<typeof import('../lib/businessDate')>()),
  businessDateISO: () => '2026-10-15',
}));
vi.mock('../lib/toast', async (orig) => ({
  ...(await orig<typeof import('../lib/toast')>()),
  chyba: vi.fn(),
}));

afterEach(() => { vi.unstubAllGlobals(); vi.mocked(chyba).mockClear(); });

const PIVA = [
  { id: 'b12', name: '12° Světlá', beer_color: '#F59E0B' },
  { id: 'bj', name: 'Jantar', beer_color: '#44403B' },
] as unknown as Beer[];

const OBALY = [
  { id: 'l15', code: 'l15', kind: 'bottle', volume_l: 1.5, label: '1.5l', sort_order: 1 },
  { id: 'l1', code: 'l1', kind: 'bottle', volume_l: 1, label: '1l', sort_order: 2 },
  { id: 'l05', code: 'l05', kind: 'bottle', volume_l: 0.5, label: '0.5l', sort_order: 3 },
  { id: 'l033', code: 'l033', kind: 'bottle', volume_l: 0.33, label: '0.33l', sort_order: 4 },
  { id: 'l075', code: 'l075', kind: 'bottle', volume_l: 0.75, label: '0.75l', sort_order: 5 },
  { id: 'k50', code: 'k50', kind: 'keg', volume_l: 50, label: ' 50l', sort_order: 6 },
  { id: 'k30', code: 'k30', kind: 'keg', volume_l: 30, label: '30l', sort_order: 7 },
  { id: 'k20', code: 'k20', kind: 'keg', volume_l: 20, label: '20l', sort_order: 8 },
  { id: 'k15', code: 'k15', kind: 'keg', volume_l: 15, label: '15l', sort_order: 9 },
  { id: 'k10', code: 'k10', kind: 'keg', volume_l: 10, label: '10l', sort_order: 10 },
] as Package[];

const radek = (o: Partial<EntryRow> & { id: string }): EntryRow => ({
  entry_date: '2026-10-12',
  beer_id: 'b12',
  beer_name: '12° Světlá',
  package_id: 'l1',
  package_label: '1l',
  quantity: 10,
  note: null,
  created_at: '2026-10-12T08:00:00+00:00',
  kegs_used: 1,
  kegs_used_package_id: 'k50',
  ...o,
});

const objem = (id: string | null) => Number(OBALY.find((p) => p.id === id)?.volume_l) || 0;
const getBatchId = (r: EntryRow) => `${r.entry_date}_${r.beer_id}_${r.created_at.slice(0, 19)}_${r.kegs_used_package_id ?? ''}`;

function propsPro(radky: EntryRow[], extra: Partial<PrehledStaceniLahviProps> = {}) {
  const fn = {
    onLahve: vi.fn().mockResolvedValue(true),
    onSudy: vi.fn().mockResolvedValue(true),
    onSmazRadek: vi.fn(),
    onDatumPivo: vi.fn().mockResolvedValue(true),
    onDalsiSud: vi.fn(),
    onKus: vi.fn(),
    onUpravit: vi.fn(),
    onSmazat: vi.fn(),
  };
  const props: PrehledStaceniLahviProps = {
    davky: davkyStaceni(radky, objem),
    piva: PIVA,
    obaly: OBALY,
    getBatchId,
    ...fn,
    ...extra,
  };
  return { props, fn };
}

function vykresli(radky: EntryRow[], extra: Partial<PrehledStaceniLahviProps> = {}) {
  const { props, fn } = propsPro(radky, extra);
  const vysledek = render(<PrehledStaceniLahvi {...props} />);
  return { ...vysledek, ...fn, props };
}

/** Telefon (úzká obrazovka) — jinak jsou v jsdom vidět všechny sloupce. */
function telefon(siroka = false) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: siroka, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
}

/** Potvrzení čísla v buňce: zápis je asynchronní, jeho dokončení musí proběhnout v act(). */
const enter = async (el: HTMLElement) => { await act(async () => { fireEvent.keyDown(el, { key: 'Enter' }); }); };
const opust = async (el: HTMLElement) => { await act(async () => { fireEvent.blur(el); }); };

const radky = () => screen.getAllByTestId('radek-staceni');
/** Buňka řádku podle popisku (pivo · velikost). */
const bunkaLahve = (r: HTMLElement, objemTxt: string) => within(r).getByRole('button', { name: new RegExp(`· ${objemTxt} lahve:`) });
const bunkaSudu = (r: HTMLElement, objemTxt: string) => within(r).getByRole('button', { name: new RegExp(`· sud ${objemTxt}:`) });

const DEN_PO = [
  radek({ id: 'a', package_id: 'l15', quantity: 30, kegs_used: 2 }),
  radek({ id: 'b', package_id: 'l1', quantity: 44, kegs_used: 2 }),
  radek({ id: 'c', beer_id: 'bj', beer_name: 'Jantar', package_id: 'l1', quantity: 44, created_at: '2026-10-12T09:00:00+00:00' }),
];

describe('dny jako pásy', () => {
  it('každý den má svůj pás s názvem dne a součtem', () => {
    vykresli([
      ...DEN_PO,
      radek({ id: 'd', entry_date: '2026-10-13', package_id: 'l05', quantity: 20, created_at: '2026-10-13T08:00:00+00:00' }),
    ]);
    const dny = screen.getAllByTestId('den-staceni');
    expect(dny).toHaveLength(2);
    // nejnovější nahoře
    expect(within(dny[0]).getByRole('heading').textContent).toContain('Úterý 13. 10.');
    expect(within(dny[1]).getByRole('heading').textContent).toContain('Pondělí 12. 10.');
    // 30 + 44 + 44 ks, litry 45 + 44 + 44 = 133
    expect(dny[1].textContent).toContain('118 ks · 133 L');
    expect(dny[0].textContent).toContain('20 ks · 10 L');
  });

  it('každý den má vlastní tabulku', () => {
    vykresli([...DEN_PO, radek({ id: 'd', entry_date: '2026-10-13', created_at: '2026-10-13T08:00:00+00:00' })]);
    expect(screen.getAllByRole('table')).toHaveLength(2);
    expect(screen.getByRole('table', { name: /Pondělí 12. 10./ })).toBeTruthy();
    expect(screen.getByRole('table', { name: /Úterý 13. 10./ })).toBeTruthy();
  });

  it('dnešní den je označený', () => {
    vykresli([radek({ id: 'x', entry_date: '2026-10-15' }), radek({ id: 'y', entry_date: '2026-10-14', created_at: '2026-10-14T08:00:00+00:00' })]);
    const dny = screen.getAllByTestId('den-staceni');
    expect(within(dny[0]).queryByText('dnes')).toBeTruthy();
    expect(within(dny[1]).queryByText('dnes')).toBeNull();
  });

  it('záznam bez data má vlastní pás „Bez data" úplně dole', () => {
    vykresli([radek({ id: 'x', entry_date: '' }), radek({ id: 'y', created_at: '2026-10-12T08:00:00+00:00' })]);
    const dny = screen.getAllByTestId('den-staceni');
    expect(within(dny[dny.length - 1]).getByRole('heading').textContent).toContain('Bez data');
  });
});

describe('sloupce jako v exportu do Excelu', () => {
  it('hlavička: Pivo │ Z sudů 50·30·20·15·10 l │ Stočeno lahví 1,5·1,0·0,5·0,33 l', () => {
    vykresli(DEN_PO);
    const tabulka = screen.getAllByRole('table')[0];
    const hlavicky = within(tabulka).getAllByRole('columnheader').map((h) => h.textContent?.trim());
    expect(hlavicky).toEqual([
      'Pivo', 'Z sudů', 'Stočeno lahví',
      '50 l', '30 l', '20 l', '15 l', '10 l',
      '1,5l', '1,0l', '0,5l', '0,33l',
    ]);
  });

  it('skupiny nad sloupci zabírají pět a čtyři sloupce', () => {
    vykresli(DEN_PO);
    const skupiny = within(screen.getAllByRole('table')[0]).getAllByRole('columnheader').filter((h) => h.getAttribute('scope') === 'colgroup');
    expect(skupiny.map((h) => h.getAttribute('colspan'))).toEqual(['5', '4']);
  });

  it('jedno stáčení: sudy a lahve jsou každé ve svém sloupci', () => {
    vykresli([DEN_PO[0], DEN_PO[1]]);
    const [r] = radky();
    expect(bunkaSudu(r, '50 L').textContent).toBe('2');
    expect(bunkaSudu(r, '30 L').textContent).toBe('·');
    expect(bunkaLahve(r, '1,5 L').textContent).toBe('30');
    expect(bunkaLahve(r, '1 L').textContent).toBe('44');
    expect(bunkaLahve(r, '0,5 L').textContent).toBe('·');
    expect(bunkaLahve(r, '0,33 L').textContent).toBe('·');
    expect(bunkaSudu(r, '50 L').getAttribute('aria-label')).toBe('12° Světlá · sud 50 L: 2×');
    expect(bunkaLahve(r, '1,5 L').getAttribute('aria-label')).toBe('12° Světlá · 1,5 L lahve: 30 ks');
    expect(bunkaLahve(r, '0,5 L').getAttribute('aria-label')).toBe('12° Světlá · 0,5 L lahve: prázdné');
  });

  it('řádek je ŠARŽE: dvě stáčení téhož piva v jeden den jsou dva řádky', () => {
    vykresli([
      radek({ id: 'a', package_id: 'l1', quantity: 44, kegs_used: 2 }),
      radek({ id: 'b', package_id: 'l05', quantity: 20, kegs_used: 1, created_at: '2026-10-12T10:00:00+00:00' }),
    ]);
    expect(radky()).toHaveLength(2);
    expect(bunkaSudu(radky()[0], '50 L').textContent).toBe('2');
    expect(bunkaSudu(radky()[1], '50 L').textContent).toBe('1');
    expect(bunkaLahve(radky()[0], '1 L').textContent).toBe('44');
    expect(bunkaLahve(radky()[1], '0,5 L').textContent).toBe('20');
  });

  it('dávka ze dvou velikostí sudů jsou dva řádky, každý ve svém sloupci sudů', () => {
    vykresli([
      radek({ id: 'a', package_id: 'l033', quantity: 10, kegs_used: 1, kegs_used_package_id: 'k30' }),
      radek({ id: 'b', package_id: 'l1', quantity: 47, kegs_used: 1, kegs_used_package_id: 'k50' }),
    ]);
    expect(radky()).toHaveLength(2);
    const r30 = radky().find((r) => within(r).queryByRole('button', { name: /sud 30 L: 1×/ }))!;
    const r50 = radky().find((r) => within(r).queryByRole('button', { name: /sud 50 L: 1×/ }))!;
    expect(r30).toBeTruthy();
    expect(r50).toBeTruthy();
    expect(bunkaLahve(r30, '0,33 L').textContent).toBe('10');
    expect(bunkaLahve(r50, '1 L').textContent).toBe('47');
  });

  it('řádek má barvu piva', () => {
    vykresli(DEN_PO);
    const jmeno = radky()[0].querySelector('th') as HTMLElement;
    expect(jmeno.style.backgroundColor).toBe('rgb(245, 158, 11)'); // #F59E0B
  });
});

describe('litry a výtrata pod řádkem', () => {
  const souhrnRadku = (n: number) => screen.getAllByTestId('souhrn-radku')[n].textContent;

  it('kolik se stočilo z kolika litrů a jaká je výtrata', () => {
    vykresli([DEN_PO[0], DEN_PO[1]]);
    // 2 sudy po 50 l = 100 l, stočeno 30 × 1,5 + 44 = 89 l → výtrata 11 %
    expect(souhrnRadku(0)).toContain('89 L z 100 L');
    expect(souhrnRadku(0)).toContain('výtrata 11 %');
  });

  it('stáčení rovnou z tanku je „bez sudu" a výtratu nemá', () => {
    vykresli([radek({ id: 'x', kegs_used: null, kegs_used_package_id: null, package_id: 'l05', quantity: 40 })]);
    expect(souhrnRadku(0)).toContain('20 L');
    expect(souhrnRadku(0)).toContain('bez sudu');
    expect(screen.queryByTestId('vytrata-radku')).toBeNull();
  });

  it('běžná výtrata není poplach, záporná a vysoká ano', () => {
    vykresli([
      radek({ id: 'a', package_id: 'l1', quantity: 45 }),                                                       // 10 %
      radek({ id: 'b', package_id: 'l1', quantity: 60, created_at: '2026-10-12T09:00:00+00:00' }),               // −20 %
      radek({ id: 'c', package_id: 'l1', quantity: 10, created_at: '2026-10-12T10:00:00+00:00' }),               // 80 %
    ]);
    // jen řádky; součet dne má vlastní (celkem-litry)
    const badge = screen.getAllByTestId('souhrn-radku').map((s) => within(s).getByTestId('vytrata-radku'));
    expect(badge.map((b) => b.textContent)).toEqual(['výtrata 10 %', expect.stringMatching(/^výtrata [-−]20 %$/), 'výtrata 80 %']);
    expect(badge[0].className).not.toMatch(/bg-rose-700/);
    expect(badge[1].className).toMatch(/bg-rose-700/);
    expect(badge[1].getAttribute('title')).toMatch(/Záporná výtrata/);
    expect(badge[2].className).toMatch(/bg-rose-700/);
    expect(badge[2].getAttribute('title')).toMatch(/Vysoká výtrata/);
  });

  it('dvě šarže téhož piva mají každá svou výtratu', () => {
    vykresli([
      radek({ id: 'a', package_id: 'l1', quantity: 44, kegs_used: 2 }),
      radek({ id: 'b', package_id: 'l05', quantity: 20, kegs_used: 1, created_at: '2026-10-12T10:00:00+00:00' }),
    ]);
    expect(souhrnRadku(0)).toContain('44 L z 100 L');
    expect(souhrnRadku(0)).toContain('výtrata 56 %');
    expect(souhrnRadku(1)).toContain('10 L z 50 L');
    expect(souhrnRadku(1)).toContain('výtrata 80 %');
  });
});

describe('součet dne („Celkem")', () => {
  it('sečte sudy a lahve po sloupcích, litry a výtratu', () => {
    vykresli([
      ...DEN_PO,
      radek({ id: 'd', beer_id: 'bj', beer_name: 'Jantar', package_id: 'l05', quantity: 20, kegs_used: 1, kegs_used_package_id: 'k30', created_at: '2026-10-12T10:00:00+00:00' }),
    ]);
    const celkem = screen.getByTestId('celkem-dne');
    const bunky = within(celkem).getAllByRole('cell').map((c) => c.textContent);
    // 50 · 30 · 20 · 15 · 10 │ 1,5 · 1,0 · 0,5 · 0,33
    expect(bunky).toEqual(['3', '1', '—', '—', '—', '30', '88', '20', '—']);
    // 45 + 44 + 44 + 10 = 143 l ze 100 + 50 + 30 = 180 l
    expect(screen.getByTestId('celkem-litry').textContent).toContain('143 L z 180 L');
    expect(screen.getByTestId('celkem-litry').textContent).toContain('výtrata 20,6 %');
  });

  it('každý den má vlastní součet', () => {
    vykresli([...DEN_PO, radek({ id: 'd', entry_date: '2026-10-13', created_at: '2026-10-13T08:00:00+00:00' })]);
    expect(screen.getAllByTestId('celkem-dne')).toHaveLength(2);
  });
});

describe('sud bez velikosti', () => {
  const SBEZ = [radek({ id: 'x', kegs_used: 2, kegs_used_package_id: null, package_id: 'l1', quantity: 44 })];

  it('řádek svítí poplachem a říká, co chybí', () => {
    vykresli(SBEZ);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('2 sudy');
    expect(alert.textContent).toContain('vyber velikost sudu');
    expect(alert.textContent).toContain('neodečtou');
  });

  it('všechny buňky sudů mají otazník', () => {
    vykresli(SBEZ);
    const [r] = radky();
    for (const velikost of ['50 L', '30 L', '20 L', '15 L', '10 L']) {
      expect(bunkaSudu(r, velikost).textContent).toBe('?');
      expect(bunkaSudu(r, velikost).getAttribute('aria-label')).toContain('velikost sudu chybí');
    }
  });

  it('velikost se doplní číslem do správného sloupce', async () => {
    const { onSudy } = vykresli(SBEZ);
    fireEvent.click(bunkaSudu(radky()[0], '30 L'));
    const policko = screen.getByLabelText(/sud 30 L — počet/);
    expect((policko as HTMLInputElement).value).toBe(''); // nepředvyplňuje — klepnutí „jen se podívat" nic nepřepíše
    fireEvent.change(policko, { target: { value: '2' } });
    await enter(policko);
    expect(onSudy).toHaveBeenCalledTimes(1);
    expect(onSudy.mock.calls[0][1]).toBe(30);
    expect(onSudy.mock.calls[0][2]).toBe('2');
  });

  it('bez poplachu se řádek bez sudu (z tanku) nevykresluje jako chyba', () => {
    vykresli([radek({ id: 'x', kegs_used: null, kegs_used_package_id: null })]);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(bunkaSudu(radky()[0], '50 L').textContent).toBe('·');
  });
});

describe('věci mimo sloupce se neztratí', () => {
  it('obal mimo čtyři sloupce je v poznámce pod řádkem', () => {
    vykresli([
      radek({ id: 'a', package_id: 'l1', quantity: 10 }),
      radek({ id: 'b', package_id: 'l075', quantity: 8 }),
    ]);
    expect(screen.getAllByTestId('souhrn-radku')).toHaveLength(1);
    expect(screen.getByText(/jiné obaly: 8× 0,75 L/)).toBeTruthy();
  });

  it('sud mimo sloupce (100 l) je napsaný pod řádkem a ve sloupcích není', () => {
    vykresli([radek({ id: 'a', kegs_used: 1, kegs_used_package_id: 'k100' })], {
      obaly: [...OBALY, { id: 'k100', code: 'k100', kind: 'keg', volume_l: 100, label: '100l', sort_order: 11 } as Package],
    });
    expect(screen.getByText('1× KEG 100 L')).toBeTruthy();
    for (const velikost of ['50 L', '30 L', '20 L', '15 L', '10 L']) {
      expect(bunkaSudu(radky()[0], velikost).textContent).toBe('·');
    }
  });

  it('automatický záznam má pod sebou, odkud se vzal', () => {
    vykresli([radek({ id: 'x', note: 'Založeno zaškrtnutím "Stočeno" u objednávky' })]);
    expect(screen.getByText(/Založeno zaškrtnutím/)).toBeTruthy();
  });

  it('inventurní doplněk říká, že ho nezapsal stáčeč', () => {
    vykresli([radek({ id: 'x', note: 'Doplněno z inventury 2026-08 — 1l z 50l (přebytek 3 ks)' })]);
    expect(screen.getByText(/nezapsal to stáčeč/)).toBeTruthy();
  });

  it('vlastní poznámka stáčeče je vidět', () => {
    vykresli([radek({ id: 'x', note: 'STÁČENÍ PIVOVAR' })]);
    expect(screen.getByText('STÁČENÍ PIVOVAR')).toBeTruthy();
  });

  it('stejný obal víckrát v jedné šarži je jedna buňka se součtem a počtem záznamů', () => {
    vykresli([radek({ id: 'a', quantity: 81 }), radek({ id: 'b', quantity: 46 })]);
    const bunka = bunkaLahve(radky()[0], '1 L');
    expect(bunka.textContent).toBe('127 ×2');
    expect(bunka.getAttribute('aria-label')).toContain('víc záznamů');
  });

  it('klepnutí na buňku s víc záznamy otevře podrobnosti, ne políčko', () => {
    vykresli([radek({ id: 'a', quantity: 81 }), radek({ id: 'b', quantity: 46 })]);
    fireEvent.click(bunkaLahve(radky()[0], '1 L'));
    expect(screen.queryByLabelText(/lahve — počet/)).toBeNull();
    expect(screen.getByTestId('detail-radku')).toBeTruthy();
    expect(screen.getAllByTestId('zaznam-staceni')).toHaveLength(2);
  });
});

describe('přepsání čísla v buňce', () => {
  it('klepnutí otevře políčko s číslem, Enter ho uloží', async () => {
    const { onLahve } = vykresli([DEN_PO[0], DEN_PO[1]]);
    fireEvent.click(bunkaLahve(radky()[0], '1 L'));
    const policko = screen.getByLabelText('12° Světlá · 1 L lahve — počet') as HTMLInputElement;
    expect(policko.value).toBe('44');
    fireEvent.change(policko, { target: { value: '40' } });
    await enter(policko);
    expect(onLahve).toHaveBeenCalledTimes(1);
    const [radekTabulky, velikost, text] = onLahve.mock.calls[0];
    expect(radekTabulky.beerName).toBe('12° Světlá');
    expect(velikost).toBe(1);
    expect(text).toBe('40');
    expect(screen.queryByLabelText(/lahve — počet/)).toBeNull();
  });

  it('klepnutí jinam (blur) číslo taky uloží — a jen jednou, i když po Enteru přijde blur', async () => {
    const { onLahve } = vykresli([DEN_PO[0], DEN_PO[1]]);
    fireEvent.click(bunkaLahve(radky()[0], '1 L'));
    const policko = screen.getByLabelText(/lahve — počet/);
    fireEvent.change(policko, { target: { value: '41' } });
    await opust(policko);
    await opust(policko);
    expect(onLahve).toHaveBeenCalledTimes(1);

    fireEvent.click(bunkaLahve(radky()[0], '1,5 L'));
    const druhe = screen.getByLabelText(/lahve — počet/);
    fireEvent.change(druhe, { target: { value: '31' } });
    await enter(druhe);
    await opust(druhe);
    expect(onLahve).toHaveBeenCalledTimes(2);
  });

  it('Escape vrátí původní číslo a nic nezapíše', async () => {
    const { onLahve } = vykresli([DEN_PO[0], DEN_PO[1]]);
    fireEvent.click(bunkaLahve(radky()[0], '1 L'));
    const policko = screen.getByLabelText(/lahve — počet/);
    fireEvent.change(policko, { target: { value: '999' } });
    fireEvent.keyDown(policko, { key: 'Escape' });
    await opust(policko);
    expect(onLahve).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/lahve — počet/)).toBeNull();
    expect(bunkaLahve(radky()[0], '1 L').textContent).toBe('44');
  });

  it('klepnout a pustit (číslo se nezměnilo) nic nezapíše', async () => {
    const { onLahve, onSudy } = vykresli([DEN_PO[0], DEN_PO[1]]);
    fireEvent.click(bunkaLahve(radky()[0], '1 L'));
    await opust(screen.getByLabelText(/lahve — počet/));
    fireEvent.click(bunkaSudu(radky()[0], '50 L'));
    await enter(screen.getByLabelText(/sud 50 L — počet/));
    fireEvent.click(bunkaLahve(radky()[0], '0,5 L')); // prázdná buňka, nic nenapsáno
    await opust(screen.getByLabelText(/lahve — počet/));
    expect(onLahve).not.toHaveBeenCalled();
    expect(onSudy).not.toHaveBeenCalled();
  });

  it('smazání čísla (prázdné políčko) se pošle — obrazovka z toho udělá smazání', async () => {
    const { onLahve } = vykresli([DEN_PO[0], DEN_PO[1]]);
    fireEvent.click(bunkaLahve(radky()[0], '1 L'));
    const policko = screen.getByLabelText(/lahve — počet/);
    fireEvent.change(policko, { target: { value: '' } });
    await enter(policko);
    expect(onLahve).toHaveBeenCalledTimes(1);
    expect(onLahve.mock.calls[0][2]).toBe('');
  });

  it('prázdná buňka: políčko je prázdné a nové číslo se pošle s velikostí sloupce', async () => {
    const { onLahve } = vykresli([DEN_PO[0], DEN_PO[1]]);
    fireEvent.click(bunkaLahve(radky()[0], '0,5 L'));
    const policko = screen.getByLabelText(/0,5 L lahve — počet/) as HTMLInputElement;
    expect(policko.value).toBe('');
    fireEvent.change(policko, { target: { value: '20' } });
    await enter(policko);
    expect(onLahve.mock.calls[0][1]).toBe(0.5);
    expect(onLahve.mock.calls[0][2]).toBe('20');
  });

  it('číslo se neupravuje za zády: „4,5" se pošle tak, jak je (zkontroluje obrazovka), ne jako 45', async () => {
    const { onLahve } = vykresli([DEN_PO[0], DEN_PO[1]]);
    fireEvent.click(bunkaLahve(radky()[0], '1 L'));
    const policko = screen.getByLabelText(/lahve — počet/);
    fireEvent.change(policko, { target: { value: '4,5' } });
    await enter(policko);
    expect(onLahve.mock.calls[0][2]).toBe('4,5');
  });

  it('sudy: ve sloupci, kde sud je, je číslo předvyplněné', async () => {
    const { onSudy } = vykresli([DEN_PO[0], DEN_PO[1]]);
    fireEvent.click(bunkaSudu(radky()[0], '50 L'));
    const policko = screen.getByLabelText(/sud 50 L — počet/) as HTMLInputElement;
    expect(policko.value).toBe('2');
    fireEvent.change(policko, { target: { value: '3' } });
    await enter(policko);
    expect(onSudy.mock.calls[0][1]).toBe(50);
    expect(onSudy.mock.calls[0][2]).toBe('3');
  });

  it('sudy: ve sloupci jiné velikosti je políčko prázdné — sudy se přesunou, jen když napíšu číslo', async () => {
    const { onSudy } = vykresli([DEN_PO[0], DEN_PO[1]]);
    fireEvent.click(bunkaSudu(radky()[0], '30 L'));
    const policko = screen.getByLabelText(/sud 30 L — počet/) as HTMLInputElement;
    expect(policko.value).toBe('');
    await opust(policko);
    expect(onSudy).not.toHaveBeenCalled();

    fireEvent.click(bunkaSudu(radky()[0], '30 L'));
    const znovu = screen.getByLabelText(/sud 30 L — počet/);
    fireEvent.change(znovu, { target: { value: '2' } });
    await enter(znovu);
    expect(onSudy.mock.calls[0][1]).toBe(30);
    expect(onSudy.mock.calls[0][2]).toBe('2');
  });

  it('píše se jen do jedné buňky: klepnutí na druhou uloží rozepsanou a otevře novou', async () => {
    const { onLahve } = vykresli([DEN_PO[0], DEN_PO[1]]);
    fireEvent.click(bunkaLahve(radky()[0], '1 L'));
    fireEvent.change(screen.getByLabelText(/lahve — počet/), { target: { value: '45' } });
    // v prohlížeči přijde před klepnutím na druhou buňku blur té první
    await opust(screen.getByLabelText(/lahve — počet/));
    fireEvent.click(bunkaLahve(radky()[0], '1,5 L'));
    expect(onLahve).toHaveBeenCalledTimes(1);
    expect(screen.getAllByLabelText(/lahve — počet/)).toHaveLength(1);
    expect((screen.getByLabelText(/1,5 L lahve — počet/) as HTMLInputElement).value).toBe('30');
  });

  it('po dobu zápisu je buňka zamčená a označená jako zaneprázdněná', async () => {
    let dokonci!: () => void;
    const onLahve = vi.fn(() => new Promise<boolean>((r) => { dokonci = () => r(true); }));
    vykresli([DEN_PO[0], DEN_PO[1]], { onLahve });
    fireEvent.click(bunkaLahve(radky()[0], '1 L'));
    const policko = screen.getByLabelText(/lahve — počet/);
    fireEvent.change(policko, { target: { value: '40' } });
    await enter(policko);
    const bunka = bunkaLahve(radky()[0], '1 L') as HTMLButtonElement;
    expect(bunka.disabled).toBe(true);
    expect(bunka.getAttribute('aria-busy')).toBe('true');
    expect(onLahve).toHaveBeenCalledTimes(1);
    await act(async () => { dokonci(); });
    expect((bunkaLahve(radky()[0], '1 L') as HTMLButtonElement).disabled).toBe(false);
    expect(bunkaLahve(radky()[0], '1 L').getAttribute('aria-busy')).toBeNull();
  });

  it('i když zápis spadne výjimkou, buňka se odemkne a chyba se ohlásí', async () => {
    vykresli([DEN_PO[0], DEN_PO[1]], { onLahve: vi.fn(() => Promise.reject(new Error('spadlo spojení'))) });
    fireEvent.click(bunkaLahve(radky()[0], '1 L'));
    const policko = screen.getByLabelText(/lahve — počet/);
    fireEvent.change(policko, { target: { value: '40' } });
    await act(async () => { await enter(policko); });
    expect((bunkaLahve(radky()[0], '1 L') as HTMLButtonElement).disabled).toBe(false);
    expect(chyba).toHaveBeenCalledTimes(1);
    expect(vi.mocked(chyba).mock.calls[0][0]).toEqual(new Error('spadlo spojení'));
  });
});

describe('na telefonu je tabulka kompaktní', () => {
  it('na počítači (nebo bez matchMedia) je všech devět sloupců a žádné tlačítko navíc', () => {
    telefon(true);
    vykresli(DEN_PO);
    expect(within(screen.getAllByRole('table')[0]).getAllByRole('columnheader')).toHaveLength(12);
    expect(screen.queryByRole('button', { name: /sloupce/ })).toBeNull();
  });

  it('na telefonu jsou základní sloupce a ty, ve kterých něco je', () => {
    telefon(false);
    vykresli(DEN_PO); // sudy: 50; lahve: 1,5 a 1
    const hlavicky = within(screen.getAllByRole('table')[0]).getAllByRole('columnheader').map((h) => h.textContent?.trim());
    // základ: sudy 50, 30; lahve 1,5 · 1,0 · 0,5
    expect(hlavicky).toEqual(['Pivo', 'Z sudů', 'Stočeno lahví', '50 l', '30 l', '1,5l', '1,0l', '0,5l']);
    expect(screen.getAllByRole('table')[0].querySelectorAll('thead th[scope="colgroup"]')[0].getAttribute('colspan')).toBe('2');
    expect(screen.getAllByRole('table')[0].querySelectorAll('thead th[scope="colgroup"]')[1].getAttribute('colspan')).toBe('3');
  });

  it('sloupec, který se jinde používá (0,33 l, 20 l), se ukáže u všech dnů', () => {
    telefon(false);
    vykresli([
      radek({ id: 'a', package_id: 'l033', quantity: 10, kegs_used: 1, kegs_used_package_id: 'k20' }),
      radek({ id: 'b', entry_date: '2026-10-13', package_id: 'l1', created_at: '2026-10-13T08:00:00+00:00' }),
    ]);
    for (const tabulka of screen.getAllByRole('table')) {
      const hlavicky = within(tabulka).getAllByRole('columnheader').map((h) => h.textContent?.trim());
      expect(hlavicky).toContain('20 l');
      expect(hlavicky).toContain('0,33l');
      expect(hlavicky).not.toContain('15 l');
      expect(hlavicky).not.toContain('10 l');
    }
  });

  it('„Všechny sloupce" ukáže všech devět a „Jen použité sloupce" je zase schová', () => {
    telefon(false);
    vykresli(DEN_PO);
    const hlavicky = () => within(screen.getAllByRole('table')[0]).getAllByRole('columnheader').length;
    expect(hlavicky()).toBe(8);
    const tlacitko = screen.getByRole('button', { name: 'Všechny sloupce' });
    expect(tlacitko.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(tlacitko);
    expect(hlavicky()).toBe(12);
    expect(screen.getByRole('button', { name: 'Jen použité sloupce' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Jen použité sloupce' }));
    expect(hlavicky()).toBe(8);
  });

  it('když nic není schované, tlačítko není', () => {
    telefon(false);
    vykresli([
      radek({ id: 'a', package_id: 'l033', quantity: 10, kegs_used: 1, kegs_used_package_id: 'k20' }),
      radek({ id: 'b', package_id: 'l1', quantity: 10, kegs_used: 1, kegs_used_package_id: 'k15', created_at: '2026-10-12T09:00:00+00:00' }),
      radek({ id: 'c', package_id: 'l1', quantity: 10, kegs_used: 1, kegs_used_package_id: 'k10', created_at: '2026-10-12T10:00:00+00:00' }),
    ]);
    expect(screen.queryByRole('button', { name: /sloupce/ })).toBeNull();
  });

  it('sud bez velikosti ukáže všechny sloupce sudů — velikost se doplňuje klepnutím do sloupce', () => {
    telefon(false);
    vykresli([radek({ id: 'x', kegs_used: 2, kegs_used_package_id: null })]);
    const hlavicky = within(screen.getAllByRole('table')[0]).getAllByRole('columnheader').map((h) => h.textContent?.trim());
    expect(hlavicky).toEqual(expect.arrayContaining(['50 l', '30 l', '20 l', '15 l', '10 l']));
  });

  it('řádky i součty jedou podle viditelných sloupců', () => {
    telefon(false);
    vykresli(DEN_PO);
    const [r] = radky();
    expect(within(r).getAllByRole('button').filter((b) => /· (sud|[\d,]+ L lahve)/.test(b.getAttribute('aria-label') ?? ''))).toHaveLength(5);
    expect(within(screen.getByTestId('celkem-dne')).getAllByRole('cell')).toHaveLength(5);
  });

  it('klepnutí na název piva nepřidá schované sloupce — počítá se jen výběr', () => {
    telefon(false);
    vykresli(DEN_PO);
    expect(within(radky()[0]).queryByRole('button', { name: /sud 20 L/ })).toBeNull();
  });
});

describe('podrobnosti řádku', () => {
  const SARZE = [
    radek({ id: 'a', package_id: 'l15', quantity: 30, kegs_used: 2 }),
    radek({ id: 'b', package_id: 'l1', quantity: 44, kegs_used: 2 }),
  ];
  const otevri = () => fireEvent.click(screen.getByRole('button', { name: 'Podrobnosti: 12° Světlá' }));

  it('název piva otevře dialog s pivem a dnem v nadpisu', () => {
    vykresli(SARZE);
    expect(screen.queryByTestId('detail-radku')).toBeNull();
    otevri();
    expect(screen.getByTestId('detail-radku')).toBeTruthy();
    expect(screen.getByText('12° Světlá · Pondělí 12. 10.')).toBeTruthy();
    expect(screen.getByTestId('detail-radku').textContent).toContain('2× KEG 50 L');
  });

  it('záznamy mají obal, kusy a čtyři tlačítka', () => {
    const { onKus, onUpravit, onSmazat } = vykresli([SARZE[0]]);
    otevri();
    const zaznam = screen.getByTestId('zaznam-staceni');
    expect(zaznam.textContent).toContain('1,5 L');
    expect(zaznam.textContent).toContain('30 ks');
    fireEvent.click(within(zaznam).getByLabelText('Ubrat kus'));
    fireEvent.click(within(zaznam).getByLabelText('Přidat kus'));
    fireEvent.click(within(zaznam).getByLabelText('Smazat záznam'));
    expect(onKus.mock.calls).toEqual([['a', -1], ['a', 1]]);
    expect(onSmazat).toHaveBeenCalledWith('a');
    fireEvent.click(within(zaznam).getByLabelText('Upravit záznam'));
    expect(onUpravit).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('úprava záznamu dialog zavře — dva dialogy přes sebe by se překrývaly', () => {
    vykresli(SARZE);
    otevri();
    fireEvent.click(within(screen.getAllByTestId('zaznam-staceni')[0]).getByLabelText('Upravit záznam'));
    expect(screen.queryByTestId('detail-radku')).toBeNull();
  });

  it('automatický záznam má v dialogu pod sebou, odkud se vzal', () => {
    vykresli([radek({ id: 'x', note: 'Založeno zaškrtnutím "Stočeno" u objednávky' })]);
    otevri();
    expect(within(screen.getByTestId('zaznam-staceni')).getByText(/Založeno zaškrtnutím/)).toBeTruthy();
  });

  it('„Další sud" pošle záznamy šarže, velikost a počet — a zavře dialog', () => {
    const { onDalsiSud } = vykresli(SARZE);
    otevri();
    fireEvent.click(screen.getByRole('button', { name: /Další sud/ }));
    expect(onDalsiSud).toHaveBeenCalledTimes(1);
    const [zaznamy, velikost, pocet] = onDalsiSud.mock.calls[0];
    expect(zaznamy.map((z: EntryRow) => z.id).sort()).toEqual(['a', 'b']);
    expect(velikost).toBe('k50');
    expect(pocet).toBe(2);
    expect(screen.queryByTestId('detail-radku')).toBeNull();
  });

  it('bez sudu žádné „Další sud" není a dialog to říká', () => {
    vykresli([radek({ id: 'x', kegs_used: null, kegs_used_package_id: null })]);
    otevri();
    expect(screen.queryByRole('button', { name: /Další sud/ })).toBeNull();
    expect(screen.getByTestId('detail-radku').textContent).toContain('bez sudu (stáčeno rovnou z tanku)');
  });

  it('den a pivo: tlačítko se odemkne, až když se něco změní, a pošle celý řádek', async () => {
    const { onDatumPivo } = vykresli(SARZE);
    otevri();
    const uloz = screen.getByRole('button', { name: 'Uložit den a pivo' }) as HTMLButtonElement;
    expect(uloz.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Datum'), { target: { value: '2026-10-13' } });
    expect(uloz.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Pivo'), { target: { value: 'bj' } });
    await act(async () => { fireEvent.click(uloz); });
    expect(onDatumPivo).toHaveBeenCalledTimes(1);
    expect(onDatumPivo.mock.calls[0][0].klic).toBe(getBatchId(SARZE[0]));
    expect(onDatumPivo.mock.calls[0][1]).toEqual({ datum: '2026-10-13', beerId: 'bj' });
    // zapsáno → dialog se zavře
    expect(screen.queryByTestId('detail-radku')).toBeNull();
  });

  it('když se den a pivo nepodaří zapsat, dialog zůstane otevřený s tím, co jsem napsal', async () => {
    vykresli(SARZE, { onDatumPivo: vi.fn().mockResolvedValue(false) });
    otevri();
    fireEvent.change(screen.getByLabelText('Datum'), { target: { value: '2026-10-13' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Uložit den a pivo' })); });
    expect(screen.getByTestId('detail-radku')).toBeTruthy();
    expect((screen.getByLabelText('Datum') as HTMLInputElement).value).toBe('2026-10-13');
    expect((screen.getByRole('button', { name: 'Uložit den a pivo' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('pivo, které už není aktivní, se v nabídce drží, ať se řádku nezmění pivo samo', () => {
    vykresli([radek({ id: 'x', beer_id: 'stare', beer_name: 'Stará várka' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Podrobnosti: Stará várka' }));
    const select = screen.getByLabelText('Pivo') as HTMLSelectElement;
    expect(select.value).toBe('stare');
    expect([...select.options].map((o) => o.textContent)).toContain('Stará várka');
  });

  it('smazání celého řádku pošle řádek obrazovce a dialog zavře', () => {
    const { onSmazRadek } = vykresli(SARZE);
    otevri();
    fireEvent.click(screen.getByRole('button', { name: /Smazat celý řádek/ }));
    expect(onSmazRadek).toHaveBeenCalledTimes(1);
    expect(onSmazRadek.mock.calls[0][0].zaznamy.map((z: EntryRow) => z.id)).toEqual(['a', 'b']);
    expect(screen.queryByTestId('detail-radku')).toBeNull();
  });

  it('dialog se zavře sám, když řádek mezitím zmizí (smazán jinde)', () => {
    const { rerender, props } = vykresli(SARZE);
    otevri();
    expect(screen.getByTestId('detail-radku')).toBeTruthy();
    rerender(<PrehledStaceniLahvi {...props} davky={davkyStaceni([], objem)} />);
    expect(screen.queryByTestId('detail-radku')).toBeNull();
  });

  it('dialog zůstane otevřený a ukáže nová čísla, když se data přenačtou', () => {
    const { rerender, props } = vykresli(SARZE);
    otevri();
    const novy = [{ ...SARZE[0], quantity: 31 }, SARZE[1]];
    rerender(<PrehledStaceniLahvi {...props} davky={davkyStaceni(novy, objem)} />);
    expect(within(screen.getByTestId('detail-radku')).getAllByTestId('zaznam-staceni')[0].textContent).toContain('31 ks');
  });
});

describe('filtr obalu: v řádcích je jen část stáčení', () => {
  // Zapnutý filtr obalu schová záznamy ostatních obalů téže šarže. Výtrata by
  // vycházela špatně a prázdná buňka by mohla zdvojit schovaný záznam.
  const SARZE = [
    radek({ id: 'a', package_id: 'l05', quantity: 20, kegs_used: 2 }),
  ];
  const vykresliCast = () => vykresli(SARZE, { castecnyVyber: true });

  it('výtrata se nepočítá a řádek říká, že je jen z vybraných obalů — i součet dne', () => {
    vykresliCast();
    expect(screen.getAllByTestId('souhrn-radku')[0].textContent).toBe('10 L (jen vybrané obaly)');
    expect(screen.queryByTestId('vytrata-radku')).toBeNull();
    expect(screen.getByTestId('celkem-litry').textContent).toBe('10 L (jen vybrané obaly)');
  });

  it('prázdné buňky lahví jsou zamčené (mohly by zdvojit schovaný záznam)', () => {
    vykresliCast();
    const prazdna = bunkaLahve(radky()[0], '1 L') as HTMLButtonElement;
    expect(prazdna.disabled).toBe(true);
    expect(prazdna.getAttribute('aria-label')).toContain('zamčeno filtrem obalu');
    expect(prazdna.getAttribute('title')).toMatch(/Filtr obalu je zapnutý/);
    fireEvent.click(prazdna);
    expect(screen.queryByLabelText(/lahve — počet/)).toBeNull();
  });

  it('vyplněná buňka lahví a buňky sudů se dál přepisují', async () => {
    const { onLahve, onSudy } = vykresliCast();
    fireEvent.click(bunkaLahve(radky()[0], '0,5 L'));
    const policko = screen.getByLabelText(/0,5 L lahve — počet/);
    fireEvent.change(policko, { target: { value: '18' } });
    await enter(policko);
    expect(onLahve).toHaveBeenCalledTimes(1);

    fireEvent.click(bunkaSudu(radky()[0], '50 L'));
    const sudy = screen.getByLabelText(/sud 50 L — počet/);
    fireEvent.change(sudy, { target: { value: '3' } });
    await enter(sudy);
    expect(onSudy).toHaveBeenCalledTimes(1);
  });

  it('prázdná buňka SUDU zamčená není (sudy patří celé šarži, filtr na ně nemá vliv)', () => {
    vykresliCast();
    expect((bunkaSudu(radky()[0], '30 L') as HTMLButtonElement).disabled).toBe(false);
  });

  it('nahoře je vidět proč', () => {
    vykresliCast();
    expect(screen.getByText(/Filtr obalu je zapnutý: výtrata se nepočítá/)).toBeTruthy();
  });

  it('podrobnosti: „Další sud" a smazání celého řádku chybí, den a pivo zůstává', () => {
    vykresliCast();
    fireEvent.click(screen.getByRole('button', { name: 'Podrobnosti: 12° Světlá' }));
    expect(screen.queryByRole('button', { name: /Další sud/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Smazat celý řádek/ })).toBeNull();
    expect(screen.getByTestId('detail-radku').textContent).toContain('jdou až po jeho vypnutí');
    expect(screen.getByRole('button', { name: 'Uložit den a pivo' })).toBeTruthy();
    expect(screen.getAllByTestId('zaznam-staceni')).toHaveLength(1); // záznam jde dál upravit i smazat
  });

  it('bez filtru nic z toho neplatí', () => {
    vykresli(SARZE);
    expect(screen.queryByText(/Filtr obalu je zapnutý/)).toBeNull();
    expect((bunkaLahve(radky()[0], '1 L') as HTMLButtonElement).disabled).toBe(false);
    expect(within(screen.getAllByTestId('souhrn-radku')[0]).getByTestId('vytrata-radku')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Podrobnosti: 12° Světlá' }));
    expect(screen.getByRole('button', { name: /Smazat celý řádek/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Další sud/ })).toBeTruthy();
  });
});

describe('přepsaná data', () => {
  it('po přenačtení se v buňce ukáže nové číslo', () => {
    const { rerender, props } = vykresli([DEN_PO[0], DEN_PO[1]]);
    expect(bunkaLahve(radky()[0], '1 L').textContent).toBe('44');
    rerender(<PrehledStaceniLahvi {...props} davky={davkyStaceni([DEN_PO[0], { ...DEN_PO[1], quantity: 40 }], objem)} />);
    expect(bunkaLahve(radky()[0], '1 L').textContent).toBe('40');
  });

  it('rozepsané číslo přežije přenačtení dat na pozadí', () => {
    const { rerender, props } = vykresli([DEN_PO[0], DEN_PO[1]]);
    fireEvent.click(bunkaLahve(radky()[0], '1 L'));
    fireEvent.change(screen.getByLabelText(/lahve — počet/), { target: { value: '41' } });
    rerender(<PrehledStaceniLahvi {...props} davky={davkyStaceni([DEN_PO[0], { ...DEN_PO[1], quantity: 44 }], objem)} />);
    expect((screen.getByLabelText(/lahve — počet/) as HTMLInputElement).value).toBe('41');
  });
});

// Políčko samo, bez tabulky kolem: tabulka ho po prvním potvrzení odstraní, takže
// se v ní druhé volání (blur po Enteru) nikdy nedostane ke slovu. Tady zůstane.
describe('PolicekCisla', () => {
  const vykresliPolicko = (vychozi = '5') => {
    const onPotvrdit = vi.fn();
    const onZrusit = vi.fn();
    render(<PolicekCisla vychozi={vychozi} popisek="počet" onPotvrdit={onPotvrdit} onZrusit={onZrusit} />);
    return { policko: screen.getByLabelText('počet') as HTMLInputElement, onPotvrdit, onZrusit };
  };

  it('má předvyplněné číslo a po zobrazení je vybrané (přepíše se jedním tahem)', () => {
    const { policko } = vykresliPolicko('44');
    expect(policko.value).toBe('44');
    expect(document.activeElement).toBe(policko);
  });

  it('Enter potvrdí text a následný blur už nepotvrdí podruhé', () => {
    const { policko, onPotvrdit, onZrusit } = vykresliPolicko();
    fireEvent.change(policko, { target: { value: '7' } });
    fireEvent.keyDown(policko, { key: 'Enter' });
    fireEvent.blur(policko);
    expect(onPotvrdit).toHaveBeenCalledTimes(1);
    expect(onPotvrdit).toHaveBeenCalledWith('7');
    expect(onZrusit).not.toHaveBeenCalled();
  });

  it('blur potvrdí text a následný Enter už nepotvrdí podruhé', () => {
    const { policko, onPotvrdit } = vykresliPolicko();
    fireEvent.change(policko, { target: { value: '8' } });
    fireEvent.blur(policko);
    fireEvent.keyDown(policko, { key: 'Enter' });
    expect(onPotvrdit).toHaveBeenCalledTimes(1);
    expect(onPotvrdit).toHaveBeenCalledWith('8');
  });

  it('Escape zruší a následný blur nepotvrdí nic', () => {
    const { policko, onPotvrdit, onZrusit } = vykresliPolicko();
    fireEvent.change(policko, { target: { value: '999' } });
    fireEvent.keyDown(policko, { key: 'Escape' });
    fireEvent.blur(policko);
    expect(onZrusit).toHaveBeenCalledTimes(1);
    expect(onPotvrdit).not.toHaveBeenCalled();
  });

  it('text se předává tak, jak je napsaný — i s čárkou nebo mezerami', () => {
    const { policko, onPotvrdit } = vykresliPolicko('');
    fireEvent.change(policko, { target: { value: ' 4,5 ' } });
    fireEvent.keyDown(policko, { key: 'Enter' });
    expect(onPotvrdit).toHaveBeenCalledWith(' 4,5 ');
  });
});
