import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const zprava = {
  id: 'w1',
  created_at: '2026-10-27T08:00:00Z',
  sender_name: 'Radek',
  message_text: 'Seeberg na čtvrtek 4x30 12sv',
  message_type: 'text',
  status: 'parsed' as const,
  parsed_place_name: 'Seeberg',
  parsed_delivery_day: 'čtvrtek',
  parsed_delivery_date: '2026-10-29',
  parsed_items: [
    { qty: 4, beer_name: '12° Světlá', package_label: '30 l', raw_line: '4x30 12sv' },
  ],
};

const fetchPending = vi.hoisted(() => vi.fn());
const fetchRecent = vi.hoisted(() => vi.fn());

vi.mock('../lib/whatsappApi', () => ({
  fetchPendingWhatsAppMessages: (...args: unknown[]) => fetchPending(...args),
  fetchRecentWhatsAppMessages: (...args: unknown[]) => fetchRecent(...args),
  updateWhatsAppMessageStatus: vi.fn().mockResolvedValue(undefined),
  fetchWhatsAppSenders: vi.fn().mockResolvedValue([]),
  isSenderAllowed: () => true,
}));

vi.mock('../lib/whatsappParser', () => ({
  parseWhatsAppOrderMessageWithAI: vi.fn(),
}));

import { WhatsAppAutoProcessorModal } from './WhatsAppAutoProcessorModal';

describe('WhatsAppAutoProcessorModal — přehled čtení', () => {
  beforeEach(() => {
    fetchPending.mockReset();
    fetchRecent.mockReset();
    fetchPending.mockResolvedValue([zprava]);
    fetchRecent.mockResolvedValue([]);
  });

  it('ukáže místo, den a položky a neukáže opakované chyby čtení z historie', async () => {
    render(
      <WhatsAppAutoProcessorModal
        isOpen
        onClose={vi.fn()}
        beers={[]}
        packages={[]}
        places={[]}
        onImport={vi.fn()}
      />
    );
    expect(screen.getByText('Čtení objednávek z WhatsAppu')).toBeTruthy();
    await waitFor(() => expect(fetchPending).toHaveBeenCalled(), { timeout: 4000 });
    expect(await screen.findByText('Seeberg', {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByText(/čtvrtek/)).toBeTruthy();
    expect(screen.getByText(/4× 12° Světlá 30 l/)).toBeTruthy();
    expect(screen.getByText('Otevřít →')).toBeTruthy();
    expect(screen.queryByText(/Opakované chyby čtení/)).toBeNull();
    expect(screen.queryByText(/opakovaná chyba/i)).toBeNull();
    expect(fetchRecent).not.toHaveBeenCalled();
  });

  it('17. 11. 2026: fotka čekající na další pokus čtení není „chyba" — jantarově a s vysvětlením; skutečná chyba zůstává červená', async () => {
    const fotka = {
      ...zprava, id: 'w2', message_type: 'image', message_text: '📷 Fotka objednávky (bez popisu)', status: 'pending' as const,
      parsed_place_name: null, parsed_delivery_day: null, parsed_delivery_date: null, parsed_items: null,
      media_url: 'https://xyz.supabase.co/storage/v1/object/public/whatsapp-media/incoming/wa-1.jpg',
      error_message: 'AI je teď přetížená — zkusí se znovu automaticky za pár minut. (pokus 2026-11-17T09:35:07.000Z)',
    };
    const spadla = { ...fotka, id: 'w3', status: 'error' as const, error_message: 'Parse API error: 546' };
    fetchPending.mockResolvedValue([fotka, spadla]);
    render(<WhatsAppAutoProcessorModal isOpen onClose={vi.fn()} beers={[]} packages={[]} places={[]} onImport={vi.fn()} />);
    const ceka = await screen.findByText(/čtení se samo zkouší znovu každé 3 minuty \(naposledy v 10:35\)/, {}, { timeout: 4000 });
    expect(ceka.getAttribute('data-stav-cteni')).toBe('ceka');
    expect(ceka.className).toContain('text-amber-900');
    expect(ceka.className).not.toContain('text-rose-800');
    const chyba = screen.getByText('Čtení je teď přetížené. Zkuste znovu za chvíli.');
    expect(chyba.getAttribute('data-stav-cteni')).toBe('chyba');
    expect(chyba.className).toContain('text-rose-800');
    expect(screen.queryByText(/Parse API error/)).toBeNull();
    expect(screen.queryByText(/pokus 2026-11-17T/)).toBeNull();
  });
});
