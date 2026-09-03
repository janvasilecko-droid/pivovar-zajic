// Rozdělení plochy do tří stránek + co udělá užší mřížka s uloženými
// dlaždicemi. Obojí se dotýká rozložení, které si lidi sami naskládali —
// tedy věci, kde chyba mrzí a nepozná se hned.
import { describe, it, expect } from 'vitest';
import { NAV, EXTRA_NAV, PAGE_GROUP_PARENT } from '../components/Layout';
import {
  ensurePositions, getHomeLayout, rozdelDoStranek, rozdelVseDoStranek, STRANKY_PLOCHY, VYCHOZI_STRANKA,
  DLAZDICE_MIMO_TABULKU_ZAMERNE, ROZLOZENI_VERZE, idsKRozmisteni, vyrovnejStranku,
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

  it('úvodní stránka je krátká a je na ní to, na co se sahá denně', () => {
    // Schválně jen pět dlaždic: stočit (KEG, Lahve), vzkazy, sklad, inventura.
    // Čím víc se sem přidá, tím hůř se to hledá — zbytek je jedno přejetí
    // prstem daleko. Objednávky tu nejsou proto, že sedí ve spodní liště.
    const stranky = rozdelDoStranek(VSECHNY as TileId[]);
    expect(STRANKY_PLOCHY[VYCHOZI_STRANKA].nazev).toBe('Úvod');
    const uvod = stranky[VYCHOZI_STRANKA];
    expect(uvod).toEqual(['kegging', 'bottling', 'notes', 'dashboard', 'inventory']);
  });

  it('úvodní stránka se nesmí rozjet do seznamu — nejvýš šest dlaždic', () => {
    // Pojistka proti tomu, aby se sem postupně naskládalo všechno; tak
    // vypadala plocha předtím, než se rozdělila.
    expect(STRANKY_PLOCHY[VYCHOZI_STRANKA].ids.length).toBeLessThanOrEqual(6);
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
    // Hlavní moduly + lísteček s poznámkami (záměrná výjimka), nic víc.
    expect(layout.pages.flat()).toHaveLength(NAV.length + 1);
    expect(layout.pages.flat()).toContain('notes');
    expect(layout.pages.flat()).not.toContain('sanitace_vycepy');
    expect(layout.pages.flat()).not.toContain('bottling_entry');
  });

  it('rozdelVseDoStranek nesundá z plochy podzáložku, kterou si tam někdo přidal ručně', () => {
    // Rozdělení rozmisťuje jen hlavní moduly, ale co už na ploše leží, tam
    // zůstane — přidání dlaždice bylo rozhodnutí uživatele.
    const zaklad = getHomeLayout(null, NAV.map((n) => n.id), [], GRID_COLS_MOBILE);
    const sPodzalozkou = {
      ...zaklad,
      pages: [[...zaklad.pages[0], 'sanitace_vycepy' as TileId], ...zaklad.pages.slice(1)],
    };
    const po = rozdelVseDoStranek(sPodzalozkou, idsKRozmisteni(NAV.map((n) => n.id), []) as TileId[]);
    expect(po.pages.flat()).toContain('sanitace_vycepy');
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

  it('uložené rozložení se ZNAČKOU už rozdělením nepřepíše', () => {
    // Kdo si plochu naskládal po rozdělení, o ni nesmí přijít.
    // (Bez značky se plocha jednou přeskládá — to je záměr, viz popis
    // ROZLOZENI_VERZE a testy migrace níž. Tenhle test proto značku má;
    // dřív ji neměl a procházel jen proto, že u dvou výrobních dlaždic
    // vyšlo přeskládání shodou okolností stejně.)
    const moje = {
      pages: [['bottling'], ['kegging']],
      overrides: {},
      rozlozeniVerze: ROZLOZENI_VERZE,
    };
    const layout = getHomeLayout(moje, ['kegging', 'bottling'], [], GRID_COLS_MOBILE);
    expect(layout.pages.filter((p) => p.length > 0)).toEqual([['bottling'], ['kegging']]);
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

describe('jedna věc = jedna dlaždice', () => {
  it('na plochu se nedostane dlaždice, která je jen vnitřní záložkou jiné', () => {
    // ⚠️ Přesně tohle se stalo: vedle „Lahve (Stáčení)" stály „Lahve — zápis"
    // a „Lahve — přehled", tedy tři dlaždice na jednu věc. Totéž Sanitace
    // (5), Odběratelé (5) a Kalendář (4). Appka přitom sama ví, co je
    // podzáložka čeho — PAGE_GROUP_PARENT v Layout.tsx.
    const vsechnyNaplose = new Set(STRANKY_PLOCHY.flatMap((s) => s.ids));
    const vyjimky = new Set(DLAZDICE_MIMO_TABULKU_ZAMERNE);

    const duplikaty: string[] = [];
    for (const id of vsechnyNaplose) {
      const rodic = PAGE_GROUP_PARENT[id];
      if (!rodic || vyjimky.has(id)) continue;
      if (vsechnyNaplose.has(rodic)) duplikaty.push(`${id} (je záložkou v ${rodic})`);
    }
    expect(duplikaty).toEqual([]);
  });

  it('žádná dlaždice není ve tabulce dvakrát', () => {
    const vsechny = STRANKY_PLOCHY.flatMap((s) => s.ids);
    expect(new Set(vsechny).size).toBe(vsechny.length);
  });

  it('Lahve jsou na ploše jedna dlaždice', () => {
    const vsechny = STRANKY_PLOCHY.flatMap((s) => s.ids);
    expect(vsechny).toContain('bottling');
    expect(vsechny).not.toContain('bottling_entry');
    expect(vsechny).not.toContain('bottling_overview');
  });

  it('rozdělení rozmisťuje JEN hlavní moduly — z EXTRA_NAV nic než záměrné výjimky', () => {
    // EXTRA_NAV jsou podle vlastního popisu „stránky, co dnes existují jen
    // jako vnitřní záložka jiné obrazovky". Na plochu je rozdělení nesype;
    // kdo je tam chce, přidá si je ručně. Jediná výjimka je lísteček
    // s poznámkami — widget, který jinde než na ploše nemá smysl.
    const naplose = new Set(STRANKY_PLOCHY.flatMap((s) => s.ids));
    const hlavni = new Set(NAV.map((n) => n.id));
    const vyjimky = new Set(DLAZDICE_MIMO_TABULKU_ZAMERNE);

    const podzalozky = [...naplose].filter((id) => !hlavni.has(id) && !vyjimky.has(id));
    expect(podzalozky).toEqual([]);
  });

  it('všechny hlavní moduly jsou rozmístěné — na žádný se nezapomnělo', () => {
    const naplose = new Set(STRANKY_PLOCHY.flatMap((s) => s.ids));
    const chybi = NAV.map((n) => n.id).filter((id) => !naplose.has(id));
    expect(chybi).toEqual([]);
  });

  it('idsKRozmisteni pustí z EXTRA_NAV jen poznámky', () => {
    const ids = idsKRozmisteni(['kegging'], EXTRA_NAV.map((n) => n.id));
    expect(ids).toContain('kegging');
    expect(ids).toContain('notes');
    expect(ids).not.toContain('bottling_entry');
    expect(ids).not.toContain('sanitace_vycepy');
    expect(ids).toHaveLength(2);
  });
});

describe('jednorázové přeskládání plochy (ROZLOZENI_VERZE)', () => {
  const stara = {
    // Plocha z doby před rozdělením: všechno na jedné stránce, bez značky.
    pages: [['kegging', 'bottling', 'concentration', 'app_settings']],
    overrides: { kegging: { w: 2, h: 2, color: 'sky' } },
  };
  const viditelne = NAV.map((n) => n.id);

  it('plochu bez značky jednou přeskládá do stránek', () => {
    const layout = getHomeLayout(stara, viditelne, [], GRID_COLS_MOBILE);
    expect(layout.pages.filter((p) => p.length > 0).length).toBeGreaterThan(1);
    expect(layout.rozlozeniVerze).toBe(ROZLOZENI_VERZE);
  });

  it('přeskládání zachová barvu i velikost dlaždice', () => {
    const layout = getHomeLayout(stara, viditelne, [], GRID_COLS_MOBILE);
    expect(layout.overrides.kegging?.color).toBe('sky');
    expect(layout.overrides.kegging?.h).toBe(2);
  });

  it('plochu se značkou už NEPŘESKLÁDÁ — kdo si ji naskládal, o ni nepřijde', () => {
    const moje = {
      pages: [['kegging'], ['bottling']],
      overrides: {},
      rozlozeniVerze: ROZLOZENI_VERZE,
    };
    const layout = getHomeLayout(moje, ['kegging', 'bottling'], [], GRID_COLS_MOBILE);
    expect(layout.pages.filter((p) => p.length > 0)).toEqual([['kegging'], ['bottling']]);
  });

  it('schovanou dlaždici přeskládání nevrátí na plochu', () => {
    const sSchovanou = { ...stara, hidden: ['app_settings'] };
    const layout = getHomeLayout(sSchovanou, viditelne, [], GRID_COLS_MOBILE);
    expect(layout.pages.flat()).not.toContain('app_settings');
    expect(layout.hidden).toContain('app_settings');
  });
});

describe('vyrovnejStranku — srazit dlaždice k sobě', () => {
  const l = (kusy: Array<[string, number, number, number?, number?]>, stranek = 1): HomeLayout => {
    const overrides: any = {};
    for (const [id, x, y, w, h] of kusy) overrides[id] = { x, y, w: w ?? 1, h: h ?? 1 };
    const pages: any[] = [kusy.map(([id]) => id)];
    for (let i = 1; i < stranek; i++) pages.push([]);
    return { pages, overrides, groups: {}, dock: [], hidden: [], fixedColors: {} } as any;
  };
  const kde = (layout: HomeLayout, id: string) => {
    const o = layout.overrides[id as TileId]!;
    return { x: o.x, y: o.y };
  };

  it('zaplní díry a srazí dlaždice odshora', () => {
    // Tři dlaždice rozeseté po ploše s mezerami → mají sednout do prvního
    // řádku vedle sebe (9 sloupců / 3 = tři na řádek).
    const po = vyrovnejStranku(l([['a', 0, 3], ['b', 6, 5], ['c', 3, 8]]), 0, GRID_COLS_MOBILE);
    expect(kde(po, 'a')).toEqual({ x: 0, y: 0 });
    expect(kde(po, 'b')).toEqual({ x: 3, y: 0 });
    expect(kde(po, 'c')).toEqual({ x: 6, y: 0 });
  });

  it('zachová pořadí, jak ho člověk vidí — shora dolů a zleva doprava', () => {
    // Ve `pages` jsou naschvál v jiném pořadí, než jak leží na ploše.
    const layout = l([['pozdejsi', 6, 0], ['prvni', 0, 0], ['druhy', 3, 0]]);
    const po = vyrovnejStranku(layout, 0, GRID_COLS_MOBILE);
    expect(po.pages[0]).toEqual(['prvni', 'druhy', 'pozdejsi']);
    expect(kde(po, 'prvni')).toEqual({ x: 0, y: 0 });
    expect(kde(po, 'pozdejsi')).toEqual({ x: 6, y: 0 });
  });

  it('poradí si s velkou dlaždicí — nepřekryje ji ani ji nerozseká', () => {
    const po = vyrovnejStranku(l([['velka', 0, 4, 2, 2], ['a', 6, 9], ['b', 3, 12]]), 0, GRID_COLS_MOBILE);
    const v = kde(po, 'velka');
    expect(v).toEqual({ x: 0, y: 0 });
    // Malé dlaždice nesmí ležet v obdélníku té velké (6 sloupců × 2 řádky).
    for (const id of ['a', 'b']) {
      const p = kde(po, id)!;
      const prekryva = p.x! < 6 && p.y! < 2;
      expect(prekryva, `${id} leží pod velkou dlaždicí`).toBe(false);
    }
  });

  it('sáhne JEN na zvolenou stránku', () => {
    const layout: HomeLayout = {
      ...l([['a', 0, 5]], 2),
      pages: [['a'], ['b']],
      overrides: { a: { x: 0, y: 5, w: 1, h: 1 }, b: { x: 6, y: 7, w: 1, h: 1 } },
    } as any;
    const po = vyrovnejStranku(layout, 0, GRID_COLS_MOBILE);
    expect(kde(po, 'a')).toEqual({ x: 0, y: 0 });
    expect(kde(po, 'b')).toEqual({ x: 6, y: 7 });
  });

  it('prázdná ani neexistující stránka nic nerozbije', () => {
    const layout = l([['a', 0, 0]], 2);
    expect(vyrovnejStranku(layout, 1, GRID_COLS_MOBILE)).toBe(layout);
    expect(vyrovnejStranku(layout, 9, GRID_COLS_MOBILE)).toBe(layout);
  });

  it('barvy, velikosti a popisky zůstanou', () => {
    const layout = l([['a', 3, 4, 2, 2]]);
    layout.overrides.a = { ...layout.overrides.a, color: 'sky', label: 'Moje' };
    const po = vyrovnejStranku(layout, 0, GRID_COLS_MOBILE);
    expect(po.overrides.a?.color).toBe('sky');
    expect(po.overrides.a?.label).toBe('Moje');
    expect(po.overrides.a?.w).toBe(2);
    expect(po.overrides.a?.h).toBe(2);
  });
});
