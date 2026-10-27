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
});
