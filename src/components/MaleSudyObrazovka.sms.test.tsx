// „Odeslat Radkovi" na celé obrazovce Malé sudy (24. 11. 2026): obrazovka si načte odběratele
// a Radkovo číslo z jeho karty předá tlačítku — SMS se pak otevře rovnou pro něj.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const DB: Record<string, unknown> = { packages: [], places: [] };
let chybaOdberatelu = false;
vi.mock('../lib/supabase', async (puvodni) => {
  const skutecny = await puvodni<typeof import('../lib/supabase')>();
  const dotaz = (tabulka: string) => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.order = () => q;
    q.then = (ok: (r: { data: unknown; error: unknown }) => unknown) => Promise.resolve(
      tabulka === 'places' && chybaOdberatelu ? { data: null, error: { message: 'síť' } } : { data: DB[tabulka] ?? [], error: null },
    ).then(ok);
    return q;
  };
  return { ...skutecny, supabase: { from: dotaz } };
});
vi.mock('../lib/businessDate', async (puvodni) => ({ ...(await puvodni<typeof import('../lib/businessDate')>()), businessDateISO: () => '2026-11-24' }));
vi.mock('../lib/useMaleSudy', () => ({
  useMaleSudy: () => ({
    zasoba: { s20: 7 }, zadanoKdy: {}, zapocitatPlne: new Set(), umiZapocitatPlne: true,
    nacteno: true, chybaNacteni: false, chybiMigrace: false, ulozit: vi.fn(async () => null), nastavZapocitatPlne: vi.fn(async () => null),
  }),
  useHlidaniMalychSudu: () => ({
    souhrn: [{ package_id: 's20', mame: 7, objednano: 5, nad: 0, zapocitanoPlnych: 0, plneSkladem: {}, zadano: 7, odvezeno: 0, odvezenoZ: [] }],
    pozdeji: [], nacteno: true, jmenaPiv: new Map(),
  }),
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ profile: null, user: null }) }));

import { MaleSudyObrazovka } from './MaleSudyPanel';

const TEXT = 'Čau, malé sudy 24. 11.: 20l: 7x';

beforeEach(() => {
  localStorage.clear();
  chybaOdberatelu = false;
  DB.packages = [{ id: 's20', kind: 'keg', volume_l: 20, label: '20l', sort_order: 1 }];
  DB.places = [{ name: 'Jona', phone: '111 222 333' }, { name: 'Radek', phone: '777 123 456' }];
});

describe('Malé sudy (celá obrazovka): „Odeslat Radkovi"', () => {
  it('číslo Radka se vezme z karty odběratele Radek, ne od jiného odběratele', async () => {
    render(<MaleSudyObrazovka />);
    const odkaz = (await screen.findByRole('link', { name: /Odeslat Radkovi/ })) as HTMLAnchorElement;
    await screen.findByText(/Číslo z karty odběratele Radek/);
    expect(odkaz.getAttribute('href')).toBe(`sms:+420777123456?&body=${encodeURIComponent(TEXT)}`);
  });

  it('Radek bez telefonu: SMS bez příjemce a hláška, kam telefon doplnit', async () => {
    DB.places = [{ name: 'Radek', phone: null }];
    render(<MaleSudyObrazovka />);
    const odkaz = (await screen.findByRole('link', { name: /Odeslat Radkovi/ })) as HTMLAnchorElement;
    expect(odkaz.getAttribute('href')).toBe(`sms:?&body=${encodeURIComponent(TEXT)}`);
    expect((await screen.findByTestId('sms-prijemce')).textContent).toContain('U odběratele Radek není telefon');
  });

  it('odběratele se nepodařilo načíst: obrazovka funguje dál, SMS se otevře bez příjemce', async () => {
    chybaOdberatelu = true;
    render(<MaleSudyObrazovka />);
    const odkaz = (await screen.findByRole('link', { name: /Odeslat Radkovi/ })) as HTMLAnchorElement;
    expect(odkaz.getAttribute('href')).toBe(`sms:?&body=${encodeURIComponent(TEXT)}`);
  });
});
