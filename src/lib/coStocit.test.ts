import { describe, it, expect } from 'vitest';
import { planProVyber, coZbyvaStocit, vychoziDenCoStocit, chybiMimoVyber } from './coStocit';
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

describe('chybiMimoVyber — schodek, který denní pohled schovává', () => {
  // Přesně případ z provozu 22. 9. 2026: sklad ukazuje −1, ale „Co stočit
  // na středu" tvrdí, že je vše stočené, protože ten chybějící sud visí
  // na jiném dni / na objednávce bez dne dovozu.
  const plans = [
    den('po', [polozka('a__k30', 'Světlá 12', 3, 0)]),
    den('st', [polozka('a__k30', 'Světlá 12', 5, 0)]),
    den('bez', [polozka('a__k30', 'Světlá 12', 1, 1)]),
  ];

  it('den, kde je hotovo, přesto nahlásí schodek jinde v týdnu', () => {
    expect(planProVyber(plans, 'st', 'T').totalMissing).toBe(0);
    expect(chybiMimoVyber(plans, 'st')).toBe(1);
  });

  it('u výběru „tyden" nehlásí nic navíc — celý týden je vidět', () => {
    expect(chybiMimoVyber(plans, 'tyden')).toBe(0);
  });

  it('když nikde nic nechybí, je to nula', () => {
    const hotovo = [den('po', [polozka('a__k30', 'Světlá 12', 3, 0)])];
    expect(chybiMimoVyber(hotovo, 'po')).toBe(0);
    expect(chybiMimoVyber(hotovo, 'tyden')).toBe(0);
  });

  it('odečte jen vybraný den, zbytek týdne zůstává', () => {
    const p2 = [
      den('po', [polozka('a__k30', 'Světlá 12', 3, 2)]),
      den('st', [polozka('a__k30', 'Světlá 12', 5, 3)]),
    ];
    expect(chybiMimoVyber(p2, 'po')).toBe(3);
    expect(chybiMimoVyber(p2, 'st')).toBe(2);
  });
});
