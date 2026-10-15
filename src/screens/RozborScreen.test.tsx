// Rozbor: týden (jako dřív), měsíc a výběr odběratele (RozborScreen +
// lib/rozborObdobi.ts + lib/useObjednavkyRozboru.ts).
// Z provozu 15. 10. 2026: „ten rozbor udělej i měsíční s tím, že si tam můžu
// vyfiltrovat i odběratele."
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

const h = vi.hoisted(() => ({
  plan: {} as any,
  objednavky: {} as any,
  predvyber: vi.fn(),
  setPage: vi.fn(),
}));

vi.mock('../lib/usePlanStaceni', () => ({ usePlanStaceni: () => h.plan }));
vi.mock('../lib/useObjednavkyRozboru', () => ({ useObjednavkyRozboru: () => h.objednavky }));
vi.mock('../lib/pohybyPredvyber', () => ({ predvyberPohyby: (...a: unknown[]) => h.predvyber(...a) }));
vi.mock('../lib/supabase', async (puvodni) => {
  const skutecny = await puvodni<typeof import('../lib/supabase')>();
  // týdenní inventura: nic napočítaného
  const q: any = { select: () => q, in: () => q, then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: [] }).then(ok) };
  return { ...skutecny, supabase: { from: () => q }, useRealtime: vi.fn() };
});
vi.mock('../lib/businessDate', async (puvodni) => {
  const skutecny = await puvodni<typeof import('../lib/businessDate')>();
  return { ...skutecny, businessDateISO: (d?: Date) => (d ? skutecny.businessDateISO(d) : '2026-10-15') };
});

import RozborScreen from './RozborScreen';
import { klicOdberatele } from '../lib/rozborObdobi';

const PIVA = [
  { id: 'sv', name: '12° Světlá', beer_color: '#f5c542' },
  { id: 'de', name: '10° Desítka', beer_color: '#e0a526' },
  { id: 'ja', name: 'Jantar', beer_color: '#b45309' },
];
const OBALY = [
  { id: 'k50', label: 'KEG 50l', kind: 'keg', volume_l: 50 },
  { id: 'k30', label: 'KEG 30l', kind: 'keg', volume_l: 30 },
  { id: 'p15', label: 'PET 1,5 l', kind: 'bottle', volume_l: 1.5 },
];

const obj = (id: string, place_name: string, delivery_date: string, order_date = delivery_date) =>
  ({ id, place_name, delivery_date, order_date, status: 'nova' });
const pol = (order_id: string, beer_id: string, package_id: string, quantity: number) => ({ order_id, beer_id, package_id, quantity });

const OBJEDNAVKY = [
  obj('r-11a', 'Restaurace', '2026-10-11'),
  obj('r-11b', 'Restaurace', '2026-10-11', '2026-10-13'),   // zdvojená zpětně zadaná
  obj('r-12', 'Restaurace', '2026-10-12'),
  obj('l-14', 'Hospoda U Lípy', '2026-10-14'),
  obj('r-zari', 'Restaurace', '2026-09-30', '2026-09-28'),
  obj('l-zari', 'Hospoda U Lípy', '2026-09-15'),
];
const POLOZKY = [
  pol('r-11a', 'sv', 'k50', 1), pol('r-11a', 'de', 'k30', 1),
  pol('r-11b', 'sv', 'k50', 1), pol('r-11b', 'de', 'k30', 1),
  pol('r-12', 'ja', 'p15', 5), pol('r-12', 'ja', 'p15', 5),
  pol('l-14', 'sv', 'k50', 3),
  pol('r-zari', 'sv', 'k50', 7),
  pol('l-zari', 'de', 'k30', 2),
];

/** Položka plánu stáčení (jen pole, která Rozbor čte). */
const planItem = (beer_id: string, beer_name: string, package_id: string, package_label: string, ordered: number, missing: number, dluh = 0) => ({
  key: `${beer_id}__${package_id}`, beer_id, beer_name, package_id, package_label, volume_l: 50,
  ordered, done: ordered - missing, autoDone: 0, nachystano: 0, zChladaku: 0, checked: 0, missing, dluh, doVlastnichSudu: 0, orders: [],
});
const denPlanu = (items: ReturnType<typeof planItem>[]) => [{ day: 'po', label: 'Po', date: '2026-10-12', items, totalOrdered: 0, totalDone: 0, totalMissing: 0, missingLiters: 0 }];

beforeEach(() => {
  localStorage.clear();
  h.predvyber.mockReset();
  h.setPage.mockReset();
  h.plan = {
    data: {
      beers: PIVA, packages: OBALY,
      // stočeno: tento týden 2× Světlá 50 l, v září nic
      kegging: [{ entry_date: '2026-10-13', beer_id: 'sv', package_id: 'k50', quantity: 2 }],
      bottling: [],
    },
    chyba: false,
    planySudy: denPlanu([planItem('sv', '12° Světlá', 'k50', 'KEG 50l', 3, 1)]),
    planyLahve: denPlanu([planItem('ja', 'Jantar', 'p15', 'PET 1,5 l', 10, 0)]),
    zasoba: new Map([['sv__k50', 2], ['ja__p15', 4], ['de__k30', 6]]),
  };
  h.objednavky = { data: { objednavky: OBJEDNAVKY, polozky: POLOZKY }, chyba: false };
});

/** Vykreslí obrazovku a nechá doběhnout načtení týdenní inventury (změna stavu po slibu patří do act). */
const otevri = async () => {
  let vysledek!: ReturnType<typeof render>;
  await act(async () => { vysledek = render(<RozborScreen setPage={h.setPage} />); });
  return vysledek;
};
const radky = () => screen.queryAllByTestId('radek-rozboru');
const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
/** Řádek jako [název, čísla]: v textu DOM mezi nimi mezera není, jsou to dva sloupce. */
const dvojice = (r: HTMLElement): [string, string] => [
  (r.querySelector('span.truncate')?.textContent ?? '').trim(),
  (r.querySelector('span.tabular-nums')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
];
const radek = (nazev: RegExp) => {
  const r = radky().find((x) => nazev.test(text(x)));
  if (!r) throw new Error(`Řádek ${nazev} nenalezen; řádky: ${radky().map(text).join(' | ')}`);
  return r;
};
const mesic = () => fireEvent.click(screen.getByRole('button', { name: 'Měsíc' }));
const vyberOdberatele = (jmeno: string) => fireEvent.change(screen.getByLabelText('Odběratel'), { target: { value: klicOdberatele(jmeno) } });

describe('Rozbor — týden beze změny', () => {
  it('týden bez odběratele jde z plánu stáčení: stočit, sklad, ✓', async () => {
    await otevri();
    expect(text(radek(/Světlá/))).toContain('stoč. 2 · obj. 3 · stočit 1 · sklad 2');
    expect(text(radek(/Jantar/))).toContain('obj. 10');
    expect(text(radek(/Jantar/))).toContain('sklad 4');
    // Jantar je celý stočený → ✓ místo „stočit"
    expect(text(radek(/Jantar/))).not.toContain('stočit');
    expect(radek(/Jantar/).querySelector('svg.lucide-check')).toBeTruthy();
    expect(screen.getByText(/Objednáno a stočeno tento týden — sudy i lahve, „inv\."/)).toBeTruthy();
  });

  it('začíná na Týdnu a „Všichni odběratelé"; měsíc se ukáže až po přepnutí', async () => {
    await otevri();
    expect(screen.getByRole('button', { name: 'Týden' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Měsíc' }).getAttribute('aria-pressed')).toBe('false');
    expect((screen.getByLabelText('Odběratel') as HTMLSelectElement).value).toBe('');
    expect(screen.queryByTestId('rozbor-mesic')).toBeNull();
  });

  it('týden nepotřebuje objednávky ze sdílené paměti (nečeká na ně)', async () => {
    h.objednavky = { data: null, chyba: false };
    await otevri();
    expect(radky()).toHaveLength(2);
  });

  it('klepnutí na položku otevře pohyby za aktuální týden', async () => {
    await otevri();
    fireEvent.click(radek(/Světlá/));
    expect(h.predvyber).toHaveBeenCalledWith('sv', 'k50', undefined);
    expect(h.setPage).toHaveBeenCalledWith('stock_pohyby');
  });

  it('načtení plánu selhalo → chyba; ještě se načítá → kolečko', async () => {
    h.plan = { ...h.plan, data: null, chyba: true };
    const { unmount } = await otevri();
    expect(screen.getByText('Rozbor se nepodařilo načíst.')).toBeTruthy();
    unmount();
    h.plan = { ...h.plan, data: null, chyba: false };
    const { container } = await otevri();
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });
});

describe('Rozbor — měsíc', () => {
  it('objednané za celý měsíc z objednávek (i z dřívějších týdnů), stočené za měsíc a sklad teď; bez „stočit"', async () => {
    await otevri();
    mesic();
    expect(screen.getByTestId('rozbor-mesic').textContent).toBe('říjen 2026');
    // Světlá 50 l: 1 + 1 (zdvojená 11. 10.) + 3 (Lípa, tento týden) = 5; stočeno 2; sklad 2
    expect(text(radek(/Světlá/))).toContain('stoč. 2 · obj. 5 · sklad 2');
    expect(text(radek(/Desítka/))).toContain('obj. 2');
    expect(text(radek(/Desítka/))).toContain('sklad 6');
    expect(text(radek(/Jantar/))).toContain('obj. 10');
    expect(radky().map(text).join(' ')).not.toMatch(/stočit/);
    expect(radky().every((r) => !r.querySelector('svg.lucide-check'))).toBe(true);
    expect(screen.getByText(/Objednáno a stočeno — říjen 2026, sudy i lahve; „sklad" je stav teď/)).toBeTruthy();
  });

  it('listování měsíci: září má jiné objednávky a sklad (stav teď) se v minulém měsíci neukazuje', async () => {
    await otevri();
    mesic();
    fireEvent.click(screen.getByRole('button', { name: 'Předchozí měsíc' }));
    expect(screen.getByTestId('rozbor-mesic').textContent).toBe('září 2026');
    expect(text(radek(/Světlá/))).toContain('obj. 7');
    expect(text(radek(/Desítka/))).toContain('obj. 2');
    expect(radky().map(text).join(' ')).not.toMatch(/sklad/);
    expect(radky().map(text).join(' ')).not.toMatch(/stoč\./);
    expect(screen.getByText(/Objednáno a stočeno — září 2026, sudy i lahve\./)).toBeTruthy();
    expect(screen.queryByText(/stav teď/)).toBeNull();
  });

  it('„Zpět na tento měsíc" je vidět jen mimo aktuální měsíc a vrátí na říjen', async () => {
    await otevri();
    mesic();
    expect(screen.queryByRole('button', { name: 'Zpět na tento měsíc' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Další měsíc' }));
    expect(screen.getByTestId('rozbor-mesic').textContent).toBe('listopad 2026');
    expect(screen.getByText('Za listopad 2026 nic objednaného ani stočeného.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zpět na tento měsíc' }));
    expect(screen.getByTestId('rozbor-mesic').textContent).toBe('říjen 2026');
    expect(screen.queryByRole('button', { name: 'Zpět na tento měsíc' })).toBeNull();
  });

  it('přes přelom roku: leden → předchozí měsíc je prosinec předchozího roku', async () => {
    await otevri();
    mesic();
    for (let i = 0; i < 10; i++) fireEvent.click(screen.getByRole('button', { name: 'Předchozí měsíc' }));
    expect(screen.getByTestId('rozbor-mesic').textContent).toBe('prosinec 2025');
  });

  it('klepnutí na položku otevře pohyby za TEN MĚSÍC', async () => {
    await otevri();
    mesic();
    fireEvent.click(radek(/Světlá/));
    expect(h.predvyber).toHaveBeenCalledWith('sv', 'k50', '2026-10');
    expect(h.setPage).toHaveBeenCalledWith('stock_pohyby');

    fireEvent.click(screen.getByRole('button', { name: 'Předchozí měsíc' }));
    fireEvent.click(radek(/Světlá/));
    expect(h.predvyber).toHaveBeenLastCalledWith('sv', 'k50', '2026-09');
  });

  it('objednávky se ještě načítají → kolečko; nepovedlo se → chyba; plán týdne se přitom nerozbije', async () => {
    h.objednavky = { data: null, chyba: false };
    const { container, unmount } = await otevri();
    mesic();
    expect(container.querySelector('.animate-spin')).toBeTruthy();
    expect(radky()).toHaveLength(0);
    unmount();

    h.objednavky = { data: null, chyba: true };
    await otevri();
    mesic();
    expect(screen.getByText('Objednávky se nepodařilo načíst.')).toBeTruthy();
  });
});

describe('Rozbor — odběratel', () => {
  it('nabídka obsahuje odběratele z objednávek období s počtem objednávek; v týdnu jiné než v měsíci', async () => {
    await otevri();
    const nabidka = () => within(screen.getByLabelText('Odběratel')).getAllByRole('option').map((o) => o.textContent);
    expect(nabidka()).toEqual(['Všichni odběratelé', 'Hospoda U Lípy (1)', 'Restaurace (1)']);
    mesic();
    expect(nabidka()).toEqual(['Všichni odběratelé', 'Hospoda U Lípy (1)', 'Restaurace (3)']);
  });

  it('jen objednávky vybraného odběratele; stočeno, sklad ani „stočit" se neukazují; úvod říká proč', async () => {
    await otevri();
    mesic();
    vyberOdberatele('Restaurace');
    expect(radky().map(dvojice)).toEqual([
      ['10° Desítka 30l', 'obj. 2'],
      ['12° Světlá 50l', 'obj. 2'],
      ['Jantar 1,5l', 'obj. 10'],
    ]);
    expect(screen.getByText(/Objednáno — Restaurace, říjen 2026 \(3 objednávky\)\. Stočeno a sklad se u odběratele neukazují/)).toBeTruthy();
  });

  it('výběr platí i pro týden: tento týden má Lípa 3× Světlá 50 l', async () => {
    await otevri();
    vyberOdberatele('Hospoda U Lípy');
    expect(radky().map(dvojice)).toEqual([['12° Světlá 50l', 'obj. 3']]);
    expect(screen.getByText(/Objednáno — Hospoda U Lípy, tento týden \(1 objednávka\)\./)).toBeTruthy();
    // po výběru odběratele se týden počítá z objednávek, ne z plánu — žádné „stočit"
    expect(radky().map(text).join(' ')).not.toMatch(/stočit|stoč\.|sklad/);
    // klepnutí otevře pohyby za týden (bez měsíce)
    fireEvent.click(radek(/Světlá/));
    expect(h.predvyber).toHaveBeenCalledWith('sv', 'k50', undefined);
  });

  it('výběr zůstane při listování; v měsíci bez objednávek je vidět v nabídce i s vysvětlením', async () => {
    await otevri();
    mesic();
    vyberOdberatele('Restaurace');
    fireEvent.click(screen.getByRole('button', { name: 'Předchozí měsíc' }));
    expect(radky().map(dvojice)).toEqual([['12° Světlá 50l', 'obj. 7']]);

    fireEvent.click(screen.getByRole('button', { name: 'Předchozí měsíc' }));   // srpen — nic
    expect(screen.getByText('Restaurace: v tomhle období žádná objednávka.')).toBeTruthy();
    const select = screen.getByLabelText('Odběratel') as HTMLSelectElement;
    expect(select.value).toBe(klicOdberatele('Restaurace'));
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Všichni odběratelé', 'Restaurace (0)']);
  });

  it('„Všichni odběratelé" vrátí všechno; týden bez odběratele znovu jde z plánu', async () => {
    await otevri();
    vyberOdberatele('Hospoda U Lípy');
    fireEvent.change(screen.getByLabelText('Odběratel'), { target: { value: '' } });
    expect(text(radek(/Světlá/))).toContain('stočit 1');
    expect(radky()).toHaveLength(2);
  });
});
