// 📅 Upozornění „Předem objednané — tento týden se stáčí" nad plánem stáčení na ploše.
// Majitel 26. 11. 2026 (zpráva „Na 18.12.“, objednávka tři týdny předem): „…aplikace to musí nastavit ten
// datum a upozornit v pondělí týden kdy to má být stočený." Dnes je v testu pondělí 14. 12. 2026.
// Data i jména jsou vymyšlená (repozitář je veřejný).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import CoStocitOkno from './CoStocitOkno';

vi.mock('../lib/businessDate', async (orig) => ({
  ...(await orig<typeof import('../lib/businessDate')>()),
  businessDateISO: () => '2026-12-14',
}));
vi.mock('../lib/supabase', () => ({
  beerBg: () => '#f59e0b',
  beerName: (b: { name: string }) => b.name,
  supabase: {},
}));

const h = vi.hoisted(() => ({ data: null as any }));
vi.mock('../lib/usePlanStaceni', () => ({
  usePlanStaceni: () => ({ data: h.data, chyba: false, zPameti: false, nacti: vi.fn(), planySudy: [], planyLahve: [] }),
}));

const obj = (id: string, zadano: string, zavoz: string, misto: string, nad: Record<string, unknown> = {}) => ({
  id, order_date: zadano, delivery_date: zavoz, place_name: misto, status: 'nova', is_delivered: false, ...nad,
});

beforeEach(() => {
  cleanup();
  localStorage.clear();
  h.data = {
    beers: [{ id: 'b12', name: '12° Světlá' }],
    packages: [{ id: 'k20', label: 'KEG 20l', kind: 'keg', volume_l: 20 }, { id: 'k50', label: 'KEG 50l', kind: 'keg', volume_l: 50 }],
    orders: [
      obj('o1', '2026-11-25', '2026-12-18', 'Hospoda U Lípy'),
      obj('o2', '2026-12-10', '2026-12-16', 'Pivnice U Mostu'), // 6 dní předem — běžná objednávka
      obj('o3', '2026-11-20', '2026-12-17', 'Zrušená Hospoda', { status: 'storno' }),
    ],
    orderItems: [
      { order_id: 'o1', beer_id: 'b12', package_id: 'k20', quantity: 1 },
      { order_id: 'o2', beer_id: 'b12', package_id: 'k50', quantity: 2 },
      { order_id: 'o3', beer_id: 'b12', package_id: 'k50', quantity: 4 },
    ],
  };
});

const otevri = () => render(<CoStocitOkno setPage={vi.fn()} sudy lahve />);

describe('Co stočit — upozornění na předem objednané', () => {
  it('v pondělí týdne stáčení ukáže, kdo, kdy a co — i při sbaleném okně', () => {
    otevri();
    const upozorneni = screen.getByTestId('predem-objednane');
    expect(upozorneni.textContent).toContain('Předem objednané');
    expect(upozorneni.textContent).toContain('Hospoda U Lípy · pá 18. 12. — 1× 20l 12° Světlá');
    // Běžná objednávka (6 dní předem) a zrušená se sem nedostanou.
    expect(upozorneni.textContent).not.toContain('Pivnice U Mostu');
    expect(upozorneni.textContent).not.toContain('Zrušená Hospoda');
    // Okno samo je po otevření sbalené — upozornění je vidět i tak.
    expect(screen.getByRole('button', { name: /Co stočit/ }).getAttribute('aria-expanded')).toBe('false');
  });

  it('„Rozumím" ho schová do konce týdne i po novém načtení okna', () => {
    const { unmount } = otevri();
    fireEvent.click(within(screen.getByTestId('predem-objednane')).getByRole('button', { name: 'Rozumím' }));
    expect(screen.queryByTestId('predem-objednane')).toBeNull();
    unmount();
    otevri();
    expect(screen.queryByTestId('predem-objednane')).toBeNull();
  });

  it('nová předem objednaná objednávka ho po „Rozumím" ukáže znovu — jen ta nová', () => {
    const { unmount } = otevri();
    fireEvent.click(within(screen.getByTestId('predem-objednane')).getByRole('button', { name: 'Rozumím' }));
    unmount();
    h.data.orders.push(obj('o4', '2026-12-01', '2026-12-19', 'Čepovna U Řeky'));
    h.data.orderItems.push({ order_id: 'o4', beer_id: 'b12', package_id: 'k50', quantity: 3 });
    otevri();
    const upozorneni = screen.getByTestId('predem-objednane');
    expect(upozorneni.textContent).toContain('Čepovna U Řeky · so 19. 12. — 3× 50l 12° Světlá');
    expect(upozorneni.textContent).not.toContain('Hospoda U Lípy');
  });

  it('bez předem objednaných objednávek se nic nezobrazí', () => {
    h.data.orders = [obj('o2', '2026-12-10', '2026-12-16', 'Pivnice U Mostu')];
    otevri();
    expect(screen.queryByTestId('predem-objednane')).toBeNull();
  });

  it('zavezená objednávka z upozornění zmizí sama', () => {
    h.data.orders[0] = { ...h.data.orders[0], is_delivered: true };
    otevri();
    expect(screen.queryByTestId('predem-objednane')).toBeNull();
  });
});
