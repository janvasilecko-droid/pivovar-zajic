// 17. 11. 2026, majitel (se snímkem okna „Čtení objednávky"): „Ta fotka tam má
// být ukotvená pro kontrolu." Fotka byla součástí rolovaného obsahu — při
// rolování k položkám a ke schválení odjela nahoru a nebylo s čím porovnávat.
// Teď stojí mimo rolovaný obsah (na telefonu pruh nahoře, na širokém displeji
// pravá půlka okna). jsdom rolování neumí, proto se hlídá stavba okna: fotka
// nesmí být uvnitř rolované části.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { WhatsAppOrderReviewModal } from './WhatsAppOrderReviewModal';

vi.mock('../lib/useMaleSudy', () => ({
  useMaleSudy: () => ({ zasoba: {}, nacteno: true, chybiMigrace: false, ulozit: async () => null }),
  useHlidaniMalychSudu: () => ({ souhrn: [], nadPoPolozce: new Map(), poPolozce: new Map(), nacteno: true }),
}));
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
vi.mock('../lib/whatsappParser', () => ({ parseWhatsAppOrderMessageWithAI: vi.fn() }));

const FOTKA = 'https://xyz.supabase.co/storage/v1/object/public/whatsapp-media/incoming/wa-1.jpg';
const zprava = (navic: Record<string, unknown> = {}) => ({
  id: 'fotka-1',
  sender_name: 'Radek',
  message_text: '📷 Fotka objednávky (bez popisu)',
  message_type: 'image',
  media_url: FOTKA,
  status: 'parsed',
  created_at: '2026-11-17T09:32:41+00:00',
  parsed_place_name: 'Sklad',
  parsed_items: [
    { qty: 9, beer_name: '10° Desítka', package_label: '30l', raw_line: '9x 30l 10°' },
    { qty: 9, beer_name: '11° Světlá', package_label: '30l', raw_line: '9x 30 11° SV.' },
  ],
  parsed_raw_text: 'SKLAD\n9x 30l 10°\n9x 30 11° SV.',
  ...navic,
});

function vykresli(message: Record<string, unknown>) {
  return render(
    <WhatsAppOrderReviewModal
      isOpen
      onClose={vi.fn()}
      message={message as never}
      beers={[]}
      packages={[]}
      places={[]}
      onApprove={vi.fn().mockResolvedValue(undefined)}
      onReject={vi.fn().mockResolvedValue(undefined)}
      onDecision={vi.fn()}
    />,
  );
}

describe('WhatsAppOrderReviewModal — fotka objednávky je ukotvená pro kontrolu', () => {
  it('fotka stojí mimo rolovaný obsah: při rolování k položkám a ke schválení zůstává vidět', async () => {
    const { container } = vykresli(zprava());
    await waitFor(() => expect(screen.getByText('Schválit a odeslat do objednávek')).toBeTruthy());

    const ukotvena = container.querySelector('[data-fotka-ukotvena]') as HTMLElement;
    const rolovany = container.querySelector('[data-obsah-rolovany]') as HTMLElement;
    expect(ukotvena).toBeTruthy();
    expect(rolovany).toBeTruthy();

    // Fotka je v ukotveném panelu a v okně jen jednou.
    const fotky = screen.getAllByAltText('Fotka objednávky');
    expect(fotky).toHaveLength(1);
    expect(fotky[0].getAttribute('src')).toBe(FOTKA);
    expect(ukotvena.contains(fotky[0])).toBe(true);

    // Rolovaná část fotku neobsahuje a ukotvený panel není její součástí (ani naopak).
    expect(rolovany.querySelector('img[alt="Fotka objednávky"]')).toBeNull();
    expect(rolovany.contains(ukotvena)).toBe(false);
    expect(ukotvena.contains(rolovany)).toBe(false);
    expect(rolovany.className).toContain('overflow-y-auto');
    // Panel se nesmí smrsknout, když je obsah dlouhý.
    expect(ukotvena.className).toContain('shrink-0');

    // Položky, originál zprávy i schválení se rolují pod/vedle fotky.
    expect(rolovany.contains(screen.getByText('AI rozpoznalo z objednávky'))).toBe(true);
    expect(rolovany.contains(screen.getByText('Originál zprávy'))).toBe(true);
    expect(rolovany.contains(screen.getByText('Schválit a odeslat do objednávek'))).toBe(true);
    expect(rolovany.contains(screen.getByText('Zkontrolovat fotku a potvrdit'))).toBe(true);
  });

  it('textová zpráva žádný ukotvený panel s fotkou nemá', async () => {
    const { container } = vykresli(zprava({ id: 'text-1', message_type: 'text', media_url: null, message_text: 'Sklad 9x30 10°' }));
    await waitFor(() => expect(screen.getByText('Schválit a odeslat do objednávek')).toBeTruthy());
    expect(container.querySelector('[data-fotka-ukotvena]')).toBeNull();
    expect(container.querySelector('[data-obsah-rolovany]')).toBeTruthy();
    expect(screen.queryByAltText('Fotka objednávky')).toBeNull();
  });

  it('fotka, která nedorazila (bez odkazu na médium): žádný prázdný ukotvený panel, jen hláška', async () => {
    const { container } = vykresli(zprava({ id: 'fotka-2', media_url: null }));
    await waitFor(() => expect(screen.getByText(/médium nebylo doručeno/)).toBeTruthy());
    expect(container.querySelector('[data-fotka-ukotvena]')).toBeNull();
  });
});
