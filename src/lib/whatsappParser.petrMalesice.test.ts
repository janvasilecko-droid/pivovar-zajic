// Dvě chyby z provozu 12. 10. 2026:
//  1) „Gabi připiš mi k tomu sudu petky 1,5l" od Petra Bednáře skončilo u
//     „Petr moravcik prodejna" místo u „petr" („kontext té zprávy jasně říká,
//     že to píše Petr, takže objednávka je Petr").
//  2) U Malešic („Jantar 12 = 1x30l KEG + 10x0,5l lahev.") záchranná síť
//     přidala k správným řádkům ještě „12° Světlá 30l 2×" a „12° Světlá 0,5l 10×".
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDb = vi.hoisted(() => ({ rows: new Map<string, Record<string, any>>() }));
vi.mock('./supabase', () => {
  function builderFor(table: string) {
    const filters: Record<string, any> = {};
    const b: any = {
      select: vi.fn(() => b), eq: vi.fn((c: string, v: any) => { filters[c] = v; return b; }),
      lt: vi.fn(() => b), gte: vi.fn(() => b), order: vi.fn(() => b),
      limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
      maybeSingle: vi.fn(() => Promise.resolve({ data: table === 'whatsapp_incoming' && filters.id ? mockDb.rows.get(filters.id) ?? null : null, error: null })),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    };
    return b;
  }
  return { supabase: { from: vi.fn((t: string) => builderFor(t)), auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 't' } }, error: null }) } } };
});

import { parseWhatsAppOrderMessageWithAI } from './whatsappParser';

const PLACES = [
  { id: 'p-petr', name: 'petr' },
  { id: 'p-mor', name: 'Petr moravcik prodejna' },
  { id: 'p-mal', name: 'Malešice' },
] as any[];
const BEERS = [
  { id: 'b12', name: '12° Světlá', degree: '12°' },
  { id: 'bj', name: 'Jantar', degree: '12°' },
  { id: 'b11', name: '11° Světlá', degree: '11°' },
] as any[];
const PACKAGES = [
  { id: 'k50', label: ' 50l', volume_l: 50, kind: 'keg' },
  { id: 'k30', label: '30l', volume_l: 30, kind: 'keg' },
  { id: 'p15', label: '1.5l', volume_l: 1.5, kind: 'bottle' },
  { id: 'l05', label: '0.5l', volume_l: 0.5, kind: 'bottle' },
] as any[];
const odpoved = (o: unknown) => vi.fn(async () => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } }));

describe('parseWhatsAppOrderMessageWithAI — Petr a Malešice (12. 10. 2026)', () => {
  beforeEach(() => { localStorage.clear(); vi.unstubAllGlobals(); mockDb.rows.clear(); });

  it('„mi" od Petra Bednáře: odběratel je „petr", i když AI tipne „Petr moravcik prodejna"', async () => {
    const text = 'Gabi pripis mi k tomu sudu prosim petky 1,5l:\n6x11\n4x10\n2xVosma';
    mockDb.rows.set('m1', { chat_id: 'c', created_at: '2026-10-12T11:48:00Z', quoted_text: 'Pro mě na patek prosim 30l desitka', sender_name: 'Objednávky pivovar', participant_name: 'Petr Bednář' });
    vi.stubGlobal('fetch', odpoved({ place_name: 'Petr moravcik prodejna', raw_text: text, items: [{ beer_name: '11° Světlá', package_label: '1.5l', quantity: 6, place_name: 'Petr moravcik prodejna' }] }));
    const r = await parseWhatsAppOrderMessageWithAI(text, BEERS, PACKAGES, PLACES, 'Objednávky pivovar', '2026-10-12T11:48:00Z', undefined, undefined, 'm1');
    expect(r.placeName).toBe('petr');
    expect(r.placeId).toBe('p-petr');
  });

  it('i bez „mi": AI/historie tipne „Petr moravcik prodejna", ale platí „petr" (13. 10. 2026)', async () => {
    const text = 'Prodejna na patek 2x30l 11sv';
    mockDb.rows.set('m2', { chat_id: 'c', created_at: '2026-10-13T08:00:00Z', quoted_text: null, sender_name: 'Objednávky pivovar', participant_name: 'Petr Bednář' });
    vi.stubGlobal('fetch', odpoved({ place_name: 'Petr moravcik prodejna', raw_text: text, items: [{ beer_name: '11° Světlá', package_label: '30l', quantity: 2, place_name: 'Petr moravcik prodejna' }] }));
    const r = await parseWhatsAppOrderMessageWithAI(text, BEERS, PACKAGES, PLACES, 'Objednávky pivovar', '2026-10-13T08:00:00Z', undefined, undefined, 'm2');
    expect(r.placeName).toBe('petr');
    expect(r.placeId).toBe('p-petr');
  });

  it('Malešice: záchranná síť nepřidá fragmenty řádků, které AI už přečetla', async () => {
    const text = 'Malesice\n• SV 12 = 2x50l KEG + 2x30l KEG + 12x1,5l PET (bez etikety) + 20x0,5l lahev (etiketa MM)\n• Jantar 12 = 1x30l KEG + 10x0,5l lahev.  Děkuji moc.';
    const r1 = '• SV 12 = 2x50l KEG + 2x30l KEG + 12x1,5l PET (bez etikety) + 20x0,5l lahev (etiketa MM)';
    const r2 = '• Jantar 12 = 1x30l KEG + 10x0,5l lahev.  Děkuji moc.';
    vi.stubGlobal('fetch', odpoved({
      place_name: 'Malešice', raw_text: text,
      items: [
        { beer_name: '12° Světlá', package_label: '50l', quantity: 2, raw_line: r1 },
        { beer_name: '12° Světlá', package_label: '30l', quantity: 2, raw_line: r1 },
        { beer_name: '12° Světlá', package_label: '1.5l', quantity: 12, raw_line: r1 },
        { beer_name: '12° Světlá', package_label: '0.5l', quantity: 20, raw_line: r1 },
        { beer_name: 'Jantar', package_label: '30l', quantity: 1, raw_line: r2 },
        { beer_name: 'Jantar', package_label: '0.5l', quantity: 10, raw_line: r2 },
      ],
    }));
    const r = await parseWhatsAppOrderMessageWithAI(text, BEERS, PACKAGES, PLACES, 'Radek', '2026-10-12T10:00:00Z');
    const radky = r.items.map((i) => `${i.quantity}x ${i.package_label?.trim()} ${i.beer_name}`);
    expect(radky).toHaveLength(6);
    expect(radky).toContain('10x 0.5l Jantar');
    expect(radky).not.toContain('10x 0.5l 12° Světlá');
  });

  it('záchranná síť dál doplní řádek, který AI opravdu vynechala', async () => {
    const text = 'Malesice\n24x1,5l 12sv bez etikety\n2x30l 11sv';
    vi.stubGlobal('fetch', odpoved({
      place_name: 'Malešice', raw_text: text,
      items: [{ beer_name: '11° Světlá', package_label: '30l', quantity: 2, raw_line: '2x30l 11sv' }],
    }));
    const r = await parseWhatsAppOrderMessageWithAI(text, BEERS, PACKAGES, PLACES, 'Radek', '2026-10-12T10:00:00Z');
    expect(r.items.map((i) => `${i.quantity}x ${i.package_label?.trim()} ${i.beer_name}`)).toContain('24x 1.5l 12° Světlá');
  });
});
