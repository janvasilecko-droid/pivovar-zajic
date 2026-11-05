// 📍 Karta objednávky: kam se veze — jen u odběratele s víc místy (Radek: Praha / Hradec).
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Beer, Package, Place } from '../../lib/supabase';
import { OrderCard } from './OrderCard';
import type { Order } from './spolecne';

const RADEK = {
  id: 'radek', name: 'Radek', note: null, created_at: '', address: 'Korunní 10, Praha 2', phone: null, opening_hours: null,
  mista_zavozu: [{ id: 'hk', nazev: 'Hradec', adresa: null, lat: 50.2092, lng: 15.8328 }],
} as Place;
const zaklad: Order = {
  id: 'o1', order_date: '2026-11-03', place_id: 'radek', place_name: 'Radek', source: 'whatsapp', status: 'nova',
  note: null, created_at: '2026-11-03T10:00:00Z', delivery_day: 'ct', delivery_date: '2026-11-12',
  is_prepared: false, is_packaged: false, is_delivered: false, delivered_at: null,
};
const noop = () => {};
function karta(o: Partial<Order>, places: Place[] = [RADEK]) {
  render(
    <OrderCard
      o={{ ...zaklad, ...o }} items={[]} stockRemainingForOrder={() => new Map()}
      selected={false} onToggleSelect={noop} onClick={noop} onToggleFlag={noop} onToggleItemFlag={noop}
      onUpdateDeliveryDay={noop} onSetStatus={noop} onDelete={noop} onDuplicate={noop} onEdit={noop} onSplit={noop}
      beers={[] as Beer[]} packages={[] as Package[]} places={places}
    />,
  );
}

describe('OrderCard — místo závozu', () => {
  it('zvolené místo je vidět', () => {
    karta({ misto_zavozu: 'hk' });
    expect(screen.getByText('Hradec')).toBeTruthy();
    expect(screen.queryByText(/kam\?/)).toBeNull();
  });

  it('nevybrané místo se ukáže jako otázka s možnostmi', () => {
    karta({ misto_zavozu: null });
    expect(screen.getByText(/kam\? Praha \/ Hradec/)).toBeTruthy();
  });

  it('běžný odběratel (nebo data před migrací) štítek nemá', () => {
    karta({ place_id: 'luzec', place_name: 'Lužec' }, [{ ...RADEK, id: 'luzec', name: 'Lužec', mista_zavozu: undefined }]);
    expect(screen.queryByText(/kam\?/)).toBeNull();
    expect(screen.queryByText('Hradec')).toBeNull();
  });
});
