// ⏱️ Okno „Rychlé odpočty" — volba libovolných odpočtů v liště nahoře.
//
// Majitel 18. 11. 2026: „jak jsou nahoře odpočty sudů, ať je tam volba
// různých libovolných odpočtů."
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { RychleOdpoctyModal } from './RychleOdpoctyModal';
import {
  BEZ_NASTAVENI, MAX_VLASTNICH, vsechnyRychle, type NastaveniRychlychOdpoctu,
} from '../lib/rychleOdpocty';
import { pridejVlastni } from '../lib/rychleOdpoctyUpravy';
import { toastZpet } from '../lib/toast';

vi.mock('../lib/toast', () => ({
  toastZpet: vi.fn(),
  chyba: vi.fn(),
  uspech: vi.fn(),
  oznam: vi.fn(),
}));

const MIN = 60_000;

/** Okno s vlastním stavem — tak, jak ho drží obrazovka Domů. */
function Okno({ pocatek = BEZ_NASTAVENI, co2 = false, onSpust = vi.fn(), onZmenaSpy }: {
  pocatek?: NastaveniRychlychOdpoctu;
  co2?: boolean;
  onSpust?: (popis: string, delkaMs: number) => void;
  onZmenaSpy?: (n: NastaveniRychlychOdpoctu) => void;
}) {
  const [n, setN] = useState(pocatek);
  return (
    <RychleOdpoctyModal
      open
      onClose={vi.fn()}
      nastaveni={n}
      onZmena={(x) => { setN(x); onZmenaSpy?.(x); }}
      onSpustJednorazovy={onSpust}
      co2={co2}
    />
  );
}

const poleDelky = (popis: string) => screen.getByLabelText(`Délka v minutách: ${popis}`) as HTMLInputElement;
const zaskrtavatko = (popis: string) => screen.getByLabelText(`V liště: ${popis}`) as HTMLInputElement;

describe('RychleOdpoctyModal', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('ukáže výchozí odpočty s jejich délkou; CO2 jen když je modul zapnutý', () => {
    const { unmount } = render(<Okno />);
    expect(poleDelky('Kotel').value).toBe('2');
    expect(poleDelky('Sud malý').value).toBe('8');
    expect(poleDelky('Sud velký').value).toBe('10');
    expect(screen.queryByLabelText(/V liště: Foukání CO2/)).toBeNull();
    unmount();

    render(<Okno co2 />);
    expect(zaskrtavatko('Foukání CO2').checked).toBe(true);
    // Délka foukání je pevná — žádné pole, jen text.
    expect(screen.queryByLabelText('Délka v minutách: Foukání CO2')).toBeNull();
  });

  it('odškrtnutí schová odpočet z lišty, zaškrtnutí ho vrátí', () => {
    const zmena = vi.fn();
    render(<Okno onZmenaSpy={zmena} />);
    fireEvent.click(zaskrtavatko('Kotel'));
    expect(zmena).toHaveBeenLastCalledWith(expect.objectContaining({ skryte: ['rychly-kotel'] }));
    expect(zaskrtavatko('Kotel').checked).toBe(false);
    fireEvent.click(zaskrtavatko('Kotel'));
    expect(zmena).toHaveBeenLastCalledWith(expect.objectContaining({ skryte: [] }));
    expect(zaskrtavatko('Kotel').checked).toBe(true);
  });

  it('přepsání délky výchozího odpočtu se uloží; špatný zápis pole vrátí a řekne proč', () => {
    const zmena = vi.fn();
    render(<Okno onZmenaSpy={zmena} />);

    fireEvent.change(poleDelky('Sud velký'), { target: { value: '12' } });
    fireEvent.blur(poleDelky('Sud velký'));
    expect(zmena).toHaveBeenLastCalledWith(expect.objectContaining({ delky: { 'rychly-sud-velky': 12 * MIN } }));
    expect(screen.queryByRole('alert')).toBeNull();

    zmena.mockClear();
    fireEvent.change(poleDelky('Kotel'), { target: { value: 'abc' } });
    fireEvent.blur(poleDelky('Kotel'));
    expect(zmena).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/nerozumím/);
    expect(poleDelky('Kotel').value).toBe('2');
  });

  it('délka jde napsat i s jednotkou a s desetinnou čárkou', () => {
    const zmena = vi.fn();
    render(<Okno onZmenaSpy={zmena} />);
    fireEvent.change(poleDelky('Kotel'), { target: { value: '30 s' } });
    fireEvent.blur(poleDelky('Kotel'));
    expect(zmena).toHaveBeenLastCalledWith(expect.objectContaining({ delky: { 'rychly-kotel': 30_000 } }));
    fireEvent.change(poleDelky('Sud malý'), { target: { value: '7,5' } });
    fireEvent.blur(poleDelky('Sud malý'));
    expect(zmena).toHaveBeenLastCalledWith(expect.objectContaining({ delky: { 'rychly-kotel': 30_000, 'rychly-sud-maly': 450_000 } }));
  });

  it('vlastní odpočet: název + čas → přibyde v seznamu i v nastavení', () => {
    const zmena = vi.fn();
    render(<Okno onZmenaSpy={zmena} />);

    fireEvent.change(screen.getByLabelText('Název nového odpočtu'), { target: { value: 'Chmel' } });
    fireEvent.change(screen.getByLabelText('Délka nového odpočtu'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: /Přidat do lišty/ }));

    const posledni = zmena.mock.calls.at(-1)![0] as NastaveniRychlychOdpoctu;
    expect(posledni.vlastni).toHaveLength(1);
    expect(posledni.vlastni[0]).toMatchObject({ popis: 'Chmel', delkaMs: 15 * MIN });
    expect(zaskrtavatko('Chmel').checked).toBe(true);
    expect(poleDelky('Chmel').value).toBe('15');
    // Formulář se vyprázdnil.
    expect((screen.getByLabelText('Název nového odpočtu') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Délka nového odpočtu') as HTMLInputElement).value).toBe('');
  });

  it('vlastní odpočet bez názvu nebo se špatným časem se nepřidá a ukáže důvod', () => {
    const zmena = vi.fn();
    render(<Okno onZmenaSpy={zmena} />);

    fireEvent.change(screen.getByLabelText('Délka nového odpočtu'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: /Přidat do lišty/ }));
    expect(screen.getByRole('alert').textContent).toMatch(/název/i);

    fireEvent.change(screen.getByLabelText('Název nového odpočtu'), { target: { value: 'Chmel' } });
    fireEvent.change(screen.getByLabelText('Délka nového odpočtu'), { target: { value: 'dlouho' } });
    fireEvent.click(screen.getByRole('button', { name: /Přidat do lišty/ }));
    expect(screen.getByRole('alert').textContent).toMatch(/nerozumím/);
    expect(zmena).not.toHaveBeenCalled();
  });

  it('smazání vlastního odpočtu jde vzít zpět', () => {
    const pocatek = pridejVlastni(BEZ_NASTAVENI, 'Chmel', 15 * MIN, 1).nastaveni;
    const zmena = vi.fn();
    render(<Okno pocatek={pocatek} onZmenaSpy={zmena} />);

    fireEvent.click(screen.getByRole('button', { name: 'Smazat Chmel' }));
    expect(screen.queryByLabelText('V liště: Chmel')).toBeNull();
    expect(zmena).toHaveBeenLastCalledWith(expect.objectContaining({ vlastni: [] }));

    expect(toastZpet).toHaveBeenCalledTimes(1);
    const [text, zpet] = vi.mocked(toastZpet).mock.calls[0];
    expect(text).toMatch(/Chmel/);
    // „Vrátit zpět" obnoví původní nastavení.
    act(() => { void zpet(); });
    expect(zmena).toHaveBeenLastCalledWith(pocatek);
    expect(zaskrtavatko('Chmel').checked).toBe(true);
  });

  it('výchozí odpočet se smazat nedá (nemá koš)', () => {
    render(<Okno />);
    expect(screen.queryByRole('button', { name: /^Smazat/ })).toBeNull();
  });

  it('vlastní odpočet jde přejmenovat', () => {
    const pocatek = pridejVlastni(BEZ_NASTAVENI, 'Chmel', 15 * MIN, 1).nastaveni;
    const zmena = vi.fn();
    render(<Okno pocatek={pocatek} onZmenaSpy={zmena} />);
    const pole = screen.getByLabelText('Název: Chmel') as HTMLInputElement;
    fireEvent.change(pole, { target: { value: 'Chmelení' } });
    fireEvent.blur(pole);
    expect(zmena).toHaveBeenLastCalledWith(expect.objectContaining({
      vlastni: [expect.objectContaining({ popis: 'Chmelení' })],
    }));
  });

  it('jednorázový odpočet: spustí se s názvem a časem a pole se vyprázdní', () => {
    const spust = vi.fn();
    render(<Okno onSpust={spust} />);
    fireEvent.change(screen.getByLabelText('Jednorázový odpočet: název'), { target: { value: 'Vaření' } });
    fireEvent.change(screen.getByLabelText('Jednorázový odpočet: délka'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: /Spustit/ }));
    expect(spust).toHaveBeenCalledWith('Vaření', 25 * MIN);
    expect((screen.getByLabelText('Jednorázový odpočet: délka') as HTMLInputElement).value).toBe('');
  });

  it('jednorázový odpočet bez času nebo se špatným časem se nespustí', () => {
    const spust = vi.fn();
    render(<Okno onSpust={spust} />);
    fireEvent.click(screen.getByRole('button', { name: /Spustit/ }));
    expect(spust).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/nerozumím/);

    fireEvent.change(screen.getByLabelText('Jednorázový odpočet: délka'), { target: { value: '5 s' } });
    fireEvent.click(screen.getByRole('button', { name: /Spustit/ }));
    expect(spust).not.toHaveBeenCalled();
  });

  it('„Vrátit výchozí odpočty" se ukáže jen po úpravě výchozích a vrátí je', () => {
    render(<Okno />);
    expect(screen.queryByRole('button', { name: /Vrátit výchozí/ })).toBeNull();

    fireEvent.click(zaskrtavatko('Kotel'));
    fireEvent.change(poleDelky('Sud velký'), { target: { value: '12' } });
    fireEvent.blur(poleDelky('Sud velký'));
    fireEvent.click(screen.getByRole('button', { name: /Vrátit výchozí/ }));

    expect(zaskrtavatko('Kotel').checked).toBe(true);
    expect(poleDelky('Sud velký').value).toBe('10');
    expect(screen.queryByRole('button', { name: /Vrátit výchozí/ })).toBeNull();
  });

  it('při plném počtu vlastních odpočtů se přidávání zamkne a řekne proč', () => {
    let n: NastaveniRychlychOdpoctu = BEZ_NASTAVENI;
    for (let i = 0; i < MAX_VLASTNICH; i++) n = pridejVlastni(n, `Odpočet ${i}`, 5 * MIN, i + 1).nastaveni;
    render(<Okno pocatek={n} />);
    expect((screen.getByRole('button', { name: /Přidat do lišty/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/může být nejvíc/)).toBeTruthy();
    expect(vsechnyRychle(n).filter((r) => !r.vychozi)).toHaveLength(MAX_VLASTNICH);
  });

  it('seznam odpočtů je přístupný jako seznam', () => {
    render(<Okno />);
    const seznam = screen.getByRole('list', { name: 'Odpočty v liště' });
    expect(within(seznam).getAllByRole('listitem')).toHaveLength(3);
  });
});
