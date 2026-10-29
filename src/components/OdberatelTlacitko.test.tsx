// 📋 Výběr odběratele: Nejčastější + Všichni podle abecedy (29. 10. 2026, majitel:
// „udělej ty A-Z u těch objednávek“ — předtím „docela dlouho jsem hledal Martina“).
// Nahoře zkratka Nejčastější, pod ní všichni A–Z s nadpisy písmen a lištou písmen;
// při psaní se seznam zúží na odpovídající odběratele.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Place } from '../lib/supabase';

// PlaceCombobox sahá na Supabase (zakládání odběratele) — tady se nezkouší.
vi.mock('./PlaceCombobox', () => ({ PlaceCombobox: () => null }));

import { OdberatelTlacitko } from './OdberatelTlacitko';

const mista = (...nazvy: string[]) => nazvy.map((name, i) => ({ id: `id${i}`, name })) as unknown as Place[];
const objednavky = (id: string, pocet: number) => Array.from({ length: pocet }, () => ({ place_id: id, place_name: null }));

// Restaurace 3×, Zizkov 2×, Maneo 1×, MARTIN 0× → nejčastější: Restaurace, Zizkov, Maneo
const MALO = [
  { id: 'a', name: 'Restaurace' },
  { id: 'b', name: 'MARTIN' },
  { id: 'c', name: 'Maneo' },
  { id: 'd', name: 'Zizkov' },
] as unknown as Place[];
const OBJ_MALO = [...objednavky('a', 3), ...objednavky('d', 2), ...objednavky('c', 1)];

type Vlastnosti = Partial<Parameters<typeof OdberatelTlacitko>[0]>;

function otevri(vlastnosti: Vlastnosti = {}) {
  const onChange = vi.fn();
  const props = { placeId: '', placeName: '', places: MALO, objednavky: OBJ_MALO, onChange, ...vlastnosti };
  const vykresleni = render(<OdberatelTlacitko {...props} />);
  // Před otevřením okna existuje jen tlačítko, které ho otevírá (ukazuje jméno vybraného, nebo „Vybrat odběratele“).
  fireEvent.click(screen.getAllByRole('button')[0]);
  return { onChange, vykresleni, props };
}

/** Jména tlačítek odběratelů v oblasti (sekci) okna — bez písmen z lišty. */
const jmenaV = (oblast: string) =>
  within(screen.getByRole('region', { name: oblast })).getAllByRole('button')
    .filter((b) => !b.closest('nav'))
    .map((b) => b.textContent ?? '');
const nadpisyPismen = () =>
  within(screen.getByRole('region', { name: 'Všichni odběratelé podle abecedy' })).getAllByRole('heading', { level: 4 })
    .map((h) => h.textContent ?? '');

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView'); // jsdom ho nezná, testy si ho podstrkují samy
});

describe('OdberatelTlacitko — Nejčastější a Všichni A–Z', () => {
  it('nahoře Nejčastější (jen ti, kdo objednávali, od nejčastějšího), pod nimi všichni podle abecedy', () => {
    otevri();
    expect(jmenaV('Nejčastější odběratelé')).toEqual(['Restaurace', 'Zizkov', 'Maneo']);
    expect(jmenaV('Všichni odběratelé podle abecedy')).toEqual(['Maneo', 'MARTIN', 'Restaurace', 'Zizkov']);
  });

  it('česká abeceda: nadpisy písmen jdou v pořadí Č za C, Ř za R, Š za S, CH za H', () => {
    otevri({ places: mista('Zizkov', 'Šimáček', 'Řeka', 'Radek', 'Hrad', 'CHmeloun', 'Čertovka', 'Cyril', '7 stupnu Karlin'), objednavky: [] });
    expect(nadpisyPismen()).toEqual(['#', 'C', 'Č', 'H', 'CH', 'R', 'Ř', 'Š', 'Z']);
  });

  it('bez jediné objednávky se zkratka Nejčastější vůbec neukáže, abecední seznam zůstane', () => {
    otevri({ objednavky: [] });
    expect(screen.queryByRole('region', { name: 'Nejčastější odběratelé' })).toBeNull();
    expect(jmenaV('Všichni odběratelé podle abecedy')).toEqual(['Maneo', 'MARTIN', 'Restaurace', 'Zizkov']);
  });

  it('Nejčastější je nanejvýš osm odběratelů', () => {
    const hodne = mista(...Array.from({ length: 14 }, (_, i) => `Odběratel ${String.fromCharCode(65 + i)}`));
    const obj = hodne.flatMap((m, i) => objednavky(m.id, i + 1));
    otevri({ places: hodne, objednavky: obj });
    expect(jmenaV('Nejčastější odběratelé')).toHaveLength(8);
    expect(jmenaV('Nejčastější odběratelé')[0]).toBe('Odběratel N');
    expect(jmenaV('Všichni odběratelé podle abecedy')).toHaveLength(14);
  });

  it('klepnutí na odběratele ho vybere a okno se zavře — z Nejčastějších i z abecedy', () => {
    const { onChange } = otevri();
    fireEvent.click(within(screen.getByRole('region', { name: 'Všichni odběratelé podle abecedy' })).getByRole('button', { name: 'MARTIN' }));
    expect(onChange).toHaveBeenCalledWith('b', 'MARTIN');
    expect(screen.queryByRole('region', { name: 'Všichni odběratelé podle abecedy' })).toBeNull();
  });

  it('vybraný odběratel je v obou seznamech zvýrazněný (ostatní ne) a seznam zůstane celý', () => {
    otevri({ placeId: 'd', placeName: '' });
    for (const oblast of ['Nejčastější odběratelé', 'Všichni odběratelé podle abecedy']) {
      const v = within(screen.getByRole('region', { name: oblast }));
      expect(v.getByRole('button', { name: 'Zizkov' }).className).toContain('btn-primary');
      expect(v.getByRole('button', { name: 'Maneo' }).className).toContain('btn-ghost');
    }
    expect(jmenaV('Všichni odběratelé podle abecedy')).toHaveLength(4);
  });

  it('bez odběratelů okno řekne, jak založit prvního', () => {
    otevri({ places: [], objednavky: [] });
    expect(screen.getByText(/Zatím tu nejsou žádní odběratelé/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Všichni odběratelé podle abecedy' })).toBeNull();
  });
});

describe('OdberatelTlacitko — lišta písmen', () => {
  const SEZNAM = mista(
    'Alfa', 'Beta', 'Cyril', 'Čertovka', 'Dolce', 'Eden', 'Fabrika', 'Gong', 'Hrad', 'CHmeloun', 'Maneo', 'MARTIN', 'Zizkov',
  );
  const lista = () => screen.getByRole('navigation', { name: 'Přeskočit na písmeno' });

  it('u delšího seznamu je lišta jen s písmeny, která v seznamu opravdu jsou, v české abecedě', () => {
    otevri({ places: SEZNAM, objednavky: [] });
    expect(within(lista()).getAllByRole('button').map((b) => b.textContent)).toEqual(['A', 'B', 'C', 'Č', 'D', 'E', 'F', 'G', 'H', 'CH', 'M', 'Z']);
  });

  it('u krátkého seznamu lišta není (stačí rolovat)', () => {
    otevri();
    expect(screen.queryByRole('navigation', { name: 'Přeskočit na písmeno' })).toBeNull();
  });

  it('klepnutí na písmeno odroluje k nadpisu té skupiny', () => {
    const skoky: (string | null)[] = [];
    Element.prototype.scrollIntoView = function (this: Element) { skoky.push(this.textContent); };
    otevri({ places: SEZNAM, objednavky: [] });
    fireEvent.click(within(lista()).getByRole('button', { name: 'M' }));
    fireEvent.click(within(lista()).getByRole('button', { name: 'CH' }));
    expect(skoky).toEqual(['M', 'CH']);
  });
});

describe('OdberatelTlacitko — hledání při psaní', () => {
  const SEZNAM = mista('Martin', 'Marek', 'Mates Rybárna', 'Čertovka', 'Šimáček');

  it('při psaní se ukážou jen odpovídající odběratelé, sekce Nejčastější a abeceda zmizí', () => {
    otevri({ places: SEZNAM, objednavky: objednavky('id1', 4), placeName: 'mar' });
    expect(jmenaV('Nalezení odběratelé').sort()).toEqual(['Marek', 'Martin']);
    expect(screen.queryByRole('region', { name: 'Nejčastější odběratelé' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Všichni odběratelé podle abecedy' })).toBeNull();
  });

  it('hledání nehledí na velikost písmen ani diakritiku a víc slov musí sedět všechna', () => {
    const { vykresleni, props } = otevri({ places: SEZNAM, objednavky: [], placeName: 'CERT' });
    expect(jmenaV('Nalezení odběratelé')).toEqual(['Čertovka']);
    vykresleni.rerender(<OdberatelTlacitko {...props} placeName="mat ryb" />);
    expect(jmenaV('Nalezení odběratelé')).toEqual(['Mates Rybárna']);
  });

  it('častěji objednávající je mezi nalezenými první', () => {
    otevri({ places: SEZNAM, objednavky: objednavky('id1', 5), placeName: 'mar' });
    expect(jmenaV('Nalezení odběratelé')).toEqual(['Marek', 'Martin']);
  });

  it('nikdo neodpovídá = vysvětlení místo prázdného okna', () => {
    otevri({ places: SEZNAM, objednavky: [], placeName: 'xyz' });
    expect(screen.getByText(/Nikdo odpovídající „xyz“/)).toBeTruthy();
  });

  it('když už je odběratel vybraný, jeho jméno v poli seznam NEzužuje', () => {
    otevri({ places: SEZNAM, objednavky: [], placeId: 'id0', placeName: 'Martin' });
    expect(screen.queryByRole('region', { name: 'Nalezení odběratelé' })).toBeNull();
    expect(jmenaV('Všichni odběratelé podle abecedy')).toHaveLength(5);
  });
});
