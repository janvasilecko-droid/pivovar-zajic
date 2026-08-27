// Fronta offline zápisů — smlouva, na které stojí, že se ve sklepě nebo
// v autě neztratí zápis.
//
// Testuje se hlavně chování při přehrávání: pořadí, úklid po úspěchu
// a co se stane, když jeden zápis selže. Ta druhá věc už jednou způsobila
// škodu — položka se ze fronty mazala až po celé dávce, takže reload
// uprostřed synchronizace poslal objednávku podruhé.
import { describe, it, expect, beforeEach, vi } from 'vitest';

// supabase.ts si při importu sahá na prohlížeč a na síť; fronta ho potřebuje
// jen kvůli přehrání, takže se nahradí atrapou, kterou si test řídí.
const volani: { table: string; op: string; row?: any; match?: any }[] = [];
let odpoved: (t: string, op: string) => { error: any } = () => ({ error: null });

vi.mock('./supabase', () => {
  const builder = (table: string, op: string, row?: any) => {
    const match: Record<string, any> = {};
    const b: any = {
      eq(k: string, v: any) { match[k] = v; return b; },
      in(k: string, v: any) { match[k] = v; return b; },
      then(res: any) {
        volani.push({ table, op, row, match });
        return Promise.resolve(odpoved(table, op)).then(res);
      },
    };
    return b;
  };
  return {
    supabase: {
      from: (table: string) => ({
        insert: (row: any) => builder(table, 'insert', row),
        upsert: (row: any) => builder(table, 'upsert', row),
        update: (row: any) => builder(table, 'update', row),
        delete: () => builder(table, 'delete'),
      }),
    },
  };
});

import { enqueue, getQueue, queueLength, clearQueue, removeOp, syncQueue, getLastSyncFailures, popisOperace } from './offline';

beforeEach(() => {
  localStorage.clear();
  volani.length = 0;
  odpoved = () => ({ error: null });
  clearQueue();
});

describe('fronta', () => {
  it('zápis přežije zavření aplikace — drží se v localStorage', () => {
    enqueue({ table: 'orders', op: 'insert', row: { id: 'o1' } });
    expect(queueLength()).toBe(1);
    // Nové načtení stránky = nová paměť, ale localStorage zůstává.
    expect(JSON.parse(localStorage.getItem('pivovar_offline_queue_v1')!)).toHaveLength(1);
  });

  it('drží pořadí, v jakém se zapisovalo', () => {
    enqueue({ table: 'orders', op: 'insert', row: { id: 'o1' } });
    enqueue({ table: 'order_items', op: 'insert', row: { id: 'i1', order_id: 'o1' } });
    expect(getQueue().map((o) => o.table)).toEqual(['orders', 'order_items']);
  });

  it('poškozený obsah v localStorage frontu nezabije', () => {
    localStorage.setItem('pivovar_offline_queue_v1', '{tohle není JSON');
    expect(queueLength()).toBe(0);
    enqueue({ table: 'orders', op: 'insert', row: { id: 'o1' } });
    expect(queueLength()).toBe(1);
  });
});

describe('přehrání fronty', () => {
  it('odešle zápisy v pořadí a frontu vyprázdní', async () => {
    enqueue({ table: 'orders', op: 'insert', row: { id: 'o1' } });
    enqueue({ table: 'order_items', op: 'insert', row: { id: 'i1', order_id: 'o1' } });

    const r = await syncQueue();

    expect(volani.map((v) => v.table)).toEqual(['orders', 'order_items']);
    expect(r).toEqual({ ok: 2, failed: 0, remaining: 0 });
    expect(queueLength()).toBe(0);
  });

  it('objednávka se pošle právě jednou — položka mizí hned po úspěchu', async () => {
    // Kdyby se fronta uklízela až po celé dávce, přerušení uprostřed
    // (reload po „je tu nová verze") by nechalo uloženou objednávku ve
    // frontě a příští synchronizace by ji poslala podruhé.
    enqueue({ table: 'orders', op: 'insert', row: { id: 'o1' } });
    enqueue({ table: 'orders', op: 'insert', row: { id: 'o2' } });

    odpoved = () => {
      // Po prvním úspěchu se podíváme, jestli už je fronta kratší.
      return { error: null };
    };
    await syncQueue();
    expect(queueLength()).toBe(0);

    // Druhé kolo už nemá co posílat.
    volani.length = 0;
    await syncQueue();
    expect(volani).toHaveLength(0);
  });

  it('jeden neúspěch nezahodí ostatní zápisy', async () => {
    enqueue({ table: 'orders', op: 'insert', row: { id: 'o1' } });
    enqueue({ table: 'kegging', op: 'insert', row: { id: 'k1' } });

    odpoved = (t) => (t === 'orders' ? { error: { message: 'duplicate key' } } : { error: null });

    const r = await syncQueue();

    expect(r.ok).toBe(1);
    expect(r.failed).toBe(1);
    // Neúspěšný zůstává ve frontě, aby se dal poslat znovu; úspěšný ne.
    expect(getQueue().map((o) => o.table)).toEqual(['orders']);
  });

  it('řekne, PROČ zápis uvízl — ne jen že selhal', async () => {
    enqueue({ table: 'orders', op: 'insert', row: { id: 'o1' } });
    odpoved = () => ({ error: { message: 'duplicate key value violates unique constraint' } });

    await syncQueue();

    const chyby = getLastSyncFailures();
    expect(chyby).toHaveLength(1);
    expect(chyby[0].table).toBe('orders');
    expect(chyby[0].error).toContain('duplicate key');
    // Podle id se dá konkrétní zápis zahodit, aniž by se smazaly ostatní.
    expect(chyby[0].id).toBe(getQueue()[0].id);
  });

  it('trvale rozbitý zápis jde zahodit sám o sobě', async () => {
    enqueue({ table: 'orders', op: 'insert', row: { id: 'o1' } });
    enqueue({ table: 'kegging', op: 'insert', row: { id: 'k1' } });
    odpoved = (t) => (t === 'orders' ? { error: { message: 'trvalá chyba' } } : { error: null });

    await syncQueue();
    const spatny = getLastSyncFailures()[0];
    removeOp(spatny.id);

    expect(queueLength()).toBe(0);
  });

  it('update a delete si nesou podmínku, aby se zopakovaly na správný řádek', async () => {
    enqueue({ table: 'orders', op: 'update', match: { id: 'o1' }, row: { status: 'nova' } });
    enqueue({ table: 'bottling', op: 'delete', match: { id: 'b1' } });

    await syncQueue();

    expect(volani[0]).toMatchObject({ table: 'orders', op: 'update', match: { id: 'o1' } });
    expect(volani[1]).toMatchObject({ table: 'bottling', op: 'delete', match: { id: 'b1' } });
  });

  it('výjimka ze sítě se počítá jako neúspěch, ne jako ztráta', async () => {
    enqueue({ table: 'orders', op: 'insert', row: { id: 'o1' } });
    odpoved = () => { throw new Error('Failed to fetch'); };

    const r = await syncQueue();

    expect(r.failed).toBe(1);
    expect(queueLength()).toBe(1);
    expect(getLastSyncFailures()[0].error).toContain('Failed to fetch');
  });
});

describe('důvod neúspěchu přežije restart aplikace', () => {
  it('po znovunačtení je pořád vidět, proč zápis uvízl', async () => {
    enqueue({ table: 'orders', op: 'insert', row: { id: 'o1' } });
    odpoved = () => ({ error: { message: 'duplicate key' } });
    await syncQueue();

    // Restart telefonu = nová paměť modulu, localStorage zůstává. Dřív se
    // chyby držely jen v proměnné, takže po restartu vypadal uvízlý zápis
    // jako každý jiný čekající a nešel zahodit.
    expect(JSON.parse(localStorage.getItem('pivovar_offline_chyby_v1')!)).toHaveLength(1);
  });

  it('chyba ke smazanému zápisu se nedrží', async () => {
    enqueue({ table: 'orders', op: 'insert', row: { id: 'o1' } });
    odpoved = () => ({ error: { message: 'duplicate key' } });
    await syncQueue();

    removeOp(getQueue()[0].id);

    expect(getLastSyncFailures()).toEqual([]);
  });

  it('vyprázdnění fronty smaže i chyby', async () => {
    enqueue({ table: 'orders', op: 'insert', row: { id: 'o1' } });
    odpoved = () => ({ error: { message: 'duplicate key' } });
    await syncQueue();

    clearQueue();

    expect(getLastSyncFailures()).toEqual([]);
  });
});

describe('popisOperace', () => {
  it('řekne česky, o jaký zápis jde', () => {
    expect(popisOperace({
      id: 'x', ts: 0, table: 'kegging', op: 'insert',
      row: { beer_name: '12° Světlý ležák', package_label: '50 l', quantity: 3, entry_date: '2026-08-27' },
    })).toBe('Stáčení KEG — nový zápis: 12° Světlý ležák · 50 l · 3 ks · 2026-08-27');
  });

  it('u objednávky ukáže odběratele', () => {
    expect(popisOperace({
      id: 'x', ts: 0, table: 'orders', op: 'update', row: { place_name: 'Bar U Sadu' },
    })).toBe('Objednávka — úprava: Bar U Sadu');
  });

  it('bez podrobností zůstane aspoň název', () => {
    expect(popisOperace({ id: 'x', ts: 0, table: 'bottling', op: 'delete' }))
      .toBe('Stáčení lahví — smazání');
  });

  it('neznámou tabulku nezamlčí', () => {
    expect(popisOperace({ id: 'x', ts: 0, table: 'neco_noveho', op: 'insert' }))
      .toBe('neco_noveho — nový zápis');
  });
});
