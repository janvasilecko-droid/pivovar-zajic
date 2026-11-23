// Přiřazování piv a obalů k položkám objednávky — VĚTEV, KTERÁ ZAKLÁDÁ
// OBJEDNÁVKY Z WHATSAPPU (whatsapp-auto-parse). Dokud matcher seděl uvnitř
// edge funkce, nešel z testů importovat a neměl ani jeden test — a právě v něm
// vznikla chyba z 28. 8. 2026, kdy se do všech pěti položek zprávy
// „Restaurace 1x50 12, 1x50 10 a 1x50 tm, terasa 2x50 12 2x50 osma" zapsala
// Osma.
//
// Varianty níž nejsou vymyšlené od stolu — jsou obtažené podle skutečných
// zpráv ze skupiny „Objednávky pivovar" (jeden řádek i víc řádků, stupeň před
// i za objemem, „vše 11%" na konci, bedny, PET, vlastní jména piv, hovorové
// tvary „vosma"/„desítka"/„dvanáctka", překlepy).
import { describe, it, expect } from 'vitest';
import { matchBeerId, matchPackageId, pivaJmenovanaVTextu, vlastniRadekPolozky, objemyVyslovneVTextu, obalVyslovneVRadku, jeLahevBezObjemu, lahevBezUdaneVelikosti, zkratkaObaluPlati, barvaVTextu, type VolbyObalu } from './beer-match';

// Katalog přesně jako v produkci — VČETNĚ toho, že Osma má stupeň zapsaný
// bez znaku ° („8", ne „8°"). Na tom závisí porovnávání stupňů.
const BEERS = [
  { id: 'b-jantar', name: 'Jantar', degree: null },
  { id: 'b-grep', name: 'Grep ', degree: null },
  { id: 'b-tmava', name: '12° Tmavá', degree: '12°' },
  { id: 'b-11', name: '11° Světlá', degree: '11°' },
  { id: 'b-10', name: '10° Desítka', degree: '10°' },
  { id: 'b-summer', name: 'Summer Ale', degree: null },
  { id: 'b-hazy', name: 'Hazy Spring Day', degree: null },
  { id: 'b-osma', name: 'Osma', degree: '8' },
  { id: 'b-citron', name: 'Citron', degree: null },
  { id: 'b-12', name: '12° Světlá', degree: '12°' },
];

const PACKAGES = [
  { id: 'p-keg50', label: 'KEG 50l', volume_l: 50 },
  { id: 'p-keg30', label: 'KEG 30l', volume_l: 30 },
  { id: 'p-keg20', label: 'KEG 20l', volume_l: 20 },
  { id: 'p-keg15', label: 'KEG 15l', volume_l: 15 },
  { id: 'p-keg10', label: 'KEG 10l', volume_l: 10 },
  { id: 'p-pet15', label: 'PET 1.5l', volume_l: 1.5 },
  { id: 'p-pet1', label: 'PET 1l', volume_l: 1 },
  { id: 'p-lahev05', label: 'Lahve 0.5l', volume_l: 0.5 },
  { id: 'p-lahev033', label: 'Lahve 0.33l', volume_l: 0.33 },
];

const prazdneAliasy = () => ({ beer: new Map<string, string>(), package: new Map<string, string>() });
const jmeno = (id: string | null) => BEERS.find((b) => b.id === id)?.name ?? null;
const obal = (id: string | null) => PACKAGES.find((p) => p.id === id)?.label ?? null;

type Polozka = { quantity?: number | null; degree?: string | null; beer_name?: string | null; package_label?: string | null; raw_line?: string | null; z_citace?: boolean };
const pivo = (item: Polozka, aliasy = prazdneAliasy()) => jmeno(matchBeerId(item, BEERS, aliasy));
const balení = (item: Polozka, aliasy = prazdneAliasy(), volby?: VolbyObalu) => obal(matchPackageId(item, PACKAGES, aliasy, volby));

describe('Pivo podle položky, ne podle celého řádku', () => {
  // Ta konkrétní zpráva z provozu. Všech pět položek dostane od AI stejný
  // raw_line (celý řádek), liší se jen stupněm — a jen jedna z nich je Osma.
  const RADEK = 'Restaurace 1x50 12, 1x50 10 a 1x50 tm, terasa 2x50 12 2x50 osma';

  it('„osma" na konci řádku nepřepíše piva ostatních položek', () => {
    expect(pivo({ degree: '12°', raw_line: RADEK })).toBe('12° Světlá');
    expect(pivo({ degree: '10°', raw_line: RADEK })).toBe('10° Desítka');
    expect(pivo({ degree: '8°', raw_line: RADEK })).toBe('Osma');
  });

  it('název piva od AI rozhodne mezi světlou a tmavou téhož stupně', () => {
    expect(pivo({ degree: '12°', beer_name: '12° Tmavá', raw_line: RADEK })).toBe('12° Tmavá');
    expect(pivo({ degree: '12°', beer_name: '12° Světlá', raw_line: RADEK })).toBe('12° Světlá');
  });

  // „Malesice: SV 12 = 3x50l KEG + 24x1,5l PET + 20x0,5l lahev" — na jednom
  // řádku jsou TŘI různé obaly. Obal se proto bere z package_label položky.
  it('víc obalů na řádku: rozhoduje obal položky, ne nejdelší nález v řádku', () => {
    const radek = 'SV 12 = 3x50l KEG + 24x1,5l PET (bez etikety) + 20x0,5l lahev';
    expect(balení({ package_label: 'KEG 50l', raw_line: radek })).toBe('KEG 50l');
    expect(balení({ package_label: 'PET 1.5l', raw_line: radek })).toBe('PET 1.5l');
    expect(balení({ package_label: 'Lahve 0.5l', raw_line: radek })).toBe('Lahve 0.5l');
  });
});

describe('Jak lidi píšou stupeň', () => {
  const varianty: [string, string, string][] = [
    // [popis, raw_line, očekávané pivo]
    ['stupeň za objemem', '10x50l 12sv', '12° Světlá'],
    ['stupeň před objemem', '12sv 3x50l', '12° Světlá'],
    ['jedenáctka zkratkou', '2x50l 11sv', '11° Světlá'],
    ['jedenáctka slovem', 'Pro mně na pátek prosím 2x50l a 1x30l. 11sl.', '11° Světlá'],
    ['desítka slovem', '8sudu 30l na pátek, desítka....Němci, díky', '10° Desítka'],
    ['desítka v 5. pádě', '270l desitky, male soudky plus tricitky', '10° Desítka'],
    ['tmavá slovem', '10xpet 1,5l tmava', '12° Tmavá'],
    ['tmavá zkratkou s číslem', '1x30l 12 tmava', '12° Tmavá'],
    ['dvanáctky hovorově', 'Žižkov na čtvrtek bude 5x30l 12cky', '12° Světlá'],
    ['stupeň se znakem °', 'Chmeloun 4*30 litrů 12° plus 10 petek 1,0l 12°', '12° Světlá'],
    ['osma hovorově', 'Na rozhlednu do Loun prosim na ctvrtek 20l Vosma', 'Osma'],
    ['cyklistická vosma', '6x cyklistická vosma 1l', 'Osma'],
    ['vlastní jméno Jantar', 'Seeberg 2x30l jantar', 'Jantar'],
    ['vlastní jméno Summer', 'Radek nakonec summer 9x30', 'Summer Ale'],
    ['jméno i stupeň — jméno vyhrává', 'Jantar 12 = 1x30l KEG', 'Jantar'],
    ['světlé slovem bez čísla', 'Seeberg 2x30l světle', '12° Světlá'],
  ];

  it.each(varianty)('%s', (_popis, radek, ocekavane) => {
    expect(pivo({ raw_line: radek })).toBe(ocekavane);
  });
});

describe('Jak lidi píšou obal', () => {
  const varianty: [string, string, string, string][] = [
    // [popis, package_label od AI, raw_line, očekávaný obal]
    ['padesátka', 'KEG 50l', '10x50l 12sv', 'KEG 50l'],
    ['třicítka', 'KEG 30l', '4x30l desitka', 'KEG 30l'],
    ['dvacítka', 'KEG 20l', '2x 20l desitka', 'KEG 20l'],
    ['patnáctka', 'KEG 15l', '3x15l 11sv', 'KEG 15l'],
    ['PET jedenapůl', 'PET 1.5l', '10xpet 1,5l tmava', 'PET 1.5l'],
    ['PET litr', 'PET 1l', '10 petek 1,0l 12°', 'PET 1l'],
    ['lahev půllitr', 'Lahve 0.5l', '20x0,5l lahev', 'Lahve 0.5l'],
    ['lahev třetinka', 'Lahve 0.33l', '4 bedny 0,3l', 'Lahve 0.33l'],
    ['obal jen v textu, AI ho nevrátila', '', '13x50l 11sv', 'KEG 50l'],
  ];

  it.each(varianty)('%s', (_popis, label, radek, ocekavany) => {
    expect(balení({ package_label: label, raw_line: radek })).toBe(ocekavany);
  });
});

describe('Stupeň položky přebíjí, co se povaluje v řádku', () => {
  // „Vsechno 11%" na konci — AI rozdá stupeň 11° všem položkám. V řádku ale
  // zůstane i „12%" z dovětku o vlastních sudech.
  const radek = 'Na utery Duck and Dog 5x20 15x30 13x50 Vsechno 11% Pak jeste 2x50 Nase sudy 12%';

  it('položka s 11° dostane jedenáctku, i když je v řádku i 12', () => {
    expect(pivo({ degree: '11°', raw_line: radek })).toBe('11° Světlá');
  });

  it('položka s 12° dostane dvanáctku z téhož řádku', () => {
    expect(pivo({ degree: '12°', raw_line: radek })).toBe('12° Světlá');
  });

  it('stupeň bez shody v katalogu nechá pivo nevyplněné, nedosadí cizí', () => {
    // 13° v katalogu není. Dřív by vyhrálo cokoli, co v řádku zaznělo.
    expect(pivo({ degree: '13°', raw_line: 'Restaurace 2x50 13, plus 1x50 osma' })).toBe(null);
  });
});

describe('Naučené zkratky nesmí přebít pivo napsané jménem', () => {
  it('zkratka „jantar → 12° Světlá" (skutečně se v produkci uložila) neplatí', () => {
    const aliasy = prazdneAliasy();
    aliasy.beer.set('jantar', 'b-12');
    expect(pivo({ raw_line: 'Seeberg 2x30l jantar' }, aliasy)).toBe('Jantar');
  });

  it('zkratka bez informace o pivu („2x10") se ignoruje', () => {
    const aliasy = prazdneAliasy();
    aliasy.beer.set('2x10', 'b-osma');
    expect(pivo({ degree: '11°', raw_line: '2x10 11sv' }, aliasy)).toBe('11° Světlá');
  });
});

describe('Špatně naučené zkratky z fotky (20. 10. 2026)', () => {
  it('„5x 30l 11° sv" → Citron (omylem uložená zkratka) neplatí, je to 11° Světlá', () => {
    const aliasy = prazdneAliasy();
    aliasy.beer.set('5x 30l 11° sv', 'b-citron');
    expect(pivo({ degree: '11°', raw_line: '5x 30l 11° sv' }, aliasy)).toBe('11° Světlá');
  });
  it('„4 x 20l 11° sv" → Summer Ale a „2x 10l 12°sv." → Summer Ale se zahodí', () => {
    const aliasy = prazdneAliasy();
    aliasy.beer.set('4 x 20l 11° sv', 'b-summer');
    aliasy.beer.set('2x 10l 12°sv', 'b-summer');
    expect(pivo({ degree: '11°', raw_line: '4 x 20l 11° sv' }, aliasy)).toBe('11° Světlá');
    expect(pivo({ degree: '12°', raw_line: '2x 10l 12°sv.' }, aliasy)).toBe('12° Světlá');
  });
  it('„3 x 30l limo citr" → 11° Světlá se zahodí (limo není pivo se stupněm)', () => {
    const aliasy = prazdneAliasy();
    aliasy.beer.set('3 x 30l limo citr', 'b-11');
    expect(pivo({ raw_line: '3 x 30l limo citron' }, aliasy)).toBe('Citron');
  });
  it('správná zkratka (stejný stupeň) dál platí', () => {
    const aliasy = prazdneAliasy();
    aliasy.beer.set('5x 12° sv', 'b-12');
    expect(pivo({ degree: '12°', raw_line: '5x 12° sv' }, aliasy)).toBe('12° Světlá');
  });
});

describe('Holý stupeň se nelosuje', () => {
  // „12" sedí na 12° Světlou i 12° Tmavou. Dřív rozhodovalo pořadí piv
  // z databáze, takže se výsledek měnil zprávu od zprávy.
  it('neoznačený stupeň znamená světlé (tmavé se v objednávce vždy označí)', () => {
    expect(pivo({ degree: '12°', raw_line: '1x50 12' })).toBe('12° Světlá');
    expect(pivo({ degree: '12°', raw_line: '2x30 12' })).toBe('12° Světlá');
  });

  it('označené tmavé zůstane tmavé', () => {
    expect(pivo({ degree: '12°', raw_line: '1x30l 12 tmava' })).toBe('12° Tmavá');
  });
});

// Z provozu 13. 9. 2026: „tmavý se propisuje jako světlý". Serverový matcher
// neznal zkratku „tm" a AI k položce přidala stupeň 12° a název „12° Světlá".
describe('Zkratka „tm" je tmavá', () => {
  it('Lužec: „Tm: 2x30l" pod řádkem se světlou', () => {
    expect(pivo({ degree: '12°', beer_name: '12° Světlá', quantity: 2, raw_line: 'Tm: 2x30l' })).toBe('12° Tmavá');
    expect(pivo({ degree: '12°', beer_name: '12° Světlá', quantity: 4, raw_line: '12sv: 3x50l + 4x30l' })).toBe('12° Světlá');
  });

  it('lahve: „5 beden 12tm" vedle „5 beden 12sv"', () => {
    expect(pivo({ degree: '12°', beer_name: '12° Světlá', quantity: 100, raw_line: '5 beden 12tm' })).toBe('12° Tmavá');
    expect(pivo({ degree: '12°', beer_name: '12° Světlá', quantity: 100, raw_line: '5 beden 12sv' })).toBe('12° Světlá');
  });

  it('velkými písmeny a za obalem: „1,5l TM 6x", „tm12", „12 tm"', () => {
    expect(pivo({ degree: '12°', beer_name: '12° Světlá', quantity: 6, raw_line: '1,5l TM 6x' })).toBe('12° Tmavá');
    expect(pivo({ degree: '12°', quantity: 3, raw_line: '3x30 tm12' })).toBe('12° Tmavá');
    expect(pivo({ degree: '12°', quantity: 3, raw_line: '3x30 12 tm' })).toBe('12° Tmavá');
  });

  it('„tm" jedné položky neztmaví ostatní položky na stejném řádku', () => {
    const radek = 'Seeberg 4x30 12sv, 2x30 tm';
    expect(pivo({ degree: '12°', quantity: 4, raw_line: radek })).toBe('12° Světlá');
    expect(pivo({ degree: '12°', quantity: 2, raw_line: radek })).toBe('12° Tmavá');
  });

  it('Seeberg: „2x30l světle, 1x30l jantar" — jméno jednoho piva nepřebije druhou položku', () => {
    const radek = '2x30l světle, 1x30l jantar';
    expect(pivo({ quantity: 2, raw_line: radek })).toBe('12° Světlá');
    expect(pivo({ quantity: 1, raw_line: radek })).toBe('Jantar');
  });

  // Tři objednávky, které rozbila první verze čtení po úsecích (kontrola 13. 9.).
  it('desetinná čárka neroztrhne řádek: „10xpet 1,5l tmava" (Sedláčková)', () => {
    expect(pivo({ degree: '12°', quantity: 10, raw_line: '10xpet 1,5l tmava' })).toBe('12° Tmavá');
    expect(pivo({ degree: '12°', quantity: 12, raw_line: '12x 1,5l pět od všeho co máme, 12° Tmavá' })).toBe('12° Tmavá');
  });

  it('úsek bez jména piva nepřebije pivo napsané na začátku řádku (Malešice)', () => {
    const radek = '•  Jantar 12 = 1x30l KEG + 10x0,5l lahev…..Děkuji moc.';
    expect(pivo({ degree: '12°', quantity: 10, raw_line: radek })).toBe('Jantar');
    expect(pivo({ degree: '12°', quantity: 1, raw_line: radek })).toBe('Jantar');
  });

  it('slova, která jen obsahují „tm", tmavé nejsou', () => {
    expect(pivo({ degree: '12°', quantity: 1, raw_line: '1x50 12 atm' })).toBe('12° Světlá');
  });
});

// Z provozu 17. 11. 2026 (Malešice). Na objednávku
//   „Malesice
//    • SV 12 = 2x50l KEG + 2x30l KEG + 12x1,5l PET (bez etikety)
//    • Jantar 12 = 2x30l KEG + 12x1,5l PET . Děkuji moc."
// přišla odpověď „Bude bez pet 1,5l. 12cky". AI vrátila výsledný stav objednávky
// správně (čtyři položky), ale ke každé jako raw_line přiložila CELOU citovanou
// zprávu na jednom řádku. Slovo „Jantar" kdekoli v tom textu pak vyhrálo
// u všech čtyř položek — ze sudů 12° Světlé byl Jantar a do objednávky
// přibylo „2× 50 l Jantar". Jantar nemá v katalogu stupeň, takže ho
// nezastavila ani pojistka „neodporuje stupni položky".
describe('Řádek s více pivy: jméno jednoho piva nepřebije položky druhého', () => {
  const CITACE = 'Malesice •⁠ ⁠SV 12 = 2x50l KEG + 2x30l KEG + 12x1,5l PET (bez etikety) •⁠ Jantar 12 = 2x30l KEG + 12x1,5l PET . Děkuji moc.';

  it('Malešice 17. 11.: sudy 12° Světlé zůstanou 12° Světlá, Jantar zůstane Jantar', () => {
    expect(pivo({ quantity: 2, degree: '12°', beer_name: '12° Světlá', package_label: 'KEG 50l', raw_line: CITACE })).toBe('12° Světlá');
    expect(pivo({ quantity: 2, degree: '12°', beer_name: '12° Světlá', package_label: 'KEG 30l', raw_line: CITACE })).toBe('12° Světlá');
    expect(pivo({ quantity: 2, degree: null, beer_name: 'Jantar', package_label: 'KEG 30l', raw_line: CITACE })).toBe('Jantar');
    expect(pivo({ quantity: 12, degree: null, beer_name: 'Jantar', package_label: 'PET 1.5l', raw_line: CITACE })).toBe('Jantar');
  });

  it('obal psaný jako v objednávce („50l", „1.5l") a stupeň 12° u Jantaru („Jantar 12") nic nezmění', () => {
    expect(pivo({ quantity: 2, degree: '12°', beer_name: '12° Světlá', package_label: '50l', raw_line: CITACE })).toBe('12° Světlá');
    expect(pivo({ quantity: 2, degree: '12°', beer_name: 'Jantar', package_label: '30l', raw_line: CITACE })).toBe('Jantar');
    expect(pivo({ quantity: 12, degree: '12°', beer_name: 'Jantar', package_label: '1.5l', raw_line: CITACE })).toBe('Jantar');
  });

  it('položka, která je v textu jen na jednom řádku, bere pivo z toho řádku — i bez názvu od AI a i proti němu', () => {
    // „2x50l" stojí jen na řádku „SV 12 = …".
    expect(pivo({ quantity: 2, degree: '12°', package_label: 'KEG 50l', raw_line: CITACE })).toBe('12° Světlá');
    expect(pivo({ quantity: 2, degree: '12°', beer_name: 'Jantar', package_label: 'KEG 50l', raw_line: CITACE })).toBe('12° Světlá');
  });

  // Řádek výsledného stavu upravované objednávky, ke kterému AI přiložila text
  // z citované zprávy (z_citace): odpověď mohla u položky změnit pivo —
  // „těch 2x50 bude Jantar", „místo jantaru dej světlou". Text původní zprávy
  // pak neplatí doslova a rozhoduje pivo od AI.
  it('řádek výsledného stavu z citace: pivo od AI má přednost před textem původní zprávy', () => {
    expect(pivo({ quantity: 2, degree: '12°', beer_name: '12° Světlá', package_label: 'KEG 50l', raw_line: CITACE, z_citace: true })).toBe('12° Světlá');
    expect(pivo({ quantity: 2, degree: '12°', beer_name: '12° Světlá', package_label: 'KEG 30l', raw_line: CITACE, z_citace: true })).toBe('12° Světlá');
    expect(pivo({ quantity: 12, beer_name: 'Jantar', package_label: 'PET 1.5l', raw_line: CITACE, z_citace: true })).toBe('Jantar');
    // Odpověď pivo změnila:
    expect(pivo({ quantity: 2, beer_name: 'Jantar', package_label: 'KEG 50l', raw_line: CITACE, z_citace: true })).toBe('Jantar');
    expect(pivo({ quantity: 2, beer_name: '12° Světlá', package_label: 'KEG 30l', raw_line: 'Jantar 12 = 2x30l KEG + 12x1,5l PET', z_citace: true })).toBe('12° Světlá');
    expect(pivo({ quantity: 2, beer_name: 'Summer Ale', package_label: 'KEG 30l', raw_line: 'Jantar 12 = 2x30l KEG + 12x1,5l PET', z_citace: true })).toBe('Summer Ale');
    // …a barva z citace ji nepřebarví zpátky.
    expect(pivo({ quantity: 2, degree: '12°', beer_name: '12° Světlá', package_label: 'KEG 30l', raw_line: 'Seeberg 4x30 12sv, 2x30 tm', z_citace: true })).toBe('12° Světlá');
  });

  it('řádek z citace bez použitelného názvu od AI se čte z textu jako jindy', () => {
    expect(pivo({ quantity: 2, degree: '12°', package_label: 'KEG 50l', raw_line: CITACE, z_citace: true })).toBe('12° Světlá');
    expect(pivo({ quantity: 2, degree: '12°', beer_name: 'pivo', package_label: 'KEG 50l', raw_line: CITACE, z_citace: true })).toBe('12° Světlá');
    // Název od AI, kterému odporuje stupeň položky, nerozhoduje.
    expect(pivo({ quantity: 2, degree: '11°', beer_name: '12° Světlá', package_label: 'KEG 30l', raw_line: 'Jantar 12 = 2x30l KEG', z_citace: true })).toBe('Jantar');
  });

  it('nová položka z textu odpovědi (bez značky): text má dál přednost před názvem od AI', () => {
    expect(pivo({ quantity: 2, degree: '12°', beer_name: '12° Světlá', package_label: 'KEG 30l', raw_line: 'Plus 2x30 tm' })).toBe('12° Tmavá');
    expect(pivo({ quantity: 2, beer_name: '12° Světlá', package_label: 'KEG 30l', raw_line: 'Plus 2x30 jantar' })).toBe('Jantar');
  });

  it('změněné množství (není v citaci doslova): rozhodne název od AI, když ho citace jmenuje', () => {
    // „Tak těch Jantaru v pet bude jen 11 kusů" → 11× PET 1,5 l Jantar.
    expect(pivo({ quantity: 11, degree: null, beer_name: 'Jantar', package_label: 'PET 1.5l', raw_line: CITACE })).toBe('Jantar');
  });

  it('totéž s opravdovými konci řádků místo zploštěného textu', () => {
    const zprava = 'Malesice\n•⁠  ⁠SV 12 = 2x50l KEG + 2x30l KEG + 12x1,5l PET (bez etikety)\n•⁠  Jantar 12 = 2x30l KEG + 12x1,5l PET . Děkuji moc.';
    expect(pivo({ quantity: 2, degree: '12°', beer_name: '12° Světlá', package_label: 'KEG 30l', raw_line: zprava })).toBe('12° Světlá');
    expect(pivo({ quantity: 2, degree: null, beer_name: 'Jantar', package_label: 'KEG 30l', raw_line: zprava })).toBe('Jantar');
    expect(pivo({ quantity: 2, degree: '12°', package_label: 'KEG 50l', raw_line: zprava })).toBe('12° Světlá');
  });

  // Malešice 13. 10. 2026 — každá položka je v citaci jen na jednom řádku,
  // takže se pozná i bez názvu od AI.
  it('Malešice 13. 10.: šest položek ze dvou řádků, každá podle svého řádku', () => {
    const citace = 'Malesice •⁠ ⁠SV 12 = 2x50l KEG + 2x30l KEG + 12x1,5l PET (bez etikety) + 20x0,5l lahev (etiketa MM) •⁠ Jantar 12 = 1x30l KEG + 10x0,5l lahev. Děkuji moc.';
    expect(pivo({ quantity: 2, package_label: 'KEG 50l', raw_line: citace })).toBe('12° Světlá');
    expect(pivo({ quantity: 2, package_label: 'KEG 30l', raw_line: citace })).toBe('12° Světlá');
    expect(pivo({ quantity: 12, package_label: 'PET 1.5l', raw_line: citace })).toBe('12° Světlá');
    expect(pivo({ quantity: 20, package_label: 'Lahve 0.5l', raw_line: citace })).toBe('12° Světlá');
    expect(pivo({ quantity: 1, package_label: 'KEG 30l', raw_line: citace })).toBe('Jantar');
    expect(pivo({ quantity: 10, package_label: 'Lahve 0.5l', raw_line: citace })).toBe('Jantar');
  });

  it('výčet pod nadpisem („Jantar:" a pod ním řádky s počty): rozhodne název od AI', () => {
    const zprava = 'Jantar:\n2x30l\n12x1,5l\nSvětlá 12:\n2x50l';
    expect(pivo({ quantity: 2, beer_name: 'Jantar', package_label: 'KEG 30l', raw_line: zprava })).toBe('Jantar');
    expect(pivo({ quantity: 2, degree: '12°', beer_name: '12° Světlá', package_label: 'KEG 50l', raw_line: zprava })).toBe('12° Světlá');
  });

  it('barva z jiného řádku položku nepřebarví („tm" pod řádkem se světlou)', () => {
    const zprava = '• 12sv = 2x50l • tm = 2x30l';
    expect(pivo({ quantity: 2, degree: '12°', package_label: 'KEG 50l', raw_line: zprava })).toBe('12° Světlá');
    expect(pivo({ quantity: 2, degree: '12°', package_label: 'KEG 30l', raw_line: zprava })).toBe('12° Tmavá');
    // Stejné množství i obal na obou řádcích: rozhodne název od AI.
    const stejne = '• 12sv = 2x30l • tm = 2x30l';
    expect(pivo({ quantity: 2, degree: '12°', beer_name: '12° Světlá', package_label: 'KEG 30l', raw_line: stejne })).toBe('12° Světlá');
    expect(pivo({ quantity: 2, degree: '12°', beer_name: '12° Tmavá', package_label: 'KEG 30l', raw_line: stejne })).toBe('12° Tmavá');
  });

  // Lokálka Říčany 19. 10. 2026: „10x50l 12sv 2x30l Winter Hazy 12" na jednom
  // řádku bez oddělovačů — Winter (stupeň 12) se propsal i do 10× 50 l 12sv.
  it('jeden řádek bez oddělovačů se dvěma pivy: rozhodne název od AI', () => {
    const beers = [...BEERS, { id: 'b-winter', name: 'winter', degree: '12' }];
    const m = (item: Polozka) => beers.find((b) => b.id === matchBeerId(item, beers, prazdneAliasy()))?.name ?? null;
    const radek = 'Lokálka Říčany prosim 10x50l 12sv 2x30l Winter Hazy 12';
    expect(m({ quantity: 10, degree: '12°', beer_name: '12° Světlá', package_label: 'KEG 50l', raw_line: radek })).toBe('12° Světlá');
    expect(m({ quantity: 2, degree: '12°', beer_name: 'winter', package_label: 'KEG 30l', raw_line: radek })).toBe('winter');
  });

  it('název od AI, který v řádku není, jméno z řádku nepřebije (jako dosud)', () => {
    expect(pivo({ quantity: 1, degree: '12°', beer_name: '12° Světlá', package_label: 'KEG 30l', raw_line: 'Jantar 12 = 1x30l KEG' })).toBe('Jantar');
    expect(pivo({ quantity: 2, beer_name: 'Summer Ale', package_label: 'KEG 30l', raw_line: 'Seeberg 2x30l jantar' })).toBe('Jantar');
  });
});

describe('Která piva řádek jmenuje (pivaJmenovanaVTextu)', () => {
  const jmena = (text: string) => pivaJmenovanaVTextu(text, BEERS, prazdneAliasy()).map(jmeno);

  it('najde všechna, ne jen první', () => {
    expect(jmena('Malesice • SV 12 = 2x50l KEG + 2x30l KEG • Jantar 12 = 2x30l KEG')).toEqual(['12° Světlá', 'Jantar']);
    expect(jmena('2x30l světle, 1x30l jantar')).toEqual(['12° Světlá', 'Jantar']);
    expect(jmena('Restaurace 1x50 12, 1x50 10 a 1x50 tm, terasa 2x50 12 2x50 osma')).toEqual(['12° Tmavá', 'Osma']);
  });

  it('holý stupeň není další pivo („Jantar 12", „12° Jantar")', () => {
    expect(jmena('Jantar 12 = 1x30l KEG + 10x0,5l lahev')).toEqual(['Jantar']);
    expect(jmena('12° 2x30 jantar')).toEqual(['Jantar']);
    expect(jmena('Na utery Duck and Dog 5x20 15x30 13x50 Vsechno 11% Pak jeste 2x50 Nase sudy 12%')).toEqual([]);
  });

  it('stupeň s barvou nebo slovem pivo je („12sv", „11° sv", „desítka")', () => {
    expect(jmena('10x50l 12sv')).toEqual(['12° Světlá']);
    expect(jmena('5x 30l 11° sv')).toEqual(['11° Světlá']);
    expect(jmena('8sudu 30l na pátek, desítka')).toEqual(['10° Desítka']);
    expect(jmena('3x50 12° Tmavá')).toEqual(['12° Tmavá']);
  });
});

describe('Vlastní řádek položky (vlastniRadekPolozky)', () => {
  const CITACE = 'Malesice •⁠ ⁠SV 12 = 2x50l KEG + 2x30l KEG + 12x1,5l PET (bez etikety) •⁠ Jantar 12 = 2x30l KEG + 12x1,5l PET . Děkuji moc.';
  const radek = (item: Polozka) => vlastniRadekPolozky(item, BEERS, prazdneAliasy());

  it('množství × objem jen na jednom řádku → ten řádek', () => {
    expect(radek({ quantity: 2, package_label: 'KEG 50l', raw_line: CITACE })).toBe('SV 12 = 2x50l KEG + 2x30l KEG + 12x1,5l PET (bez etikety)');
  });

  it('na dvou řádcích, na žádném, nebo jednořádkový text → nic (rozhodne se jinak)', () => {
    expect(radek({ quantity: 2, package_label: 'KEG 30l', raw_line: CITACE })).toBe(null);
    expect(radek({ quantity: 12, package_label: 'PET 1.5l', raw_line: CITACE })).toBe(null);
    expect(radek({ quantity: 11, package_label: 'PET 1.5l', raw_line: CITACE })).toBe(null);
    expect(radek({ quantity: 2, package_label: 'KEG 50l', raw_line: 'SV 12 = 2x50l KEG + 2x30l KEG' })).toBe(null);
  });

  it('„12x1,5" není „2x1,5" ani „12x1" a „2x50" není „2x500"', () => {
    const text = '• 12sv = 12x1,5l PET • tm = 2x500 ks';
    expect(radek({ quantity: 2, package_label: 'PET 1.5l', raw_line: text })).toBe(null);
    expect(radek({ quantity: 12, package_label: 'PET 1l', raw_line: text })).toBe(null);
    expect(radek({ quantity: 2, package_label: 'KEG 50l', raw_line: text })).toBe(null);
    expect(radek({ quantity: 12, package_label: 'PET 1.5l', raw_line: text })).toBe('12sv = 12x1,5l PET');
  });

  it('řádek, který sám pivo nejmenuje (výčet pod nadpisem), se nebere', () => {
    expect(radek({ quantity: 2, package_label: 'KEG 30l', raw_line: 'Jantar:\n2x30l\n12x1,5l\nSvětlá 12:\n2x50l' })).toBe(null);
  });
});

describe('Ručně psané „1l" přečtené jako „11"', () => {
  const pkgs = [
    { id: 'k30', label: '30l', volume_l: 30 },
    { id: 'k10', label: '10l', volume_l: 10 },
    { id: 'p1', label: 'PET 1l', volume_l: 1 },
    { id: 'p15', label: 'PET 1.5l', volume_l: 1.5 },
  ];
  const am = { beer: new Map<string, string>(), package: new Map<string, string>() };
  it('„10x 11 11°sv." je PET 1l, ne výchozí sud 30l', () => {
    for (const raw of ['10x 11 11°sv.', '10x 11 12°-Jantar', '15x 1l 11°']) {
      for (const label of ['KEG 30l', null, '11']) {
        expect(matchPackageId({ package_label: label, raw_line: raw }, pkgs, am)).toBe('p1');
      }
    }
  });
  it('nezasahuje do běžných zápisů', () => {
    expect(matchPackageId({ package_label: 'KEG 30l', raw_line: '2x30 11sv' }, pkgs, am)).toBe('k30');
    expect(matchPackageId({ package_label: null, raw_line: '10x 11sv' }, pkgs, am)).not.toBe('p1');
  });
});

describe('Nově přidané pivo se čte bez úprav kódu', () => {
  const beers = [
    { id: 'b12', name: '12° Světlá', degree: '12°' },
    { id: 'b13', name: '13° Jantar', degree: '13°' },
    { id: 'bw', name: 'Winter', degree: '14°' },
  ];
  const am = { beer: new Map<string, string>(), package: new Map<string, string>() };
  it('pozná Winter i s příponou a přes stupeň od AI', () => {
    expect(matchBeerId({ raw_line: '2x30 winter', degree: null, beer_name: 'Winter' }, beers, am)).toBe('bw');
    expect(matchBeerId({ raw_line: '3x50 Winterka', degree: '14°' }, beers, am)).toBe('bw');
    expect(matchBeerId({ raw_line: '2x30 12sv', degree: '12°' }, beers, am)).toBe('b12');
  });
});

describe('„sklo" bez objemu je lahev 0,5 l, třetinka jen když je napsaná', () => {
  const RAW = 'A jeste prosim dve basy sklo 12sv';
  it('AI vrátí 0.33, ale v textu žádná třetinka není → 0,5 l', () => {
    expect(balení({ package_label: 'Lahve 0.33l', raw_line: RAW })).toBe('Lahve 0.5l');
  });
  it('0,33 / třetinka v textu zůstane třetinka', () => {
    expect(balení({ package_label: 'Lahve 0.33l', raw_line: '2 basy sklo 0,33 12sv' })).toBe('Lahve 0.33l');
    expect(balení({ package_label: 'Lahve 0.33l', raw_line: '2 basy sklo tretinky 12sv' })).toBe('Lahve 0.33l');
    expect(balení({ package_label: 'Lahve 0.33l', raw_line: '1 bedna tmaveho 0,33' })).toBe('Lahve 0.33l');
  });
  it('bez raw_line se label AI nemění', () => {
    expect(balení({ package_label: 'Lahve 0.33l' })).toBe('Lahve 0.33l');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 23. 11. 2026, majitel: „projdi čtení položek… 0,33 musí přiřadit 0,33 a ne 0,5
// nikdy, 12sv je 12 světlý ležák, ne Jantar". Prověrka uložených zpráv našla
// příčinu u obalů: appka se potichu „učila" z každé ruční změny a AI ty
// „naučené zkratky" („15l → 20l", „0.33l → 0,5 l", „30l → 1 l") dostávala jako
// spolehlivou nápovědu. Obal od AI měl přednost před tím, co v řádku stojí.
// ─────────────────────────────────────────────────────────────────────────────
describe('Objem napsaný v řádku (objemyVyslovneVTextu)', () => {
  it.each<[string, number[]]>([
    ['30l', [30]],
    ['50 litrů', [50]],
    ['Sluhy 10*30 litrů 10°', [30]],
    ['• *3x*  15l 10° Desítka', [15]],
    ['• *2x*  10l 10° Desítka', [10]],
    ['• *12x* 1l 11° Světlá', [1]],
    ['Kynšperský zajíc 10 světlé výčepní 15L keg - 3,000 ks', [15]],
    ['Kynšperský zajíc 11 Summer Ale 1L - 24,000 ks', [1]],
    ['10 petek 1,0l 12°', [1]],
    ['24x1,5l PET (bez etikety)', [1.5]],
    ['7x1.5l desitka', [1.5]],
    ['pet 5x1.5 jantar', [1.5]],
    ['20x0,5l lahev (etiketa MM)', [0.5]],
    ['10x 05l 12° sv.', [0.5]],
    ['půllitry 20x 12sv', [0.5]],
    ['Sklo 0,33l.', [0.33]],
    ['4 bedny 0,3l', [0.33]],
    ['2xbasa třetinek 12sv', [0.33]],
    ['keg 30 12sv', [30]],
    ['sudy 50 3x 11sv', [50]],
    ['2x 10l 11°sv peta1,5p', [10, 1.5]],
    ['12x30l + 12xpet 1,0l desitka', [30, 1]],
  ])('„%s" říká %j', (text, objemy) => {
    expect(objemyVyslovneVTextu(text)).toEqual(objemy);
  });

  // Holé číslo objem není: „10" bývá stupeň, „4x10" pod nadpisem „petky 1,5l:"
  // je čtyřikrát desítka. A „l" na začátku slova není litr.
  it.each([
    '4x10', '6x11', '3x30 12sv', '2x50 12', '12° světlá', '10x 11 11°sv.',
    '10 lahví 12sv', '1 limo citron', '20 lidí', 'sud 10', 'sudů 20 ks', '3 sudy 12sv',
    'na 1.5. dovezeme 2x30', '270l desitky', '150l', '10,5', '0,35', '',
  ])('„%s" objem výslovně neříká', (text) => {
    expect(objemyVyslovneVTextu(text)).toEqual([]);
  });
});

describe('Co v řádku položky stojí, přebije obal od AI (obalVyslovneVRadku)', () => {
  const vyslovne = (item: Polozka) => obal(obalVyslovneVRadku(item, PACKAGES));

  it('6. 10. 2026 (Maneo): AI vrátila o velikost větší obal, než je v řádku', () => {
    expect(balení({ quantity: 3, package_label: 'KEG 20l', raw_line: '• *3x*  15l 10° Desítka' })).toBe('KEG 15l');
    expect(balení({ quantity: 2, package_label: 'KEG 15l', raw_line: '• *2x*  10l 10° Desítka' })).toBe('KEG 10l');
    expect(balení({ quantity: 12, package_label: 'PET 1.5l', raw_line: '• *12x* 1l 10° Desítka' })).toBe('PET 1l');
    expect(balení({ quantity: 12, package_label: 'PET 1.5l', raw_line: '• *12x* 1l 11° Světlá' })).toBe('PET 1l');
  });

  it('0,33 je vždycky třetinka a 0,5 půllitr, ať AI řekne cokoli', () => {
    expect(balení({ quantity: 20, package_label: 'Lahve 0.5l', raw_line: 'Sklo 0,33l.' })).toBe('Lahve 0.33l');
    expect(balení({ quantity: 40, package_label: 'Lahve 0.5l', raw_line: 'Plus na další fakturu 2xbasa třetinek 12sv' })).toBe('Lahve 0.33l');
    expect(balení({ quantity: 20, package_label: 'Lahve 0.33l', raw_line: '20x0,5l lahev' })).toBe('Lahve 0.5l');
    expect(balení({ quantity: 20, package_label: 'PET 1l', raw_line: '20x 0,33 12sv' })).toBe('Lahve 0.33l');
  });

  it('obal úplně jiného druhu, než je v řádku („30l" čtené jako 1 l)', () => {
    expect(balení({ quantity: 4, package_label: 'PET 1l', raw_line: '4x30l desitka' })).toBe('KEG 30l');
    expect(balení({ quantity: 2, package_label: 'KEG 30l', raw_line: '2x50l 11sv' })).toBe('KEG 50l');
  });

  it('řádek s víc položkami: platí kus s množstvím téhle položky', () => {
    const RADEK = '•⁠  ⁠SV 12 = 4x50l KEG + 24x1,5l PET (bez etikety) + 20x0,5l lahev (etiketa MM)';
    expect(vyslovne({ quantity: 4, raw_line: RADEK })).toBe('KEG 50l');
    expect(vyslovne({ quantity: 24, raw_line: RADEK })).toBe('PET 1.5l');
    expect(vyslovne({ quantity: 20, raw_line: RADEK })).toBe('Lahve 0.5l');
    expect(vyslovne({ quantity: 3, raw_line: '12sv: 3x50l + 4x30l' })).toBe('KEG 50l');
    expect(vyslovne({ quantity: 4, raw_line: '12sv: 3x50l + 4x30l' })).toBe('KEG 30l');
    // bez oddělovače — další položka začíná svým „množství ×"
    expect(vyslovne({ quantity: 1, raw_line: '2x50 12sv 1x30l jantar' })).toBe('KEG 30l');
  });

  it('nejednoznačný řádek neurčí nic — rozhodne obal od AI', () => {
    // dvě položky se stejným počtem, každá jiný objem
    expect(vyslovne({ quantity: 12, raw_line: '12x30l + 12xpet 1,0l desitka' })).toBeNull();
    expect(balení({ quantity: 12, package_label: 'PET 1l', raw_line: '12x30l + 12xpet 1,0l desitka' })).toBe('PET 1l');
    // objem má jen druhá položka se stejným počtem — první ho převzít nesmí
    expect(vyslovne({ quantity: 2, raw_line: '2x50 12sv 2x30l jantar' })).toBeNull();
    expect(balení({ quantity: 2, package_label: 'KEG 50l', raw_line: '2x50 12sv 2x30l jantar' })).toBe('KEG 50l');
    expect(vyslovne({ quantity: 2, raw_line: '2x50 12sv 1x30l jantar' })).toBeNull();
    // víc kusů a množství položky není známé
    expect(vyslovne({ raw_line: '3x50l + 4x30l' })).toBeNull();
    // dva objemy v jednom kusu
    expect(vyslovne({ quantity: 2, raw_line: '2x 10l 11°sv peta1,5p' })).toBeNull();
  });

  it('holé číslo obal od AI nepřebije („4x10" pod nadpisem „petky 1,5l:")', () => {
    expect(vyslovne({ quantity: 4, raw_line: '4x10' })).toBeNull();
    expect(balení({ quantity: 4, package_label: 'PET 1.5l', raw_line: '4x10' })).toBe('PET 1.5l');
    expect(balení({ quantity: 6, package_label: 'PET 1.5l', raw_line: '6x11' })).toBe('PET 1.5l');
  });

  it('výsledný stav upravované objednávky s textem citované zprávy: obal mohla odpověď změnit', () => {
    const polozka = { quantity: 2, package_label: 'KEG 30l', raw_line: '2x50l 12sv' };
    expect(balení(polozka)).toBe('KEG 50l');
    expect(balení({ ...polozka, z_citace: true })).toBe('KEG 30l');
  });

  it('objem, který v katalogu není, neurčí nic', () => {
    expect(obalVyslovneVRadku({ quantity: 2, raw_line: '2x 20l desitka' }, PACKAGES.filter((p) => p.volume_l !== 20))).toBeNull();
  });
});

describe('Lahve a bedny bez udané velikosti: podle toho, co odběratel bere', () => {
  it('pozná řádek o lahvích bez velikosti', () => {
    for (const r of ['5 beden světlého a 3 tmavého', '2 basy sklo 12sv', '4 bedny svetle 12', '1 bedna tmavého piva', '20 lahví 12sv', '3 přepravky jantar']) {
      expect(jeLahevBezObjemu(r), r).toBe(true);
    }
    for (const r of ['Sklo 0,33l.', '2xbasa třetinek 12sv', '20x0,5l lahev', '2x30l 12sv', '10 petek 12°', '', null]) {
      expect(jeLahevBezObjemu(r), String(r)).toBe(false);
    }
  });

  // 9. 11. 2026 (Lužec): „5 beden světlého a 3 tmavého" se zapsalo jako 0,5 l —
  // Lužec přitom bere třetinky. AI podle pravidla vrací půllitr.
  it('odběratel bere třetinky → bedna je 0,33 l', () => {
    const zvyk = { lahevOdberatele: 0.33 };
    expect(balení({ quantity: 100, package_label: 'Lahve 0.5l', raw_line: '5 beden světlého' }, prazdneAliasy(), zvyk)).toBe('Lahve 0.33l');
    expect(balení({ quantity: 60, package_label: 'Lahve 0.5l', raw_line: 'a 3 tmavého, 5 beden světlého' }, prazdneAliasy(), zvyk)).toBe('Lahve 0.33l');
    expect(balení({ quantity: 40, package_label: 'Lahve 0.33l', raw_line: 'A jeste prosim dve basy sklo 12sv' }, prazdneAliasy(), zvyk)).toBe('Lahve 0.33l');
    // AI obal nevrátila vůbec
    expect(balení({ quantity: 40, package_label: '', raw_line: '2 basy sklo 12sv' }, prazdneAliasy(), zvyk)).toBe('Lahve 0.33l');
    // AI řádek rozdělila a slovo „beden" zůstalo jen u první položky
    expect(balení({ quantity: 60, package_label: 'Lahve 0.5l', raw_line: '3 tmavého' }, prazdneAliasy(), zvyk)).toBe('Lahve 0.33l');
  });

  it('řádek bez slova o lahvích a bez zvyku třetinek: velikost od AI zůstává (mohla být v nadpisu zprávy)', () => {
    expect(balení({ quantity: 20, package_label: 'Lahve 0.33l', raw_line: '20x 12sv' })).toBe('Lahve 0.33l');
    expect(balení({ quantity: 20, package_label: 'Lahve 0.5l', raw_line: '20x 12sv' })).toBe('Lahve 0.5l');
    expect(balení({ quantity: 20, package_label: 'Lahve 0.33l', raw_line: '20x 12sv' }, prazdneAliasy(), { lahevOdberatele: 0.5 })).toBe('Lahve 0.33l');
  });

  it('bez zvyku (nový odběratel, smíšený odběr) nebo se zvykem 0,5 → 0,5 l', () => {
    for (const volby of [undefined, {}, { lahevOdberatele: null }, { lahevOdberatele: 0.5 }]) {
      expect(balení({ quantity: 100, package_label: 'Lahve 0.5l', raw_line: '5 beden světlého' }, prazdneAliasy(), volby)).toBe('Lahve 0.5l');
      expect(balení({ quantity: 40, package_label: 'Lahve 0.33l', raw_line: 'A jeste prosim dve basy sklo 12sv' }, prazdneAliasy(), volby)).toBe('Lahve 0.5l');
      expect(balení({ quantity: 40, package_label: '', raw_line: '2 basy sklo 12sv' }, prazdneAliasy(), volby)).toBe('Lahve 0.5l');
    }
  });

  it('velikost napsaná v řádku má přednost před zvykem', () => {
    const zvyk = { lahevOdberatele: 0.33 };
    expect(balení({ quantity: 20, package_label: 'Lahve 0.33l', raw_line: '1 bedna 0,5l 12sv' }, prazdneAliasy(), zvyk)).toBe('Lahve 0.5l');
    expect(balení({ quantity: 20, package_label: 'Lahve 0.5l', raw_line: '20x0,5l lahev' }, prazdneAliasy(), zvyk)).toBe('Lahve 0.5l');
  });

  it('lahevBezUdaneVelikosti: velikost v řádku → nic se nevnucuje; jinak zvyk třetinek, u „basy sklo" půllitr', () => {
    expect(lahevBezUdaneVelikosti('1 bedna 0,5l 12sv', 0.33)).toBeNull();
    expect(lahevBezUdaneVelikosti('2 basy třetinek', 0.5)).toBeNull();
    expect(lahevBezUdaneVelikosti('5 beden světlého', 0.33)).toBe(0.33);
    expect(lahevBezUdaneVelikosti('3 tmavého', 0.33)).toBe(0.33);
    expect(lahevBezUdaneVelikosti('5 beden světlého', null)).toBe(0.5);
    expect(lahevBezUdaneVelikosti('5 beden světlého', 0.5)).toBe(0.5);
    expect(lahevBezUdaneVelikosti('3 tmavého', null)).toBeNull();
    expect(lahevBezUdaneVelikosti(null, undefined)).toBeNull();
  });

  // Řádek sdílený dvěma položkami, velikost je napsaná jen u jedné: krok 0 neurčí
  // nic (množství 60 v textu není) a zvyk se tu nevnucuje — platí obal od AI.
  it('řádek s velikostí u jiné položky: zvyk třetinek obal od AI nepřepíše', () => {
    const RADEK = '2 bedny 0,5l světlé a 3 bedny tmavé';
    expect(balení({ quantity: 60, package_label: 'Lahve 0.5l', raw_line: RADEK }, prazdneAliasy(), { lahevOdberatele: 0.33 })).toBe('Lahve 0.5l');
  });

  it('zvyk u lahví se netýká sudů ani petek', () => {
    const zvyk = { lahevOdberatele: 0.33 };
    expect(balení({ quantity: 2, package_label: 'KEG 30l', raw_line: '2x30 12sv' }, prazdneAliasy(), zvyk)).toBe('KEG 30l');
    expect(balení({ quantity: 10, package_label: 'PET 1.5l', raw_line: '10 petek 12°' }, prazdneAliasy(), zvyk)).toBe('PET 1.5l');
    // řádek mluví o bednách, ale AI v něm našla petky — velikost lahve se nevnucuje
    expect(balení({ quantity: 12, package_label: 'PET 1l', raw_line: '2 bedny petek 12sv' }, prazdneAliasy(), zvyk)).toBe('PET 1l');
  });
});

describe('Potichu naučené zkratky obalů pravidlem nejsou (zkratkaObaluPlati)', () => {
  // Skutečné řádky z tabulky parser_aliases (23. 11. 2026).
  it.each(['30l', '50l', '10l', '0.5l', '0.33l', '1l', 'keg 15l', 'keg 30l', 'lahve 0.5l', '2x10', '7x30', '1x50 12', '12° svetla', 'citron 5x', '12 4x', '10x 11 10° sv'])(
    '„%s" obal neurčuje', (zkratka) => { expect(zkratkaObaluPlati(zkratka)).toBe(false); },
  );
  it.each(['maly soudek', 'velka flasa', 'petka', 'basa', '2 bedny svetle', 'velký sud'])(
    '„%s" obal pojmenovává', (zkratka) => { expect(zkratkaObaluPlati(zkratka)).toBe(true); },
  );

  it('otrávené zkratky se při čtení nepoužijí', () => {
    const a = prazdneAliasy();
    a.package.set('12° svetla', 'p-lahev05');
    a.package.set('citron 5x', 'p-pet1');
    a.package.set('30l', 'p-pet1');
    a.package.set('keg 15l', 'p-keg20');
    a.package.set('0.33l', 'p-lahev05');
    // dřív: „12° svetla" v řádku → lahev 0,5 l, „citron 5x" → PET 1 l
    expect(balení({ quantity: 2, package_label: '', raw_line: '2x 12° světlá' }, a)).toBeNull();
    expect(balení({ quantity: 5, package_label: '', raw_line: 'citron 5x' }, a)).toBeNull();
    expect(balení({ quantity: 3, package_label: 'KEG 15l', raw_line: '3x15l 11sv' }, a)).toBe('KEG 15l');
    expect(balení({ quantity: 4, package_label: 'KEG 30l', raw_line: '4x30l desitka' }, a)).toBe('KEG 30l');
    expect(balení({ quantity: 20, package_label: 'Lahve 0.33l', raw_line: '1 bedna 0,33 tmave' }, a)).toBe('Lahve 0.33l');
  });

  it('pojmenování obalu slovem platí dál', () => {
    const a = prazdneAliasy();
    a.package.set('maly soudek', 'p-keg15');
    expect(balení({ quantity: 3, package_label: '', raw_line: '3x malý soudek 11sv' }, a)).toBe('KEG 15l');
  });
});

describe('12sv je 12° Světlá, ne Jantar — a polotmavé je Jantar, ne tmavá', () => {
  it('pivo napsané v řádku položky přebije název od AI', () => {
    expect(pivo({ quantity: 1, degree: '12°', beer_name: 'Jantar', package_label: 'KEG 30l', raw_line: '1x30l 12sv' })).toBe('12° Světlá');
    expect(pivo({ quantity: 2, degree: '12°', beer_name: '12° Světlá', package_label: 'KEG 30l', raw_line: '2x30l jantar' })).toBe('Jantar');
  });

  // 17. 11. 2026 (Seeberg): „1x30l 12sv / 2x30l jantar". I kdyby AI ke každé
  // položce přiložila celou zprávu a piva prohodila, rozhoduje řádek položky.
  it('celá zpráva u obou položek a prohozené názvy od AI', () => {
    const ZPRAVA = 'Seeberg\n1x30l 12sv\n2x30l jantar';
    expect(pivo({ quantity: 1, degree: '12°', beer_name: 'Jantar', package_label: 'KEG 30l', raw_line: ZPRAVA })).toBe('12° Světlá');
    expect(pivo({ quantity: 2, degree: null, beer_name: '12° Světlá', package_label: 'KEG 30l', raw_line: ZPRAVA })).toBe('Jantar');
  });

  it('„polotmavé" je Jantar', () => {
    expect(pivo({ quantity: 3, raw_line: '3x polotmave 1,5l' })).toBe('Jantar');
    expect(pivo({ quantity: 2, raw_line: '2x30 polotmavý ležák' })).toBe('Jantar');
    expect(pivo({ quantity: 2, degree: '12°', beer_name: '12° Tmavá', raw_line: '2x30l polotmavé 12' })).toBe('Jantar');
  });

  it('„polotmavé" není tmavá ani v katalogu bez Jantaru — pivo zůstane neurčené', () => {
    const BEZ_JANTARU = BEERS.filter((b) => b.id !== 'b-jantar');
    expect(matchBeerId({ quantity: 2, raw_line: '2x30 polotmavé' }, BEZ_JANTARU, prazdneAliasy())).toBeNull();
    expect(barvaVTextu('polotmavé')).toBeNull();
    expect(barvaVTextu('2x30 polotmavy lezak')).toBeNull();
    expect(barvaVTextu('tmavé')).toBe('tmave');
    expect(barvaVTextu('12tm')).toBe('tmave');
  });

  it('„tmavé" zůstává tmavá', () => {
    expect(pivo({ quantity: 2, raw_line: '2x30l tmavé' })).toBe('12° Tmavá');
    expect(pivo({ quantity: 5, degree: '12°', beer_name: '12° Světlá', raw_line: '5 beden 12tm' })).toBe('12° Tmavá');
  });
});
