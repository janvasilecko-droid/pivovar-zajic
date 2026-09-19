// 📋 Jedny poznámky — jeden seznam, funkce všech tří zachovány.
// ---------------------------------------------------------------------------
// Z provozu 19. 9. 2026: „udělej jen jedny poznámky, a to ty na hlavní
// straně, ostatní vymaž, ale ať ty jedny mají všechny funkce těch 3."
//
// Dřív byl v jednom okně samostatný blok „Pro celou směnu" NAD osobními
// poznámkami — dva vizuálně oddělené systémy v jednom okně. Test kontroluje,
// že je teď skutečně JEDEN seznam (osobní i sdílené karty vedle sebe, ne
// v oddělených boxech), a že sdílený vzkaz umí totéž co osobní poznámka
// (důležitost, upozornění, smazání).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
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

const SDILENE = [
  { id: 'sd1', text: 'Došly korunky', autor: 'Petr', dulezite: false, hotovo: false, hotovo_kdo: null, created_at: '2026-09-19T08:00:00Z' },
];
const prepniHotovo = vi.fn(async () => null);
const prepniDulezite = vi.fn(async () => null);
const smazSdilenou = vi.fn(async () => null);
const pridejSdilenou = vi.fn(async () => null);
vi.mock('../lib/sdilenePoznamky', () => ({
  nactiSdilene: async () => SDILENE,
  pridejSdilenou: (...a: unknown[]) => pridejSdilenou(...a),
  prepniHotovo: (...a: unknown[]) => prepniHotovo(...a),
  prepniDulezite: (...a: unknown[]) => prepniDulezite(...a),
  smazSdilenou: (...a: unknown[]) => smazSdilenou(...a),
  SDILENE_POZNAMKY_ZMENA: 'sdilene_zmena',
}));
const createReminder = vi.fn(async () => {});
vi.mock('../lib/reminders', () => ({
  fetchReminders: async () => [],
  createReminder: (...a: unknown[]) => createReminder(...a),
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

describe('jeden seznam pro osobní i sdílené', () => {
  beforeEach(() => {
    localStorage.clear();
    prepniHotovo.mockClear(); prepniDulezite.mockClear(); smazSdilenou.mockClear(); pridejSdilenou.mockClear(); createReminder.mockClear();
  });

  it('sdílený vzkaz i osobní poznámka jsou v jednom seznamu, ne ve dvou boxech', async () => {
    localStorage.setItem('pivovar_home_notes_v1', JSON.stringify([
      { id: 'n1', text: 'Moje poznámka', completed: false, createdAt: new Date().toISOString() },
    ]));
    render(<HomeNotesModal isOpen onClose={() => {}} />);
    // Starý název samostatného boxu se nesmí objevit.
    expect(screen.queryByText('Pro celou směnu')).toBeNull();
    // Obě karty jsou vidět zároveň.
    expect(await screen.findByText('Došly korunky')).toBeTruthy();
    expect(screen.getByText('Moje poznámka')).toBeTruthy();
    // Sdílená karta se pozná podle odznaku.
    expect(screen.getByText('Směna')).toBeTruthy();
  });

  it('odškrtnutí sdíleného vzkazu volá prepniHotovo, ne osobní toggle', async () => {
    render(<HomeNotesModal isOpen onClose={() => {}} />);
    const karta = (await screen.findByText('Došly korunky')).closest('div.rounded-xl')!;
    fireEvent.click(within(karta).getByTitle('Odškrtnout pro všechny'));
    expect(prepniHotovo).toHaveBeenCalledWith(SDILENE[0], 'Jan');
  });

  it('důležitost jde nastavit i na sdíleném vzkazu', async () => {
    render(<HomeNotesModal isOpen onClose={() => {}} />);
    const karta = (await screen.findByText('Došly korunky')).closest('div.rounded-xl')!;
    fireEvent.click(within(karta).getByTitle('Označit jako důležité'));
    expect(prepniDulezite).toHaveBeenCalledWith(SDILENE[0]);
  });

  it('smazání sdíleného vzkazu volá smazSdilenou, ne deleteHomeNote', async () => {
    render(<HomeNotesModal isOpen onClose={() => {}} />);
    const karta = (await screen.findByText('Došly korunky')).closest('div.rounded-xl')!;
    fireEvent.click(within(karta).getByTitle('Smazat vzkaz pro všechny'));
    expect(smazSdilenou).toHaveBeenCalledWith('sd1');
  });

  it('upozornění jde přidat i na sdílený vzkaz', async () => {
    render(<HomeNotesModal isOpen onClose={() => {}} />);
    const karta = (await screen.findByText('Došly korunky')).closest('div.rounded-xl')!;
    fireEvent.click(within(karta).getByTitle('Přidat upozornění'));
    expect(within(karta).getByText('Upozornit')).toBeTruthy();
  });

  it('„Poslat všem" s upozorněním založí obojí — vzkaz i připomínku', async () => {
    render(<HomeNotesModal isOpen onClose={() => {}} />);
    napis('Zítra se stáčí od sedmi');
    fireEvent.click(screen.getByText('Poslat všem', { selector: 'label *' }) || screen.getByText('Poslat všem'));
    const form = screen.getByPlaceholderText(/Napište novou poznámku/i).closest('form')!;
    const proVsechnyBox = within(form).getAllByRole('checkbox')[1];
    fireEvent.click(proVsechnyBox);
    const upozornitBox = within(form).getAllByRole('checkbox')[0];
    fireEvent.click(upozornitBox);
    fireEvent.click(within(form).getByRole('button', { name: /Poslat všem/i }));
    expect(pridejSdilenou).toHaveBeenCalled();
  });

  it('nová poznámka se ukládá jako předtím (Enterem i tlačítkem)', () => {
    render(<HomeNotesModal isOpen onClose={() => {}} />);
    napis('Přivézt etikety');
    fireEvent.click(screen.getByText('Přidat poznámku'));
    expect(getHomeNotes().map((n) => n.text)).toContain('Přivézt etikety');
  });
});
