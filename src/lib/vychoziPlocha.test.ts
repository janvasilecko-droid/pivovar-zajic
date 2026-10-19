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
    expect(layout.dock).toEqual(['bottling', 'dashboard', 'home', 'prodejna', 'kegging', 'orders']);
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

  it('podle práv: dlaždice bez práva se nekreslí, ostatní zůstanou přesně na místech správce', () => {
    const smi: Page[] = ['orders', 'kegging', 'bottling', 'dashboard'];
    const layout = getHomeLayout(null, smi, [], GRID_COLS_DESKTOP);
    expect(layout.pages[0]).toHaveLength(4);
    expect(layout.pages.flat()).not.toContain('users');
    for (const id of smi) {
      const o = (VYCHOZI_PLOCHA.overrides as Record<string, { x: number; y: number; color: string }>)[id];
      expect(layout.overrides[id], id).toMatchObject({ x: o.x, y: o.y, color: o.color });
    }
  });

  it('vlastní dlaždice odpočtů se na výchozí plochu nepřidávají (u všech stejná), poznámky zůstávají uložené', () => {
    const raw = zakladniRozlozeni({ pages: [['cd_t_moje']], notes: [{ id: 'n1' }] }) as { pages: string[][]; notes: unknown[] };
    expect(raw.pages[0].some((id) => id.startsWith('cd_'))).toBe(false);
    expect(raw.pages[0]).toHaveLength(POCET_VYCHOZICH_DLAZDIC);
    expect(raw.notes).toEqual([{ id: 'n1' }]);
  });
});
