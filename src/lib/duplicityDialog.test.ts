// Dialogy „tohle už nejspíš existuje" (lib/duplicityDialog.ts).
// Nejdůležitější je výchozí odpověď: cokoli jiného než výslovné „Přesto
// vytvořit" / „Přidat i tak" nesmí nic založit — zavřený dialog, chybějící
// hostitel dialogů i klíč, který dialog nenabídl.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  volba: vi.fn(),
}));

vi.mock('./toast', async (puvodni) => {
  const skutecny = await puvodni<typeof import('./toast')>();
  h.volba.mockImplementation(skutecny.volba);
  return { ...skutecny, volba: h.volba };
});

import { nazvyZKatalogu, zeptejSeNaDuplicitu, zeptejSeNaZdvojeneRadky } from './duplicityDialog';
import { textDuplicity, textZdvojenychRadku, type Shoda, type ZdvojenyRadek } from './duplicityObjednavek';

const nazvy = nazvyZKatalogu(
  [{ id: 'svetla', name: 'Světlá 12°' }, { id: 'jantar', name: 'Jantar' }],
  [{ id: 'sud50', label: 'KEG 50l' }, { id: 'sud15', label: 'KEG 15 L' }],
);

const radek = { beerId: 'svetla', pkgId: 'sud50', qty: 1 };
const shoda: Shoda = {
  objednavka: {
    id: 'o1', place_id: 'p-rest', place_name: 'Restaurace', order_date: '2026-10-11', delivery_date: '2026-10-11',
    source: 'rucne', created_at: '2026-10-11T10:10:00Z', polozky: [{ beer_id: 'svetla', package_id: 'sud50', quantity: 1 }],
  },
  stejne: [radek], jinyPocet: [], stejnyDen: true, uplna: true,
};
const zdvojeny: ZdvojenyRadek = { radek: { beerId: 'jantar', pkgId: 'sud15', qty: 5 }, ulozeno: [5], stejnyPocet: true };

/** Co dialog nabídl jako tlačítka: klíč → popisek + tón, v pořadí. */
const nabidka = () => (h.volba.mock.calls[0][1] as { klic: string; label: string; ton?: string }[]);

beforeEach(() => {
  h.volba.mockReset();
  h.volba.mockResolvedValue(null);
});

describe('nazvyZKatalogu', () => {
  it('pivo i obal podle id; popisek obalu s „L" jako jinde v aplikaci', () => {
    expect(nazvy.pivo('svetla')).toBe('Světlá 12°');
    expect(nazvy.obal('sud50')).toBe('KEG 50 L');
    expect(nazvy.obal('sud15')).toBe('KEG 15 L');
  });

  it('neznámé nebo chybějící id nedá „undefined" do textu dialogu', () => {
    expect(nazvy.pivo('neznama')).toBe('pivo');
    expect(nazvy.pivo(null)).toBe('pivo');
    expect(nazvy.obal('neznamy')).toBe('obal');
    expect(nazvy.obal(null)).toBe('obal');
  });

  it('prázdný název nebo popisek nenechá v textu díru', () => {
    const n = nazvyZKatalogu([{ id: 'a', name: '  ' }], [{ id: 'b', label: null }, { id: 'c', label: '  ' }]);
    expect(n.pivo('a')).toBe('pivo');
    expect(n.obal('b')).toBe('obal');
    expect(n.obal('c')).toBe('obal');
  });
});

describe('zeptejSeNaDuplicitu', () => {
  it('ptá se textem z duplicityObjednavek a nabízí jen „Nezakládat" a „Přesto vytvořit"', async () => {
    await zeptejSeNaDuplicitu([shoda], nazvy);
    expect(h.volba.mock.calls[0][0]).toBe(textDuplicity([shoda], nazvy));
    expect(nabidka()).toEqual([
      { klic: 'zrusit', label: 'Nezakládat', ton: 'hlavni' },
      { klic: 'presto', label: 'Přesto vytvořit', ton: 'nebezpecne' },
    ]);
    expect(h.volba.mock.calls[0][2]).toEqual({ titulek: 'Tahle objednávka už nejspíš existuje', zrusit: 'Zpět' });
  });

  it('u zprávy z WhatsAppu přibývá „Ignorovat zprávu" mezi obě ostatní', async () => {
    await zeptejSeNaDuplicitu([shoda], nazvy, { ignorovat: true });
    expect(nabidka().map((n) => n.klic)).toEqual(['zrusit', 'ignorovat', 'presto']);
    expect(nabidka()[1]).toEqual({ klic: 'ignorovat', label: 'Ignorovat zprávu', ton: 'nebezpecne' });
  });

  it.each([['presto'], ['ignorovat'], ['zrusit']])('odpověď %s se vrací beze změny', async (klic) => {
    h.volba.mockResolvedValue(klic);
    expect(await zeptejSeNaDuplicitu([shoda], nazvy, { ignorovat: true })).toBe(klic);
  });

  it('zavřený dialog (null) = nezakládat', async () => {
    h.volba.mockResolvedValue(null);
    expect(await zeptejSeNaDuplicitu([shoda], nazvy)).toBe('zrusit');
  });

  it('klíč, který dialog nenabídl, = nezakládat', async () => {
    h.volba.mockResolvedValue('pridat');
    expect(await zeptejSeNaDuplicitu([shoda], nazvy)).toBe('zrusit');
    h.volba.mockResolvedValue('');
    expect(await zeptejSeNaDuplicitu([shoda], nazvy)).toBe('zrusit');
  });

  it('bez namontovaného hostitele dialogů (skutečné volba) se nic nezaloží', async () => {
    const { volba } = await vi.importActual<typeof import('./toast')>('./toast');
    h.volba.mockImplementation(volba);
    expect(await zeptejSeNaDuplicitu([shoda], nazvy)).toBe('zrusit');
    expect(await zeptejSeNaDuplicitu([shoda], nazvy, { ignorovat: true })).toBe('zrusit');
  });
});

describe('zeptejSeNaZdvojeneRadky', () => {
  it('ptá se textem z duplicityObjednavek; u jednoho řádku nabízí „Nepřidávat" a „Přidat i tak"', async () => {
    await zeptejSeNaZdvojeneRadky([zdvojeny], nazvy);
    expect(h.volba.mock.calls[0][0]).toBe(textZdvojenychRadku([zdvojeny], nazvy));
    expect(nabidka()).toEqual([
      { klic: 'zrusit', label: 'Nepřidávat', ton: 'hlavni' },
      { klic: 'pridat', label: 'Přidat i tak', ton: 'nebezpecne' },
    ]);
    expect(h.volba.mock.calls[0][2]).toEqual({ titulek: 'Tenhle řádek už v objednávce je', zrusit: 'Zpět' });
  });

  it('u fotky (víc řádků naráz) nabízí i „Přidat jen ostatní řádky"', async () => {
    await zeptejSeNaZdvojeneRadky([zdvojeny], nazvy, { preskocit: true });
    expect(nabidka()).toEqual([
      { klic: 'zrusit', label: 'Nic nepřidávat', ton: 'hlavni' },
      { klic: 'preskocit', label: 'Přidat jen ostatní řádky', ton: 'vedlejsi' },
      { klic: 'pridat', label: 'Přidat i zdvojené', ton: 'nebezpecne' },
    ]);
  });

  it.each([['pridat'], ['preskocit'], ['zrusit']])('odpověď %s se vrací beze změny', async (klic) => {
    h.volba.mockResolvedValue(klic);
    expect(await zeptejSeNaZdvojeneRadky([zdvojeny], nazvy, { preskocit: true })).toBe(klic);
  });

  it('zavřený dialog (null) nebo cizí klíč = nepřidávat', async () => {
    h.volba.mockResolvedValue(null);
    expect(await zeptejSeNaZdvojeneRadky([zdvojeny], nazvy)).toBe('zrusit');
    h.volba.mockResolvedValue('presto');
    expect(await zeptejSeNaZdvojeneRadky([zdvojeny], nazvy)).toBe('zrusit');
  });

  it('bez namontovaného hostitele dialogů (skutečné volba) se nic nepřidá', async () => {
    const { volba } = await vi.importActual<typeof import('./toast')>('./toast');
    h.volba.mockImplementation(volba);
    expect(await zeptejSeNaZdvojeneRadky([zdvojeny], nazvy, { preskocit: true })).toBe('zrusit');
  });
});
