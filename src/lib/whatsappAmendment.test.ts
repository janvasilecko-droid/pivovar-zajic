import { describe, it, expect } from 'vitest';
import { findQuotedMessage, findAmendedOrderId, diffOrderItems, maZmeny, rozsahOdpovedi, skupinaObalu, slozNavrh, potvrzeneBezPolozek, type WhatsAppMsgRef } from './whatsappAmendment';

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

// ---------------------------------------------------------------------------
// Rozsah odpovědi — o které části objednávky zpráva mluví.
//
// Podle skutečného případu z 1. 9. 2026 (odběratel Maneo): objednávka přišla
// jako PDF se šesti položkami a druhá zpráva zněla:
//
//   Ty male soudky budou
//   Desitka 2x 20l
//   11sv 1x15l
//   Tricitky a petky sedi
//
// Malé sudy z PDF (3× 15l, 3× 10l, 3× 10l) se mají NAHRADIT dvěma novými.
// Třicítky a petky zůstat — odběratel o nich napsal, že sedí.
// ---------------------------------------------------------------------------
describe('rozsahOdpovedi / slozNavrh — odpověď mluví o části objednávky', () => {
  const OBALY = [
    { id: 'keg50', label: 'KEG 50l', kind: 'keg', volume_l: 50 },
    { id: 'keg30', label: 'KEG 30l', kind: 'keg', volume_l: 30 },
    { id: 'keg20', label: 'KEG 20l', kind: 'keg', volume_l: 20 },
    { id: 'keg15', label: 'KEG 15l', kind: 'keg', volume_l: 15 },
    { id: 'keg10', label: 'KEG 10l', kind: 'keg', volume_l: 10 },
    { id: 'pet1', label: 'PET 1l', kind: 'pet', volume_l: 1 },
    { id: 'lah05', label: 'Lahev 0,5l', kind: 'bottle', volume_l: 0.5 },
  ];

  const ZPRAVA_MANEO = 'Ty male soudky budou\nDesitka 2x 20l\n11sv 1x15l\nTricitky a petky sedi';

  // Objednávka z PDF (OV2604293): malé sudy, třicítky a petky.
  const MANEO_PDF = [
    { beer_id: 'des', package_id: 'keg15', quantity: 3 },
    { beer_id: 'des', package_id: 'keg10', quantity: 3 },
    { beer_id: '11sv', package_id: 'keg10', quantity: 3 },
    { beer_id: 'jantar', package_id: 'pet1', quantity: 12 },
    { beer_id: 'des', package_id: 'keg30', quantity: 2 },
    { beer_id: '11sv', package_id: 'pet1', quantity: 12 },
  ];

  it('petka je PET, ne sud 15 l', () => {
    // Kdyby se „petka" zařadila k sudům, věta „petky sedi" by ochránila
    // špatnou skupinu a malé sudy by se nenahradily. Appka to samé pravidlo
    // hlídá i na vstupu (viz parse-order-image).
    expect(skupinaObalu({ id: 'pet1', label: 'PET 1l', kind: 'pet', volume_l: 1 })).toBe('petka');
    // Pravidlo od sládka: malé sudy jsou 10/15/20 l, 30 l je „velký" (třicítka)
    // a ten většinou zůstává. Hranice musí sedět, jinak „malé sudy budou…"
    // omylem přepíše i třicítky (nebo je nechá jako malé).
    expect(skupinaObalu({ id: 'keg10', label: 'KEG 10l', kind: 'keg', volume_l: 10 })).toBe('maly_sud');
    expect(skupinaObalu({ id: 'keg15', label: 'KEG 15l', kind: 'keg', volume_l: 15 })).toBe('maly_sud');
    expect(skupinaObalu({ id: 'keg20', label: 'KEG 20l', kind: 'keg', volume_l: 20 })).toBe('maly_sud');
    expect(skupinaObalu({ id: 'keg30', label: 'KEG 30l', kind: 'keg', volume_l: 30 })).toBe('tricitka');
    expect(skupinaObalu({ id: 'keg50', label: 'KEG 50l', kind: 'keg', volume_l: 50 })).toBe('padesatka');
  });

  it('z Maneo zprávy přečte: nahradit malé sudy, ponechat třicítky a petky', () => {
    const r = rozsahOdpovedi(ZPRAVA_MANEO);
    expect(r.nahradit).toEqual(['maly_sud']);
    expect(r.potvrzeno.sort()).toEqual(['petka', 'tricitka']);
  });

  it('nahradí malé sudy a nechá být třicítky i petky', () => {
    const zOdpovedi = [
      { beer_id: 'des', package_id: 'keg20', quantity: 2 },
      { beer_id: '11sv', package_id: 'keg15', quantity: 1 },
    ];
    const navrh = slozNavrh({ soucasne: MANEO_PDF, zOdpovedi, text: ZPRAVA_MANEO, obaly: OBALY });

    // Malé sudy z PDF jsou pryč, nové jsou tam.
    expect(navrh.filter((i) => i.package_id === 'keg10')).toEqual([]);
    expect(navrh).toEqual(expect.arrayContaining([
      { beer_id: 'des', package_id: 'keg20', quantity: 2 },
      { beer_id: '11sv', package_id: 'keg15', quantity: 1 },
    ]));

    // Třicítky a petky zůstaly v původním množství.
    expect(navrh.find((i) => i.package_id === 'keg30')).toEqual({ beer_id: 'des', package_id: 'keg30', quantity: 2 });
    expect(navrh.filter((i) => i.package_id === 'pet1')).toHaveLength(2);

    // A v porovnání se tedy 24 petek ani 2 třicítky NESMÍ objevit jako
    // „odebráno" — právě tohle dřív z objednávky spadlo.
    const diff = diffOrderItems(MANEO_PDF, navrh);
    const odebrane = diff
      .filter((d) => d.zmena === 'odebrano')
      .map((d) => `${d.beer_id}/${d.package_id}`)
      .sort();
    // Tři řádky malých sudů z PDF — 10l je tam dvakrát (Desítka i 11sv).
    expect(odebrane).toEqual(['11sv/keg10', 'des/keg10', 'des/keg15']);
    expect(odebrane.some((k) => k.endsWith('/pet1'))).toBe(false);
    expect(odebrane.some((k) => k.endsWith('/keg30'))).toBe(false);
  });

  it('potvrzeneBezPolozek: „petky sedí" u objednávky BEZ petek to nahlásí', () => {
    // Reálný případ Maneo: odběratel napsal „petky sedí", ale do načtené
    // objednávky se petky (12x1l Summer) nedostaly (z PDF se nevytáhly).
    // „Sedí" = nech to být — jenže není co nechat, tak to musí zaznít.
    const bezPetek = [
      { beer_id: 'des', package_id: 'keg10', quantity: 3 },
      { beer_id: 'des', package_id: 'keg30', quantity: 2 },
    ];
    const chybi = potvrzeneBezPolozek({
      soucasne: bezPetek,
      potvrzeno: ['petka', 'tricitka'],
      obaly: OBALY,
    });
    // Třicítky v objednávce jsou (keg30), petky ne → hlásí se jen petky.
    expect(chybi).toEqual(['petka']);
  });

  it('potvrzeneBezPolozek: když petky v objednávce jsou, nic nehlásí', () => {
    const chybi = potvrzeneBezPolozek({
      soucasne: MANEO_PDF,
      potvrzeno: ['petka', 'tricitka'],
      obaly: OBALY,
    });
    expect(chybi).toEqual([]);
  });

  it('bez jmenované skupiny se chová jako dřív (odpověď = celá objednávka)', () => {
    // „Nakonec summer 9x30" opravdu popisuje celý obsah — nesmí se z toho
    // stát částečná úprava, jinak by v objednávce zůstalo staré množství.
    const zOdpovedi = [{ beer_id: 'summer', package_id: 'keg30', quantity: 9 }];
    const navrh = slozNavrh({
      soucasne: [{ beer_id: 'summer', package_id: 'keg30', quantity: 15 }],
      zOdpovedi,
      text: 'Nakonec summer 9x30',
      obaly: OBALY,
    });
    expect(navrh).toEqual(zOdpovedi);
  });

  it('dodatek mimo nahrazovanou skupinu se přidá, nezahodí', () => {
    const navrh = slozNavrh({
      soucasne: MANEO_PDF,
      zOdpovedi: [
        { beer_id: 'des', package_id: 'keg20', quantity: 2 },
        { beer_id: 'summer', package_id: 'keg50', quantity: 1 },
      ],
      text: 'Male soudky budou desitka 2x20l a jeste 1x50 summer',
      obaly: OBALY,
    });
    expect(navrh).toEqual(expect.arrayContaining([
      { beer_id: 'summer', package_id: 'keg50', quantity: 1 },
    ]));
  });
});
