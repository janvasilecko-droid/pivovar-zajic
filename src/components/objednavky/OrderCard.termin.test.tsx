// Štítek termínu na kartě objednávky — 5. 11. 2026: dnešní Lužec a Seeberg
// svítily ráno červeně „po termínu“, i když se teprve vezou.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Beer, Package } from '../../lib/supabase';
import { OrderCard } from './OrderCard';
import type { Order } from './spolecne';

const zaklad: Order = {
  id: 'o1', order_date: '2026-11-03', place_id: null, place_name: 'Lužec',
  source: 'whatsapp', status: 'nova', note: null, created_at: '2026-11-03T13:59:30+00:00',
  delivery_day: 'ct', delivery_date: '2026-11-05', is_prepared: false, is_packaged: false,
  is_delivered: false, delivered_at: null, whatsapp_message_id: null,
};
const noop = () => {};

function karta(o: Partial<Order>) {
  render(
    <OrderCard
      o={{ ...zaklad, ...o }} items={[]} stockRemainingForOrder={() => new Map()}
      selected={false} onToggleSelect={noop} onClick={noop} onToggleFlag={noop} onToggleItemFlag={noop}
      onUpdateDeliveryDay={noop} onSetStatus={noop} onDelete={noop} onDuplicate={noop} onEdit={noop} onSplit={noop}
      beers={[] as Beer[]} packages={[] as Package[]} places={[]}
    />,
  );
}

describe('OrderCard — termín závozu', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-05T08:30:00+01:00'));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('v den závozu „závoz dnes“, ne „po termínu“', () => {
    karta({});
    expect(screen.getByText('závoz dnes')).toBeTruthy();
    expect(screen.queryByText('po termínu')).toBeNull();
  });

  it('nezavezená objednávka z minulého dne je po termínu', () => {
    karta({ delivery_date: '2026-11-04', delivery_day: 'st' });
    expect(screen.getByText('po termínu')).toBeTruthy();
    expect(screen.queryByText('závoz dnes')).toBeNull();
  });

  it('zavezená ani budoucí objednávka štítek nemá', () => {
    karta({ is_delivered: true });
    expect(screen.queryByText('závoz dnes')).toBeNull();
    karta({ delivery_date: '2026-11-12' });
    expect(screen.queryByText('po termínu')).toBeNull();
    expect(screen.queryByText('závoz dnes')).toBeNull();
  });
});
