// 🚐 Okno „Nová jízda / Tankování / Upravit“ v Knize jízd (29. 10. 2026).
// Zadání majitele: jezdí se i mimo objednávky, k tomu tankování; tachometr má navazovat
// sám a po opravě jízdy se nesmí rozsypat řada.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import KnihaJizdJizdaModal, { type JizdaModalProps } from './KnihaJizdJizdaModal';
import { HOME_BASE, type ZaznamJizdy } from '../lib/knihaJizdFormular';
import { POZNAMKA_VYGENEROVANO } from '../lib/knihaJizd';

const BOXER = 'Velké auto (Boxer)';
const KACENA = 'Kačena';

const jizda = (o: Partial<ZaznamJizdy> = {}): ZaznamJizdy => ({
  id: 'j1',
  date: '2026-10-05',
  vehicle_name: BOXER,
  driver: 'Petr Bednář',
  route_from: HOME_BASE,
  route_to: 'Sokolov → Kynšperk nad Ohří',
  purpose: 'Rozvoz piva',
  km_start: 1000,
  km_end: 1080,
  km_driven: 80,
  km_trasa: 80,
  km_dorovnani: 0,
  created_at: '2026-10-05T08:00:00Z',
  ...o,
});

function otevri(p: Partial<JizdaModalProps> = {}) {
  const onUlozit = vi.fn(async (_davka: unknown): Promise<string | null> => null);
  const onClose = vi.fn();
  render(
    <KnihaJizdJizdaModal
      rezim="jizda"
      jizdy={[jizda()]}
      uzavrene={new Set()}
      vozidla={[BOXER, KACENA]}
      vychoziVozidlo={BOXER}
      ridici={['Petr Bednář']}
      vychoziRidic="Petr Bednář"
      vychoziDatum="2026-10-20"
      onClose={onClose}
      onUlozit={onUlozit}
      {...p}
    />,
  );
  return { onUlozit, onClose };
}

/** Políčko formuláře podle popisku (Field nepropojuje label a input, tak se hledá v rodiči). */
function pole(popisek: string): HTMLInputElement {
  const label = screen.getByText(popisek, { selector: 'label' });
  return label.parentElement!.querySelector('input, select') as HTMLInputElement;
}
const napis = (popisek: string, hodnota: string) => fireEvent.change(pole(popisek), { target: { value: hodnota } });
const uloz = () => fireEvent.click(screen.getByRole('button', { name: /^(Uložit|Uložit změny)$/ }));

describe('Nová jízda', () => {
  it('začátek tachometru navazuje na poslední jízdu auta a okno to řekne', () => {
    otevri();
    expect(pole('Stav tachometru na začátku (km)').value).toBe('1080');
    expect(screen.getByText('Navazuje na poslední jízdu auta.')).toBeTruthy();
  });

  it('uloží jízdu mimo objednávky: začátek z návaznosti, konec = začátek + ujeté, návrat do Kynšperku', async () => {
    const { onUlozit } = otevri();
    napis('Kam / trasa', 'Sladovna Žatec');
    napis('Účel jízdy', 'Nákup surovin');
    napis('Ujeté km', '120,5'.replace(',', '.'));
    expect(screen.getByText(/Tachometr: 1\s?080 → 1\s?200,5 km/)).toBeTruthy();
    uloz();
    await waitFor(() => expect(onUlozit).toHaveBeenCalledTimes(1));
    const davka = onUlozit.mock.calls[0][0] as { vlozit: Record<string, unknown>[]; upravit: unknown[] };
    expect(davka.vlozit).toHaveLength(1);
    expect(davka.vlozit[0]).toMatchObject({
      entry_date: '2026-10-20',
      vehicle_name: BOXER,
      driver: 'Petr Bednář',
      route_from: HOME_BASE,
      route_to: 'Sladovna Žatec → Kynšperk nad Ohří',
      purpose: 'Nákup surovin',
      km_start: 1080,
      km_end: 1200.5,
      km_driven: 120.5,
      km_trasa: 120.5,
      km_dorovnani: 0,
    });
    expect(davka.upravit).toEqual([]); // přidání na konec řady nic neposouvá
  });

  it('rychlý účel se vyplní jedním klepnutím', () => {
    otevri();
    fireEvent.click(screen.getByRole('button', { name: 'Servis vozidla' }));
    expect(pole('Účel jízdy').value).toBe('Servis vozidla');
  });

  it('prázdný formulář nic neuloží a řekne, co chybí', () => {
    const { onUlozit } = otevri();
    uloz();
    expect(onUlozit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/Vyplň, kam se jelo/);
  });

  it('nulové nebo prázdné ujeté km se nepustí', () => {
    const { onUlozit } = otevri();
    napis('Kam / trasa', 'Cheb');
    uloz();
    expect(onUlozit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/Ujeté km musí být víc než nula/);
  });

  it('začátek jde přepsat ručně a tlačítko ho zase naváže na poslední jízdu', () => {
    otevri();
    napis('Stav tachometru na začátku (km)', '1500');
    expect(pole('Stav tachometru na začátku (km)').value).toBe('1500');
    fireEvent.click(screen.getByRole('button', { name: /Navázat na poslední jízdu/ }));
    expect(pole('Stav tachometru na začátku (km)').value).toBe('1080');
  });

  it('auto bez jediné jízdy chce stav palubní desky', async () => {
    const { onUlozit } = otevri({ jizdy: [] });
    expect(screen.getByText(/zatím nemá žádnou jízdu/)).toBeTruthy();
    napis('Kam / trasa', 'Cheb');
    napis('Ujeté km', '40');
    uloz();
    expect(onUlozit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/zadej stav tachometru na začátku/);
    napis('Stav tachometru na začátku (km)', '85000');
    uloz();
    await waitFor(() => expect(onUlozit).toHaveBeenCalled());
    expect((onUlozit.mock.calls[0][0] as { vlozit: Record<string, unknown>[] }).vlozit[0]).toMatchObject({ km_start: 85000, km_end: 85040 });
  });

  it('jízda doprostřed měsíce předem řekne, o kolik se posunou pozdější, a pošle jejich nové stavy', async () => {
    const jizdy = [jizda({ id: 'a', date: '2026-10-05', km_start: 1000, km_end: 1080 }), jizda({ id: 'b', date: '2026-10-12', km_start: 1080, km_end: 1130, km_driven: 50 })];
    const { onUlozit } = otevri({ jizdy, vychoziDatum: '2026-10-08' });
    napis('Kam / trasa', 'Karlovy Vary');
    napis('Ujeté km', '30');
    expect(screen.getByText(/posune o \+30 km/)).toBeTruthy();
    uloz();
    await waitFor(() => expect(onUlozit).toHaveBeenCalled());
    const davka = onUlozit.mock.calls[0][0] as { upravit: { id: string; km_start: number; km_end: number }[] };
    expect(davka.upravit).toEqual([{ id: 'b', km_start: 1110, km_end: 1160 }]);
  });

  it('do uzavřeného měsíce auta nejde zapsat — okno to ukáže hned a uložení je zamčené', () => {
    const { onUlozit } = otevri({ uzavrene: new Set([`${BOXER}|2026-10`]) });
    expect(screen.getByRole('alert').textContent).toMatch(/je uzavřený/);
    expect((screen.getByRole('button', { name: 'Uložit' }) as HTMLButtonElement).disabled).toBe(true);
    expect(onUlozit).not.toHaveBeenCalled();
  });

  it('chyba z databáze zůstane v okně a jde to zkusit znovu', async () => {
    const onUlozit = vi.fn(async () => 'Jízdy měsíce se mezitím změnily.');
    const { onClose } = otevri({ onUlozit });
    napis('Kam / trasa', 'Cheb');
    napis('Ujeté km', '40');
    uloz();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/mezitím změnily/));
    expect((screen.getByRole('button', { name: 'Uložit' }) as HTMLButtonElement).disabled).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Zrušit zavře okno bez uložení', () => {
    const { onUlozit, onClose } = otevri();
    fireEvent.click(screen.getByRole('button', { name: 'Zrušit' }));
    expect(onClose).toHaveBeenCalled();
    expect(onUlozit).not.toHaveBeenCalled();
  });

  it('řidiče a vozidlo jde změnit; Kačena má vlastní řadu tachometru', async () => {
    const jizdy = [jizda(), jizda({ id: 'k1', vehicle_name: KACENA, km_start: 500, km_end: 540, km_driven: 40 })];
    const { onUlozit } = otevri({ jizdy });
    fireEvent.change(pole('Vozidlo'), { target: { value: KACENA } });
    expect(pole('Stav tachometru na začátku (km)').value).toBe('540');
    napis('Řidič', 'Martin');
    napis('Kam / trasa', 'Cheb');
    napis('Ujeté km', '25');
    uloz();
    await waitFor(() => expect(onUlozit).toHaveBeenCalled());
    expect((onUlozit.mock.calls[0][0] as { vlozit: Record<string, unknown>[] }).vlozit[0]).toMatchObject({
      vehicle_name: KACENA, driver: 'Martin', km_start: 540, km_end: 565,
    });
  });
});

describe('Tankování', () => {
  it('chce litry, uloží záznam bez ujetých km na aktuální stav tachometru', async () => {
    const { onUlozit } = otevri({ rezim: 'tankovani' });
    expect(screen.getByRole('heading', { name: 'Tankování' })).toBeTruthy();
    uloz();
    expect(onUlozit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/kolik litrů/);

    napis('Natankováno (l)', '45.2');
    napis('Kde (nepovinné)', 'Benzina Sokolov');
    uloz();
    await waitFor(() => expect(onUlozit).toHaveBeenCalled());
    const davka = onUlozit.mock.calls[0][0] as { vlozit: Record<string, unknown>[]; upravit: unknown[] };
    expect(davka.vlozit[0]).toMatchObject({
      purpose: 'Tankování',
      route_to: 'Benzina Sokolov',
      km_start: 1080,
      km_end: 1080,
      km_driven: 0,
      fuel_liters: 45.2,
    });
    expect(davka.upravit).toEqual([]);
  });

  it('bez místa se zapíše „Čerpací stanice“', async () => {
    const { onUlozit } = otevri({ rezim: 'tankovani' });
    napis('Natankováno (l)', '30');
    uloz();
    await waitFor(() => expect(onUlozit).toHaveBeenCalled());
    expect((onUlozit.mock.calls[0][0] as { vlozit: Record<string, unknown>[] }).vlozit[0]).toMatchObject({ route_to: 'Čerpací stanice' });
  });
});

describe('Úprava záznamu', () => {
  const dve = () => [
    jizda({ id: 'a', date: '2026-10-05', km_start: 1000, km_end: 1080 }),
    jizda({ id: 'b', date: '2026-10-12', km_start: 1080, km_end: 1130, km_driven: 50, km_trasa: 50 }),
  ];

  it('předvyplní záznam a po změně km pošle jen změněné sloupce a posun pozdějších jízd', async () => {
    const { onUlozit } = otevri({ jizdy: dve(), puvodni: dve()[0] });
    expect(screen.getByRole('heading', { name: 'Upravit jízdu' })).toBeTruthy();
    expect(pole('Kam / trasa').value).toBe('Sokolov → Kynšperk nad Ohří');
    expect(pole('Ujeté km').value).toBe('80');
    napis('Ujeté km', '90');
    expect(screen.getByText(/posune o \+10 km/)).toBeTruthy();
    uloz();
    await waitFor(() => expect(onUlozit).toHaveBeenCalled());
    const davka = onUlozit.mock.calls[0][0] as { upravit: Record<string, unknown>[]; vlozit?: unknown };
    expect(davka.vlozit).toBeUndefined();
    expect(davka.upravit).toEqual([
      { id: 'a', km_end: 1090, km_driven: 90, km_trasa: 90 },
      { id: 'b', km_start: 1090, km_end: 1140 },
    ]);
  });

  it('beze změny nepošle žádný sloupec', async () => {
    const { onUlozit } = otevri({ jizdy: dve(), puvodni: dve()[1] });
    uloz();
    await waitFor(() => expect(onUlozit).toHaveBeenCalled());
    expect(onUlozit.mock.calls[0][0]).toEqual({ upravit: [] });
  });

  it('vygenerovaná jízda: okno upozorní a poznámka se přepíše, ať ji generátor nesmaže', async () => {
    const generovana = jizda({ id: 'g', note: `${POZNAMKA_VYGENEROVANO} (3 zastávky) — Velké auto` });
    const { onUlozit } = otevri({ jizdy: [generovana], puvodni: generovana });
    expect(screen.getByText(/Jízda vznikla z objednávek/)).toBeTruthy();
    napis('Ujeté km', '85');
    uloz();
    await waitFor(() => expect(onUlozit).toHaveBeenCalled());
    const patch = (onUlozit.mock.calls[0][0] as { upravit: Record<string, unknown>[] }).upravit[0];
    expect(String(patch.note)).toMatch(/^Upraveno ručně/);
  });

  it('přesun na jiné auto: začátek se dopočítá z nové řady a pole je zamčené', () => {
    const jizdy = [
      ...dve(),
      jizda({ id: 'c', date: '2026-10-19', km_start: 1130, km_end: 1160, km_driven: 30 }),
      jizda({ id: 'k1', vehicle_name: KACENA, date: '2026-10-01', km_start: 500, km_end: 540, km_driven: 40 }),
    ];
    otevri({ jizdy, puvodni: jizdy[1] });
    fireEvent.change(pole('Vozidlo'), { target: { value: KACENA } });
    const zacatek = pole('Stav tachometru na začátku (km)');
    expect(zacatek.disabled).toBe(true);
    expect(zacatek.value).toBe('540');
    expect(screen.getByText(/Jízda se přesouvá/)).toBeTruthy();
  });

  it('jízda v uzavřeném měsíci se upravit nedá', () => {
    const zamcena = jizda({ id: 'z', uzavreno_at: '2026-11-02T08:00:00Z' });
    const { onUlozit } = otevri({ jizdy: [zamcena], puvodni: zamcena });
    napis('Ujeté km', '90');
    uloz();
    expect(onUlozit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/uzavřeném měsíci/);
  });

  it('upravované tankování zůstává tankováním', async () => {
    const tank = jizda({ id: 't', route_from: 'Tankování', route_to: 'Benzina', purpose: 'Tankování', km_start: 1080, km_end: 1080, km_driven: 0, km_trasa: 0, fuel_liters: 40 });
    const { onUlozit } = otevri({ jizdy: [jizda(), tank], puvodni: tank });
    expect(screen.getByRole('heading', { name: 'Upravit tankování' })).toBeTruthy();
    expect(pole('Natankováno (l)').value).toBe('40');
    napis('Natankováno (l)', '42.5');
    uloz();
    await waitFor(() => expect(onUlozit).toHaveBeenCalled());
    expect(onUlozit.mock.calls[0][0]).toEqual({ upravit: [{ id: 't', fuel_liters: 42.5 }] });
  });

  it('vozidlo, které už není v seznamu aut, zůstane v nabídce', () => {
    const stara = jizda({ id: 's', vehicle_name: 'Stará Avia' });
    otevri({ jizdy: [stara], puvodni: stara });
    expect((pole('Vozidlo') as unknown as HTMLSelectElement).value).toBe('Stará Avia');
  });
});
