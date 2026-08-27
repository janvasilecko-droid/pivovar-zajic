import { describe, it, expect, beforeEach, vi } from 'vitest';

// Křížová kontrola „zpráva vs. objednávka" hlásila spoustu falešných nálezů.
// Tenhle test drží tři případy, kdy rozdíl NENÍ chyba čtení, a jeden, kdy je.
const h = vi.hoisted(() => ({
  DB: {
    orders: [] as any[],
    order_items: [] as any[],
    whatsapp_incoming: [] as any[],
  } as Record<string, any[]>,
}));

vi.mock('./supabase', () => {
  function makeQuery(table: string) {
    const data = h.DB[table] ?? [];
    const q: any = Promise.resolve({ data, error: null });
    q.select = vi.fn(() => q);
    q.order = vi.fn(() => q);
    q.eq = vi.fn(() => q);
    q.in = vi.fn(() => q);
    q.gte = vi.fn(() => q);
    q.lte = vi.fn(() => q);
    q.limit = vi.fn(() => q);
    q.not = vi.fn(() => q);
    q.maybeSingle = vi.fn().mockResolvedValue({ data: data[0] ?? null, error: null });
    return q;
  }
  return {
    supabase: { from: vi.fn((t: string) => makeQuery(t)) },
    // Stránkovaný protějšek supabase.from(...).select(...) — pro atrapu se
    // chová stejně, jen se volá jinak.
    fetchAllRows: vi.fn((t: string) => makeQuery(t)),
  };
});

vi.mock('./orderParser', () => ({
  // Kdyby se záložní přeparsování textu někdy vrátilo, tenhle mock ho
  // prozradí: vrátí položku, kterou objednávka nemá.
  parseFreeTextEntries: vi.fn(() => [
    { beer_id: 'b-cizi', package_id: 'p-30', quantity: 99 },
  ]),
  emptyAliasMap: vi.fn(() => ({})),
  loadAliasMap: vi.fn().mockResolvedValue({}),
}));

const { runOrderAudit } = await import('./orderAudit');

const BEERS = [{ id: 'b-11', name: '11° Světlá' }, { id: 'b-cizi', name: 'Cizí pivo' }] as any;
const PACKAGES = [{ id: 'p-30', label: 'KEG 30 l' }] as any;

const ZPRAVA_CAS = '2026-08-20T08:00:00.000Z';

function nastav({
  polozkaCas = ZPRAVA_CAS,
  parsedItems = [{ beer_id: 'b-11', pkg_id: 'p-30', qty: 3 }] as any,
  mnozstviVObjednavce = 3,
  dodatek = false,
}) {
  h.DB.whatsapp_incoming = [
    {
      id: 'msg-1', sender_name: 'Objednávky pivovar', created_at: ZPRAVA_CAS,
      message_text: '3 sudy 11', parsed_raw_text: '3 sudy 11',
      status: 'imported', parsed_items: parsedItems,
    },
    ...(dodatek
      ? [{ id: 'msg-2', sender_name: 'Objednávky pivovar', created_at: '2026-08-20T09:00:00.000Z', message_text: 'ještě dva', status: 'imported', amends_message_id: 'msg-1', parsed_items: [] }]
      : []),
  ];
  h.DB.orders = [{
    id: 'ord-1', place_name: 'Hospoda U Lípy', order_date: '2026-08-20',
    delivery_date: '2026-08-22', status: 'nova', whatsapp_message_id: 'msg-1',
    created_at: ZPRAVA_CAS,
  }];
  h.DB.order_items = [{
    id: 'it-1', order_id: 'ord-1', beer_id: 'b-11', package_id: 'p-30',
    quantity: mnozstviVObjednavce, created_at: polozkaCas,
  }];
}

async function nesouladu() {
  const zprava = await runOrderAudit({ beers: BEERS, packages: PACKAGES });
  return zprava.whatsappMismatches ?? (zprava as any).whatsappMismatchIssues ?? [];
}

describe('křížová kontrola zprávy a objednávky — falešné nálezy', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('skutečný nesoulad nahlásí: ve zprávě 3 sudy, v objednávce 5', async () => {
    nastav({ mnozstviVObjednavce: 5 });
    const v = await nesouladu();
    expect(v).toHaveLength(1);
    expect(v[0].mismatches[0]).toMatchObject({ kind: 'qty_diff', expectedQty: 3, actualQty: 5 });
  });

  it('sedící objednávku nehlásí', async () => {
    nastav({});
    expect(await nesouladu()).toEqual([]);
  });

  it('ručně opravenou objednávku nehlásí — oprava po importu není chyba čtení', async () => {
    // Položka vznikla o dvě hodiny později než objednávka: někdo ji doplnil ručně.
    nastav({ mnozstviVObjednavce: 5, polozkaCas: '2026-08-20T10:00:00.000Z' });
    expect(await nesouladu()).toEqual([]);
  });

  it('objednávku s dodatkem nehlásí — navazující zpráva ji legitimně mění', async () => {
    nastav({ mnozstviVObjednavce: 5, dodatek: true });
    expect(await nesouladu()).toEqual([]);
  });

  it('bez uloženého rozboru od AI se neporovnává — parser není měřítko', async () => {
    // parsed_items chybí. Dřív se text přeparsoval lokálním parserem (mock výše
    // vrací cizí pivo × 99) a rozdíl se vydával za chybu čtení.
    nastav({ parsedItems: null });
    expect(await nesouladu()).toEqual([]);
  });
});
