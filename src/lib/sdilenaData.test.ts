// Paměť sdílená mezi obrazovkami (lib/sdilenaData.ts): smí zrychlit, ale
// nikdy nesmí ukázat stav z doby před zápisem.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  dotazy: [] as string[],
  radky: [{ entry_date: '2026-09-01', quantity: 1 }] as any[],
  cekat: null as null | Promise<void>,
}));

vi.mock('./supabase', () => ({
  fetchAllRows: (tabulka: string) => ({
    then: async (ok: (r: any) => any) => {
      h.dotazy.push(tabulka);
      const snimek = h.radky.map((r) => ({ ...r }));
      if (h.cekat) await h.cekat;
      return ok({ data: snimek, error: null });
    },
  }),
  supabase: {
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  },
}));

import { nactiSdilenouTabulku, vycistiSdilenaData, MAX_STARI_MS } from './sdilenaData';
import { zneplatniTabulku, zneplatniVse } from './zneplatneni';
import { vycistiZPameti, zapisZPameti } from './zPameti';

beforeEach(() => {
  vycistiZPameti();
  vycistiSdilenaData();
  h.dotazy.length = 0;
  h.radky = [{ entry_date: '2026-09-01', quantity: 1 }];
  h.cekat = null;
  vi.useRealTimers();
});

describe('nactiSdilenouTabulku', () => {
  it('druhé čtení téže tabulky jde z paměti, ne ze serveru', async () => {
    await nactiSdilenouTabulku('bottling');
    await nactiSdilenouTabulku('bottling');
    expect(h.dotazy).toEqual(['bottling']);
  });

  it('po zápisu do tabulky se načte znovu a ukáže nový stav', async () => {
    await nactiSdilenouTabulku('bottling');
    h.radky = [...h.radky, { entry_date: '2026-09-02', quantity: 5 }];
    zneplatniTabulku('bottling');
    const { data } = await nactiSdilenouTabulku('bottling');
    expect(data).toHaveLength(2);
    expect(h.dotazy).toEqual(['bottling', 'bottling']);
  });

  it('zápis do JINÉ tabulky paměť nezahodí', async () => {
    await nactiSdilenouTabulku('bottling');
    zneplatniTabulku('kegging');
    await nactiSdilenouTabulku('bottling');
    expect(h.dotazy).toEqual(['bottling']);
  });

  it('zneplatniVse zahodí všechno', async () => {
    await nactiSdilenouTabulku('bottling');
    zneplatniVse();
    await nactiSdilenouTabulku('bottling');
    expect(h.dotazy).toEqual(['bottling', 'bottling']);
  });

  it('souběžné žádosti o tutéž tabulku jsou jeden dotaz', async () => {
    await Promise.all([nactiSdilenouTabulku('orders'), nactiSdilenouTabulku('orders'), nactiSdilenouTabulku('orders')]);
    expect(h.dotazy).toEqual(['orders']);
  });

  it('data načtená PŘED zápisem, který přišel během stahování, se do paměti neuloží', async () => {
    let pust!: () => void;
    h.cekat = new Promise((r) => { pust = r; });
    const prvni = nactiSdilenouTabulku('writeoffs');
    await Promise.resolve();
    zneplatniTabulku('writeoffs'); // zápis doběhl, zatímco se stahovalo
    h.cekat = null;
    pust();
    await prvni;
    await nactiSdilenouTabulku('writeoffs');
    expect(h.dotazy).toEqual(['writeoffs', 'writeoffs']);
  });

  it('po minutě bez zpráv se načte znovu', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-25T10:00:00Z'));
    await nactiSdilenouTabulku('fasovani');
    vi.setSystemTime(Date.now() + MAX_STARI_MS + 1);
    await nactiSdilenouTabulku('fasovani');
    expect(h.dotazy).toEqual(['fasovani', 'fasovani']);
  });

  it('každá obrazovka dostane vlastní kopii — úprava jedné neprosákne do druhé', async () => {
    const a = await nactiSdilenouTabulku<any>('inventory');
    a.data![0].quantity = 999;
    a.data!.push({ entry_date: 'x' });
    const b = await nactiSdilenouTabulku<any>('inventory');
    expect(b.data).toHaveLength(1);
    expect(b.data![0].quantity).toBe(1);
  });
});

// 15. 10. 2026: „občas se nechce načíst sklad" — při slabém signálu dotaz vyprší
// a appka odpoví z paměti telefonu. Taková data se nesmí tvářit jako čerstvá.
describe('data z paměti telefonu místo ze serveru', () => {
  it('výsledek je poznačený a do sdílené paměti se NEULOŽÍ — příští čtení zkusí server znovu', async () => {
    let pust!: () => void;
    h.cekat = new Promise((r) => { pust = r; });
    const prvni = nactiSdilenouTabulku('inventory');
    await Promise.resolve();
    zapisZPameti(Date.now() + 5); // dotaz selhal a odpovědělo se z paměti telefonu
    h.cekat = null;
    pust();
    const r = await prvni;
    expect(r.zPameti).toBe(true);
    await nactiSdilenouTabulku('inventory');
    expect(h.dotazy).toEqual(['inventory', 'inventory']);
  });

  it('bez výpadku výsledek poznačený není a jde z paměti jako dřív', async () => {
    const r = await nactiSdilenouTabulku('kegging');
    expect(r.zPameti).toBeUndefined();
    await nactiSdilenouTabulku('kegging');
    expect(h.dotazy).toEqual(['kegging']);
  });

  it('výpadek PŘED začátkem dotazu se nezapočítá', async () => {
    zapisZPameti(Date.now() - 60_000);
    const r = await nactiSdilenouTabulku('writeoffs');
    expect(r.zPameti).toBeUndefined();
  });

  it('souběžné žádosti sdílejí i poznačení', async () => {
    let pust!: () => void;
    h.cekat = new Promise((r) => { pust = r; });
    const a = nactiSdilenouTabulku('akce');
    const b = nactiSdilenouTabulku('akce');
    await Promise.resolve();
    zapisZPameti(Date.now() + 5);
    h.cekat = null;
    pust();
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.zPameti).toBe(true);
    expect(rb.zPameti).toBe(true);
  });
});

// Jeden výčet sloupců pro všechny obrazovky: kdyby v něm byl překlep, nespadla
// by jedna obrazovka, ale všechny najednou — a tiše, s nulami místo čísel.
describe('SLOUPCE proti schématu databáze', () => {
  it('každý sloupec ve výčtu v tabulce opravdu je', async () => {
    const { SLOUPCE } = await import('./sdilenaData');
    const schema = (await import('./schemaDB.json')).default as Record<string, string[]>;
    const chybi: string[] = [];
    for (const [tabulka, vyber] of Object.entries(SLOUPCE)) {
      if (vyber === '*') continue;
      const [vlastni, vnoreny] = vyber.split(/,(?=[a-z_]+:)/);
      for (const s of vlastni.split(',')) if (!schema[tabulka]?.includes(s)) chybi.push(`${tabulka}.${s}`);
      const m = vnoreny?.match(/^[a-z_]+:([a-z_]+)\(([^)]*)\)$/);
      if (vnoreny && !m) chybi.push(`${tabulka}: nečitelný vnořený výběr ${vnoreny}`);
      if (m) for (const s of m[2].split(',')) if (!schema[m[1]]?.includes(s)) chybi.push(`${m[1]}.${s}`);
    }
    expect(chybi).toEqual([]);
  });
});

describe('vnořené tabulky', () => {
  it('zápis do akce_items zneplatní i akce (načítají se jedním dotazem)', async () => {
    vycistiSdilenaData();
    h.dotazy.length = 0;
    await nactiSdilenouTabulku('akce');
    zneplatniTabulku('akce_items');
    await nactiSdilenouTabulku('akce');
    expect(h.dotazy).toEqual(['akce', 'akce']);
  });
});

describe('odpočty zavozu s datem v budoucnu', () => {
  it('se nepočítají za odečtené (13. 10. 2026: 2× 30 l Jantar na zítřek se musí nabídnout ke stočení)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-13T10:00:00Z'));
    h.radky = [
      { deduct_date: '2026-10-12', order_item_id: 'a', quantity: 1 },
      { deduct_date: '2026-10-13', order_item_id: 'b', quantity: 1 },
      { deduct_date: '2026-10-14', order_item_id: 'c', quantity: 2 },
    ];
    const { data } = await nactiSdilenouTabulku('zavoz_deductions');
    expect((data as any[]).map((r) => r.order_item_id)).toEqual(['a', 'b']);
  });
});
