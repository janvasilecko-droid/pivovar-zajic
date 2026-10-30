import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

let profil: { role: string; permissions?: unknown } | null = null;
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1', email: 'u@pivovar.cz' }, profile: profil }) }));
// Klient by se v testu bez adresy Supabase nevytvořil — prázdná knihovna.
vi.mock('../lib/bibleKlient', () => {
  const dotaz: Record<string, unknown> = {
    select: () => dotaz,
    order: () => dotaz,
    then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok),
  };
  return { bibleDb: { from: () => dotaz, rpc: async () => ({ data: null, error: { message: 'jen pro správce' } }) } };
});

import BibleScreen, { BIBLE_DLAZDICE } from './BibleScreen';

describe('Pivovarská bible — plocha', () => {
  it('má 8 dlaždic přesně podle zadání (bod 10)', () => {
    expect(BIBLE_DLAZDICE.map((d) => d.nazev)).toEqual([
      'Odborný chatbot', 'Knihovna dokumentů', 'Výpočtová laboratoř', 'Technologie pivovaru',
      'Receptury a várky', 'Analýza problémů', 'Zkušenosti sládků', 'Správa znalostí',
    ]);
  });

  it('bez povolení ukáže jen vysvětlení, kde přístup získat — žádné dlaždice', () => {
    profil = { role: 'user', permissions: { dashboard: { view: true, edit: true } } };
    render(<BibleScreen />);
    expect(screen.getByRole('alert').textContent).toMatch(/nemáš přístup/);
    expect(screen.queryByText('Knihovna dokumentů')).toBeNull();
  });

  it('správce vidí plochu; nehotová dlaždice poctivě řekne etapu a nic nepředstírá', () => {
    profil = { role: 'admin' };
    const setPage = vi.fn();
    render(<BibleScreen setPage={setPage} />);
    expect(screen.getByText('Knihovna dokumentů')).toBeTruthy();
    fireEvent.click(screen.getByText('Odborný chatbot'));
    expect(screen.getByText(/Připravujeme · etapa 5/)).toBeTruthy();
    expect(screen.getByText(/AI zatím z knih neodpovídá/)).toBeTruthy();
    expect(setPage).toHaveBeenCalledWith('bible', undefined, 'chat');
  });

  it('uživatel s povoleným modulem bible plochu vidí', () => {
    profil = { role: 'user', permissions: { bible: { view: true, edit: false } } };
    render(<BibleScreen pageSubTab="sprava" />);
    expect(screen.getByText('Kdo má přístup')).toBeTruthy();
    expect(screen.getByText(/Tvoje role v knihovně/).textContent).toMatch(/čte/);
  });
});
