import { describe, it, expect } from 'vitest';
import { maVlastniPlochu, POCET_VYCHOZICH_DLAZDIC, VYCHOZI_PLOCHA, zakladniRozlozeni } from './vychoziPlocha';
import { getHomeLayout, GRID_COLS_DESKTOP } from './homeLayout';
import { NAV, EXTRA_NAV } from '../components/Layout';
import type { Page } from '../components/Layout';

const vsechno = [...NAV, ...EXTRA_NAV].map((n) => n.id);

describe('výchozí plocha správce', () => {
  it('maVlastniPlochu: jen skutečné dlaždice se počítají, odpočty a prázdno ne', () => {
    expect(maVlastniPlochu(null)).toBe(false);
    expect(maVlastniPlochu({})).toBe(false);
    expect(maVlastniPlochu({ pages: [['cd_t_1'], []] })).toBe(false);
    expect(maVlastniPlochu({ pages: [['orders']] })).toBe(true);
    expect(maVlastniPlochu({ order: ['kegging'] })).toBe(true);
  });

  it('nový uživatel dostane dlaždice, barvy a velikosti správce — i Nakládku nahoře přes tři sloupce', () => {
    const layout = getHomeLayout(null, vsechno as Page[], [], GRID_COLS_DESKTOP);
    expect(layout.pages[0][0]).toBe('nakladka');
    expect(layout.overrides.nakladka).toMatchObject({ w: 3, h: 2, x: 0, y: 0 });
    expect(layout.overrides.cellar?.color).toBe('navy');
    expect(layout.overrides.kegging?.color).toBe('sky');
    expect(layout.tileGap).toBe(4);
    expect(layout.dock).toEqual(['bottling', 'dashboard', 'home', 'prodejna', 'kegging', 'home']);
    // Dlaždice ve výchozí ploše sedí na skutečné obrazovky (kromě vlastních odpočtů).
    const znama = new Set<string>(vsechno);
    expect(VYCHOZI_PLOCHA.pages[0].filter((id) => !znama.has(id))).toEqual([]);
  });

  it('správce, který vidí všechno, má plochu přesně podle snímku (pozice se neposouvají)', () => {
    const layout = getHomeLayout(null, vsechno as Page[], [], GRID_COLS_DESKTOP);
    for (const id of VYCHOZI_PLOCHA.pages[0]) {
      const o = (VYCHOZI_PLOCHA.overrides as Record<string, { x: number; y: number }>)[id];
      expect(layout.overrides[id as Page], id).toMatchObject({ x: o.x, y: o.y });
    }
  });

  it('podle práv: dlaždice, na které uživatel právo nemá, se nekreslí a plocha se srovná bez děr', () => {
    const smi: Page[] = ['orders', 'kegging', 'bottling', 'dashboard'];
    const layout = getHomeLayout(null, smi, [], GRID_COLS_DESKTOP);
    expect(layout.pages[0]).toHaveLength(4);
    expect(layout.pages.flat()).not.toContain('users');
    const radky = layout.pages[0].map((id) => layout.overrides[id]?.y ?? 0);
    expect(Math.max(...radky)).toBeLessThanOrEqual(1); // čtyři dlaždice nezůstanou rozházené po 15 řádcích
  });

  it('vlastní odpočty uživatele zůstanou', () => {
    const raw = zakladniRozlozeni({ pages: [['cd_t_moje']], notes: [{ id: 'n1' }] }) as { pages: string[][]; notes: unknown[] };
    expect(raw.pages[0].at(-1)).toBe('cd_t_moje');
    expect(raw.pages[0]).toHaveLength(POCET_VYCHOZICH_DLAZDIC + 1);
    expect(raw.notes).toEqual([{ id: 'n1' }]);
  });
});
