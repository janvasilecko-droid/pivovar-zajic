// Odběratel z věty „Na Patejdovku:" — viz hlavička odberatel-z-vety.ts.
// Z provozu 5. 11. 2026: zpráva „Na pristi tyden na Patejdovku: 30x30l 11sv…"
// skončila jako „Neznámý odběratel"; majitel: „pro Patejdlovku — to znamená, že
// odběratel je Patejdlovka… tohle musí aplikace umět přečíst."
//
// Případy „co odběratel NENÍ" jsou vzory ze skutečných zpráv skupiny pivovaru
// (jména a texty jsou záměrně změněné): první verze (každé „na / pro / do +
// slovo") by z nich vyrobila zákazníka z „do práce", z „na rampu" nebo jen
// půlku objednávky se dvěma zákazníky.
import { describe, it, expect } from 'vitest';
import { nominativ, odberatelZVety } from './odberatel-z-vety';

describe('odberatelZVety — odběratel je za „na / pro"', () => {
  it('zpráva z provozu 5. 11. 2026: termín před jménem, jméno ve 4. pádu', () => {
    expect(odberatelZVety('Na pristi tyden na Patejdovku:\n30x30l 11sv\n15x30l limo citron'))
      .toEqual({ zapsano: 'Patejdovku', nominativ: 'Patejdovka' });
  });

  it('„pro Patejdlovku" = odběratel je Patejdlovka (jak to řekl majitel)', () => {
    expect(odberatelZVety('pro Patejdlovku 30x30l 11sv')).toEqual({ zapsano: 'Patejdlovku', nominativ: 'Patejdlovka' });
  });

  it.each([
    ['Objednávka pro Pohodu\n2x30l 12sv', 'Pohodu', 'Pohoda'],
    ['Na pristi tyden pro Zdenku: 3x30 12sv', 'Zdenku', 'Zdenka'],
    ['3x30 12sv na Anicku', 'Anicku', 'Anicka'],
    ['pro pohodu 3x30', 'pohodu', 'Pohoda'],
    ['Pro Honzu z Brna prosim 2xbasa 0,5l 12° ipa 7x1,0l desitka', 'Honzu', 'Honza'],
    ['Pro Honzu az se zitra bude vyzvedavat pipa hodit prosim 7xpet 1,0l desitka', 'Honzu', 'Honza'],
    ['Na Vildstejn, Skalná 2x30l 12sv 2x30l tmava', 'Vildstejn', 'Vildstejn'],
  ])('%j → %s / %s', (text, zapsano, nom) => {
    expect(odberatelZVety(text)).toEqual({ zapsano, nominativ: nom });
  });

  it('jméno, které se neskloňuje, zůstane (1. pád, mužský rod, cizí slovo)', () => {
    expect(odberatelZVety('pro Seeberg 4x30 12sv')).toEqual({ zapsano: 'Seeberg', nominativ: 'Seeberg' });
    expect(odberatelZVety('na Lipa 2x50')).toEqual({ zapsano: 'Lipa', nominativ: 'Lipa' });
    expect(odberatelZVety('pro Kebab 2x30')).toEqual({ zapsano: 'Kebab', nominativ: 'Kebab' });
  });

  it('víceslovné jméno jen tam, kde to opravdu je jméno — a neskloňuje se naslepo', () => {
    expect(odberatelZVety('pro U Dubu 2x50 12sv')).toEqual({ zapsano: 'U Dubu', nominativ: 'U Dubu' });
    expect(odberatelZVety('Pro pivovar Brana, na pristi tyden utery\n20x50l desitka\n35Kc/litr'))
      .toEqual({ zapsano: 'pivovar Brana', nominativ: 'Pivovar Brana' });
    expect(odberatelZVety('pro pivovar brana 20x50l')).toEqual({ zapsano: 'pivovar brana', nominativ: 'Pivovar brana' });
    expect(odberatelZVety('Pro Restauraci Na Růžku 4x30 12sv')).toEqual({ zapsano: 'Restauraci Na Růžku', nominativ: 'Restauraci Na Růžku' });
    expect(odberatelZVety('Pro Karla Dvoraka 1x50 a 1x30 11sv plus narazec')).toMatchObject({ zapsano: 'Karla Dvoraka' });
    expect(odberatelZVety('Pro Josefa Novotneho z restaurace 1x30l 12sv')).toMatchObject({ zapsano: 'Josefa Novotneho' });
  });

  it('jméno končí zdvořilostí, čárkou i množstvím; další malé slovo k němu nepatří', () => {
    expect(odberatelZVety('pro Pohodu prosim 3x30l')).toMatchObject({ zapsano: 'Pohodu' });
    expect(odberatelZVety('pro Pohodu, 3x30l 12sv')).toMatchObject({ zapsano: 'Pohodu' });
    expect(odberatelZVety('pro Pohodu 3x30l 12sv')).toMatchObject({ zapsano: 'Pohodu' });
    expect(odberatelZVety('pro Pohodu ma byt 3x30l')).toMatchObject({ zapsano: 'Pohodu' });
  });

  it('první „na" je termín, druhé jméno — bere se jméno', () => {
    expect(odberatelZVety('na pristi tyden na Pohodu 3x30')).toMatchObject({ zapsano: 'Pohodu', nominativ: 'Pohoda' });
    expect(odberatelZVety('Na pristi tyden na stredu pro Pohodu: 3x30')).toMatchObject({ zapsano: 'Pohodu' });
  });

  it('tentýž odběratel dvakrát je pořád jeden', () => {
    expect(odberatelZVety('Na Pohodu 3x30 12sv\npro Pohodu prosim')).toMatchObject({ zapsano: 'Pohodu' });
  });

  it('hledá se jen v záhlaví — prvních třech řádcích', () => {
    expect(odberatelZVety('3x30 12sv\n2x50 10sv\n1x30 tmava\npro Pohodu')).toBeNull();
    expect(odberatelZVety('3x30 12sv\n2x50 10sv\npro Pohodu')).toMatchObject({ zapsano: 'Pohodu' });
  });
});

describe('odberatelZVety — co odběratel NENÍ (nic se nehádá)', () => {
  it.each([
    // termíny
    'Na pristi tyden na utery bude Novy Podnik 3x30',
    'Na pristi tyden 3x30 12sv',
    'na zitra 2x30 12sv',
    'Posli mi 3x30 do pondeli',
    'dodat 2x30 do patku',
    'do konce tydne 2x30',
    'na ctvrtka 2x30',
    'na Vánoce 10x30 12sv',
    'do Vanoc 10x30 12sv',
    'na 12.11. 2x30',
    'Jan Novak z Brna, Podpultovky na pristi tyden na stredu prosim 1x30l 12sv, vcetne zalohy',
    // „pro mě", zájmena
    'pro mě 2x30 12sv',
    'pro nás 3x30',
    'pro vsechny 3x30',
    'Pro mně na čtvrtek na komisi 2x30l. 11sl',
    // množství, obaly, pivo
    'Karel z Brna si pristi tyden ve ctvrtek prijede pro cca 500l 12sv',
    'pro 2x30 12sv',
    'na keg 30 12sv',
    'pro svetle 12 3x30',
    // „do" je místo dodání, ne zákazník (Nováková je zákazník, Plzeň jen kam se veze)
    'do Patejdovky 2x30 12sv',
    'Novakova do Plzne prosim 10xpet 1,5l tmava 10xpet 1,5l jantar',
    // místa uvnitř pivovaru
    'Karlovi hazim na rampu 1x50l 11sv',
    'Eva na vydejku 100l ipa 44Kc/litr',
    // účel, ne zákazník
    'Zitra jeste prosim hodit do cizího pivovaru vzorky na degustace ipa 5x1,0l',
    // dva zákazníci nebo dvě místa — nevíme, který je odběratel
    'Pro Alfreda a kamarada 20l 12ky do jejich sudu na zitra',
    'pro Pohodu a Anicku 3x30l',
    'Pro Alfreda na zitra na sklad 2x10l 11sv 50xpet 1,0l 11sv',
    // nejde o objednávku (chybí množství)
    'Co je s tim proudem do haje',
    'Trochu zdržím, jedu do kanceláře',
    'Rovnou prosim dojed pro sudy do Brna, ted mi pise. Dekuju',
    'Pro Alfreda jeste plus toto',
    'Vyzvednou prosim zitra odpoledne na prodejne. Diky',
    'Na hospodu prosi, ze by potrebovali petky',
    // nic
    '3x30 12sv',
    '',
  ])('%j → null', (text) => {
    expect(odberatelZVety(text)).toBeNull();
  });

  it('prázdný vstup', () => {
    expect(odberatelZVety(null)).toBeNull();
    expect(odberatelZVety(undefined)).toBeNull();
  });
});

describe('nominativ — jen tam, kde je to bezpečné', () => {
  it.each([
    ['Patejdovku', 'Patejdovka'],
    ['Pohodu', 'Pohoda'],
    ['Anicku', 'Anicka'],
    ['Zdenku', 'Zdenka'],
    ['Hospudku', 'Hospudka'],
    ['PATEJDOVKU', 'PATEJDOVKA'],
  ])('%s → %s', (z, n) => {
    expect(nominativ(z)).toBe(n);
  });

  it.each([
    'Alfreda', 'Seeberg', 'Lipa', 'Kebab', 'Dva a pul', 'U Dubu', 'Lokálka Říčany', 'Hugu', 'Tu', '',
  ])('%j zůstane beze změny', (z) => {
    expect(nominativ(z)).toBe(z);
  });

  it('jiné pády než 4. se nesklání (2. pád „Patejdovky" zůstane)', () => {
    expect(nominativ('Patejdovky')).toBe('Patejdovky');
    expect(nominativ('Anicky')).toBe('Anicky');
  });
});
