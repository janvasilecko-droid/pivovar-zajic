// Křížek ✕ na smazání položky v modálu kontroly WhatsApp objednávky.
// Scénáře:
//  1. smazání odebere položku z editačního seznamu i z kontroly čtení; do
//     databáze se zapíše až při schválení (zavřením bez schválení se nic neztratí)
//  2. po smazání všech položek nejde objednávku schválit
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { WhatsAppOrderReviewModal } from './WhatsAppOrderReviewModal';
import { updateWhatsAppParsedData } from '../lib/whatsappApi';

vi.mock('../lib/supabase', () => {
  const stub = () => ({
    select: vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null })),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  });
  const supabase = { from: vi.fn(() => stub()) };
  return { supabase };
});

vi.mock('../lib/whatsappApi', () => ({
  ignoreWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
  updateWhatsAppParsedData: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/whatsappParser', () => ({
  parseWhatsAppOrderMessageWithAI: vi.fn(),
}));

const beers: any[] = [
  { id: 'beer-12', name: 'Světlý ležák 12°' },
  { id: 'beer-summer', name: 'Summer' },
];
const packages: any[] = [
  { id: 'pkg-keg30', name: 'KEG 30l', label: 'KEG 30l', kind: 'keg', volume_l: 30 },
  { id: 'pkg-pet', name: 'PET', label: 'PET', kind: 'bottle', volume_l: 1.5 },
];
const places: any[] = [];

const parsedMessage = {
  id: 'del-item-1',
  sender_name: 'Pivovar',
  message_text: '2x KEG30 12sv\n4x Summer PET',
  message_type: 'text',
  status: 'parsed',
  created_at: '2026-08-01T10:00:00+00:00',
  parsed_items: [
    { qty: 2, degree: '12°', beer_name: 'Světlý ležák 12°', package_label: 'KEG 30l', raw_line: '2x KEG30 12sv' },
    { qty: 4, degree: null, beer_name: 'Summer', package_label: 'PET', raw_line: '4x Summer PET' },
  ],
  parsed_raw_text: '2x KEG30 12sv\n4x Summer PET',
};

function renderModal(message: any) {
  const onApprove = vi.fn().mockResolvedValue(undefined);
  const onReject = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const onDecision = vi.fn();
  render(
    <WhatsAppOrderReviewModal
      isOpen
      onClose={onClose}
      message={message}
      beers={beers}
      packages={packages}
      places={places}
      onApprove={onApprove}
      onReject={onReject}
      onDecision={onDecision}
    />
  );
  return { onApprove, onReject, onClose, onDecision };
}

describe('WhatsAppOrderReviewModal — křížek na smazání položky', () => {
  beforeEach(() => {
    localStorage.clear();
    window.confirm = vi.fn(() => true);
    vi.clearAllMocks();
  });

  it('1. křížek smaže položku ze seznamu i čtení a do DB ji zapíše až při schválení', async () => {
    const { onApprove } = renderModal(parsedMessage);
    const upd = updateWhatsAppParsedData as unknown as ReturnType<typeof vi.fn>;

    // Obě položky se načtou (vstup množství má roli spinbutton).
    await waitFor(() => expect(screen.queryAllByRole('spinbutton')).toHaveLength(2));
    expect(screen.getByText(/Všechny položky sedí \(2\/2\)/)).toBeTruthy();

    // Před schválením se nic neukládá — smazání je jen lokální.
    expect(upd).not.toHaveBeenCalled();

    // Smazání první položky křížkem.
    fireEvent.click(screen.getAllByLabelText('Smazat položku')[0]);

    // Zůstane jen jedna položka a kontrola čtení se přepočítá (1/1).
    await waitFor(() => expect(screen.queryAllByRole('spinbutton')).toHaveLength(1));
    expect(screen.getByText(/Všechny položky sedí \(1\/1\)/)).toBeTruthy();
    // Smazaná raw_line už není mezi položkami (přepis AI ji stále obsahuje, proto cíleně na status řádek).
    expect(screen.queryByText(/AI četla z originálu: „2x KEG30 12sv/)).toBeNull();
    expect(screen.getByText(/AI četla z originálu: „4x Summer PET/)).toBeTruthy();

    // Schválení → do importu i do DB jde už jen zbylá položka.
    fireEvent.click(screen.getByText('Schválit a importovat'));
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));

    const approveArg = onApprove.mock.calls[0][0];
    expect(approveArg.parsed_items).toHaveLength(1);
    expect(approveArg.parsed_items[0].raw_line).toBe('4x Summer PET');

    const parsedItemsCall = upd.mock.calls.find(
      (c: any) => c[0] === 'del-item-1' && c[1] && Array.isArray(c[1].parsedItems)
    );
    expect(parsedItemsCall).toBeTruthy();
    expect(parsedItemsCall[1].parsedItems).toHaveLength(1);
    expect(parsedItemsCall[1].parsedItems[0].raw_line).toBe('4x Summer PET');
  });

  it('2. po smazání všech položek nelze objednávku schválit', async () => {
    renderModal(parsedMessage);
    await waitFor(() => expect(screen.queryAllByRole('spinbutton')).toHaveLength(2));

    fireEvent.click(screen.getAllByLabelText('Smazat položku')[0]);
    await waitFor(() => expect(screen.queryAllByRole('spinbutton')).toHaveLength(1));

    // Po překreslení dotazujeme křížky znovu (starý DOM uzel už není připojený).
    fireEvent.click(screen.getAllByLabelText('Smazat položku')[0]);
    await waitFor(() => expect(screen.queryAllByRole('spinbutton')).toHaveLength(0));

    const disabledBtn = await screen.findByText('Žádné položky…');
    expect((disabledBtn.closest('button') as HTMLButtonElement).disabled).toBe(true);
  });
});
