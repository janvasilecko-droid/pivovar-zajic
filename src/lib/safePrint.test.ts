import { afterEach, describe, expect, it, vi } from 'vitest';
import { printDeliveryList, printTable } from './safePrint';

function mockPrintWindow() {
  const printDocument = document.implementation.createHTMLDocument('');
  const print = vi.fn();
  const focus = vi.fn();
  const fakeWindow = {
    document: printDocument,
    opener: window,
    closed: false,
    focus,
    print,
    setTimeout: (handler: TimerHandler) => {
      if (typeof handler === 'function') handler();
      return 1;
    },
  } as unknown as Window;
  const write = vi.spyOn(printDocument, 'write');
  vi.spyOn(window, 'open').mockReturnValue(fakeWindow);
  return { fakeWindow, printDocument, print, write };
}

afterEach(() => vi.restoreAllMocks());

describe('safe print helpers', () => {
  it('renders delivery values as text instead of executable HTML', () => {
    const { fakeWindow, printDocument, print, write } = mockPrintWindow();
    const payload = '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>';

    expect(printDeliveryList({
      title: payload,
      heading: 'Zavážecí list',
      emptyMessage: 'Prázdné',
      orders: [{
        placeName: payload,
        note: payload,
        items: [{ beerName: payload, quantity: 2, packageLabel: payload }],
      }],
    })).toBe(true);

    expect(printDocument.body.textContent).toContain(payload);
    expect(printDocument.body.querySelector('script')).toBeNull();
    expect(printDocument.body.querySelector('img')).toBeNull();
    expect(write).not.toHaveBeenCalled();
    expect(fakeWindow.opener).toBeNull();
    expect(print).toHaveBeenCalledOnce();
  });

  it('renders malicious table cells as plain text', () => {
    const { printDocument } = mockPrintWindow();
    const payload = '</td><script>alert(1)</script>';

    printTable({
      title: 'Kniha jízd',
      heading: 'Kniha jízd',
      columns: [{ label: 'Řidič' }],
      rows: [[payload]],
      emptyMessage: 'Žádné záznamy',
    });

    expect(printDocument.querySelector('td')?.textContent).toBe(payload);
    expect(printDocument.querySelector('script')).toBeNull();
  });
});
