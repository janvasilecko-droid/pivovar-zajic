// Statistika → Tržby a nové karty na Žebříčcích — vykreslení nad malými daty.
// Výpočty samotné hlídá lib/statistikaObchod.test.ts; tady jde o to, že se
// čísla dostanou na obrazovku a prázdné stavy řeknou, co chybí.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatistikaTrzby from './StatistikaTrzby';
import StatistikaTrendy from './StatistikaTrendy';

const OBALY = [{ id: 'keg30', label: 'KEG 30 l', kind: 'keg', volume_l: 30 }];
const PIVA = [{ id: 'b11', name: '11° Světlá' }];
const ORDERS = [
  { id: 'o1', place_name: 'Hospoda U Lípy', delivery_date: '2026-09-10', order_date: '2026-09-08', status: 'nova' },
  { id: 'o2', place_name: 'Pivnice', delivery_date: '2026-09-12', order_date: '2026-09-11', status: 'nova' },
];
const ITEMS = [
  { order_id: 'o1', beer_id: 'b11', package_id: 'keg30', quantity: 3 },
  { order_id: 'o2', beer_id: 'b99', package_id: 'keg30', quantity: 1 },
];
const CENIK = [{ beer_id: 'b11', package_id: 'keg30', price_per_unit: 1500, currency: 'CZK', valid_from: null, valid_to: null }];

describe('StatistikaTrzby', () => {
  it('bez ceníku řekne, že tržby spočítat nejde', () => {
    render(<StatistikaTrzby orders={ORDERS} orderItems={ITEMS} cenik={[]} dnes="2026-09-26" />);
    expect(screen.getByText(/Ceník je prázdný/)).toBeTruthy();
  });

  it('ukáže tržby odběratelů a upozorní na položky bez ceny', () => {
    render(<StatistikaTrzby orders={ORDERS} orderItems={ITEMS} cenik={CENIK} dnes="2026-09-26" />);
    const karta = screen.getByRole('heading', { name: 'Odběratelé podle tržeb' }).closest('section')!;
    expect(karta.textContent).toContain('Hospoda U Lípy');
    expect(karta.textContent).toMatch(/4\s500 Kč/);
    expect(karta.textContent).toMatch(/1\s*položka nemá v ceníku platnou cenu/);
  });
});

describe('StatistikaTrendy', () => {
  it('kdo by měl objednat, piva proti loňsku a odpisy', () => {
    const pravidelne = ['2026-08-01', '2026-08-15', '2026-08-29', '2026-09-12'].map((d, i) => ({
      id: `p${i}`, place_name: 'Pravidelná hospoda', delivery_date: d, order_date: d, status: 'nova',
    }));
    render(
      <StatistikaTrendy
        sudy={[
          { entry_date: '2026-03-01', beer_id: 'b11', package_id: 'keg30', quantity: 10 },
          { entry_date: '2025-03-01', beer_id: 'b11', package_id: 'keg30', quantity: 5 },
        ]}
        odpisy={[{ entry_date: '2026-09-02', beer_id: 'b11', package_id: 'keg30', quantity: 1 }]}
        obaly={OBALY}
        piva={PIVA}
        orders={pravidelne}
        dnes="2026-09-30"
      />,
    );
    expect(screen.getByText('Pravidelná hospoda')).toBeTruthy();
    expect(screen.getByText(/4 dny po termínu/)).toBeTruthy();
    const piva = screen.getByRole('heading', { name: 'Piva letos proti loňsku' }).closest('section')!;
    expect(piva.textContent).toMatch(/11° Světlá/);
    expect(piva.textContent).toMatch(/\+100 %/);
    expect(screen.getByText(/Letos odepsáno 1 ks/)).toBeTruthy();
  });
});
