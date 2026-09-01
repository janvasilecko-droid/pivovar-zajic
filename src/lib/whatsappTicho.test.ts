import { describe, expect, it } from 'vitest';
import { pracovniHodiny, tichoWhatsApp, TICHO_HODIN } from './whatsappTicho';

// Data z ostrého provozu, ať práh nesedí jen v teorii:
// pá 28. 8. 2026 12:01 → po 31. 8. 08:12 byla normální víkendová pauza,
// po 31. 8. 13:21 → út 1. 9. 11:46 bylo ticho, kterého si všiml uživatel.
const d = (s: string) => new Date(s);

describe('pracovniHodiny', () => {
  it('víkend se nepočítá', () => {
    // Pátek 20:00 → pondělí 07:00: mezi tím jen sobota a neděle.
    expect(pracovniHodiny(d('2026-08-28T20:00'), d('2026-08-31T07:00'))).toBe(0);
  });

  it('noc se nepočítá', () => {
    expect(pracovniHodiny(d('2026-09-01T20:00'), d('2026-09-02T07:00'))).toBe(0);
  });

  it('pracovní den je 13 hodin', () => {
    expect(pracovniHodiny(d('2026-09-01T00:00'), d('2026-09-02T00:00'))).toBe(13);
  });

  it('obrácené pořadí nedá zápor', () => {
    expect(pracovniHodiny(d('2026-09-02T00:00'), d('2026-09-01T00:00'))).toBe(0);
  });
});

describe('tichoWhatsApp', () => {
  it('běžná víkendová pauza NEVAROVÁ — jinak by to řvalo každé pondělí', () => {
    const t = tichoWhatsApp('2026-08-28T12:01:00', d('2026-08-31T11:46'));
    expect(t.varovat).toBe(false);
  });

  it('ani pondělní odpoledne po víkendu ještě nevaruje', () => {
    const t = tichoWhatsApp('2026-08-28T12:01:00', d('2026-08-31T17:00'));
    expect(t.varovat).toBe(false);
  });

  it('dva pracovní dny ticha už se ohlásí', () => {
    // Poslední zpráva po 31. 8. 13:21; ve čtvrtek dopoledne je to přes práh.
    const t = tichoWhatsApp('2026-08-31T13:21:00', d('2026-09-03T10:00'));
    expect(t.hodinTicha).toBeGreaterThanOrEqual(TICHO_HODIN);
    expect(t.varovat).toBe(true);
  });

  it('čerstvá zpráva je v pořádku', () => {
    const t = tichoWhatsApp('2026-09-01T09:00:00', d('2026-09-01T11:46'));
    expect(t.hodinTicha).toBeLessThan(4);
    expect(t.varovat).toBe(false);
  });

  it('když ještě nikdy nic nedorazilo, nevaruje — není to porucha', () => {
    expect(tichoWhatsApp(null, d('2026-09-01T11:46')).varovat).toBe(false);
    expect(tichoWhatsApp(undefined, d('2026-09-01T11:46')).posledni).toBeNull();
  });

  it('poškozené datum nespadne ani nevyrobí planý poplach', () => {
    const t = tichoWhatsApp('nesmysl', d('2026-09-01T11:46'));
    expect(t.varovat).toBe(false);
    expect(t.posledni).toBeNull();
  });

  it('dlouhé ticho přes víkend se ohlásí taky — víkend ho jen nezdrží navěky', () => {
    const t = tichoWhatsApp('2026-08-26T08:00:00', d('2026-09-01T11:46'));
    expect(t.varovat).toBe(true);
  });
});
