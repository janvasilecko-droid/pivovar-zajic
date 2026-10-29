// 🚐 Kniha jízd — celá obrazovka (29. 10. 2026): úprava a tankování, uzávěrka měsíce se zámkem,
// mazání s posunem tachometru a generování z objednávek jedním atomickým zápisem.
// Appka musí fungovat PŘED i PO spuštění migrace v databázi.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const h = vi.hoisted(() => ({
  entries: [] as Record<string, unknown>[],
  vehicles: [] as Record<string, unknown>[],
  orders: [] as Record<string, unknown>[],
  places: [] as Record<string, unknown>[],
  stareVygenerovane: [] as { id: string }[],
  auth: { profile: { role: 'admin' } as Record<string, unknown> | null, user: { id: 'u1' } },
  stav: { dostupne: true, mesice: [] as Record<string, unknown>[] },
  ulozDavku: vi.fn(),
  starym: vi.fn(),
  uzavrit: vi.fn(),
  otevrit: vi.fn(),
  chyba: vi.fn(),
  oznam: vi.fn(),
  potvrd: vi.fn(),
}));

vi.mock('../lib/supabase', () => {
  // Odpověď, na které jde dál volat .order()/.in()/… a taky na ni počkat — jako skutečný query builder.
  const dotaz = (data: unknown) => {
    const p: any = Promise.resolve({ data, error: null });
    for (const m of ['order', 'neq', 'or', 'in', 'filter', 'eq', 'select']) p[m] = () => p;
    return p;
  };
  return {
    useRealtime: () => {},
    // Výběr jen sloupce `id` z knihy jízd = hledání dřív vygenerovaných jízd (viz generátor).
    fetchAllRows: (tabulka: string, sloupce?: string) =>
      dotaz(tabulka === 'orders' ? h.orders : sloupce === 'id' ? h.stareVygenerovane : h.entries),
    supabase: {
      from: (tabulka: string) => ({
        select: () => dotaz(tabulka === 'vehicles' ? h.vehicles : h.places),
      }),
    },
  };
});
vi.mock('../lib/auth', () => ({ useAuth: () => h.auth }));
vi.mock('../lib/knihaJizdDb', async () => {
  const actual = await vi.importActual<typeof import('../lib/knihaJizdDb')>('../lib/knihaJizdDb');
  return {
    ...actual,
    nactiUzavreneMesice: async () => ({ dostupne: h.stav.dostupne, mesice: h.stav.mesice }),
    ulozDavku: (...a: unknown[]) => h.ulozDavku(...a),
    ulozDavkuStarymZpusobem: (...a: unknown[]) => h.starym(...a),
    uzavritMesic: (...a: unknown[]) => h.uzavrit(...a),
    otevritMesic: (...a: unknown[]) => h.otevrit(...a),
  };
});
vi.mock('../lib/toast', () => ({
  chyba: (...a: unknown[]) => h.chyba(...a),
  oznam: (...a: unknown[]) => h.oznam(...a),
  potvrd: (...a: unknown[]) => h.potvrd(...a),
}));
vi.mock('../lib/excel', () => ({ exportHistoryDetailToExcel: vi.fn() }));
vi.mock('../lib/safePrint', () => ({ printTable: vi.fn() }));
vi.mock('../lib/routeDistance', () => ({
  computeRouteDistanceKm: async () => ({ km: 42.5, missingCoords: [] }),
  popisTrasyDne: (jmena: string[]) => [...jmena, 'Kynšperk nad Ohří'].join(' → '),
}));
vi.mock('../lib/zavozKachnaDb', () => ({ preneseMistniKachnu: async () => [] }));
vi.mock('../components/WeeklyOrderSummaryCard', () => ({ isoWeekKey: () => '2026-W42', weekRange: () => ({ start: '2026-10-12' }) }));
vi.mock('../lib/businessDate', () => ({ businessDateISO: () => '2026-10-20' }));

import KnihaJizdScreen from './KnihaJizdScreen';

const BOXER = 'Boxer (3K1 2244)';
const KACENA = 'Kačena (5K5 5555)';

/** Řádek tabulky logbook_entries tak, jak ho vrací databáze. */
const radek = (o: Record<string, unknown>) => ({
  id: 'x', entry_date: '2026-10-05', vehicle_id: null, vehicle_name: BOXER, driver: 'Petr Bednář',
  route_from: 'Kynšperk nad Ohří (Pivovar)', route_to: 'Sokolov → Kynšperk nad Ohří', purpose: 'Rozvoz piva',
  km_start: 1000, km_end: 1080, km_driven: 80, fuel_liters: null, note: null, created_at: '2026-10-05T08:00:00Z',
  km_trasa: 80, km_dorovnani: 0, uzavreno_at: null, ...o,
});

const tankovani = (o: Record<string, unknown> = {}) =>
  radek({ id: 't', entry_date: '2026-10-12', route_from: 'Tankování', route_to: 'Benzina', purpose: 'Tankování', km_start: 1130, km_end: 1130, km_driven: 0, km_trasa: 0, fuel_liters: 40, created_at: '2026-10-12T12:00:00Z', ...o });

function zakladniData() {
  h.vehicles = [{ id: 'v1', name: 'Boxer', spz: '3K1 2244' }, { id: 'v2', name: 'Kačena', spz: '5K5 5555' }];
  h.entries = [
    radek({ id: 'a', entry_date: '2026-10-05', route_to: 'Sokolov → Kynšperk nad Ohří', km_start: 1000, km_end: 1080, km_driven: 80, km_trasa: 80 }),
    radek({ id: 'b', entry_date: '2026-10-12', route_to: 'Cheb → Kynšperk nad Ohří', km_start: 1080, km_end: 1130, km_driven: 50, km_trasa: 50, created_at: '2026-10-12T08:00:00Z' }),
    tankovani(),
    radek({ id: 'k1', entry_date: '2026-10-07', vehicle_name: KACENA, route_to: 'Karlovy Vary → Kynšperk nad Ohří', km_start: 500, km_end: 540, km_driven: 40, km_trasa: 40, uzavreno_at: '2026-11-02T08:00:00Z' }),
  ];
  h.stav = {
    dostupne: true,
    mesice: [{ id: 'u1', vehicle_name: KACENA, month: '2026-10', km_start: 500, km_end: 545, km_trasa: 40, km_dorovnani: 5, rezim: 'rovnomerne', pocet_jizd: 1, closed_at: '2026-11-02T08:00:00Z', closed_by: null }],
  };
}

beforeEach(() => {
  for (const f of [h.ulozDavku, h.starym, h.uzavrit, h.otevrit, h.chyba, h.oznam, h.potvrd]) f.mockReset();
  h.ulozDavku.mockResolvedValue({ ok: true, smazano: 0, upraveno: 0, vlozeno: 0 });
  h.starym.mockResolvedValue({ ok: true, smazano: 0, upraveno: 0, vlozeno: 0 });
  h.uzavrit.mockResolvedValue({ ok: true, pocet: 3 });
  h.otevrit.mockResolvedValue({ ok: true, pocet: 1 });
  h.potvrd.mockResolvedValue(true);
  h.auth = { profile: { role: 'admin' }, user: { id: 'u1' } };
  h.orders = [];
  h.places = [];
  h.stareVygenerovane = [];
  zakladniData();
});

/** Seznam jízd (tabulka pro počítač; karty pro telefon jsou v DOM taky, proto se hledá v tabulce). */
async function otevri(props: { uvodniAkce?: string } = {}) {
  render(<KnihaJizdScreen setPage={vi.fn()} {...props} />);
  await screen.findByText(/Evidenční list/);
  return screen.getAllByRole('table')[0];
}
const radekTabulky = (tabulka: HTMLElement, text: RegExp | string) => within(tabulka).getByText(text).closest('tr') as HTMLElement;

describe('Kniha jízd po migraci', () => {
  it('karta Uzávěrka měsíce ukáže otevřené auto s tlačítkem Uzavřít a uzavřené s tlačítkem Otevřít', async () => {
    await otevri();
    expect(screen.getByText('Uzávěrka měsíce')).toBeTruthy();
    expect(screen.getByText(/Otevřeno · 2\sjízdy/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Uzavřít měsíc/ })).toHaveLength(1);
    expect(screen.getByText(/Uzavřeno .* tachometr 500 → 545 km · dorovnáno \+5 km/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Otevřít měsíc' })).toHaveLength(1);
  });

  it('počet jízd nepočítá tankování; to se píše zvlášť', async () => {
    await otevri();
    expect(screen.getByText('Jízdy').nextSibling?.textContent).toBe('3');
    expect(screen.getByText(/\+ 1\stankování/)).toBeTruthy();
  });

  it('jízda v uzavřeném měsíci má zámek a nejde ji upravit ani smazat', async () => {
    const tabulka = await otevri();
    const zamcena = radekTabulky(tabulka, /Karlovy Vary/);
    expect(within(zamcena).getByRole('img', { name: 'Měsíc je uzavřený' })).toBeTruthy();
    expect(within(zamcena).queryByRole('button', { name: 'Smazat' })).toBeNull();
    expect(within(zamcena).queryByRole('button', { name: 'Upravit' })).toBeNull();
    const otevrena = radekTabulky(tabulka, /Cheb/);
    expect(within(otevrena).getByRole('button', { name: 'Smazat' })).toBeTruthy();
    expect(within(otevrena).getByRole('button', { name: 'Upravit' })).toBeTruthy();
  });

  it('tankování je v seznamu jako tankování: litry místo km', async () => {
    const tabulka = await otevri();
    const r = radekTabulky(tabulka, 'Benzina');
    expect(within(r).getByText('40 l')).toBeTruthy();
  });

  it('smazání jízdy uprostřed měsíce vrátí tachometr pozdějších v jedné dávce', async () => {
    const tabulka = await otevri();
    fireEvent.click(within(radekTabulky(tabulka, /Sokolov/)).getByRole('button', { name: 'Smazat' }));
    await waitFor(() => expect(h.ulozDavku).toHaveBeenCalledTimes(1));
    expect(h.potvrd.mock.calls[0][0]).toMatch(/Tachometr 2\sdalších jízd v měsíci se vrátí o 80 km/);
    expect(h.ulozDavku.mock.calls[0][0]).toEqual({
      smazat: ['a'],
      upravit: [
        { id: 'b', km_start: 1000, km_end: 1050 },
        { id: 't', km_start: 1050, km_end: 1050 },
      ],
    });
    expect(h.starym).not.toHaveBeenCalled();
  });

  it('zrušené potvrzení nic nesmaže', async () => {
    h.potvrd.mockResolvedValue(false);
    const tabulka = await otevri();
    fireEvent.click(within(radekTabulky(tabulka, /Cheb/)).getByRole('button', { name: 'Smazat' }));
    await waitFor(() => expect(h.potvrd).toHaveBeenCalled());
    expect(h.ulozDavku).not.toHaveBeenCalled();
  });

  it('chybu zápisu hlásí a seznam nechá, jak je', async () => {
    h.ulozDavku.mockResolvedValue({ ok: false, chyba: 'Jízda je v uzavřeném měsíci', chybiMigrace: false });
    const tabulka = await otevri();
    fireEvent.click(within(radekTabulky(tabulka, /Cheb/)).getByRole('button', { name: 'Smazat' }));
    await waitFor(() => expect(h.chyba).toHaveBeenCalled());
    expect(String(h.chyba.mock.calls[0][0])).toMatch(/Nepodařilo se smazat záznam: Jízda je v uzavřeném měsíci/);
  });

  it('Upravit otevře okno s jízdou a uloží změnu i posun pozdějších jízd', async () => {
    const tabulka = await otevri();
    fireEvent.click(within(radekTabulky(tabulka, /Cheb/)).getByRole('button', { name: 'Upravit' }));
    expect(screen.getByRole('heading', { name: 'Upravit jízdu' })).toBeTruthy();
    const ujeto = screen.getByText('Ujeté km', { selector: 'label' }).parentElement!.querySelector('input')!;
    fireEvent.change(ujeto, { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Uložit změny' }));
    await waitFor(() => expect(h.ulozDavku).toHaveBeenCalledTimes(1));
    expect(h.ulozDavku.mock.calls[0][0]).toEqual({
      upravit: [
        { id: 'b', km_end: 1140, km_driven: 60, km_trasa: 60 },
        { id: 't', km_start: 1140, km_end: 1140 },
      ],
    });
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Upravit jízdu' })).toBeNull());
  });

  it('tankování z lišty: začne na aktuálním stavu tachometru auta a zapíše záznam bez km', async () => {
    await otevri();
    fireEvent.click(screen.getByRole('button', { name: 'Zapsat tankování' }));
    expect(screen.getByRole('heading', { name: 'Tankování' })).toBeTruthy();
    const litry = screen.getByText('Natankováno (l)', { selector: 'label' }).parentElement!.querySelector('input')!;
    fireEvent.change(litry, { target: { value: '38.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Uložit' }));
    await waitFor(() => expect(h.ulozDavku).toHaveBeenCalledTimes(1));
    const davka = h.ulozDavku.mock.calls[0][0] as { vlozit: Record<string, unknown>[] };
    expect(davka.vlozit[0]).toMatchObject({ vehicle_name: BOXER, km_start: 1130, km_end: 1130, km_driven: 0, fuel_liters: 38.5, entry_date: '2026-10-20' });
  });

  it('dlaždice na ploše „Zapsat tankování“ otevře okno rovnou, jízda mimo objednávky taky', async () => {
    render(<KnihaJizdScreen setPage={vi.fn()} uvodniAkce="tankovani" />);
    expect(await screen.findByRole('heading', { name: 'Tankování' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zrušit' }));
    expect(screen.queryByRole('heading', { name: 'Tankování' })).toBeNull();
  });

  it('dlaždice „nová jízda“ otevře okno nové jízdy', async () => {
    render(<KnihaJizdScreen setPage={vi.fn()} uvodniAkce="jizdy" />);
    expect(await screen.findByRole('heading', { name: 'Nová jízda' })).toBeTruthy();
  });

  it('Uzavřít měsíc: průvodce pošle stavy tachometru a po úspěchu se zavře', async () => {
    await otevri();
    fireEvent.click(screen.getByRole('button', { name: /Uzavřít měsíc/ }));
    expect(screen.getByRole('heading', { name: 'Uzávěrka — říjen 2026' })).toBeTruthy();
    const konec = screen.getByText('Tachometr na konci měsíce (km)', { selector: 'label' }).parentElement!.querySelector('input')!;
    fireEvent.change(konec, { target: { value: '1140' } });
    // Tlačítko v okně průvodce (stejný popisek má i tlačítko na kartě pod ním).
    const okno = screen.getByRole('heading', { name: 'Uzávěrka — říjen 2026' }).closest('.card') as HTMLElement;
    fireEvent.click(within(okno).getByRole('button', { name: 'Uzavřít měsíc' }));
    await waitFor(() => expect(h.uzavrit).toHaveBeenCalledTimes(1));
    expect(h.uzavrit.mock.calls[0][0]).toMatchObject({ vozidlo: BOXER, mesic: '2026-10', tachometrZacatek: 1000, tachometrKonec: 1140, rezim: 'rovnomerne' });
    await waitFor(() => expect(h.oznam).toHaveBeenCalled());
    expect(String(h.oznam.mock.calls[0][0])).toMatch(/říjen 2026 auta Boxer .* je uzavřený/);
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Uzávěrka — říjen 2026' })).toBeNull());
  });

  it('Otevřít měsíc se potvrdí a zavolá otevření pro to auto a měsíc', async () => {
    await otevri();
    fireEvent.click(screen.getByRole('button', { name: 'Otevřít měsíc' }));
    await waitFor(() => expect(h.otevrit).toHaveBeenCalledWith(KACENA, '2026-10'));
    expect(h.potvrd.mock.calls[0][0]).toMatch(/Otevřít měsíc říjen 2026 auta Kačena/);
  });

  it('řidič (ne vedení) uzavřený měsíc otevřít nemůže, jen uzavřít', async () => {
    h.auth = { profile: { role: 'driver' }, user: { id: 'u2' } };
    await otevri();
    expect(screen.queryByRole('button', { name: 'Otevřít měsíc' })).toBeNull();
    expect(screen.getAllByRole('button', { name: /Uzavřít měsíc/ })).toHaveLength(1);
  });

  it('kdo nesmí zapisovat, nevidí žádné tlačítko pro zápis', async () => {
    h.auth = { profile: { role: 'driver', permissions: { kniha_jizd: { view: true, edit: false } } }, user: { id: 'u3' } };
    const tabulka = await otevri();
    expect(screen.queryByRole('button', { name: /Generovat z objednávek/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Jízda/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Zapsat tankování' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Uzavřít měsíc/ })).toBeNull();
    expect(within(tabulka).queryByRole('button', { name: 'Smazat' })).toBeNull();
    expect(within(tabulka).queryByRole('button', { name: 'Upravit' })).toBeNull();
  });
});

describe('Kniha jízd před migrací', () => {
  beforeEach(() => {
    h.stav = { dostupne: false, mesice: [] };
    h.entries = h.entries
      .filter((e) => e.vehicle_name === BOXER)
      .map((e) => ({ ...e, km_trasa: undefined, km_dorovnani: undefined, uzavreno_at: undefined }));
  });

  it('žádná karta uzávěrky ani Upravit; vedení dostane odkaz, kde migraci spustit', async () => {
    const tabulka = await otevri();
    expect(screen.queryByText('Uzávěrka měsíce')).toBeNull();
    expect(within(tabulka).queryByRole('button', { name: 'Upravit' })).toBeNull();
    expect(screen.getByRole('status').textContent).toMatch(/Systém → Databázové migrace/);
    expect(screen.getByRole('button', { name: 'Otevřít Systém' })).toBeTruthy();
  });

  it('řidič žádné upozornění na migraci nevidí', async () => {
    h.auth = { profile: { role: 'driver' }, user: { id: 'u2' } };
    await otevri();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('mazání jde starým způsobem a bez posunu (ten potřebuje migraci)', async () => {
    const tabulka = await otevri();
    fireEvent.click(within(radekTabulky(tabulka, /Sokolov/)).getByRole('button', { name: 'Smazat' }));
    await waitFor(() => expect(h.starym).toHaveBeenCalledWith({ smazat: ['a'] }));
    expect(h.ulozDavku).not.toHaveBeenCalled();
  });

  it('jízdu na konec řady jde zapsat i bez migrace', async () => {
    await otevri();
    fireEvent.click(screen.getByRole('button', { name: /Jízda/ }));
    const pole = (t: string) => screen.getByText(t, { selector: 'label' }).parentElement!.querySelector('input')!;
    fireEvent.change(pole('Kam / trasa'), { target: { value: 'Cheb' } });
    fireEvent.change(pole('Ujeté km'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Uložit' }));
    await waitFor(() => expect(h.starym).toHaveBeenCalledTimes(1));
    expect((h.starym.mock.calls[0][0] as { vlozit: Record<string, unknown>[] }).vlozit[0]).toMatchObject({ km_start: 1130, km_end: 1160, km_driven: 30 });
  });
});

describe('Generování z objednávek', () => {
  const objednavka = (o: Record<string, unknown> = {}) => ({
    id: 'o1', place_id: 'p1', place_name: 'Sokolov', delivery_date: '2026-10-14', order_date: '2026-10-10',
    delivery_day: null, status: 'nova', second_car: false, zavoz_cislo: 1, ...o,
  });

  async function dojdiNaNahled() {
    await otevri();
    fireEvent.click(screen.getByRole('button', { name: /Generovat z objednávek/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Načíst dny z objednávek/ }));
    return screen.findByRole('button', { name: /Vygenerovat 1/ });
  }

  it('staré vygenerované jízdy nahradí novými v jedné dávce, s km z trasy jako základem uzávěrky', async () => {
    h.orders = [objednavka()];
    h.stareVygenerovane = [{ id: 'stary1' }, { id: 'stary2' }];
    fireEvent.click(await dojdiNaNahled());
    await waitFor(() => expect(h.ulozDavku).toHaveBeenCalledTimes(1));
    const davka = h.ulozDavku.mock.calls[0][0] as { smazat: string[]; vlozit: Record<string, unknown>[] };
    expect(davka.smazat).toEqual(['stary1', 'stary2']);
    expect(davka.vlozit).toHaveLength(1);
    expect(davka.vlozit[0]).toMatchObject({
      entry_date: '2026-10-14',
      vehicle_name: BOXER,
      route_to: 'Sokolov → Kynšperk nad Ohří',
      km_start: 120000,
      km_end: 120042.5,
      km_driven: 42.5,
      km_trasa: 42.5,
      km_dorovnani: 0,
    });
    expect(String(davka.vlozit[0].note)).toMatch(/^Vygenerováno z objednávek/);
    await waitFor(() => expect(h.oznam).toHaveBeenCalledWith(expect.stringMatching(/vygenerováno 1/)));
  });

  it('objednávka označená jako Kačena se zapíše na druhé auto', async () => {
    h.orders = [objednavka({ second_car: true })];
    h.stav.mesice = []; // říjen Kačeny je v tomhle testu otevřený
    fireEvent.click(await dojdiNaNahled());
    await waitFor(() => expect(h.ulozDavku).toHaveBeenCalled());
    expect((h.ulozDavku.mock.calls[0][0] as { vlozit: Record<string, unknown>[] }).vlozit[0]).toMatchObject({ vehicle_name: KACENA });
  });

  it('do uzavřeného měsíce auta nezapíše nic a řekne proč', async () => {
    h.orders = [objednavka({ second_car: true })];
    fireEvent.click(await dojdiNaNahled());
    await waitFor(() => expect(h.chyba).toHaveBeenCalled());
    expect(String(h.chyba.mock.calls[0][0])).toMatch(/říjen 2026 je u auta Kačena .* uzavřený/);
    expect(h.ulozDavku).not.toHaveBeenCalled();
  });

  it('chyba atomického zápisu se ohlásí a okno zůstane otevřené', async () => {
    h.orders = [objednavka()];
    h.ulozDavku.mockResolvedValue({ ok: false, chyba: 'Spojení spadlo', chybiMigrace: false });
    fireEvent.click(await dojdiNaNahled());
    await waitFor(() => expect(h.chyba).toHaveBeenCalled());
    expect(String(h.chyba.mock.calls[0][0])).toMatch(/Nepodařilo se uložit vygenerované jízdy: Spojení spadlo/);
    expect(screen.getByRole('button', { name: /Vygenerovat 1/ })).toBeTruthy();
  });
});
