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
  // 27. 11. 2026: „DaD … jen se počítá objem, ale ne obaly.“
  it('odběratel s vlastními sudy (Duck and Dog): u jména jen „vlastní sudy · litry“, do počtu sudů nejde, vysvětlivka je', () => {
    render(
      <StatistikaMalychSudu
        orders={[
          { id: 'o1', place_name: 'Radek', delivery_date: '2026-10-20', status: 'nova', is_delivered: true },
          { id: 'o2', place_name: 'Duck and Dog', delivery_date: '2026-10-20', status: 'nova', is_delivered: true },
        ]}
        orderItems={[{ order_id: 'o1', beer_id: 'b10', package_id: 'k20', quantity: 3 }, { order_id: 'o2', beer_id: 'b10', package_id: 'k20', quantity: 4 }]}
        obaly={obaly}
        piva={piva}
        dnes="2026-10-20"
      />,
    );
    expect(screen.getByText(/3 ks · 60 l/)).toBeTruthy();                       // Radek
    expect(screen.getByTestId('sudy-vlastni').textContent).toBe('vlastní sudy · 80 l');
    expect(screen.queryByText(/4 ks/)).toBeNull();                                // DaD není v počtu sudů
    expect(screen.getByTestId('sudy-vlastni-poznamka').textContent).toMatch(/jejich sudy ne/);
    // Dlaždice nahoře: Sudů 3 a Zavezeno 3 (jen Radek), Litrů 140 (všechno).
    const dlazdice = (popisek: string) => screen.getAllByText(popisek).find((e) => e.tagName === 'DIV')?.nextElementSibling?.textContent;
    expect(dlazdice('Sudů')).toBe('3');
    expect(dlazdice('Zavezeno')).toBe('3');
    expect(dlazdice('Litrů')).toBe('140');
  });
  it('období jen s Duck and Dog: žádné „prázdné“ hlášení, ukáže litry', () => {
    render(
      <StatistikaMalychSudu
        orders={[{ id: 'o2', place_name: 'Duck and Dog', delivery_date: '2026-10-20', status: 'nova', is_delivered: true }]}
        orderItems={[{ order_id: 'o2', beer_id: 'b10', package_id: 'k20', quantity: 4 }]}
        obaly={obaly}
        piva={piva}
        dnes="2026-10-20"
      />,
    );
    expect(screen.queryByText(/žádné malé sudy/)).toBeNull();
    expect(screen.getByTestId('sudy-vlastni').textContent).toBe('vlastní sudy · 80 l');
  });
  it('bez malých sudů ukáže prázdný stav', () => {
    render(<StatistikaMalychSudu orders={[]} orderItems={[]} obaly={obaly} piva={piva} dnes="2026-10-20" />);
    expect(screen.getByText(/žádné malé sudy/)).toBeTruthy();
  });
});
