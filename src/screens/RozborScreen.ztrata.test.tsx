// Rozbor: neuložené počty týdenní inventury a rozdíl oproti inventuře bokem (majitel 26. 11. 2026):
// „Každý týden když dám reálný stav skladu, tak ti musí počítat s tím … Jen pak napsat bokem na konci měsíce
// rozdíl oproti inventuře, ať je vidět ztráta, ale nepočítat je, počítá se jen co je reálně na skladě."
// Data i jména jsou vymyšlená (repozitář je veřejný). Dnes je v testu čtvrtek 15. 10. 2026 (týden od 12. 10.).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const h = vi.hoisted(() => ({
  plan: {} as any,
  /** Uložené počty Úpravy skladu (dotaz přes .in) — jen pro řádek „inv." a pruh s rozepsanými počty. */
  ulozene: [] as any[],
  objednavky: { data: { objednavky: [] as any[], polozky: [] as any[] }, chyba: false },
  setPage: vi.fn(),
}));

vi.mock('../lib/usePlanStaceni', () => ({ usePlanStaceni: () => h.plan }));
vi.mock('../lib/useObjednavkyRozboru', () => ({ useObjednavkyRozboru: () => h.objednavky }));
vi.mock('../lib/pohybyPredvyber', () => ({ predvyberPohyby: vi.fn() }));
vi.mock('../lib/supabase', async (puvodni) => {
  const skutecny = await puvodni<typeof import('../lib/supabase')>();
  const from = () => {
    const q: any = {
      select: () => q,
      in: () => q,
      then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: h.ulozene, error: null }).then(ok),
    };
    return q;
  };
  return { ...skutecny, supabase: { from }, useRealtime: vi.fn() };
});
vi.mock('../lib/businessDate', async (puvodni) => {
  const skutecny = await puvodni<typeof import('../lib/businessDate')>();
  return { ...skutecny, businessDateISO: (d?: Date) => (d ? skutecny.businessDateISO(d) : '2026-10-15') };
});

import { buildMovements } from '../lib/stockLedger';
import RozborScreen from './RozborScreen';
import { klicOdberatele } from '../lib/rozborObdobi';

const PIVA = [{ id: 'sv', name: '12° Světlá', beer_color: '#f5c542' }, { id: 'os', name: 'Osma', beer_color: '#b45309' }];
const OBALY = [{ id: 'k50', label: 'KEG 50l', kind: 'keg', volume_l: 50 }, { id: 'l1', label: '1l', kind: 'bottle', volume_l: 1 }];

beforeEach(() => {
  localStorage.clear();
  h.setPage.mockReset();
  h.ulozene = [];
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

describe('Rozbor — neuložené počty Úpravy skladu', () => {
  it('rozepsaná nula za TENTO týden: řádek „inv. 0 (rozepsáno)" a pruh s tlačítkem do Úpravy skladu', async () => {
    koncept('2026-10-12', { os__l1: '0' });
    await otevri();
    expect(radky().join(' | ')).toMatch(/Osma 1l.*inv\. 0 \(rozepsáno\)/);
    const pruh = screen.getByTestId('rozbor-rozepsano');
    expect(pruh.textContent).toMatch(/1 počet z Úpravy skladu je jen rozepsané/);
    expect(pruh.textContent).toMatch(/neuložené/);
    fireEvent.click(within(pruh).getByRole('button', { name: /Otevřít Úpravu skladu/ }));
    expect(h.setPage).toHaveBeenCalledWith('inventory', undefined, 'tydenni');
  });

  it('rozepsané počty MINULÉHO týdne (počítá se v pondělí a v úterý) se taky ukážou a započítají do pruhu', async () => {
    koncept('2026-10-05', { os__l1: '0', sv__k50: '3' });
    koncept('2026-10-12', { sv__l1: '12' });
    await otevri();
    expect(screen.getByTestId('rozbor-rozepsano').textContent).toMatch(/3 počty z Úpravy skladu jsou jen rozepsané/);
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

describe('Rozbor — rozdíl oproti inventuře bokem (měsíc), živě z knihy', () => {
  const rad = (entry_date: string, beer_id: string, package_id: string, quantity: number, extra: Record<string, unknown> = {}) =>
    ({ entry_date, beer_id, package_id, quantity, ...extra });
  const zaklad = (den: string, beer_id: string, package_id: string, quantity: number) => rad(den, beer_id, package_id, quantity, { note: 'Počáteční stav' });
  const uprava = (den: string, beer_id: string, package_id: string, quantity: number) =>
    rad(den, beer_id, package_id, quantity, { note: `Týdenní inventura týdne ${den} (konec dne)`, created_at: `${den}T08:00:00Z` });
  const pohyby = (zdroje: Parameters<typeof buildMovements>[0]) => { h.plan.pohyby = buildMovements(zdroje); };

  it('v měsíčním rozboru je blok se součtem ztrát po položkách a upozorněním, že se nepočítá', async () => {
    pohyby({
      inventoryRows: [
        zaklad('2026-10-01', 'os', 'l1', 80), zaklad('2026-10-01', 'sv', 'k50', 10),
        uprava('2026-10-04', 'os', 'l1', 57),   // evidence 80 → −23
        uprava('2026-10-11', 'os', 'l1', 44),   // evidence 57 → −13
        uprava('2026-10-11', 'sv', 'k50', 12),  // evidence 10 → +2
      ],
    });
    await otevri();
    expect(screen.queryByTestId('rozbor-ztrata-bokem')).toBeNull(); // v týdnu ho není
    mesic();
    const blok = await screen.findByTestId('rozbor-ztrata-bokem');
    expect(blok.textContent).toMatch(/Rozdíl oproti inventuře — říjen 2026/);
    expect(blok.textContent).toMatch(/Jen bokem: do stavu skladu ani do čísel nahoře se nepočítá/);
    expect(screen.getByTestId('rozbor-ztrata-soucet').textContent).toBe('ztráta −36 ks');
    expect(blok.textContent).toMatch(/přebytek \+2 ks/);
    // Název a číslo jsou dva sloupce řádku — mezi nimi v textu DOM mezera není.
    const polozky = within(blok).getAllByRole('listitem').map((li) => [...li.children].map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim()).join(' | '));
    expect(polozky).toEqual(['Osma 1l | −36 ks · 2× počítáno', '12° Světlá KEG 50l | +2 ks · 1× počítáno']);
    // Po návratu na týden blok zmizí.
    fireEvent.click(screen.getByRole('button', { name: 'Týden' }));
    expect(screen.queryByTestId('rozbor-ztrata-bokem')).toBeNull();
  });

  it('zpětně dopsané fasování za dny před počítáním ztrátu zmenší (číslo se mění, stav po počítání ne)', async () => {
    const zdroje = {
      inventoryRows: [zaklad('2026-10-01', 'os', 'l1', 80), uprava('2026-10-08', 'os', 'l1', 57)],
    };
    pohyby(zdroje);
    await otevri();
    mesic();
    expect((await screen.findByTestId('rozbor-ztrata-soucet')).textContent).toBe('ztráta −23 ks');
    // Stejná obrazovka znovu, jen s dopsaným fasováním za 5. 10. (zapsaným až po počítání).
    cleanup();
    pohyby({ ...zdroje, fasovaniRows: [rad('2026-10-05', 'os', 'l1', 10, { created_at: '2026-10-09T10:00:00Z' })] });
    await otevri();
    mesic();
    expect((await screen.findByTestId('rozbor-ztrata-soucet')).textContent).toBe('ztráta −13 ks');
  });

  it('měsíc bez počítání to řekne; měsíc, kde všechno sedělo, taky', async () => {
    await otevri();
    mesic();
    expect((await screen.findByTestId('rozbor-ztrata-bokem')).textContent).toMatch(/nebyla žádná Úprava skladu ani inventura/);
    cleanup();
    pohyby({ inventoryRows: [zaklad('2026-10-01', 'os', 'l1', 80), uprava('2026-10-11', 'os', 'l1', 80)] });
    await otevri();
    mesic();
    expect((await screen.findByTestId('rozbor-ztrata-bokem')).textContent).toMatch(/Za 1 počítání všechno sedělo/);
  });

  it('blok se neukáže, když je vybraný jeden odběratel (rozdíl oproti inventuře patří celému skladu)', async () => {
    pohyby({ inventoryRows: [zaklad('2026-10-01', 'os', 'l1', 80), uprava('2026-10-11', 'os', 'l1', 76)] });
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
