// Z provozu 2. 10. 2026: „zase mám objednávku a nejde potvrdit" a hned nato
// „dej tam to tlačítko schválit permanentně, musí jít vždy schválit a odeslat
// do objednávek". Zpráva se slovem „vrátíme" se brala jako vrácení piva
// a Schválit bylo zamčené natvrdo. Teď je Schválit použitelné vždycky; co
// appce nesedí, napíše do dotazu „Přesto schválit?".
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

vi.mock('../lib/whatsappParser', () => ({
  parseWhatsAppOrderMessageWithAI: vi.fn().mockResolvedValue({
    items: [], placeId: null, placeName: null, deliveryDay: null,
    deliveryDate: null, note: null, raw_text: null,
  }),
}));

const beers = [{ id: 'b1', name: 'Osma', degree: '8°' } as any];
const packages = [{ id: 'p50', label: 'KEG 50l', volume_l: 50 } as any];
const places: any[] = [];

function renderModal(message: any, onApprove = vi.fn().mockResolvedValue(undefined)) {
  render(
    <WhatsAppOrderReviewModal
      isOpen
      onClose={vi.fn()}
      message={message}
      beers={beers}
      packages={packages}
      places={places}
      onApprove={onApprove}
      onReject={vi.fn().mockResolvedValue(undefined)}
      onDecision={vi.fn()}
    />
  );
}

const ZPRAVA = {
  id: 'obj-vratime-1',
  sender_name: 'Odběratel',
  message_text: 'Na pátek 1x50 osma, vrátíme 2 prázdné sudy',
  message_type: 'text',
  status: 'parsed',
  created_at: '2026-10-02T08:00:00+00:00',
  parsed_items: [
    { beer_id: 'b1', pkg_id: 'p50', qty: 1, beer_name: 'Osma', package_label: 'KEG 50l', raw_line: '1x50 osma' },
  ],
  parsed_raw_text: null,
};

describe('WhatsAppOrderReviewModal — Schválit jde vždycky', () => {
  it('i když zpráva vypadá na vrácení: tlačítko není zamčené, varování je v dotazu a po „Přesto" se odešle', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderModal(ZPRAVA, onApprove);

    await waitFor(() => expect(screen.getByText('Vypadá to na VRÁCENÍ piva, ne na objednávku')).toBeTruthy());
    const schvalit = screen.getByText('Schválit a odeslat do objednávek').closest('button')!;
    expect(schvalit).not.toBeDisabled();

    fireEvent.click(schvalit);
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0][0]).toMatch(/VRÁCENÍ/);
    confirm.mockRestore();
  });

  it('„Přesto schválit" zrušené = nic se neodešle', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderModal(ZPRAVA, onApprove);
    await waitFor(() => expect(screen.getByText('Schválit a odeslat do objednávek')).toBeTruthy());
    fireEvent.click(screen.getByText('Schválit a odeslat do objednávek').closest('button')!);
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(onApprove).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('„Není to vrácení" schová panel vrácení', async () => {
    renderModal(ZPRAVA);
    await waitFor(() => expect(screen.getByText('Vypadá to na VRÁCENÍ piva, ne na objednávku')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Není to vrácení — je to objednávka' }));
    await waitFor(() => expect(screen.queryByText('Vypadá to na VRÁCENÍ piva, ne na objednávku')).toBeNull());
  });
});
