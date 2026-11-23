// „Přečíst znovu" v kontrole zprávy musí číst stejně jako server:
//  • lahve/bedny bez udané velikosti podle toho, co odběratel bere (Lužec
//    třetinky — 9. 11. 2026 se mu „5 beden světlého a 3 tmavého" zapsalo jako 0,5 l),
//  • co v řádku stojí výslovně („3x 15l"), přebije obal od AI,
//  • potichu naučené zkratky (parser_aliases) se AI neposílají.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  lahve: [] as Record<string, any>[],
  zkratky: [] as Record<string, any>[],
}));
vi.mock('./supabase', () => {
  const h = (r: Record<string, any>, s: string) => s.split('.').reduce((o: any, k) => (o == null ? undefined : o[k]), r);
  function dotaz(tabulka: string) {
    const podminky: ((r: Record<string, any>) => boolean)[] = [];
    const radky = () => (tabulka === 'order_items' ? db.lahve : tabulka === 'parser_aliases' ? db.zkratky : []).filter((r) => podminky.every((p) => p(r)));
    const b: any = {
      select: () => b, order: () => b, lt: () => b, not: () => b, range: () => b,
      eq: (s: string, v: any) => { if (tabulka === 'order_items') podminky.push((r) => h(r, s) === v); return b; },
      neq: (s: string, v: any) => { podminky.push((r) => h(r, s) !== v); return b; },
      in: (s: string, v: any[]) => { if (tabulka === 'order_items') podminky.push((r) => v.includes(h(r, s))); return b; },
      gte: (s: string, v: any) => { if (tabulka === 'order_items') podminky.push((r) => h(r, s) >= v); return b; },
      lte: (s: string, v: any) => { podminky.push((r) => h(r, s) <= v); return b; },
      limit: () => Promise.resolve({ data: radky(), error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: null, error: null }),
      then: (ok: (v: unknown) => unknown, chyba?: (e: unknown) => unknown) => Promise.resolve({ data: radky(), error: null }).then(ok, chyba),
    };
    return b;
  }
  const supabase = { from: vi.fn((t: string) => dotaz(t)), auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 't' } }, error: null }) } };
  return { supabase, fetchAllRows: (t: string) => supabase.from(t).select() };
});

import { parseWhatsAppOrderMessageWithAI } from './whatsappParser';

const PLACES = [{ id: 'm-luzec', name: 'Lužec' }, { id: 'm-maneo', name: 'Maneo' }] as any[];
const BEERS = [
  { id: 'b12', name: '12° Světlá', degree: '12°', color: 'světlé' },
  { id: 'b12t', name: '12° Tmavá', degree: '12°', color: 'tmavé' },
  { id: 'b10', name: '10° Desítka', degree: '10°', color: 'světlé' },
] as any[];
const PACKAGES = [
  { id: 'k20', label: '20l', volume_l: 20, kind: 'keg' },
  { id: 'k15', label: ' 15l', volume_l: 15, kind: 'keg' },
  { id: 'l05', label: '0.5l', volume_l: 0.5, kind: 'bottle' },
  { id: 'l033', label: '0.33l', volume_l: 0.33, kind: 'bottle' },
] as any[];

const lahve = (objednavka: string, datum: string, misto: string, obal: string) =>
  ({ package_id: obal, orders: { id: objednavka, order_date: datum, place_id: misto, place_name: null, status: 'nova' } });
/** Napodobená čtecí funkce — vrátí `o` a zapamatuje si, co dostala. */
function ctecka(o: unknown) {
  const tela: Record<string, any>[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body?: string } = {}) => {
    const telo = JSON.parse(init.body ?? '{}');
    if (telo.rawText !== undefined) tela.push(telo); // jen volání čtecí funkce
    return new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  return tela;
}
const radky = (r: { items: { quantity: number | null; package_label: string | null; beer_name: string | null }[] }) =>
  r.items.map((i) => `${i.quantity}× ${i.beer_name} / ${String(i.package_label).trim()}`);

describe('parseWhatsAppOrderMessageWithAI — obal podle toho, co ve zprávě stojí a co odběratel bere', () => {
  beforeEach(() => { localStorage.clear(); vi.unstubAllGlobals(); db.lahve = []; db.zkratky = []; });

  it('Lužec bere třetinky → „5 beden světlého a 3 tmavého" jsou lahve 0,33 l', async () => {
    db.lahve = [
      lahve('o-srpen', '2026-08-16', 'm-luzec', 'l05'),
      lahve('o1', '2026-10-06', 'm-luzec', 'l033'), lahve('o2', '2026-10-27', 'm-luzec', 'l033'), lahve('o3', '2026-11-03', 'm-luzec', 'l033'),
      lahve('x1', '2026-11-05', 'm-maneo', 'l05'),
    ];
    const text = 'Lužec 5 beden světlého a 3 tmavého';
    ctecka({ place_name: 'Lužec', raw_text: text, items: [
      { beer_name: '12° Světlá', degree: '12°', package_label: 'Lahve 0.5l', quantity: 100, raw_line: '5 beden světlého', place_name: 'Lužec' },
      { beer_name: '12° Tmavá', degree: '12°', package_label: 'Lahve 0.5l', quantity: 60, raw_line: '3 tmavého', place_name: 'Lužec' },
    ] });
    const r = await parseWhatsAppOrderMessageWithAI(text, BEERS, PACKAGES, PLACES, 'Radek', '2026-11-09T07:42:00Z');
    expect(r.placeId).toBe('m-luzec');
    expect(radky(r)).toEqual(['100× 12° Světlá / 0.33l', '60× 12° Tmavá / 0.33l']);
  });

  it('odběratel bez zvyku → bedna zůstává 0,5 l; „basy sklo" je 0,5 l, i když AI vrátí třetinku', async () => {
    const text = 'Maneo 2 bedny světlého a 2 basy sklo tmavé';
    ctecka({ place_name: 'Maneo', raw_text: text, items: [
      { beer_name: '12° Světlá', degree: '12°', package_label: 'Lahve 0.5l', quantity: 40, raw_line: '2 bedny světlého', place_name: 'Maneo' },
      { beer_name: '12° Tmavá', degree: '12°', package_label: 'Lahve 0.33l', quantity: 41, raw_line: '2 basy sklo tmavé', place_name: 'Maneo' },
    ] });
    const r = await parseWhatsAppOrderMessageWithAI(text, BEERS, PACKAGES, PLACES, 'Radek', '2026-11-09T07:42:00Z');
    expect(radky(r)).toEqual(['40× 12° Světlá / 0.5l', '41× 12° Tmavá / 0.5l']);
  });

  it('velikost napsaná ve zprávě má přednost před zvykem (Lužec výslovně chce 0,5 l)', async () => {
    db.lahve = [lahve('o1', '2026-10-27', 'm-luzec', 'l033'), lahve('o2', '2026-11-03', 'm-luzec', 'l033')];
    const text = 'Lužec 20x0,5l 12sv lahve';
    ctecka({ place_name: 'Lužec', raw_text: text, items: [
      { beer_name: '12° Světlá', degree: '12°', package_label: 'Lahve 0.33l', quantity: 20, raw_line: '20x0,5l 12sv lahve', place_name: 'Lužec' },
    ] });
    const r = await parseWhatsAppOrderMessageWithAI(text, BEERS, PACKAGES, PLACES, 'Radek', '2026-11-09T07:42:00Z');
    expect(radky(r)).toEqual(['20× 12° Světlá / 0.5l']);
  });

  it('potichu naučené zkratky se AI neposílají a „3x 15l" je patnáctka, i když AI vrátí dvacítku', async () => {
    db.zkratky = [
      { alias_text: 'keg 15l', beer_id: null, package_id: 'k20' },
      { alias_text: 'desitka', beer_id: 'b12', package_id: null },
    ];
    const text = 'Maneo 3x 15l desitka';
    const tela = ctecka({ place_name: 'Maneo', raw_text: text, items: [
      { beer_name: '10° Desítka', degree: '10°', package_label: 'KEG 20l', quantity: 3, raw_line: '3x 15l desitka', place_name: 'Maneo' },
    ] });
    const r = await parseWhatsAppOrderMessageWithAI(text, BEERS, PACKAGES, PLACES, 'Radek', '2026-11-09T07:42:00Z');
    expect(tela).toHaveLength(1);
    expect(tela[0].aliases).toBeUndefined();
    expect(JSON.stringify(tela[0])).not.toContain('keg 15l');
    expect(radky(r)).toEqual(['3× 10° Desítka / 15l']);
  });
});
