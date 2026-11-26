// Rozbor: neuložené počty týdenní inventury a rozdíl oproti inventuře bokem (majitel 26. 11. 2026):
// „Každý týden když dám reálný stav skladu, tak ti musí počítat s tím … Jen pak napsat bokem na konci měsíce
// rozdíl oproti inventuře, ať je vidět ztráta, ale nepočítat je, počítá se jen co je reálně na skladě."
// Data i jména jsou vymyšlená (repozitář je veřejný). Dnes je v testu čtvrtek 15. 10. 2026 (týden od 12. 10.).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

const h = vi.hoisted(() => ({
  plan: {} as any,
  /** Uložené počty týdenní inventury (dotaz přes .in) a týdenní kontroly měsíce (dotaz přes .gte/.lte). */
  ulozene: [] as any[],
  kontroly: [] as any[],
  /** Odpověď na dotaz kontrol podle prvního dne měsíce; `pockej` ji zdrží, dokud ji test nepustí. */
  kontrolyPodleMesice: {} as Record<string, { data: any[]; pockej?: Promise<void> }>,
  objednavky: { data: { objednavky: [] as any[], polozky: [] as any[] }, chyba: false },
  setPage: vi.fn(),
}));

vi.mock('../lib/usePlanStaceni', () => ({ usePlanStaceni: () => h.plan }));
vi.mock('../lib/useObjednavkyRozboru', () => ({ useObjednavkyRozboru: () => h.objednavky }));
vi.mock('../lib/pohybyPredvyber', () => ({ predvyberPohyby: vi.fn() }));
vi.mock('../lib/supabase', async (puvodni) => {
  const skutecny = await puvodni<typeof import('../lib/supabase')>();
  const from = () => {
    let rezim: 'in' | 'mesic' = 'in';
    let od = '';
    const q: any = {
      select: () => q,
      in: () => { rezim = 'in'; return q; },
      gte: (_sloupec: string, hodnota: string) => { rezim = 'mesic'; od = hodnota; return q; },
      lte: () => q,
      then: (ok: (r: unknown) => unknown) => {
        if (rezim === 'in') return Promise.resolve({ data: h.ulozene, error: null }).then(ok);
        const zvlast = h.kontrolyPodleMesice[od];
        const odpoved = { data: zvlast ? zvlast.data : h.kontroly, error: null };
        return (zvlast?.pockej ?? Promise.resolve()).then(() => odpoved).then(ok);
      },
    };
    return q;
  };
  return { ...skutecny, supabase: { from }, useRealtime: vi.fn() };
});
vi.mock('../lib/businessDate', async (puvodni) => {
  const skutecny = await puvodni<typeof import('../lib/businessDate')>();
  return { ...skutecny, businessDateISO: (d?: Date) => (d ? skutecny.businessDateISO(d) : '2026-10-15') };
});

import RozborScreen from './RozborScreen';
import { klicOdberatele } from '../lib/rozborObdobi';

const PIVA = [{ id: 'sv', name: '12° Světlá', beer_color: '#f5c542' }, { id: 'os', name: 'Osma', beer_color: '#b45309' }];
const OBALY = [{ id: 'k50', label: 'KEG 50l', kind: 'keg', volume_l: 50 }, { id: 'l1', label: '1l', kind: 'bottle', volume_l: 1 }];

beforeEach(() => {
  localStorage.clear();
  h.setPage.mockReset();
  h.ulozene = [];
  h.kontroly = [];
  h.kontrolyPodleMesice = {};
  h.objednavky = { data: { objednavky: [], polozky: [] }, chyba: false };
  h.plan = {
    data: { beers: PIVA, packages: OBALY, kegging: [], bottling: [], fasovani: [], prodejna: [] },
    chyba: false, planySudy: [], planyLahve: [], zasoba: new Map<string, number>(), pohyby: [],
  };
});

const otevri = async () => { await act(async () => { render(<RozborScreen setPage={h.setPage} />); }); };
const radky = () => screen.queryAllByTestId('radek-rozboru').map((r) => (r.textContent ?? '').replace(/\s+/g, ' ').trim());
const mesic = () => fireEvent.click(screen.getByRole('button', { name: 'Měsíc' }));
const koncept = (pondeli: string, mapa: Record<string, string>) => localStorage.setItem(`tydenni_napocitano_${pondeli}`, JSON.stringify(mapa));

describe('Rozbor — neuložené počty týdenní inventury', () => {
  it('rozepsaná nula za TENTO týden: řádek „inv. 0 (rozepsáno)" a pruh s tlačítkem do týdenní inventury', async () => {
    koncept('2026-10-12', { os__l1: '0' });
    await otevri();
    expect(radky().join(' | ')).toMatch(/Osma 1l.*inv\. 0 \(rozepsáno\)/);
    const pruh = screen.getByTestId('rozbor-rozepsano');
    expect(pruh.textContent).toMatch(/1 počet z týdenní inventury je jen rozepsané/);
    expect(pruh.textContent).toMatch(/neuložené/);
    fireEvent.click(within(pruh).getByRole('button', { name: /Otevřít týdenní inventuru/ }));
    expect(h.setPage).toHaveBeenCalledWith('inventory', undefined, 'tydenni');
  });

  it('rozepsané počty MINULÉHO týdne (počítá se v pondělí a v úterý) se taky ukážou a započítají do pruhu', async () => {
    koncept('2026-10-05', { os__l1: '0', sv__k50: '3' });
    koncept('2026-10-12', { sv__l1: '12' });
    await otevri();
    expect(screen.getByTestId('rozbor-rozepsano').textContent).toMatch(/3 počty z týdenní inventury jsou jen rozepsané/);
    expect(radky().join(' | ')).toMatch(/Osma 1l.*inv\. 0 \(rozepsáno\)/);
    expect(radky().join(' | ')).toMatch(/Světlá 50l.*inv\. 3 \(rozepsáno\)/);
  });

  it('uložený počet má přednost před rozepsaným a pruh nevyvolá', async () => {
    h.ulozene = [{ beer_id: 'os', package_id: 'l1', napocitano: 0, updated_at: '2026-10-13T08:00:00Z', tyden_od: '2026-10-12' }];
    koncept('2026-10-12', { os__l1: '5' });
    await otevri();
    expect(screen.queryByTestId('rozbor-rozepsano')).toBeNull();
    expect(radky().join(' | ')).toMatch(/Osma 1l.*inv\. 0 \(13\. 10\.\)/);
  });

  it('bez rozepsaných počtů žádný pruh', async () => {
    await otevri();
    expect(screen.queryByTestId('rozbor-rozepsano')).toBeNull();
  });
});

describe('Rozbor — rozdíl oproti inventuře bokem (měsíc)', () => {
  const kontrola = (tyden_do: string, beer_id: string, package_id: string, rozdil: number, vyreseno: string | null = 'ponechano') =>
    ({ tyden_od: tyden_do, tyden_do, beer_id, package_id, rozdil, vyreseno });

  it('v měsíčním rozboru je blok se součtem ztrát po položkách a upozorněním, že se nepočítá', async () => {
    h.kontroly = [
      kontrola('2026-10-04', 'os', 'l1', -23), kontrola('2026-10-11', 'os', 'l1', -4),
      kontrola('2026-10-11', 'sv', 'k50', 2), kontrola('2026-10-11', 'sv', 'l1', -1, 'staceni'),
    ];
    await otevri();
    expect(screen.queryByTestId('rozbor-ztrata-bokem')).toBeNull(); // v týdnu ho není
    mesic();
    const blok = await screen.findByTestId('rozbor-ztrata-bokem');
    expect(blok.textContent).toMatch(/Rozdíl oproti inventuře — říjen 2026/);
    expect(blok.textContent).toMatch(/Jen bokem: do stavu skladu ani do čísel nahoře se nepočítá/);
    expect(screen.getByTestId('rozbor-ztrata-soucet').textContent).toBe('ztráta −27 ks');
    expect(blok.textContent).toMatch(/přebytek \+2 ks/);
    // Název a číslo jsou dva sloupce řádku — mezi nimi v textu DOM mezera není.
    const polozky = within(blok).getAllByRole('listitem').map((li) => [...li.children].map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim()).join(' | '));
    expect(polozky).toEqual(['Osma 1l | −27 ks · 2 týdny', '12° Světlá KEG 50l | +2 ks · 1 týden']);
    // Po návratu na týden blok zmizí, i když jsou kontroly měsíce už načtené.
    fireEvent.click(screen.getByRole('button', { name: 'Týden' }));
    expect(screen.queryByTestId('rozbor-ztrata-bokem')).toBeNull();
  });

  it('měsíc bez uložené kontroly to řekne; měsíc, kde všechno sedělo, taky', async () => {
    await otevri();
    mesic();
    expect((await screen.findByTestId('rozbor-ztrata-bokem')).textContent).toMatch(/není uložená žádná týdenní inventura/);
    h.kontroly = [kontrola('2026-10-11', 'os', 'l1', 0, null)];
    fireEvent.click(screen.getByRole('button', { name: 'Týden' }));
    mesic();
    expect((await screen.findByTestId('rozbor-ztrata-bokem')).textContent).toMatch(/Za 1 uložených kontrol všechno sedělo/);
  });

  it('pomalá odpověď pro měsíc, který už není vidět, nepřepíše řádky toho správného', async () => {
    let pust!: () => void;
    const zdrzena = new Promise<void>((ok) => { pust = ok; });
    // Dnes je 15. 10. 2026: říjen se načte zdrženě, září hned.
    h.kontrolyPodleMesice = {
      '2026-10-01': { data: [kontrola('2026-10-11', 'sv', 'k50', 2)], pockej: zdrzena },
      '2026-09-01': { data: [kontrola('2026-09-13', 'os', 'l1', -6)] },
    };
    await otevri();
    mesic(); // říjen: dotaz čeká
    fireEvent.click(screen.getByRole('button', { name: 'Předchozí měsíc' })); // září: odpoví hned
    const blok = await screen.findByTestId('rozbor-ztrata-bokem');
    expect(blok.textContent).toMatch(/září 2026/);
    expect(screen.getByTestId('rozbor-ztrata-soucet').textContent).toBe('ztráta −6 ks');
    await act(async () => { pust(); }); // teď dorazí zdržená odpověď pro říjen
    expect(screen.getByTestId('rozbor-ztrata-bokem').textContent).toMatch(/září 2026/);
    expect(screen.getByTestId('rozbor-ztrata-soucet').textContent).toBe('ztráta −6 ks');
  });

  it('blok se neukáže, když je vybraný jeden odběratel (rozdíl oproti inventuře patří celému skladu)', async () => {
    h.kontroly = [kontrola('2026-10-11', 'os', 'l1', -4)];
    h.objednavky = {
      data: {
        objednavky: [{ id: 'o1', place_name: 'Hospoda U Lípy', delivery_date: '2026-10-14', order_date: '2026-10-14', status: 'nova' }],
        polozky: [{ order_id: 'o1', beer_id: 'sv', package_id: 'k50', quantity: 2 }],
      },
      chyba: false,
    };
    await otevri();
    mesic();
    await screen.findByTestId('rozbor-ztrata-bokem');
    fireEvent.change(screen.getByLabelText('Odběratel'), { target: { value: klicOdberatele('Hospoda U Lípy') } });
    expect(screen.queryByTestId('rozbor-ztrata-bokem')).toBeNull();
    fireEvent.change(screen.getByLabelText('Odběratel'), { target: { value: '' } });
    expect(await screen.findByTestId('rozbor-ztrata-bokem')).toBeTruthy();
  });
});
