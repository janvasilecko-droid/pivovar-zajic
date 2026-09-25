import { describe, it, expect, vi, beforeEach } from 'vitest';

// vycepyData.ts (přes které autoReserveTapIfNeeded čte a zapisuje) volá
// skutečný supabase klient — v testu ho nahrazuje malá databáze v paměti,
// se stejným tvarem dotazů jako lib/vycepyData.ts (select().order().order(),
// upsert()). Stav se resetuje v beforeEach, aby si testy nepletly výčepy.
const stav = vi.hoisted(() => ({
  vycepy: [] as any[],
  rezervace: [] as any[],
}));

vi.mock('./supabase', () => ({
  supabase: {
    from: (tabulka: string) => {
      if (tabulka === 'vycepy') {
        return {
          select: () => ({
            order: () => ({
              order: async () => ({ data: stav.vycepy, error: null }),
            }),
          }),
          upsert: async (radek: any) => { stav.vycepy.push(radek); return { error: null }; },
        };
      }
      if (tabulka === 'vycepy_rezervace') {
        return {
          select: () => ({
            order: async () => ({ data: stav.rezervace, error: null }),
          }),
          upsert: async (radek: any) => { stav.rezervace.push(radek); return { error: null }; },
        };
      }
      throw new Error(`neočekávaná tabulka v testu: ${tabulka}`);
    },
  },
}));

import { autoReserveTapIfNeeded, detectTapType, isTapMentioned } from './tapReservations';

function pridejVycep(id: string, nazev: string, typ: string) {
  stav.vycepy.push({ id, nazev, typ, stav: 'clean', kohouty_rozebrane: false, poradi: stav.vycepy.length });
}

beforeEach(() => {
  stav.vycepy = [];
  stav.rezervace = [];
});

describe('detectTapType a isTapMentioned — rozpoznání typu výčepu z poznámky', () => {
  it('pozná "jednokohout"', () => {
    expect(isTapMentioned('prosím jednokohout k tomu')).toBe(true);
    expect(detectTapType('prosím jednokohout k tomu')).toBe('jednokohout');
  });

  it('poznámka bez zmínky o výčepu nic nespustí', () => {
    expect(isTapMentioned('12 sudů 50l, doraz do 10h')).toBe(false);
  });
});

describe('autoReserveTapIfNeeded — reprodukce dnešního hlášení (jednokohout v objednávce)', () => {
  it('BEZ založeného výčepu se nerezervuje NIC, ani potichu — přesně dnešní symptom', async () => {
    // Žádný výčep v databázi (prázdná tabulka `vycepy` — stejný stav jako
    // dřív dnes, kdy appka hlásila "Nemáte vytvořené žádné výčepy").
    await autoReserveTapIfNeeded('Hospoda U Dubu', '2026-09-14', 'jednokohout, 2x 30l', 'objednavka-1');
    expect(stav.rezervace).toHaveLength(0);
  });

  it('S založeným výčepem odpovídajícího typu se rezervace založí', async () => {
    pridejVycep('t1', 'Výčep #1', 'jednokohout');
    await autoReserveTapIfNeeded('Hospoda U Dubu', '2026-09-14', 'jednokohout, 2x 30l', 'objednavka-1');
    expect(stav.rezervace).toHaveLength(1);
    expect(stav.rezervace[0].vycep_id).toBe('t1');
    expect(stav.rezervace[0].odberatel).toBe('Hospoda U Dubu');
    expect(stav.rezervace[0].datum_od).toBe('2026-09-14');
    expect(stav.rezervace[0].order_id).toBe('objednavka-1');
  });

  it('když je požadovaný typ obsazený, vezme první VOLNÝ výčep, ne obsazený', async () => {
    pridejVycep('t1', 'Výčep #1', 'jednokohout');
    pridejVycep('t2', 'Výčep #2', 'dvojkohout');
    stav.rezervace.push({
      id: 'r0', vycep_id: 't1', vycep_nazev: 'Výčep #1',
      datum_od: '2026-09-14', datum_do: '2026-09-14', odberatel: 'Jiný zákazník',
    });
    await autoReserveTapIfNeeded('Hospoda U Dubu', '2026-09-14', 'jednokohout prosím', 'objednavka-2');
    const nova = stav.rezervace.find((r) => r.order_id === 'objednavka-2');
    expect(nova).toBeDefined();
    expect(nova.vycep_id).toBe('t2');
  });

  it('poznámka bez zmínky o výčepu žádnou rezervaci nezaloží', async () => {
    pridejVycep('t1', 'Výčep #1', 'jednokohout');
    await autoReserveTapIfNeeded('Hospoda U Dubu', '2026-09-14', '12 sudů 50l', 'objednavka-3');
    expect(stav.rezervace).toHaveLength(0);
  });

  it('tatáž objednávka se nerezervuje dvakrát', async () => {
    pridejVycep('t1', 'Výčep #1', 'jednokohout');
    await autoReserveTapIfNeeded('Hospoda U Dubu', '2026-09-14', 'jednokohout', 'objednavka-4');
    await autoReserveTapIfNeeded('Hospoda U Dubu', '2026-09-14', 'jednokohout', 'objednavka-4');
    expect(stav.rezervace.filter((r) => r.order_id === 'objednavka-4')).toHaveLength(1);
  });
});
