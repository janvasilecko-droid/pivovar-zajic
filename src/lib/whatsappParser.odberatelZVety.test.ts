// Reprodukce hlášené chyby (5. 11. 2026): zpráva
//     Na pristi tyden na Patejdovku:
//     30x30l 11sv
//     15x30l limo citron
// skončila jako „Neznámý odběratel". Majitel: „pro Patejdlovku — to znamená,
// že odběratel je Patejdlovka… tohle musí aplikace umět přečíst."
//
// Tohle je cesta tlačítka „Zkusit znovu najít odběratele v téhle zprávě" a
// „Přečíst znovu": AI se zeptá, a když jméno nevrátí (nebo ho vrátí v jiném
// pádu, než stojí ve zprávě), jméno se musí přečíst z věty „na / pro X".
import { describe, it, expect, vi, beforeEach } from 'vitest';

type MockRow = Record<string, any>;

const mockDb = vi.hoisted(() => ({
  byId: new Map<string, MockRow>(),
  contextRows: [] as MockRow[],
}));

vi.mock('./supabase', () => {
  function builderFor(table: string) {
    const filters: Record<string, any> = {};
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((col: string, val: any) => { filters[col] = val; return builder; }),
      lt: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      not: vi.fn(() => builder),
      neq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      is: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => Promise.resolve({ data: table === 'whatsapp_incoming' ? mockDb.contextRows : [], error: null })),
      maybeSingle: vi.fn(() => {
        const row = table === 'whatsapp_incoming' && filters.id ? mockDb.byId.get(filters.id) ?? null : null;
        return Promise.resolve({ data: row, error: null });
      }),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    };
    return builder;
  }
  const supabase = {
    from: vi.fn((table: string) => builderFor(table)),
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null }) },
  };
  return { supabase };
});

import { parseWhatsAppOrderMessageWithAI } from './whatsappParser';

const TEXT = 'Na pristi tyden na Patejdovku:\n30x30l 11sv\n15x30l limo citron';
const PLACES = [
  { id: 'p-petr', name: 'petr' },
  { id: 'p-pohoda', name: 'Pohoda' },
  { id: 'p-seeberg', name: 'Seeberg' },
] as any[];
const BEERS = [{ id: 'b-11', name: '11° Světlá', degree: '11' }] as any[];
const PACKAGES = [{ id: 'k-30', label: '30l' }] as any[];

/** Odpověď AI: položky přečtené, `place_name` podle scénáře. */
const aiOdpoved = (placeName: string | null) => ({
  place_name: placeName,
  raw_text: TEXT,
  items: [
    { beer_name: '11° Světlá', package_label: '30l', quantity: 30, raw_line: '30x30l 11sv', place_name: null },
  ],
});

function nastavAi(placeName: string | null) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(aiOdpoved(placeName)), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })));
}

const precti = (places = PLACES) => parseWhatsAppOrderMessageWithAI(
  TEXT, BEERS, PACKAGES, places, 'Objednávky pivovar', '2026-11-05T08:51:09.000Z', undefined, undefined, 'msg-patejdovka',
);

describe('parseWhatsAppOrderMessageWithAI — odběratel z věty „na Patejdovku:" (5. 11. 2026)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    mockDb.byId.clear();
    mockDb.contextRows = [];
    // Zpráva ze skupiny: odesílatelem je skupina, pisatelem Petr Bednář (zaměstnanec).
    mockDb.byId.set('msg-patejdovka', {
      chat_id: 'chat-skupina',
      created_at: '2026-11-05T08:51:12.000Z',
      quoted_text: null,
      sender_name: 'Objednávky pivovar',
      participant_name: 'Petr Bednář',
    });
  });

  it('AI odběratele nevrátila → z věty se přečte „Patejdovka" (nový odběratel, v 1. pádu)', async () => {
    nastavAi(null);
    const r = await precti();
    expect(r.placeId).toBeNull();
    expect(r.placeName).toBe('Patejdovka');
    // položky se čtou dál jako dřív
    expect(r.items.length).toBeGreaterThan(0);
  });

  it('AI vrátila jméno tak, jak stojí ve zprávě („Patejdovku") → nabídne se v 1. pádu', async () => {
    nastavAi('Patejdovku');
    expect((await precti()).placeName).toBe('Patejdovka');
  });

  it('AI vrátila jméno v 1. pádu („Patejdovka") → neztratí se jako „neukotvené" ve zprávě', async () => {
    nastavAi('Patejdovka');
    expect((await precti()).placeName).toBe('Patejdovka');
  });

  it('odběratel už v katalogu je (i s překlepem): přiřadí se k němu, žádný nový', async () => {
    nastavAi(null);
    const r = await precti([...PLACES, { id: 'p-patejdlovka', name: 'Patejdlovka' }] as any[]);
    expect(r.placeId).toBe('p-patejdlovka');
    expect(r.placeName).toBe('Patejdlovka');
  });

  it('odesílatel (Petr Bednář) se jako odběratel nepoužije, i když je v katalogu „petr"', async () => {
    nastavAi(null);
    const r = await precti();
    expect(r.placeId).not.toBe('p-petr');
  });

  it('věta jméno nejmenuje → zůstává prázdné (nic se nehádá)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      place_name: null,
      raw_text: 'Na pristi tyden 30x30l 11sv',
      items: [{ beer_name: '11° Světlá', package_label: '30l', quantity: 30, raw_line: '30x30l 11sv', place_name: null }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const r = await parseWhatsAppOrderMessageWithAI(
      'Na pristi tyden 30x30l 11sv', BEERS, PACKAGES, PLACES, 'Objednávky pivovar', '2026-11-05T08:51:09.000Z', undefined, undefined, 'msg-patejdovka',
    );
    expect(r.placeId).toBeNull();
    expect(r.placeName).toBeNull();
  });
});
