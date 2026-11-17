// Po ručním „Znovu parsovat" nesmí u přečtené zprávy zůstat svítit stará chyba
// čtení (17. 11. 2026: „Parse API error: 546" u fotky, kterou pak obsluha
// přečetla ručně — seznam by ji dál ukazoval červeně jako nepřečtenou).
import { describe, it, expect, vi } from 'vitest';

const zapis = vi.hoisted(() => ({ tabulka: '', patch: null as Record<string, unknown> | null, id: '' }));
vi.mock('./supabase', () => ({
  supabase: {
    from: (tabulka: string) => ({
      update: (patch: Record<string, unknown>) => ({
        eq: (_sloupec: string, id: string) => {
          Object.assign(zapis, { tabulka, patch, id });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  },
}));

import { updateWhatsAppParsedData } from './whatsappApi';

describe('updateWhatsAppParsedData — zápis ručně přečtené zprávy', () => {
  it('zpráva je přečtená a stará chyba čtení se maže', async () => {
    await updateWhatsAppParsedData('zprava-1', { parsedItems: [], parsedPlaceName: 'Sklad', parsedRawText: 'SKLAD' });
    expect(zapis.tabulka).toBe('whatsapp_incoming');
    expect(zapis.id).toBe('zprava-1');
    expect(zapis.patch).toMatchObject({ status: 'parsed', error_message: null, parsed_place_name: 'Sklad', parsed_raw_text: 'SKLAD' });
  });
});
