// 🔔 Nastavení upozornění musí být v okně poznámek OPRAVDU vidět.
// ---------------------------------------------------------------------------
// Z provozu 19. 9. 2026: „nevidím, že by v poznámkách šlo nastavit upozornění."
// Kód tam byl, ale testy na něj koukaly jen jako na text ve zdrojáku — což
// neřekne nic o tom, jestli se to vykreslí. Tenhle test okno postaví.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HomeNotesModal } from './HomeNotesModal';

vi.mock('../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'jan@pivovar.cz' }, profile: { display_name: 'Jan' }, patchProfile: vi.fn() }),
}));
vi.mock('../lib/sdilenePoznamky', () => ({
  nactiSdilene: async () => [],
  pridejSdilenou: async () => null,
  prepniHotovo: async () => {},
  smazSdilenou: async () => {},
  SDILENE_POZNAMKY_ZMENA: 'sdilene_zmena',
}));
vi.mock('../lib/reminders', () => ({
  fetchReminders: async () => [],
  createReminder: vi.fn(async () => {}),
  deleteReminder: vi.fn(async () => {}),
  acknowledgeReminder: vi.fn(async () => {}),
}));
vi.mock('../lib/supabase', async () => {
  const skutecne = await vi.importActual<typeof import('../lib/supabase')>('../lib/supabase');
  return { ...skutecne, useRealtime: () => {} };
});

describe('okno poznámek — upozornění', () => {
  beforeEach(() => localStorage.clear());

  it('nabídne přepínač „Upozornit"', () => {
    render(<HomeNotesModal isOpen onClose={() => {}} />);
    expect(screen.getByText('Upozornit')).toBeTruthy();
  });

  it('po zapnutí ukáže kdy, komu a kde — celé nastavení', () => {
    render(<HomeNotesModal isOpen onClose={() => {}} />);
    fireEvent.click(screen.getByText('Upozornit'));
    expect(screen.getByText(/Kdy upozornit/i), 'chybí volba času').toBeTruthy();
    expect(screen.getByText(/Komu upozornění přijde/i), 'chybí volba příjemce').toBeTruthy();
    expect(screen.getByText(/Kde se upozornění uká/i), 'chybí volba zobrazení').toBeTruthy();
    expect(screen.getByLabelText(/Datum a čas upozornění/i), 'chybí pole na datum a čas').toBeTruthy();
  });

  it('tlačítko dá najevo, že se přidá i upozornění', () => {
    render(<HomeNotesModal isOpen onClose={() => {}} />);
    fireEvent.click(screen.getByText('Upozornit'));
    expect(screen.getByText('Přidat s upozorněním')).toBeTruthy();
  });

  it('nestojí až za barvami a „Poslat všem" — tam na telefonu zanikl', () => {
    const { container } = render(<HomeNotesModal isOpen onClose={() => {}} />);
    const poradi = (text: string) => {
      const prvek = screen.getByText(text);
      return Array.from(container.querySelectorAll('*')).indexOf(prvek);
    };
    expect(poradi('Upozornit'), 'Upozornit má být nad řadou ovladačů')
      .toBeLessThan(poradi('Poslat všem'));
  });

  it('u napsané poznámky je zvoneček', () => {
    localStorage.setItem('pivovar_home_notes_v1', JSON.stringify([
      { id: 'n1', text: 'Došly korunky', completed: false, createdAt: new Date().toISOString() },
    ]));
    render(<HomeNotesModal isOpen onClose={() => {}} />);
    expect(screen.getByLabelText('Přidat upozornění')).toBeTruthy();
  });
});
