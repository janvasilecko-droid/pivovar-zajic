// Pomocné věci k „bez závozu" v přehledu objednávek (23. 11. 2026).
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NadpisBezZavozu, StitekBezZavozu, jeBezZavozu, pocetObjednavek, rozdelPodleZavozu } from './BezZavozu';

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
