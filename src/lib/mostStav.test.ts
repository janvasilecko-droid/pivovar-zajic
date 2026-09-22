import { describe, expect, it } from 'vitest';
import { vyhodnotMostStav, TEP_STALE_MINUT } from './mostStav';

const d = (s: string) => new Date(s);

describe('vyhodnotMostStav', () => {
  it('žádný záznam nevaruje — most nikdy neběžel není porucha', () => {
    expect(vyhodnotMostStav(null, d('2026-09-22T10:00:00')).varovat).toBe(false);
    expect(vyhodnotMostStav({ naposledy: null, pripojeno: true, poznamka: null }, d('2026-09-22T10:00:00')).varovat).toBe(false);
  });

  it('poškozené datum nespadne ani nevaruje', () => {
    const v = vyhodnotMostStav({ naposledy: 'nesmysl', pripojeno: true, poznamka: null }, d('2026-09-22T10:00:00'));
    expect(v.varovat).toBe(false);
  });

  it('čerstvý tep a připojeno — v pořádku', () => {
    const v = vyhodnotMostStav(
      { naposledy: '2026-09-22T09:58:00', pripojeno: true, poznamka: 'spojení navázáno' },
      d('2026-09-22T10:00:00'),
    );
    expect(v.varovat).toBe(false);
  });

  it('tep starý přesně na hraně prahu ještě nevaruje', () => {
    const ted = d('2026-09-22T10:00:00');
    const naposledy = new Date(ted.getTime() - TEP_STALE_MINUT * 60000 + 1000).toISOString();
    expect(vyhodnotMostStav({ naposledy, pripojeno: true, poznamka: null }, ted).varovat).toBe(false);
  });

  it('tep starší než práh varuje — most nejspíš spadl nebo usnul', () => {
    const ted = d('2026-09-22T10:00:00');
    const naposledy = new Date(ted.getTime() - (TEP_STALE_MINUT + 1) * 60000).toISOString();
    const v = vyhodnotMostStav({ naposledy, pripojeno: true, poznamka: null }, ted);
    expect(v.varovat).toBe(true);
    expect(v.duvod).toMatch(/tep/i);
  });

  it('tep starý několik hodin ukáže hodiny i minuty', () => {
    const ted = d('2026-09-22T10:00:00');
    const naposledy = new Date(ted.getTime() - (2 * 60 + 15) * 60000).toISOString();
    const v = vyhodnotMostStav({ naposledy, pripojeno: true, poznamka: null }, ted);
    expect(v.duvod).toContain('2 h 15 min');
  });

  it('čerstvý tep, ale odpojeno (odhlášeno z WhatsAppu) — varuje', () => {
    const v = vyhodnotMostStav(
      { naposledy: '2026-09-22T09:58:00', pripojeno: false, poznamka: 'odhlášeno ve WhatsAppu' },
      d('2026-09-22T10:00:00'),
    );
    expect(v.varovat).toBe(true);
    expect(v.duvod).toBe('odhlášeno ve WhatsAppu');
  });

  it('odpojeno bez poznámky dostane výchozí radu s odkazem na QR', () => {
    const v = vyhodnotMostStav(
      { naposledy: '2026-09-22T09:58:00', pripojeno: false, poznamka: null },
      d('2026-09-22T10:00:00'),
    );
    expect(v.varovat).toBe(true);
    expect(v.duvod).toMatch(/\/qr/);
  });

  it('připojeno, ale most sám hlásí ztracené spárování ("hluchá" session) — varuje', () => {
    const v = vyhodnotMostStav(
      {
        naposledy: '2026-09-22T09:58:00',
        pripojeno: true,
        poznamka: 'připojeno, ale 4 h nic nepřišlo — nejspíš ztracené spárování, načti QR znovu',
      },
      d('2026-09-22T10:00:00'),
    );
    expect(v.varovat).toBe(true);
    expect(v.duvod).toContain('ztracené spárování');
  });

  it('připojeno s běžnou poznámkou ("spojení navázáno") nevaruje', () => {
    const v = vyhodnotMostStav(
      { naposledy: '2026-09-22T09:58:00', pripojeno: true, poznamka: 'spojení navázáno' },
      d('2026-09-22T10:00:00'),
    );
    expect(v.varovat).toBe(false);
  });
});
