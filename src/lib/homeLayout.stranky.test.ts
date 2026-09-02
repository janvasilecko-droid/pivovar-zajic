// Rozdělení plochy do tří stránek + co udělá užší mřížka s uloženými
// dlaždicemi. Obojí se dotýká rozložení, které si lidi sami naskládali —
// tedy věci, kde chyba mrzí a nepozná se hned.
import { describe, it, expect } from 'vitest';
import { NAV, EXTRA_NAV } from '../components/Layout';
import {
  ensurePositions, getHomeLayout, rozdelDoStranek, rozdelVseDoStranek, STRANKY_PLOCHY, VYCHOZI_STRANKA,
  GRID_COLS_MOBILE, GRID_COLS_DESKTOP, MAX_W, UNIT_COLS,
  type HomeLayout, type TileId,
} from './homeLayout';
import type { Page } from '../components/Layout';

const VSECHNY: Page[] = [...NAV.map((n) => n.id), ...EXTRA_NAV.map((n) => n.id)];

describe('rozdelDoStranek — tři stránky podle toho, co člověk dělá', () => {
  it('rozdělí VŠECHNY dlaždice a žádnou neztratí ani nezdvojí', () => {
    const stranky = rozdelDoStranek(VSECHNY as TileId[]);
    const vsechnyVeStrankach = stranky.flat();
    expect(vsechnyVeStrankach).toHaveLength(VSECHNY.length);
    expect(new Set(vsechnyVeStrankach).size).toBe(VSECHNY.length);
    expect([...vsechnyVeStrankach].sort()).toEqual([...VSECHNY].sort());
  });

  it('prostřední stránka je výroba a je na ní poznámkový lísteček', () => {
    const stranky = rozdelDoStranek(VSECHNY as TileId[]);
    expect(STRANKY_PLOCHY[VYCHOZI_STRANKA].nazev).toBe('Výroba');
    const vyroba = stranky[VYCHOZI_STRANKA];
    for (const id of ['notes', 'kegging', 'bottling', 'inventory', 'cellar']) {
      expect(vyroba, `${id} chybí na stránce Výroba`).toContain(id);
    }
  });

  it('vlevo jsou výpočty a nástroje, vpravo číselníky a nastavení', () => {
    const [nastroje, , zbytek] = rozdelDoStranek(VSECHNY as TileId[]);
    expect(nastroje).toContain('concentration'); // Kalkulačky
    expect(nastroje).toContain('timer');
    expect(zbytek).toContain('app_settings');
    expect(zbytek).toContain('pricelist');
  });

  it('dlaždice, na které uživatel nemá právo, nenechají prázdné místo', () => {
    // Kdo vidí jen výrobu, dostane JEDNU stránku — ne tři s dvěma prázdnými.
    const stranky = rozdelDoStranek(['kegging', 'bottling', 'inventory'] as TileId[]);
    expect(stranky).toHaveLength(1);
    expect(stranky[0]).toEqual(['kegging', 'bottling', 'inventory']);
  });

  it('neznámá dlaždice (nový modul, skupina, odpočet) padne na poslední stránku', () => {
    const stranky = rozdelDoStranek(['kegging', 'grp_neco', 'cd_t_1'] as TileId[]);
    expect(stranky[stranky.length - 1]).toContain('grp_neco');
    expect(stranky[stranky.length - 1]).toContain('cd_t_1');
  });

  it('nová plocha se zakládá rozdělená, ne jako jedna hromada', () => {
    // Tohle je ta věc, kvůli které se to dělalo: dřív se dlaždice naskládaly
    // na jednu stránku a hledalo se v nich očima.
    const layout = getHomeLayout(
      null,
      NAV.map((n) => n.id),
      EXTRA_NAV.map((n) => n.id),
      GRID_COLS_MOBILE,
    );
    // Tři stránky s obsahem + jedna prázdná na konci: tu appka drží
    // schválně, ať je kam přidávat dlaždice (ensureTrailingEmptyPage).
    const sObsahem = layout.pages.filter((p) => p.length > 0);
    expect(sObsahem).toHaveLength(3);
    expect(layout.pages[layout.pages.length - 1]).toEqual([]);
    // Prostřední z těch tří je výroba — na ní se plocha otevírá.
    expect(sObsahem[VYCHOZI_STRANKA]).toContain('kegging');
  });

  it('rozšiřující dlaždice se do nové plochy NEPŘIDAJÍ samy', () => {
    // Zůstávají opt-in, jak byly. Jsou to většinou podzáložky (Lahve — zápis,
    // Sanitace výčepů), ke kterým se dá dostat z hlavních dlaždic; nováček by
    // jinak dostal 44 dlaždic hned první den.
    const layout = getHomeLayout(
      null,
      NAV.map((n) => n.id),
      EXTRA_NAV.map((n) => n.id),
      GRID_COLS_MOBILE,
    );
    expect(layout.pages.flat()).toHaveLength(NAV.length);
    expect(layout.pages.flat()).not.toContain('sanitace_vycepy');
  });

  it('rozdelVseDoStranek doplní i rozšiřující dlaždice — ale jen na vyžádání', () => {
    const zaklad = getHomeLayout(null, NAV.map((n) => n.id), [], GRID_COLS_MOBILE);
    const po = rozdelVseDoStranek(zaklad, VSECHNY as TileId[]);
    expect(po.pages.flat()).toHaveLength(VSECHNY.length);
    expect(po.pages.flat()).toContain('sanitace_vycepy');
    expect(po.pages.filter((p) => p.length > 0)).toHaveLength(3);
  });

  it('rozdelVseDoStranek nechá schované dlaždice schované', () => {
    // Schování je taky rozhodnutí — přeskládání ho nesmí zrušit.
    const zaklad = {
      ...getHomeLayout(null, NAV.map((n) => n.id), [], GRID_COLS_MOBILE),
      hidden: ['vehicles' as TileId],
    };
    const bezAut = { ...zaklad, pages: zaklad.pages.map((p) => p.filter((id) => id !== 'vehicles')) };
    const po = rozdelVseDoStranek(bezAut, VSECHNY as TileId[]);
    expect(po.pages.flat()).not.toContain('vehicles');
  });

  it('rozdelVseDoStranek zachová barvy a velikosti dlaždic', () => {
    const zaklad = getHomeLayout(null, NAV.map((n) => n.id), [], GRID_COLS_MOBILE);
    const sVelkym = {
      ...zaklad,
      overrides: { ...zaklad.overrides, kegging: { ...zaklad.overrides.kegging, w: 2, h: 2, color: 'sky' } },
    };
    const po = rozdelVseDoStranek(sVelkym, VSECHNY as TileId[]);
    expect(po.overrides.kegging?.w).toBe(2);
    expect(po.overrides.kegging?.h).toBe(2);
    expect(po.overrides.kegging?.color).toBe('sky');
  });

  it('uložené rozložení se rozdělením NEPŘEPÍŠE', () => {
    // Kdo si plochu naskládal, o ni nesmí přijít jen proto, že se změnilo
    // výchozí rozdělení.
    const moje = { pages: [['kegging', 'bottling']], overrides: {} };
    const layout = getHomeLayout(moje, ['kegging', 'bottling'], [], GRID_COLS_MOBILE);
    expect(layout.pages.filter((p) => p.length > 0)).toEqual([['kegging', 'bottling']]);
  });
});

describe('ensurePositions — široká dlaždice na užší mřížce', () => {
  const layoutS = (w: number): HomeLayout => ({
    pages: [['kegging']], overrides: { kegging: { w, h: 1, x: 0, y: 0 } },
    groups: {}, dock: [], hidden: [], fixedColors: {},
  } as any);

  it('dlaždice širší než mřížka se zúží, ať nepřeteče řádek', () => {
    // MAX_W = 4 je 12 surových sloupců; telefon má 9. Bez zúžení by
    // dlaždice přetekla o tři sloupce a rozhodila celý řádek.
    expect(MAX_W * UNIT_COLS).toBeGreaterThan(GRID_COLS_MOBILE);
    const po = ensurePositions(layoutS(MAX_W), GRID_COLS_MOBILE);
    const w = po.overrides.kegging!.w!;
    expect(w * UNIT_COLS).toBeLessThanOrEqual(GRID_COLS_MOBILE);
    expect(w).toBe(3);
  });

  it('na počítači zůstane široká dlaždice široká', () => {
    const po = ensurePositions(layoutS(MAX_W), GRID_COLS_DESKTOP);
    expect(po.overrides.kegging!.w).toBe(MAX_W);
  });

  it('mini dlaždice (w = 0) se nezúžuje na nulu', () => {
    const po = ensurePositions(layoutS(0), GRID_COLS_MOBILE);
    expect(po.overrides.kegging!.w).toBe(0);
  });
});
