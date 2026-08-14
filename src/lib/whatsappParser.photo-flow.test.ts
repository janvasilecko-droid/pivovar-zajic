// Skutečné čtení FOTKY přes parseWhatsAppOrderMessageWithAI — ŽÁDNÝ mock parsovače.
// Scénáře (reprodukce hlášené chyby „Cannot read properties of null“ při načítání fotky):
//  1. fotka bez popisku → client stáhne fotku, pošle imageBase64, edge vrátí položky → nesmí spadnout
//  2. edge funkce vrátí 500 „Cannot read properties…“ → funkce hodí chybu s tímto textem (žádný vlastní pád)
//  3. fotka bez media_url (médium nedoručeno) → čistá HTTP 400, ne pád
import { describe, it, expect, vi, beforeEach } from 'vitest';

// supabase klient se v testech nemá dotazovat (žádné VITE_* proměnné) — zamaskujeme.
vi.mock('./supabase', () => {
  const chainable = () => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  });
  const supabase = { from: vi.fn(() => chainable()) };
  return { supabase };
});

import { parseWhatsAppOrderMessageWithAI } from './whatsappParser';

// 1×1 PNG (validní obrázek pro Blob/FileReader).
const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function pngBlob(): Blob {
  const bin = atob(PNG_1X1_BASE64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'image/png' });
}

const PHOTO_URL = 'https://xyz.supabase.co/storage/v1/object/public/whatsapp-media/incoming/wa-1.png';

const noBeers: any[] = [];
const noPackages: any[] = [];
const noPlaces: any[] = [];

describe('parseWhatsAppOrderMessageWithAI — čtení fotky (reálný kód, mock jen fetch/supabase)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('1. fotka bez popisku: stáhne fotku → pošle imageBase64 → vrátí položky, nespadne', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === PHOTO_URL) {
        return new Response(pngBlob(), { status: 200, headers: { 'Content-Type': 'image/png' } });
      }
      if (url.endsWith('/functions/v1/parse-order-text')) {
        const body = JSON.parse(String(init?.body));
        expect(body.imageBase64).toBeTruthy();
        expect(body.imageMimeType).toBe('image/png');
        return new Response(
          JSON.stringify({
            items: [
              {
                quantity: 2,
                degree: '12°',
                beer_name: 'Světlý ležák 12°',
                package_label: 'KEG 30l',
                raw_line: '2x KEG30 12sv',
                place_name: null,
                date: null,
              },
            ],
            place_name: 'U Dubu',
            raw_text: '2x KEG30 12sv',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Neočekávaný fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await parseWhatsAppOrderMessageWithAI(
      '',
      noBeers,
      noPackages,
      noPlaces,
      'Foto Odesílatel',
      '2026-08-01T10:00:00Z',
      undefined,
      undefined,
      'msg-1',
      PHOTO_URL
    );

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.raw_text).toBe('2x KEG30 12sv');
    // loadWhatsAppImageForAI volá fetch(imageUrl) bez init — stačí ověřit, že
    // se fotka opravdu stahovala (args se liší podle volání; jen URL sedí).
    expect(fetchMock.mock.calls.some(([url]) => url === PHOTO_URL)).toBe(true);
  });

  it('2. edge funkce vrátí 500 „Cannot read properties of null…“ → funkce hodí chybu s tímto textem (žádný vlastní pád)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === PHOTO_URL) {
          return new Response(pngBlob(), { status: 200, headers: { 'Content-Type': 'image/png' } });
        }
        if (url.endsWith('/functions/v1/parse-order-text')) {
          return new Response(JSON.stringify({ error: "Cannot read properties of null (reading 'replace')" }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`Neočekávaný fetch: ${url}`);
      })
    );

    await expect(
      parseWhatsAppOrderMessageWithAI('', noBeers, noPackages, noPlaces, 'Odesílatel', null, undefined, undefined, 'msg-1', PHOTO_URL)
    ).rejects.toThrow(/Cannot read properties of null/);
  });

  it('3. fotka bez media_url (médium nedoručeno) → čistá HTTP 400, ne pád', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/functions/v1/parse-order-text')) {
          return new Response(JSON.stringify({ error: 'Missing rawText or imageBase64' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`Neočekávaný fetch: ${url}`);
      })
    );

    await expect(
      parseWhatsAppOrderMessageWithAI('', noBeers, noPackages, noPlaces, 'Odesílatel', null, undefined, undefined, 'msg-1', null)
    ).rejects.toThrow(/HTTP 400/);
  });
});
