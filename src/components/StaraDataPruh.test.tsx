// Pruh „čísla nemusí být aktuální" (components/StaraDataPruh.tsx).
// 15. 10. 2026: „občas se nechce načíst sklad" — na slabém signálu appka
// odpověděla z paměti telefonu a nikdo se to nedozvěděl.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import StaraDataPruh, { OBNOVA_STARYCH_DAT_MS } from './StaraDataPruh';

afterEach(() => { vi.useRealTimers(); });

describe('StaraDataPruh', () => {
  it('bez problému nevykreslí nic', () => {
    const { container } = render(<StaraDataPruh onZnovu={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('data z paměti telefonu: upozorní, že čísla nemusí být aktuální', () => {
    render(<StaraDataPruh zPameti onZnovu={() => {}} />);
    const pruh = screen.getByTestId('stara-data-pruh');
    expect(pruh.getAttribute('role')).toBe('status');
    expect(pruh.textContent).toMatch(/z paměti telefonu/);
    expect(pruh.textContent).toMatch(/nemusí být aktuální/);
  });

  it('chyba načtení: ukáže text chyby a hlásí se jako alert', () => {
    render(<StaraDataPruh chyba="Chybí data: fasování" onZnovu={() => {}} />);
    const pruh = screen.getByTestId('stara-data-pruh');
    expect(pruh.getAttribute('role')).toBe('alert');
    expect(pruh.textContent).toMatch(/Nepodařilo se načíst všechna data/);
    expect(pruh.textContent).toMatch(/Chybí data: fasování/);
  });

  it('když je chyba i paměť zároveň, vyhraje chyba', () => {
    render(<StaraDataPruh zPameti chyba="spadlo to" onZnovu={() => {}} />);
    const pruh = screen.getByTestId('stara-data-pruh');
    expect(pruh.getAttribute('role')).toBe('alert');
    expect(pruh.textContent).not.toMatch(/z paměti telefonu/);
  });

  it('tlačítko načte znovu a po dobu načítání se zablokuje', async () => {
    let dokonci!: () => void;
    const onZnovu = vi.fn(() => new Promise<void>((r) => { dokonci = r; }));
    render(<StaraDataPruh zPameti onZnovu={onZnovu} />);
    fireEvent.click(screen.getByRole('button', { name: /Načíst znovu/ }));
    expect(onZnovu).toHaveBeenCalledTimes(1);
    const tlacitko = screen.getByRole('button', { name: /Načítám/ }) as HTMLButtonElement;
    expect(tlacitko.disabled).toBe(true);
    await act(async () => { dokonci(); });
    expect((screen.getByRole('button', { name: /Načíst znovu/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('i když načtení selže, tlačítko se zase odemkne', async () => {
    const onZnovu = vi.fn(() => Promise.reject(new Error('spadlo')));
    render(<StaraDataPruh zPameti onZnovu={() => onZnovu().catch(() => {})} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Načíst znovu/ })); });
    expect((screen.getByRole('button', { name: /Načíst znovu/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('sám zkouší znovu každých 20 s, dokud je vidět', () => {
    vi.useFakeTimers();
    const onZnovu = vi.fn();
    render(<StaraDataPruh zPameti onZnovu={onZnovu} />);
    vi.advanceTimersByTime(OBNOVA_STARYCH_DAT_MS - 1);
    expect(onZnovu).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onZnovu).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(OBNOVA_STARYCH_DAT_MS);
    expect(onZnovu).toHaveBeenCalledTimes(2);
  });

  it('jakmile data zase sedí, přestane zkoušet', () => {
    vi.useFakeTimers();
    const onZnovu = vi.fn();
    const { rerender } = render(<StaraDataPruh zPameti onZnovu={onZnovu} />);
    rerender(<StaraDataPruh onZnovu={onZnovu} />);
    vi.advanceTimersByTime(OBNOVA_STARYCH_DAT_MS * 3);
    expect(onZnovu).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('po návratu signálu zkusí načíst hned', () => {
    const onZnovu = vi.fn();
    render(<StaraDataPruh zPameti onZnovu={onZnovu} />);
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(onZnovu).toHaveBeenCalledTimes(1);
  });

  it('po odpojení nezůstane poslouchat na signál', () => {
    const onZnovu = vi.fn();
    const { unmount } = render(<StaraDataPruh zPameti onZnovu={onZnovu} />);
    unmount();
    window.dispatchEvent(new Event('online'));
    expect(onZnovu).not.toHaveBeenCalled();
  });

  it('na schované záložce nezkouší', () => {
    vi.useFakeTimers();
    const onZnovu = vi.fn();
    const puvodni = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    try {
      render(<StaraDataPruh zPameti onZnovu={onZnovu} />);
      vi.advanceTimersByTime(OBNOVA_STARYCH_DAT_MS * 2);
      expect(onZnovu).not.toHaveBeenCalled();
    } finally {
      delete (document as any).visibilityState;
      if (puvodni) Object.defineProperty(Document.prototype, 'visibilityState', puvodni);
    }
  });

  it('používá poslední předanou funkci, ne tu z prvního vykreslení', () => {
    vi.useFakeTimers();
    const stara = vi.fn();
    const nova = vi.fn();
    const { rerender } = render(<StaraDataPruh zPameti onZnovu={stara} />);
    rerender(<StaraDataPruh zPameti onZnovu={nova} />);
    vi.advanceTimersByTime(OBNOVA_STARYCH_DAT_MS);
    expect(stara).not.toHaveBeenCalled();
    expect(nova).toHaveBeenCalledTimes(1);
  });
});
