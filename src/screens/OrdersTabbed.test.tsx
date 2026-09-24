// Zadání 24. 9. 2026: „pridej tam moznost do obejdnavek zalozku vratka kde
// se da odberatel a sud sudy, kahve ktery vrati, at se nactou do skladu…"
// Vlastní logika vrácení (VraceniPiva.tsx + lib/vraceniZObjednavky.ts) už
// existovala — chybělo jen udělat z ní plnohodnotnou horní záložku, ne
// tlačítko schované v liště Přehled/Celkem. Tenhle test hlídá tu záložku
// samotnou; Orders.tsx je mockovaný, ať test nezávisí na supabase.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OrdersTabbed from './OrdersTabbed';

vi.mock('./Orders', () => ({
  default: (props: { initialViewMode?: string }) => (
    <div data-testid="orders-mock">{props.initialViewMode}</div>
  ),
}));

describe('OrdersTabbed — záložka Vrácení', () => {
  it('nabízí čtyři záložky vedle sebe, včetně Vrácení', () => {
    render(<OrdersTabbed />);
    expect(screen.getByText('Objednávky')).toBeTruthy();
    expect(screen.getByText('Přehled')).toBeTruthy();
    expect(screen.getByText('Celkem')).toBeTruthy();
    expect(screen.getByText('Vrácení')).toBeTruthy();
  });

  it('kliknutí na Vrácení otevře Orders s initialViewMode="vraceni"', () => {
    render(<OrdersTabbed />);
    fireEvent.click(screen.getByText('Vrácení'));
    expect(screen.getByTestId('orders-mock').textContent).toBe('vraceni');
  });

  it('se zadaným setPage zapíše přepnutí do historie stránek jako orders_vraceni', () => {
    const setPage = vi.fn();
    render(<OrdersTabbed setPage={setPage} />);
    fireEvent.click(screen.getByText('Vrácení'));
    expect(setPage).toHaveBeenCalledWith('orders_vraceni');
  });

  it('initialTab="vraceni" (z App.tsx page=orders_vraceni) otevře rovnou tuhle záložku', () => {
    render(<OrdersTabbed initialTab="vraceni" />);
    expect(screen.getByTestId('orders-mock').textContent).toBe('vraceni');
  });

  it('zbylé tři záložky se dál chovají stejně — Vrácení jim nesebralo mapování', () => {
    const setPage = vi.fn();
    render(<OrdersTabbed setPage={setPage} />);
    fireEvent.click(screen.getByText('Přehled'));
    expect(setPage).toHaveBeenCalledWith('orders_detail');
    fireEvent.click(screen.getByText('Celkem'));
    expect(setPage).toHaveBeenCalledWith('orders_celkem');
    fireEvent.click(screen.getByText('Objednávky'));
    expect(setPage).toHaveBeenCalledWith('orders');
  });
});
