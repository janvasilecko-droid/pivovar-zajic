// Načíst z Excelu — hub obrazovka: karty za soubory ve sdílené evidenci,
// jen jedna (Stáčení lahví) je zatím připravená k nahrání.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ImportExcelScreen from './ImportExcelScreen';

vi.mock('../lib/supabase', async () => {
  const skutecny = await vi.importActual<any>('../lib/supabase');
  return {
    ...skutecny,
    supabase: {
      from: () => ({
        select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }), order: () => Promise.resolve({ data: [], error: null }) }),
      }),
    },
  };
});
vi.mock('../lib/toast', () => ({ oznam: vi.fn() }));

describe('ImportExcelScreen', () => {
  it('ukáže kartu pro každý soubor ze sdílené evidence, jen Stáčení lahví je připravené', () => {
    render(<ImportExcelScreen />);
    expect(screen.getByRole('heading', { name: 'Načíst z Excelu' })).toBeTruthy();
    for (const nazev of ['Stáčení lahví', 'Stáčení KEG', 'Fasování', 'Inventura', 'Odběr personál', 'Řezání', 'Výdej objednávek', 'Vzorky a promo']) {
      expect(screen.getByText(nazev)).toBeTruthy();
    }
    expect(screen.getAllByText('Zatím nepřipraveno')).toHaveLength(7 * 2); // štítek + text tlačítka
  });

  it('nepřipravená karta otevře jen upozornění, ne import', async () => {
    const { oznam } = await import('../lib/toast');
    render(<ImportExcelScreen />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Zatím nepřipraveno' })[0]);
    expect(oznam).toHaveBeenCalledWith(expect.stringContaining('Stáčení KEG'));
    expect(screen.queryByText('Import stáčení lahví z Excelu')).toBeNull();
  });

  it('karta Stáčení lahví otevře import', async () => {
    render(<ImportExcelScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Nahrát soubor' }));
    expect(await screen.findByText('Import stáčení lahví z Excelu')).toBeTruthy();
  });
});
