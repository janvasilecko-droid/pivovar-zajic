// Položky u „VRÁCENÍ" se nesmí předzaškrtávat samy — z provozu 21. 9. 2026:
// „v tech vratkach je nak moc polozek, ty se nevracely... pokud bude neco
// na vraceni tak vyhod upozorneni a rucne se musi potvrdit ze se vraci plny
// sud." `pivoJeVTextu` (lib/vraceniZeZpravy.ts) je jen hrubá shoda prvních
// tří písmen kmene kdekoli ve zprávě, takže předzaškrtnutí umělo označit i
// pivo, které se ve skutečnosti nevracelo. Teď nezačíná zaškrtnuté nic —
// obsluha musí každou položku potvrdit sama.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { WhatsAppOrderReviewModal } from './WhatsAppOrderReviewModal';

vi.mock('../lib/supabase', () => {
  const stub = () => ({
    select: vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null })),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  });
  return { supabase: { from: vi.fn(() => stub()) } };
});

vi.mock('../lib/whatsappApi', () => ({
  ignoreWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
  updateWhatsAppParsedData: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/whatsappParser', () => ({
  parseWhatsAppOrderMessageWithAI: vi.fn().mockResolvedValue({
    items: [], placeId: null, placeName: null, deliveryDay: null,
    deliveryDate: null, note: null, raw_text: null,
  }),
}));

const beers = [{ id: 'b1', name: 'Osma', degree: '8°' } as any];
const packages = [{ id: 'p50', label: 'KEG 50l', volume_l: 50 } as any];
const places: any[] = [];

function renderModal(message: any) {
  render(
    <WhatsAppOrderReviewModal
      isOpen
      onClose={vi.fn()}
      message={message}
      beers={beers}
      packages={packages}
      places={places}
      onApprove={vi.fn().mockResolvedValue(undefined)}
      onReject={vi.fn().mockResolvedValue(undefined)}
      onDecision={vi.fn()}
    />
  );
}

describe('WhatsAppOrderReviewModal — vrácení nic nezačíná zaškrtnuté', () => {
  it('položka s dohledaným pivem NENÍ předzaškrtnutá a "Zapsat jako vrácení" ukazuje 0 ks, dokud se ručně nezaškrtne', async () => {
    renderModal({
      id: 'vraceni-1',
      sender_name: 'Odběratel',
      message_text: 'Tady vrací 1x50l. Vosmy',
      message_type: 'text',
      status: 'parsed',
      created_at: '2026-09-21T08:00:00+00:00',
      parsed_items: [
        { beer_id: 'b1', pkg_id: 'p50', qty: 1, beer_name: 'Osma', package_label: 'KEG 50l', raw_line: '1x50l vosmy' },
      ],
      parsed_raw_text: null,
    });

    await waitFor(() => expect(screen.getByText('Vypadá to na VRÁCENÍ piva, ne na objednávku')).toBeTruthy());

    // Řádek s pivem je vidět (dojde asynchronně — položky se dopočítávají
    // přes matchBeerFromHints/matchPackage po načtení aliasů).
    let radek: HTMLElement;
    await waitFor(() => { radek = screen.getByText('1× KEG 50l Osma'); expect(radek).toBeTruthy(); });

    // …ale checkbox toho řádku je nezaškrtnutý a tlačítko ukazuje 0 ks.
    const checkbox = radek!.closest('label')!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(screen.getByText('Zapsat jako vrácení (0 ks)')).toBeTruthy();
    expect(screen.getByText('Zapsat jako vrácení (0 ks)').closest('button')).toBeDisabled();

    // Po ručním zaškrtnutí se položka započte.
    fireEvent.click(checkbox!);
    await waitFor(() => expect(screen.getByText('Zapsat jako vrácení (1 ks)')).toBeTruthy());
    expect(screen.getByText('Zapsat jako vrácení (1 ks)').closest('button')).not.toBeDisabled();
  });
});
