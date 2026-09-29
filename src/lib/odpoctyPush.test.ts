// Z provozu 29. 9. 2026: „ten odpočet ať jede, i když není aplikace aktivní".
import { describe, it, expect } from 'vitest';
import { spoctiZmenyOdpoctu } from './odpoctyPush';

const t = (id: string, targetAt: number | null, notifiedAt: number | null = null) => ({ id, label: id, durationMs: 120000, targetAt, notifiedAt });

describe('odpočty na server (push se zhasnutým displejem)', () => {
  it('běžící odpočet se zapíše s koncem', () => {
    const z = spoctiZmenyOdpoctu([t('co2', 5000)], new Map(), 'u1', 1000);
    expect(z.zapsat).toEqual([{ id: 'u1:co2', nazev: 'co2', konec: 5000 }]);
    expect(z.smazat).toEqual([]);
  });
  it('stejný konec už na serveru je → nic', () => {
    const z = spoctiZmenyOdpoctu([t('co2', 5000)], new Map([['u1:co2', 5000]]), 'u1', 1000);
    expect(z).toEqual({ zapsat: [], smazat: [] });
  });
  it('zastavený, pozastavený, ohlášený nebo doběhlý se smaže', () => {
    const stav = new Map([['u1:a', 5000], ['u1:b', 5000], ['u1:c', 5000], ['u1:d', 500]]);
    const z = spoctiZmenyOdpoctu([t('b', null), t('c', 5000, 900), t('d', 500)], stav, 'u1', 1000);
    expect(z.zapsat).toEqual([]);
    expect(z.smazat.sort()).toEqual(['u1:a', 'u1:b', 'u1:c', 'u1:d']);
  });
  it('appka v pozadí: doběhlý odpočet nechá serveru (push), zastavený před koncem smaže', () => {
    const stav = new Map([['u1:dobehl', 500], ['u1:zastaven', 5000]]);
    const z = spoctiZmenyOdpoctu([t('dobehl', 500, 900)], stav, 'u1', 1000, false);
    expect(z.smazat).toEqual(['u1:zastaven']);
  });
  it('restart odpočtu přepíše konec', () => {
    const z = spoctiZmenyOdpoctu([t('co2', 9000)], new Map([['u1:co2', 5000]]), 'u1', 1000);
    expect(z.zapsat[0].konec).toBe(9000);
  });
});
