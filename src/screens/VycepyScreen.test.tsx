// Obrazovka Výčepy: evidence výčepů, čištění, rezervace a vracení.
//
// 5. 11. 2026, test výčepů. V ostré databázi byly 0 výčepů a 0 rezervací, i když
// je obsluha zkoušela zakládat. Příčina: tlačítka „Opláchnuto“ / „Louh“ i přidání
// výčepu posílala čas jako ČESKÝ TEXT („5. 11. 2026 11:06“) do sloupce
// timestamptz a databáze ho odmítla — chyba se jen na vteřinu mihla v hlášce a
// výčep zmizel při příštím načtení.
//
// Test proto běží proti ATRAPĚ DATABÁZE, která je stejně přísná jako Postgres
// (id musí být uuid, čas platný timestamptz, rezervace musí mít existující výčep).
// Skutečná datová vrstva (lib/vycepyData.ts) se nemokuje.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const toast = vi.hoisted(() => ({
  chyba: vi.fn(),
  oznam: vi.fn(),
  potvrd: vi.fn(async () => true),
}));

vi.mock('../lib/supabase', async () => {
  const { supabaseAtrapa } = await import('../test/atrapaVycepyDb');
  return { supabase: supabaseAtrapa, useRealtime: () => {} };
});
vi.mock('../lib/toast', () => toast);

import VycepyScreen from './VycepyScreen';
import { vycistiMigraciProTesty } from '../lib/vycepyData';
import { db, vycistiDb, ID_A, ID_B, radekVycepu, radekRezervace } from '../test/atrapaVycepyDb';

const ISO_CAS = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

const datumy = () => Array.from(document.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
// Rezervace jsou na obrazovce dvakrát (mobilní karty a tabulka); jsdom CSS neřeší, tak se bere řádek tabulky.
const radekTabulky = (text: string) => screen.getAllByText(text).map((el) => el.closest('tr')).find(Boolean)!;

beforeEach(() => {
  vycistiDb();
  toast.chyba.mockClear();
  toast.oznam.mockClear();
  toast.potvrd.mockClear();
  localStorage.clear();
  vycistiMigraciProTesty();
});

describe('Výčepy — prázdná evidence', () => {
  it('bez výčepů ukáže prázdno, ne čtyři ukázkové výčepy', async () => {
    render(<VycepyScreen />);
    // Hned po vykreslení, ještě než dorazí odpověď databáze — právě tehdy se
    // ukázkové výčepy dřív ukazovaly jako skutečné vybavení.
    expect(screen.queryByText(/Pygmy/)).toBeNull();
    expect(screen.queryByText('Výčep #1 — Lindr Pygmy 25')).toBeNull();
    expect(await screen.findByText('Zatím nemáte přidané žádné výčepy.')).toBeTruthy();
    expect(screen.queryByText(/Pygmy/)).toBeNull();
    expect(screen.queryByText(/Trojkohout Master/)).toBeNull();
    expect(screen.queryByText(/Šestikohout na akce/)).toBeNull();
  });
});

describe('Výčepy — přidání výčepu', () => {
  it('nový výčep se uloží do databáze (dřív ho odmítl čas „5. 11. 2026 11:06“)', async () => {
    render(<VycepyScreen />);
    await screen.findByText('Zatím nemáte přidané žádné výčepy.');
    fireEvent.click(screen.getByRole('button', { name: /Přidat výčepní zařízení/ }));
    fireEvent.change(screen.getByPlaceholderText(/Např\. Výčep #4/), { target: { value: 'Výčep Zahrada' } });
    fireEvent.change(screen.getByDisplayValue('Jednokohout'), { target: { value: 'dvojkohout' } });
    fireEvent.click(screen.getByRole('button', { name: 'Uložit výčep' }));

    await waitFor(() => expect(db.vycepy).toHaveLength(1));
    expect(toast.chyba).not.toHaveBeenCalled();
    expect(db.vycepy[0]).toMatchObject({ nazev: 'Výčep Zahrada', typ: 'dvojkohout', stav: 'clean', kohouty_rozebrane: true });
    expect(db.vycepy[0].posledni_oplach).toMatch(ISO_CAS);
    // Na kartě je čas česky, ne jako ISO.
    expect(await screen.findByText(/^\d{1,2}\. \d{1,2}\. \d{4} \d{2}:\d{2}$/)).toBeTruthy();
  });

  it('výčep se po novém načtení obrazovky vrátí z databáze (nezmizí)', async () => {
    const prvni = render(<VycepyScreen />);
    await screen.findByText('Zatím nemáte přidané žádné výčepy.');
    fireEvent.click(screen.getByRole('button', { name: /Přidat výčepní zařízení/ }));
    fireEvent.change(screen.getByPlaceholderText(/Např\. Výčep #4/), { target: { value: 'Výčep Sklep' } });
    fireEvent.click(screen.getByRole('button', { name: 'Uložit výčep' }));
    await waitFor(() => expect(db.vycepy).toHaveLength(1));
    prvni.unmount();

    // Jiné zařízení / nové spuštění: žádná kopie v prohlížeči, jen databáze.
    localStorage.clear();
    vycistiMigraciProTesty();
    render(<VycepyScreen />);
    expect(await screen.findByText('Výčep Sklep')).toBeTruthy();
  });
});

describe('Výčepy — čištění', () => {
  it('Opláchnuto: výčep je čistý, čas oplachu se uloží, žádná chyba', async () => {
    db.vycepy = [radekVycepu(ID_A, 'Výčep A', { stav: 'dirty_beer' })];
    render(<VycepyScreen />);
    expect(await screen.findByText('V trubkách je pivo')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Opláchnuto/ }));
    await waitFor(() => expect(db.vycepy[0].stav).toBe('clean'));
    expect(toast.chyba).not.toHaveBeenCalled();
    expect(db.vycepy[0].posledni_oplach).toMatch(ISO_CAS);
    expect(db.vycepy[0].kohouty_rozebrane).toBe(true);
    expect(await screen.findByText(/Čisté & Opláchnuté/)).toBeTruthy();
  });

  it('Louh: čas louhování se uloží, oplach zůstane nedotčený', async () => {
    const oplach = '2026-11-01T08:00:00.000Z';
    db.vycepy = [radekVycepu(ID_A, 'Výčep A', { stav: 'needs_louh', posledni_oplach: oplach })];
    render(<VycepyScreen />);
    await screen.findByText('Nutný louh');

    fireEvent.click(screen.getByRole('button', { name: /Louh/ }));
    await waitFor(() => expect(db.vycepy[0].stav).toBe('clean'));
    expect(toast.chyba).not.toHaveBeenCalled();
    expect(db.vycepy[0].posledni_sanitace_louhem).toMatch(ISO_CAS);
    expect(new Date(db.vycepy[0].posledni_oplach).toISOString()).toBe(oplach);
  });

  it('čas z databáze se na kartě ukáže česky, ne jako „2026-11-05T10:06:00+00:00“', async () => {
    db.vycepy = [radekVycepu(ID_A, 'Výčep A', { posledni_oplach: '2026-11-05T10:06:00+00:00' })];
    render(<VycepyScreen />);
    await screen.findByText('Výčep A');
    expect(screen.queryByText(/2026-11-05T/)).toBeNull();
    expect(screen.getByText(/^5\. 11\. 2026 \d{2}:\d{2}$/)).toBeTruthy();
  });

  it('výčep bez oplachu ukáže „Zatím neproveden“', async () => {
    db.vycepy = [radekVycepu(ID_A, 'Výčep A')];
    render(<VycepyScreen />);
    expect(await screen.findByText('Zatím neproveden')).toBeTruthy();
    expect(screen.getByText('Zatím neprovedeno')).toBeTruthy();
  });
});

describe('Výčepy — rezervace', () => {
  async function otevriRezervaci() {
    render(<VycepyScreen />);
    await screen.findByText('Výčep A');
    fireEvent.click(screen.getByRole('button', { name: /Nová výpůjčka \/ rezervace/ }));
    await screen.findByText('Vytvořit výpůjčku výčepu');
  }

  it('nová výpůjčka se uloží do databáze i s telefonem a kaucí', async () => {
    db.vycepy = [radekVycepu(ID_A, 'Výčep A'), radekVycepu(ID_B, 'Výčep B', { typ: 'dvojkohout', poradi: 1 })];
    await otevriRezervaci();
    const [od, doDne] = datumy();
    fireEvent.change(od, { target: { value: '2026-11-12' } });
    fireEvent.change(doDne, { target: { value: '2026-11-14' } });
    fireEvent.change(screen.getByPlaceholderText(/Hospoda U Zajíce/), { target: { value: 'Zahrada U Lípy' } });
    fireEvent.change(screen.getByPlaceholderText('+420 777...'), { target: { value: '777 123 456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zarezervovat' }));

    await waitFor(() => expect(db.rezervace).toHaveLength(1));
    expect(toast.chyba).not.toHaveBeenCalled();
    expect(db.rezervace[0]).toMatchObject({
      vycep_id: ID_A, datum_od: '2026-11-12', datum_do: '2026-11-14',
      odberatel: 'Zahrada U Lípy', telefon: '777 123 456', kauce_czk: 2000, vraceno: false,
    });
  });

  it('překryv termínu stejného výčepu se nepřijme', async () => {
    db.vycepy = [radekVycepu(ID_A, 'Výčep A')];
    db.rezervace = [radekRezervace('r1aaaaaa-1111-4111-8111-111111111111', ID_A, '2026-11-05', '2026-11-06')];
    await otevriRezervaci();
    const [od, doDne] = datumy();
    fireEvent.change(od, { target: { value: '2026-11-04' } });
    fireEvent.change(doDne, { target: { value: '2026-11-07' } });
    fireEvent.change(screen.getByPlaceholderText(/Hospoda U Zajíce/), { target: { value: 'Zahrada U Lípy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zarezervovat' }));

    expect(toast.oznam).toHaveBeenCalledWith('Tento výčep je v tomto termínu již zarezervovaný!');
    expect(db.rezervace).toHaveLength(1);
  });

  it('den hned po skončení jiné rezervace je volný', async () => {
    db.vycepy = [radekVycepu(ID_A, 'Výčep A')];
    db.rezervace = [radekRezervace('r1aaaaaa-1111-4111-8111-111111111111', ID_A, '2026-11-05', '2026-11-06')];
    await otevriRezervaci();
    const [od, doDne] = datumy();
    fireEvent.change(od, { target: { value: '2026-11-07' } });
    fireEvent.change(doDne, { target: { value: '2026-11-07' } });
    fireEvent.change(screen.getByPlaceholderText(/Hospoda U Zajíce/), { target: { value: 'Zahrada U Lípy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zarezervovat' }));
    await waitFor(() => expect(db.rezervace).toHaveLength(2));
  });

  it('konec před začátkem a prázdný odběratel se nepřijmou', async () => {
    db.vycepy = [radekVycepu(ID_A, 'Výčep A')];
    await otevriRezervaci();
    const form = screen.getByPlaceholderText(/Hospoda U Zajíce/).closest('form')!;

    const [od, doDne] = datumy();
    fireEvent.change(od, { target: { value: '2026-11-12' } });
    fireEvent.change(doDne, { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByPlaceholderText(/Hospoda U Zajíce/), { target: { value: 'Zahrada U Lípy' } });
    fireEvent.submit(form);
    expect(toast.oznam).toHaveBeenLastCalledWith('Konec rezervace nesmí být před začátkem.');

    fireEvent.change(doDne, { target: { value: '2026-11-12' } });
    fireEvent.change(screen.getByPlaceholderText(/Hospoda U Zajíce/), { target: { value: '   ' } });
    fireEvent.submit(form);
    expect(toast.oznam).toHaveBeenLastCalledWith('Zadejte zákazníka / odběratele.');
    expect(db.rezervace).toHaveLength(0);
  });

  it('selhání zápisu do databáze se ohlásí (nezůstane jen v paměti obrazovky)', async () => {
    db.vycepy = [radekVycepu(ID_A, 'Výčep A')];
    await otevriRezervaci();
    db.chyba = 'permission denied for table vycepy_rezervace';
    const [od, doDne] = datumy();
    fireEvent.change(od, { target: { value: '2026-11-12' } });
    fireEvent.change(doDne, { target: { value: '2026-11-12' } });
    fireEvent.change(screen.getByPlaceholderText(/Hospoda U Zajíce/), { target: { value: 'Zahrada U Lípy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zarezervovat' }));
    await waitFor(() => expect(toast.chyba).toHaveBeenCalled());
    expect(String(toast.chyba.mock.calls[0][0])).toMatch(/permission denied/);
    expect(db.rezervace).toHaveLength(0);
  });
});

describe('Výčepy — vrácení a po termínu', () => {
  it('Vrátit: rezervace je vrácená a výčep je špinavý (v trubkách je pivo)', async () => {
    db.vycepy = [radekVycepu(ID_A, 'Výčep A', { stav: 'clean' })];
    db.rezervace = [radekRezervace('aaaaaaaa-1111-4111-8111-111111111111', ID_A, '2026-11-12', '2026-11-14')];
    render(<VycepyScreen />);
    await screen.findByText('Čisté & Opláchnuté');

    fireEvent.click(screen.getAllByRole('button', { name: /Vrátit/ })[0]);
    await waitFor(() => expect(db.rezervace[0].vraceno).toBe(true));
    expect(db.rezervace[0].vraceno_at).toMatch(ISO_CAS);
    await waitFor(() => expect(db.vycepy[0].stav).toBe('dirty_beer'));
    expect(toast.chyba).not.toHaveBeenCalled();
    expect(await screen.findByText('V trubkách je pivo')).toBeTruthy();
  });

  it('Zrušit vrácení: rezervace je zase půjčená', async () => {
    db.vycepy = [radekVycepu(ID_A, 'Výčep A', { stav: 'dirty_beer' })];
    db.rezervace = [radekRezervace('aaaaaaaa-1111-4111-8111-111111111111', ID_A, '2026-11-12', '2026-11-14', { vraceno: true, vraceno_at: '2026-11-14T10:00:00.000Z' })];
    render(<VycepyScreen />);
    await screen.findByText('V trubkách je pivo');
    fireEvent.click(screen.getAllByRole('button', { name: /Zrušit vrácení/ })[0]);
    await waitFor(() => expect(db.rezervace[0].vraceno).toBe(false));
    expect(db.rezervace[0].vraceno_at).toBeNull();
  });

  it('nevrácená rezervace po termínu je „Po termínu“, vrácená ne', async () => {
    db.vycepy = [radekVycepu(ID_A, 'Výčep A'), radekVycepu(ID_B, 'Výčep B', { poradi: 1 })];
    db.rezervace = [
      radekRezervace('aaaaaaaa-1111-4111-8111-111111111111', ID_A, '2026-01-10', '2026-01-12', { odberatel: 'Nevrátil' }),
      radekRezervace('bbbbbbbb-1111-4111-8111-111111111111', ID_B, '2026-01-10', '2026-01-12', { odberatel: 'Vrátil', vraceno: true }),
    ];
    render(<VycepyScreen />);
    await screen.findByText('Výčep A');
    const radekNevratil = radekTabulky('Nevrátil');
    const radekVratil = radekTabulky('Vrátil');
    expect(within(radekNevratil).getByText(/Po termínu/)).toBeTruthy();
    expect(within(radekVratil).queryByText(/Po termínu/)).toBeNull();
    expect(within(radekVratil).getByText(/Vráceno/)).toBeTruthy();
  });

  it('rezervace v budoucnu není po termínu, ale „Půjčeno“', async () => {
    db.vycepy = [radekVycepu(ID_A, 'Výčep A')];
    db.rezervace = [radekRezervace('aaaaaaaa-1111-4111-8111-111111111111', ID_A, '2099-01-10', '2099-01-12', { odberatel: 'Příští rok' })];
    render(<VycepyScreen />);
    await screen.findByText('Výčep A');
    const radek = radekTabulky('Příští rok');
    expect(within(radek).getByText('Půjčeno')).toBeTruthy();
    expect(within(radek).queryByText(/Po termínu/)).toBeNull();
  });
});

describe('Výčepy — mazání', () => {
  it('smazání rezervace ji odstraní z databáze', async () => {
    db.vycepy = [radekVycepu(ID_A, 'Výčep A')];
    db.rezervace = [radekRezervace('aaaaaaaa-1111-4111-8111-111111111111', ID_A, '2026-11-12', '2026-11-14')];
    render(<VycepyScreen />);
    await screen.findByText('Výčep A');
    fireEvent.click(screen.getAllByRole('button', { name: 'Smazat rezervaci' })[0]);
    await waitFor(() => expect(db.rezervace).toHaveLength(0));
  });

  it('smazání výčepu ho odstraní z databáze', async () => {
    db.vycepy = [radekVycepu(ID_A, 'Výčep A')];
    render(<VycepyScreen />);
    await screen.findByText('Výčep A');
    fireEvent.click(screen.getByRole('button', { name: 'Smazat výčep' }));
    await waitFor(() => expect(db.vycepy).toHaveLength(0));
  });
});
