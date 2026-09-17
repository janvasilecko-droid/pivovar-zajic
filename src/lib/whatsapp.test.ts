import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shareOrderToWhatsApp, shareDeliveryListToWhatsApp } from './whatsapp';

// Obal hned za množstvím, ne za pivem — z provozu 15. 9. 2026: „piš 4x 1l
// jantar, 3x10l keg 11sv, v tomhle pořadí, ať je obal za množstvím".
describe('shareOrderToWhatsApp — pořadí obal hned za množstvím', () => {
  let hrefUrl = '';
  beforeEach(() => {
    hrefUrl = '';
    vi.stubGlobal('window', {
      location: {
        set href(v: string) { hrefUrl = v; },
        get href() { return hrefUrl; },
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('obal je mezi množstvím a pivem, bez závorek', () => {
    shareOrderToWhatsApp(
      { place_name: 'Hospoda U Zajíce', order_date: '2026-09-15' },
      [{ beer_name: 'Jantar', package_label: '1 L', quantity: 4 }],
    );
    const text = decodeURIComponent(hrefUrl.split('text=')[1]);
    expect(text).toContain('*4x* 1 L Jantar');
  });

  it('chybějící obal se prostě vynechá', () => {
    shareOrderToWhatsApp(
      { place_name: 'Hospoda', order_date: '2026-09-15' },
      [{ beer_name: 'Jantar', package_label: null, quantity: 2 }],
    );
    const text = decodeURIComponent(hrefUrl.split('text=')[1]);
    expect(text).toContain('*2x* Jantar');
  });
});

describe('shareDeliveryListToWhatsApp — stejné pořadí jako u jedné objednávky', () => {
  let hrefUrl = '';
  beforeEach(() => {
    hrefUrl = '';
    vi.stubGlobal('window', {
      location: {
        set href(v: string) { hrefUrl = v; },
        get href() { return hrefUrl; },
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('obal je hned za množstvím', () => {
    shareDeliveryListToWhatsApp('Středa', [
      { place_name: 'Hospoda U Zajíce', items: [{ beer_name: '11° Světlá', package_label: '10 L KEG', quantity: 3 }] },
    ]);
    const text = decodeURIComponent(hrefUrl.split('text=')[1]);
    expect(text).toContain('3x 10 L KEG 11° Světlá');
  });
});
