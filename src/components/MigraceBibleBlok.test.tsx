import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const volani: Record<string, unknown>[] = [];
let seznam: { ok: boolean; data?: unknown; chyba?: unknown } = { ok: true, data: { evidence: false, aplikovane: [] } };
vi.mock('../lib/bibleKlient', () => ({
  volejBibli: vi.fn(async (_funkce: string, telo: Record<string, unknown>) => {
    volani.push(telo);
    if (telo.akce === 'seznam') return seznam;
    return { ok: true, data: { nazev: telo.nazev, jizBylo: false } };
  }),
}));
vi.mock('../lib/toast', () => ({ oznam: vi.fn(), potvrd: vi.fn(async () => true) }));

import { MigraceBibleBlok } from './MigraceBibleBlok';

beforeEach(() => {
  volani.length = 0;
  seznam = { ok: true, data: { evidence: false, aplikovane: [] } };
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ soubory: ['20261101000000_bible_zaklad.sql'] }), { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

describe('Migrace databáze bible v Systému', () => {
  it('úplně nový projekt: první migrace čeká a tlačítko ji pustí přes bible-migrace', async () => {
    render(<MigraceBibleBlok />);
    expect(await screen.findByText('20261101000000_bible_zaklad.sql')).toBeTruthy();
    expect(screen.getByText('1 čeká na spuštění')).toBeTruthy();
    fireEvent.click(screen.getByText('Spustit tuhle migraci bible'));
    await waitFor(() => expect(volani.some((v) => v.akce === 'spustit')).toBe(true));
    expect(volani.find((v) => v.akce === 'spustit')).toEqual({ akce: 'spustit', nazev: '20261101000000_bible_zaklad.sql' });
  });

  it('aplikovaná migrace nečeká (žádná hranice „starší než evidence" jako u hlavní databáze)', async () => {
    seznam = { ok: true, data: { evidence: true, aplikovane: [{ nazev: '20261101000000_bible_zaklad.sql', aplikovano_at: '2026-11-01T10:00:00Z' }] } };
    render(<MigraceBibleBlok />);
    expect(await screen.findByText('nic nečeká')).toBeTruthy();
  });

  it.each(['nenasazeno', 'nedostupna'])('bot neodpovídá (%s): návod s přesnými odkazy', async (kod) => {
    seznam = { ok: false, chyba: { kod, zprava: 'Databáze bible neodpovídá.', status: 0 } };
    render(<MigraceBibleBlok />);
    expect(await screen.findByText(/Bot \(funkce projektu bible\) neodpovídá/)).toBeTruthy();
    expect(screen.getByText('SUPABASE_BIBLE_ACCESS_TOKEN')).toBeTruthy();
    const odkazy = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(odkazy).toEqual(expect.arrayContaining([
      'https://supabase.com/dashboard/account/tokens',
      'https://github.com/janvasilecko-droid/pivovar-zajic/settings/secrets/actions/new',
      'https://github.com/janvasilecko-droid/pivovar-zajic/actions/workflows/deploy.yml',
    ]));
  });

  it('jiná chyba (třeba chybí migrace v hlavní databázi) se ukáže doslova', async () => {
    seznam = { ok: false, chyba: { kod: 'chybi_overeni', zprava: 'V hlavní databázi chybí migrace 20261231430000.', status: 503 } };
    render(<MigraceBibleBlok />);
    expect(await screen.findByText(/chybí migrace 20261231430000/)).toBeTruthy();
  });
});
