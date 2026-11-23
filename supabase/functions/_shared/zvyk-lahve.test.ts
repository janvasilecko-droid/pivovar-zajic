// Jakou lahev odběratel bere (0,33 / 0,5 l) — podle jeho posledních objednávek.
// 9. 11. 2026 se Lužci „5 beden světlého a 3 tmavého" zapsalo jako 0,5 l, i když
// bere třetinky; bedna bez udané velikosti se četla všem stejně.
import { describe, it, expect, vi } from 'vitest';
import { zvykLahve, nactiZvykLahve, DNU_ZPET_LAHVE } from './zvyk-lahve';

const o = (datum: string, ...objemy: number[]) => ({ datum, objemy });

describe('zvykLahve — poslední objednávky s lahvemi', () => {
  it('samé třetinky → 0,33 l', () => {
    expect(zvykLahve([o('2026-11-10', 0.33, 0.33), o('2026-11-03', 0.33), o('2026-10-27', 0.33)])).toBe(0.33);
  });

  it('samé půllitry → 0,5 l', () => {
    expect(zvykLahve([o('2026-11-09', 0.5), o('2026-10-12', 0.5, 0.5)])).toBe(0.5);
  });

  it('Lužec: půllitry ze srpna zvyk nezmění — rozhodují tři poslední objednávky', () => {
    expect(zvykLahve([
      o('2026-08-10', 0.5), o('2026-08-16', 0.5), o('2026-08-31', 0.33, 0.33),
      o('2026-09-23', 0.33), o('2026-10-06', 0.33), o('2026-10-27', 0.33), o('2026-11-10', 0.33, 0.33),
    ])).toBe(0.33);
  });

  it('na pořadí řádků nezáleží, jen na datu', () => {
    expect(zvykLahve([o('2026-10-27', 0.33), o('2026-08-10', 0.5), o('2026-11-10', 0.33), o('2026-11-03', 0.33)])).toBe(0.33);
  });

  it('smíšený odběr v posledních třech objednávkách nerozhodne nic', () => {
    expect(zvykLahve([o('2026-11-10', 0.33), o('2026-11-03', 0.5), o('2026-10-27', 0.33)])).toBeNull();
    // obě velikosti v jedné objednávce
    expect(zvykLahve([o('2026-11-10', 0.33, 0.5), o('2026-11-03', 0.33)])).toBeNull();
  });

  it('jedna objednávka zvyk není; žádná taky ne', () => {
    expect(zvykLahve([o('2026-11-10', 0.33)])).toBeNull();
    expect(zvykLahve([])).toBeNull();
  });

  it('objednávky bez skleněných lahví (sudy, petky) se nepočítají', () => {
    expect(zvykLahve([o('2026-11-12', 30, 50), o('2026-11-11', 1.5), o('2026-11-10', 0.33), o('2026-11-03', 0.33)])).toBe(0.33);
    expect(zvykLahve([o('2026-11-12', 30, 50), o('2026-11-10', 0.33)])).toBeNull();
  });
});

const PACKAGES = [
  { id: 'p-keg30', volume_l: 30 },
  { id: 'p-lahev05', volume_l: 0.5 },
  { id: 'p-lahev033', volume_l: 0.33 },
];

/** Napodobený dotaz: zapíše si filtry a vrátí zadané řádky. */
function napodobenaDb(radky: unknown[] | Error) {
  const volani: [string, ...unknown[]][] = [];
  const q: Record<string, any> = {};
  for (const m of ['select', 'in', 'gte', 'lte', 'neq', 'eq']) q[m] = (...a: unknown[]) => { volani.push([m, ...a]); return q; };
  q.limit = (n: number) => {
    volani.push(['limit', n]);
    return radky instanceof Error ? Promise.reject(radky) : Promise.resolve({ data: radky, error: null });
  };
  const from = vi.fn((tabulka: string) => { volani.push(['from', tabulka]); return q; });
  return { supabase: { from }, volani };
}
const radek = (objednavka: string, datum: string, package_id: string) => ({ package_id, orders: { id: objednavka, order_date: datum } });

describe('nactiZvykLahve — dotaz na objednávky odběratele', () => {
  const KDY = '2026-11-09T07:42:10.000Z';

  it('ptá se na lahve odběratele do dne zprávy, půl roku zpět, bez stornovaných', async () => {
    const { supabase, volani } = napodobenaDb([
      radek('o1', '2026-11-03', 'p-lahev033'), radek('o1', '2026-11-03', 'p-lahev033'),
      radek('o2', '2026-10-27', 'p-lahev033'), radek('o3', '2026-10-06', 'p-lahev033'),
    ]);
    const zvyk = await nactiZvykLahve(supabase, { placeId: 'm-luzec', placeName: 'Lužec', kdy: KDY, packages: PACKAGES });
    expect(zvyk).toBe(0.33);
    expect(volani).toContainEqual(['from', 'order_items']);
    expect(volani).toContainEqual(['in', 'package_id', ['p-lahev05', 'p-lahev033']]);
    expect(volani).toContainEqual(['lte', 'orders.order_date', '2026-11-09']);
    const odDne = new Date(Date.parse(KDY) - DNU_ZPET_LAHVE * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(volani).toContainEqual(['gte', 'orders.order_date', odDne]);
    expect(volani).toContainEqual(['neq', 'orders.status', 'storno']);
    expect(volani).toContainEqual(['eq', 'orders.place_id', 'm-luzec']);
  });

  it('řádky téže objednávky se sečtou do jedné — dva řádky nejsou dvě objednávky', async () => {
    const { supabase } = napodobenaDb([radek('o1', '2026-11-03', 'p-lahev033'), radek('o1', '2026-11-03', 'p-lahev033')]);
    expect(await nactiZvykLahve(supabase, { placeId: 'm1', placeName: null, kdy: KDY, packages: PACKAGES })).toBeNull();
  });

  it('smíšený odběr → null', async () => {
    const { supabase } = napodobenaDb([radek('o1', '2026-11-03', 'p-lahev033'), radek('o2', '2026-10-27', 'p-lahev05')]);
    expect(await nactiZvykLahve(supabase, { placeId: 'm1', placeName: null, kdy: KDY, packages: PACKAGES })).toBeNull();
  });

  it('odběratel jen jménem (není v katalogu) → hledá se podle jména', async () => {
    const { supabase, volani } = napodobenaDb([radek('o1', '2026-11-03', 'p-lahev05'), radek('o2', '2026-10-27', 'p-lahev05')]);
    expect(await nactiZvykLahve(supabase, { placeId: null, placeName: ' Hospoda U Dubu ', kdy: KDY, packages: PACKAGES })).toBe(0.5);
    expect(volani).toContainEqual(['eq', 'orders.place_name', 'Hospoda U Dubu']);
  });

  it('bez odběratele, bez lahví v katalogu nebo s nesmyslným datem se neptá vůbec', async () => {
    const { supabase } = napodobenaDb([]);
    expect(await nactiZvykLahve(supabase, { placeId: null, placeName: '  ', kdy: KDY, packages: PACKAGES })).toBeNull();
    expect(await nactiZvykLahve(supabase, { placeId: 'm1', placeName: null, kdy: KDY, packages: [{ id: 'p-keg30', volume_l: 30 }] })).toBeNull();
    expect(await nactiZvykLahve(supabase, { placeId: 'm1', placeName: null, kdy: 'kdysi', packages: PACKAGES })).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('chyba dotazu čtení neshodí — vrátí null (lahev 0,5 l jako dosud)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { supabase } = napodobenaDb(new Error('síť'));
    expect(await nactiZvykLahve(supabase, { placeId: 'm1', placeName: null, kdy: KDY, packages: PACKAGES })).toBeNull();
    vi.restoreAllMocks();
  });
});
