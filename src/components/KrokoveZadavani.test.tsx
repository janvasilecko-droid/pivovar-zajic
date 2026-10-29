import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KrokoveZadavani, type KrokDef } from './KrokoveZadavani';
import { mnozstviLahve, mnozstviSudu, nastavLahve, nastavSud, type KonceptLahve } from '../lib/krokoveZadavani';
import type { Beer } from '../lib/supabase';

const beer = { id: 'sv12', name: '12° Světlá', degree: 12, beer_color: '#F59E0B' } as unknown as Beer;
const prazdny: KonceptLahve = {
  pkgId: '', qty: '', pkg2Id: '', qty2: '', pkg3Id: '', qty3: '', pkg4Id: '', qty4: '',
  kegPkgId: 'k50', kegQty: '', keg2PkgId: '', keg2Qty: '',
};

/** Dva kroky jako u Lahví: sudy (až dvě velikosti), pak lahve. */
function Lahve({ onZavrit, zacatek = prazdny, sleduj }: { onZavrit: (d: KonceptLahve) => void; zacatek?: KonceptLahve; sleduj?: (d: KonceptLahve) => void }) {
  const [d, setD] = useState(zacatek);
  sleduj?.(d);
  const kroky: KrokDef[] = [
    {
      stitek: '1 · Z kolika sudů', otazka: 'Z kolika sudů?',
      obaly: [{ id: 'k50', label: '50 l' }, { id: 'k30', label: '30 l' }, { id: 'k20', label: '20 l' }],
      jednotka: (o) => `sudů ${o.label}`,
      mnozstvi: (id) => mnozstviSudu(d, id),
      nastav: (id, n) => setD((x) => nastavSud(x, id, n)),
      rychle: () => [1, 2, 3, 5, 19],
      vychozi: d.kegPkgId || 'k50',
      maxObalu: 2,
      dalsiText: '+ další sud',
      bezMnozstvi: { zprava: 'Sudy nejsou zadané — ze skladu se žádný sud neodečte.', pokracovat: 'Pokračovat bez sudů' },
    },
    {
      stitek: '2 · Kolik lahví', otazka: 'Kolik lahví?',
      obaly: [{ id: 'b1', label: '1 l' }, { id: 'b15', label: '1,5 l' }],
      jednotka: (o) => `lahví ${o.label}`,
      mnozstvi: (id) => mnozstviLahve(d, id),
      nastav: (id, n) => setD((x) => nastavLahve(x, id, n)),
      rychle: (id) => (id === 'b1' ? [79, 90, 93, 137, 699] : [24, 31, 56, 62, 67]),
      dalsiText: '+ další obal',
      povinny: 'Zadej počet lahví.',
    },
  ];
  return <KrokoveZadavani beer={beer} podtitul="Stáčení lahví" kroky={kroky} onZavrit={() => onZavrit(d)} />;
}

const pole = () => screen.getByRole('textbox') as HTMLInputElement;
const napis = (v: string) => fireEvent.change(pole(), { target: { value: v } });

describe('KrokoveZadavani', () => {
  it('po otevření je pole vybrané a první krok ptá na sudy, předvolená je padesátka', () => {
    render(<Lahve onZavrit={() => {}} />);
    expect(screen.getByText('Z kolika sudů?')).toBeTruthy();
    expect(document.activeElement).toBe(pole());
    expect(screen.getByRole('radio', { name: '50 l' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getAllByRole('button').filter((b) => ['1', '2', '3', '5', '19'].includes(b.textContent ?? ''))).toHaveLength(5);
  });

  it('Enter potvrdí sudy a skočí na lahve; pole je zase vybrané', () => {
    render(<Lahve onZavrit={() => {}} />);
    napis('3');
    fireEvent.keyDown(pole(), { key: 'Enter' });
    expect(screen.getByText('Kolik lahví?')).toBeTruthy();
    expect(pole().value).toBe('');
    expect(document.activeElement).toBe(pole());
  });

  it('klepnutí na rychlé číslo zadá a v posledním kroku zavře s přeneseným číslem', () => {
    const zavreno = vi.fn();
    render(<Lahve onZavrit={zavreno} />);
    napis('3');
    fireEvent.click(screen.getByRole('button', { name: /Dál/ }));
    fireEvent.click(screen.getByRole('button', { name: '137' }));
    expect(zavreno).toHaveBeenCalledTimes(1);
    expect(zavreno.mock.calls[0][0]).toMatchObject({ kegPkgId: 'k50', kegQty: '3', pkgId: 'b1', qty: '137' });
  });

  it('číslo napsané před výběrem velikosti patří k vybrané velikosti', () => {
    const zavreno = vi.fn();
    render(<Lahve onZavrit={zavreno} />);
    napis('4');
    fireEvent.click(screen.getByRole('radio', { name: '30 l' }));
    expect(pole().value).toBe('4');
    fireEvent.click(screen.getByRole('button', { name: 'Zavřít a nechat rozepsané' }));
    expect(zavreno.mock.calls[0][0]).toMatchObject({ kegPkgId: 'k30', kegQty: '4' });
  });

  it('číslo se do zápisu přenáší hned při psaní, ne až při potvrzení', () => {
    let posledni = prazdny;
    render(<Lahve onZavrit={() => {}} sleduj={(d) => { posledni = d; }} />);
    napis('7');
    expect(posledni).toMatchObject({ kegPkgId: 'k50', kegQty: '7' });
  });

  it('napřed číslo, pak velikost: číslo se z původního políčka přesune', () => {
    let posledni = prazdny;
    render(<Lahve onZavrit={() => {}} sleduj={(d) => { posledni = d; }} />);
    napis('4');
    fireEvent.click(screen.getByRole('radio', { name: '30 l' }));
    expect(posledni).toMatchObject({ kegPkgId: 'k30', kegQty: '4', keg2PkgId: '', keg2Qty: '' });
    // druhé klepnutí už je záměrné — číslo zůstává u 30 l
    fireEvent.click(screen.getByRole('radio', { name: '20 l' }));
    expect(posledni).toMatchObject({ kegPkgId: 'k30', kegQty: '4' });
  });

  it('kdo velikost klepl sám, tomu se číslo nepřesouvá', () => {
    let posledni = prazdny;
    render(<Lahve onZavrit={() => {}} sleduj={(d) => { posledni = d; }} />);
    fireEvent.click(screen.getByRole('radio', { name: '30 l' }));
    napis('4');
    fireEvent.click(screen.getByRole('radio', { name: '20 l' }));
    expect(posledni).toMatchObject({ kegPkgId: 'k30', kegQty: '4' });
    expect(pole().value).toBe('');
  });

  it('velikost s už zadaným počtem se číslem nepřepíše', () => {
    let posledni = prazdny;
    render(<Lahve onZavrit={() => {}} zacatek={{ ...prazdny, kegPkgId: 'k30', kegQty: '2' }} sleduj={(d) => { posledni = d; }} />);
    fireEvent.click(screen.getByRole('radio', { name: /50 l/ }));
    napis('3');
    expect(posledni).toMatchObject({ kegPkgId: 'k30', kegQty: '2', keg2PkgId: 'k50', keg2Qty: '3' });
  });

  it('+ další sud uloží číslo a nabídne další velikost; třetí velikost je zakázaná', () => {
    render(<Lahve onZavrit={() => {}} />);
    napis('1');
    fireEvent.click(screen.getByRole('button', { name: /\+ další sud/ }));
    expect(screen.getByRole('radio', { name: /30 l/ }).getAttribute('aria-checked')).toBe('true');
    napis('2');
    fireEvent.click(screen.getByRole('button', { name: /\+ další sud/ }));
    // obě velikosti mají počet, 20 l se nabídnout nesmí
    expect(screen.getByText('Další velikost už není k dispozici.')).toBeTruthy();
    expect((screen.getByRole('radio', { name: /20 l/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('bez sudů se napřed zeptá a jde dál až po odsouhlasení', () => {
    render(<Lahve onZavrit={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Dál/ }));
    expect(screen.getByText(/žádný sud neodečte/)).toBeTruthy();
    expect(screen.getByText('Z kolika sudů?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pokračovat bez sudů' }));
    expect(screen.getByText('Kolik lahví?')).toBeTruthy();
  });

  it('Hotovo bez lahví po zadaných sudech nezavře a řekne proč', () => {
    const zavreno = vi.fn();
    render(<Lahve onZavrit={zavreno} />);
    napis('2');
    fireEvent.click(screen.getByRole('button', { name: /Dál/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Hotovo' }));
    expect(screen.getByText('Zadej počet lahví.')).toBeTruthy();
    expect(zavreno).not.toHaveBeenCalled();
  });

  it('prázdný panel se dá zavřít beze zápisu', () => {
    const zavreno = vi.fn();
    render(<Lahve onZavrit={zavreno} />);
    fireEvent.click(screen.getByRole('button', { name: 'Zavřít a nechat rozepsané' }));
    expect(zavreno.mock.calls[0][0]).toEqual(prazdny);
  });

  it('rozepsaný zápis se při otevření načte do pole a jde ho přepsat', () => {
    const zavreno = vi.fn();
    render(<Lahve onZavrit={zavreno} zacatek={{ ...prazdny, kegQty: '3', pkgId: 'b1', qty: '100' }} />);
    expect(pole().value).toBe('3');
    napis('4');
    fireEvent.click(screen.getByRole('button', { name: /Dál/ }));
    expect(pole().value).toBe('100');
    napis('120');
    fireEvent.click(screen.getByRole('button', { name: 'Hotovo' }));
    expect(zavreno.mock.calls[0][0]).toMatchObject({ kegQty: '4', qty: '120' });
  });

  it('číslo smazané z pole zápis vyprázdní', () => {
    const zavreno = vi.fn();
    render(<Lahve onZavrit={zavreno} zacatek={{ ...prazdny, kegQty: '3', pkgId: 'b1', qty: '100' }} />);
    napis('');
    fireEvent.click(screen.getByRole('button', { name: 'Zavřít a nechat rozepsané' }));
    expect(zavreno.mock.calls[0][0]).toMatchObject({ kegQty: '', qty: '100' });
  });

  it('do pole jdou jen číslice', () => {
    render(<Lahve onZavrit={() => {}} />);
    napis('1a2-');
    expect(pole().value).toBe('12');
  });
});
