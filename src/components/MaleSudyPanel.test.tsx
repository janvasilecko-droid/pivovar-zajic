// „Proč je tam prázdných 12? Mají být tolik, kolik jsem jich zadal" (13. 10. 2026):
// velké číslo je to, co člověk naklikal — ne zbytek po objednávkách.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../lib/useMaleSudy', () => ({
  useMaleSudy: () => ({
    zasoba: { s20: 7 }, zapocitatPlne: new Set(), umiZapocitatPlne: true, nacteno: true, chybiMigrace: false,
    ulozit: vi.fn(async () => null), nastavZapocitatPlne: vi.fn(async () => null),
  }),
  useHlidaniMalychSudu: () => ({
    souhrn: [{ package_id: 's20', objednano: 5, nad: 0, zapocitanoPlnych: 0, plneSkladem: {} }],
    jmenaPiv: new Map(),
  }),
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ profile: null, user: null }) }));

import { MaleSudyPanel } from './MaleSudyPanel';

describe('Malé sudy: velké číslo = kolik jsem zadal', () => {
  it('7 prázdných při 5 objednaných ukáže 7 a pod tím „zbývá 2"', () => {
    render(<MaleSudyPanel packages={[{ id: 's20', kind: 'keg', volume_l: 20, label: '20l' } as any]} canEdit />);
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText(/V otevřených objednávkách 5 — zbývá 2/)).toBeTruthy();
    expect(screen.queryByText(/Prázdných celkem/)).toBeNull();
  });
});
