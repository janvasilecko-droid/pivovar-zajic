import { describe, it, expect } from 'vitest';
import { getHomeLayout, addPage, removePage, moveTileToPage, hideTile, unhideTile, MIN_OPACITY, MAX_OPACITY, DEFAULT_DOCK } from './homeLayout';
import type { Page } from '../components/Layout';

const A: Page = 'kegging';
const B: Page = 'orders';
const C: Page = 'dashboard';

describe('getHomeLayout', () => {
  it('vrátí výchozí layout pro prázdný/null vstup', () => {
    const layout = getHomeLayout(null, [A, B, C]);
    expect(layout.pages).toEqual([[A, B, C]]);
    expect(layout.scene).toBe('warm');
    expect(layout.tileOpacity).toBeCloseTo(0.62);
    expect(layout.dock).toEqual(DEFAULT_DOCK);
    [A, B, C].forEach((id) => expect(layout.overrides[id]?.color).toBeTruthy());
  });

  it('připojí nově viditelný modul na konec poslední stránky', () => {
    const raw = { pages: [[A, B]], overrides: {}, scene: 'ocean', tileOpacity: 0.5 };
    const layout = getHomeLayout(raw, [A, B, C]);
    expect(layout.pages).toEqual([[A, B, C]]);
  });

  it('vypustí ze stránky modul, na který uživatel už nemá právo', () => {
    const raw = { pages: [[A, B], [C]], overrides: {}, scene: 'warm', tileOpacity: 0.42 };
    const layout = getHomeLayout(raw, [A, C]);
    expect(layout.pages).toEqual([[A], [C]]);
  });

  it('čte starý plochý formát "order" jako jednu stránku (zpětná kompatibilita)', () => {
    const raw = { order: [A, B], overrides: {}, scene: 'warm', tileOpacity: 0.42 };
    const layout = getHomeLayout(raw, [A, B]);
    expect(layout.pages).toEqual([[A, B]]);
  });

  it('zachová existující barvu a velikost override, nepřepíše je výchozí', () => {
    const raw = { pages: [[A]], overrides: { [A]: { color: 'plum', w: 2, h: 1 } }, scene: 'warm', tileOpacity: 0.42 };
    const layout = getHomeLayout(raw, [A]);
    expect(layout.overrides[A]).toEqual({ color: 'plum', w: 2, h: 1 });
  });

  it('převede starý formát override.size na w/h (zpětná kompatibilita)', () => {
    const raw = { pages: [[A]], overrides: { [A]: { color: 'plum', size: 'w2' } }, scene: 'warm', tileOpacity: 0.42 };
    const layout = getHomeLayout(raw, [A]);
    expect(layout.overrides[A]).toEqual({ color: 'plum', w: 2, h: 1 });
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

  it('spodní lišta: "home" je vždy platné, modul bez práva spadne na výchozí', () => {
    const layout = getHomeLayout({ dock: ['home', B, C, 'writeoffs'] }, [B]);
    expect(layout.dock).toEqual(['home', B, DEFAULT_DOCK[2], DEFAULT_DOCK[3]]);
  });

  it('schovaná dlaždice se znovu nepřipojí mezi "nové", dokud je v hidden', () => {
    const layout = getHomeLayout({ pages: [[A]], hidden: [B] }, [A, B, C]);
    expect(layout.pages).toEqual([[A, C]]);
    expect(layout.hidden).toEqual([B]);
  });

  it('hidden odfiltruje id, na které uživatel ztratil právo', () => {
    const layout = getHomeLayout({ pages: [[A]], hidden: [B] }, [A]);
    expect(layout.hidden).toEqual([]);
  });
});

describe('hideTile / unhideTile', () => {
  it('hideTile odstraní dlaždici ze stránky a přidá ji do hidden', () => {
    const layout = getHomeLayout({ pages: [[A, B]] }, [A, B]);
    const next = hideTile(layout, B);
    expect(next.pages).toEqual([[A]]);
    expect(next.hidden).toEqual([B]);
  });

  it('unhideTile vrátí dlaždici na konec první stránky', () => {
    const layout = hideTile(getHomeLayout({ pages: [[A, B]] }, [A, B]), B);
    const next = unhideTile(layout, B);
    expect(next.pages).toEqual([[A, B]]);
    expect(next.hidden).toEqual([]);
  });
});

describe('addPage / removePage / moveTileToPage', () => {
  it('addPage přidá prázdnou stránku na konec', () => {
    const layout = getHomeLayout({ pages: [[A]] }, [A]);
    const next = addPage(layout);
    expect(next.pages).toEqual([[A], []]);
  });

  it('removePage smaže stránku a přesune její dlaždice do předchozí', () => {
    const layout = getHomeLayout({ pages: [[A], [B, C]] }, [A, B, C]);
    const next = removePage(layout, 1);
    expect(next.pages).toEqual([[A, B, C]]);
  });

  it('removePage nikdy nesmaže poslední zbývající stránku', () => {
    const layout = getHomeLayout({ pages: [[A]] }, [A]);
    const next = removePage(layout, 0);
    expect(next.pages).toEqual([[A]]);
  });

  it('moveTileToPage přesune dlaždici z jedné stránky na jinou', () => {
    const layout = getHomeLayout({ pages: [[A, B], [C]] }, [A, B, C]);
    const next = moveTileToPage(layout, B, 1);
    expect(next.pages).toEqual([[A], [C, B]]);
  });
});
