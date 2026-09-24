// Zadání 24. 9. 2026: „proc sou uzivatele a prava v zaloze to ma byt
// vlastni dlazdice jen pro admina." Dlaždice „Stáhnout zálohu" dřív otevírala
// celou obrazovku Uživatelé (seznam lidí, práva, schvalování e-mailů) s
// tlačítky zálohy jen přilepenými nahoře. Tenhle test hlídá, že samostatná
// obrazovka ukazuje JEN zálohu — žádný seznam uživatel — a že se dál drží
// pravidla "jen admin", stejně jako předtím.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ZalohaScreen from './ZalohaScreen';

const vytvorZalohu = vi.fn().mockResolvedValue({ tables: {}, created_at: '2026-09-24' });
const stahniJson = vi.fn();
const stahniSheets = vi.fn().mockResolvedValue(undefined);
vi.mock('../lib/backup', () => ({
  createFullBackup: (...a: unknown[]) => vytvorZalohu(...a),
  downloadBackupJSON: (...a: unknown[]) => stahniJson(...a),
  downloadGoogleSheetsExcelBackup: (...a: unknown[]) => stahniSheets(...a),
}));

let profil: { role: string } | null = { role: 'admin' };
vi.mock('../lib/auth', () => ({
  useAuth: () => ({ profile: profil, user: { email: 'sladek@example.com' } }),
}));

describe('ZalohaScreen — samostatná obrazovka jen se zálohou', () => {
  beforeEach(() => {
    profil = { role: 'admin' };
    vytvorZalohu.mockClear();
    stahniJson.mockClear();
    stahniSheets.mockClear();
  });

  it('adminovi ukáže jen tlačítka zálohy — žádný seznam uživatelů ani záložky', () => {
    render(<ZalohaScreen />);
    expect(screen.getByText('JSON Záloha')).toBeTruthy();
    expect(screen.getByText(/Týdenní záloha pro Google Tabulky/)).toBeTruthy();
    // Tohle dřív bylo na téže obrazovce — teď tu být nesmí.
    expect(screen.queryByText('Uživatelé & Práva')).toBeNull();
    expect(screen.queryByText('Schválené e-maily')).toBeNull();
  });

  it('kliknutí na JSON zálohu vytvoří zálohu a stáhne ji', async () => {
    render(<ZalohaScreen />);
    fireEvent.click(screen.getByText('JSON Záloha'));
    await waitFor(() => expect(stahniJson).toHaveBeenCalledTimes(1));
    expect(vytvorZalohu).toHaveBeenCalledTimes(1);
    expect(stahniSheets).not.toHaveBeenCalled();
  });

  it('kliknutí na Google Tabulky vytvoří zálohu a stáhne .xlsx', async () => {
    render(<ZalohaScreen />);
    fireEvent.click(screen.getByText(/Týdenní záloha pro Google Tabulky/));
    await waitFor(() => expect(stahniSheets).toHaveBeenCalledTimes(1));
    expect(stahniJson).not.toHaveBeenCalled();
  });

  it('kdo není admin, zálohu vůbec nevidí — stejné pravidlo jako předtím', () => {
    profil = { role: 'user' };
    render(<ZalohaScreen />);
    expect(screen.queryByText('JSON Záloha')).toBeNull();
    expect(screen.getByText(/pouze adminům/)).toBeTruthy();
  });
});
