// Detail objednávky: smazání řádku, který už je odepsaný ze skladu.
// Z provozu 16. 10. 2026: zdvojený „Jantar 1,5 l × 5" v objednávce Restaurace na
// 12. 10. šel smazat jen na oko — zavezená položka drží odpočet ze skladu
// (cizí klíč), DELETE spadl a řádek v databázi zůstal. Odpočet z tohoto týdne se
// teď smaže spolu s řádkem (po potvrzení), starší zůstává (pravidlo z 29. 9.:
// uzavřená inventura se nerozhází — lib/smazaniRadku.ts).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  /** Odpočty ze skladu: order_item_id → řádky odpočtu. */
  odpocty: {} as Record<string, { deduct_date: string; quantity: number }[]>,
  /** Příkazy do databáze v pořadí, jak došly. */
  kroky: [] as string[],
  chybaNacteni: null as null | { message: string },
  chybaRpc: null as null | { message: string },
  /** Chyba, kterou vrátí mazání řádku, když už není co ho drží (null = povede se). */
  chybaMazaniBezOdpoctu: null as null | { code?: string; message: string },
  chybaMazaniPoOdpoctu: null as null | { message: string },
  potvrd: vi.fn(),
  chyba: vi.fn(),
  uspech: vi.fn(),
  oznam: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('../../lib/supabase', async (puvodni) => {
  const skutecny = await puvodni<typeof import('../../lib/supabase')>();
  // Ostatní dotazy komponent v okně detailu (poznámky, fotky, …): cokoli se zřetězí, čeká se na prázdný výsledek.
  const retez = (): any => new Proxy({}, {
    get: (_t, vlastnost) => (vlastnost === 'then'
      ? (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok)
      : () => retez()),
  });
  return {
    ...skutecny,
    fetchAllRows: (tabulka: string) => {
      let id = '';
      const q: any = {
        eq: (_k: string, v: string) => { id = v; return q; },
        then: (ok: (r: unknown) => unknown) => {
          h.kroky.push(`nacti ${tabulka} ${id}`);
          return Promise.resolve({ data: h.chybaNacteni ? null : (h.odpocty[id] ?? []), error: h.chybaNacteni }).then(ok);
        },
      };
      return q;
    },
    supabase: {
      rpc: async (fn: string, args: { p_order_item_id?: string }) => {
        h.kroky.push(`rpc ${fn} ${args.p_order_item_id ?? ''}`);
        if (fn === 'smaz_odpocty_polozky' && !h.chybaRpc) delete h.odpocty[args.p_order_item_id!];
        return { data: null, error: fn === 'smaz_odpocty_polozky' ? h.chybaRpc : null };
      },
      from: (tabulka: string) => ({
        delete: () => ({
          eq: async (_k: string, id: string) => {
            h.kroky.push(`delete ${tabulka} ${id}`);
            if (tabulka !== 'order_items') return { error: null };
            // zavezený řádek drží odpočet (cizí klíč ON DELETE RESTRICT)
            if ((h.odpocty[id] ?? []).length > 0) {
              return { error: { code: '23503', message: 'update or delete on table "order_items" violates foreign key constraint "zavoz_deductions_order_item_id_fkey" on table "zavoz_deductions"' } };
            }
            return { error: h.kroky.some((k) => k.startsWith('rpc smaz_odpocty_polozky')) ? h.chybaMazaniPoOdpoctu : h.chybaMazaniBezOdpoctu };
          },
        }),
        select: () => retez(), insert: () => retez(), update: () => retez(), upsert: () => retez(),
      }),
    },
  };
});
vi.mock('../../lib/toast', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/toast')>()),
  potvrd: h.potvrd, chyba: h.chyba, uspech: h.uspech, oznam: h.oznam,
}));
vi.mock('../../lib/objednavkaAudit', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/objednavkaAudit')>()),
  zapisZmenuPolozky: (...a: unknown[]) => h.audit(...a),
}));
vi.mock('../../lib/businessDate', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/businessDate')>()),
  businessDateISO: () => '2026-10-16',   // pátek, týden od pondělí 12. 10.
}));

import { OrderDetail } from './OrderDetail';
import type { Order, OrderItem } from './spolecne';

const OBJEDNAVKA: Order = {
  id: 'o-rest-12', order_date: '2026-10-13', place_id: 'p-rest', place_name: 'Restaurace',
  source: 'fotka', status: 'nova', note: null, created_at: '2026-10-13T09:37:00+00:00',
  delivery_day: 'po', delivery_date: '2026-10-12', is_prepared: false, is_packaged: false,
  is_delivered: true, delivered_at: null,
};
const jantar = (id: string): OrderItem => ({
  id, order_id: 'o-rest-12', beer_id: 'beer-jan', beer_name: 'Jantar', package_id: 'pkg-15',
  package_label: 'PET 1,5 l', quantity: 5, is_prepared: false, is_bottled: false,
});
const POLOZKY = [jantar('i-puvodni'), jantar('i-zdvojeny')];
const PIVA = [{ id: 'beer-jan', name: 'Jantar', is_active: true, sort_order: 1 }];
const OBALY = [{ id: 'pkg-15', label: 'PET 1,5 l', kind: 'bottle', volume_l: 1.5, sort_order: 1 }];

const onChanged = vi.fn();

function otevri(polozky: OrderItem[] = POLOZKY) {
  return render(
    <OrderDetail
      order={OBJEDNAVKA} items={polozky} beers={PIVA as any} packages={OBALY as any} places={[]} priceList={[]}
      remaining={new Map()} onClose={vi.fn()} onChanged={onChanged} onSplit={vi.fn()} onToggleFlag={vi.fn()}
      onToggleItemFlag={vi.fn()} onImportImage={vi.fn()} setItems={vi.fn()} allOrders={[OBJEDNAVKA]}
      allItems={{ 'o-rest-12': polozky }} weekKey="2026-42" setWeekKey={vi.fn()}
    />,
  );
}

/** Klepne na × u druhého (zdvojeného) řádku; v DOM je řádek dvakrát (mobilní karty a tabulka), bere se první. */
async function smazZdvojeny() {
  const kriz = screen.getAllByRole('button', { name: '×' });
  await act(async () => { fireEvent.click(kriz[1]); });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.kroky.length = 0;
  h.odpocty = {
    'i-puvodni': [{ deduct_date: '2026-10-12', quantity: 5 }],
    'i-zdvojeny': [{ deduct_date: '2026-10-12', quantity: 5 }],
  };
  h.chybaNacteni = null;
  h.chybaRpc = null;
  h.chybaMazaniBezOdpoctu = null;
  h.chybaMazaniPoOdpoctu = null;
  h.potvrd.mockReset();
  h.potvrd.mockResolvedValue(true);
});

describe('smazání řádku v detailu objednávky', () => {
  it('řádek, který nic nedrží, se smaže hned — bez dotazu a bez sahání na odpočty', async () => {
    h.odpocty = {};
    otevri();
    await smazZdvojeny();
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(h.kroky).toEqual(['delete order_items i-zdvojeny']);
    expect(h.potvrd).not.toHaveBeenCalled();
    expect(h.audit).toHaveBeenCalledWith('o-rest-12', 'delete', expect.objectContaining({ id: 'i-zdvojeny' }), null);
  });

  it('zavezený řádek z tohoto týdne: zeptá se a po souhlasu smaže odpočet a pak řádek; sklad se vrátí o 5 ks', async () => {
    otevri();
    await smazZdvojeny();

    await waitFor(() => expect(h.potvrd).toHaveBeenCalledTimes(1));
    const [text, nastaveni] = h.potvrd.mock.calls[0];
    expect(text).toContain('Řádek „5× Jantar PET 1,5 L" je už zavezený a odepsaný ze skladu (5 ks).');
    expect(text).toContain('Sklad se vrátí o 5 ks');
    expect(text).toContain('uzavřenou inventuru to nerozhází');
    expect(nastaveni).toEqual({ titulek: 'Smazat odepsaný řádek', potvrdit: 'Smazat i s odpočtem', nebezpecne: true });

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    // první pokus spadne na cizím klíči, pak se přečtou odpočty, smažou se a řádek se smaže znovu
    expect(h.kroky).toEqual([
      'delete order_items i-zdvojeny',
      'nacti zavoz_deductions i-zdvojeny',
      'rpc smaz_odpocty_polozky i-zdvojeny',
      'delete order_items i-zdvojeny',
    ]);
    expect(h.uspech).toHaveBeenCalledWith('Řádek smazán, sklad se vrátil o 5 ks.');
    expect(h.audit).toHaveBeenCalledWith('o-rest-12', 'delete', expect.objectContaining({ id: 'i-zdvojeny', quantity: 5 }), null);
    expect(h.chyba).not.toHaveBeenCalled();
    // odpočet původního řádku zůstal, smazal se jen ten zdvojený
    expect(h.odpocty['i-puvodni']).toHaveLength(1);
    expect(h.odpocty['i-zdvojeny']).toBeUndefined();
  });

  it('bez souhlasu se nic nezmění: odpočet i řádek zůstanou', async () => {
    h.potvrd.mockResolvedValue(false);
    otevri();
    await smazZdvojeny();
    await waitFor(() => expect(h.potvrd).toHaveBeenCalledTimes(1));
    expect(h.kroky).toEqual(['delete order_items i-zdvojeny', 'nacti zavoz_deductions i-zdvojeny']);
    expect(h.odpocty['i-zdvojeny']).toHaveLength(1);
    expect(onChanged).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
    expect(h.uspech).not.toHaveBeenCalled();
  });

  it('odpočet z uplynulého týdne (Restaurace z 11. 10.) zůstává: žádný dotaz, vysvětlení co dělat místo toho', async () => {
    h.odpocty['i-zdvojeny'] = [{ deduct_date: '2026-10-11', quantity: 5 }];
    otevri();
    await smazZdvojeny();
    await waitFor(() => expect(h.chyba).toHaveBeenCalledTimes(1));
    const text = h.chyba.mock.calls[0][0] as string;
    expect(text).toContain('odepsaný ze skladu už 11. 10.');
    expect(text).toContain('odpočet z uplynulého týdne zůstává');
    expect(text).toContain('Zruš celou objednávku');
    expect(text).toContain('Vrácení piva');
    expect(h.potvrd).not.toHaveBeenCalled();
    expect(h.kroky.some((k) => k.startsWith('rpc'))).toBe(false);
    expect(h.odpocty['i-zdvojeny']).toHaveLength(1);
  });

  it('jedna z odpočtových řádek je stará → nesmaže se nic', async () => {
    h.odpocty['i-zdvojeny'] = [{ deduct_date: '2026-10-13', quantity: 2 }, { deduct_date: '2026-10-05', quantity: 3 }];
    otevri();
    await smazZdvojeny();
    await waitFor(() => expect(h.chyba).toHaveBeenCalledTimes(1));
    expect(h.potvrd).not.toHaveBeenCalled();
    expect(h.kroky.some((k) => k.startsWith('rpc'))).toBe(false);
  });

  it('odpočty se nepodařilo načíst → chyba, ne smazání naslepo', async () => {
    h.chybaNacteni = { message: 'fetch failed' };
    otevri();
    await smazZdvojeny();
    await waitFor(() => expect(h.chyba).toHaveBeenCalledTimes(1));
    expect(h.chyba.mock.calls[0][0]).toContain('odpočty se nepodařilo načíst: fetch failed');
    expect(h.potvrd).not.toHaveBeenCalled();
    expect(h.kroky.some((k) => k.startsWith('rpc'))).toBe(false);
  });

  it('smazání odpočtu selhalo → řádek se nesahá, chyba je vidět', async () => {
    h.chybaRpc = { message: 'Nemas opravneni upravovat objednavky' };
    otevri();
    await smazZdvojeny();
    await waitFor(() => expect(h.chyba).toHaveBeenCalledTimes(1));
    expect(h.chyba.mock.calls[0][0]).toBe('Odpočet ze skladu se nepodařilo smazat: Nemas opravneni upravovat objednavky');
    // po neúspěšném odpočtu se řádek znovu nemaže (jen ten první pokus)
    expect(h.kroky.filter((k) => k.startsWith('delete order_items'))).toHaveLength(1);
    expect(h.uspech).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('odpočet je pryč, ale řádek ne → hlášení to řekne a seznam se přenačte', async () => {
    h.chybaMazaniPoOdpoctu = { message: 'timeout' };
    otevri();
    await smazZdvojeny();
    await waitFor(() => expect(h.chyba).toHaveBeenCalledTimes(1));
    expect(h.chyba.mock.calls[0][0]).toContain('Odpočet ze skladu je smazaný, ale řádek se smazat nepodařilo (timeout)');
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(h.uspech).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('jiná chyba než cizí klíč (oprávnění, síť) se nevydává za „je odepsaný" a nic nenabízí', async () => {
    h.odpocty = {};
    h.chybaMazaniBezOdpoctu = { code: '42501', message: 'permission denied for table order_items' };
    otevri();
    await smazZdvojeny();
    await waitFor(() => expect(h.chyba).toHaveBeenCalledTimes(1));
    expect(h.chyba.mock.calls[0][0]).toBe('Položku se nepodařilo smazat: permission denied for table order_items');
    expect(h.potvrd).not.toHaveBeenCalled();
    expect(h.kroky).toEqual(['delete order_items i-zdvojeny']);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('cizí klíč, ale žádný odpočet položky nenalezen → chyba s původním textem, nic se nemaže', async () => {
    h.odpocty = {};
    h.chybaMazaniBezOdpoctu = { code: '23503', message: 'violates foreign key constraint "neco_jineho"' };
    otevri();
    await smazZdvojeny();
    await waitFor(() => expect(h.chyba).toHaveBeenCalledTimes(1));
    expect(h.chyba.mock.calls[0][0]).toContain('drží ji jiný záznam v databázi');
    expect(h.chyba.mock.calls[0][0]).toContain('neco_jineho');
    expect(h.potvrd).not.toHaveBeenCalled();
    expect(h.kroky.some((k) => k.startsWith('rpc'))).toBe(false);
  });
});
