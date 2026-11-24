// Načtení stavu sklepa pro AI sládka: jen čtení, tanky jsou podmínka, ostatní části jen chybí.
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Odpoved = { data: unknown; error: unknown };
const odpovedi: Record<string, Odpoved | Error> = {};
const dotazy: { tabulka: string; volani: [string, ...unknown[]][] }[] = [];

/** Řetězitelný dotaz jako supabase-js: každé volání se zapíše, `await` vrátí připravenou odpověď. */
function dotaz(tabulka: string) {
  const zaznam = { tabulka, volani: [] as [string, ...unknown[]][] };
  dotazy.push(zaznam);
  const q: Record<string, unknown> = {};
  for (const metoda of ['select', 'not', 'gte', 'order', 'limit']) {
    q[metoda] = (...a: unknown[]) => { zaznam.volani.push([metoda, ...a]); return q; };
  }
  q.then = (ok: (v: Odpoved) => unknown, ko: (e: unknown) => unknown) => {
    const o = odpovedi[tabulka] ?? { data: [], error: null };
    return (o instanceof Error ? Promise.reject(o) : Promise.resolve(o)).then(ok, ko);
  };
  return q;
}
vi.mock('./supabase', () => ({ supabase: { from: (t: string) => dotaz(t) } }));

import { nactiProvoz } from './bibleProvozApi';

const TED = new Date('2026-11-24T09:45:00Z'); // v Praze 10:45
const TANKY = [{ id: 't7', label: 'Tank 7', status: 'active', current_beer_name: '12° Světlá', current_volume_l: 3800, capacity_l: 5000, started_at: '2026-11-18T09:00:00Z' }];

beforeEach(() => {
  for (const k of Object.keys(odpovedi)) delete odpovedi[k];
  dotazy.length = 0;
  odpovedi.cellar_tanks = { data: TANKY, error: null };
});

const volani = (tabulka: string, metoda: string) => dotazy.find((d) => d.tabulka === tabulka)?.volani.filter((v) => v[0] === metoda);

describe('stav sklepa pro AI sládka', () => {
  it('složí text z tanků a pražský čas načtení; čte jen čtyři tabulky Sklepu', async () => {
    const r = await nactiProvoz(TED);
    expect(r).toMatchObject({ stav: 'ok', cas: '10:45' });
    if (r.stav !== 'ok') throw new Error('očekáván stav ok');
    expect(r.text).toContain('Stav sklepa k 24. 11. 2026 10:45');
    expect(r.text).toContain('- Tank 7: 12° Světlá, 3 800 l z 5 000 l, aktivní, od 18. 11. (6 dní)');
    expect(dotazy.map((d) => d.tabulka).sort()).toEqual(['cellar_tank_cycles', 'cellar_tanks', 'cellar_transfers', 'sanitation_logs']);
  });

  it('jen čtení: žádný zápis (insert, update, delete, upsert, rpc) se nevolá', async () => {
    await nactiProvoz(TED);
    const metody = new Set(dotazy.flatMap((d) => d.volani.map((v) => v[0])));
    expect([...metody].every((m) => ['select', 'not', 'gte', 'order', 'limit'].includes(m))).toBe(true);
  });

  it('přečerpání jen za posledních 14 dní, cykly nejvýš 5, sanitace jen tanků', async () => {
    await nactiProvoz(TED);
    expect(volani('cellar_transfers', 'gte')).toEqual([['gte', 'transfer_date', '2026-11-10']]);
    expect(volani('cellar_tank_cycles', 'limit')).toEqual([['limit', 5]]);
    expect(volani('sanitation_logs', 'not')).toEqual([['not', 'tank_id', 'is', null]]);
  });

  it('ostatní části se přidají (přečerpání, cykly, sanitace)', async () => {
    odpovedi.cellar_transfers = { data: [{ transfer_date: '2026-11-20', from_tank_id: 't7', to_tank_id: null, beer_name: 'Jantar', volume_l: 1000, loss_l: 0 }], error: null };
    odpovedi.cellar_tank_cycles = { data: [{ tank_label: 'Tank 7', beer_name: 'Jantar', initial_volume_l: 4000, kegged_volume_l: 3900, loss_l: 100, ended_at: '2026-11-12T10:00:00Z', duration_hours: 240 }], error: null };
    odpovedi.sanitation_logs = { data: [{ tank_id: 't7', method: 'louh', method_label: 'Louh', created_at: '2026-11-10T07:00:00Z' }], error: null };
    const r = await nactiProvoz(TED);
    if (r.stav !== 'ok') throw new Error('očekáván stav ok');
    expect(r.text).toContain('poslední sanitace tanku 10. 11. (Louh)');
    expect(r.text).toContain('- 20. 11.: Tank 7 → mimo tank, Jantar, 1 000 l');
    expect(r.text).toContain('- Tank 7: Jantar, 4 000 l → stočeno 3 900 l, ztráta 100 l (2,5 %), 10 dní, uzavřeno 12. 11.');
  });

  it('chyba přečerpání, cyklů nebo sanitace: stav sklepa se přiloží i tak, jen bez té části', async () => {
    odpovedi.cellar_transfers = { data: null, error: { message: 'x' } };
    odpovedi.cellar_tank_cycles = new Error('síť');
    odpovedi.sanitation_logs = { data: 'nesmysl', error: null };
    const r = await nactiProvoz(TED);
    if (r.stav !== 'ok') throw new Error(`očekáván stav ok, je ${r.stav}`);
    expect(r.text).toContain('Tank 7');
    expect(r.text).not.toMatch(/Přečerpání|Poslední uzavřené cykly|sanitace tanku/);
  });

  it('chyba tanků (odpověď i výjimka) = nic se nepřikládá', async () => {
    odpovedi.cellar_tanks = { data: null, error: { message: 'RLS' } };
    expect(await nactiProvoz(TED)).toEqual({ stav: 'chyba' });
    odpovedi.cellar_tanks = new Error('síť');
    expect(await nactiProvoz(TED)).toEqual({ stav: 'chyba' });
    odpovedi.cellar_tanks = { data: 'nesmysl', error: null };
    expect(await nactiProvoz(TED)).toEqual({ stav: 'chyba' });
  });

  it('Sklep bez tanků = prázdný stav (není co přikládat)', async () => {
    odpovedi.cellar_tanks = { data: [], error: null };
    expect(await nactiProvoz(TED)).toEqual({ stav: 'prazdny' });
  });
});
