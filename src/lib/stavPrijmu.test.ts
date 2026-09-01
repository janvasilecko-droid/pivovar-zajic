import { describe, expect, it } from 'vitest';
import { stavPrijmu } from './stavPrijmu';

const TED = new Date('2026-09-01T15:05:00');
const pred = (minut: number) => new Date(TED.getTime() - minut * 60000).toISOString();

describe('stavPrijmu', () => {
  it('most běží a nic nechodí → CHYBA, ne zelená', () => {
    // Přesně stav z 1. 9. 2026: tep minutu starý, `pripojeno: true`,
    // poslední zpráva ze včerejška 15:21. Audit tehdy hlásil zeleně
    // „Most běží a je spojený s WhatsAppem" — pravý opak skutečnosti.
    const s = stavPrijmu(pred(1), true, '2026-08-31T15:21:00', TED);
    expect(s.mostBezi).toBe(true);
    expect(s.uroven).toBe('chyba');
    expect(s.hlaska).toContain('nedorazila žádná zpráva');
    expect(s.rada).toContain('Tasker');
  });

  it('most běží a zprávy chodí → OK', () => {
    const s = stavPrijmu(pred(1), true, pred(30), TED);
    expect(s.uroven).toBe('ok');
    expect(s.hlaska).toContain('funguje');
  });

  it('most spí, ale ráno ještě něco přišlo → jen POZOR', () => {
    // Uspaná instance na bezplatném Renderu je běžný stav, ne porucha.
    const s = stavPrijmu(pred(40), true, pred(90), TED);
    expect(s.mostBezi).toBe(false);
    expect(s.uroven).toBe('pozor');
    expect(s.hlaska).toBe('Most se neozývá');
  });

  it('most spí A dlouho nic nechodí → CHYBA', () => {
    const s = stavPrijmu(pred(40), true, '2026-08-31T15:21:00', TED);
    expect(s.uroven).toBe('chyba');
  });

  it('most běží, ale nemá spojení s WhatsAppem', () => {
    const s = stavPrijmu(pred(1), false, pred(10), TED);
    expect(s.uroven).toBe('pozor');
    expect(s.hlaska).toContain('nemá spojení');
  });

  it('tep nikdy nebyl', () => {
    const s = stavPrijmu(null, false, null, TED);
    expect(s.mostMinut).toBeNull();
    expect(s.hlaska).toBe('Most se nikdy neozval');
    expect(s.uroven).toBe('chyba');
  });

  it('čerstvě zapojený most bez jediné zprávy není porucha', () => {
    const s = stavPrijmu(pred(1), true, null, TED);
    expect(s.uroven).toBe('pozor');
    expect(s.hlaska).toContain('zatím nikdy nic nedorazilo');
  });

  it('ticho přes noc a víkend nedělá poplach — počítají se pracovní hodiny', () => {
    // Pátek 18:00 → pondělí 08:00: mezi tím jen 2 pracovní hodiny.
    const pondeliRano = new Date('2026-08-31T08:00:00');
    const s = stavPrijmu(new Date(pondeliRano.getTime() - 60000).toISOString(), true,
      '2026-08-28T18:00:00', pondeliRano);
    expect(s.hodinTicha).toBeLessThan(8);
    expect(s.uroven).toBe('ok');
  });

  it('poškozená data nespadnou', () => {
    const s = stavPrijmu('nesmysl', true, 'taky nesmysl', TED);
    expect(s.mostMinut).toBeNull();
    expect(s.posledniZprava).toBeNull();
  });
});
