// „Proč je tam prázdných 12? Mají být tolik, kolik jsem jich zadal" (13. 10. 2026):
// velké číslo je to, co člověk naklikal — ne zbytek po objednávkách.
// 1. 11. 2026: „ty se měly odečíst podle objednávek, měly by tam být jen 2× 10
// prázdné" — co od zadání odjelo, číslo zmenší (a záložka řekne odkud).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const ulozit = vi.fn(async (..._a: unknown[]) => null);
let zasoba: Record<string, number> = {};
let stavPoctu = { nacteno: true, chybaNacteni: false };
let hlidani: { souhrn: unknown[]; nacteno: boolean; chybaNacteni?: boolean } = { souhrn: [], nacteno: true };
vi.mock('../lib/useMaleSudy', () => ({
  useMaleSudy: () => ({
    zasoba, zadanoKdy: { s10: { cas: '2026-10-27T08:43:11Z', den: '2026-10-27' } },
    zapocitatPlne: new Set(), umiZapocitatPlne: true, ...stavPoctu, chybiMigrace: false,
    ulozit, nastavZapocitatPlne: vi.fn(async () => null),
  }),
  useHlidaniMalychSudu: () => ({ ...hlidani, jmenaPiv: new Map() }),
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ profile: null, user: null }) }));

import { MaleSudyPanel } from './MaleSudyPanel';

const S20 = { id: 's20', kind: 'keg', volume_l: 20, label: '20l' } as any;
const S10 = { id: 's10', kind: 'keg', volume_l: 10, label: '10l' } as any;

beforeEach(() => {
  ulozit.mockClear();
  stavPoctu = { nacteno: true, chybaNacteni: false };
  zasoba = { s20: 7 };
  hlidani = {
    souhrn: [{ package_id: 's20', mame: 7, objednano: 5, nad: 0, zapocitanoPlnych: 0, plneSkladem: {}, zadano: 7, odvezeno: 0, odvezenoZ: [] }],
    nacteno: true,
  };
});

describe('Malé sudy: velké číslo = kolik jsem zadal', () => {
  it('7 prázdných při 5 objednaných ukáže 7 a pod tím „K dispozici 2"', () => {
    render(<MaleSudyPanel packages={[S20]} canEdit />);
    expect((screen.getByLabelText('Počet prázdných 20l') as HTMLInputElement).value).toBe('7');
    expect(screen.getByText(/v otevřených objednávkách 5/)).toBeTruthy();
    expect(screen.getByText('K dispozici')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy(); // 7 prázdných − 5 v objednávkách
    expect(screen.queryByText(/Prázdných celkem/)).toBeNull();
    expect(screen.queryByText(/od té doby odjelo/)).toBeNull();
  });

  it('počet jde napsat přímo: 12 → 7 se uloží po opuštění pole', () => {
    render(<MaleSudyPanel packages={[S20]} canEdit />);
    const pole = screen.getByLabelText('Počet prázdných 20l');
    fireEvent.change(pole, { target: { value: '9' } });
    fireEvent.blur(pole);
    expect(ulozit).toHaveBeenCalledWith('s20', 9, undefined);
  });

  it('dokud se nenačtou objednávky, číslo neposkočí — „…" a tlačítka čekají', () => {
    hlidani = { souhrn: [], nacteno: false };
    render(<MaleSudyPanel packages={[S20]} canEdit />);
    expect(screen.queryByLabelText('Počet prázdných 20l')).toBeNull();
    expect(screen.getByText('…')).toBeTruthy();
    expect((screen.getByLabelText('Přidat 20l') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('K dispozici')).toBeNull();
  });

  // Revize 1. 11. 2026: „+" při nenačtených počtech by uložilo 1 a přepsalo uložené.
  it('dokud se nenačtou uložené počty, „+" nejde', () => {
    stavPoctu = { nacteno: false, chybaNacteni: false };
    zasoba = {};
    render(<MaleSudyPanel packages={[S20]} canEdit />);
    expect((screen.getByLabelText('Přidat 20l') as HTMLButtonElement).disabled).toBe(true);
  });

  it('počty se nenačetly (síť): hláška místo „klepni na +"', () => {
    stavPoctu = { nacteno: true, chybaNacteni: true };
    zasoba = {};
    render(<MaleSudyPanel packages={[S20]} canEdit />);
    expect(screen.getByRole('alert').textContent).toMatch(/nepodařilo načíst/);
    expect(screen.queryByLabelText('Přidat 20l')).toBeNull();
  });

  it('objednávky se nenačetly: naklikané číslo s upozorněním, +/− nejdou, přepsat číslem jde', () => {
    hlidani = { souhrn: [], nacteno: true, chybaNacteni: true };
    render(<MaleSudyPanel packages={[S20]} canEdit />);
    expect((screen.getByLabelText('Počet prázdných 20l') as HTMLInputElement).value).toBe('7');
    expect(screen.getByRole('note').textContent).toMatch(/Objednávky se nenačetly/);
    expect((screen.getByLabelText('Přidat 20l') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Ubrat 20l') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('K dispozici')).toBeNull();
    const pole = screen.getByLabelText('Počet prázdných 20l');
    fireEvent.change(pole, { target: { value: '3' } });
    fireEvent.blur(pole);
    expect(ulozit).toHaveBeenCalledWith('s20', 3, undefined);
  });
});

describe('Malé sudy: odjeté objednávky počet zmenší (1. 11. 2026)', () => {
  beforeEach(() => {
    zasoba = { s10: 8 };
    hlidani = {
      souhrn: [{
        package_id: 's10', mame: 2, objednano: 0, nad: 0, zapocitanoPlnych: 0, plneSkladem: {}, zadano: 8, odvezeno: 6,
        odvezenoZ: [{ order_id: 'm', nazev: 'Maneo', den: '2026-10-29', kusu: 6 }],
      }],
      nacteno: true,
    };
  });

  it('naklikáno 8, Maneo odvezlo 6 → velké číslo 2 a pod ním odkud', () => {
    render(<MaleSudyPanel packages={[S10]} canEdit />);
    expect((screen.getByLabelText('Počet prázdných 10l') as HTMLInputElement).value).toBe('2');
    expect(screen.getByText('Naklikáno 8 (út 27. 10.), od té doby odjelo 6: Maneo 6× (čt 29. 10.).')).toBeTruthy();
  });

  it('+ a − počítají od zobrazeného čísla (uloží se jako nový stav)', () => {
    render(<MaleSudyPanel packages={[S10]} canEdit />);
    fireEvent.click(screen.getByLabelText('Přidat 10l'));
    expect(ulozit).toHaveBeenLastCalledWith('s10', 3, undefined);
    fireEvent.click(screen.getByLabelText('Ubrat 10l'));
    expect(ulozit).toHaveBeenLastCalledWith('s10', 1, undefined);
  });
});
