import { describe, it, expect } from 'vitest';
import { popisZmenyPolozky, type ZmenaPolozky } from './objednavkaAudit';

const zaklad = { id: 'a1', changed_by: 'sladek@zajic.cz', changed_at: '2026-09-09T10:00:00Z' };

describe('popisZmenyPolozky', () => {
  it('přidaný řádek popíše pivo, obal a množství', () => {
    const z: ZmenaPolozky = {
      ...zaklad, action: 'insert', old_data: null,
      new_data: { beer_name: '12° Světlá', package_label: 'KEG 50l', quantity: 5 },
    };
    expect(popisZmenyPolozky(z)).toBe('Přidán řádek: 12° Světlá KEG 50l × 5 ks');
  });

  it('smazaný řádek popíše, co v něm bylo — ne "smazáno" bez detailu', () => {
    const z: ZmenaPolozky = {
      ...zaklad, action: 'delete',
      old_data: { beer_name: '10° Desítka', package_label: 'Lahve 0,5l', quantity: 40 },
      new_data: null,
    };
    expect(popisZmenyPolozky(z)).toBe('Smazán řádek: 10° Desítka Lahve 0,5l × 40 ks');
  });

  it('úprava množství ukáže staré i nové číslo, ne celý řádek znovu', () => {
    const z: ZmenaPolozky = {
      ...zaklad, action: 'update',
      old_data: { beer_name: 'Jantar', package_label: 'KEG 30l', quantity: 2 },
      new_data: { beer_name: 'Jantar', package_label: 'KEG 30l', quantity: 4 },
    };
    expect(popisZmenyPolozky(z)).toContain('množství 2 → 4');
  });

  it('úprava piva se pozná odděleně od úpravy množství', () => {
    const z: ZmenaPolozky = {
      ...zaklad, action: 'update',
      old_data: { beer_name: '11° Světlá', package_label: 'KEG 50l', quantity: 3 },
      new_data: { beer_name: '12° Světlá', package_label: 'KEG 50l', quantity: 3 },
    };
    const popis = popisZmenyPolozky(z);
    expect(popis).toContain('pivo 11° Světlá → 12° Světlá');
    expect(popis).not.toContain('množství');
  });

  it('chybějící data se nezhroutí na "undefined" v textu', () => {
    const z: ZmenaPolozky = { ...zaklad, action: 'insert', old_data: null, new_data: {} };
    expect(popisZmenyPolozky(z)).toBe('Přidán řádek: ?');
  });
});
