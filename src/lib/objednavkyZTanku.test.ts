// Zadání 28. 9. 2026: Sklep počítá „co stočit" z téhož plánu jako okno
// „Co stočit" a obrazovky KEG/Lahve — tady jen převod na hl po pivech.
import { describe, it, expect } from 'vitest';
import { objednavkyZTanku, popisChybi } from './objednavkyZTanku';
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

// 17. 10. 2026: „u tanku je, že chybí něco stočit, to je blbost, všechno je stočený" —
// u 12° Tmavé byla celá „0,5 hl" rezerva 50 l, spuštěná jednou chybějící lahví 1,5 l.
describe('popisChybi — co přesně chybí stočit', () => {
  const lahev = (beer: string, label: string, ordered: number, done: number, dluh = 0): PlanItem => ({
    ...polozka(beer, 1.5, ordered, done), package_label: label, dluh,
  });

  it('jedna chybějící lahev: napíše položku, mínus ve skladu a rezervu 50 l', () => {
    const t = popisChybi({ lahve: plan([lahev('tm', '1.5l', 3, 2, 1)]) }, 'tm');
    expect(t).toBe('chybí 1× 1.5l (ve skladu −1) + 50 l rezerva na lince při stáčení lahví');
  });

  it('sudy rezervu nemají; víc položek se vypíše za sebou', () => {
    const t = popisChybi({ sudy: plan([polozka('sv', 50, 10, 4), polozka('sv', 30, 5, 3)]) }, 'sv');
    expect(t).toBe('chybí 6× 50l, 2× 30l');
  });

  it('bez mínusu ve skladu se „ve skladu" nepíše; jiné pivo se nepočítá', () => {
    expect(popisChybi({ lahve: plan([lahev('tm', '1l', 20, 10)]) }, 'tm')).toBe('chybí 10× 1l + 50 l rezerva na lince při stáčení lahví');
    expect(popisChybi({ lahve: plan([lahev('tm', '1l', 20, 10)]) }, 'sv')).toBe('');
  });

  it('nic nechybí nebo žádný plán: prázdný text', () => {
    expect(popisChybi({ sudy: plan([polozka('sv', 50, 10, 10)]) }, 'sv')).toBe('');
    expect(popisChybi({}, 'sv')).toBe('');
  });
});

