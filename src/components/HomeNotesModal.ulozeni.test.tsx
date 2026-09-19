// 📝 Napsat poznámku a dát uložit MUSÍ poznámku uložit.
// ---------------------------------------------------------------------------
// Z provozu 19. 9. 2026: „ta poznámka se má objevit v tom bloku na hlavní
// straně, ale když dám uložit, nic se nestane."
//
// Dosavadní testy okno jen vykreslily. Tenhle ho proklikne: napíše text,
// zmáčkne tlačítko a kouká, jestli poznámka opravdu někde je.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HomeNotesModal } from './HomeNotesModal';
import { getHomeNotes } from '../lib/homeNotes';

const patchProfile = vi.fn();
vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'jan@pivovar.cz' },
    profile: { display_name: 'Jan', home_layout: {} },
    patchProfile: (...a: unknown[]) => patchProfile(...a),
  }),
}));
const pridejSdilenou = vi.fn(async () => null);
vi.mock('../lib/sdilenePoznamky', () => ({
  nactiSdilene: async () => [],
  pridejSdilenou: (...a: unknown[]) => pridejSdilenou(...a),
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

function napis(text: string) {
  fireEvent.change(screen.getByPlaceholderText(/Napište novou poznámku/i), { target: { value: text } });
}

describe('uložení poznámky', () => {
  beforeEach(() => { localStorage.clear(); patchProfile.mockClear(); pridejSdilenou.mockClear(); });

  it('napsaná poznámka se po klepnutí uloží', () => {
    render(<HomeNotesModal isOpen onClose={() => {}} />);
    napis('Došly korunky');
    fireEvent.click(screen.getByText('Přidat poznámku'));
    expect(getHomeNotes().map((n) => n.text), 'poznámka se neuložila').toContain('Došly korunky');
  });

  it('objeví se rovnou v seznamu v okně', () => {
    render(<HomeNotesModal isOpen onClose={() => {}} />);
    napis('Došly korunky');
    fireEvent.click(screen.getByText('Přidat poznámku'));
    expect(screen.getByText('Došly korunky')).toBeTruthy();
  });

  it('po uložení se pole vyprázdní, ať jde psát další', () => {
    render(<HomeNotesModal isOpen onClose={() => {}} />);
    napis('Došly korunky');
    fireEvent.click(screen.getByText('Přidat poznámku'));
    expect((screen.getByPlaceholderText(/Napište novou poznámku/i) as HTMLTextAreaElement).value).toBe('');
  });

  it('uloží i Enterem v textu', () => {
    render(<HomeNotesModal isOpen onClose={() => {}} />);
    const pole = screen.getByPlaceholderText(/Napište novou poznámku/i);
    fireEvent.change(pole, { target: { value: 'Přivézt etikety' } });
    fireEvent.keyDown(pole, { key: 'Enter' });
    expect(getHomeNotes().map((n) => n.text)).toContain('Přivézt etikety');
  });

  it('prázdná poznámka se neuloží', () => {
    render(<HomeNotesModal isOpen onClose={() => {}} />);
    napis('   ');
    fireEvent.click(screen.getByText('Přidat poznámku'));
    expect(getHomeNotes()).toHaveLength(0);
  });

  it('„Poslat všem" pošle vzkaz směně, ne mezi moje poznámky', () => {
    const { container } = render(<HomeNotesModal isOpen onClose={() => {}} />);
    napis('Zítra se stáčí od sedmi');
    const prepinac = container.querySelector('input[type="checkbox"].text-sky-500') as HTMLInputElement;
    fireEvent.click(prepinac);
    fireEvent.click(container.querySelector('button[type="submit"]')!);
    expect(pridejSdilenou, 'vzkaz směně se neodeslal').toHaveBeenCalled();
    expect(getHomeNotes(), 'vzkaz směně nemá ležet i mezi osobními').toHaveLength(0);
  });
});
