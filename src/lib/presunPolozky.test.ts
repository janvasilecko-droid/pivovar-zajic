import { describe, it, expect } from 'vitest';
import { naplanujPresun, type PolozkaKPresunu } from './presunPolozky';

// Radkova objednávka: deset třicítek na čtvrtek, den si nese objednávka.
const RADEK: PolozkaKPresunu = {
  id: 'item-1',
  order_id: 'obj-1',
  beer_id: 'pivo-11',
  beer_name: '11° Světlá',
  package_id: 'keg30',
  package_label: 'KEG 30l',
  quantity: 10,
  delivery_day: null,
};

describe('naplanujPresun', () => {
  it('část řádku se rozdělí — původní zůstane, nový odejde na jiný den', () => {
    const plan = naplanujPresun(RADEK, 'st', 4, 'ct');
    expect(plan.druh).toBe('rozdeleni');
    if (plan.druh !== 'rozdeleni') return;
    expect(plan.zmensit).toEqual({ id: 'item-1', quantity: 6 });
    expect(plan.zalozit.quantity).toBe(4);
    expect(plan.zalozit.delivery_day).toBe('st');
    expect(plan.zalozit.order_id).toBe('obj-1');
  });

  it('při rozdělení se nesmí ztratit ani přibýt sud', () => {
    // Tohle je to podstatné. Kdyby se počty rozešly, plán by žádal stočit
    // víc nebo míň, než je objednané — a přišlo by se na to až u závozu.
    for (const kusu of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const plan = naplanujPresun(RADEK, 'st', kusu, 'ct');
      if (plan.druh !== 'rozdeleni') throw new Error(`${kusu} ks: čekal jsem rozdělení`);
      expect(plan.zmensit.quantity + plan.zalozit.quantity).toBe(RADEK.quantity);
    }
  });

  it('celý řádek se jen přeznačí, nezakládá se druhý', () => {
    const plan = naplanujPresun(RADEK, 'st', 10, 'ct');
    expect(plan).toEqual({ druh: 'cely', id: 'item-1', delivery_day: 'st' });
  });

  it('původní řádek si vždycky drží své id — na něm visí odpočty závozu', () => {
    const cely = naplanujPresun(RADEK, 'st', 10, 'ct');
    const del = naplanujPresun(RADEK, 'st', 4, 'ct');
    if (cely.druh !== 'cely' || del.druh !== 'rozdeleni') throw new Error('jiný druh plánu');
    expect(cely.id).toBe(RADEK.id);
    expect(del.zmensit.id).toBe(RADEK.id);
    // Nový řádek žádné id nedostává — přidělí ho databáze.
    expect('id' in del.zalozit).toBe(false);
  });

  it('vrácení zpět pod den objednávky', () => {
    const presunuty: PolozkaKPresunu = { ...RADEK, delivery_day: 'st', quantity: 4 };
    expect(naplanujPresun(presunuty, null, 4, 'st')).toEqual({
      druh: 'cely', id: 'item-1', delivery_day: null,
    });
  });

  it('nesmyslný přesun se neprovede', () => {
    expect(naplanujPresun(RADEK, 'st', 0, 'ct').druh).toBe('nic');
    expect(naplanujPresun(RADEK, 'st', -3, 'ct').druh).toBe('nic');
    expect(naplanujPresun(RADEK, 'st', 11, 'ct').druh).toBe('nic');
    expect(naplanujPresun({ ...RADEK, quantity: 0 }, 'st', 1, 'ct').druh).toBe('nic');
  });

  it('přesun na den, kde řádek už stojí, nic nedělá', () => {
    // Jinak by z deseti sudů na čtvrtku vznikly dva řádky po čtvrtku a
    // v plánu by to vypadalo jako dvě objednávky.
    expect(naplanujPresun(RADEK, 'ct', 4, 'ct').druh).toBe('nic');
    const presunuty: PolozkaKPresunu = { ...RADEK, delivery_day: 'st' };
    expect(naplanujPresun(presunuty, 'st', 4, 'st').druh).toBe('nic');
    expect(naplanujPresun(RADEK, null, 4, 'ct').druh).toBe('nic');
  });

  it('desetinný počet se ořízne dolů, ne nahoru', () => {
    // Nahoru by se dalo přesunout víc, než na řádku je.
    const plan = naplanujPresun(RADEK, 'st', 3.9, 'ct');
    if (plan.druh !== 'rozdeleni') throw new Error('čekal jsem rozdělení');
    expect(plan.zalozit.quantity).toBe(3);
    expect(plan.zmensit.quantity).toBe(7);
  });
});
