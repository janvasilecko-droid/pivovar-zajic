// „Bez závozu" na kartě objednávky — zadání 23. 11. 2026: „ať jde v objednávkách
// líp vidět, jestli je objednávka bez závozu" (Egon, Martin, Jitka, Toužim).
// Majitel vybral variantu A: černý štítek na místě dne s autem a tlačítko „Bez"
// v řádku Závoz. Do té doby karta sloupec `no_delivery` neukazovala vůbec.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Beer, Package } from '../../lib/supabase';
import { OrderCard } from './OrderCard';
import type { Order } from './spolecne';

const zaklad: Order = {
  id: 'o1', order_date: '2026-11-23', place_id: null, place_name: 'MARTIN',
  source: 'rucne', status: 'nova', note: null, created_at: '2026-11-23T08:00:00+00:00',
  delivery_day: 'po', delivery_date: '2026-11-23', is_prepared: false, is_packaged: false,
  is_delivered: false, delivered_at: null, whatsapp_message_id: null, zavoz_cislo: 1,
};
const noop = () => {};

function karta(o: Partial<Order>, extra: Partial<React.ComponentProps<typeof OrderCard>> = {}) {
  const props = {
    o: { ...zaklad, ...o }, items: [], stockRemainingForOrder: () => new Map<string, number>(),
    selected: false, onToggleSelect: noop, onClick: noop, onToggleFlag: noop, onToggleItemFlag: noop,
    onUpdateDeliveryDay: vi.fn(), onUpdateZavoz: vi.fn(), onPrepniBezZavozu: vi.fn(),
    onSetStatus: noop, onDelete: noop, onEdit: noop, onSplit: noop,
    beers: [] as Beer[], packages: [] as Package[], places: [],
    ...extra,
  } as React.ComponentProps<typeof OrderCard>;
  render(<OrderCard {...props} />);
  return props;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-23T08:30:00+01:00'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('OrderCard — bez závozu', () => {
  it('objednávka bez závozu má černý štítek „Bez závozu" a štítek dne s autem nemá', () => {
    karta({ no_delivery: true });
    expect(screen.getByTestId('stitek-bez-zavozu').textContent).toContain('Bez závozu');
    expect(screen.queryByTestId('stitek-dne-zavozu')).toBeNull();
    // Černý proužek na kraji karty místo barvy dne.
    expect(screen.getByTestId('prouzek-bez-zavozu')).toBeTruthy();
  });

  it('objednávka se závozem ukazuje den jako dřív a štítek „Bez závozu" nemá', () => {
    karta({ no_delivery: false });
    expect(screen.queryByTestId('stitek-bez-zavozu')).toBeNull();
    expect(screen.getByTestId('stitek-dne-zavozu').textContent).toContain('Po');
    expect(screen.queryByTestId('prouzek-bez-zavozu')).toBeNull();
  });

  it('starší řádek bez sloupce no_delivery je se závozem', () => {
    karta({ no_delivery: undefined });
    expect(screen.queryByTestId('stitek-bez-zavozu')).toBeNull();
    expect(screen.getByTestId('stitek-dne-zavozu')).toBeTruthy();
  });

  it('v den odběru je „odběr dnes", ne „závoz dnes"', () => {
    karta({ no_delivery: true });
    expect(screen.getByText('odběr dnes')).toBeTruthy();
    expect(screen.queryByText('závoz dnes')).toBeNull();
    cleanup();
    karta({ no_delivery: false });
    expect(screen.getByText('závoz dnes')).toBeTruthy();
    expect(screen.queryByText('odběr dnes')).toBeNull();
  });

  it('po termínu zůstává u obou stejné (nevyzvednuté pivo je taky po termínu)', () => {
    karta({ no_delivery: true, delivery_date: '2026-11-20', delivery_day: 'pa' });
    expect(screen.getByText('po termínu')).toBeTruthy();
  });

  describe('tlačítko „Bez" v řádku Závoz', () => {
    it('klepnutí přepne bez závozu (volá onPrepniBezZavozu s objednávkou)', () => {
      const p = karta({ no_delivery: false });
      const tl = screen.getByTestId('prepni-bez-zavozu');
      expect(tl.getAttribute('aria-pressed')).toBe('false');
      fireEvent.click(tl);
      expect(p.onPrepniBezZavozu).toHaveBeenCalledTimes(1);
      expect((p.onPrepniBezZavozu as ReturnType<typeof vi.fn>).mock.calls[0][0].id).toBe('o1');
    });

    it('u objednávky bez závozu je zmáčknuté a klepnutí ji vrací do závozu', () => {
      const p = karta({ no_delivery: true });
      const tl = screen.getByTestId('prepni-bez-zavozu');
      expect(tl.getAttribute('aria-pressed')).toBe('true');
      expect(tl.getAttribute('aria-label')).toMatch(/vrátit do závozu/);
      fireEvent.click(tl);
      expect(p.onPrepniBezZavozu).toHaveBeenCalledTimes(1);
    });

    it('klepnutí nespustí otevření detailu karty', () => {
      const onClick = vi.fn();
      karta({ no_delivery: false }, { onClick });
      fireEvent.click(screen.getByTestId('prepni-bez-zavozu'));
      expect(onClick).not.toHaveBeenCalled();
    });

    it('bez obsluhy se tlačítko neukáže, štítek ano', () => {
      karta({ no_delivery: true }, { onPrepniBezZavozu: undefined });
      expect(screen.queryByTestId('prepni-bez-zavozu')).toBeNull();
      expect(screen.getByTestId('stitek-bez-zavozu')).toBeTruthy();
    });
  });

  describe('dny v řádku Závoz u objednávky bez závozu', () => {
    const dnyTlacitka = () => screen.getAllByRole('button').filter((b) => /^(Po|Út|St|Čt|Pá)$/.test(b.textContent ?? ''));

    it('žádný den není zvýrazněný — objednávka nejede', () => {
      karta({ no_delivery: true, delivery_day: 'po' });
      const dny = dnyTlacitka();
      expect(dny).toHaveLength(5);
      expect(dny.every((b) => !b.className.includes('btn-den-aktivni'))).toBe(true);
    });

    it('u objednávky se závozem je vybraný den zvýrazněný', () => {
      karta({ no_delivery: false, delivery_day: 'po' });
      const po = dnyTlacitka().find((b) => b.textContent === 'Po')!;
      expect(po.className).toContain('btn-den-aktivni');
    });

    it('klepnutí na den (i na „vybraný") nastaví ten den — nezruší ho', () => {
      const p = karta({ no_delivery: true, delivery_day: 'po' });
      fireEvent.click(dnyTlacitka().find((b) => b.textContent === 'Po')!);
      expect(p.onUpdateDeliveryDay).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }), 'po');
    });

    it('u objednávky se závozem klepnutí na vybraný den ho zruší (jako dřív)', () => {
      const p = karta({ no_delivery: false, delivery_day: 'po' });
      fireEvent.click(dnyTlacitka().find((b) => b.textContent === 'Po')!);
      expect(p.onUpdateDeliveryDay).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }), '');
    });

    it('číslo závozu (1.z / 2.z) se u objednávky bez závozu neukazuje', () => {
      karta({ no_delivery: true, delivery_day: 'po' });
      expect(screen.queryByText('1.z')).toBeNull();
      expect(screen.queryByText('2.z')).toBeNull();
      cleanup();
      karta({ no_delivery: false, delivery_day: 'po' });
      expect(screen.getByText('1.z')).toBeTruthy();
      expect(screen.getByText('2.z')).toBeTruthy();
    });
  });
});
