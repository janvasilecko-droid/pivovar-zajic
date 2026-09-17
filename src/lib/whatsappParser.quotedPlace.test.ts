// Odpověď (WhatsApp "reply"/citace) bez vlastního jména odběratele musí
// zdědit odběratele z CITOVANÉ zprávy, ne skončit jako "Neznámý odběratel".
//
// Z provozu 17. 9. 2026: odpověď "60x0,5l. Grep a 40x0,5l. Citrón" na dřívější
// Radkovu zprávu se v Kontrole WhatsApp objednávky rozparsovala BEZ odběratele
// — AI dostala k dispozici jen text téhle odpovědi (a pár posledních zpráv),
// a ten žádné jméno nenese. Appka přitom přesně ví, na kterou zprávu tahle
// odpovídá (quoted_text) a jakého odběratele ta zpráva měla (parsed_place_id/
// parsed_place_name) — viz stejná oprava v
// supabase/functions/whatsapp-auto-parse/index.ts.
import { describe, it, expect, vi, beforeEach } from 'vitest';

let fromCallCount = 0;
let contextRow: any = null;

vi.mock('./supabase', () => {
  const chainable = () => {
    const callIndex = ++fromCallCount;
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: callIndex === 2 && contextRow ? [contextRow] : [],
        error: null,
      }),
      maybeSingle: vi.fn().mockResolvedValue({
        data: callIndex === 1
          ? { chat_id: 'chat-1', created_at: '2026-09-17T10:00:00Z', quoted_text: 'Radek\n2x50l 12sv' }
          : null,
        error: null,
      }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  };
  const supabase = {
    from: vi.fn(() => chainable()),
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null }) },
  };
  return { supabase };
});

import { parseWhatsAppOrderMessageWithAI } from './whatsappParser';
import { emptyAliasMap } from './orderParser';

// Prázdné aliasy jako override — jinak by si funkce sama natáhla aliasy ze
// supabase (další .from() volání), a to by posunulo pořadí volání, na kterém
// staví mock currentMsg/contextData níže.
const NO_ALIASES = emptyAliasMap();
const NO_PLACE_ALIASES = new Map<string, string>();

const noBeers: any[] = [];
const noPackages: any[] = [];
const noPlaces: any[] = [];

function stubParseOrderText(responseBody: unknown) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).endsWith('/functions/v1/parse-order-text')) {
      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Neočekávaný fetch: ${url}`);
  }));
}

describe('parseWhatsAppOrderMessageWithAI — zdědění odběratele z citované zprávy', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    fromCallCount = 0;
    contextRow = null;
  });

  it('odpověď bez odběratele zdědí odběratele z citované zprávy (parsed_place_id)', async () => {
    contextRow = {
      sender_name: 'Řidič',
      participant_name: 'Řidič',
      message_timestamp: '2026-09-16T09:00:00Z',
      message_text: 'Radek\n2x50l 12sv',
      from_me: false,
      created_at: '2026-09-16T09:00:00Z',
      imported_order_id: null,
      parsed_place_id: 'place-radek',
      parsed_place_name: 'Radek',
    };
    stubParseOrderText({
      items: [
        { quantity: 60, degree: null, beer_name: 'Grep', package_label: 'Lahve 0.5l', raw_line: '60x0,5l. Grep', place_name: null, date: null },
        { quantity: 40, degree: null, beer_name: 'Citrón', package_label: 'Lahve 0.5l', raw_line: '40x0,5l. Citrón', place_name: null, date: null },
      ],
      place_name: null,
      raw_text: '60x0,5l. Grep a 40x0,5l. Citrón',
    });

    const result = await parseWhatsAppOrderMessageWithAI(
      '60x0,5l. Grep a 40x0,5l. Citrón',
      noBeers,
      noPackages,
      noPlaces,
      'Řidič',
      '2026-09-17T10:00:00Z',
      NO_ALIASES,
      NO_PLACE_ALIASES,
      'msg-reply',
    );

    expect(result.placeId).toBe('place-radek');
    expect(result.placeName).toBe('Radek');
  });

  it('když zpráva SAMA jmenuje odběratele, zdědění se nepoužije', async () => {
    contextRow = {
      sender_name: 'Řidič',
      participant_name: 'Řidič',
      message_timestamp: '2026-09-16T09:00:00Z',
      message_text: 'Radek\n2x50l 12sv',
      from_me: false,
      created_at: '2026-09-16T09:00:00Z',
      imported_order_id: null,
      parsed_place_id: 'place-radek',
      parsed_place_name: 'Radek',
    };
    stubParseOrderText({
      items: [
        { quantity: 5, degree: null, beer_name: 'Grep', package_label: 'Lahve 0.5l', raw_line: '5x0,5l Grep pro Malešice', place_name: 'Malešice', date: null },
      ],
      place_name: 'Malešice',
      raw_text: '5x0,5l Grep pro Malešice',
    });

    const result = await parseWhatsAppOrderMessageWithAI(
      '5x0,5l Grep pro Malešice',
      noBeers,
      noPackages,
      [{ id: 'place-malesice', name: 'Malešice' } as any],
      'Řidič',
      '2026-09-17T10:00:00Z',
      NO_ALIASES,
      NO_PLACE_ALIASES,
      'msg-reply-2',
    );

    expect(result.placeId).toBe('place-malesice');
    expect(result.placeName).toBe('Malešice');
  });
});
