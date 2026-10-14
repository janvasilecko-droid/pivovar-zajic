// Celé kolo na slabém signálu: odškrtnutí PROJDE na server, obrazovka se hned
// přenačítá, dotaz spadne na síť a vrátí se STARÁ mezipaměť. Dřív se odškrtnutí
// vrátilo zpátky; teď se ve staré mezipaměti ukáže i to, co prošlo rovnou.
// (14. 10. 2026: „nejde mi označovat, že mám připravený lahve".)
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// V prostředí testů není IndexedDB — mezipaměť se nahradí atrapou se starými daty.
let staraMezipamet: any[] | null = null;
vi.mock('./offlineCache', () => ({
  cacheGetResponse: vi.fn().mockResolvedValue(undefined),
  upsertTableRows: vi.fn().mockResolvedValue(undefined),
  getTableRows: vi.fn(async () => null),
  getCachedResponse: vi.fn(async () => (staraMezipamet ? { rows: JSON.parse(JSON.stringify(staraMezipamet)), contentRange: null } : null)),
}));

import { supabase } from './supabase';
import { clearQueue, enqueue, getQueue, zapomenProslyZapisy } from './offline';

const stara = () => [
  { id: 'i1', order_id: 'o1', is_prepared: false },
  { id: 'i2', order_id: 'o1', is_prepared: false },
  { id: 'i3', order_id: 'o2', is_prepared: false },
];

/** Síť: zápisy procházejí, čtení padá (jako desetivteřinový timeout na „E"). */
function siteKdeCteniPada(zapisProchazi = true) {
  const volani: { method: string; url: string }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: any, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    volani.push({ method, url: String(input?.url ?? input) });
    if (method === 'GET') throw new TypeError('Failed to fetch');
    if (!zapisProchazi) throw new TypeError('Failed to fetch');
    return new Response(null, { status: 204 });
  }));
  return volani;
}

describe('stará mezipaměť po prošlém zápisu', () => {
  beforeEach(() => {
    localStorage.clear();
    clearQueue();
    zapomenProslyZapisy();
    staraMezipamet = stara();
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('odškrtnutí, které na server prošlo, se po výpadku čtení nevrátí zpátky', async () => {
    siteKdeCteniPada(true);
    const { error } = await supabase.from('order_items').update({ is_prepared: true }).in('id', ['i1', 'i2']);
    expect(error).toBeNull();
    expect(getQueue()).toHaveLength(0);               // prošlo rovnou, ve frontě nic není

    const { data } = await supabase.from('order_items').select('*');
    expect((data as any[]).map((r) => [r.id, r.is_prepared])).toEqual([['i1', true], ['i2', true], ['i3', false]]);
  });

  it('.in() zasáhne jen vyjmenované řádky, ne celou tabulku', async () => {
    siteKdeCteniPada(true);
    await supabase.from('order_items').update({ is_prepared: true }).in('id', ['i3']);
    const { data } = await supabase.from('order_items').select('*');
    expect((data as any[]).map((r) => r.is_prepared)).toEqual([false, false, true]);
  });

  it('i zápis, který zapadl do fronty (síť nejde), se ukáže jen u svých řádků', async () => {
    siteKdeCteniPada(false);
    await supabase.from('order_items').update({ is_prepared: true }).in('id', ['i2']);
    expect(getQueue()).toHaveLength(1);
    const { data } = await supabase.from('order_items').select('*');
    expect((data as any[]).map((r) => r.is_prepared)).toEqual([false, true, false]);
  });

  it('poslední klepnutí vyhrává: zaškrtnout a hned odškrtnout = odškrtnuto', async () => {
    siteKdeCteniPada(true);
    await supabase.from('order_items').update({ is_prepared: true }).eq('id', 'i1');
    await supabase.from('order_items').update({ is_prepared: false }).eq('id', 'i1');
    const { data } = await supabase.from('order_items').select('*');
    expect((data as any[])[0].is_prepared).toBe(false);
  });

  it('čerstvá odpověď serveru se nemění — mezipaměť se přimíchává jen u výpadku čtení', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: any, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET') return new Response(JSON.stringify([{ id: 'i1', is_prepared: false }]), { status: 200 });
      return new Response(null, { status: 204 });
    }));
    await supabase.from('order_items').update({ is_prepared: true }).eq('id', 'i1');
    const { data } = await supabase.from('order_items').select('*');
    expect(data).toEqual([{ id: 'i1', is_prepared: false }]);   // co řekl server, to platí
  });
});

// Zápis, který na slabém signálu vypršel, leží ve frontě telefonu. Přenačtení, které
// potom PROJDE, vrátí od serveru stav bez něj — odškrtnutí by z obrazovky zmizelo.
describe('čerstvá odpověď serveru a zápisy čekající ve frontě', () => {
  const server = () => [
    { id: 'i1', order_id: 'o1', is_prepared: false },
    { id: 'i2', order_id: 'o1', is_prepared: false },
    { id: 'i3', order_id: 'o2', is_prepared: false },
  ];

  /** Síť: čtení projde se stavem serveru, zápisy padají (vypršely) → jdou do fronty. */
  function siteKdeZapisyPadaji() {
    vi.stubGlobal('fetch', vi.fn(async (_input: any, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method !== 'GET') throw new TypeError('Failed to fetch');
      const hlavicky = new Headers(init?.headers as any);
      const jeden = (hlavicky.get('accept') ?? '').includes('vnd.pgrst.object');
      return new Response(JSON.stringify(jeden ? server()[0] : server()), { status: 200, headers: { 'content-range': '0-2/3' } });
    }));
  }

  beforeEach(() => {
    localStorage.clear();
    clearQueue();
    zapomenProslyZapisy();
    staraMezipamet = null;
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('odškrtnutí ve frontě se po úspěšném přenačtení nevrátí zpátky', async () => {
    siteKdeZapisyPadaji();
    await supabase.from('order_items').update({ is_prepared: true }).in('id', ['i1', 'i3']);
    expect(getQueue()).toHaveLength(1);
    const { data } = await supabase.from('order_items').select('*');
    expect((data as any[]).map((r) => [r.id, r.is_prepared])).toEqual([['i1', true], ['i2', false], ['i3', true]]);
  });

  it('hlavička s počtem řádků zůstane z odpovědi serveru', async () => {
    siteKdeZapisyPadaji();
    await supabase.from('order_items').update({ is_prepared: true }).eq('id', 'i2');
    const { data, count } = await supabase.from('order_items').select('*', { count: 'exact' });
    expect((data as any[])[1].is_prepared).toBe(true);
    expect(count).toBe(3);
  });

  it('odpověď s jedním řádkem (maybeSingle / single) se přepíše taky', async () => {
    siteKdeZapisyPadaji();
    await supabase.from('order_items').update({ is_prepared: true }).eq('id', 'i1');
    const { data } = await supabase.from('order_items').select('*').eq('id', 'i1').single();
    expect(data).toMatchObject({ id: 'i1', is_prepared: true });
  });

  it('jiná tabulka s čekajícím zápisem se nemění', async () => {
    siteKdeZapisyPadaji();
    await supabase.from('orders').update({ is_prepared: true }).eq('id', 'o1');
    const { data } = await supabase.from('order_items').select('*');
    expect(data).toEqual(server());
  });

  it('uvízlý zápis (při posledním odesílání selhal) se neukazuje — pravda je v databázi', async () => {
    siteKdeZapisyPadaji();
    await supabase.from('order_items').update({ is_prepared: true }).eq('id', 'i1');
    const [op] = getQueue();
    localStorage.setItem('pivovar_offline_chyby_v1', JSON.stringify([{ id: op.id, table: 'order_items', op: 'update', error: 'permission denied' }]));
    const { data } = await supabase.from('order_items').select('*');
    expect((data as any[])[0].is_prepared).toBe(false);
  });

  it('zápis starší než půl dne se neukazuje (nejspíš uvízl)', async () => {
    siteKdeZapisyPadaji();
    enqueue({ table: 'order_items', op: 'update', match: { id: 'i1' }, row: { is_prepared: true } }, Date.now() - 13 * 3600 * 1000);
    const { data } = await supabase.from('order_items').select('*');
    expect((data as any[])[0].is_prepared).toBe(false);
  });

  it('ve čerstvých datech se nic nepřidává ani neodebírá (vkládání a mazání ve frontě se jich netýká)', async () => {
    siteKdeZapisyPadaji();
    await supabase.from('order_items').insert({ id: 'nove', order_id: 'o1', is_prepared: false });
    await supabase.from('order_items').delete().eq('id', 'i2');
    expect(getQueue()).toHaveLength(2);
    const { data } = await supabase.from('order_items').select('*');
    expect(data).toEqual(server());
  });

  it('bez čekajících zápisů jde odpověď serveru dál beze změny', async () => {
    siteKdeZapisyPadaji();
    const { data, error } = await supabase.from('order_items').select('*');
    expect(error).toBeNull();
    expect(data).toEqual(server());
  });
});

import { hodnotyZIn, parseRest } from './supabase';

describe('filtr in.(…) v adrese zápisu', () => {
  it('hodnoty bez závorek', () => {
    expect(hodnotyZIn('(a,b,c)')).toEqual(['a', 'b', 'c']);
    expect(hodnotyZIn('(jedno)')).toEqual(['jedno']);
    expect(hodnotyZIn('(1111-2222,3333-4444)')).toEqual(['1111-2222', '3333-4444']);
  });

  it('hodnota v uvozovkách smí obsahovat čárku', () => {
    expect(hodnotyZIn('(a,"b,c",d)')).toEqual(['a', 'b,c', 'd']);
  });

  it('prázdný seznam a mezery', () => {
    expect(hodnotyZIn('()')).toEqual([]);
    expect(hodnotyZIn('( a , b )')).toEqual(['a', 'b']);
  });

  it('parseRest vyčte .in() i .eq() ze skutečné adresy supabase-js', () => {
    const r = parseRest(new URL('https://x.supabase.co/rest/v1/order_items?id=in.(i1,i2)&order_id=eq.o1'));
    expect(r).toMatchObject({ table: 'order_items', inMatch: { id: ['i1', 'i2'] }, eq: { order_id: 'o1' }, jineFiltry: false });
  });
});
