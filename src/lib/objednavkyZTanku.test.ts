// Zadání 28. 9. 2026: Sklep počítá „co stočit" z téhož plánu jako okno
// „Co stočit" a obrazovky KEG/Lahve — tady jen převod na hl po pivech.
import { describe, it, expect } from 'vitest';
import { objednavkyZTanku } from './objednavkyZTanku';
import type { DayPlan, PlanItem } from './keggingPlan';

const piva = [
  { id: 'sv', name: '12° Světlá' },
  { id: 'tm', name: '13° Tmavé' },
  { id: 'ja', name: 'Jantar' },
];

function polozka(beer_id: string, volume_l: number, ordered: number, done: number): PlanItem {
  return {
    key: `${beer_id}__${volume_l}`, beer_id, beer_name: beer_id, package_id: `p${volume_l}`, package_label: `${volume_l}l`,
    volume_l, ordered, done, autoDone: done, nachystano: 0, zChladaku: done, checked: 0,
    missing: Math.max(0, ordered - done), orders: [],
  };
}
function plan(items: PlanItem[]): DayPlan {
  return { day: 'tyden', label: 'týden', date: '', items, totalOrdered: 0, totalDone: 0, totalMissing: 0, missingLiters: 0 };
}

describe('objednavkyZTanku — z plánu stáčení', () => {
  it('co je pokryté skladem, se stáčet nemusí', () => {
    const r = objednavkyZTanku({ sudy: plan([polozka('sv', 50, 10, 10)]) }, piva);
    expect(r.get('sv')).toEqual({ objednanoHl: 5, pokrytoHl: 5, zbyvaHl: 0 });
  });

  it('chybějící sudy se sečtou v litrech přes obaly', () => {
    const r = objednavkyZTanku({ sudy: plan([polozka('sv', 50, 10, 4), polozka('sv', 30, 2, 2)]) }, piva);
    expect(r.get('sv')!.objednanoHl).toBe(5.6);
    expect(r.get('sv')!.zbyvaHl).toBe(3);
  });

  it('chybějící lahve přidají 50 l rezervy', () => {
    const r = objednavkyZTanku({ lahve: plan([polozka('sv', 0.5, 100, 0)]) }, piva);
    expect(r.get('sv')!.zbyvaHl).toBe(1); // 50 l + 50 l rezerva
  });

  it('Jantar se rozdělí 80/20 do Světlé a Tmavého', () => {
    const r = objednavkyZTanku({ sudy: plan([polozka('ja', 50, 2, 0)]) }, piva);
    expect(r.get('sv')!.zbyvaHl).toBe(0.8);
    expect(r.get('tm')!.zbyvaHl).toBe(0.2);
    expect(r.get('ja')!.zbyvaHl).toBe(0);
  });

  it('bez plánu nic', () => {
    expect(objednavkyZTanku({}, piva).size).toBe(0);
  });
});
