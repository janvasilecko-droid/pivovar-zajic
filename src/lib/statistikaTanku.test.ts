import { describe, expect, it } from 'vitest';
import { radekCyklu, statistikaTanku } from './statistikaTanku';

const cyklus = (o: any = {}) => ({
  tank_id: 't1', tank_label: 'Tank 1', beer_name: '12° Světlá', initial_volume_l: 7000, kegged_volume_l: 6800,
  loss_l: 200, started_at: '2026-09-01T08:00:00Z', ended_at: '2026-09-29T08:00:00Z', duration_hours: 672, ...o,
});

describe('radekCyklu', () => {
  it('doba, výtrata a litry za týden', () => {
    const r = radekCyklu(cyklus());
    expect(r.dnu).toBe(28);
    expect(r.ztrataPct).toBe(2.9);
    expect(r.litruTydne).toBe(1700);
  });
  it('bez duration_hours se doba spočítá z dat', () => {
    expect(radekCyklu(cyklus({ duration_hours: null })).dnu).toBe(28);
  });
  it('bez počátečního objemu není výtrata', () => {
    expect(radekCyklu(cyklus({ initial_volume_l: 0 })).ztrataPct).toBeNull();
  });
});

describe('statistikaTanku', () => {
  const tanky = [
    { id: 't1', label: 'Tank 1', current_beer_id: 'b', current_beer_name: '10° Desítka', current_volume_l: 4000, initial_volume_l: 7000, started_at: '2026-10-05T08:00:00Z' },
    { id: 't2', label: 'Tank 2', current_beer_name: null, current_volume_l: 0 },
  ];
  const staceni = [
    { entry_date: '2026-10-06', cellar_tank_id: 't1', source_volume_l: 1000 },
    { entry_date: '2026-10-13', cellar_tank_id: 't1', source_volume_l: 1500 },
    { entry_date: '2026-10-14', cellar_tank_id: 't1', source_volume_l: 500 },
    { entry_date: '2026-10-14', cellar_tank_id: 't2', source_volume_l: 999 },
    { entry_date: '2026-10-14', cellar_tank_id: 't1', source_volume_l: null },
  ];
  const v = statistikaTanku({ cykly: [cyklus()], tanky, staceni, dnes: '2026-10-19', tydnu: 3 });

  it('týdenní součty jen z toho tanku, nejstarší týden první', () => {
    const t1 = v.find((x) => x.id === 't1')!;
    expect(t1.tydny).toEqual([
      { od: '2026-10-05', litry: 1000 },
      { od: '2026-10-12', litry: 2000 },
      { od: '2026-10-19', litry: 0 },
    ]);
  });
  it('rozpracovaný cyklus: pivo, dny a stočeno od začátku', () => {
    const n = v.find((x) => x.id === 't1')!.nyni!;
    expect(n.pivo).toBe('10° Desítka');
    expect(n.dnu).toBe(14);
    expect(n.stoceneL).toBe(3000);
    expect(n.zbyvaL).toBe(4000);
    expect(n.litruTydne).toBe(1500);
  });
  it('prázdný tank nemá rozpracovaný cyklus a řadí se podle názvu', () => {
    expect(v.map((x) => x.label)).toEqual(['Tank 1', 'Tank 2']);
    expect(v[1].nyni).toBeNull();
  });
  it('průměry z uzavřených cyklů', () => {
    const t1 = v[0];
    expect(t1.cykly).toHaveLength(1);
    expect(t1.prumerDnu).toBe(28);
    expect(t1.ztrataPct).toBe(2.9);
  });
});
