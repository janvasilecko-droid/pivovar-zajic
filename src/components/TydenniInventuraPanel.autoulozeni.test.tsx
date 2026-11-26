// Úprava skladu se ukládá sama (majitel 26. 11. 2026: „…úprava skladu, z toho se to musí ukládat a počítat“).
// Pojistky: nula se uloží, dokud se píše tak ne, staré číslo z paměti telefonu ne, při nejistých číslech ne,
// po selhání se nezkouší dokola a rozepsané číslo se neztratí odchodem z obrazovky.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { buildMovements } from '../lib/stockLedger';

const h = vi.hoisted(() => ({
  ulozeno: [] as Record<string, unknown>[],
  /** Kolikrát se zkusilo zapsat (i neúspěšně). */
  pokusu: 0,
  /** Pauza před samočinným uložením (ms) — v testech krátká, ať se nečeká. */
  pauza: 40,
  zPameti: false,
  zapisSelze: false,
}));

vi.mock('../lib/autoulozeniUpravySkladu', async (puvodni) => {
  const skutecny = await puvodni<typeof import('../lib/autoulozeniUpravySkladu')>();
  return { ...skutecny, get AUTOUKLADANI_MS() { return h.pauza; } };
});
vi.mock('../lib/businessDate', () => ({ businessDateISO: () => '2026-10-15', posunMesic: (m: string) => m }));
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (tabulka: string) => {
      let akce: 'select' | 'zapis' = 'select';
      let chyba: { message: string } | null = null;
      const q: any = {
        select: () => q, eq: () => q, order: () => q, limit: () => q,
        insert: () => { akce = 'zapis'; return q; },
        upsert: (radky: Record<string, unknown> | Record<string, unknown>[]) => {
          akce = 'zapis';
          if (tabulka === 'tydenni_inventura') {
            h.pokusu += 1;
            if (h.zapisSelze) chyba = { message: 'síť spadla' };
            else h.ulozeno.push(...(Array.isArray(radky) ? radky : [radky]));
          }
          return q;
        },
        then: (ok: (r: any) => any, ko?: (e: any) => any) =>
          Promise.resolve({
            data: akce === 'select' && tabulka === 'tydenni_inventura' ? h.ulozeno : akce === 'select' ? [] : null,
            error: chyba,
          }).then(ok, ko),
      };
      return q;
    },
  },
  fetchAllRows: () => Promise.resolve({ data: [], error: null }),
  formatPackageLabel: (l: string) => l,
  beerBg: () => '#ffffff',
  beerText: () => '',
  useRealtime: () => {},
}));
vi.mock('../lib/sdilenaData', () => ({ nactiSdilenouTabulku: () => Promise.resolve({ data: [], error: null }) }));
vi.mock('../lib/skladovaKnihaData', () => ({
  nactiSkladovouKnihu: () => Promise.resolve({
    piva: [{ id: 'b50', name: 'Jantar', is_active: true }],
    obaly: [{ id: 'k50', label: 'KEG 50l', kind: 'keg', volume_l: 50 }],
    pohyby: buildMovements({ inventoryRows: [{ entry_date: '2026-10-01', beer_id: 'b50', package_id: 'k50', quantity: 2, note: 'Počáteční stav' }] }),
    kegging: [], bottling: [], inventura: [], fasovani: [], odpisy: [], zavozy: [],
    zPameti: h.zPameti,
  }),
}));
vi.mock('./QuickCountModal', () => ({ QuickCountModal: () => null }));

import TydenniInventuraPanel from './TydenniInventuraPanel';

async function otevri() {
  const r = render(<TydenniInventuraPanel />);
  await waitFor(() => expect(screen.getByText('Jantar')).toBeTruthy());
  return r;
}
const pole = () => screen.getByPlaceholderText('—') as HTMLInputElement;
const pockej = (ms: number) => act(async () => { await new Promise((ok) => setTimeout(ok, ms)); });

beforeEach(() => {
  localStorage.clear();
  h.ulozeno.length = 0;
  h.pokusu = 0;
  h.pauza = 40;
  h.zPameti = false;
  h.zapisSelze = false;
});

describe('Úprava skladu — ukládá se sama', () => {
  it('napsaná NULA se po krátké pauze uloží sama, pruh zmizí a ukáže se „Uloženo“', async () => {
    await otevri();
    fireEvent.change(pole(), { target: { value: '0' } });
    await waitFor(() => expect(h.ulozeno).toHaveLength(1));
    expect(h.ulozeno[0]).toMatchObject({ beer_id: 'b50', package_id: 'k50', napocitano: 0 });
    await waitFor(() => expect(screen.queryByTestId('tydenni-neulozeno')).toBeNull());
    expect(screen.getByTestId('tydenni-ulozeno-auto').textContent).toMatch(/Uloženo — Sklad i Rozbor s napočítaným už počítají/);
    expect(screen.getByRole('button', { name: 'Uložit vše' })).toBeTruthy();
  });

  it('dokud se píše, neukládá se: každá změna odpočet začíná znovu', async () => {
    h.pauza = 500;
    await otevri();
    fireEvent.change(pole(), { target: { value: '1' } });
    await pockej(300);
    fireEvent.change(pole(), { target: { value: '12' } });
    await pockej(300); // od první změny 600 ms (víc než pauza), od poslední jen 300 ms
    expect(h.ulozeno).toHaveLength(0);
    await waitFor(() => expect(h.ulozeno).toHaveLength(1), { timeout: 1500 });
    expect(h.ulozeno[0]).toMatchObject({ napocitano: 12 });
    expect(h.pokusu).toBe(1);
  });

  it('číslo rozepsané dřív (koncept z paměti telefonu) se samo NEULOŽÍ a pruh to řekne; přepsané se uloží', async () => {
    localStorage.setItem('tydenni_napocitano_2026-10-12', JSON.stringify({ b50__k50: '0' }));
    await otevri();
    await waitFor(() => expect(pole().value).toBe('0'));
    expect(screen.getByTestId('tydenni-neulozeno').textContent).toMatch(/Napočítáno dřív a neuloženo: 1 položka/);
    expect(screen.getByTestId('tydenni-neulozeno').textContent).toMatch(/sama se neuloží \(platila by až od dneška\)/);
    await pockej(250);
    expect(h.pokusu).toBe(0);
    fireEvent.change(pole(), { target: { value: '1' } });
    await waitFor(() => expect(h.ulozeno).toHaveLength(1));
    expect(h.ulozeno[0]).toMatchObject({ napocitano: 1 });
  });

  it('čísla „Čeká se“ z paměti telefonu: samo se neukládá, pruh říká proč', async () => {
    h.zPameti = true;
    await otevri();
    fireEvent.change(pole(), { target: { value: '0' } });
    await waitFor(() => expect(screen.getByTestId('tydenni-neulozeno')).toBeTruthy());
    expect(screen.getByTestId('tydenni-neulozeno').textContent).toMatch(/Samo se to neuloží, protože čísla „Čeká se“ jsou z paměti telefonu/);
    await pockej(250);
    expect(h.pokusu).toBe(0);
  });

  it('selhání uložení se nezkouší dokola; další pokus až po další změně čísla', async () => {
    h.zapisSelze = true;
    await otevri();
    fireEvent.change(pole(), { target: { value: '0' } });
    await waitFor(() => expect(h.pokusu).toBe(1));
    await waitFor(() => expect(screen.getByTestId('tydenni-neulozeno').textContent).toMatch(/automatické uložení se nepovedlo/));
    await pockej(300);
    expect(h.pokusu).toBe(1);
    fireEvent.change(pole(), { target: { value: '1' } });
    await waitFor(() => expect(h.pokusu).toBe(2));
    await pockej(200);
    expect(h.pokusu).toBe(2);
  });

  it('„Uložit vše“ uloží hned a samo se pak podruhé neukládá', async () => {
    h.pauza = 300;
    await otevri();
    fireEvent.change(pole(), { target: { value: '0' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Uložit vše (1)' }));
    await waitFor(() => expect(h.ulozeno).toHaveLength(1));
    await pockej(600);
    expect(h.pokusu).toBe(1);
    expect(screen.queryByTestId('tydenni-neulozeno')).toBeNull();
  });

  it('Popořadě: potvrzené číslo se uloží samo', async () => {
    await otevri();
    fireEvent.click(screen.getByRole('button', { name: /Popořadě/ }));
    const velke = await screen.findByPlaceholderText('—');
    fireEvent.change(velke, { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /Potvrdit a další/ }));
    await waitFor(() => expect(h.ulozeno).toHaveLength(1));
    expect(h.ulozeno[0]).toMatchObject({ beer_id: 'b50', package_id: 'k50', napocitano: 4 });
  });

  it('odchod z obrazovky dřív, než pauza doběhla, číslo uloží hned', async () => {
    h.pauza = 60_000;
    const { unmount } = await otevri();
    fireEvent.change(pole(), { target: { value: '0' } });
    expect(h.pokusu).toBe(0);
    unmount();
    expect(h.pokusu).toBe(1);
    expect(h.ulozeno[0]).toMatchObject({ napocitano: 0 });
  });

  it('přepnutí týdne: co se zadalo v jiném týdnu, se nepřenese — rozepsané číslo druhého týdne se samo neuloží', async () => {
    h.pauza = 300;
    localStorage.setItem('tydenni_napocitano_2026-10-05', JSON.stringify({ b50__k50: '0' }));
    await otevri();
    fireEvent.change(pole(), { target: { value: '5' } }); // čerstvé číslo tohoto týdne
    fireEvent.click(screen.getByRole('button', { name: 'Předchozí týden' })); // dřív, než pauza doběhla
    await waitFor(() => expect(pole().value).toBe('0')); // rozepsané číslo minulého týdne
    expect(screen.getByTestId('tydenni-neulozeno').textContent).toMatch(/Napočítáno dřív a neuloženo/);
    await pockej(700);
    expect(h.pokusu).toBe(0);
  });

  it('odchod z obrazovky ani schování stránky NEULOŽÍ číslo, když jsou „Čeká se“ z paměti telefonu', async () => {
    h.pauza = 60_000;
    h.zPameti = true;
    const { unmount } = await otevri();
    fireEvent.change(pole(), { target: { value: '0' } });
    const stav = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    stav.mockRestore();
    unmount();
    expect(h.pokusu).toBe(0);
  });

  it('zhasnutý displej / jiná aplikace (stránka se schová) číslo uloží hned', async () => {
    h.pauza = 60_000;
    await otevri();
    fireEvent.change(pole(), { target: { value: '0' } });
    expect(h.pokusu).toBe(0);
    const stav = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(h.pokusu).toBe(1);
    stav.mockRestore();
  });
});
