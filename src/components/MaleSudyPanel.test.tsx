// „Proč je tam prázdných 12? Mají být tolik, kolik jsem jich zadal" (13. 10. 2026):
// velké číslo je to, co člověk naklikal — ne zbytek po objednávkách.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const ulozit = vi.fn(async (..._a: unknown[]) => null);
vi.mock('../lib/useMaleSudy', () => ({
  useMaleSudy: () => ({
    zasoba: { s20: 7 }, zapocitatPlne: new Set(), umiZapocitatPlne: true, nacteno: true, chybiMigrace: false,
    ulozit, nastavZapocitatPlne: vi.fn(async () => null),
  }),
  useHlidaniMalychSudu: () => ({
    souhrn: [{ package_id: 's20', objednano: 5, nad: 0, zapocitanoPlnych: 0, plneSkladem: {} }],
    jmenaPiv: new Map(),
  }),
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ profile: null, user: null }) }));

import { MaleSudyPanel } from './MaleSudyPanel';

describe('Malé sudy: velké číslo = kolik jsem zadal', () => {
  it('7 prázdných při 5 objednaných ukáže 7 a pod tím „K dispozici 2"', () => {
    render(<MaleSudyPanel packages={[{ id: 's20', kind: 'keg', volume_l: 20, label: '20l' } as any]} canEdit />);
    expect((screen.getByLabelText('Počet prázdných 20l') as HTMLInputElement).value).toBe('7');
    expect(screen.getByText(/v otevřených objednávkách 5/)).toBeTruthy();
    expect(screen.getByText('K dispozici')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy(); // 7 prázdných − 5 v objednávkách
    expect(screen.queryByText(/Prázdných celkem/)).toBeNull();
  });

  it('počet jde napsat přímo: 12 → 7 se uloží po opuštění pole', () => {
    ulozit.mockClear();
    render(<MaleSudyPanel packages={[{ id: 's20', kind: 'keg', volume_l: 20, label: '20l' } as any]} canEdit />);
    const pole = screen.getByLabelText('Počet prázdných 20l');
    fireEvent.change(pole, { target: { value: '9' } });
    fireEvent.blur(pole);
    expect(ulozit).toHaveBeenCalledWith('s20', 9, undefined);
  });
});
