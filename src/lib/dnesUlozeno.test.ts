import { describe, it, expect } from 'vitest';
import { davkyPivaVDni, dnesLahve, dnesPodleObalu, objemObalu } from './dnesUlozeno';
import type { EntryRow } from './supabase';

const obaly = [
  { id: 'b1', label: '1L PET', volume_l: 1 },
  { id: 'b15', label: 'PET 1.5', volume_l: 1.5 },
  { id: 'k50', label: 'KEG 50', volume_l: 50 },
  { id: 'k20', label: 'KEG 20', volume_l: 20 },
];
const DEN = '2026-10-29';

describe('dnes uloženo', () => {
  it('objem obalu s čárkou', () => {
    expect(objemObalu(obaly[1])).toBe('1,5 l');
    expect(objemObalu(undefined)).toBe('obal');
  });

  it('KEG a fasování: jedna položka na zápis, nejnovější nahoře, jen dnešek', () => {
    const rows = [
      { id: '1', entry_date: DEN, created_at: '2026-10-29T07:00:00Z', beer_id: 'sv12', package_id: 'k50', quantity: 6 },
      { id: '2', entry_date: DEN, created_at: '2026-10-29T09:30:00Z', beer_id: 'sv12', package_id: 'k20', quantity: 2 },
      { id: '3', entry_date: '2026-10-28', created_at: '2026-10-28T09:30:00Z', beer_id: 'sv12', package_id: 'k20', quantity: 9 },
      { id: '4', entry_date: DEN, created_at: '2026-10-29T10:00:00Z', beer_id: 'sv12', package_id: 'k20', quantity: 0 },
    ];
    const out = dnesPodleObalu(rows, DEN, obaly);
    expect(out.map((o) => o.text)).toEqual(['2× 20 l', '6× 50 l']);
  });

  it('lahve: řádky jedné dávky se slučují a nesou sudy', () => {
    const t = '2026-10-29T08:40:00Z';
    const rows = [
      { id: '1', entry_date: DEN, created_at: t, beer_id: 'sv12', package_id: 'b1', quantity: 137, kegs_used: 3, kegs_used_package_id: 'k50' },
      { id: '2', entry_date: DEN, created_at: t, beer_id: 'sv12', package_id: 'b15', quantity: 20, kegs_used: 3, kegs_used_package_id: 'k50' },
    ];
    const out = dnesLahve(rows, DEN, obaly);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('137× 1 l, 20× 1,5 l ze 3× sud 50 l');
  });

  it('lahve ze dvou velikostí sudů', () => {
    const t = '2026-10-29T08:40:00Z';
    const rows = [
      { id: '1', entry_date: DEN, created_at: t, beer_id: 'd10', package_id: 'b1', quantity: 80, kegs_used: 1, kegs_used_package_id: 'k50' },
      { id: '2', entry_date: DEN, created_at: t, beer_id: 'd10', package_id: 'b1', quantity: 20, kegs_used: 1, kegs_used_package_id: 'k20' },
    ];
    expect(dnesLahve(rows, DEN, obaly)[0].text).toBe('100× 1 l ze 1× sud 50 l + 1× sud 20 l');
  });

  it('lahve bez sudů to řekne', () => {
    const rows = [{ id: '1', entry_date: DEN, created_at: '2026-10-29T08:40:00Z', beer_id: 'sv12', package_id: 'b1', quantity: 10, kegs_used: null, kegs_used_package_id: null }];
    expect(dnesLahve(rows, DEN, obaly)[0].text).toBe('10× 1 l · bez sudů');
  });
});

describe('davkyPivaVDni — uložené stáčení piva k úpravě pod zápisem', () => {
  const radek = (o: Record<string, unknown>) => ({
    id: 'x', entry_date: DEN, created_at: '2026-10-29T08:40:00Z', beer_id: 'sv12', beer_name: '12° Světlá',
    package_id: 'b1', quantity: 10, kegs_used: 1, kegs_used_package_id: 'k50', ...o,
  }) as unknown as EntryRow;

  it('vybere jen dané pivo a den; nulové a mínusové záznamy (opravy z inventury) vynechá', () => {
    const rows = [
      radek({ id: '1', quantity: 90 }),
      radek({ id: '2', package_id: 'b15', quantity: 20 }),
      radek({ id: '3', beer_id: 'd10', beer_name: 'Desítka' }),
      radek({ id: '4', entry_date: '2026-10-28' }),
      radek({ id: '5', quantity: -4 }),
      radek({ id: '6', quantity: 0 }),
    ];
    const davky = davkyPivaVDni(rows, DEN, 'sv12', obaly);
    expect(davky).toHaveLength(1);
    expect(davky[0].polozky.map((p) => p.zaznam.id).sort()).toEqual(['1', '2']);
    expect(davky[0].celkemKs).toBe(110);
    // 90 × 1 l + 20 × 1,5 l
    expect(davky[0].celkemL).toBe(120);
  });

  it('nemá-li pivo ten den nic uloženého, nevrátí nic (úprava to řekne větou)', () => {
    expect(davkyPivaVDni([radek({ id: '1' })], DEN, 'd10', obaly)).toEqual([]);
    expect(davkyPivaVDni([], DEN, 'sv12', obaly)).toEqual([]);
  });

  it('obal mimo katalog nespadne, jen nemá litry', () => {
    const davky = davkyPivaVDni([radek({ id: '1', package_id: 'smazany', quantity: 5 })], DEN, 'sv12', obaly);
    expect(davky[0].celkemKs).toBe(5);
    expect(davky[0].celkemL).toBe(0);
  });
});
