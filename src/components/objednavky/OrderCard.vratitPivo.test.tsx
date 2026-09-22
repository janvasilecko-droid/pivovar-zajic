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

const VRATIT = 'Vrátit položky na sklad';

describe('OrderCard — Vrátit na sklad', () => {
  it('u objednávky s položkami se ukáže tlačítko, jen když je onVratitPivo předané', () => {
    const onVratitPivo = vi.fn();
    renderCard({ onVratitPivo });
    expect(screen.getByLabelText(VRATIT)).toBeTruthy();
  });

  it('bez onVratitPivo se tlačítko nezobrazí', () => {
    renderCard();
    expect(screen.queryByLabelText(VRATIT)).toBeNull();
  });

  // Zadání 22. 9. 2026: „dej ikonu vrátit, po kliknutí můžu vybrané položky
  // vrátit na sklad." Do té doby se tlačítko ukazovalo jen u objednávek
  // označených „Zavezeno" — jenže ten příznak se v provozu skoro nepoužívá
  // (195 z 219 objednávek zůstává „Nová"), takže ho nikdo nikdy neviděl.
  it('ukáže se i u objednávky, která není označená jako zavezená', () => {
    renderCard({ onVratitPivo: vi.fn(), o: { ...order, is_delivered: false } });
    expect(screen.getByLabelText(VRATIT)).toBeTruthy();
  });

  it('u stornované objednávky se tlačítko nezobrazí — není co vracet', () => {
    renderCard({ onVratitPivo: vi.fn(), o: { ...order, status: 'storno' } });
    expect(screen.queryByLabelText(VRATIT)).toBeNull();
  });

  it('bez položek se tlačítko nezobrazí', () => {
    renderCard({ onVratitPivo: vi.fn(), items: [] });
    expect(screen.queryByLabelText(VRATIT)).toBeNull();
  });

  // Duplikování z karty 22. 9. 2026 zmizelo („odstraň kopírovat objednávku") —
  // stejnou objednávku dál nabízí „To co posledně" v zadávání.
  it('kopírování objednávky na kartě už není', () => {
    renderCard({ onVratitPivo: vi.fn() });
    expect(screen.queryByLabelText('Duplikovat objednávku')).toBeNull();
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
