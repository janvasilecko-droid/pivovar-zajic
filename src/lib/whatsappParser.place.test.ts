// Reprodukce hlášené chyby (16. 9. 2026): „Přečíst znovu (AI)" u skupinové
// zprávy vymazalo správně dosazeného odběratele "petr". Příčina: appka
// posílala AI jméno SKUPINY ("Objednávky pivovar", sender_name), ne
// skutečného pisatele (participant_name, "Petr Bednář") — u "pro mě" tak
// neměla koho jako odběratele dosadit.
import { describe, it, expect, vi, beforeEach } from 'vitest';

type MockRow = Record<string, any>;

// `vi.hoisted`: mock modulu (`vi.mock` se zvedá nad importy) potřebuje
// odkaz na měnitelný stav, ten musí vzniknout stejně brzy.
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

const noBeers: any[] = [];
const noPackages: any[] = [];
const PLACES = [{ id: 'p-petr', name: 'petr' }] as any[];

const MESSAGE_TEXT =
  'Lucka jede zitra do skoly do Pisku a bude brat pivo, tak pro me prosim dnes 1x30l 11sv, Gabi pripis mi to prosim k penizu, co Ti mama dat a zitra hodim vsecko;)\nDekuju';

describe('parseWhatsAppOrderMessageWithAI — odběratel ve skupinovém chatu ("pro mě")', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    mockDb.byId.clear();
    mockDb.contextRows = [];
  });

  it('u skupinové zprávy hledá "pro mě" podle SKUTEČNÉHO pisatele (participant_name), ne podle jména skupiny', async () => {
    mockDb.byId.set('msg-1', {
      chat_id: 'chat-skupina',
      created_at: '2026-09-16T08:23:50.000Z',
      quoted_text: null,
      // Ve skupinovém chatu je sender_name jméno MOSTU/SKUPINY — appka ho
      // dřív posílala AI jako "Odesílatel", takže "pro mě" nemělo koho dosadit.
      sender_name: 'Objednávky pivovar',
      participant_name: 'Petr Bednář',
    });

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url.endsWith('/functions/v1/parse-order-text')).toBe(true);
      const body = JSON.parse(String(init?.body));
      // Klíčová věc: AI dostane jako odesílatele skutečného pisatele, ne
      // jméno skupiny.
      const posledniZprava = body.messages[body.messages.length - 1];
      expect(posledniZprava.sender).toBe('Petr Bednář');
      // AI se řídí promptem "pro mě" → vrátí jako place_name jméno
      // odesílatele, které jí bylo poslané (viz parse-order-text/index.ts).
      return new Response(JSON.stringify({
        place_name: 'Petr Bednář',
        raw_text: MESSAGE_TEXT,
        items: [{ beer_name: '11° Světlá', package_label: '30l', quantity: 1, place_name: null }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await parseWhatsAppOrderMessageWithAI(
      MESSAGE_TEXT,
      noBeers,
      noPackages,
      PLACES,
      'Objednávky pivovar', // sender_name předaný voláním (staré chování) — appka ho MUSÍ přebít
      '2026-09-16T08:23:50.000Z',
      undefined,
      undefined,
      'msg-1',
    );

    expect(result.placeId).toBe('p-petr');
    expect(result.placeName).toBe('petr');
  });

  it('bez messageId (chybí kontext) se použije aspoň to, co bylo předané jako sender', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const posledniZprava = body.messages[body.messages.length - 1];
      expect(posledniZprava.sender).toBe('Petr Bednář');
      return new Response(JSON.stringify({
        place_name: 'Petr Bednář',
        raw_text: MESSAGE_TEXT,
        items: [],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await parseWhatsAppOrderMessageWithAI(
      MESSAGE_TEXT, noBeers, noPackages, PLACES, 'Petr Bednář', '2026-09-16T08:23:50.000Z',
    );

    expect(result.placeId).toBe('p-petr');
    expect(result.placeName).toBe('petr');
  });
});
