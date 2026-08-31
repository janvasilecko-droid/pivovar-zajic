// 🔎 Průchozí test: od poznámky v objednávce k rezervaci výčepu.
// ---------------------------------------------------------------------------
// Tahle cesta se spouští ze čtyř míst v Orders.tsx a EditOrderModal.tsx a
// neměla dosud jediný test — přitom rozhoduje, jestli si zákazník výčep
// odveze. Testuje se přes zamokovanou datovou vrstvu, takže se nesahá na
// databázi a test běží i bez sítě.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TapEquipment, TapReservation } from '../screens/VycepyScreen';

const ulozene: TapReservation[] = [];
let vycepy: TapEquipment[] = [];
let rezervace: TapReservation[] = [];

vi.mock('./vycepyData', () => ({
  nactiVycepy: vi.fn(async () => vycepy),
  nactiRezervace: vi.fn(async () => rezervace),
  ulozRezervaci: vi.fn(async (r: TapReservation) => { ulozene.push(r); return null; }),
}));

const { autoReserveTapIfNeeded, detectTapType, isTapMentioned } = await import('./tapReservations');

const vycep = (id: string, typ: string): TapEquipment => ({
  id, name: `Výčep ${id}`, tap_type: typ, status: 'clean',
});

beforeEach(() => {
  ulozene.length = 0;
  rezervace = [];
  vycepy = [vycep('a', 'jednokohout'), vycep('b', 'dvojkohout'), vycep('c', 'trojkohout')];
});

describe('rozpoznání výčepu v poznámce', () => {
  it('chytí běžné způsoby, jak se to píše ve skupině', () => {
    expect(isTapMentioned('+ výčep')).toBe(true);
    expect(isTapMentioned('vezmeme dvojkohout')).toBe(true);
    expect(isTapMentioned('a jednu pípu')).toBe(true);
    expect(isTapMentioned('chladák s sebou')).toBe(true);
  });

  it('nereaguje na běžnou poznámku bez výčepu', () => {
    expect(isTapMentioned('přivézt na terasu do 15:00')).toBe(false);
    expect(isTapMentioned('')).toBe(false);
    expect(isTapMentioned(undefined)).toBe(false);
  });

  it('pozná i požadovaný typ', () => {
    expect(detectTapType('potřebujeme trojkohout')).toBe('trojkohout');
    expect(detectTapType('dvojpipa prosím')).toBe('dvojkohout');
    // Obecná zmínka bez typu — vybere se, co je volné.
    expect(detectTapType('+ výčep')).toBeNull();
  });
});

describe('automatická rezervace', () => {
  it('bez zmínky výčepu se nic nerezervuje', () => {
    return autoReserveTapIfNeeded('Hospoda', '2026-09-01', 'jen pivo', 'o1').then(() => {
      expect(ulozene).toHaveLength(0);
    });
  });

  it('ze zmínky vznikne rezervace na daný den', async () => {
    await autoReserveTapIfNeeded('Hospoda U Zajíce', '2026-09-01', '+ výčep', 'o1');
    expect(ulozene).toHaveLength(1);
    expect(ulozene[0]).toMatchObject({
      date_from: '2026-09-01', date_to: '2026-09-01',
      customer_name: 'Hospoda U Zajíce', order_id: 'o1',
    });
  });

  it('vybere výčep požadovaného typu', async () => {
    await autoReserveTapIfNeeded('Hospoda', '2026-09-01', 'vezmeme trojkohout', 'o1');
    expect(ulozene[0].tap_id).toBe('c');
  });

  it('obsazený výčep přeskočí a vezme volný', async () => {
    rezervace = [{
      id: 'r1', tap_id: 'a', tap_name: 'Výčep a',
      date_from: '2026-09-01', date_to: '2026-09-01', customer_name: 'Někdo jiný',
    }];
    await autoReserveTapIfNeeded('Hospoda', '2026-09-01', '+ výčep', 'o2');
    expect(ulozene[0].tap_id).not.toBe('a');
  });

  it('obsazenost se počítá přes celý rozsah rezervace, ne jen první den', async () => {
    rezervace = [{
      id: 'r1', tap_id: 'a', tap_name: 'Výčep a',
      date_from: '2026-08-30', date_to: '2026-09-05', customer_name: 'Festival',
    }];
    await autoReserveTapIfNeeded('Hospoda', '2026-09-02', '+ výčep', 'o2');
    expect(ulozene[0].tap_id).not.toBe('a');
  });

  it('táž objednávka nezaloží rezervaci dvakrát', async () => {
    rezervace = [{
      id: 'r1', tap_id: 'a', tap_name: 'Výčep a',
      date_from: '2026-09-01', date_to: '2026-09-01', customer_name: 'Hospoda', order_id: 'o1',
    }];
    await autoReserveTapIfNeeded('Hospoda', '2026-09-01', '+ výčep', 'o1');
    expect(ulozene).toHaveLength(0);
  });

  it('bez založených výčepů se nic nevyrábí', async () => {
    // Dřív si funkce vymyslela čtyři ukázkové výčepy — a ty pak vypadaly
    // jako skutečné vybavení pivovaru.
    vycepy = [];
    await autoReserveTapIfNeeded('Hospoda', '2026-09-01', '+ výčep', 'o1');
    expect(ulozene).toHaveLength(0);
  });

  it('když je všechno obsazené, rezervuje aspoň první — ať se na to přijde', async () => {
    rezervace = vycepy.map((v, i) => ({
      id: `r${i}`, tap_id: v.id, tap_name: v.name,
      date_from: '2026-09-01', date_to: '2026-09-01', customer_name: 'Obsazeno',
    }));
    await autoReserveTapIfNeeded('Hospoda', '2026-09-01', '+ výčep', 'o9');
    expect(ulozene).toHaveLength(1);
  });
});
