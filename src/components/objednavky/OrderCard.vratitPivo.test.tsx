// ↩️ „Vrátit pivo" na kartě objednávky — zadání 21. 9. 2026: „v prehledu
// obednavet dej tlacitko vratit pivo, kdyz se da vratit pivo, obednavka
// zustane stejna ale pribude radek kde bude vraceny pivo, naprikal 5x30 a
// 1x 30vracen, ale bude tam i napsano ze se pocita 4x30 a 1x30 vraceno do
// skladu."
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderCard } from './OrderCard';
import type { Order, OrderItem } from './spolecne';

const order: Order = {
  id: 'o1', order_date: '2026-09-15', place_id: 'm1', place_name: 'Lužec',
  source: 'manual', status: 'nova', note: null, created_at: '2026-09-15T10:00:00+00:00',
  delivery_day: 'po', delivery_date: null, is_prepared: false, is_packaged: false,
  is_delivered: true, delivered_at: null,
};

const item: OrderItem = {
  id: 'i1', order_id: 'o1', beer_id: 'b1', beer_name: '12° Světlé',
  package_id: 'p1', package_label: 'KEG 30l', quantity: 5,
  is_prepared: false, is_bottled: false,
};

const noop = () => {};

function renderCard(extra: Partial<React.ComponentProps<typeof OrderCard>> = {}) {
  render(
    <OrderCard
      o={order}
      items={[item]}
      stockRemainingForOrder={() => new Map()}
      selected={false}
      onToggleSelect={noop}
      onClick={noop}
      onToggleFlag={noop}
      onToggleItemFlag={noop}
      onUpdateDeliveryDay={noop}
      onSetStatus={noop}
      onDelete={noop}
      onDuplicate={noop}
      onEdit={noop}
      onSplit={noop}
      beers={[{ id: 'b1', name: '12° Světlé' } as any]}
      packages={[{ id: 'p1', label: 'KEG 30l', kind: 'keg', volume_l: 30, sort_order: 1 } as any]}
      places={[]}
      {...extra}
    />
  );
}

describe('OrderCard — Vrátit pivo', () => {
  it('u zavezené objednávky s položkami se ukáže tlačítko, jen když je onVratitPivo předané', () => {
    const onVratitPivo = vi.fn();
    renderCard({ onVratitPivo });
    expect(screen.getByLabelText('Vrátit pivo z téhle objednávky')).toBeTruthy();
  });

  it('bez onVratitPivo se tlačítko nezobrazí', () => {
    renderCard();
    expect(screen.queryByLabelText('Vrátit pivo z téhle objednávky')).toBeNull();
  });

  it('u nezavezené objednávky se tlačítko nezobrazí, i když je onVratitPivo předané', () => {
    renderCard({ onVratitPivo: vi.fn(), o: { ...order, is_delivered: false } });
    expect(screen.queryByLabelText('Vrátit pivo z téhle objednávky')).toBeNull();
  });

  it('bez vráceného množství se u položky žádná anotace neukáže', () => {
    renderCard();
    expect(screen.queryByText(/vráceno/)).toBeNull();
  });

  it('s vráceným množstvím ukáže "počítá se 4" a "1 vráceno" — 5 zavezeno − 1 vráceno', () => {
    renderCard({ vracenoZaznamy: [{ beer_id: 'b1', package_id: 'p1', quantity: 1 }] });
    expect(screen.getByText('↩ počítá se 4, 1 vráceno')).toBeTruthy();
    // Původní zavezené množství zůstává beze změny na kartě.
    expect(screen.getByText('5 ks')).toBeTruthy();
  });

  it('vrácení jiného piva/obalu se do téhle položky nepromítne', () => {
    renderCard({ vracenoZaznamy: [{ beer_id: 'jine-pivo', package_id: 'p1', quantity: 2 }] });
    expect(screen.queryByText(/vráceno/)).toBeNull();
  });
});
