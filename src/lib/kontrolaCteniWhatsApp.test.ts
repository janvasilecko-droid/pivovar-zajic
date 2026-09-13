import { describe, it, expect } from 'vitest';
import { porovnejCteni } from './kontrolaCteniWhatsApp';
import { kontrolaCteniWhatsApp, type VstupAuditu } from './hloubkovyAudit';

const PIVA = [
  { id: 'sv12', name: '12° Světlá', degree: '12°' },
  { id: 'tm12', name: '12° Tmavá', degree: '12°' },
  { id: 'sv11', name: '11° Světlá', degree: '11°' },
];
const OBALY = [
  { id: 'k50', label: '50l', volume_l: 50 },
  { id: 'k30', label: '30l', volume_l: 30 },
];
const objednavka = (id: string) => ({ id, place_name: 'Lužec', delivery_date: '2026-09-06', order_date: '2026-09-06', status: 'nova' });
// Přesně zpráva z provozu 2. 9. 2026.
const zpravaLuzec = {
  created_at: '2026-09-02T10:50:00Z',
  message_text: 'Luzec jeste sudy:\n12sv: 3x50l + 4x30l\nTm: 2x30l',
  imported_order_id: 'o1',
  parsed_items: [
    { raw_line: '12sv: 3x50l', degree: '12°', qty: 3, package_label: '50l' },
    { raw_line: '12sv: 3x50l + 4x30l', degree: '12°', qty: 4, package_label: '30l' },
    { raw_line: 'Tm: 2x30l', degree: '12°', qty: 2, package_label: '30l' },
  ],
};
const vstup = (polozky: any[]) => ({
  zpravy: [zpravaLuzec], polozky, objednavky: [objednavka('o1')], piva: PIVA, obaly: OBALY, zkratky: [],
});

describe('kontrola čtení objednávek z WhatsAppu', () => {
  it('objednávka, která odpovídá zprávě, se nehlásí', () => {
    expect(porovnejCteni(vstup([
      { order_id: 'o1', beer_id: 'sv12', package_id: 'k50', quantity: 3 },
      { order_id: 'o1', beer_id: 'sv12', package_id: 'k30', quantity: 4 },
      { order_id: 'o1', beer_id: 'tm12', package_id: 'k30', quantity: 2 },
    ]))).toEqual([]);
  });

  it('Lužec 2. 9.: „Tm: 2x30l" zapsané jako světlá je rozpor barvy', () => {
    const r = porovnejCteni(vstup([
      { order_id: 'o1', beer_id: 'sv12', package_id: 'k50', quantity: 3 },
      { order_id: 'o1', beer_id: 'sv12', package_id: 'k30', quantity: 4 },
      { order_id: 'o1', beer_id: 'sv12', package_id: 'k30', quantity: 2 },
    ]));
    expect(r).toHaveLength(1);
    expect(r[0].rozporBarvy[0]).toMatch(/Tm: 2x30l.*TMAVÉ/);
    expect(r[0].chybi).toEqual(['12° Tmavá 30l ×2 („Tm: 2x30l")']);
    expect(r[0].navic).toEqual(['12° Světlá 30l ×2']);
  });

  it('jiný počet je rozdíl k ověření, ne rozpor barvy', () => {
    const r = porovnejCteni(vstup([
      { order_id: 'o1', beer_id: 'sv12', package_id: 'k50', quantity: 5 },
      { order_id: 'o1', beer_id: 'sv12', package_id: 'k30', quantity: 4 },
      { order_id: 'o1', beer_id: 'tm12', package_id: 'k30', quantity: 2 },
    ]));
    expect(r[0].rozporBarvy).toEqual([]);
    expect(r[0].navic).toEqual(['12° Světlá 50l ×5']);
  });

  it('stornovaná objednávka se nekontroluje', () => {
    const v = vstup([{ order_id: 'o1', beer_id: 'sv12', package_id: 'k50', quantity: 99 }]);
    v.objednavky = [{ ...objednavka('o1'), status: 'storno' }];
    expect(porovnejCteni(v)).toEqual([]);
  });

  it('v auditu: rozpor barvy je chyba, jiný rozdíl jen pozor, bez rozdílů zelená', () => {
    const OBDOBI = { od: '2026-09-01', do: '2026-09-30', mesic: '2026-09' };
    const s = (cteniWhatsApp: VstupAuditu['cteniWhatsApp']) => kontrolaCteniWhatsApp({ ...OBDOBI, cteniWhatsApp });
    const zaklad = { objednavkaId: 'o1', misto: 'Lužec', den: '2026-09-06', zprava: 'x', foto: false, chybi: [], navic: [] };
    expect(s([]).zavaznost).toBe('ok');
    expect(s([{ ...zaklad, rozporBarvy: ['„Tm" je TMAVÉ'] }]).zavaznost).toBe('chyba');
    expect(s([{ ...zaklad, rozporBarvy: [], navic: ['12° Světlá 50l ×5'] }]).zavaznost).toBe('pozor');
  });
});
