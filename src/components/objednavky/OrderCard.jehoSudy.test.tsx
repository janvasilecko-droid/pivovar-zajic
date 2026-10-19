// Karta objednávky odběratele, který si vozí vlastní sudy (Duck and Dog) — 19. 10. 2026:
// „vše není skladem, jen je to z jeho sudů, musím stejně zadat stáčení; nedávej tam to
// WhatsApp; a nejde přečíst poznámka, neukáže se celá."
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderCard } from './OrderCard';
import type { Order, OrderItem } from './spolecne';

const DLOUHA = 'Duck and Dog úterý; Zbytek prosím 11 % – hotové; mělo by být ještě 5 kusů 50 l, které zbyly z minulého týdne a nejsou ve skladu';
const order: Order = {
  id: 'o1', order_date: '2026-10-16', place_id: null, place_name: 'Duck and Dog',
  source: 'whatsapp', status: 'nova', note: DLOUHA, created_at: '2026-10-16T10:00:00+00:00',
  delivery_day: 'ut', delivery_date: '2026-10-20', is_prepared: false, is_packaged: false,
  is_delivered: false, delivered_at: null, whatsapp_message_id: 'w1',
};
const polozka = (id: string, pkg: string, qty: number): OrderItem => ({
  id, order_id: 'o1', beer_id: 'b1', beer_name: '11° Světlá', package_id: pkg, package_label: pkg === 'k30' ? 'KEG 30l' : 'KEG 50l',
  quantity: qty, is_prepared: false, is_bottled: false,
});
const noop = () => {};
const OBALY = [
  { id: 'k30', label: 'KEG 30l', kind: 'keg', volume_l: 30, sort_order: 1 },
  { id: 'k50', label: 'KEG 50l', kind: 'keg', volume_l: 50, sort_order: 2 },
] as any[];

function karta(extra: Partial<React.ComponentProps<typeof OrderCard>> = {}) {
  render(
    <OrderCard
      o={order} items={[polozka('i1', 'k30', 21), polozka('i2', 'k50', 5)]} stockRemainingForOrder={() => new Map()}
      selected={false} onToggleSelect={noop} onClick={noop} onToggleFlag={noop} onToggleItemFlag={noop}
      onUpdateDeliveryDay={noop} onSetStatus={noop} onDelete={noop} onDuplicate={noop} onEdit={noop} onSplit={noop}
      onOpenWhatsApp={noop}
      beers={[{ id: 'b1', name: '11° Světlá' } as any]} packages={OBALY} places={[]}
      {...extra}
    />,
  );
}

describe('OrderCard — odběratel s vlastními sudy', () => {
  it('místo „Vše skladem“ říká, že se stáčí do jeho sudů a je třeba zadat stáčení', () => {
    karta();
    expect(screen.queryByText('Vše skladem')).toBeNull();
    expect(screen.getByText('Do jeho sudů — zadej stáčení')).toBeTruthy();
  });

  it('běžný odběratel dál dostane „Vše skladem“ a žádné upozornění na jeho sudy', () => {
    karta({ o: { ...order, place_name: 'Restaurace', note: null } });
    expect(screen.getByText('Vše skladem')).toBeTruthy();
    expect(screen.queryByText('Do jeho sudů — zadej stáčení')).toBeNull();
  });

  it('tlačítko WhatsApp s odkazem na původní zprávu na kartě není', () => {
    karta();
    expect(screen.queryByText('WhatsApp')).toBeNull();
  });

  it('poznámka se zalamuje a ukáže celá (ne useknutá na jeden řádek)', () => {
    karta();
    const poznamka = screen.getByText(DLOUHA, { exact: false }).closest('span')!;
    expect(poznamka.className).toContain('whitespace-normal');
    expect(poznamka.className).toContain('break-words');
    expect(poznamka.className).not.toContain('shrink-0');
    expect(poznamka.textContent).toContain('nejsou ve skladu');
  });
});
