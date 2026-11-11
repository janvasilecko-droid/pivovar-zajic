import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { BibleVypocty, cisloZTextu, vypoctyPoOblastech } from './BibleVypocty';

describe('Výpočtová laboratoř', () => {
  it('čísla z pole: čárka i tečka, minus, mezery; nesmysl = NaN', () => {
    expect(cisloZTextu('12,5')).toBe(12.5);
    expect(cisloZTextu(' 1 087,7 ')).toBe(1087.7);
    expect(cisloZTextu('−2')).toBe(-2);
    expect(cisloZTextu('3.')).toBe(3);
    expect(Number.isNaN(cisloZTextu(''))).toBe(true);
    expect(Number.isNaN(cisloZTextu('12a'))).toBe(true);
  });

  it('výpočet ukáže výsledek, vzorec, předpoklady, rozsah, nejistotu a zdroj; změna vstupu přepočítá', () => {
    render(<BibleVypocty />);
    fireEvent.click(screen.getByRole('button', { name: /Ředění na cílovou stupňovitost/ }));
    const vysledek = screen.getByRole('region', { name: 'Výsledek' });
    expect(within(vysledek).getByText('87,7 L')).toBeTruthy();
    expect(within(vysledek).getByText(/1\s087,7 L/)).toBeTruthy();
    expect(within(vysledek).getByText(/m_vody = m₁ · \(P₁\/P₂ − 1\)/)).toBeTruthy();
    expect(within(vysledek).getByText('Rozsah platnosti')).toBeTruthy();
    expect(within(vysledek).getByText('Nejistota')).toBeTruthy();
    expect(within(vysledek).getByText(/Hmotnostní bilance extraktu/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Cílový extrakt (°P)'), { target: { value: '11,5' } });
    expect(within(screen.getByRole('region', { name: 'Výsledek' })).getByText(/Přidat vody/)).toBeTruthy();
  });

  it('vstup mimo rozsah: hláška místo výsledku', () => {
    render(<BibleVypocty />);
    fireEvent.click(screen.getByRole('button', { name: /Ředění na cílovou stupňovitost/ }));
    fireEvent.change(screen.getByLabelText('Cílový extrakt (°P)'), { target: { value: '14' } });
    expect(screen.getByRole('alert').textContent).toMatch(/nižší než současný/);
    expect(screen.queryByRole('region', { name: 'Výsledek' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Objem (hl)'), { target: { value: '' } });
    expect(screen.getByRole('alert').textContent).toMatch(/Chybí objem/);
  });

  it('chmelové dávky: přidat a odebrat řádek, hořkost se sečte', () => {
    render(<BibleVypocty />);
    fireEvent.click(screen.getByRole('button', { name: /Hořkost IBU \(Tinseth\)/ }));
    const pred = screen.getByRole('region', { name: 'Výsledek' }).textContent;
    fireEvent.click(screen.getByRole('button', { name: /Přidat řádek/ }));
    expect(screen.getAllByLabelText('Hmotnost chmele (g)')).toHaveLength(2);
    expect(screen.getByRole('region', { name: 'Výsledek' }).textContent).not.toBe(pred);
    fireEvent.click(screen.getByRole('button', { name: 'Odebrat řádek 2' }));
    expect(screen.getAllByLabelText('Hmotnost chmele (g)')).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Výsledek' }).textContent).toBe(pred);
  });

  it('„Najít v knihách“ pošle dotaz výpočtu; Zpět vrátí seznam', () => {
    const hledej = vi.fn();
    render(<BibleVypocty hledej={hledej} />);
    fireEvent.click(screen.getByRole('button', { name: /Varní výtěžek/ }));
    fireEvent.click(screen.getByRole('button', { name: /Najít v knihách/ }));
    expect(hledej).toHaveBeenCalledWith('varní výtěžek');
    fireEvent.click(screen.getByRole('button', { name: /Zpět na výpočty/ }));
    expect(screen.getByRole('button', { name: /Barva piva \(Morey\)/ })).toBeTruthy();
  });
});

describe('Výpočtová laboratoř po oblastech (etapa 6b)', () => {
  it('výpočty jsou seskupené podle oblastí A–T a nic se neztratí', async () => {
    const { VYPOCTY } = await import('../../../bible/supabase/functions/_shared/vypocty/katalog.ts');
    const skupiny = vypoctyPoOblastech(VYPOCTY);
    expect(skupiny.flatMap((g) => g.vypocty)).toHaveLength(VYPOCTY.length);
    expect(skupiny.map((g) => g.kod)).toEqual([...skupiny.map((g) => g.kod)].sort());
    render(<BibleVypocty />);
    expect(screen.getByRole('region', { name: 'Oblast G · Chlazení mladiny' })).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Oblast B · Chemie a úprava vody' })).getByRole('button', { name: /Zbytková alkalita vody/ })).toBeTruthy();
  });

  it('nový výpočet jde otevřít a spočítat: chlazení mladiny', () => {
    render(<BibleVypocty />);
    fireEvent.click(screen.getByRole('button', { name: /Chlazení mladiny: teplo a chladicí voda/ }));
    const vysledek = screen.getByRole('region', { name: 'Výsledek' });
    expect(within(vysledek).getByText(/98,6 kWh/)).toBeTruthy();
    expect(within(vysledek).getByText(/Kalorimetrická rovnice/)).toBeTruthy();
  });
});
