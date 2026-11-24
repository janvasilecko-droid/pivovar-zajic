// Pomocné věci k „bez závozu" v přehledu objednávek (23. 11. 2026).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NadpisBezZavozu, PrepinacBezZavozu, StitekBezZavozu, jeBezZavozu, pocetObjednavek, rozdelPodleZavozu } from './BezZavozu';

afterEach(cleanup);

describe('jeBezZavozu', () => {
  it('jen výslovné true — chybějící sloupec (starší řádek v paměti) a null jsou se závozem', () => {
    expect(jeBezZavozu({ no_delivery: true })).toBe(true);
    expect(jeBezZavozu({ no_delivery: false })).toBe(false);
    expect(jeBezZavozu({ no_delivery: null })).toBe(false);
    expect(jeBezZavozu({})).toBe(false);
  });
});

describe('rozdelPodleZavozu', () => {
  it('se závozem napřed, bez závozu zvlášť; pořadí uvnitř se nemění', () => {
    const o = [
      { id: 'a', no_delivery: false }, { id: 'b', no_delivery: true }, { id: 'c' },
      { id: 'd', no_delivery: true }, { id: 'e', no_delivery: false },
    ];
    const r = rozdelPodleZavozu(o);
    expect(r.seZavozem.map((x) => x.id)).toEqual(['a', 'c', 'e']);
    expect(r.bezZavozu.map((x) => x.id)).toEqual(['b', 'd']);
  });

  it('prázdný seznam i seznam jen z jedné skupiny', () => {
    expect(rozdelPodleZavozu([])).toEqual({ seZavozem: [], bezZavozu: [] });
    expect(rozdelPodleZavozu([{ no_delivery: true }]).seZavozem).toEqual([]);
    expect(rozdelPodleZavozu([{ no_delivery: false }]).bezZavozu).toEqual([]);
  });
});

describe('pocetObjednavek', () => {
  it('česky podle počtu', () => {
    expect(pocetObjednavek(1)).toBe('1 objednávka');
    expect(pocetObjednavek(2)).toBe('2 objednávky');
    expect(pocetObjednavek(4)).toBe('4 objednávky');
    expect(pocetObjednavek(5)).toBe('5 objednávek');
    expect(pocetObjednavek(11)).toBe('11 objednávek');
  });
});

describe('štítky', () => {
  it('velký i malý štítek říkají „Bez závozu"', () => {
    render(<><StitekBezZavozu /><StitekBezZavozu maly /></>);
    const stitky = screen.getAllByTestId('stitek-bez-zavozu');
    expect(stitky).toHaveLength(2);
    expect(stitky.every((s) => s.textContent?.includes('Bez závozu'))).toBe(true);
  });

  it('nadpis skupiny má počet a vysvětlení', () => {
    render(<NadpisBezZavozu pocet={3} />);
    const n = screen.getByTestId('skupina-bez-zavozu');
    expect(n.textContent).toContain('Bez závozu');
    expect(n.textContent).toContain('3 objednávky');
    expect(n.textContent).toContain('odběratel si bere sám');
  });
});

describe('přepínač „Bez závozu" při zadávání (24. 11. 2026: „nevidím tam viditelně to tlačítko s autem, přeškrtnutým autem")', () => {
  it('je to velké tlačítko s přeškrtnutým autem a pořád zaškrtávací pole pro čtečku i klávesnici', () => {
    render(<PrepinacBezZavozu zapnuto={false} naZmenu={() => {}} />);
    const pole = screen.getByRole('checkbox', { name: /Bez závozu/ }) as HTMLInputElement;
    expect(pole.checked).toBe(false);
    const prepinac = screen.getByTestId('prepinac-bez-zavozu');
    // přeškrtnuté auto: ikona s maskou a škrtem (stejná jako na štítku na kartě)
    expect(prepinac.querySelector('svg mask')).toBeTruthy();
    expect(prepinac.querySelector('svg path[d="m3 3 18 18"]')).toBeTruthy();
    expect(prepinac.textContent).toContain('Bez závozu');
    expect(prepinac.textContent).toContain('Odběratel si bere pivo sám');
  });

  it('zapnuté je černé jako štítek na kartě a má fajfku; vypnuté je bílé', () => {
    const { rerender } = render(<PrepinacBezZavozu zapnuto={false} naZmenu={() => {}} />);
    const prepinac = () => screen.getByTestId('prepinac-bez-zavozu');
    expect(prepinac().className).toContain('bg-white');
    expect(prepinac().className).not.toContain('bg-neutral-900');
    expect(prepinac().querySelectorAll('svg')).toHaveLength(1);
    rerender(<PrepinacBezZavozu zapnuto naZmenu={() => {}} />);
    expect(prepinac().className).toContain('bg-neutral-900');
    expect(prepinac().className).toContain('text-white');
    expect(prepinac().querySelectorAll('svg')).toHaveLength(2); // auto + fajfka
    expect((screen.getByRole('checkbox', { name: /Bez závozu/ }) as HTMLInputElement).checked).toBe(true);
  });

  it('klepnutí (na pole i na text) zavolá naZmenu s novým stavem', () => {
    const naZmenu = vi.fn();
    render(<PrepinacBezZavozu zapnuto={false} naZmenu={naZmenu} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Bez závozu/ }));
    expect(naZmenu).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByText('Bez závozu')); // klepnutí na nápis přepne pole
    expect(naZmenu).toHaveBeenCalledTimes(2);
  });

  it('zapnuté se klepnutím vypne', () => {
    const naZmenu = vi.fn();
    render(<PrepinacBezZavozu zapnuto naZmenu={naZmenu} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Bez závozu/ }));
    expect(naZmenu).toHaveBeenLastCalledWith(false);
  });
});
