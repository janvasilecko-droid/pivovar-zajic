import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { Cteni, Kniha, ObjektKnihy, TextListu } from '../../lib/bibleCteniApi';
import type { BibleDokument } from '../../lib/bibleKnihovnaApi';

// Jen vymyšlené krátké věty — žádný text skutečných knih (repo je veřejné).
const nactiKnihu = vi.fn<(id: string) => Promise<Cteni<Kniha>>>();
const nactiListy = vi.fn<(id: string, od: number, pocet?: number) => Promise<Cteni<TextListu[]>>>();
const nactiObjekty = vi.fn<(id: string, po?: number) => Promise<Cteni<{ objekty: ObjektKnihy[]; dalsi: number | null }>>>();
vi.mock('../../lib/bibleCteniApi', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/bibleCteniApi')>()),
  nactiKnihu: (id: string) => nactiKnihu(id),
  nactiListy: (id: string, od: number, pocet?: number) => nactiListy(id, od, pocet),
  nactiObjekty: (id: string, po?: number) => nactiObjekty(id, po),
}));
vi.mock('../../lib/bibleKnihovnaApi', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/bibleKnihovnaApi')>()),
  odkazNaSoubor: vi.fn(async () => ({ chyba: 'Odkaz teď nejde vydat.' })),
}));

import { BibleKniha } from './BibleKniha';

const ID = '11111111-2222-3333-4444-555555555555';
const dokument = (stav: BibleDokument['stav'] = 'hotovo'): BibleDokument => ({
  id: ID, nazev: 'Technologie piva', autor: 'Novák', vydani: '2. vyd.', rok: 2019, isbn: null, jazyk: 'cs', druh: 'kniha',
  oblasti: [], zdroj: null, soubor_nazev: 'kniha.pdf', soubor_velikost: 1000, soubor_mime: 'application/pdf',
  stav, stav_zprava: null, postup: { stran: 4, kapitol: 2, tabulek: 1, vzorcu: 1 }, stran_celkem: 4, kvalita_ocr: null,
  licence: null, nahral: 'u1', nahral_jmeno: 'Honza', created_at: '2026-10-31T10:00:00Z', zpracovano_at: '2026-10-31T12:00:00Z',
});
const kniha = (navic: Partial<Kniha> = {}): Kniha => ({
  dokument: dokument(),
  kapitoly: [
    { id: 'k1', rodic_id: null, poradi: 1, uroven: 1, cislo: '1', nazev: 'Slad', strana_od: 1, strana_do: 2 },
    { id: 'k2', rodic_id: 'k1', poradi: 2, uroven: 2, cislo: '1.1', nazev: 'Klíčení', strana_od: 2, strana_do: 2 },
    { id: 'k3', rodic_id: null, poradi: 3, uroven: 1, cislo: '2', nazev: 'Rmutování', strana_od: 3, strana_do: 4 },
  ],
  listy: [
    { pdfIndex: 1, tistena: null, zdroj: 'vrstva', keKontrole: false },
    { pdfIndex: 2, tistena: '1', zdroj: 'ocr', keKontrole: false },
    { pdfIndex: 3, tistena: '2', zdroj: 'ocr', keKontrole: true },
    { pdfIndex: 4, tistena: '3', zdroj: 'ocr', keKontrole: false },
  ],
  ...navic,
});
const list = (pdf_index: number, text: string, navic: Partial<TextListu> = {}): TextListu => ({
  pdf_index, tistena_strana: pdf_index > 1 ? String(pdf_index - 1) : null, tistena_zdroj: null, zdroj_textu: pdf_index > 1 ? 'ocr' : 'vrstva',
  text, ke_kontrole: false, kontrola_duvod: null, kapitola_id: null, ...navic,
});
const TEXTY: Record<number, TextListu> = {
  1: list(1, 'Úvodní list | s doslovnou čarou'),
  2: list(2, '## 1.1 Klíčení\n\nZrno klíčí při $t_k$ stupních.'),
  3: list(3, '| Teplota | Čas |\n|---|---|\n| 62 °C | 30 min |\n\n$$ E = \\frac{a}{b} $$', { ke_kontrole: true, kontrola_duvod: '2 z 9 čísel se neshoduje' }),
  4: list(4, 'Konec [nečitelné] knihy.'),
};

beforeEach(() => {
  nactiKnihu.mockReset();
  nactiListy.mockReset();
  nactiObjekty.mockReset();
  nactiListy.mockImplementation(async (_id, od, pocet = 2) => ({
    stav: 'ok', data: [od, od + 1].slice(0, pocet).map((n) => TEXTY[n]).filter(Boolean),
  }));
});

async function vykresli(props: Partial<Parameters<typeof BibleKniha>[0]> = {}) {
  await act(async () => { render(<BibleKniha id={ID} {...props} />); });
}

describe('Čtečka knihy', () => {
  it('obsah: kapitoly v pořadí s odsazením a místem v knize; kapitola otevře svou stranu', async () => {
    nactiKnihu.mockResolvedValueOnce({ stav: 'ok', data: kniha() });
    await vykresli();
    expect(nactiKnihu).toHaveBeenCalledWith(ID);
    expect(screen.getByText('Technologie piva')).toBeTruthy();
    expect(screen.getByText('Novák · 2019 · 2. vyd.')).toBeTruthy();
    expect(screen.getByText('4 listů · 3 kapitol · 1 tabulek · 1 vzorců')).toBeTruthy();
    const obsah = screen.getByRole('list', { name: 'Obsah knihy' });
    const polozky = within(obsah).getAllByRole('button');
    expect(polozky.map((b) => b.textContent)).toEqual(['1 Sladlist 1', '1.1 Klíčenís. 1', '2 Rmutovánís. 2']);

    await act(async () => { fireEvent.click(polozky[2]); });
    expect(nactiListy).toHaveBeenCalledWith(ID, 3, 2);
    expect(screen.getByText('Kapitola: 2 Rmutování')).toBeTruthy();
    // Tabulka z přepisu skenu, vzorec jako LaTeX a upozornění ke kontrole.
    expect(screen.getByRole('columnheader', { name: 'Teplota' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '62 °C' })).toBeTruthy();
    expect(screen.getByText('E = \\frac{a}{b}')).toBeTruthy();
    expect(screen.getByText(/Ke kontrole: 2 z 9 čísel se neshoduje/)).toBeTruthy();
    expect(screen.getByText('přepis skenu (AI)')).toBeTruthy();
  });

  it('listování: další a předchozí strana bez nového načtení u přednačtené, na krajích tlačítka vypnutá', async () => {
    nactiKnihu.mockResolvedValueOnce({ stav: 'ok', data: kniha() });
    await vykresli({ pocatecniList: 1 });
    expect(nactiListy).toHaveBeenCalledWith(ID, 1, 2);
    // Textová vrstva se nerozebírá: svislá čára zůstane v textu.
    expect(screen.getByText('Úvodní list | s doslovnou čarou')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Předchozí strana' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('1 z 4')).toBeTruthy();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Další strana' })); });
    expect(screen.getByRole('heading', { name: '1.1 Klíčení' })).toBeTruthy();
    expect(screen.getByTitle('vzorec (LaTeX)').textContent).toBe('t_k');
    // List 2 byl přednačtený s listem 1; přednačte se list 3.
    expect(nactiListy.mock.calls.map((c) => c[1])).toEqual([1, 3]);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Další strana' })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Další strana' })); });
    expect(screen.getByText('[nečitelné]')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Další strana' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Předchozí strana' })); });
    expect(screen.getByRole('cell', { name: '30 min' })).toBeTruthy();
  });

  it('skok na stranu: tištěné číslo, jinak pořadí listu; neznámá strana řekne, že ji nevidí', async () => {
    nactiKnihu.mockResolvedValueOnce({ stav: 'ok', data: kniha() });
    await vykresli({ pocatecniList: 1 });
    const pole = screen.getByLabelText('Jdi na stranu');
    fireEvent.change(pole, { target: { value: '3' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Jdi' })); });
    expect(screen.getByText('[nečitelné]')).toBeTruthy();
    expect(screen.getByText('s. 3')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Jdi na stranu'), { target: { value: '99' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Jdi' })); });
    expect(screen.getByRole('alert').textContent).toMatch(/Stranu „99" v knize nevidím/);
  });

  it('kniha bez kapitol: čte se po stranách', async () => {
    nactiKnihu.mockResolvedValueOnce({ stav: 'ok', data: kniha({ kapitoly: [] }) });
    await vykresli();
    expect(screen.getByText(/nemá rozpoznané kapitoly/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Číst od začátku' })); });
    expect(nactiListy).toHaveBeenCalledWith(ID, 1, 2);
  });

  it('tabulky a vzorce: přehled s náhledem, pokračování a otevření strany', async () => {
    nactiKnihu.mockResolvedValueOnce({ stav: 'ok', data: kniha() });
    nactiObjekty
      .mockResolvedValueOnce({ stav: 'ok', data: { objekty: [{ poradi: 5, druh: 'tabulka', strana_od: 3, strana_do: 3, kapitola_id: null, nahled: '| Teplota | Čas |' }], dalsi: 5 } })
      .mockResolvedValueOnce({ stav: 'ok', data: { objekty: [{ poradi: 9, druh: 'vzorec', strana_od: 3, strana_do: 3, kapitola_id: null, nahled: 'E = a/b' }], dalsi: null } });
    await vykresli();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Tabulky a vzorce' })); });
    expect(nactiObjekty).toHaveBeenCalledWith(ID, 0);
    expect(screen.getByText('| Teplota | Čas |')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Načíst další' })); });
    expect(nactiObjekty).toHaveBeenLastCalledWith(ID, 5);
    expect(screen.getByText('E = a/b')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Načíst další' })).toBeNull();
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Otevřít s. 2' })[0]); });
    expect(nactiListy).toHaveBeenCalledWith(ID, 3, 2);
    expect(screen.getByRole('cell', { name: '62 °C' })).toBeTruthy();
  });

  it('nezpracovaná kniha: zpráva a cesta zpět, bez „Zkusit znovu"', async () => {
    const doKnihovny = vi.fn();
    nactiKnihu.mockResolvedValueOnce({ stav: 'nezpracovano', zprava: 'Kniha se právě zpracovává — číst půjde, až zpracování doběhne.' });
    await vykresli({ doKnihovny });
    expect(screen.getByRole('note').textContent).toMatch(/právě zpracovává/);
    expect(screen.queryByRole('button', { name: 'Zkusit znovu' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Zpět do knihovny' }));
    expect(doKnihovny).toHaveBeenCalled();
  });

  it('čtení se právě nasazuje / chyba sítě: „Zkusit znovu" načte knihu znovu', async () => {
    nactiKnihu
      .mockResolvedValueOnce({ stav: 'nenasazeno', zprava: 'Čtení knih se právě nasazuje — zkus to za pár minut.' })
      .mockResolvedValueOnce({ stav: 'ok', data: kniha() });
    await vykresli();
    expect(screen.getByText(/právě nasazuje/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Zkusit znovu' })); });
    expect(nactiKnihu).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Technologie piva')).toBeTruthy();
  });

  it('chyba načtení strany: hláška a „Zkusit znovu" stranu načte', async () => {
    nactiKnihu.mockResolvedValueOnce({ stav: 'ok', data: kniha() });
    nactiListy.mockResolvedValueOnce({ stav: 'chyba', zprava: 'Spojení se přerušilo.' });
    await vykresli({ pocatecniList: 2 });
    expect(screen.getByText('Spojení se přerušilo.')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Zkusit znovu' })); });
    expect(screen.getByRole('heading', { name: '1.1 Klíčení' })).toBeTruthy();
  });

  it('list, který z knihy zmizel, nečeká donekonečna — a „Zkusit znovu" se opravdu zeptá znovu', async () => {
    nactiKnihu.mockResolvedValueOnce({ stav: 'ok', data: kniha() });
    nactiListy.mockResolvedValueOnce({ stav: 'ok', data: [TEXTY[3]] });
    await vykresli({ pocatecniList: 2 });
    expect(screen.getByRole('alert').textContent).toMatch(/nepodařilo načíst/);
    const dotazu = nactiListy.mock.calls.length;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Zkusit znovu' })); });
    expect(nactiListy.mock.calls.length).toBe(dotazu + 1);
    expect(nactiListy.mock.calls[dotazu]).toEqual([ID, 2, 2]);
    expect(screen.getByRole('heading', { name: '1.1 Klíčení' })).toBeTruthy();
  });

  // Revize 1. 11. 2026: přednačtení listu 3 selže, až když na něm čtenář už je
  // (slabý signál) — dřív viselo „Načítám stranu…" bez hlášky a bez tlačítka.
  it('přednačtení selže, když už je čtenář na tom listu: hláška a „Zkusit znovu"', async () => {
    nactiKnihu.mockResolvedValueOnce({ stav: 'ok', data: kniha() });
    let pustPrednacteni: (v: Cteni<TextListu[]>) => void = () => {};
    nactiListy.mockImplementation(async (_id, od, pocet = 2) => {
      if (od === 3) return new Promise<Cteni<TextListu[]>>((res) => { pustPrednacteni = res; });
      return { stav: 'ok', data: [od, od + 1].slice(0, pocet).map((n) => TEXTY[n]).filter(Boolean) };
    });
    await vykresli({ pocatecniList: 1 });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Další strana' })); });   // list 2 (přišel s 1), přednačítá se 3
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Další strana' })); });   // list 3, přednačtení ještě běží
    expect(screen.getByText('Načítám stranu…')).toBeTruthy();
    await act(async () => { pustPrednacteni({ stav: 'chyba', zprava: 'Spojení se přerušilo.' }); });
    expect(screen.getByRole('alert').textContent).toMatch(/Spojení se přerušilo/);
    nactiListy.mockImplementation(async (_id, od) => ({ stav: 'ok', data: [TEXTY[od], TEXTY[od + 1]].filter(Boolean) }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Zkusit znovu' })); });
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('starý neúspěch se při novém příchodu na list zkusí znovu bez klepání', async () => {
    nactiKnihu.mockResolvedValueOnce({ stav: 'ok', data: kniha() });
    nactiListy.mockImplementation(async (_id, od, pocet = 2) => (od === 3
      ? { stav: 'chyba', zprava: 'Spojení se přerušilo.' }
      : { stav: 'ok', data: [od, od + 1].slice(0, pocet).map((n) => TEXTY[n]).filter(Boolean) }));
    await vykresli({ pocatecniList: 1 });   // listy 1 a 2 přijdou spolu
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Další strana' })); });   // list 2 — přednačtení 3 selže potichu
    expect(nactiListy.mock.calls.filter((c) => c[1] === 3)).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();
    nactiListy.mockImplementation(async (_id, od) => ({ stav: 'ok', data: [TEXTY[od], TEXTY[od + 1]].filter(Boolean) }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Další strana' })); });
    expect(nactiListy.mock.calls.filter((c) => c[1] === 3)).toHaveLength(2);
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('tabulky a vzorce: po chybě první dávky jde „Zkusit znovu"', async () => {
    nactiKnihu.mockResolvedValueOnce({ stav: 'ok', data: kniha() });
    nactiObjekty.mockResolvedValueOnce({ stav: 'chyba', zprava: 'Spojení se přerušilo.' });
    nactiObjekty.mockResolvedValueOnce({ stav: 'ok', data: { objekty: [{ poradi: 3, druh: 'tabulka', strana_od: 3, strana_do: 3, kapitola_id: null, nahled: '| a | b |' }], dalsi: null } });
    await vykresli();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Tabulky a vzorce/ })); });
    expect(screen.getByRole('alert').textContent).toMatch(/Spojení se přerušilo/);
    expect(screen.queryByRole('button', { name: 'Načíst další' })).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Zkusit znovu' })); });
    expect(nactiObjekty).toHaveBeenLastCalledWith(ID, 0);
    expect(screen.getByText('| a | b |')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('tabulky a vzorce: chyba další dávky je pod seznamem a „Zkusit znovu" pokračuje od kurzoru', async () => {
    nactiKnihu.mockResolvedValueOnce({ stav: 'ok', data: kniha() });
    const objekt = (poradi: number) => ({ poradi, druh: 'tabulka' as const, strana_od: 3, strana_do: 3, kapitola_id: null, nahled: `tabulka ${poradi}` });
    nactiObjekty.mockResolvedValueOnce({ stav: 'ok', data: { objekty: [objekt(1), objekt(2)], dalsi: 2 } });
    nactiObjekty.mockResolvedValueOnce({ stav: 'chyba', zprava: 'Spojení se přerušilo.' });
    nactiObjekty.mockResolvedValueOnce({ stav: 'ok', data: { objekty: [objekt(3)], dalsi: null } });
    await vykresli();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Tabulky a vzorce/ })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Načíst další' })); });
    const seznam = screen.getByRole('list');
    const hlaska = screen.getByRole('alert');
    expect(seznam.compareDocumentPosition(hlaska) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Zkusit znovu' })); });
    expect(nactiObjekty).toHaveBeenLastCalledWith(ID, 2);
    expect(screen.getAllByText(/^tabulka \d$/).map((e) => e.textContent)).toEqual(['tabulka 1', 'tabulka 2', 'tabulka 3']);
  });

  // Appka neroluje oknem, ale obalem obsahu (Layout: div.overflow-y-auto).
  it('další strana vrátí čtení na začátek, když je odrolované dolů', async () => {
    nactiKnihu.mockResolvedValueOnce({ stav: 'ok', data: kniha() });
    const posun = vi.fn();
    const puvodni = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = posun;
    try {
      await vykresli({ pocatecniList: 2 });
      const lista = screen.getByRole('button', { name: 'Další strana' }).closest('div.sticky')!;
      const obal = lista.parentElement as HTMLElement;
      obal.getBoundingClientRect = () => ({ top: -900 } as DOMRect);   // začátek čtení je nad horní hranou
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Další strana' })); });
      expect(posun).toHaveBeenCalledWith({ block: 'start' });
      posun.mockClear();
      obal.getBoundingClientRect = () => ({ top: 120 } as DOMRect);    // čtení je vidět celé — nic neposouvat
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Předchozí strana' })); });
      expect(posun).not.toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = puvodni;
    }
  });
});
