// Průchozí scénář výčepů: od věty ve zprávě až po vyčištěný výčep.
//
// Jednotlivé kroky mají každý svůj test; tohle hlídá, že spolu drží. Použité jsou
// SKUTEČNÉ moduly (čtení zprávy, poznámka, rezervace, datová vrstva, obrazovka
// Výčepy) proti atrapě databáze, která je stejně přísná jako Postgres
// (test/atrapaVycepyDb.ts). Věty a jména jsou vymyšlené.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const toast = vi.hoisted(() => ({
  chyba: vi.fn(),
  oznam: vi.fn(),
  potvrd: vi.fn(async () => true),
}));

vi.mock('./supabase', async () => {
  const { supabaseAtrapa } = await import('../test/atrapaVycepyDb');
  return { supabase: supabaseAtrapa, useRealtime: () => {} };
});
vi.mock('./toast', () => toast);

import VycepyScreen from '../screens/VycepyScreen';
import { vycistiMigraciProTesty } from './vycepyData';
import { autoReserveTapIfNeeded, detectTapType, isTapMentioned } from './tapReservations';
import { detectOrderNotes } from './orderParser';
import { ukolyZPoznamky } from './zavozUkoly';
import { popisZminkyVycepu } from '../../supabase/functions/_shared/vycep-z-textu';
import { getTapNameForOrder } from '../components/objednavky/spolecne';
import { db, vycistiDb, ID_A, ID_B, radekVycepu } from '../test/atrapaVycepyDb';

const ISO_CAS = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
const OBJEDNAVKA = '99999999-9999-4999-8999-999999999999';
// Daleká budoucnost: rezervace nikdy nevypadá jako „Po termínu“, ať test běží kdykoli.
const ZAVOZ = '2099-11-12';

beforeEach(() => {
  vycistiDb();
  db.vycepy = [
    radekVycepu(ID_A, 'Jednokohout 1', { typ: 'jednokohout', poradi: 0 }),
    radekVycepu(ID_B, 'Dvojkohout 1', { typ: 'dvojkohout', poradi: 1 }),
  ];
  toast.chyba.mockClear();
  localStorage.clear();
  vycistiMigraciProTesty();
});

describe('věta ve zprávě → poznámka → rezervace → vrácení → čištění', () => {
  const ZPRAVA = 'Na čtvrtek 2x50l 12sv pro Zahradu U Lípy. Na sobotu pipa dvoukohout, dve hadice a narazec';

  it('celá cesta, krok za krokem', async () => {
    // 1) Server i appka z věty udělají poznámku S DRUHEM výčepu (dřív zbylo holé „pipa“).
    expect(popisZminkyVycepu(ZPRAVA)).toBe('pipa dvojkohout');
    const poznamka = detectOrderNotes(ZPRAVA);
    expect(poznamka).toContain('pipa dvojkohout');

    // 2) Z poznámky se pozná, že se má rezervovat — a jaký výčep.
    expect(isTapMentioned(poznamka)).toBe(true);
    expect(detectTapType(poznamka)).toBe('dvojkohout');

    // 3) Rezervace vznikne v databázi, na výčepu požadovaného druhu.
    await autoReserveTapIfNeeded('Zahrada U Lípy', ZAVOZ, poznamka, OBJEDNAVKA);
    expect(toast.chyba).not.toHaveBeenCalled();
    expect(db.rezervace).toHaveLength(1);
    expect(db.rezervace[0]).toMatchObject({
      vycep_id: ID_B, datum_od: ZAVOZ, datum_do: ZAVOZ, odberatel: 'Zahrada U Lípy', order_id: OBJEDNAVKA, vraceno: false,
    });

    // 4) Seznam objednávek ukáže štítek s výčepem hned (čte z kopie, ta drží krok s databází).
    expect(getTapNameForOrder(OBJEDNAVKA)).toBe('Dvojkohout 1');

    // 5) Znovu uložená objednávka rezervaci nezdvojí.
    await autoReserveTapIfNeeded('Zahrada U Lípy', ZAVOZ, poznamka, OBJEDNAVKA);
    expect(db.rezervace).toHaveLength(1);
    expect(toast.chyba).not.toHaveBeenCalled();

    // 6) Obrazovka Výčepy rezervaci ukáže (po novém načtení z databáze, ne z kopie).
    localStorage.clear();
    vycistiMigraciProTesty();
    render(<VycepyScreen />);
    const radek = (await screen.findAllByText('Zahrada U Lípy')).map((el) => el.closest('tr')).find(Boolean)!;
    expect(radek.textContent).toContain('Dvojkohout 1');
    expect(radek.textContent).toContain('Půjčeno');

    // 7) Vrácení: rezervace je vrácená a výčep špinavý.
    fireEvent.click(screen.getAllByRole('button', { name: /Vrátit/ })[0]);
    await waitFor(() => expect(db.rezervace[0].vraceno).toBe(true));
    await waitFor(() => expect(db.vycepy.find((v) => v.id === ID_B)!.stav).toBe('dirty_beer'));
    expect(await screen.findByText('V trubkách je pivo')).toBeTruthy();

    // 8) Čištění: Opláchnuto → čistý, s časem, který databáze přijme.
    const karta = screen.getAllByText('Dvojkohout 1')[0].closest('.card') as HTMLElement;
    fireEvent.click(Array.from(karta.querySelectorAll('button')).find((b) => /Opláchnuto/.test(b.textContent ?? ''))!);
    await waitFor(() => expect(db.vycepy.find((v) => v.id === ID_B)!.stav).toBe('clean'));
    const vycepB = db.vycepy.find((v) => v.id === ID_B)!;
    expect(vycepB.posledni_oplach).toMatch(ISO_CAS);
    expect(vycepB.kohouty_rozebrane).toBe(true);
    expect(await within(karta).findByText(/Čisté & Opláchnuté/)).toBeTruthy();
    expect(toast.chyba).not.toHaveBeenCalled();
  });
});

describe('vrácený výčep a kalendář', () => {
  // DNEŠNÍ CHOVÁNÍ, k rozhodnutí majitele: vrácená rezervace se z kalendáře nemaže
  // a blokuje svůj původní termín i potom, co je výčep fyzicky zpátky.
  it('vrácený výčep dál blokuje svůj den — další zájemce dostane jiný výčep', async () => {
    db.rezervace = [{
      id: '77777777-7777-4777-8777-777777777777', vycep_id: ID_B, vycep_nazev: 'Dvojkohout 1', datum_od: ZAVOZ, datum_do: ZAVOZ,
      odberatel: 'Zahrada U Lípy', telefon: null, kauce_czk: null, vraceno: true, vraceno_at: '2099-11-12T08:00:00.000Z',
      poznamka: null, order_id: null,
    }];
    await autoReserveTapIfNeeded('Hospoda Jiná', ZAVOZ, '+ výčep dvoukohout', '88888888-8888-4888-8888-888888888888');
    const nova = db.rezervace.find((r) => r.order_id === '88888888-8888-4888-8888-888888888888');
    expect(nova!.vycep_id).toBe(ID_A);
  });
});

describe('server, appka i úkoly k závozu čtou výčep stejně', () => {
  it.each([
    'Na sobotu pipa dvoukohout, dve hadice a narazec',
    'Na akci prosim pipa dvoukohout, hadice, narazece. Dekuju',
    '20l dvanactky a pipa jednokohout pro Frantu do Plzne. Na patek',
    'šestikohout na akci v sobotu',
    '+ výčep',
    'K tomu pípu dvojkohout a tlakovou láhev, díky',
    'chladák s sebou',
    'Pro Petra 1x50 a 1x30 plus narazec',
    '2x50 12sv, faktura',
    'přivézt na terasu do 15:00',
    'pipeta na odběr vzorků',
  ])('%j', (text) => {
    const zmineno = isTapMentioned(text);
    // 1) úkol „Naložit výčep“ se řídí stejným pravidlem jako rezervace
    expect(ukolyZPoznamky(text).some((u) => u.klic === 'vycep')).toBe(zmineno);
    // 2) poznámka, kterou z věty napíše server a appka, se dá znovu přečíst: výčep i druh zůstanou
    const server = popisZminkyVycepu(text);
    expect(server !== null).toBe(zmineno);
    const poznamka = detectOrderNotes(text);
    expect(isTapMentioned(poznamka)).toBe(zmineno);
    expect(detectTapType(poznamka)).toBe(detectTapType(text));
    if (server) expect(detectTapType(server)).toBe(detectTapType(text));
  });
});
