// 🔒 Průvodce uzávěrkou měsíce v Knize jízd (29. 10. 2026).
// Zadání majitele: „jednou měsíčně aby se dopsal rozdíl v km (stav kilometrů) a ten rozdíl
// dopočítáš rovnoměrně mezi jízdy“.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import KnihaJizdUzaverkaModal, { popisMesice, type UzaverkaModalProps } from './KnihaJizdUzaverkaModal';
import { HOME_BASE, type ZaznamJizdy } from '../lib/knihaJizdFormular';
import type { UzavrenyMesic, VstupUzavreni } from '../lib/knihaJizdDb';

const BOXER = 'Velké auto (Boxer)';

const jizda = (o: Partial<ZaznamJizdy>): ZaznamJizdy => ({
  id: 'j',
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

// Trasy 80 + 40 + 60 = 180 km, mezi druhou a třetí jízdou tankování.
const MESIC = () => [
  jizda({ id: 'a', date: '2026-10-05', km_start: 1000, km_end: 1080, km_driven: 80, km_trasa: 80 }),
  jizda({ id: 'b', date: '2026-10-12', km_start: 1080, km_end: 1120, km_driven: 40, km_trasa: 40 }),
  jizda({ id: 't', date: '2026-10-12', route_from: 'Tankování', route_to: 'Benzina', purpose: 'Tankování', km_start: 1120, km_end: 1120, km_driven: 0, km_trasa: 0, fuel_liters: 42, created_at: '2026-10-12T12:00:00Z' }),
  jizda({ id: 'c', date: '2026-10-19', km_start: 1120, km_end: 1180, km_driven: 60, km_trasa: 60 }),
];

function otevri(p: Partial<UzaverkaModalProps> = {}) {
  const onUzavrit = vi.fn(async (_v: VstupUzavreni): Promise<string | null> => null);
  const onClose = vi.fn();
  render(
    <KnihaJizdUzaverkaModal
      vozidlo={BOXER}
      mesic="2026-10"
      jizdy={MESIC()}
      uzavrene={[]}
      dnes="2026-11-03"
      onClose={onClose}
      onUzavrit={onUzavrit}
      {...p}
    />,
  );
  return { onUzavrit, onClose };
}

function pole(popisek: string): HTMLInputElement {
  const label = screen.getByText(popisek, { selector: 'label' });
  return label.parentElement!.querySelector('input') as HTMLInputElement;
}
const napis = (popisek: string, hodnota: string) => fireEvent.change(pole(popisek), { target: { value: hodnota } });
const KONEC = 'Tachometr na konci měsíce (km)';
const ZACATEK = 'Tachometr na začátku měsíce (km)';
const uzavri = () => fireEvent.click(screen.getByRole('button', { name: 'Uzavřít měsíc' }));

const uzavrenyMesic = (o: Partial<UzavrenyMesic>): UzavrenyMesic => ({
  id: 'u', vehicle_name: BOXER, month: '2026-09', km_start: 900, km_end: 1000, km_trasa: 100, km_dorovnani: 0,
  rezim: 'rovnomerne', pocet_jizd: 5, closed_at: '2026-10-02T08:00:00Z', closed_by: null, ...o,
});

describe('popisMesice', () => {
  it('česky s rokem', () => {
    expect(popisMesice('2026-10')).toBe('říjen 2026');
    expect(popisMesice('2027-01')).toBe('leden 2027');
  });
});

describe('Uzávěrka měsíce', () => {
  it('ukáže auto, počty a začátek měsíce z první jízdy', () => {
    otevri();
    expect(screen.getByText(BOXER)).toBeTruthy();
    expect(screen.getByText(/3\sjízdy,\s1\stankování/)).toBeTruthy();
    expect(pole(ZACATEK).value).toBe('1000');
    expect(screen.getByText(/Začátek první jízdy měsíce/)).toBeTruthy();
    // dokud není vyplněný konec, nic se nepočítá a je vidět vodítko podle tras
    expect(screen.getByText(/kolem 1\s?180 km/)).toBeTruthy();
    expect(screen.queryByText('Rozdíl')).toBeNull();
  });

  it('po zadání tachometru ukáže rozdíl a dorovnání jednotlivých jízd', () => {
    otevri();
    napis(KONEC, '1190');
    expect(screen.getByText('Podle tras').nextSibling?.textContent).toBe('180');
    expect(screen.getByText('Tachometr').nextSibling?.textContent).toBe('190');
    expect(screen.getByText('Rozdíl').nextSibling?.textContent).toBe('+10');
    const tabulka = screen.getByRole('table');
    const radky = within(tabulka).getAllByRole('row').slice(1).map((r) => Array.from(r.querySelectorAll('td')).map((td) => td.textContent));
    // tankování v tabulce není, jízdy dostanou 3,4 + 3,3 + 3,3
    expect(radky.map((r) => r.slice(1))).toEqual([
      ['80', '+3,4', '83,4'],
      ['40', '+3,3', '43,3'],
      ['60', '+3,3', '63,3'],
    ]);
    expect(screen.getByText(/Rozdíl \+10 km se rozpočítá rovnoměrně mezi 3\sjízdy/)).toBeTruthy();
  });

  it('uzavře měsíc: pošle začátek, konec, způsob a řádky včetně tankování s navazujícím tachometrem', async () => {
    const { onUzavrit } = otevri();
    napis(KONEC, '1190');
    uzavri();
    await waitFor(() => expect(onUzavrit).toHaveBeenCalledTimes(1));
    const v = onUzavrit.mock.calls[0][0];
    expect(v).toMatchObject({ vozidlo: BOXER, mesic: '2026-10', tachometrZacatek: 1000, tachometrKonec: 1190, rezim: 'rovnomerne' });
    expect(v.radky.map((r) => [r.id, r.km_start, r.km_end, r.km_driven, r.km_dorovnani])).toEqual([
      ['a', 1000, 1083.4, 83.4, 3.4],
      ['b', 1083.4, 1126.7, 43.3, 3.3],
      ['t', 1126.7, 1126.7, 0, 0],
      ['c', 1126.7, 1190, 63.3, 3.3],
    ]);
  });

  it('úměrně délce: delší jízda dostane větší díl', async () => {
    const { onUzavrit } = otevri();
    napis(KONEC, '1190');
    fireEvent.click(screen.getByRole('radio', { name: /Úměrně délce/ }));
    expect(screen.getByText(/rozpočítá úměrně délce/)).toBeTruthy();
    uzavri();
    await waitFor(() => expect(onUzavrit).toHaveBeenCalled());
    const v = onUzavrit.mock.calls[0][0];
    expect(v.rezim).toBe('umerne');
    expect(v.radky.filter((r) => r.km_trasa > 0).map((r) => r.km_dorovnani)).toEqual([4.5, 2.2, 3.3]);
  });

  it('tachometr ujel míň, než dávají trasy: jízdám se km ubírají, žádná nejde pod nulu a okno na to upozorní', async () => {
    const { onUzavrit } = otevri();
    napis(KONEC, '1100'); // 100 km místo 180
    expect(screen.getByText(/Trasy dávají víc km, než ujel tachometr/)).toBeTruthy();
    uzavri();
    await waitFor(() => expect(onUzavrit).toHaveBeenCalled());
    const jizdy = onUzavrit.mock.calls[0][0].radky.filter((r) => r.km_trasa > 0);
    expect(jizdy.every((r) => r.km_driven >= 0)).toBe(true);
    expect(Math.round(jizdy.reduce((s, r) => s + r.km_driven, 0) * 10) / 10).toBe(100);
  });

  it('konec nižší než začátek se nepustí', () => {
    otevri();
    napis(KONEC, '900');
    expect(screen.getByRole('alert').textContent).toMatch(/nižší než na začátku/);
  });

  it('bez konce měsíce se neuzavře a okno řekne, co vyplnit', () => {
    const { onUzavrit } = otevri();
    uzavri();
    expect(onUzavrit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/Vyplň stav tachometru/);
  });

  it('navazuje na uzavřený minulý měsíc a jiný začátek odmítne', () => {
    const { onUzavrit } = otevri({ uzavrene: [uzavrenyMesic({ km_end: 990 })] });
    expect(pole(ZACATEK).value).toBe('990');
    expect(screen.getByText('Navazuje na uzavřený minulý měsíc.')).toBeTruthy();
    napis(KONEC, '1190');
    expect(screen.getByText('Rozdíl').nextSibling?.textContent).toBe('+20');
    napis(ZACATEK, '1000');
    expect(screen.getByRole('alert').textContent).toMatch(/minulý měsíc končí na 990 km/);
    uzavri();
    expect(onUzavrit).not.toHaveBeenCalled();
  });

  it('začátek bez uzavřeného minulého měsíce se bere z konce poslední jízdy před měsícem', () => {
    const zZari = jizda({ id: 'z', date: '2026-09-28', km_start: 960, km_end: 995, km_driven: 35 });
    otevri({ jizdy: [zZari, ...MESIC()] });
    expect(pole(ZACATEK).value).toBe('995');
    expect(screen.getByText(/Konec poslední jízdy před tímto měsícem/)).toBeTruthy();
  });

  it('měsíc, který ještě neskončil, se uzavře jen s varováním', () => {
    otevri({ dnes: '2026-10-20' });
    expect(screen.getByText(/Měsíc ještě neskončil/)).toBeTruthy();
  });

  it('skončený měsíc varování nemá', () => {
    otevri({ dnes: '2026-11-03' });
    expect(screen.queryByText(/Měsíc ještě neskončil/)).toBeNull();
  });

  it('chybu z databáze nechá v okně a jde to zkusit znovu', async () => {
    const onUzavrit = vi.fn(async () => 'Jízdy měsíce se mezitím změnily (někdo je přidal, smazal nebo přesunul).');
    const { onClose } = otevri({ onUzavrit });
    napis(KONEC, '1190');
    uzavri();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/mezitím změnily/));
    expect((screen.getByRole('button', { name: 'Uzavřít měsíc' }) as HTMLButtonElement).disabled).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('velký rozdíl upozorní na možný překlep', () => {
    otevri();
    napis(KONEC, '1500');
    expect(screen.getByText(/Rozdíl proti trasám je velký/)).toBeTruthy();
  });
});
