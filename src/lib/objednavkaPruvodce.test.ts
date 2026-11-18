// 🧭 Průvodce zadáním objednávky — čistý model.
//
// Majitel 18. 11. 2026: „udělej ty objednávky tak jako první návrh" (třikrokové
// zadání jako Fasování). Tady se hlídá všechno, co se dá zkoušet bez obrazovky:
// koncept objednávky, dny závozu, místa závozu, řádky, souhrny a kontrola kroků.
import { describe, expect, it } from 'vitest';
import {
  chybaKroku, datumKratce, denKlic, jeDalsiMesic, konceptMaObsah, mistaKVolbe, mnozstvi, nabidkaDnu, nejcastejsiObal,
  nastavBezZavozu, nastavDatum, nastavDen, nastavMisto, nastavMnozstvi, obalyProPanel, odberatelKonceptu, odeberRadek,
  pocetSlov, popisMist, popisObalu, popisObsahu, popisSouctu, popisZavozu, posledniObjednavka, potvrdDalsiMesic,
  prazdnyKoncept, skupinaObalu, skupinyPodlePiv, souctyObjednavky, stitekPiva, ucinnyZavoz, vyberOdberatele,
  zalohaRychlych, zopakujPolozky, zrusVyberDne,
  type KonceptObjednavky, type OdberatelPruvodce, type RadekKonceptu,
} from './objednavkaPruvodce';
import { HLAVNI_MISTO } from './mistaZavozu';

// Středa 18. 11. 2026 — den, kdy majitel o průvodci psal.
const DNES = '2026-11-18';

const mista = [
  { id: 'sklad', nazev: 'Sklad', adresa: null, lat: null, lng: null },
  { id: 'drobak', nazev: 'Drobák', adresa: 'Drobná 3, Praha', lat: null, lng: null },
];

const odberatele: OdberatelPruvodce[] = [
  { id: 'p-radek', name: 'Radek', address: 'Lipová 1, Hradec Králové, 500 02', mista_zavozu: mista },
  { id: 'p-zizkov', name: 'Žižkov', address: 'Seifertova 5, Praha' },
  { id: 'p-seeberg', name: 'Seeberg', vychozi_den_zavozu: 'pa' },
  { id: 'p-rest', name: 'Restaurace', vychozi_den_zavozu: 'zadny' },
  { id: 'p-mates', name: 'Mates' },
];

// Katalog obalů v pořadí, v jakém jde všude v aplikaci: sudy 50…10, pak 1,5 l, 1 l, 0,5 l, 0,33 l.
const obaly = [
  { id: 'k50', kind: 'keg', volume_l: 50, label: 'KEG 50l', sort_order: 1 },
  { id: 'k30', kind: 'keg', volume_l: 30, label: 'KEG 30l', sort_order: 2 },
  { id: 'k20', kind: 'keg', volume_l: 20, label: 'KEG 20l', sort_order: 3 },
  { id: 'k15', kind: 'keg', volume_l: 15, label: 'KEG 15l', sort_order: 4 },
  { id: 'k10', kind: 'keg', volume_l: 10, label: 'KEG 10l', sort_order: 5 },
  { id: 'l15', kind: 'bottle', volume_l: 1.5, label: 'PET 1,5l', sort_order: 6 },
  { id: 'l1', kind: 'bottle', volume_l: 1, label: 'PET 1l', sort_order: 7 },
  { id: 'l05', kind: 'bottle', volume_l: 0.5, label: 'Lahev 0,5l', sort_order: 8 },
  { id: 'l033', kind: 'bottle', volume_l: 0.33, label: 'Lahev 0,33l', sort_order: 9 },
];
const piva = [
  { id: 'b12', name: '12° Světlá', short_name: null, sort_order: 1 },
  { id: 'b11', name: '11° Světlá', short_name: null, sort_order: 2 },
  { id: 'jantar', name: 'Jantar', short_name: null, sort_order: 5 },
];

const radek = (id: string, beerId: string, pkgId: string, qty: number): RadekKonceptu => ({ id, beerId, pkgId, qty });

describe('koncept a výběr odběratele', () => {
  it('prázdný koncept nemá co ztratit; rozepsaný ano', () => {
    const k = prazdnyKoncept();
    expect(konceptMaObsah(k)).toBe(false);
    expect(konceptMaObsah({ ...k, placeName: 'Radek' })).toBe(true);
    expect(konceptMaObsah({ ...k, poznamka: 'zavolat' })).toBe(true);
    expect(konceptMaObsah({ ...k, radky: [radek('1', 'b12', 'k50', 1)] })).toBe(true);
    // Samé mezery jsou prázdné.
    expect(konceptMaObsah({ ...k, placeName: '   ', poznamka: ' ' })).toBe(false);
  });

  it('vybraný odběratel se zapíše s id i jménem', () => {
    const k = vyberOdberatele(prazdnyKoncept(), { id: 'p-zizkov', name: 'Žižkov' });
    expect(k.placeId).toBe('p-zizkov');
    expect(k.placeName).toBe('Žižkov');
  });

  it('nový odběratel podle napsaného jména nemá id a jméno se ořízne', () => {
    const k = vyberOdberatele(prazdnyKoncept(), null, '  U Lípy ');
    expect(k.placeId).toBe('');
    expect(k.placeName).toBe('U Lípy');
  });

  it('jiný odběratel zruší zvolené místo závozu, stejný ho nechá', () => {
    let k = vyberOdberatele(prazdnyKoncept(), { id: 'p-radek', name: 'Radek' });
    k = nastavMisto(k, 'sklad');
    expect(vyberOdberatele(k, { id: 'p-radek', name: 'Radek' }).mistoZavozu).toBe('sklad');
    expect(vyberOdberatele(k, { id: 'p-zizkov', name: 'Žižkov' }).mistoZavozu).toBeNull();
  });

  it('„Bez závozu" se zaškrtne podle jména (Mates, Restaurace), jinak ne', () => {
    expect(vyberOdberatele(prazdnyKoncept(), { id: 'p-mates', name: 'Mates' }).bezZavozu).toBe(true);
    expect(vyberOdberatele(prazdnyKoncept(), { id: 'p-rest', name: 'Restaurace' }).bezZavozu).toBe(true);
    expect(vyberOdberatele(prazdnyKoncept(), { id: 'p-radek', name: 'Radek' }).bezZavozu).toBe(false);
  });

  it('co člověk u „Bez závozu" přepnul sám, automatika nepřepíše', () => {
    // Mates má bez závozu, člověk ho odškrtne a vybere jiného odběratele i zpět.
    let k = vyberOdberatele(prazdnyKoncept(), { id: 'p-mates', name: 'Mates' });
    k = nastavBezZavozu(k, false);
    expect(vyberOdberatele(k, { id: 'p-rest', name: 'Restaurace' }).bezZavozu).toBe(false);
    // A naopak: zaškrtl u obyčejného odběratele a ten zůstane zaškrtnutý i po změně odběratele.
    let j = vyberOdberatele(prazdnyKoncept(), { id: 'p-radek', name: 'Radek' });
    j = nastavBezZavozu(j, true);
    expect(vyberOdberatele(j, { id: 'p-zizkov', name: 'Žižkov' }).bezZavozu).toBe(true);
  });

  it('odběratele koncept najde podle id, jinak podle jména bez diakritiky a velikosti písmen', () => {
    expect(odberatelKonceptu({ ...prazdnyKoncept(), placeId: 'p-radek', placeName: 'Radek' }, odberatele)?.id).toBe('p-radek');
    expect(odberatelKonceptu({ ...prazdnyKoncept(), placeName: 'zizkov' }, odberatele)?.id).toBe('p-zizkov');
    expect(odberatelKonceptu({ ...prazdnyKoncept(), placeName: 'Neznámý' }, odberatele)).toBeNull();
    expect(odberatelKonceptu(prazdnyKoncept(), odberatele)).toBeNull();
  });
});

describe('místa závozu', () => {
  it('odběratel s víc místy nabízí hlavní adresu a další místa', () => {
    const volby = mistaKVolbe(odberatele[0]);
    expect(volby.map((v) => v.id)).toEqual([HLAVNI_MISTO, 'sklad', 'drobak']);
    expect(volby[0].nazev).not.toBe('');
    expect(volby.slice(1).map((v) => v.nazev)).toEqual(['Sklad', 'Drobák']);
    expect(volby[2].adresa).toBe('Drobná 3, Praha');
  });

  it('odběratel s jedním místem (nebo žádný) nic nenabízí', () => {
    expect(mistaKVolbe(odberatele[1])).toEqual([]);
    expect(mistaKVolbe(null)).toEqual([]);
    expect(mistaKVolbe(undefined)).toEqual([]);
  });

  it('popis míst na dlaždici odběratele', () => {
    expect(popisMist(odberatele[0])).toBe('Sklad · Drobák');
    expect(popisMist(odberatele[1])).toBe('');
  });
});

describe('dny závozu', () => {
  it('nabídka je od dneška, bez nedělí, šest dnů', () => {
    const dny = nabidkaDnu(DNES);
    expect(dny.map((d) => `${d.zkratka} ${d.kratce}`)).toEqual([
      'St 18. 11.', 'Čt 19. 11.', 'Pá 20. 11.', 'So 21. 11.', 'Po 23. 11.', 'Út 24. 11.',
    ]);
    expect(dny.map((d) => d.den)).toEqual(['st', 'ct', 'pa', 'so', 'po', 'ut']);
    expect(dny[0].jeDnes).toBe(true);
    expect(dny.slice(1).some((d) => d.jeDnes)).toBe(false);
    expect(dny[0].datum).toBe('2026-11-18');
  });

  it('když je dnes neděle, nabídka začíná pondělím a „dnes" v ní není', () => {
    const dny = nabidkaDnu('2026-11-22');
    expect(dny[0].datum).toBe('2026-11-23');
    expect(dny.some((d) => d.jeDnes)).toBe(false);
    expect(dny).toHaveLength(6);
  });

  it('přes konec měsíce a roku se datum počítá správně', () => {
    const dny = nabidkaDnu('2026-12-30', 3);
    expect(dny.map((d) => d.datum)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
    expect(dny[2].kratce).toBe('1. 1.');
  });

  it('den v týdnu a krátké datum', () => {
    expect(denKlic('2026-11-18')).toBe('st');
    expect(denKlic('2026-11-22')).toBe('ne');
    expect(denKlic('2026-11-16')).toBe('po');
    expect(datumKratce('2026-11-05')).toBe('5. 11.');
  });

  it('výběr dne z nabídky nastaví den i datum a zruší potvrzení měsíce', () => {
    const k = potvrdDalsiMesic(prazdnyKoncept(), true);
    const n = nastavDen(k, { den: 'pa', datum: '2026-11-20' });
    expect(n).toMatchObject({ den: 'pa', datum: '2026-11-20', potvrzenoDalsiMesic: false });
  });

  it('datum z kalendáře dopočte den; špatné nebo prázdné vrátí výchozí den', () => {
    expect(nastavDatum(prazdnyKoncept(), '2026-11-21')).toMatchObject({ den: 'so', datum: '2026-11-21' });
    expect(nastavDatum(prazdnyKoncept(), '2026-11-22')).toMatchObject({ den: 'ne', datum: '2026-11-22' });
    const vybrane = nastavDen(prazdnyKoncept(), { den: 'pa', datum: '2026-11-20' });
    expect(nastavDatum(vybrane, '')).toMatchObject({ den: '', datum: '' });
    expect(nastavDatum(vybrane, 'blbost')).toMatchObject({ den: '', datum: '' });
    expect(zrusVyberDne(vybrane)).toMatchObject({ den: '', datum: '' });
  });
});

describe('den, se kterým se objednávka uloží', () => {
  const pro = (jmeno: string, id: string, k: Partial<KonceptObjednavky> = {}) =>
    ({ ...vyberOdberatele(prazdnyKoncept(), { id, name: jmeno }), ...k });

  it('bez výběru je to výchozí den odběratele: středa (dnes je středa)', () => {
    const z = ucinnyZavoz(pro('Radek', 'p-radek'), odberatele, DNES);
    expect(z).toEqual({ den: 'st', datum: '2026-11-18', vychozi: true });
  });

  it('Seeberg má výchozí pátek, Restaurace žádný den', () => {
    expect(ucinnyZavoz(pro('Seeberg', 'p-seeberg'), odberatele, DNES)).toEqual({ den: 'pa', datum: '2026-11-20', vychozi: true });
    // „Bez závozu" je u Restaurace zaškrtnuté samo, takže se odečte dnes; po odškrtnutí zůstane bez dne.
    const bez = ucinnyZavoz(pro('Restaurace', 'p-rest'), odberatele, DNES);
    expect(bez).toEqual({ den: 'st', datum: DNES, vychozi: true });
    const sZavozem = ucinnyZavoz(nastavBezZavozu(pro('Restaurace', 'p-rest'), false), odberatele, DNES);
    expect(sZavozem).toEqual({ den: null, datum: null, vychozi: true });
    expect(popisZavozu(sZavozem)).toBe('bez pevného dne');
  });

  it('ručně vybraný den se nikdy nepřepíše', () => {
    const k = nastavDen(pro('Seeberg', 'p-seeberg'), { den: 'ut', datum: '2026-11-24' });
    expect(ucinnyZavoz(k, odberatele, DNES)).toEqual({ den: 'ut', datum: '2026-11-24', vychozi: false });
  });

  it('popis závozu: den a datum', () => {
    expect(popisZavozu({ den: 'ct', datum: '2026-11-19', vychozi: false })).toBe('Čt 19. 11.');
    expect(popisZavozu({ den: 'st', datum: null, vychozi: false })).toBe('St');
  });

  it('závoz v dalším měsíci se pozná', () => {
    expect(jeDalsiMesic('2026-12-01', DNES)).toBe(true);
    expect(jeDalsiMesic('2026-11-30', DNES)).toBe(false);
    expect(jeDalsiMesic('2026-10-30', DNES)).toBe(false);
    expect(jeDalsiMesic(null, DNES)).toBe(false);
    expect(jeDalsiMesic('', DNES)).toBe(false);
  });
});

describe('řádky objednávky', () => {
  it('nové pivo v obalu se přidá, stejné se přepíše, nula ho smaže', () => {
    let r: RadekKonceptu[] = [];
    r = nastavMnozstvi(r, 'b12', 'k50', 2, 'a');
    r = nastavMnozstvi(r, 'b12', 'k30', 1, 'b');
    expect(r).toEqual([radek('a', 'b12', 'k50', 2), radek('b', 'b12', 'k30', 1)]);
    r = nastavMnozstvi(r, 'b12', 'k50', 5, 'x');
    expect(r).toEqual([radek('a', 'b12', 'k50', 5), radek('b', 'b12', 'k30', 1)]);
    r = nastavMnozstvi(r, 'b12', 'k50', 0);
    expect(r).toEqual([radek('b', 'b12', 'k30', 1)]);
    // Nula u neexistujícího řádku nic nepřidá.
    expect(nastavMnozstvi(r, 'b11', 'l1', 0)).toEqual(r);
  });

  it('nesmysl v počtu se čte jako nula, desetinné se zaokrouhlí dolů, strop je 9999', () => {
    expect(nastavMnozstvi([], 'b12', 'k50', -3)).toEqual([]);
    expect(nastavMnozstvi([], 'b12', 'k50', Number.NaN)).toEqual([]);
    expect(nastavMnozstvi([], 'b12', 'k50', 2.9, 'a')).toEqual([radek('a', 'b12', 'k50', 2)]);
    expect(nastavMnozstvi([], 'b12', 'k50', 123456, 'a')).toEqual([radek('a', 'b12', 'k50', 9999)]);
  });

  it('duplicitní řádek téhož piva a obalu se při úpravě sloučí do prvního', () => {
    const r = [radek('a', 'b12', 'k50', 1), radek('b', 'b11', 'k50', 2), radek('c', 'b12', 'k50', 4)];
    expect(nastavMnozstvi(r, 'b12', 'k50', 3)).toEqual([radek('a', 'b12', 'k50', 3), radek('b', 'b11', 'k50', 2)]);
    expect(nastavMnozstvi(r, 'b12', 'k50', 0)).toEqual([radek('b', 'b11', 'k50', 2)]);
  });

  it('počet vyčte i ze zdvojených řádků a odebrání řádku nechá ostatní', () => {
    const r = [radek('a', 'b12', 'k50', 1), radek('b', 'b12', 'k50', 4), radek('c', 'b11', 'l1', 6)];
    expect(mnozstvi(r, 'b12', 'k50')).toBe(5);
    expect(mnozstvi(r, 'b12', 'l1')).toBe(0);
    expect(odeberRadek(r, 'b')).toEqual([radek('a', 'b12', 'k50', 1), radek('c', 'b11', 'l1', 6)]);
    expect(odeberRadek(r, 'nic')).toEqual(r);
  });

  it('řádky se nemění na místě', () => {
    const r = Object.freeze([Object.freeze(radek('a', 'b12', 'k50', 1))]) as readonly RadekKonceptu[];
    expect(() => nastavMnozstvi(r, 'b12', 'k50', 2)).not.toThrow();
    expect(() => odeberRadek(r, 'a')).not.toThrow();
  });
});

describe('obaly', () => {
  it('v panelu jdou nejdřív sudy od největšího, pak lahve litr, půltoraka, půllitr, 0,33', () => {
    const rozhazene = [obaly[8], obaly[0], obaly[6], obaly[4], obaly[7], obaly[5], obaly[2], obaly[1], obaly[3]];
    expect(obalyProPanel(rozhazene).map((o) => o.id)).toEqual(['k50', 'k30', 'k20', 'k15', 'k10', 'l1', 'l15', 'l05', 'l033']);
  });

  it('popis obalu je objem v litrech s desetinnou čárkou', () => {
    expect(popisObalu(obaly[0])).toBe('50 l');
    expect(popisObalu(obaly[5])).toBe('1,5 l');
    expect(popisObalu(obaly[8])).toBe('0,33 l');
    expect(popisObalu(undefined)).toBe('obal');
  });

  it('první nabídnutý obal je ten, ve kterém se pivo nejčastěji objednává; bez historie sud 50 l', () => {
    const historie = [
      { beer_id: 'b11', package_id: 'l1' }, { beer_id: 'b11', package_id: 'l1' }, { beer_id: 'b11', package_id: 'k50' },
      { beer_id: 'b12', package_id: 'k30' }, { beer_id: 'jiny', package_id: 'l033' }, { beer_id: 'b11', package_id: null },
    ];
    const poradi = obalyProPanel(obaly);
    expect(nejcastejsiObal(historie, 'b11', poradi)?.id).toBe('l1');
    expect(nejcastejsiObal(historie, 'b12', poradi)?.id).toBe('k30');
    expect(nejcastejsiObal(historie, 'jantar', poradi)?.id).toBe('k50');
    expect(nejcastejsiObal([], 'b11', poradi)?.id).toBe('k50');
    expect(nejcastejsiObal(historie, 'b11', [])).toBeUndefined();
    // Při shodě rozhoduje pořadí panelu (sud před lahví).
    expect(nejcastejsiObal([{ beer_id: 'b11', package_id: 'l1' }, { beer_id: 'b11', package_id: 'k30' }], 'b11', poradi)?.id).toBe('k30');
  });

  it('skupina nad obaly a záloha rychlých čísel', () => {
    expect(skupinaObalu(obaly[0])).toBe('Sudy');
    expect(skupinaObalu(obaly[6])).toBe('Lahve');
    expect(zalohaRychlych(obaly[0])).toEqual([1, 2, 3, 4, 5]);
    expect(zalohaRychlych(obaly[6])).toEqual([6, 12, 18, 24, 48]);
    expect(zalohaRychlych(obaly[7])).toEqual([10, 20, 40, 60, 80]);
    expect(zalohaRychlych(undefined)).toEqual([]);
  });
});

describe('souhrny', () => {
  const radky = [
    radek('1', 'b11', 'l1', 10),
    radek('2', 'b12', 'k30', 1),
    radek('3', 'b12', 'k50', 2),
  ];

  it('souhrn je po pivech v pořadí katalogu a v pivu od největšího obalu', () => {
    const s = skupinyPodlePiv(radky, obaly, piva);
    expect(s.map((x) => x.beerId)).toEqual(['b12', 'b11']);
    expect(s[0].radky.map((r) => r.text)).toEqual(['2× 50 l', '1× 30 l']);
    expect(s[1].radky.map((r) => r.text)).toEqual(['10× 1 l']);
    expect(s[0].pivo?.name).toBe('12° Světlá');
  });

  it('řádek s pivem, které už v katalogu není, se v souhrnu neztratí', () => {
    const s = skupinyPodlePiv([radek('9', 'zmizele', 'k50', 3)], obaly, piva);
    expect(s).toHaveLength(1);
    expect(s[0].pivo).toBeUndefined();
    expect(s[0].radky[0].text).toBe('3× 50 l');
  });

  it('štítek na dlaždici piva jako ve Fasování: „2×50, 1×30"', () => {
    expect(stitekPiva(radky, 'b12', obaly, piva)).toBe('2×50, 1×30');
    expect(stitekPiva(radky, 'b11', obaly, piva)).toBe('10×1');
    expect(stitekPiva(radky, 'jantar', obaly, piva)).toBe('');
    expect(stitekPiva([radek('1', 'b12', 'l15', 12)], 'b12', obaly, piva)).toBe('12×1,5');
  });

  it('součty: litry v sudech, lahve, počet piv a položek', () => {
    expect(souctyObjednavky(radky, obaly)).toEqual({ polozek: 3, piv: 2, sudu: 3, litruVSudech: 130, lahvi: 10 });
    expect(souctyObjednavky([], obaly)).toEqual({ polozek: 0, piv: 0, sudu: 0, litruVSudech: 0, lahvi: 0 });
  });

  it('česká množná čísla a popisy souhrnu', () => {
    expect(pocetSlov(1, 'lahev', 'lahve', 'lahví')).toBe('1 lahev');
    expect(pocetSlov(2, 'lahev', 'lahve', 'lahví')).toBe('2 lahve');
    expect(pocetSlov(4, 'lahev', 'lahve', 'lahví')).toBe('4 lahve');
    expect(pocetSlov(5, 'lahev', 'lahve', 'lahví')).toBe('5 lahví');
    expect(pocetSlov(0, 'lahev', 'lahve', 'lahví')).toBe('0 lahví');
    expect(popisSouctu(souctyObjednavky(radky, obaly))).toBe('130 l v sudech · 10 lahví');
    expect(popisSouctu(souctyObjednavky([radek('1', 'b12', 'k15', 1)], obaly))).toBe('15 l v sudech');
    expect(popisSouctu(souctyObjednavky([radek('1', 'b12', 'l1', 1)], obaly))).toBe('1 lahev');
    expect(popisSouctu(souctyObjednavky([], obaly))).toBe('');
    expect(popisObsahu(souctyObjednavky(radky, obaly))).toBe('2 piva · 3 položky');
    expect(popisObsahu(souctyObjednavky([], obaly))).toBe('zatím nic');
  });

  it('desetinné litry sudů se nezkreslí (0,5 sudu neexistuje, ale 7,5 l ano)', () => {
    const s = souctyObjednavky([radek('1', 'b12', 'k15', 3)], [{ id: 'k15', kind: 'keg', volume_l: 7.5 }]);
    expect(s.litruVSudech).toBe(22.5);
    expect(popisSouctu(s)).toBe('22,5 l v sudech');
  });
});

describe('kontrola kroků', () => {
  const ctx = { odberatele, dnes: DNES };
  const zRadkem = (k: KonceptObjednavky) => ({ ...k, radky: [radek('1', 'b12', 'k50', 1)] });

  it('bez odběratele se nikam nejde', () => {
    expect(chybaKroku(prazdnyKoncept(), 'odberatel', ctx)).toBe('Vyber odběratele.');
    expect(chybaKroku(prazdnyKoncept(), 'souhrn', ctx)).toBe('Vyber odběratele.');
  });

  it('odběratel s jedním místem jde dál hned, s víc místy až po výběru místa', () => {
    const zizkov = vyberOdberatele(prazdnyKoncept(), { id: 'p-zizkov', name: 'Žižkov' });
    expect(chybaKroku(zizkov, 'odberatel', ctx)).toBeNull();
    const radek1 = vyberOdberatele(prazdnyKoncept(), { id: 'p-radek', name: 'Radek' });
    expect(chybaKroku(radek1, 'odberatel', ctx)).toMatch(/kam se veze/);
    expect(chybaKroku(nastavMisto(radek1, 'sklad'), 'odberatel', ctx)).toBeNull();
    // Hlavní adresa je taky výslovná volba.
    expect(chybaKroku(nastavMisto(radek1, HLAVNI_MISTO), 'odberatel', ctx)).toBeNull();
  });

  it('nový odběratel (jen jméno) projde, pokud se nepodobá odběrateli s víc místy', () => {
    const novy = vyberOdberatele(prazdnyKoncept(), null, 'U Lípy');
    expect(chybaKroku(novy, 'odberatel', ctx)).toBeNull();
    // Napsané „radek" je ale Radek z katalogu — i s jeho místy.
    expect(chybaKroku(vyberOdberatele(prazdnyKoncept(), null, 'radek'), 'odberatel', ctx)).toMatch(/kam se veze/);
  });

  it('závoz v dalším měsíci chce potvrzení', () => {
    let k = vyberOdberatele(prazdnyKoncept(), { id: 'p-zizkov', name: 'Žižkov' });
    k = nastavDatum(k, '2026-12-02');
    expect(chybaKroku(k, 'odberatel', ctx)).toMatch(/dalšího měsíce/);
    expect(chybaKroku(potvrdDalsiMesic(k, true), 'odberatel', ctx)).toBeNull();
    // Změna data potvrzení zruší.
    expect(chybaKroku(nastavDatum(potvrdDalsiMesic(k, true), '2026-12-03'), 'odberatel', ctx)).toMatch(/dalšího měsíce/);
  });

  it('i výchozí den v dalším měsíci chce potvrzení (poslední týden měsíce)', () => {
    // Středa 25. 11. → výchozí den závozu nového odběratele je ten den; v pondělí 30. 11. už středa 2. 12.
    const k = vyberOdberatele(prazdnyKoncept(), { id: 'p-zizkov', name: 'Žižkov' });
    expect(chybaKroku(k, 'odberatel', { odberatele, dnes: '2026-11-30' })).toMatch(/dalšího měsíce/);
    expect(chybaKroku(k, 'odberatel', { odberatele, dnes: DNES })).toBeNull();
  });

  it('pivo: bez řádku nejde na souhrn, s řádkem ano', () => {
    const zizkov = vyberOdberatele(prazdnyKoncept(), { id: 'p-zizkov', name: 'Žižkov' });
    expect(chybaKroku(zizkov, 'pivo', ctx)).toBe('Přidej aspoň jedno pivo.');
    expect(chybaKroku(zRadkem(zizkov), 'pivo', ctx)).toBeNull();
    expect(chybaKroku(zRadkem(zizkov), 'souhrn', ctx)).toBeNull();
  });

  it('souhrn zkontroluje i dřívější kroky', () => {
    const radek1 = zRadkem(vyberOdberatele(prazdnyKoncept(), { id: 'p-radek', name: 'Radek' }));
    expect(chybaKroku(radek1, 'souhrn', ctx)).toMatch(/kam se veze/);
  });
});

describe('zopakování poslední objednávky', () => {
  const objednavky = [
    { id: 'o1', place_id: 'p-zizkov', place_name: 'Žižkov', status: 'nova', order_date: '2026-11-04', created_at: '2026-11-04T08:00:00Z' },
    { id: 'o2', place_id: 'p-zizkov', place_name: 'Žižkov', status: 'nova', order_date: '2026-11-11', created_at: '2026-11-11T08:00:00Z' },
    { id: 'o3', place_id: 'p-zizkov', place_name: 'Žižkov', status: 'storno', order_date: '2026-11-16', created_at: '2026-11-16T08:00:00Z' },
    { id: 'o4', place_id: null, place_name: 'U Lípy', status: 'nova', order_date: '2026-11-09', created_at: '2026-11-09T08:00:00Z' },
    { id: 'o5', place_id: 'p-radek', place_name: 'Radek', status: 'nova', order_date: '2026-11-11', created_at: '2026-11-11T07:00:00Z' },
    { id: 'o6', place_id: 'p-radek', place_name: 'Radek', status: 'nova', order_date: '2026-11-11', created_at: '2026-11-11T09:00:00Z' },
  ];

  it('poslední je nejnovější nestornovaná podle data objednávky, při shodě podle vzniku', () => {
    expect(posledniObjednavka(objednavky, 'p-zizkov', 'Žižkov')?.id).toBe('o2');
    expect(posledniObjednavka(objednavky, 'p-radek', 'Radek')?.id).toBe('o6');
  });

  it('objednávka bez id odběratele se přiřadí podle jména bez diakritiky', () => {
    expect(posledniObjednavka(objednavky, '', 'u lipy')?.id).toBe('o4');
    expect(posledniObjednavka(objednavky, '', 'Neznámý')).toBeNull();
    expect(posledniObjednavka(objednavky, 'p-mates', 'Mates')).toBeNull();
  });

  it('položky se přenesou, sečtou a neexistující pivo nebo obal se spočítá jako vynechané', () => {
    const { radky, vynechano } = zopakujPolozky([
      { beer_id: 'b12', package_id: 'k50', quantity: 2 },
      { beer_id: 'b12', package_id: 'k50', quantity: 1 },
      { beer_id: 'b11', package_id: 'l1', quantity: 10 },
      { beer_id: 'zmizele', package_id: 'k30', quantity: 3 },
      { beer_id: 'b12', package_id: 'zmizely-obal', quantity: 3 },
      { beer_id: 'b12', package_id: 'k30', quantity: 0 },
      { beer_id: null, package_id: 'k30', quantity: 1 },
    ], piva, obaly);
    expect(radky.map((r) => [r.beerId, r.pkgId, r.qty])).toEqual([['b12', 'k50', 3], ['b11', 'l1', 10]]);
    expect(new Set(radky.map((r) => r.id)).size).toBe(2);
    expect(vynechano).toBe(4);
  });
});
