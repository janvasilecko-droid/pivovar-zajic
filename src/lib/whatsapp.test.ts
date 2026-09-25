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

  // 📵 Z provozu 24. 9. 2026: „ani tam nepiš datum (datum na whatsupu vidím
  // podle toho kdy zpráva přišla) a odběratel, bude vypadat takhle Mates
  // rybárna na jednom řádku, řádek pod tím mezera, další řádek..." — appka
  // datum na WhatsApp neposílá vůbec (má ho zprávy samotná, dle času) a
  // odběratele píše rovnou bez nálepky "Odběratel:" a bez ikon.
  it('bez data, bez nálepky "Odběratel:" a bez ikon — jen jméno místa na prvním řádku', () => {
    shareOrderToWhatsApp(
      { place_name: 'Mates rybárna', order_date: '2026-09-24', delivery_day: 'pá' },
      [{ beer_name: '11° Světlá', package_label: '50 L KEG', quantity: 2 }],
    );
    const text = decodeURIComponent(hrefUrl.split('text=')[1]);
    expect(text.startsWith('Mates rybárna\n\n')).toBe(true);
    expect(text).not.toContain('Datum');
    expect(text).not.toContain('2026-09-24');
    expect(text).not.toContain('Odběratel');
    expect(text).not.toContain('📅');
    expect(text).not.toContain('🏬');
  });

  it('poznámka je bez ikony, ale zůstává v textu', () => {
    shareOrderToWhatsApp(
      { place_name: 'Hospoda', order_date: '2026-09-24', note: 'bez etiket' },
      [{ beer_name: 'Jantar', package_label: null, quantity: 1 }],
    );
    const text = decodeURIComponent(hrefUrl.split('text=')[1]);
    expect(text).toContain('*Poznámka:* bez etiket');
    expect(text).not.toContain('📝');
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
