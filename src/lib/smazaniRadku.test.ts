// Smazání řádku objednávky, který už je odepsaný ze skladu (lib/smazaniRadku.ts).
// Z provozu 16. 10. 2026: zdvojený „Jantar 1,5 l × 5" v objednávce Restaurace na
// 12. 10. šel smazat jen na oko — zavezená položka drží odpočet (cizí klíč).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  kroky: [] as string[],
  dotaz: null as null | { tabulka: string; sloupce: string; filtry: [string, unknown][] },
  odpocty: [] as unknown[],
  chybaNacteni: null as null | { message: string },
  chybaRpc: null as null | { message: string },
  chybaMazani: null as null | { message: string },
}));

vi.mock('./supabase', () => ({
  fetchAllRows: (tabulka: string, sloupce: string) => {
    const dotaz = { tabulka, sloupce, filtry: [] as [string, unknown][] };
    h.dotaz = dotaz;
    const q: any = {
      eq: (k: string, v: unknown) => { dotaz.filtry.push([k, v]); return q; },
      then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: h.chybaNacteni ? null : h.odpocty, error: h.chybaNacteni }).then(ok),
    };
    return q;
  },
  supabase: {
    rpc: async (fn: string, args: { p_order_item_id: string }) => { h.kroky.push(`rpc ${fn} ${args.p_order_item_id}`); return { error: h.chybaRpc }; },
    from: (t: string) => ({
      delete: () => ({ eq: async (k: string, v: string) => { h.kroky.push(`delete ${t} ${k}=${v}`); return { error: h.chybaMazani }; } }),
    }),
  },
}));

import { jeChybaOdpoctu, nactiOdpoctyRadku, planSmazaniOdepsaneho, smazRadekSOdpoctem } from './smazaniRadku';

beforeEach(() => {
  h.kroky.length = 0;
  h.dotaz = null;
  h.odpocty = [];
  h.chybaNacteni = null;
  h.chybaRpc = null;
  h.chybaMazani = null;
});

describe('jeChybaOdpoctu', () => {
  it('cizí klíč (kód 23503, nebo text o cizím klíči či odpočtech) je to, co řádek drží', () => {
    expect(jeChybaOdpoctu({ code: '23503', message: 'x' })).toBe(true);
    expect(jeChybaOdpoctu({ message: 'update or delete on table "order_items" violates foreign key constraint "zavoz_deductions_order_item_id_fkey"' })).toBe(true);
    expect(jeChybaOdpoctu({ message: 'zavoz_deductions drží položku' })).toBe(true);
  });

  it('jiná chyba (síť, oprávnění) a žádná chyba ne', () => {
    expect(jeChybaOdpoctu({ code: '42501', message: 'permission denied for table order_items' })).toBe(false);
    expect(jeChybaOdpoctu({ message: 'Failed to fetch' })).toBe(false);
    expect(jeChybaOdpoctu({})).toBe(false);
    expect(jeChybaOdpoctu(null)).toBe(false);
    expect(jeChybaOdpoctu(undefined)).toBe(false);
  });
});

describe('planSmazaniOdepsaneho', () => {
  // čtvrtek 15. 10. 2026 → týden od pondělí 12. 10., měsíc říjen
  const DNES = '2026-10-15';

  it('Jantar z pondělí tohoto týdne: smí se smazat s odpočtem, vrátí se 5 ks', () => {
    expect(planSmazaniOdepsaneho([{ deduct_date: '2026-10-12', quantity: 5 }], DNES)).toEqual({ druh: 'smazat', kusu: 5 });
  });

  it('pondělí je ještě tento týden, neděle před ním už ne (hranice týdne)', () => {
    expect(planSmazaniOdepsaneho([{ deduct_date: '2026-10-12', quantity: 1 }], '2026-10-18')).toEqual({ druh: 'smazat', kusu: 1 });
    expect(planSmazaniOdepsaneho([{ deduct_date: '2026-10-11', quantity: 1 }], DNES)).toEqual({ druh: 'uzavreny', nejstarsi: '2026-10-11' });
  });

  it('Restaurace z neděle 11. 10. je z uplynulého týdne → odpočet zůstává', () => {
    expect(planSmazaniOdepsaneho([{ deduct_date: '2026-10-11', quantity: 1 }], DNES)).toEqual({ druh: 'uzavreny', nejstarsi: '2026-10-11' });
  });

  it('odpočet z budoucna (zítřek, po přehození dne závozu) se smazat smí', () => {
    expect(planSmazaniOdepsaneho([{ deduct_date: '2026-10-16', quantity: 2 }], DNES)).toEqual({ druh: 'smazat', kusu: 2 });
  });

  it('týden přes přelom měsíců: odpočet z minulého měsíce je starý, i když leží v tomto týdnu (měsíc může být už uzavřený)', () => {
    // neděle 1. 11. 2026 → týden začal v pondělí 26. 10.; odpočet z 28. 10. je v tomhle týdnu, ale v říjnu
    expect(planSmazaniOdepsaneho([{ deduct_date: '2026-10-28', quantity: 1 }], '2026-11-01')).toEqual({ druh: 'uzavreny', nejstarsi: '2026-10-28' });
    // odpočet z 1. 11. je z tohoto týdne i měsíce
    expect(planSmazaniOdepsaneho([{ deduct_date: '2026-11-01', quantity: 1 }], '2026-11-01')).toEqual({ druh: 'smazat', kusu: 1 });
    // odpočet z minulého týdne i měsíce je starý a hlásí se jeho den
    expect(planSmazaniOdepsaneho([{ deduct_date: '2026-10-30', quantity: 1 }], '2026-11-08')).toEqual({ druh: 'uzavreny', nejstarsi: '2026-10-30' });
  });

  it('víc odpočtů: stačí jeden starý a nesmaže se nic; jinak se kusy sečtou (i z textu)', () => {
    expect(planSmazaniOdepsaneho([{ deduct_date: '2026-10-13', quantity: 2 }, { deduct_date: '2026-10-05', quantity: 1 }], DNES))
      .toEqual({ druh: 'uzavreny', nejstarsi: '2026-10-05' });
    expect(planSmazaniOdepsaneho([{ deduct_date: '2026-10-13', quantity: 2 }, { deduct_date: '2026-10-14', quantity: '3' }], DNES))
      .toEqual({ druh: 'smazat', kusu: 5 });
  });

  it('hlásí se nejstarší den, i když jsou odpočty seřazené jinak', () => {
    expect(planSmazaniOdepsaneho([{ deduct_date: '2026-10-09', quantity: 1 }, { deduct_date: '2026-10-05', quantity: 1 }, { deduct_date: '2026-10-07', quantity: 1 }], DNES))
      .toEqual({ druh: 'uzavreny', nejstarsi: '2026-10-05' });
  });

  it('odpočet bez data se bere jako starý (jistota, že je z tohoto týdne, není)', () => {
    expect(planSmazaniOdepsaneho([{ deduct_date: null, quantity: 5 }], DNES)).toEqual({ druh: 'uzavreny', nejstarsi: '' });
  });

  it('datum s časem (RRRR-MM-DDThh:mm) se čte podle dne', () => {
    expect(planSmazaniOdepsaneho([{ deduct_date: '2026-10-12T00:00:00+00:00', quantity: 4 }], DNES)).toEqual({ druh: 'smazat', kusu: 4 });
    expect(planSmazaniOdepsaneho([{ deduct_date: '2026-10-11T22:00:00+00:00', quantity: 4 }], DNES)).toEqual({ druh: 'uzavreny', nejstarsi: '2026-10-11' });
  });

  it('neplatné množství se nepočítá; žádný odpočet = smazání spadlo z jiného důvodu', () => {
    expect(planSmazaniOdepsaneho([{ deduct_date: '2026-10-12', quantity: 'x' }, { deduct_date: '2026-10-12', quantity: 2 }], DNES)).toEqual({ druh: 'smazat', kusu: 2 });
    expect(planSmazaniOdepsaneho([], DNES)).toEqual({ druh: 'bez-odpoctu' });
  });
});

describe('nactiOdpoctyRadku', () => {
  it('čte jen odpočty té položky (a jen datum s množstvím)', async () => {
    h.odpocty = [{ deduct_date: '2026-10-12', quantity: 5 }];
    const r = await nactiOdpoctyRadku('item-1');
    expect(r).toEqual({ data: [{ deduct_date: '2026-10-12', quantity: 5 }], chyba: null });
    expect(h.dotaz).toEqual({ tabulka: 'zavoz_deductions', sloupce: 'deduct_date,quantity', filtry: [['order_item_id', 'item-1']] });
  });

  it('chyba čtení se vrátí jako text a data nejsou (nepovede se brát jako „žádný odpočet")', async () => {
    h.chybaNacteni = { message: 'fetch failed' };
    expect(await nactiOdpoctyRadku('item-1')).toEqual({ data: [], chyba: 'fetch failed' });
  });
});

describe('smazRadekSOdpoctem', () => {
  it('nejdřív odpočet, potom řádek (pořadí dané cizím klíčem)', async () => {
    expect(await smazRadekSOdpoctem('item-1')).toBeNull();
    expect(h.kroky).toEqual(['rpc smaz_odpocty_polozky item-1', 'delete order_items id=item-1']);
  });

  it('odpočet se nepodařilo smazat → řádek se nesahá a vrátí se důvod', async () => {
    h.chybaRpc = { message: 'Nemas opravneni upravovat objednavky' };
    expect(await smazRadekSOdpoctem('item-1')).toBe('Odpočet ze skladu se nepodařilo smazat: Nemas opravneni upravovat objednavky');
    expect(h.kroky).toEqual(['rpc smaz_odpocty_polozky item-1']);
  });

  it('odpočet je pryč, ale řádek ne → hlášení to říká a radí, co dál', async () => {
    h.chybaMazani = { message: 'timeout' };
    const text = await smazRadekSOdpoctem('item-1');
    expect(text).toContain('Odpočet ze skladu je smazaný, ale řádek se smazat nepodařilo (timeout)');
    expect(text).toContain('Zkus ho smazat znovu');
    expect(h.kroky).toEqual(['rpc smaz_odpocty_polozky item-1', 'delete order_items id=item-1']);
  });
});
