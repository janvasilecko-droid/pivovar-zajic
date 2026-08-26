import { describe, it, expect } from 'vitest';
import { findQuotedMessage, findAmendedOrderId, diffOrderItems, maZmeny, type WhatsAppMsgRef } from './whatsappAmendment';

const m = (id: string, created_at: string, message_text: string, extra: Partial<WhatsAppMsgRef> = {}): WhatsAppMsgRef =>
  ({ id, created_at, message_text, ...extra });

describe('findQuotedMessage — ke které zprávě odpověď patří', () => {
  it('najde zprávu podle začátku citace', () => {
    const puvodni = m('a', '2026-08-19T08:00:00Z', 'Radek na ctvrtek', { imported_order_id: 'ord-1' });
    const odpoved = m('b', '2026-08-19T09:00:00Z', 'Radek  Nakonec summer 9x30', { quoted_text: 'Radek na ctvrtek' });
    expect(findQuotedMessage(odpoved, [puvodni, odpoved])?.id).toBe('a');
    expect(findAmendedOrderId(odpoved, [puvodni, odpoved])).toBe('ord-1');
  });

  // WhatsApp v citaci posílá jen začátek delší zprávy.
  it('poradí si s oříznutou citací', () => {
    const puvodni = m('a', '2026-08-19T08:00:00Z',
      'Naseb\n10x summer ale 1l\n6x cyklistická vosma 1l\n6x jantar 1l\n4x zajíc 12sv 1l', { imported_order_id: 'ord-2' });
    const odpoved = m('b', '2026-08-19T09:00:00Z', 'Bez summera', { quoted_text: 'Naseb\n10x summer ale 1l\n6x cyklistická vosma 1l' });
    expect(findAmendedOrderId(odpoved, [puvodni, odpoved])).toBe('ord-2');
  });

  it('nikdy nevrátí zprávu, která přišla až PO odpovědi', () => {
    const pozdejsi = m('a', '2026-08-19T10:00:00Z', 'Maneo', { imported_order_id: 'ord-1' });
    const odpoved = m('b', '2026-08-19T09:00:00Z', 'Plus 3x10 11sv', { quoted_text: 'Maneo' });
    expect(findQuotedMessage(odpoved, [pozdejsi, odpoved])).toBeNull();
  });

  // „Maneo" jako citace sedí na spoustu zpráv — musí vyhrát ta, ze které
  // objednávka opravdu vznikla, a z těch ta časově nejbližší.
  it('u nejednoznačné citace vyhraje zpráva s objednávkou', () => {
    const bezObj = m('a', '2026-08-25T08:00:00Z', 'Maneo');
    const sObj = m('b', '2026-08-25T07:00:00Z', 'Maneo', { imported_order_id: 'ord-9' });
    const odpoved = m('c', '2026-08-25T09:00:00Z', 'Plus 3x10 11sv', { quoted_text: 'Maneo' });
    expect(findAmendedOrderId(odpoved, [bezObj, sObj, odpoved])).toBe('ord-9');
  });

  it('mezi víc objednávkami vyhraje ta časově nejbližší', () => {
    const stara = m('a', '2026-08-20T07:00:00Z', 'Maneo', { imported_order_id: 'ord-stara' });
    const nova = m('b', '2026-08-25T07:00:00Z', 'Maneo', { imported_order_id: 'ord-nova' });
    const odpoved = m('c', '2026-08-25T09:00:00Z', 'Plus 3x10 11sv', { quoted_text: 'Maneo' });
    expect(findAmendedOrderId(odpoved, [stara, nova, odpoved])).toBe('ord-nova');
  });

  it('bez citace nevrací nic', () => {
    expect(findQuotedMessage(m('a', '2026-08-19T09:00:00Z', 'Neco'), [])).toBeNull();
  });

  it('příliš krátká citace se ignoruje', () => {
    const puvodni = m('a', '2026-08-19T08:00:00Z', 'Ok', { imported_order_id: 'ord-1' });
    const odpoved = m('b', '2026-08-19T09:00:00Z', 'Jo', { quoted_text: 'Ok' });
    expect(findQuotedMessage(odpoved, [puvodni, odpoved])).toBeNull();
  });

  it('když se citace neshoduje s ničím, nevrací nic', () => {
    const jina = m('a', '2026-08-19T08:00:00Z', 'Uplne jina zprava', { imported_order_id: 'ord-1' });
    const odpoved = m('b', '2026-08-19T09:00:00Z', 'Bez summera', { quoted_text: 'Naseb 10x summer ale' });
    expect(findAmendedOrderId(odpoved, [jina, odpoved])).toBeNull();
  });
});

describe('diffOrderItems — původní objednávka se zvýrazněnými změnami', () => {
  const p = (beer: string, pkg: string, quantity: number) => ({ beer_id: beer, package_id: pkg, quantity });

  it('„nakonec 9x30" změní množství', () => {
    const d = diffOrderItems([p('summer', 'k30', 15)], [p('summer', 'k30', 9)]);
    expect(d).toEqual([{ beer_id: 'summer', package_id: 'k30', before: 15, after: 9, zmena: 'zmeneno' }]);
  });

  it('„bez summera" položku odebere a ostatní nechá', () => {
    const soucasne = [p('summer', 'pet1', 10), p('osma', 'pet1', 6), p('jantar', 'pet1', 6)];
    const navrh = [p('osma', 'pet1', 6), p('jantar', 'pet1', 6)];
    const d = diffOrderItems(soucasne, navrh);
    expect(d.find((x) => x.beer_id === 'summer')).toMatchObject({ before: 10, after: 0, zmena: 'odebrano' });
    expect(d.filter((x) => x.zmena === 'beze_zmeny')).toHaveLength(2);
  });

  it('„plus 3x10 11sv" položku přidá', () => {
    const d = diffOrderItems([p('des', 'k20', 2)], [p('des', 'k20', 2), p('11sv', 'k10', 3)]);
    expect(d.find((x) => x.beer_id === '11sv')).toMatchObject({ before: 0, after: 3, zmena: 'pridano' });
  });

  it('vrací i nezměněné položky, ať jde ukázat celá objednávka', () => {
    const d = diffOrderItems([p('a', 'k30', 2), p('b', 'k50', 1)], [p('a', 'k30', 2), p('b', 'k50', 1)]);
    expect(d).toHaveLength(2);
    expect(maZmeny(d)).toBe(false);
  });

  it('změny řadí nahoru', () => {
    const d = diffOrderItems(
      [p('a', 'k30', 2), p('b', 'k50', 1)],
      [p('a', 'k30', 2), p('b', 'k50', 4), p('c', 'k10', 1)],
    );
    expect(d.map((x) => x.zmena)).toEqual(['pridano', 'zmeneno', 'beze_zmeny']);
  });

  it('stejnou položku na víc řádcích sečte', () => {
    const d = diffOrderItems([p('a', 'k30', 2), p('a', 'k30', 3)], [p('a', 'k30', 5)]);
    expect(d).toEqual([{ beer_id: 'a', package_id: 'k30', before: 5, after: 5, zmena: 'beze_zmeny' }]);
  });
});
