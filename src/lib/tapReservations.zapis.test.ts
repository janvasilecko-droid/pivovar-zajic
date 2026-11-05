// Rezervace výčepu: překryv termínů, propojení s objednávkou, chyby zápisu.
// Datová vrstva je zamokovaná (žádná databáze), hlášky se sbírají do pole.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TapEquipment, TapReservation } from '../screens/VycepyScreen';

const stav = vi.hoisted(() => ({
  vycepy: [] as any[],
  rezervace: [] as any[],
  ulozene: [] as any[],
  chybaZapisu: null as string | null,
  hlasky: [] as string[],
  varovani: [] as string[],
  /** Simulace závodu: zápis selže, protože mezitím rezervaci založil někdo jiný. */
  zalozPriZapisu: null as any,
}));

vi.mock('./vycepyData', () => ({
  nactiVycepy: vi.fn(async () => stav.vycepy),
  nactiRezervace: vi.fn(async () => stav.rezervace),
  ulozRezervaci: vi.fn(async (r: TapReservation) => {
    if (stav.chybaZapisu) {
      if (stav.zalozPriZapisu) stav.rezervace = [...stav.rezervace, stav.zalozPriZapisu];
      return stav.chybaZapisu;
    }
    stav.ulozene.push(r);
    stav.rezervace = [...stav.rezervace.filter((x: any) => x.id !== r.id), r];
    return null;
  }),
}));

vi.mock('./toast', () => ({
  chyba: vi.fn((text: string) => { stav.hlasky.push(text); }),
  varovani: vi.fn((text: string) => { stav.varovani.push(text); }),
}));

import { autoReserveTapIfNeeded, jeVycepVolny, propojRezervaciSObjednavkou } from './tapReservations';

const vycep = (id: string, typ = 'jednokohout'): TapEquipment => ({ id, name: `Výčep ${id}`, tap_type: typ, status: 'clean' });
const rez = (id: string, tap: string, od: string, doDne: string, patch: Partial<TapReservation> = {}): TapReservation => ({
  id, tap_id: tap, tap_name: `Výčep ${tap}`, date_from: od, date_to: doDne, customer_name: 'Někdo', ...patch,
});

beforeEach(() => {
  stav.vycepy = [vycep('a'), vycep('b', 'dvojkohout')];
  stav.rezervace = [];
  stav.ulozene = [];
  stav.chybaZapisu = null;
  stav.hlasky = [];
  stav.varovani = [];
  stav.zalozPriZapisu = null;
});

describe('jeVycepVolny — překryv rozsahů, ne jen krajní dny', () => {
  const rezervace = [rez('r1', 'a', '2026-11-05', '2026-11-06')];

  it('rezervace uprostřed zájmového rozsahu blokuje (4.–7. vs 5.–6.) — dřív prošlo', () => {
    expect(jeVycepVolny('a', '2026-11-04', '2026-11-07', rezervace)).toBe(false);
  });

  it('překryv jen jedním dnem blokuje (od i do)', () => {
    expect(jeVycepVolny('a', '2026-11-06', '2026-11-08', rezervace)).toBe(false);
    expect(jeVycepVolny('a', '2026-11-03', '2026-11-05', rezervace)).toBe(false);
  });

  it('den před a den po je volný', () => {
    expect(jeVycepVolny('a', '2026-11-03', '2026-11-04', rezervace)).toBe(true);
    expect(jeVycepVolny('a', '2026-11-07', '2026-11-09', rezervace)).toBe(true);
  });

  it('jiný výčep je volný', () => {
    expect(jeVycepVolny('b', '2026-11-05', '2026-11-06', rezervace)).toBe(true);
  });

  it('vlastní rezervace (krome) se nepočítá — úprava nesmí blokovat sama sebe', () => {
    expect(jeVycepVolny('a', '2026-11-05', '2026-11-06', rezervace, 'r1')).toBe(true);
    expect(jeVycepVolny('a', '2026-11-05', '2026-11-06', rezervace, 'jina')).toBe(false);
  });

  it('jednodenní rezervace (od = do) blokuje právě ten den', () => {
    const jedenDen = [rez('r2', 'a', '2026-11-12', '2026-11-12')];
    expect(jeVycepVolny('a', '2026-11-12', '2026-11-12', jedenDen)).toBe(false);
    expect(jeVycepVolny('a', '2026-11-13', '2026-11-13', jedenDen)).toBe(true);
  });
});

describe('autoReserveTapIfNeeded — chyba zápisu se ohlásí', () => {
  it('zápis selhal (třeba chybí právo na Výčepy) → hláška, ne ticho', async () => {
    stav.chybaZapisu = 'permission denied for table vycepy_rezervace';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await autoReserveTapIfNeeded('Hospoda Test', '2026-11-12', '+ výčep', 'o1');
    expect(stav.ulozene).toHaveLength(0);
    expect(stav.hlasky).toHaveLength(1);
    expect(stav.hlasky[0]).toContain('permission denied');
  });

  it('druhé uložení téže objednávky vteřinu po prvním (zamítl unikátní index) hlášku nevyvolá', async () => {
    stav.chybaZapisu = 'duplicate key value violates unique constraint "vycepy_rezervace_order_unique_idx"';
    stav.zalozPriZapisu = rez('r-prvni', 'a', '2026-11-12', '2026-11-12', { order_id: 'o1' });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await autoReserveTapIfNeeded('Hospoda Test', '2026-11-12', '+ výčep', 'o1');
    expect(stav.hlasky).toEqual([]);
  });

  it('povedený zápis hlášku nevyvolá', async () => {
    await autoReserveTapIfNeeded('Hospoda Test', '2026-11-12', '+ výčep', 'o1');
    expect(stav.ulozene).toHaveLength(1);
    expect(stav.hlasky).toEqual([]);
  });

  it('bez založených výčepů se nic nerezervuje, ale řekne se to (poznámka „+ výčep“ jinak vypadá vyřízená)', async () => {
    stav.vycepy = [];
    await autoReserveTapIfNeeded('Hospoda Test', '2026-11-12', '+ výčep', 'o1');
    expect(stav.ulozene).toHaveLength(0);
    expect(stav.varovani).toHaveLength(1);
    expect(stav.varovani[0]).toMatch(/nejsou žádné výčepy/);
    expect(stav.hlasky).toEqual([]);
  });

  it('poznámka bez zmínky o výčepu nic neohlásí ani bez výčepů', async () => {
    stav.vycepy = [];
    await autoReserveTapIfNeeded('Hospoda Test', '2026-11-12', '2x50 12sv', 'o1');
    expect(stav.varovani).toEqual([]);
  });

  it('výčep v rozsahu cizí vícedenní rezervace se přeskočí (překryv, ne shoda prvního dne)', async () => {
    stav.rezervace = [rez('r0', 'a', '2026-11-10', '2026-11-14')];
    await autoReserveTapIfNeeded('Hospoda Test', '2026-11-12', '+ výčep', 'o1');
    expect(stav.ulozene[0].tap_id).toBe('b');
  });
});

describe('propojRezervaciSObjednavkou — vazba se zapíše do databáze', () => {
  it('rezervace bez objednávky dostane order_id, ostatní pole zůstanou', async () => {
    stav.rezervace = [rez('r1', 'a', '2026-11-12', '2026-11-14', { phone: '777 123 456', deposit_czk: 2000, note: 'kauce vybrána' })];
    expect(await propojRezervaciSObjednavkou('r1', 'objednavka-7')).toBeNull();
    expect(stav.ulozene).toHaveLength(1);
    expect(stav.ulozene[0]).toMatchObject({
      id: 'r1', order_id: 'objednavka-7', phone: '777 123 456', deposit_czk: 2000,
      date_from: '2026-11-12', date_to: '2026-11-14', note: 'kauce vybrána',
    });
  });

  it('už propojená rezervace se znovu nezapisuje', async () => {
    stav.rezervace = [rez('r1', 'a', '2026-11-12', '2026-11-12', { order_id: 'objednavka-7' })];
    expect(await propojRezervaciSObjednavkou('r1', 'objednavka-7')).toBeNull();
    expect(stav.ulozene).toHaveLength(0);
  });

  it('rezervace, která mezitím zmizela, vrátí srozumitelnou chybu', async () => {
    expect(await propojRezervaciSObjednavkou('neexistuje', 'objednavka-7')).toMatch(/neexistuje/);
  });

  it('chyba databáze se vrátí volajícímu (ten ji ohlásí)', async () => {
    stav.rezervace = [rez('r1', 'a', '2026-11-12', '2026-11-12')];
    stav.chybaZapisu = 'permission denied';
    expect(await propojRezervaciSObjednavkou('r1', 'objednavka-7')).toBe('permission denied');
  });
});
