import { describe, it, expect } from 'vitest';
import {
  getHomeLayout, addPage, removePage, moveTileToPage, hideTile, unhideTile, addTile,
  mergeTiles, addToGroup, removeFromGroup, deleteGroup, ensurePositions, moveTileToCell, stepTileCell,
  addDockSlot, removeDockSlot, ensureTrailingEmptyPage, unifyColorsByCategory,
  MIN_OPACITY, MAX_OPACITY, MIN_TILE_GAP, MAX_TILE_GAP, DEFAULT_DOCK, MIN_DOCK, MAX_DOCK, GRID_COLS_DESKTOP,
  ROZLOZENI_VERZE, type GroupId,
} from './homeLayout';
import type { Page } from '../components/Layout';

// Testovací rozložení dostávají `rozlozeniVerze`, tedy „tohle už je
// rozdělené do stránek". Bez ní by je getHomeLayout jednou přeskládal podle
// STRANKY_PLOCHY (viz ROZLOZENI_VERZE) a tyhle testy by místo práce se
// stránkami zkoušely tu migraci — na tu je homeLayout.stranky.test.ts.
const A: Page = 'kegging';
const B: Page = 'orders';
const C: Page = 'dashboard';

describe('getHomeLayout', () => {
  it('vrátí výchozí layout pro prázdný/null vstup', () => {
    const layout = getHomeLayout(null, [A, B, C]);
    // Nová plocha se zakládá rozdělená do stránek podle STRANKY_PLOCHY, takže
    // rozmístění i pořadí určuje TA TABULKA, ne pořadí ve visibleIds:
    // kegging a dashboard (Sklad) patří na úvodní stránku, orders na
    // „Zbytek" (v appce jsou objednávky ve spodní liště). Poslední prázdná
    // stránka je místo na přidávání (ensureTrailingEmptyPage).
    expect(layout.pages).toEqual([[A, C], [B], []]);
    expect(layout.scene).toBe('warm');
    expect(layout.tileOpacity).toBeCloseTo(0.62);
    // 'bottling' ani 'notes' nejsou v visibleIds, takže i výchozí slot
    // spodní lišty se ověří a spadne na 'home' — viz "spodní lišta: home je
    // vždy platné" níže. Výchozí lišta má PĚT slotů (dřív čtyři): palec na
    // ni dosáhne bez přehmátnutí, takže se do ní vešly i Poznámky.
    expect(layout.dock).toEqual(['orders', 'kegging', 'home', 'home', 'home']);
    [A, B, C].forEach((id) => expect(layout.overrides[id]?.color).toBeTruthy());
  });

  it('připojí nově viditelný modul na konec poslední stránky', () => {
    const raw = { rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A, B]], overrides: {}, scene: 'ocean', tileOpacity: 0.5 };
    const layout = getHomeLayout(raw, [A, B, C]);
    expect(layout.pages).toEqual([[A, B, C], []]);
  });

  it('vypustí ze stránky modul, na který uživatel už nemá právo', () => {
    const raw = { rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A, B], [C]], overrides: {}, scene: 'warm', tileOpacity: 0.42 };
    const layout = getHomeLayout(raw, [A, C]);
    expect(layout.pages).toEqual([[A], [C], []]);
  });

  it('čte starý plochý formát "order" a nic z něj neztratí (zpětná kompatibilita)', () => {
    // Starý formát je jedna plochá řada dlaždic. Načte se jako jedna stránka,
    // ale protože nenese značku rozdělení (`rozlozeniVerze`), plocha se
    // vzápětí jednou přeskládá do stránek — to je záměr, aby staré rozložení
    // dostalo nové rozdělení. Testuje se tedy to, na čem záleží: že se žádná
    // dlaždice neztratí ani nezdvojí.
    const raw = { order: [A, B], overrides: {}, scene: 'warm', tileOpacity: 0.42 };
    const layout = getHomeLayout(raw, [A, B]);
    expect(layout.pages.flat().sort()).toEqual([A, B].sort());
    expect(layout.pages[layout.pages.length - 1]).toEqual([]);
  });

  it('zachová existující barvu a velikost override, nepřepíše je výchozí', () => {
    const raw = { rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A]], overrides: { [A]: { color: 'plum', w: 2, h: 1 } }, scene: 'warm', tileOpacity: 0.42 };
    const layout = getHomeLayout(raw, [A]);
    expect(layout.overrides[A]).toMatchObject({ color: 'plum', w: 2, h: 1 });
  });

  it('převede starý formát override.size na w/h (zpětná kompatibilita)', () => {
    const raw = { rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A]], overrides: { [A]: { color: 'plum', size: 'w2' } }, scene: 'warm', tileOpacity: 0.42 };
    const layout = getHomeLayout(raw, [A]);
    expect(layout.overrides[A]).toMatchObject({ color: 'plum', w: 2, h: 1 });
  });

  it('ořízne tileOpacity do platného rozsahu', () => {
    expect(getHomeLayout({ tileOpacity: 5 }, [A]).tileOpacity).toBe(MAX_OPACITY);
    expect(getHomeLayout({ tileOpacity: -1 }, [A]).tileOpacity).toBe(MIN_OPACITY);
  });

  it('ignoruje neplatnou hodnotu scene a použije výchozí', () => {
    const layout = getHomeLayout({ scene: 'neexistujici' }, [A]);
    expect(layout.scene).toBe('warm');
  });

  it('přijme platný vlastní hex jako customAccent, neplatný nahradí výchozím', () => {
    expect(getHomeLayout({ customAccent: '#00ff00' }, [A]).customAccent).toBe('#00ff00');
    expect(getHomeLayout({ customAccent: 'nesmysl' }, [A]).customAccent).toBe('#ff6b6b');
  });

  it('spodní lišta: "home" je vždy platné, modul bez práva spadne na "home"', () => {
    const layout = getHomeLayout({ dock: ['home', B, C, 'writeoffs'] }, [B]);
    expect(layout.dock).toEqual(['home', B, 'home', 'home']);
    // Uložená délka se respektuje (tady 4), i když výchozí je nově 5.
    expect(layout.dock.length).toBe(4);
  });

  it('spodní lišta: počet slotů je volitelný (ne napevno 4), respektuje se uložená délka v mezích MIN/MAX_DOCK', () => {
    expect(getHomeLayout({ dock: ['home', B] }, [B]).dock).toEqual(['home', B]);
    expect(getHomeLayout({ dock: ['home', B, 'home', B, 'home', B] }, [B]).dock).toHaveLength(6);
  });

  it('schovaná dlaždice se znovu nepřipojí mezi "nové", dokud je v hidden', () => {
    const layout = getHomeLayout({ rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A]], hidden: [B] }, [A, B, C]);
    expect(layout.pages).toEqual([[A, C], []]);
    expect(layout.hidden).toEqual([B]);
  });

  it('hidden odfiltruje id, na které uživatel ztratil právo', () => {
    const layout = getHomeLayout({ rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A]], hidden: [B] }, [A]);
    expect(layout.hidden).toEqual([]);
  });

  it('ořízne tileGap do platného rozsahu, výchozí je 4', () => {
    expect(getHomeLayout(null, [A]).tileGap).toBe(4);
    expect(getHomeLayout({ tileGap: 99 }, [A]).tileGap).toBe(MAX_TILE_GAP);
    expect(getHomeLayout({ tileGap: -5 }, [A]).tileGap).toBe(MIN_TILE_GAP);
  });

  it('extraIds se ověří/zachovají, ale nepřidají se automaticky jako nové', () => {
    const layout = getHomeLayout(null, [A], [B]);
    expect(layout.pages).toEqual([[A], []]);
    const withExtra = getHomeLayout({ rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A, B]] }, [A], [B]);
    expect(withExtra.pages).toEqual([[A, B], []]);
  });

  it('extra dlaždice zmizí ze stránky, pokud přestane být v extraIds/visibleIds', () => {
    const layout = getHomeLayout({ rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A, B]] }, [A], []);
    expect(layout.pages).toEqual([[A], []]);
  });

  it('skupinu s platnými členy zachová (nový modul C se připojí za ni)', () => {
    const raw = { rozlozeniVerze: ROZLOZENI_VERZE, pages: [['grp_x']], groups: { grp_x: { memberIds: [A, B] } } };
    const layout = getHomeLayout(raw, [A, B, C]);
    expect(layout.pages).toEqual([['grp_x', C], []]);
    expect(layout.groups['grp_x' as GroupId]).toEqual({ memberIds: [A, B] });
  });

  it('skupinu s jedním platným členem rozpustí na obyčejnou dlaždici', () => {
    const raw = { rozlozeniVerze: ROZLOZENI_VERZE, pages: [['grp_x']], groups: { grp_x: { memberIds: [A, B] } } };
    const layout = getHomeLayout(raw, [A]); // B už není viditelné
    expect(layout.pages).toEqual([[A], []]);
    expect(layout.groups['grp_x' as GroupId]).toBeUndefined();
  });

  it('skupinu bez jediného platného člena zahodí úplně', () => {
    const raw = { rozlozeniVerze: ROZLOZENI_VERZE, pages: [['grp_x']], groups: { grp_x: { memberIds: [B] } } };
    const layout = getHomeLayout(raw, [A]);
    expect(layout.pages).toEqual([[A], []]);
  });
});

describe('hideTile / unhideTile', () => {
  it('hideTile odstraní dlaždici ze stránky a přidá ji do hidden', () => {
    const layout = getHomeLayout({ rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A, B]] }, [A, B]);
    const next = hideTile(layout, B);
    expect(next.pages).toEqual([[A], []]);
    expect(next.hidden).toEqual([B]);
  });

  it('unhideTile vrátí dlaždici na konec první stránky', () => {
    const layout = hideTile(getHomeLayout({ rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A, B]] }, [A, B]), B);
    const next = unhideTile(layout, B);
    expect(next.pages).toEqual([[A, B], []]);
    expect(next.hidden).toEqual([]);
  });
});

describe('addPage / removePage / moveTileToPage', () => {
  it('addPage přidá prázdnou stránku na konec', () => {
    const layout = getHomeLayout({ rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A]] }, [A]);
    const next = addPage(layout);
    expect(next.pages).toEqual([[A], [], []]);
  });

  it('removePage smaže stránku a přesune její dlaždice do předchozí', () => {
    const layout = getHomeLayout({ rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A], [B, C]] }, [A, B, C]);
    const next = removePage(layout, 1);
    expect(next.pages).toEqual([[A, B, C], []]);
  });

  it('removePage nikdy nesmaže poslední zbývající stránku', () => {
    const layout = getHomeLayout({ rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A]] }, [A]);
    const next = removePage(layout, 0);
    expect(next.pages).toEqual([[A]]);
  });

  it('moveTileToPage přesune dlaždici z jedné stránky na jinou', () => {
    const layout = getHomeLayout({ rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A, B], [C]] }, [A, B, C]);
    const next = moveTileToPage(layout, B, 1);
    expect(next.pages).toEqual([[A], [C, B], []]);
  });
});

describe('addTile', () => {
  it('přidá dlaždici, co je zrovna schovaná, zpátky na zvolenou stránku a odebere z hidden', () => {
    const layout = hideTile(getHomeLayout({ rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A], []] }, [A, B]), B);
    const next = addTile(layout, B, 1);
    expect(next.pages).toEqual([[A], [B], []]);
    expect(next.hidden).toEqual([]);
  });

  it('přesune dlaždici z jiné stránky, pokud tam už byla', () => {
    const layout = getHomeLayout({ rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A, B], []] }, [A, B]);
    const next = addTile(layout, B, 1);
    expect(next.pages).toEqual([[A], [B]]);
  });
});

describe('mergeTiles / addToGroup / removeFromGroup / deleteGroup', () => {
  it('mergeTiles sloučí dvě dlaždice na místě druhé, zdědí její barvu/velikost/pozici', () => {
    const layout = getHomeLayout({ rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A, B]], overrides: { [B]: { color: 'gold', w: 2, h: 1 } } }, [A, B]);
    const bPos = { x: layout.overrides[B]!.x, y: layout.overrides[B]!.y };
    const next = mergeTiles(layout, A, B, 0);
    expect(next.pages[0]).toHaveLength(1);
    const groupId = next.pages[0][0] as GroupId;
    expect(next.groups[groupId]).toEqual({ memberIds: [A, B] });
    expect(next.overrides[groupId]).toEqual({ label: 'Skupina', color: 'gold', w: 2, h: 1, ...bPos });
  });

  it('addToGroup přidá další dlaždici a odebere ji z její stránky', () => {
    const layout = getHomeLayout({ rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A, B, C]] }, [A, B, C]);
    const merged = mergeTiles(layout, A, B, 0);
    const groupId = merged.pages[0].find((id) => id !== C) as GroupId;
    const next = addToGroup(merged, groupId, C);
    expect(next.groups[groupId].memberIds).toEqual([A, B, C]);
    expect(next.pages[0]).toEqual([groupId]);
  });

  it('removeFromGroup vrátí dlaždici na stránku skupiny; při poklesu na 1 se skupina zruší celá', () => {
    const layout = getHomeLayout({ rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A, B, C]] }, [A, B, C]);
    const merged = mergeTiles(layout, A, B, 0);
    const groupId = merged.pages[0].find((id) => id !== C) as GroupId;
    const withThree = addToGroup(merged, groupId, C);
    const backToTwo = removeFromGroup(withThree, groupId, C);
    expect(backToTwo.groups[groupId].memberIds).toEqual([A, B]);
    expect(backToTwo.pages[0]).toEqual([groupId, C]);

    const dissolved = removeFromGroup(backToTwo, groupId, A);
    expect(dissolved.groups[groupId]).toBeUndefined();
    expect(dissolved.pages[0]).toEqual(expect.arrayContaining([A, B, C]));
    expect(dissolved.pages[0]).toHaveLength(3);
  });

  it('deleteGroup rozpustí skupinu a vrátí všechny členy na její stránku', () => {
    const layout = getHomeLayout({ rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A, B]] }, [A, B]);
    const merged = mergeTiles(layout, A, B, 0);
    const groupId = merged.pages[0][0] as GroupId;
    const next = deleteGroup(merged, groupId);
    expect(next.pages[0]).toEqual([A, B]);
    expect(next.groups[groupId]).toBeUndefined();
    expect(next.overrides[groupId]).toBeUndefined();
  });
});

describe('ensurePositions / moveTileToCell / stepTileCell (volné pozicování)', () => {
  const COLS = 6; // 2 dlaždice na řádek (výchozí w=1 = UNIT_COLS=3 sloupce)
  // Vlastní, "obyčejné" stránky bez speciální výchozí velikosti/barvy (na
  // rozdíl od A/B/C výše — 'kegging'/'orders'/'dashboard' mají v homeLayout.ts
  // DEFAULT_SIZE přednastavené na w2/h2, což by tyhle pozicovací testy jen
  // zbytečně komplikovalo).
  const P: Page = 'stock';
  const Q: Page = 'writeoffs';
  const R: Page = 'sklo_promo';

  it('doplní x/y dlaždicím bez pozice, řádkově podle pořadí na stránce', () => {
    const layout = getHomeLayout({ rozlozeniVerze: ROZLOZENI_VERZE, pages: [[P, Q, R]] }, [P, Q, R], [], COLS);
    expect(layout.overrides[P]).toMatchObject({ x: 0, y: 0 });
    expect(layout.overrides[Q]).toMatchObject({ x: 3, y: 0 });
    expect(layout.overrides[R]).toMatchObject({ x: 0, y: 1 });
  });

  it('zachová platnou uloženou pozici, i s mezerou kolem (nepřebalí ji zpátky k ostatním)', () => {
    const layout = getHomeLayout({ rozlozeniVerze: ROZLOZENI_VERZE, pages: [[P, Q]], overrides: { [P]: { x: 0, y: 0 }, [Q]: { x: 3, y: 5 } } }, [P, Q], [], COLS);
    expect(layout.overrides[Q]).toMatchObject({ x: 3, y: 5 });
  });

  it('kolidující uloženou pozici (dvě dlaždice na stejné buňce) přebalí do první volné', () => {
    const layout = getHomeLayout({ rozlozeniVerze: ROZLOZENI_VERZE, pages: [[P, Q]], overrides: { [P]: { x: 0, y: 0 }, [Q]: { x: 0, y: 0 } } }, [P, Q], [], COLS);
    expect(layout.overrides[P]).toMatchObject({ x: 0, y: 0 });
    expect(layout.overrides[Q]).toMatchObject({ x: 3, y: 0 });
  });

  it('ensurePositions je idempotentní (opakované volání nic nepřeuspořádá)', () => {
    const once = getHomeLayout({ rozlozeniVerze: ROZLOZENI_VERZE, pages: [[P, Q, R]] }, [P, Q, R], [], COLS);
    const twice = ensurePositions(once, COLS);
    expect(twice.overrides).toEqual(once.overrides);
  });

  it('moveTileToCell přesune dlaždici na prázdnou buňku, i s mezerou kolem — ostatní se nehýbou', () => {
    const layout = getHomeLayout({ rozlozeniVerze: ROZLOZENI_VERZE, pages: [[P, Q]] }, [P, Q], [], COLS); // P:(0,0) Q:(3,0)
    const next = moveTileToCell(layout, P, 3, 4, COLS);
    expect(next.overrides[P]).toMatchObject({ x: 3, y: 4 });
    expect(next.overrides[Q]).toMatchObject({ x: 3, y: 0 });
  });

  it('moveTileToCell na obsazenou buňku obě dlaždice prohodí (žádný překryv)', () => {
    const layout = getHomeLayout({ rozlozeniVerze: ROZLOZENI_VERZE, pages: [[P, Q]] }, [P, Q], [], COLS); // P:(0,0) Q:(3,0)
    const next = moveTileToCell(layout, P, 3, 0, COLS);
    expect(next.overrides[P]).toMatchObject({ x: 3, y: 0 });
    expect(next.overrides[Q]).toMatchObject({ x: 0, y: 0 });
  });

  it('moveTileToCell ořízne cíl, ať dlaždice nepřeteče přes okraj mřížky', () => {
    const layout = getHomeLayout({ rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A]] }, [A], [], COLS); // w=1 => 3 sloupce, COLS=6
    const next = moveTileToCell(layout, A, 5, 0, COLS);
    expect(next.overrides[A]?.x).toBe(3); // COLS(6) - w(3)
  });

  it('stepTileCell posune o jednu buňku; na okraji mřížky (x/y by šlo do záporu) nic neudělá', () => {
    const layout = getHomeLayout({ rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A]] }, [A], [], COLS); // A:(0,0)
    const moved = stepTileCell(layout, A, 'down', COLS);
    expect(moved.overrides[A]).toMatchObject({ x: 0, y: 1 });
    const blocked = stepTileCell(moved, A, 'left', COLS);
    expect(blocked.overrides[A]).toMatchObject({ x: 0, y: 1 });
  });

  it('getHomeLayout defaultně používá GRID_COLS_DESKTOP, když cols není zadán', () => {
    const layout = getHomeLayout({ rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A]] }, [A]);
    expect(layout.overrides[A]?.x).toBeLessThan(GRID_COLS_DESKTOP);
  });
});

describe('ensureTrailingEmptyPage (Android-styl stránkování)', () => {
  it('přidá prázdnou stránku, pokud poslední obsahuje dlaždice', () => {
    const layout = { rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A, B]] } as any;
    expect(ensureTrailingEmptyPage(layout).pages).toEqual([[A, B], []]);
  });

  it('nic nepřidá, pokud už poslední stránka je prázdná', () => {
    const layout = { rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A], []] } as any;
    const next = ensureTrailingEmptyPage(layout);
    expect(next.pages).toEqual([[A], []]);
    expect(next).toBe(layout); // beze změny — stejná reference
  });

  it('nemaže ručně přidané prázdné stránky navíc (persist po "Přidat stránku" je nesmí zase slít)', () => {
    const layout = { rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A], [], []] } as any;
    expect(ensureTrailingEmptyPage(layout).pages).toEqual([[A], [], []]);
  });

  it('prázdný seznam stránek spadne na jednu prázdnou stránku', () => {
    const layout = { rozlozeniVerze: ROZLOZENI_VERZE, pages: [] } as any;
    expect(ensureTrailingEmptyPage(layout).pages).toEqual([[]]);
  });
});

describe('unifyColorsByCategory', () => {
  it('přebarví dlaždice se stejnou kategorií na stejnou barvu, i když měly různou vlastní barvu', () => {
    // kegging (A) i orders (B) jsou obě 'Výroba', dashboard (C) je 'Pivovar'.
    const raw = { rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A, B, C]], overrides: { [A]: { color: 'ruby' }, [B]: { color: 'sky' } } };
    const layout = getHomeLayout(raw, [A, B, C]);
    const next = unifyColorsByCategory(layout);
    expect(next.overrides[A]?.color).toBe(next.overrides[B]?.color);
    expect(next.overrides[A]?.color).not.toBe(next.overrides[C]?.color);
  });

  it('nechá skupinové dlaždice (grp_*) beze změny', () => {
    const raw = { rozlozeniVerze: ROZLOZENI_VERZE, pages: [[A, B]], overrides: { [A]: { color: 'ruby' } } };
    const layout = getHomeLayout(raw, [A, B]);
    const merged = mergeTiles(layout, A, B, 0);
    const groupId = merged.pages[0][0] as GroupId;
    const groupColorBefore = merged.overrides[groupId]?.color;
    const next = unifyColorsByCategory(merged);
    expect(next.overrides[groupId]?.color).toBe(groupColorBefore);
  });
});

describe('addDockSlot / removeDockSlot', () => {
  // Všechny DEFAULT_DOCK stránky musí být viditelné, jinak by je dock-validace
  // v getHomeLayout samo nahradila 'home' a testy by mísily dvě různé věci.
  const allDockPages: Page[] = DEFAULT_DOCK;

  it('addDockSlot přidá další slot ("home"), respektuje MAX_DOCK', () => {
    const layout = getHomeLayout(null, allDockPages);
    const next = addDockSlot(layout);
    expect(next.dock).toEqual([...DEFAULT_DOCK, 'home']);
    let maxed = layout;
    for (let i = 0; i < 10; i++) maxed = addDockSlot(maxed);
    expect(maxed.dock.length).toBe(MAX_DOCK);
  });

  it('removeDockSlot odebere slot na indexu, respektuje MIN_DOCK', () => {
    const layout = getHomeLayout(null, allDockPages);
    const next = removeDockSlot(layout, 1);
    expect(next.dock).toEqual(DEFAULT_DOCK.filter((_, i) => i !== 1));
    let minned = layout;
    for (let i = 0; i < 10; i++) minned = removeDockSlot(minned, 0);
    expect(minned.dock.length).toBe(MIN_DOCK);
  });
});
