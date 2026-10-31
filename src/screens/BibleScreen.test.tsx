import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

let profil: { role: string; permissions?: unknown } | null = null;
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1', email: 'u@pivovar.cz' }, profile: profil }) }));
// Brána projektu bible: prázdná knihovna, kapacita a útrata jen pro správce.
vi.mock('../lib/bibleKlient', () => ({
  BIBLE_URL: 'https://cegrelgvkygcatupqwrx.supabase.co',
  odkazDoUloziste: () => null,
  volejBibli: async (_funkce: string, telo: { akce?: string }) => (telo.akce === 'dokumenty' || telo.akce === 'nastaveni'
    ? { ok: true, data: telo.akce === 'dokumenty' ? [] : {} }
    : { ok: false, chyba: { kod: 'zakazano', zprava: 'jen pro správce', status: 403 } }),
}));

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
