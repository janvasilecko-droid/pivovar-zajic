import { describe, it, expect } from 'vitest';
import { planProVyber, coZbyvaStocit, vychoziDenCoStocit } from './coStocit';
import type { DayPlan, PlanItem } from './keggingPlan';

const polozka = (key: string, beer: string, ordered: number, missing: number): PlanItem => ({
  key, beer_id: key.split('__')[0], beer_name: beer, package_id: key.split('__')[1], package_label: 'KEG 50l', volume_l: 50,
  ordered, done: ordered - missing, autoDone: ordered - missing, nachystano: 0, zChladaku: 0, checked: 0, missing, orders: [],
});
const den = (day: string, items: PlanItem[]): DayPlan => ({
  day, label: day, date: '2026-09-14', items,
  totalOrdered: items.reduce((s, x) => s + x.ordered, 0),
  totalDone: items.reduce((s, x) => s + x.done, 0),
  totalMissing: items.reduce((s, x) => s + x.missing, 0),
  missingLiters: items.reduce((s, x) => s + x.missing * x.volume_l, 0),
});

describe('okno „Co stočit" na úvodní stránce', () => {
  const plans = [
    den('po', [polozka('a__k50', 'Světlá', 4, 1), polozka('b__k50', 'Tmavá', 2, 0)]),
    den('ut', [polozka('a__k50', 'Světlá', 3, 3)]),
    den('bez', [polozka('b__k50', 'Tmavá', 1, 1)]),
  ];

  it('den ukáže jen ten den', () => {
    expect(planProVyber(plans, 'po', 'T').totalMissing).toBe(1);
  });

  it('týden sečte všechny dny i objednávky bez termínu', () => {
    const t = planProVyber(plans, 'tyden', 'T');
    expect(t.totalMissing).toBe(5);
    expect(t.items.find((i) => i.key === 'a__k50')?.missing).toBe(4);
  });

  it('den bez objednávek je prázdný, ne chyba', () => {
    expect(planProVyber(plans, 'ne', 'T').items).toEqual([]);
  });

  it('hotové položky se nevypisují, nejvíc chybějící je nahoře', () => {
    const r = coZbyvaStocit(planProVyber(plans, 'tyden', 'T'));
    expect(r.map((i) => i.beer_name)).toEqual(['Světlá', 'Tmavá']);
    expect(coZbyvaStocit(planProVyber(plans, 'po', 'T')).map((i) => i.key)).toEqual(['a__k50']);
  });
});

describe('vychoziDenCoStocit — výchozí den je zítřek, ne dnešek', () => {
  // Co jede zítra na zavoz, se musí stočit dneska — sud/lahev potřebuje čas
  // na dozrání a dnešní vlastní odpočet ze skladu už proběhl brzo ráno.
  it('v úterý ukáže středu', () => {
    expect(vychoziDenCoStocit('2026-09-15')).toBe('st'); // úterý → středa
  });

  it('v sobotu ukáže neděli', () => {
    expect(vychoziDenCoStocit('2026-09-19')).toBe('ne');
  });

  it('v neděli zůstává dnešek — zítřek (pondělí) je už v jiném týdnu', () => {
    expect(vychoziDenCoStocit('2026-09-20')).toBe('ne');
  });

  it('v pátek ukáže sobotu', () => {
    expect(vychoziDenCoStocit('2026-09-18')).toBe('so');
  });
});
