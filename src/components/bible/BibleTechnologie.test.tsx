import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Technologie } from '../../lib/bibleTechnologieApi';

// Vymyšlený pivovar — žádná skutečná data.
const PIV = 'aaaaaaaa-1111-2222-3333-444444444444';
const PIV2 = 'cccccccc-1111-2222-3333-444444444444';
const nactiTechnologii = vi.fn();
const ulozPivovar = vi.fn();
const smazPivovar = vi.fn();
const ulozZarizeni = vi.fn();
const smazZarizeni = vi.fn();
const ulozPostup = vi.fn();
const prevezmiZarizeni = vi.fn();
vi.mock('../../lib/bibleTechnologieApi', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/bibleTechnologieApi')>()),
  nactiTechnologii: (id: unknown) => nactiTechnologii(id),
  ulozPivovar: (...a: unknown[]) => ulozPivovar(...a),
  smazPivovar: (...a: unknown[]) => smazPivovar(...a),
  ulozZarizeni: (...a: unknown[]) => ulozZarizeni(...a),
  smazZarizeni: (...a: unknown[]) => smazZarizeni(...a),
  ulozPostup: (...a: unknown[]) => ulozPostup(...a),
  prevezmiZarizeni: (...a: unknown[]) => prevezmiZarizeni(...a),
}));
const tanky = vi.fn();
vi.mock('../../lib/supabase', () => ({
  supabase: { from: (t: string) => ({ select: () => ({ order: () => tanky(t) }) }) },
}));
const oznam = vi.fn();
const potvrd = vi.fn(async (..._a: unknown[]) => true);
vi.mock('../../lib/toast', () => ({ oznam: (t: string) => oznam(t), potvrd: (...a: unknown[]) => potvrd(...a) }));

import { BibleTechnologie, chybaZarizeni } from './BibleTechnologie';

const profil = (navic: Partial<Technologie> = {}): Technologie => ({
  pivovary: [
    { id: PIV, nazev: 'Pivovar Zkušební', popis: 'Dvounádobová varna', hlavni: true, zalozilJmeno: null, upraveno: null },
    { id: PIV2, nazev: 'Pobočka', popis: null, hlavni: false, zalozilJmeno: null, upraveno: null },
  ],
  pivovarId: PIV,
  zarizeni: [
    { id: 'z2', druh: 'tank_lezacky', nazev: 'Tank 10', pocet: 1, parametry: [], poznamka: null, zapsalJmeno: null, upraveno: null },
    { id: 'z1', druh: 'tank_lezacky', nazev: 'Tank 2', pocet: 1, parametry: [{ nazev: 'Objem užitný', hodnota: 75, jednotka: 'hl', zdroj: 'sklep' }], poznamka: null, zapsalJmeno: null, upraveno: null },
    { id: 'z3', druh: 'cerpadlo', nazev: 'Čerpadlo mladiny', pocet: 2, parametry: [{ nazev: 'Průtok', hodnota: 5.5, jednotka: 'm³/h', zdroj: 'odhad' }], poznamka: null, zapsalJmeno: null, upraveno: null },
  ],
  postupy: [{ id: 'p1', nazev: 'CIP spilky', oblast: 'L', kroky: '1. Předplach', zdroj: 'vlastní praxe', zapsalJmeno: null, upraveno: null }],
  migrace: true,
  ...navic,
});

beforeEach(() => {
  for (const f of [nactiTechnologii, ulozPivovar, smazPivovar, ulozZarizeni, smazZarizeni, ulozPostup, prevezmiZarizeni, tanky, oznam]) f.mockReset();
  potvrd.mockReset().mockResolvedValue(true);
  nactiTechnologii.mockResolvedValue({ stav: 'ok', technologie: profil() });
  ulozZarizeni.mockResolvedValue({ stav: 'ok', data: 'nove' });
  ulozPivovar.mockResolvedValue({ stav: 'ok', data: PIV2 });
});

describe('technologie pivovaru', () => {
  it('ukáže profil: zařízení podle druhu (Tank 2 před Tank 10), parametr se zdrojem, postupy', async () => {
    render(<BibleTechnologie role="cte" />);
    expect(await screen.findByRole('heading', { name: 'Pivovar Zkušební' })).toBeTruthy();
    expect(screen.getByText('Dvounádobová varna')).toBeTruthy();
    const lezacke = screen.getByRole('list', { name: 'Ležácké tanky' });
    expect(within(lezacke).getAllByRole('heading').map((h) => h.textContent)).toEqual(['Tank 2', 'Tank 10']);
    expect(within(lezacke).getByText('75 hl')).toBeTruthy();
    expect(within(lezacke).getByText('ze Sklepa v appce')).toBeTruthy();
    expect(screen.getByText('5,5 m³/h')).toBeTruthy();
    expect(screen.getByText('CIP spilky')).toBeTruthy();
    // Čtenář nic neupravuje.
    expect(screen.queryByRole('button', { name: /Upravit/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Převzít tanky ze Sklepa/ })).toBeNull();
  });

  it('bez migrace řekne, kterou migraci pustit', async () => {
    nactiTechnologii.mockResolvedValue({ stav: 'ok', technologie: profil({ pivovary: [], pivovarId: null, zarizeni: [], postupy: [], migrace: false }) });
    render(<BibleTechnologie role="spravuje" />);
    expect(await screen.findByText(/20261111000000_bible_technologie/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Založit pivovar/ })).toBeNull();
  });

  it('přispěvatel založí první pivovar', async () => {
    nactiTechnologii.mockResolvedValue({ stav: 'ok', technologie: profil({ pivovary: [], pivovarId: null, zarizeni: [], postupy: [] }) });
    render(<BibleTechnologie role="prispiva" />);
    fireEvent.click(await screen.findByRole('button', { name: /Založit pivovar/ }));
    fireEvent.change(screen.getByLabelText('Název pivovaru'), { target: { value: ' Pivovar Zkušební ' } });
    // První pivovar je hlavní napevno (SQL to stejně zařídí) — formulář to řekne.
    expect(screen.getByText('První pivovar je hlavní sám od sebe.')).toBeTruthy();
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Uložit pivovar' })); });
    expect(ulozPivovar).toHaveBeenCalledWith(null, { nazev: ' Pivovar Zkušební ', popis: '', hlavni: true });
    expect(oznam).toHaveBeenCalledWith('Pivovar založen.');
    expect(nactiTechnologii).toHaveBeenLastCalledWith(PIV2);
  });

  it('přispěvatel nesmaže celý pivovar, správce ano (po potvrzení načte hlavní)', async () => {
    const { unmount } = render(<BibleTechnologie role="prispiva" />);
    await screen.findByRole('heading', { name: 'Pivovar Zkušební' });
    expect(screen.queryByRole('button', { name: /Smazat pivovar/ })).toBeNull();
    unmount();
    smazPivovar.mockResolvedValue({ stav: 'ok', data: undefined });
    render(<BibleTechnologie role="spravuje" />);
    await screen.findByRole('heading', { name: 'Pivovar Zkušební' });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Smazat pivovar/ })); });
    expect(potvrd).toHaveBeenCalledWith(expect.stringMatching(/Smazat celý profil „Pivovar Zkušební“/), expect.objectContaining({ nebezpecne: true }));
    expect(smazPivovar).toHaveBeenCalledWith(PIV);
    expect(nactiTechnologii).toHaveBeenLastCalledWith(null);
  });

  it('nové zařízení: šablona podle druhu, číslo s čárkou, prázdné řádky se neuloží', async () => {
    render(<BibleTechnologie role="prispiva" />);
    fireEvent.click(await screen.findByRole('button', { name: /Přidat zařízení/ }));
    const form = screen.getByRole('form', { name: 'Zařízení' });
    fireEvent.change(within(form).getByLabelText('Druh'), { target: { value: 'cerpadlo' } });
    expect((within(form).getByLabelText('Název parametru 1') as HTMLInputElement).value).toBe('Průtok');
    fireEvent.change(within(form).getByLabelText('Název'), { target: { value: 'Čerpadlo sladiny' } });
    fireEvent.change(within(form).getByLabelText('Hodnota parametru 1'), { target: { value: '4,5' } });
    fireEvent.change(within(form).getByLabelText('Zdroj parametru 1'), { target: { value: 'stitek' } });
    await act(async () => { fireEvent.click(within(form).getByRole('button', { name: 'Uložit zařízení' })); });
    expect(ulozZarizeni).toHaveBeenCalledTimes(1);
    const [id, pivovar, z] = ulozZarizeni.mock.calls[0];
    expect([id, pivovar]).toEqual([null, PIV]);
    expect(z).toMatchObject({ druh: 'cerpadlo', nazev: 'Čerpadlo sladiny', pocet: 1 });
    expect(z.parametry[0]).toEqual({ nazev: 'Průtok', hodnota: '4,5', jednotka: 'm³/h', zdroj: 'stitek' });
    expect(oznam).toHaveBeenCalledWith('Zařízení zapsáno.');
  });

  it('úprava zařízení předvyplní parametry; špatný počet kusů nepustí', async () => {
    render(<BibleTechnologie role="prispiva" />);
    await screen.findByRole('heading', { name: 'Pivovar Zkušební' });
    const lezacke = screen.getByRole('list', { name: 'Ležácké tanky' });
    fireEvent.click(within(lezacke).getAllByRole('button', { name: /Upravit/ })[0]);
    const form = screen.getByRole('form', { name: 'Zařízení' });
    expect((within(form).getByLabelText('Hodnota parametru 1') as HTMLInputElement).value).toBe('75');
    fireEvent.change(within(form).getByLabelText('Kusů'), { target: { value: '0' } });
    expect(screen.getByRole('alert').textContent).toMatch(/Počet kusů je celé číslo 1 až 999/);
    expect((within(form).getByRole('button', { name: 'Uložit zařízení' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('převzetí tanků ze Sklepa: potvrzení s názvy, zápis a hláška s počtem', async () => {
    tanky.mockResolvedValue({ data: [{ label: 'Tank 10', capacity_l: 7500 }, { label: 'Spilka 1', capacity_l: 8000 }, { label: 'Tank 2', capacity_l: 7500 }], error: null });
    prevezmiZarizeni.mockResolvedValue({ stav: 'ok', data: 1 });
    render(<BibleTechnologie role="prispiva" />);
    await screen.findByRole('heading', { name: 'Pivovar Zkušební' });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Převzít tanky ze Sklepa/ })); });
    expect(tanky).toHaveBeenCalledWith('cellar_tanks');
    expect(potvrd.mock.calls[0][0]).toMatch(/Převzít ze Sklepa 3 nádob \(Spilka 1, Tank 2, Tank 10\)/);
    await waitFor(() => expect(prevezmiZarizeni).toHaveBeenCalledTimes(1));
    const [pivovar, seznam] = prevezmiZarizeni.mock.calls[0];
    expect(pivovar).toBe(PIV);
    expect(seznam.map((t: { druh: string; nazev: string }) => `${t.druh}:${t.nazev}`)).toEqual(['tank_lezacky:Tank 10', 'tank_kvasny:Spilka 1', 'tank_lezacky:Tank 2']);
    await waitFor(() => expect(oznam).toHaveBeenCalledWith('Převzato ze Sklepa: 1 nádoba.'));
  });

  it('výběr jiného pivovaru načte jeho profil', async () => {
    render(<BibleTechnologie role="cte" />);
    await screen.findByRole('heading', { name: 'Pivovar Zkušební' });
    nactiTechnologii.mockResolvedValue({ stav: 'ok', technologie: profil({ pivovarId: PIV2, zarizeni: [], postupy: [] }) });
    await act(async () => { fireEvent.change(screen.getByLabelText('Pivovar'), { target: { value: PIV2 } }); });
    expect(nactiTechnologii).toHaveBeenLastCalledWith(PIV2);
    expect(await screen.findByRole('heading', { name: 'Pobočka' })).toBeTruthy();
  });
});

describe('kontrola formuláře zařízení', () => {
  const z = { druh: 'varna' as const, nazev: 'Varna', pocet: '1', parametry: [], poznamka: '' };
  it('název, počet 1–999 a parametr s hodnotou musí mít název', () => {
    expect(chybaZarizeni(z)).toBeNull();
    expect(chybaZarizeni({ ...z, nazev: ' ' })).toBe('Doplň název zařízení.');
    expect(chybaZarizeni({ ...z, pocet: '1,5' })).toMatch(/celé číslo/);
    expect(chybaZarizeni({ ...z, pocet: 'dva' })).toMatch(/celé číslo/);
    expect(chybaZarizeni({ ...z, parametry: [{ nazev: '', hodnota: '5', jednotka: '', zdroj: 'odhad' }] })).toBe('Parametr 1 má hodnotu, ale nemá název.');
    expect(chybaZarizeni({ ...z, parametry: [{ nazev: '', hodnota: '', jednotka: '', zdroj: 'odhad' }] })).toBeNull();
  });
});
