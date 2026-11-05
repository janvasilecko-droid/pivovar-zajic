// Offline kopie rezervací v prohlížeči a zápis do databáze.
//
// Seznam objednávek ukazuje fialový štítek s výčepem (OrderCard →
// getTapNameForOrder) a čte ho SYNCHRONNĚ z kopie v localStorage. Kopii ale
// přepisovalo jen načtení celého seznamu z databáze — rezervace uložená
// ve chvíli, kdy objednávka vznikla (autoReserveTapIfNeeded, okno rezervace),
// tak ve štítku chyběla, dokud někdo neotevřel Výčepy nebo nerestartoval appku.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ chyba: null as string | null, zapsano: [] as any[], smazano: [] as string[] }));

vi.mock('./supabase', () => ({
  supabase: {
    from: (tabulka: string) => {
      if (tabulka !== 'vycepy_rezervace') throw new Error(`neočekávaná tabulka v testu: ${tabulka}`);
      return {
        upsert: async (radek: any) => {
          if (db.chyba) return { error: { message: db.chyba } };
          db.zapsano.push(radek);
          return { error: null };
        },
        delete: () => ({
          eq: async (_sloupec: string, id: string) => {
            if (db.chyba) return { error: { message: db.chyba } };
            db.smazano.push(id);
            return { error: null };
          },
        }),
      };
    },
  },
}));

import { KLIC_REZERVACE, smazRezervaci, ulozRezervaci } from './vycepyData';
import type { TapReservation } from '../screens/VycepyScreen';

const rezervace = (id: string, patch: Partial<TapReservation> = {}): TapReservation => ({
  id,
  tap_id: '11111111-1111-4111-8111-111111111111',
  tap_name: 'Výčep A',
  date_from: '2026-11-12',
  date_to: '2026-11-12',
  customer_name: 'Hospoda Test',
  order_id: `objednavka-${id}`,
  ...patch,
});

const kopie = (): TapReservation[] => JSON.parse(localStorage.getItem(KLIC_REZERVACE) ?? '[]');

beforeEach(() => {
  db.chyba = null;
  db.zapsano = [];
  db.smazano = [];
  localStorage.clear();
});

describe('ulozRezervaci — offline kopie drží krok s databází', () => {
  it('uložená rezervace je hned v kopii (štítek u objednávky ji uvidí)', async () => {
    expect(await ulozRezervaci(rezervace('r1'))).toBeNull();
    expect(db.zapsano).toHaveLength(1);
    expect(kopie().map((r) => r.id)).toEqual(['r1']);
    expect(kopie()[0].order_id).toBe('objednavka-r1');
  });

  it('znovu uložená rezervace nahradí starou, nezdvojí se', async () => {
    await ulozRezervaci(rezervace('r1'));
    await ulozRezervaci(rezervace('r2'));
    await ulozRezervaci(rezervace('r1', { customer_name: 'Jiný odběratel', tap_name: 'Výčep B' }));
    expect(kopie().map((r) => r.id).sort()).toEqual(['r1', 'r2']);
    expect(kopie().find((r) => r.id === 'r1')?.customer_name).toBe('Jiný odběratel');
  });

  it('když databáze zápis odmítne, kopie se nezmění a vrátí se text chyby', async () => {
    await ulozRezervaci(rezervace('r1'));
    db.chyba = 'permission denied';
    expect(await ulozRezervaci(rezervace('r2'))).toBe('permission denied');
    expect(kopie().map((r) => r.id)).toEqual(['r1']);
  });
});

describe('smazRezervaci — i z kopie', () => {
  it('smazaná rezervace zmizí z databáze i z kopie, ostatní zůstanou', async () => {
    await ulozRezervaci(rezervace('r1'));
    await ulozRezervaci(rezervace('r2'));
    expect(await smazRezervaci('r1')).toBeNull();
    expect(db.smazano).toEqual(['r1']);
    expect(kopie().map((r) => r.id)).toEqual(['r2']);
  });

  it('když databáze smazání odmítne, rezervace v kopii zůstane', async () => {
    await ulozRezervaci(rezervace('r1'));
    db.chyba = 'permission denied';
    expect(await smazRezervaci('r1')).toBe('permission denied');
    expect(kopie().map((r) => r.id)).toEqual(['r1']);
  });
});
