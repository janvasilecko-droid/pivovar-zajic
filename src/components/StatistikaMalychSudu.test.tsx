// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatistikaMalychSudu from './StatistikaMalychSudu';

const obaly = [{ id: 'k20', kind: 'keg', volume_l: 20 }, { id: 'k50', kind: 'keg', volume_l: 50 }];
const piva = [{ id: 'b10', name: '10° Desítka' }];

describe('Statistika malých sudů', () => {
  it('ukáže kusy, obsah a odběratele', () => {
    render(
      <StatistikaMalychSudu
        orders={[{ id: 'o1', place_name: 'Radek', delivery_date: '2026-10-20', status: 'nova', is_delivered: true }]}
        orderItems={[{ order_id: 'o1', beer_id: 'b10', package_id: 'k20', quantity: 3 }, { order_id: 'o1', beer_id: 'b10', package_id: 'k50', quantity: 9 }]}
        obaly={obaly}
        piva={piva}
        dnes="2026-10-20"
      />,
    );
    expect(screen.getByText('Radek')).toBeTruthy();
    expect(screen.getAllByText('10° Desítka').length).toBeGreaterThan(0);
    expect(screen.getByText(/3 ks · 60 l/)).toBeTruthy();
    // velký sud (50 l) se do malých nepočítá
    expect(screen.queryByText(/9 ks/)).toBeNull();
  });
  it('bez malých sudů ukáže prázdný stav', () => {
    render(<StatistikaMalychSudu orders={[]} orderItems={[]} obaly={obaly} piva={piva} dnes="2026-10-20" />);
    expect(screen.getByText(/žádné malé sudy/)).toBeTruthy();
  });
});
