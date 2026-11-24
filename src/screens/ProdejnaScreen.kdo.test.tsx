// Fasování → Personál: „Pro koho" je napřed přihlášený uživatel (24. 11. 2026: „když kliknu fasování
// personál, tak primárně nastav, že si fasuje daný uživatel, který je přihlášený, případně to může
// změnit, ale primárně ať je to na jméně přihlášeného uživatele").
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ProdejnaScreen from './ProdejnaScreen';

const h = vi.hoisted(() => {
  const zapisy: Record<string, unknown>[] = [];
  const potvrd = vi.fn();
  const profil: { current: { display_name: string | null } | null } = { current: null };
  const DB: Record<string, Record<string, unknown>[]> = {
    fasovani_private: [], fasovani: [], writeoffs: [],
    beers: [{ id: 'beer-12', name: '12° Světlá', is_active: true, sort_order: 1 }],
    packages: [{ id: 'pkg-05', label: '0,5 l', kind: 'bottle', volume_l: 0.5, sort_order: 1 }],
    inventory: [], parser_aliases: [],
  };
  return { DB, zapisy, potvrd, profil };
});

vi.mock('../lib/supabase', () => {
  function makeQuery(table: string) {
    const data = h.DB[table] ?? [];
    const q = Promise.resolve({ data, error: null }) as Promise<{ data: unknown; error: null }> & Record<string, unknown>;
    q.select = vi.fn(() => q);
    q.order = vi.fn(() => q);
    q.eq = vi.fn(() => q);
    q.in = vi.fn(() => q);
    q.limit = vi.fn(() => q);
    q.maybeSingle = vi.fn().mockResolvedValue({ data: data[0] ?? null, error: null });
    q.insert = vi.fn((payload: Record<string, unknown> | Record<string, unknown>[]) => {
      const radky = Array.isArray(payload) ? payload : [payload];
      h.zapisy.push(...radky.map((r) => ({ ...r, __tabulka: table })));
      const vlozeno = Promise.resolve({ data: radky.map((_, i) => ({ id: `novy-${i}` })), error: null }) as Promise<{ data: unknown; error: null }> & Record<string, unknown>;
      vlozeno.select = vi.fn(() => vlozeno);
      return vlozeno;
    });
    q.update = vi.fn(() => q);
    q.delete = vi.fn(() => q);
    return q;
  }
  return {
    supabase: { from: vi.fn((t: string) => makeQuery(t)) },
    fetchAllRows: vi.fn((t: string) => makeQuery(t)),
    useRealtime: vi.fn(),
    beerBg: vi.fn(() => '#f59e0b'),
    beerText: vi.fn(() => '#000'),
    beerInk: vi.fn(() => '#000'),
    beerName: vi.fn((b: { name?: string } | null | undefined) => b?.name ?? ''),
    pkgBg: vi.fn(() => '#ef4444'),
    pkgText: vi.fn(() => '#fff'),
    formatPackageLabel: vi.fn((l: string) => l),
  };
});
vi.mock('../lib/toast', () => ({
  chyba: vi.fn(),
  uspech: vi.fn(),
  oznam: vi.fn(),
  potvrd: h.potvrd,
  toastZpet: vi.fn(),
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ profile: h.profil.current }) }));

const KLIC = 'rozdelany_vydej_fasovani';
const RADEK = { beerId: 'beer-12', pkgId: 'pkg-05', qty: '6', vycep: false, who: '' };
const PRO_KOHO = 'Jméno — komu se fasuje';
const personal = () => <ProdejnaScreen table="fasovani" title="Fasování" showVycep />;
const odpis = () => <ProdejnaScreen table="writeoffs" title="Odpis" />;
const prodejna = () => <ProdejnaScreen table="fasovani_private" title="Fasování" />;
const pole = async () => (await screen.findByPlaceholderText(PRO_KOHO)) as HTMLInputElement;
const nactenoPrazdne = () => waitFor(() => expect(screen.getByRole('button', { name: /Uložit fasování/ })).toBeTruthy());

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  h.zapisy.length = 0;
  h.potvrd.mockResolvedValue(true);
  h.profil.current = { display_name: 'Jan' };
});

describe('Fasování personál: „Pro koho" je napřed přihlášený uživatel', () => {
  it('po otevření je v poli jméno přihlášeného', async () => {
    render(personal());
    expect((await pole()).value).toBe('Jan');
  });

  it('jde přepsat na jiné jméno', async () => {
    render(personal());
    const p = await pole();
    fireEvent.change(p, { target: { value: 'Pavel' } });
    expect(p.value).toBe('Pavel');
  });

  it('bez zásahu se uloží přihlášený: řádek má who = jméno přihlášeného', async () => {
    localStorage.setItem(KLIC, JSON.stringify({ entryRows: [RADEK], who: '', note: '', date: '2026-01-05' }));
    render(personal());
    await screen.findByTestId('rozepsany-zapis-pruh');
    expect((await pole()).value).toBe('Jan');
    fireEvent.click(screen.getByRole('button', { name: /Uložit fasování/ }));
    await waitFor(() => expect(h.zapisy.length).toBeGreaterThan(0));
    expect(h.zapisy[0]).toMatchObject({ __tabulka: 'fasovani', who: 'Jan', quantity: 6 });
  });

  it('přepsané jméno se uloží místo přihlášeného', async () => {
    localStorage.setItem(KLIC, JSON.stringify({ entryRows: [RADEK], who: '', note: '', date: '2026-01-05' }));
    render(personal());
    await screen.findByTestId('rozepsany-zapis-pruh');
    fireEvent.change(await pole(), { target: { value: 'Pavel' } });
    fireEvent.click(screen.getByRole('button', { name: /Uložit fasování/ }));
    await waitFor(() => expect(h.zapisy.length).toBeGreaterThan(0));
    expect(h.zapisy[0]).toMatchObject({ who: 'Pavel' });
  });

  it('po uložení je v poli zase přihlášený (ne prázdno, ne předchozí jméno)', async () => {
    localStorage.setItem(KLIC, JSON.stringify({ entryRows: [RADEK], who: '', note: '', date: '2026-01-05' }));
    render(personal());
    await screen.findByTestId('rozepsany-zapis-pruh');
    fireEvent.change(await pole(), { target: { value: 'Pavel' } });
    fireEvent.click(screen.getByRole('button', { name: /Uložit fasování/ }));
    await waitFor(() => expect(h.zapisy.length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.queryByTestId('rozepsany-zapis-pruh')).toBeNull());
    expect((await pole()).value).toBe('Jan');
  });

  it('„Vymazat vše" vrátí přihlášeného; když je rozepsané jen jméno, nic se nezeptá', async () => {
    render(personal());
    const p = await pole();
    fireEvent.click(await screen.findByRole('button', { name: /Vymazat vše/ }));
    expect(h.potvrd).not.toHaveBeenCalled();
    expect(p.value).toBe('Jan');
    fireEvent.change(p, { target: { value: 'Pavel' } });
    fireEvent.click(screen.getByRole('button', { name: /Vymazat vše/ }));
    await waitFor(() => expect((screen.getByPlaceholderText(PRO_KOHO) as HTMLInputElement).value).toBe('Jan'));
  });
});

describe('Fasování personál: výchozí jméno není rozepsaný zápis', () => {
  it('samotné jméno přihlášeného se neukládá jako koncept a „Obnoveno" se neukazuje', async () => {
    render(personal());
    await pole();
    await nactenoPrazdne();
    expect(localStorage.getItem(KLIC)).toBeNull();
    expect(screen.queryByTestId('rozepsany-zapis-pruh')).toBeNull();
  });

  it('s rozepsanými řádky se koncept ukládá i s tím jménem', async () => {
    localStorage.setItem(KLIC, JSON.stringify({ entryRows: [RADEK], who: '', note: '', date: '2026-01-05' }));
    render(personal());
    await screen.findByTestId('rozepsany-zapis-pruh');
    await waitFor(() => expect(JSON.parse(localStorage.getItem(KLIC)!).who).toBe('Jan'));
  });

  it('koncept jen se jménem přihlášeného se při otevření zahodí (není co obnovovat)', async () => {
    localStorage.setItem(KLIC, JSON.stringify({ entryRows: [], who: 'Jan', note: '', date: '2026-01-05' }));
    render(personal());
    await pole();
    await nactenoPrazdne();
    expect(screen.queryByTestId('rozepsany-zapis-pruh')).toBeNull();
    expect(localStorage.getItem(KLIC)).toBeNull();
  });

  it('koncept s jiným jménem ho vrátí; koncept s prázdným jménem dostane přihlášeného', async () => {
    localStorage.setItem(KLIC, JSON.stringify({ entryRows: [RADEK], who: 'Pavel', note: '', date: '2026-01-05' }));
    const { unmount } = render(personal());
    await screen.findByTestId('rozepsany-zapis-pruh');
    expect((await pole()).value).toBe('Pavel');
    unmount();
    localStorage.setItem(KLIC, JSON.stringify({ entryRows: [RADEK], who: '', note: '', date: '2026-01-05' }));
    render(personal());
    await screen.findByTestId('rozepsany-zapis-pruh');
    expect((await pole()).value).toBe('Jan');
  });
});

describe('Fasování personál: profil dorazí později, druh výdeje se přepíná', () => {
  it('profil dorazí až po otevření: jméno se doplní; co člověk mezitím napsal, se nepřepíše', async () => {
    h.profil.current = null;
    const { rerender } = render(personal());
    expect((await pole()).value).toBe('');
    h.profil.current = { display_name: 'Jan' };
    rerender(personal());
    await waitFor(() => expect((screen.getByPlaceholderText(PRO_KOHO) as HTMLInputElement).value).toBe('Jan'));

    h.profil.current = null;
    rerender(personal());
    fireEvent.change(screen.getByPlaceholderText(PRO_KOHO), { target: { value: 'Pavel' } });
    h.profil.current = { display_name: 'Jan' };
    rerender(personal());
    expect((screen.getByPlaceholderText(PRO_KOHO) as HTMLInputElement).value).toBe('Pavel');
  });

  it('přepnutí na odpis jméno z pole „Důvod" odstraní, návrat na personál ho vrátí', async () => {
    const { rerender } = render(personal());
    expect((await pole()).value).toBe('Jan');
    rerender(odpis());
    const duvod = (await screen.findByPlaceholderText(/Proč se odepisuje/)) as HTMLInputElement;
    expect(duvod.value).toBe('');
    rerender(personal());
    await waitFor(() => expect((screen.getByPlaceholderText(PRO_KOHO) as HTMLInputElement).value).toBe('Jan'));
  });

  it('ručně napsané jméno se při přepnutí zachová (stejně jako dřív), výchozí ne', async () => {
    const { rerender } = render(personal());
    fireEvent.change(await pole(), { target: { value: 'Pavel' } });
    rerender(odpis());
    expect(((await screen.findByPlaceholderText(/Proč se odepisuje/)) as HTMLInputElement).value).toBe('Pavel');
  });

  it('odpis má prázdný důvod i s přihlášeným uživatelem — jméno se tam nedostane', async () => {
    render(odpis());
    expect(((await screen.findByPlaceholderText(/Proč se odepisuje/)) as HTMLInputElement).value).toBe('');
  });

  it('prodejna pole „Pro koho" nemá a přihlášený se k zápisu nepřipisuje', async () => {
    localStorage.setItem('rozdelany_vydej_fasovani_private', JSON.stringify({ entryRows: [RADEK], who: '', note: '', date: '2026-01-05' }));
    render(prodejna());
    await screen.findByTestId('rozepsany-zapis-pruh');
    expect(screen.queryByPlaceholderText(PRO_KOHO)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Uložit fasování/ }));
    await waitFor(() => expect(h.zapisy.length).toBeGreaterThan(0));
    expect(h.zapisy[0].__tabulka).toBe('fasovani_private');
    expect(JSON.stringify(h.zapisy[0])).not.toContain('Jan');
  });

  it('bez přihlášeného (bez profilu) zůstává pole prázdné jako dřív', async () => {
    h.profil.current = null;
    render(personal());
    expect((await pole()).value).toBe('');
    await nactenoPrazdne();
    expect(localStorage.getItem(KLIC)).toBeNull();
  });

  it('profil bez jména (null) = prázdné pole', async () => {
    h.profil.current = { display_name: null };
    render(personal());
    expect((await pole()).value).toBe('');
  });
});
