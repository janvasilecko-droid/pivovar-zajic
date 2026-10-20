import { describe, it, expect } from 'vitest';
import {
  bezSuduOdberatele, doSuduOdberatele, poznamkaSVlastnimSudem, POZNAMKA_VLASTNI_SUD, textRikaVlastniSud, vlastniSudyOdberatele,
} from './vlastniSudy';

// 6. 10. 2026: „Duck and Dog a Michal Fojtovice počítej zvlášť, mimo zásoby
// skladu, stáčí se do jejich sudů, to samý Martin malý sudy."
describe('vlastniSudyOdberatele', () => {
  it('Duck and Dog a Michal Fojtovice — všechny sudy jejich', () => {
    expect(vlastniSudyOdberatele('Michal Fojtovice')).toBe('vse');
    // Duck and Dog je od 20. 10. 2026 normální zákazník s našimi sudy.
    expect(vlastniSudyOdberatele('Duck and Dog')).toBeNull();
    expect(vlastniSudyOdberatele('duck  and dog')).toBeNull();
    expect(vlastniSudyOdberatele('Michal fojtovice')).toBe('vse');
    expect(vlastniSudyOdberatele('Michal Vojtovice')).toBe('vse');
  });

  it('Martin — jen malé sudy; ne každý, kdo má Martina v názvu', () => {
    expect(vlastniSudyOdberatele('MARTIN')).toBe('male');
    expect(vlastniSudyOdberatele('Martinice')).toBeNull();
    expect(vlastniSudyOdberatele('Hospoda U Martina')).toBeNull();
  });

  it('ostatní odběratelé sudy pivovaru', () => {
    expect(vlastniSudyOdberatele('Lokálka Říčany')).toBeNull();
    expect(vlastniSudyOdberatele(null)).toBeNull();
  });
});

describe('doSuduOdberatele', () => {
  const s50 = { kind: 'keg', volume_l: 50 };
  const s20 = { kind: 'keg', volume_l: 20 };
  const lahev = { kind: 'bottle', volume_l: 1 };
  it('Martin: 20 l do jeho sudu, 50 l ze sudu pivovaru, lahve nikdy', () => {
    expect(doSuduOdberatele('Martin', s20)).toBe(true);
    expect(doSuduOdberatele('Martin', s50)).toBe(false);
    expect(doSuduOdberatele('Martin', lahev)).toBe(false);
  });
  it('Michal Fojtovice: všechny sudy, lahve ne', () => {
    expect(doSuduOdberatele('Michal Fojtovice', s50)).toBe(true);
    expect(doSuduOdberatele('Michal Fojtovice', s20)).toBe(true);
    expect(doSuduOdberatele('Michal Fojtovice', lahev)).toBe(false);
  });
});

describe('bezSuduOdberatele', () => {
  const obaly = [
    { id: 'k50', kind: 'keg', volume_l: 50 },
    { id: 'k20', kind: 'keg', volume_l: 20 },
    { id: 'pet', kind: 'bottle', volume_l: 1 },
  ];
  const polozky = [{ package_id: 'k50' }, { package_id: 'k20' }, { package_id: 'pet' }];

  it('Michal Fojtovice: sudy vypadnou z kontroly skladu, lahve zůstanou', () => {
    expect(bezSuduOdberatele('Michal Fojtovice', polozky, obaly)).toEqual([{ package_id: 'pet' }]);
  });
  it('běžný odběratel: nic se nevyřazuje', () => {
    expect(bezSuduOdberatele('Hospoda U Lva', polozky, obaly)).toEqual(polozky);
  });
});

// 14. 10. 2026, Egon: „v objednávce je napsáno do vlastního sudu, v tom případě
// logicky nemusíš psát, že není malý sud — to se děje u některých zákazníků,
// že si donesou vlastní sud, je to v objednávce napsané."
describe('textRikaVlastniSud', () => {
  it('skutečné zprávy z provozu: „do jejich / jeho sudu“', () => {
    expect(textRikaVlastniSud('Egon od duchodcu prosim 20l 12sv do jejich sudu')).toBe(true);
    expect(textRikaVlastniSud('Pro Egona a duchodce na zitra 30l 12sv do jejich sudu')).toBe(true);
    expect(textRikaVlastniSud('Pro Nemce na utery do jejich sudu\n3x30l 12sv')).toBe(true);
    expect(textRikaVlastniSud('Kamil Kominik vratil prazdny sud a na zitra prosi 20l vosmicky do jeho sudu, ted tu byl.')).toBe(true);
    expect(textRikaVlastniSud('Tak do jeho dvou sudu 50l bude prosim summer')).toBe(true);
  });

  it('s diakritikou i bez, velkými i malými', () => {
    expect(textRikaVlastniSud('Egon, 1× 20l 12° DO JEJICH SUDU')).toBe(true);
    expect(textRikaVlastniSud('do vlastního sudu')).toBe(true);
    expect(textRikaVlastniSud('Do vlastních sudů, prosím')).toBe(true);
    expect(textRikaVlastniSud('stočit do svého sudu')).toBe(true);
    expect(textRikaVlastniSud('2x 30l, přinesou si vlastní sud')).toBe(true);
    expect(textRikaVlastniSud('do sudu zákazníka')).toBe(true);
  });

  it('obyčejné „do sudu“, „sud 20l“ ani vrácení sudu to nejsou', () => {
    expect(textRikaVlastniSud('2x 12° 30l')).toBe(false);
    expect(textRikaVlastniSud('Do sudu 30l prosím 12sv')).toBe(false);
    expect(textRikaVlastniSud('Vratil prazdny sud, na zitra 20l 12sv')).toBe(false);
    expect(textRikaVlastniSud('Vracejí jejich sudy')).toBe(false);
    expect(textRikaVlastniSud('')).toBe(false);
    expect(textRikaVlastniSud(null)).toBe(false);
    expect(textRikaVlastniSud(undefined)).toBe(false);
  });

  it('záporka obrat ruší, ale jen v téže větě', () => {
    expect(textRikaVlastniSud('Nemají vlastní sud')).toBe(false);
    expect(textRikaVlastniSud('Bez vlastního sudu, ze sudů pivovaru')).toBe(false);
    expect(textRikaVlastniSud('Nemají sudy.\nDo jejich sudu 20l 12sv')).toBe(true);
  });
});

describe('vlastní sud podle poznámky objednávky', () => {
  const s20 = { kind: 'keg', volume_l: 20 };
  const s50 = { kind: 'keg', volume_l: 50 };
  const lahev = { kind: 'bottle', volume_l: 1 };

  it('odběratel mimo seznam: bez poznámky sudy pivovaru, s poznámkou vlastní', () => {
    expect(vlastniSudyOdberatele('EGON')).toBeNull();
    expect(vlastniSudyOdberatele('EGON', null)).toBeNull();
    expect(vlastniSudyOdberatele('EGON', 'vyzvednout prázdné sudy')).toBeNull();
    expect(vlastniSudyOdberatele('EGON', 'do vlastního sudu')).toBe('vse');
    expect(vlastniSudyOdberatele(null, 'do jejich sudu')).toBe('vse');
  });

  it('seznam má přednost: Martin zůstává jen u malých sudů', () => {
    expect(vlastniSudyOdberatele('Martin', 'do jejich sudu')).toBe('male');
    expect(vlastniSudyOdberatele('Michal Fojtovice', 'něco jiného')).toBe('vse');
  });

  it('doSuduOdberatele: s poznámkou všechny sudy, lahve nikdy', () => {
    expect(doSuduOdberatele('EGON', s20)).toBe(false);
    expect(doSuduOdberatele('EGON', s20, 'do jejich sudu')).toBe(true);
    expect(doSuduOdberatele('EGON', s50, 'do jejich sudu')).toBe(true);
    expect(doSuduOdberatele('EGON', lahev, 'do jejich sudu')).toBe(false);
  });

  it('bezSuduOdberatele: sudy objednávky s poznámkou vypadnou z kontroly skladu', () => {
    const obaly = [{ id: 'k20', kind: 'keg', volume_l: 20 }, { id: 'pet', kind: 'bottle', volume_l: 1 }];
    const polozky = [{ package_id: 'k20' }, { package_id: 'pet' }];
    expect(bezSuduOdberatele('EGON', polozky, obaly)).toEqual(polozky);
    expect(bezSuduOdberatele('EGON', polozky, obaly, 'do vlastního sudu')).toEqual([{ package_id: 'pet' }]);
  });
});

describe('poznamkaSVlastnimSudem', () => {
  it('zpráva říká „do jejich sudu“ → poznámka se doplní', () => {
    expect(poznamkaSVlastnimSudem(null, 'Egon 20l 12sv do jejich sudu')).toBe(POZNAMKA_VLASTNI_SUD);
    expect(poznamkaSVlastnimSudem('', 'Egon 20l 12sv do jejich sudu')).toBe(POZNAMKA_VLASTNI_SUD);
    expect(poznamkaSVlastnimSudem('+ výčep jednokohout', 'do jejich sudu')).toBe('+ výčep jednokohout; do vlastního sudu');
  });

  it('nic nepřidá dvakrát ani tam, kde to zpráva neříká', () => {
    expect(poznamkaSVlastnimSudem('do vlastního sudu', 'do jejich sudu')).toBe('do vlastního sudu');
    expect(poznamkaSVlastnimSudem('do jejich sudu', 'do jejich sudu')).toBe('do jejich sudu');
    expect(poznamkaSVlastnimSudem('vratný sud', '2x 12° 30l')).toBe('vratný sud');
    expect(poznamkaSVlastnimSudem(null, '2x 12° 30l')).toBeNull();
  });

  it('doplněná poznámka sama splňuje pravidlo', () => {
    expect(textRikaVlastniSud(POZNAMKA_VLASTNI_SUD)).toBe(true);
    expect(textRikaVlastniSud(poznamkaSVlastnimSudem('vratný sud', 'do jejich sudu'))).toBe(true);
  });
});
