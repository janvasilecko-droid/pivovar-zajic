import { describe, it, expect } from 'vitest';
import { getHomeLayout, MIN_OPACITY, MAX_OPACITY, DEFAULT_DOCK } from './homeLayout';
import type { Page } from '../components/Layout';

const A: Page = 'kegging';
const B: Page = 'orders';
const C: Page = 'dashboard';

describe('getHomeLayout', () => {
  it('vrátí výchozí layout pro prázdný/null vstup', () => {
    const layout = getHomeLayout(null, [A, B, C]);
    expect(layout.order).toEqual([A, B, C]);
    expect(layout.scene).toBe('warm');
    expect(layout.tileOpacity).toBeCloseTo(0.62);
    expect(layout.dock).toEqual(DEFAULT_DOCK);
    [A, B, C].forEach((id) => expect(layout.overrides[id]?.color).toBeTruthy());
  });

  it('připojí nově viditelný modul na konec uloženého pořadí', () => {
    const raw = { order: [A, B], overrides: {}, scene: 'ocean', tileOpacity: 0.5 };
    const layout = getHomeLayout(raw, [A, B, C]);
    expect(layout.order).toEqual([A, B, C]);
  });

  it('vypustí z pořadí modul, na který uživatel už nemá právo', () => {
    const raw = { order: [A, B, C], overrides: {}, scene: 'warm', tileOpacity: 0.42 };
    const layout = getHomeLayout(raw, [A, C]);
    expect(layout.order).toEqual([A, C]);
  });

  it('zachová existující barvu override, nepřepíše ji výchozí', () => {
    const raw = { order: [A], overrides: { [A]: { color: 'plum', size: 'w2' } }, scene: 'warm', tileOpacity: 0.42 };
    const layout = getHomeLayout(raw, [A]);
    expect(layout.overrides[A]).toEqual({ color: 'plum', size: 'w2' });
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
});
