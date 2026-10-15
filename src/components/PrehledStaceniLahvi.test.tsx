// 📋 Přehled stáčení lahví po dnech — pás dne, pod ním jeden řádek na pivo.
// Zadání z 15. 10. 2026: „ten přehled udělej v řádku, takhle je to nepřehledný,
// odděl vždycky, ať je vidět, jaký den se co stáčelo."
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { Beer, EntryRow, Package } from '../lib/supabase';
import { davkyStaceni } from '../lib/prehledStaceni';
import PrehledStaceniLahvi, { type PrehledStaceniLahviProps } from './PrehledStaceniLahvi';

vi.mock('../lib/businessDate', async (orig) => ({
  ...(await orig<typeof import('../lib/businessDate')>()),
  businessDateISO: () => '2026-10-15',
}));

const PIVA = [
  { id: 'b12', name: '12° Světlá', beer_color: '#F59E0B' },
  { id: 'bj', name: 'Jantar', beer_color: '#44403B' },
] as unknown as Beer[];

const OBALY = [
  { id: 'l15', code: 'l15', kind: 'bottle', volume_l: 1.5, label: '1.5l', sort_order: 1 },
  { id: 'l1', code: 'l1', kind: 'bottle', volume_l: 1, label: '1l', sort_order: 2 },
  { id: 'l05', code: 'l05', kind: 'bottle', volume_l: 0.5, label: '0.5l', sort_order: 3 },
  { id: 'k50', code: 'k50', kind: 'keg', volume_l: 50, label: ' 50l', sort_order: 4 },
  { id: 'k30', code: 'k30', kind: 'keg', volume_l: 30, label: '30l', sort_order: 5 },
] as Package[];
const SUDY = OBALY.filter((p) => p.kind === 'keg');

const radek = (o: Partial<EntryRow> & { id: string }): EntryRow => ({
  entry_date: '2026-10-12',
  beer_id: 'b12',
  beer_name: '12° Světlá',
  package_id: 'l1',
  package_label: '1l',
  quantity: 10,
  note: null,
  created_at: '2026-10-12T08:00:00+00:00',
  kegs_used: 1,
  kegs_used_package_id: 'k50',
  ...o,
});

const objem = (id: string | null) => Number(OBALY.find((p) => p.id === id)?.volume_l) || 0;
const getBatchId = (r: EntryRow) => `${r.entry_date}_${r.beer_id}_${r.created_at.slice(0, 19)}_${r.kegs_used_package_id ?? ''}`;

function vykresli(radky: EntryRow[], extra: Partial<PrehledStaceniLahviProps> = {}) {
  const fn = {
    onKus: vi.fn(), onSudy: vi.fn(), onZmenSud: vi.fn(), onDalsiSud: vi.fn(), onUpravit: vi.fn(), onSmazat: vi.fn(),
  };
  const vysledek = render(
    <PrehledStaceniLahvi
      davky={davkyStaceni(radky, objem)}
      piva={PIVA}
      obaly={OBALY}
      sudy={SUDY}
      vychoziOtevrene={false}
      getBatchId={getBatchId}
      {...fn}
      {...extra}
    />,
  );
  return { ...vysledek, ...fn };
}

const DEN_PO = [
  radek({ id: 'a', package_id: 'l15', quantity: 30, kegs_used: 2 }),
  radek({ id: 'b', package_id: 'l1', quantity: 44, kegs_used: 2 }),
  radek({ id: 'c', beer_id: 'bj', beer_name: 'Jantar', package_id: 'l1', quantity: 44, created_at: '2026-10-12T09:00:00+00:00' }),
];

describe('dny jako pásy', () => {
  it('každý den má svůj pás s názvem dne a součtem', () => {
    vykresli([
      ...DEN_PO,
      radek({ id: 'd', entry_date: '2026-10-13', package_id: 'l05', quantity: 20, created_at: '2026-10-13T08:00:00+00:00' }),
    ]);
    const dny = screen.getAllByTestId('den-staceni');
    expect(dny).toHaveLength(2);
    // nejnovější nahoře
    expect(within(dny[0]).getByRole('heading').textContent).toContain('Úterý 13. 10.');
    expect(within(dny[1]).getByRole('heading').textContent).toContain('Pondělí 12. 10.');
    // 30 + 44 + 44 ks, litry 45 + 44 + 44 = 133
    expect(dny[1].textContent).toContain('118 ks · 133 L');
    expect(dny[0].textContent).toContain('20 ks · 10 L');
  });

  it('dvě piva stejného dne jsou dvě dlaždice pod JEDNÍM pásem', () => {
    vykresli(DEN_PO);
    expect(screen.getAllByTestId('den-staceni')).toHaveLength(1);
    expect(screen.getAllByTestId('davka-staceni')).toHaveLength(2);
  });

  it('dnešní den je označený', () => {
    vykresli([radek({ id: 'x', entry_date: '2026-10-15' }), radek({ id: 'y', entry_date: '2026-10-14', created_at: '2026-10-14T08:00:00+00:00' })]);
    const dny = screen.getAllByTestId('den-staceni');
    expect(within(dny[0]).queryByText('dnes')).toBeTruthy();
    expect(within(dny[1]).queryByText('dnes')).toBeNull();
  });

  it('záznam bez data má vlastní pás „Bez data" úplně dole', () => {
    vykresli([radek({ id: 'x', entry_date: '' }), radek({ id: 'y', created_at: '2026-10-12T08:00:00+00:00' })]);
    const dny = screen.getAllByTestId('den-staceni');
    expect(within(dny[dny.length - 1]).getByRole('heading').textContent).toContain('Bez data');
  });

  it('dlaždice má barvu piva', () => {
    vykresli(DEN_PO);
    const hlavicka = screen.getAllByTestId('davka-staceni')[0].querySelector('button') as HTMLElement;
    expect(hlavicka.style.backgroundColor).toBe('rgb(245, 158, 11)'); // #F59E0B
  });
});

describe('sbalená dlaždice říká všechno podstatné sama', () => {
  it('pivo, kusy, obaly a sud s litry a výtratou — bez rozklikávání', () => {
    vykresli(DEN_PO);
    const dlazdice = screen.getAllByTestId('davka-staceni')[0];
    expect(dlazdice.textContent).toContain('12° Světlá');
    expect(dlazdice.textContent).toContain('74 ks');
    // 30× 1,5 L + 44× 1 L
    expect(dlazdice.textContent).toContain('30× 1,5 L');
    expect(dlazdice.textContent).toContain('44× 1 L');
    // 2 sudy po 50 l = 100 l, stočeno 45 + 44 = 89 l → výtrata 11 %
    expect(dlazdice.textContent).toContain('2× KEG 50 L · stočeno 89 L · výtrata 11 %');
  });

  it('ovládací tlačítka záznamů jsou skrytá — přehled je řádek, ne formulář', () => {
    vykresli(DEN_PO);
    expect(screen.queryByLabelText('Ubrat kus')).toBeNull();
    expect(screen.queryByLabelText('Smazat záznam')).toBeNull();
  });

  it('stáčení rovnou z tanku se napíše jako „bez sudu"', () => {
    vykresli([radek({ id: 'x', kegs_used: null, kegs_used_package_id: null, package_id: 'l05', quantity: 40 })]);
    expect(screen.getByTestId('souhrn-sarze').textContent).toBe('bez sudu · stočeno 20 L');
  });

  it('dvě šarže téhož piva jsou dva řádky se sudy', () => {
    vykresli([
      radek({ id: 'a', package_id: 'l1', quantity: 44, kegs_used: 2 }),
      radek({ id: 'b', package_id: 'l05', quantity: 20, kegs_used: 1, created_at: '2026-10-12T10:00:00+00:00' }),
    ]);
    const radky = screen.getAllByTestId('souhrn-sarze').map((e) => e.textContent);
    expect(radky).toEqual([
      '2× KEG 50 L · stočeno 44 L · výtrata 56 %',
      '1× KEG 50 L · stočeno 10 L · výtrata 80 %',
    ]);
  });

  it('stejný obal ze dvou šarží se ve sbaleném řádku sečte', () => {
    vykresli([
      radek({ id: 'a', package_id: 'l1', quantity: 44, kegs_used: 2 }),
      radek({ id: 'b', package_id: 'l1', quantity: 33, kegs_used: 1, created_at: '2026-10-12T10:00:00+00:00' }),
    ]);
    expect(screen.getAllByTestId('davka-staceni')[0].textContent).toContain('77× 1 L');
  });
});

describe('rozbalení', () => {
  it('klepnutí na dlaždici rozbalí záznamy a tlačítka; druhé klepnutí je zase sbalí', () => {
    vykresli(DEN_PO);
    const hlavicka = screen.getAllByTestId('davka-staceni')[0].querySelector('button') as HTMLElement;
    expect(hlavicka.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(hlavicka);
    expect(hlavicka.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByTestId('zaznam-staceni')).toHaveLength(2); // 1,5 L a 1 L
    fireEvent.click(hlavicka);
    expect(screen.queryAllByTestId('zaznam-staceni')).toHaveLength(0);
  });

  it('rozbalení jedné dlaždice se nedotkne ostatních', () => {
    vykresli(DEN_PO);
    const [prvni, druha] = screen.getAllByTestId('davka-staceni').map((d) => d.querySelector('button') as HTMLElement);
    fireEvent.click(prvni);
    expect(prvni.getAttribute('aria-expanded')).toBe('true');
    expect(druha.getAttribute('aria-expanded')).toBe('false');
  });

  it('jeden den (vychoziOtevrene) má dlaždice rozbalené rovnou', () => {
    vykresli(DEN_PO, { vychoziOtevrene: true });
    expect(screen.getAllByTestId('zaznam-staceni')).toHaveLength(3);
  });

  it('ručně sbalená dlaždice se sbalí i tam, kde je výchozí rozbalená', () => {
    vykresli(DEN_PO, { vychoziOtevrene: true });
    const hlavicka = screen.getAllByTestId('davka-staceni')[0].querySelector('button') as HTMLElement;
    fireEvent.click(hlavicka);
    expect(hlavicka.getAttribute('aria-expanded')).toBe('false');
  });

  it('záznamy mají obal, kusy a čtyři tlačítka', () => {
    const { onKus, onUpravit, onSmazat } = vykresli([radek({ id: 'x', package_id: 'l15', quantity: 30 })], { vychoziOtevrene: true });
    const zaznam = screen.getByTestId('zaznam-staceni');
    expect(zaznam.textContent).toContain('1,5 L');
    expect(zaznam.textContent).toContain('30 ks');
    fireEvent.click(within(zaznam).getByLabelText('Ubrat kus'));
    fireEvent.click(within(zaznam).getByLabelText('Přidat kus'));
    fireEvent.click(within(zaznam).getByLabelText('Upravit záznam'));
    fireEvent.click(within(zaznam).getByLabelText('Smazat záznam'));
    expect(onKus.mock.calls).toEqual([['x', -1], ['x', 1]]);
    expect(onUpravit).toHaveBeenCalledWith(expect.objectContaining({ id: 'x' }));
    expect(onSmazat).toHaveBeenCalledWith('x');
  });

  it('automatický záznam má pod sebou, odkud se vzal', () => {
    vykresli([radek({ id: 'x', note: 'Založeno zaškrtnutím "Stočeno" u objednávky' })], { vychoziOtevrene: true });
    expect(screen.getByTestId('zaznam-staceni').textContent).toContain('Založeno zaškrtnutím');
  });
});

describe('sud', () => {
  const SBEZ = [radek({ id: 'x', kegs_used: 2, kegs_used_package_id: null, package_id: 'l1', quantity: 44 })];

  it('počet sudů BEZ velikosti dlaždici rozbalí, i když by byla sbalená', () => {
    vykresli(SBEZ);
    expect(screen.getByTestId('davka-staceni').querySelector('button')?.getAttribute('aria-expanded')).toBe('true');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Vyber velikost sudu');
    expect(alert.textContent).toContain('2 sudy ze skladu neodečtou');
  });

  it('velikost sudu se vybere rovnou, bez dalšího rozklikávání', () => {
    const { onZmenSud } = vykresli(SBEZ);
    fireEvent.click(screen.getByRole('radio', { name: 'KEG 30 L' }));
    expect(onZmenSud).toHaveBeenCalledWith('x', 'k30');
  });

  it('dlaždice bez zapsaného sudu (rovnou z tanku) se sama nerozbaluje', () => {
    vykresli([radek({ id: 'x', kegs_used: null, kegs_used_package_id: null })]);
    expect(screen.getByTestId('davka-staceni').querySelector('button')?.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('v rozbalené dlaždici je sud vidět jako text a měnit se dá až za tlačítkem „Sud"', () => {
    const { onSudy, onZmenSud } = vykresli([radek({ id: 'x', kegs_used: 2 })], { vychoziOtevrene: true });
    const sarze = screen.getByTestId('sarze-staceni');
    expect(sarze.textContent).toContain('2× KEG 50 L');
    expect(within(sarze).queryByRole('radiogroup')).toBeNull();
    expect(within(sarze).queryByLabelText('Přidat sud')).toBeNull();

    fireEvent.click(within(sarze).getByRole('button', { name: /Sud/ }));
    expect(within(sarze).getByRole('radiogroup')).toBeTruthy();
    fireEvent.click(within(sarze).getByLabelText('Přidat sud'));
    fireEvent.click(within(sarze).getByLabelText('Ubrat sud'));
    fireEvent.click(within(sarze).getByRole('radio', { name: 'KEG 30 L' }));
    expect(onSudy.mock.calls).toEqual([['x', 1], ['x', -1]]);
    expect(onZmenSud).toHaveBeenCalledWith('x', 'k30');
  });

  it('počet sudů a velikost se mění na řádku, který je nese — ne na prvním řádku šarže', () => {
    // Starší zápisy mají počet sudů jen na JEDNOM řádku šarže; ostatní mají
    // prázdno. Změna na jiném řádku by se do skladu nepropsala.
    const { onSudy, onZmenSud } = vykresli([
      radek({ id: 'bez', package_id: 'l15', quantity: 30, kegs_used: 0, kegs_used_package_id: 'k50' }),
      radek({ id: 'nese', package_id: 'l1', quantity: 44, kegs_used: 2, kegs_used_package_id: 'k50' }),
    ], { vychoziOtevrene: true });
    const sarze = screen.getByTestId('sarze-staceni'); // oba řádky jsou jedna šarže
    expect(within(sarze).getAllByTestId('zaznam-staceni')).toHaveLength(2);
    // Největší obal je první — a sudy nenese.
    expect(within(sarze).getAllByTestId('zaznam-staceni')[0].textContent).toContain('1,5 L');
    fireEvent.click(within(sarze).getByRole('button', { name: /Sud/ }));
    fireEvent.click(within(sarze).getByLabelText('Přidat sud'));
    fireEvent.click(within(sarze).getByRole('radio', { name: 'KEG 30 L' }));
    expect(onSudy).toHaveBeenCalledWith('nese', 1);
    expect(onZmenSud).toHaveBeenCalledWith('nese', 'k30');
  });

  it('„Další sud" je jen tam, kde sud je — a pošle záznamy šarže, velikost a počet', () => {
    const { onDalsiSud } = vykresli([
      radek({ id: 'a', package_id: 'l1', quantity: 44, kegs_used: 2 }),
      radek({ id: 'b', package_id: 'l05', quantity: 20, kegs_used: 2 }),
    ], { vychoziOtevrene: true });
    const sarze = screen.getByTestId('sarze-staceni');
    fireEvent.click(within(sarze).getByRole('button', { name: /Sud/ }));
    fireEvent.click(within(sarze).getByRole('button', { name: /Další sud/ }));
    expect(onDalsiSud).toHaveBeenCalledTimes(1);
    const [zaznamy, velikost, pocet] = onDalsiSud.mock.calls[0];
    expect(zaznamy.map((z: EntryRow) => z.id).sort()).toEqual(['a', 'b']);
    expect(velikost).toBe('k50');
    expect(pocet).toBe(2);
  });

  it('bez sudu žádné „Další sud" není', () => {
    vykresli([radek({ id: 'x', kegs_used: null, kegs_used_package_id: null })], { vychoziOtevrene: true });
    const sarze = screen.getByTestId('sarze-staceni');
    fireEvent.click(within(sarze).getByRole('button', { name: /Sud/ }));
    expect(within(sarze).queryByRole('button', { name: /Další sud/ })).toBeNull();
  });
});
