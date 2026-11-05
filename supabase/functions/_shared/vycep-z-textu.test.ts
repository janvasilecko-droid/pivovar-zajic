// Výčep (pípa, kohout) ve zprávě nebo poznámce objednávky — viz hlavička vycep-z-textu.ts.
//
// Věty níž jsou VYMYŠLENÉ, ale stejného druhu, jako se píšou ve skupině pivovaru
// (skutečné zprávy ani jména odběratelů se do repozitáře nedávají — je veřejné).
// Čtení skutečných zpráv 5. 11. 2026 ukázalo: „pipa dvoukohout" se jako druh
// nepoznal, „šestikohout" nikdy, „plus pipa jednokohout" skončilo v poznámce
// jako holé „pipa" a „pípu" / „výčep" s diakritikou se v poznámce nepoznaly
// vůbec.
import { describe, it, expect } from 'vitest';
import { jeZminenVycep, popisZminkyVycepu, typVycepu } from './vycep-z-textu';

describe('jeZminenVycep — řeč o výčepu', () => {
  it.each([
    '+ výčep',
    'plus výčep dvojkohout',
    'výčepní zařízení',
    'Na sobotu pipa dvoukohout, dve hadice a narazec',
    'Na akci prosim pipa dvoukohout, hadice, narazece. Dekuju',
    'K tomu pípu dvojkohout a tlakovou láhev, díky',
    'pípa', 'pípu', 'pípy', 'pípou', 'pipa',
    'dvoukohout', 'dvoukohoutu', 'dvojkohoutem', 'dvou kohout', 'dvou-kohout', '2 kohouty', 'dva kohouty', '2kohout',
    'jednokohout', 'jednokohoutu', 'jedno kohout',
    'trojkohout', 'třikohout', 'tříkohout', '3 kohouty', 'tři kohouty',
    'šestikohout', 'sestikohout', 'šestipípa',
    'prosim pipu s dvojkohoutem',
    'vezmeme kohoutek',
    'chladák', 'chlazení', 'narážeč', 'narazec', 'narazece',
  ])('%j → ano', (text) => {
    expect(jeZminenVycep(text)).toBe(true);
  });

  it.each([
    'přivézt na terasu do 15:00',
    '2x50 12sv', '30x30l 11sv',
    'bez etikety', 'sleva 10%', 'faktura', 'zaplaceno',
    'pipeta', 'pipácek',            // slovo, které jen začíná jako pípa
    'výpis z účtu',
    '', null, undefined,
  ])('%j → ne', (text) => {
    expect(jeZminenVycep(text)).toBe(false);
  });
});

describe('typVycepu — jaký druh se chce', () => {
  it.each([
    // jednokohout
    ['jednokohout', 'jednokohout'], ['jednokohoutu', 'jednokohout'], ['jedno kohout', 'jednokohout'],
    ['jedno-kohout', 'jednokohout'], ['jednopipa', 'jednokohout'], ['jednopípa', 'jednokohout'],
    ['pipa jednokohout', 'jednokohout'], ['1 kohout', 'jednokohout'],
    // dvojkohout — „dvoukohout" je nejčastější zápis ve skupině
    ['dvojkohout', 'dvojkohout'], ['dvoukohout', 'dvojkohout'], ['dvoukohoutu', 'dvojkohout'],
    ['dvojkohoutem', 'dvojkohout'], ['dvou kohout', 'dvojkohout'], ['dvou-kohout', 'dvojkohout'],
    ['dvojpipa', 'dvojkohout'], ['dvoupípa', 'dvojkohout'], ['2 kohouty', 'dvojkohout'], ['dva kohouty', 'dvojkohout'],
    ['2kohout', 'dvojkohout'], ['Na sobotu pipa dvoukohout, hadice, narazec', 'dvojkohout'],
    ['K tomu pípu dvojkohout a tlakovou láhev, díky', 'dvojkohout'],
    ['prosim pipu s dvojkohoutem', 'dvojkohout'],
    // trojkohout
    ['trojkohout', 'trojkohout'], ['třikohout', 'trojkohout'], ['tříkohout', 'trojkohout'],
    ['3 kohouty', 'trojkohout'], ['tři kohouty', 'trojkohout'], ['trojpipa', 'trojkohout'],
    // šestikohout — dřív se nepoznal nikdy (pravidlo hledalo „sest…", ne „sesti…")
    ['šestikohout', 'sestikohout'], ['sestikohout', 'sestikohout'], ['šestipípa', 'sestikohout'],
    ['6 kohoutů', 'sestikohout'],
  ])('%j → %s', (text, druh) => {
    expect(typVycepu(text)).toBe(druh);
  });

  it.each([
    '+ výčep', 'pipa', 'pípu', 'kohout', 'chladák', 'narazec', '2x50 12sv', '',
    '2 pípy',                           // dvě pípy, ne dvojkohout
  ])('%j → druh není řečen', (text) => {
    expect(typVycepu(text)).toBeNull();
  });

  it('dva různé druhy ve větě = nic (vybere obsluha)', () => {
    expect(typVycepu('jednokohout nebo dvojkohout, jak bude volný')).toBeNull();
  });

  it('čtyřkohout evidence nezná — nestane se z něj jiný druh', () => {
    expect(typVycepu('čtyřkohout prosím')).toBeNull();
    expect(jeZminenVycep('čtyřkohout prosím')).toBe(true);
  });

  it('prázdný vstup', () => {
    expect(typVycepu(null)).toBeNull();
    expect(typVycepu(undefined)).toBeNull();
  });
});

describe('popisZminkyVycepu — co se zapíše do poznámky objednávky', () => {
  it.each([
    // druh se k holé „pipa" přidá, i když stál jinde — dřív zbylo jen „pipa"
    ['20l dvanactky a pipa jednokohout pro Frantu do Plzne. Na patek', 'pipa jednokohout'],
    ['Na sobotu pipa dvoukohout, dve hadice a narazec', 'pipa dvojkohout'],
    ['K tomu pípu dvojkohout a tlakovou láhev, díky', 'pípu dvojkohout'],
    // druh je ve slově samém — píše se, jak to stálo
    ['dvoukohout', 'dvoukohout'],
    ['jednokohout pipa', 'jednokohout'],
    ['šestikohout na akci', 'šestikohout'],
    // diakritika se zachová a pozná
    ['+ výčep', 'výčep'],
    ['pípa', 'pípa'],
    ['výčepní zařízení', 'výčepní'],
    // bez druhu zůstane holé slovo
    ['pipa pripravit prosim 6xpet 1,5l dvanactka', 'pipa'],
    // výčep má přednost před doplňkem
    ['plus narazec a pipa jednokohout', 'pipa jednokohout'],
    // jen doplněk
    ['Pro Petra 1x50 a 1x30 plus narazec', 'narazec'],
    ['chladák s sebou', 'chladák'],
  ])('%j → %j', (text, popis) => {
    expect(popisZminkyVycepu(text)).toBe(popis);
  });

  it('bez zmínky nic', () => {
    expect(popisZminkyVycepu('2x50 12sv, faktura')).toBeNull();
    expect(popisZminkyVycepu('')).toBeNull();
    expect(popisZminkyVycepu(null)).toBeNull();
  });

  it('popis se dá znovu přečíst: druh z něj vyjde stejný jako z celé věty', () => {
    for (const text of [
      '20l dvanactky a pipa jednokohout pro Frantu',
      'Na sobotu pipa dvoukohout, hadice, narazec',
      'šestikohout na akci',
      'pipa',
    ]) {
      const popis = popisZminkyVycepu(text)!;
      expect(jeZminenVycep(popis)).toBe(true);
      expect(typVycepu(popis)).toBe(typVycepu(text));
    }
  });
});
