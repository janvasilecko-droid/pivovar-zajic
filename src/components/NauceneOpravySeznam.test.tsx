// Přehled naučených oprav čtení v Katalozích — co si appka pamatuje ze
// zaškrtnutého „Naučit" — a jejich mazání.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { NauceneOpravySeznam } from './NauceneOpravySeznam';
import { nactiNauceneOpravyProSpravu, smazNaucenouOpravu } from '../lib/nauceneOpravy';

vi.mock('../lib/nauceneOpravy', () => ({
  nactiNauceneOpravyProSpravu: vi.fn(),
  smazNaucenouOpravu: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../lib/toast', () => ({ chyba: vi.fn(), potvrd: vi.fn().mockResolvedValue(true) }));

const nacti = nactiNauceneOpravyProSpravu as unknown as ReturnType<typeof vi.fn>;
const BEERS = [{ id: 'b-12', name: '12° Světlá' }];
const PACKAGES = [{ id: 'p-033', label: '0.33l' }];
const OPRAVY = [
  { id: 'o1', misto_klic: 'm-luzec', place_id: 'm-luzec', place_name: 'Lužec', radek: '5 beden světlého', klic: 'beden svetleho', beer_id: null, package_id: 'p-033', created_by: 'majitel', created_at: '2026-11-23T10:00:00Z' },
  { id: 'o2', misto_klic: 'jmeno:naseb', place_id: null, place_name: 'Naseb', radek: '10x zajíc 1l', klic: 'zajic 1l', beer_id: 'b-12', package_id: null, created_by: null, created_at: null },
];

describe('NauceneOpravySeznam', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('vypíše, co se appka naučila: odběratel, řádek a na co se čte', async () => {
    nacti.mockResolvedValue({ opravy: OPRAVY, chybiMigrace: false });
    render(<NauceneOpravySeznam beers={BEERS} packages={PACKAGES} />);
    expect(await screen.findByText('Lužec: „5 beden světlého“ → 0.33l')).toBeTruthy();
    expect(screen.getByText('Naseb: „10x zajíc 1l“ → 12° Světlá')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Zapomenout naučenou opravu' })).toHaveLength(2);
  });

  it('smazání se ptá a pak opravu zapomene', async () => {
    nacti.mockResolvedValue({ opravy: OPRAVY, chybiMigrace: false });
    render(<NauceneOpravySeznam beers={BEERS} packages={PACKAGES} />);
    await screen.findByText('Lužec: „5 beden světlého“ → 0.33l');
    nacti.mockResolvedValue({ opravy: OPRAVY.slice(1), chybiMigrace: false });
    fireEvent.click(screen.getAllByRole('button', { name: 'Zapomenout naučenou opravu' })[0]);
    await waitFor(() => expect(smazNaucenouOpravu).toHaveBeenCalledWith('o1'));
    await waitFor(() => expect(screen.queryByText('Lužec: „5 beden světlého“ → 0.33l')).toBeNull());
  });

  it('prázdný seznam řekne, jak učení funguje', async () => {
    nacti.mockResolvedValue({ opravy: [], chybiMigrace: false });
    render(<NauceneOpravySeznam beers={BEERS} packages={PACKAGES} />);
    expect(await screen.findByText(/Zatím nic — appka si pamatuje jen to, u čeho zaškrtneš „Naučit“/)).toBeTruthy();
  });

  it('bez tabulky v databázi ukáže, která migrace čeká', async () => {
    nacti.mockResolvedValue({ opravy: [], chybiMigrace: true });
    render(<NauceneOpravySeznam beers={BEERS} packages={PACKAGES} />);
    expect(await screen.findByText(/čeká migrace „naucene_opravy_cteni“/)).toBeTruthy();
    expect(screen.queryByText(/Zatím nic/)).toBeNull();
  });
});
