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

describe('rozdelDoStranek — jedna stránka pod sebou (28. 9. 2026, na zkoušku)', () => {
  it('rozdělí VŠECHNY dlaždice a žádnou neztratí ani nezdvojí', () => {
    const stranky = rozdelDoStranek(VSECHNY as TileId[]);
    const vsechnyVeStrankach = stranky.flat();
    expect(vsechnyVeStrankach).toHaveLength(VSECHNY.length);
    expect(new Set(vsechnyVeStrankach).size).toBe(VSECHNY.length);
    expect([...vsechnyVeStrankach].sort()).toEqual([...VSECHNY].sort());
  });

  it('všechno na jedné stránce: nahoře denní práce, pod ní zbytek', () => {
    // „Dej všechny dlaždice na jednu stránku dolů, na zkoušku" (28. 9. 2026).
    const stranky = rozdelDoStranek(VSECHNY as TileId[]);
    expect(VYCHOZI_STRANKA).toBe(0);
    expect(STRANKY_PLOCHY).toHaveLength(1);
    expect(stranky).toHaveLength(1);
    // Nakládka závoz na ploše sama není — přidává se ručně (28. 9. 2026:
    // „ten závoz tam nedávej, dej tam možnost si ho ale na plochu přidat").
    expect(stranky[0].slice(0, 7)).toEqual(
      ['orders_zavoz', 'cellar', 'notes', 'prodejna', 'bottling_needs', 'timer', 'history'],
    );
    // Co bylo na „Další", je pod tím.
    expect(stranky[0]).toContain('kegging');
    expect(stranky[0]).toContain('depozitar'); // Číselníky
    expect(stranky[0].indexOf('kegging')).toBeGreaterThan(stranky[0].indexOf('history'));
  });

  it('Nakládka závoz: z plochy jednou dolů, ručně přidaná pak zůstane', () => {
    const zVerze17 = { pages: [['nakladka', 'orders_zavoz', 'cellar']], overrides: { nakladka: { w: 3, h: 2 } }, rozlozeniVerze: 17 };
    const po = getHomeLayout(zVerze17, NAV.map((n) => n.id), EXTRA_NAV.map((n) => n.id), GRID_COLS_MOBILE);
    expect(po.pages.flat()).not.toContain('nakladka');
    // Kdo si ji potom přidá, tomu ji další načtení nesundá.
    const pridana = { ...po, pages: [['nakladka', ...po.pages[0]], ...po.pages.slice(1)] };
    const znovu = getHomeLayout(pridana, NAV.map((n) => n.id), EXTRA_NAV.map((n) => n.id), GRID_COLS_MOBILE);
    expect(znovu.pages.flat()).toContain('nakladka');
    expect(znovu.overrides.nakladka?.w).toBe(3);
  });

  it('Nastavení a Odhlásit (ikony v liště) jsou úplně na konci — jinak by v mřížce zbyla díra', () => {
    // Simulace plochy 28. 9. 2026: mezi „Uživatelé" a „Stáhnout zálohu"
    // zůstalo prázdné místo, kde by stála nekreslená dlaždice Nastavení.
    const [stranka] = rozdelDoStranek([...VSECHNY, 'co2', 'grp_neco'] as TileId[]);
    expect(stranka.slice(-2)).toEqual(['app_settings', 'signout']);
  });

  it('dlaždice, na které uživatel nemá právo, nenechají prázdné místo', () => {
    // Kdo vidí jen výrobu, dostane JEDNU stránku — ne dvě s prázdnou.
    const stranky = rozdelDoStranek(['kegging', 'bottling', 'orders'] as TileId[]);
    expect(stranky).toHaveLength(1);
    expect(stranky[0]).toEqual(['orders', 'kegging', 'bottling']);
  });

  it('neznámá dlaždice (nový modul, skupina, odpočet) padne na poslední stránku', () => {
    const stranky = rozdelDoStranek(['kegging', 'grp_neco', 'cd_t_1'] as TileId[]);
    expect(stranky[stranky.length - 1]).toContain('grp_neco');
    expect(stranky[stranky.length - 1]).toContain('cd_t_1');
  });

  it('nová plocha se zakládá jako jedna stránka, denní práce nahoře', () => {
    const layout = getHomeLayout(
      null,
      NAV.map((n) => n.id),
      EXTRA_NAV.map((n) => n.id),
      GRID_COLS_MOBILE,
    );
    // Jedna stránka s obsahem + jedna prázdná na konci: tu appka drží
    // schválně, ať je kam přetáhnout dlaždici v úpravě (ensureTrailingEmptyPage).
    const sObsahem = layout.pages.filter((p) => p.length > 0);
    expect(sObsahem).toHaveLength(1);
    expect(layout.pages[layout.pages.length - 1]).toEqual([]);
    // První je denní práce — na ní se plocha otevírá, s velkými dlaždicemi.
    expect(sObsahem[VYCHOZI_STRANKA]).toContain('cellar');
    expect(sObsahem[VYCHOZI_STRANKA]).toContain('orders_zavoz');
    expect(layout.overrides.cellar?.w).toBe(1);
    // KEG, Lahve, Objednávky, Nová obj. a Sklad jsou pod denní prací.
    expect(sObsahem[0]).toContain('kegging');
    expect(layout.overrides.kegging?.h).toBe(1);
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
    // Hlavní moduly + záměrné výjimky (lísteček s poznámkami, návod), nic víc.
    // Počítá se ze seznamu výjimek, ne z napevno napsaného čísla: jinak by
    // každá nová výjimka znamenala „oprav číslo v testu" místo rozhodnutí.
    expect(layout.pages.flat()).toHaveLength(NAV.length + DLAZDICE_MIMO_TABULKU_ZAMERNE.length);
    for (const vyjimka of DLAZDICE_MIMO_TABULKU_ZAMERNE) {
      expect(layout.pages.flat()).toContain(vyjimka);
    }
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

  it('idsKRozmisteni pustí z EXTRA_NAV jen záměrné výjimky', () => {
    const ids = idsKRozmisteni(['kegging'], EXTRA_NAV.map((n) => n.id));
    expect(ids).toContain('kegging');
    for (const vyjimka of DLAZDICE_MIMO_TABULKU_ZAMERNE) {
      expect(ids).toContain(vyjimka);
    }
    expect(ids).not.toContain('bottling_entry');
    expect(ids).not.toContain('sanitace_vycepy');
    expect(ids).toHaveLength(1 + DLAZDICE_MIMO_TABULKU_ZAMERNE.length);
  });
});

describe('jednorázové přeskládání plochy (ROZLOZENI_VERZE)', () => {
  const stara = {
    // Plocha z doby před rozdělením: všechno na jedné stránce, bez značky.
    pages: [['kegging', 'bottling', 'concentration', 'app_settings']],
    overrides: { kegging: { w: 2, h: 2, color: 'sky' } },
  };
  const viditelne = NAV.map((n) => n.id);

  it('plochu bez značky jednou přeskládá podle STRANKY_PLOCHY', () => {
    const layout = getHomeLayout(stara, viditelne, [], GRID_COLS_MOBILE);
    // Od verze 18 (na zkoušku) je stránka jedna — přeskládání doplní
    // všechny hlavní moduly v pořadí denní práce nahoře.
    const sObsahem = layout.pages.filter((p) => p.length > 0);
    expect(sObsahem).toHaveLength(STRANKY_PLOCHY.length);
    expect(sObsahem[0].length).toBeGreaterThan(stara.pages[0].length);
    expect(layout.rozlozeniVerze).toBe(ROZLOZENI_VERZE);
  });

  it('přeskládání zachová barvu i velikost dlaždice', () => {
    const layout = getHomeLayout(stara, viditelne, [], GRID_COLS_MOBILE);
    expect(layout.overrides.kegging?.color).toBe('sky');
    // KEG odešel z úvodní stránky na „Další" — zase běžná velikost (verze 11).
    expect(layout.overrides.kegging?.h).toBe(1);
  });

  it('plocha z verze 3 dostane denní práci nahoru', () => {
    const verze3 = {
      pages: [['history', 'dashboard'], ['kegging', 'bottling', 'orders', 'notes'], ['cellar', 'app_settings']],
      overrides: { dashboard: { w: 1, h: 1, color: 'teal' }, notes: { w: 1, h: 1 } },
      rozlozeniVerze: 3,
    };
    const layout = getHomeLayout(verze3, viditelne, ['notes'], GRID_COLS_MOBILE);
    const [uvod] = layout.pages.filter((p) => p.length > 0);
    expect(uvod.slice(0, 6)).toEqual(['cellar', 'notes', 'prodejna', 'bottling_needs', 'timer', 'history']);
    expect(uvod).toContain('app_settings');
    expect(uvod).toContain('dashboard');
    expect(layout.overrides.dashboard?.h).toBe(1);
    expect(layout.overrides.dashboard?.color).toBe('teal');
    expect(layout.overrides.notes?.h).toBe(1);
  });

  it('plocha z verze 4 dostane lísteček s poznámkami na úvodní stránku', () => {
    const verze4 = {
      pages: [['orders', 'kegging', 'dashboard'], ['notes', 'history']],
      overrides: { kegging: { w: 1, h: 2, color: 'sky' }, notes: { w: 1, h: 1 } },
      rozlozeniVerze: 4,
    };
    const layout = getHomeLayout(verze4, viditelne, ['notes'], GRID_COLS_MOBILE);
    const [uvod] = layout.pages.filter((p) => p.length > 0);
    expect(uvod).toContain('notes');
    expect(layout.overrides.kegging?.color).toBe('sky');
    expect(layout.overrides.notes?.h).toBe(1);
  });

  it('plocha z verze 15 ztratí přehledové dlaždice; Sklep a Rozvoz jsou obyčejné', () => {
    // Přehledy tanků a „co naložit" jsou od 28. 9. 2026 okna nahoře na ploše,
    // mimo dlaždice — stará dlaždice prehled_* z plochy zmizí sama.
    const verze15 = {
      pages: [['prehled_rozvoz', 'orders_zavoz', 'cellar', 'notes'], ['app_settings']],
      overrides: { prehled_rozvoz: { w: 3, h: 2 }, orders_zavoz: { w: 1, h: 1 }, cellar: { w: 1, h: 1, color: 'teal' } },
      rozlozeniVerze: 15,
    };
    const layout = getHomeLayout(verze15, viditelne, ['orders_zavoz', 'notes'], GRID_COLS_MOBILE);
    const [uvod] = layout.pages.filter((p) => p.length > 0);
    expect(layout.pages.flat()).not.toContain('prehled_rozvoz');
    expect(uvod.slice(0, 2)).toEqual(['orders_zavoz', 'cellar']);
    expect(layout.overrides.cellar?.w).toBe(1);
    expect(layout.overrides.cellar?.color).toBe('teal');
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
