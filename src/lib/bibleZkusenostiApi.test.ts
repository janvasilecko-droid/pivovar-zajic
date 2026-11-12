import { describe, it, expect, vi, beforeEach } from 'vitest';

type Volani = { funkce: string; telo: Record<string, unknown> };
const volani: Volani[] = [];
let odpoved: unknown = null;

vi.mock('./bibleKlient', async (puvodni) => ({
  ...(await puvodni<typeof import('./bibleKlient')>()),
  volejBibli: vi.fn(async (funkce: string, telo: Record<string, unknown>) => {
    volani.push({ funkce, telo });
    return odpoved;
  }),
}));

import {
  DRUHY_ZKUSENOSTI, nactiZkusenosti, nazevUrovne, smazZkusenost, upravZkusenost, zapisZkusenost, type ZkusenostVstup,
} from './bibleZkusenostiApi';
import { DRUHY_ZKUSENOSTI_NAZVY } from '../../bible/supabase/functions/_shared/nastroje';
import { TYPY_ZKUSENOSTI } from '../../bible/supabase/functions/_shared/vstupy';

const ID = '11111111-2222-3333-4444-555555555555';
const VSTUP: ZkusenostVstup = { typ: 'reseni_problemu', nazev: '  Pěnění  ', text: ' Snížit výkon. ', oblasti: ['F'], uroven: 4, zdroj: '  ' };
beforeEach(() => { volani.length = 0; });

describe('zkušenosti sládků přes bible-api', () => {
  it('načte seznam, vadné řádky vynechá', async () => {
    odpoved = { ok: true, data: { zkusenosti: [
      { id: ID, typ: 'postup', nazev: 'N', text: 'T', oblasti: ['F', 7], uroven: 3, zdroj: 'Z', zapsal: 'u1', zapsal_jmeno: 'Honza', created_at: 'a', upraveno_at: 'b' },
      { id: ID, typ: 'neznamy', uroven: 4 },
      { typ: 'postup', uroven: 4 },
    ] } };
    const r = await nactiZkusenosti({ dotaz: ' chmel ', oblast: 'F', nejhorsi: 4 });
    expect(volani[0]).toEqual({ funkce: 'bible-api', telo: { akce: 'zkusenosti', dotaz: 'chmel', oblast: 'F', nejhorsi: 4 } });
    expect(r).toEqual({ stav: 'ok', migrace: true, volne: false, zkusenosti: [
      { id: ID, typ: 'postup', nazev: 'N', text: 'T', oblasti: ['F'], uroven: 3, zdroj: 'Z', zapsal: 'u1', zapsalJmeno: 'Honza', vytvoreno: 'a', upraveno: 'b' },
    ] });
  });

  it('Hledání v knihách se ptá i volně (otázkou v běžné řeči)', async () => {
    odpoved = { ok: true, data: { zkusenosti: [], migrace: true, volne: true } };
    const r = await nactiZkusenosti({ dotaz: 'proč málo pění' }, { volne: true });
    expect(volani[0].telo).toEqual({ akce: 'zkusenosti', dotaz: 'proč málo pění', volne: true });
    expect(r).toMatchObject({ stav: 'ok', volne: true });
  });

  it('bez filtru pošle jen akci (nejhorší úroveň 5 se neposílá)', async () => {
    odpoved = { ok: true, data: { zkusenosti: [], migrace: false } };
    const r = await nactiZkusenosti({ nejhorsi: 5 });
    expect(volani[0].telo).toEqual({ akce: 'zkusenosti' });
    expect(r).toEqual({ stav: 'ok', zkusenosti: [], migrace: false, volne: false });
  });

  it('stará bible-api akci nezná → srozumitelná hláška, ne chyba', async () => {
    odpoved = { ok: false, chyba: { kod: 'neplatny_vstup', zprava: 'Neznámá akce.', status: 400 } };
    expect(await nactiZkusenosti()).toEqual({ stav: 'nenasazeno', zprava: 'Zkušenosti se právě nasazují — zkus to za pár minut.' });
  });

  it('zápis a úprava pošlou oříznutý text, prázdný zdroj vynechají', async () => {
    odpoved = { ok: true, data: { id: ID } };
    expect(await zapisZkusenost(VSTUP)).toEqual({ stav: 'ok' });
    expect(volani[0].telo).toEqual({ akce: 'zkusenost_zapsat', zkusenost: { typ: 'reseni_problemu', nazev: 'Pěnění', text: 'Snížit výkon.', oblasti: ['F'], uroven: 4 } });
    await upravZkusenost(ID, { ...VSTUP, zdroj: 'rozhovor' });
    expect(volani[1].telo).toEqual({ akce: 'zkusenost_upravit', id: ID, zkusenost: { typ: 'reseni_problemu', nazev: 'Pěnění', text: 'Snížit výkon.', oblasti: ['F'], uroven: 4, zdroj: 'rozhovor' } });
  });

  it('smazání a chyba práva se vrátí s českou hláškou', async () => {
    odpoved = { ok: true, data: { ok: true } };
    expect(await smazZkusenost(ID)).toEqual({ stav: 'ok' });
    expect(volani[0].telo).toEqual({ akce: 'zkusenost_smazat', id: ID });
    odpoved = { ok: false, chyba: { kod: 'zakazano', zprava: 'Smazat smíš jen svoje zkušenosti.', status: 403 } };
    expect(await smazZkusenost(ID)).toEqual({ stav: 'chyba', zprava: 'Smazat smíš jen svoje zkušenosti.' });
  });

  it('názvy úrovní', () => {
    expect(nazevUrovne(4)).toBe('Zkušenost jednoho sládka');
    expect(nazevUrovne(9)).toBe('Úroveň 9');
  });

  it('druhy zkušeností: appka, kontrola vstupu i konektor (zapis_zkusenost) znají stejné a stejně je pojmenují', () => {
    expect(DRUHY_ZKUSENOSTI.map((d) => d.id).sort()).toEqual([...TYPY_ZKUSENOSTI].sort());
    expect(Object.fromEntries(DRUHY_ZKUSENOSTI.map((d) => [d.id, d.nazev]))).toEqual(DRUHY_ZKUSENOSTI_NAZVY);
  });
});
