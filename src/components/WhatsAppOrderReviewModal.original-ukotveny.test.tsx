// 23. 11. 2026, majitel: „při čtení objednávek má být fotka, nebo originál
// z WhatsAppu ukotvený, a hýbat dolů jen přečtenýma položkama, aby se přečtený
// položky daly zkontrolovat s originálem."
//
// Fotka ukotvená byla (17. 11.), originál textové zprávy ne — byl součástí
// rolovaného obsahu a při rolování k položkám a ke schválení odjel pryč. Teď
// stojí mimo rolovaný obsah stejně jako fotka (na telefonu pruh nahoře, na
// širokém displeji pravá půlka okna). jsdom rolování neumí, proto se hlídá
// stavba okna; skutečné rolování hlídá e2e (scripts/e2e.mjs).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { WhatsAppOrderReviewModal } from './WhatsAppOrderReviewModal';

vi.mock('../lib/useMaleSudy', () => ({
  useMaleSudy: () => ({ zasoba: {}, nacteno: true, chybiMigrace: false, ulozit: async () => null }),
  useHlidaniMalychSudu: () => ({ souhrn: [], nadPoPolozce: new Map(), poPolozce: new Map(), nacteno: true }),
}));
vi.mock('../lib/supabase', () => {
  const dotaz = () => {
    const q: Record<string, any> = {};
    for (const m of ['select', 'eq', 'in', 'lt', 'gte', 'order', 'limit', 'range', 'not']) q[m] = () => q;
    q.maybeSingle = () => Promise.resolve({ data: null, error: null });
    q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok, ko);
    return q;
  };
  return { supabase: { from: vi.fn(() => dotaz()) } };
});
vi.mock('../lib/whatsappApi', () => ({
  ignoreWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
  updateWhatsAppParsedData: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../lib/whatsappParser', () => ({ parseWhatsAppOrderMessageWithAI: vi.fn() }));

const TEXT = 'Seeberg\n1x30l 12sv\n2x30l jantar';
const zprava = (navic: Record<string, unknown> = {}) => ({
  id: 'text-1',
  sender_name: 'Radek',
  message_text: TEXT,
  message_type: 'text',
  media_url: null,
  status: 'parsed',
  created_at: '2026-11-17T10:14:26+00:00',
  parsed_place_name: 'Seeberg',
  parsed_items: [
    { qty: 1, beer_name: '12° Světlá', package_label: '30l', raw_line: '1x30l 12sv' },
    { qty: 2, beer_name: 'Jantar', package_label: '30l', raw_line: '2x30l jantar' },
  ],
  parsed_raw_text: TEXT,
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

describe('WhatsAppOrderReviewModal — originál textové zprávy je ukotvený pro kontrolu', () => {
  it('originál stojí mimo rolovaný obsah a v okně je jen jednou', async () => {
    const { container } = vykresli(zprava());
    await waitFor(() => expect(screen.getByText('Schválit a odeslat do objednávek')).toBeTruthy());

    const ukotveny = container.querySelector('[data-original-ukotveny]') as HTMLElement;
    const rolovany = container.querySelector('[data-obsah-rolovany]') as HTMLElement;
    expect(ukotveny).toBeTruthy();
    expect(rolovany).toBeTruthy();

    // Originál je v ukotveném panelu — celý text zprávy, a nikde jinde podruhé.
    expect(screen.getAllByText('Originál zprávy')).toHaveLength(1);
    expect(ukotveny.contains(screen.getByText('Originál zprávy'))).toBe(true);
    expect(ukotveny.textContent).toContain('1x30l 12sv');
    expect(ukotveny.textContent).toContain('2x30l jantar');

    // Ukotvený panel není součástí rolované části (ani naopak) a nesmrskne se.
    expect(rolovany.contains(ukotveny)).toBe(false);
    expect(ukotveny.contains(rolovany)).toBe(false);
    expect(ukotveny.className).toContain('shrink-0');
    // Dlouhá zpráva nesmí položky vytlačit z okna: panel má strop a roluje se sám.
    expect(ukotveny.className).toContain('max-h-[34vh]');
    expect(ukotveny.className).toContain('overflow-y-auto');
    expect(rolovany.className).toContain('overflow-y-auto');

    // Rolují se jen přečtené položky a to, co je pod nimi.
    expect(rolovany.contains(screen.getByText('AI rozpoznalo z objednávky'))).toBe(true);
    expect(rolovany.contains(screen.getByText('Schválit a odeslat do objednávek'))).toBe(true);
    expect(rolovany.querySelectorAll('input[type="number"]')).toHaveLength(2);
  });

  it('v ukotveném originálu zůstává zvýraznění přečtených řádků s číslem položky', async () => {
    const { container } = vykresli(zprava());
    await waitFor(() => expect(screen.getByText('Schválit a odeslat do objednávek')).toBeTruthy());
    const ukotveny = container.querySelector('[data-original-ukotveny]') as HTMLElement;
    expect([...ukotveny.querySelectorAll('sup')].map((s) => s.textContent)).toEqual(['#1', '#2']);
  });

  it('fotka: ukotvená je fotka; popisek zprávy zůstává v rolovaném obsahu a textový panel tam není', async () => {
    const { container } = vykresli(zprava({
      id: 'fotka-1', message_type: 'image', message_text: 'Pro Radka ještě plus toto',
      media_url: 'https://xyz.supabase.co/storage/v1/object/public/whatsapp-media/incoming/wa-1.jpg',
    }));
    await waitFor(() => expect(screen.getByText('Schválit a odeslat do objednávek')).toBeTruthy());
    expect(container.querySelector('[data-original-ukotveny]')).toBeNull();
    expect(container.querySelector('[data-fotka-ukotvena]')).toBeTruthy();
    const rolovany = container.querySelector('[data-obsah-rolovany]') as HTMLElement;
    expect(screen.getAllByText('Originál zprávy')).toHaveLength(1);
    expect(rolovany.contains(screen.getByText('Originál zprávy'))).toBe(true);
  });
});
